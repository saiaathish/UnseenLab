/**
 * AccessibleDiagram parity (A1): the 2D diagram renders ONLY the canonical
 * graph — node objects + relationship edges. Decorative `arrow` /
 * `process_edge` / detached `label` objects must never appear as shapes, and
 * `inhibits` edges end in a `—|` bar instead of an arrowhead (matching the
 * 3D stage).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { AccessibleDiagram } from "@/components/demonstrations/accessible-representation";

function makeSpec(scene?: Partial<NonNullable<DemoSpecV1["scene3d"]>>): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "diagram-test",
    generationId: "g-1",
    userQuery: "test",
    normalizedConcept: "test",
    title: "Cause and effect",
    learningObjective: "Test",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: [],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 4 / 3,
      background: "dark",
    },
    scene3d: scene
      ? {
          objects: scene.objects ?? [],
          relationships: scene.relationships ?? [],
          animations: scene.animations ?? [],
        }
      : undefined,
    controls: [],
    prediction: { prompt: "?", options: ["a", "b"] },
    observationPrompts: [],
    representations: [],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "template_composition",
      templateIds: [],
      generatedAt: "2026-08-07T00:00:00Z",
    },
    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesDesktop,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}

describe("AccessibleDiagram — canonical graph parity", () => {
  it("draws only node objects + relationship edges (filters arrows/process_edges/labels)", () => {
    const spec = makeSpec({
      objects: [
        { id: "a", kind: "process_node", label: "Cause A", position: { x: -3, y: 1, z: 0 } },
        { id: "b", kind: "process_node", label: "Effect B", position: { x: 0, y: 1, z: 0 } },
        { id: "ar1", kind: "arrow", position: { x: -1.5, y: 1, z: 0 } },
        { id: "pe1", kind: "process_edge", position: { x: -1.5, y: 1, z: 0 } },
        { id: "lb1", kind: "label", label: "Cause and effect", position: { x: 0, y: 2.4, z: 0 } },
      ],
      relationships: [{ id: "r1", type: "causes", from: "a", to: "b", label: "causes" }],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);

    // The diagram is announced with the object/relationship summary.
    expect(
      screen.getByRole("img", { name: /Relationship diagram\. 2 objects and 1 relationship/ })
    ).toBeInTheDocument();

    // Node labels render; the detached title label and decorative ids don't.
    expect(container.textContent).toContain("Cause A");
    expect(container.textContent).toContain("Effect B");
    expect(container.textContent).not.toContain("Cause and effect");
    expect(container.textContent).not.toContain("ar1");
    expect(container.textContent).not.toContain("pe1");

    // Exactly two node shapes (circles) and one edge.
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelectorAll("polygon")).toHaveLength(1); // arrowhead
    expect(container.querySelectorAll("line")).toHaveLength(1); // shaft only
  });

  it("draws an arrowhead for causes and a `—|` bar for inhibits", () => {
    const spec = makeSpec({
      objects: [
        { id: "a", kind: "process_node", position: { x: -3, y: 1, z: 0 } },
        { id: "b", kind: "process_node", position: { x: 0, y: 1, z: 0 } },
        { id: "c", kind: "process_node", position: { x: 0, y: -1, z: 0 } },
        { id: "d", kind: "process_node", position: { x: 3, y: -1, z: 0 } },
      ],
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "inhibits", from: "c", to: "d" },
      ],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);

    const causesEdge = container.querySelector('[data-edge-type="causes"]')!;
    const inhibitsEdge = container.querySelector('[data-edge-type="inhibits"]')!;
    // causes: shaft + arrowhead polygon; inhibits: shaft + bar (2 lines, no polygon).
    expect(causesEdge.querySelectorAll("line")).toHaveLength(1);
    expect(causesEdge.querySelectorAll("polygon")).toHaveLength(1);
    expect(inhibitsEdge.querySelectorAll("line")).toHaveLength(2);
    expect(inhibitsEdge.querySelectorAll("polygon")).toHaveLength(0);

    // Edge labels render mid-edge for both.
    expect(container.textContent).toContain("causes");
    expect(container.textContent).toContain("inhibits");
  });

  it("renders an honest empty state when nothing remains after filtering", () => {
    const spec = makeSpec({
      objects: [
        { id: "ar1", kind: "arrow", position: { x: 0, y: 0, z: 0 } },
        { id: "lb1", kind: "label", label: "Decorative", position: { x: 0, y: 2, z: 0 } },
      ],
      relationships: [],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    // No shapes drawn for decorative objects.
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
    expect(container.querySelectorAll("polygon")).toHaveLength(0);
    expect(container.textContent).not.toContain("Decorative");
  });
});
