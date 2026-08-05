/**
 * cellular_automaton — Conway's Game of Life (rule B3/S23) on a toroidal grid.
 *
 * `speed` is generations per second (accumulated across frames, capped per
 * step), `density` is the initial fill probability. The initial field comes
 * from a seeded PRNG (state serialized for exact replay); the grid can also
 * be restored directly, which is how the glider-translation test injects a
 * known pattern.
 */

import { makeStatefulRng, type StatefulRng } from "../rng";
import type { EngineMeta, Readout, SimulationModule, SimContext, SimPointer } from "../types";

export const CA_META: EngineMeta = {
  id: "cellular_automaton",
  title: "Cellular Automata",
  parameterKeys: ["speed", "density"],
  readoutKeys: ["population", "generation"],
  defaults: { speed: 12, density: 0.28 },
  bounds: {
    speed: { min: 1, max: 30 },
    density: { min: 0, max: 1 },
  },
};

export const CA_COLS = 96;
export const CA_ROWS = 64;
const MAX_GENS_PER_STEP = 120;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface CaState {
  simTime: number;
  params: Record<string, number>;
  rngState: number;
  generation: number;
  population: number;
  acc: number;
  grid: number[];
}

export function createCellularAutomaton(): SimulationModule {
  const params: Record<string, number> = { ...CA_META.defaults };
  const COLS = CA_COLS;
  const ROWS = CA_ROWS;

  let simTime = 0;
  let generation = 0;
  let population = 0;
  let acc = 0;
  let grid = new Uint8Array(COLS * ROWS);
  let next = new Uint8Array(COLS * ROWS);
  let rng: StatefulRng = makeStatefulRng(1);
  let W = 800;
  let H = 600;
  let paint = 0; // 0 none, 1 draw, 2 erase

  const at = (c: number, r: number) => (((r + ROWS) % ROWS) * COLS + ((c + COLS) % COLS)) | 0;

  function seedGrid() {
    grid = new Uint8Array(COLS * ROWS);
    next = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = rng.next() < params.density ? 1 : 0;
    }
    generation = 0;
    population = 0;
    acc = 0;
  }

  function stepLife() {
    let pop = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let n = 0;
        n += grid[at(c - 1, r - 1)] + grid[at(c, r - 1)] + grid[at(c + 1, r - 1)];
        n += grid[at(c - 1, r)] + grid[at(c + 1, r)];
        n += grid[at(c - 1, r + 1)] + grid[at(c, r + 1)] + grid[at(c + 1, r + 1)];
        const k = r * COLS + c;
        const alive = grid[k] === 1;
        const live = alive ? n === 2 || n === 3 : n === 3;
        next[k] = live ? 1 : 0;
        if (live) pop++;
      }
    }
    const t = grid;
    grid = next;
    next = t;
    population = pop;
    generation++;
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      seedGrid();
      simTime = 0;
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
      seedGrid();
    },

    step(dt: number) {
      simTime += Math.min(dt, 0.05);
      acc += dt;
      const interval = 1 / clamp(params.speed, 1, 30);
      let guard = 0;
      while (acc >= interval && guard < MAX_GENS_PER_STEP) {
        stepLife();
        acc -= interval;
        guard++;
      }
    },

    draw(g: CanvasRenderingContext2D) {
      const cw = W / COLS;
      const ch = H / ROWS;
      const pad = Math.min(cw, ch) * 0.12;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!grid[r * COLS + c]) continue;
          g.fillStyle = "rgba(34,211,238,0.92)";
          const x = c * cw;
          const y = r * ch;
          g.fillRect(x + pad, y + pad, cw - pad * 2, ch - pad * 2);
        }
      }
    },

    setParameter(key: string, value: number) {
      const b = CA_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
      if (key === "density") seedGrid();
    },

    pointer(p: SimPointer) {
      if (p.type === "down") paint = p.buttons === 2 ? 2 : 1;
      else if (p.type === "up" || p.type === "leave") paint = 0;
      if (p.type === "move" && !paint) return;
      if (!paint && p.type !== "down") return;
      const c = Math.floor((p.x / Math.max(W, 1)) * COLS);
      const r = Math.floor((p.y / Math.max(H, 1)) * ROWS);
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS) {
        const val = paint === 2 ? 0 : 1;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) grid[at(c + dc, r + dr)] = val;
        }
      }
    },

    reset(seed?: number) {
      rng = makeStatefulRng(seed ?? 1);
      simTime = 0;
      seedGrid();
    },

    getReadouts(): Readout[] {
      return [
        { label: "Population", value: String(population), color: "#22d3ee" },
        { label: "Generation", value: String(generation) },
      ];
    },

    serializeState(): CaState {
      return {
        simTime,
        params: { ...params },
        rngState: rng.getState(),
        generation,
        population,
        acc,
        grid: Array.from(grid),
      };
    },

    restoreState(state: unknown) {
      const s = state as CaState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      rng.setState(s.rngState);
      generation = s.generation;
      acc = s.acc;
      grid = Uint8Array.from(s.grid);
      next = new Uint8Array(COLS * ROWS);
      population = 0;
      for (let i = 0; i < grid.length; i++) population += grid[i];
      paint = 0;
    },

    dispose() {
      /* no external resources */
    },
  };
}
