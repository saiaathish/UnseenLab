/**
 * primitive-3d — public surface of the direct Three.js primitive renderer.
 * Re-exports the renderer, the pure scene-graph builder, the pure operator
 * math, the material allowlist and all shared types.
 */

export {
  PrimitiveSceneRenderer,
  isCanvasOwned,
  clampDt,
  KIND_GEOMETRY_PLAN,
  MAX_DT,
  DPR_CAP,
  DPR_CAP_MOBILE,
} from "./renderer";
export type { RendererStatus } from "./types";
export { buildSceneGraph, isSafeColor, DEFAULT_COLOR } from "./scene-graph";
export type { BuildSceneGraphOptions } from "./scene-graph";
export {
  stepOperator,
  makeNodeState,
  validateOperatorParams,
  OPERATOR_SHAPES,
  OP_CLAMPS,
  CHANGE_COLOR_PALETTE,
  REDUCED_MOTION_DISABLED,
  REDUCED_MOTION_DISCRETE,
  clampNum,
} from "./operators";
export type {
  OperatorParams,
  OperatorShape,
  OperatorValidation,
  NodeState,
  ActiveOperator,
  StepOptions,
  Axis,
} from "./operators";
export {
  materialFor,
  makeLabelTexture,
  disposeMaterials,
  ALLOWED_MATERIAL_CLASSES,
  MAX_EMISSIVE_INTENSITY,
} from "./materials";
export type {
  SceneGraph,
  SceneGraphNode,
  SceneGraphRelationship,
  SceneGraphAnimation,
  SceneGraphLimits,
  PrimitiveSceneRendererOptions,
  RendererError,
} from "./types";
