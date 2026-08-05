/**
 * Demo session store — the client-side bridge between the ask flow, the
 * demonstration shell, and persistence.
 *
 * A demo session is: the validated DemoSpecV1 + where it came from + the
 * learner's trial log (predictions, parameter snapshots, readout snapshots).
 * Guests persist to localStorage ("Saved on this device"); signed-in learners
 * additionally PUT to /api/demonstrations ("Saved to your account"). The
 * store never holds raw model output or prompts.
 */

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

export type DemoSource = "model" | "offline";

export interface ReadoutSnapshot {
  label: string;
  value: string;
}

export interface TrialRecord {
  trial: number;
  /** Index into spec.prediction.options; null when no prediction was made. */
  predictionIndex: number | null;
  /** Parameter snapshot (engine parameter key → value) at trial start. */
  parameters: Record<string, number>;
  /** Readout snapshot captured at the end of the trial (Level 1 only). */
  readouts: ReadoutSnapshot[];
  /** Control state at the end of the trial (animation/scene refs). */
  controls: Record<string, string | number | boolean>;
  /** Which adaptation suggestions the learner accepted/rejected this trial. */
  adaptations: Array<{ suggestion: string; accepted: boolean }>;
  recordedAt: string;
}

export interface DemoSession {
  spec: DemoSpecV1;
  source: DemoSource;
  generatedAt: string;
  savedToDevice: boolean;
  savedToCloud: boolean;
  trials: TrialRecord[];
}

const STORAGE_PREFIX = "unseenlab.demo.";

type Listener = () => void;

class DemoStore {
  private session: DemoSession | null = null;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  getSession(): DemoSession | null {
    return this.session;
  }

  startDemo(spec: DemoSpecV1, source: DemoSource, generatedAt: string) {
    this.session = {
      spec,
      source,
      generatedAt,
      savedToDevice: false,
      savedToCloud: false,
      trials: [],
    };
    this.emit();
  }

  clear() {
    this.session = null;
    this.emit();
  }

  recordTrial(record: Omit<TrialRecord, "trial" | "recordedAt">) {
    if (!this.session) return;
    this.session.trials.push({
      ...record,
      trial: this.session.trials.length + 1,
      recordedAt: new Date().toISOString(),
    });
    this.emit();
  }

  getTrials(): TrialRecord[] {
    return this.session?.trials ?? [];
  }

  markSavedToDevice() {
    if (!this.session) return;
    this.session.savedToDevice = true;
    this.emit();
  }

  markSavedToCloud() {
    if (!this.session) return;
    this.session.savedToCloud = true;
    this.emit();
  }

  // -- guest (device) persistence ------------------------------------------

  saveToDevice(): boolean {
    if (!this.session) return false;
    try {
      // Flag BEFORE serializing: the persisted blob must carry the saved
      // state, or a reload would restore trials but honestly report "Not
      // saved" (Gate 4 found this in a real browser).
      this.markSavedToDevice();
      localStorage.setItem(
        `${STORAGE_PREFIX}${this.session.spec.id}`,
        JSON.stringify(this.session)
      );
      return true;
    } catch {
      return false;
    }
  }

  loadFromDevice(demoId: string): DemoSession | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${demoId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DemoSession;
      if (!parsed?.spec?.schemaVersion) return null;
      this.session = parsed;
      this.emit();
      return parsed;
    } catch {
      return null;
    }
  }

  listSavedOnDevice(): DemoSession[] {
    if (typeof localStorage === "undefined") return [];
    const out: DemoSession[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        try {
          const parsed = JSON.parse(
            localStorage.getItem(key) ?? "null"
          ) as DemoSession | null;
          if (parsed?.spec?.schemaVersion) out.push(parsed);
        } catch {
          // skip corrupted entries
        }
      }
    }
    return out.sort((a, b) =>
      b.generatedAt.localeCompare(a.generatedAt)
    );
  }

  // -- cloud persistence -----------------------------------------------------

  async saveToCloud(): Promise<{ ok: boolean; error?: string }> {
    const session = this.session;
    if (!session) return { ok: false, error: "no_session" };
    const res = await fetch("/api/demonstrations", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        demonstration: session.spec,
        mutation_id: `demo-${session.spec.generationId}`,
      }),
    });
    if (res.ok) {
      this.markSavedToCloud();
      return { ok: true };
    }
    if (res.status === 401) return { ok: false, error: "unauthorized" };
    return { ok: false, error: "save_failed" };
  }

  /**
   * Restore a demonstration the signed-in learner saved to their account
   * (second browser / fresh device resume). The stored row is owner-scoped
   * server-side; a 401 or 404 restores nothing. The cloud row stores the
   * validated spec and its source — the trial log stays device-local, so the
   * restored session starts with an honest empty trial log and
   * savedToCloud: true.
   */
  async loadFromCloud(demoId: string): Promise<DemoSession | null> {
    try {
      const res = await fetch(`/api/demonstrations/${encodeURIComponent(demoId)}`, {
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        data?: { demonstration?: { spec?: unknown; source?: string } | null };
      };
      const row = body?.data?.demonstration;
      const spec = row?.spec as DemoSpecV1 | undefined;
      if (!row || !spec?.schemaVersion) return null;
      this.session = {
        spec,
        // The cloud row records the provenance source; map it to the UI's
        // DemoSource (a model_generated_spec or curated spec is "model";
        // anything else is the offline catalog).
        source: row.source === "model_generated_spec" ? "model" : "offline",
        generatedAt: spec.provenance.generatedAt,
        savedToDevice: false,
        savedToCloud: true,
        trials: [],
      };
      this.emit();
      return this.session;
    } catch {
      return null;
    }
  }
}

/** Singleton; module scope is the store (client components only). */
export const demoStore = new DemoStore();

/**
 * Truth of a curated prediction. Only curated engine code may grade a
 * prediction: model-generated specs are never graded (undefined), even if a
 * malicious spec smuggled a correctIndex past validation.
 */
export function predictionTruth(spec: DemoSpecV1): {
  graded: boolean;
  correctIndex?: number;
} {
  if (
    spec.trust.level === "verified_simulation" &&
    spec.provenance.source !== "model_generated_spec" &&
    spec.prediction.correctIndex !== undefined
  ) {
    return { graded: true, correctIndex: spec.prediction.correctIndex };
  }
  return { graded: false };
}
