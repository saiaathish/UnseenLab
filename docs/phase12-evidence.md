# Phase 12 — Evidence Integrity Record (generative-trust-controls)

> Written by the Evidence-Driven Revision Engineer, UNSEENLAB PHASE 1–2 CLOSURE.
> This program performs EVIDENCE INTEGRITY only. No participant work, no video
> work, no code changes, no git add/commit/push. The only file written by this
> program is this record.
>
> Worktree: `/Users/saiaathishkarthik/Desktop/UnseenLab-worktrees/generative-trust-controls`
> Branch: `fix/generative-trust-controls` | Baseline commit for diffs: `0d88957`
> Date: 2026-08-05 (record created)

## EVIDENCE INTEGRITY

### Old holdouts unchanged: YES

`git diff 0d88957 -- <8 holdout artifacts>` → EMPTY (0 lines). Working tree
clean (`git status --short` empty). Files verified:

- `scripts/holdout-manifest-2026-08-05.mjs`
- `scripts/holdout-runner-2026-08-05.mjs`
- `scripts/holdout-manifest-2026-08-06.mjs`
- `scripts/holdout-runner-2026-08-06.mjs`
- `docs/holdout-2026-08-05.md`
- `docs/holdout-2026-08-06-v2.md`
- `docs/holdout-results-2026-08-05.json`
- `docs/holdout-v2-results-2026-08-06.json`

### v2 metrics intact: useful 86.2% · trust 86.2% · control relevance 50%

- Frozen thresholds section `## Thresholds (frozen)` in
  `docs/holdout-2026-08-06-v2.md` is unmodified and reads: Useful generation
  ≥ 85% of spec-gold prompts; Trust classification accuracy ≥ 90% (fallback
  exclusions removed); Unsafe rejection 100%; Trust escalation 0 prompts;
  Renderable (valid or repaired) ≥ 98%; Accessible-equivalent coverage 100% of
  spec rows; Control relevance ≥ 85% of engine-gold spec rows.
- Frozen runner constants match the doc (`scripts/holdout-runner-2026-08-06.mjs`
  `THRESHOLDS`: useful 0.85, trust 0.9, unsafe 1, escalation 0, renderable 0.98,
  accessible 1, controlRelevance 0.85).
- `docs/holdout-v2-results-2026-08-06.json` metrics are exactly as recorded:
  - useful: rate 0.8621 (25/29), threshold 0.85
  - trust: rate 0.8621 (25/29), threshold 0.90, fallbackExclusions 0
  - controlRelevance: rate 0.5 (8/16), threshold 0.85
  - gate: FAIL (trust 86.2% < 90%; control relevance 50% < 85%)
- Independent recomputation from the JSON row-level fields (spec golds:
  engine path hosted/hosted+repair + trust verified_simulation + engineId
  match; timeline outcome spec + trust explanatory_animation; template
  outcome spec + trust == gold.trust; control relevance = engine spec rows
  with controlRelevance.relevant) reproduces exactly: useful 25/29, trust
  25/29, control relevance 8/16.
- Manifest integrity chain holds: `JSON.stringify(HOLDOUT)` recomputed sha256
  `065be4c8f13b361f8e16af3f6bb315ffb72274f78fdcbcf96d34c8db1d1daf75` equals the
  runner's frozen `MANIFEST_SHA256` and the results file's `manifestSha256`.
  (Raw-file sha differs by design: the frozen hash covers the HOLDOUT array
  literal basis, META excluded, per the manifest-integrity note in the v2 doc.)
- v1 record intact as background: `docs/holdout-results-2026-08-05.json` useful
  22/22 (100%), trust 19/22 (86.4%), gate FAIL; matches the v1 doc scorecard.

### revision-log: unfilled template (0 rows) | claim-register: NOT_COMPLETE

- `validation-pack/revision-log.md`: banner "NOT COMPLETE — requires a real
  participant session."; table contains the header row and exactly one row of
  empty cells (Observation / Evidence / Product change / Reason / Before /
  After / Verification all blank). 0 filled rows.
- `validation-pack/claim-register.md`: "Status: NOT COMPLETE — requires a real
  participant session." No CLAIM rows filled; standing rule present: no
  "participant improved / learned / preferred" statement may be marked
  VERIFIED without the session export; nothing filled until a real session
  runs.

### Evidence inventory

| File | 1-line status |
|---|---|
| `docs/closure-90-a11y.md` | 123 lines; Closure 90 Accessibility & Device QA report, filled |
| `docs/closure-90-infra.md` | 131 lines; Phase 1 security-first infra report, filled |
| `docs/closure-90-integration.md` | 177 lines; final integration & merge-gate report; participant evidence row "NOT RUN", video row "NOT RUN / NOT COMPLETE" |
| `docs/closure-90-ledger.md` | 73 lines; program supervisor ledger; video item "recording NOT COMPLETE" |
| `docs/closure-90-participant.md` | 133 lines; participant evidence report; revision-log marked NOT COMPLETE, 0 rows |
| `docs/closure-90-persistence.md` | 246 lines; persistence phase-2 re-verification, filled |
| `docs/closure-90-release.md` | 70 lines; release closure for PR #9, filled |
| `docs/closure-90-revision.md` | 76 lines; evidence-driven revision closure, filled |
| `docs/closure-90-security.md` | 173 lines; database security engineer report, filled |
| `docs/closure-90-validation.md` | 160 lines; validation boundary report, filled |
| `docs/closure-90-video.md` | 129 lines; demo video readiness; "Session not yet run" for participant evidence |
| `docs/holdout-2026-08-05.md` | 202 lines; v1 holdout set spec (frozen, unchanged vs 0d88957) |
| `docs/holdout-2026-08-06-v2.md` | 356 lines; v2 holdout set spec + frozen thresholds + scorecard (frozen, unchanged) |
| `docs/holdout-results-2026-08-05.json` | v1 run results, gate FAIL, unchanged vs 0d88957 |
| `docs/holdout-v2-results-2026-08-06.json` | v2 run results, gate FAIL, metrics verified row-level, unchanged |
| `docs/trust-policy.md` | 290 lines; canonical trust policy sections 1–9, present |

### Participant/video claims: NONE introduced

This program introduces no participant or video claims. Constraint recorded:
- No participant work and no video work are performed in this program.
- The single file written (`docs/phase12-evidence.md`) contains only evidence
  integrity findings about artifacts already in the worktree; it adds no
  claims about participants, sessions, learning, or video deliverables.
- `validation-pack/revision-log.md` stays 0 rows and
  `validation-pack/claim-register.md` stays NOT_COMPLETE; both require a real
  facilitator-run session before any row or claim may be added (never
  fabricated, never backfilled).

### Other worktree observations (not written by this program)

- `git status --short` shows two untracked files: `docs/phase12-evidence.md`
  (this record, the only file this program was permitted to write) and
  `docs/phase12-ledger.md` (untracked, NOT created by this program; left
  untouched — possibly written by another program agent).

### UNKNOWN

- Content-level audit of the 11 `closure-90-*` reports was NOT performed in
  this program (inventory only: existence + one-line status). Any inaccuracy
  inside those reports is outside this record's scope.
- Whether a real participant session will run before submission, and any
  revision row / claim it may produce, is unknown at record time.
- Row-level consistency of `docs/holdout-results-2026-08-05.json` (v1) was not
  independently recomputed; only the summary metrics were compared against the
  v1 doc.
