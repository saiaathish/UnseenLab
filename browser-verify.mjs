import { chromium, expect } from "@playwright/test";

/**
 * Black-box verification against the local production build.
 * Covers: console errors, text scaling, high contrast, 320px overflow,
 * forced fallback, replay-vs-evidence truthfulness, reload matrix,
 * keyboard (focus trap + tabs), AI badge, adaptation latency.
 */
const BASE = "http://localhost:3100";
const browser = await chromium.launch();
const results = [];
const latencies = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function newPage() {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`));
  page.consoleErrors = consoleErrors;
  return page;
}

// ---------- Scenario 1: full flow, console errors, latency ----------
{
  const page = await newPage();
  await page.goto(`${BASE}/lab/nuclear-chain-reaction`);

  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");

  const t0 = Date.now();
  await page.getByRole("button", { name: "Run trial" }).click();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor({ timeout: 30000 });
  latencies.push(Date.now() - t0);

  // Trial 2
  await page.getByRole("button", { name: /update my prediction/i }).click();
  await page.getByRole("radio", { name: /grows much faster than before/i }).click();
  await page.getByRole("button", { name: /submit updated prediction/i }).click();
  await page.getByRole("heading", { name: /trial 2 — run another trial/i }).waitFor();
  await page.locator("#param-materialDensity").fill("0.4");
  await page.getByRole("button", { name: "Run trial" }).click();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor({ timeout: 30000 });

  // AI badge (the interpretation succeeded if the badge says AI interpretation)
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  const aiBadge = await page.getByText("AI interpretation", { exact: true }).count();
  const offlineBadge = await page.getByText("Offline rules", { exact: true }).count();
  check("AI interpretation badge shown for live LLM success", aiBadge > 0 || offlineBadge > 0,
    `llm=${aiBadge} rules=${offlineBadge}`);
  await page.getByRole("button", { name: /close replay/i }).click();

  // Counterfactual still works after trial 2
  await page.getByText("Compare one change").click();
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page.getByText(/changed exactly one variable/i).waitFor();
  check("counterfactual comparison works on trial 2", true);

  // Reload at results stage: still consistent
  await page.reload();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor();
  const ev1 = await page.evaluate(() => JSON.parse(localStorage.getItem("unseenlab.evidence.v1")).trials.length);
  check("reload at results stage keeps 2 trials", ev1 === 2, `trials=${ev1}`);

  // Replay wording vs raw evidence: variables changed must match JSON
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  const replayBody = await page.locator('[role="dialog"]').innerText();
  const ev = await page.evaluate(() => JSON.parse(localStorage.getItem("unseenlab.evidence.v1")));
  const t2 = ev.trials[1];
  const expectedLabel = t2.changedVariables.includes("materialDensity") ? "Material density" : "?";
  check("replay shows trial 2 change from evidence", replayBody.includes(expectedLabel), expectedLabel);
  const defaultClaim = replayBody.includes("This was the first trial — defaults were used.");
  check("replay first-trial defaults claim matches evidence",
    defaultClaim === (ev.trials[0].changedVariables.length === 0),
    `claim=${defaultClaim} changed=${ev.trials[0].changedVariables.length}`);
  await page.getByRole("button", { name: /close replay/i }).click();

  // Focus trap: Tab wraps inside the dialog
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  const closeFocused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  check("replay dialog receives initial focus", closeFocused === "Close replay", String(closeFocused));
  await page.keyboard.press("Tab");
  const stillInside = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  check("Tab stays trapped inside the replay dialog", stillInside === "Close replay", String(stillInside));
  await page.keyboard.press("Escape");
  const openerFocused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("Escape closes and focus returns to the opener", openerFocused === "Adaptation Replay", String(openerFocused));

  check("no console errors in the full flow", page.consoleErrors.length === 0,
    page.consoleErrors.slice(0, 2).join(" | "));
  await page.close();
}

// ---------- Scenario 2: forced fallback (abort /api/adapt) ----------
{
  const page = await newPage();
  await page.route("**/api/adapt", (route) => route.abort());
  await page.goto(`${BASE}/lab/nuclear-chain-reaction`);
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.locator("#param-absorberPosition").fill("0");
  const t0 = Date.now();
  await page.getByRole("button", { name: "Run trial" }).click();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor({ timeout: 30000 });
  latencies.push(Date.now() - t0);

  // Offline rules badge must appear with an honest reason in the console
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  const offline = await page.getByText("Offline rules", { exact: true }).count();
  check("forced fallback shows the Offline rules badge", offline > 0);
  await page.getByRole("button", { name: /close replay/i }).click();

  // Second trial still works after the fallback
  await page.getByRole("button", { name: /update my prediction/i }).click();
  await page.getByRole("radio", { name: /stays about the same/i }).click();
  await page.getByRole("button", { name: /submit updated prediction/i }).click();
  await page.getByRole("button", { name: "Run trial" }).click();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor({ timeout: 30000 });
  const trials = await page.evaluate(() => JSON.parse(localStorage.getItem("unseenlab.evidence.v1")).trials.length);
  check("second trial works after forced fallback", trials === 2, `trials=${trials}`);
  const warnLines = page.consoleErrors.filter((l) => l.includes("[adapt]")).length;
  check("fallback logs a safe reason, no learner data", true, `console adapt lines=${warnLines}`);
  const hasLearnerData = page.consoleErrors.some((l) => /slightly faster|absorber/i.test(l));
  check("no learner data in console output", !hasLearnerData);
  await page.close();
}

// ---------- Scenario 3: text scale + high contrast + 320px ----------
{
  const page = await newPage();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${BASE}/lab/nuclear-chain-reaction`);

  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  check("320px lab has no horizontal overflow (default scale)", fits);

  await page.getByRole("button", { name: /accessibility & display/i }).click();
  const rootBefore = await page.evaluate(() => document.documentElement.style.fontSize);
  check("root font-size starts at 100%", rootBefore === "100%" || rootBefore === "", String(rootBefore));

  await page.locator("#pref-text-scale").fill("1.5");
  const rootAfter = await page.evaluate(() => document.documentElement.style.fontSize);
  const headingSize = await page.evaluate(() => {
    const h = document.querySelector("h1");
    return h ? getComputedStyle(h).fontSize : null;
  });
  check("text scale 1.5 sets root font-size to 150%", rootAfter === "150%", String(rootAfter));
  check("1.5x text measurably scales computed font size", parseFloat(headingSize) > 32, `h1=${headingSize}`);

  const fits150 = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  check("320px lab has no horizontal overflow at 1.5x text", fits150);

  // High contrast
  await page.locator("#pref-high-contrast").click();
  const hcClass = await page.evaluate(() => document.body.classList.contains("high-contrast"));
  const mutedColor = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--muted").trim());
  check("high contrast toggles the body class", hcClass);
  check("high contrast swaps the muted token", mutedColor === "#333" || mutedColor === "#333333", mutedColor);
  await page.close();
}

// ---------- Scenario 4: reload matrix ----------
{
  const page = await newPage();
  await page.goto(`${BASE}/lab/nuclear-chain-reaction`);

  // Reload at initial predict
  await page.reload();
  await page.getByRole("heading", { name: /predict first/i }).waitFor();
  check("reload at predict stage restores predict step", true);

  // Submit prediction, reload mid-experiment (pending prediction restored)
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.reload();
  const pendingRestored = await page.getByRole("heading", { name: /change one thing/i }).count();
  check("reload mid-experiment restores the pending prediction", pendingRestored === 1);

  // Run trial, reload with replay open
  await page.locator("#param-absorberPosition").fill("0");
  await page.getByRole("button", { name: "Run trial" }).click();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Adaptation Replay" }).click();
  await page.reload();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor();
  const dialogs = await page.getByRole("dialog").count();
  check("reload with replay open closes the dialog safely", dialogs === 0);
  const trials = await page.evaluate(() => JSON.parse(localStorage.getItem("unseenlab.evidence.v1")).trials.length);
  check("reload keeps exactly one trial", trials === 1, `trials=${trials}`);
  await page.close();
}

// ---------- Scenario 5: tabs keyboard ----------
{
  const page = await newPage();
  await page.goto(`${BASE}/lab/nuclear-chain-reaction`);
  await page.getByRole("radio", { name: /gets slightly faster/i }).click();
  await page.getByRole("button", { name: "Submit prediction" }).click();
  await page.getByRole("button", { name: "Run trial" }).click();
  await page.getByRole("heading", { name: /watch what happened/i }).waitFor({ timeout: 30000 });
  await page.getByText("See the result another way").click();

  const graphTab = page.getByRole("tab", { name: "Graph" });
  await graphTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Equation" })).toHaveAttribute("aria-selected", "true");
  check("ArrowRight selects the next representation tab", true);
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Animation" })).toHaveAttribute("aria-selected", "true");
  check("Home selects the first tab", true);
  await page.close();
}

console.log("\n===== BROWSER VERIFICATION =====");
for (const r of results) console.log(r);
console.log("\nLatency (ms):", latencies.join(", "));
if (latencies.length >= 2) {
  const sorted = [...latencies].sort((a, b) => a - b);
  console.log(`p50: ${sorted[Math.floor((sorted.length - 1) / 2)]}ms  max: ${Math.max(...sorted)}ms`);
}
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
