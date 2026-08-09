/**
 * DemonstrationRepresentationTabs — hybrid-stage mount contract (Wave-4b P2-4).
 *
 * Hostile Q4: switching tabs used to UNMOUNT the 3D stage (conditional
 * mount), losing the trail history and re-inflating the camera to the build
 * frame (grow-only can never shrink back). The contract: the 3D stage stays
 * MOUNTED across tab switches (hidden, exactly like the 2D stage) — the
 * renderer constructor fires once, the renderer is never disposed, and the
 * stage's own DOM (the canvas that owns the trail's renderer) is the SAME
 * node after a full tab round-trip.
 *
 * Renderer-level trail-state survival is T4's pin (trajectory-contract.test
 * .ts); this component-level pin proves the renderer INSTANCE — the trail's
 * owner — is never torn down across tab switches (constructor once, zero
 * disposes, same canvas node). The 2D engine stage runs the REAL SimRunner
 * (jsdom's no-op canvas context); the 3D renderer barrel is mocked so
 * construction/disposal is observable.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { DemonstrationRepresentationTabs } from "@/components/demonstrations/representation-tabs";
import type { StageProps } from "@/components/demonstrations/demonstration-stage";
import { engineMappingFor } from "@/demonstrations/showcases/coupling";
import type { EngineMapping } from "@/demonstrations/renderers/primitive-3d/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// No-op the animation loops (the real 2D SimRunner + the label overlay both
// schedule rAF; nothing per-frame may leak into the assertions — same pattern
// as demonstration-shell.test.tsx).
beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// The 3D renderer barrel is mocked so construction/disposal is observable;
// the 2D engine stage keeps the real SimRunner (no-op canvas context).
vi.mock("@/demonstrations/renderers/primitive-3d", () => {
  let constructions = 0;
  let disposes = 0;
  let engineStateCalls = 0;
  class MockPrimitiveSceneRenderer {
    constructor() {
      constructions++;
    }
    setSpec() {}
    setEngineState() {
      engineStateCalls++;
    }
    setPlaying() {}
    setSpeed() {}
    resetView() {}
    getEscapeClassification() {
      return null;
    }
    readLabelProjections() {
      return null;
    }
    getIdentityAnchor() {
      return null;
    }
    getEdgeAnchor() {
      return null;
    }
    dispose() {
      disposes++;
    }
    static get constructions() {
      return constructions;
    }
    static get disposes() {
      return disposes;
    }
    static get engineStateCalls() {
      return engineStateCalls;
    }
    static reset() {
      constructions = 0;
      disposes = 0;
      engineStateCalls = 0;
    }
  }
  return { PrimitiveSceneRenderer: MockPrimitiveSceneRenderer };
});

const MAPPING: EngineMapping = engineMappingFor("orbits")!;

/** Hybrid orbit spec: hidden 2D engine driver + 3D stage + a table tab. */
function hybridSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "hybrid-orbit-tabs",
    generationId: "g-1",
    userQuery: "Orbits",
    normalizedConcept: "Orbits",
    title: "Orbits",
    learningObjective: "Observe orbital motion.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Escape is possible at high launch speed."],
      engineId: "orbits",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "hybrid",
      fallbackKind: "data_table",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0.0",
      seed: 1,
      parameters: [],
      readouts: [],
    },
    scene3d: {
      objects: [
        { id: "star", kind: "sphere", label: "Star", position: { x: 0, y: 0, z: 0 }, size: 2.4 },
        { id: "planet", kind: "sphere", label: "Planet", position: { x: 6, y: 0, z: 0 }, size: 1.3 },
      ],
      relationships: [],
      animations: [],
    },
    controls: [],
    prediction: { prompt: "?", options: ["a", "b"] },
    observationPrompts: [],
    representations: [
      { id: "rep-3d", kind: "stage_3d", label: "3D stage" },
      { id: "rep-2d", kind: "stage_2d", label: "2D stage" },
      { id: "rep-table", kind: "table", label: "Table" },
    ],
    adaptationContext: { allowed: false, oneVariableMode: true },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00Z",
    },
    limits: {
      maxObjects: 80,
      maxParticles: 1500,
      maxTimelineEvents: 30,
      maxControls: 6,
    },
  };
}

const STAGE_PROPS: StageProps = {
  spec: hybridSpec(),
  parameters: {},
  playing: false,
  speed: 1,
  resetSignal: 0,
  reducedMotion: false,
  readouts: [],
  onReadouts: () => {},
};

function Harness({ initialId }: { initialId: string }) {
  const [activeId, setActiveId] = useState(initialId);
  return (
    <DemonstrationRepresentationTabs
      spec={hybridSpec()}
      activeId={activeId}
      reducedMotion={false}
      preferredRepresentations={["animation"]}
      readouts={[]}
      parameters={{}}
      onRepresentationChange={setActiveId}
      stage={{ ...STAGE_PROPS, engineMapping: MAPPING }}
    />
  );
}

describe("hybrid stage mount contract (P2-4)", () => {
  it("the 3D stage stays MOUNTED across tab switches (constructor once, zero disposes, same canvas node, hidden round-trip)", async () => {
    const user = userEvent.setup();
    const barrel = (await import("@/demonstrations/renderers/primitive-3d")) as unknown as {
      PrimitiveSceneRenderer: {
        constructions: number;
        disposes: number;
        reset: () => void;
      };
    };
    barrel.PrimitiveSceneRenderer.reset();

    const { container } = render(<Harness initialId="rep-3d" />);
    // The 3D stage mounts once on the initial tab.
    expect(barrel.PrimitiveSceneRenderer.constructions).toBe(1);
    expect(barrel.PrimitiveSceneRenderer.disposes).toBe(0);

    // The 3D stage's own canvas — the node that owns the renderer (and thus
    // the trail) — must be the SAME DOM node after a full tab round-trip.
    const canvas3d = container.querySelector<HTMLCanvasElement>(
      'canvas[aria-label*="3D stage canvas"]'
    );
    expect(canvas3d).not.toBeNull();
    // Visible while the 3D tab is active: no hidden wrapper in its ancestry.
    expect(canvas3d!.closest("div[hidden]")).toBeNull();

    // Switch to the TABLE tab: the 3D stage must NOT be re-constructed and
    // must NOT be disposed; it is merely hidden (still in the DOM).
    await user.click(screen.getByRole("tab", { name: "Table" }));
    expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(barrel.PrimitiveSceneRenderer.constructions).toBe(1);
    expect(barrel.PrimitiveSceneRenderer.disposes).toBe(0);
    expect(container.querySelector('canvas[aria-label*="3D stage canvas"]')).toBe(canvas3d);
    expect(canvas3d!.closest("div[hidden]")).not.toBeNull();

    // Switch to the 2D tab and back to the 3D tab: still the SAME instance
    // and the SAME canvas node.
    await user.click(screen.getByRole("tab", { name: "2D stage" }));
    expect(barrel.PrimitiveSceneRenderer.constructions).toBe(1);
    expect(barrel.PrimitiveSceneRenderer.disposes).toBe(0);
    expect(container.querySelector('canvas[aria-label*="3D stage canvas"]')).toBe(canvas3d);
    await user.click(screen.getByRole("tab", { name: "3D stage" }));
    expect(barrel.PrimitiveSceneRenderer.constructions).toBe(1);
    expect(barrel.PrimitiveSceneRenderer.disposes).toBe(0);
    expect(screen.getByRole("tab", { name: "3D stage" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Back on the 3D tab: the wrapper is unhidden and the canvas is the SAME
    // node — the trail's renderer never left.
    expect(container.querySelector('canvas[aria-label*="3D stage canvas"]')).toBe(canvas3d);
    expect(canvas3d!.closest("div[hidden]")).toBeNull();

    // While a non-3D tab is active, the 3D stage container is hidden (the
    // same hidden pattern the 2D stage uses) — never removed from the DOM.
    await user.click(screen.getByRole("tab", { name: "Table" }));
    const hiddenWrappers = Array.from(
      container.querySelectorAll<HTMLElement>("div[hidden]")
    );
    expect(hiddenWrappers.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('canvas[aria-label*="3D stage canvas"]')).toBe(canvas3d);
    expect(barrel.PrimitiveSceneRenderer.disposes).toBe(0);
  });
});
