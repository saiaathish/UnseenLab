/**
 * SimRunner — the single owner of a canvas for the Lumina 2D namespace.
 *
 * One runner per canvas (enforced), one requestAnimationFrame loop, DPR
 * scaling, pointer input, time control and scene swapping. A scene module
 * (SimulationModule) only advances and draws itself; everything else lives
 * here so the modules stay tiny and the loop stays rock-solid.
 */

import { createModule } from "./registry";
import type {
  EngineVisualState,
  Readout,
  SimContext,
  SimulationModule,
  SimPointer,
} from "./types";

export interface SceneSpec {
  engineId: string;
  parameters?: Record<string, number>;
  seed?: number;
}

export const MAX_DT = 0.05; // seconds; avoid huge jumps on tab refocus
export const READOUT_INTERVAL = 0.12; // seconds between readout emissions
/** Seconds between visual-state emissions (~15 Hz) for coupled 3D surfaces. */
export const VISUAL_STATE_INTERVAL = 0.066;

/** DPR caps — desktop 2, mobile viewports 1.5 (mirrors primitive-3d). */
export const DPR_CAP = 2;
export const DPR_CAP_MOBILE = 1.5;
/** Viewport width (CSS px) below which the mobile DPR cap applies. */
export const MOBILE_VIEWPORT_PX = 768;

/**
 * Pure DPR clamp — exported for direct unit testing. Mobile viewports (and
 * anything below 1 dpr, e.g. headless environments) never exceed their cap,
 * so the 2D canvas backing store stays within the fill-rate budget.
 */
export function computeDpr(devicePixelRatio: number, mobile: boolean): number {
  const device = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(device, mobile ? DPR_CAP_MOBILE : DPR_CAP);
}

/** Same viewport heuristic the shell uses to pick the mobile variant. */
export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_VIEWPORT_PX;
}

/** Pure dt clamp — exported for direct unit testing. */
export function clampDt(dt: number, max: number = MAX_DT): number {
  if (!Number.isFinite(dt)) return 0;
  if (dt < 0) return 0;
  return dt > max ? max : dt;
}

/** One runner may own a canvas at a time. */
const canvasOwners = new WeakMap<HTMLCanvasElement, SimRunner>();

export function isCanvasOwned(canvas: HTMLCanvasElement): boolean {
  return canvasOwners.has(canvas);
}

/**
 * A no-op 2D context used in headless environments (jsdom has no canvas
 * rasterizer). Every draw() implementation must tolerate such a context.
 */
function makeFallbackContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const noop = () => gradient;
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, prop) => {
      if (prop === "canvas") return canvas;
      if (prop === "measureText") return () => ({ width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0 });
      return noop;
    },
    set: () => true,
  });
}

function acquireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  try {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (ctx) return ctx;
  } catch {
    /* fall through to the no-op context */
  }
  return makeFallbackContext(canvas);
}

export class SimRunner {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private module: SimulationModule | null = null;
  private raf = 0;
  private last = 0;
  private playing = true;
  private speed = 1;
  private ctx: SimContext;
  private ro: ResizeObserver | null = null;
  private readoutAcc = 0;
  private visualAcc = 0;
  private disposed = false;

  onReadouts: (readouts: Readout[]) => void = () => {};
  onParam: (key: string, value: number) => void = () => {};
  /**
   * Canonical engine visual state, emitted at ~15 Hz for coupled surfaces
   * (the primitive-3d stage in hybrid showcases). Only fires when the active
   * module implements getVisualState(); otherwise never called, so the
   * lumina-2d-only flow is untouched.
   */
  onVisualState: (state: EngineVisualState) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    if (canvasOwners.has(canvas)) {
      throw new Error("SimRunner: canvas is already owned by another runner");
    }
    this.canvas = canvas;
    canvasOwners.set(canvas, this);
    this.g = acquireContext(canvas);
    this.ctx = {
      width: 0,
      height: 0,
      dpr: 1,
      time: 0,
      emit: (key, value) => this.onParam(key, value),
    };
    this.loop = this.loop.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);

    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement ?? canvas);
    }
    this.bindPointer();
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.raf = requestAnimationFrame(this.loop);
  }

  // -------------------------------------------------------------------------
  // Sizing
  // -------------------------------------------------------------------------

  private resize() {
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    const dpr = computeDpr(
      (typeof window !== "undefined" && window.devicePixelRatio) || 1,
      isMobileViewport()
    );
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (this.canvas.width !== Math.floor(w * dpr)) this.canvas.width = Math.floor(w * dpr);
    if (this.canvas.height !== Math.floor(h * dpr)) this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const changed = this.ctx.width !== w || this.ctx.height !== h || this.ctx.dpr !== dpr;
    this.ctx.width = w;
    this.ctx.height = h;
    this.ctx.dpr = dpr;
    if (changed && this.module) this.module.resize(w, h, dpr);
  }

  // -------------------------------------------------------------------------
  // Pointer input
  // -------------------------------------------------------------------------

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private sendPointer(type: SimPointer["type"], e: PointerEvent) {
    if (!this.module?.pointer) return;
    const { x, y } = this.toLocal(e);
    this.module.pointer({ x, y, type, buttons: e.buttons });
  }

  private onPointerDown(e: PointerEvent) {
    if (typeof this.canvas.setPointerCapture === "function") {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer may already be gone */
      }
    }
    this.sendPointer("down", e);
  }

  private onPointerMove(e: PointerEvent) {
    this.sendPointer("move", e);
  }

  private onPointerUp(e: PointerEvent) {
    this.sendPointer("up", e);
  }

  private onPointerLeave(e: PointerEvent) {
    this.sendPointer("leave", e);
  }

  private onContextMenu(e: Event) {
    e.preventDefault();
  }

  private bindPointer() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private loop(now: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = clampDt(dt);

    if (this.module) {
      if (this.playing) {
        const sdt = dt * this.speed;
        this.ctx.time += sdt;
        this.module.step(sdt);
      }
      this.g.clearRect(0, 0, this.ctx.width, this.ctx.height);
      this.module.draw(this.g);
    }

    this.readoutAcc += dt;
    if (this.readoutAcc >= READOUT_INTERVAL) {
      this.readoutAcc = 0;
      if (this.module) this.onReadouts(this.module.getReadouts());
    }

    this.visualAcc += dt;
    if (this.visualAcc >= VISUAL_STATE_INTERVAL) {
      this.visualAcc = 0;
      this.emitVisualState();
    }
  }

  /** Emit the module's canonical visual state when it provides one. */
  private emitVisualState() {
    const state = this.module?.getVisualState?.() ?? null;
    if (state) this.onVisualState(state);
  }

  // -------------------------------------------------------------------------
  // Scene + controls
  // -------------------------------------------------------------------------

  /** Swap the active scene module; disposes the previous one. Throws on an
   * unknown engine id (never silently swaps to a different engine). */
  setScene(spec: SceneSpec) {
    const nextModule = createModule(spec.engineId);
    if (!nextModule) {
      throw new Error(`SimRunner: unknown engine id "${spec.engineId}"`);
    }
    this.module?.dispose();
    this.module = nextModule;
    this.ctx.time = 0;
    this.readoutAcc = 0;
    this.visualAcc = 0;
    this.module.init(this.ctx);
    this.module.reset(spec.seed ?? 1);
    if (spec.parameters) {
      for (const key of Object.keys(spec.parameters)) {
        this.module.setParameter(key, spec.parameters[key]);
      }
    }
    this.onReadouts(this.module.getReadouts());
    // Initial canonical state so coupled surfaces render defaults immediately
    // (the next loop emission may be a full interval away).
    this.emitVisualState();
  }

  setParam(key: string, value: number) {
    this.module?.setParameter(key, value);
  }

  setPlaying(playing: boolean) {
    if (this.playing === playing) return;
    this.playing = playing;
    this.last = 0;
  }

  setSpeed(multiplier: number) {
    this.speed = Math.max(0, multiplier);
  }

  reset() {
    this.module?.reset();
    if (this.module) this.onReadouts(this.module.getReadouts());
    // A reset re-seeds body positions; push the canonical state immediately so
    // coupled surfaces snap back without waiting for the next emission.
    this.emitVisualState();
  }

  getModule(): SimulationModule | null {
    return this.module;
  }

  private handleVisibility() {
    if (document.hidden) this.setPlaying(false);
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.ro = null;
    this.module?.dispose();
    this.module = null;
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    canvasOwners.delete(this.canvas);
  }
}
