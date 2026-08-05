/**
 * circuit — series RC circuit with numerical integration of the capacitor.
 *
 * dVc/dt = (Vtarget − Vc)/τ with τ = R·C, integrated with explicit Euler on
 * substeps (numerical integration, not the closed-form exponential — though
 * the two agree to within the step error). The demo switch alternates between
 * charging (target = supply voltage) and discharging (target = 0) on a
 * τ-based period, so both exponential curves stay on screen.
 */

import type { EngineMeta, Readout, SimulationModule, SimContext } from "../types";

export const CIRCUIT_META: EngineMeta = {
  id: "rc_circuit",
  title: "RC Circuit",
  parameterKeys: ["resistance", "capacitance", "voltage"],
  readoutKeys: ["voltage", "current", "charge"],
  defaults: { resistance: 1000, capacitance: 100e-6, voltage: 5 },
  bounds: {
    resistance: { min: 10, max: 1e6 },
    capacitance: { min: 1e-6, max: 0.01 },
    voltage: { min: 0.1, max: 100 },
  },
};

const SUBSTEPS = 8;
const SCOPE_MAX = 240;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface CircuitState {
  simTime: number;
  params: Record<string, number>;
  vc: number;
  charging: boolean;
  switchT: number;
}

export function createCircuit(): SimulationModule {
  const params: Record<string, number> = { ...CIRCUIT_META.defaults };
  let simTime = 0;
  let vc = 0;
  let charging = true;
  let switchT = 0;
  let scope: number[] = []; // interleaved [Vc, I] samples — display only
  let W = 800;
  let H = 600;

  const tau = () => params.resistance * params.capacitance;
  const target = () => (charging ? params.voltage : 0);

  function resetState() {
    vc = 0;
    charging = true;
    switchT = 0;
    scope = [];
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      resetState();
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
    },

    step(dt: number) {
      const h = Math.min(dt, 0.033);
      simTime += h;
      const t = tau();
      const period = clamp(t * 6, 1.4, 8);
      switchT += h;
      if (switchT > period) {
        switchT = 0;
        charging = !charging;
      }
      const hs = h / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) {
        vc += ((target() - vc) / t) * hs;
      }
      scope.push(vc, (target() - vc) / params.resistance);
      if (scope.length > SCOPE_MAX * 2) scope.splice(0, scope.length - SCOPE_MAX * 2);
    },

    draw(g: CanvasRenderingContext2D) {
      const x0 = W * 0.12;
      const x1 = W * 0.88;
      const y0 = H * 0.14;
      const y1 = y0 + Math.min(H * 0.44, 300);
      const midL = (y0 + y1) / 2;

      // loop
      g.strokeStyle = "rgba(148,163,184,0.75)";
      g.lineWidth = 3;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);

      // battery (left)
      g.strokeStyle = "#e2e8f0";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0 - 10, midL - 16);
      g.lineTo(x0 + 10, midL - 16);
      g.moveTo(x0 - 6, midL - 6);
      g.lineTo(x0 + 6, midL - 6);
      g.moveTo(x0 - 10, midL + 4);
      g.lineTo(x0 + 10, midL + 4);
      g.moveTo(x0 - 6, midL + 14);
      g.lineTo(x0 + 6, midL + 14);
      g.stroke();
      g.fillStyle = "rgba(148,163,184,0.9)";
      g.font = "12px monospace";
      g.fillText(params.voltage.toFixed(1) + "V", x0 - 40, midL + 4);

      // switch (top-left)
      const swx = x0 + (x1 - x0) * 0.35;
      g.strokeStyle = charging ? "#34d399" : "#64748b";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(swx - 16, y0);
      const ang = charging ? 0 : -0.5;
      g.lineTo(swx + Math.cos(ang) * 26 - 16, y0 + Math.sin(ang) * 26);
      g.stroke();

      // resistor (zigzag, top-right)
      const rx0 = (x0 + x1) / 2 + 6;
      const rx1 = x1 - 24;
      g.strokeStyle = "#fbbf24";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(rx0, y0);
      const seg = (rx1 - rx0) / 8;
      for (let i = 1; i <= 7; i++) {
        g.lineTo(rx0 + seg * i, y0 + (i % 2 === 0 ? -8 : 8));
      }
      g.lineTo(rx1, y0);
      g.stroke();

      // capacitor (right)
      g.strokeStyle = "#22d3ee";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x1 - 16, midL - 12);
      g.lineTo(x1 + 16, midL - 12);
      g.moveTo(x1 - 16, midL + 12);
      g.lineTo(x1 + 16, midL + 12);
      g.stroke();
      const chg = clamp(vc / params.voltage, 0, 1);
      g.fillStyle = "rgba(34,211,238,0.35)";
      g.fillRect(x1 - 14, midL - 12, 28, 4 * chg + 0.1);

      // current dots around the loop
      const perim = 2 * (x1 - x0) + 2 * (y1 - y0);
      const I = (target() - vc) / params.resistance;
      const Imax = params.voltage / params.resistance;
      const iNorm = clamp(Math.abs(I) / (Imax + 1e-12), 0, 1);
      const dir = I >= 0 ? 1 : -1;
      const gap = 40;
      const nDots = Math.max(4, Math.floor(perim / gap));
      const flow = (simTime * 60 * dir) % perim;
      for (let d = 0; d < nDots; d++) {
        const s = (((flow % perim) + perim) % perim + d * gap) % perim;
        const wTop = x1 - x0;
        const hR = y1 - y0;
        let px: number;
        let py: number;
        if (s < wTop) {
          px = x0 + s;
          py = y0;
        } else if (s < wTop + hR) {
          px = x1;
          py = y0 + (s - wTop);
        } else if (s < 2 * wTop + hR) {
          px = x1 - (s - wTop - hR);
          py = y1;
        } else {
          px = x0;
          py = y1 - (s - 2 * wTop - hR);
        }
        g.fillStyle = `rgba(165,243,252,${0.25 + iNorm * 0.7})`;
        g.beginPath();
        g.arc(px, py, 2.6, 0, Math.PI * 2);
        g.fill();
      }

      // oscilloscope traces
      const oy = y1 + Math.min(H * 0.1, 54);
      const oh = H - oy - Math.min(H * 0.06, 30);
      if (oh > 20) {
        g.strokeStyle = "rgba(148,163,184,0.25)";
        g.lineWidth = 1;
        g.strokeRect(x0, oy, x1 - x0, oh);
        const n = scope.length / 2;
        if (n > 1) {
          g.strokeStyle = "#22d3ee";
          g.lineWidth = 2;
          g.beginPath();
          for (let i = 0; i < n; i++) {
            const px = x0 + (i / (SCOPE_MAX - 1)) * (x1 - x0);
            const py = oy + oh - (scope[i * 2] / params.voltage) * oh * 0.92 - oh * 0.04;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.stroke();
          g.strokeStyle = "#fbbf24";
          g.beginPath();
          for (let i = 0; i < n; i++) {
            const px = x0 + (i / (SCOPE_MAX - 1)) * (x1 - x0);
            const py = oy + oh * 0.5 - (scope[i * 2 + 1] / (Imax + 1e-12)) * oh * 0.42;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.stroke();
        }
      }
    },

    setParameter(key: string, value: number) {
      const b = CIRCUIT_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
    },

    reset() {
      resetState();
      simTime = 0;
    },

    getReadouts(): Readout[] {
      const I = (target() - vc) / params.resistance;
      return [
        { label: "Voltage", value: vc.toFixed(2) + " V", color: "#22d3ee" },
        { label: "Current", value: (I * 1000).toFixed(2) + " mA", color: "#fbbf24" },
        { label: "Charge", value: (params.capacitance * vc * 1e6).toFixed(1) + " µC" },
      ];
    },

    serializeState(): CircuitState {
      return {
        simTime,
        params: { ...params },
        vc,
        charging,
        switchT,
      };
    },

    restoreState(state: unknown) {
      const s = state as CircuitState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      vc = s.vc;
      charging = s.charging;
      switchT = s.switchT;
      scope = [];
    },

    dispose() {
      scope = [];
    },
  };
}
