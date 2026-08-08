/**
 * types.ts — SceneGraph and renderer option types for the primitive-3d
 * namespace. Pure types only: no Three.js, no DOM, no WebGL. The scene graph
 * is the bridge between the DemoSpecV1 contract and the Three.js renderer,
 * and is also what the shell's accessible representation consumes.
 */

import type {
  AnimationOperator,
  PrimitiveKind,
  RelationshipOperator,
  Vec3,
} from "@/demonstrations/spec/demo-spec";

/**
 * FIX 3 semantic identity (root cause §4/§5): learner-facing metadata carried
 * from the spec's SceneSemanticSpec (mirror; normalized by buildSceneGraph —
 * the top-level spec shorthands `role`/`description` are merged in here).
 * All fields optional; absent semantic means presentation layers fall back to
 * auto-derived identity (id/label/kind/relationships).
 */
export interface SceneSemantic {
  /** Canonical display name (e.g. "Star"), capped at 24 chars upstream. */
  name?: string;
  /** Object category, e.g. "star" | "planet" | "orbit guide". */
  type?: string;
  /** One-sentence learner-facing description of what the object is. */
  shortDescription?: string;
  /** Short role label, e.g. "central body" | "orbiter" | "satellite". */
  role?: string;
  /** Whether the learner can directly interact with this object. */
  interactive?: boolean;
  /** One-sentence summary of how this object relates to the scene. */
  relationshipSummary?: string;
}

/**
 * A validated scene node. `children` holds ids of child group nodes; a node
 * that is nobody's child is a root. `depth` is 1 for roots and counts group
 * nesting levels (capped by SPEC_LIMITS.maxGroupDepth — over-deep nodes are
 * flattened by buildSceneGraph).
 */
export interface SceneGraphNode {
  id: string;
  kind: PrimitiveKind;
  label?: string;
  position: Vec3;
  size: number;
  color: string;
  children: string[];
  /** Trail only meaningful for moving objects; clamped to maxTrailPoints. */
  trailPoints: number;
  /** particle_field only; clamped to the active particle budget. */
  particleCount: number;
  depth: number;
  /**
   * Visibility contract (additive — Wave-2 semantic work, root-cause seam 4):
   * a hidden object renders nothing. Its label is suppressed at placement (no
   * orphan label) and its envelope never blocks another label's anchors.
   */
  hidden?: boolean;
  /** FIX 3 semantic identity (additive; see SceneSemantic above). */
  semantic?: SceneSemantic;
}

/** A relationship whose from/to refs both resolved to kept nodes. */
export interface SceneGraphRelationship {
  id: string;
  type: RelationshipOperator;
  from: string;
  to: string;
  label?: string;
}

/**
 * A validated animation operator targeting a kept node. Numeric parameters
 * are already clamped (speed <= 5, amplitude <= 2, delayMs <= 10000) and
 * derived fields (path, orbitCenter/orbitRadius) are resolved here so the
 * renderer never needs to reinterpret the spec.
 */
export interface SceneGraphAnimation {
  id: string;
  target: string;
  operator: AnimationOperator;
  speed: number;
  delayMs: number;
  axis?: "x" | "y" | "z";
  amplitude: number;
  /** follow_path waypoints (derived from flows_to/transfers_to chains). */
  path?: Vec3[];
  /** orbit operator: center and radius (derived from `orbits` relationships). */
  orbitCenter?: Vec3;
  orbitRadius?: number;
  /**
   * translate waypoints (design-1 §3.1): surface-to-surface slide path for a
   * packet traveling a flow chain — [srcExit, midEntry, midExit, ..., destEntry].
   * The packet walks the polyline monotonically and HOLDS at the destination
   * surface (never flies past it / out of frame). Absent for translate
   * animations without a derivable chain (legacy unbounded semantics).
   */
  slidePath?: Vec3[];
}

/** The effective limits applied while building this graph. */
export interface SceneGraphLimits {
  maxObjects: number;
  /** Particle budget after the mobile cap is applied. */
  particleLimit: number;
  maxTrailPoints: number;
  maxLabels: number;
  maxRelationships: number;
  maxGroupDepth: number;
}

export interface SceneGraph {
  nodes: SceneGraphNode[];
  relationships: SceneGraphRelationship[];
  animations: SceneGraphAnimation[];
  background: "dark" | "light";
  limits: SceneGraphLimits;
  /**
   * Resolved layout (design-1 §2/§3.2): deterministic post-layout bounds for
   * camera framing and the animation clamp, plus the repair record. Present
   * on every graph (identity + bounds when no repair ran).
   */
  layout?: SceneLayout;
}

// ---------------------------------------------------------------------------
// Resolved layout (design-1 §2.1 — additive; types are pure)
// ---------------------------------------------------------------------------

/** Content AABB (envelopes + label rects + margin) for framing + clamping. */
export interface SceneBounds {
  min: Vec3;
  max: Vec3;
  /** (min+max)/2. */
  center: Vec3;
  /** Bounding-sphere radius about center. */
  radius: number;
}

/** One rigid layout unit: a movable node or a group root with movable
 * descendants. Members are the envelope subjects; a group unit's members
 * never move relative to the root (containment preserved by construction). */
export interface LayoutUnit {
  /** Node id to translate (a movable node or a group root). */
  rootId: string;
  /** Movable nodes in the subtree (envelope subjects). */
  memberIds: string[];
  rootIsGroup: boolean;
}

/** The deterministic post-layout record (design-1 §2.1). */
export interface SceneLayout {
  /** True iff any position changed (including packet snap). */
  repaired: boolean;
  /** Deterministic post-layout bounds (stages 5–6 + animation clamp). */
  bounds: SceneBounds;
  /** Nodes whose positions changed: [from, to] in graph coordinates. */
  moved: Array<{ id: string; from: Vec3; to: Vec3 }>;
  /** Node ids whose label text was truncated (degrade stage). */
  labelShortened: string[];
  /** Relationship ids whose edge-label sprite is suppressed (degrade stage). */
  suppressedEdgeLabels: string[];
  /** Units, for B2 (label placement / gate) transparency. */
  units: LayoutUnit[];
}

/** Renderer-level error surface. Reasons are safe codes, never content. */
export interface RendererError {
  reason: string;
  message?: string;
}

export interface PrimitiveSceneRendererOptions {
  /** Respect prefers-reduced-motion: no camera movement, stepped operators. */
  reducedMotion?: boolean;
  /** Mobile device: DPR capped at 1.5 and particle budget at 500. */
  mobile?: boolean;
  /** Called when the renderer cannot proceed (e.g. WebGL unavailable). */
  onError?: (error: RendererError) => void;
  /** Optional smoothed frames-per-second callback (~2x per second). */
  onFps?: (fps: number) => void;
  /**
   * Interaction event surface (graph-like scenes only). The React stage
   * adapter (demonstration-stage.tsx) forwards these to the page, and the
   * lesson rail (A2) consumes them to gate interact/observe steps.
   *
   * - `onNodeSelect(nodeId | null)`: a node was selected (pointer click or
   *   Enter/Space on the focused node) or the selection was cleared.
   * - `onEdgeSelect(edgeId | null)`: an edge was selected (pointer click) or
   *   the selection was cleared.
   * - `onNodeManipulate(nodeId)`: a node was actually interacted with
   *   (pointer click or keyboard activation) — fires alongside onNodeSelect;
   *   completion conditions for lesson interact steps key off this.
   *
   * Callbacks fire only on selection-state changes, never per frame. Hover
   * dimming is visual only and does not fire callbacks.
   */
  onNodeSelect?: (nodeId: string | null) => void;
  onEdgeSelect?: (edgeId: string | null) => void;
  onNodeManipulate?: (nodeId: string) => void;
  /**
   * Hover identity surface (ALL scenes, including non-graph hybrid/engine
   * scenes — orbit-learning root cause §5 "non-graph hover callbacks").
   *
   * - `onHoverIdentity(nodeId | null)`: the object under the pointer, as a
   *   semantic NODE id (never a mesh), or null when the pointer is over
   *   empty space / has left the stage / nothing is pinned. Emitted only on
   *   identity CHANGES, never per frame.
   *
   * For graph-like scenes this mirrors hover (visual-only; selection state
   * is unchanged). For NON-GRAPH scenes (engine-coupled hybrids) it is the
   * only interaction surface: a click/tap on an object PINNS its identity
   * (persists independent of hover, FIX 14) and an empty-space click clears
   * the pin — but selection/manipulation callbacks are never fired for
   * non-graph scenes (frozen contract: non-graph scenes ignore pointer
   * picks for SELECTION).
   */
  onHoverIdentity?: (nodeId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Canonical-state coupling (hybrid showcases)
// ---------------------------------------------------------------------------
//
// Maps a scene object id to the engine body key that owns its position, plus
// the scale/offset converting engine coordinates to world coordinates:
//   worldX = (offsetX ?? 0) + x * scale
//   worldZ = (offsetY ?? 0) + y * scale
//   worldY = the object's base (graph) y — engine state is planar.
// The `body` key references EngineVisualState.bodies. For vector_field and
// wave_surface objects the entry's scale/offsets are used to map the object's
// world position back into the engine grid; `body` then carries the sentinel
// "@field" / "@surface" (the renderer dispatches on the object's kind).
// The mapping is the single source of truth curated in
// src/demonstrations/showcases/coupling.ts.

export interface EngineMappingEntry {
  /** Engine body key (or "@field" / "@surface" sentinel for grid objects). */
  body: string;
  /** Engine units -> world units. */
  scale: number;
  /** World x offset applied before scaling. */
  offsetX?: number;
  /** World z offset applied before scaling (engine y -> world z). */
  offsetY?: number;
}

export type EngineMapping = Record<string, EngineMappingEntry>;

export type RendererStatus =
  | "ready"
  | "webgl_unavailable"
  | "context_lost"
  | "disposed";
