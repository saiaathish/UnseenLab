# Closure — Lesson Workspace Redesign (A8, final integration & merge gate)

Generated: 2026-08-07 — Final Integration and Merge-Gate Engineer (A8 of 8).
Program: `docs/redesign-lesson-workspace.md` (frozen UX contract).
Branch: `feature/generative-demonstration-engine`.
Red-team input: `.superpowers/sdd/red-team-report.md` — APPROVED_WITH_FINDINGS
(0 Critical / 1 Important / 4 Minor). This is a NEW PR, not #9: PR #9 is
MERGED on GitHub (2026-08-05).

## FINAL SHA

- **Product-code final SHA:** `5773fd5` (`fix(demos): A8 integration — …`)
  — the commit that carries every A8 code fix and on whose tree all six final
  gates ran.
- **Trailing docs commit:** carries this closure report, the PR description
  final body, program status COMPLETE, and the ledger update — docs-only, no
  product code (exact SHA recorded in the ledger; full gates ran on
  `5773fd5`'s tree, which the docs commit leaves byte-identical in `src/`).

## INTEGRATED COMMITS (program range `66c7762..HEAD`)

| SHA | Subject |
|---|---|
| `66c7762` | docs(redesign): design read + taste contract for A2-A4 |
| `3f5d14a` | feat(demos): canonical graph invariant — templates + 3D edge derivation + 2D parity (A1) |
| `cf88729` | fix(tests): restore green suite — ESM vitest config + zod v4 interop + jsdom 30 storage shim (infra) |
| `b52f289` | fix(tests): move interopDefault to test.deps (infra) |
| `3c5f630` | feat(demos): lesson rail + 70/30 workspace — predict/interact/observe/explain/complete, provenance demoted (A2) |
| `5ca316c` | refactor(demos): normalize representation labels to Model/Diagram family (A3) |
| `3b614ef` | fix(demos): a11y audit of lesson workspace (A4) |
| `1fe7530` | test(e2e): demo lesson rail — 70/30 layout, gating, interaction completion, persisted steps (A5) |
| `6342a5f` | docs(redesign): claim register + evidence register + PR description (A6) |
| `5773fd5` | fix(demos): A8 integration — high-contrast muted-strong token, 3D Model label, honest before/after prompt, drag-note dash (A8, this report) |

## CONFLICTS

None. Linear history, no merges in range.

## FINDINGS FIXED (one integration pass, then re-verified)

| Finding | Severity | Fix | Verification |
|---|---|---|---|
| F1 `globals.css:52` `--muted-strong: #f5f5f5` (luminance-inverted typo) | Important | `body.high-contrast` now sets `--muted-strong: #0a0a0a` (matches `--foreground`; default token is `#3d4c59`) | `lab/adaptation-card.tsx:109` and `lab/adaptation-replay.tsx:285` `text-muted-strong` now render `#0a0a0a` on `#ffffff` ≈ 19.1:1 (WCAG AA). A11y unit suites re-run green (below). |
| F2 visible em dash, `demonstration-controls.tsx:385` drag-handle note | Minor | `{label} — drag directly on the stage.` → `{label} - drag directly on the stage.` (hyphen, per design-taste hard rule) | Grep re-audit: zero visible em/en dashes remain in this program's owned/touched components. Sibling check: `lesson-rail.tsx` renders no drag-handle note (filters `drag_handle` out of interactable controls only). |
| F3 `template-builder.ts:633` label `"3D stage"` | Minor | → `"3D Model"` (frozen vocabulary: `3D Model \| 2D Model \| Model \| Diagram \| Table \| Timeline \| Text sequence \| Graph`) | No test asserts the old string (grep); fixtures are inline test data, untouched. Full suite green. |
| F4 stale `before_after_comparison` observation prompt (NEW red-team finding) | Minor | `"Describe what the arrow between them represents."` → `"Describe what the relationship between the two states represents."` | All four "arrow" prompts checked against actual rendering: `cause_effect_network` ("Follow each arrow…") KEPT — `causes/activates/inhibits` endpoints are `process_node` (GRAPH_NODE_KINDS) so `deriveGraphEdges` renders them in graph mode and 2D draws the edges; `energy_transfer` ("arrow between source and sink") KEPT — `transfers_to` endpoints are `process_node`, edge renders on both surfaces and packets travel its path; `field_relationship` ("arrows between the two objects") KEPT — `attracts` between spheres derives an edge and the vector-field ticks animate (direction) between the objects; `before_after_comparison` REWRITTEN — `before`/`after` are `group` kind: 3D `deriveGraphEdges` skips them, `transforms_into` is not in non-graph `EDGE_TYPES` (renderer.ts:59), and 2D filters group endpoints, so no arrow exists on any surface. |
| A1 minor: per-edge materials not tracked as disposables | carry | Judgment (no code change): benign. `trackDisposable` covers geometries/textures; materials are small, shared per kind (`materialFor`), owned by three.js and GC'd with the scene; the renderer disposes the scene (`disposeScene(true)`), and the demo lifecycle creates one renderer per page with an explicit dispose path. No demo-lifecycle leak proven; a risky per-edge disposal refactor was NOT added. | Code read: `materialFor`, `trackDisposable`, `disposeScene` in `primitive-3d/renderer.ts`. |
| A5 env note: guest e2e build bakes real Firebase creds from `.env.local` | carry | Chosen mitigation: document the canonical e2e command in the PR description (no code change — `auth-dialog.spec.ts` and `playwright.config.ts` untouched). Canonical run = same env the build was baked with: export `NEXT_PUBLIC_FIREBASE_API_KEY` → `GUEST_BUILD` gate self-skips the Google test → 47 passed / 11 skipped / 0 failed. | PR description §3 (final body); A5 report Run A/B recorded. |
| A6 note: PR #9 merged; redesign is a NEW PR | carry | PR description header + parent context rewritten: no longer references "draft PR #9"; states PR #9 MERGED and this is a new PR. Program doc branch line updated. This verdict names the new PR. | `gh pr view 9` → state MERGED, 2026-08-05. |

Dash audit beyond the fix (documented, NOT changed — pre-existing and outside
this program's owned files / outside the A8 touch list): visible em dashes
remain in `src/components/demonstrations/ask-demo-form.tsx:416`,
`src/components/demonstrations/generation-progress.tsx:71,119`,
`src/components/demonstrations/representation-tabs.tsx:309`,
`src/components/ui/topic-input-hero.tsx:31`, `src/app/page.tsx:104,115`,
`src/components/settings/profile-settings.tsx:136`,
`src/components/research/research-session.tsx:122`. All verified NOT touched
by this program's diff (`git diff 66c7762..HEAD`). Recommended for a future
copy-hygiene pass; the red-team scoped F2 to this program's files.

## FINAL GATE (exact results, run on `5773fd5` under real Node)

`env PATH="/opt/homebrew/opt/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"` (the
default-PATH `node` is a Bun shim that breaks mongodb/bson — documented since
A1; README "Tests" section covers the real-Node requirement).

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| 2 | Lint | `npm run lint` | **PASS** (exit 0) |
| 3 | Unit | `npm test` | **PASS — 73 files / 1230 tests / 0 failed** (baseline preserved exactly) |
| 4 | Build | `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 npm run build` | **PASS** (flag-on production build) |
| 5 | E2E (program spec) | `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1 npx playwright test e2e/demo-lesson-rail.spec.ts` | **PASS — 8/8** (real Chromium, `next start -p 3100` webServer, flag-on build) |
| 6 | Browser verify | `node browser-verify.mjs` (server on 3100) | **PASS — ALL CHECKS PASSED** (26 checks) |

Explicit post-fix re-runs (per assignment): `vitest run` over
`lesson-rail-a11y`, `lesson-rail`, `demonstration-shell`, `demo-shell-a11y`,
`demo-shell-a11y-matrix`, `template-builder`, `accessible-diagram`,
`offline-generator` — **8 files / 273 tests / 0 failed**.

## FEATURE-FLAG GATE & ROLLBACK

- Flag OFF by default (`src/demonstrations/feature-flag.ts`:
  `(process.env["NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED"] ?? "0") === "1"`);
  with the flag off the product is byte-identical to before (redesign is
  UI-only; `git diff 0d88957..HEAD` touches no auth/firebase/mongo/lab files
  and no persistence keys).
- Rollback: revert the program range (`3f5d14a..HEAD`) or drop the flag env —
  one-line, no data/schema changes.

## HONEST LIMITATIONS (manual gates — unrun, must stay documented)

1. Real screen-reader (VoiceOver/NVDA) walk-through, incl. the interactive SVG
   node buttons inside `role="img"` — manual (A4 F11; automated a11y tree
   exposes them, real-AT confirmation is manual).
2. True 200% browser zoom in a headed browser (A4 approximated via 640px
   viewport reflow; no overflow observed).
3. Live-model end-to-end (hosted generation pipeline + Firebase/Mongo) —
   preview gate, unchanged by this program.
4. Full Playwright suite on the A8 tree: the program's own spec re-ran 8/8;
   the remaining specs' results are A5's Run A/B (47/11/0), not re-run on the
   A8 tree (A8 changes are 4 string/token lines; no test asserts any of them).
5. Real-browser high-contrast pixel check: token values verified by
   inspection (F1: ≈19.1:1); A4's real-Chromium reproduction (1.11:1) is
   reported, not re-run here.
6. CI on the final SHA: this program has no CI job for the new spec (local
   real-Node gates are the canonical evidence, per A5 §7).

## VERDICT

**MERGE_READY.**

All four gates are green on the exact final product SHA, the program's e2e
spec passes 8/8 in real Chromium, `browser-verify.mjs` passes all checks, and
every red-team finding (0 Critical / 1 Important / 4 Minor) is fixed in the
integration commit with the required re-verifications. The manual gates above
(real AT, live model, true 200% zoom) remain unrun exactly as disclosed — they
are unchanged preview/manual gates, not code blockers. The redesign is a NEW
PR (PR #9 is merged); the PR body for the new PR is the finalized
`validation-pack/pr-description-redesign.md`. No merge or deploy was
performed (no authorization).

## REJECTED ITEMS

- None. No unrelated features, weakened tests, or stale claims introduced;
  the only out-of-scope observations (pre-existing visible em dashes in
  non-program files) are documented above, not silently fixed.

## UNKNOWN

- Whether the new PR will be opened from this branch and how GitHub CI
  behaves on it (no CI job for the new spec; local gates are canonical).
- Real-AT, real 200% zoom, and live-model outcomes (manual/preview gates).
