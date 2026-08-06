/**
 * control-materialization.test.ts — Phase 2B/C coupling suite: deterministic
 * control materialization in the generation pipeline + canonical-state
 * continuity of the materialized controls.
 *
 * Phase 2B closes the holdout's "control relevance 50% FAIL" (model
 * under-provisions controls) by removing control authorship from the model
 * entirely for verified engines: the model selects the engine and a bounded
 * learning focus (simulation.focusParameterKeys); deterministic code then
 * materializes full control definitions from the ED-owned
 * ENGINE_CONTROL_CATALOG (bounds, labels, defaults). The model can no longer
 * alter units, bounds, or defaults — catalog values always win.
 *
 * What is pinned here:
 *  1. catalog contract — every verified engine has >= 1 well-formed,
 *     in-engine-parameterKeys control entry (the materializer's dependency),
 *  2. focus keys — valid requested keys are materialized with catalog
 *     definitions; unknown keys are dropped, NEVER retargeted; all-unknown
 *     falls back to curated defaults,
 *  3. curated defaults — >= 1 control; exactly the two highest-priority
 *     catalog entries when the model omits focus keys,
 *  4. comparison intent — >= 2 parameter controls (the two highest-priority
 *     keys),
 *  5. one-variable mode — at most ONE parameter control (single-variable
 *     contract), transport controls still emitted,
 *  6. the model CANNOT author controls for verified engines — model-emitted
 *     controls are stripped and replaced from the catalog; model-emitted
 *     parameter units/bounds/values lose to the catalog,
 *  7. Level 2/3 model specs and curated showcase/offline specs are untouched,
 *  8. canonical-state continuity — every materialized control targets a key
 *     the engine reads, with min/max/step/defaultValue EXACTLY equal to the
 *     simulation parameter the engine consumes; the engine accepts every
 *     materialized default; the parameter-only replay path reproduces the
 *     same canonical state,
 *  9. pipeline integration — generateDemo strips model-emitted controls and
 *     materializes catalog controls; oneVariableMode and comparison intents
 *     are honored end-to-end; the offline path never materializes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultPreferences } from "@/domain/learner";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { buildEngineSpec } from "@/demonstrations/generation/offline/engine-builder";
import {
  generateDemo,
  resetGenerationCircuit,
  type GenerateDemoResult,
} from "@/demonstrations/generation/model/pipeline";
import { ENGINE_CONTROL_CATALOG } from "@/demonstrations/generation/controls/catalog";
import { materializeControls } from "@/demonstrations/generation/controls/materialize";
import {
  ENGINE_CATALOG,
  SPEC_LIMITS,
  VERIFIED_ENGINE_IDS,
  type ControlSpec,
  type DemoSpecV1,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import { createModule } from "@/demonstrations/renderers/lumina-2d/registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const prefs = createDefaultPreferences();
/**
 * The learner default is oneVariableMode: true (learner.ts), which triggers
 * the single-variable contract. Tests that assert >= 2 materialized controls
 * must use multi-variable preferences.
 */
const MULTI_PREFS = { ...createDefaultPreferences(), oneVariableMode: false };
const ORBITS_QUERY = "Show why planets stay in orbit.";
/** A Level 2 template query (energy transfer) used for untouched-controls tests. */
const LEVEL2_QUERY = "Show how photosynthesis works";

/**
 * A complete, validator-clean DemoSpecV1 the offline generator produces for
 * the given query, relabeled as model-authored (the gate requires
 * provenance.source === "model_generated_spec", and model specs can never
 * carry prediction truth). The curated showcase builders hardcode
 * oneVariableMode: true; a model spec mirrors the learner preference instead
 * (that is exactly what the prompt instructs the model to do), so the fixture
 * carries the passed preference's oneVariableMode.
 */
function makeModelSpec(query: string, p = prefs): DemoSpecV1 {
  const result = generateOfflineDemo(query, p);
  if (result.status !== "spec" || !result.spec) {
    throw new Error(`offline generator did not produce a spec for "${query}"`);
  }
  return {
    ...result.spec,
    provenance: { ...result.spec.provenance, source: "model_generated_spec" },
    prediction: { ...result.spec.prediction, correctIndex: undefined },
    adaptationContext: {
      ...result.spec.adaptationContext,
      oneVariableMode: p.oneVariableMode,
    },
  };
}

function makeModelSpecWithFocus(
  query: string,
  focusParameterKeys: string[],
  p = prefs,
): DemoSpecV1 {
  const spec = makeModelSpec(query, p);
  return {
    ...spec,
    simulation: {
      ...spec.simulation!,
      // The bounded focus field the model may emit (validated downstream by
      // the validation boundary; materializeControls reads it structurally).
      focusParameterKeys,
    },
  };
}

/** Controls whose target is an engine parameter. */
function paramControls(spec: DemoSpecV1): ControlSpec[] {
  return spec.controls.filter((c) => c.target.kind === "parameter");
}

/** Controls whose target is a scene ref (transport: play_pause/speed/reset). */
function sceneControls(spec: DemoSpecV1): ControlSpec[] {
  return spec.controls.filter((c) => c.target.kind === "scene");
}

/**
 * A verified-engine fixture for an ARBITRARY engine (used by the
 * canonical-state continuity tests): the curated engine spec relabeled as
 * model-authored, exactly the shape a validated model spec takes.
 */
function makeEngineSpec(id: VerifiedEngineId): DemoSpecV1 {
  const spec = buildEngineSpec(id, ORBITS_QUERY, prefs);
  return {
    ...spec,
    provenance: { ...spec.provenance, source: "model_generated_spec" },
    prediction: { ...spec.prediction, correctIndex: undefined },
  };
}

/** The two highest-priority catalog entries (array order = priority order). */
function topEntries(id: VerifiedEngineId, count = 2): CatalogEntry[] {
  return ENGINE_CONTROL_CATALOG[id].slice(0, count);
}

/** Catalog entry shape the materializer consumes (documented contract). */
interface CatalogEntry {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value?: number;
  defaultValue?: number;
  unit?: string;
}

function defaultOf(entry: CatalogEntry): number {
  return entry.defaultValue ?? entry.value ?? 0;
}

/** Mirrors materialize.ts's step semantics: absent/unsane step -> 1. */
function stepOfEntry(entry: CatalogEntry): number {
  return typeof entry.step === "number" &&
    Number.isFinite(entry.step) &&
    entry.step > 0
    ? entry.step
    : 1;
}

function entryByKey(id: VerifiedEngineId, key: string): CatalogEntry {
  const hit = ENGINE_CONTROL_CATALOG[id].find((e) => e.key === key);
  if (!hit) throw new Error(`catalog entry ${id}.${key} missing`);
  return hit;
}

function specOf(result: GenerateDemoResult): DemoSpecV1 {
  if (!("data" in result)) {
    throw new Error("expected a data envelope, got fallback");
  }
  const data = result.data;
  if (data.outcome !== "spec") {
    throw new Error(`expected outcome "spec", got "${data.outcome}"`);
  }
  return data.spec;
}

// ---------------------------------------------------------------------------
// 1. Catalog contract — the materializer's dependency is well-formed
// ---------------------------------------------------------------------------

describe("ENGINE_CONTROL_CATALOG contract (materializer dependency)", () => {
  it("covers every verified engine with >= 1 well-formed entry", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const entries = ENGINE_CONTROL_CATALOG[id];
      expect(entries, `${id}: catalog entries`).toBeDefined();
      expect(entries.length, `${id}: at least one control`).toBeGreaterThanOrEqual(1);
      expect(entries.length, `${id}: at most SPEC_LIMITS.maxControls`).toBeLessThanOrEqual(
        SPEC_LIMITS.maxControls
      );
      const seen = new Set<string>();
      for (const entry of entries) {
        const e = entry as CatalogEntry;
        expect(ENGINE_CATALOG[id].parameterKeys, `${id}.${e.key} in engine parameterKeys`).toContain(e.key);
        expect(seen.has(e.key), `${id}: duplicate key ${e.key}`).toBe(false);
        seen.add(e.key);
        expect(e.label.length, `${id}.${e.key} label`).toBeGreaterThan(0);
        expect(Number.isFinite(e.min), `${id}.${e.key} min`).toBe(true);
        expect(Number.isFinite(e.max), `${id}.${e.key} max`).toBe(true);
        expect(Number.isFinite(defaultOf(e)), `${id}.${e.key} default`).toBe(true);
        expect(e.min, `${id}.${e.key} min <= max`).toBeLessThanOrEqual(e.max);
        // step is optional in the catalog contract; when present it is sane.
        if (e.step !== undefined) {
          expect(Number.isFinite(e.step), `${id}.${e.key} step`).toBe(true);
          expect(e.step, `${id}.${e.key} step > 0`).toBeGreaterThan(0);
        }
        expect(defaultOf(e), `${id}.${e.key} default in [min, max]`).toBeGreaterThanOrEqual(e.min);
        expect(defaultOf(e), `${id}.${e.key} default in [min, max]`).toBeLessThanOrEqual(e.max);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2-6. materializeControls — focus keys, defaults, comparison, one-variable,
//      model-cannot-author
// ---------------------------------------------------------------------------

describe("materializeControls — focus keys and curated defaults", () => {
  it("materializes catalog definitions for valid requested focus keys (bounds/labels/defaults from the catalog)", () => {
    const focusKey = topEntries("orbits", 1)[0].key;
    const spec = makeModelSpecWithFocus(ORBITS_QUERY, [focusKey]);
    const out = materializeControls(spec);

    // Exactly one parameter control, targeting the requested key.
    const params = paramControls(out);
    expect(params).toHaveLength(1);
    expect(params[0].target.kind).toBe("parameter");
    expect(params[0].target.ref).toBe(focusKey);
    // The control KIND comes from the catalog (slider / toggle /
    // segmented_control — all rendered for parameter targets by the UI).
    expect(["slider", "toggle", "segmented_control"]).toContain(params[0].type);
    expect(params[0].id).toBe(`param_${focusKey}`);

    // Full definition comes from the catalog — the model cannot alter it.
    const entry = entryByKey("orbits", focusKey);
    expect(params[0].label).toBe(entry.label);
    expect(params[0].min).toBe(entry.min);
    expect(params[0].max).toBe(entry.max);
    expect(params[0].step).toBe(stepOfEntry(entry));
    expect(params[0].defaultValue).toBe(defaultOf(entry));

    // The simulation parameter the ENGINE reads is the same catalog value.
    const param = out.simulation!.parameters.find((p) => p.key === focusKey)!;
    expect(param.label).toBe(entry.label);
    expect(param.min).toBe(entry.min);
    expect(param.max).toBe(entry.max);
    expect(param.step).toBe(stepOfEntry(entry));
    expect(param.value).toBe(defaultOf(entry));
    expect(param.unit).toBe(entry.unit);
  });

  it("drops unknown focus keys — never retargets; all-unknown falls back to curated defaults", () => {
    const focusKey = topEntries("orbits", 1)[0].key;
    // One valid + one fabricated key: only the valid key is materialized.
    const mixed = materializeControls(
      makeModelSpecWithFocus(ORBITS_QUERY, ["fabricated_key", focusKey])
    );
    const mixedRefs = paramControls(mixed).map((c) => c.target.ref);
    expect(mixedRefs).toContain(focusKey);
    expect(mixedRefs).not.toContain("fabricated_key");

    // All-unknown: curated defaults are materialized, the unknown key is not.
    const allUnknown = materializeControls(
      makeModelSpecWithFocus(ORBITS_QUERY, ["fabricated_key"])
    );
    const defaultRefs = paramControls(allUnknown).map((c) => c.target.ref);
    expect(defaultRefs.length).toBeGreaterThanOrEqual(1);
    expect(defaultRefs).not.toContain("fabricated_key");
  });

  it("omits focus keys -> curated defaults: the two highest-priority catalog entries (>= 1 control)", () => {
    const out = materializeControls(makeModelSpec(ORBITS_QUERY, MULTI_PREFS));
    const refs = paramControls(out).map((c) => c.target.ref);
    const expected = topEntries("orbits", 2).map((e) => e.key);
    expect(refs).toEqual(expected);
    expect(refs.length).toBeGreaterThanOrEqual(1);
    // Transport controls are part of the deterministic set.
    const scene = sceneControls(out).map((c) => c.target.ref);
    expect(scene).toContain("play_pause");
    expect(scene).toContain("reset");
    // Budget: never above the hard cap.
    expect(out.controls.length).toBeLessThanOrEqual(SPEC_LIMITS.maxControls);
  });

  it("reducedMotion omits the speed_control transport control", () => {
    const out = materializeControls(makeModelSpec(ORBITS_QUERY), {
      reducedMotion: true,
    });
    expect(sceneControls(out).map((c) => c.target.ref)).not.toContain("speed");
  });
});

describe("materializeControls — comparison intent guarantees >= 2 controls", () => {
  it("comparison intent with no focus keys materializes the two highest-priority catalog entries", () => {
    const out = materializeControls(makeModelSpec(ORBITS_QUERY, MULTI_PREFS), {
      comparisonIntent: true,
    });
    const refs = paramControls(out).map((c) => c.target.ref);
    expect(refs).toEqual(topEntries("orbits", 2).map((e) => e.key));
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("comparison intent with a single valid focus key fills up to two from the catalog (never fewer than two)", () => {
    const focusKey = topEntries("orbits", 1)[0].key;
    const out = materializeControls(
      makeModelSpecWithFocus(ORBITS_QUERY, [focusKey], MULTI_PREFS),
      { comparisonIntent: true }
    );
    const refs = paramControls(out).map((c) => c.target.ref);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(focusKey);
    // The second is the highest-priority catalog key that is not the focus.
    const expectedSecond = ENGINE_CONTROL_CATALOG.orbits
      .map((e) => e.key)
      .find((k) => k !== focusKey)!;
    expect(refs[1]).toBe(expectedSecond);
  });
});

describe("materializeControls — one-variable mode keeps the single-variable contract", () => {
  it("oneVariableMode -> at most ONE parameter control (transport still emitted)", () => {
    const spec = makeModelSpec(ORBITS_QUERY);
    spec.adaptationContext.oneVariableMode = true;
    const out = materializeControls(spec);
    expect(paramControls(out)).toHaveLength(1);
    // The single control is the highest-priority catalog key.
    expect(paramControls(out)[0].target.ref).toBe(topEntries("orbits", 1)[0].key);
    expect(sceneControls(out).map((c) => c.target.ref)).toEqual(
      expect.arrayContaining(["play_pause", "reset"])
    );
  });

  it("oneVariableMode with focus keys -> the highest-priority valid requested key only", () => {
    const focusKeys = topEntries("orbits", 2).map((e) => e.key);
    const spec = makeModelSpecWithFocus(ORBITS_QUERY, focusKeys);
    spec.adaptationContext.oneVariableMode = true;
    const out = materializeControls(spec);
    const params = paramControls(out);
    expect(params).toHaveLength(1);
    expect(params[0].target.ref).toBe(focusKeys[0]);
  });
});

describe("materializeControls — the model cannot author controls or alter bounds for verified engines", () => {
  it("strips model-emitted controls (bogus bounds, animation targets, extra scene refs) and replaces them from the catalog", () => {
    const spec = makeModelSpec(ORBITS_QUERY, MULTI_PREFS);
    const [k1, k2] = topEntries("orbits", 2).map((e) => e.key);
    // Model-emitted garbage: bogus bounds on real keys, an animation-target
    // control, and a duplicate scene ref — none may survive.
    spec.controls = [
      {
        id: `param_${k1}`,
        type: "slider",
        label: `${k1} (model label)`,
        target: { kind: "parameter", ref: k1 },
        min: -50,
        max: 50,
        step: 1,
        defaultValue: 25,
      },
      {
        id: `param_${k2}`,
        type: "slider",
        label: `${k2} (model label)`,
        target: { kind: "parameter", ref: k2 },
        min: -1000,
        max: 1000,
        step: 50,
        defaultValue: -500,
      },
      {
        id: "anim_ctrl",
        type: "button",
        label: "Animate",
        target: { kind: "animation", ref: "anim1" },
      },
      { id: "reset", type: "reset", label: "Reset", target: { kind: "scene", ref: "reset" } },
    ];
    // Model-emitted bounds/values on the engine parameters: catalog wins.
    spec.simulation!.parameters = spec.simulation!.parameters.map((p) =>
      p.key === k1
        ? { key: k1, label: `${k1} (model label)`, min: -100, max: 100, step: 0.5, value: 99 }
        : p
    );

    const out = materializeControls(spec);

    // No animation-targeting control, no bogus bounds, no model labels.
    for (const c of out.controls) {
      expect(c.target.kind).not.toBe("animation");
      expect(c.label).not.toMatch(/model label/);
    }
    // The materialized set is exactly the two highest-priority catalog keys.
    expect(paramControls(out).map((c) => c.target.ref)).toEqual([k1, k2]);
    for (const control of paramControls(out)) {
      const entry = entryByKey("orbits", control.target.ref as string);
      expect(control.label).toBe(entry.label);
      expect(control.min).toBe(entry.min);
      expect(control.max).toBe(entry.max);
      expect(control.step).toBe(stepOfEntry(entry));
      expect(control.defaultValue).toBe(defaultOf(entry));
    }

    // The engine parameter is overwritten with the catalog definition.
    const k1Param = out.simulation!.parameters.find((p) => p.key === k1)!;
    const k1Entry = entryByKey("orbits", k1);
    expect(k1Param.label).toBe(k1Entry.label);
    expect(k1Param.min).toBe(k1Entry.min);
    expect(k1Param.max).toBe(k1Entry.max);
    expect(k1Param.step).toBe(stepOfEntry(k1Entry));
    expect(k1Param.value).toBe(defaultOf(k1Entry));

    // Declared control budget honestly covers the materialized set.
    expect(out.limits.maxControls).toBeGreaterThanOrEqual(out.controls.length);
    expect(out.controls.length).toBeLessThanOrEqual(SPEC_LIMITS.maxControls);
  });
});

// ---------------------------------------------------------------------------
// 7. Level 2/3 and curated specs are untouched
// ---------------------------------------------------------------------------

describe("materializeControls — only model-generated verified specs are materialized", () => {
  it("Level 2 model specs (no verified simulation) keep their controls untouched", () => {
    const spec = makeModelSpec(LEVEL2_QUERY);
    expect(spec.trust.level).toBe("conceptual_demonstration");
    const before = JSON.stringify(spec.controls);
    const out = materializeControls(spec);
    expect(JSON.stringify(out.controls)).toBe(before);
    expect(out.simulation).toBeUndefined();
  });

  it("curated showcase specs (provenance curated_engine) are untouched even when verified", () => {
    const spec = makeModelSpec(ORBITS_QUERY);
    spec.provenance = { ...spec.provenance, source: "curated_engine" };
    const before = JSON.stringify(spec.controls);
    const out = materializeControls(spec);
    expect(JSON.stringify(out.controls)).toBe(before);
    expect(JSON.stringify(out.simulation!.parameters)).toBe(
      JSON.stringify(spec.simulation!.parameters)
    );
  });

  it("template-composition specs (provenance template_composition) are untouched", () => {
    const spec = makeModelSpec(LEVEL2_QUERY);
    spec.provenance = { ...spec.provenance, source: "template_composition" };
    const before = JSON.stringify(spec.controls);
    const out = materializeControls(spec);
    expect(JSON.stringify(out.controls)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 8. Canonical-state continuity: controls, parameters and engine agree
// ---------------------------------------------------------------------------

describe("canonical-state continuity — materialized controls and the engine read the SAME state", () => {
  it("every materialized control targets an engine parameterKey with bounds EXACTLY equal to the parameter the engine reads", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const out = materializeControls(makeEngineSpec(id));
      for (const control of paramControls(out)) {
        const ref = control.target.ref as string;
        // The control targets a key the engine actually reads.
        expect(ENGINE_CATALOG[id].parameterKeys, `${id}: ${ref}`).toContain(ref);
        // And a catalog key (materialization never invents keys).
        expect(
          ENGINE_CONTROL_CATALOG[id].map((e) => e.key),
          `${id}: ${ref} in catalog`
        ).toContain(ref);
        // The parameter entry the engine consumes exists and matches 1:1.
        const param = out.simulation!.parameters.find((p) => p.key === ref);
        expect(param, `${id}: parameter entry for ${ref}`).toBeDefined();
        expect(control.min).toBe(param!.min);
        expect(control.max).toBe(param!.max);
        expect(control.step).toBe(param!.step);
        expect(control.defaultValue).toBe(param!.value);
        // And both match the catalog entry (the single source of truth).
        const entry = entryByKey(id, ref);
        expect(param!.min).toBe(entry.min);
        expect(param!.max).toBe(entry.max);
        expect(param!.step).toBe(stepOfEntry(entry));
        expect(param!.value).toBe(defaultOf(entry));
        expect(param!.unit).toBe(entry.unit);
      }
    }
  });

  it("the engine accepts every materialized default (setParameter never throws; state stays finite)", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const mod = createModule(id);
      if (!mod) {
        // nuclear_chain_reaction has no lumina-2d module registered yet (the
        // evaluation-director flags this in catalog.ts); its parameter-keys
        // continuity is still pinned by the previous test.
        continue;
      }
      const out = materializeControls(makeEngineSpec(id));
      mod.init({ width: 800, height: 600, dpr: 1, time: 0 });
      mod.reset(out.simulation!.seed);
      for (const control of paramControls(out)) {
        const ref = control.target.ref as string;
        expect(() => mod.setParameter(ref, Number(control.defaultValue ?? 0)), `${id}.${ref}`).not.toThrow();
        const state = (mod as { getVisualState?: () => unknown }).getVisualState?.();
        if (state) {
          expect(JSON.stringify(state).length).toBeGreaterThan(0);
        }
        // Readouts render a displayable value after the parameter is applied.
        for (const r of mod.getReadouts()) {
          expect(r.value.length, `${id}.${ref} readout value`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("parameter-only restore with the materialized defaults reproduces the same canonical state (the replay path)", () => {
    const coupled = ["orbits", "charges", "waves"] as const;
    for (const id of coupled) {
      const out = materializeControls(makeEngineSpec(id));
      const seed = out.simulation!.seed;
      const materialized: Array<[string, number]> = paramControls(out).map(
        (c) => [c.target.ref as string, Number(c.defaultValue ?? 0)]
      );

      // Path A — the UI replay path: reset() then setParameter per key.
      const a = createModule(id)!;
      a.init({ width: 800, height: 600, dpr: 1, time: 0 });
      a.reset(seed);
      for (const [key, value] of materialized) a.setParameter(key, value);

      // Path B — a from-scratch configuration with the same parameter values.
      const b = createModule(id)!;
      b.init({ width: 800, height: 600, dpr: 1, time: 0 });
      for (const [key, value] of materialized) b.setParameter(key, value);

      const va = (a as { getVisualState?: () => unknown }).getVisualState?.();
      const vb = (b as { getVisualState?: () => unknown }).getVisualState?.();
      if (va && vb) {
        expect(va, id).toEqual(vb);
      }
      expect(a.getReadouts(), id).toEqual(b.getReadouts());
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Pipeline integration — generateDemo materializes end-to-end
// ---------------------------------------------------------------------------

describe("generateDemo — pipeline control materialization", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_API_KEY = "test-key";
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_DISABLE_THINKING;
    resetGenerationCircuit();
  });

  afterEach(() => {
    delete process.env.LLM_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function chatCompletion(content: string): Response {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("strips model-emitted controls for a verified engine spec and replaces them from the catalog (catalog values win)", async () => {
    const modelEmitted = makeModelSpec(ORBITS_QUERY, MULTI_PREFS);
    // Model-emitted controls that are SCHEMA-VALID (bogus bounds and labels —
    // the sanitizer repairs nothing here, so rejection cannot mask the strip):
    // the pipeline must replace them with catalog definitions regardless.
    modelEmitted.controls = [
      {
        id: "param_speed",
        type: "slider",
        label: "Speed (model label)",
        target: { kind: "parameter", ref: "speed" },
        min: -50,
        max: 50,
        step: 1,
        defaultValue: 25,
      },
      {
        id: "param_bodyMass",
        type: "slider",
        label: "Body mass (model label)",
        target: { kind: "parameter", ref: "bodyMass" },
        min: 0,
        max: 1000,
        step: 10,
        defaultValue: 500,
      },
      {
        id: "play_pause",
        type: "play_pause",
        label: "Play / Pause",
        target: { kind: "scene", ref: "play_pause" },
      },
    ];
    // Model-emitted bounds/values on the engine parameters: catalog wins.
    modelEmitted.simulation!.parameters = modelEmitted.simulation!.parameters.map((p) =>
      p.key === "speed"
        ? { key: "speed", label: "Speed (model label)", min: -100, max: 100, step: 0.5, value: 99 }
        : p
    );
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(modelEmitted)));

    const result = await generateDemo(ORBITS_QUERY, MULTI_PREFS);
    const spec = specOf(result);

    expect(spec.provenance.source).toBe("model_generated_spec");
    // The model's labels and bounds are gone; the catalog defines the controls.
    for (const c of spec.controls) {
      expect(c.label).not.toMatch(/model label/);
    }
    const refs = paramControls(spec).map((c) => c.target.ref);
    expect(refs).toEqual(topEntries("orbits", 2).map((e) => e.key));
    for (const control of paramControls(spec)) {
      const entry = entryByKey("orbits", control.target.ref as string);
      expect(control.min).toBe(entry.min);
      expect(control.max).toBe(entry.max);
      expect(control.step).toBe(stepOfEntry(entry));
      expect(control.defaultValue).toBe(defaultOf(entry));
      const param = spec.simulation!.parameters.find((p) => p.key === control.target.ref)!;
      expect(param.min).toBe(entry.min);
      expect(param.max).toBe(entry.max);
      expect(param.value).toBe(defaultOf(entry));
      expect(param.label).toBe(entry.label);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors the model's bounded focusParameterKeys end-to-end (gate + validator + materializer)", async () => {
    // The full pipeline chain: the gate admits focusParameterKeys, the
    // validator bounds it (1-4 engine-owned keys), and the pipeline
    // materializes exactly the requested key from the catalog.
    const focusKey = topEntries("orbits", 1)[0].key;
    const modelEmitted = makeModelSpecWithFocus(ORBITS_QUERY, [focusKey], MULTI_PREFS);
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(modelEmitted)));

    const result = await generateDemo(ORBITS_QUERY, MULTI_PREFS);
    const spec = specOf(result);

    const refs = paramControls(spec).map((c) => c.target.ref);
    expect(refs).toEqual([focusKey]);
    const entry = entryByKey("orbits", focusKey);
    const ctrl = paramControls(spec)[0];
    expect(ctrl.min).toBe(entry.min);
    expect(ctrl.max).toBe(entry.max);
    expect(ctrl.defaultValue).toBe(defaultOf(entry));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors the oneVariableMode preference end-to-end (single-variable contract)", async () => {
    const p = { ...createDefaultPreferences(), oneVariableMode: true };
    const modelEmitted = makeModelSpec(ORBITS_QUERY, p);
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(modelEmitted)));

    const result = await generateDemo(ORBITS_QUERY, p);
    const spec = specOf(result);

    expect(spec.adaptationContext.oneVariableMode).toBe(true);
    expect(paramControls(spec).length).toBeLessThanOrEqual(1);
    expect(spec.controls.length).toBeLessThanOrEqual(SPEC_LIMITS.maxControls);
  });

  it("comparison intent -> at least two parameter controls from the catalog (projectile)", async () => {
    const query = "Compare projectile launch angles and speeds";
    const modelEmitted = makeModelSpec(query, MULTI_PREFS);
    expect(modelEmitted.trust.level).toBe("verified_simulation");
    const engineId = modelEmitted.simulation!.engineId;
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(modelEmitted)));

    const result = await generateDemo(query, MULTI_PREFS);
    const spec = specOf(result);

    const refs = paramControls(spec).map((c) => c.target.ref);
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const ref of refs) {
      expect(ENGINE_CATALOG[engineId].parameterKeys).toContain(ref);
    }
  });

  it("offline path (no API key) never materializes: curated controls untouched", async () => {
    delete process.env.LLM_API_KEY;
    const result = await generateDemo(ORBITS_QUERY);
    const spec = specOf(result);
    expect(spec.provenance.source).toBe("curated_engine");
    const offline = generateOfflineDemo(ORBITS_QUERY, prefs);
    if (offline.status !== "spec" || !offline.spec) throw new Error("offline spec missing");
    expect(JSON.stringify(spec.controls)).toBe(JSON.stringify(offline.spec.controls));
  });

  it("Level 2 model specs keep their model-authored controls untouched", async () => {
    const modelEmitted = makeModelSpec(LEVEL2_QUERY);
    expect(modelEmitted.trust.level).toBe("conceptual_demonstration");
    fetchMock.mockResolvedValue(chatCompletion(JSON.stringify(modelEmitted)));

    const result = await generateDemo(LEVEL2_QUERY);
    const spec = specOf(result);

    expect(spec.trust.level).toBe("conceptual_demonstration");
    expect(spec.simulation).toBeUndefined();
    expect(JSON.stringify(spec.controls)).toBe(JSON.stringify(modelEmitted.controls));
  });
});
