/**
 * tooltip-controller.ts — FIX 4 DOM tooltip for the primitive-3d stage
 * (orbit-learning root cause §5: zero tooltip components in the repo).
 *
 * A single `role="tooltip"` element inside the stage container, driven by the
 * renderer's non-graph hover identity (onHoverIdentity). Design rules:
 *
 *   - NAME + one sentence from the semantic data (W3: `semantic.name` /
 *     `semantic.shortDescription` on the spec object); the controller only
 *     knows a `resolveContent` seam, so the stage decides what "semantic"
 *     means and falls back to the plain label when no sentence exists.
 *   - Positioned at the object's projected coords (the stage supplies
 *     `anchorFor` from the renderer's camera helpers), clamped to the
 *     container inset (−12px rounded inset) ∩ viewport, so it never clips.
 *   - Appears immediately on hover change; disappears after a 150ms grace on
 *     hide (pointerleave) — re-showing inside the grace cancels it, so a
 *     quick hop between objects never flickers.
 *   - pointer-events: none — it can never intercept a click or a drag.
 *   - aria-hidden management: the element is aria-hidden while hidden so it
 *     never double-announces with the lesson rail's role=status.
 *   - High-DPI safe: positioned with translate3d (subpixel CSS px), never
 *     scaled by devicePixelRatio.
 *
 * Pure DOM — no Three.js, no React state, no per-frame work. The stage keeps
 * its React state on hover CHANGES only (hover is low-rate by nature).
 */

export interface TooltipContent {
  /** Display name, e.g. "Planet". */
  name: string;
  /** One learner-facing sentence, when the semantic data provides one. */
  sentence?: string;
}

/** CSS-pixel anchor within the stage container (see renderer.getIdentityAnchor). */
export interface TooltipAnchor {
  x: number;
  y: number;
}

export interface TooltipControllerOptions {
  /** Semantic content for a node id (null → keep hidden). */
  resolveContent?: (nodeId: string) => TooltipContent | null;
  /** Project a node's world position to container CSS px (camera helpers). */
  anchorFor?: (nodeId: string) => TooltipAnchor | null;
  /** Grace before the tooltip disappears after hide() (default 150ms). */
  hideDelayMs?: number;
  /** Respect prefers-reduced-motion: no opacity fade transition. */
  reducedMotion?: boolean;
}

/** Rounded inset the tooltip is clamped inside the container (and viewport). */
const TOOLTIP_INSET_PX = 12;
/** Tooltip offset from the anchor point (below-right, flipped above). */
const TOOLTIP_OFFSET_PX = 16;

export class TooltipController {
  private readonly el: HTMLDivElement;
  private readonly container: HTMLElement;
  private readonly opts: Required<Pick<TooltipControllerOptions, "hideDelayMs">> &
    TooltipControllerOptions;
  private currentNodeId: string | null = null;
  private visible = false;
  private hideTimer: number | null = null;

  constructor(container: HTMLElement, options: TooltipControllerOptions = {}) {
    this.container = container;
    this.opts = { hideDelayMs: 150, ...options };
    this.el = document.createElement("div");
    this.el.setAttribute("role", "tooltip");
    this.el.setAttribute("aria-hidden", "true");
    // Small, legible, high-contrast card; positioned in CSS px via
    // translate3d so high-DPI displays never blur it.
    const s = this.el.style;
    s.position = "absolute";
    s.zIndex = "50";
    s.pointerEvents = "none";
    s.maxWidth = "min(280px, calc(100% - 24px))";
    s.padding = "6px 10px";
    s.borderRadius = "8px";
    s.background = "rgba(10, 14, 24, 0.92)";
    s.color = "#f2f4f8";
    s.fontSize = "13px";
    s.lineHeight = "1.45";
    s.fontFamily = "inherit";
    s.border = "1px solid rgba(255, 255, 255, 0.16)";
    s.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.35)";
    s.backdropFilter = "blur(4px)";
    s.transition = this.opts.reducedMotion ? "none" : "opacity 120ms ease";
    s.opacity = "0";
    s.left = "0";
    s.top = "0";
    s.willChange = "transform";
    s.transform = "translate3d(-9999px, -9999px, 0)"; // offscreen until placed
    this.el.hidden = true;
    container.appendChild(this.el);
  }

  /** Show the tooltip for a node id: resolve content + anchor, un-hide. */
  show(nodeId: string): void {
    this.clearHideTimer();
    if (this.currentNodeId !== nodeId || !this.visible) {
      const content = this.opts.resolveContent?.(nodeId);
      if (!content) {
        this.hide();
        return;
      }
      this.currentNodeId = nodeId;
      this.el.textContent = "";
      const name = document.createElement("span");
      name.style.fontWeight = "600";
      name.textContent = content.name;
      this.el.appendChild(name);
      if (content.sentence) {
        const sentence = document.createElement("span");
        sentence.style.fontWeight = "400";
        sentence.style.opacity = "0.82";
        sentence.textContent = ` ${content.sentence}`;
        this.el.appendChild(sentence);
      }
    }
    this.visible = true;
    this.el.hidden = false;
    this.el.setAttribute("aria-hidden", "false");
    // Reflow first so offsetWidth/offsetHeight are current for the clamp.
    void this.el.offsetWidth;
    this.position(this.currentNodeId);
    this.el.style.opacity = "1";
  }

  /** Hide after the grace period (cancelable by a re-show). */
  hide(): void {
    this.clearHideTimer();
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.visible = false;
      this.currentNodeId = null;
      this.el.style.opacity = "0";
      this.el.setAttribute("aria-hidden", "true");
      this.el.hidden = true;
      this.el.style.transform = "translate3d(-9999px, -9999px, 0)";
    }, this.opts.hideDelayMs);
  }

  /** Re-query the anchor and re-clamp (cheap; called from container
   * pointermove while visible — never per frame). */
  reposition(): void {
    if (!this.visible || this.currentNodeId === null) return;
    this.position(this.currentNodeId);
  }

  dispose(): void {
    this.clearHideTimer();
    this.el.remove();
  }

  private position(nodeId: string): void {
    const anchor = this.opts.anchorFor?.(nodeId);
    if (!anchor) {
      this.hide();
      return;
    }
    const rect = this.container.getBoundingClientRect();
    const w = this.el.offsetWidth || 1;
    const h = this.el.offsetHeight || 1;
    let x = anchor.x + TOOLTIP_OFFSET_PX;
    let y = anchor.y + TOOLTIP_OFFSET_PX;
    // Flip above the anchor when the card would clip the bottom inset.
    if (
      y + h > rect.height - TOOLTIP_INSET_PX &&
      anchor.y - h - TOOLTIP_OFFSET_PX >= TOOLTIP_INSET_PX
    ) {
      y = anchor.y - h - TOOLTIP_OFFSET_PX;
    }
    // Clamp to (container rect − 12px rounded inset) ∩ viewport.
    const minX = TOOLTIP_INSET_PX;
    const maxX = Math.max(minX, rect.width - TOOLTIP_INSET_PX - w);
    const minY = TOOLTIP_INSET_PX;
    const maxY = Math.max(minY, rect.height - TOOLTIP_INSET_PX - h);
    x = clampNum(x, minX, maxX);
    y = clampNum(y, minY, maxY);
    if (typeof window !== "undefined") {
      const vpMinX = Math.max(TOOLTIP_INSET_PX - rect.left, minX);
      const vpMaxX = Math.min(
        window.innerWidth - TOOLTIP_INSET_PX - w - rect.left,
        maxX
      );
      const vpMinY = Math.max(TOOLTIP_INSET_PX - rect.top, minY);
      const vpMaxY = Math.min(
        window.innerHeight - TOOLTIP_INSET_PX - h - rect.top,
        maxY
      );
      if (vpMaxX >= vpMinX) x = clampNum(x, vpMinX, vpMaxX);
      if (vpMaxY >= vpMinY) y = clampNum(y, vpMinY, vpMaxY);
    }
    this.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
