import { test, expect } from "@playwright/test";

test("an uncatalogued safe STEM topic generates a conceptual demonstration", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("textbox", { name: "What topic do you need help with?" })
    .fill("Explain quantum chromodynamics");
  await page.getByRole("button", { name: "Find my learning path" }).click();

  await expect(page.getByText("Not currently supported")).toHaveCount(0);
  await expect(page.getByText("Your demonstration is ready")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Conceptual demonstration")).toBeVisible();

  // The universal fallback must never upgrade an uncatalogued topic into a
  // verified quantitative simulator.
  await expect(page.getByText("Verified simulation")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enter demonstration" }),
  ).toBeVisible();
});
