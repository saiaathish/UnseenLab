/**
 * presentation/constants.ts — shared presentation constants (C5, Wave 3).
 *
 * THE single source of truth for the text-width model, label budgets, glyph
 * scale math, edge/camera clearance constants, the 2D diagram geometry
 * (insets, spread, z-collapse rule) and every REASON_* code in the
 * presentation pipeline. Imported by:
 *
 *   - labels.ts / edges.ts / camera.ts (3D presentation stages, C2/C3/C4)
 *   - accessible-representation.tsx (2D SVG diagram, C5)
 *   - geometry-gate.ts (pure gate I1–I5, C5)
 *
 * No literal 34 / 52 / 72 / 320 / 40 / 288 is allowed anywhere outside this
 * module (design-2 §6.4 — removes audit A4's "constants are not exported"
 * blocker V1). Pure TS: no Three.js, no DOM.
 *
 * All widths are measured at font `600 30px system-ui, -apple-system,
 * 'Segoe UI', sans-serif` on the 320×72 label canvas (evidence
 * `audit3-label-geometry.json`, 39 browser-measured strings).
 */

// ---------------------------------------------------------------------------
// 1.1 Shared text model (design-2 §1.1)
// ---------------------------------------------------------------------------

/**
 * Per-character-class width in px at the 30px label font, fitted by least
 * squares to the 39 measured strings of audit3 (LS fit: upper 21.2, lower
 * 13.5, digit 15.7, space 6.7, punct 22.6) and rounded UP so the model never
 * under-estimates a measurement.
 *
 * DEVIATION FROM DESIGN-2 (documented): the design doc fixes `lower: 15`,
 * which under-estimates three measured strings even with the +1 safety term
 * ("causes" 91 vs 96, "Second" 99 vs 103, "Hub" 54 vs 55). The program
 * invariant is a 0/39 under-estimate rate (PROGRAM.md / design-2 §1.1), so
 * `lower` is raised to 16 — the smallest value that achieves 0/39 with
 * `estimateTextWidthPx(text) + TEXT_SAFETY_PX`. Verified 0/39 under-estimates.
 */
export const TEXT_MODEL_PX = {
  upper: 23,
  lower: 16,
  digit: 17,
  space: 8,
  punct: 16,
} as const;

/** 1 px safety term applied whenever a width feeds a collision budget. */
export const TEXT_SAFETY_PX = 1;

const isUpper = (ch: string): boolean => ch >= "A" && ch <= "Z";
const isLower = (ch: string): boolean => ch >= "a" && ch <= "z";
const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";

/** Per-class width of a single character (non-ASCII falls to `punct`). */
export function textCharWidthPx(ch: string): number {
  if (isUpper(ch)) return TEXT_MODEL_PX.upper;
  if (isLower(ch)) return TEXT_MODEL_PX.lower;
  if (isDigit(ch)) return TEXT_MODEL_PX.digit;
  if (ch === " ") return TEXT_MODEL_PX.space;
  return TEXT_MODEL_PX.punct;
}

/**
 * Estimated rendered width of `text` in px at the 30px label font:
 * Σ per-class char widths. Callers that feed collision budgets must add
 * `TEXT_SAFETY_PX` (the +1 term) — `resolveLabelText` does so internally.
 * The model is verified to never under-estimate the 39 audit3 measurements
 * when the safety term is applied (0/39).
 */
export function estimateTextWidthPx(text: string): number {
  let total = 0;
  for (const ch of text) total += textCharWidthPx(ch);
  return total;
}

/** Average mixed-case char width at 30px (budget math only). */
export const TEXT_AVG_PX = 15.5;

/** "…" ≈ 0.8em at 30px. */
export const ELLIPSIS_PX = 24;

/** Left+right padding inside the label canvas. */
export const TEXT_PAD_PX = 4;

/** Unchanged label canvas width (audit3 `canvas_px`). */
export const MAX_TEXTURE_PX = 320;

/**
 * Usable glyph budget inside the canvas before the ellipsis:
 * 320 − 2·pad − ellipsis = 288 px.
 */
export const TEXT_BUDGET_PX = MAX_TEXTURE_PX - 2 * TEXT_PAD_PX - ELLIPSIS_PX; // = 288

/** Unchanged hard slice (schema-level bound); ellipsis governs display. */
export const LABEL_MAX_CHARS = 40;

/** Emitted once per truncated label by the pipeline (never silent). */
export const REASON_LABEL_ELLIPSIZED = "label_truncated_ellipsis";

export interface ResolvedLabel {
  text: string;
  truncated: boolean;
}

/**
 * One shared label resolver for BOTH surfaces (3D sprites and 2D SVG), so a
 * single spec renders identical label content everywhere (kills A4 P4).
 *
 * truncated = estimateTextWidthPx(text) + TEXT_SAFETY_PX > TEXT_BUDGET_PX.
 * When truncated, binary-searches the longest prefix whose width plus the
 * ellipsis fits TEXT_BUDGET_PX and returns `prefix + "…"` (≈ 18 chars before
 * the ellipsis for mixed prose). Short labels pass through untouched.
 */
export function resolveLabelText(text: string): ResolvedLabel {
  const raw = text ?? "";
  const truncated =
    estimateTextWidthPx(raw) + TEXT_SAFETY_PX > TEXT_BUDGET_PX;
  if (!truncated) return { text: raw, truncated: false };

  // Longest prefix k with est(prefix) + ellipsis + safety <= budget.
  // fit(k) is monotone non-decreasing in k, so binary search applies.
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const fits =
      estimateTextWidthPx(raw.slice(0, mid)) +
        ELLIPSIS_PX +
        TEXT_SAFETY_PX <=
      TEXT_BUDGET_PX;
    if (fits) lo = mid;
    else hi = mid - 1;
  }
  return { text: `${raw.slice(0, lo)}…`, truncated: true };
}

// ---------------------------------------------------------------------------
// 1.2 Sprite scale (design-2 §1.2, fixes F-02 / F-23)
// ---------------------------------------------------------------------------

/** World→px conversion for node label sprites (audit3: 320px / 2.2u). */
export const NODE_PX_PER_UNIT = 145.45;

/** Node label sprite height in world units (unchanged). */
export const NODE_SPRITE_H_UNIT = 0.5;

/** Glyph half-height of a node label in world units (28px / 145.45 / 2). */
export const GLYPH_HALF_H_NODE = 0.096;

/**
 * Node-label sprite scale: width follows the text (capped at the 2.2u
 * texture), height follows the node. Same rule for node labels AND
 * `label`-kind nodes (fixes F-23). `textPx` must include TEXT_SAFETY_PX
 * at the call site.
 *
 * When a `frame` is supplied (Wave-2 screen-constant path, root-cause §4 —
 * "glyphs are 5.6-11.2 CSS px"), the height is governed by the
 * MIN_NODE_LABEL_PX CSS-px floor projected at that frame instead of
 * min(size,2): every primary label projects >= 14 CSS px at desktop AND at
 * the 320px viewport (the floor recomputes from the current viewport px), and
 * the width is text-measured WITHOUT the size multiplier (the min(size,2)
 * cap is raised for small nodes — the moon is no longer 8x smaller than the
 * star). The 2.2u texture cap stays. Without a frame the legacy scale is
 * returned verbatim (frozen pins).
 */
export function nodeLabelSpriteScale(
  size: number,
  textPx: number,
  frame?: GlyphFrame | null
): { w: number; h: number } {
  const cap = Math.min(size, 2);
  if (frame && frame.halfH > 0 && frame.viewportPx > 0) {
    const glyphWorldH = 2 * nodeLabelGlyphHalfH(size, frame);
    return {
      w: Math.min(2.2, (textPx + TEXT_SAFETY_PX) / NODE_PX_PER_UNIT),
      h: glyphWorldH / GLYPH_TEX_FRACTION,
    };
  }
  return {
    w: Math.min(2.2, (textPx + TEXT_SAFETY_PX) / NODE_PX_PER_UNIT) * cap,
    h: NODE_SPRITE_H_UNIT * cap,
  };
}

// ---------------------------------------------------------------------------
// 1.2b Screen-constant glyph floor (orbit-learning Wave 2, root-cause §4)
// ---------------------------------------------------------------------------

/** Primary node-label glyph floor in CSS px (mission brief: 14-16 px desktop,
 * readable at the 320px viewport and at 125%/150% zoom — a CSS-px floor is
 * zoom-invariant). */
export const MIN_NODE_LABEL_PX = 14;

/** Secondary chrome labels (guides / camera markers) may render at 12-14 px. */
export const MIN_SECONDARY_LABEL_PX = 12;

/** Fraction of the label texture height occupied by the 30px glyph (28/72):
 * the sprite height that maps a target glyph world height onto the texture. */
export const GLYPH_TEX_FRACTION = 28 / 72;

/** Camera frame for screen-constant glyph sizing: the visible half-height in
 * world units at the label plane (perspective: distance * tan(fov/2); ortho:
 * the ortho base half-height) and the viewport height in CSS px. */
export interface GlyphFrame {
  halfH: number;
  viewportPx: number;
}

/**
 * Glyph half-height of a node label in world units. Without a frame this is
 * the legacy GLYPH_HALF_H_NODE * min(size,2) (frozen pins). With a frame the
 * screen-constant floor is applied: the glyph projects to >= MIN_NODE_LABEL_PX
 * CSS px at that frame (glyphWorldH = 2·halfH·MIN/viewportPx), so the
 * smallest body (moon, size 0.35) is never 2-8x smaller than the star's glyph
 * again.
 */
export function nodeLabelGlyphHalfH(
  size: number,
  frame?: GlyphFrame | null
): number {
  const base = GLYPH_HALF_H_NODE * Math.min(size, 2);
  if (!frame || frame.halfH <= 0 || frame.viewportPx <= 0) return base;
  const floor = MIN_NODE_LABEL_PX * (frame.halfH / frame.viewportPx);
  return Math.max(base, floor);
}

/** World→px conversion for edge label sprites (audit3: 320px / 1.9u). */
export const EDGE_PX_PER_UNIT = 168.4;

/** Edge label sprite height in world units (unchanged). */
export const EDGE_SPRITE_H_UNIT = 0.42;

/** Glyph half-height of an edge label in world units (27px / 168.4 / 2). */
export const GLYPH_HALF_H_EDGE = 0.079;

/** Edge-label sprite scale: width follows the text (capped at 1.9u). */
export function edgeLabelSpriteScale(textPx: number): { w: number; h: number } {
  return {
    w: Math.min(1.9, (textPx + TEXT_SAFETY_PX) / EDGE_PX_PER_UNIT),
    h: EDGE_SPRITE_H_UNIT,
  };
}

// ---------------------------------------------------------------------------
// 1.3 Label anchors + collision clearances (design-2 §1.3, fixes F-03/F-05)
// ---------------------------------------------------------------------------

/** Axis-aligned world rect (z-depth halfD) — label/glyph collision volume. */
export interface Rect {
  cx: number;
  cy: number;
  cz: number;
  halfW: number;
  halfH: number;
  halfD: number;
}

/** Inflated glyph rect must clear node envelopes by this (0.027u today). */
export const LABEL_ENV_CLEAR = 0.15;

/** Label-label clearance on inflated rects. */
export const LABEL_LABEL_CLEAR = 0.05;

/** Label vs edge-polyline clearance. */
export const LABEL_EDGE_CLEAR = 0.12;

/** Deterministic anchor order for node labels. */
export const NODE_ANCHOR_ORDER = ["above", "right", "left", "below"] as const;
export type NodeAnchor = (typeof NODE_ANCHOR_ORDER)[number];

// ---------------------------------------------------------------------------
// 2.1 Edge routing (design-2 §2.1, fixes F-06 / I2)
// ---------------------------------------------------------------------------

/** Clearance from an obstacle envelope to a detour waypoint. */
export const ROUTE_CLEAR = 0.25;

/** Hard cap on chained detour waypoints before simplification. */
export const ROUTE_MAX_WAYPOINTS = 4;

/** Sampled polyline points per quadratic segment (gate + rendering). */
export const CURVE_SAMPLES = 16;

// ---------------------------------------------------------------------------
// 2.3 Arrowhead anchoring (design-2 §2.3, fixes F-09 / I4)
// ---------------------------------------------------------------------------

/** Head length proportional to the ACTUAL target radius. */
export const HEAD_RATIO = 0.72;

/** Head length floor (small nodes still get a visible head). */
export const HEAD_LEN_MIN = 0.18;

/** Head length cap (size-5 targets keep a proportionate head). */
export const HEAD_LEN_MAX = 0.5;

/** Cone length:radius ratio (0.36:0.15, unchanged proportions). */
export const HEAD_LEN_RATIO_W = 2.4;

/**
 * I4 head geometry: len = clamp(0.72·r_t, 0.18, 0.5); radius = len/2.4.
 * The cone center (the "inset") sits at r_t + len/2, so the APEX lands
 * exactly on the target surface and the head occupies the band
 * [r_t, r_t + len] ("inset = actual target radius + head length").
 * size-1 pair: len 0.36, radius 0.15 — identical to today's cone.
 */
export function arrowHead(targetRadius: number): {
  len: number;
  radius: number;
} {
  const len = Math.min(HEAD_LEN_MAX, Math.max(HEAD_LEN_MIN, HEAD_RATIO * targetRadius));
  return { len, radius: len / HEAD_LEN_RATIO_W };
}

/** Gap between the endpoint surface and the shaft start (never pierces). */
export const SHAFT_GAP = 0.02;

// ---------------------------------------------------------------------------
// 3 Camera framing (design-2 §3.2–3.4, fixes F-12/F-13/F-14)
// ---------------------------------------------------------------------------

export const FRAME_MARGIN_RATE = 0.2; // margin = rate · maxHalf + floor
export const FRAME_MARGIN_FLOOR = 0.25;
export const FRAME_MARGIN_MIN = 0.35; // replaces the 1.4 hard floor
export const FRAME_MARGIN_MAX = 2.5;
export const SWING_MARGIN_RATE = 0.1; // absorbs the orbit band (F-14)
export const REFRAME_HYSTERESIS = 1.05; // grow only beyond 5%
export const REFRAME_INTERVAL_S = 0.5; // reframe tick (frame-counted)

// ---------------------------------------------------------------------------
// 6 2D SVG diagram geometry (design-2 §6, fixes A4 F1–F6)
// ---------------------------------------------------------------------------

/** 2D viewBox (kept from the original component). */
export const VIEW_W = 800;
export const VIEW_H = 460;
export const PAD = 70;

/** Circle shape radius; rect/diamond use their own bbox radii for envelopes. */
export const SHAPE_RADIUS_PX = 26;

/** Rect shape size (60×40, kept from the original component). */
export const RECT_W_PX = 60;
export const RECT_H_PX = 40;

/** Diamond shape half-extent (52×52 before the 45° rotation). */
export const DIAMOND_HALF_PX = 26;

/** Node label font size in the 2D diagram (kept). */
export const NODE_LABEL_FONT_PX = 12;

/** Edge label font size in the 2D diagram (kept). */
export const EDGE_LABEL_FONT_PX = 11;

/** 2D edge-label offset perpendicular to the shaft, in screen px (design-2 §6.3). */
export const EDGE_LABEL_OFFSET_PX = 14;

/** 2D label-vs-shape clearance: shape envelopes are inflated by this (design-2 §6.3). */
export const LABEL_SHAPE_CLEAR_PX = 4;

/**
 * Axis-aligned bbox radius of a 2D shape in px (envelope math; audit4
 * §1: rect 36.1, diamond 36.8 — both match √(30²+20²) / √(26²+26²)).
 */
export function shapeBBoxRadiusPx(shape: "circle" | "rect" | "diamond"): number {
  if (shape === "circle") return SHAPE_RADIUS_PX;
  if (shape === "rect") return Math.hypot(RECT_W_PX, RECT_H_PX) / 2; // 36.06
  return Math.hypot(DIAMOND_HALF_PX, DIAMOND_HALF_PX); // 36.77
}

/** Fixed 34px inset is kept as the MAXIMUM (fixes F1 inversion). */
export const EDGE_INSET_MAX_PX = 34;

/** Adaptive fraction: inset = min(EDGE_INSET_MAX_PX, 0.45 · len_px). */
export const EDGE_INSET_RATE = 0.45;

/** Arrow tip AT the target shape surface (was 34 → now exactly 26; fixes F5). */
export const HEAD_TIP_PX = SHAPE_RADIUS_PX;

/** 2D head spans [26, 36] = radius + head length (audit I4 formula). */
export const HEAD_LEN_2D_PX = 10;

/** Below this projected edge length the edge is flagged I4 (was 68, now 72). */
export const MIN_EDGE_LEN_PX = 2 * (HEAD_TIP_PX + HEAD_LEN_2D_PX); // = 72

/** Circle-circle separation threshold in px (audit4). */
export const MIN_NODE_SEP_PX = 52;

/** Deterministic radial spread for clustered/duplicate/z-collapsed roots. */
export const SPREAD_RADIUS_PX = 40;

/** Max spread/recompute iterations for a cluster. */
export const SPREAD_MAX_ITER = 3;

/**
 * The explicit z-collapse rule: the 2D projection drops z, but members that
 * differ only in z are NEVER merged — they are spread like any cluster, and
 * when any spread cluster contains z-differing members this footnote line is
 * added to the diagram caption.
 */
export const Z_COLLAPSE_FOOTNOTE =
  "objects at different depths (z) are separated for readability";

/**
 * 2D edge inset (from the source shape surface): adaptive, never inverted.
 * `lenPx` is the projected center-to-center edge length in px.
 */
export function edgeInsetPx(lenPx: number): number {
  return Math.min(EDGE_INSET_MAX_PX, EDGE_INSET_RATE * lenPx);
}

/**
 * 2D label budget at a given fontSize: the shared 288px budget scaled by
 * fontSize/30 (node labels 12px → 115px; edge labels 11px → 105px).
 * Belt-and-suspenders assert on top of the shared resolver (design-2 §6.3).
 */
export function labelBudgetPx(fontSize: number): number {
  return (TEXT_BUDGET_PX * fontSize) / 30;
}

/**
 * Deterministic string hash (FNV-1a, 32-bit) — the seeded-angle source for
 * the 2D spread (design-2 §6.2: `angle = hashString(id) · 2π`). Same id →
 * same angle on every platform; follows the repo's hashString/mulberry32
 * determinism constraint.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// REASON_* codes (single source for the whole pipeline; design-2 §6.4)
// ---------------------------------------------------------------------------

export const REASON_EDGE_LABEL_SKIPPED = "edge_label_skipped_no_space";
export const REASON_EDGE_LABEL_DENSE = "edge_label_suppressed_density";
export const REASON_EDGE_UNROUTABLE = "edge_unroutable";
export const REASON_LINE_NO_ENDPOINTS = "line_no_endpoint_nodes";
export const REASON_EDGE_DEGENERATE = "edge_degenerate_self_loop";
export const REASON_EDGE_HEAD_SUPPRESSED = "edge_head_suppressed_short_edge";
export const REASON_FIELD_AUTO_FIT = "field_span_auto_fit";
export const REASON_UPDATE_VECTOR_IDENTITY = "update_vector_identity_axis_fallback";
export const REASON_TRANSLATE_UNBOUNDED = "translate_unbounded_path_candidate";
export const REASON_RELATIONSHIP_NOT_GRAPH_NODE = "relationship_endpoint_not_graph_node";
export const REASON_RELATIONSHIP_INVISIBLE_BOTH = "relationship_invisible_both_surfaces";
