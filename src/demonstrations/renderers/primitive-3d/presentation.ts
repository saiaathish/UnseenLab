import type {
  DemoSpecV1,
  PrimitiveObjectSpec,
  RelationshipSpec,
} from "@/demonstrations/spec/demo-spec";

const DECORATIVE_KINDS = new Set([
  "label",
  "line",
  "trail",
  "orbit_path",
  "graph_surface",
  "process_edge",
  "vector_field",
] as const);

const EMPHASIZED_KINDS = new Set([
  "sphere",
  "box",
  "process_node",
  "energy_packet",
  "camera_marker",
] as const);

export interface StageGuideEntity {
  id: string;
  label: string;
  color: string;
}

export interface StageGuideRelationship {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface StageGuide {
  entities: StageGuideEntity[];
  relationships: StageGuideRelationship[];
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fallbackObjectLabel(node: PrimitiveObjectSpec): string {
  const idLabel = humanize(node.id);
  if (idLabel && !/^O?\d+$/.test(idLabel)) return idLabel;
  return humanize(node.kind);
}

function presentationObject(node: PrimitiveObjectSpec): PrimitiveObjectSpec {
  const label = node.label?.trim() || fallbackObjectLabel(node);
  const size =
    EMPHASIZED_KINDS.has(
      node.kind as "sphere" | "box" | "process_node" | "energy_packet" | "camera_marker",
    )
      ? Math.max(node.size ?? 1, 1.2)
      : node.size;

  return {
    ...node,
    ...(label ? { label } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

function renderableRelationship(rel: RelationshipSpec): RelationshipSpec {
  // PrimitiveSceneRenderer currently draws relationship edges for flow-like
  // operators. For a conceptual stage we map the *presentation copy* to that
  // visual edge primitive so qualitative relationships such as attracts,
  // inhibits, activates, orbits, and causes are visible instead of leaving
  // disconnected objects. The stored/validated spec remains unchanged.
  return rel.type === "flows_to" || rel.type === "transfers_to"
    ? rel
    : { ...rel, type: "flows_to" };
}

/**
 * Presentation-only adapter for conceptual scenes.
 *
 * It never changes the stored DemoSpec, trust level, controls, renderer kind,
 * simulation contract, or validation behavior. Verified simulations and
 * explanatory animations are returned by identity.
 */
export function presentationSpecForStage(spec: DemoSpecV1): DemoSpecV1 {
  if (spec.trust.level !== "conceptual_demonstration" || !spec.scene3d) {
    return spec;
  }

  return {
    ...spec,
    scene3d: {
      ...spec.scene3d,
      objects: spec.scene3d.objects.map(presentationObject),
      relationships: spec.scene3d.relationships.map(renderableRelationship),
    },
  };
}

/** Human-readable guide shown around the canvas; uses original semantics. */
export function stageGuideForSpec(spec: DemoSpecV1): StageGuide {
  const scene = spec.scene3d;
  if (!scene) return { entities: [], relationships: [] };

  const labels = new Map<string, string>();
  for (const node of scene.objects) {
    labels.set(node.id, node.label?.trim() || fallbackObjectLabel(node));
  }

  const entities = scene.objects
    .filter(
      (node) =>
        node.kind !== "group" &&
        !DECORATIVE_KINDS.has(
          node.kind as
            | "label"
            | "line"
            | "trail"
            | "orbit_path"
            | "graph_surface"
            | "process_edge"
            | "vector_field",
        ),
    )
    .slice(0, 5)
    .map((node) => ({
      id: node.id,
      label: labels.get(node.id) ?? fallbackObjectLabel(node),
      color: node.color ?? "#72d6cc",
    }));

  const relationships = scene.relationships.slice(0, 4).map((rel) => ({
    id: rel.id,
    from: labels.get(rel.from) ?? humanize(rel.from),
    to: labels.get(rel.to) ?? humanize(rel.to),
    label: rel.label?.trim() || humanize(rel.type).toLowerCase(),
  }));

  return { entities, relationships };
}
