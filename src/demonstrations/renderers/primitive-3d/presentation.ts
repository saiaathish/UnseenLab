import type {
  DemoSpecV1,
  PrimitiveObjectSpec,
  RelationshipSpec,
  SceneSemanticSpec,
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
  /** FIX 3 semantic identity (additive). Present ONLY on entities whose object
   * carries semantic metadata — auto-derived fallback entities never include
   * these keys (existing guide output stays byte-identical). */
  name?: string;
  type?: string;
  shortDescription?: string;
  role?: string;
  interactive?: boolean;
  relationshipSummary?: string;
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

/**
 * FIX 3 semantic identity (root cause §4/§5): true when the object carries
 * explicit semantic metadata (the `semantic` block or the top-level
 * `role`/`description` shorthands). Such objects are author-intended
 * presentation subjects — uncapped, and exempt from the decorative-kind
 * exclusion (e.g. the orbit showcase's "Default orbit guide" ring).
 */
function hasSemanticMetadata(node: PrimitiveObjectSpec): boolean {
  return (
    node.semantic !== undefined ||
    node.role !== undefined ||
    node.description !== undefined
  );
}

/** The object's semantic block with the top-level `role`/`description`
 * shorthands merged in as fallbacks (the block wins), or undefined. */
function semanticOf(node: PrimitiveObjectSpec): SceneSemanticSpec | undefined {
  const block = node.semantic;
  const role = block?.role ?? node.role;
  const shortDescription = block?.shortDescription ?? node.description;
  if (block === undefined && role === undefined && shortDescription === undefined) {
    return undefined;
  }
  return {
    ...(block ?? {}),
    ...(role !== undefined ? { role } : {}),
    ...(shortDescription !== undefined ? { shortDescription } : {}),
  };
}

/**
 * One-sentence entity summary derived from the scene's own relationships
 * ("The planet orbits the star", "Gravity pulls the planet toward the star"):
 * every relationship touching the entity directly, or whose from/to is the
 * GROUP containing the entity, contributes its label. Distinct labels joined
 * in spec order; undefined when no relationship touches the entity.
 */
function derivedRelationshipSummary(
  nodeId: string,
  relationships: RelationshipSpec[],
  childrenOf: Map<string, string[]>
): string | undefined {
  const touching = relationships.filter((rel) => {
    if (rel.from === nodeId || rel.to === nodeId) return true;
    return (
      childrenOf.get(rel.from)?.includes(nodeId) === true ||
      childrenOf.get(rel.to)?.includes(nodeId) === true
    );
  });
  const labels = touching
    .map((rel) => rel.label?.trim() || humanize(rel.type).toLowerCase())
    .filter((label) => label.length > 0);
  const distinct = [...new Set(labels)];
  return distinct.length > 0 ? distinct.join(" ") : undefined;
}

/**
 * Human-readable guide shown around the canvas; uses original semantics.
 *
 * FIX 3 generalization (root cause §4/§5): when ANY object in the scene
 * carries semantic metadata, objects with metadata become learner-facing
 * entities for EVERY scene type (conceptual AND verified_simulation/hybrid),
 * uncapped, carrying their semantic identity (name/type/shortDescription/
 * role/interactive/relationshipSummary), and relationships are uncapped —
 * the relationship labels ARE the summaries. When NO object carries semantic
 * metadata the legacy auto-derived fallback runs byte-identically (max 5
 * entities, max 4 relationships, decorative kinds hidden), so existing
 * consumers see exactly what they saw before.
 */
export function stageGuideForSpec(spec: DemoSpecV1): StageGuide {
  const scene = spec.scene3d;
  if (!scene) return { entities: [], relationships: [] };

  const labels = new Map<string, string>();
  for (const node of scene.objects) {
    const semantic = semanticOf(node);
    labels.set(
      node.id,
      semantic?.name?.trim() || node.label?.trim() || fallbackObjectLabel(node)
    );
  }

  const childrenOf = new Map<string, string[]>();
  for (const node of scene.objects) {
    if (node.kind === "group" && Array.isArray(node.children)) {
      childrenOf.set(node.id, node.children);
    }
  }

  const semanticMode = scene.objects.some(hasSemanticMetadata);

  const entities: StageGuideEntity[] = [];
  let fallbackCount = 0;
  for (const node of scene.objects) {
    if (node.kind === "group") continue;
    const semantic = semanticOf(node);
    if (!semantic) {
      // Auto-derived fallback: decorative kinds hidden, capped at 5 — the
      // pre-FIX-3 behavior, kept byte-identical for no-semantic scenes.
      if (
        DECORATIVE_KINDS.has(
          node.kind as
            | "label"
            | "line"
            | "trail"
            | "orbit_path"
            | "graph_surface"
            | "process_edge"
            | "vector_field",
        )
      ) {
        continue;
      }
      if (fallbackCount >= 5) continue;
      fallbackCount++;
      entities.push({
        id: node.id,
        label: labels.get(node.id) ?? fallbackObjectLabel(node),
        color: node.color ?? "#72d6cc",
      });
      continue;
    }
    const summary =
      semantic.relationshipSummary?.trim() ||
      derivedRelationshipSummary(node.id, scene.relationships, childrenOf);
    entities.push({
      id: node.id,
      label:
        semantic.name?.trim() ||
        (labels.get(node.id) ?? fallbackObjectLabel(node)),
      color: node.color ?? "#72d6cc",
      ...(semantic.name !== undefined ? { name: semantic.name } : {}),
      ...(semantic.type !== undefined ? { type: semantic.type } : {}),
      ...(semantic.shortDescription !== undefined
        ? { shortDescription: semantic.shortDescription }
        : {}),
      ...(semantic.role !== undefined ? { role: semantic.role } : {}),
      ...(semantic.interactive !== undefined
        ? { interactive: semantic.interactive }
        : {}),
      ...(summary !== undefined ? { relationshipSummary: summary } : {}),
    });
  }

  // In semantic mode the relationship list is uncapped: each relationship's
  // label is the learner-facing summary ("The planet orbits the star").
  // Without semantic metadata the legacy 4-relationship cap applies.
  const relationshipCap = semanticMode ? scene.relationships.length : 4;
  const relationships = scene.relationships.slice(0, relationshipCap).map((rel) => ({
    id: rel.id,
    from: labels.get(rel.from) ?? humanize(rel.from),
    to: labels.get(rel.to) ?? humanize(rel.to),
    label: rel.label?.trim() || humanize(rel.type).toLowerCase(),
  }));

  return { entities, relationships };
}
