import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const orbitSpec = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "orbit-spec.json"), "utf8"),
);

interface PathConfig {
  sliderTarget: string;
  sliderPresses: number;
  paramsLine: string;
}

const FALLBACK_CONFIG: PathConfig = {
  sliderTarget: "1.2",
  sliderPresses: 4,
  paramsLine: "Parameters: g 10, speed 1.2",
};

const HOSTED_CONFIG: PathConfig = {
  sliderTarget: "1.25",
  sliderPresses: 5,
  paramsLine: "Parameters: g 10, speed 1.25",
};

async function runJourney(
  page: import("@playwright/test").Page,
  cfg: PathConfig,
) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nuclear chain reactions" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "What topic do you need help with?" }),
  ).toHaveValue("Nuclear chain reactions");

  // Use a deterministic orbit request for the journey itself while preserving
  // the restored old-style visual chip set on the landing page.
  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("Show why planets stay in orbit.");
  await page.getByRole("button", { name: "Find my learning path" }).click();

  await expect(page.getByText("Your demonstration is ready")).toBeVisible();
  await expect(page.getByText("Verified simulation")).toBeVisible();

  await page.getByRole("button", { name: "Enter demonstration" }).click();
  await expect(
    page.getByRole("heading", { name: "Why Planets Stay in Orbit", level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByLabel("Trust: Verified simulation"),
  ).toBeVisible();

  const slider = page.getByRole("slider", { name: "Launch speed" });
  await expect(slider).toBeDisabled();

  await page
    .getByRole("radio", { name: /more elliptical/ })
    .click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  await expect(slider).toBeEnabled();

  await slider.focus();
  for (let i = 0; i < cfg.sliderPresses; i++)
    await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", cfg.sliderTarget);

  await page
    .getByRole("checkbox", { name: /^Watch the (arrows|Speed readout)/ })
    .click();
  await page
    .getByRole("textbox", { name: "Your notes" })
    .fill("Orbit path stretched when I increased launch speed.");
  await page
    .getByRole("button", { name: "Save observations to my trial log" })
    .click();
  await expect(
    page.getByText("Observations recorded to your trial log."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await expect(page.getByText("Prediction locked in")).toBeVisible();
  await expect(page.getByText("Predict first")).toHaveCount(0);
  await expect(slider).toBeEnabled();
  await expect(page.getByText(/Show \(2\)/)).toBeVisible();

  await page.locator("summary").filter({ hasText: "Trial log" }).click();
  await expect(
    page.getByText(/Prediction: .*more elliptical/),
  ).toBeVisible();
  await expect(
    page.getByText(cfg.paramsLine, { exact: false }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Restore these parameters" })
    .nth(1)
    .click();
  await expect(page.getByText(/Parameters restored from entry 2/)).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuenow", cfg.sliderTarget);
}

test("fallback path: full ask→save→reload→restore journey via the offline generator", async ({
  page,
}) => {
  await page.route("**/api/demonstrations/generate", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await runJourney(page, FALLBACK_CONFIG);
});

test("hosted path: full journey with a captured verified-simulation spec", async ({
  page,
}) => {
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
  await runJourney(page, HOSTED_CONFIG);
});
