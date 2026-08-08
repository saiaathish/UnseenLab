import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Wave 4 (D2) mechanical swap, design-2 §3.5/§8: the click-target projection
// now consumes the renderer's own camera math — content-AABB framing
// (design-2 §3.1/§3.2) + the single-source CSS projection — instead of the
// in-file `diagonal*0.72` mirror. Rail assertions are untouched (frozen).
import {
  contentAABBFromGraph,
  contentExtentCenter,
  FRAME_ASPECT_DEFAULT,
  graphFrameHalfHeight,
  projectOrthoToCSS,
  type CanvasBox,
} from "@/demonstrations/renderers/primitive-3d/camera";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import { buildConceptualSpec } from "@/demonstrations/generation/offline/template-builder";
import { createDefaultPreferences } from "@/domain/learner";

/**
 * Lesson workspace redesign — browser verification of the demo lesson rail
 * (A5). Covers the frozen UX contract items 1, 2, 3 and the rail mechanics
 * on the real, feature-flagged demo page:
 *
 *  - 70/30 workspace: model column left, lesson rail right at desktop; the
 *    rail stacks BELOW the model below the `lg` breakpoint.
 *  - Rail state machine predict → interact → observe → explain → complete:
 *    one step visible at a time, Back always available, Continue gated on
 *    the current step's completion, completed steps persist across
 *    back-navigation (never relock).
 *  - Graph interact step completes ONLY on a real interaction with the
 *    referenced node in the 3D stage (onNodeManipulate event, A1 surface) —
 *    clicking empty canvas space must NOT complete it.
 *  - Engine (hybrid showcase) interact step references a real control and
 *    completes on a real control touch (slider drag), NOT on a canvas click.
 *  - Provenance demoted: no source badge / limitations / trial log / save
 *    status on the primary workspace; AboutThisModel (ⓘ) carries source,
 *    save status and limitations, and closes with focus returning to the
 *    trigger.
 *
 * Seeding (offline catalog path): every demo is created through the app's
 * own ask-to-demo flow. The POST /api/demonstrations/generate bridge is
 * stubbed to fail (HTTP 500), which drives the app's documented client-side
 * fallback: the deterministic offline catalog (same code path a guest with
 * no network gets). No network, no model, no auth — deterministic per query.
 * The graph demo routes to the cause_effect_network template (canonical
 * graph: nodes a="Cause A", b="Effect B", c="Effect C", d="Inhibited D";
 * edges a→b causes, b→c activates, c→d inhibits); the engine demo routes to
 * the curated orbits showcase.
 *
 * Gating: this spec requires a production build baked with
 * NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 (the ask-demo section and the
 * /demos/[id] route do not exist without it). Mirroring the
 * cross-device-resume env-gate convention, the whole suite self-skips when
 * the runner did not export the flag — it never fails a build that was not
 * baked with the demo experience.
 *
 * The 3D-stage node click: the renderer owns a deterministic orthographic
 * camera (no auto-orbit in graph mode), so node screen positions are
 * computed with the renderer's own math (scene bounds → center/diagonal →
 * orthoBaseHalf → lookAt view basis). The click itself is a real pointer
 * event resolved by the renderer's raycast; the helper only locates the
 * object. A small bounded nudge search guards against sub-pixel
 * measurement differences.
 */

const DEMOS_ENABLED = process.env.NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED === "1";

test.skip(
  !DEMOS_ENABLED,
  "NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 was not exported — this spec needs " +
    "a production build baked with the demo experience (ask-demo flow + " +
    "/demos/[id]). Skipping keeps the suite green for non-demo builds.",
);

const SCREENSHOT_DIR = path.join(__dirname, "..", "validation-pack", "screenshots");

// ---------------------------------------------------------------------------
// Offline-catalog seeding through the real ask-demo flow
// ---------------------------------------------------------------------------

async function seedDemo(
  page: Page,
  query: string,
  urlPattern: RegExp,
): Promise<void> {
  // Force the client-side offline fallback (deterministic offline catalog).
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  // The flag-on homepage hero (LandingHero) carries the section aria-label
  // "Ask for a demonstration" and the form CTA "Find my learning path".
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
  await expect(
    lessonRail(page).getByRole("heading", { name: "Predict" }),
  ).toBeVisible({ timeout: 15_000 });
}

function lessonRail(page: Page): Locator {
  return page.getByRole("region", { name: "Lesson" });
}

function continueButton(page: Page): Locator {
  return lessonRail(page).getByRole("button", { name: "Continue" });
}

function backButton(page: Page): Locator {
  return lessonRail(page).getByRole("button", { name: /Back/ });
}

/** Commit the graph demo's prediction ("B and C (and D through C)"). */
async function commitGraphPrediction(page: Page): Promise<void> {
  await page.getByRole("radio", { name: /B and C/ }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
}

/** Commit the orbits demo's prediction (first option, correct by curation). */
async function commitOrbitsPrediction(page: Page): Promise<void> {
  await page.getByRole("radio").first().click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Locating node A in the 3D stage (mirrors primitive-3d/renderer.ts math)
// ---------------------------------------------------------------------------

interface WorldNode {
  position: { x: number; y: number; z?: number };
}

/** cause_effect_network scene objects (frozen template; canonical graph). */
const GRAPH_NODES: WorldNode[] = [
  { position: { x: -3, y: 1 } }, // a = Cause A
  { position: { x: 0, y: 1 } }, // b = Effect B
  { position: { x: 0, y: -1 } }, // c = Effect C
  { position: { x: 3, y: -1 } }, // d = Inhibited D
];
const NODE_A: WorldNode = { position: { x: -3, y: 1 } };

/**
 * The canonical graph frame, derived ONCE from the renderer's own camera
 * math so the projection below is the exact math the stage uses:
 *   - the spec is the same offline-catalog build the seeding flow produces
 *     for the "cause and effect" query (same spec id → same layout seed →
 *     identical final node positions and label placement);
 *   - buildSceneGraph runs the deterministic layout pass internally;
 *   - contentAABBFromGraph measures the true content AABB (envelopes +
 *     placed label rects, design-2 §3.1);
 *   - graphFrameHalfHeight computes the ortho half-height at the renderer's
 *     build aspect (FRAME_ASPECT_DEFAULT — frameCamera is called without a
 *     live aspect at build, renderer.ts); the per-frame CSS projection uses
 *     the live canvas aspect, exactly like applyCamera (halfW = halfH ·
 *     cameraAspect).
 */
const RAIL_SPEC = buildConceptualSpec(
  "cause_effect_network",
  "cause and effect",
  "cause and effect",
  createDefaultPreferences(),
);
const { graph: RAIL_GRAPH } = buildSceneGraph(RAIL_SPEC);
const RAIL_CONTENT = contentAABBFromGraph(RAIL_GRAPH, { graphMode: true });
const RAIL_CENTER = contentExtentCenter(RAIL_CONTENT);
const RAIL_HALF_H = graphFrameHalfHeight(RAIL_CONTENT, FRAME_ASPECT_DEFAULT).halfH;

/**
 * Project a world position to CSS-pixel canvas coordinates using the
 * renderer's deterministic graph camera — the single-source
 * `projectOrthoToCSS` from camera.ts (math-identical replacement of the
 * former in-file mirror; see the header comment above the frame constants).
 * Graph scenes never auto-orbit, so the projection is stable.
 */
function projectNode(
  canvasBox: CanvasBox,
  world: { x: number; y: number },
  _nodes: WorldNode[],
): { x: number; y: number } {
  return projectOrthoToCSS({ x: world.x, y: world.y, z: 0 }, {
    center: RAIL_CENTER,
    halfH: RAIL_HALF_H,
    aspect: canvasBox.width / canvasBox.height,
    canvasBox,
  });
}

/**
 * Click node A in the 3D stage: compute its screen position, click it, and
 * wait for the rail's event-driven completion status. A bounded nudge search
 * (real clicks, each resolved by the renderer's raycast) guards against
 * sub-pixel measurement differences; clicking the wrong node never completes
 * the step, so the loop cannot false-positive.
 */
async function clickNodeAAndWaitForCompletion(
  page: Page,
  interactStep: Locator,
): Promise<void> {
  const canvas = page.locator("canvas:visible").first();
  const box = await canvas.boundingBox();
  expect(box, "the 3D stage canvas must be visible").not.toBeNull();
  const target = projectNode(box!, NODE_A.position, GRAPH_NODES);
  const nudges: Array<[number, number]> = [
    [0, 0],
    [14, 0],
    [-14, 0],
    [0, 14],
    [0, -14],
    [28, 0],
    [0, 28],
  ];
  for (const [dx, dy] of nudges) {
    await page.mouse.click(target.x + dx, target.y + dy);
    if (await interactStep.getByText("Interaction recorded.").isVisible().catch(() => false)) {
      return;
    }
    await page.waitForTimeout(250);
  }
}

// ---------------------------------------------------------------------------
// Engine demo: the Launch speed slider thumb (base-ui renders the real range
// input clipped and fixed-positioned, so the drag target is the thumb div).
// ---------------------------------------------------------------------------

function sliderThumb(page: Page, name: string): Locator {
  return page
    .getByRole("slider", { name })
    .locator("xpath=ancestor::div[contains(@class,'touch-none')]")
    .locator('[data-index="0"]');
}

/** Drag the thumb of a base-ui slider to the right (real pointer drag). */
async function dragSliderRight(page: Page, name: string): Promise<void> {
  const thumb = sliderThumb(page, name);
  await thumb.scrollIntoViewIfNeeded();
  const box = await thumb.boundingBox();
  expect(box, `the ${name} slider thumb must be visible`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 100,
    box!.y + box!.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// Evidence screenshots
// ---------------------------------------------------------------------------

function shot(page: Page, name: string): Promise<Buffer> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return page.screenshot({ path: path.join(SCREENSHOT_DIR, name) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("70/30 workspace: model left, rail right at desktop; rail stacks below lg", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);

  const model = page.getByRole("region", { name: "Representations" });
  const rail = lessonRail(page);
  await expect(model).toBeVisible();
  await expect(rail).toBeVisible();

  // Rail step order: predict first (aria-current), then interact, observe,
  // explain, complete.
  const steps = rail.locator("nav[aria-label='Lesson steps'] > span");
  await expect(steps).toHaveText([
    "Predict",
    "Interact",
    "Observe",
    "Explain",
    "Complete",
  ]);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");

  const modelBox = await model.boundingBox();
  const railBox = await rail.boundingBox();
  expect(modelBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  // Desktop (≥ lg): side by side, model column on the left and meaningfully
  // wider (the 70/30 split — never a crushed three-column layout).
  expect(railBox!.x).toBeGreaterThan(modelBox!.x + modelBox!.width - 4);
  expect(railBox!.y).toBeLessThan(modelBox!.y + 40);
  expect(modelBox!.width / (modelBox!.width + railBox!.width)).toBeGreaterThan(0.6);
  await shot(page, "A5-01-workspace-desktop.png");

  // Below lg: the rail stacks below the model (model first, rail under it).
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(rail).toBeVisible();
  await expect(model).toBeVisible();
  const stackedModel = await model.boundingBox();
  const stackedRail = await rail.boundingBox();
  expect(stackedRail!.y).toBeGreaterThan(stackedModel!.y + stackedModel!.height - 4);
  expect(Math.abs(stackedRail!.x - stackedModel!.x)).toBeLessThan(4);
  await shot(page, "A5-02-workspace-stacked.png");
});

test("predict gates Continue: selection alone is not enough, submission unlocks it", async ({
  page,
}) => {
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);

  const rail = lessonRail(page);
  await expect(rail.getByRole("heading", { name: "Predict" })).toBeVisible();
  await expect(rail.getByText("If Cause A is removed, which effects do you expect to change?")).toBeVisible();
  // Continue is gated on the committed prediction.
  await expect(continueButton(page)).toBeDisabled();
  await expect(rail.getByText("Complete this step to continue.")).toBeVisible();

  // Selecting an option alone does NOT enable Continue — Submit is the commit.
  await page.getByRole("radio", { name: /B and C/ }).click();
  await expect(continueButton(page)).toBeDisabled();

  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  // Ungraded conceptual demo: honest comparison note, never invented grading.
  await expect(rail.getByText("Compare with what you observed")).toBeVisible();
  await expect(continueButton(page)).toBeEnabled();
});

test("graph interact: clicking node A in the 3D stage completes the step; clicking nothing does not", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Deliberate: the seeding stub fails POST /api/demonstrations/generate
    // (HTTP 500) on purpose to drive the app's offline fallback. The browser
    // logs that failed resource load as a console error; it is not an app
    // defect. Every other error-level message is a real finding.
    if (msg.location()?.url?.includes("/api/demonstrations/generate")) return;
    consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.setViewportSize({ width: 1280, height: 800 });
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);
  await commitGraphPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  // The instruction references the REAL node label from the canonical graph.
  await expect(
    interactStep.getByText("Click Cause A and watch what happens downstream."),
  ).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();

  // Clicking empty canvas space must NOT complete the step.
  const canvas = page.locator("canvas:visible").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 12, box!.y + 12);
  await expect(interactStep.getByText("Interaction recorded.")).toHaveCount(0);
  await expect(continueButton(page)).toBeDisabled();

  // A real click on node A completes the step (event-driven, no timer).
  await clickNodeAAndWaitForCompletion(page, interactStep);
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible();
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "A5-03-graph-interact-complete.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});

test("completed steps persist: Back to predict, then re-advancing never relocks interact", async ({
  page,
}) => {
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);
  await commitGraphPrediction(page);
  await continueButton(page).click();
  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  await clickNodeAAndWaitForCompletion(page, interactStep);
  await expect(continueButton(page)).toBeEnabled();

  // Advance to observe, then walk Back to predict (observe → interact →
  // predict). Back is always available; completed steps stay completed.
  await continueButton(page).click();
  await expect(
    lessonRail(page).getByRole("region", { name: "Observe" }),
  ).toBeVisible();
  await backButton(page).click();
  await expect(interactStep).toBeVisible();
  await backButton(page).click();
  await expect(lessonRail(page).getByRole("heading", { name: "Predict" })).toBeVisible();
  await expect(page.getByText("Prediction locked in")).toBeVisible();

  // Re-advance over the completed steps: Continue is immediately enabled on
  // interact (no re-click of node A required) and the step indicator shows
  // the completed marker.
  await continueButton(page).click(); // predict → interact (predict completed)
  await expect(interactStep).toBeVisible();
  const stepIndicator = lessonRail(
    page,
  ).locator("nav[aria-label='Lesson steps'] > span", { hasText: "Interact" });
  await expect(stepIndicator).toContainText("✓");
  await expect(stepIndicator).toContainText("completed");
  await expect(continueButton(page)).toBeEnabled();
  // "Interaction recorded." does not re-mount on a completed re-visit.
  await expect(interactStep.getByText("Interaction recorded.")).toHaveCount(0);
});

test("observe requires at least one selection before Continue", async ({
  page,
}) => {
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);
  await commitGraphPrediction(page);
  await continueButton(page).click();
  await clickNodeAAndWaitForCompletion(page, lessonRail(page).getByRole("region", { name: "Interact" }));
  await continueButton(page).click();

  const observeStep = lessonRail(page).getByRole("region", { name: "Observe" });
  await expect(observeStep).toBeVisible();
  // Downstream node labels resolve from the canonical graph (b, c, d).
  await expect(
    observeStep.getByRole("checkbox", { name: "Effect B" }),
  ).toBeVisible();
  await expect(
    observeStep.getByRole("checkbox", { name: "Effect C" }),
  ).toBeVisible();
  await expect(
    observeStep.getByRole("checkbox", { name: "Inhibited D" }),
  ).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();

  await observeStep.getByRole("checkbox", { name: "Effect C" }).check();
  await expect(continueButton(page)).toBeEnabled();
});

test("explain self-assessment completes the rail; complete shows recap, honest replay and new concept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);
  await commitGraphPrediction(page);
  await continueButton(page).click();
  await clickNodeAAndWaitForCompletion(page, lessonRail(page).getByRole("region", { name: "Interact" }));
  await continueButton(page).click();
  const observeStep = lessonRail(page).getByRole("region", { name: "Observe" });
  await observeStep.getByRole("checkbox", { name: "Effect C" }).check();
  await continueButton(page).click();

  const explainStep = lessonRail(page).getByRole("region", { name: "Explain" });
  await expect(explainStep).toBeVisible();
  // Topology-derived question (a → b → c → d, no direct a–d edge).
  await expect(
    explainStep.getByText(
      "Why did Inhibited D change even though Cause A is not directly connected to it?",
    ),
  ).toBeVisible();
  await expect(explainStep.getByRole("radio")).toHaveCount(2);
  await expect(continueButton(page)).toBeDisabled();

  await explainStep.getByRole("radio").first().check();
  await expect(continueButton(page)).toBeEnabled();
  await continueButton(page).click();

  // Complete step: recap of what the learner actually did.
  const completeStep = lessonRail(page).getByRole("region", { name: "Complete" });
  await expect(completeStep).toBeVisible();
  await expect(
    completeStep.getByText("You finished this lesson. Here is what you did."),
  ).toBeVisible();
  const recap = await completeStep.locator("ul").innerText();
  expect(recap).toContain("You predicted: B and C (and D through C)");
  expect(recap).toContain("You clicked Cause A.");
  expect(recap).toContain("You recorded 1 observation.");
  expect(recap).toContain("You chose an explanation.");

  // Honest replay: restores the latest trial's parameters, labeled as such.
  // The latest entry is the observation trial recorded when the learner
  // advanced observe → explain, so the banner is entry 2 (prediction = 1).
  await completeStep.getByRole("button", { name: "Restore these parameters" }).click();
  const replayBanner = page.getByRole("region", { name: /Replay of trial entry \d+/ });
  await expect(replayBanner).toBeVisible();
  const bannerText = await replayBanner.innerText();
  expect(bannerText).toMatch(/Parameters restored from entry \d+:/);
  expect(bannerText).toContain("past simulation state (positions, time) is not restored");
  await page.getByRole("button", { name: "Dismiss replay" }).click();
  await expect(replayBanner).toHaveCount(0);

  // New concept links home.
  const newConcept = completeStep.getByRole("link", { name: "New concept" });
  await expect(newConcept).toHaveAttribute("href", "/");
  await shot(page, "A5-04-rail-complete.png");
});

test("provenance demoted: no source/limitations on the workspace; AboutThisModel carries them", async ({
  page,
}) => {
  await seedDemo(page, "cause and effect", /\/demos\/demo-cause_effect_network-/);

  // CUT from the primary workspace: source badge, visible limitations,
  // trial log, save status. (The summary card on the home page had these;
  // the demo workspace must not.)
  for (const text of [
    "Offline catalog",
    "Trial log",
    "Save status",
    "Limitation:",
    "AI-generated",
  ]) {
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  }
  // One trust chip + one ⓘ trigger.
  await expect(
    page.getByRole("button", { name: "About this model" }),
  ).toBeVisible();

  // ⓘ opens About this model: source, save status, limitations.
  const trigger = page.getByRole("button", { name: "About this model" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "About this model" }),
  ).toBeVisible();
  const trustAndSource = dialog.locator("section[aria-label='Trust and source']");
  await expect(
    trustAndSource.getByText("Offline catalog", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("section[aria-label='Save status']")).toBeVisible();
  const limitations = dialog.locator("section[aria-label='Limitations']");
  await expect(
    limitations.getByText(
      "Real systems usually have many more connections than the few shown here.",
    ),
  ).toBeVisible();
  await expect(
    limitations.getByText(
      "Conceptual model — no quantitative simulation is included.",
    ),
  ).toBeVisible();
  await shot(page, "A5-05-about-this-model.png");

  // Escape closes; focus returns to the trigger (basic dialog focus check).
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("engine demo: interact references a real control and completes on slider drag, not on a canvas click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedDemo(
    page,
    "Show why planets stay in orbit.",
    /\/demos\/showcase-orbits/,
  );
  await commitOrbitsPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  // The instruction references the real curated control.
  await expect(
    interactStep.getByText("Move the Launch speed slider."),
  ).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();

  // A canvas click (hybrid showcase, not graph mode) must NOT complete it.
  const canvas = page.locator("canvas:visible").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(interactStep.getByText("Interaction recorded.")).toHaveCount(0);
  await expect(continueButton(page)).toBeDisabled();

  // A real control touch (drag the Launch speed slider) completes it.
  await dragSliderRight(page, "Launch speed");
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "A5-06-orbits-interact-complete.png");
});
