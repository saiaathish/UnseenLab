/**
 * operators.ts — pure animation-operator validation and stepping math for the
 * primitive-3d namespace. No Three.js, no DOM, no WebGL: every function here
 * is deterministic and unit-testable.
 *
 * Semantics: stepOperator computes each operator's output from the node's
 * BASE state (captured at scene build time) and the absolute simulation time,
 * so the same time input always yields the same state (pausing, seeking and
 * speed changes are trivially correct). Between t and t+dt an operator that
 * advances at `speed` therefore moves by speed*dt — the incremental behaviour
 * falls out of the absolute-time formulation.
 */

import { ANIMATION_OPERATORS } from "@/demonstrations/spec/demo-spec";
import type { AnimationOperator, Vec3 } from "@/demonstrations/spec/demo-spec";

export type Axis = "x" | "y" | "z";

/** Validated, clamped operator parameters. */
export interface OperatorParams {
  /** Rate multiplier (rotate: rad/s, oscillate/pulse/scale: Hz, fade/reveal:
   * inverse seconds, translate: units per second * amplitude). Clamped [0,5]. */
  speed: number;
  /** Delay before the operator starts (ms). Clamped [0, 10000]. */
  delayMs: number;
  /** Axis of action; only for operators whose shape accepts it. */
  axis?: Axis;
  /** Oscillation amplitude (world units or factor). Clamped [0, 2]. */
  amplitude: number;
  /** follow_path waypoints — derived by the scene-graph layer. */
  path?: Vec3[];
  /** orbit operator — center and radius, derived from `orbits` relationships. */
  orbitCenter?: Vec3;
  orbitRadius?: number;
}

/** The parameter shape an operator accepts (others are ignored). */
export interface OperatorShape {
  accepts: Array<"speed" | "delayMs" | "axis" | "amplitude">;
  defaultAxis?: Axis;
}

/** Allowed parameter shapes for each of the 12 animation operators. */
export const OPERATOR_SHAPES: Record<AnimationOperator, OperatorShape> = {
  rotate: { accepts: ["speed", "delayMs", "axis"], defaultAxis: "y" },
  orbit: { accepts: ["speed", "delayMs", "axis"], defaultAxis: "y" },
  translate: { accepts: ["speed", "delayMs", "axis", "amplitude"], defaultAxis: "x" },
  oscillate: { accepts: ["speed", "delayMs", "axis", "amplitude"], defaultAxis: "x" },
  pulse: { accepts: ["speed", "delayMs", "amplitude"] },
  follow_path: { accepts: ["speed", "delayMs"] },
  emit: { accepts: ["speed", "delayMs"] },
  fade: { accepts: ["speed", "delayMs"] },
  reveal: { accepts: ["speed", "delayMs"] },
  scale: { accepts: ["speed", "delayMs", "amplitude"] },
  change_color: { accepts: ["speed", "delayMs"] },
  update_vector: { accepts: ["speed", "delayMs", "axis"], defaultAxis: "y" },
};

/** Hard clamp ranges applied to every operator parameter. */
export const OP_CLAMPS = {
  maxSpeed: 5,
  maxAmplitude: 2,
  maxDelayMs: 10_000,
} as const;

export const TAU = Math.PI * 2;

/** Safe palette change_color cycles through (never the renderer default). */
export const CHANGE_COLOR_PALETTE = [
  "#ff5252",
  "#ffb300",
  "#66bb6a",
  "#29b6f6",
  "#ab47bc",
  "#26c6da",
] as const;

/**
 * Operators that are disabled under reduced motion (strobing/high-motion
 * effects). fade/reveal are instead evaluated as discrete steps.
 */
export const REDUCED_MOTION_DISABLED: ReadonlySet<AnimationOperator> =
  new Set(["oscillate", "pulse", "emit"]);

export const REDUCED_MOTION_DISCRETE: ReadonlySet<AnimationOperator> =
  new Set(["fade", "reveal"]);

export function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clampNum(value, 0, 1);
}

export type OperatorValidation =
  | { ok: true; params: OperatorParams; reasons: string[] }
  | { ok: false; reasons: string[] };

/**
 * Validate + clamp raw animation parameters against the operator's shape.
 * Numeric overages are repaired (clamped) with an "operator_param_clamped"
 * reason; unknown operators and unknown axes are rejected outright.
 */
export function validateOperatorParams(input: {
  operator: string;
  speed?: number;
  delayMs?: number;
  axis?: string;
  amplitude?: number;
}): OperatorValidation {
  const shape = OPERATOR_SHAPES[input.operator as AnimationOperator];
  if (!shape || !(ANIMATION_OPERATORS as readonly string[]).includes(input.operator)) {
    return { ok: false, reasons: ["unknown_animation_operator"] };
  }
  const reasons: string[] = [];
  const uses = (p: "speed" | "delayMs" | "axis" | "amplitude") =>
    shape.accepts.includes(p);

  let speed = input.speed === undefined ? 1 : input.speed;
  if (uses("speed")) {
    if (!Number.isFinite(speed)) {
      speed = 1;
      reasons.push("operator_param_clamped");
    } else if (speed !== clampNum(speed, 0, OP_CLAMPS.maxSpeed)) {
      speed = clampNum(speed, 0, OP_CLAMPS.maxSpeed);
      reasons.push("operator_param_clamped");
    }
  }

  let delayMs = input.delayMs === undefined ? 0 : input.delayMs;
  if (uses("delayMs")) {
    if (!Number.isFinite(delayMs)) {
      delayMs = 0;
      reasons.push("operator_param_clamped");
    } else if (delayMs !== clampNum(delayMs, 0, OP_CLAMPS.maxDelayMs)) {
      delayMs = clampNum(delayMs, 0, OP_CLAMPS.maxDelayMs);
      reasons.push("operator_param_clamped");
    }
  }

  let amplitude = input.amplitude === undefined ? 1 : input.amplitude;
  if (uses("amplitude")) {
    if (!Number.isFinite(amplitude)) {
      amplitude = 1;
      reasons.push("operator_param_clamped");
    } else if (amplitude !== clampNum(amplitude, 0, OP_CLAMPS.maxAmplitude)) {
      amplitude = clampNum(amplitude, 0, OP_CLAMPS.maxAmplitude);
      reasons.push("operator_param_clamped");
    }
  }

  let axis: Axis | undefined;
  if (input.axis === undefined) {
    axis = shape.defaultAxis;
  } else if (input.axis === "x" || input.axis === "y" || input.axis === "z") {
    if (uses("axis")) axis = input.axis;
  } else {
    return { ok: false, reasons: ["operator_axis_rejected"] };
  }

  return {
    ok: true,
    params: { speed, delayMs, axis, amplitude },
    reasons,
  };
}

/**
 * NodeState — the animated properties of one scene node plus an immutable
 * `base` snapshot taken at scene build time. Operators derive from `base` and
 * absolute `time`, so composition is order-safe and time is the single source
 * of truth.
 */
export interface NodeState {
  position: Vec3;
  /** Euler angles in radians. */
  rotation: Vec3;
  /** Uniform scale factor. */
  scale: number;
  /** 0..1 */
  opacity: number;
  color: string;
  /** Whether the node is emitting (particles/trails). */
  emitting: boolean;
  /** Unit direction (vector_field / process_edge / energy_packet). */
  vector: Vec3;
  base: {
    position: Vec3;
    rotation: Vec3;
    scale: number;
    opacity: number;
    color: string;
    vector: Vec3;
  };
}

export function makeNodeState(init?: {
  position?: Vec3;
  color?: string;
  vector?: Vec3;
}): NodeState {
  const position = { x: 0, y: 0, z: 0, ...(init?.position ?? {}) };
  const rotation = { x: 0, y: 0, z: 0 };
  const color = init?.color ?? "#5b8def";
  const vector = init?.vector ? { ...init.vector } : { x: 0, y: 1, z: 0 };
  return {
    position: { ...position },
    rotation: { ...rotation },
    scale: 1,
    opacity: 1,
    color,
    emitting: false,
    vector: { ...vector },
    base: {
      position: { ...position },
      rotation,
      scale: 1,
      opacity: 1,
      color,
      vector: { ...vector },
    },
  };
}

export interface ActiveOperator {
  operator: AnimationOperator;
  params: OperatorParams;
}

export interface StepOptions {
  /** Reduced motion: oscillate/pulse/emit freeze; fade/reveal jump discretely. */
  reducedMotion?: boolean;
}

function elapsedAfterDelay(time: number, delayMs: number): number {
  const t = time * 1000 - delayMs;
  return Math.max(0, Number.isFinite(t) ? t : 0) / 1000;
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function rotateVec3(v: Vec3, axis: Axis, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let x = v.x;
  let y = v.y;
  let z = v.z;
  if (axis === "x") {
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  } else if (axis === "y") {
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx;
    z = nz;
  } else {
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function cloneState(state: NodeState): NodeState {
  return {
    position: { ...state.position },
    rotation: { ...state.rotation },
    scale: state.scale,
    opacity: state.opacity,
    color: state.color,
    emitting: state.emitting,
    vector: { ...state.vector },
    base: state.base,
  };
}

function stepOscillate(
  params: OperatorParams,
  state: NodeState,
  elapsed: number
): Partial<NodeState> {
  const axis = params.axis ?? "x";
  const offset =
    params.amplitude * Math.sin(TAU * params.speed * elapsed);
  return {
    position: { ...state.base.position, [axis]: state.base.position[axis] + offset },
  };
}

function stepFollowPath(
  params: OperatorParams,
  state: NodeState,
  elapsed: number
): Partial<NodeState> {
  const path = params.path;
  if (!path || path.length < 2) return { position: { ...state.position } };
  const n = path.length;
  const u = params.speed * elapsed;
  const seg = Math.floor(u) % n;
  const f = u - Math.floor(u);
  return {
    position: lerp3(path[seg], path[(seg + 1) % n], f),
  };
}

function stepOrbit(
  params: OperatorParams,
  state: NodeState,
  elapsed: number
): Partial<NodeState> {
  const axis = params.axis ?? "y";
  const center = params.orbitCenter ?? { x: 0, y: 0, z: 0 };
  let theta0: number;
  let radius: number;
  if (axis === "x") {
    theta0 = Math.atan2(
      state.base.position.z - center.z,
      state.base.position.y - center.y
    );
    radius = Math.hypot(
      state.base.position.y - center.y,
      state.base.position.z - center.z
    );
  } else if (axis === "z") {
    theta0 = Math.atan2(
      state.base.position.y - center.y,
      state.base.position.x - center.x
    );
    radius = Math.hypot(
      state.base.position.x - center.x,
      state.base.position.y - center.y
    );
  } else {
    theta0 = Math.atan2(
      state.base.position.z - center.z,
      state.base.position.x - center.x
    );
    radius = Math.hypot(
      state.base.position.x - center.x,
      state.base.position.z - center.z
    );
  }
  if (params.orbitRadius !== undefined) radius = params.orbitRadius;
  radius = Math.max(0.001, radius);
  const theta = theta0 + params.speed * elapsed;
  const r = radius;
  if (axis === "x") {
    return {
      position: {
        x: state.base.position.x,
        y: center.y + r * Math.cos(theta),
        z: center.z + r * Math.sin(theta),
      },
    };
  }
  if (axis === "z") {
    return {
      position: {
        x: center.x + r * Math.cos(theta),
        y: center.y + r * Math.sin(theta),
        z: state.base.position.z,
      },
    };
  }
  return {
    position: {
      x: center.x + r * Math.cos(theta),
      y: state.base.position.y,
      z: center.z + r * Math.sin(theta),
    },
  };
}

/**
 * Advance one operator on a node state. Pure: same (op, state, time) always
 * yields the same result; `dt` is honoured in the sense that between t and
 * t+dt the state advances by speed*dt.
 */
export function stepOperator(
  op: ActiveOperator,
  state: NodeState,
  _dt: number,
  time: number,
  opts?: StepOptions
): NodeState {
  const reduced = !!opts?.reducedMotion;
  if (reduced && REDUCED_MOTION_DISABLED.has(op.operator)) {
    return cloneState(state);
  }

  const params = op.params;
  const elapsed = elapsedAfterDelay(time, params.delayMs);
  const out = cloneState(state);

  switch (op.operator) {
    case "rotate": {
      const axis = params.axis ?? "y";
      out.rotation = {
        ...out.rotation,
        [axis]: state.base.rotation[axis] + params.speed * elapsed,
      };
      break;
    }
    case "orbit": {
      Object.assign(out, stepOrbit(params, state, elapsed));
      break;
    }
    case "translate": {
      const axis = params.axis ?? "x";
      out.position = {
        ...out.position,
        [axis]:
          state.base.position[axis] + params.speed * params.amplitude * elapsed,
      };
      break;
    }
    case "oscillate": {
      Object.assign(out, stepOscillate(params, state, elapsed));
      break;
    }
    case "pulse": {
      out.opacity = clamp01(
        0.5 + 0.5 * params.amplitude * Math.sin(TAU * params.speed * elapsed)
      );
      break;
    }
    case "follow_path": {
      Object.assign(out, stepFollowPath(params, state, elapsed));
      break;
    }
    case "emit": {
      // On only once the delay has actually passed (elapsedAfterDelay clamps
      // to 0 before the delay, which would make `elapsed >= 0` always true).
      out.emitting = time * 1000 >= params.delayMs;
      break;
    }
    case "fade": {
      if (reduced) {
        // Discrete step: visible until the fade duration elapses, then gone.
        out.opacity =
          elapsed * params.speed >= 1 ? 0 : state.base.opacity;
      } else {
        out.opacity = clamp01(
          state.base.opacity * (1 - params.speed * elapsed)
        );
      }
      break;
    }
    case "reveal": {
      if (reduced) {
        // Discrete step: hidden until the reveal duration elapses, then shown.
        out.opacity =
          elapsed * params.speed >= 1 ? state.base.opacity : 0;
      } else {
        out.opacity = clamp01(state.base.opacity * params.speed * elapsed);
      }
      break;
    }
    case "scale": {
      out.scale = Math.max(
        0.01,
        state.base.scale * (1 + params.amplitude * Math.sin(TAU * params.speed * elapsed))
      );
      break;
    }
    case "change_color": {
      const palette = CHANGE_COLOR_PALETTE;
      out.color = palette[Math.floor(params.speed * elapsed) % palette.length];
      break;
    }
    case "update_vector": {
      const axis = params.axis ?? "y";
      out.vector = rotateVec3(state.base.vector, axis, params.speed * elapsed);
      break;
    }
    default: {
      // Compile-time exhaustiveness: adding a new ANIMATION_OPERATOR without
      // a case here stops typechecking.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const never: never = op.operator;
      return out;
    }
  }
  return out;
}
