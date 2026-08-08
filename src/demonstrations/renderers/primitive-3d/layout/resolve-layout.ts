/**
 * layout/resolve-layout.ts — deterministic layout repair (C1, Wave 3;
 * design-1 §2). Pure: layout = pure function of (graph, seed).
 *
 * Pipeline (design-1 §2.4):
 *   Phase A  unit model (rigid movable units + fixed obstacles)
 *   Phase B  bounded pairwise repulsion (≤ 24 passes, nudge ≤ 0.5/pass,
 *            total ≤ 8/unit, order-preserving collinear chains)
 *   Phase C  grid-slot reflow fallback (≥ 4 units still colliding — lowered
 *            from 8 by MUST-FIX 4 to close the 3–7-unit dead zone)
 *   Phase C2 wedge-equilibrium breaker (seeded orthogonal nudge on units
 *            stuck in net-zero fixed-obstacle wedges; MUST-FIX 4, W5)
 *   Phase D  packet snap + short-edge lengthening (MUST-FIX 5) + z re-check
 *            + clamp + I1 verify + degrade chain
 *
 * Determinism: seeded jitter via mulberry32(seed) breaks coincident-center
 * deadlocks (axis choice only — positions are never jittered, so collision-
 * free scenes are byte-identical for any seed; design-1 §2.1/§2.4). No
 * Three.js, no DOM; deep-copies the graph; never throws (budget exhaustion
 * yields a graph + residual reasons, mirroring buildSceneGraph's fail-soft
 * contract).
 *
 * The chokepoint integration lives in scene-graph.ts (design-1 §2.2): this
 * module is called only for layout-eligible specs; the 2D surface also calls
 * it directly (accessible-representation.tsx), so non-graph scenes get the
 * identity treatment here.
 */

import type {
  LayoutUnit,
  SceneBounds,
  SceneGraph,
  SceneGraphNode,
  SceneLayout,
} from "../types";
import type { RelationshipOperator, Vec3 } from "@/demonstrations/spec/demo-spec";
import type { Envelope, Rect } from "../geometry/envelopes";
import {
  CANVAS_FIT_CHARS,
  ENVELOPE_CLEARANCE,
  LABEL_GLYPH_CLEARANCE,
  PACKET_SPACING,
  PATH_CLEARANCE,
  SCENE_POSITION_BOUND,
  computeSceneBounds,
  edgeLabelRect,
  envelopeOverlap,
  nodeEnvelope,
  nodeLabelGlyphRect,
  nodeLabelRect,
  rectEnvelopeOverlap,
  rectRectOverlap,
} from "../geometry/envelopes";
import { arrowHead } from "../presentation/constants";
import { mulberry32 } from "../geometry/rng";

// ---------------------------------------------------------------------------
// Budget caps (design-1 §5)
// ---------------------------------------------------------------------------

export const MAX_LAYOUT_ITERATIONS = 24;
export const MAX_NUDGE_PER_ITERATION = 0.5;
export const MAX_TOTAL_DISPLACEMENT = 8.0;
/**
 * Grid-slot reflow threshold (design-1 §5, lowered by MUST-FIX 4): the
 * original 8-unit floor left clusters of 3–7 interpenetrated units in a dead
 * zone — repulsion exhausted its budget while the grid fallback never fired
 * (red-team W2/W3). 4 units is below every reported residual-cluster class,
 * and sub-threshold clusters of ≤ 3 still resolve by repulsion alone (the
 * "does NOT trigger below the threshold" test pins the boundary).
 */
export const GRID_FALLBACK_MIN_UNITS = 4;
export const GRID_POLISH_ITERATIONS = 8;

/**
 * Wedge-equilibrium breaker (MUST-FIX 4, red-team W5): a movable unit wedged
 * between fixed obstacles (e.g. an orbit target between the star and planet)
 * can sit in a net-zero repulsion equilibrium — the opposing pushes cancel
 * every pass and the loop terminates with residual collisions. The breaker
 * nudges each still-colliding unit along a SEEDED direction (deterministic
 * per seed; small enough to never escape the displacement intent) and re-runs
 * bounded repulsion. Positions are never jittered — only the wedge axis is
 * broken — so collision-free scenes stay byte-identical for any seed.
 */
export const WEDGE_BREAK_ATTEMPTS = 3;
export const WEDGE_NUDGE = 0.15;
export const WEDGE_POLISH_PASSES = 6;

/** Co-slot cap for chained packets sharing one source (MUST-FIX, W10):
 * at most 2 staggered slots per source; further packets share the last slot
 * (the reason `layout_packet_slots_capped` surfaces the pile-up honestly). */
export const MAX_CO_SLOTTED_PACKETS = 2;

/**
 * Float slack for the clearance boundary in the TERMINATION/residual
 * predicates only. Repulsion converges to EXACTLY clearance (design-1 §1.5 —
 * the packet snap touches the I1 boundary with equality), but (a) fp wobble
 * leaves converged pairs at d = clearance − 1e-16 and (b) the repulsion loop
 * halves the remaining depth per pass, so after MAX_LAYOUT_ITERATIONS the
 * worst-case tail is ~0.7·2^-24 ≈ 4e-8. Pairs within OVERLAP_EPS of the
 * clearance boundary are clean; 1e-4 (the gate's own I1 EPS scale) absorbs
 * both artifacts while staying three orders of magnitude below the 0.1
 * clearance. The nudge DEPTH (correction()) always uses the full
 * ENVELOPE_CLEARANCE so resolved pairs still land at ~clearance.
 */
const OVERLAP_EPS = 1e-4;
/** Effective overlap margin used by the loop/residual collision predicates. */
const OVERLAP_MARGIN = ENVELOPE_CLEARANCE - OVERLAP_EPS;

/** Soft label repulsion strength (fraction of the full correction). */
const SOFT_REPULSION_FACTOR = 0.5;

/** Movable kinds (design-1 §1.2) — position is illustrative, never semantic. */
const MOVABLE_KINDS = new Set<string>([
  "process_node",
  "sphere",
  "energy_packet",
  "box",
  "label",
]);

/** Packet chain / slidePath walking types (design-1 §1.6 — carriers follow
 * flow edges only; transforms_into is a state change, never a flow chain). */
const FLOW_TYPES = new Set<RelationshipOperator>(["flows_to", "transfers_to"]);

/** Relationship types the renderer draws as legacy (non-graph) edges — their
 * edge-label rects count in the scene bounds. transforms_into is drawn on
 * both surfaces (MUST-FIX 2: before_after's b1→b2). */
const DRAWN_EDGE_TYPES = new Set<RelationshipOperator>([
  "flows_to",
  "transfers_to",
  "transforms_into",
]);

const GRAPH_NODE_KINDS_LOCAL = new Set<string>(["process_node", "sphere"]);

/** Mirror of scene-graph.ts `isGraphLikeScene` (the canonical version lives
 * there; this local copy keeps the module cycle-free for the 2D surface's
 * direct use). */
export function isGraphLike(graph: SceneGraph): boolean {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.relationships.some((r) => {
    const from = byId.get(r.from);
    const to = byId.get(r.to);
    return (
      from !== undefined &&
      to !== undefined &&
      GRAPH_NODE_KINDS_LOCAL.has(from.kind) &&
      GRAPH_NODE_KINDS_LOCAL.has(to.kind)
    );
  });
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function norm(a: Vec3): Vec3 {
  const d = dist(a, { x: 0, y: 0, z: 0 });
  return d < 1e-12 ? { x: 1, y: 0, z: 0 } : mul(a, 1 / d);
}

function vlen(a: Vec3): number {
  return dist(a, { x: 0, y: 0, z: 0 });
}

/** Effective radius of a shape for correction-magnitude math (sphere r; box
 * half; rect max half). The overlap PREDICATE is the exact envelopeOverlap —
 * the radius only sizes the center-axis nudge (design-1 §2.4). */
function shapeRadius(env: Envelope): number {
  if (env.kind === "sphere") return env.radius;
  if (env.kind === "box") return env.half;
  return Math.max(env.halfW, env.halfH);
}

// ---------------------------------------------------------------------------
// Deep copy
// ---------------------------------------------------------------------------

function cloneGraph(graph: SceneGraph): SceneGraph {
  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      children: [...n.children],
    })),
    relationships: graph.relationships.map((r) => ({ ...r })),
    animations: graph.animations.map((a) => ({
      ...a,
      ...(a.path ? { path: a.path.map((p) => ({ ...p })) } : {}),
      ...(a.orbitCenter ? { orbitCenter: { ...a.orbitCenter } } : {}),
      ...(a.slidePath ? { slidePath: a.slidePath.map((p) => ({ ...p })) } : {}),
    })),
    background: graph.background,
    limits: { ...graph.limits },
  };
}

// ---------------------------------------------------------------------------
// Chain / slidePath derivation (design-1 §1.6 / §3.1)
// ---------------------------------------------------------------------------

/** World position of a node (Σ ancestor positions — group holders nest). */
export function worldPositionOf(
  nodeId: string,
  byId: Map<string, SceneGraphNode>,
  parentOf: Map<string, string>,
): Vec3 {
  const chain: string[] = [];
  let current: string | undefined = nodeId;
  while (current !== undefined) {
    chain.push(current);
    current = parentOf.get(current);
  }
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  for (const id of chain) {
    const node = byId.get(id);
    if (!node) continue;
    out.x += node.position.x;
    out.y += node.position.y;
    out.z += node.position.z;
  }
  return out;
}

function buildParentOf(graph: SceneGraph): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const n of graph.nodes) {
    for (const childId of n.children) parentOf.set(childId, n.id);
  }
  return parentOf;
}

/**
 * Flow chain of an animated packet (design-1 §1.6 step 1): walk
 * flows_to/transfers_to edges from the packet's nearest flow-edge source
 * (argmin distance, ties by node id order), following outgoing flow edges
 * ≤ 32 hops (mirrors derivePath minus the loop-close). Returns the node ids
 * [source, ..., destination], or null when no chain exists (< 2 nodes).
 */
export function derivePacketChain(
  graph: SceneGraph,
  packetId: string,
): string[] | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = buildParentOf(graph);
  const worldOf = (id: string): Vec3 => worldPositionOf(id, byId, parentOf);
  const packet = byId.get(packetId);
  if (!packet) return null;

  const sources: string[] = [];
  const seen = new Set<string>();
  for (const rel of graph.relationships) {
    // MUST-FIX (W11): the packet's OWN outgoing edge (template r0: ep1→pn2)
    // makes the packet itself a flow source at distance 0 — snapping from
    // the packet's own center parks it INSIDE the real source's surface.
    // A packet is a carrier, never its own chain source.
    if (
      FLOW_TYPES.has(rel.type) &&
      rel.from !== packetId &&
      byId.has(rel.from) &&
      !seen.has(rel.from)
    ) {
      seen.add(rel.from);
      sources.push(rel.from);
    }
  }
  if (sources.length === 0) return null;
  sources.sort((a, b) => {
    const da = dist(worldOf(packetId), worldOf(a));
    const db = dist(worldOf(packetId), worldOf(b));
    if (da !== db) return da - db;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const chain: string[] = [sources[0]];
  const visited = new Set<string>(chain);
  let current = sources[0];
  for (let i = 0; i < 32; i++) {
    const next = graph.relationships.find(
      (r) => FLOW_TYPES.has(r.type) && r.from === current && !visited.has(r.to),
    );
    if (!next) break;
    visited.add(next.to);
    chain.push(next.to);
    current = next.to;
  }
  return chain.length >= 2 ? chain : null;
}

/**
 * Surface-to-surface slide path of an animated packet (design-1 §3.1): for
 * each consecutive chain pair (a → b), aExit = a.center + û·(r_a + r_pkt +
 * PATH_CLEARANCE), bEntry = b.center − û·(r_b + r_pkt + PATH_CLEARANCE); mid
 * nodes contribute both, the source its exit, the final destination its
 * entry. `process_flow` → [−2.25, −0.75, 0.75, 2.25]; `energy_transfer` →
 * [−2.25, 2.25]. Null when no chain.
 */
export function derivePacketSlidePath(
  graph: SceneGraph,
  packetId: string,
): Vec3[] | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = buildParentOf(graph);
  const worldOf = (id: string): Vec3 => worldPositionOf(id, byId, parentOf);
  const packet = byId.get(packetId);
  const chain = derivePacketChain(graph, packetId);
  if (!chain || !packet) return null;
  const rPkt = packet.size * 0.5;
  const out: Vec3[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = byId.get(chain[i]);
    const b = byId.get(chain[i + 1]);
    if (!a || !b) continue;
    const pa = worldOf(a.id);
    const pb = worldOf(b.id);
    const d = dist(pa, pb);
    if (d < 1e-9) continue; // degenerate segment (coincident chain nodes)
    const u = norm(sub(pb, pa));
    const rA = a.size * 0.5;
    const rB = b.size * 0.5;
    out.push(add(pa, mul(u, rA + rPkt + PATH_CLEARANCE)));
    out.push(sub(pb, mul(u, rB + rPkt + PATH_CLEARANCE)));
  }
  const distinct: Vec3[] = [];
  for (const p of out) {
    const last = distinct[distinct.length - 1];
    if (!last || dist(last, p) > 1e-6) distinct.push(p);
  }
  return distinct.length >= 2 ? distinct : null;
}

// ---------------------------------------------------------------------------
// resolveLayout
// ---------------------------------------------------------------------------

interface Unit {
  rootId: string;
  rootIsGroup: boolean;
  members: string[]; // movable node ids in the subtree (envelope subjects)
  depth: number;
}

type EnvOf = (unit: Unit, memberId: string) => Envelope;
type Obstacle = { id: string; env: Envelope };

/**
 * Deterministic layout repair (design-1 §2.1). Deep-copies the graph and
 * returns it with final movable positions; non-graph scenes pass through
 * unchanged with bounds only. Never throws.
 */
export function resolveLayout(
  graph: SceneGraph,
  seed: number,
): { graph: SceneGraph; layout: SceneLayout; reasons: string[] } {
  const work = cloneGraph(graph);
  const reasons: string[] = [];
  const byId = new Map(work.nodes.map((n) => [n.id, n]));
  const parentOf = buildParentOf(work);
  const worldOf = (id: string): Vec3 => worldPositionOf(id, byId, parentOf);
  const originalPos = new Map(work.nodes.map((n) => [n.id, { ...n.position }]));

  if (!isGraphLike(work)) {
    return { graph: work, layout: identityLayout(work), reasons };
  }

  // -------------------------------------------------------------------------
  // Movable / fixed sets (design-1 §1.2)
  // -------------------------------------------------------------------------
  const orbitTargets = new Set(
    work.animations.filter((a) => a.operator === "orbit").map((a) => a.target),
  );
  const orbitCenters = new Set(
    work.relationships.filter((r) => r.type === "orbits").map((r) => r.to),
  );
  const isMovable = (n: SceneGraphNode): boolean =>
    MOVABLE_KINDS.has(n.kind) &&
    !orbitTargets.has(n.id) &&
    !orbitCenters.has(n.id);

  // -------------------------------------------------------------------------
  // z-plane canonicalization (design-1 §1.1): planar scenes flatten every
  // movable node to the movable-set median z; non-planar scenes keep authored
  // z (depth is opt-in — the flat graph camera drops z, so a single plane is
  // the canonical representation).
  // -------------------------------------------------------------------------
  const movableNodes = work.nodes.filter(isMovable);
  let planar = false;
  if (movableNodes.length > 0) {
    const zs = movableNodes.map((n) => n.position.z).sort((a, b) => a - b);
    const median = (zs[(zs.length - 1) >> 1] + zs[zs.length >> 1]) / 2;
    const allWithin = movableNodes.every(
      (n) => Math.abs(n.position.z - median) <= 0.25,
    );
    if (allWithin) {
      planar = true;
      for (const n of movableNodes) n.position.z = median;
    }
  }

  // -------------------------------------------------------------------------
  // Chained packets (design-1 §1.6): translate/follow_path targets with a
  // derivable flow chain are deferred — their final position is decided by
  // the Phase D snap (never by repulsion), so the source/downstream nodes
  // keep their authored positions (process_flow's pn1/ep1 duplicate resolves
  // by snapping the packet to the source surface, not by shoving the node).
  // -------------------------------------------------------------------------
  const chainedPackets = new Map<string, string[]>(); // packetId -> chain
  for (const anim of work.animations) {
    if (anim.operator !== "translate" && anim.operator !== "follow_path") continue;
    const target = byId.get(anim.target);
    if (!target || target.kind !== "energy_packet") continue;
    if (parentOf.has(target.id)) continue; // inside a group: frame is the group's
    const chain = derivePacketChain(work, target.id);
    if (chain) chainedPackets.set(target.id, chain);
  }

  // -------------------------------------------------------------------------
  // Phase A — unit model (design-1 §2.4)
  // -------------------------------------------------------------------------
  const unitByRoot = new Map<string, Unit>();
  const unitMemberOf = new Map<string, string>(); // movable node id -> rootId
  const topmostGroupOf = (id: string): string | null => {
    let current = id;
    let top: string | null = null;
    while (parentOf.has(current)) {
      current = parentOf.get(current)!;
      if (byId.get(current)?.kind === "group") top = current;
    }
    return top;
  };
  for (const n of movableNodes) {
    if (chainedPackets.has(n.id)) continue; // deferred to Phase D
    const groupRoot = topmostGroupOf(n.id);
    const rootId = groupRoot ?? n.id;
    let unit = unitByRoot.get(rootId);
    if (!unit) {
      unit = {
        rootId,
        rootIsGroup: groupRoot !== null,
        members: [],
        depth: byId.get(rootId)?.depth ?? 1,
      };
      unitByRoot.set(rootId, unit);
    }
    unit.members.push(n.id);
    unitMemberOf.set(n.id, rootId);
  }
  for (const unit of unitByRoot.values()) unit.members.sort();

  const units = [...unitByRoot.values()].sort((a, b) =>
    a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
  );

  // Obstacles: every node that is not a movable unit member/root (fixed
  // kinds, orbit anchors/centers, all-fixed groups' members). Group
  // containers contribute no envelope of their own (children are separate
  // obstacles in the node list). Chained packets are NOT obstacles either:
  // their final position is decided by the Phase D snap (design-1 §1.6/§2.4),
  // so their authored position must never shove the source/downstream nodes
  // — process_flow's pn1/ep1 duplicate resolves by snapping the packet to
  // the source surface, never by moving the node.
  const obstacles: Obstacle[] = work.nodes
    .filter(
      (n) =>
        !unitMemberOf.has(n.id) &&
        n.kind !== "group" &&
        !chainedPackets.has(n.id)
    )
    .map((n) => ({ id: n.id, env: worldEnvelopeOf(n.id, byId, parentOf) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const memberEnv: EnvOf = (unit, memberId) =>
    worldEnvelopeOf(memberId, byId, parentOf);

  // Seeded jitter — deterministic axis for coincident centers only.
  const rng = mulberry32(seed);
  const jitterAxis = (): Vec3 => {
    if (planar) {
      const angle = rng() * Math.PI * 2;
      return { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
    }
    const az = rng() * Math.PI * 2;
    const el = Math.acos(2 * rng() - 1);
    return {
      x: Math.sin(el) * Math.cos(az),
      y: Math.sin(el) * Math.sin(az),
      z: Math.cos(el),
    };
  };

  const preRepairCentroid: Vec3 = centroidOfMovables(units, memberEnv);

  // -------------------------------------------------------------------------
  // Phase B — pairwise repulsion (design-1 §2.4)
  // -------------------------------------------------------------------------
  const totalDisplacement = new Map<string, number>(); // unit rootId
  const iterationsCapped = runRepulsionPasses(
    units,
    obstacles,
    memberEnv,
    jitterAxis,
    totalDisplacement,
    MAX_LAYOUT_ITERATIONS,
    byId,
    unitByRoot,
  );

  // -------------------------------------------------------------------------
  // Phase C — grid-slot fallback (design-1 §2.4, threshold lowered by
  // MUST-FIX 4)
  // -------------------------------------------------------------------------
  const collidingUnits = units.filter(
    (u) =>
      unitPairOverlapsAny(u, units, memberEnv) ||
      unitObstacleOverlaps(u, obstacles, memberEnv),
  );
  if (collidingUnits.length >= GRID_FALLBACK_MIN_UNITS) {
    const sorted = [...units].sort(
      (a, b) =>
        a.depth - b.depth ||
        (a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0),
    );
    let maxR = 0;
    for (const u of units) {
      for (const m of u.members) maxR = Math.max(maxR, shapeRadius(memberEnv(u, m)));
    }
    const spacing = 2 * (maxR * 1.1 + ENVELOPE_CLEARANCE);
    const cols = Math.ceil(Math.sqrt(units.length));
    sorted.forEach((u, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const root = byId.get(u.rootId);
      if (!root) return;
      root.position = {
        x: preRepairCentroid.x + (col - (cols - 1) / 2) * spacing,
        y: preRepairCentroid.y + (row - (cols - 1) / 2) * spacing,
        z: root.position.z,
      };
    });
    reasons.push("layout_grid_fallback");
    // Grid polish: bounded repulsion re-runs on the reflowed units with a
    // fresh per-unit displacement budget.
    totalDisplacement.clear();
    runRepulsionPasses(
      units,
      obstacles,
      memberEnv,
      jitterAxis,
      totalDisplacement,
      GRID_POLISH_ITERATIONS,
      byId,
      unitByRoot,
    );
  }

  // -------------------------------------------------------------------------
  // Phase C2 — wedge-equilibrium breaker (MUST-FIX 4, red-team W5)
  // -------------------------------------------------------------------------
  // A unit wedged between fixed obstacles (an orbit target between the star
  // and planet) can sit in a net-zero equilibrium: the opposing correction
  // magnitudes are identical every pass, the displacement is ~0, and
  // runRepulsionPasses terminates with residuals. Break the equilibrium with
  // a small SEEDED nudge (deterministic per seed, orthogonal intent — it only
  // has to be non-zero) and re-run bounded repulsion. The nudge counts toward
  // the unit's MAX_TOTAL_DISPLACEMENT budget, so an already-exhausted unit is
  // left untouched (the existing budget-cap tests stay byte-identical).
  for (let attempt = 0; attempt < WEDGE_BREAK_ATTEMPTS; attempt++) {
    if (!envelopeCollisionsRemain(units, obstacles, memberEnv)) break;
    let nudged = false;
    for (const u of units) {
      if (
        !(
          unitPairOverlapsAny(u, units, memberEnv) ||
          unitObstacleOverlaps(u, obstacles, memberEnv)
        )
      ) {
        continue;
      }
      const root = byId.get(u.rootId);
      if (!root) continue;
      const magnitude = WEDGE_NUDGE * (attempt + 1);
      const total = totalDisplacement.get(u.rootId) ?? 0;
      const allowed = Math.max(0, MAX_TOTAL_DISPLACEMENT - total);
      if (allowed <= 1e-12) continue; // budget exhausted — never move it
      const applied = Math.min(magnitude, allowed);
      root.position = add(root.position, mul(jitterAxis(), applied));
      totalDisplacement.set(u.rootId, total + applied);
      nudged = true;
    }
    if (!nudged) break;
    runRepulsionPasses(
      units,
      obstacles,
      memberEnv,
      jitterAxis,
      totalDisplacement,
      WEDGE_POLISH_PASSES,
      byId,
      unitByRoot,
    );
  }

  // -------------------------------------------------------------------------
  // Phase D — packet snap + short-edge lengthening + clamp + I1 verify +
  // degrade (design-1 §2.4/§5, MUST-FIX 5)
  // -------------------------------------------------------------------------
  const { offsets: snapOffsets, capped: packetSlotsCapped } = packetSnapOffsets(
    work,
    chainedPackets,
  );
  if (packetSlotsCapped) reasons.push("layout_packet_slots_capped");
  for (const packetId of chainedPackets.keys()) {
    const path = derivePacketSlidePath(work, packetId);
    if (!path || path.length < 2) continue;
    const packet = byId.get(packetId);
    if (!packet) continue;
    const firstDir = norm(sub(path[1], path[0]));
    const offset =
      (snapOffsets.get(packetId) ?? 0) * (2 * (packet.size * 0.5) + PACKET_SPACING);
    packet.position = add(path[0], mul(firstDir, offset));
  }

  // MUST-FIX 5 (red-team W6/W7): enforce L >= r_s + r_t + headLen for every
  // drawn graph edge after repair — the arrowhead must never sit inside the
  // source. Lengthen along the edge axis when both endpoints are directly
  // movable; edges that cannot comply stay short and are left for the
  // renderer's head-suppression degrade (edge_head_suppressed_short_edge).
  lengthenShortEdges(
    work,
    byId,
    parentOf,
    directlyMovableRoots(units),
    new Set(chainedPackets.keys()),
  );

  // Defensive clamp (can't trigger: input clamped, nudges bounded).
  const clampBound = SCENE_POSITION_BOUND - 1;
  for (const n of work.nodes) {
    n.position = {
      x: Math.min(clampBound, Math.max(-clampBound, n.position.x)),
      y: Math.min(clampBound, Math.max(-clampBound, n.position.y)),
      z: Math.min(clampBound, Math.max(-clampBound, n.position.z)),
    };
  }

  // I1 verification (envelope pairs, ENVELOPE_CLEARANCE).
  const verificationShapes = collectVerificationShapes(
    units,
    obstacles,
    chainedPackets,
    byId,
    parentOf,
  );
  let residualCount = countResiduals(verificationShapes);

  // Degrade-by-simplification (design-1 §5).
  const labelShortened: string[] = [];
  const suppressedEdgeLabels: string[] = [];
  if (residualCount > 0) {
    for (const u of units) {
      if (
        !(
          unitPairOverlapsAny(u, units, memberEnv) ||
          unitObstacleOverlaps(u, obstacles, memberEnv)
        )
      ) {
        continue;
      }
      for (const m of u.members) {
        const node = byId.get(m);
        if (!node || node.label === undefined) continue;
        if (node.label.length > CANVAS_FIT_CHARS) {
          node.label = node.label.slice(0, CANVAS_FIT_CHARS);
          labelShortened.push(m);
        }
      }
    }
    if (labelShortened.length > 0) reasons.push("layout_labels_shortened");

    // Edge-label sprites whose rects still collide with an envelope or a
    // node-label rect are suppressed (recorded for B2's label stage).
    for (const rel of work.relationships) {
      const from = byId.get(rel.from);
      const to = byId.get(rel.to);
      if (!from || !to) continue;
      if (
        !GRAPH_NODE_KINDS_LOCAL.has(from.kind) ||
        !GRAPH_NODE_KINDS_LOCAL.has(to.kind)
      ) {
        continue;
      }
      const rect = edgeLabelRect(
        worldOf(from.id),
        worldOf(to.id),
        rel.label ?? rel.type,
      );
      let collides = false;
      for (const n of work.nodes) {
        if (rectEnvelopeOverlap(rect, worldEnvelopeOf(n.id, byId, parentOf), 0)) {
          collides = true;
          break;
        }
        const nr = nodeLabelRect(n);
        if (nr && rectRectOverlap(rect, nr, 0)) {
          collides = true;
          break;
        }
      }
      if (collides) suppressedEdgeLabels.push(rel.id);
    }
    if (suppressedEdgeLabels.length > 0) {
      reasons.push("layout_edge_labels_suppressed");
    }

    // Re-verify I1 after the readability degrades.
    residualCount = countResiduals(verificationShapes);
    if (residualCount > 0) reasons.push("layout_collision_remaining");
  }

  // -------------------------------------------------------------------------
  // Reason emission (design-1 §2.6)
  // -------------------------------------------------------------------------
  const moved: Array<{ id: string; from: Vec3; to: Vec3 }> = [];
  for (const n of work.nodes) {
    const from = originalPos.get(n.id);
    if (!from) continue;
    if (
      Math.abs(from.x - n.position.x) > 1e-9 ||
      Math.abs(from.y - n.position.y) > 1e-9 ||
      Math.abs(from.z - n.position.z) > 1e-9
    ) {
      moved.push({ id: n.id, from, to: { ...n.position } });
    }
  }
  if (iterationsCapped) reasons.push("layout_iterations_capped");
  if (moved.length > 0) reasons.unshift("layout_repaired");

  const layout: SceneLayout = {
    repaired: moved.length > 0,
    bounds: computeBoundsFor(work, byId, parentOf),
    moved,
    labelShortened,
    suppressedEdgeLabels,
    units: units.map((u) => ({
      rootId: u.rootId,
      memberIds: [...u.members],
      rootIsGroup: u.rootIsGroup,
    })),
  };
  return { graph: work, layout, reasons };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** World-positioned envelope of a node. */
function worldEnvelopeOf(
  nodeId: string,
  byId: Map<string, SceneGraphNode>,
  parentOf: Map<string, string>,
): Envelope {
  const node = byId.get(nodeId);
  if (!node) {
    return { kind: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 0 };
  }
  const world = worldPositionOf(nodeId, byId, parentOf);
  return nodeEnvelope({ ...node, position: world });
}

/** Tier-2 glyph rect of a node's label (reads the CURRENT node positions —
 * the byId nodes are the work graph nodes, mutated as unit roots move). */
function labelGlyphOf(
  byId: Map<string, SceneGraphNode>,
  nodeId: string,
): Rect | null {
  const node = byId.get(nodeId);
  if (!node) return null;
  return nodeLabelGlyphRect(node);
}

/**
 * One bounded repulsion pass over all unit pairs (i < j) and unit-obstacle
 * pairs. Accumulates per-unit displacement, caps it at MAX_NUDGE_PER_ITERATION
 * per pass and MAX_TOTAL_DISPLACEMENT per unit across passes, then translates
 * the unit ROOTS (rigid units — members never move relative to the root).
 * Returns true when the pass budget was exhausted with envelope collisions
 * remaining (design-1 §2.6 `layout_iterations_capped`).
 */
function runRepulsionPasses(
  units: Unit[],
  obstacles: Obstacle[],
  memberEnv: EnvOf,
  jitterAxis: () => Vec3,
  totalDisplacement: Map<string, number>,
  maxPasses: number,
  byId: Map<string, SceneGraphNode>,
  unitByRoot: Map<string, Unit>,
): boolean {
  for (let pass = 0; pass < maxPasses; pass++) {
    const displacement = new Map<string, Vec3>();
    const addDisp = (rootId: string, d: Vec3): void => {
      displacement.set(
        rootId,
        add(displacement.get(rootId) ?? { x: 0, y: 0, z: 0 }, d),
      );
    };

    // Unit–unit pairs (i < j, deterministic id order).
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const ua = units[i];
        const ub = units[j];
        for (const ma of ua.members) {
          for (const mb of ub.members) {
            const a = memberEnv(ua, ma);
            const b = memberEnv(ub, mb);
            if (envelopeOverlap(a, b, OVERLAP_MARGIN)) {
              const corr = correction(a, b, ENVELOPE_CLEARANCE, false, jitterAxis);
              if (corr) {
                addDisp(ua.rootId, corr.dA);
                addDisp(ub.rootId, corr.dB);
              }
              continue;
            }
            // Soft I3 pre-clear: node-label glyph rects vs the other unit's
            // envelope / label glyph rect (LABEL_GLYPH_CLEARANCE). Edge labels
            // are B2's stage-3 shapes and are not repulsion drivers.
            const ga = labelGlyphOf(byId, ma);
            const gb = labelGlyphOf(byId, mb);
            if (ga && rectEnvelopeOverlap(ga, b, LABEL_GLYPH_CLEARANCE)) {
              const corr = softCorrection(ga, b, jitterAxis);
              if (corr) addDisp(ua.rootId, mul(corr.axis, -corr.magnitude));
            }
            if (gb && rectEnvelopeOverlap(gb, a, LABEL_GLYPH_CLEARANCE)) {
              const corr = softCorrection(gb, a, jitterAxis);
              if (corr) addDisp(ub.rootId, mul(corr.axis, -corr.magnitude));
            }
            if (ga && gb && rectRectOverlap(ga, gb, LABEL_GLYPH_CLEARANCE)) {
              const corr = softCorrection(ga, gb, jitterAxis);
              if (corr) {
                addDisp(ua.rootId, mul(corr.axis, -corr.magnitude * 0.5));
                addDisp(ub.rootId, mul(corr.axis, corr.magnitude * 0.5));
              }
            }
          }
        }
      }
    }

    // Unit–obstacle pairs: the unit moves the full correction.
    for (const unit of units) {
      for (const ob of obstacles) {
        for (const m of unit.members) {
          const a = memberEnv(unit, m);
          if (!envelopeOverlap(a, ob.env, OVERLAP_MARGIN)) continue;
          const corr = correction(a, ob.env, ENVELOPE_CLEARANCE, true, jitterAxis);
          if (corr) addDisp(unit.rootId, corr.dA);
          break; // one obstacle contact per unit is enough per pass
        }
      }
    }

    // Apply with per-pass and lifetime caps.
    let appliedAny = false;
    for (const [rootId, d] of displacement) {
      const len = vlen(d);
      if (len <= 1e-12) continue;
      let d2 = len > MAX_NUDGE_PER_ITERATION
        ? mul(d, MAX_NUDGE_PER_ITERATION / len)
        : d;
      const total = totalDisplacement.get(rootId) ?? 0;
      const allowed = Math.max(0, MAX_TOTAL_DISPLACEMENT - total);
      if (allowed <= 1e-12) continue;
      const applied = Math.min(vlen(d2), allowed);
      if (applied <= 1e-12) continue;
      d2 = mul(d2, applied / vlen(d2));
      const root = unitByRoot.get(rootId) ? byId.get(rootId) : undefined;
      if (!root) continue;
      root.position = add(root.position, d2);
      totalDisplacement.set(rootId, total + applied);
      appliedAny = true;
    }
    if (!appliedAny) return envelopeCollisionsRemain(units, obstacles, memberEnv);
    if (!envelopeCollisionsRemain(units, obstacles, memberEnv)) return false;
  }
  return envelopeCollisionsRemain(units, obstacles, memberEnv);
}

/** True when any envelope collision remains (units × units × obstacles). */
function envelopeCollisionsRemain(
  units: Unit[],
  obstacles: Obstacle[],
  memberEnv: EnvOf,
): boolean {
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      if (unitPairOverlaps2(units[i], units[j], memberEnv)) return true;
    }
    if (unitObstacleOverlaps(units[i], obstacles, memberEnv)) return true;
  }
  return false;
}

interface Correction {
  /** Displacement for the shape-a owner (away from b). */
  dA: Vec3;
  /** Displacement for the shape-b owner (away from a). */
  dB: Vec3;
}

/** Center-axis correction with equivalent-radius depth (design-1 §2.4).
 * `obstacle` = true → the b-side is fixed and absorbs 100%. */
function correction(
  a: Envelope,
  b: Envelope,
  margin: number,
  obstacle: boolean,
  jitter: () => Vec3,
): Correction | null {
  const d = dist(a.center, b.center);
  const ra = shapeRadius(a);
  const rb = shapeRadius(b);
  const depth = ra + rb + margin - d;
  if (depth <= 0) return null;
  const magnitude = Math.min(depth, MAX_NUDGE_PER_ITERATION);
  // axis points from a to b; a moves −axis, b moves +axis.
  const axis = d < 1e-6 ? jitter() : norm(sub(b.center, a.center));
  if (obstacle || ra + rb <= 1e-12) {
    return { dA: mul(axis, -magnitude), dB: { x: 0, y: 0, z: 0 } };
  }
  const fA = rb / (ra + rb); // bigger body stays, smaller moves more
  const fB = ra / (ra + rb);
  return { dA: mul(axis, -magnitude * fA), dB: mul(axis, magnitude * fB) };
}

/** Soft label collision: axis from the rect to the other shape, magnitude
 * (scaled by SOFT_REPULSION_FACTOR). The rect owner moves −axis. */
function softCorrection(
  rect: Rect,
  other: Envelope | Rect,
  jitter: () => Vec3,
): { axis: Vec3; magnitude: number } | null {
  const d = dist(rect.center, other.center);
  const rRect = Math.max(rect.halfW, rect.halfH);
  const rOther =
    "kind" in other ? shapeRadius(other) : Math.max(other.halfW, other.halfH);
  const depth = rRect + rOther + LABEL_GLYPH_CLEARANCE - d;
  if (depth <= 0) return null;
  const magnitude =
    Math.min(depth, MAX_NUDGE_PER_ITERATION) * SOFT_REPULSION_FACTOR;
  const axis = d < 1e-6 ? jitter() : norm(sub(other.center, rect.center));
  return { axis, magnitude };
}

function unitPairOverlaps2(
  a: Unit,
  b: Unit,
  envOf: EnvOf,
): boolean {
  for (const ma of a.members) {
    for (const mb of b.members) {
      if (envelopeOverlap(envOf(a, ma), envOf(b, mb), OVERLAP_MARGIN)) {
        return true;
      }
    }
  }
  return false;
}

/** True when the unit overlaps ANY other unit. */
function unitPairOverlapsAny(u: Unit, units: Unit[], envOf: EnvOf): boolean {
  for (const other of units) {
    if (other === u) continue;
    if (unitPairOverlaps2(u, other, envOf)) return true;
  }
  return false;
}

/** True when the unit overlaps any obstacle envelope. */
function unitObstacleOverlaps(
  u: Unit,
  obstacles: Obstacle[],
  envOf: EnvOf,
): boolean {
  for (const m of u.members) {
    const a = envOf(u, m);
    for (const ob of obstacles) {
      if (envelopeOverlap(a, ob.env, OVERLAP_MARGIN)) return true;
    }
  }
  return false;
}

/** Centroid of all unit member world positions (pre-repair frame). */
function centroidOfMovables(units: Unit[], envOf: EnvOf): Vec3 {
  let n = 0;
  const acc = { x: 0, y: 0, z: 0 };
  for (const u of units) {
    for (const m of u.members) {
      const c = envOf(u, m).center;
      acc.x += c.x;
      acc.y += c.y;
      acc.z += c.z;
      n++;
    }
  }
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: acc.x / n, y: acc.y / n, z: acc.z / n };
}

/** Per-source stagger index for chained packets: ordered by (delayMs, id).
 * The index is CAPPED at MAX_CO_SLOTTED_PACKETS − 1 (MUST-FIX, W10): more
 * than two co-slotted packets on a short segment would otherwise stagger past
 * the destination center (offsets k·0.5 for k ≥ 3 land beyond a 1.6u
 * segment). Capped packets share the last slot; `capped` surfaces the
 * pile-up via `layout_packet_slots_capped`. */
function packetSnapOffsets(
  graph: SceneGraph,
  chainedPackets: Map<string, string[]>,
): { offsets: Map<string, number>; capped: boolean } {
  const animOf = new Map<string, number>(); // packetId -> delayMs
  for (const anim of graph.animations) {
    if (
      (anim.operator === "translate" || anim.operator === "follow_path") &&
      chainedPackets.has(anim.target)
    ) {
      const existing = animOf.get(anim.target);
      if (existing === undefined || anim.delayMs < existing) {
        animOf.set(anim.target, anim.delayMs);
      }
    }
  }
  const bySource = new Map<string, string[]>();
  for (const [packetId, chain] of chainedPackets) {
    const source = chain[0];
    const list = bySource.get(source) ?? [];
    list.push(packetId);
    bySource.set(source, list);
  }
  const out = new Map<string, number>();
  let capped = false;
  for (const packets of bySource.values()) {
    const ordered = [...packets].sort((a, b) => {
      const da = animOf.get(a) ?? 0;
      const db = animOf.get(b) ?? 0;
      if (da !== db) return da - db;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    ordered.forEach((p, k) => {
      if (k >= MAX_CO_SLOTTED_PACKETS) capped = true;
      out.set(p, Math.min(k, MAX_CO_SLOTTED_PACKETS - 1));
    });
  }
  return { offsets: out, capped };
}

interface VerificationShape {
  env: Envelope;
  /** Unit root id for same-unit skip (rigid members keep their offsets). */
  unitRoot?: string;
}

/**
 * Unit roots that can be translated INDIVIDUALLY: node-rooted units (the root
 * is a movable node, not a group). Group roots are excluded — translating a
 * group root moves every member rigidly and can never change the length of an
 * edge between two of its members. Chained packets are excluded too (their
 * position is decided by the Phase D snap).
 */
function directlyMovableRoots(units: Unit[]): Set<string> {
  const out = new Set<string>();
  for (const u of units) {
    if (!u.rootIsGroup) out.add(u.rootId);
  }
  return out;
}

/**
 * Post-repair minimum edge length (MUST-FIX 5, red-team W6/W7): repulsion
 * separates envelopes but never guarantees L >= r_s + r_t + headLen, so
 * repaired tight pairs render the arrowhead INSIDE the source. After every
 * other position stage, drawn graph edges shorter than that are lengthened
 * ALONG THEIR AXIS — each endpoint that is a directly movable unit root is
 * translated outward by its share of the deficit, only when the move does
 * not create a new I1 overlap (checked against every other envelope at the
 * current positions). Bounded passes (8) cover chains whose shared endpoints
 * shorten a neighbor while lengthening (the deficit sum halves per pass).
 * Edges that cannot comply are left short — the renderer's degrade stage
 * suppresses their arrowhead and emits `edge_head_suppressed_short_edge`;
 * the geometry gate reports the residual I4 honestly.
 */
function lengthenShortEdges(
  graph: SceneGraph,
  byId: Map<string, SceneGraphNode>,
  parentOf: Map<string, string>,
  movableRoots: Set<string>,
  chainedPackets: Set<string>,
): void {
  const EDGE_EPS = 1e-6;
  const edges: Array<{ id: string; from: string; to: string }> = [];
  for (const rel of graph.relationships) {
    const from = byId.get(rel.from);
    const to = byId.get(rel.to);
    if (!from || !to) continue;
    if (
      !(GRAPH_NODE_KINDS_LOCAL.has(from.kind) && GRAPH_NODE_KINDS_LOCAL.has(to.kind))
    ) {
      continue; // only arrowhead-bearing (graph) edges are I4 subjects
    }
    edges.push({ id: rel.id, from: rel.from, to: rel.to });
  }
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const e of edges) {
      const fromNode = byId.get(e.from);
      const toNode = byId.get(e.to);
      if (!fromNode || !toNode) continue;
      const pa = worldPositionOf(e.from, byId, parentOf);
      const pb = worldPositionOf(e.to, byId, parentOf);
      const L = dist(pa, pb);
      if (L < 1e-9) continue; // degenerate self-loop — nothing to lengthen
      const rS = fromNode.size * 0.5;
      const rT = toNode.size * 0.5;
      const required = rS + rT + arrowHead(rT).len;
      const deficit = required - L;
      if (deficit <= EDGE_EPS) continue;
      const u = norm(sub(pb, pa));
      const canA = movableRoots.has(e.from) && !chainedPackets.has(e.from);
      const canB = movableRoots.has(e.to) && !chainedPackets.has(e.to);
      if (!canA && !canB) continue; // both fixed/bound → degrade (suppress head)
      const shareA = canA && canB ? 0.5 : canA ? 1 : 0;
      const shareB = canA && canB ? 0.5 : canB ? 1 : 0;
      const deltaA = mul(u, -deficit * shareA);
      const deltaB = mul(u, deficit * shareB);
      const okA =
        shareA === 0 || !lengthenMoveCreatesOverlap(e.from, deltaA, byId, parentOf);
      const okB =
        shareB === 0 || !lengthenMoveCreatesOverlap(e.to, deltaB, byId, parentOf);
      if (!okA || !okB) continue; // would create new I1 → leave short (degrade)
      if (shareA > 0) byId.get(e.from)!.position = add(byId.get(e.from)!.position, deltaA);
      if (shareB > 0) byId.get(e.to)!.position = add(byId.get(e.to)!.position, deltaB);
      changed = true;
    }
    if (!changed) return;
  }
}

/** True when translating `nodeId` by `delta` would create a new I1 overlap
 * with any other node envelope (same-unit members excluded — rigid offsets
 * are preserved by construction). Chained packets count as shapes (their
 * snap position is final), so a lengthen never re-crashes a packet. */
function lengthenMoveCreatesOverlap(
  nodeId: string,
  delta: Vec3,
  byId: Map<string, SceneGraphNode>,
  parentOf: Map<string, string>,
): boolean {
  const node = byId.get(nodeId);
  if (!node) return false;
  const newWorld = add(worldPositionOf(nodeId, byId, parentOf), delta);
  const newEnv = nodeEnvelope({ ...node, position: newWorld });
  for (const other of byId.values()) {
    if (other.id === nodeId) continue;
    if (envelopeOverlap(newEnv, worldEnvelopeOf(other.id, byId, parentOf), OVERLAP_MARGIN)) {
      return true;
    }
  }
  return false;
}

/** All envelope shapes for the I1 verification: unit members (world), chained
 * packets (post-snap) and obstacles. */
function collectVerificationShapes(
  units: Unit[],
  obstacles: Obstacle[],
  chainedPackets: Map<string, string[]>,
  byId: Map<string, SceneGraphNode>,
  parentOf: Map<string, string>,
): VerificationShape[] {
  const out: VerificationShape[] = [];
  for (const u of units) {
    for (const m of u.members) {
      out.push({ env: worldEnvelopeOf(m, byId, parentOf), unitRoot: u.rootId });
    }
  }
  for (const packetId of chainedPackets.keys()) {
    const node = byId.get(packetId);
    if (!node) continue;
    out.push({ env: nodeEnvelope(node) }); // packets are roots (declared = world)
  }
  for (const ob of obstacles) out.push({ env: ob.env });
  return out;
}

/** Number of residual I1 overlaps (skip same-unit pairs — rigid members
 * preserve their relative offsets by construction). */
function countResiduals(shapes: VerificationShape[]): number {
  let count = 0;
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      if (a.unitRoot !== undefined && a.unitRoot === b.unitRoot) continue;
      if (envelopeOverlap(a.env, b.env, OVERLAP_MARGIN)) count++;
    }
  }
  return count;
}

/** Deterministic post-layout bounds for a graph (world positions + the edge
 * label rects of drawn edges). */
export function computeBoundsFor(
  graph: SceneGraph,
  byId: Map<string, SceneGraphNode>,
  parentOf: Map<string, string>,
): SceneBounds {
  const nodes = graph.nodes.map((n) => ({
    ...n,
    position: worldPositionOf(n.id, byId, parentOf),
  }));
  const edges: Array<{ from: Vec3; to: Vec3 }> = [];
  for (const rel of graph.relationships) {
    const from = byId.get(rel.from);
    const to = byId.get(rel.to);
    if (!from || !to) continue;
    const graphEdge =
      GRAPH_NODE_KINDS_LOCAL.has(from.kind) && GRAPH_NODE_KINDS_LOCAL.has(to.kind);
    const legacyEdge = DRAWN_EDGE_TYPES.has(rel.type);
    if (graphEdge || legacyEdge) {
      edges.push({
        from: worldPositionOf(from.id, byId, parentOf),
        to: worldPositionOf(to.id, byId, parentOf),
      });
    }
  }
  return computeSceneBounds(nodes, edges);
}

/** Identity layout (bounds only) for non-eligible / non-graph scenes. */
export function identityLayout(graph: SceneGraph): SceneLayout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = buildParentOf(graph);
  return {
    repaired: false,
    bounds: computeBoundsFor(graph, byId, parentOf),
    moved: [],
    labelShortened: [],
    suppressedEdgeLabels: [],
    units: [],
  };
}
