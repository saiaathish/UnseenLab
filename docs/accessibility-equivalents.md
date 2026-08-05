# Accessibility equivalents — generative demonstration engine

Every claim below is tied to code that exists today in
`src/components/demonstrations/**`, `src/app/demos/**`, `src/app/page.tsx`, and
`src/components/ui/slider.tsx`. Nothing here is aspirational.

## 1. The guarantee

A learner who cannot see — or cannot tolerate — the 3D/canvas stage must still
complete the full loop **predict → manipulate → observe → compare → adapt**.
That loop never depends on the canvas:

- The canvas is only one **tab** (`stage_2d` / `stage_3d`) among several
  representations, and every demo ships non-canvas views
  (`representation-tabs.tsx`, `accessible-representation.tsx`).
- The controls (**manipulate**) live *outside* the stage in their own section
  (`demonstration-controls.tsx`), so they are operable in every view,
  including the WebGL-fallback view.
- When the engine or WebGL cannot start, `demonstration-stage.tsx` replaces
  the canvas with `StageFallback`: a visible note (`role="status"`, so the
  transition is announced) plus the spec's declared `fallbackKind` view
  (`accessible_diagram` | `timeline` | `data_table` →
  `accessible-representation.tsx`).
- Under reduced motion the tab order itself demotes stage views to last
  (`orderedRepresentations` in `representation-tabs.tsx`), and the 3D
  renderer receives `reducedMotion` so camera auto-orbit and animation
  operators are disabled (`demonstration-stage.tsx` →
  `PrimitiveSceneRenderer`, `renderers/primitive-3d/renderer.ts`).

## 2. Per-family matrix

Renderer kinds (spec.renderer.kind): `lumina_2d`, `primitive_3d`, `hybrid`
(spec: `src/demonstrations/spec/demo-spec.ts`). Trust levels:
`verified_simulation`, `conceptual_demonstration`, `explanatory_animation`.

"Accessible representation exists" means the demo's `representations` array
contains that kind **and** the non-canvas renderer for it exists
(`representation-tabs.tsx` `NonStageView`). The canvas fallback view is
always the spec's `renderer.fallbackKind`, regardless of trust level.

| Renderer kind | Trust level | Non-canvas views available | Canvas fallback (WebGL/engine down) |
|---|---|---|---|
| `lumina_2d` (curated engines, offline builder) | verified_simulation | `diagram`, `text_sequence`; plus `stage_2d` (2D canvas — not accessible) | `accessible_diagram` (`engine-builder.ts:444-478`) |
| `lumina_2d` (timeline template) | explanatory_animation | `timeline`, `text_sequence` | `timeline` (`template-builder.ts:730-747`) |
| `primitive_3d` (3D template) | conceptual / explanatory | `diagram`, `text_sequence`; plus `stage_3d` (WebGL — not accessible) | `accessible_diagram` (`template-builder.ts:646-669`) |
| `hybrid` (curated showcases: orbits, electric-fields, wave-interference) | verified_simulation | orbits: `table`, `timeline`, `text_sequence`; electric-fields: `diagram`, `table`, `text_sequence`; wave-interference: `graph`, `timeline`, `text_sequence`; all three also list `stage_3d`/`stage_2d` canvases | `accessible_diagram` (`showcases/*/build-spec.ts`) |
| any (model-generated specs) | any | anything the validated spec declares; all 8 kinds have renderers: `diagram`/`causal_map` → `AccessibleDiagram`, `table` → `DataTableView`, `timeline` → `TimelineView`, `text_sequence` → `TextSequenceView`, `graph` → `GraphView` (level-1 live readouts only) | the spec's `fallbackKind` (validated in `validation/`) |

`stage_2d` / `stage_3d` are canvas views and are **never** the only
representation: `SPEC_LIMITS.maxRepresentations` is 5, and the spec
validator plus every builder above ships at least two non-canvas views.

## 3. The screen-reader path (exact, per step)

What follows is the actual keyboard/SR journey through the DOM order of
`demonstration-shell.tsx`. It is exercised by
`tests/demonstrations/a11y/demo-shell-a11y.test.tsx` (keyboard-only journey).

1. **Represent** — `role="tablist"` ("View the demonstration as") with roving
   `tabindex`; Arrow keys / Home / End switch tabs, and each switch announces
   `View: <label>` through the single polite region in
   `representation-tabs.tsx` (empty until a switch, so nothing is announced
   on load). Non-stage tabs render HTML/SVG views (`table`, `timeline`,
   `text_sequence`, `diagram`, `graph`) that a screen reader can read.
2. **Predict** — `fieldset`/`legend` ("What do you think will happen?") with
   native radios wrapped in 44px labels. Tab lands on the group's first
   radio; arrow keys select within the group. The submit button is a native
   button; Enter submits.
   - On submit: the panel swaps to "Prediction locked in", a `role="status"`
     region announces **"Prediction recorded — controls unlocked."**, and
     focus moves to the **first experiment control** (predict → manipulate
     handoff; `demonstration-controls.tsx`), so the keyboard user is never
     dropped to `<body>`.
3. **Manipulate** — controls section (`aria-label="Controls"`): sliders are
   real `<input type="range">` (base-ui) with labels, `aria-valuetext`
   including units, and native arrow/Home/End/PageUp/PageDown stepping
   (implemented programmatically by base-ui, verified in jsdom);
   `play_pause` is a labeled toggle button (`aria-pressed`); segmented
   controls and speed are button groups (`role="group"` + `aria-pressed`);
   `drag_handle` is intentionally rendered as a note ("drag directly on the
   stage") because pointer drags cannot be replicated without the canvas.
   One-variable mode freezes other controls and labels them "Held constant".
4. **Observe** — `DataTableView` shows parameter values and **live
   readouts** (level 1 only, no invented numbers); `GraphView` renders
   readout bars with the numeric value as text; `TimelineView` is an
   ordered `<ol>` with times; `AccessibleDiagram` is an SVG with a
   `<title>` + `aria-label` summary and an HTML `<figcaption>` duplicate.
   Readout changes are **not** in a live region — no per-frame announcements.
5. **Compare** — for graded specs (verified_simulation with a
   `correctIndex`), the "Reveal the verified answer" button stays disabled
   until the learner has manipulated something; pressing it swaps in the
   result, whose verdict is **text** (`role="status"`, "Your prediction was
   correct." / "…differed from the verified answer."), never color alone.
   Focus moves onto the result so the keyboard user reads it immediately.
   Ungraded specs show "Compare with what you observed" — never a verdict.
6. **Adapt** — `DemonstrationAdaptationPanel` renders bounded suggestions
   (Accept/Reject native buttons in tab order after Save observations);
   accepted suggestions apply `set_parameter` / `switch_representation` /
   `enable_one_variable_mode`, and the change is visible in the active
   accessible view (e.g. the table shows the new value).
7. **Trial log / replay** — `<details>/<summary>` (native keyboard
   disclosure). Restoring a trial mounts the replay banner and **moves
   focus to it** (`demonstration-shell.tsx`), so the comparison table and
   its Dismiss button are immediately reachable.

The ask flow (`ask-demo-form.tsx`) mirrors this: every phase transition
announces via `role="status"` and moves focus to the phase card; returning
to the form refocuses the input; validation and clarification errors are
`role="status"` with `aria-describedby`.

## 4. Automated coverage (what the tests prove)

`tests/demonstrations/a11y/demo-shell-a11y.test.tsx` (8 tests, all green):

1. Full keyboard journey through the accessible representation
   (predict → manipulate → observe → compare → adapt) with tab-order
   assertions at every hop.
2. `reducedMotion` is passed to the 3D renderer constructor (mock) and
   stage views sort last under reduced motion.
3. The demo page maps OS/stored reduced motion, high contrast, and text
   scale to the document (`html[data-reduced-motion]`, `body.high-contrast`,
   root font-size) and removes them on unmount.
4. Live regions announce prediction submit + tab switches; **exactly one**
   polite region changes per action (no spam).
5. Canvas fallback renders a visible note with `role="status"` plus the
   accessible representation.
6. Every control (slider/switch/button/tab/radio/textbox) has an accessible
   name.
7. Trust badge and graded result carry text, never color alone.
8. Structural: no fixed-px width/height/min-width classes or inline px
   sizes in the shell; the two-column layout is `lg:`-gated (single fluid
   column below), so 320px reflows.

## 5. MANUAL-CHECK list (cannot be proven in jsdom)

1. **200% zoom (WCAG 1.4.4)**: open `/demos/<id>` for an orbits or
   pendulum demo, zoom the browser to 200% (Cmd/Ctrl-+), and verify: no
   horizontal scrollbar on any view; text wraps; the controls, tabs, and
   table remain operable; the diagram/timeline views reflow. Repeat at 320px
   width via DevTools responsive mode — single column, no clipping.
2. **Real screen reader**: with VoiceOver (macOS) or NVDA (Windows), walk
   the journey in §3: confirm the submit announcement, the tab-switch
   announcement, slider labels/values with units, the graded verdict, and
   that the fallback note is spoken when WebGL is disabled (browser setting
   or a device without WebGL).
3. **High contrast on the homepage ask flow**: the demo shell uses the
   light token palette (`body.high-contrast`), but the flag-gated homepage
   components (`ask-demo-form.tsx`, `clarification-card.tsx`,
   `demo-summary-card.tsx`, `generation-error.tsx`, `generation-progress.tsx`)
   use the fixed dark-hero palette and do not respond to the high-contrast
   token set. Verify contrast of teal-on-dark there at 4.5:1 with a contrast
   checker; this is a known gap, not auto-checked.
4. **Touch targets on real hardware**: most controls are `min-h-11`
   (44px). The shared `Switch` (`src/components/ui/switch.tsx`, outside this
   audit's editable scope) is 32×18.4px visual with a 56×34.4px expanded hit
   area: meets the WCAG 2.5.8 AA minimum (24px) but not the 44px AAA
   target. The slider thumb is 20px; the track/control row is 44px. Verify
   comfortable tapping on a phone.
5. **SVG diagram at 320px**: the diagram is an 800×460 viewBox scaled to
   the container; at 320px the in-SVG labels get small. The `<figcaption>`
   and `aria-label` summary are the accessible equivalent. Confirm the
   caption reads acceptably.

## 6. Known limitations / UNKNOWN items

- `Lumina2DStage` does not consume `reducedMotion` (the 2D runner has no
  camera and no motion options; play/pause is learner-controlled, and the
  global CSS kill-switch covers page animations). The 3D renderer is the
  only one with auto-camera behavior, and it honors the flag.
- The switch component's fixed px sizing and sub-44px target (see §5.4)
  live in `src/components/ui/switch.tsx`, which is outside this audit's
  editable scope.
- Real zoom/screen-reader behavior is environment-dependent; §5 items are
  manual by design.
- `DemoSaveControl`'s `aria-live="polite"` status paragraph is mounted with
  initial text ("Not saved"); it only *changes* on save actions, so it is
  not a spam source, but the initial content may be read once on page load
  by some screen readers.
