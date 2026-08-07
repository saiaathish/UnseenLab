/**
 * gas — kinetic theory as elastic hard disks in a box.
 *
 * Temperature sets the mean speed of the Maxwell–Boltzmann-like distribution
 * (v ∝ √T); `speedScale` scales it linearly. Particles bounce elastically off
 * the walls and each other; `gravity` optionally pulls them down. Collisions
 * conserve kinetic energy exactly (equal masses exchange the normal component
 * of velocity), so the readouts stay physically consistent.
 *
 * Deterministic: particle placement and velocities come from a seeded PRNG
 * whose state is included in serializeState().
 */

import { makeStatefulRng, type StatefulRng } from "../rng";
import type { EngineMeta, Readout, SimulationModule, SimContext, SimPointer } from "../types";

export const GAS_META: EngineMeta = {
  id: "gas",
  title: "Kinetic Theory of Gases",
  parameterKeys: ["temperature", "particles", "gravity", "speedScale"],
  readoutKeys: ["avgSpeed", "collisions", "temperature"],
  defaults: { temperature: 1, particles: 140, gravity: 0, speedScale: 1 },
  bounds: {
    temperature: { min: 0.1, max: 10 },
    particles: { min: 2, max: 400 },
    gravity: { min: 0, max: 400 },
    speedScale: { min: 0.05, max: 20 },
  },
};

const RADIUS = 4;
const SUBSTEPS = 2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GasState {
  simTime: number;
  params: Record<string, number>;
  rngState: number;
  collisionCount: number;
  particles: Particle[];
}

export function createGas(): SimulationModule {
  const params: Record<string, number> = { ...GAS_META.defaults };
  let simTime = 0;
  let collisionCount = 0;
  let W = 800;
  let H = 600;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  let particles: Particle[] = [];
  let rng: StatefulRng = makeStatefulRng(1);
  const stir = { x: 0, y: 0, down: false };

  function layout() {
    const pad = Math.min(W, H) * 0.06;
    box = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
  }

  function seedParticles() {
    const base = 60 * Math.sqrt(params.temperature) * params.speedScale;
    const count = Math.round(params.particles);
    const half = Math.floor(count / 2);
    particles = [];
    for (let i = 0; i < count; i++) {
      // left/right halves so the mixing story is visible
      const left = i < half;
      const xMin = left ? box.x + RADIUS : box.x + box.w * 0.5 + RADIUS;
      const xMax = left ? box.x + box.w * 0.5 - RADIUS : box.x + box.w - RADIUS;
      const yMin = box.y + RADIUS;
      const yMax = box.y + box.h - RADIUS;
      particles.push({
        x: xMin + rng.next() * Math.max(1, xMax - xMin),
        y: yMin + rng.next() * Math.max(1, yMax - yMin),
        vx: (rng.next() * 2 - 1) * base,
        vy: (rng.next() * 2 - 1) * base,
      });
    }
  }

  function collidePairs() {
    const r2 = RADIUS * 2;
    const r2s = r2 * r2;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < r2s) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            a.vx += rel * nx;
            a.vy += rel * ny;
            b.vx -= rel * nx;
            b.vy -= rel * ny;
            collisionCount++;
          }
          // separate the overlap
          const overlap = r2 - d;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2;
          b.y += (ny * overlap) / 2;
        }
      }
    }
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      layout();
      seedParticles();
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
      layout();
      seedParticles();
    },

    step(dt: number) {
      const h = Math.min(dt, 0.033) / SUBSTEPS;
      simTime += Math.min(dt, 0.033);
      for (let s = 0; s < SUBSTEPS; s++) {
        for (const p of particles) {
          // optional pointer stir (repulsor)
          if (stir.down) {
            const dx = p.x - stir.x;
            const dy = p.y - stir.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 120 * 120 && d2 > 1) {
              const f = 1200 / d2;
              p.vx += (dx / Math.sqrt(d2)) * f;
              p.vy += (dy / Math.sqrt(d2)) * f;
            }
          }
          p.vy += params.gravity * h;
          p.x += p.vx * h;
          p.y += p.vy * h;
          if (p.x < box.x + RADIUS) {
            p.x = box.x + RADIUS;
            p.vx = Math.abs(p.vx);
          } else if (p.x > box.x + box.w - RADIUS) {
            p.x = box.x + box.w - RADIUS;
            p.vx = -Math.abs(p.vx);
          }
          if (p.y < box.y + RADIUS) {
            p.y = box.y + RADIUS;
            p.vy = Math.abs(p.vy);
          } else if (p.y > box.y + box.h - RADIUS) {
            p.y = box.y + box.h - RADIUS;
            p.vy = -Math.abs(p.vy);
          }
        }
        collidePairs();
      }
    },

    draw(g: CanvasRenderingContext2D) {
      g.strokeStyle = "rgba(148,163,184,0.35)";
      g.lineWidth = 1.5;
      g.strokeRect(box.x, box.y, box.w, box.h);

      let maxSp = 0.0001;
      const speeds: number[] = [];
      for (const p of particles) {
        const sp = Math.hypot(p.vx, p.vy);
        speeds.push(sp);
        maxSp = Math.max(maxSp, sp);
      }
      const half = Math.floor(particles.length / 2);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const hue = i < half ? 190 : 320; // colour by origin half
        const light = 0.42 + Math.min(0.4, (speeds[i] / (maxSp + 1)) * 0.5);
        g.fillStyle = `hsl(${hue}, 85%, ${light * 100}%)`;
        g.beginPath();
        g.arc(p.x, p.y, RADIUS, 0, Math.PI * 2);
        g.fill();
      }
    },

    setParameter(key: string, value: number) {
      const b = GAS_META.bounds[key];
      if (!b) return;
      const prev = params[key];
      params[key] = clamp(value, b.min, b.max);
      if (key === "temperature" || key === "speedScale") {
        // rescale velocities to the new target speed (energy ∝ T)
        const ratio =
          key === "temperature"
            ? Math.sqrt(params.temperature / Math.max(prev, 0.01))
            : params.speedScale / Math.max(prev, 0.01);
        for (const p of particles) {
          p.vx *= ratio;
          p.vy *= ratio;
        }
      } else if (key === "particles") {
        seedParticles();
      }
    },

    pointer(p: SimPointer) {
      stir.x = p.x;
      stir.y = p.y;
      stir.down = p.type === "down" || (p.type === "move" && stir.down);
      if (p.type === "up" || p.type === "leave") stir.down = false;
    },

    reset(seed?: number) {
      rng = makeStatefulRng(seed ?? 1);
      simTime = 0;
      collisionCount = 0;
      seedParticles();
    },

    getReadouts(): Readout[] {
      let sum = 0;
      for (const p of particles) sum += Math.hypot(p.vx, p.vy);
      return [
        { label: "Avg speed", value: (sum / Math.max(particles.length, 1)).toFixed(1), color: "#22d3ee" },
        { label: "Collisions", value: String(collisionCount) },
        { label: "Temperature", value: params.temperature.toFixed(2) + " ×" },
      ];
    },

    serializeState(): GasState {
      return {
        simTime,
        params: { ...params },
        rngState: rng.getState(),
        collisionCount,
        particles: particles.map((p) => ({ ...p })),
      };
    },

    restoreState(state: unknown) {
      const s = state as GasState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      rng.setState(s.rngState);
      collisionCount = s.collisionCount;
      particles = s.particles.map((p) => ({ ...p }));
      stir.down = false;
    },

    dispose() {
      particles = [];
    },
  };
}
