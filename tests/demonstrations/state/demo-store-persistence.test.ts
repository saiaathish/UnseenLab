/**
 * demo-store persistence — the Gate 4 contract.
 *
 *  - saveToDevice serializes the session WITH savedToDevice: true, so a
 *    reload restores an honest "Saved on this device" banner (regression:
 *    the flag used to be set AFTER serialization, so the persisted blob
 *    always said false and the banner lied after reload).
 *  - loadFromCloud restores an owner-scoped account copy on a second
 *    browser/fresh device: validated spec, honest DemoSource mapping, empty
 *    (device-local) trial log, savedToCloud: true. 401/404/absent rows
 *    restore nothing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { demoStore } from "@/demonstrations/state/demo-store";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { createDefaultPreferences } from "@/domain/learner";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

const prefs = createDefaultPreferences();

function orbitSpec(): DemoSpecV1 {
  const r = generateOfflineDemo("Show why planets stay in orbit.", prefs);
  if (r.status !== "spec" || !r.spec) throw new Error("no spec");
  return JSON.parse(JSON.stringify(r.spec)) as DemoSpecV1;
}

function resetStore() {
  demoStore.clear();
  localStorage.clear();
}

afterEach(() => {
  resetStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("demo-store — guest device persistence (Gate 4)", () => {
  it("persists savedToDevice: true in the blob (reload shows an honest banner)", () => {
    const spec = orbitSpec();
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    demoStore.recordTrial({
      predictionIndex: 2,
      parameters: { speed: 1 },
      readouts: [{ label: "Period", value: "115.4" }],
      controls: { playing: true },
      adaptations: [],
    });

    expect(demoStore.saveToDevice()).toBe(true);

    const raw = localStorage.getItem(`unseenlab.demo.${spec.id}`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { savedToDevice: boolean; trials: unknown[] };
    // Regression: the flag used to be set AFTER serialization.
    expect(parsed.savedToDevice).toBe(true);
    expect(parsed.trials).toHaveLength(1);
  });

  it("restores the full session from the device, trials included", () => {
    const spec = orbitSpec();
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    demoStore.recordTrial({
      predictionIndex: 1,
      parameters: { speed: 1 },
      readouts: [],
      controls: {},
      adaptations: [],
    });
    demoStore.saveToDevice();
    demoStore.clear();

    const restored = demoStore.loadFromDevice(spec.id);
    expect(restored).not.toBeNull();
    expect(restored!.spec.id).toBe(spec.id);
    expect(restored!.trials).toHaveLength(1);
    expect(restored!.savedToDevice).toBe(true);
  });
});

describe("demo-store — account (cloud) restore (Gate 4, second browser)", () => {
  it("restores an owner-scoped account copy with honest source + savedToCloud", async () => {
    const spec = orbitSpec();
    const row = {
      demonstration: {
        spec,
        source: "model_generated_spec",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: row }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    demoStore.clear();

    const restored = await demoStore.loadFromCloud(spec.id);
    expect(restored).not.toBeNull();
    expect(restored!.spec.id).toBe(spec.id);
    expect(restored!.source).toBe("model");
    expect(restored!.savedToCloud).toBe(true);
    expect(restored!.savedToDevice).toBe(false);
    // Trial log is device-local; a restored account copy starts honest.
    expect(restored!.trials).toHaveLength(0);
  });

  it("maps a curated/offline provenance source to the offline badge", async () => {
    const spec = orbitSpec();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { demonstration: { spec, source: "template_composition" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    const restored = await demoStore.loadFromCloud(spec.id);
    expect(restored!.source).toBe("offline");
  });

  it("restores nothing on 401 (guest), 404, or a missing row", async () => {
    for (const body of [
      { status: 401, json: { error: "unauthorized" } },
      { status: 404, json: { error: "not_found" } },
      { status: 200, json: { data: { demonstration: null } } },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(body.json), {
            status: body.status,
            headers: { "content-type": "application/json" },
          })
        )
      );
      const restored = await demoStore.loadFromCloud("demo-whatever");
      expect(restored).toBeNull();
    }
  });
});
