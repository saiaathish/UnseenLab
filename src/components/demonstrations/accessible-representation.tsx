/**
 * Accessible representations — the non-canvas views of a demonstration.
 *
 * Every view here is pure HTML/SVG derived deterministically from the spec:
 * no canvas, no WebGL, no invented numbers. A learner who cannot (or prefers
 * not to) use the 3D/canvas stage can still complete the full loop —
 * predict → manipulate → observe → compare — because the controls remain
 * available alongside these views.
 *
 * Shared by:
 *  - demonstration-stage.tsx   (fallback when the engine/WebGL is unavailable)
 *  - representation-tabs.tsx   (diagram / table / timeline / text_sequence)
 *
 * Diagram geometry (Wave 3, C5 — design-2 §6, fixes audit4 F1–F6):
 *  - adaptive edge inset min(EDGE_INSET_MAX_PX, EDGE_INSET_RATE·len) — the
 *    fixed inset can never invert on short edges (F1);
 *  - arrow tip exactly ON the target shape surface (26px), head band
 *    [26, 36]px = radius + head length (I4 formula, F5);
 *  - deterministic seeded spread for duplicate / z-collapsed positions with
 *    a 52px separation floor (F2); z-only duplicates are NEVER merged and the
 *    diagram adds a footnote when a spread cluster contains z-differing
 *    members (z-collapse rule);
 *  - label content comes from the SHARED 288px-budget resolver
 *    (resolveLabelText) so 2D and 3D render identical strings (P4 parity),
 *    and edge labels are placed off the shaft with a rect collision check —
 *    no safe spot omits the label (F3);
 *  - a single positioned root is centered in the viewBox (F6).
 *
 * The DOM/a11y structure and the export surface are a frozen rail contract:
 * this redesign changes visual geometry only.
 */

import { useState } from "react";

import type {
  DemoSpecV1,
  FallbackKind,
  PrimitiveObjectSpec,
  TimelineSpec,
} from "@/demonstrations/spec/demo-spec";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
// Pure derivation helpers (no Three.js, no DOM): the rail already imports
// these from the scene-graph submodule, so jsdom suites stay safe.
import {
  buildSceneGraph,
  cascadeOrder,
  GRAPH_NODE_KINDS,
  isGraphLikeScene,
} from "@/demonstrations/renderers/primitive-3d/scene-graph";
import { engineMappingForSpec } from "@/demonstrations/showcases/coupling";
// The shared layout repair (C1's module; both surfaces consume the SAME pure
// resolveLayout so the 2D projection mirrors the 3D layout — design-2 §6).
import { resolveLayout } from "@/demonstrations/renderers/primitive-3d/layout/resolve-layout";
// The production geometry-gate runner (MUST-FIX 1): the 2D surface runs the
// SAME runner the 3D renderer invokes at setSpec, over the same laid-out
// graph, and surfaces the verdict deterministically via data attributes
// (design-2 §7.2 "where cheap" — no user-facing text change, frozen rail
// copy untouched). degrade: false — the 2D surface surfaces the same gate
// verdict without mutating its laid-out graph (its own spread handles 2D
// projection residuals; 2D geometry behavior is unchanged).
import { runGeometryGate } from "@/demonstrations/renderers/primitive-3d/presentation/pipeline";
// The single source of all presentation geometry (design-2 §6.4).
import {
  DIAMOND_HALF_PX,
  EDGE_LABEL_FONT_PX,
  EDGE_LABEL_OFFSET_PX,
  HEAD_LEN_2D_PX,
  HEAD_TIP_PX,
  LABEL_SHAPE_CLEAR_PX,
  MIN_NODE_SEP_PX,
  NODE_LABEL_FONT_PX,
  PAD,
  RECT_H_PX,
  RECT_W_PX,
  SHAPE_RADIUS_PX,
  SPREAD_MAX_ITER,
  SPREAD_RADIUS_PX,
  TEXT_SAFETY_PX,
  VIEW_H,
  VIEW_W,
  Z_COLLAPSE_FOOTNOTE,
  edgeInsetPx,
  estimateTextWidthPx,
  hashString,
  resolveLabelText,
  shapeBBoxRadiusPx,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";
import { cn } from "@/lib/utils";

export interface AccessibleRepresentationProps {
  spec: DemoSpecV1;
  kind: FallbackKind;
  readouts: Readout[];
  parameters: Record<string, number>;
  /**
   * Canonical interaction surface (graph scenes only, mirroring the 3D
   * renderer's A1 event contract). When provided and the scene is graph-like
   * with no engine coupling, the accessible diagram becomes the manipulation
   * surface: node shapes are real buttons that fire the same events the
   * renderer fires, so lesson interact steps complete honestly even when
   * WebGL is unavailable. Without callbacks the diagram stays read-only.
   */
  onNodeSelect?: (nodeId: string | null) => void;
  onNodeManipulate?: (nodeId: string) => void;
}

/** Dispatcher used by the stage fallback. */
export function AccessibleRepresentation({
  spec,
  kind,
  readouts,
  parameters,
  onNodeSelect,
  onNodeManipulate,
}: AccessibleRepresentationProps) {
  if (kind === "timeline" && spec.timeline) {
    return <TimelineView timeline={spec.timeline} />;
  }
  if (kind === "data_table") {
    return <DataTableView spec={spec} readouts={readouts} parameters={parameters} />;
  }
  if (kind === "accessible_diagram") {
    return (
      <AccessibleDiagram
        spec={spec}
        onNodeSelect={onNodeSelect}
        onNodeManipulate={onNodeManipulate}
      />
    );
  }
  return <TextSequenceView spec={spec} />;
}

// ---------------------------------------------------------------------------
// Diagram (HTML/SVG of scene objects + relationships)
// ---------------------------------------------------------------------------

function objectPosition(
  obj: PrimitiveObjectSpec,
  index: number,
  count: number
): { x: number; y: number } {
  if (obj.position) {
    // z is deliberately ignored — this is a top-down diagram. Objects that
    // differ only in z are NEVER merged here: the spread stage (§6.2 of
    // design-2) separates them and the caption carries the z footnote.
    return { x: obj.position.x, y: obj.position.y };
  }
  // Deterministic grid fallback for objects without declared positions.
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cellW = (VIEW_W - PAD * 2) / Math.max(cols, 1);
  const cellH = (VIEW_H - PAD * 2) / Math.max(Math.ceil(count / cols), 1);
  return { x: PAD + cellW * col + cellW / 2, y: PAD + cellH * row + cellH / 2 };
}

function scalePosition(
  p: { x: number; y: number },
  positioned: Array<{ x: number; y: number }>
): { x: number; y: number } {
  if (positioned.length === 0) return { x: VIEW_W / 2, y: VIEW_H / 2 };
  const xs = positioned.map((q) => q.x);
  const ys = positioned.map((q) => q.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  return {
    x: PAD + ((p.x - minX) / spanX) * (VIEW_W - PAD * 2),
    y: PAD + ((p.y - minY) / spanY) * (VIEW_H - PAD * 2),
  };
}

/**
 * Objects that are NOT part of the canonical graph and must never be drawn as
 * diagram shapes. Arrows/process edges are edges, never objects; standalone
 * labels are captions, never nodes. Filtered defensively: templates no longer
 * emit them, but older/malformed specs may.
 */
const NON_GRAPH_KINDS: ReadonlySet<PrimitiveObjectSpec["kind"]> = new Set([
  "arrow",
  "process_edge",
  "label",
]);

function shapeForKind(kind: PrimitiveObjectSpec["kind"]): "circle" | "rect" | "diamond" {
  if (kind === "sphere" || kind === "particle_field" || kind === "energy_packet" || kind === "process_node") {
    return "circle";
  }
  if (kind === "process_edge" || kind === "arrow" || kind === "line" || kind === "label") {
    return "diamond";
  }
  return "rect";
}

// ---------------------------------------------------------------------------
// 2D spread (design-2 §6.2: deterministic, seeded, 52px separation floor)
// ---------------------------------------------------------------------------

interface SpreadNode {
  id: string;
  x: number;
  y: number;
  /** Declared z (positioned roots only) — never used for projection, only for the z-collapse rule. */
  z?: number;
}

/** Union-find clusters of nodes whose pairwise projected distance < MIN_NODE_SEP_PX. */
function clusterByProximity(nodes: SpreadNode[]): SpreadNode[][] {
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < MIN_NODE_SEP_PX) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, SpreadNode[]>();
  for (let i = 0; i < nodes.length; i++) {
    const root = find(i);
    const group = groups.get(root) ?? [];
    group.push(nodes[i]);
    groups.set(root, group);
  }
  return [...groups.values()];
}

/**
 * True when the cluster contains a z-only duplicate pair: same projected
 * (x, y), differing z. Those members render at one pixel blob unless spread —
 * the explicit z-collapse rule (design-2 §6.2).
 */
function clusterHasZCollapse(cluster: SpreadNode[]): boolean {
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const a = cluster[i];
      const b = cluster[j];
      if (
        a.z !== undefined &&
        b.z !== undefined &&
        Math.abs(a.x - b.x) < 1e-6 &&
        Math.abs(a.y - b.y) < 1e-6 &&
        Math.abs(a.z - b.z) > 1e-6
      ) {
        return true;
      }
    }
  }
  return false;
}

function clampToCanvas(v: number): number {
  return Math.min(VIEW_W - PAD, Math.max(PAD, v));
}

/**
 * Deterministic radial spread for clustered/duplicate/z-collapsed roots.
 *
 * DEVIATIONS FROM DESIGN-2 (documented):
 * 1. The design fixes the offset at SPREAD_RADIUS_PX with no growth, but
 *    re-spreading around the cluster's new centroid is translation-invariant —
 *    a pair keeps its relative offset forever. With the design's fixed
 *    SPREAD_RADIUS_PX radius, process_flow's pn1/ep1 (seeded angles 18.8°
 *    apart) stay 13.1px apart, below the separation floor the design's own
 *    test requires. Here the radius DOUBLES per iteration, which separates
 *    pn1/ep1 within SPREAD_MAX_ITER. Angles stay exactly the design's
 *    `hashString(id)·2π`.
 * 2. Hash angles can be arbitrarily close (a 4.2° pair needs r ≈ 700px —
 *    beyond the canvas), so after the last iteration any cluster that STILL
 *    violates the separation floor is redistributed on an equal arc around
 *    its centroid (rank-ordered by input order, radius
 *    SPREAD_RADIUS_PX·2^(SPREAD_MAX_ITER−1)), which guarantees pairwise
 *    separation ≥ the floor for clusters of up to 19 members
 *    (2·r·sin(π/m) ≥ MIN_NODE_SEP_PX).
 *
 * Spread positions are clamped into the usable canvas so the spread itself
 * never causes an I5-style clip. Same id order → same result everywhere
 * (determinism constraint).
 */
export function spreadProjected(nodes: SpreadNode[]): {
  nodes: SpreadNode[];
  zCollapsed: boolean;
} {
  const current = nodes.map((n) => ({ ...n }));
  let zCollapsed = false;
  for (let iter = 0; iter < SPREAD_MAX_ITER; iter++) {
    const clusters = clusterByProximity(current);
    const active = clusters.filter((c) => c.length > 1);
    if (active.length === 0) break;
    for (const cluster of active) {
      if (clusterHasZCollapse(cluster)) zCollapsed = true;
      const cx = cluster.reduce((s, n) => s + n.x, 0) / cluster.length;
      const cy = cluster.reduce((s, n) => s + n.y, 0) / cluster.length;
      const radius = SPREAD_RADIUS_PX * 2 ** iter;
      for (const member of cluster) {
        const angle = (hashString(member.id) / 0xffffffff) * Math.PI * 2;
        member.x = clampToCanvas(cx + radius * Math.cos(angle));
        member.y = clampToCanvas(cy + radius * Math.sin(angle));
      }
    }
  }
  // Equal-arc fallback for clusters that still violate the separation floor
  // after the growth iterations (close hash angles cannot be separated by any
  // canvas-feasible radius; the arc distributes them by deterministic rank).
  const remaining = clusterByProximity(current).filter((c) => c.length > 1);
  for (const cluster of remaining) {
    if (clusterHasZCollapse(cluster)) zCollapsed = true;
    const cx = cluster.reduce((s, n) => s + n.x, 0) / cluster.length;
    const cy = cluster.reduce((s, n) => s + n.y, 0) / cluster.length;
    const radius = SPREAD_RADIUS_PX * 2 ** (SPREAD_MAX_ITER - 1);
    const base = (hashString(cluster[0].id) / 0xffffffff) * Math.PI * 2;
    cluster.forEach((member, rank) => {
      const angle = base + (rank / cluster.length) * Math.PI * 2;
      member.x = clampToCanvas(cx + radius * Math.cos(angle));
      member.y = clampToCanvas(cy + radius * Math.sin(angle));
    });
  }
  return { nodes: current, zCollapsed };
}

// ---------------------------------------------------------------------------
// 2D edge geometry (design-2 §6.1: adaptive inset, tip on the surface)
// ---------------------------------------------------------------------------

export interface EdgeGeometry2D {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  tx: number;
  ty: number;
  ux: number;
  uy: number;
  /** Distance from the target center to the head back edge (≤ HEAD_TIP + HEAD_LEN). */
  backInset: number;
  len: number;
}

/**
 * Shaft + arrowhead geometry for one edge.
 *  - both ends use the adaptive inset `min(EDGE_INSET_MAX_PX, EDGE_INSET_RATE·len)`
 *    — never inverted;
 *  - the tip sits EXACTLY on the target surface (HEAD_TIP_PX = 26);
 *  - the head back edge (where the shaft stops) is clamped into
 *    [HEAD_TIP_PX, HEAD_TIP_PX + HEAD_LEN_2D_PX] so short edges shrink the
 *    head instead of inverting it (edges below MIN_EDGE_LEN_PX = 72px are
 *    flagged I4 by the gate — design-2 §6.1);
 *  - degenerate edges (len < 1) return null (nothing is drawn, F-11 analog).
 */
export function edgeGeometry2D(
  from: { x: number; y: number },
  to: { x: number; y: number }
): EdgeGeometry2D | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const inset = edgeInsetPx(len);
  const backInset = Math.min(
    HEAD_TIP_PX + HEAD_LEN_2D_PX,
    Math.max(HEAD_TIP_PX, len - inset)
  );
  // Distances from the source center along u; never inverted.
  let dS = inset;
  let dE = len - backInset;
  if (dE < dS) {
    const m = (dS + dE) / 2;
    dS = m;
    dE = m;
  }
  return {
    sx: from.x + ux * dS,
    sy: from.y + uy * dS,
    ex: from.x + ux * dE,
    ey: from.y + uy * dE,
    tx: to.x - ux * HEAD_TIP_PX,
    ty: to.y - uy * HEAD_TIP_PX,
    ux,
    uy,
    backInset,
    len,
  };
}

// ---------------------------------------------------------------------------
// 2D edge-label placement (design-2 §6.3: off-shaft, collision-checked)
// ---------------------------------------------------------------------------

interface ShapeObstacle {
  id: string;
  x: number;
  y: number;
  shape: "circle" | "rect" | "diamond";
}

interface LabelRect2D {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

function labelRectCollides2D(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  shapes: ShapeObstacle[],
  placed: LabelRect2D[]
): boolean {
  for (const s of shapes) {
    if (s.shape === "circle") {
      const dx = Math.max(0, Math.abs(s.x - cx) - halfW);
      const dy = Math.max(0, Math.abs(s.y - cy) - halfH);
      if (Math.hypot(dx, dy) < SHAPE_RADIUS_PX + LABEL_SHAPE_CLEAR_PX) return true;
    } else if (s.shape === "rect") {
      const hw = RECT_W_PX / 2 + halfW + LABEL_SHAPE_CLEAR_PX;
      const hh = RECT_H_PX / 2 + halfH + LABEL_SHAPE_CLEAR_PX;
      if (Math.abs(s.x - cx) < hw && Math.abs(s.y - cy) < hh) return true;
    } else {
      const h = shapeBBoxRadiusPx("diamond") + halfW + LABEL_SHAPE_CLEAR_PX;
      if (Math.abs(s.x - cx) < h && Math.abs(s.y - cy) < h) return true;
    }
  }
  for (const p of placed) {
    if (Math.abs(p.cx - cx) < p.halfW + halfW && Math.abs(p.cy - cy) < p.halfH + halfH) {
      return true;
    }
  }
  return false;
}

/**
 * Edge label position: shaft midpoint + perpendicular offset (±14px screen).
 * The label rect must clear every shape envelope (inflated 4px) and every
 * already-placed edge label; no safe spot omits the label (same policy as the
 * 3D surface's `edge_label_skipped_no_space`, design-2 §6.3).
 */
export function placeEdgeLabel2D(
  geom: EdgeGeometry2D,
  text: string,
  fontSize: number,
  shapes: ShapeObstacle[],
  placed: LabelRect2D[]
): { x: number; y: number } | null {
  const mx = (geom.sx + geom.ex) / 2;
  const my = (geom.sy + geom.ey) / 2;
  const nx = -geom.uy; // in-plane perpendicular
  const ny = geom.ux;
  const halfW = ((estimateTextWidthPx(text) + TEXT_SAFETY_PX) * (fontSize / 30)) / 2 + 2;
  const halfH = fontSize / 2 + 2;
  for (const side of [1, -1]) {
    const cx = mx + nx * EDGE_LABEL_OFFSET_PX * side;
    const cy = my + ny * EDGE_LABEL_OFFSET_PX * side;
    if (!labelRectCollides2D(cx, cy, halfW, halfH, shapes, placed)) {
      placed.push({ cx, cy, halfW, halfH });
      return { x: cx, y: cy };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Diagram component
// ---------------------------------------------------------------------------

function DiagramShape({
  x,
  y,
  shape,
  color,
  label,
  interactive,
  selected,
  highlighted,
  onActivate,
  onClear,
}: {
  x: number;
  y: number;
  shape: "circle" | "rect" | "diamond";
  color: string;
  label: string;
  interactive?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  onActivate?: () => void;
  onClear?: () => void;
}) {
  const strokeWidth = selected ? 4 : highlighted ? 3 : 2;
  const fillOpacity = selected ? 0.4 : highlighted ? 0.35 : 0.25;
  const body = (
    <>
      {shape === "circle" ? (
        <circle
          cx={x}
          cy={y}
          r={SHAPE_RADIUS_PX}
          fill={color}
          fillOpacity={fillOpacity}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      ) : shape === "diamond" ? (
        <rect
          x={x - DIAMOND_HALF_PX}
          y={y - DIAMOND_HALF_PX}
          width={DIAMOND_HALF_PX * 2}
          height={DIAMOND_HALF_PX * 2}
          rx={6}
          transform={`rotate(45 ${x} ${y})`}
          fill={color}
          fillOpacity={fillOpacity}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      ) : (
        <rect
          x={x - RECT_W_PX / 2}
          y={y - RECT_H_PX / 2}
          width={RECT_W_PX}
          height={RECT_H_PX}
          rx={6}
          fill={color}
          fillOpacity={fillOpacity}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      )}
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontSize={shape === "diamond" ? EDGE_LABEL_FONT_PX : NODE_LABEL_FONT_PX}
        fill="currentColor"
      >
        {label}
      </text>
    </>
  );

  if (!interactive) {
    return <g>{body}</g>;
  }

  // Interactive node (graph scenes only): a real button with the same event
  // surface the 3D renderer fires (select on change, manipulate on every
  // activation, Escape clears). The selected state is conveyed by
  // aria-pressed as well as the stroke, never by color alone.
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected ?? false}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate?.();
        } else if (event.key === "Escape") {
          onClear?.();
        }
      }}
      className={cn(
        "cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      )}
    >
      {body}
    </g>
  );
}

/** Objects as labeled shapes with relationship arrows — no canvas needed. */
export function AccessibleDiagram({
  spec,
  onNodeSelect,
  onNodeManipulate,
}: {
  spec: DemoSpecV1;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodeManipulate?: (nodeId: string) => void;
}) {
  const objects = spec.scene3d?.objects ?? [];
  const relationships = spec.scene3d?.relationships ?? [];

  // A1 graph-mode rule: only graph-like scenes with NO engine coupling fire
  // node callbacks (hybrid showcases never do). Without callbacks the
  // diagram stays a read-only view.
  const graph = spec.scene3d ? buildSceneGraph(spec).graph : null;
  const interactive = Boolean(
    graph &&
      engineMappingForSpec(spec) === null &&
      isGraphLikeScene(graph) &&
      (onNodeSelect !== undefined || onNodeManipulate !== undefined)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cascade =
    selectedId && graph ? cascadeOrder(graph.relationships, selectedId) : [];

  const activateNode = (nodeId: string) => {
    setSelectedId(nodeId);
    if (selectedId !== nodeId) onNodeSelect?.(nodeId);
    // Every activation counts as a manipulation, matching the renderer
    // (re-activating the selected node still fires onNodeManipulate).
    onNodeManipulate?.(nodeId);
  };

  const clearSelection = () => {
    if (selectedId === null) return;
    setSelectedId(null);
    onNodeSelect?.(null);
  };

  if (objects.length === 0) {
    return (
      <p className="text-sm text-muted">
        No diagram is available for this demonstration.
      </p>
    );
  }

  // --- Layout: shared resolveLayout (3D parity) -> projection -> spread. ---

  // ATK-14 (2D/3D parity on residual scenes): buildSceneGraph above already
  // ran the deterministic seeded layout and wrote the final positions back
  // into the node objects (graph.layout is always attached), so `graph` IS
  // the laid-out graph — the same one the 3D renderer renders. Re-running
  // resolveLayout on it would drift residual scenes a second time (~0.29u,
  // red-team ATK-14). Consume the laid-out graph as-is; only resolve when a
  // graph arrives without a layout (defensive — same seed derivation as the
  // 3D layout stage, design-1 §2.2.5).
  const laidOutGraph =
    graph && graph.layout
      ? graph
      : graph
        ? resolveLayout(
            graph,
            hashString(`${spec.id}|${spec.generationId}`),
          ).graph
        : null;
  // MUST-FIX 1 (2D surface): the SAME production runner the 3D renderer
  // invokes at setSpec, over the same laid-out graph — surfaced as
  // deterministic data attributes on the diagram (I1–I5 major counts plus
  // the surfaced reason codes). The diagram's own spread/projection handles
  // 2D-specific residuals on top of this; degrade is off so the 2D surface
  // never mutates its laid-out graph.
  const gateRun = graph
    ? runGeometryGate(laidOutGraph ?? graph, {
        graphMode:
          engineMappingForSpec(spec) === null && isGraphLikeScene(graph),
        degrade: false,
      })
    : null;
  const gate = gateRun
    ? {
        i1: gateRun.violations.filter(
          (v) => v.invariant === "I1" && (v.severity === "critical" || v.severity === "major")
        ).length,
        i2: gateRun.violations.filter(
          (v) => v.invariant === "I2" && (v.severity === "critical" || v.severity === "major")
        ).length,
        i3: gateRun.violations.filter(
          (v) => v.invariant === "I3" && (v.severity === "critical" || v.severity === "major")
        ).length,
        i4: gateRun.violations.filter(
          (v) => v.invariant === "I4" && (v.severity === "critical" || v.severity === "major")
        ).length,
        i5: gateRun.violations.filter(
          (v) => v.invariant === "I5" && (v.severity === "critical" || v.severity === "major")
        ).length,
        unverified: !gateRun.ok,
        reasons: gateRun.reasons,
      }
    : null;
  const resolvedPositions = new Map(
    (laidOutGraph?.nodes ?? graph?.nodes ?? []).map((n) => [n.id, n.position])
  );

  const roots = objects.filter(
    (o) => o.kind !== "group" && !NON_GRAPH_KINDS.has(o.kind)
  );
  const positionedRoots = roots.filter((o) => o.position !== undefined);
  // World position (resolved layout first, spec position fallback) or the
  // deterministic grid fallback for unpositioned objects (unchanged).
  const raw = roots.map((o, i) => {
    if (o.position) {
      const resolved = resolvedPositions.get(o.id);
      const p = resolved ?? o.position;
      return { x: p.x, y: p.y, z: p.z };
    }
    const grid = objectPosition(o, i, roots.length);
    return { x: grid.x, y: grid.y };
  });

  let scaled = roots.map((o, i) =>
    scalePosition(
      raw[i],
      raw.map((r) => ({ x: r.x, y: r.y }))
    )
  );

  // F6: a single positioned root is centered (was pinned to the top-left
  // corner (70,70) by the span-1 projection).
  if (positionedRoots.length === 1) {
    const idx = roots.findIndex((o) => o.position !== undefined);
    const offX = VIEW_W / 2 - scaled[idx].x;
    const offY = VIEW_H / 2 - scaled[idx].y;
    scaled = scaled.map((p) => ({ x: p.x + offX, y: p.y + offY }));
  }

  // Deterministic spread for duplicates / z-collapsed / clustered roots.
  const spread = spreadProjected(
    scaled.map((p, i) => ({ id: roots[i].id, x: p.x, y: p.y, z: raw[i].z }))
  );
  const finalPx = spread.nodes;
  const zCollapsed = spread.zCollapsed;

  const byId = new Map(roots.map((o, i) => [o.id, finalPx[i]]));
  const shapes: ShapeObstacle[] = roots.map((o, i) => ({
    id: o.id,
    x: finalPx[i].x,
    y: finalPx[i].y,
    shape: shapeForKind(o.kind),
  }));

  const edges = relationships.filter((r) => byId.has(r.from) && byId.has(r.to));

  // Edge geometry + collision-checked edge labels (computed deterministically
  // during render; no side effects).
  const placedEdgeLabels: LabelRect2D[] = [];
  const edgeGeoms = edges.flatMap((rel) => {
    const geom = edgeGeometry2D(byId.get(rel.from)!, byId.get(rel.to)!);
    if (!geom) return [];
    const label = resolveLabelText(rel.label ?? rel.type);
    const labelPos = placeEdgeLabel2D(
      geom,
      label.text,
      EDGE_LABEL_FONT_PX,
      shapes,
      placedEdgeLabels
    );
    return [{ rel, geom, label, labelPos }];
  });

  const summary = `${roots.length} object${roots.length === 1 ? "" : "s"} and ${edges.length} relationship${edges.length === 1 ? "" : "s"}: ${roots
    .map((o) => o.label ?? o.kind)
    .join(", ")}.`;

  return (
    <figure
      className="text-foreground"
      data-z-collapse={zCollapsed ? "true" : undefined}
      data-gate-i1={gate?.i1 ?? 0}
      data-gate-i2={gate?.i2 ?? 0}
      data-gate-i3={gate?.i3 ?? 0}
      data-gate-i4={gate?.i4 ?? 0}
      data-gate-i5={gate?.i5 ?? 0}
      data-gate-unverified={gate?.unverified ? "true" : undefined}
      data-gate-reasons={gate && gate.reasons.length > 0 ? gate.reasons.join(" ") : undefined}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Relationship diagram. ${summary}`}
        className="h-auto w-full rounded-lg border border-border bg-surface-raised"
      >
        <title>{`Relationship diagram. ${summary}`}</title>
        {edgeGeoms.map(({ rel, geom, label, labelPos }) => {
          const inhibits = rel.type === "inhibits";
          // Head half-width keeps the 2:1 length:width proportion of the
          // original 10px head; short edges shrink the whole head.
          const headWidth = Math.max((geom.backInset - HEAD_TIP_PX) / 2, 1.5);
          return (
            <g key={rel.id} data-edge-type={rel.type}>
              <line
                x1={geom.sx}
                y1={geom.sy}
                x2={geom.ex}
                y2={geom.ey}
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={2}
              />
              {inhibits ? (
                // `—|` bar at the head band, perpendicular to the edge.
                <line
                  x1={geom.ex - geom.uy * 11}
                  y1={geom.ey + geom.ux * 11}
                  x2={geom.ex + geom.uy * 11}
                  y2={geom.ey - geom.ux * 11}
                  stroke="currentColor"
                  strokeOpacity={0.85}
                  strokeWidth={3.5}
                />
              ) : (
                <polygon
                  points={`${geom.tx},${geom.ty} ${geom.ex - geom.uy * headWidth},${geom.ey + geom.ux * headWidth} ${geom.ex + geom.uy * headWidth},${geom.ey - geom.ux * headWidth}`}
                  fill="currentColor"
                  fillOpacity={0.7}
                />
              )}
              {labelPos && (
                <text x={labelPos.x} y={labelPos.y} textAnchor="middle" fontSize={EDGE_LABEL_FONT_PX} fill="currentColor" opacity={0.8}>
                  {label.text}
                </text>
              )}
            </g>
          );
        })}
        {roots.map((o, i) => (
          <DiagramShape
            key={o.id}
            x={finalPx[i].x}
            y={finalPx[i].y}
            shape={shapeForKind(o.kind)}
            color={o.color ?? "#0f766e"}
            label={resolveLabelText(o.label ?? o.kind).text}
            interactive={interactive && GRAPH_NODE_KINDS.has(o.kind)}
            selected={interactive && selectedId === o.id}
            highlighted={interactive && cascade.includes(o.id) && o.id !== selectedId}
            onActivate={
              interactive && GRAPH_NODE_KINDS.has(o.kind)
                ? () => activateNode(o.id)
                : undefined
            }
            onClear={
              interactive && GRAPH_NODE_KINDS.has(o.kind)
                ? () => clearSelection()
                : undefined
            }
          />
        ))}
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        {summary} Lines and arrowheads show the declared relationships between
        the parts; a bar marks an inhibition.
        {zCollapsed && ` ${Z_COLLAPSE_FOOTNOTE}.`}
        {interactive &&
          " You can select each node on the diagram; the linked effects respond."}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Timeline (ordered, accessible list)
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TimelineView({ timeline }: { timeline: TimelineSpec }) {
  const total = Math.max(
    ...timeline.events.map((e) => e.startMs + e.durationMs),
    1
  );
  return (
    <ol className="flex flex-col gap-3" aria-label="Timeline of events">
      {timeline.events.map((event, index) => {
        const endMs = event.startMs + event.durationMs;
        const widthPct = Math.max(
          4,
          Math.min(100, (event.durationMs / total) * 100)
        );
        return (
          <li
            key={`${event.title}-${index}`}
            className="rounded-lg border border-border bg-surface-raised p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                <span className="text-muted">Step {index + 1}.</span>{" "}
                {event.title}
              </p>
              <p className="text-xs text-muted">
                {formatTime(event.startMs)} to {formatTime(endMs)}
              </p>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted">
              {event.description}
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-1.5 w-full rounded-full bg-border"
            >
              <div
                className="h-full rounded-full bg-accent-strong"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

export function DataTableView({
  spec,
  readouts,
  parameters,
}: {
  spec: DemoSpecV1;
  readouts: Readout[];
  parameters: Record<string, number>;
}) {
  const isLevel1 =
    spec.trust.level === "verified_simulation" && Boolean(spec.simulation);

  if (isLevel1 && spec.simulation) {
    const paramRows = spec.simulation.parameters.map((p) => ({
      label: p.label,
      value: `${parameters[p.key] ?? p.value}${p.unit ? ` ${p.unit}` : ""}`,
    }));
    const readoutRows = readouts.map((r) => ({ label: r.label, value: r.value }));
    return (
      <DataTable
        caption="Parameters and live readouts"
        rows={[...paramRows, ...readoutRows]}
        note={
          readouts.length === 0
            ? "The simulation has not produced readouts yet."
            : "Readout values are captured live from the running simulation."
        }
      />
    );
  }

  // Level 2/3: no quantitative claims — show declared parameters and bounds.
  const paramRows: Array<{ label: string; value: string }> = [];
  for (const control of spec.controls) {
    if (control.target.kind === "parameter") {
      const value = parameters[control.target.ref];
      paramRows.push({
        label: control.label,
        value: value !== undefined ? String(value) : "n/a",
      });
    }
  }
  const limitRows = [
    { label: "Max objects", value: String(spec.limits.maxObjects) },
    { label: "Max particles", value: String(spec.limits.maxParticles) },
    { label: "Max timeline events", value: String(spec.limits.maxTimelineEvents) },
    { label: "Max controls", value: String(spec.limits.maxControls) },
  ];
  return (
    <DataTable
      caption="Declared parameters and limits"
      rows={[...paramRows, ...limitRows]}
      note="This demonstration makes no quantitative claims; these are declared values, not measurements."
    />
  );
}

function DataTable({
  caption,
  rows,
  note,
}: {
  caption: string;
  rows: Array<{ label: string; value: string }>;
  note: string;
}) {
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <caption className="pb-2 text-left text-sm font-medium">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Name
            </th>
            <th scope="col" className="py-2 font-medium">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-3 text-muted">
                Nothing to show yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.label} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 text-muted">{row.label}</td>
                <td className="py-2 font-mono">{row.value}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text sequence (observation prompts + limitations as steps)
// ---------------------------------------------------------------------------

export function TextSequenceView({ spec }: { spec: DemoSpecV1 }) {
  const steps: Array<{ heading: string; body: string }> = [];
  for (const prompt of spec.observationPrompts) {
    steps.push({ heading: "Observe", body: prompt.prompt });
  }
  steps.push({ heading: "Goal", body: spec.learningObjective });
  if (spec.trust.limitations.length > 0) {
    for (const limitation of spec.trust.limitations) {
      steps.push({ heading: "Keep in mind", body: limitation });
    }
  } else {
    steps.push({
      heading: "Keep in mind",
      body: "This demonstration declares no specific limitations.",
    });
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Guided steps">
      {steps.map((step, index) => (
        <li key={index} className="rounded-lg border border-border bg-surface-raised p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Step {index + 1} · {step.heading}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
