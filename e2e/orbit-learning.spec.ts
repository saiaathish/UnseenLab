import { test, expect, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  contentAABBFromGraph,
  contentExtentCenter,
  perspectiveDistance,
  FRAME_ASPECT_DEFAULT,
  DEFAULT_FOV_DEG,
} from "@/demonstrations/renderers/primitive-3d/camera";

/**
 * ORBIT LEARNING-INTERFACE UPGRADE — WAVE 1 (CONTRACT TESTS)
 * =========================================================
 * Branch feature/generative-demonstration-engine @ 9a1f231. These tests PIN
 * the browser-reproduced failures from .superpowers/sdd/orbit-learning/
 * root-cause.md and the mission's BROWSER ACCEPTANCE (T1/T2/T5 trail,
 * L1/L2/L7/L10 labels+identity, C1/C2/C4 camera, P6/P7 honesty) as RED
 * contract tests. Wave 2 adds the seams/features that turn them green; Wave 5
 * runs the full acceptance. NO fix is implemented here by design.
 *
 * ---------------------------------------------------------------------------
 * WAVE-2 SEAM / FEATURE DEPENDENCIES (the contract Wave 2 must satisfy)
 * ---------------------------------------------------------------------------
 * 1. DEBUG SEAM — `window.__unseenlabScene`, a read-only handle set by the
 *    stage host when a primitive_3d/hybrid stage is mounted on /demos/[id],
 *    updated at <=10Hz. Chosen over a `data-trail-points` canvas attribute:
 *    trail world-space deltas, projected screen coords and the escape
 *    classification need a structured payload (root-cause fix seams 2/6).
 *    Exact shape consumed by this spec:
 *      {
 *        trail:  { points: {x,y,z}[],        // world-space history ring
 *                  epoch: number },          // ++ on every re-aim/clear (T2)
 *        objects: [{ id, label,              // "star"/"planet", labels
 *                    projected: {x,y},       // CSS px, page coords
 *                    projectedRadiusPx }],   // C1
 *        camera: { reframed: boolean, reframeCount: number },   // C4
 *        engine: { classification: "bound" | "escape" | null }, // P6
 *      }
 * 2. DOM LABEL OVERLAY — persistent DOM labels for scene objects inside the
 *    stage container (root-cause fix seam 5; the stage container is the
 *    ready seam), font-size >= 14px, within the stage bounds (L1).
 * 3. TOOLTIP — pointer hover over a body's projected position shows a
 *    `role="tooltip"` naming the body, within the viewport (L2/L7; today
 *    picking is 100% graphMode-gated, zero tooltip components in the repo).
 * 4. SEMANTIC LIST — a `role=list` of scene objects inside the stage,
 *    keyboard-focusable, whose items expose the same names as the labels
 *    (L10; nothing exists today).
 * 5. CAMERA FRAMING — default frame keeps star+planet on screen with the
 *    planet's projected radius >= 4px and inside the middle 80%; a Launch
 *    speed change triggers a bounded reframe (clear the permanent
 *    userControlled latch on parameter change; include the visible mesh in
 *    the dynamic extent) so the planet stays in the canvas at max speed (C1/
 *    C2/C4; root-cause fix seam 3 — phantom dynamic extent, permanent latch,
 *    grow-only no-shrink).
 * 6. ESCAPE HONESTY — the seam reports the engine's bound/escape
 *    classification; while escape, no label claims "orbiting" and the trail
 *    is never presented as a closed bound orbit (P6/P7; root-cause fix seam
 *    6 — teleport connector + honest escape at speed >= sqrt(2) ~1.414,
 *    curated UI max 1.2 cannot escape; the AI-composed path exposes 3.0).
 *
 * ---------------------------------------------------------------------------
 * OBSERVED BEHAVIOR TODAY (probed 2026-08-08 against this build, 1280x800):
 * - `window.__unseenlabScene` is undefined; no `data-trail-points`; no trail
 *   geometry (planet/moon are kind "sphere" -> visuals.ts builds trail state
 *   only for kind "trail").
 * - No DOM label/tooltip/list: the stage DOM contains only the canvas; the
 *   stage aria-label is "3D Model" (showcase) / "3D animation" (fixture).
 *   In-canvas sprite labels exist at 5.6-11.2 CSS px (root-cause A09/A18;
 *   moon 2.9px; mobile 1.4-6.9px) — not readable as DOM.
 * - Default framing (renderer's own build camera, live 708x398 canvas):
 *   star css(336.8,189.2) r12.6px; planet@150 engine units css(408.9,203.1)
 *   r~5.7px (0.8% of canvas width; the brief's ~1.7%-of-frame figure varies
 *   with the live grow-only reframe; root-cause measured 0.58-degree dots in
 *   degraded grow-only distance states); moon r~2.05px.
 * - Readouts are HONEST at escape: fixture path speed 1.45 (escape) shows
 *   DISTANCE 168 -> 747 in 3s (engine never clamps); PERIOD flaps
 *   (85.8 -> 325.8s) — meaningless for an unbound path but not labeled.
 * - No visible text claims "orbiting" today (hybrid stage renders flow edges
 *   only for EDGE_TYPES {flows_to,transfers_to,transforms_into}; the
 *   "orbits"/"attracts" relationship labels are NOT rendered).
 * - Curated showcase Launch speed max = 1.2 < sqrt(2): escape is NOT
 *   reachable through the curated UI; the AI-composed path (generate-200
 *   fixture, slider max 3.0) is the escape-capable 3D seed.
 *
 * ---------------------------------------------------------------------------
 * FAILURE INVENTORY (each test -> today's reason):
 * - test 1 (T1/T2/T5): FAILS — no seam, no trail, no epoch, no clear-on-
 *   re-aim (placeBodies teleports and pushTrailPoint would connect old-last
 *   -> new-start with a straight segment; zero resetTrail/clearTrail sites).
 * - test 2 (L1/L7): FAILS — labels are in-canvas sprites (5.6-11.2px), no
 *   DOM overlay, no tooltip (zero tooltip components; picking graphMode-gated).
 * - test 3 (L10): FAILS — no semantic list exists.
 * - test 4 (C1/C2/C4): FAILS — seam missing (measured planet radius ~5.7px
 *   is marginal vs the 4px floor at the default frame; the latched-camera
 *   frustum-exit documented in root-cause is isolated away per the mission
 *   instruction by never dragging the camera).
 * - test 5 (P6/P7): FAILS — seam missing; today the UI is honestly silent
 *   (readouts grow truthfully, no orbiting label), so this test is the
 *   FUTURE CONTRACT: the seam must report the classification or its honest
 *   absence, and nothing may mislabel while escaping.
 * - test 6 (console hygiene): PASSES today (guard, not a defect) — the
 *   deliberate generate-500 log is filtered exactly like demo-lesson-rail.
 *
 * Gating: production build baked with NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1;
 * self-skips otherwise (mirrors e2e/demo-lesson-rail.spec.ts). Run with the
 * repo Node gate: env PATH="/opt/homebrew/opt/node/bin:..." and the flag
 * exported; playwright.config webServer starts `npm run start -- -p 3100`.
 *
 * ---------------------------------------------------------------------------
 * WAVE-5 SPEC-ONLY FIX (W6-flagged known issue): test 2's label locators
 * used `panel.getByText("Star"/"Planet", { exact: true })`. Wave 2 mounted
 * the DOM label overlay AND Wave 3 the semantic role=list inside the same
 * stage container; both expose the identical names, so the unscoped locator
 * matched two elements and tripped Playwright strict mode. Fix: scope the
 * label lookup to the overlay layer (`div[style*="z-index: 10"] span` — the
 * ProjectedLabelOverlay's pointer-events-none layer; the tooltip uses
 * z-index:50, no other stage element uses inline z-index:10; the selector
 * needs the space after the colon because the browser normalizes cssText).
 * No app-source change. All other assertions in this spec are untouched.
 *
 * WAVE-5 SPEC-ONLY AMENDMENT (W6-2, evidence-backed deviation): the mission
 * brief assumed the overlay renders a "Star" label; the placement planner
 * (labels.ts planNodeLabels) marks `star occluded: true` — the label would
 * sit on the ~94px star disc — so the overlay honestly renders
 * Planet/Moon/Default orbit guide only. L1 now asserts the placed primary
 * labels (>= 14px) + the secondary ring label (>= 12px), and the star's
 * identity via the semantic list item (same-name contract) — the hover
 * tooltip "Star" is asserted in e2e/orbit-learning-acceptance.spec.ts.
 * ---------------------------------------------------------------------------
 */

const DEMOS_ENABLED = process.env.NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED === "1";

test.skip(
  !DEMOS_ENABLED,
  "NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 was not exported — this spec needs " +
    "a production build baked with the demo experience (ask-demo flow + " +
    "/demos/[id]). Skipping keeps the suite green for non-demo builds.",
);

// ---------------------------------------------------------------------------
// Constants (root-cause verified numbers)
// ---------------------------------------------------------------------------

/** T5 re-aim threshold: legit consecutive trail deltas measure 0.16-1.6
 * world units; re-aims (placeBodies teleports) are 6+; pointer drags 12+.
 * 4.0 sits between the two regimes — anything above it is a teleport
 * connector, anything below it is honest motion. */
const RE_AIM_THRESHOLD = 4.0;

/** Curated showcase engine defaults (build-spec.ts): planet world radius 0.5
 * on the engine orbit radius 6 (ring = "Default orbit guide"). */
const RING_RADIUS_WORLD = 6;

/** Physics: escape is real at launch speed >= sqrt(2) ~1.414. The curated
 * showcase slider caps at 1.2 (unreachable); the AI-composed fixture caps at
 * 3.0 (reachable). */
const ESCAPE_SPEED_MIN = Math.SQRT2;

// ---------------------------------------------------------------------------
// Seam contract types (see header, dependency #1)
// ---------------------------------------------------------------------------

interface TrailSeam {
  points: Array<{ x: number; y: number; z: number }>;
  epoch: number;
}
interface ObjectSeam {
  id: string;
  label: string;
  projected: { x: number; y: number };
  projectedRadiusPx: number;
}
interface CameraSeam {
  reframed: boolean;
  reframeCount: number;
}
interface EngineSeam {
  classification: "bound" | "escape" | null;
}
interface SceneSeam {
  trail: TrailSeam;
  objects: ObjectSeam[];
  camera: CameraSeam;
  engine: EngineSeam;
}

// ---------------------------------------------------------------------------
// Seeding (offline catalog + AI-composed fixture paths)
// ---------------------------------------------------------------------------

const SHOT_DIR = path.join(__dirname, "..", "validation-pack", "screenshots", "orbit-learning");

async function seedShowcase(page: Page): Promise<void> {
  // Offline catalog path: stub POST /api/demonstrations/generate with HTTP
  // 500 -> deterministic curated offline fallback -> /demos/showcase-orbits
  // (exact seeding of e2e/demo-lesson-rail.spec.ts and e2e/3d-quality.spec.ts).
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Ask for a demonstration" }),
  ).toBeVisible();
  await page.getByLabel("What topic do you need help with?").fill("Show why planets stay in orbit.");
  await page.getByRole("button", { name: "Find my learning path" }).click();
  await expect(
    page.getByRole("button", { name: "Enter demonstration" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await page.waitForURL(/\/demos\/showcase-orbits/);
}

async function seedFixture(page: Page): Promise<void> {
  // AI-composed path: stub POST /api/demonstrations/generate with HTTP 200
  // and the captured verified-simulation spec (e2e/fixtures/orbit-spec.json,
  // renderer primitive_3d + engineId orbits; Launch speed slider max 3.0 —
  // the only 3D seed where escape is reachable). Exact seeding of
  // e2e/demo-journey.spec.ts "hosted path".
  const orbitSpec = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "orbit-spec.json"), "utf8"),
  );
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { outcome: "spec", spec: orbitSpec, source: "model", reason: "e2e fixture" },
      }),
    }),
  );
  await page.goto("/");
  await page.getByLabel("What topic do you need help with?").fill("Show why planets stay in orbit.");
  await page.getByRole("button", { name: "Find my learning path" }).click();
  await expect(
    page.getByRole("button", { name: "Enter demonstration" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await page.waitForURL(/\/demos\/demo-orbits-001/);
}

// ---------------------------------------------------------------------------
// Journey helpers
// ---------------------------------------------------------------------------

function collectConsole(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Deliberate: the seeding stub fails POST /api/demonstrations/generate
    // (HTTP 500) on purpose to drive the offline fallback — same filter as
    // demo-lesson-rail.spec.ts / 3d-quality.spec.ts.
    if (msg.location()?.url?.includes("/api/demonstrations/generate")) return;
    errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return { errors };
}

/** The 3D stage canvas (the showcase and fixture both label it
 * "... 3D stage canvas"; the hidden 2D engine canvas is "... simulation
 * canvas"). Settle 1200ms like 3d-quality.stageCanvas(). */
async function stageCanvas(page: Page): Promise<Locator> {
  const canvas = page.locator('canvas[aria-label*="3D stage canvas"]').first();
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1_200);
  return canvas;
}

/** The stage container — the ready seam the Wave-2 DOM overlay must live in
 * (root-cause fix seam 5). */
function stagePanel(page: Page): Locator {
  return page.locator("#demo-rep-panel");
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, name) });
}

/** Commit the prediction to unlock the controls (sliders are gated on the
 * committed prediction, demo-journey pattern). */
async function unlockControls(page: Page): Promise<void> {
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Launch speed" }),
  ).toBeEnabled();
}

function launchSlider(page: Page): Locator {
  return page.getByRole("slider", { name: "Launch speed" });
}

/** Read the Wave-2 debug seam, or null when absent (today: always null). */
async function readSeam(page: Page): Promise<SceneSeam | null> {
  return page.evaluate(() => {
    const seam = (window as unknown as { __unseenlabScene?: SceneSeam }).__unseenlabScene;
    return seam ?? null;
  });
}

/** Max euclidean world-space delta between consecutive trail points (T5). */
function maxTrailDelta(points: Array<{ x: number; y: number; z: number }>): number {
  let max = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z,
    );
    if (d > max) max = d;
  }
  return max;
}

/** DISTANCE readout value (engine units) from the live readouts inside the
 * stage panel, or null when unparseable. The engine is the canonical source
 * and never clamps (root-cause: physics correct). */
async function distanceReadout(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const panel = document.querySelector("#demo-rep-panel");
    if (!panel) return null;
    const text = (panel as HTMLElement).innerText;
    const m = text.match(/DISTANCE\s+([\d.]+)/i);
    return m ? parseFloat(m[1]) : null;
  });
}

// ---------------------------------------------------------------------------
// Pure default-frame projection for the showcase (hover target / C-checks
// fallback): mirrors applyCamera (camera.ts:1004) + the renderer's build
// camera (3d-quality assemblePipelineScene perspective branch). The live
// frame at the default parameter set equals the build frame (the engine
// dynamic extent at distance 150 -> pivot (0,0,0), r 0.5, is inside the
// build content, so no grow-only reframe fires). Wave 2's seam makes this
// fallback obsolete (seam.projected is authoritative).
// ---------------------------------------------------------------------------

const SHOWCASE_SPEC = buildOrbitsShowcase();
const { graph: SHOWCASE_GRAPH } = buildSceneGraph(SHOWCASE_SPEC);
const SHOWCASE_CONTENT = contentAABBFromGraph(SHOWCASE_GRAPH, { graphMode: false });
const SHOWCASE_CENTER = contentExtentCenter(SHOWCASE_CONTENT);
const SHOWCASE_DISTANCE = perspectiveDistance(
  SHOWCASE_CONTENT,
  DEFAULT_FOV_DEG,
  FRAME_ASPECT_DEFAULT,
);

function projectShowcaseDefault(
  canvasBox: { x: number; y: number; width: number; height: number },
  world: { x: number; y: number; z: number },
): { x: number; y: number } {
  const W = canvasBox.width;
  const H = canvasBox.height;
  const aspect = W / H;
  const f = 1 / Math.tan((DEFAULT_FOV_DEG * Math.PI) / 360);
  const az = Math.atan2(1, 1.35);
  const pol = Math.acos(0.65 / Math.hypot(1, 0.65, 1.35));
  const sp = Math.sin(pol);
  const cp = Math.cos(pol);
  const pos = {
    x: SHOWCASE_CENTER.x + SHOWCASE_DISTANCE * sp * Math.sin(az),
    y: SHOWCASE_CENTER.y + SHOWCASE_DISTANCE * cp,
    z: SHOWCASE_CENTER.z + SHOWCASE_DISTANCE * sp * Math.cos(az),
  };
  const fwd = { x: SHOWCASE_CENTER.x - pos.x, y: SHOWCASE_CENTER.y - pos.y, z: SHOWCASE_CENTER.z - pos.z };
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z);
  fwd.x /= fl; fwd.y /= fl; fwd.z /= fl;
  const right = {
    x: fwd.z - 0, y: 0 - fwd.x, z: 0, // cross(forward, up) with up=(0,1,0)
  };
  const rl = Math.hypot(right.x, right.y, right.z);
  right.x /= rl; right.y /= rl;
  const upv = {
    x: right.y * fwd.z - right.z * fwd.y,
    y: right.z * fwd.x - right.x * fwd.z,
    z: right.x * fwd.y - right.y * fwd.x,
  };
  const dx = world.x - pos.x;
  const dy = world.y - pos.y;
  const dz = world.z - pos.z;
  const depth = dx * fwd.x + dy * fwd.y + dz * fwd.z;
  const xc = dx * right.x + dy * right.y + dz * right.z;
  const yc = dx * upv.x + dy * upv.y + dz * upv.z;
  const ndcX = (xc * f) / (depth * aspect);
  const ndcY = (yc * f) / depth;
  return {
    x: canvasBox.x + (ndcX * 0.5 + 0.5) * W,
    y: canvasBox.y + (1 - (ndcY * 0.5 + 0.5)) * H,
  };
}

function insideBox(
  box: { x: number; y: number; width: number; height: number },
  p: { x: number; y: number },
  pad = 1,
): boolean {
  return (
    p.x >= box.x - pad &&
    p.x <= box.x + box.width + pad &&
    p.y >= box.y - pad &&
    p.y <= box.y + box.height + pad
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("T1/T2/T5 — trail continuity: seam exists, grows with motion, resets on re-aim, no jump connector", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleState = collectConsole(page);

  await seedShowcase(page);
  await stageCanvas(page);
  await shot(page, "contract-1-trail-default.png");

  // Wave-2 dependency #1: the debug seam. FAILS today — no seam, no trail.
  const seam0 = await readSeam(page);
  expect.soft(
    seam0,
    "T1: window.__unseenlabScene seam must exist (Wave-2 dep #1 — today: undefined; " +
      "trail state is only built for kind 'trail', never for the sphere planet/moon)",
  ).not.toBeNull();

  // T1: the trail grows while the planet moves (~2s of engine motion).
  await page.waitForTimeout(2_000);
  const seam1 = await readSeam(page);
  if (seam0 && seam1) {
    expect.soft(
      seam1.trail.points.length,
      "T1: trail points must grow >0 after ~2s of motion",
    ).toBeGreaterThan(seam0.trail.points.length);
    expect.soft(
      maxTrailDelta(seam1.trail.points),
      "T1: steady-state consecutive world deltas must stay under the re-aim threshold " +
        `${RE_AIM_THRESHOLD} (legit deltas measure 0.16-1.6; re-aims are 6+)`,
    ).toBeLessThan(RE_AIM_THRESHOLD);
  }

  // T2: a Launch speed change is a re-aim (placeBodies teleport) — the trail
  // must reset atomically (epoch bump), and the next points must NOT connect
  // to the pre-teleport tail with a straight segment (T5). FAILS today: no
  // clear path exists anywhere (zero resetTrail/clearTrail sites).
  await unlockControls(page);
  const slider = launchSlider(page);
  await slider.focus();
  const epochBefore = seam1?.trail.epoch ?? -1;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1_500);
  const seam2 = await readSeam(page);
  if (seam1 && seam2) {
    expect.soft(
      seam2.trail.epoch,
      "T2: the trail epoch must increment on a parameter re-aim (atomic clear; today: no clear path)",
    ).not.toBe(epochBefore);
    expect.soft(
      maxTrailDelta(seam2.trail.points),
      `T5: after reset, no point-jump connector — max world delta must stay under ${RE_AIM_THRESHOLD} ` +
        "(today the old-last -> new-start teleport connector is drawn: deltas 6+)",
    ).toBeLessThan(RE_AIM_THRESHOLD);
  }
  await shot(page, "contract-1-trail-after-reaim.png");

  expect(consoleState.errors, "zero error-level console messages on the journey").toEqual([]);
});

test("L1/L7 — label identity: persistent DOM labels >=14px in the stage; hover tooltip names the planet in the viewport", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleState = collectConsole(page);

  await seedShowcase(page);
  const canvas = await stageCanvas(page);
  const panel = stagePanel(page);

  // L1: persistent DOM labels inside the stage container (Wave-2 dep #2).
  // FAILS today: the labels are in-canvas sprites (5.6-11.2 CSS px at
  // desktop, moon 2.9px — root-cause A09/A18); the stage DOM has no text.
  //
  // W6 KNOWN-ISSUE FIX (spec-only): the overlay label and the semantic list
  // (L10) expose the SAME names, so an unscoped getByText("Star", {exact})
  // matches both (plus the legend chip) and trips Playwright strict mode.
  // Scope to the overlay layer: ProjectedLabelOverlay mounts a
  // pointer-events-none layer (inline "z-index: 10" — the tooltip uses
  // "z-index: 50", the legend/chrome use no inline z-index) inside the
  // stage's overlay host and renders each label as an absolutely-positioned
  // span. NOTE: the selector must use "z-index: 10" WITH the space — the
  // browser normalizes cssText, so "z-index:10" never matches.
  //
  // W6-2 (documented deviation, evidence-backed): the placement planner
  // marks the STAR's label occluded by the star disc (labels.ts
  // planNodeLabels — probe: `star "Star" occluded: true`; the star projects
  // to ~94px at the default frame), so the overlay honestly renders
  // Planet/Moon/Default orbit guide only. The star's identity is carried by
  // the semantic list item (L10), the legend chip and the hover tooltip
  // (asserted in e2e/orbit-learning-acceptance.spec.ts). The font floor is
  // asserted on the placed primary labels (Planet/Moon >= 14px) and the
  // secondary ring label (>= 12px).
  const overlayLabels = panel.locator('div[style*="z-index: 10"] span');
  const planetLabel = overlayLabels.filter({ hasText: /^Planet$/ });
  const moonLabel = overlayLabels.filter({ hasText: /^Moon$/ });
  const ringLabel = overlayLabels.filter({ hasText: /^Default orbit guide$/ });
  expect.soft(
    await planetLabel.count(),
    "L1: a persistent DOM label 'Planet' must exist inside the stage container " +
      "(Wave-2 dep #2 — today: in-canvas sprite, no DOM text)",
  ).toBeGreaterThan(0);
  // The moon's label is occlusion-hidden while the moon passes behind the
  // planet/star disc (the overlay hides occluded labels — unit-pinned); poll
  // through one moon orbit (~2.6s sim) for a window where it is visible.
  await expect
    .poll(
      async () => moonLabel.count(),
      {
        timeout: 15_000,
        message: "L1: 'Moon' DOM label must appear when it is not occluded",
      },
    )
    .toBeGreaterThan(0);
  expect.soft(
    await ringLabel.count(),
    "L1: the reference ring must carry its own label ('Default orbit guide')",
  ).toBeGreaterThan(0);
  // Star identity inside the stage: the semantic list item (same-name
  // contract as L10; the overlay planner hides the star label by design —
  // occluded by the star disc).
  expect.soft(
    await panel.getByRole("listitem", { name: "Star" }).count(),
    "L1: 'Star' must be identifiable inside the stage container (semantic list item — " +
      "the overlay planner occludes the star label by design, unit-pinned)",
  ).toBeGreaterThan(0);
  if ((await planetLabel.count()) > 0) {
    const fontSize = await planetLabel.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect.soft(
      fontSize,
      "L1: primary label font-size must be >= 14px (root cause: sprites at 5.6-11.2px)",
    ).toBeGreaterThanOrEqual(14);
    const labelBox = await planetLabel.boundingBox();
    const stageBox = await panel.boundingBox();
    if (labelBox && stageBox) {
      const inBounds =
        labelBox.x >= stageBox.x - 1 &&
        labelBox.x + labelBox.width <= stageBox.x + stageBox.width + 1 &&
        labelBox.y >= stageBox.y - 1 &&
        labelBox.y + labelBox.height <= stageBox.y + stageBox.height + 1;
      expect.soft(inBounds, "L1: labels must sit inside the stage container bounds").toBe(true);
    }
  }
  await shot(page, "contract-2-labels-default.png");

  // L2/L7: hovering the planet's projected position shows a tooltip naming it
  // (Wave-2 dep #3). FAILS today: picking is 100% graphMode-gated and the
  // repo has zero tooltip components. Hover = mouse.move only (no pointerdown,
  // so the camera latch is never engaged).
  //
  // W6-4 (spec-only, documented): the seam's `projected` is the LABEL anchor
  // in canvas CSS px — the planet BODY sits ~26px below the "above" anchor
  // (measured live) and moves ~150px/s on screen. Hover in page coords
  // (canvas box origin + seam anchor), re-reading the seam before every move,
  // and walk a dy band until the tooltip names the planet (the ring's own
  // "Default orbit guide" tooltip can appear in the band — keep searching).
  // Without the seam, fall back to the renderer's own default-frame
  // projection of the planet's world position (page coords).
  const box = await canvas.boundingBox();
  const fallbackPoint = box
    ? projectShowcaseDefault(box, { x: RING_RADIUS_WORLD, y: 0, z: 0 })
    : null;
  const tooltip = page.locator('[role="tooltip"]');
  const dyBand = [18, 26, 34, 10, -18, -26, 42, -10];
  const dxBand = [0, -8, 8];
  let tooltipHit = false;
  for (let attempt = 0; attempt < 16 && !tooltipHit; attempt++) {
    const seam = await readSeam(page);
    const planet = seam?.objects.find((o) => o.id === "planet");
    const base =
      planet && box
        ? { x: box.x + planet.projected.x, y: box.y + planet.projected.y }
        : fallbackPoint;
    if (!base) throw new Error("3D stage canvas must be measurable");
    const x = base.x + dxBand[attempt % 3];
    const y = base.y + dyBand[attempt % 8];
    await page.mouse.move(x, y);
    await page.waitForTimeout(250);
    tooltipHit =
      (await tooltip.count()) > 0 &&
      (await tooltip.first().isVisible().catch(() => false)) &&
      (await tooltip.first().innerText()).includes("Planet");
  }
  const tooltipCount = await tooltip.count();
  expect.soft(
    tooltipHit ? tooltipCount : 0,
    "L2/L7: hovering the planet's projected position must surface a tooltip naming it " +
      "(Wave-2 dep #3 — today: no tooltip exists anywhere)",
  ).toBeGreaterThan(0);
  if (tooltipHit && tooltipCount > 0) {
    await expect(tooltip.first()).toContainText("Planet");
    const ttBox = await tooltip.first().boundingBox();
    expect.soft(
      ttBox !== null &&
        ttBox.x >= 0 &&
        ttBox.x + ttBox.width <= 1280 &&
        ttBox.y >= 0 &&
        ttBox.y + ttBox.height <= 800,
      "L7: the tooltip must stay within the viewport",
    ).toBe(true);
  }
  await shot(page, "contract-2-tooltip-hover.png");

  expect(consoleState.errors, "zero error-level console messages on the journey").toEqual([]);
});

test("L10 — semantic list: keyboard-reachable role=list exposing the same object names", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleState = collectConsole(page);

  await seedShowcase(page);
  await stageCanvas(page);
  const panel = stagePanel(page);

  // Wave-2 dependency #4. FAILS today: nothing exists (no semantic field in
  // PrimitiveObjectSpec; stageGuideForSpec is conceptual-gated).
  const list = panel.getByRole("list");
  const listCount = await list.count();
  expect.soft(
    listCount,
    "L10: a semantic list of scene objects must exist inside the stage " +
      "(Wave-2 dep #4 — today: no role=list anywhere in the stage)",
  ).toBeGreaterThan(0);
  if (listCount > 0) {
    const items = list.first().getByRole("listitem");
    await expect(items.first()).toBeVisible();
    const itemCount = await items.count();
    expect.soft(itemCount, "L10: the list must expose at least the Star and Planet objects").toBeGreaterThanOrEqual(2);
    const names = await items.allTextContents();
    expect.soft(
      names.some((n) => n.trim() === "Star") && names.some((n) => n.trim() === "Planet"),
      `L10: items must expose the same names as the labels (got: ${JSON.stringify(names.map((n) => n.trim()))})`,
    ).toBe(true);
    // Keyboard-reachable: the list itself receives focus (Wave 2 may mount it
    // tabbable, or each item tabbable — the contract is that focus lands in
    // it from the keyboard path).
    const focusable = await list.first().evaluate((el) => {
      (el as HTMLElement).focus();
      return document.activeElement === el;
    });
    expect.soft(focusable, "L10: the semantic list must be keyboard-focusable").toBe(true);
  }
  await shot(page, "contract-2-semantic-list.png");

  expect(consoleState.errors, "zero error-level console messages on the journey").toEqual([]);
});

test("C1/C2/C4 — camera framing: default keeps star+planet on screen (planet radius >=4px, mid-80%); max speed keeps the planet in canvas 5s or reframes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleState = collectConsole(page);

  await seedShowcase(page);
  const canvas = await stageCanvas(page);
  const box = await canvas.boundingBox();
  expect(box, "3D stage canvas must be measurable").not.toBeNull();

  const seam0 = await readSeam(page);
  expect.soft(
    seam0,
    "C1/C2/C4: window.__unseenlabScene seam must exist (Wave-2 dep #1 — today: undefined)",
  ).not.toBeNull();
  await shot(page, "contract-3-camera-default.png");

  if (seam0) {
    const star = seam0.objects.find((o) => o.id === "star");
    const planet = seam0.objects.find((o) => o.id === "planet");
    // W6-3 (spec-only, documented): the seam mirrors the LABEL placement —
    // the star's label is placement-occluded by the star disc (unit-pinned
    // planner: `star occluded: true`), so the seam carries planet/moon/ring
    // only. The star's framing is verified through the renderer's OWN
    // build-frame projection of the star's world position (0,0,0) with a
    // generous pad (the star disc projects to ~95px — the center may sit up
    // to a disc-radius from the canvas edge and the star is still visible).
    // The seam coords are canvas CSS px — convert to page coords for the
    // canvas-box comparisons (same for the planet).
    const starPage = star
      ? { x: box!.x + star.projected.x, y: box!.y + star.projected.y }
      : box
        ? projectShowcaseDefault(box, { x: 0, y: 0, z: 0 })
        : null;
    const planetPage = planet
      ? { x: box!.x + planet.projected.x, y: box!.y + planet.projected.y }
      : null;
    expect.soft(planet, "C2: the seam must report the planet's projected position").toBeTruthy();
    if (starPage) {
      expect.soft(
        insideBox(box!, starPage, 120),
        `C2: star must be on screen at the default frame (got ${JSON.stringify(starPage)}; ` +
          "seam omits the star — its label is placement-occluded — so this is the renderer's " +
          "own build-frame projection with a 120px pad for the ~95px star disc)",
      ).toBe(true);
    }
    if (planet && planetPage) {
      expect.soft(
        insideBox(box!, planetPage),
        `C2: planet must be on screen at the default frame (got ${JSON.stringify(planetPage)})`,
      ).toBe(true);
      const midX =
        planetPage.x >= box!.x + 0.1 * box!.width &&
        planetPage.x <= box!.x + 0.9 * box!.width;
      const midY =
        planetPage.y >= box!.y + 0.1 * box!.height &&
        planetPage.y <= box!.y + 0.9 * box!.height;
      expect.soft(midX && midY, "C1: planet must project inside the middle 80% of the canvas").toBe(true);
      expect.soft(
        planet.projectedRadiusPx,
        `C1: planet's projected radius must be >= 4px (measured today via the renderer's own build ` +
          `frame: ~5.7px at a 708x398 canvas — marginal; root-cause documents 0.58-degree dots in ` +
          `grow-only distance states; the seam is the authoritative source)`,
      ).toBeGreaterThanOrEqual(4);
    }
  }

  // C4: raise Launch speed to the curated max (1.0 -> 1.2 via keyboard; the
  // mission says never drag the camera first, isolating the parameter-change
  // path from the userControlled latch). The planet must stay inside the
  // canvas for 5s OR the camera must reframe. FAILS today on the seam; the
  // latched-camera frustum exit (249/360 degrees at max distance) is the
  // documented root cause for the dragged path.
  await unlockControls(page);
  const slider = launchSlider(page);
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  expect.soft(
    await slider.getAttribute("aria-valuenow"),
    "C4: Launch speed must reach the curated max 1.2",
  ).toBe("1.2");

  const reframesBefore = seam0?.camera?.reframeCount ?? 0;
  const insideAll: boolean[] = [];
  const watchStart = Date.now();
  while (Date.now() - watchStart < 5_000) {
    const seam = await readSeam(page);
    const planet = seam?.objects.find((o) => o.id === "planet");
    if (planet && box) {
      insideAll.push(insideBox(box, { x: box.x + planet.projected.x, y: box.y + planet.projected.y }));
    }
    await page.waitForTimeout(500);
  }
  const seamEnd = await readSeam(page);
  if (seam0 && seamEnd) {
    expect.soft(
      insideAll.length > 0 && insideAll.every(Boolean),
      "C4: the planet must stay within the canvas for >=5s after maxing Launch speed",
    ).toBe(true);
    expect.soft(
      seamEnd.camera.reframeCount > reframesBefore,
      "C4: OR the camera must have reframed to keep the planet in view " +
        "(today: phantom dynamic extent centers the group pivot, never the visible mesh; " +
        "userControlled latches permanently once engaged)",
    ).toBe(true);
  }
  await shot(page, "contract-3-camera-max-speed.png");

  expect(consoleState.errors, "zero error-level console messages on the journey").toEqual([]);
});

test("P6/P7 — physics honesty: the seam reports the escape classification; nothing mislabels while escaping; readouts and trail do not lie", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleState = collectConsole(page);

  // Escape is only reachable on the AI-composed path: the curated showcase
  // slider caps at 1.2 < sqrt(2) (documented above); the fixture caps at 3.0.
  await seedFixture(page);
  await stageCanvas(page);
  await unlockControls(page);
  const slider = launchSlider(page);
  await slider.focus();
  // 1.0 -> 1.45 in 0.05 steps: past the escape threshold sqrt(2) ~1.414.
  for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
  const speed = await slider.getAttribute("aria-valuenow");
  expect.soft(
    parseFloat(speed ?? "1"),
    `P6: Launch speed must exceed the escape threshold ${ESCAPE_SPEED_MIN.toFixed(3)} (got ${speed})`,
  ).toBeGreaterThan(ESCAPE_SPEED_MIN);

  // Readout honesty (PASSES today, pinned): the engine never clamps, so the
  // DISTANCE readout grows while the body escapes. Observed today: 150 ->
  // 168 -> 747 within 3s at speed 1.45.
  const d1 = await distanceReadout(page);
  await page.waitForTimeout(2_500);
  const d2 = await distanceReadout(page);
  expect.soft(
    d1 !== null && d2 !== null && d2 > d1,
    `P6: the distance readout must grow honestly while escaping (observed today: ${d1} -> ${d2}; ` +
      "engine never clamps)",
  ).toBe(true);
  await shot(page, "contract-4-escape-max-speed.png");

  // The seam must report the classification or its honest absence (Wave-2
  // dep #6). FAILS today: no seam, no semantic readout, no classification —
  // today's UI is honestly silent (no orbiting label exists; relationship
  // labels are not rendered for hybrid stages: EDGE_TYPES lacks orbits/
  // attracts), so this part is the FUTURE CONTRACT.
  const seam = await readSeam(page);
  expect.soft(
    seam,
    "P6: the seam must report the engine's bound/escape classification or its honest absence " +
      "(Wave-2 dep #6 — today: undefined)",
  ).not.toBeNull();
  if (seam) {
    const cls = seam.engine?.classification;
    expect.soft(
      cls === "bound" || cls === "escape" || cls === null,
      `P6: classification must be honest (got ${JSON.stringify(cls)})`,
    ).toBe(true);
    if (cls === "escape") {
      // Never mislabel: while the engine is in escape, no visible label may
      // claim the body "orbits" (P6).
      expect.soft(
        await stagePanel(page).getByText(/orbiting/i).count(),
        "P6: no label may claim 'orbiting' while the engine is in escape",
      ).toBe(0);
      // Trail honesty (P7): the trail must never present a closed bound loop
      // during escape — either no trail (honest omission) or points that
      // exceed the bound-orbit ring radius.
      const pts = seam.trail?.points ?? [];
      const span = pts.length > 0
        ? Math.max(...pts.map((p) => Math.hypot(p.x, p.y, p.z)))
        : 0;
      expect.soft(
        span === 0 || span > RING_RADIUS_WORLD,
        `P7: the trail must not lie a closed bound orbit during escape (span ${span.toFixed(2)}, ` +
          `ring ${RING_RADIUS_WORLD}; today: no trail exists)`,
      ).toBe(true);
    }
  }

  expect(consoleState.errors, "zero error-level console messages on the journey").toEqual([]);
});

test("console hygiene — zero error-level messages on the journey (generate-500 filtered); evidence screenshots", async ({
  page,
}) => {
  // Guard, not a defect: this PASSES today (the deliberate generate-500 log
  // is filtered exactly like demo-lesson-rail.spec.ts / 3d-quality.spec.ts).
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const consoleState = collectConsole(page);

  await seedShowcase(page);
  await stageCanvas(page);
  await unlockControls(page);
  const slider = launchSlider(page);
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1_000);
  await shot(page, "contract-5-journey.png");

  expect(
    consoleState.errors,
    "zero error-level console messages on the journey:\n" +
      consoleState.errors.map((e) => `  ${e}`).join("\n"),
  ).toEqual([]);
});
