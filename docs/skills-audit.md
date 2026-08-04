# Skills Compliance Audit — UnseenLab (feature/personalized-auth-onboarding-platform)

- **Auditor:** AGENT SKL-01 (skills compliance, read-only)
- **Date:** 2026-08-03
- **Scope:** skill availability on this machine vs. skills actually loaded during the program, per the coordinator's invocation record, cross-checked against in-repo evidence.
- **Method:** SKILL.md inventory of the four relevant plugin directories; coordinator's record of actual invocations; repo evidence (`docs/platform-contracts.md`, `docs/shadcn-compliance-review.md`, `docs/supabase-setup.md`, `.github/workflows/ci.yml`, `supabase/migrations/20260803193000_platform_schema.sql`, `supabase/tests/rls-isolation.sql`, `package.json`, `playwright.config.ts`, `AGENTS.md`, git log of `feature/personalized-auth-onboarding-platform`).

---

## 1. Skills inventory (existing on this machine, relevant to the program)

| Skill | One-line purpose (from SKILL.md) |
|---|---|
| `supabase/supabase` | Use for ANY Supabase task: Auth, RLS, migrations, CLI, supabase-js/SSR integrations, security audits. |
| `supabase/supabase-postgres-best-practices` | Postgres performance/best practices for writing, reviewing, or optimizing schema design, queries, and database config. |
| `vercel/nextjs` | Next.js App Router expert guidance: routing, Server Components, Server Actions, data fetching, rendering, deployment. |
| `vercel/react-best-practices` | Condensed quality checklist for TSX: component structure, hooks, accessibility, performance, TS patterns. |
| `vercel/verification` | Full-story verification: infer what is being built, verify end-to-end (browser → API → data → response). |
| `vercel/env-vars` | Environment-variable guidance: `.env` files, `vercel env` commands, OIDC, environment-specific config. |
| `vercel/shadcn` | shadcn/ui expert guidance: CLI, component installation, composition, theming, Tailwind integration. |
| `browser-use/control-browser` | Main-agent-only Browser Use: open, navigate, click, type, screenshot, verify web pages/localhost in ZCode. |
| `browser-use/web-gui-tester` | Black-box GUI testing of web frontends with a final test report; user asks to "test" a page/feature. |
| `superpowers/verification-before-completion` | Run verification commands and confirm output before claiming work is complete/fixed/passing. |
| `superpowers/systematic-debugging` | Use when encountering any bug/test failure/unexpected behavior, before proposing fixes. |
| `superpowers/test-driven-development` | Use when implementing any feature or bugfix, before writing implementation code. |
| `superpowers/dispatching-parallel-agents` | Use when facing 2+ independent tasks with no shared state/sequential dependencies. |
| `superpowers/executing-plans` | Execute a written implementation plan in a separate session with review checkpoints. |
| `superpowers/writing-plans` | Write a plan for a multi-step task from a spec, before touching code. |
| `superpowers/subagent-driven-development` | Execute implementation plans via subagents for independent tasks in the current session. |
| `superpowers/requesting-code-review` | Request review when completing tasks/features or before merging. |
| `superpowers/receiving-code-review` | Handle review feedback with technical rigor and verification, not performative agreement. |

Also present but not program-relevant (not audited): other `vercel/*` skills (ai-gateway, auth, bootstrap, deploy, marketplace, storage, etc.), remaining `superpowers/*` (brainstorming, finishing-a-development-branch, using-git-worktrees, using-superpowers, writing-skills).

## 2. Record of ACTUAL use (invocation record, evidence-based)

### Loaded

1. **`supabase/supabase` + `supabase/supabase-postgres-best-practices`** — invoked by the coordinator early in the session. Their guidance shaped the migration:
   - RLS own-row-only pattern `to authenticated using ((select auth.uid()) = user_id)` with `WITH CHECK` on INSERT/UPDATE — `supabase/migrations/20260803193000_platform_schema.sql:201-261`; stated as design notes at lines 4-16.
   - No `user_metadata` authorization — migration design note line 7 ("Authorization never reads `user_metadata` (user-editable)"); enforced in `handle_new_user()` by clamping/sanitizing `raw_user_meta_data` as presentation-only (migration lines 36-52).
   - Version pinning — `package.json`: `@supabase/ssr` `0.12.4`, `@supabase/supabase-js` `2.112.0`; `docs/supabase-setup.md` pins CLI `v2.79+` (migration push) and `v2.81.3+` (advisors).
   - Isolation-suite discipline — `supabase/tests/rls-isolation.sql` exists and is mandated by `docs/platform-contracts.md` §3 and `docs/supabase-setup.md` §1.4.
2. **`superpowers/dispatching-parallel-agents`** — invoked for this batch. Observable evidence: this parallel audit/review batch (AGENT UI-01, AGENT SKL-01, read-only agents) matches the skill's trigger (2+ independent tasks, no shared state); `docs/platform-contracts.md` §8 ownership matrix records "parallel writers are the named read-only agents" and "No worktrees".

### NOT loaded (coordinator's record)

3. **`vercel/shadcn`** — NOT invoked during implementation. Observable consequence: the "CLI-init discipline gap" — `src/components/ui/*` (15 components) were copied in by hand instead of `npx shadcn add`, so the CLI's init-time artifacts are missing (`--radius-*` scale, `@import "shadcn/tailwind.css"`); the missing radius scale produces square `size="sm"/"xs"` buttons at runtime (HIGH finding in `docs/shadcn-compliance-review.md` §3). A dedicated compliance review (AGENT UI-01) now covers this gap.
   - **Discrepancy to reconcile:** `docs/shadcn-compliance-review.md` line 6 (untracked, produced this session) states its method was a "skill-loaded process" pointing at the shadcn SKILL.md path. If AGENT UI-01 loaded the skill for the review, that is the first and only invocation, and it post-dates implementation; if not, the method line overstates what happened. The repo alone cannot prove either reading — only the coordinator's record (no invocation) and the doc's self-claim exist. Under the program rule "never claim a skill was used when it wasn't", this line should be made precise (e.g., "performed per the shadcn skill's standards" vs. "skill loaded") before the doc is committed.
4. **`vercel/nextjs`** — NOT invoked. Observable consequence: none. `AGENTS.md` mandates reading `node_modules/next/dist/docs/` directly, and the code reflects it (`src/proxy.ts:6`, `src/lib/supabase/proxy-client.ts:7-8`, `docs/platform-contracts.md` §2: "Next 16 convention; `middleware.ts` deprecated"). The skill would have been redundant with the mandated direct-docs reading.
5. **`vercel/react-best-practices`** — NOT invoked. Observable consequence: none directly attributable. The skill's checklist (component structure, hooks, accessibility) overlaps with what the later compliance review found (hand-rolled modal Dialog duplicating installed `ui/dialog.tsx`, raw `<select>`/`<p role="alert">` anti-patterns, `space-y-*` 40×); the review covered it, so the risk was mitigated downstream rather than at edit time.
6. **`vercel/verification`** — NOT invoked. Observable consequence: none. The full-story verification role is covered by `.github/workflows/ci.yml` (lint, typecheck, unit, production build, Playwright e2e, secrets scan), `e2e/*.spec.ts` (7 specs, port 3100 per `playwright.config.ts`), and `validation-pack/` artifacts.
7. **`vercel/env-vars`** — NOT invoked. Observable consequence: none. `.env.example` documents names only; `ci.yml` enforces that no `.env` other than `.env.example` is tracked and scans for forbidden secret references; `docs/supabase-setup.md` documents key handling and the guest-only degradation contract (`docs/platform-contracts.md` §2).
8. **`browser-use/control-browser` / `browser-use/web-gui-tester`** — NOT invoked. Observable consequence: browser verification happened directly via Playwright tooling/scripts instead — `.playwright-mcp/` console logs, `gui-test-screenshots/` (t1-t5), `browser-verify.mjs`, and committed `e2e/` specs. No skill-guided GUI test report artifact exists (web-gui-tester's deliverable), and control-browser's "main-agent-only" discipline note was moot (no subagent attempted browser use). The committed Playwright suite is arguably stronger than a session-scoped GUI report (repeatable in CI), so this gap is process-form rather than outcome.
9. **Other `superpowers/*`** (`verification-before-completion`, `systematic-debugging`, `test-driven-development`, `executing-plans`, `writing-plans`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`) — no record of invocation. Observable consequence: none negative. The disciplines they encode appear in the repo (TDD-like commit sequence, e.g. `d92aefe test: cover the repeatable adaptive loop at the browser level`; verification artifacts in `validation-pack/`; CI gates; review docs), but these outcomes were produced by the program's own conventions (AGENTS.md, CI, review agents), not by skill loads. This is a process-compliance miss against the "load before relevant work" mandate, with cosmetic outcome impact.

## 3. Cross-check: final report claims vs. skills evidence

| Claim (report) | Evidence | Verdict |
|---|---|---|
| `docs/platform-contracts.md` §3: RLS own-row only, `to authenticated`, `(select auth.uid()) = user_id`, WITH CHECK, no `user_metadata` authorization | Migration SQL lines 201-261 + design notes 4-16 | TRUE — consistent with supabase skill guidance (skill loaded) |
| §3: isolation suite `supabase/tests/rls-isolation.sql` | File exists; referenced in `docs/supabase-setup.md` §1.4 and CI-adjacent docs | TRUE |
| §2/§8: Next 16 `proxy.ts` convention, no middleware.ts | `src/proxy.ts`, `src/lib/supabase/proxy-client.ts` comments | TRUE — direct docs reading per AGENTS.md (nextjs skill not loaded, no consequence) |
| §6: "Install only what surfaces need" from official registry, 15 components | `components.json` schema-valid; compliance review confirms 15 components byte-identical to base-nova registry | TRUE, with the noted CLI-skip artifact (shadcn skill not loaded) |
| §7: testing strategy (Vitest, Playwright port 3100, secrets scan) | `ci.yml` jobs match; `playwright.config.ts` port 3100; `tests/` + `e2e/` present | TRUE |
| `docs/shadcn-compliance-review.md` line 6: "skill-loaded process" for shadcn | Coordinator's record says the shadcn skill was NOT invoked; doc is untracked self-claim | UNRESOLVED — flag for the review agent to make precise (see §2.3) |
| §8: "No worktrees: parallel writers are the named read-only agents" | Git history shows older `worker/*` merge commits, but those predate this branch's base `ec2062f` (verified: merge-base = `ec2062f` = claimed base); current phase used parallel agents (dispatching-parallel-agents loaded) | TRUE |

## 4. Audit table (mandated skills → loaded → evidence → consequence → recommendation)

| Mandated skill | Loaded? | Evidence | Consequence of not loading | Recommendation |
|---|---|---|---|---|
| `supabase/supabase` | YES (early, coordinator) | RLS/auth patterns in migration; version pins in package.json | n/a | Continue loading for any Supabase change |
| `supabase/supabase-postgres-best-practices` | YES (early, coordinator) | Grants/RLS discipline; advisor pin (`docs/supabase-setup.md`) | n/a | Continue loading; apply advisor run before enabling auth (pending `NOT_RUN_EXTERNAL_CREDENTIALS` gate) |
| `superpowers/dispatching-parallel-agents` | YES (this batch) | Parallel read-only agent batch; ownership matrix §8 | n/a | Keep using for independent-task batches |
| `vercel/shadcn` | NO (implementation); claim of load in review doc | Components hand-copied; missing CLI artifacts (radius scale, shadcn/tailwind.css import) per review §3 | REAL — runtime `border-radius: 0` on sm/xs controls; review now covers it | Run the mandated CLI flow (`npx shadcn@latest add --dry-run --diff`) for future component changes; fix radius scale; AGENT UI-01 to make the "skill-loaded" method line precise |
| `vercel/nextjs` | NO | `node_modules/next/dist/docs/` read directly per AGENTS.md | None observed | Keep the AGENTS.md direct-docs path; skill optional |
| `vercel/react-best-practices` | NO | — | None directly attributable; review found TSX discipline issues downstream | Load after multi-TSX edits, as the skill directs |
| `vercel/verification` | NO | CI + e2e + validation-pack substitute | None observed | Optional; CI already gates |
| `vercel/env-vars` | NO | `.env.example` + ci.yml env guards | None observed | Load for future env/config changes |
| `browser-use/control-browser` | NO | Playwright MCP used directly (`.playwright-mcp/`, screenshots) | Process-form only; no main-agent-only violation | n/a — tooling used correctly; skill optional |
| `browser-use/web-gui-tester` | NO | `browser-verify.mjs`, `e2e/`, screenshots instead | No GUI test report artifact; committed e2e suite substitutes (arguably stronger) | Load if a session-level GUI report is ever required |
| `superpowers/verification-before-completion` | NO | CI green artifacts (`.next/`, `test-results/`) exist but not skill-driven | None observed | Load before final ship claims per mandate |
| `superpowers/systematic-debugging` | NO | Fix commits + tests follow TDD-like order | None observed | Load when debugging per mandate |
| `superpowers/test-driven-development` | NO | `tests/`, `e2e/` coverage; test-before-fix commits | None observed | Load before feature work per mandate |
| Other `superpowers/*` (executing-plans, writing-plans, subagent-driven-development, requesting/receiving-code-review) | NO | Docs (platform-contracts.md) and review docs exist | None observed | Load at the relevant phase per mandate |

## 5. Verdict

**Which skill gaps mattered (real, observable):**
1. **`vercel/shadcn` not loaded during implementation** — the only gap with a measurable consequence. Hand-copying the 15 components instead of the mandated CLI flow lost the init-time artifacts; the missing `--radius-*` scale renders sm/xs buttons and the sm select with `border-radius: 0` (HIGH finding in `docs/shadcn-compliance-review.md`). It is being remediated by that review, and the components themselves are registry-faithful.
2. **Unresolved skill-usage claim** — `docs/shadcn-compliance-review.md`'s "skill-loaded process" method line conflicts with the coordinator's record that the skill was never invoked. Under the program's honesty rule, this claim must be made precise (and the doc committed, since it is currently untracked) before it propagates into any final report.

**Which gaps were cosmetic (no observable consequence):** nextjs (AGENTS.md direct-docs reading fully substituted), verification/env-vars (CI and `.env` guards substitute), browser-use pair (direct Playwright tooling produced equivalent-or-stronger artifacts), react-best-practices (later review covered its checklist), and the remaining superpowers skills (their disciplines appear in repo artifacts via the program's own conventions). These are process-form misses against the "load before relevant work" mandate, not outcome failures.

**Bottom line:** 3 of 18 relevant skills were actually loaded (supabase ×2, dispatching-parallel-agents); every load had verifiable shaping effects; only the shadcn gap had a real consequence, and it is under remediation. The "never claim a skill was used when it wasn't" rule has one open violation risk — the review doc's method line — which the coordinator should resolve with AGENT UI-01.
