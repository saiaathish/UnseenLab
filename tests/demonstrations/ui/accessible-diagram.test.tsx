/**
 * AccessibleDiagram parity (A1): the 2D diagram renders ONLY the canonical
 * graph — node objects + relationship edges. Decorative `arrow` /
 * `process_edge` / detached `label` objects must never appear as shapes, and
 * `inhibits` edges end in a `—|` bar instead of an arrowhead (matching the
 * 3D stage).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

    // The static diagram (no callbacks) is announced with the object/
    // relationship summary and keeps role="img" (the A10 role contract: only
    // the INTERACTIVE diagram is role="group"; see the interactive suite).
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

// ---------------------------------------------------------------------------
// Interactive gate (A1/Diagram parity): when the caller provides the canonical
// callbacks and the scene is a graph with no engine coupling, the diagram
// nodes become real buttons firing the SAME onNodeSelect/onNodeManipulate
// surface as the 3D stage — so the lesson interact step completes through the
// 2D diagram, not only through the canvas.
// ---------------------------------------------------------------------------

describe("AccessibleDiagram — interactive graph surface (2D/3D parity)", () => {
  function interactiveSpec(): DemoSpecV1 {
    return makeSpec({
      objects: [
        { id: "a", kind: "process_node", label: "Cause A", position: { x: -3, y: 1, z: 0 } },
        { id: "b", kind: "process_node", label: "Effect B", position: { x: 0, y: 1, z: 0 } },
      ],
      relationships: [{ id: "r1", type: "causes", from: "a", to: "b" }],
      animations: [],
    });
  }

  it("opens the interactive gate when callbacks are provided: nodes become role=button with aria-pressed", () => {
    render(
      <AccessibleDiagram
        spec={interactiveSpec()}
        onNodeSelect={vi.fn()}
        onNodeManipulate={vi.fn()}
      />
    );
    const causeA = screen.getByRole("button", { name: "Cause A" });
    const effectB = screen.getByRole("button", { name: "Effect B" });
    expect(causeA).toHaveAttribute("aria-pressed", "false");
    expect(effectB).toHaveAttribute("aria-pressed", "false");
    expect(causeA).toHaveAttribute("tabindex", "0");
  });

  it("fires onNodeManipulate on EVERY activation — click, re-click, Enter, Space — and onNodeSelect only on change", async () => {
    const user = userEvent.setup();
    const onNodeSelect = vi.fn();
    const onNodeManipulate = vi.fn();
    render(
      <AccessibleDiagram
        spec={interactiveSpec()}
        onNodeSelect={onNodeSelect}
        onNodeManipulate={onNodeManipulate}
      />
    );
    const causeA = screen.getByRole("button", { name: "Cause A" });

    // Pointer click on node "b" semantics are covered by the click on "a":
    // the click resolves to the canonical node id the lesson references.
    await user.click(causeA);
    expect(onNodeSelect).toHaveBeenLastCalledWith("a");
    expect(onNodeManipulate).toHaveBeenLastCalledWith("a");

    // Re-activating the selected node still counts as a manipulation (no
    // duplicate select — every activation manipulates, mirroring the stage).
    await user.click(causeA);
    expect(onNodeSelect).toHaveBeenCalledTimes(1);
    expect(onNodeManipulate).toHaveBeenCalledTimes(2);

    // Keyboard: Enter and Space both activate the focused node.
    causeA.focus();
    await user.keyboard("{Enter}");
    expect(onNodeManipulate).toHaveBeenCalledTimes(3);
    expect(onNodeManipulate).toHaveBeenLastCalledWith("a");
    await user.keyboard(" ");
    expect(onNodeManipulate).toHaveBeenCalledTimes(4);
  });

  it("Escape clears the selection (onNodeSelect(null)) and returns aria-pressed to false", async () => {
    const user = userEvent.setup();
    const onNodeSelect = vi.fn();
    const onNodeManipulate = vi.fn();
    render(
      <AccessibleDiagram
        spec={interactiveSpec()}
        onNodeSelect={onNodeSelect}
        onNodeManipulate={onNodeManipulate}
      />
    );
    const causeA = screen.getByRole("button", { name: "Cause A" });
    await user.click(causeA);
    expect(causeA).toHaveAttribute("aria-pressed", "true");

    causeA.focus();
    await user.keyboard("{Escape}");
    expect(onNodeSelect).toHaveBeenLastCalledWith(null);
    expect(causeA).toHaveAttribute("aria-pressed", "false");
  });

  it("A10 role contract: the interactive diagram is role='group', the static diagram keeps role='img'", () => {
    // Interactive (callbacks provided): the svg is a group of interactive
    // nodes, announced as a group, never a bare image.
    render(
      <AccessibleDiagram
        spec={interactiveSpec()}
        onNodeSelect={vi.fn()}
        onNodeManipulate={vi.fn()}
      />
    );
    expect(
      screen.getByRole("group", { name: /Relationship diagram/ })
    ).toBeInTheDocument();

    // Static (no callbacks): unchanged — still an image.
    const { unmount } = render(<AccessibleDiagram spec={interactiveSpec()} />);
    expect(
      screen.getByRole("img", { name: /Relationship diagram/ })
    ).toBeInTheDocument();
    unmount();
  });
});
