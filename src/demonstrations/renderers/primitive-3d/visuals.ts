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
import type { Vec3 } from "@/demonstrations/spec/demo-spec";
import { materialFor } from "./materials";
import { clampNum } from "./operators";
import { GRAPH_NODE_KINDS } from "./scene-graph";
import { buildLabelKindVisual } from "./labels";
import {
  buildLineGeometry,
  lineFallbackGeometry,
  pushTrailPoint,
} from "./edges";
import { REASON_FIELD_AUTO_FIT, REASON_LINE_NO_ENDPOINTS } from "./presentation/constants";

const OPACITY_ANIMATORS = new Set(["fade", "pulse", "reveal"]);
const COLOR_ANIMATORS = new Set(["change_color"]);

/** Sentinel mapping body keys for grid-driven objects (see EngineMapping). */
const FIELD_BODY = "@field";
const SURFACE_BODY = "@surface";

// Vector-field auto-fit (design-2 §5.2, F-15a): tick origins stop AT the
// anchor surface; overhang lets tick LENGTH reach the surface from inside.
const FIELD_OVERHANG = 0.15;
const FIELD_AUTO_FIT_GAP = 0.35;

// Vector-tick arrowhead tips (design-2 §5.3, F-17): two short barb segments at
// each tick tip, proportional to the tick length (LineSegments only, no new
// materials). Kept local to visuals.ts — the shared constants module is C5's
// and this ratio is not in design-2's enumerated single-source list (§6.4).
export const TICK_TIP_RATIO = 0.3;

/**
 * In-plane perpendicular of a tick direction (cross with up): for a direction
 * in the field's x-z plane this is the 90° rotation (−dz, 0, dx); a purely
 * vertical tick (no in-plane component) falls back to +x deterministically.
 */
function tickPerp(
  dx: number,
  dy: number,
  dz: number
): [number, number, number] {
  const px = -dz;
  const py = 0;
  const pz = dx;
  const len = Math.hypot(px, py, pz);
  if (len < 1e-9) return [1, 0, 0];
  return [px / len, py / len, pz / len];
}

/**
 * Write one tick as 6 points (3 LineSegments): shaft base→tip plus two barbs
 * tip→tip±perp·tipLen. Degenerate ticks (tip == base) collapse to a point.
 * Layout per tick k (offset k*18): [0] base, [1] tip, [2] tip, [3] tip+barbs,
 * [4] tip, [5] tip−barbs.
 */
function writeTickPoints(
  out: { [index: number]: number },
  k: number,
  baseX: number,
  baseY: number,
  baseZ: number,
  tipX: number,
  tipY: number,
  tipZ: number,
  tipLen: number
): void {
  const o = k * 18;
  const dx = tipX - baseX;
  const dy = tipY - baseY;
  const dz = tipZ - baseZ;
  if (Math.hypot(dx, dy, dz) < 1e-9) {
    for (let i = 0; i < 18; i++) out[o + i] = i % 3 === 0 ? baseX : i % 3 === 1 ? baseY : baseZ;
    return;
  }
  const [px, py, pz] = tickPerp(dx, dy, dz);
  out[o] = baseX;
  out[o + 1] = baseY;
  out[o + 2] = baseZ;
  out[o + 3] = tipX;
  out[o + 4] = tipY;
  out[o + 5] = tipZ;
  out[o + 6] = tipX;
  out[o + 7] = tipY;
  out[o + 8] = tipZ;
  out[o + 9] = tipX + px * tipLen;
  out[o + 10] = tipY + py * tipLen;
  out[o + 11] = tipZ + pz * tipLen;
  out[o + 12] = tipX;
  out[o + 13] = tipY;
  out[o + 14] = tipZ;
  out[o + 15] = tipX - px * tipLen;
  out[o + 16] = tipY - py * tipLen;
  out[o + 17] = tipZ - pz * tipLen;
}

/**
 * Resolve a `line`/`process_edge` connector's endpoints (design-2 §2.2):
 * the first relationship touching this node whose OTHER endpoint is a graph
 * node (process_node/sphere). Returns the two endpoints in the node's LOCAL
 * frame (the holder sits at node.position); null when no endpoint node exists
 * (the caller falls back to the local-frame stub + reason).
 */
function resolveLineEndpoints(
  ctx: VisualContext,
  node: SceneGraphNode
): { a: Vec3; b: Vec3 } | null {
  const graph = ctx.graph;
  if (!graph) return null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const rel of graph.relationships) {
    let otherId: string | null = null;
    if (rel.from === node.id) otherId = rel.to;
    else if (rel.to === node.id) otherId = rel.from;
    if (!otherId) continue;
    const other = byId.get(otherId);
    if (!other || !GRAPH_NODE_KINDS.has(other.kind)) continue;
    return {
      a: {
        x: other.position.x - node.position.x,
        y: other.position.y - node.position.y,
        z: other.position.z - node.position.z,
      },
      b: { x: 0, y: 0, z: 0 },
    };
  }
  return null;
}

/**
 * Vector-field span auto-fit (design-2 §5.2, F-15a): anchors are the graph
 * endpoints of relationships touching the field (non-graph mode) or, in graph
 * mode, every GRAPH_NODE_KINDS node near the field. When the gap between the
 * field edge and the nearest anchor envelope is ≤ FIELD_AUTO_FIT_GAP the span
 * grows so the tick origins reach every anchor surface plus FIELD_OVERHANG.
 * Returns the original span when nothing is anchored.
 */
function autoFitFieldSpan(
  ctx: VisualContext,
  node: SceneGraphNode,
  span: number
): number {
  const graph = ctx.graph;
  if (!graph) return span;
  let half = span / 2;
  const touching = new Set<string>();
  if (!ctx.graphMode) {
    for (const rel of graph.relationships) {
      if (rel.from === node.id) touching.add(rel.to);
      if (rel.to === node.id) touching.add(rel.from);
    }
  }
  let nearestGap = Infinity;
  let maxReach = half;
  let anchorCount = 0;
  for (const n of graph.nodes) {
    if (n.id === node.id) continue;
    const isAnchor = ctx.graphMode
      ? GRAPH_NODE_KINDS.has(n.kind)
      : touching.has(n.id) && GRAPH_NODE_KINDS.has(n.kind);
    if (!isAnchor) continue;
    anchorCount++;
    const r = n.size * 0.5;
    const dist = Math.hypot(
      n.position.x - node.position.x,
      n.position.z - node.position.z
    );
    nearestGap = Math.min(nearestGap, dist - r - half);
    maxReach = Math.max(maxReach, dist - r + FIELD_OVERHANG);
  }
  if (anchorCount > 0 && nearestGap <= FIELD_AUTO_FIT_GAP && maxReach > half) {
    return maxReach * 2;
  }
  return span;
}

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
  /** Reason accumulator (renderer merges into lastReasons at build end). */
  reasons?: string[];
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
    // engine (ex, ey) → world (x, z): the field lives in the plane.
    writeTickPoints(
      vt.attribute.array,
      k,
      oxW,
      0,
      ozW,
      oxW + dirX * len,
      0,
      ozW + dirY * len,
      len * TICK_TIP_RATIO
    );
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
      // Endpoint-oriented connector (F-07): when the node is a relationship
      // endpoint with an adjacent graph node, the line runs from the other
      // node's position to this node (local frame); process_edge bows as a
      // quadratic curve. No endpoint nodes: the documented local-frame
      // segment fallback + reason (never silent).
      const resolved = resolveLineEndpoints(ctx, node);
      const curved = node.kind === "process_edge";
      const pts = resolved
        ? buildLineGeometry(resolved.a, resolved.b, curved)
        : lineFallbackGeometry(size);
      if (!resolved) ctx.reasons?.push(REASON_LINE_NO_ENDPOINTS);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(pts, 3)
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
      // F-18: the trail Line lives in the SCENE (world space), not the moving
      // holder — pushTrailPoint records world positions, so the history stays
      // where it happened instead of being dragged along by the body.
      if (ctx.scene) {
        ctx.scene.add(line);
      } else {
        holder.add(line);
      }
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
      let span = size;
      // Auto-fit to the anchor surfaces (design-2 §5.2, F-15a): extend the
      // span so the tick grid reaches the envelopes it should emanate from.
      const fitSpan = autoFitFieldSpan(ctx, node, span);
      if (fitSpan > span) {
        span = fitSpan;
        ctx.reasons?.push(REASON_FIELD_AUTO_FIT);
      }
      const len = span * 0.22;
      const ticks = grid * grid;
      // 6 points per tick (F-17): shaft base→tip + two arrowhead barbs.
      const pts = new Float32Array(ticks * 6 * 3);
      const origins = new Float32Array(ticks * 3);
      const tipLen = len * TICK_TIP_RATIO;
      for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
          const k = i * grid + j;
          const ox = (i / (grid - 1) - 0.5) * span;
          const oz = (j / (grid - 1) - 0.5) * span;
          origins[k * 3] = ox;
          origins[k * 3 + 1] = 0;
          origins[k * 3 + 2] = oz;
          // Default base vector (0,1,0): ticks point +y, barbs along +x.
          writeTickPoints(pts, k, ox, 0, oz, ox, len, oz, tipLen);
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
      const labelMaterial = buildLabelKindVisual(ctx, node, holder);
      // The sprite material is owned by this node so opacity animation and
      // group-targeted propagation reach it (MUST-FIX 3): a label inside a
      // revealed group fades in with the group.
      rn.owned.push({
        material: labelMaterial,
        animateOpacity: true,
        animateColor: false,
      });
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
  // MUST-FIX 3 (tpl-before-after-02): a group-targeted reveal/fade/pulse must
  // reach the group's descendants. The propagation pass (renderer.ts
  // applyGroupOpacity) can only write materials the build OWNED (cloned), so
  // a descendant of an opacity-animated group gets a clone even when it has
  // no animation of its own — otherwise the shipped "after" group reveal was
  // a visual no-op (children rendered at full opacity from t=0).
  const groupOpacityAnimated = opacityAnimatedGroupAncestor(
    ctx.graph,
    node.id,
    ctx.animationsByTarget
  );
  if (animateOpacity || groupOpacityAnimated || animateColor || ctx.graphMode) {
    ctx.cloneMaterials(
      holder,
      rn,
      animateOpacity || groupOpacityAnimated || ctx.graphMode,
      animateColor
    );
  }
}

/**
 * MUST-FIX 3: true when any GROUP ANCESTOR of `nodeId` carries an opacity
 * animation (fade/reveal/pulse). Walk the children→parent chain (bounded by
 * the graph's max group depth); groups are containers, so their animated
 * opacity must compose into every descendant's rendered opacity.
 */
function opacityAnimatedGroupAncestor(
  graph: SceneGraph | null,
  nodeId: string,
  animationsByTarget: Map<string, SceneGraphAnimation[]>
): boolean {
  if (!graph) return false;
  const parentOf = new Map<string, string>();
  for (const n of graph.nodes) {
    for (const childId of n.children) parentOf.set(childId, n.id);
  }
  let current = parentOf.get(nodeId);
  let depth = 0;
  while (current !== undefined && depth < 8) {
    const ancestor = graph.nodes.find((n) => n.id === current);
    if (ancestor?.kind === "group") {
      const anims = animationsByTarget.get(current) ?? [];
      if (anims.some((a) => OPACITY_ANIMATORS.has(a.operator))) return true;
    }
    current = parentOf.get(current);
    depth++;
  }
  return false;
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
      const tipLen = vt.len * TICK_TIP_RATIO;
      for (let k = 0; k < vt.origins.length / 3; k++) {
        const ox = vt.origins[k * 3];
        const oy = vt.origins[k * 3 + 1];
        const oz = vt.origins[k * 3 + 2];
        writeTickPoints(
          vt.attribute.array,
          k,
          ox,
          oy,
          oz,
          ox + v.x * vt.len,
          oy + v.y * vt.len,
          oz + v.z * vt.len,
          tipLen
        );
      }
      vt.attribute.needsUpdate = true;
    }
  }

  if (rn.trail && dt > 0) {
    pushTrailPoint(rn);
  }
}
