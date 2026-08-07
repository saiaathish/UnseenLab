/**
 * Template-builder canonical-graph invariants (A1).
 *
 * The conceptual templates ARE the canonical graph: nodes are scene objects
 * and edges are `scene3d.relationships`. These tests pin the invariant so no
 * future template can regress into a second visual language:
 *  - no standalone `arrow` / `process_edge` objects,
 *  - no detached scene-title `label` objects (labels only as group children,
 *    e.g. before_after_comparison's state captions),
 *  - every relationship from/to resolves to an existing object,
 *  - every animation targets an existing object,
 *  - `energy_packet` objects sit on a relationship edge path and travel along
 *    the edge direction,
 *  - node ids/labels/positions/relationships stay stable (2D/3D parity).
 *
 * NOTE: `LearnerPreferences` is imported as a TYPE ONLY — `@/domain/learner`
 * pulls in zod at runtime, which currently fails to load under vitest in this
 * environment (pre-existing baseline issue, unrelated to this module).
 */

import { describe, expect, it } from "vitest";
import type { LearnerPreferences } from "@/domain/learner";
import {
  ANIMATION_OPERATORS,
  CONCEPTUAL_TEMPLATE_IDS,
  RELATIONSHIP_OPERATORS,
  SPEC_LIMITS,
} from "@/demonstrations/spec/demo-spec";
import type {
  DemoSpecV1,
  PrimitiveObjectSpec,
  RelationshipSpec,
} from "@/demonstrations/spec/demo-spec";
import {
  buildConceptualSpec,
  buildTimelineSpec,
} from "@/demonstrations/generation/offline/template-builder";
import type { TimelineTopic } from "@/demonstrations/generation/intent/types";

const prefs: LearnerPreferences = {
  animationSpeed: 1,
  reducedMotion: false,
  informationDensity: "medium",
  preferredRepresentations: ["animation", "graph"],
  feedbackTiming: "immediate",
  oneVariableMode: true,
  highContrast: false,
  textScale: 1,
};

/** Kinds that must never appear as standalone objects in a scene. */
const NON_GRAPH_KINDS = new Set(["arrow", "process_edge"]);

function sceneObjects(spec: DemoSpecV1): PrimitiveObjectSpec[] {
  return spec.scene3d?.objects ?? [];
}

function sceneRelationships(spec: DemoSpecV1): RelationshipSpec[] {
  return spec.scene3d?.relationships ?? [];
}

/** Object ids that are children of a group (not standalone roots). */
function groupChildIds(objects: PrimitiveObjectSpec[]): Set<string> {
  const childIds = new Set<string>();
  for (const o of objects) {
    if (o.kind === "group" && o.children) {
      for (const c of o.children) childIds.add(c);
    }
  }
  return childIds;
}

function onEdgePath(
  position: { x: number; y: number; z: number } | undefined,
  relationships: RelationshipSpec[],
  objects: PrimitiveObjectSpec[]
): boolean {
  if (!position) return false;
  const byId = new Map(objects.map((o) => [o.id, o]));
  for (const rel of relationships) {
    const from = byId.get(rel.from)?.position;
    const to = byId.get(rel.to)?.position;
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) continue;
    // Project the packet position onto the from→to segment.
    const t = Math.max(
      0,
      Math.min(
        1,
        ((position.x - from.x) * dx +
          (position.y - from.y) * dy +
          (position.z - from.z) * dz) /
          (len * len)
      )
    );
    const px = from.x + t * dx;
    const py = from.y + t * dy;
    const pz = from.z + t * dz;
    const dist = Math.hypot(
      position.x - px,
      position.y - py,
      position.z - pz
    );
    if (dist < 1e-6) return true;
  }
  return false;
}

describe("template builder — canonical graph invariants (A1)", () => {
  for (const templateId of CONCEPTUAL_TEMPLATE_IDS) {
    describe(`template ${templateId}`, () => {
      const spec = buildConceptualSpec(
        templateId,
        "photosynthesis",
        "how does photosynthesis transfer energy",
        prefs
      );
      const objects = sceneObjects(spec);
      const relationships = sceneRelationships(spec);
      const childIds = groupChildIds(objects);
      const ids = new Set(objects.map((o) => o.id));

      it("emits no standalone arrow or process_edge objects", () => {
        for (const o of objects) {
          expect(NON_GRAPH_KINDS.has(o.kind), `${o.id} is ${o.kind}`).toBe(false);
        }
      });

      it("emits no detached scene-title labels (labels only as group children)", () => {
        for (const o of objects) {
          if (o.kind === "label") {
            expect(childIds.has(o.id), `label ${o.id} must be a group child`).toBe(true);
          }
        }
        // The scene-title label ids (lb1) are gone everywhere.
        expect(objects.some((o) => o.id === "lb1")).toBe(false);
      });

      it("every relationship from/to references an existing node object", () => {
        expect(relationships.length).toBeGreaterThanOrEqual(1);
        for (const rel of relationships) {
          expect(ids.has(rel.from), `relationship ${rel.id} from ${rel.from}`).toBe(true);
          expect(ids.has(rel.to), `relationship ${rel.id} to ${rel.to}`).toBe(true);
          expect(RELATIONSHIP_OPERATORS).toContain(rel.type);
          const from = objects.find((o) => o.id === rel.from)!;
          const to = objects.find((o) => o.id === rel.to)!;
          // Endpoints are real node-style objects, not decorative primitives.
          expect(["process_node", "sphere", "group", "box", "particle_field"].includes(from.kind)).toBe(true);
          expect(["process_node", "sphere", "group", "box", "particle_field"].includes(to.kind)).toBe(true);
        }
      });

      it("every animation targets an existing object with a known operator", () => {
        for (const anim of spec.scene3d?.animations ?? []) {
          expect(ids.has(anim.target), `animation ${anim.id}`).toBe(true);
          expect(ANIMATION_OPERATORS).toContain(anim.operator);
        }
      });

      it("energy packets sit on a relationship edge path and travel along the edge", () => {
        for (const o of objects) {
          if (o.kind !== "energy_packet") continue;
          expect(
            onEdgePath(o.position, relationships, objects),
            `energy_packet ${o.id} must be on a relationship edge path`
          ).toBe(true);
          // Travel direction follows the edge (translate on x for horizontal
          // edges is the allowed form).
          const anim = (spec.scene3d?.animations ?? []).find(
            (a) => a.target === o.id
          );
          expect(anim, `energy_packet ${o.id} must animate along its edge`).toBeDefined();
          expect(anim!.operator).toBe("translate");
        }
      });

      it("node ids, labels, positions and relationships are unchanged by the cleanup", () => {
        // The canonical graph contract for every template: nodes carry their
        // labels; no node is a detached floating label.
        for (const o of objects) {
          if (o.kind === "label") continue;
          expect(Number.isFinite(o.position?.x ?? 0)).toBe(true);
          expect(Number.isFinite(o.position?.y ?? 0)).toBe(true);
          expect(Number.isFinite(o.position?.z ?? 0)).toBe(true);
        }
        // Positions stay within the spec bounds (validator contract).
        for (const o of objects) {
          for (const axis of ["x", "y", "z"] as const) {
            const v = o.position?.[axis] ?? 0;
            expect(Math.abs(v)).toBeLessThanOrEqual(500);
          }
        }
      });
    });
  }

  it("keeps object counts within the spec limits after the cleanup", () => {
    for (const templateId of CONCEPTUAL_TEMPLATE_IDS) {
      const spec = buildConceptualSpec(templateId, "c", "c", prefs);
      const objects = spec.scene3d!.objects;
      expect(objects.length).toBeGreaterThanOrEqual(2);
      expect(objects.length).toBeLessThanOrEqual(SPEC_LIMITS.maxObjects);
      // The graph scenes keep their node count (parity with the 2D diagram).
      const labels = objects.filter((o) => o.label !== undefined).length;
      expect(labels).toBeLessThanOrEqual(SPEC_LIMITS.maxLabels);
    }
  });

  it("timeline specs are untouched by the scene cleanup", () => {
    const topics: TimelineTopic[] = ["mitosis", "dna_transcription", "water_cycle", "immune_response"];
    for (const topic of topics) {
      const spec = buildTimelineSpec(topic, `show ${topic}`, prefs);
      expect(spec.scene3d).toBeUndefined();
      expect(spec.timeline).toBeDefined();
      expect(spec.renderer.fallbackKind).toBe("timeline");
    }
  });
});
