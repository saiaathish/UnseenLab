# UnseenLab — Parallel Validation Pack

> **RE-STAMPED on the final-hardening branch.** The pack was originally written against an
> older snapshot of the product (single-trial session, no LLM/AI in the build, several
> accessibility gaps). It has been corrected to match the current product: repeatable
> multi-trial loop, topic-input homepage, optional structured LLM provider behind `/api/adapt`
> with deterministic offline fallback, working text scale, OS reduced-motion support, focus-
> trapped replay dialog, WAI-ARIA tabs, no per-frame aria-live spam, and the `feedbackTiming`
> control removed. Each corrected file carries its own re-stamp note; stale statements that
> remain inside corrected files are explicitly marked as superseded or historical. User-testing
> claims are unchanged and honest: **no structured session has run; a real participant session
> is still required, and nothing in this pack fabricates results.**

Independent adversarial review, validation, and winning-evidence package for **UnseenLab**, the Track 1 ("AI for Learners Who Think Differently") hackathon entry. Produced by a parallel session that does **not** build or modify the product. This pack determines whether the implementation is scientifically coherent, technically real, accessible, safe, adaptively personalized, and demoable in three minutes — and whether it can win under the official rubric.

## Product under review

- **Name:** UnseenLab
- **Track:** Track 1 — AI for Learners Who Think Differently
- **Pitch:** UnseenLab lets students safely perform otherwise inaccessible STEM experiments while an adaptive AI engine changes how each experiment is represented, paced, and controlled according to the learner's demonstrated understanding.
- **Principle:** Adapt the tool to the student, not the student to the tool.
- **Initial scope:** one complete experiment — Conceptual Nuclear Chain Reaction (educational, simplified, fictionalized, dimensionless; explicitly not a reactor simulator or weapon-design tool).

### Confirmed design-participant facts (no inference beyond these)

~17 years old; high-school senior; disclosed ADHD; interested in engineering; aspiring mountain biker; took AP Physics 2; found Modern Physics difficult to fully understand; classroom demonstrations and lab showcases did not provide enough interactivity; interactivity and animation are important to him.

**Do not** infer that all ADHD learners prefer animation, that animation automatically improves learning, that the participant represents all neurodivergent students, that testing has occurred, or that the product has improved his performance.

### Official rubric (weights)

| Criterion | Weight |
|---|---|
| Impact on Neurodivergent Youth | 30% |
| Innovation in AI Application | 25% |
| Usability and Accessibility | 25% |
| Technical Execution | 10% |
| Presentation Quality | 10% |

## Severity scale

| Level | Meaning | Examples |
|---|---|---|
| **S0 — Disqualifying** | Kills the submission outright | Missing real neurodivergent-user involvement; fake simulation disguised as scientific behavior; fabricated user evidence; no safety boundary on a nuclear-content product |
| **S1 — Winner-blocking** | Survives, cannot win | AI adapts nothing meaningful; inaccessible primary controls; no documented user involvement; load-bearing network/API dependency |
| **S2 — Finalist-blocking** | Top-tier placement at risk | Science gaps, dead preferences, missing error states in the hero flow |
| **S3 — Important** | Should fix before submission | Broken mobile spacing, screen-reader spam, missing focus management in dialogs |
| **S4 — Polish** | Optional | Slight visual inconsistency, copy tone |

## Evidence-type taxonomy

Every file distinguishes between:

| Type | Label | Meaning |
|---|---|---|
| **SPEC-DERIVED** | "Expected" | A requirement this pack derives from the product specification — the product must be tested against it. |
| **INSPECTED** | "Inspected" | Verified in source code by this audit, with `file:line` citations. Source was read; tests were **not** executed by this audit. |
| **UNVERIFIED** | "UNVERIFIED" | Claimed or plausible but not yet evidenced. |
| **NOT YET INSPECTABLE** | "NOT YET INSPECTABLE" | Item is designed-for or absent from the current build; cannot be assessed. |

**Known audit limitation:** the pack reviews the build at commit `HEAD` of branch `audit/unseenlab-validation-pack` (worktree `UnseenLab-audit-worktree`). Unit/e2e test suites were reviewed conceptually, not executed, to respect parallel-session isolation. Vector files (JSON) are executable by a human or agent following `setup` steps; none of the pass/fail results have been stamped yet. **Re-stamp history:** on the final-hardening branch the pack was corrected against the current product (see header note); the vector files remain unstamped, and the current suite numbers are 166 unit/component tests across 17 files and 12 Playwright e2e tests across 4 specs.

## File index

| File | Purpose |
|---|---|
| `README.md` | This file: purpose, rubric, severity, evidence taxonomy, review order |
| `rubric-audit.md` | Per-criterion winner/finalist/bar standards + mandatory deployment/wrapper/novelty tests |
| `scientific-oracle.md` | The 18 conceptual invariants the simulation must preserve, with tests and risks |
| `scientific-test-vectors.json` | 26 executable science test vectors (SCI-xxx) |
| `adaptation-audit.md` | Whether adaptation is real, evidence-linked, learner-controlled, non-diagnosing |
| `adaptation-test-vectors.json` | 26 executable adaptation cases (ADAPT-xxx) |
| `accessibility-audit.md` | Concrete test plan: keyboard, focus, motion, screen reader, visual, cognitive, animation |
| `safety-abuse-cases.md` | 28 nuclear-content, product-abuse, and privacy abuse cases (SAFE-xxx) |
| `user-testing-protocol.md` | 15–20 min first session + 5–10 min follow-up with the design participant |
| `user-testing-session-sheet.md` | Printable session recording sheet (empty fields, no invented results) |
| `evidence-claims-register.md` | 20 claims with required/available evidence, allowed vs forbidden wording |
| `judge-question-bank.md` | 33 brutal judge questions with strong/weak answers and current status |
| `demo-script.md` | 2:45 three-minute demo script with honest placeholders |
| `demo-failure-script.md` | Fallback language for every live-demo failure + pre-demo checklists |
| `submission-evidence-checklist.md` | Submission requirements and common hackathon tells |
| `release-gates.md` | Gates A–E with owner, evidence, status, blocking defects, repair hours |
| `implementation-inspection.md` | Independent source inspection with `file:line` findings |
| `parallel-session-report.md` | Isolation record: repo, worktree, branch, what was and was not touched |

## Review order

1. `implementation-inspection.md` — what actually exists.
2. `release-gates.md` — the five binary release gates and their current status.
3. `scientific-oracle.md` + `scientific-test-vectors.json` — science first; nothing else matters if the science is fake.
4. `adaptation-audit.md` + `adaptation-test-vectors.json` — is the adaptation real?
5. `accessibility-audit.md` — can the learner operate it?
6. `safety-abuse-cases.md` — can it be abused into dangerous guidance?
7. `user-testing-protocol.md` + `user-testing-session-sheet.md` — run the sessions; then update `evidence-claims-register.md`.
8. `rubric-audit.md` — score against the rubric.
9. `judge-question-bank.md` — prepare defenses.
10. `demo-script.md` + `demo-failure-script.md` + `submission-evidence-checklist.md` — deliver.

## Conventions

- Test/vector IDs: `SCI-xxx`, `ADAPT-xxx`, `A11Y-xxx`, `SAFE-xxx`, `JUDGE-xx`, `CLAIM-xx`, `GATE A–E`.
- Every test states: Setup / Action / Expected result / Failure condition / Rubric impact / Severity.
- No invented data. Placeholders use brackets (`[X/3]`). Claims register is the single source of truth for what may be said publicly.
- The pack never modifies application source. All files live under `validation-pack/` in the isolated worktree.
