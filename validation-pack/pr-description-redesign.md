# Lesson Workspace Redesign — PR description (final body, A8)

**Head:** `HEAD` (`feature/generative-demonstration-engine`) · **Base:** `main`
**Slice under review:** `0d88957..HEAD` — program-doc commits + implementation
commits (A1–A5) + the A8 integration commit (open findings + final gate)
**Program contract:** `docs/redesign-lesson-workspace.md` (frozen UX contract;
evidence: `docs/red-team-lesson-workspace-2026-08-07.md`)
**Parent PR context:** this slice extends the generative-demonstration-engine
branch that was PR #9 (feature flag, pipeline and trust policy unchanged by
this slice). PR #9 is MERGED on GitHub (2026-08-05); **this redesign is a NEW
PR**, not #9. Ledger: `.superpowers/sdd/progress.md`.

Every claim below is tagged with the environment it was verified in:
`VERIFIED` (code + tests / real browser) / `NOT_RUN` (manual or human-only) /
`BLOCKED_EXTERNAL` (external dependency). Run results are never blended across
environments. The redesign is UI-only and flag-gated; with
`NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` at its default `0` the product is
byte-identical to before.

---

## 1. Summary

The demo lesson page is no longer a dashboard. The 70/30 workspace
(model left, sequential lesson rail right) implements the frozen UX contract
item by item: a canonical graph invariant so every surface renders the same
declared graph, a gated predict → interact → observe → explain → complete
lesson rail whose steps complete only on real interaction, provenance demoted
behind one trust chip + `ⓘ` (never deleted), normalized Model/Diagram
representation labels, an accessibility pass, and a real-browser e2e suite
proving the mechanics in Chromium against a flag-on production build.

## 2. What changed, per area

### 2.1 Canonical graph invariant — A1 (`3f5d14a`) [`VERIFIED`]

- `template-builder.ts`: all 10 conceptual templates no longer emit standalone
  `arrow` / `process_edge` objects or detached scene-title labels; only nodes
  + typed `scene3d.relationships` remain (`energy_packet` objects kept — they
  travel along an edge path; the two `state_change` captions are group
  children of state nodes). Node ids/labels/positions byte-identical.
- `primitive-3d/scene-graph.ts` (new pure module): `isGraphLikeScene`,
  `deriveGraphEdges` (with `inhibits` flag), `cascadeOrder`, `edgeCausalPath`.
- `primitive-3d/renderer.ts`: graph mode is opt-in (`!hasEngineMapping &&
  isGraphLikeScene`) so hybrid engine showcases and containment scenes keep
  their prior rendering; edges derived from relationships — arrowhead cone at
  the DESTINATION, `—|` bar (perpendicular cylinder) for `inhibits`,
  relationship label mid-edge; camera-facing labels locked above nodes;
  near-orthographic default camera with wheel-zoom frustum scaling; rotation
  clamped (`GRAPH_AZIMUTH_BAND` 0.45 rad / polar 0.18 rad); auto-orbit off.
- Interaction (graph scenes only): node pick → highlight + outgoing edges +
  downstream nodes in BFS order; edge pick/hover → everything outside the
  causal path dims; keyboard (focusable canvas, arrows, Enter/Space, Escape).
- Event surface (change-only semantics, graph scenes only): `onNodeSelect`,
  `onEdgeSelect`, `onNodeManipulate` on `StageProps` +
  `PrimitiveSceneRendererOptions` — all optional; `onNodeManipulate` fires on
  every activation and is the completion key for lesson interact steps.
- `accessible-representation.tsx` (2D): filters `arrow`/`process_edge`/`line`/
  `label` kinds so the SVG draws only the canonical graph; `inhibits` ends in
  a `—|` bar; honest empty state.

### 2.2 Green suite infra (`cf88729`, `b52f289`) [`VERIFIED`]

- ESM `vitest.config.mts` for the Vite 8 native loader, zod v4
  `interopDefault` interop, jsdom 30 storage shim in `tests/setup.ts`.
- Restores a fully green suite: **73 files / 1230 tests, 0 failed** under real
  Node (`/opt/homebrew/opt/node/bin`). The default PATH `node` is a Bun shim
  that breaks mongodb/bson loads — the canonical test command uses real Node
  (documented in README "Tests"; A6 re-ran the suite: 73 files / 1230 passed).

### 2.3 70/30 workspace + lesson rail — A2 (`3c5f630`) [`VERIFIED`]

- `demonstration-shell.tsx`: `lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]`
  — model left (~70%), rail right; single fluid column below `lg`; header =
  back link, title, learning objective, one trust chip + `ⓘ`.
- `lesson-rail.tsx` (new): state machine `predict → interact → observe →
  explain → complete`; one step visible at a time; Continue gated on real
  completion (prediction commit; `onNodeManipulate` for the referenced node in
  graph mode / referenced control touch in engine mode / explicit "I saw it"
  for timeline mode; at least one observation; explanation selection); Back
  always available; completed steps persist across back-navigation (never
  relock); conceptual explain step is learner self-assessment (no invented
  grading). Interact instructions reference real model objects by spec id
  ("Click Cause A...", "Move the Length slider.").
- `demonstration-page.tsx`: `manipulatedNodeIds` recorded only AFTER the
  prediction is committed (pre-submission stage clicks cannot pre-complete the
  interact step); `touchedControls`.
- Provenance demoted, never deleted: `about-this-model.tsx` (new) dialog
  carries source/origin, save status (moved `DemoSaveControl` with its honest
  401 fallback), limitations, compact trial log with honest replay, adaptation
  history; live adaptation suggestions appear only on the rail's complete
  step (derivation + recording contract unchanged). Removed from the primary
  workspace: source badge, top-right Save, limitations list, trial log,
  adaptation card, standalone observation card. Deleted components
  (`prediction-panel`, `observation-panel`, `demo-limitations`) absorbed;
  grep-verified no remaining imports.

### 2.4 Representation labels — A3 (`5ca316c`) [`VERIFIED`]

- All representation labels in the A3-owned builders normalized to
  `3D Model | 2D Model | Model | Diagram | Table | Timeline | Text sequence |
  Graph`. No behavior change; no test asserted any old label string
  (1223 pass before and after). The one A1-owned straggler (`"3D stage"` at
  `template-builder.ts:633`) is FIXED by A8 — label is now `"3D Model"`.

### 2.5 Accessibility — A4 (`3b614ef`) [`VERIFIED` + `NOT_RUN` remainders]

- Keyboard-only rail journey; focus after step advance (fresh step → heading;
  already-completable step → enabled Continue; disabled Continue never
  focused); dialog focus trap / Escape / focus return to trigger; exactly one
  polite announcement per step transition (silent first render; no double
  announcement on revisiting a completed step); completed steps exposed as
  sr-only text (never color-only) + `aria-current="step"`; native
  radio/checkbox semantics; perceivable disabled Continue with visible reason;
  reduced-motion mapping (`html[data-reduced-motion]` kill-switch respected,
  no animation classes on the rail); contrast fixes in default + high-contrast
  palettes; 320–1280 px reflow with zero horizontal overflow (real Chromium).
- WebGL-unavailable interact path: the accessible diagram promotes graph nodes
  to real buttons (`role="button"`, `aria-pressed`, Enter/Space, Escape)
  firing the exact A1 event surface — completion still requires a real
  activation; no fake gate.
- New `tests/demonstrations/ui/lesson-rail-a11y.test.tsx` (7 tests) + updated
  `demo-shell-a11y` (9) / matrix (4).
- `NOT_RUN` (manual, unchanged from prior programs): real 200% browser zoom
  (verified only at layout level via a 640px viewport) and real
  screen-reader (VoiceOver/NVDA) walk-through.

### 2.6 Browser e2e — A5 (`1fe7530`) [`VERIFIED`]

- `e2e/demo-lesson-rail.spec.ts` (new, 8 tests): real Chromium against a
  flag-on production build; every demo created through the app's own
  ask-to-demo flow with the generation bridge stubbed to HTTP 500 (the
  documented offline-catalog path — same code a network-less guest gets). Covers
  70/30 layout (1280 px and stacked below `lg`), rail gating, graph interact
  completion via a REAL pointer click on node A (renderer's orthographic
  camera math; empty-canvas click does not complete), engine-demo completion
  via a real slider drag, persisted completion on back-nav, provenance
  demotion. Spec self-skips unless the build was baked with the flag.
- Full e2e run with the build's own Firebase env: **47 passed / 11 skipped /
  0 failed**; `node browser-verify.mjs` ALL PASS.

## 3. Test evidence

| Gate | Result | Environment |
| --- | --- | --- |
| `npm run typecheck` | PASS (A1–A5) | real Node |
| `npm run lint` | PASS (A1–A5) | real Node |
| `npm test` | **73 files / 1230 tests / 0 failed** (re-verified by A6) | real Node (`/opt/homebrew/opt/node/bin`) |
| `npm run build` | PASS (A1–A5; flag-on for A5) | real Node |
| New/rewritten suites | template-builder 8 · accessible-diagram 3 · primitive-3d extended (48) · lesson-rail 7 · lesson-rail-a11y 7 · demo shell 13 · shell-a11y 9 · matrix 4 | vitest, jsdom |
| Playwright (full) | Run A (no Firebase env): 47 passed / 10 skipped / 1 env-caused fail · Run B (build's own env): **47 / 11 / 0** | real Chromium, flag-on production build, port 3100 |
| New e2e spec | 8/8 | real Chromium |
| `node browser-verify.mjs` | ALL PASS | lab smoke |

Environment caveats, stated not hidden: (1) gates run locally under real Node —
this program has no CI job for the new spec; (2) `auth-dialog.spec.ts`'s
Google test depends on the build's Firebase configuration. The canonical e2e
command is to run with the same env the build was baked with: local builds are
Firebase-baked via `.env.local`, so export `NEXT_PUBLIC_FIREBASE_API_KEY`
(from `.env.local`) alongside `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1` — the
`GUEST_BUILD` gate then self-skips the Google test by design and the full suite
is 47 passed / 11 skipped / 0 failed. A genuinely guest (non-Firebase) build
is only possible by building without `.env.local`; then the Google test runs
and passes its graceful-degradation assertion. Failing the Google test is an
env mismatch (runner env vs baked build), never a redesign defect (A8 closure,
finding 6: documented here as the chosen mitigation).

## 4. Honest limitations (do not overclaim)

- Live-model end-to-end and real screen-reader (VoiceOver/NVDA) verification
  remain manual/preview gates — NOT_RUN, unchanged from prior programs.
- 200% zoom verified at layout level only; real-browser 200% + real AT remain
  manual (`NOT_RUN`).
- The graph interact step requires the live 3D surface; in the
  WebGL-unavailable fallback an honest accessible completion path exists (A4,
  tested), but a real pointer click on the node is the canonical completion
  (A5, real Chromium).
- The `explain` step for conceptual demos is learner self-assessment — there
  is no engine-owned truth to grade; `correctIndex` grading remains
  curated-only.
- Hybrid showcase / containment scenes never enter graph mode; the rail does
  not gate interact steps on them.
- A8 carry items (all FIXED in the A8 integration commit; see
  `docs/closure-lesson-workspace-redesign.md`): `template-builder.ts:633`
  `"3D stage"` → `"3D Model"`; `globals.css:52` high-contrast `--muted-strong`
  typo (`#f5f5f5` → `#0a0a0a`); visible em dash in `demonstration-controls.tsx`
  drag-handle copy; stale `before_after_comparison` observation prompt
  (red-team F4); guest-e2e build note for `auth-dialog` (this section);
  A1 material-disposal judgment documented in the closure report.

## 5. How to review (commit order)

1. `233cf8d` → `92c056a` → `66c7762` — the frozen program contract, A1
   ownership note, and design/taste contract. Review the claims in
   `validation-pack/claim-register.md` + `validation-pack/evidence-claims-register.md`
   against these.
2. `3f5d14a` (A1) — the architectural core. Deepest review: `scene-graph.ts`
   derivation math, `renderer.ts` graph mode (arrowhead placement, `—|` bar,
   camera clamp, event-surface change-only semantics), template diffs
   (labels/positions unchanged), 2D parity.
3. `cf88729` + `b52f289` — infra: ESM vitest config, zod interop, storage
   shim; the suite must be green under real Node.
4. `3c5f630` (A2) — the rail state machine and gating semantics; provenance
   demotion (nothing deleted); deleted components with no dangling imports.
5. `5ca316c` (A3) — label normalization; confirm no behavior change.
6. `3b614ef` (A4) — focus management, announcements, dialog trap, fallback
   interact path, contrast; review against the frozen a11y contract.
7. `1fe7530` (A5) — the e2e spec is the acceptance evidence: gating,
   real-pointer completion, persistence, provenance.

## 6. Rollback

UI-only slice. The feature flag is unchanged (`src/demonstrations/feature-flag.ts`,
default `0`); with the flag off the product is byte-identical to before. To
roll back the redesign: revert commits `1fe7530 3b614ef 5ca316c 3c5f630
b52f289 cf88729 3f5d14a` (or drop the flag env), or `git revert` the range —
no data/schema/persistence changes exist (`demoStore` trial-recording contract
is byte-for-byte unchanged; `git diff 0d88957..HEAD` touches no auth,
firebase, mongo, or lab files).

## 7. Verification statuses used

`VERIFIED` = code inspected + tests executed (unit, or real Chromium e2e).
`NOT_RUN` = manual/human-only check not yet performed. `BLOCKED_EXTERNAL` =
external dependency. No `MOCKED_ONLY` / `PREVIEW_VERIFIED` claims are made:
the e2e evidence is a local production build in real Chromium, and no preview
deployment was used for this slice.
