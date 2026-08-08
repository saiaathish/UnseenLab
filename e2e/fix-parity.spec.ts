import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Pre-participant defect repair — interaction-contract parity proofs (A18).
 * Browser journeys locking the three fixes from the Wave 0 recon brief:
 *
 *  FIX 1 — Diagram interaction parity. The Diagram tab must be a semantic
 *  mirror of the 3D stage: the "Cause A" node is a REAL button (role=button,
 *  tabIndex=0, aria-pressed) and one click fires the same canonical
 *  onNodeManipulate(nodeId) the rail's interact step waits on. Red/green:
 *  on baseline the diagram is static (`<AccessibleDiagram spec={spec} />` is
 *  rendered with NO callbacks), so this journey FAILS until Fix 1 lands.
 *
 *  FIX 2 — 3D pointer click must activate. One pointer click on the node
 *  (resolved by the renderer's own raycast against the projected position)
 *  completes interact immediately — no Enter, no second click.
 *
 *  FIX 3 — Lesson actions may reference only real controls. The captured
 *  orbit fixture (e2e/fixtures/orbit-spec.json) declares an observation
 *  prompt about the "gravitational constant" while spec.controls only ships
 *  Launch speed / Play / Speed / Reset — no gravity control. After Fix 3 that
 *  prompt must not render; the observe checkbox list contains only prompts
 *  resolvable to the visible Controls panel. Red/green: baseline renders both
 *  fixture prompts, so this journey FAILS until Fix 3 lands.
 *
 * Plus the no-relock guard (E2E 5): completed steps survive Back → re-advance
 * with Continue enabled and the completed marker — never a second interaction.
 *
 * Baseline expectations per journey:
 *  - E2E 1 (diagram): FAILS on baseline (red proof for Fix 1).
 *  - E2E 2 (3D pointer): contract guard — one click, no Enter. The event
 *    surface exists on main; this pins the "one activation function" contract.
 *  - E2E 3 (3D keyboard): contract guard — arrow-key focus + Enter/Space.
 *  - E2E 4 (orbit observe): FAILS on baseline (red proof for Fix 3).
 *  - E2E 5 (back no-relock): contract guard — completed steps never relock.
 *
 * Seeding mirrors demo-lesson-rail.spec.ts: every demo is created through the
 * app's own ask-to-demo flow. The graph demos stub POST
 * /api/demonstrations/generate with HTTP 500 → deterministic offline catalog
 * (demo-cause_effect_network-*; canonical nodes a="Cause A", b="Effect B",
 * c="Effect C", d="Inhibited D"; a→b causes, b→c activates, c→d inhibits).
 * The orbit journey injects the captured verified-simulation fixture via the
 * 200-stub contract (the demo-journey hosted path proves it renders in the
 * harness) — the offline orbit template does NOT contain the offending
 * gravitational-constant prompt, so the fixture path is the real red/green
 * proof for Fix 3.
 *
 * Gating: requires a production build baked with
 * NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 (ask-demo flow + /demos/[id]). The
 * whole suite self-skips otherwise, mirroring the demo-lesson-rail env gate.
 *
 * The 3D-stage node click uses the renderer's own deterministic orthographic
 * camera math (same projection as demo-lesson-rail.spec.ts): E2E 2 performs
 * exactly ONE click at the projected position — the nudge loop is only used
 * by E2E 5 where the click is a setup step, not the contract under test.
 */

const DEMOS_ENABLED = process.env.NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED === "1";

test.skip(
  !DEMOS_ENABLED,
  "NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 was not exported — this spec needs " +
    "a production build baked with the demo experience (ask-demo flow + " +
    "/demos/[id]). Skipping keeps the suite green for non-demo builds.",
);

const SCREENSHOT_DIR = path.join(__dirname, "..", "validation-pack", "screenshots");

const orbitSpec = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "orbit-spec.json"),
    "utf8",
  ),
);

// ---------------------------------------------------------------------------
// Seeding (offline 500-stub + hosted 200-stub through the real ask-demo flow)
// ---------------------------------------------------------------------------

async function seedOfflineDemo(
  page: Page,
  query: string,
  urlPattern: RegExp,
): Promise<void> {
  // Force the client-side offline fallback (deterministic offline catalog).
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
  await expect(
    lessonRail(page).getByRole("heading", { name: "Predict" }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Inject the captured orbit fixture (demo-journey hosted-path contract). */
async function seedOrbitFixture(page: Page): Promise<void> {
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          outcome: "spec",
          spec: orbitSpec,
          source: "model",
          reason: "e2e fixture",
        },
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Ask for a demonstration" }),
  ).toBeVisible();
  await page
    .getByLabel("What topic do you need help with?")
    .fill("Show why planets stay in orbit.");
  await page.getByRole("button", { name: "Find my learning path" }).click();
  await expect(
    page.getByRole("button", { name: "Enter demonstration" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await page.waitForURL(/\/demos\/demo-orbits-001/);
  await expect(
    lessonRail(page).getByRole("heading", { name: "Predict" }),
  ).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Rail helpers
// ---------------------------------------------------------------------------

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

/**
 * Zero console errors during the journey. The seeded offline 500 on
 * POST /api/demonstrations/generate is expected and ignored (it is the
 * documented offline-fallback trigger, not an app defect). Every other
 * error-level message is a real finding.
 */
function trackConsoleErrors(page: Page): string[] {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.location()?.url?.includes("/api/demonstrations/generate")) return;
    consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  return consoleErrors;
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
 * Project a world position to CSS-pixel canvas coordinates using the
 * renderer's deterministic graph camera (see demo-lesson-rail.spec.ts).
 * Graph scenes never auto-orbit, so the projection is stable.
 */
function projectNode(
  canvasBox: { x: number; y: number; width: number; height: number },
  world: { x: number; y: number },
  nodes: WorldNode[],
): { x: number; y: number } {
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const zs = nodes.map((n) => n.position.z ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const diagonal = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const halfH = Math.max(diagonal * 0.72, 1.4);
  const halfW = halfH * (canvasBox.width / canvasBox.height);
  const len = Math.hypot(0, 0.55, 1);
  const dz = 1 / len;
  const viewX = world.x; // dot with xAxis
  const viewY = dz * world.y; // dot with yAxis
  const ndcX = viewX / halfW;
  const ndcY = viewY / halfH;
  return {
    x: canvasBox.x + ((ndcX + 1) / 2) * canvasBox.width,
    y: canvasBox.y + ((1 - ndcY) / 2) * canvasBox.height,
  };
}

/**
 * E2E 2 contract: EXACTLY ONE pointer click on node A at its projected
 * screen position. No Enter, no second click. The click is a real pointer
 * event resolved by the renderer's raycast (pointerup → pickAt →
 * selectNode(nodeId, true) → onNodeManipulate).
 */
async function clickNodeAOnce(page: Page): Promise<void> {
  const canvas = page.locator("canvas:visible").first();
  const box = await canvas.boundingBox();
  expect(box, "the 3D stage canvas must be visible").not.toBeNull();
  const target = projectNode(box!, NODE_A.position, GRAPH_NODES);
  await page.mouse.click(target.x, target.y);
}

/**
 * Setup helper (E2E 5): click node A in the 3D stage and wait for the rail's
 * event-driven completion. A bounded nudge search (real clicks, each resolved
 * by the renderer's raycast) guards against sub-pixel measurement
 * differences; clicking the wrong node never completes the step, so the loop
 * cannot false-positive. Same pattern as demo-lesson-rail.spec.ts.
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
    if (
      await interactStep
        .getByText("Interaction recorded.")
        .isVisible()
        .catch(() => false)
    ) {
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
  await page.mouse.move(box!.x + box!.width / 2 + 100, box!.y + box!.height / 2, {
    steps: 10,
  });
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
// E2E 1 — DIAGRAM PATH (Fix 1: diagram nodes are real buttons)
// Red/green: FAILS on baseline (static diagram), passes after Fix 1.
// ---------------------------------------------------------------------------

test("E2E 1 diagram parity: Cause A is a real button on the Diagram tab and one click completes interact", async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedOfflineDemo(
    page,
    "cause and effect",
    /\/demos\/demo-cause_effect_network-/,
  );
  await commitGraphPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();

  // Leave the default 3D Model tab at the start of the interaction and never
  // return to it: the whole journey runs on the Diagram tab. The 3D stage is
  // kept mounted but hidden (display:none), so no canvas is visible.
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("canvas:visible")).toHaveCount(0);

  // Fix 1 contract: the Cause A node is a real interactive button with the
  // same event surface the 3D renderer fires (tabIndex 0, aria-pressed,
  // select on change, manipulate on every activation).
  const causeA = page.getByRole("button", { name: "Cause A" });
  await expect(causeA).toBeVisible();
  await expect(causeA).toHaveAttribute("tabindex", "0");
  await expect(causeA).toHaveAttribute("aria-pressed", "false");
  // The interactive diagram announces that nodes can be selected (static
  // diagram never does).
  await expect(
    page.getByText("You can select each node on the diagram", { exact: false }),
  ).toBeVisible();

  // ONE click on the diagram node completes the interact step — the same
  // canonical onNodeManipulate(nodeId) the rail waits on.
  await causeA.click();
  await expect(causeA).toHaveAttribute("aria-pressed", "true");
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible();
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "FIX1-diagram-interact-complete.png");

  // Complete the full rail on the Diagram tab: observe → explain → complete.
  await continueButton(page).click();
  const observeStep = lessonRail(page).getByRole("region", { name: "Observe" });
  await expect(observeStep).toBeVisible();
  await observeStep.getByRole("checkbox", { name: "Effect C" }).check();
  await continueButton(page).click();

  const explainStep = lessonRail(page).getByRole("region", { name: "Explain" });
  await expect(explainStep).toBeVisible();
  await explainStep.getByRole("radio").first().check();
  await continueButton(page).click();

  const completeStep = lessonRail(page).getByRole("region", { name: "Complete" });
  await expect(completeStep).toBeVisible();
  await expect(
    completeStep.getByText("You finished this lesson. Here is what you did."),
  ).toBeVisible();
  await expect(completeStep.locator("ul")).toContainText("You clicked Cause A.");

  // Still on the Diagram tab — the 3D tab was never visited after the
  // interaction began.
  await expect(page.getByRole("tab", { name: "Diagram" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("canvas:visible")).toHaveCount(0);
  await shot(page, "FIX1-diagram-rail-complete.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});

// ---------------------------------------------------------------------------
// E2E 2 — 3D POINTER (Fix 2: one pointer click activates, no Enter)
// ---------------------------------------------------------------------------

test("E2E 2 3D pointer: ONE click on Cause A completes interact immediately — no Enter", async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedOfflineDemo(
    page,
    "cause and effect",
    /\/demos\/demo-cause_effect_network-/,
  );
  await commitGraphPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();

  // Exactly one pointer click at the projected node position. No key is ever
  // pressed and no second click is issued: the click itself must select,
  // manipulate, and complete the interact step.
  await clickNodeAOnce(page);
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "FIX2-3d-pointer-single-click.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});

// ---------------------------------------------------------------------------
// E2E 3 — 3D KEYBOARD (Fix 2: focus + Enter/Space converge on the same
// activation function as the pointer)
// ---------------------------------------------------------------------------

test("E2E 3 3D keyboard: arrow-key focus then Enter completes interact", async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedOfflineDemo(
    page,
    "cause and effect",
    /\/demos\/demo-cause_effect_network-/,
  );
  await commitGraphPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();

  // The canvas is focusable in graph mode; focusing it lands on the first
  // canonical node (Cause A) and announces the keyboard contract.
  const canvas = page.locator("canvas:visible").first();
  await canvas.focus();
  await expect(canvas).toHaveAttribute(
    "aria-label",
    /^Cause A\. Use arrow keys to move focus, Enter to select\.$/,
  );

  // Arrow keys move focus through the canonical nodes (a → b → a).
  await page.keyboard.press("ArrowRight");
  await expect(canvas).toHaveAttribute("aria-label", /^Effect B\./);
  await page.keyboard.press("ArrowLeft");
  await expect(canvas).toHaveAttribute("aria-label", /^Cause A\./);

  // Enter activates the focused node — the same activation function the
  // pointer click converges on.
  await page.keyboard.press("Enter");
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "FIX2-3d-keyboard-enter.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});

test("E2E 3 3D keyboard: Space activates the focused node (same contract)", async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedOfflineDemo(
    page,
    "cause and effect",
    /\/demos\/demo-cause_effect_network-/,
  );
  await commitGraphPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();

  const canvas = page.locator("canvas:visible").first();
  await canvas.focus();
  await expect(canvas).toHaveAttribute(
    "aria-label",
    /^Cause A\. Use arrow keys to move focus, Enter to select\.$/,
  );
  await page.keyboard.press("ArrowRight"); // focus Effect B
  await page.keyboard.press("ArrowLeft"); // back to Cause A
  await page.keyboard.press("Space");
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "FIX2-3d-keyboard-space.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});

// ---------------------------------------------------------------------------
// E2E 4 — ORBIT REAL CONTROLS (Fix 3: lesson actions reference only controls
// present in the Controls panel)
// Red/green: FAILS on baseline (the fixture's gravitational-constant prompt
// renders as an observe checkbox), passes after Fix 3.
// ---------------------------------------------------------------------------

test("E2E 4 orbit observe: prompts resolve only to controls present in the Controls panel", async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedOrbitFixture(page);
  await commitOrbitsPrediction(page);
  await continueButton(page).click();

  // Interact references the real curated control, which exists in the panel.
  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep.getByText("Move the Launch speed slider.")).toBeVisible();
  await dragSliderRight(page, "Launch speed");
  await expect(interactStep.getByText("Interaction recorded.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(continueButton(page)).toBeEnabled();
  await continueButton(page).click();

  const observeStep = lessonRail(page).getByRole("region", { name: "Observe" });
  await expect(observeStep).toBeVisible();

  // The Controls panel is the ground truth: Launch speed exists; there is NO
  // gravitational-constant / gravity control (the fixture's simulation
  // parameter "g" is not exposed as a learner control).
  const controls = page.getByRole("region", { name: "Controls" });
  await expect(controls).toBeVisible();
  await expect(controls.getByRole("slider", { name: "Launch speed" })).toBeVisible();
  await expect(controls.getByRole("slider")).toHaveCount(2); // Launch speed + Speed
  await expect(controls.getByText(/gravity/i)).toHaveCount(0);

  // Fix 3 contract: no learner-facing action may reference a control that is
  // not in the Controls panel. The fixture's "gravitational constant" prompt
  // must not render anywhere in the rail (observe checkbox list included).
  await expect(lessonRail(page).getByText(/gravitational constant/i)).toHaveCount(0);
  await expect(observeStep.getByText(/gravitational constant/i)).toHaveCount(0);

  // The observe checkbox list contains only prompts resolvable to the final
  // filtered set: the pure observation prompt ("Watch the arrows…") stays,
  // the control-driven prompt with no matching control is dropped.
  const checkboxes = observeStep.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(1);
  await expect(
    observeStep.getByRole("checkbox", { name: /Watch the arrows/ }),
  ).toBeVisible();
  await shot(page, "FIX3-orbit-observe-filtered.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});

// ---------------------------------------------------------------------------
// E2E 5 — BACK NO-RELOCK (completed steps never relock after Back)
// ---------------------------------------------------------------------------

test("E2E 5 back no-relock: completed interact and observe survive Back and re-advance", async ({
  page,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedOfflineDemo(
    page,
    "cause and effect",
    /\/demos\/demo-cause_effect_network-/,
  );
  await commitGraphPrediction(page);
  await continueButton(page).click();

  const interactStep = lessonRail(page).getByRole("region", { name: "Interact" });
  await expect(interactStep).toBeVisible();
  await clickNodeAAndWaitForCompletion(page, interactStep);
  await expect(continueButton(page)).toBeEnabled();

  // Advance to observe and complete it too.
  await continueButton(page).click();
  const observeStep = lessonRail(page).getByRole("region", { name: "Observe" });
  await expect(observeStep).toBeVisible();
  await observeStep.getByRole("checkbox", { name: "Effect C" }).check();
  await expect(continueButton(page)).toBeEnabled();

  // Walk Back all the way to predict.
  await backButton(page).click();
  await expect(interactStep).toBeVisible();
  await backButton(page).click();
  await expect(lessonRail(page).getByRole("heading", { name: "Predict" })).toBeVisible();
  await expect(page.getByText("Prediction locked in")).toBeVisible();

  // Re-advance: the completed interact step never relocks — Continue is
  // immediately enabled, the step indicator carries the completed marker,
  // and the completion status does not re-mount (no second interaction).
  await continueButton(page).click(); // predict → interact
  await expect(interactStep).toBeVisible();
  const stepIndicator = lessonRail(page).locator(
    "nav[aria-label='Lesson steps'] > span",
    { hasText: "Interact" },
  );
  await expect(stepIndicator).toContainText("✓");
  await expect(stepIndicator).toContainText("completed");
  await expect(continueButton(page)).toBeEnabled();
  await expect(interactStep.getByText("Interaction recorded.")).toHaveCount(0);

  // The observe selections are page-owned, so the completed observe step
  // also survives: the checked prompt is still checked and Continue is still
  // enabled after re-advancing over it.
  await continueButton(page).click(); // interact → observe
  await expect(observeStep).toBeVisible();
  await expect(observeStep.getByRole("checkbox", { name: "Effect C" })).toBeChecked();
  await expect(continueButton(page)).toBeEnabled();
  await shot(page, "FIX3-back-no-relock.png");

  expect(consoleErrors, "zero error-level console messages on the journey").toEqual([]);
});
