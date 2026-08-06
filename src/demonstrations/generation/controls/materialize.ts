/**
 * controls/materialize.ts — deterministic control materialization for
 * model-generated verified specs (Phase 2B, canonical-state architect).
 *
 * The model is no longer asked to author controls for verified engines
 * (holdout v2: control relevance 50% FAIL — the model under-provisions
 * controls). For a model-generated verified spec, this module REPLACES
 * spec.controls with definitions materialized from the ED-owned
 * ENGINE_CONTROL_CATALOG (src/demonstrations/generation/controls/catalog.ts):
 *
 *   model selects  engine + learning focus (simulation.focusParameterKeys)
 *   +------------------------------------------------------------------+
 *   | materializeControls() — deterministic, pure, no I/O              |
 *   |   - validates requested keys against the engine's catalog        |
 *   |   - drops unknown keys (NEVER retargets)                         |
 *   |   - falls back to curated defaults (top-priority entries)        |
 *   |   - guarantees >= 1 control; >= 2 on comparison intent           |
 *   |   - one-variable mode: at most ONE parameter control             |
 *   |   - catalog bounds/labels/defaults WIN over model-emitted values |
 *   +------------------------------------------------------------------+
 *   v
 * deterministic controls + engine parameters the UI and engine both read
 *
 * Honest labeling: provenance stays "model_generated_spec" (the MODEL wrote
 * the spec); the materialized controls are deterministic code — this module
 * is the code reference. Nothing here claims the model authored the controls.
 *
 * The ENGINE_CONTROL_CATALOG contract consumed here (documented; the
 * evaluation-director owns catalog.ts):
 *   - Record<VerifiedEngineId, EngineControlDefinition[]>
 *   - array order = priority order (highest-priority entry FIRST; an optional
 *     numeric `priority` field is honored when present on every entry)
 *   - every entry: { key, label, min, max, step, value } (+ optional unit),
 *     key MUST be a member of ENGINE_CATALOG[engineId].parameterKeys
 *   - at least one entry per verified engine
 * A runtime contract check fails loudly (throws) on any violation so a
 * diverging catalog can never silently degrade materialization.
 */

import {
  ENGINE_CATALOG,
  SPEC_LIMITS,
  VERIFIED_ENGINE_IDS,
  type ControlSpec,
  type DemoSpecV1,
  type EngineParameterSpec,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import { ENGINE_CONTROL_CATALOG } from "./catalog";

// ---------------------------------------------------------------------------
// Catalog contract (structural — tolerant of the ED's exact field naming for
// the default value: `value` or `defaultValue`)
// ---------------------------------------------------------------------------

/** The engine-control definition shape materializeControls consumes. */
export interface EngineControlDefinition {
  key: string;
  label: string;
  /**
   * Learner-facing control kind the UI renders for a parameter target:
   * "slider" | "toggle" | "segmented_control" (defaults to "slider").
   */
  controlType?: "slider" | "toggle" | "segmented_control";
  min: number;
  max: number;
  /** Optional: the UI and the engine both default to 1 when absent. */
  step?: number;
  /** Curated default value. The catalog may name it `value` or `defaultValue`. */
  value?: number;
  defaultValue?: number;
  unit?: string;
  /** Optional explicit priority; lower = higher priority (1 = highest). */
  priority?: number;
  /** segmented_control entries: the options rendered as segments. */
  options?: string[];
}

type CatalogEntry = EngineControlDefinition & Record<string, unknown>;

const PARAMETER_CAPABLE_TYPES = [
  "slider",
  "toggle",
  "segmented_control",
] as const;

function defaultValueOf(entry: CatalogEntry): number {
  const v = entry.defaultValue ?? entry.value;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(
      `ENGINE_CONTROL_CATALOG: entry "${entry.key}" has no finite default value (value/defaultValue)`
    );
  }
  return v;
}

function stepOf(entry: CatalogEntry): number {
  return typeof entry.step === "number" && Number.isFinite(entry.step) && entry.step > 0
    ? entry.step
    : 1;
}

let contractChecked = false;

/**
 * Fail-loud contract check for the ED-owned catalog. Runs once on the first
 * materialization; exported so tests can invoke it directly. Mirrors the
 * contract pinned by tests/demonstrations/trust/control-catalog.test.ts.
 */
export function assertCatalogContract(): void {
  if (contractChecked) return;
  for (const id of VERIFIED_ENGINE_IDS) {
    const entries = ENGINE_CONTROL_CATALOG[id] as CatalogEntry[] | undefined;
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(
        `ENGINE_CONTROL_CATALOG contract: no control entries for engine "${id}"`
      );
    }
    if (entries.length > SPEC_LIMITS.maxControls) {
      throw new Error(
        `ENGINE_CONTROL_CATALOG contract: engine "${id}" declares ${entries.length} entries, over SPEC_LIMITS.maxControls (${SPEC_LIMITS.maxControls})`
      );
    }
    const seen = new Set<string>();
    const priorities = new Set<number>();
    for (const entry of entries) {
      if (typeof entry.key !== "string" || entry.key.length === 0) {
        throw new Error(`ENGINE_CONTROL_CATALOG contract: ${id} has an entry without a key`);
      }
      if (!ENGINE_CATALOG[id].parameterKeys.includes(entry.key)) {
        throw new Error(
          `ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} is not a member of the engine's parameterKeys`
        );
      }
      if (seen.has(entry.key)) {
        throw new Error(`ENGINE_CONTROL_CATALOG contract: duplicate key ${id}.${entry.key}`);
      }
      seen.add(entry.key);
      if (typeof entry.label !== "string" || entry.label.length === 0) {
        throw new Error(`ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} has no label`);
      }
      if (
        entry.controlType !== undefined &&
        !(PARAMETER_CAPABLE_TYPES as readonly string[]).includes(entry.controlType)
      ) {
        throw new Error(
          `ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} controlType "${entry.controlType}" is not parameter-capable`
        );
      }
      const { min, max } = entry;
      if (
        !Number.isFinite(min) || !Number.isFinite(max) || min > max
      ) {
        throw new Error(
          `ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} has invalid bounds (min ${min}, max ${max})`
        );
      }
      if (
        entry.step !== undefined &&
        (!Number.isFinite(entry.step) || entry.step <= 0)
      ) {
        throw new Error(
          `ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} has an invalid step (${entry.step})`
        );
      }
      const def = defaultValueOf(entry);
      if (def < min || def > max) {
        throw new Error(
          `ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} default ${def} outside [${min}, ${max}]`
        );
      }
      if (typeof entry.priority === "number") {
        if (!Number.isInteger(entry.priority) || entry.priority < 1) {
          throw new Error(
            `ENGINE_CONTROL_CATALOG contract: ${id}.${entry.key} priority must be a positive integer`
          );
        }
        if (priorities.has(entry.priority)) {
          throw new Error(
            `ENGINE_CONTROL_CATALOG contract: duplicate priority ${entry.priority} in engine "${id}"`
          );
        }
        priorities.add(entry.priority);
      }
    }
  }
  contractChecked = true;
}

/** Catalog entries in priority order (explicit `priority` when uniform, else
 * the documented array order — highest priority first). */
function entriesInPriorityOrder(id: VerifiedEngineId): CatalogEntry[] {
  const entries = [...(ENGINE_CONTROL_CATALOG[id] as CatalogEntry[])];
  const allHavePriority = entries.every(
    (e) => typeof e.priority === "number" && Number.isFinite(e.priority)
  );
  if (allHavePriority) {
    entries.sort((a, b) => (a.priority as number) - (b.priority as number));
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

/** Deterministic signals the pipeline passes in (from the intent layer and
 * learner preferences — never model-authored text). */
export interface MaterializeOptions {
  /** learner_goal === "compare scenarios" -> guarantee >= 2 controls. */
  comparisonIntent?: boolean;
  /** reducedMotion preference -> omit the speed_control transport control. */
  reducedMotion?: boolean;
  /** animationSpeed preference -> default of the speed_control transport. */
  animationSpeed?: number;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Parameter entry as the ENGINE reads it — catalog definition. */
function parameterFromEntry(entry: CatalogEntry): EngineParameterSpec {
  return {
    key: entry.key,
    label: entry.label,
    min: entry.min,
    max: entry.max,
    step: stepOf(entry),
    value: defaultValueOf(entry),
    ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
  };
}

/**
 * Replace the controls (and engine parameters) of a model-generated verified
 * spec with deterministic definitions materialized from ENGINE_CONTROL_CATALOG.
 *
 * Returns a NEW spec object; the input is never mutated. Specs that are not
 * model-generated verified simulations (Level 2/3 model specs, curated
 * showcases, offline fallbacks) are returned unchanged — requirement 8/9.
 */
export function materializeControls(
  spec: DemoSpecV1,
  options: MaterializeOptions = {},
): DemoSpecV1 {
  // Requirement 9: ONLY model-generated specs. Curated showcase/offline specs
  // (sources "curated_engine"/"template_composition") are untouched.
  if (spec.provenance.source !== "model_generated_spec") {
    return spec;
  }
  // Requirement 8: Level 2/3 model specs keep their curated template controls
  // — engine controls are NEVER materialized outside a verified simulation.
  if (spec.trust.level !== "verified_simulation" || !spec.simulation) {
    return spec;
  }

  assertCatalogContract();
  const engineId = spec.simulation.engineId;
  const entries = entriesInPriorityOrder(engineId);

  // Requirement 2/5: validate requested keys against the engine's catalog;
  // unknown keys are dropped, never retargeted to something else. (The full
  // validator additionally rejects non-engine-owned focus keys with
  // `invalid_engine_key` before this code ever runs.)
  const simulation = spec.simulation; // VerifiedSimulationSpec (guard above)
  const requested = dedupe(simulation.focusParameterKeys ?? []);
  const validRequested = requested.filter((key) =>
    entries.some((e) => e.key === key)
  );

  // Transport controls are part of the deterministic set (the stage renders
  // ONLY spec.controls — without them the learner cannot run the sim).
  const transportCount = options.reducedMotion ? 2 : 3; // play_pause+reset, +speed_control
  const sliderBudget = Math.max(0, SPEC_LIMITS.maxControls - transportCount);

  let keys: string[];
  if (spec.adaptationContext.oneVariableMode) {
    // Requirement 4: the single-variable contract — at most ONE parameter
    // control (the highest-priority valid focus, else the top catalog entry).
    keys = [validRequested[0] ?? entries[0].key];
  } else if (options.comparisonIntent) {
    // Requirement 3: comparison -> the two highest-priority (valid) keys.
    if (validRequested.length >= 2) {
      keys = validRequested.slice(0, 2);
    } else if (validRequested.length === 1) {
      const second = entries.find((e) => e.key !== validRequested[0]);
      keys = second ? [validRequested[0], second.key] : [validRequested[0]];
    } else {
      keys = entries.slice(0, 2).map((e) => e.key);
    }
  } else if (validRequested.length > 0) {
    // Requirement 1: the model's learning focus is honored, in the requested
    // (deterministic) order, bounded by the control budget.
    keys = validRequested;
  } else {
    // Requirement 6: curated defaults — the two highest-priority entries.
    keys = entries.slice(0, 2).map((e) => e.key);
  }
  keys = keys.slice(0, sliderBudget);

  // Requirement 3 (>= 1): the catalog contract guarantees at least one entry,
  // so the selection above is never empty. Defensive assertion anyway.
  if (keys.length === 0) {
    throw new Error(
      `control materialization produced no controls for engine "${engineId}"`
    );
  }

  // Build the deterministic control set: catalog parameter controls +
  // transport. The control KIND comes from the catalog (slider / toggle /
  // segmented_control — the UI renders all three for parameter targets).
  const controls: ControlSpec[] = [];
  for (const key of keys) {
    const entry = entries.find((e) => e.key === key)!;
    controls.push({
      id: `param_${key}`,
      type: entry.controlType ?? "slider",
      label: entry.label,
      target: { kind: "parameter", ref: key },
      min: entry.min,
      max: entry.max,
      step: stepOf(entry),
      defaultValue: defaultValueOf(entry),
      ...(entry.options !== undefined ? { options: entry.options } : {}),
    });
  }
  controls.push({
    id: "play_pause",
    type: "play_pause",
    label: "Play / Pause",
    target: { kind: "scene", ref: "play_pause" },
  });
  if (!options.reducedMotion) {
    controls.push({
      id: "speed_control",
      type: "speed_control",
      label: "Speed",
      target: { kind: "scene", ref: "speed" },
      min: 0.25,
      max: 2,
      step: 0.05,
      defaultValue: options.animationSpeed ?? 1,
    });
  }
  controls.push({
    id: "reset",
    type: "reset",
    label: "Reset",
    target: { kind: "scene", ref: "reset" },
  });

  // Requirement 10 / "catalog values win": the parameters the ENGINE reads are
  // overwritten with catalog definitions for every catalog key (bounds,
  // labels, units, defaults), and catalog entries are appended for materialized
  // keys the model omitted — so control bounds == engine parameter bounds by
  // construction. Parameter keys outside the catalog keep the model's
  // (sanitized) values — the catalog curates what it defines, nothing more.
  const parameters = [...spec.simulation.parameters];
  for (const entry of entries) {
    const param = parameterFromEntry(entry);
    const idx = parameters.findIndex((p) => p.key === entry.key);
    if (idx >= 0) {
      parameters[idx] = param;
    } else {
      parameters.push(param);
    }
  }

  // The declared control budget is a promise about actual usage: raise it to
  // the materialized count (bounded by SPEC_LIMITS.maxControls via the budget
  // above), exactly as the sanitizer raises other declared limits.
  const maxControls = Math.max(spec.limits.maxControls, controls.length);

  return {
    ...spec,
    simulation: { ...spec.simulation, parameters },
    controls,
    limits: { ...spec.limits, maxControls },
  };
}
