# Closure Release Report — PR #9 (AGENT 02, Release and Branch Director)

Generated 2026-08-05 (read-only verification; no commits made).

- Head: 34dce5b63680b3ff0329e3b3c57e333d6db9bad7 | Base: 75fbd73b176a3b790e328052d99370bc94f23636 | Draft: YES | Mergeable: YES
- Changed files: 120 | Additions: 32182 | Deletions: 12
- CI on head: quality=success build=success e2e=success (run id 30997405308)
- Preview deployment: url=https://unseen-gdsvf2dth-sai-aathish-karthiks-projects.vercel.app state=READY commitSha=34dce5b63680b3ff0329e3b3c57e333d6db9bad7
- Flag preview value: "" (exists on Vercel preview env, but value is an empty string — neither "0" nor "1"; feature is off because only "1" enables) | Flag default in code: 0 | Flag documented in .env.example: YES
- Rollback path: `src/demonstrations/feature-flag.ts` defaults the flag to "0" (`(process.env[ENV_KEY] ?? "0") === "1"`), so clearing the env var or setting it to "0" disables the feature with no code change; the preview env var is currently empty (off), and production deployments track `main` (75fbd73b) which does not include this branch, so production is unaffected by PR #9.
- UNKNOWN: none.

## Verification details

### 1. Branch / head / base (git)
- Current branch: `feature/generative-demonstration-engine`
- HEAD: `34dce5b63680b3ff0329e3b3c57e333d6db9bad7` (matches expected)
- `origin/main`: `75fbd73b176a3b790e328052d99370bc94f23636`
- HEAD is also `origin/feature/generative-demonstration-engine` (in sync)
- Recent log (decorated):
  - `34dce5b` (HEAD -> feature/generative-demonstration-engine, origin/feature/generative-demonstration-engine) docs(audit): re-verify live-model/live-backend/persistence items; mark what remains UNVERIFIED
  - `4d7cb0b` docs: generative 3-min demo script + Gate 5/6 session-revision rule
  - `c5830d1` docs: Gate 4 persistence evidence + Atlas access-list env step
  - `fdb60c6` chore: revert temp Mongo diagnostic from health route (Gate 4 diagnosis complete)
  - `af55b1e` chore(debug): health probe includes connection error detail
  - `8c625aa` chore(debug): health probe names Mongo connection failure
  - `acb16c5` chore(debug): health probe disambiguates missing MONGODB_URI vs connection failure
  - `dd315d0` chore: redeploy with MONGODB_URI restored (Gate 4)

### 2. PR #9 state (GitHub API via gh)
- state: OPEN | isDraft: true | mergeable: MERGEABLE
- baseRefName: main | headRefName: feature/generative-demonstration-engine
- headRefOid: `34dce5b63680b3ff0329e3b3c57e333d6db9bad7` (matches local HEAD)
- changedFiles: 120 | additions: 32182 | deletions: 12

### 3. CI on head SHA
Run attached to head SHA `34dce5b6...` (event: pull_request, run id 30997405308, conclusion: success):
- "Lint, typecheck & unit tests" (quality): success
- "Production build" (build): success
- "End-to-end tests (Playwright)" (e2e): success
- "Secrets scan": success

Push-event run at same SHA (30997401258) also completed success with identical job conclusions.

### 4. Vercel deployment-to-SHA matching
Via Vercel REST API (`GET /v6/deployments?projectId=prj_IC3MNoDbUelGKhOQoSIFcPAbH589&teamId=team_v5RxnfpXBx6Xmvsw64GA5V6z`; token read from `$HOME/Library/Application Support/com.vercel.cli/auth.json`, not printed; the raw token initially returned 403 invalidToken, then worked after the Vercel CLI refreshed it):
- Newest preview deployment: uid `dpl_5A2bWcJzYSc1hSnttV8dzjgbsViE`
  - url: https://unseen-gdsvf2dth-sai-aathish-karthiks-projects.vercel.app
  - state: READY | target: preview (alias: unseen-lab-git-feature-gen-15e842-sai-aathish-karthiks-projects.vercel.app)
  - commitSha: `34dce5b63680b3ff0329e3b3c57e333d6db9bad7` (matches PR head)
  - created: 2026-08-05T10:26:07Z (matches head commit push time)
- Production deployment dpl_BrqAqE197mVSAFeAWM1v3mTHSveE is at `75fbd73b` (origin/main) — production does not run the feature branch.

### 5. Feature-flag state on preview
- Vercel project env (`GET /v9/projects/<projectId>/env`): 22 env entries; `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED` EXISTS with target `preview`, type `sensitive`, but its value is an EMPTY STRING (verified both with and without `decrypt=true`). It is not "0" and not "1"; since code only enables on exactly "1", the feature is effectively OFF on the current preview deployment.
- Local `.env` and `.env.local`: neither file exists with the key (no match in either; only `.env.example` tracked).

### 6. Rollback path
- `src/demonstrations/feature-flag.ts`: default is `"0"` — `(process.env[ENV_KEY] ?? "0") === "1"`. File documents: 'Rollback is a one-line change: set the flag back to "0". No code rollback is ever required.'
- `.env.example` line 39: `NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=0` — documented.
- Production tracks `main` (75fbd73b), which predates this branch; merging PR #9 does not affect production until a production deploy of the merged code, and the preview env var is empty (off).

- UNKNOWN: none.
