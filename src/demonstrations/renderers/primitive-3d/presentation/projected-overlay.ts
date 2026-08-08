/**
 * projected-overlay.ts — persistent DOM label overlay for the primitive-3d
 * stage (orbit-learning Wave 2, root-cause fix seam 5 + mission brief FIX
 * 6/7/16).
 *
 * A pointer-events-none layer mounted inside the stage container renders each
 * placed label as an absolutely-positioned DOM element:
 *   - font >= 14 CSS px (primary entities) / >= 12 px (secondary chrome),
 *   - high contrast (light text on a translucent dark pill), never all-caps,
 *   - clamped to the container bounds (no clipping at canvas edges),
 *   - hidden while the placement planner judges the label occluded (anchor
 *     fallback) or the object is hidden,
 *   - stable during camera movement: positions are projected from the live
 *     camera every frame, so labels follow their objects — they never jump
 *     (anchor flips are eliminated by labels.ts's sticky-anchor replans).
 *
 * DOM/CSS over canvas text (mission brief): labels stay readable at 125% /
 * 150% zoom and never depend on the sprite texture resolution.
 *
 * PERF RULE: the overlay runs its OWN rAF and pulls projections imperatively
 * from a source callback (the renderer's readLabelProjections) — direct DOM
 * writes only, NO React state, no per-frame React re-render. The layer is
 * disposed on unmount (rAF cancelled, DOM removed).
 */

import {
  MIN_NODE_LABEL_PX,
  MIN_SECONDARY_LABEL_PX,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";
import type { LabelProjection } from "@/demonstrations/renderers/primitive-3d/labels";

/** Pull source: returns the current projected labels (canvas CSS px, y
 * down), or null when the scene is not ready. */
export type ProjectionSource = () => LabelProjection[] | null;

export interface ProjectedOverlayOptions {
  /** Container edge padding in px (clamp margin). */
  pad?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export class ProjectedLabelOverlay {
  private readonly source: ProjectionSource;
  private readonly pad: number;
  private readonly layer: HTMLDivElement;
  private readonly els = new Map<string, HTMLSpanElement>();
  /** Measured label half-size per node id (re-measured on text change). */
  private readonly sizes = new Map<string, { halfW: number; halfH: number }>();
  private raf = 0;
  private disposed = false;

  constructor(
    host: HTMLElement,
    source: ProjectionSource,
    options: ProjectedOverlayOptions = {}
  ) {
    this.source = source;
    this.pad = options.pad ?? 6;
    const layer = document.createElement("div");
    layer.style.cssText =
      "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:10;";
    host.appendChild(layer);
    this.layer = layer;
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const el of this.els.values()) el.remove();
    this.els.clear();
    this.sizes.clear();
    this.layer.remove();
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    // Throttle DOM writes to ~10 Hz (positions move at rAF rate anyway; the
    // camera projects continuously, so a 100 ms cadence is imperceptible for
    // labels and keeps the layer cheap).
    if (now - this.lastWrite < 100) return;
    this.lastWrite = now;
    this.apply(this.source() ?? []);
  };

  private lastWrite = 0;

  private apply(projections: LabelProjection[]): void {
    const W = this.layer.clientWidth;
    const H = this.layer.clientHeight;
    if (W <= 0 || H <= 0) return;
    const seen = new Set<string>();
    for (const p of projections) {
      seen.add(p.nodeId);
      const el = this.ensureEl(p);
      const size = this.measure(el, p.nodeId, p.label);
      const x = clamp(p.x, this.pad + size.halfW, W - this.pad - size.halfW);
      const y = clamp(p.y, this.pad + size.halfH, H - this.pad - size.halfH);
      const transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0)`;
      if (el.style.transform !== transform) el.style.transform = transform;
      if (el.style.opacity !== "1") el.style.opacity = "1";
    }
    // Labels that vanished (occluded / hidden / out of frustum / disposed
    // scene): remove their elements.
    for (const [id, el] of this.els) {
      if (!seen.has(id)) {
        el.remove();
        this.els.delete(id);
        this.sizes.delete(id);
      }
    }
  }

  private ensureEl(p: LabelProjection): HTMLSpanElement {
    const existing = this.els.get(p.nodeId);
    if (existing) return existing;
    const el = document.createElement("span");
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.fontSize = `${p.primary ? MIN_NODE_LABEL_PX : MIN_SECONDARY_LABEL_PX}px`;
    el.style.fontWeight = "600";
    el.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    el.style.lineHeight = "1.2";
    el.style.color = "#f2f5ff";
    el.style.background = "rgba(8, 13, 22, 0.78)";
    el.style.border = "1px solid rgba(255, 255, 255, 0.16)";
    el.style.borderRadius = "999px";
    el.style.padding = "2px 10px";
    el.style.whiteSpace = "nowrap";
    el.style.textTransform = "none";
    el.style.letterSpacing = "0";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.style.willChange = "transform";
    el.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.45)";
    this.layer.appendChild(el);
    this.els.set(p.nodeId, el);
    return el;
  }

  /** Cached measured half-size; re-measures when the label text changed. */
  private measure(
    el: HTMLSpanElement,
    nodeId: string,
    label: string
  ): { halfW: number; halfH: number } {
    const cached = this.sizes.get(nodeId);
    if (cached && el.textContent === label) return cached;
    el.textContent = label;
    // Force layout: offsetWidth/Height are exact after the text is set.
    const size = {
      halfW: el.offsetWidth / 2,
      halfH: el.offsetHeight / 2,
    };
    this.sizes.set(nodeId, size);
    return size;
  }
}
