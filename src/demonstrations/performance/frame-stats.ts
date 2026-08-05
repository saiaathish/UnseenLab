/**
 * frame-stats.ts — dependency-free frame-time sampling (EMA).
 *
 * A tiny exponential-moving-average smoother for render-loop frame deltas.
 * Feed it the requestAnimationFrame timestamp once per frame; it returns a
 * smoothed dt (seconds) and the corresponding FPS. Cost when attached is one
 * multiply-add per frame — when nothing is attached there is zero overhead.
 * No dependencies, no timers, no DOM, no allocations per sample (the returned
 * object is freshly allocated only when you call read()).
 *
 * Usage (optional renderer instrumentation):
 *
 *   import { FrameStatsSampler } from "@/demonstrations/performance/frame-stats";
 *   const stats = onFps ? new FrameStatsSampler() : null;
 *
 *   function frame(now: number) {
 *     // ... render ...
 *     if (stats) onFps(stats.sample(now).fps); // EMA-smoothed FPS
 *   }
 *
 * The primitive-3d renderer wires this through its existing optional onFps
 * callback: the sampler is only instantiated when onFps is provided, and the
 * onFps signature is unchanged. jsdom cannot rasterize, so this module is
 * verified structurally and mathematically (unit tests feed fake timestamps);
 * browser-level FPS verification belongs to the Phase 9 browser gate.
 */

/** Longest dt (seconds) a single sample may contribute; a longer gap is a
 * stall, not a frame — clamping keeps the EMA from being skewed for minutes
 * after a tab refocus or GC pause. */
export const MAX_FRAME_DT = 1;

/** Default EMA smoothing factor (higher = faster reaction, noisier). */
export const DEFAULT_ALPHA = 0.1;

/** The current smoothed reading. */
export interface FrameSample {
  /** EMA-smoothed dt in seconds (0 until the second frame is fed). */
  avgDt: number;
  /** Raw dt of the most recent frame in seconds (0 on the first frame). */
  lastDt: number;
  /** EMA-smoothed frames per second (0 while avgDt is 0). */
  fps: number;
  /** Number of frames fed so far. */
  frames: number;
}

/**
 * Pure EMA step: `previous + alpha * (sample - previous)`.
 * Exported for direct unit testing.
 */
export function ema(previous: number, sample: number, alpha: number): number {
  return previous + alpha * (sample - previous);
}

function clampAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return DEFAULT_ALPHA;
  return Math.min(1, Math.max(0.0001, alpha));
}

export class FrameStatsSampler {
  private readonly alpha: number;
  private last = 0;
  private avgDt = 0;
  private lastDt = 0;
  private frames = 0;

  constructor(alpha: number = DEFAULT_ALPHA) {
    this.alpha = clampAlpha(alpha);
  }

  /**
   * Feed one rAF timestamp (milliseconds, like the requestAnimationFrame
   * callback argument). The first call only establishes the clock. Returns
   * the smoothed reading after this frame.
   */
  sample(nowMs: number): FrameSample {
    if (this.frames === 0) {
      this.last = nowMs;
      this.frames = 1;
    } else if (Number.isFinite(nowMs)) {
      // A non-finite clock (NaN/Infinity) is treated as "no frame": the dt
      // stays 0 and the clock is not moved, so the next real frame is sane.
      const raw = Number.isFinite(this.last) ? (nowMs - this.last) / 1000 : 0;
      this.last = nowMs;
      this.lastDt = Math.min(Math.max(raw, 0), MAX_FRAME_DT);
      this.avgDt = this.avgDt === 0 ? this.lastDt : ema(this.avgDt, this.lastDt, this.alpha);
      this.frames++;
    }
    return this.read();
  }

  /** The current smoothed reading without feeding a frame. */
  read(): FrameSample {
    return {
      avgDt: this.avgDt,
      lastDt: this.lastDt,
      fps: this.avgDt > 0 ? 1 / this.avgDt : 0,
      frames: this.frames,
    };
  }

  /** Forget all history; the next sample() re-establishes the clock. */
  reset(): void {
    this.last = 0;
    this.avgDt = 0;
    this.lastDt = 0;
    this.frames = 0;
  }
}
