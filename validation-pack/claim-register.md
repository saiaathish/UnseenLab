# Claim Register — participant session

Claims register for the generative demonstration engine participant session
(judge Gate 5/6). The canonical claim register lives at
`docs/claim-register.md` (pre-generative) and
`validation-pack/evidence-claims-register.md` (evidence-claims statuses).

**Status: NOT COMPLETE — requires a real participant session.**

After the session (see `facilitator-session-sheet.md` +
`participant-test-extension.md`), update this file with:

- CLAIM rows for: participant pre/post measures, confidence change, effort
  expected vs actual, adaptation decision, and the single participant-caused
  revision (recorded first in `validation-pack/revision-log.md` with the
  verbatim quote).
- Status per row: VERIFIED | UNVERIFIED | NOT_RUN.

Standing rule (never violated): no "participant improved / learned /
preferred" statement may be marked VERIFIED without the session export as
direct evidence. Nothing is filled in until a real session runs.

---

# Lesson Workspace Redesign claims (A6 addition, 2026-08-07)

Claims for the Lesson Workspace Redesign program (`docs/redesign-lesson-workspace.md`,
branch `feature/generative-demonstration-engine`, commits `3f5d14a..1fe7530`).
These are UI/rendering claims: they do NOT change the participant-session
requirements above, and the standing rule above still applies to any
participant outcome claim (nothing in this section is a learning-gain claim).

**Status: VERIFIED per row below. Each claim carries its evidence (commit +
assignment report + test counts). Rows with a human-only remainder are marked
PARTIAL with the remainder stated. No redesign claim is marked VERIFIED on
report text alone; each was re-checked against the code by A6 before writing.**

Status per row: VERIFIED | PARTIAL | NOT_RUN (same legend as the
evidence-claims register; "VERIFIED" here means commit exists + code inspected +
tests pass, not a participant result).

- REDESIGN-01 — Canonical graph invariant (semantic mirror): conceptual
  templates emit nodes + `relationships` only (no standalone
  `arrow`/`process_edge` objects, no detached title labels); 3D and 2D both
  derive edges from `scene3d.relationships`; node labels/positions unchanged.
  **Status: VERIFIED** — commit `3f5d14a` (A1); `a1-report.md`; contract tests
  `tests/demonstrations/generation/template-builder.test.ts` (8 tests) +
  `tests/demonstrations/ui/accessible-diagram.test.tsx` (3 tests) +
  `tests/demonstrations/renderer/primitive-3d.test.ts` (+485, derivation +
  interaction surface); full suite 73 files / 1230 tests (real Node).
  Supersedes: the pre-A1 template emission of decorative `arrow`/`process_edge`
  objects and detached title labels in the 10 conceptual templates.
- REDESIGN-02 — 3D semantic rules + interaction event surface: arrowhead at
  the destination, `—|` bar for `inhibits`, camera-facing labels above nodes,
  near-orthographic default camera, clamped rotation; `onNodeSelect` /
  `onEdgeSelect` / `onNodeManipulate` fire only on selection-state changes
  (graph scenes only; hover dimming fires nothing). **Status: VERIFIED** —
  commit `3f5d14a` (A1); `a1-report.md`; primitive-3d interaction-surface
  tests; A5 e2e verified a real pointer click on node A fires
  `onNodeManipulate("a")` in real Chromium (`e2e/demo-lesson-rail.spec.ts`).
- REDESIGN-03 — 70/30 workspace + lesson rail state machine: model left
  (~70%) / rail right (~30%), single fluid column below `lg`; steps
  `predict → interact → observe → explain → complete`; Continue gated on real
  completion (prediction commit; node manipulation / control touch per scene
  type; at least one observation; explanation selection), Back always
  available, completed steps persist (never relock). **Status: VERIFIED** —
  commit `3c5f630` (A2); `a2-report.md`; `tests/demonstrations/ui/lesson-rail.test.tsx`
  (7 tests), `demonstration-shell.test.tsx` (13 tests), `demo-shell-a11y.test.tsx`
  (9 tests); A5 e2e (8 tests, real Chromium, flag-on production build).
  Supersedes: the dashboard-era demo workspace (source badge, top-right Save,
  visible limitations list, trial log, adaptation card and standalone
  observation card on the primary workspace) and the deleted
  `prediction-panel` / `observation-panel` / `demo-limitations` components.
- REDESIGN-04 — Provenance demoted, never deleted: one trust chip + `ⓘ`
  AboutThisModel dialog carries source, save status, limitations, trial log
  and adaptation history. **Status: VERIFIED** — commits `3c5f630` (A2) +
  `1fe7530` (A5); A5 e2e provenance test asserts the primary workspace carries
  no badge/log/save-status/limitations and the dialog does.
- REDESIGN-05 — Representation labels normalized to the Model/Diagram family
  (`3D Model | 2D Model | Model | Diagram | Table | Timeline | Text sequence |
  Graph`). **Status: VERIFIED, with one open item** — commit `5ca316c` (A3);
  `a3-report.md`; code-grep verified in the A3-owned builders. Open item for
  A8: `template-builder.ts:633` still emits `"3D stage"` (A1-owned file,
  blocked by ownership) — NOT claimed as fixed.
- REDESIGN-06 — Lesson workspace accessibility (keyboard journey, focus
  after step advance, dialog focus management, one polite announcement per
  step transition, completed steps not color-only, accessible interact
  completion path when WebGL is unavailable, reduced motion, contrast).
  **Status: PARTIAL** — commit `3b614ef` (A4); new `lesson-rail-a11y.test.tsx`
  (7 tests) + updated a11y suites; real-Chromium keyboard/focus/viewport pass
  in `a4-report.md`. PARTIAL remainder: real 200% browser zoom and real
  screen-reader (VoiceOver/NVDA) verification remain manual checks (NOT_RUN);
  the `--muted-strong` high-contrast token typo (`globals.css:52`) is
  mitigated in redesign-owned components but the token itself is an open A8
  item — do NOT claim the token is fixed.
- REDESIGN-07 — Browser e2e verification of the redesigned lesson page.
  **Status: VERIFIED (with environment caveat)** — commit `1fe7530` (A5);
  `e2e/demo-lesson-rail.spec.ts` (8 tests, real Chromium, flag-on production
  build, offline-catalog seeding via the app's own ask-to-demo flow); full e2e
  run with the build's own Firebase env: 47 passed / 11 skipped / 0 failed;
  `node browser-verify.mjs` ALL PASS. Environment caveat (known, NOT a product
  claim): `auth-dialog.spec.ts` degrades when the runner lacks
  `NEXT_PUBLIC_FIREBASE_API_KEY` (local builds are Firebase-baked via
  `.env.local`; with the key exported the test self-skips by design) — flagged
  for A8, and recorded in the evidence-claims register.
- REDESIGN-08 — Unit suite green under real Node: 73 files / 1230 tests,
  0 failed. **Status: VERIFIED (with environment note)** — infra commits
  `cf88729` + `b52f289` (ESM vitest config for the Vite 8 native loader, zod v4
  interop, jsdom 30 storage shim); re-verified by A6 (`npm test` under
  `/opt/homebrew/opt/node/bin`: 73 files / 1230 passed, 0 failed).
  Environment note: the default PATH `node` is a Bun shim that breaks
  mongodb/bson test loads — the canonical run command uses real Node
  (documented in README "Tests").
- REDESIGN-09 — Feature flag unchanged; the redesign is UI-only.
  **Status: VERIFIED** — `src/demonstrations/feature-flag.ts` unchanged
  (default `0`); `git diff 0d88957..HEAD` touches no auth/firebase/persistence
  files; `demoStore` trial-recording contract unchanged (A2 report).

Open items owed by A8 (do NOT claim as fixed; recorded in
`.superpowers/sdd/progress.md`): `template-builder.ts:633` `"3D stage"` →
`"3D Model"`; `globals.css:52` `--muted-strong: #f5f5f5` → `#0a0a0a` in
`body.high-contrast`; the visible em dash in `demonstration-controls.tsx`
drag-handle copy; A1's minor per-edge material-disposal note.
