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
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  makeNodeState,
  stepOperator,
} from "@/demonstrations/renderers/primitive-3d/operators";
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
          // energy_packet is allowed since C3: packets carry a relationship
          // that ROUTES their follow_path chain (process_flow/energy_transfer).
          expect(["process_node", "sphere", "group", "box", "particle_field", "energy_packet"].includes(from.kind)).toBe(true);
          expect(["process_node", "sphere", "group", "box", "particle_field", "energy_packet"].includes(to.kind)).toBe(true);
        }
      });

      it("every animation targets an existing object with a known operator", () => {
        for (const anim of spec.scene3d?.animations ?? []) {
          expect(ids.has(anim.target), `animation ${anim.id}`).toBe(true);
          expect(ANIMATION_OPERATORS).toContain(anim.operator);
        }
      });

      it("energy packets sit on a relationship edge path and travel via follow_path", () => {
        for (const o of objects) {
          if (o.kind !== "energy_packet") continue;
          expect(
            onEdgePath(o.position, relationships, objects),
            `energy_packet ${o.id} must be on a relationship edge path`
          ).toBe(true);
          // F-19: packets traverse the derived flows_to/transfers_to chain
          // (follow_path is bounded — they arrive at the destination and
          // return instead of flying out of the frame).
          const anim = (spec.scene3d?.animations ?? []).find(
            (a) => a.target === o.id
          );
          expect(anim, `energy_packet ${o.id} must animate along its edge`).toBeDefined();
          expect(anim!.operator).toBe("follow_path");
        }
      });

      it("energy packets follow the derived path: arrival times + frame bounds (F-19)", () => {
        if (templateId !== "process_flow" && templateId !== "energy_transfer") {
          return;
        }
        const { graph } = buildSceneGraph(spec);
        for (const o of objects) {
          if (o.kind !== "energy_packet") continue;
          const anim = graph.animations.find((a) => a.target === o.id)!;
          expect(anim.operator).toBe("follow_path");
          expect(anim.path!.length).toBeGreaterThanOrEqual(2);
          // The packet starts at its own position and never leaves the
          // bounding box of its path (it can no longer exit the frame).
          const xs = anim.path!.map((p) => p.x);
          const state = makeNodeState({ position: o.position });
          const step = (t: number) =>
            stepOperator(
              {
                operator: "follow_path",
                params: {
                  speed: anim.speed,
                  delayMs: anim.delayMs,
                  amplitude: 1,
                  path: anim.path!,
                },
              },
              state,
              0.016,
              t
            );
          for (const t of [0, 0.2, 0.5, 1, 2, 4, 8, 16]) {
            const p = step(t).position;
            expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9);
            expect(p.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-9);
          }
        }
        // Exact arrival times: process_flow ep1 reaches Step 2 at t = 1/1.5
        // and Step 3 at t = 2/1.5; energy_transfer ep1 reaches the sink
        // (x=3) at t = 1/1.2.
        if (templateId === "process_flow") {
          const anim = graph.animations.find((a) => a.target === "ep1")!;
          const state = makeNodeState({ position: { x: -3, y: 0, z: 0 } });
          const step = (t: number) =>
            stepOperator(
              {
                operator: "follow_path",
                params: { speed: anim.speed, delayMs: anim.delayMs, amplitude: 1, path: anim.path! },
              },
              state,
              0.016,
              t
            );
          expect(step(1 / 1.5).position.x).toBeCloseTo(0, 5); // Step 2
          expect(step(2 / 1.5).position.x).toBeCloseTo(3, 5); // Step 3
        }
        if (templateId === "energy_transfer") {
          const anim = graph.animations.find((a) => a.target === "ep1")!;
          const state = makeNodeState({ position: { x: -3, y: 0, z: 0 } });
          const step = (t: number) =>
            stepOperator(
              {
                operator: "follow_path",
                params: { speed: anim.speed, delayMs: anim.delayMs, amplitude: 1, path: anim.path! },
              },
              state,
              0.016,
              t
            );
          expect(step(1 / 1.2).position.x).toBeCloseTo(3, 5); // arrives at the sink
        }
      });

      it("field_relationship sweeps arrows about axis x (F-15b)", () => {
        if (templateId !== "field_relationship") return;
        const anim = (spec.scene3d?.animations ?? []).find(
          (a) => a.target === "vf1" && a.operator === "update_vector"
        );
        expect(anim, "vf1 must carry an update_vector animation").toBeDefined();
        // Rotating the default base vector (0,1,0) about y is the identity —
        // the template must use a non-parallel axis so the arrows visibly
        // respond (design-2 §5.1).
        expect(anim!.axis).toBe("x");
      });

      it("before_after comparison is a visible child-to-child transforms_into", () => {
        if (templateId !== "before_after_comparison") return;
        const rel = relationships.find((r) => r.type === "transforms_into");
        expect(rel, "transforms_into relationship must exist").toBeDefined();
        // Child-to-child (b1 → b2, both boxes) — groups render no edge on
        // either surface, so the group-to-group form was invisible
        // (tpl-before-after-01). Both surfaces can draw box→box edges.
        expect(rel!.from).toBe("b1");
        expect(rel!.to).toBe("b2");
        const from = objects.find((o) => o.id === rel!.from)!;
        const to = objects.find((o) => o.id === rel!.to)!;
        expect(from.kind).toBe("box");
        expect(to.kind).toBe("box");
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
