# Closure A11y — Real-Device & Accessibility QA (PR #9)

- Agent: AGENT 09 (real-device and accessibility QA engineer)
- Date: 2026-08-05
- Target: local app at `http://localhost:3110` (`PORT=3110 NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 npm run dev`)
- Primary flow: homepage ask form → "Why do planets remain in orbit?" → `/demos/demo-orbits-001` (generative demo page)
- Tooling: Playwright (Chromium) via the browser MCP; `npx vitest run tests/demonstrations/a11y/`
- Scope guard: no git add/commit/push; product code touched only in `src/components/demonstrations/**` (one defect fix); test added in `tests/demonstrations/a11y/`

## ACCESSIBILITY MATRIX

### 1. Desktop Chrome 1280×800 — PASS
- Baseline render OK: homepage (ask form, hero, lab card, footer notices) and the full demo page (`/demos/demo-orbits-001`) render without errors.
- Trust badge visible: `span[aria-label="Trust: Verified simulation"]` present in the demo header with level text "Verified simulation" + sr-only icon label "Verified simulation check" (icon `aria-hidden`).
- `innerWidth 1280`, `document.documentElement.scrollWidth 1265` → no horizontal overflow.
- Tabs are real tabs: `role="tab"`, `aria-selected`, roving `tabindex` (active 0, inactive −1), `aria-controls="demo-rep-panel"`.
- Hybrid stage: hidden 2D engine canvas (readout driver) + visible 3D stage canvas, both `aria-label`ed; live readouts table present (Period 18.3 s, Speed, Distance).

### 2. Mobile 375×667 — PASS
- `innerWidth 375`, `document.documentElement.scrollWidth 360`, `document.body.scrollWidth 360` → no horizontal overflow; zero elements with `getBoundingClientRect().right > innerWidth + 1`.
- Controls usable: one-column layout, tabs wrap to two rows with 44px hit targets, controls/prediction/observations stack correctly.

### 3. Mobile 320×568 — PASS
- `innerWidth 320`, `document.documentElement.scrollWidth 305` → no horizontal overflow; zero overhang offenders.
- Tabs wrap (3D animation + Timeline on row 1, Graph row 2), all `min-h-11` (44px) tap targets; control groups 213px wide; sliders remain operable after the prediction gate unlocks them.

### 4. Reduced motion — PASS
- `page.emulateMedia({ reducedMotion: 'reduce' })` → `matchMedia('(prefers-reduced-motion: reduce)')` true and the app sets `data-reduced-motion="true"` on `<html>` (mirrors `demonstration-page.tsx` `useReducedMotionPref` + `apply()` effect).
- Representation order reorders live: tabs become Timeline, Graph, 3D animation — the stage rep is demoted last (`orderedRepresentations` reduced-motion branch in `representation-tabs.tsx`).
- Controls: generated spec carries the reduced control set (sliders + `play_pause` + reset; no `speed_control`, no vectors toggle) — `build-spec.ts` `controls(reducedMotion)`.
- `play_pause` (Pause) remains present and functional.
- Zero CSS animations running (`getComputedStyle(...).animationName` all `none`); no pulse/scale operators observed. The 3D renderer receives `reducedMotion: true` (`renderer.ts` gates orbit autorotate/camera motion at lines 1024/1080/1327/1354).

### 5. High contrast — PASS
- `emulateMedia({ forcedColors: 'active', colorScheme: 'dark' })` → `(forced-colors: active)` true; app `high-contrast` body class applied.
- Badge/labels remain legible: computed colors white text on dark tinted surfaces (trust badge `color rgb(255,255,255)` on `rgba(0,0,0,0.1)`); forced-colors mode swaps to system palette guaranteeing separation; screenshot recorded (visual pass).

### 6. 150% text scale — PASS
- `html` `font-size: 150%` (computed 24px) at 1280×800 → `scrollWidth 1265 < 1280`, no horizontal scroll, no clipping. Only "clipped" elements are `sr-only` spans (clientWidth 1px by design).
- Worst-case combo (150% text + 640×400) also clean — see 7.

### 7. 200% browser zoom — PASS
- Emulated via 640×400 viewport (200% of 1280×800, per the matrix's sanctioned approach; CSS `zoom` on `<html>` does not change layout metrics in Chromium).
- With 150% text scale still applied: `innerWidth 640`, `scrollWidth 625` → no horizontal scroll; no element extends beyond the viewport.

### 8. Keyboard only — PASS
- Full tab cycle recorded on the demo page: **16 unique tab stops** (wrap-around confirmed) — radios (native radio group, roving), observation checkboxes ×3, notes textarea, Save observations, Limitations & provenance + Trial log disclosures, back link, Save, active representation tab, One-variable switch. Disabled controls (Pause/Reset/sliders pre-gate, inactive tabs `tabindex=-1`) correctly excluded.
- Homepage cycle: **21 unique stops** (header nav, sign-in, find-path form, ask form + examples, lab links, disclosures, research link) — every input labeled via `<label>` or placeholder.
- Space selects a prediction radio and activates buttons; Enter activates Submit prediction → prediction gate unlocks, status announced; ArrowRight moves slider (Initial speed 1 → 1.1) and moves tabs (3D animation → Timeline) with focus + `aria-selected` + polite announcement "View: Timeline".
- Focus indicator visible on every stop: global `:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }` rule (verified in stylesheets and computed styles). One focus-less stop is `nextjs-portal` (Next.js dev-tools button, not app code; absent in production builds).
- Note: Pause/Reset/sliders freeze after touching a control while one-variable mode is on — by-design pedagogy (change-one-thing-at-a-time), not a keyboard defect; the frozen buttons report `disabled`.

### 9. WebGL unavailable — PASS
- Simulated at the API level (Chromium `--disable-webgl` equivalent): `addInitScript` shim returning `null` for `getContext('webgl'|'webgl2')` before the stage mounts.
- Observed fallback: `section[aria-label="Accessible representation"]` renders with `role="status"` note "WebGL is not available here, so the 3D stage cannot run. The accessible representation is shown instead." plus the `AccessibleRepresentation` view for `spec.renderer.fallbackKind` (timeline view — "Step 1. Start … Step 3. Stable orbit …").
- The fallbackKind mechanism is validated in `src/demonstrations/validation/demo-spec-schema.ts` (`fallbackKind: z.enum(FALLBACK_KINDS)`, line 339) and dispatched in `src/components/demonstrations/accessible-representation.tsx` (timeline / data_table / accessible_diagram / text_sequence); the stage fallback is `StageFallback` in `demonstration-stage.tsx`.
- Page NOT broken: readouts stay live (hidden 2D engine driver keeps emitting Period/Speed/Distance), tabs, trust badge, controls all intact; no horizontal overflow; no page errors (only the renderer's own expected WebGL error log).

### 10. Screen reader — NOT RUN
- macOS VoiceOver: NOT RUN — VoiceOver process is not running, System Events UI scripting is disabled (`UI elements enabled → false`), and a VoiceOver session requires interactive Accessibility permission that this environment cannot grant non-interactively.
- DOM-level accessibility (the equivalent, fully automated) — 8/8 PASS:

| Check | Result | Evidence |
|---|---|---|
| Trust badge announced | PASS | `span[aria-label="Trust: Verified simulation"]`; icon `aria-hidden`; sr-only icon label |
| Prediction panel announced | PASS | `role="status"` sr-only "Prediction recorded — controls unlocked." mounts on submit (politely) |
| Every control has a label/aria-label | PASS | Radios + checkboxes wrapped in `<label>`; textarea `label[for="demo-observation-notes"]`; sliders `aria-label`; switch has name "One-variable mode"; the only unnamed input is the Switch's visually-hidden ownership input (1px, `clip-path: inset(50%)`) — standard pattern |
| Save status aria-live | PASS | `p[aria-live="polite"]` "Not saved" → "Saved to this device" on save |
| Adaptation choice announced | PASS (after fix) | New `role="status"` sr-only region: "Adaptation applied: …" / "Adaptation dismissed: …" — see Defects fixed |
| Tabs are real tabs | PASS | `role="tab"` ×3, `aria-selected`, roving `tabindex`, arrow-key navigation, `aria-controls`/`aria-labelledby`, polite "View: …" announcement on switch |
| Canvas has accessible equivalent | PASS | sr-only stage summary, labeled readout list, accessible views (diagram/table/timeline/text) via representation tabs, and the WebGL/engine fallback with `AccessibleRepresentation` |
| No live-region spam | PASS | Readouts are NOT inside a live region (`aria-label` only); live regions change only on discrete actions — verified one region per action (submit prediction, tab switch, save, adaptation decision) |

### 11. A11y unit suite — 1 file, 9 tests, 9 passed (0 failed)
```
Test Files  1 passed (1)
     Tests  9 passed (9)
```
`npx vitest run tests/demonstrations/a11y/` — 8 pre-existing tests + 1 new test added with the fix (all green). Related `tests/demonstrations/ui/` suite also green (3 files, 21 tests). `tsc --noEmit` shows 12 pre-existing errors, none in files touched here.

## Defects fixed
1. `src/components/demonstrations/adaptation-panel.tsx` — Accept/Reject of an adaptation suggestion applied the change (parameter/representation/mode) and recorded the trial, but nothing was announced to assistive tech. Added a polite `role="status"` sr-only announcement ("Adaptation applied: <suggestion>" / "Adaptation dismissed: <suggestion>") that mounts only with text (so it never spams and never breaks the one-region-per-action invariant) and stays mounted after the panel empties so the last decision is still announced.
2. `tests/demonstrations/a11y/demo-shell-a11y.test.tsx` — new test "announces adaptation decisions in a polite status region": submits the prediction, accepts a suggestion → exactly one polite/status region changes, containing "Adaptation applied:" and the suggestion text; rejects a suggestion → "Adaptation dismissed:". Verified live in the browser after the fix.

## Unverified items
- Real VoiceOver/other screen-reader pass (requires interactive macOS session; see item 10).
- True 200% browser zoom via native browser chrome/zoom APIs (used the matrix-sanctioned 640×400 viewport approximation; CSS zoom on `<html>` is inert in Chromium).
- Physical mobile devices (used Playwright viewport emulation only).
- Platform variance (WebKit/Firefox, Windows forced-colors, Android TalkBack) not tested in this run.
- The generated demo spec varies between generations (observed instances differed: "Graph" vs "Force diagram" tab, different prediction options); all instances passed the same checks.
