/**
 * accessible-diagram-geometry.test.tsx — 2D diagram geometry (C5, Wave 3;
 * design-2 §6, §9 C5 tests 1–4, 12).
 *
 * Covers: adaptive inset (no F1 inversion), arrow tip on the shape surface
 * (F5), seeded spread with the 52px separation floor + z-collapse footnote
 * (F2/P3), single-root centering (F6), label truncation parity with the 3D
 * surface (P4), edge-label omission when no safe spot exists (F3), and the
 * constants single-source boundary.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import type { DemoSpecV1, PrimitiveObjectSpec } from "@/demonstrations/spec/demo-spec";
import {
  AccessibleDiagram,
  edgeGeometry2D,
  spreadProjected,
} from "@/components/demonstrations/accessible-representation";
import {
  EDGE_INSET_MAX_PX,
  HEAD_LEN_2D_PX,
  HEAD_TIP_PX,
  MIN_NODE_SEP_PX,
  Z_COLLAPSE_FOOTNOTE,
  edgeInsetPx,
  estimateTextWidthPx,
  labelBudgetPx,
  resolveLabelText,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";

function makeSpec(
  scene?: Partial<NonNullable<DemoSpecV1["scene3d"]>>
): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "diagram-geometry-test",
    generationId: "g-1",
    userQuery: "test",
    normalizedConcept: "test",
    title: "Geometry test",
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

const node = (
  id: string,
  x: number,
  y: number,
  z = 0,
  kind: PrimitiveObjectSpec["kind"] = "process_node",
  label?: string
): PrimitiveObjectSpec => ({
  id,
  kind,
  position: { x, y, z },
  ...(label ? { label } : {}),
});

// ---------------------------------------------------------------------------
// Pure geometry: adaptive inset + arrowhead (design-2 §6.1, C5 test 1–2)
// ---------------------------------------------------------------------------

describe("adaptive edge inset (F1/F5 regressions)", () => {
  it("inset = min(34, 0.45·len): 80px → 34, 60px → 27, 70px → 31.5, long → 34", () => {
    expect(edgeInsetPx(80)).toBeCloseTo(34, 6);
    expect(edgeInsetPx(60)).toBeCloseTo(27, 6);
    expect(edgeInsetPx(70)).toBeCloseTo(31.5, 6);
    expect(edgeInsetPx(1000)).toBe(EDGE_INSET_MAX_PX);
    // No inversion: inset < len/2 whenever the edge is at least 2px.
    for (const len of [52, 60, 70, 72, 100]) {
      expect(edgeInsetPx(len)).toBeLessThanOrEqual(len / 2);
    }
  });

  it("tip exactly on the target surface (26px); head back edge at 36px on long edges", () => {
    const geom = edgeGeometry2D({ x: 0, y: 0 }, { x: 660, y: 0 })!;
    // Tip is 26px from the target center, ON the circle surface.
    expect(660 - geom.tx).toBeCloseTo(HEAD_TIP_PX, 6);
    expect(660 - geom.ex).toBeCloseTo(HEAD_TIP_PX + HEAD_LEN_2D_PX, 6);
    expect(geom.backInset).toBeCloseTo(HEAD_TIP_PX + HEAD_LEN_2D_PX, 6);
    // Shaft starts at the adaptive inset from the source.
    expect(geom.sx).toBeCloseTo(edgeInsetPx(660), 6);
  });

  it("short edge (60px): head shrinks, shaft never inverts (F1)", () => {
    const geom = edgeGeometry2D({ x: 0, y: 0 }, { x: 60, y: 0 })!;
    // Tip still on the surface.
    expect(60 - geom.tx).toBeCloseTo(HEAD_TIP_PX, 6);
    // Shaft end never passes the shaft start (dE >= dS).
    expect(geom.ex).toBeGreaterThanOrEqual(geom.sx - 1e-6);
    // The head back edge stays within [26, 36] of the target.
    expect(geom.backInset).toBeGreaterThanOrEqual(HEAD_TIP_PX - 1e-6);
    expect(geom.backInset).toBeLessThanOrEqual(HEAD_TIP_PX + HEAD_LEN_2D_PX + 1e-6);
  });

  it("degenerate edge (len < 1) renders nothing", () => {
    expect(edgeGeometry2D({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pure geometry: seeded spread (design-2 §6.2, C5 test 3)
// ---------------------------------------------------------------------------

describe("spreadProjected (F2/P3/F6)", () => {
  it("separates the process_flow pn1/ep1 duplicate ≥ 52px, deterministically", () => {
    const run = () =>
      spreadProjected([
        { id: "pn1", x: 70, y: 70 },
        { id: "ep1", x: 70, y: 70 },
        { id: "pn2", x: 400, y: 70 },
        { id: "pn3", x: 730, y: 70 },
      ]);
    const first = run();
    const second = run();
    const a = first.nodes.find((n) => n.id === "pn1")!;
    const b = first.nodes.find((n) => n.id === "ep1")!;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    expect(d).toBeGreaterThanOrEqual(MIN_NODE_SEP_PX);
    // Deterministic across runs (seeded by id hash).
    expect(first.nodes).toEqual(second.nodes);
    // Unclustered members never move.
    expect(first.nodes.find((n) => n.id === "pn3")).toEqual({ id: "pn3", x: 730, y: 70 });
  });

  it("flags z-only duplicates (same x,y, differing z) for the footnote", () => {
    const result = spreadProjected([
      { id: "a", x: 70, y: 70, z: 0 },
      { id: "b", x: 70, y: 70, z: 5 },
    ]);
    expect(result.zCollapsed).toBe(true);
    const a = result.nodes.find((n) => n.id === "a")!;
    const b = result.nodes.find((n) => n.id === "b")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MIN_NODE_SEP_PX);
  });

  it("does not flag same-z duplicates as z-collapsed", () => {
    const result = spreadProjected([
      { id: "pn1", x: 70, y: 70, z: 0 },
      { id: "ep1", x: 70, y: 70, z: 0 },
    ]);
    expect(result.zCollapsed).toBe(false);
  });

  it("spread results stay inside the usable canvas", () => {
    const result = spreadProjected([
      { id: "a", x: 70, y: 70 },
      { id: "b", x: 70, y: 70 },
    ]);
    for (const n of result.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(70);
      expect(n.x).toBeLessThanOrEqual(800 - 70);
      expect(n.y).toBeGreaterThanOrEqual(70);
      expect(n.y).toBeLessThanOrEqual(460 - 70);
    }
  });
});

// ---------------------------------------------------------------------------
// Component-level geometry
// ---------------------------------------------------------------------------

describe("AccessibleDiagram — duplicate spread (live process_flow repro)", () => {
  it("draws pn1/ep1 circles ≥ 52px apart, deterministic across renders", () => {
    const spec = makeSpec({
      objects: [
        node("pn1", -3, 0, 0, "process_node"),
        node("ep1", -3, 0, 0, "energy_packet"),
        node("pn2", 0, 0, 0, "sphere"),
        node("pn3", 3, 0, 0, "sphere"),
      ],
      relationships: [
        { id: "f1", type: "flows_to", from: "pn1", to: "pn2" },
        { id: "f2", type: "flows_to", from: "pn2", to: "pn3" },
      ],
      animations: [],
    });
    const readCenters = () => {
      const { container } = render(<AccessibleDiagram spec={spec} />);
      const circles = container.querySelectorAll("circle");
      expect(circles).toHaveLength(4);
      const [pn1, ep1] = [circles[0], circles[1]];
      return {
        x1: Number(pn1.getAttribute("cx")),
        y1: Number(pn1.getAttribute("cy")),
        x2: Number(ep1.getAttribute("cx")),
        y2: Number(ep1.getAttribute("cy")),
      };
    };
    const first = readCenters();
    const second = readCenters();
    const d = Math.hypot(first.x1 - first.x2, first.y1 - first.y2);
    expect(d).toBeGreaterThanOrEqual(MIN_NODE_SEP_PX);
    expect(first).toEqual(second);
  });

  it("z-only pair: spread + data-z-collapse + footnote line", () => {
    const spec = makeSpec({
      objects: [
        node("a", 0, 1, 0, "sphere"),
        node("b", 0, 1, 5, "sphere"),
      ],
      relationships: [],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    const figure = container.querySelector("figure")!;
    expect(figure.getAttribute("data-z-collapse")).toBe("true");
    expect(container.textContent).toContain(Z_COLLAPSE_FOOTNOTE);
  });

  it("no z footnote for same-z duplicates", () => {
    const spec = makeSpec({
      objects: [
        node("pn1", -3, 0, 0, "process_node"),
        node("ep1", -3, 0, 0, "energy_packet"),
        node("pn2", 0, 0, 0, "sphere"),
        node("pn3", 3, 0, 0, "sphere"),
      ],
      relationships: [],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    expect(container.querySelector("figure")!.getAttribute("data-z-collapse")).toBeNull();
    expect(container.textContent).not.toContain("different depths");
  });

  it("centers a single positioned root (F6)", () => {
    const spec = makeSpec({
      objects: [node("pf1", 5, 2, 0, "particle_field")],
      relationships: [],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    const circle = container.querySelector("circle")!;
    expect(Number(circle.getAttribute("cx"))).toBeCloseTo(400, 6);
    expect(Number(circle.getAttribute("cy"))).toBeCloseTo(230, 6);
  });
});

describe("AccessibleDiagram — label truncation parity (P4)", () => {
  const LONG =
    "photosynthesis converts light energy into chemical energy stored in glucose";

  it("renders the SAME resolved string as the 3D surface (shared resolver)", () => {
    const spec = makeSpec({
      objects: [node("a", 0, 0, 0, "process_node", LONG)],
      relationships: [],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    const resolved = resolveLabelText(LONG);
    expect(resolved.truncated).toBe(true);
    // The shape's visible text is the ellipsized form — the raw 74-char
    // string never renders as the shape label (the summary/aria-label keeps
    // the declared label).
    const shapeText = container.querySelector("g text")!;
    expect(shapeText.textContent).toBe(resolved.text);
    expect(shapeText.textContent).not.toContain("stored in glucose");
  });

  it("resolved text fits the 2D node-label budget at 12px (belt-and-suspenders)", () => {
    const resolved = resolveLabelText(LONG);
    const widthPx12 = estimateTextWidthPx(resolved.text) * (12 / 30);
    expect(widthPx12).toBeLessThanOrEqual(labelBudgetPx(12));
  });

  it("short labels pass through untouched (parity on both surfaces)", () => {
    expect(resolveLabelText("Inhibited D")).toEqual({ text: "Inhibited D", truncated: false });
    expect(resolveLabelText("Hub")).toEqual({ text: "Hub", truncated: false });
  });
});

describe("AccessibleDiagram — short edges (F1 no-inversion at the DOM level)", () => {
  it("renders a 63.5px edge without inverting and with the tip on the target surface", () => {
    // a(0) — b(13.15) — c(14.55): spanX 14.55 → kx 45.36 → b–c projects to 63.5px.
    // The fixture is GEOMETRY-CLEAN: b–c = 1.4 world units ≥ 1.1 (0.5 + 0.5 +
    // ENVELOPE_CLEARANCE), so the shared resolveLayout pass leaves every
    // position untouched and the projection is exactly the authored one.
    const spec = makeSpec({
      objects: [
        node("a", 0, 0, 0, "process_node"),
        node("b", 13.15, 0, 0, "process_node"),
        node("c", 14.55, 0, 0, "process_node"),
      ],
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "causes", from: "b", to: "c" },
      ],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    const groups = container.querySelectorAll("[data-edge-type='causes']");
    expect(groups).toHaveLength(2);
    const short = groups[1];
    const line = short.querySelector("line")!;
    const x1 = Number(line.getAttribute("x1"));
    const x2 = Number(line.getAttribute("x2"));
    // Never inverted (the old fixed-34px inset produced sx > ex here).
    expect(x1).toBeLessThanOrEqual(x2 + 1e-6);

    const polygon = short.querySelector("polygon")!;
    const tipX = Number(polygon.getAttribute("points")!.split(",")[0]);
    // Tip lands exactly on c's surface: c maps to x = 730, tip at 730 − 26.
    expect(tipX).toBeCloseTo(730 - HEAD_TIP_PX, 6);

    // The label has no safe spot on the short edge → omitted (F3).
    expect(short.querySelector("text")).toBeNull();
  });

  it("places edge labels off-shaft with the perpendicular offset on long edges", () => {
    const spec = makeSpec({
      objects: [
        node("a", -3, 0, 0, "process_node"),
        node("b", 0, 0, 0, "process_node"),
      ],
      relationships: [{ id: "r1", type: "causes", from: "a", to: "b", label: "causes" }],
      animations: [],
    });
    const { container } = render(<AccessibleDiagram spec={spec} />);
    const group = container.querySelector("[data-edge-type='causes']")!;
    const line = group.querySelector("line")!;
    const text = group.querySelector("text")!;
    const midY = (Number(line.getAttribute("y1")) + Number(line.getAttribute("y2"))) / 2;
    // The label sits 14px off the shaft (perpendicular), not on it.
    expect(Math.abs(Number(text.getAttribute("y")) - midY)).toBeCloseTo(14, 6);
    expect(container.textContent).toContain("causes");
  });
});

// ---------------------------------------------------------------------------
// Constants single-source boundary (design-2 §6.4 / §9 C5 test 12)
// ---------------------------------------------------------------------------

describe("constants single-source boundary", () => {
  it("the 2D component contains no literal 34/52/72/320/40", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const file = readFileSync(
      path.resolve(here, "../../../src/components/demonstrations/accessible-representation.tsx"),
      "utf8"
    );
    const matches = file.match(/\b(34|52|72|320|40)\b/g) ?? [];
    expect(matches).toEqual([]);
  });

  it("MIN_EDGE_LEN_PX = 2·(26+10) = 72 derives from the shared constants", () => {
    expect(2 * (HEAD_TIP_PX + HEAD_LEN_2D_PX)).toBe(72);
  });
});
