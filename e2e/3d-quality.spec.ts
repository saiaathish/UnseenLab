import { test, expect, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * 3D Representation Quality — browser e2e visual QA (D2, Wave 4;
 * design-2-presentation-gate.md §7.4/§8, PROGRAM.md DoD item 2).
 *
 * Two layers:
 *
 * 1. Pure gate run (no browser): for the 10 conceptual templates + 3
 *    showcases + the stress corpus, assemble the GateScene from the SAME
 *    pure building blocks the renderer consumes at build (buildSceneGraph
 *    with the deterministic layout pass → nodeEnvelopes → deriveGraphEdges +
 *    routeEdge + edgeHeadFor shaft spans → planNodeLabels glyph rects →
 *    placeSceneEdgeLabels → contentAABBFromGraph + graphFrameHalfHeight /
 *    perspectiveDistance + canonicalViews) and run checkScene (I1–I5).
 *
 *    DEVIATION FROM DESIGN-2 §8.1 (documented): the design assumes a
 *    `resolvePresentation` aggregate export; no such export exists in app
 *    code (the pipeline is C1–C5 module-scattered), and app source is frozen
 *    to D2 — so the assembly lives in this spec, feeding the identical
 *    inputs to the identical modules. Templates/showcases must pass
 *    (ok === true); corpus cases assert their expected violation profile.
 *
 * 2. Browser bounding-box QA: every demo is seeded through the app's own
 *    ask-to-demo flow (POST /api/demonstrations/generate stubbed to 500 →
 *    deterministic offline catalog — the exact seeding of
 *    e2e/demo-lesson-rail.spec.ts, no DB, no auth, no invented flows).
 *    - 3D stage: canvas renders, and for graph-mode scenes every graph node
 *      center projects INSIDE the canvas via the renderer's own
 *      projectOrthoToCSS (screen-level I5 sanity). Pairwise on-screen
 *      separation is deliberately NOT asserted on the tilted ortho view:
 *      the graph camera foreshortens the y axis by vz = 1/√(1+0.55²) ≈ 0.876,
 *      so I1-clean world space (e.g. layered_system's stacked boxes) would
 *      false-fail a naive screen-distance check. World-space I1 and the 2D
 *      surface (below) are the authoritative legibility checks.
 *    - 2D accessible diagram (templates only — showcases carry no diagram
 *      representation): real-DOM bounding-box QA via getBoundingClientRect —
 *      shape-body vs shape-body, node labels vs other shapes, edge labels vs
 *      shapes, edge labels inside the viewBox, and arrow tips at exactly
 *      HEAD_TIP_PX = 26 (viewBox units) from the target center (design §6.1).
 *    - Console: zero error-level messages per page (mirrors the
 *      e2e/quality.spec.ts pattern; the deliberate generate-500 log from the
 *      seeding stub is filtered exactly like demo-lesson-rail.spec.ts).
 *
 * Screenshots: canonical top/left/right/worst views are NOT reachable from
 * the UI without an app-source debug hook (frozen to D2), so evidence is the
 * camera-default front view of the stage plus the 2D diagram surface —
 * validation-pack/screenshots/3d-quality/{id}-front-3d.png and
 * {id}-diagram-2d.png. DEVIATION FROM DESIGN-2 §8.3 (65-shot canonical
 * corpus): the view-math itself is covered by the pure gate run (I5 through
 * all canonical views incl. worst) — this spec's screenshots are evidence,
 * not pixel-diff assertions.
 *
 * Gating: like the rail spec, requires a production build baked with
 * NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1; self-skips otherwise.
 */

const DEMOS_ENABLED = process.env.NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED === "1";

test.skip(
  !DEMOS_ENABLED,
  "NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 was not exported — this spec needs " +
    "a production build baked with the demo experience (ask-demo flow + " +
    "/demos/[id]). Skipping keeps the suite green for non-demo builds.",
);

// ---------------------------------------------------------------------------
// Pure pipeline imports (the renderer's own build-time inputs)
// ---------------------------------------------------------------------------

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { CONCEPTUAL_TEMPLATE_IDS } from "@/demonstrations/spec/demo-spec";
import { buildConceptualSpec } from "@/demonstrations/generation/offline/template-builder";
import { createDefaultPreferences } from "@/domain/learner";
import {
  buildOrbitsShowcase,
  ORBITS_SHOWCASE_ID,
  ORBITS_SHOWCASE_QUERY,
} from "@/demonstrations/showcases/orbits/build-spec";
import {
  buildElectricFieldShowcase,
  ELECTRIC_FIELDS_SHOWCASE_ID,
  ELECTRIC_FIELDS_SHOWCASE_QUERY,
} from "@/demonstrations/showcases/electric-fields/build-spec";
import {
  buildWaveInterferenceShowcase,
  WAVE_INTERFERENCE_SHOWCASE_ID,
  WAVE_INTERFERENCE_SHOWCASE_QUERY,
} from "@/demonstrations/showcases/wave-interference/build-spec";
import { engineMappingForSpec } from "@/demonstrations/showcases/coupling";
import {
  buildSceneGraph,
  deriveGraphEdges,
  isGraphLikeScene,
  GRAPH_NODE_KINDS,
} from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  nodeEnvelopes,
  routeEdge,
  edgeHeadFor,
  placeSceneEdgeLabels,
} from "@/demonstrations/renderers/primitive-3d/edges";
import { nodeEnvelope, planNodeLabels } from "@/demonstrations/renderers/primitive-3d/labels";
import {
  contentAABBFromGraph,
  contentExtentCenter,
  graphFrameHalfHeight,
  perspectiveDistance,
  canonicalViews,
  FRAME_ASPECT_DEFAULT,
  DEFAULT_FOV_DEG,
  projectOrthoToCSS,
} from "@/demonstrations/renderers/primitive-3d/camera";
import {
  checkScene,
  checkEnvelopeIntersections,
  REASON_ENVELOPE_OVERLAP,
  REASON_ARROW_HEAD_IN_SOURCE,
  type GateScene,
  type EdgeGeom,
  type LabelGeom,
  type Violation,
} from "@/demonstrations/renderers/primitive-3d/geometry-gate";
import {
  STRESS_CORPUS,
} from "../tests/demonstrations/renderer/presentation-gate.corpus";
import {
  SHAFT_GAP,
  SHAPE_RADIUS_PX,
  VIEW_W,
  VIEW_H,
} from "@/demonstrations/renderers/primitive-3d/presentation/constants";

// ---------------------------------------------------------------------------
// Seed corpus: query → expected offline route (same mapping as the router;
// the browser seeds with the exact query strings below)
// ---------------------------------------------------------------------------

interface DemoSeed {
  id: string;
  query: string;
  urlPattern: RegExp;
  /** Kind used for reporting; templates get 2D diagram QA, showcases don't. */
  kind: "template" | "showcase";
  /** Renderer camera mode: graph-like scenes with no engine coupling are
   * ortho-framed; everything else is perspective. */
  graphMode: boolean;
  build: () => DemoSpecV1;
}

const PREFERENCES = createDefaultPreferences();

function templateSeed(
  id: string,
  query: string,
  concept: string,
  graphMode: boolean,
): DemoSeed {
  return {
    id,
    query,
    urlPattern: new RegExp(`/demos/demo-${id}-`),
    kind: "template",
    graphMode,
    build: () => buildConceptualSpec(id as never, concept, query, PREFERENCES),
  };
}

const TEMPLATE_SEEDS: DemoSeed[] = [
  templateSeed("process_flow", "process flow", "a process flow", true),
  templateSeed("energy_transfer", "energy transfer", "energy transfer", true),
  templateSeed("cause_effect_network", "cause and effect", "cause and effect", true),
  templateSeed("particle_population", "population dynamics", "population dynamics", false),
  templateSeed("layered_system", "layered system", "layered system", false),
  templateSeed("cyclic_process", "carbon cycle", "the carbon cycle", true),
  templateSeed("before_after_comparison", "before and after", "before and after", false),
  templateSeed("field_relationship", "magnetic field", "a magnetic field", true),
  templateSeed("transport_network", "transport network", "a transport network", true),
  templateSeed("timeline_sequence", "sequence of events", "a sequence of events", true),
];

const SHOWCASE_SEEDS: DemoSeed[] = [
  {
    id: ORBITS_SHOWCASE_ID,
    query: ORBITS_SHOWCASE_QUERY,
    urlPattern: /\/demos\/showcase-orbits/,
    kind: "showcase",
    graphMode: false,
    build: () => buildOrbitsShowcase(),
  },
  {
    id: ELECTRIC_FIELDS_SHOWCASE_ID,
    query: ELECTRIC_FIELDS_SHOWCASE_QUERY,
    urlPattern: /\/demos\/showcase-electric-fields/,
    kind: "showcase",
    graphMode: false,
    build: () => buildElectricFieldShowcase(),
  },
  {
    id: WAVE_INTERFERENCE_SHOWCASE_ID,
    query: WAVE_INTERFERENCE_SHOWCASE_QUERY,
    urlPattern: /\/demos\/showcase-wave-interference/,
    kind: "showcase",
    graphMode: false,
    build: () => buildWaveInterferenceShowcase(),
  },
];

const ALL_SEEDS: DemoSeed[] = [...TEMPLATE_SEEDS, ...SHOWCASE_SEEDS];

// ---------------------------------------------------------------------------
// GateScene assembly (renderer-faithful; see header comment)
// ---------------------------------------------------------------------------

interface PipelineResult {
  scene: GateScene;
  graph: ReturnType<typeof buildSceneGraph>["graph"];
  graphMode: boolean;
  pipelineReasons: string[];
}

function diagonalOf(graph: ReturnType<typeof buildSceneGraph>["graph"]): number {
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const zs = graph.nodes.map((n) => n.position.z);
  return Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
  );
}

/** Shaft polyline exactly as updateEdge renders it: surface-to-surface with
 * interior routed waypoints (static graph scenes: graph space == world space,
 * so the midpoint shift is zero). */
function shaftPolyline(
  route: { x: number; y: number; z: number }[],
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  rFrom: number,
  rTo: number,
  headLen: number,
): { x: number; y: number; z: number }[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return [{ ...from }, { ...to }];
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const pts: { x: number; y: number; z: number }[] = [
    {
      x: from.x + ux * (rFrom + SHAFT_GAP),
      y: from.y + uy * (rFrom + SHAFT_GAP),
      z: from.z + uz * (rFrom + SHAFT_GAP),
    },
  ];
  for (let i = 1; i < route.length - 1; i++) pts.push({ ...route[i] });
  pts.push({
    x: to.x - ux * (rTo + headLen),
    y: to.y - uy * (rTo + headLen),
    z: to.z - uz * (rTo + headLen),
  });
  return pts;
}

export function assemblePipelineScene(spec: DemoSpecV1): PipelineResult {
  const { graph, reasons: buildReasons } = buildSceneGraph(spec);
  const graphMode =
    engineMappingForSpec(spec) === null && isGraphLikeScene(graph);
  const pipelineReasons = [...buildReasons];

  const envelopes = nodeEnvelopes(graph);
  const sceneEnvelopes = envelopes as unknown as GateScene["envelopes"];

  // Graph edges (canonical): routed polylines + arrowheads (I2/I4). Legacy
  // flow edges in non-graph scenes carry no arrowhead and are not part of
  // the gate's edge surface (matches the renderer).
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const edgePlans = graphMode ? deriveGraphEdges(graph) : [];
  const edges: EdgeGeom[] = [];
  const edgePolylines: Array<{ id: string; pts: { x: number; y: number; z: number }[] }> = [];
  for (const plan of edgePlans) {
    const fromNode = byId.get(plan.fromId);
    const toNode = byId.get(plan.toId);
    if (!fromNode || !toNode) continue;
    const rFrom = fromNode.size * 0.5;
    const rTo = toNode.size * 0.5;
    const route = routeEdge(plan.from, plan.to, { fromId: plan.fromId, toId: plan.toId }, envelopes);
    const head = edgeHeadFor(rTo);
    const pts = shaftPolyline(route, plan.from, plan.to, rFrom, rTo, head.len);
    edgePolylines.push({ id: plan.id, pts });
    const rel = graph.relationships.find((r) => r.id === plan.id);
    edges.push({
      id: plan.id,
      fromId: plan.fromId,
      toId: plan.toId,
      inhibits: rel?.type === "inhibits",
      pts,
      headLen: head.len,
      targetRadius: rTo,
    });
  }

  // Node labels (glyph rects at the placed anchors — same planner the
  // renderer runs at build) + edge labels (scene-level placement).
  const nodeLabelPlan = planNodeLabels(
    graph,
    graphMode ? { edgePlans } : undefined,
  );
  pipelineReasons.push(...nodeLabelPlan.reasons);
  const labels: LabelGeom[] = nodeLabelPlan.plans.map((plan) => ({
    id: `node-label-${plan.nodeId}`,
    kind: "node",
    rect: plan.rect,
    text: plan.text,
    truncated: plan.truncated,
  }));
  const edgeLabelPlans = placeSceneEdgeLabels(
    edgePlans.map((p) => {
      const rel = graph.relationships.find((r) => r.id === p.id);
      return {
        id: p.id,
        text: rel?.label ?? rel?.type ?? p.label ?? p.id,
        from: p.from,
        to: p.to,
      };
    }),
    graph.nodes
      .filter((n) => n.kind !== "group")
      .map((n) => nodeEnvelope(n)),
    nodeLabelPlan.plans.map((p) => p.rect),
    edgePolylines,
  );
  pipelineReasons.push(...edgeLabelPlans.reasons);
  for (const plan of edgeLabelPlans.plans.values()) {
    labels.push({
      id: `edge-label-${plan.id}`,
      kind: "edge",
      rect: {
        cx: plan.pos.x,
        cy: plan.pos.y,
        cz: plan.pos.z,
        halfW: plan.halfW,
        halfH: plan.halfH,
        halfD: 0.001,
      },
      text: plan.text,
      truncated: false,
    });
  }

  // Camera: the renderer's build-time frame (content AABB → half-height,
  // default aspect) + canonical views for the gate's I5 sweep.
  const content = contentAABBFromGraph(graph, { graphMode });
  const center = contentExtentCenter(content);
  const aspect = FRAME_ASPECT_DEFAULT;
  let camera: GateScene["camera"];
  if (graphMode) {
    const halfH = graphFrameHalfHeight(content, aspect).halfH;
    camera = {
      mode: "ortho",
      center,
      halfH,
      halfW: halfH * aspect,
      aspect,
      distance: Math.min(120, Math.max(4, diagonalOf(graph) * 2.2)),
      fovDeg: DEFAULT_FOV_DEG,
      canonicalViews: canonicalViews({
        graphMode,
        center,
        azimuth: Math.atan2(0, 1),
        polar: Math.acos(0.55 / Math.hypot(0, 0.55, 1)),
        distance: Math.min(120, Math.max(4, diagonalOf(graph) * 2.2)),
        halfH,
        aspect,
        content,
      }),
    };
  } else {
    const distance = perspectiveDistance(content, DEFAULT_FOV_DEG, aspect);
    camera = {
      mode: "perspective",
      center,
      halfH: 0,
      halfW: 0,
      aspect,
      distance,
      fovDeg: DEFAULT_FOV_DEG,
      canonicalViews: canonicalViews({
        graphMode,
        center,
        azimuth: Math.atan2(1, 1.35),
        polar: Math.acos(0.65 / Math.hypot(1, 0.65, 1.35)),
        distance,
        halfH: 0,
        aspect,
        content,
      }),
    };
  }

  const scene: GateScene = {
    envelopes: sceneEnvelopes,
    edges,
    labels,
    camera,
    declaredRelationships: graph.relationships.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
    })),
  };

  return {
    scene,
    graph,
    graphMode,
    pipelineReasons,
  };
}

// ---------------------------------------------------------------------------
// Pure gate-run tests
// ---------------------------------------------------------------------------

test("gate run: all 10 templates + 3 showcases pass I1–I5 (critical/major = 0)", () => {
  const failures: Array<{ id: string; violations: Violation[] }> = [];
  const infoReasons = new Set<string>();
  for (const seed of ALL_SEEDS) {
    const { scene, graphMode } = assemblePipelineScene(seed.build());
    const result = checkScene(scene);
    for (const v of result.violations) {
      if (v.invariant === "INFO") infoReasons.add(v.reason);
    }
    if (!result.ok) failures.push({ id: seed.id, violations: result.violations });
    expect(
      graphMode,
      `${seed.id}: renderer camera mode (graph-like, no engine coupling)`,
    ).toBe(seed.graphMode);
  }
  expect(
    failures,
    "templates/showcases must pass the geometry gate (I1–I5):\n" +
      failures
        .map(
          (f) =>
            `${f.id}: ${f.violations
              .map((v) => `[${v.invariant}/${v.severity}] ${v.reason} (${v.id})`)
              .join("; ")}`,
        )
        .join("\n"),
  ).toEqual([]);
  // Informational reasons are surfaced, never failing (sanity: the channel works).
  expect(infoReasons.size).toBeGreaterThan(0);
});

test("gate run: stress corpus reports the expected violation profile", () => {
  for (const entry of STRESS_CORPUS) {
    const { scene, pipelineReasons } = assemblePipelineScene(entry.spec);
    const result = checkScene(scene);
    const critical = result.violations.filter((v) => v.severity === "critical");
    expect(critical, `${entry.id}: zero critical violations`).toEqual([]);
    expect(
      result.ok,
      `${entry.id}: ok should be ${entry.expect.major === 0} (expected major=${entry.expect.major})`,
    ).toBe(entry.expect.major === 0);
    // Gate-emitted reason codes must surface.
    const gateReasons = new Set(result.violations.map((v) => v.reason));
    const pipelineSet = new Set(pipelineReasons);
    for (const reason of entry.expect.reasons) {
      expect(
        gateReasons.has(reason) || pipelineSet.has(reason),
        `${entry.id}: expected reason "${reason}" in gate violations or pipeline reasons`,
      ).toBe(true);
    }
    if (entry.id === "dense_80_lattice") {
      const i1 = checkEnvelopeIntersections(scene);
      expect(i1.violations.length).toBeGreaterThanOrEqual(70);
    }
    if (entry.id === "size5_1u_spacing") {
      const reasons = result.violations.map((v) => v.reason);
      expect(reasons).toContain(REASON_ENVELOPE_OVERLAP);
      // NOTE: the corpus annotation also expects content_outside_viewport
      // (I5) here, but C4's content-AABB framing covers the whole AABB by
      // construction, so I5 may pass; only the guaranteed I1 outcome is
      // asserted. (Counts beyond that are pipeline-annotation-derived and
      // depend on the nonexistent resolvePresentation aggregate.)
    }
    if (entry.id === "short_edges") {
      expect(result.violations.some((v) => v.reason === REASON_ARROW_HEAD_IN_SOURCE)).toBe(true);
    }
  }
});

// ---------------------------------------------------------------------------
// Browser helpers (same seeding as demo-lesson-rail.spec.ts)
// ---------------------------------------------------------------------------

const SHOT_DIR = path.join(__dirname, "..", "validation-pack", "screenshots", "3d-quality");

async function seedDemo(
  page: Page,
  query: string,
  urlPattern: RegExp,
): Promise<void> {
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Ask for a demonstration" }),
  ).toBeVisible();
  await page.getByLabel("What topic do you need help with?").fill(query);
  await page.getByRole("button", { name: "Find my learning path" }).click();
  await expect(
    page.getByRole("button", { name: "Enter demonstration" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await page.waitForURL(urlPattern);
}

function collectConsole(page: Page): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // Deliberate: the seeding stub fails POST /api/demonstrations/generate
      // (HTTP 500) on purpose to drive the offline fallback — same filter as
      // demo-lesson-rail.spec.ts. Every other error is a real finding.
      if (msg.location()?.url?.includes("/api/demonstrations/generate")) return;
      errors.push(msg.text());
    } else if (msg.type() === "warning") {
      warnings.push(msg.text());
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return { errors, warnings };
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
}

async function stageCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator("canvas:visible").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  // Let the build frame + the first reframe tick (0.5 s) settle.
  await page.waitForTimeout(1_200);
  return canvas;
}

/** Project every graph node center into CSS px through the renderer's own
 * camera and assert it lands inside the live canvas box (screen-level I5). */
async function assertGraphNodesInsideCanvas(
  page: Page,
  canvas: Locator,
  spec: DemoSpecV1,
): Promise<void> {
  const { scene, graph } = assemblePipelineScene(spec);
  if (!scene.camera || scene.camera.mode !== "ortho") return; // perspective scenes: covered by gate I5
  const box = await canvas.boundingBox();
  expect(box, "3D stage canvas must be measurable").not.toBeNull();
  const center = scene.camera.center;
  const halfH = scene.camera.halfH;
  const aspect = box!.width / box!.height;
  const graphNodes = graph.nodes.filter(
    (n) => GRAPH_NODE_KINDS.has(n.kind),
  );
  expect(graphNodes.length).toBeGreaterThan(0);
  const misses: string[] = [];
  for (const n of graphNodes) {
    const p = projectOrthoToCSS(n.position, {
      center,
      halfH,
      aspect,
      canvasBox: box!,
    });
    const pad = 1; // 1 CSS px tolerance
    if (
      p.x < box!.x - pad ||
      p.x > box!.x + box!.width + pad ||
      p.y < box!.y - pad ||
      p.y > box!.y + box!.height + pad
    ) {
      misses.push(
        `${n.id}@(${n.position.x},${n.position.y},${n.position.z}) -> (${p.x.toFixed(1)},${p.y.toFixed(1)})`,
      );
    }
  }
  expect(
    misses,
    `graph node centers must project inside the live canvas:\n${misses.join("\n")}`,
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// 2D diagram bounding-box QA (real DOM rects; templates only)
// ---------------------------------------------------------------------------

interface Box2D { x: number; y: number; w: number; h: number; }
function overlaps(a: Box2D, b: Box2D, tol: number): boolean {
  return (
    a.x + a.w > b.x + tol &&
    b.x + b.w > a.x + tol &&
    a.y + a.h > b.y + tol &&
    b.y + b.h > a.y + tol
  );
}

async function openDiagramTab(page: Page): Promise<Locator | null> {
  const tab = page.getByRole("tab", { name: "Diagram" });
  if (!(await tab.isVisible().catch(() => false))) return null;
  await tab.click();
  const svg = page.locator('svg[role="img"][aria-label^="Relationship diagram"]');
  await expect(svg).toBeVisible({ timeout: 10_000 });
  return svg;
}

/** One edge group -> its arrowhead polygon tip (viewBox units) + target id
 * resolution happens in the test via the spec. */
interface DomShape {
  id: string;
  label: string;
  body: Box2D;
  center: { x: number; y: number };
  labelBox: Box2D;
}

interface EdgeDom {
  type: string;
  tip: { x: number; y: number };
  labelBox: Box2D | null;
}

async function readDiagramDom(svg: Locator): Promise<{
  shapes: DomShape[];
  edges: EdgeDom[];
  svgBox: Box2D;
}> {
  const svgBoxRaw = await svg.boundingBox();
  expect(svgBoxRaw).not.toBeNull();
  const svgBox: Box2D = {
    x: svgBoxRaw!.x,
    y: svgBoxRaw!.y,
    w: svgBoxRaw!.width,
    h: svgBoxRaw!.height,
  };
  const shapeGroups = svg.locator("g:not([data-edge-type])");
  const shapeCount = await shapeGroups.count();
  const shapes: DomShape[] = [];
  for (let i = 0; i < shapeCount; i++) {
    const g = shapeGroups.nth(i);
    const body = g.locator("circle, rect, polygon").first();
    const text = g.locator("text").first();
    const bodyBoxRaw = await body.boundingBox();
    const textBoxRaw = await text.boundingBox();
    expect(bodyBoxRaw, `shape body ${i} must have a box`).not.toBeNull();
    const bodyBox: Box2D = {
      x: bodyBoxRaw!.x,
      y: bodyBoxRaw!.y,
      w: bodyBoxRaw!.width,
      h: bodyBoxRaw!.height,
    };
    const textBox: Box2D = textBoxRaw
      ? { x: textBoxRaw.x, y: textBoxRaw.y, w: textBoxRaw.width, h: textBoxRaw.height }
      : { x: 0, y: 0, w: 0, h: 0 };
    shapes.push({
      id: `shape-${i}`,
      label: ((await text.textContent()) ?? "").trim(),
      body: bodyBox,
      center: {
        x: bodyBox.x + bodyBox.w / 2,
        y: bodyBox.y + bodyBox.h / 2,
      },
      labelBox: textBox,
    });
  }
  const edgeGroups = svg.locator("g[data-edge-type]");
  const edgeCount = await edgeGroups.count();
  const edges: EdgeDom[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const g = edgeGroups.nth(i);
    const type = (await g.getAttribute("data-edge-type")) ?? "unknown";
    const polygon = g.locator("polygon").first();
    const polygonBox = await polygon.boundingBox();
    expect(polygonBox, `edge ${i} arrowhead must exist`).not.toBeNull();
    // The arrowhead polygon's first vertex is the tip (viewBox units); map it
    // to CSS px through the svg client rect.
    const points = ((await polygon.getAttribute("points")) ?? "").trim();
    const first = points.split(/\s+/)[0];
    const [vbX, vbY] = first.split(",").map((s) => parseFloat(s));
    const scaleX = svgBox.w / VIEW_W;
    const scaleY = svgBox.h / VIEW_H;
    const edgeLabel = g.locator("text").first();
    const labelBoxRaw = await edgeLabel.boundingBox();
    const labelBox: Box2D | null = labelBoxRaw
      ? { x: labelBoxRaw.x, y: labelBoxRaw.y, w: labelBoxRaw.width, h: labelBoxRaw.height }
      : null;
    edges.push({
      type,
      tip: {
        x: svgBox.x + vbX * scaleX,
        y: svgBox.y + vbY * scaleY,
      },
      labelBox,
    });
  }
  return { shapes, edges, svgBox };
}

async function assertDiagramQa(page: Page, spec: DemoSpecV1, seedId: string): Promise<void> {
  const svg = await openDiagramTab(page);
  expect(svg, "templates must offer the Diagram representation").not.toBeNull();
  const { shapes, edges, svgBox } = await readDiagramDom(svg!);
  expect(shapes.length).toBeGreaterThan(1);

  // 1. Shape body vs shape body: no on-screen overlap (1 px tolerance).
  const shapePairs: string[] = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (overlaps(shapes[i].body, shapes[j].body, 1)) {
        shapePairs.push(`${i}(${shapes[i].label}) vs ${j}(${shapes[j].label})`);
      }
    }
  }
  expect(
    shapePairs,
    `${seedId}: no two shape bodies may overlap on the 2D surface:\n${shapePairs.join("\n")}`,
  ).toEqual([]);

  // 2. Node labels vs OTHER shape bodies (a label may sit on its own shape by
  //    2D convention, never on a different one).
  const labelShapeHits: string[] = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = 0; j < shapes.length; j++) {
      if (i === j) continue;
      if (overlaps(shapes[i].labelBox, shapes[j].body, 1)) {
        labelShapeHits.push(`label "${shapes[i].label}" overlaps shape ${j} ("${shapes[j].label}")`);
      }
    }
  }
  expect(
    labelShapeHits,
    `${seedId}: node labels must not overlap another shape's body:\n${labelShapeHits.join("\n")}`,
  ).toEqual([]);

  // 3. Edge labels vs shape bodies + within the viewBox.
  const edgeLabelHits: string[] = [];
  for (const e of edges) {
    if (!e.labelBox) continue;
    for (let j = 0; j < shapes.length; j++) {
      if (overlaps(e.labelBox, shapes[j].body, 1)) {
        edgeLabelHits.push(`edge label (${e.type}) overlaps shape "${shapes[j].label}"`);
      }
    }
    if (
      e.labelBox.x < svgBox.x - 2 ||
      e.labelBox.x + e.labelBox.w > svgBox.x + svgBox.w + 2 ||
      e.labelBox.y < svgBox.y - 2 ||
      e.labelBox.y + e.labelBox.h > svgBox.y + svgBox.h + 2
    ) {
      edgeLabelHits.push(`edge label (${e.type}) outside the viewBox`);
    }
  }
  expect(
    edgeLabelHits,
    `${seedId}: edge labels must clear shapes and stay in the viewBox:\n${edgeLabelHits.join("\n")}`,
  ).toEqual([]);

  // 4. Arrow tips sit at exactly HEAD_TIP_PX (26, viewBox units) from the
  //    target center — the design's I4-2D "tip ON the surface" claim,
  //    verified against the real DOM polygon. Only checked when the target
  //    label resolves uniquely (duplicate labels cannot be mapped).
  const labelCounts = new Map<string, number>();
  for (const s of shapes) {
    labelCounts.set(s.label, (labelCounts.get(s.label) ?? 0) + 1);
  }
  const relationships = spec.scene3d?.relationships ?? [];
  const objects = spec.scene3d?.objects ?? [];
  const resolvedByEdge = new Map<string, string>();
  for (const rel of relationships) {
    const target = objects.find((o) => o.id === rel.to);
    if (target) resolvedByEdge.set(rel.id, target.label ?? target.kind);
  }
  const tipMismatches: string[] = [];
  const scale = svgBox.w / VIEW_W;
  for (let i = 0; i < edges.length; i++) {
    // Map edge DOM index -> relationship id: the component renders edges in
    // relationship order filtered to mapped roots (see AccessibleDiagram).
    const relationship = relationships.filter(
      (r) =>
        objects.some((o) => o.id === r.from) &&
        objects.some((o) => o.id === r.to),
    )[i];
    if (!relationship) continue;
    const targetLabel = resolvedByEdge.get(relationship.id);
    if (!targetLabel) continue;
    const matches = shapes.filter((s) => s.label === targetLabel);
    if (matches.length !== 1) continue; // non-unique target label: skip
    const target = matches[0];
    const dist = Math.hypot(edges[i].tip.x - target.center.x, edges[i].tip.y - target.center.y);
    const expected = SHAPE_RADIUS_PX * scale;
    if (Math.abs(dist - expected) > 3 * scale) {
      tipMismatches.push(
        `edge ${relationship.id} (${relationship.type}): tip ${dist.toFixed(1)}px from target "${targetLabel}" center, expected ${expected.toFixed(1)}±${(3 * scale).toFixed(1)}`,
      );
    }
  }
  expect(
    tipMismatches,
    `${seedId}: arrow tips must sit on the target surface (HEAD_TIP_PX):\n${tipMismatches.join("\n")}`,
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// Browser tests — one journey per demo
// ---------------------------------------------------------------------------

for (const seed of ALL_SEEDS) {
  test(`demo journey + QA: ${seed.id}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const consoleState = collectConsole(page);
    const spec = seed.build();

    await seedDemo(page, seed.query, seed.urlPattern);

    // 3D stage: canvas renders and (graph scenes) every node center projects
    // inside the live canvas through the renderer's own camera.
    const canvas = await stageCanvas(page);
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox, "stage canvas must have a size").not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThanOrEqual(200);
    expect(canvasBox!.height).toBeGreaterThanOrEqual(200);
    await assertGraphNodesInsideCanvas(page, canvas, spec);

    await shot(page, `${seed.id}-front-3d.png`);

    if (seed.kind === "template") {
      await assertDiagramQa(page, spec, seed.id);
      const svg = page.locator('svg[role="img"][aria-label^="Relationship diagram"]');
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await svg.screenshot({ path: path.join(SHOT_DIR, `${seed.id}-diagram-2d.png`) });
    }

    // Zero error-level console messages (the deliberate generate-500 log is
    // filtered); warnings are reported for the record.
    expect(
      consoleState.errors,
      `${seed.id}: zero error-level console messages on the journey:\n` +
        consoleState.errors.map((e) => `  ${e}`).join("\n"),
    ).toEqual([]);
    if (consoleState.warnings.length > 0) {
      console.warn(`${seed.id}: console warnings:\n` + consoleState.warnings.join("\n"));
    }
  });
}
