/**
 * coupling.ts — the SINGLE source of truth mapping hybrid-showcase scene
 * object ids to canonical engine state (body keys + scale/offset), so the 3D
 * stage reads exactly the state the readouts and 2D view come from.
 *
 * Every learner-visible control modifies canonical engine state; every mapped
 * 3D object reads that same state. Anything not mapped here stays
 * operator-driven and must be decorative-only (camera, glow pulses, label
 * highlights, illustrative companions) — it carries no scientific claim.
 *
 * Coordinate conventions (see lumina-2d/types.ts EngineVisualState):
 *  - orbits bodies: engine simulation units, origin at the star.
 *  - charges bodies + field cells: centered canvas px.
 *  - waves bodies + surface: normalized grid coords [-0.5, 0.5].
 *
 * The renderer applies: worldX = (offsetX ?? 0) + x*scale,
 * worldZ = (offsetY ?? 0) + y*scale, worldY = the object's base y.
 */
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";
import {
  ELECTRIC_FIELDS_SHOWCASE_ID,
  ORBITS_SHOWCASE_ID,
  WAVE_INTERFERENCE_SHOWCASE_ID,
} from "./index";

export type CoupledShowcaseId = "orbits" | "electric-fields" | "wave-interference";

// ---------------------------------------------------------------------------
// orbits
// ---------------------------------------------------------------------------
//
// Engine: star at (0,0), planet at engine distance `distance` (default 150)
// along +x; positions in engine units, origin at the star.
// Scene: star sphere at world origin; the "planet-system" group carries the
// planet mesh as a child at LOCAL (6,0,0), and the `orbits` relationship
// derived its operator orbit radius as 6 (distance from the group's base
// position (6,0,0) to the star).
//
// scale = 6 world units / 150 engine units = 0.04, so the engine's default
// orbit radius maps to exactly the scene's designed radius of 6.
// "planet-system" additionally offsets -6 in x because the planet MESH is a
// group child at local +6: the group pivot sits 6 units inside the
// engine-scaled position so the VISIBLE planet lands exactly on the engine
// orbit radius (world = engine position * scale).
const ORBITS_SCALE = 6 / 150;

// ---------------------------------------------------------------------------
// electric-fields
// ---------------------------------------------------------------------------
//
// Engine: charges at centered canvas px (±separation/2, 0); default
// separation 140 → ±70 px. Scene: charges at world ±3 on x.
// scale = 3 world units / 70 px = 3/70, so at the default separation the 3D
// charges sit exactly at their spec positions (±3) and track the engine for
// any separation or pointer drag.
// "field-vectors" uses the SAME scale so the grid cells and the charge bodies
// live in one consistent world↔px mapping (arrows near a charge sample the
// grid near that charge's cell).
const CHARGES_SCALE = 3 / 70;

// ---------------------------------------------------------------------------
// wave-interference
// ---------------------------------------------------------------------------
//
// Engine: sources on the 200x120 grid at column 0.28*GW, rows
// GH/2 ± separation/2 (default 40 → rows 40/80); normalized body coords
// (col/GW - 0.5, row/GH - 0.5). Surface: row-major u field.
// Scene: wave_surface size 10 (world span [-5,5]); sources as root spheres.
// scale = 10 = the surface size: normalized engine coords map 1:1 to the
// surface's world extent, so sources sit on the surface exactly where the
// engine drives them, and the surface samples the grid from its own local
// coordinates (see renderer.applyEngineSurface for the y-sign convention).
const WAVES_SCALE = 10;

/** The curated mappings, keyed by showcase id. */
export const SHOWCASE_ENGINE_MAPPINGS: Record<CoupledShowcaseId, EngineMapping> = {
  orbits: {
    star: { body: "star", scale: ORBITS_SCALE, offsetX: 0, offsetY: 0 },
    // The planet mesh is a group child at local (6,0,0); fold that offset in
    // so the visible planet sits on the engine orbit radius.
    "planet-system": { body: "planet", scale: ORBITS_SCALE, offsetX: -6, offsetY: 0 },
  },
  "electric-fields": {
    "charge-positive": { body: "charge1", scale: CHARGES_SCALE, offsetX: 0, offsetY: 0 },
    "charge-negative": { body: "charge2", scale: CHARGES_SCALE, offsetX: 0, offsetY: 0 },
    // "@field" sentinel: the renderer drives the arrows from state.field,
    // sampling the grid at each arrow's world position through this scale.
    "field-vectors": { body: "@field", scale: CHARGES_SCALE, offsetX: 0, offsetY: 0 },
    // midpoint-marker intentionally NOT mapped: it sits at world origin,
    // which is exactly the engine's midpoint (centered canvas origin); its
    // pulse operator is a decorative highlight.
  },
  "wave-interference": {
    "source-1": { body: "source1", scale: WAVES_SCALE, offsetX: 0, offsetY: 0 },
    "source-2": { body: "source2", scale: WAVES_SCALE, offsetX: 0, offsetY: 0 },
    // "@surface" sentinel: heights come from state.surface.
    "wave-surface": { body: "@surface", scale: WAVES_SCALE, offsetX: 0, offsetY: 0 },
    // constructive/destructive markers and camera-marker stay decorative.
  },
};

/**
 * The engine mapping for a curated showcase, or null when the id is unknown
 * (no coupling — the stage stays fully operator-driven).
 */
export function engineMappingFor(
  showcaseId: CoupledShowcaseId
): EngineMapping | null {
  return SHOWCASE_ENGINE_MAPPINGS[showcaseId] ?? null;
}

/**
 * Resolve a spec to a curated showcase id: exact spec.id match wins (the
 * curated builders), then a fallback by simulation.engineId for the three
 * coupled engines (orbits → orbits, charges → electric-fields,
 * waves → wave-interference). The fallback only helps generated specs whose
 * scene happens to use the same object ids — otherwise the mapping silently
 * no-ops in the renderer (lookup by object id), which is safe.
 */
export function showcaseIdForSpec(spec: DemoSpecV1): CoupledShowcaseId | null {
  if (spec.id === ORBITS_SHOWCASE_ID) return "orbits";
  if (spec.id === ELECTRIC_FIELDS_SHOWCASE_ID) return "electric-fields";
  if (spec.id === WAVE_INTERFERENCE_SHOWCASE_ID) return "wave-interference";
  const engineId = spec.simulation?.engineId ?? spec.trust.engineId;
  if (engineId === "orbits") return "orbits";
  if (engineId === "charges") return "electric-fields";
  if (engineId === "waves") return "wave-interference";
  return null;
}

/** Convenience: engineMappingFor(showcaseIdForSpec(spec)) in one call. */
export function engineMappingForSpec(spec: DemoSpecV1): EngineMapping | null {
  const id = showcaseIdForSpec(spec);
  return id ? engineMappingFor(id) : null;
}
