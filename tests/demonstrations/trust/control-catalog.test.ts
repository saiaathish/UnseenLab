/**
 * control-catalog.test.ts — PHASE 2B EngineControlCatalog
 * (evaluation-director, UNSEENLAB PHASE 1-2 CLOSURE).
 *
 * The catalog is the single source of truth the deterministic control
 * materializer (src/demonstrations/generation/controls/materialize.ts) reads:
 * the model selects ONLY simulation.focusParameterKeys (1-4 engine-owned
 * keys); this catalog supplies bounds, labels, steps, and curated defaults.
 * Sources per entry (cited in catalog.ts):
 *   - orbits / charges / waves: curated showcase PARAMETERS blocks
 *     (src/demonstrations/showcases/<engine>/build-spec.ts) — canonical per the
 *     evaluation-director mandate; these agree with the lumina-2d engine META
 *     bounds except charges fieldScale default (showcase 10 vs META 1),
 *   - projectile / gas / pendulum / rc_circuit / reaction_diffusion /
 *     cellular_automaton: lumina-2d engine META bounds + defaults
 *     (src/demonstrations/renderers/lumina-2d/engines/<id>.ts),
 *   - nuclear_chain_reaction: curated offline parameter block
 *     (src/demonstrations/generation/offline/engine-builder.ts) — the only
 *     curated source; no lumina-2d module is registered for it yet.
 */

import { describe, expect, it } from "vitest";
import {
  ENGINE_CONTROL_CATALOG,
  type EngineControlDefinition,
} from "@/demonstrations/generation/controls/catalog";
import { assertCatalogContract } from "@/demonstrations/generation/controls/materialize";
import {
  ENGINE_CATALOG,
  SPEC_LIMITS,
  VERIFIED_ENGINE_IDS,
  type VerifiedEngineId,
} from "@/demonstrations/spec/demo-spec";
import {
  CA_META,
} from "@/demonstrations/renderers/lumina-2d/engines/cellular-automaton";
import { CIRCUIT_META } from "@/demonstrations/renderers/lumina-2d/engines/circuit";
import { GAS_META } from "@/demonstrations/renderers/lumina-2d/engines/gas";
import { PENDULUM_META } from "@/demonstrations/renderers/lumina-2d/engines/pendulum";
import { PROJECTILE_META } from "@/demonstrations/renderers/lumina-2d/engines/projectile";
import { REACTION_META } from "@/demonstrations/renderers/lumina-2d/engines/reaction-diffusion";

const CONTROL_TYPES = ["slider", "toggle", "segmented_control"] as const;

function entriesOf(id: VerifiedEngineId): EngineControlDefinition[] {
  const entries = ENGINE_CONTROL_CATALOG[id];
  expect(entries, `${id}: catalog entries`).toBeDefined();
  return entries;
}

describe("ENGINE_CONTROL_CATALOG — coverage and shape", () => {
  it("is a full Record over VERIFIED_ENGINE_IDS (the materializer iterates every id)", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      expect(ENGINE_CONTROL_CATALOG[id], `${id}: defined`).toBeDefined();
    }
  });

  it("every verified engine has >= 1 catalog entry (>= 2 where it has >= 2 parameters)", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const entries = entriesOf(id);
      expect(entries.length, `${id}: >= 1 control`).toBeGreaterThanOrEqual(1);
      expect(entries.length, `${id}: >= 2 controls for a >= 2-parameter engine`).toBeGreaterThanOrEqual(2);
      expect(entries.length, `${id}: at most SPEC_LIMITS.maxControls`).toBeLessThanOrEqual(
        SPEC_LIMITS.maxControls,
      );
    }
  });

  it("covers the nine lumina-2d engines and nuclear_chain_reaction", () => {
    const ids = Object.keys(ENGINE_CONTROL_CATALOG).sort();
    expect(ids).toEqual([...VERIFIED_ENGINE_IDS].sort());
  });

  it("every entry key belongs to ENGINE_CATALOG[engine].parameterKeys", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const params = ENGINE_CATALOG[id].parameterKeys;
      for (const entry of entriesOf(id)) {
        expect(params, `${id}.${entry.key} in engine parameterKeys`).toContain(entry.key);
      }
    }
  });

  it("no duplicate keys per engine", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const keys = entriesOf(id).map((e) => e.key);
      expect(new Set(keys).size, `${id}: unique keys`).toBe(keys.length);
    }
  });

  it("bounds are finite, ordered, step > 0, and defaults lie within [min, max]", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      for (const entry of entriesOf(id)) {
        expect(Number.isFinite(entry.min), `${id}.${entry.key} min finite`).toBe(true);
        expect(Number.isFinite(entry.max), `${id}.${entry.key} max finite`).toBe(true);
        expect(entry.min!, `${id}.${entry.key} min <= max`).toBeLessThanOrEqual(entry.max!);
        if (entry.step !== undefined) {
          expect(Number.isFinite(entry.step), `${id}.${entry.key} step finite`).toBe(true);
          expect(entry.step!, `${id}.${entry.key} step > 0`).toBeGreaterThan(0);
        }
        expect(entry.defaultValue, `${id}.${entry.key} default >= min`).toBeGreaterThanOrEqual(entry.min!);
        expect(entry.defaultValue, `${id}.${entry.key} default <= max`).toBeLessThanOrEqual(entry.max!);
      }
    }
  });

  it("every entry is a well-formed definition (type, label, description, priorities)", () => {
    for (const id of VERIFIED_ENGINE_IDS) {
      const priorities = new Set<number>();
      for (const entry of entriesOf(id)) {
        expect(CONTROL_TYPES, `${id}.${entry.key} controlType`).toContain(entry.controlType);
        expect(entry.label.length, `${id}.${entry.key} label`).toBeGreaterThan(0);
        expect(entry.description.length, `${id}.${entry.key} description`).toBeGreaterThan(0);
        expect(entry.learningRelationships.length, `${id}.${entry.key} learningRelationships`).toBeGreaterThan(0);
        expect(Number.isInteger(entry.priority), `${id}.${entry.key} priority integer`).toBe(true);
        expect(entry.priority, `${id}.${entry.key} priority positive`).toBeGreaterThanOrEqual(1);
        expect(priorities.has(entry.priority), `${id}.${entry.key} priority unique`).toBe(false);
        priorities.add(entry.priority);
      }
    }
  });
});

describe("ENGINE_CONTROL_CATALOG — canonical source pinning", () => {
  it("orbits matches the curated showcase PARAMETERS block (showcases/orbits/build-spec.ts:42-48) and the engine META", () => {
    const by = (key: string) => entriesOf("orbits").find((e) => e.key === key)!;
    expect(by("speed")).toMatchObject({ label: "Launch speed", min: 0.05, max: 3, step: 0.05, defaultValue: 1 });
    expect(by("g")).toMatchObject({ label: "Gravity strength", min: 0.5, max: 200, step: 0.5, defaultValue: 10 });
    expect(by("bodyMass")).toMatchObject({ label: "Body mass", min: 0.1, max: 100, step: 0.1, defaultValue: 1 });
    expect(by("eccentricity")).toMatchObject({ label: "Orbit eccentricity", min: 0, max: 0.95, step: 0.05, defaultValue: 0 });
    expect(by("distance")).toMatchObject({ label: "Orbit distance", min: 20, max: 2000, step: 10, defaultValue: 150 });
  });

  it("waves matches the curated showcase PARAMETERS block (showcases/wave-interference/build-spec.ts:46-52)", () => {
    const by = (key: string) => entriesOf("waves").find((e) => e.key === key)!;
    expect(by("frequency")).toMatchObject({ label: "Frequency", min: 0.05, max: 4, step: 0.05, defaultValue: 0.5 });
    expect(by("wavelength")).toMatchObject({ label: "Wavelength", min: 3, max: 200, step: 1, defaultValue: 14 });
    expect(by("amplitude")).toMatchObject({ label: "Amplitude", min: 0.05, max: 2, step: 0.05, defaultValue: 0.6 });
    expect(by("separation")).toMatchObject({ label: "Source separation", min: 4, max: 200, step: 2, defaultValue: 40 });
    expect(by("phase")).toMatchObject({ label: "Phase difference", min: -1, max: 1, step: 0.05, defaultValue: 0 });
  });

  it("charges matches the curated showcase PARAMETERS block (showcases/electric-fields/build-spec.ts:44-49)", () => {
    const by = (key: string) => entriesOf("charges").find((e) => e.key === key)!;
    expect(by("q1")).toMatchObject({ label: "Charge 1", min: -10, max: 10, step: 0.5, defaultValue: 1 });
    expect(by("q2")).toMatchObject({ label: "Charge 2", min: -10, max: 10, step: 0.5, defaultValue: -1 });
    expect(by("separation")).toMatchObject({ label: "Separation", min: 10, max: 900, step: 10, defaultValue: 140 });
    // Showcase fieldScale default is 10 (engine META default is 1) — the
    // showcase PARAMETERS block is canonical per the ED mandate.
    expect(by("fieldScale")).toMatchObject({ label: "Field arrows", min: 0.05, max: 20, step: 0.1, defaultValue: 10 });
  });

  it("non-showcase engines keep the lumina-2d engine META bounds and defaults (engine-owned)", () => {
    const cases: Array<[VerifiedEngineId, Record<string, { min: number; max: number; defaultValue: number }>]> = [
      ["projectile", PROJECTILE_META.bounds as unknown as Record<string, { min: number; max: number; defaultValue: number }>],
      ["gas", GAS_META.bounds as unknown as Record<string, { min: number; max: number; defaultValue: number }>],
      ["pendulum", PENDULUM_META.bounds as unknown as Record<string, { min: number; max: number; defaultValue: number }>],
      ["rc_circuit", CIRCUIT_META.bounds as unknown as Record<string, { min: number; max: number; defaultValue: number }>],
      ["reaction_diffusion", REACTION_META.bounds as unknown as Record<string, { min: number; max: number; defaultValue: number }>],
      ["cellular_automaton", CA_META.bounds as unknown as Record<string, { min: number; max: number; defaultValue: number }>],
    ];
    const defaultsByEngine: Record<string, Record<string, number>> = {
      projectile: PROJECTILE_META.defaults,
      gas: GAS_META.defaults,
      pendulum: PENDULUM_META.defaults,
      rc_circuit: CIRCUIT_META.defaults,
      reaction_diffusion: REACTION_META.defaults,
      cellular_automaton: CA_META.defaults,
    };
    for (const [id, meta] of cases) {
      const defaults = defaultsByEngine[id];
      for (const entry of entriesOf(id)) {
        const b = meta[entry.key];
        expect(b, `${id}.${entry.key} in engine META bounds`).toBeDefined();
        expect(entry.min, `${id}.${entry.key} min == META`).toBe(b.min);
        expect(entry.max, `${id}.${entry.key} max == META`).toBe(b.max);
        expect(entry.defaultValue, `${id}.${entry.key} default == META`).toBe(defaults[entry.key]);
      }
    }
  });

  it("priority order matches the curated showcase control order (showcase defaults first)", () => {
    const order = (id: VerifiedEngineId) =>
      [...entriesOf(id)].sort((a, b) => a.priority - b.priority).map((e) => e.key);
    // Showcase CONTROLS order for parameter controls:
    //   orbits: speed, g; waves: frequency, wavelength, separation;
    //   charges: q2, q1, separation, fieldScale.
    expect(order("orbits").slice(0, 2)).toEqual(["speed", "g"]);
    expect(order("waves").slice(0, 3)).toEqual(["frequency", "wavelength", "separation"]);
    expect(order("charges").slice(0, 4)).toEqual(["q2", "q1", "separation", "fieldScale"]);
    // Non-showcase engines follow the engine's canonical parameterKeys order.
    expect(order("projectile")).toEqual(["angle", "speed", "drag", "gravity"]);
    expect(order("gas")).toEqual(["temperature", "particles", "gravity", "speedScale"]);
    expect(order("pendulum")).toEqual(["length", "gravity", "amplitude", "damping"]);
    expect(order("rc_circuit")).toEqual(["resistance", "capacitance", "voltage"]);
    expect(order("reaction_diffusion")).toEqual(["feed", "kill", "diffusionU", "diffusionV"]);
    expect(order("cellular_automaton")).toEqual(["speed", "density"]);
  });
});

describe("ENGINE_CONTROL_CATALOG — materializer contract integration", () => {
  it("assertCatalogContract() passes (the materializer's fail-loud runtime check)", () => {
    // Throws on any violation: missing engine, non-engine key, duplicate key,
    // missing label, invalid bounds, default outside [min, max].
    expect(() => assertCatalogContract()).not.toThrow();
  });
});
