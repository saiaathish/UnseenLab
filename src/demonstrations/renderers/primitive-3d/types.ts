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
}

export type RendererStatus =
  | "ready"
  | "webgl_unavailable"
  | "context_lost"
  | "disposed";
