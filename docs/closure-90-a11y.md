# Closure 90 — Accessibility & Device QA (Phase 6: real accessibility evidence)

- Profile: accessibility-device-qa (ONE-SHOT 90-READINESS PROGRAM)
- Date: 2026-08-05
- Target: local app at `http://localhost:3110` (`PORT=3110 NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 npm run dev`)
- Primary flow: homepage ask form → "Why do planets remain in orbit?" → `/demos/demo-orbits-001`
- Tooling: Playwright (Chromium) via browser MCP; keyboard events via real `page.keyboard`; media emulation via CDP `Emulation.setEmulatedMedia`; WebGL unavailability via an init-script shim (the environment's sanctioned equivalent of `--disable-webgl`, matching the prior PR #9 run); `npx vitest run tests/demonstrations/a11y/`
- Scope guard: no git add/commit/push performed. Writes limited to `docs/closure-90-a11y.md`, `tests/demonstrations/a11y/demo-shell-a11y-matrix.test.tsx` (new). No product-code changes were needed (no genuine defect found this run).

## Environment honesty notes (read before the matrix)

1. The demo spec is generated per session and varies between generations. Two different generated instances were exercised this run (controls/prediction options differed); every check below that depends on controls was repeated on both instances with identical results.
2. The repo is shared with a parallel profile that edits the same working tree (HMR churn observed mid-run: homepage header changed, example-list briefly emptied, a transient 401 on `/api/demonstrations/demo-orbits-001` while that profile was mid-auth-change). Where a measurement could have been affected, the check was re-run after the churn settled. The 401 was transient and tied to the other profile's auth work, not to the demo flow (the flow ran 200s on all clean runs).
3. Screenshot captures hang while the demo stage canvas renders every frame (compositor saturated in this headless environment). Screenshots were captured with the demo paused via its own Pause control (a real user action), which is why viewport screenshots of the running stage are captured in the paused state. Layout measurements are independent of capture and were taken live.
4. This model instance cannot render image input, so screenshots in `gui-test-screenshots/` were captured as evidence artifacts for human review but were not visually inspected by the agent; DOM/accessibility-tree/computed-style evidence is the verification basis (cross-validated per the web-gui-tester methodology as far as the model's capabilities allow).

## ACCESSIBILITY MATRIX

### 1. Keyboard only — PASS
- Tab cycle (demo page, post-gate instance): `← Back to home` → `Save` → selected representation tab (roving, `tabindex=0`) → `One-variable mode` switch → prediction radio (single stop; native radio group) → 3 observation checkboxes → notes textarea → `Save observations to my trial log` → `Limitations & provenance` (summary) → `Trial log` (summary) → [nextjs-portal dev-tools button — not app code, absent in production builds] → wraps to top. 13 app stops, full wrap-around confirmed.
- Pre-gate, the sliders, Pause, Reset and Submit prediction are `disabled` and are correctly absent from the tab cycle (never focusable). Post-gate they become tab stops; verified with the instrumented walk.
- Arrow keys: radio group selection moves with ArrowDown/ArrowUp (selection follows focus; observed: option 1 → 2 → 3 → 2); sliders step with ArrowRight/ArrowLeft (value 1 → 1.2 after two ArrowRight presses); representation tablist moves selection + focus with ArrowRight/Left, `Home` returns to the first tab.
- Enter/Space: Enter submits the prediction (gate unlocks), toggles Pause (Pause ↔ Play), opens summaries; Space selects the radio and toggles the one-variable switch (`aria-checked` false ↔ true).
- Focus management: after the prediction gate unlocks, focus moves to the first experiment slider (predict → manipulate handoff) — observed live and pinned by a new unit test.
- Focus-visible: every app tab stop shows a visible indicator — `outline: 3px solid rgb(14, 116, 144); outline-offset: 3px` (global `:focus-visible` rule), confirmed via `getComputedStyle` on every stop. The switch uses a dark `rgb(23, 33, 43)` outline, visible on its surface. The only stop without an outline is `nextjs-portal` (Next.js dev-tools button, not app code).

### 2. VoiceOver on macOS — NOT RUN (blocked) + human checklist
- Attempt: `osascript -e 'tell application "System Events" to get name of first process'` works, but `UI elements enabled → false` (System Events UI scripting disabled), the VoiceOver process is not running (`pgrep -x VoiceOver` empty), and no Accessibility TCC grant is present. Granting/using VoiceOver requires an interactive macOS session with Accessibility permission, which this environment cannot provide non-interactively.
- DOM-level equivalent (fully automated) — 8/8 PASS, all verified live in this run:
  | Check | Result | Evidence |
  |---|---|---|
  | Trust badge announced | PASS | `span[aria-label="Trust: Verified simulation"]`; icon `aria-hidden`; visible text "Verified simulation" + sr-only "Verified simulation check" |
  | Prediction requirement announced | PASS | prediction panel labelled "Predict first" with the question as visible text; polite `role="status"` sr-only "Prediction recorded — controls unlocked." mounts on submit |
  | Every control labelled | PASS | radios and checkboxes wrapped in `<label>`; textarea placeholder + label; sliders `aria-label` ("Tangential speed", "Gravity strength" / "Orbital speed", "Planet mass"); switch named "One-variable mode"; Save, Pause, Reset, Accept/Reject all text-named; only unnamed input is the Switch's visually-hidden ownership input (1px, `aria-hidden`) |
  | Tabs navigable | PASS | `role="tab"` ×3, `aria-selected`, roving `tabindex`, arrow-key + Home/End navigation, `aria-controls` tabpanel, polite sr-only "View: Timeline" announcement updated on switch (verified text change) |
  | Save result announced | PASS | `p[aria-live="polite"]` "Not saved" → "Saved on this device" on Save (verified live change; wording of this build) |
  | Adaptation decision announced | PASS | polite `role="status"` sr-only region: "Adaptation applied: Try changing initial tangential speed and watch how the result changes." mounted on Accept (verified live); the prior-doc "Adaptation dismissed:" path is pinned by the unit suite |
  | Canvas equivalent available | PASS | sr-only stage summary paragraph, labelled live-readouts list (Period/Speed/Distance), accessible views (Timeline / Force diagram / Data table) via tabs, and the WebGL-unavailable fallback (see 11) |
  | No announcement spam | PASS | readouts are `output` elements with `aria-live="off"`; exactly one polite/status region changes per discrete action (submit, tab switch, save, adaptation decision) — verified per action and pinned by unit tests |

### 3. Reduced motion — PASS
- `Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce` → `matchMedia` true and `html[data-reduced-motion="true"]` set.
- Representation order reorders live: tabs become Timeline (selected), Force diagram, 3D animation last (stage demoted).
- Zero CSS animations and zero CSS transitions running (`getComputedStyle().animationName` all `none`; transition count 0 across the document).
- Controls remained usable (sliders, Pause/Reset, switch, Accept/Reject).

### 4. Forced / high contrast — PASS
- `forced-colors: active` (dark) → `matchMedia('(forced-colors: active)')` true; the browser applies the system palette: white text on black surfaces, yellow links (`rgb(255, 255, 0)`), trust badge white on `rgba(0,0,0,0.1)` — contrast separation guaranteed by the OS palette.
- Note: the app's own `body.high-contrast` class is a learner-preference toggle (from `preferences.highContrast`, applied by `demonstration-page.tsx`), not a forced-colors media hook; it does not need to duplicate the OS guarantee. `src/app/globals.css` still defines `body.high-contrast` styles for the preference path.

### 5. 150% text scale — PASS
- `html` `font-size: 150%` (computed 24px) at 1280×800 → `scrollWidth 1280 === innerWidth 1280`, zero elements exceeding the viewport (offender scan empty).

### 6. 200% zoom — PASS
- Matrix-sanctioned 640×400 viewport (200% of 1280×800; CSS `zoom` on `<html>` is inert in Chromium), with 150% text still applied: `scrollWidth 640 === innerWidth 640`, zero offenders.

### 7. Mobile 320×568 — PASS
- `innerWidth 320`, `scrollWidth 320`, `bodyScrollWidth 320` → no horizontal overflow; zero overhang offenders.
- Representation tabs wrap to two rows, each ≥ 66px tall (44px+ tap target); homepage also clean at 320 (`scrollWidth 320`).

### 8. Mobile 375×667 — PASS
- `innerWidth 375`, `scrollWidth 375`, `bodyScrollWidth 375` → no horizontal overflow; zero offenders.

### 9. Desktop Safari — NOT RUN
- Playwright WebKit is not installed (`~/Library/Caches/ms-playwright` contains only chromium builds; `npx playwright install --dry-run` shows webkit-2336 as a download). Installing browsers is out of scope for this run, per the program's rules.

### 10. Desktop Chrome (baseline) — PASS
- 1280×800 baseline: homepage and the full demo page render without errors (console clean on app code; only the renderer's own expected WebGL-context errors appear in the WebGL-disabled run, and the other profile's transient 401 mid-edit).
- Demo page structure verified: banner (back link, h1, description, trust badge, Save), Representations region (3 tabs + tabpanel with stage summary, labelled canvas, live readouts), Controls region (switch, gated sliders, Pause, Reset), Prediction region (fieldset + radios + Submit), Observations region (3 checkboxes, notes, save), Limitations & provenance + Trial log disclosures.

### 11. WebGL disabled — PASS (fallback observed)
- WebGL removed at the API level (init-script shim returning `null` for `getContext('webgl'|'webgl2'|'experimental-webgl')` before mount — the environment's equivalent of `--disable-webgl`; `Emulation.setWebGLOverride` is unsupported in this Chromium build). The 3D renderer logged its expected "Error creating WebGL context" errors — i.e., it detected the absence.
- Observed fallback: `role="status"` visible note "WebGL is not available here, so the 3D stage cannot run. The accessible representation is shown instead." followed by the `AccessibleRepresentation` for the generated `fallbackKind` (this instance: accessible diagram — "Gravity pulls planet inward / Planet orbits star / Star / Planet / Orbit path / Gravity force / Velocity / 5 objects and 2 relationships: Star, Planet, Orbit …").
- Page not broken: only the hidden engine canvas remains (labelled "…simulation canvas"), readouts stay live, tabs/badges/controls intact, no horizontal overflow (`scrollWidth 1265 < innerWidth 1280`), no unexpected console errors.

### 12. A11y unit suite — 13 tests, 13 passed (0 failed)
```
Test Files  2 passed (2)
     Tests  13 passed (13)
```
- `npx vitest run tests/demonstrations/a11y/` — 9 pre-existing tests + 4 new matrix-pinning tests in `tests/demonstrations/a11y/demo-shell-a11y-matrix.test.tsx`:
  1. focus never lands on a disabled control; gated controls join the tab cycle only after unlock (incl. the predict → manipulate focus handoff),
  2. tablist Home/End with roving `tabindex`,
  3. one-variable switch toggles with Space alone,
  4. save outcome announced in a polite live region ("Not saved" → "Saved on this device", store persisted).
- Related `tests/demonstrations/ui/` suite also green (3 files, 21 tests). `tsc --noEmit`: 3 pre-existing errors, all in `tests/demonstrations/coupling/persistence-roundtrip.test.ts` (added by a parallel profile, not touched here); zero errors in files touched by this profile.

## Defects fixed
NONE — no genuine accessibility defect was found in `src/components/demonstrations/**` during this run. All matrix points that could be executed passed; the announcements (prediction, view switch, save, adaptation) that a prior run fixed are still present and were re-verified live.

## New evidence artifacts (this run)
- `tests/demonstrations/a11y/demo-shell-a11y-matrix.test.tsx` (new, 4 tests)
- `gui-test-screenshots/a11y-t1-homepage-chrome.png` (Chrome baseline, homepage)
- `gui-test-screenshots/a11y-t10-demo-paused.png` (demo page, paused stage — capture-workaround state, see honesty note 3)
- `gui-test-screenshots/a11y-t3-reduced-motion.png` (reduced motion, stage-demoted tab order)
- `gui-test-screenshots/a11y-t4-forced-colors.png` (forced-colors system palette)
- `gui-test-screenshots/a11y-t7-mobile-320.png` (320×568)
- `gui-test-screenshots/a11y-t8-mobile-375.png` (375×667)
- `gui-test-screenshots/a11y-t11-webgl-fallback.png` (WebGL-unavailable fallback)

## VoiceOver — five-minute human checklist (for a human with macOS Accessibility permission)
Do this on the running app at `http://localhost:3110` with VoiceOver on (Cmd+F5). Expected: all 8 items pass in under five minutes. Record pass/fail per item with the "should hear" column.

| # | Action (with VoiceOver) | Should hear / happen | Expected |
|---|---|---|---|
| 1 | On the homepage, Tab/Cmd+F5 into the ask form and type "Why do planets remain in orbit?", press Enter | "Generate demonstration" button named; after generating, "Your demonstration is ready" and the trust badge announced as "Trust: Verified simulation" (icon itself not announced) | PASS |
| 2 | Press Enter on "Enter demonstration" | Page title "Why Planets Remain in Orbit" announced, followed by "Controls … Submit a prediction to unlock the controls" — the prediction requirement is announced before any control is enabled | PASS |
| 3 | Tab through the controls with VoiceOver's Tab (Ctrl+Option+Right also fine) | Every control announces a name: "One-variable mode, switch", "Orbital speed/Tangential speed, slider, 1", "Planet mass/Gravity strength, slider", "Pause, button", "Reset, button", radio group "What do you think will happen?" with named options, "Your notes, text box", "Save observations to my trial log, button" | PASS |
| 4 | Focus the representation tabs (near the top), press Right Arrow three times | "3D Orbit Animation, tab, selected" → "Orbit Timeline, tab" → "Force Diagram, tab"; after each move you hear "View: <name>" | PASS |
| 5 | Choose any prediction option (Right/Down arrow, Space), then Enter on "Submit prediction"; then find and press "Save" | "Prediction recorded — controls unlocked" announced politely; sliders/Pause become usable; on Save you hear "Saved on this device" | PASS |
| 6 | After submitting, when adaptation suggestions appear (Accept/Reject cards), press Enter on Accept | A polite announcement "Adaptation applied: <suggestion text>" — and no other region repeats the announcement | PASS |
| 7 | Switch to the Timeline/Force diagram/Data table tab and navigate it | The tab content is fully readable text (steps, table rows, or diagram summary), so the canvas is never the only representation; the canvas itself announces its label ("3D stage canvas") plus a stage summary paragraph | PASS |
| 8 | Wait 20 seconds while readouts update, and press Save again | Readout values (Period/Speed/Distance) are NOT announced continuously; announcements happen only on discrete actions (submit, tab switch, save, adaptation) — no announcement spam | PASS |

If any item fails, note the exact announcement heard and the step; that is a defect for the fix scope. (Per the matrix, items 1–8 were verified at the DOM/ARIA level automatically this run; this checklist is the interactive confirmation a real VoiceOver session still owes.)

## Unverified
- Real VoiceOver / other screen-reader pass (requires interactive macOS Accessibility permission; see item 2 + checklist above).
- Desktop Safari / WebKit (not installed; item 9).
- True 200% browser zoom via native browser chrome (used the matrix-sanctioned 640×400 viewport approximation; CSS `zoom` is inert in Chromium).
- Physical mobile devices (Playwright viewport emulation only).
- Windows forced-colors / Android TalkBack / Firefox not tested.
- Visual inspection of the captured screenshots by this agent (model cannot render images; artifacts preserved for human review — see honesty note 4).
