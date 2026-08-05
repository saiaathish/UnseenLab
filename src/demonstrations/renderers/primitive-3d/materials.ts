/**
 * materials.ts — material allowlist and lazy creation for the primitive-3d
 * namespace. The ONLY material classes allowed are:
 *   MeshBasicMaterial, MeshStandardMaterial, LineBasicMaterial,
 *   PointsMaterial, SpriteMaterial.
 * No external textures, no shaders, no env maps. Label sprites use an
 * in-code canvas texture (never loaded from the network).
 *
 * Thin wrapper around Three.js — the only code here that touches `three`
 * besides renderer.ts.
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
    material = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
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
    if (EMISSIVE_KINDS.has(kind)) {
      // Emissive glow for energy packets / process nodes, clamped.
      standard.emissive = new THREE.Color(color);
      standard.emissiveIntensity = clampIntensity(0.5, MAX_EMISSIVE_INTENSITY);
    }
    material = standard;
  } else {
    // camera_marker and any unlisted kind: flat, cheap, unambiguous.
    material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  }

  cache.set(key, material);
  return material;
}

/**
 * Build an in-code label sprite texture from plain text. The canvas texture
 * is generated deterministically per call and must be disposed by the caller
 * (or via disposeScene on the renderer). Never loads external images.
 */
export function makeLabelTexture(
  text: string,
  opts?: { dark?: boolean }
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const width = 320;
  const height = 72;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const dark = opts?.dark ?? true;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = dark ? "#f2f5ff" : "#10131c";
    ctx.fillText(String(text).slice(0, 40), width / 2, height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Dispose every cached material. Safe to call repeatedly. */
export function disposeMaterials(): void {
  for (const material of cache.values()) material.dispose();
  cache.clear();
}
