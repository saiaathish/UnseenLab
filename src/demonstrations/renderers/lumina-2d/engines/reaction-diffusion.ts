/**
 * reaction_diffusion — Gray–Scott model of two reacting, diffusing chemicals.
 *
 * ∂U/∂t = dU·∇²U − UV² + f(1−U)
 * ∂V/∂t = dV·∇²V + UV² − (k+f)V
 *
 * Integrated with an explicit finite-difference update (dimensionless time
 * step 1 per iteration) on a fixed grid. A seeded PRNG places the initial
 * V-blotches, so the pattern is fully deterministic per seed.
 */

import { makeStatefulRng, type StatefulRng } from "../rng";
import type { EngineMeta, Readout, SimulationModule, SimContext, SimPointer } from "../types";

export const REACTION_META: EngineMeta = {
  id: "reaction_diffusion",
  title: "Reaction–Diffusion",
  parameterKeys: ["feed", "kill", "diffusionU", "diffusionV"],
  readoutKeys: ["pattern"],
  defaults: { feed: 0.037, kill: 0.06, diffusionU: 0.16, diffusionV: 0.08 },
  bounds: {
    feed: { min: 0.005, max: 0.2 },
    kill: { min: 0.005, max: 0.2 },
    diffusionU: { min: 0.01, max: 0.3 },
    diffusionV: { min: 0.01, max: 0.3 },
  },
};

export const RD_GRID_W = 160;
export const RD_GRID_H = 100;
const ITERS_PER_STEP = 8;
const SEED_BLOBS = 14;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface RdState {
  simTime: number;
  params: Record<string, number>;
  rngState: number;
  iteration: number;
  u: number[];
  v: number[];
}

export function createReactionDiffusion(): SimulationModule {
  const params: Record<string, number> = { ...REACTION_META.defaults };
  const GW = RD_GRID_W;
  const GH = RD_GRID_H;
  const N = GW * GH;

  let simTime = 0;
  let iteration = 0;
  let u = new Float32Array(N);
  let v = new Float32Array(N);
  let u2 = new Float32Array(N);
  let v2 = new Float32Array(N);
  let rng: StatefulRng = makeStatefulRng(1);
  let W = 800;
  let H = 600;
  let off: HTMLCanvasElement | null = null;
  let octx: CanvasRenderingContext2D | null = null;
  let img: ImageData | null = null;

  const idx = (i: number, j: number) => j * GW + i;

  function seedGrid() {
    u = new Float32Array(N);
    v = new Float32Array(N);
    u2 = new Float32Array(N);
    v2 = new Float32Array(N);
    u.fill(1);
    for (let n = 0; n < SEED_BLOBS; n++) {
      const cx = 8 + Math.floor(rng.next() * (GW - 16));
      const cy = 8 + Math.floor(rng.next() * (GH - 16));
      const r = 3 + Math.floor(rng.next() * 4);
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const x = cx + di;
          const y = cy + dj;
          if (x > 0 && y > 0 && x < GW - 1 && y < GH - 1 && di * di + dj * dj <= r * r) {
            v[idx(x, y)] = 0.85;
            u[idx(x, y)] = 0.2;
          }
        }
      }
    }
    iteration = 0;
  }

  function lap(arr: Float32Array, k: number): number {
    return (
      arr[k] * -1 +
      (arr[k - 1] + arr[k + 1] + arr[k - GW] + arr[k + GW]) * 0.2 +
      (arr[k - GW - 1] + arr[k - GW + 1] + arr[k + GW - 1] + arr[k + GW + 1]) * 0.05
    );
  }

  function react() {
    for (let j = 1; j < GH - 1; j++) {
      for (let i = 1; i < GW - 1; i++) {
        const k = idx(i, j);
        const uu = u[k];
        const vv = v[k];
        const uvv = uu * vv * vv;
        u2[k] = uu + (params.diffusionU * lap(u, k) - uvv + params.feed * (1 - uu));
        v2[k] = vv + (params.diffusionV * lap(v, k) + uvv - (params.kill + params.feed) * vv);
      }
    }
    let t = u;
    u = u2;
    u2 = t;
    t = v;
    v = v2;
    v2 = t;
    iteration++;
  }

  function ensurePixels() {
    if (img) return;
    try {
      const c = document.createElement("canvas");
      c.width = GW;
      c.height = GH;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      off = c;
      octx = ctx;
      img = ctx.createImageData(GW, GH);
    } catch {
      off = null;
      octx = null;
      img = null;
    }
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      ensurePixels();
      seedGrid();
      simTime = 0;
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
      ensurePixels();
      seedGrid();
      simTime = 0;
    },

    step(dt: number) {
      simTime += Math.min(dt, 0.05);
      for (let s = 0; s < ITERS_PER_STEP; s++) react();
    },

    draw(g: CanvasRenderingContext2D) {
      ensurePixels();
      if (img) {
        const d = img.data;
        for (let p = 0, k = 0; k < N; k++, p += 4) {
          const vv = clamp(v[k] * 2.4, 0, 1);
          let r: number;
          let gg: number;
          let b: number;
          if (vv < 0.5) {
            const t = vv / 0.5;
            r = 8 + t * 20;
            gg = 20 + t * 190;
            b = 40 + t * 200;
          } else {
            const t = (vv - 0.5) / 0.5;
            r = 28 + t * 220;
            gg = 210 - t * 80;
            b = 240;
          }
          d[p] = r;
          d[p + 1] = gg;
          d[p + 2] = b;
          d[p + 3] = 255;
        }
        octx!.putImageData(img, 0, 0);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(off!, 0, 0, GW, GH, 0, 0, W, H);
      } else {
        // headless fallback: coarse per-cell rects
        for (let j = 2; j < GH - 2; j += 2) {
          for (let i = 2; i < GW - 2; i += 2) {
            const vv = v[idx(i, j)];
            if (vv < 0.04) continue;
            const a = clamp(vv * 2.4, 0.1, 1);
            g.fillStyle = `rgba(34,211,238,${a})`;
            g.fillRect(i, j, 2, 2);
          }
        }
      }
    },

    setParameter(key: string, value: number) {
      const b = REACTION_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
    },

    pointer(p: SimPointer) {
      if (p.type !== "down" && p.type !== "move") return;
      const gi = Math.floor((p.x / Math.max(W, 1)) * GW);
      const gj = Math.floor((p.y / Math.max(H, 1)) * GH);
      const R = 4;
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const x = gi + di;
          const y = gj + dj;
          if (x > 0 && y > 0 && x < GW - 1 && y < GH - 1 && di * di + dj * dj <= R * R) {
            v[idx(x, y)] = 0.9;
            u[idx(x, y)] = 0.15;
          }
        }
      }
    },

    reset(seed?: number) {
      rng = makeStatefulRng(seed ?? 1);
      seedGrid();
      simTime = 0;
    },

    getReadouts(): Readout[] {
      // classify the pattern from V statistics
      let sum = 0;
      let sumSq = 0;
      let maxV = 0;
      for (let k = 0; k < N; k++) {
        const vv = v[k];
        sum += vv;
        sumSq += vv * vv;
        if (vv > maxV) maxV = vv;
      }
      const mean = sum / N;
      const std = Math.sqrt(Math.max(0, sumSq / N - mean * mean));
      const label = maxV < 0.05 ? "Uniform" : std < 0.05 ? "Faint" : mean < 0.05 ? "Sparse" : "Structured";
      return [{ label: "Pattern", value: label, color: "#22d3ee" }];
    },

    serializeState(): RdState {
      return {
        simTime,
        params: { ...params },
        rngState: rng.getState(),
        iteration,
        u: Array.from(u),
        v: Array.from(v),
      };
    },

    restoreState(state: unknown) {
      const s = state as RdState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      rng.setState(s.rngState);
      iteration = s.iteration;
      u = Float32Array.from(s.u);
      v = Float32Array.from(s.v);
      u2 = new Float32Array(N);
      v2 = new Float32Array(N);
    },

    dispose() {
      off = null;
      octx = null;
      img = null;
    },
  };
}
