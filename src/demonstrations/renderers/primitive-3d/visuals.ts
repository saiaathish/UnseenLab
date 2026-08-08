/**
 * visuals.ts — primitive visual construction + per-kind runtime updates for
 * the primitive-3d renderer (extracted from renderer.ts by C0;
 * behavior-identical, pure moves + import rewiring — no logic changes).
 *
 * Owns: buildVisual (ALL primitive visual construction: sphere/box/plane/ring/
 * arrow/line/process_edge/orbit_path/trail/graph_surface/wave_surface/
 * particle_field/vector_field/process_node/energy_packet/camera_marker, with
 * the standalone `label` kind delegated to labels.ts), the per-kind runtime
 * state records (trail/particles/wave/vectorTicks) and their per-frame update
 * (updateKind), the engine-grid coupling for wave/vector-field nodes
 * (applyEngineSurface / applyEngineField), and the deterministic seeded PRNG
 * used by particle fields.
 */

import * as THREE from "three";
import type {
  EngineFieldVector,
  EngineVisualState,
} from "@/demonstrations/renderers/lumina-2d/types";
import type {
  EngineMapping,
  EngineMappingEntry,
  SceneGraph,
  SceneGraphAnimation,
  SceneGraphNode,
} from "./types";
import type { RuntimeNode } from "./renderer";
import { materialFor } from "./materials";
import { clampNum } from "./operators";
import { buildLabelKindVisual } from "./labels";
import { pushTrailPoint } from "./edges";

const OPACITY_ANIMATORS = new Set(["fade", "pulse", "reveal"]);
const COLOR_ANIMATORS = new Set(["change_color"]);

/** Sentinel mapping body keys for grid-driven objects (see EngineMapping). */
const FIELD_BODY = "@field";
const SURFACE_BODY = "@surface";

// ---------------------------------------------------------------------------
// Deterministic helpers (seeded PRNG for particles)
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bilinear sample of a row-major values grid at continuous (gx, gy) cells. */
function sampleBilinear(
  gx: number,
  gy: number,
  width: number,
  height: number,
  values: number[]
): number {
  if (width < 2 || height < 2) return values[0] ?? 0;
  const x = clampNum(gx, 0, width - 1);
  const y = clampNum(gy, 0, height - 1);
  const x0 = Math.min(Math.floor(x), width - 2);
  const y0 = Math.min(Math.floor(y), height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i0 = x0 + y0 * width;
  return (
    values[i0] * (1 - fx) * (1 - fy) +
    values[i0 + 1] * fx * (1 - fy) +
    values[i0 + width] * (1 - fx) * fy +
    values[i0 + width + 1] * fx * fy
  );
}

/** Bilinear sample of a row-major field-vector grid (cell index j*width+i). */
function sampleFieldBilinear(
  gx: number,
  gy: number,
  width: number,
  height: number,
  vectors: EngineFieldVector[]
): EngineFieldVector {
  const fallback: EngineFieldVector = { x: 0, y: 0, ex: 0, ey: 0, magnitude: 0 };
  if (width < 2 || height < 2) return vectors[0] ?? fallback;
  const x = clampNum(gx, 0, width - 1);
  const y = clampNum(gy, 0, height - 1);
  const x0 = Math.min(Math.floor(x), width - 2);
  const y0 = Math.min(Math.floor(y), height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i0 = x0 + y0 * width;
  const mix = (
    a: number,
    b: number,
    c: number,
    d: number
  ) => a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  const v00 = vectors[i0];
  const v10 = vectors[i0 + 1];
  const v01 = vectors[i0 + width];
  const v11 = vectors[i0 + width + 1];
  if (!v00 || !v10 || !v01 || !v11) return fallback;
  const ex = mix(v00.ex, v10.ex, v01.ex, v11.ex);
  const ey = mix(v00.ey, v10.ey, v01.ey, v11.ey);
  return { x: 0, y: 0, ex, ey, magnitude: Math.hypot(ex, ey) };
}

/** The subset of renderer state visual construction/update operates on. */
export interface VisualContext {
  scene: THREE.Scene | null;
  graph: SceneGraph | null;
  time: number;
  graphMode: boolean;
  animationsByTarget: Map<string, SceneGraphAnimation[]>;
  engineMapping: EngineMapping | null;
  engineState: EngineVisualState | null;
  engineFieldMaxMag: number;
  trackDisposable(d: { dispose(): void }): void;
  cloneMaterials(
    holder: THREE.Object3D,
    rn: RuntimeNode,
    animateOpacity: boolean,
    animateColor: boolean
  ): void;
}

/** Mapping entry for a vector_field node when a field grid is present. */
function engineFieldEntry(
  ctx: VisualContext,
  rn: RuntimeNode
): EngineMappingEntry | null {
  if (!ctx.engineState?.field) return null;
  const entry = ctx.engineMapping?.[rn.graph.id];
  return entry && entry.body === FIELD_BODY ? entry : null;
}

/** Mapping entry for a wave_surface node when a surface grid is present. */
function engineSurfaceEntry(
  ctx: VisualContext,
  rn: RuntimeNode
): EngineMappingEntry | null {
  if (!ctx.engineState?.surface) return null;
  const entry = ctx.engineMapping?.[rn.graph.id];
  return entry && entry.body === SURFACE_BODY ? entry : null;
}

/**
 * Drive a wave_surface mesh from the engine's u field. The mesh is rotated
 * -90° about x, so local +y maps to world -z; the engine's normalized y
 * (row/GH - 0.5, positive toward +z) therefore samples the flipped row:
 *   engineY = (0.5 - localY/size) - 0.5 = -localY/size
 * Heights are written into the local y channel (same visual language as the
 * operator-driven ripples), additively on top of the base plane so the
 * surface keeps its in-plane spread. Bilinear-sampled from the engine grid,
 * values clamped to ±1 before scaling.
 */
function applyEngineSurface(
  ctx: VisualContext,
  w: NonNullable<RuntimeNode["wave"]>,
  entry: EngineMappingEntry
): void {
  const surface = ctx.engineState?.surface;
  if (!surface) return;
  const { width, height, values } = surface;
  const dispScale = w.size * 0.15; // matches the operator ripple amplitude
  const inv = 1 / entry.scale;
  const ox = entry.offsetX ?? 0;
  const oy = entry.offsetY ?? 0;
  for (let i = 0; i < w.base.length; i += 3) {
    const lx = w.base[i];
    const ly = w.base[i + 1];
    const gx = ((lx - ox) * inv + 0.5) * width;
    const gy = (-(ly - oy) * inv + 0.5) * height;
    const value = sampleBilinear(gx, gy, width, height, values);
    w.attribute.array[i + 1] =
      w.base[i + 1] + clampNum(value, -1, 1) * dispScale;
  }
  w.attribute.needsUpdate = true;
}

/**
 * Drive a vector_field's arrows from the engine's field grid. Each arrow
 * samples the grid at its own world position (mapped back through the
 * curated entry scale/offsets); the direction follows (ex, 0, ey) and the
 * length is bounded by the field maximum in the current state, so arrows
 * near charges compress rather than explode.
 */
function applyEngineField(
  ctx: VisualContext,
  vt: NonNullable<RuntimeNode["vectorTicks"]>,
  entry: EngineMappingEntry
): void {
  const field = ctx.engineState?.field;
  if (!field) return;
  const { width, height, vectors, span } = field;
  const maxMag = ctx.engineFieldMaxMag > 0 ? ctx.engineFieldMaxMag : 1;
  const inv = 1 / entry.scale;
  const ox = entry.offsetX ?? 0;
  const oy = entry.offsetY ?? 0;
  const invSpan = 1 / (2 * span);
  for (let k = 0; k < vt.origins.length / 3; k++) {
    const oxW = vt.origins[k * 3];
    const ozW = vt.origins[k * 3 + 2];
    const px = (oxW - ox) * inv;
    const py = (ozW - oy) * inv;
    const gx = (px * invSpan + 0.5) * width;
    const gy = (py * invSpan + 0.5) * height;
    const sample = sampleFieldBilinear(gx, gy, width, height, vectors);
    const mag = sample.magnitude;
    const len =
      mag > 1e-6
        ? vt.len * Math.max(0.08, Math.sqrt(Math.min(1, mag / maxMag)))
        : 0;
    const dirX = mag > 1e-6 ? sample.ex / mag : 0;
    const dirY = mag > 1e-6 ? sample.ey / mag : 0;
    vt.attribute.array[k * 6] = oxW;
    vt.attribute.array[k * 6 + 1] = 0;
    vt.attribute.array[k * 6 + 2] = ozW;
    // engine (ex, ey) → world (x, z): the field lives in the plane.
    vt.attribute.array[k * 6 + 3] = oxW + dirX * len;
    vt.attribute.array[k * 6 + 4] = 0;
    vt.attribute.array[k * 6 + 5] = ozW + dirY * len;
  }
  vt.attribute.needsUpdate = true;
}

/** Build the visual (meshes/lines/points/sprites) for a primitive node. */
export function buildVisual(
  ctx: VisualContext,
  rn: RuntimeNode,
  node: SceneGraphNode,
  holder: THREE.Group
): void {
  const color = node.color;
  const size = node.size;

  switch (node.kind) {
    case "sphere": {
      const geo = new THREE.SphereGeometry(size * 0.5, 24, 16);
      holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "box": {
      const geo = new THREE.BoxGeometry(size, size, size);
      holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "plane": {
      const geo = new THREE.PlaneGeometry(size, size);
      const mesh = new THREE.Mesh(geo, materialFor(node.kind, color));
      mesh.rotation.x = -Math.PI / 2;
      holder.add(mesh);
      ctx.trackDisposable(geo);
      break;
    }
    case "ring": {
      const geo = new THREE.RingGeometry(size * 0.35, size * 0.5, 28);
      const mesh = new THREE.Mesh(geo, materialFor(node.kind, color));
      mesh.rotation.x = -Math.PI / 2;
      holder.add(mesh);
      ctx.trackDisposable(geo);
      break;
    }
    case "arrow": {
      const shaft = new THREE.CylinderGeometry(
        size * 0.05,
        size * 0.05,
        size * 0.6,
        8
      );
      const tip = new THREE.ConeGeometry(size * 0.16, size * 0.3, 12);
      const mat = materialFor(node.kind, color);
      const tipMesh = new THREE.Mesh(tip, mat);
      tipMesh.position.y = size * 0.45;
      holder.add(new THREE.Mesh(shaft, mat));
      holder.add(tipMesh);
      ctx.trackDisposable(shaft);
      ctx.trackDisposable(tip);
      break;
    }
    case "line":
    case "process_edge": {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, size]), 3)
      );
      holder.add(new THREE.Line(geo, materialFor("line", color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "orbit_path": {
      const segments = 64;
      const pts = new Float32Array((segments + 1) * 3);
      const radius = size * 0.5;
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts[i * 3] = radius * Math.cos(a);
        pts[i * 3 + 1] = 0;
        pts[i * 3 + 2] = radius * Math.sin(a);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      holder.add(new THREE.Line(geo, materialFor("line", color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "trail": {
      const capacity = Math.max(2, node.trailPoints);
      const buffer = new Float32Array(capacity * 3);
      const geo = new THREE.BufferGeometry();
      const attribute = new THREE.BufferAttribute(buffer, 3);
      geo.setAttribute("position", attribute);
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, materialFor("line", color));
      holder.add(line);
      rn.trail = {
        capacity,
        buffer,
        geometry: geo,
        attribute,
        line,
        written: 0,
        last: null,
      };
      ctx.trackDisposable(geo);
      break;
    }
    case "graph_surface": {
      const n = 12;
      const pts = new Float32Array((n + 1) * 2 * 2 * 3);
      let w = 0;
      for (let i = 0; i <= n; i++) {
        const t = (i / n - 0.5) * size;
        for (const s of [-1, 1]) {
          pts[w++] = t;
          pts[w++] = 0;
          pts[w++] = s * size * 0.5;
          pts[w++] = t;
          pts[w++] = 0;
          pts[w++] = -s * size * 0.5;
        }
      }
      for (let i = 0; i <= n; i++) {
        const t = (i / n - 0.5) * size;
        for (const s of [-1, 1]) {
          pts[w++] = s * size * 0.5;
          pts[w++] = 0;
          pts[w++] = t;
          pts[w++] = -s * size * 0.5;
          pts[w++] = 0;
          pts[w++] = t;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      holder.add(new THREE.LineSegments(geo, materialFor("line", color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "wave_surface": {
      const segments = 24;
      const geo = new THREE.PlaneGeometry(size, size, segments, segments);
      const attribute = geo.attributes.position as THREE.BufferAttribute;
      const base = new Float32Array(attribute.array);
      const mesh = new THREE.Mesh(geo, materialFor(node.kind, color));
      mesh.rotation.x = -Math.PI / 2;
      holder.add(mesh);
      rn.wave = { attribute, base, size };
      ctx.trackDisposable(geo);
      break;
    }
    case "particle_field": {
      const count = node.particleCount;
      const half = size * 0.5;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const rng = mulberry32(hashString(node.id));
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (rng() * 2 - 1) * half;
        positions[i * 3 + 1] = (rng() * 2 - 1) * half;
        positions[i * 3 + 2] = (rng() * 2 - 1) * half;
        const speed = 0.4 + rng() * 0.8;
        const phi = rng() * Math.PI * 2;
        const theta = rng() * Math.PI;
        velocities[i * 3] = speed * Math.sin(theta) * Math.cos(phi);
        velocities[i * 3 + 1] = speed * Math.cos(theta);
        velocities[i * 3 + 2] = speed * Math.sin(theta) * Math.sin(phi);
      }
      const geo = new THREE.BufferGeometry();
      const attribute = new THREE.BufferAttribute(positions, 3);
      geo.setAttribute("position", attribute);
      const points = new THREE.Points(geo, materialFor(node.kind, color));
      holder.add(points);
      rn.particles = { count, half, positions, velocities, attribute };
      ctx.trackDisposable(geo);
      break;
    }
    case "vector_field": {
      const grid = 4;
      const span = size;
      const len = span * 0.22;
      const ticks = grid * grid;
      const pts = new Float32Array(ticks * 2 * 3);
      const origins = new Float32Array(ticks * 3);
      for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
          const k = i * grid + j;
          const ox = (i / (grid - 1) - 0.5) * span;
          const oz = (j / (grid - 1) - 0.5) * span;
          origins[k * 3] = ox;
          origins[k * 3 + 1] = 0;
          origins[k * 3 + 2] = oz;
          // tick from base to base + (0, len, 0)
          pts[k * 6] = ox;
          pts[k * 6 + 1] = 0;
          pts[k * 6 + 2] = oz;
          pts[k * 6 + 3] = ox;
          pts[k * 6 + 4] = len;
          pts[k * 6 + 5] = oz;
        }
      }
      const geo = new THREE.BufferGeometry();
      const attribute = new THREE.BufferAttribute(pts, 3);
      geo.setAttribute("position", attribute);
      holder.add(
        new THREE.LineSegments(geo, materialFor("vector_field", color))
      );
      rn.vectorTicks = { attribute, origins, grid, span, len };
      ctx.trackDisposable(geo);
      break;
    }
    case "process_node": {
      const geo = new THREE.SphereGeometry(size * 0.5, 16, 12);
      holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "energy_packet": {
      const geo = new THREE.SphereGeometry(size * 0.5, 12, 8);
      holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "camera_marker": {
      const geo = new THREE.OctahedronGeometry(size * 0.4);
      holder.add(new THREE.Mesh(geo, materialFor(node.kind, color)));
      ctx.trackDisposable(geo);
      break;
    }
    case "label": {
      buildLabelKindVisual(ctx, node, holder);
      break;
    }
    case "group": {
      break;
    }
    default: {
      // Compile-time exhaustiveness: adding a new PrimitiveKind without a
      // case here stops typechecking.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const never: never = node.kind;
      return;
    }
  }

  // Per-node material clones when opacity or color is animated, so shared
  // cached materials are never mutated. Graph scenes clone every material
  // so selection dimming/highlighting can run per node.
  const anims = ctx.animationsByTarget.get(node.id) ?? [];
  const animateOpacity = anims.some((a) => OPACITY_ANIMATORS.has(a.operator));
  const animateColor = anims.some((a) => COLOR_ANIMATORS.has(a.operator));
  if (animateOpacity || animateColor || ctx.graphMode) {
    ctx.cloneMaterials(
      holder,
      rn,
      animateOpacity || ctx.graphMode,
      animateColor
    );
  }
}

/** Per-frame update of per-kind runtime state (particles/wave/ticks/trail). */
export function updateKind(
  ctx: VisualContext,
  rn: RuntimeNode,
  dt: number
): void {
  const s = rn.state;
  const scene = ctx.scene;
  if (!scene) return;

  if (rn.particles && s.emitting && dt > 0) {
    const p = rn.particles;
    for (let i = 0; i < p.count; i++) {
      p.positions[i * 3] += p.velocities[i * 3] * dt;
      p.positions[i * 3 + 1] += p.velocities[i * 3 + 1] * dt;
      p.positions[i * 3 + 2] += p.velocities[i * 3 + 2] * dt;
      for (let k = 0; k < 3; k++) {
        const v = p.positions[i * 3 + k];
        if (v > p.half) {
          p.positions[i * 3 + k] = p.half;
          p.velocities[i * 3 + k] = -Math.abs(p.velocities[i * 3 + k]) * 0.9;
        } else if (v < -p.half) {
          p.positions[i * 3 + k] = -p.half;
          p.velocities[i * 3 + k] = Math.abs(p.velocities[i * 3 + k]) * 0.9;
        }
      }
      p.attribute.needsUpdate = true;
    }
  }

  if (rn.wave) {
    const w = rn.wave;
    const surfaceEntry = engineSurfaceEntry(ctx, rn);
    if (surfaceEntry) {
      applyEngineSurface(ctx, w, surfaceEntry);
    } else {
      const wavelength = Math.max(0.001, w.size / 3);
      const amplitude = w.size * 0.15;
      for (let i = 0; i < w.base.length; i += 3) {
        const x = w.base[i];
        // Displace the local y (world z after the -90deg x rotation).
        w.attribute.array[i + 1] =
          amplitude * Math.sin(Math.PI * 2 * (x / wavelength + ctx.time * 0.5));
      }
      w.attribute.needsUpdate = true;
    }
  }

  if (rn.vectorTicks) {
    const vt = rn.vectorTicks;
    const fieldEntry = engineFieldEntry(ctx, rn);
    if (fieldEntry) {
      applyEngineField(ctx, vt, fieldEntry);
    } else {
      const v = s.vector;
      for (let k = 0; k < vt.origins.length / 3; k++) {
        const ox = vt.origins[k * 3];
        const oy = vt.origins[k * 3 + 1];
        const oz = vt.origins[k * 3 + 2];
        vt.attribute.array[k * 6] = ox;
        vt.attribute.array[k * 6 + 1] = oy;
        vt.attribute.array[k * 6 + 2] = oz;
        vt.attribute.array[k * 6 + 3] = ox + v.x * vt.len;
        vt.attribute.array[k * 6 + 4] = oy + v.y * vt.len;
        vt.attribute.array[k * 6 + 5] = oz + v.z * vt.len;
      }
      vt.attribute.needsUpdate = true;
    }
  }

  if (rn.trail && dt > 0) {
    pushTrailPoint(rn);
  }
}
