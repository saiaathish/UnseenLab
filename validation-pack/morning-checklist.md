# UnseenLab — Morning-of-Deadline Checklist

**When:** the morning of submission day, before the deadline. **Owner:** the human team (this
checklist is the runbook; a second person re-checks every box).

**Honesty rule:** every box below that produces evidence (participant session, video, screenshots,
test run, deployment) must produce a real artifact stored in the repo or the submission. If an
item cannot be completed, mark it NOT DONE and adjust `docs/claim-register.md` and
`validation-pack/overnight-score-audit.md` accordingly — never backfill.

Order matters: participant session first (it is the only human evidence and the only thing that
cannot be re-run at the last minute), then artifacts, then deployment, then the final gates.

---

## 0. Pre-flight (before the participant arrives)

- [ ] `npm run dev` verified on the demo machine: `http://localhost:3000` loads the lab.
- [ ] Fresh session: clear `localStorage` (`unseenlab.preferences.v1`, `unseenlab.evidence.v1`,
      `unseenlab.workflow.v1`, `unseenlab.session-id.v1`, `unseenlab.onboarding-draft.v1`,
      `unseenlab.imported-session-id.v1`).
- [ ] Seed confirmed at 42 ("Show advanced: randomness seed" in the variables panel).
- [ ] Printed session sheet ready: `validation-pack/user-testing-session-sheet.md` (blank fields).
- [ ] Protocol re-read: `validation-pack/user-testing-protocol.md` (Parts A–E, timing budget
      15–20 min). Ground rule: no coaching during Part C except for product defects.
- [ ] Consent wording ready (protocol Part A): anonymity, stop rule, no identifying info recorded.

## 1. Participant session (the ONLY human evidence — do first)

Follow `docs/user-testing-kit.md` + `validation-pack/user-testing-protocol.md` exactly:

1. [ ] **Consent** — record Y/N and what was agreed (session sheet top). No quotes/observations
       without it.
2. [ ] **Pre (baseline)** — Part B: 3 conceptual questions (B1–B3), each with answer (verbatim),
       confidence 1–5, mental effort 1–5. Also fill Research mode → "Before you used the lab"
       (pre-confidence, pre-effort) in-app.
3. [ ] **Task (independent use)** — Part C (8 min, observe only): handoff script verbatim;
       observation checklist C1–C10; interaction events log with timestamps. Note which
       adaptation types appear and the accept/reject/modify decision. The multi-trial loop is
       part of the task — invite a second trial if time allows.
4. [ ] **Post** — Part D: re-ask B1–B3 (same wording); the eight verbatim questions; the direct
       quote ("Is there one thing you'd want the builders to hear?"). Fill Research mode →
       "After you used the lab" (post-confidence, post-effort, "What became clearer?",
       "What remained confusing?", "What should we remove or change?").
5. [ ] **Export** — Research mode → "Export anonymous session data (JSON)" → save
       `unseenlab-session.json` into `validation-pack/backups/` (labeled "Initial design case
       study evidence. Not a statistically validated learning study.").
6. [ ] **Session sheet completed** — every field filled or explicitly left blank/UNVERIFIED
       (no invented entries); participant comfortable at end; sign-off rows checked.
7. [ ] **Builder decision (Part E)** — ONE feedback-driven revision chosen (change / preserve /
       cut) with a one-line rationale; if it deviates from the participant's request, record the
       mismatch. This is the single most impactful claim for the Impact criterion
       (`validation-pack/evidence-claims-register.md` CLAIM-20).
8. [ ] **Record results** — fill `docs/user-research.md` "First structured product test"
       template (test date, observed friction, direct quote, feature removed/changed,
       second-test field) and the consent line.
9. [ ] **Implement the revision** (if time allows and it is code-sized) and log it in the design
       revision table (`docs/user-research.md:24-30`) with source = session.
10. [ ] **Update the claim register** — `docs/claim-register.md` C-15 and
       `validation-pack/evidence-claims-register.md` CLAIM-07/17/18/19/20 move from NOT_YET/
       UNVERIFIED ONLY with real data. Until then, nothing human-outcome is claimable.

## 2. Artifacts

- [ ] **Screenshots** — capture the full deck per `docs/screenshot-inventory.md` (S01–S35) into
      `validation-pack/backups/screenshots/`; guest shots first, then signed-in, then deployment.
- [ ] **Video** — record the 3-minute demo per `docs/demo-script-final.md` (target 2:45;
      hard stop ≤3:00): segments at 0:20 / 0:35 / 1:25 / 2:00 / 2:25 / 2:55; both mandated pitch
      lines verbatim; placeholder impact block (never invented numbers).
- [ ] **Backup video** — second recording, different method/format
      (`validation-pack/demo-failure-script.md` backup checklist), plus the screenshot deck as
      the last-resort fallback.
- [ ] **Recorded hero-flow backup files** verified playable: `hero-flow.mp4`, `hero-flow-offline.mp4`,
      `unseenlab-session.json` sample.

## 3. Claim register final pass

- [ ] Re-read `docs/claim-register.md`: every sentence to be used in Devpost/video/pitch traces
      to a VERIFIED or PARTIAL row; PARTIAL rows state their missing part; NOT_YET rows are only
      described as scheduled work.
- [ ] Grep all submission text for forbidden wordings (see `docs/demo-script-final.md` "Words to
      never say": "proven to improve learning", "ADHD mode", invented numbers, "validated").
- [ ] If the participant session ran: update statuses in place (C-15 and any claims the session
      now supports) — do it immediately after the session, not at submission time.

## 4. Score audit

- [ ] Re-run `validation-pack/overnight-score-audit.md`: fill the "post-participant projected"
      column with the actual session outcome; recompute the composite; the summary must remain
      conservative and explicit that human-evidence points are only claimed where the session
      produced them.

## 5. Deploy check (Vercel + Firebase) — verify, and add if missing

- [ ] **Vercel project env vars** — confirm ALL of the following exist in the Vercel project
      settings (Production + Preview as appropriate). **If not present, add them now** (from
      `.env` / `.env.local` on the dev machine; never commit them):
      - `NEXT_PUBLIC_FIREBASE_API_KEY` (browser-safe, from Firebase web app config)
      - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
      - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
      - `NEXT_PUBLIC_FIREBASE_APP_ID`
      - `FIREBASE_SERVICE_ACCOUNT` (server-only service-account JSON, one line)
      - `MONGODB_URI` (server-only connection string with credentials)
      - Optional: `MONGODB_DB` (default `unseenlab`); `NEXT_PUBLIC_LLM_ENABLED` + `LLM_API_KEY`
        only if the hosted-model beat is in the demo (default: leave off, badge reads
        "Offline rules").
      - Note: `NEXT_PUBLIC_*` values are baked at build time — a change requires a redeploy.
- [ ] **Redeploy** the current `feature/overnight-90-readiness` commit after env changes; verify
      the deployed build works.
- [ ] **Firebase authorized domains** — Firebase console → Authentication → Settings →
      Authorized domains: confirm `unseen-lab.vercel.app` (and `localhost`) are listed. A popup
      from an unlisted origin is silently blocked; no wildcards allowed
      (`docs/firebase-mongodb-setup.md` §1.3).
- [ ] **Signed-in smoke on the deployed URL** — real Google popup completes → onboarding →
      dashboard → save a session → resume. (If this fails, fall back to the guest-only demo and
      the seeded-cookie e2e path; do NOT claim deployed sign-in.)
- [ ] **Repository public** — the GitHub repo is public, opens logged-out, README renders.
- [ ] **Mongo reachable from Vercel** — Atlas network access allows Vercel egress (or the URI
      uses a cluster with open access for the demo window); verify one signed-in dashboard load.

## 6. Last full test run (record the output)

Run and record the output of every command (paste into a `validation-pack/` run-log file or the
submission notes):

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm test` — record the exact count; **reconcile README's 302 unit/component (29 files)
      with the coordinator-verified 363+** (see `docs/evidence-inventory.md` §1); the recorded
      output is the submission artifact
- [ ] `npm run test:e2e` — record the count; note that `e2e/cross-device-resume.spec.ts`
      self-skips without `CROSS_DEVICE_E2E=1`; if credentials are available, run it once with
      the flag per `docs/firebase-mongodb-setup.md` §6
- [ ] `npm run build` — green; then `node scripts/bundle-secret-scan.mjs` — expect `CLEAN`
- [ ] (Optional) `node scripts/backend-integration.mjs` against the running build — expect 15/15
      (already recorded 15/15 twice on 2026-08-04, `docs/backend-verification.md`)

## 7. Final gates (one human re-checks each)

- [ ] Video ≤ 3:00, plays on a fresh machine, English (or subtitled).
- [ ] Deployed URL opens logged-out and the guest lab flow works there.
- [ ] No claim in any submission artifact is unsupported (claim register pass, §3).
- [ ] Safety disclaimer visible in the demo (lab header, all densities).
- [ ] Devpost form dry-run with a second person; every required field filled.
- [ ] Submission submitted before the deadline; URL and video link recorded.

---

## If something cannot be done (fallback ladder)

| Blocked item | Fallback (honest) |
|---|---|
| Participant session cannot run | Keep all human-outcome claims NOT_YET; demo shows the placeholder block; Impact rests on the confirmed design-participant story (`docs/claim-register.md` C-14) — still honest, still claimable as design input, never as a result |
| Deployed sign-in fails | Guest-only demo; say the F2 line from `docs/demo-script-final.md`; technical evidence rests on `docs/backend-verification.md` (15/15) + the cross-device e2e if it ran |
| Video cannot be recorded | Screenshot deck walkthrough + live demo at judging; Presentation criterion scores accordingly (see `validation-pack/overnight-score-audit.md`) |
| axe/accessibility manual pass not done | Say "implemented and test-covered; manual assistive-tech verification pending" — never "fully WCAG compliant" |
| `docs/ai-benchmark.md` still missing | Quote only the mechanism (timeouts, schema, fallback) and mark metrics NOT YET (judge bank Q9) — flag to coordinator |
