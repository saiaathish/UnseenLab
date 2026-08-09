/**
 * materials.ts — material allowlist and lazy creation for the primitive-3d
 * namespace. The ONLY material classes allowed are:
 *   MeshBasicMaterial, MeshStandardMaterial, LineBasicMaterial,
 *   PointsMaterial, SpriteMaterial.
 * No external textures, no shaders, no env maps. Label sprites use an
 * in-code canvas texture (never loaded from the network); the texture
 * builder lives in ./labels.ts (makeLabelTexture).
 *
 * Additive per-material style gates (Wave 2, orbits visual hierarchy):
 *   - EMISSIVE_PAIRS — exact `${kind}:${color}` pairs that glow like the
 *     EMISSIVE_KINDS set. Gated to exact pairs so a color never leaks
 *     emissive to other kinds; the star sphere ("sphere:#ffd166") is the
 *     only curated pair.
 *   - MUTED_LINE_COLORS — line colors rendered semi-transparent, so
 *     reference guides read subordinate to live trajectories (the orbits
 *     "Default orbit guide" ring, #64748b, vs the planet's cyan trail).
 *     LineDashedMaterial is NOT in the allowlist, so "dashed" is expressed
 *     as color + opacity instead.
 *
 * Thin wrapper around Three.js.
 */

import * as THREE from "three";
import type { PrimitiveKind } from "@/demonstrations/spec/demo-spec";

export const ALLOWED_MATERIAL_CLASSES = [
  "MeshBasicMaterial",
  "MeshStandardMaterial",
  "LineBasicMaterial",
  "PointsMaterial",
  "SpriteMaterial",
] as const;

/** Emissive intensity is never allowed above this bound. */
export const MAX_EMISSIVE_INTENSITY = 0.6;

const LINE_KINDS = new Set<PrimitiveKind>([
  "line",
  "trail",
  "orbit_path",
  "graph_surface",
  "process_edge",
]);

const POINTS_KINDS = new Set<PrimitiveKind>(["particle_field", "vector_field"]);

const STANDARD_KINDS = new Set<PrimitiveKind>([
  "sphere",
  "box",
  "plane",
  "ring",
  "arrow",
  "wave_surface",
  "process_node",
  "energy_packet",
]);

const EMISSIVE_KINDS = new Set<PrimitiveKind>([
  "process_node",
  "energy_packet",
]);

/**
 * Additive emissive opt-in, keyed by the exact `${kind}:${color}` cache key.
 * Gated to curated pairs so one color never turns every sphere emissive —
 * the allowlist stays kind-based, this is a per-pair additive extension.
 * (Orbits star: the scene's star sphere at color "#ffd166".)
 */
const EMISSIVE_PAIRS = new Set<string>(["sphere:#ffd166"]);

/** Emissive intensity for pair-gated emissives (same clamp as the kinds). */
const EMISSIVE_PAIR_INTENSITY = 0.5;

/**
 * Line colors rendered de-emphasized (transparent at MUTED_LINE_OPACITY).
 * Reference/guide lines (the orbits "Default orbit guide" ring, #64748b)
 * must read subordinate to live trajectories — the ring renders through
 * materialFor("line", ...) because visuals.ts builds orbit_path lines with
 * the "line" kind. Dash is not expressible (LineDashedMaterial is outside
 * the 5-class allowlist), so the distinction is color + opacity.
 */
const MUTED_LINE_COLORS = new Set<string>(["#64748b"]);

/** Opacity for muted guide lines. */
const MUTED_LINE_OPACITY = 0.55;

const cache = new Map<string, THREE.Material>();

function clampIntensity(value: number, max: number): number {
  if (!Number.isFinite(value)) return max;
  return Math.min(max, Math.max(0, value));
}

/**
 * Returns the shared (cached) material for a (kind, color) pair. Created
 * lazily on first use. Callers must NOT mutate these shared materials; the
 * renderer clones them when a node needs per-node opacity/color animation.
 */
export function materialFor(kind: PrimitiveKind, color: string): THREE.Material {
  const key = `${kind}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let material: THREE.Material;
  if (LINE_KINDS.has(kind)) {
    const line = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
    if (MUTED_LINE_COLORS.has(color)) {
      // Reference guide: dim + semi-transparent, subordinate to live trails.
      line.transparent = true;
      line.opacity = MUTED_LINE_OPACITY;
    }
    material = line;
  } else if (POINTS_KINDS.has(kind)) {
    material = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size: 0.12,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
  } else if (STANDARD_KINDS.has(kind)) {
    const standard = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.55,
      metalness: 0.05,
    });
    if (EMISSIVE_KINDS.has(kind) || EMISSIVE_PAIRS.has(`${kind}:${color}`)) {
      // Emissive glow for energy packets / process nodes / curated pairs
      // (orbits star), clamped.
      standard.emissive = new THREE.Color(color);
      standard.emissiveIntensity = clampIntensity(
        EMISSIVE_KINDS.has(kind) ? 0.5 : EMISSIVE_PAIR_INTENSITY,
        MAX_EMISSIVE_INTENSITY
      );
    }
    material = standard;
  } else {
    // camera_marker and any unlisted kind: flat, cheap, unambiguous.
    material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  }

  cache.set(key, material);
  return material;
}

/** Dispose every cached material. Safe to call repeatedly. */
export function disposeMaterials(): void {
  for (const material of cache.values()) material.dispose();
  cache.clear();
}
