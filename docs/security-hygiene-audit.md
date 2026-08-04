# Security & PR Hygiene Audit — UnseenLab

**Auditor:** AGENT SEC-01 (read-only audit)
**Date:** 2026-08-03
**Scope:** Branch `feature/personalized-auth-onboarding-platform` at commit `0ab636a` (pushed), plus current working-tree additions (`.github/workflows/ci.yml`, `scripts/`, `supabase/config.toml`, new tests/components, audit docs). Nothing was modified by the auditor except this file.
**Method:** Pattern scans over tracked files, the full commit diff, all 37 commits of history, and built `.next` output; `git ls-files` + `git check-ignore` verification; `npm audit --omit=dev`; `gh` PR inspection; manual review of `.github/workflows/ci.yml`. Any secret-like VALUES found are redacted here (prefixes only).

---

## Findings table

| # | Severity | Finding | Evidence | Fix |
|---|----------|---------|----------|-----|
| F1 | HIGH | Production dependency tree has 3 high-severity advisories, all inherited via `next` (pinned `16.2.12`): its bundled `postcss` `<=8.5.22` (4 advisories incl. arbitrary-file-read `GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849`, XSS `GHSA-qx2v-qp2m-jg93`) and `sharp` `<0.35.0` (`GHSA-f88m-g3jw-g9cj`: libvips CVEs CVE-2026-33327/33328/35590/35591) | `npm audit --omit=dev` → `3 high severity vulnerabilities`; JSON report: `"next": {"severity":"high","isDirect":true,"via":["postcss","sharp"]}`, `"fixAvailable":{"name":"next","version":"16.3.0","isSemVerMajor":false}`; `fix available via npm audit fix --force` (installs `next@16.3.0`, "outside the stated dependency range") | Planned upgrade `next@16.2.12` → `16.3.0` (same major per audit; then re-run `npm run build` + e2e). Do not use `--force` blind — bump `package.json` deliberately. If deferred, track explicitly: postcss is build-time CSS processing; sharp is server-side image optimization (not client-exposed) |
| F2 | MEDIUM | Local `npm run lint` fails because `eslint.config.mjs` does not ignore the Supabase CLI's generated `supabase/.temp/**` (gitignored, so CI's clean checkout is unaffected). Generated minified edge-runtime source trips `no-var`/`prefer-const` errors | `npx eslint supabase/.temp/start-secrets` → errors on `supabase/.temp/start-secrets/supabase_edge_runtime_UnseenLab/main/index.ts` (`1:1 error Unexpected var… no-var`, `prefer-const` xN). `eslint.config.mjs` `globalIgnores` lists only `.next/**`, `out/**`, `build/**`, `next-env.d.ts` | Add `"supabase/.temp/**"` (and optionally `"supabase/.branches/**"`) to `globalIgnores` in `eslint.config.mjs`. CI unaffected either way (clean checkout has no `.temp`) |
| F3 | LOW | Local, gitignored `.env` contains a real API key (`LLM_API_KEY=sk-CxB1i73k…` for opencode.ai). Not tracked, not in history, not in CI — but it is a live credential on disk | `ls -la .env*` → `.env`, `.env.example`, `.env.local` exist locally; `git ls-files '.env*'` → only `.env.example`; redacted read shows `LLM_API_KEY=sk-CxB1i73k…`; `.env.local` contains a `VERCEL_OIDC_TOKEN="eyJ…"` JWT | No repo action. Awareness: treat the machine as a trusted workstation; rotate the LLM key if the machine may be shared. `.env*` (except example) is gitignored at root |
| F4 | LOW | `actions/checkout@v4` / `actions/setup-node@v4` pinned to mutable major-version tags rather than commit SHAs — tag re-pointing is a theoretical supply-chain vector | `.github/workflows/ci.yml` lines `uses: actions/checkout@v4`, `uses: actions/setup-node@v4` | Optional hardening: pin to full SHAs (e.g. `actions/checkout@<sha>`) via Dependabot `group: github-actions`. Standard `@v4` tags are acceptable practice; not a blocker |
| F5 | INFO | Workflow `permissions` block grants `actions: read` in addition to `contents: read`; the jobs never use the actions API | `.github/workflows/ci.yml` → `permissions: contents: read / actions: read` | Cosmetic: drop `actions: read`; keep `contents: read` |

Everything else scanned clean — see the PASS list below.

---

## PASS list

**Secrets**
- P1. No secret VALUES in tracked files. `git grep -nE "service_role|SUPABASE_SERVICE_ROLE|GOOGLE_CLIENT_SECRET|sk-[A-Za-z0-9]{20}"` (excluding `.env.example`) matched only documentation prose: `docs/supabase-setup.md:58 "Never add SUPABASE_SERVICE_ROLE_KEY, database passwords, or Google client …"` — a warning, not a secret.
- P2. Pushed commit `0ab636a` diff contains no accidental secrets. `git show 0ab636a | grep -E "sb_publishable_|sb_secret_|service_role|GOOGLE_CLIENT_SECRET|sk-[A-Za-z0-9]{20}|AIza"` → zero matches.
- P3. No historical leaks. `git log -p --all -- '.env*'` → only `.env.example` (both commits are placeholders, e.g. `LLM_API_KEY=sk-your-key-here`). `git grep` across all 37 revisions (`git rev-list --all`) for key-value patterns (`.env.example` and `*.md` excluded) → zero matches.
- P4. `.next/static` scan is clean — the single match is a false positive: `.next/static/chunks/40muzspfdncjx.js` contains the supabase-js SDK key-type detector `e.startsWith("sb_publishable_")||e.startsWith("sb_secret_")` (library source inlined at build), not key VALUES. No `sb_publishable_<value>`/`sb_secret_<value>` strings exist anywhere in build output.
- P5. Working-tree diff and untracked additions (`.github/`, `docs/*.md`, `scripts/`, `e2e/`, new `src/components/auth/sign-out-dialog.tsx`, `supabase/config.toml`, `supabase/tests/`, new `tests/`) contain no secret values. `scripts/e2e-seed-auth.mjs` reads `SUPABASE_SERVICE_ROLE_KEY` from the environment; nothing hardcoded.

**Tracking hygiene**
- P6. Only `.env.example` is tracked (`git ls-files | grep -E "\.env|\.next|\.temp|node_modules|playwright-mcp|gui-test-screenshots"` → `.env.example` only; artifact-path count = 0).
- P7. Root `.gitignore` (working-tree modified) covers `/.next/`, `/node_modules/`, `.env*` (except example), `/.playwright-mcp/`, `/gui-test-screenshots/`, `/test-results/`, `/.supabase/`, `/supabase/.temp/`. The working-tree diff added the last two: `+/.supabase/` and `+/supabase/.temp/`.
- P8. `supabase/.gitignore` covers `.branches` and `.temp`; `git check-ignore -v supabase/.temp/start-secrets/*` → matched by `supabase/.gitignore:3:.temp`. The local stack's generated secrets (`supabase/.temp/start-secrets/supabase_db_UnseenLab`, `supabase_edge_runtime_UnseenLab`, `supabase_kong_UnseenLab` — db password / JWT secrets) cannot be staged.
- P9. `supabase/config.toml` (untracked, commit-intent; normally committed) contains no secrets: `project_id = "UnseenLab"` (nonsensitive local identifier), `openai_api_key = "env(OPENAI_API_KEY)"` (env-reference), all `secret_key`/captcha lines commented, auth section only local `site_url = "http://127.0.0.1:3000"` + `additional_redirect_urls = ["https://127.0.0.1:3000"]`. No Google `client_id`/`client_secret` values.

**Dependency health**
- P10. `package-lock.json` is committed (313 KB) and `package.json` uses no `~` ranges anywhere.
- P11. Every dependency ADDED by `0ab636a` is exactly pinned (no `^`): `@base-ui/react 1.6.0`, `@supabase/ssr 0.12.4`, `@supabase/supabase-js 2.112.0`, `class-variance-authority 0.7.1`, `clsx 2.1.1`, `lucide-react 1.28.0`, `next-themes 0.4.6`, `sonner 2.0.7`, `tailwind-merge 3.6.0`, `tw-animate-css 1.4.0`, `next 16.2.12` (pinned).
- P12. The caret-ranged deps (`gsap ^3.15.0`, `three ^0.185.1`, `zod ^4.4.3`) are PRE-EXISTING — they appear as unchanged context lines in the `0ab636a` package.json diff, not `+` lines. Not introduced by this work.

**PR hygiene**
- P13. PR #5 (`feature/personalized-auth-onboarding-platform` → base `main`) is **CLOSED** (`gh pr view 5`: `"state":"CLOSED"`, `"mergedAt":null`, closed 2026-08-04T02:37:15Z).
- P14. Replacement PR #7 exists and is correctly based: `gh pr view 7` → `"baseRefName":"feature/final-adaptive-loop-hardening"`, head `feature/personalized-auth-onboarding-platform`, DRAFT/OPEN. No open PR targets `main` (`gh pr list --state open` shows only #7).
- P15. Branch is exactly one commit ahead of `ec2062f`: `git rev-list ec2062f..HEAD --count` → `1` (`0ab636a`). Pushed head matches local: `git rev-parse HEAD` = `git rev-parse origin/feature/personalized-auth-onboarding-platform` = `0ab636ab2f0a…`.

**CI / GitHub Actions exposure**
- P16. Workflow uses no secrets (no `env:`/`secrets:` context anywhere in `.github/workflows/ci.yml`, 109 lines).
- P17. No `pull_request_target`; push trigger scoped to `feature/*`; `permissions: contents: read, actions: read` (read-only). No untrusted input is evaluated (`github.ref` appears only in the concurrency group key; no scripts interpolate PR/issue body or comments).
- P18. Built-in `secrets-scan` job greps tracked files for `sk-[a-z0-9]{20,}` and forbidden names (`service_role`/`SUPABASE_SERVICE_ROLE`/`GOOGLE_CLIENT_SECRET`, with deliberate `:!(exclude)` for `.github` self-reference, `.env.example` and `*.md` warning text) and fails CI if any `.env*` other than `.env.example` is tracked. This job would have caught every finding above had anything been committed.
- P19. `concurrency: ci-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` prevents wasted/duplicate runs.

---

## Verdict

**SAFE-TO-PUSH** for the current `0ab636a` + working-tree state, with the standard "clean-up working tree before pushing" caveat.

**Must-fix / required follow-ups (do not block the push itself, but track immediately):**
1. **F1** — `npm audit` HIGH (3 advisories via `next`/`postcss`/`sharp`): bump `next` to `16.3.0` (same-major fix per audit) and re-verify build + e2e in the same or next commit. If it must wait, record the accepted risk — this is the only substantive finding.
2. **F2** — add `supabase/.temp/**` to `eslint.config.mjs` `globalIgnores` so local lint matches CI. CI is provably unaffected (clean checkout contains no `.temp`), so this does not gate the push.

**Recommended (low effort, non-blocking):** F3 (awareness only — key already properly gitignored), F4 (SHA-pin actions), F5 (drop `actions: read`).

**Reminder for the push:** `.github/workflows/ci.yml`, `scripts/`, `supabase/config.toml`, and the new tests/components are currently untracked working-tree additions — they must be included in the commit(s) that follow `0ab636a` on PR #7 for the CI/security-scan coverage described above to take effect.
