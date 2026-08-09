/**
 * scene-graph.ts — PURE spec -> validated scene graph conversion for the
 * primitive-3d namespace. Never touches Three.js, the DOM or WebGL: fully
 * unit-testable.
 *
 * Responsibilities (defence in depth on top of the upstream sanitizer):
 *  - apply SPEC_LIMITS: objects<=80, labels<=25, relationships<=100,
 *    group depth<=4, trailPoints<=300, particleCount<=1500 desktop / 500 mobile
 *  - clamp colors to a safe allowlist (hex or basic named colors); anything
 *    else (e.g. "url(...)", "var(--x)") is rejected and the default applied
 *  - reject unknown primitive kinds (node dropped)
 *  - resolve relationship from/to refs (missing ref -> reason, relation dropped)
 *  - validate animation target refs and clamp operator parameters
 *  - derive orbit centers/radii and follow_path waypoints
 *
 * All reasons are safe codes; offending content is never echoed.
 */

import {
  PRIMITIVE_KINDS,
  RELATIONSHIP_OPERATORS,
  SPEC_LIMITS,
} from "@/demonstrations/spec/demo-spec";
import type {
  AnimationSpec,
  DemoSpecV1,
  PrimitiveKind,
  PrimitiveObjectSpec,
  RelationshipOperator,
  RelationshipSpec,
  Vec3,
} from "@/demonstrations/spec/demo-spec";
import {
  REASON_UPDATE_VECTOR_IDENTITY,
  resolveUpdateVectorAxis,
  validateOperatorParams,
} from "./operators";
import {
  SCENE_POSITION_BOUND,
  SCENE_SIZE_MAX,
  SCENE_SIZE_MIN,
  computeSceneBounds,
} from "./geometry/envelopes";
import { hashString } from "./geometry/rng";
import { resolveLayout, derivePacketSlidePath } from "./layout/resolve-layout";
import type {
  SceneGraph,
  SceneGraphAnimation,
  SceneGraphLimits,
  SceneGraphNode,
  SceneGraphRelationship,
  SceneLayout,
  SceneSemantic,
} from "./types";

export interface BuildSceneGraphOptions {
  /** Mobile: particle budget drops from 1500 to 500. */
  mobile?: boolean;
}

/**
 * Renderer default color, applied when a color is missing or rejected.
 */
export const DEFAULT_COLOR = "#5b8def";

// ---------------------------------------------------------------------------
// Canonical graph derivation (semantic mirror)
// ---------------------------------------------------------------------------
//
// A "graph-like" scene is one whose objects are node-style primitives
// (process_node / sphere) connected by typed relationships. For those scenes
// the 3D stage renders edges DERIVED from scene3d.relationships — arrowhead
// at the destination, `—|` bar for inhibits — so the 3D surface is an
// alternate projection of the same canonical graph the 2D diagram resolves.
// Hybrid showcase scenes (orbits/charges/waves) carry an engineMapping and
// keep their dedicated orbital/field/wave rendering; their relationships are
// motion couplings, never graph edges. Containment relationships
// (group → child) are structural, not graph edges.

/** Primitive kinds that act as graph nodes (edge anchors). */
export const GRAPH_NODE_KINDS: ReadonlySet<PrimitiveKind> = new Set([
  "process_node",
  "sphere",
]);

/** A derived edge: from/to resolved node positions, ready to render. */
export interface GraphEdgePlan {
  id: string;
  type: RelationshipOperator;
  /** Relationship label or type — shown mid-edge. */
  label: string;
  fromId: string;
  toId: string;
  from: Vec3;
  to: Vec3;
  /** inhibits edges end in a bar (`—|`) instead of an arrowhead. */
  inhibits: boolean;
}

/**
 * True when the scene is a canonical graph (node-style objects connected by
 * typed relationships). Containment/structural scenes (groups, particle
 * fields, boxes) and engine-coupled showcases are not graphs.
 */
export function isGraphLikeScene(graph: SceneGraph): boolean {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.relationships.some((r) => {
    const from = byId.get(r.from);
    const to = byId.get(r.to);
    return (
      from !== undefined &&
      to !== undefined &&
      GRAPH_NODE_KINDS.has(from.kind) &&
      GRAPH_NODE_KINDS.has(to.kind)
    );
  });
}

/**
 * Derive the edges the renderer draws for a graph-like scene — one plan per
 * relationship whose endpoints are node-style objects. Non-graph scenes yield
 * no plans (their objects keep their dedicated rendering).
 */
export function deriveGraphEdges(graph: SceneGraph): GraphEdgePlan[] {
  if (!isGraphLikeScene(graph)) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const plans: GraphEdgePlan[] = [];
  for (const rel of graph.relationships) {
    const from = byId.get(rel.from);
    const to = byId.get(rel.to);
    if (!from || !to) continue;
    if (!GRAPH_NODE_KINDS.has(from.kind) || !GRAPH_NODE_KINDS.has(to.kind)) {
      continue;
    }
    plans.push({
      id: rel.id,
      type: rel.type,
      label: rel.label ?? rel.type,
      fromId: rel.from,
      toId: rel.to,
      from: from.position,
      to: to.position,
      inhibits: rel.type === "inhibits",
    });
  }
  return plans;
}

/**
 * Breadth-first downstream order from a node over outgoing relationship
 * edges (includes the start node). Drives the node-selection cascade
 * (click Cause A → B responds → C responds → …).
 */
export function cascadeOrder(
  relationships: SceneGraphRelationship[],
  startId: string
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [startId];
  seen.add(startId);
  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi];
    order.push(current);
    for (const rel of relationships) {
      if (rel.from !== current || seen.has(rel.to)) continue;
      seen.add(rel.to);
      queue.push(rel.to);
    }
  }
  return order;
}

/** The causal path of an edge: its endpoints plus downstream nodes/edges. */
export interface EdgeCausalPath {
  nodes: string[];
  edges: string[];
}

/**
 * The causal path of one edge: the nodes it connects and — for chain graphs —
 * every node/edge downstream of its destination. Everything outside this path
 * dims when the edge is selected or hovered.
 */
export function edgeCausalPath(
  relationships: SceneGraphRelationship[],
  edgeId: string
): EdgeCausalPath | null {
  const rel = relationships.find((r) => r.id === edgeId);
  if (!rel) return null;
  const nodes = [rel.from, rel.to];
  const edges = [rel.id];
  const seen = new Set<string>([rel.from, rel.to]);
  const queue: string[] = [rel.to];
  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi];
    for (const r of relationships) {
      if (r.from !== current || seen.has(r.to)) continue;
      seen.add(r.to);
      queue.push(r.to);
      nodes.push(r.to);
      edges.push(r.id);
    }
  }
  return { nodes, edges };
}

const COLOR_HEX =
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Basic safe named colors (opaque only; no url(), var(), gradients...). */
const NAMED_COLORS = new Set([
  "white", "black", "red", "green", "blue", "yellow", "cyan", "magenta",
  "orange", "purple", "pink", "brown", "gray", "grey", "silver", "gold",
  "teal", "navy", "olive", "lime", "maroon", "coral", "indigo", "violet",
  "turquoise", "aqua", "fuchsia", "tan", "khaki", "plum", "orchid",
]);

export function isSafeColor(value: string): boolean {
  const trimmed = value.trim();
  return COLOR_HEX.test(trimmed) || NAMED_COLORS.has(trimmed.toLowerCase());
}

// Position/size bounds are the shared geometry constants (single source of
// truth, design-1 §6): the sanitizer clamps to the same targets.
const POSITION_BOUND = SCENE_POSITION_BOUND;
const SIZE_MIN = SCENE_SIZE_MIN;
const SIZE_MAX = SCENE_SIZE_MAX;

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function finOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function vec3OrDefault(
  position: Vec3 | undefined,
  reasons: string[]
): Vec3 {
  if (!position) return { x: 0, y: 0, z: 0 };
  let clamped = false;
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  for (const key of ["x", "y", "z"] as const) {
    const v = finOr(position[key], 0);
    const c = clampNum(v, -POSITION_BOUND, POSITION_BOUND);
    if (c !== v) clamped = true;
    out[key] = c;
  }
  if (clamped) reasons.push("position_clamped");
  return out;
}

/**
 * FIX 3 additive semantic carry (root cause §4/§5): copies the spec's
 * semantic block into the graph node, merging the top-level `role` /
 * `description` shorthands as fallbacks for `semantic.role` /
 * `semantic.shortDescription` (the block wins). Absent everywhere ->
 * undefined (presentation layers then auto-derive identity, byte-identical
 * to pre-FIX-3 behavior). Purely additive: no other node field is touched.
 */
function carrySemantic(obj: PrimitiveObjectSpec): SceneSemantic | undefined {
  const block = obj.semantic;
  const hasShorthand = obj.role !== undefined || obj.description !== undefined;
  if (block === undefined && !hasShorthand) return undefined;
  const role = block?.role ?? obj.role;
  const shortDescription = block?.shortDescription ?? obj.description;
  return {
    ...(block ?? {}),
    ...(role !== undefined ? { role } : {}),
    ...(shortDescription !== undefined ? { shortDescription } : {}),
  };
}

function emptySceneGraph(spec: DemoSpecV1): SceneGraph {
  return {
    nodes: [],
    relationships: [],
    animations: [],
    background: spec.renderer?.background ?? "dark",
    limits: computeLimits(spec, false),
  };
}

function computeLimits(spec: DemoSpecV1, mobile: boolean): SceneGraphLimits {
  const declared = spec.limits ?? {
    maxObjects: SPEC_LIMITS.maxObjects,
    maxParticles: SPEC_LIMITS.maxParticlesDesktop,
    maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
    maxControls: SPEC_LIMITS.maxControls,
  };
  return {
    maxObjects: Math.min(
      SPEC_LIMITS.maxObjects,
      Math.max(0, declared.maxObjects)
    ),
    particleLimit: Math.min(
      mobile ? SPEC_LIMITS.maxParticlesMobile : SPEC_LIMITS.maxParticlesDesktop,
      Math.max(0, declared.maxParticles)
    ),
    maxTrailPoints: SPEC_LIMITS.maxTrailPoints,
    maxLabels: SPEC_LIMITS.maxLabels,
    maxRelationships: SPEC_LIMITS.maxRelationships,
    maxGroupDepth: SPEC_LIMITS.maxGroupDepth,
  };
}

const POSITION_OF = (map: Map<string, SceneGraphNode>, id: string): Vec3 => {
  const node = map.get(id);
  return node ? node.position : { x: 0, y: 0, z: 0 };
};

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Derive follow_path waypoints by walking flows_to/transfers_to chains from
 * the target node, then closing the loop back to the start. Returns null when
 * no meaningful path exists (< 2 distinct points).
 */
function derivePath(
  targetId: string,
  relationships: SceneGraphRelationship[],
  byId: Map<string, SceneGraphNode>
): Vec3[] | null {
  const EDGE_TYPES = new Set<RelationshipOperator>([
    "flows_to",
    "transfers_to",
  ]);
  const path: Vec3[] = [POSITION_OF(byId, targetId)];
  const visited = new Set<string>([targetId]);
  let current = targetId;
  for (let i = 0; i < 32; i++) {
    const next = relationships.find(
      (r) => EDGE_TYPES.has(r.type) && r.from === current && !visited.has(r.to)
    );
    if (!next) break;
    visited.add(next.to);
    path.push(POSITION_OF(byId, next.to));
    current = next.to;
  }
  // Close the loop so the object returns to its start point.
  path.push(POSITION_OF(byId, targetId));
  // Drop consecutive duplicate points; need >= 2 distinct points.
  const distinct: Vec3[] = [];
  for (const p of path) {
    const last = distinct[distinct.length - 1];
    if (!last || distance(last, p) > 1e-6) distinct.push(p);
  }
  return distinct.length >= 2 ? distinct : null;
}

/**
 * Convert spec.scene3d into a validated, bounded SceneGraph.
 * Never throws: malformed input yields reasons and a safe partial graph.
 */
export function buildSceneGraph(
  spec: DemoSpecV1,
  options?: BuildSceneGraphOptions
): { graph: SceneGraph; reasons: string[] } {
  const reasons: string[] = [];
  const mobile = !!options?.mobile;
  const scene3d = spec.scene3d;
  if (!scene3d || !Array.isArray(scene3d.objects)) {
    return { graph: emptySceneGraph(spec), reasons: [...reasons, "no_scene3d"] };
  }

  const limits = computeLimits(spec, mobile);

  // -------------------------------------------------------------------------
  // 1. Objects: cap, kind check, color clamp, per-field clamps
  // -------------------------------------------------------------------------
  let objects = scene3d.objects;
  if (objects.length > limits.maxObjects) {
    reasons.push("objects_capped");
    objects = objects.slice(0, limits.maxObjects);
  }

  const nodes: SceneGraphNode[] = [];
  const byId = new Map<string, SceneGraphNode>();
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") {
      reasons.push("invalid_object");
      continue;
    }
    const kind = (obj as { kind?: unknown }).kind as string;
    if (
      typeof kind !== "string" ||
      !(PRIMITIVE_KINDS as readonly string[]).includes(kind)
    ) {
      reasons.push("unknown_primitive_kind");
      continue;
    }
    const id = typeof obj.id === "string" ? obj.id : String(obj.id);
    const unsafeColor =
      typeof obj.color === "string" && !isSafeColor(obj.color);
    const color = unsafeColor
      ? DEFAULT_COLOR
      : typeof obj.color === "string"
        ? obj.color.trim()
        : DEFAULT_COLOR;
    if (unsafeColor) reasons.push("color_rejected");

    let trailPoints = 0;
    if (typeof obj.trailPoints === "number") {
      const clamped = Math.round(
        clampNum(obj.trailPoints, 0, limits.maxTrailPoints)
      );
      if (clamped !== obj.trailPoints) reasons.push("trail_points_clamped");
      trailPoints = clamped;
    }

    let particleCount = 0;
    if (typeof obj.particleCount === "number") {
      const clamped = Math.round(clampNum(obj.particleCount, 0, limits.particleLimit));
      if (clamped !== obj.particleCount) reasons.push("particle_count_clamped");
      particleCount = clamped;
    }

    const size = clampNum(
      finOr((obj as PrimitiveObjectSpec).size, 1),
      SIZE_MIN,
      SIZE_MAX
    );
    if (
      typeof (obj as PrimitiveObjectSpec).size === "number" &&
      size !== (obj as PrimitiveObjectSpec).size
    )
      reasons.push("size_clamped");

    const node: SceneGraphNode = {
      id,
      kind: kind as SceneGraphNode["kind"],
      label: (obj as PrimitiveObjectSpec).label,
      position: vec3OrDefault((obj as PrimitiveObjectSpec).position, reasons),
      size,
      color,
      children: [],
      trailPoints,
      particleCount,
      depth: 1,
      semantic: carrySemantic(obj as PrimitiveObjectSpec),
    };
    nodes.push(node);
    byId.set(node.id, node);
  }

  // -------------------------------------------------------------------------
  // 2. Label budget (maxLabels)
  // -------------------------------------------------------------------------
  let labelCount = 0;
  for (const node of nodes) {
    if (node.label !== undefined) {
      if (labelCount >= limits.maxLabels) {
        reasons.push("label_cap_exceeded");
        node.label = undefined;
      } else {
        labelCount++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Groups: validate child refs, cap nesting depth (flatten over-deep)
  // -------------------------------------------------------------------------
  const groupDecls = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const obj of objects) {
    if (
      (obj as PrimitiveObjectSpec).kind === "group" &&
      Array.isArray((obj as PrimitiveObjectSpec).children)
    ) {
      const id = typeof obj.id === "string" ? obj.id : String(obj.id);
      const children = (obj as PrimitiveObjectSpec).children!.map(String);
      groupDecls.set(id, children);
      for (const c of children) parentOf.set(c, id);
    }
  }

  const depth = new Map<string, number>();
  const queue: Array<{ id: string; d: number }> = [];
  for (const n of nodes) if (!parentOf.has(n.id)) queue.push({ id: n.id, d: 1 });
  for (let qi = 0; qi < queue.length; qi++) {
    const { id, d } = queue[qi];
    if (depth.has(id)) continue;
    depth.set(id, d);
    for (const childId of groupDecls.get(id) ?? []) {
      queue.push({ id: childId, d: d + 1 });
    }
  }

  const flattened = new Set<string>();
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (d === undefined) {
      // Only reachable via a cycle: treat as a root, detach it.
      flattened.add(n.id);
      reasons.push("group_cycle_flattened");
    } else if (d > limits.maxGroupDepth) {
      flattened.add(n.id);
      reasons.push("group_depth_flattened");
    }
  }

  for (const n of nodes) {
    if (n.kind !== "group") continue;
    const declared = groupDecls.get(n.id) ?? [];
    for (const childId of declared) {
      if (!byId.has(childId)) {
        reasons.push("missing_child_ref");
        continue;
      }
      if (flattened.has(childId)) continue;
      n.children.push(childId);
    }
  }

  // Recompute depth over the flattened tree.
  const childSet = new Set<string>();
  for (const n of nodes) for (const c of n.children) childSet.add(c);
  const roots = nodes.filter((n) => !childSet.has(n.id)).map((n) => ({ id: n.id, d: 1 }));
  const depth2 = new Map<string, number>();
  const q2: Array<{ id: string; d: number }> = [...roots];
  for (let qi = 0; qi < q2.length; qi++) {
    const { id, d } = q2[qi];
    if (depth2.has(id)) continue;
    depth2.set(id, d);
    for (const childId of byId.get(id)?.children ?? []) {
      q2.push({ id: childId, d: d + 1 });
    }
  }
  for (const n of nodes) n.depth = depth2.get(n.id) ?? 1;

  // -------------------------------------------------------------------------
  // 4. Relationships: type check + ref resolution + cap
  // -------------------------------------------------------------------------
  const relationships: SceneGraphRelationship[] = [];
  for (const rel of scene3d.relationships ?? []) {
    if (relationships.length >= limits.maxRelationships) {
      reasons.push("relationships_capped");
      break;
    }
    if (!rel || typeof rel !== "object") {
      reasons.push("invalid_relationship");
      continue;
    }
    const r = rel as RelationshipSpec;
    if (!(RELATIONSHIP_OPERATORS as readonly string[]).includes(r.type)) {
      reasons.push("unknown_relationship_type");
      continue;
    }
    if (!byId.has(String(r.from)) || !byId.has(String(r.to))) {
      reasons.push("relationship_ref_missing");
      continue;
    }
    relationships.push({
      id: String(r.id),
      type: r.type,
      from: String(r.from),
      to: String(r.to),
      label: r.label,
    });
  }

  // -------------------------------------------------------------------------
  // 5. Animations: target refs + operator validation ONLY (no derived
  //    enrichment yet — layout must run first so orbit/follow_path/slidePath
  //    read FINAL positions, design-1 §2.3).
  // -------------------------------------------------------------------------
  const animations: SceneGraphAnimation[] = [];
  for (const anim of scene3d.animations ?? []) {
    if (!anim || typeof anim !== "object") {
      reasons.push("invalid_animation");
      continue;
    }
    const a = anim as AnimationSpec;
    if (!byId.has(String(a.target))) {
      reasons.push("animation_target_missing");
      continue;
    }
    const validation = validateOperatorParams({
      operator: a.operator,
      speed: a.speed,
      delayMs: a.delayMs,
      axis: a.axis,
      amplitude: a.amplitude,
    });
    if (!validation.ok) {
      reasons.push(...validation.reasons);
      continue;
    }
    reasons.push(...validation.reasons);

    let axis = validation.params.axis;
    if (a.operator === "update_vector") {
      // update_vector identity guard (design-1 §11.4 / audit-1 tpl-field-02):
      // the base vector of every conceptual node is the default (0,1,0); an
      // axis parallel to it (the default y) rotates nothing. Reroute to a
      // perpendicular axis and say so.
      const resolved = resolveUpdateVectorAxis(
        { x: 0, y: 1, z: 0 },
        axis ?? "y",
      );
      if (resolved.fallback) {
        axis = resolved.axis;
        reasons.push(REASON_UPDATE_VECTOR_IDENTITY);
      }
    }

    animations.push({
      id: String(a.id),
      target: String(a.target),
      operator: a.operator,
      speed: validation.params.speed,
      delayMs: validation.params.delayMs,
      axis,
      amplitude: validation.params.amplitude,
    });
  }

  const graph: SceneGraph = {
    nodes,
    relationships,
    animations,
    background: spec.renderer?.background ?? "dark",
    limits,
  };

  // -------------------------------------------------------------------------
  // 6. Layout pass (design-1 §2.2/§2.3): deterministic seeded repair for
  //    layout-eligible specs (primitive_3d conceptual non-simulation graph
  //    scenes — never physics showcases). Everything else gets an identity
  //    layout with deterministic bounds (stages 5–6 + animation clamp need
  //    them for every scene).
  // -------------------------------------------------------------------------
  if (isLayoutEligible(spec, graph)) {
    const seed = hashString(`${spec.id}|${spec.generationId}`);
    const laidOut = resolveLayout(graph, seed);
    // Write final positions/labels back into the shared node objects so the
    // derived enrichment below reads final state.
    for (const laidNode of laidOut.graph.nodes) {
      const node = byId.get(laidNode.id);
      if (!node) continue;
      node.position = laidNode.position;
      if (laidNode.label !== undefined) node.label = laidNode.label;
    }
    graph.layout = laidOut.layout;
    reasons.push(...laidOut.reasons);
  } else {
    graph.layout = identitySceneLayout(graph);
  }

  // -------------------------------------------------------------------------
  // 7. Derived enrichment (reads FINAL positions): orbit centers/radii,
  //    follow_path waypoints, translate slide paths (design-1 §2.3/§3.1).
  // -------------------------------------------------------------------------
  const dropAnimationIds = new Set<string>();
  for (const graphAnim of animations) {
    if (graphAnim.operator === "orbit") {
      const rel = relationships.find(
        (r) => r.type === "orbits" && r.from === graphAnim.target
      );
      const center = rel
        ? POSITION_OF(byId, rel.to)
        : { x: 0, y: 0, z: 0 };
      const radius = rel
        ? distance(POSITION_OF(byId, graphAnim.target), center)
        : distance(POSITION_OF(byId, graphAnim.target), { x: 0, y: 0, z: 0 });
      graphAnim.orbitCenter = center;
      graphAnim.orbitRadius = Math.max(0.001, radius);
    }

    if (graphAnim.operator === "follow_path") {
      const path = derivePath(graphAnim.target, relationships, byId);
      if (!path) {
        // No derivable chain: drop the animation (mirrors the pre-layout
        // behaviour — step 5 only validated; the drop happens here).
        reasons.push("follow_path_needs_path");
        dropAnimationIds.add(graphAnim.id);
        continue;
      }
      graphAnim.path = path;
    }

    if (graphAnim.operator === "translate") {
      const target = byId.get(graphAnim.target);
      if (target && target.kind === "energy_packet" && !parentOf.has(target.id)) {
        const slidePath = derivePacketSlidePath(graph, target.id);
        if (slidePath) graphAnim.slidePath = slidePath;
      }
    }
  }
  const keptAnimations =
    dropAnimationIds.size > 0
      ? animations.filter((a) => !dropAnimationIds.has(a.id))
      : animations;

  return { graph: { ...graph, animations: keptAnimations }, reasons: [...new Set(reasons)] };
}

/**
 * Layout eligibility (design-1 §1.2): primitive_3d + conceptual + not a
 * simulation + non-empty scene + graph-like. Engine-coupled showcases are
 * excluded by construction (`engineMapping` exists only for
 * verified_simulation specs), so physics-true showcase bodies never move.
 */
export function isLayoutEligible(spec: DemoSpecV1, graph: SceneGraph): boolean {
  return (
    spec.renderer?.kind === "primitive_3d" &&
    spec.trust?.level === "conceptual_demonstration" &&
    !spec.simulation &&
    (spec.scene3d?.objects.length ?? 0) > 0 &&
    isGraphLikeScene(graph)
  );
}

/** Identity layout (bounds only) for non-eligible / non-graph scenes. */
function identitySceneLayout(graph: SceneGraph): SceneLayout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  for (const n of graph.nodes) {
    for (const childId of n.children) parentOf.set(childId, n.id);
  }
  const worldOf = (id: string): Vec3 => {
    const chain: string[] = [];
    let current: string | undefined = id;
    while (current !== undefined) {
      chain.push(current);
      current = parentOf.get(current);
    }
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    for (const c of chain) {
      const node = byId.get(c);
      if (!node) continue;
      out.x += node.position.x;
      out.y += node.position.y;
      out.z += node.position.z;
    }
    return out;
  };
  const nodes = graph.nodes.map((n) => ({ ...n, position: worldOf(n.id) }));
  const edges: Array<{ from: Vec3; to: Vec3 }> = [];
  // Draws the same legacy-edge set as the renderer (flows_to/transfers_to +
  // transforms_into — MUST-FIX 2) plus derived graph edges.
  const EDGE_TYPES = new Set<RelationshipOperator>([
    "flows_to",
    "transfers_to",
    "transforms_into",
  ]);
  for (const rel of graph.relationships) {
    const from = byId.get(rel.from);
    const to = byId.get(rel.to);
    if (!from || !to) continue;
    if (
      (GRAPH_NODE_KINDS.has(from.kind) && GRAPH_NODE_KINDS.has(to.kind)) ||
      EDGE_TYPES.has(rel.type)
    ) {
      edges.push({ from: worldOf(rel.from), to: worldOf(rel.to) });
    }
  }
  return {
    repaired: false,
    bounds: computeSceneBounds(nodes, edges),
    moved: [],
    labelShortened: [],
    suppressedEdgeLabels: [],
    units: [],
  };
}
