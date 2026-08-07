# Closure 90 — Final Integration & Merge-Gate Report (PR #9)

Generated: 2026-08-05, 20:20 CDT — Final Integration and Merge-Gate Engineer.
Read-only on product code (no commits, no push). Sole writable artifact: this file.

## FINAL SHA

- **Final SHA:** `b8e6809df63830e0d878ef39ed3dc65abc1a1c1c`
  (`feature/generative-demonstration-engine`)
- **Note on head drift:** the gate was begun at `a2ce504`; two docs-only
  commits landed on the branch mid-run (`19f5a0d`, `b8e6809`, both authored
  by saiaathish, 2026-08-05 20:07). The complete final gate was re-run on
  the new final SHA `b8e6809`. Both new commits touch docs only
  (`docs/holdout-2026-08-06-v2.md`, `docs/closure-90-security.md`);
  no product code changed.

## INTEGRATED COMMITS (range `fcb5ad3..b8e6809`, 5 commits)

| SHA | Subject |
|---|---|
| `8e57a73` | feat(90): canonical trust policy (red-team approved, §9) + frozen holdout-2026-08-06-v2 (41 prompts, SHA 065be4c8) + closure-90 evidence (security contract test, live index/validator drift fixed, canonical-state-proof-final, a11y matrix + VoiceOver checklist, persistence re-verification, video/participant readiness) |
| `7fc23a0` | fix(ci): secret-scan false positive (split MONGODB_URI literal) + typecheck optional-pointer in persistence-roundtrip test |
| `a2ce504` | docs(holdout): v2 frozen run results — 41/41 executed, useful 86.2%, trust 86.2% FAIL, control relevance 50% FAIL, safety/categories 100%; no rules changed |
| `19f5a0d` | docs: correct v2 diagnosis (2 policy-contradiction + 2 model-deviation misses per red-team), outage timestamps (UTC/local), security doc drift-closed status |
| `b8e6809` | docs(security): drift CLOSED status — validators + unique index live, contract test 2/3 |

## CONFLICTS

None. Linear history, no merges in range.

## CHANGE-SET REVIEW

- `git diff --stat fcb5ad3..b8e6809 -- src/` — **EMPTY** (no
  src/ generation/validation/spec changes in range).
- Holdout rules frozen: `git diff 8e57a73..b8e6809 -- scripts/ src/` —
  **EMPTY**. The only `tests/` delta in range is the pre-announced,
  assertion-preserving CI-fix commit `7fc23a0` (local const rename +
  env-key string split in the security-contract test; type-only imports/cast
  in persistence-roundtrip test). No manifest/runner/scoring change.
- Secrets: `git grep -n -E 'mongodb\+srv|BEGIN PRIVATE KEY|sk-[a-z0-9]{20}'`
  over all 22 changed files — **0 matches**; broader scan
  (`AIza…|ghp_…|AKIA…|xox[baprs]-|-----BEGIN`) — **0 matches**;
  the two late doc commits' diffs — **0 matches**.
  (`MONGODB_URI` appears in the contract test only as the split identifier
  `"MONGODB_" + "URI"`; no real values anywhere.)

## FINAL GATE (exact results, run on `b8e6809`)

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **CLEAN** (exit 0) |
| Typecheck | `npm run typecheck` | **CLEAN** (exit 0) |
| Unit | `npm test` | **1138 passed + 1 INTENDED failure (1139 total)**; 69 files: 1 failed / 68 passed |
| Build | `npm run build` | **SUCCESS** (exit 0; 23 routes incl. static `/lab/nuclear-chain-reaction`) |
| Bundle secret scan | `node scripts/bundle-secret-scan.mjs` | **EXIT 0** — client bundles CLEAN; server env reads intact (FIREBASE_SERVICE_ACCOUNT 3, MONGODB_URI 9) |
| E2E | `npx playwright test` | **39 passed / 10 skipped / 1 failed** (CI-green expectation; see note) |
| Browser verify | `npm run start -- -p 3100` + `node browser-verify.mjs` | **ALL CHECKS PASSED** (26/26, exit 0); server killed after |
| Diff check | `git diff --check` | **CLEAN** |
| Working tree | `git status --short` | **CLEAN** except the sanctioned new file `docs/closure-90-integration.md` (untracked, not committed — no authorization) |

### Local suite note (the only local unit failure — designed signal)

`tests/demonstrations/backend/database-security-contract.test.ts` (live
cluster, ran because local MONGODB_URI is present): the least-privilege
assertion fails — app user holds `[ { role: 'atlasAdmin', db: 'admin' } ]`.
This is the intended P1 signal: the live app user must be downgraded to
`readWrite(unseenlab)` BEFORE any `0.0.0.0/0` allowlist (human Atlas console
step; documented in `docs/closure-90-security.md` as the only remaining red
assertion). CI self-skips this file without MONGODB_URI, so CI is green.
A transient full-suite run during the session showed a file-level flake on
`tests/demonstrations/ui/ask-flow-flag-off.test.tsx` (passes in isolation;
attributed to parallel-agent resource contention); the stable re-run
restored the canonical 1138 + 1 result.

### E2E local note

`e2e/auth-dialog.spec.ts:58` "Continue with Google degrades gracefully"
failed locally: guest-build-only test, but the local build is
Firebase-configured (`.env.local` has `NEXT_PUBLIC_FIREBASE_API_KEY`), so
the served build never shows the guest failure copy. The test itself
documents "run with the same env the build was baked with." CI builds in a
clean checkout (guest build) and passes. Not a code defect — environment
mismatch, no `src/` involvement.

## FEATURE-FLAG GATE

- Flag OFF by default: `/Users/saiaathishkarthik/Desktop/UnseenLab/src/demonstrations/feature-flag.ts` —
  `(process.env["NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED"] ?? "0") === "1"`.
- `src/app/page.tsx:38` — `{generativeDemosEnabled ? <AskDemoSection /> : null}` (gated).
- Nuclear lab tests (flag-independent path): `npx vitest run tests/components/run-guard.test.tsx tests/simulation/nuclear-chain-reaction.test.ts`
  → **12/12 PASS** (run-guard 1, nuclear-chain-reaction 11).
- Flag ON path evidence: frozen v2 holdout run — 41/41 prompts executed via
  the hosted generation endpoint (base localhost:3200, manifest SHA
  `065be4c8…d75`), `docs/holdout-v2-results-2026-08-06.json`; plus
  `docs/closure-90-persistence.md` (flag=1 preview run: home shows the ask
  section; persistence re-verified locally).

## CI ON FINAL SHA

`gh run list --branch feature/generative-demonstration-engine`:

| Run | SHA | Conclusion | Jobs |
|---|---|---|---|
| 31061811515 | b8e6809 | **success** | Lint/typecheck/unit: success · Build: success · Secrets scan: success · E2E (Playwright): success |
| 31061810075 | b8e6809 | **success** | (PR run, same SHA) |
| 31061784708 / 31061782306 | 19f5a0d | cancelled (superseded) | — |
| 31061135770 / 31061133982 | a2ce504 | success | 4/4 jobs green |

CI is green on the exact final commit.

## PREVIEW ON FINAL SHA

- Newest preview: `https://unseen-o61h7q52j-sai-aathish-karthiks-projects.vercel.app`
  → **READY**, built from `b8e6809` (verified via Vercel API
  `githubCommitSha` = b8e6809…, ref feature/generative-demonstration-engine, PR #9).
- HTTP 200 on the previous pinned preview; this deployment state READY.
- Preview persistence check remains **BLOCKED** (SSO-protected preview +
  Atlas access list; deployed build's baked flag/lambda behavior externally
  unverifiable — `docs/closure-90-persistence.md`).
- Production: `https://unseen-7hodblevv-sai-aathish-karthiks-projects.vercel.app`
  → READY, pinned to `75fbd73` (= origin/main). **Production untouched.**

## ROLLBACK

- Code default `"0"` (off); flag env exists only in the Preview environment;
  production has no flag row → feature off in production.
- Rollback is a one-line change (set/delete preview flag to `0`); no code
  rollback required. Verified in `docs/closure-90-release.md` and
  `src/demonstrations/feature-flag.ts`.

## MERGE-READINESS CHECKLIST (13)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Secure deployed persistence | **PARTIAL / BLOCKER** — local proven; preview persistence BLOCKED (SSO + Atlas ACL); live app user **atlasAdmin (P1 OPEN)** — downgrade before allowlist | closure-90-persistence.md, closure-90-security.md, contract test live failure |
| 2 | Valid blind holdout (v2) | **GATE FAIL** — 41/41 executed; useful 86.2% (25/29, thr 0.85) PASS; **trust 86.2% (25/29, thr 0.9) FAIL**; unsafe 100% PASS; escalation 0 PASS; renderable 100% PASS; accessible 100% PASS; **control relevance 50% (8/16, thr 0.85) FAIL** → `gate: FAIL` | docs/holdout-2026-08-06-v2.md, holdout-v2-results-2026-08-06.json |
| 3 | Real participant evidence | **NOT RUN** (no human available) | closure-90-participant.md, claim-register.md (NOT COMPLETE) |
| 4 | Exactly one participant revision | **NOT DONE** (rule documented; engineer blocked; zero changes — compliant) | closure-90-revision.md, validation-pack/revision-log.md |
| 5 | Real accessibility evidence | **PARTIAL** — real-browser PASS (desktop/mobile, reduced motion, forced colors, 150% text, 200% zoom, keyboard); real screen reader (VoiceOver) **NOT RUN** | closure-90-a11y.md, demo-shell-a11y-matrix.test.tsx |
| 6 | Complete 3-min video | **NOT RUN / NOT COMPLETE** (script ready: 11 beats, 180 s, verbatim closing) | closure-90-video.md, demo-script-generative.md |
| 7 | Accurate PR claims | **PARTIAL** — PR #9 OPEN **DRAFT**; body header **STALE** (claims head f3d6298, 135 files, +35,427/−13; actual b8e6809, 350 files, +72,087/−1,058 vs main) | gh pr view 9 |
| 8 | CI green on final SHA | **PASS** — 2 runs success, 4/4 jobs | gh run list |
| 9 | Local final gate on exact commit | **PASS** — lint/typecheck/build/bundle-scan/browser-verify/diff-check clean; unit 1138 + 1 intended signal; e2e 39 pass/10 skip/1 documented env-mismatch | this report |
| 10 | Holdout rules frozen; no src changes in range | **PASS** | git diff fcb5ad3..b8e6809 -- src/ empty; scripts+src 8e57a73..b8e6809 empty |
| 11 | Secrets | **PASS** — repo scans, new-commit diffs, bundle scan all clean | above |
| 12 | Production untouched | **PASS** — prod pinned to main (75fbd73), READY | Vercel API |
| 13 | Rollback behavior | **PASS** — flag default 0, preview-only env, one-line rollback | feature-flag.ts, closure-90-release.md |

## VERDICT

**KEEP_DRAFT.**

CI is green on the final SHA, the preview is pinned and READY on the final
SHA, the integration hygiene gates (8–13) all pass, and production is
untouched. However, the program's merge blockers are open:
(2) v2 holdout gate **FAIL** (trust 86.2% < 90%; control relevance 50% < 85%);
(1) **atlasAdmin P1** open; (1) preview persistence **BLOCKED**;
(3/4/6) participant session and video **NOT RUN**; (7) PR body stale and PR
still **DRAFT**. No product-code defect was found in the range (src/
untouched; the two late docs commits verified assertion-consistent with the
live contract test). No merge or deploy was performed (no authorization);
no commits were made.

## REJECTED ITEMS

- None (no unrelated features, weakened tests, stale claims introduced by
  this range; the two late docs commits were verified as accurate and
  consistent with live observations).

## UNKNOWN

- Whether further commits will land on the branch after `b8e6809` (HEAD
  moved once during this session; re-verified at final SHA).
- Preview persistence outcome (externally unverifiable; SSO + Atlas ACL).
- Real screen-reader pass; final video file; participant session data.
- Whether the PR body/labels will be refreshed and the PR un-drafted
  (prerequisite for any future merge review).
