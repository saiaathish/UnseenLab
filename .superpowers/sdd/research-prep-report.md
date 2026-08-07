# Research Prep Report — Real Learner Session Kit, Redesigned Workspace

Status: **READY** (kit complete, awaiting human participant)
Date: 2026-08-07
Target: PR #20 preview head `917156a` — https://unseen-7cr4flzbr-sai-aathish-karthiks-projects.vercel.app (70/30 LessonRail workspace; NOT production main)

## Files changed

| File | Change |
|---|---|
| `validation-pack/facilitator-session-sheet.md` | Rewritten for the redesigned workspace: before-session checklist → deployed preview URL; session flow → rail (Predict → Interact → Observe → Explain → Complete) + `ⓘ About this model`; screenshot checklist → 70/30 layout, rail gating, completed-step persistence, About dialog; post questions retained (in-app form unchanged). Consent copy and honesty rule kept verbatim. |
| `validation-pack/participant-test-extension.md` | Updated to the redesign: old touchpoints remapped to rail steps / `ⓘ About this model`; "one-variable mode" adaptation step honestly marked absent; mandated task text kept verbatim. |
| `validation-pack/session-runbook-redesign.md` | NEW: 10-minute runbook — exact URL, consent read-aloud, single mandated task, rail observation grid, redesigned-UI-aware post questions (2–3), export step, closing status block "READY — awaiting participant. Nothing recorded yet." No made-up participant data. |
| `docs/closure-participant.md` | Status → "READY (kit) — awaiting human participant on the redesign preview (PR #20 head 917156a)"; dated 2026-08-07; blocker named (the human); 2026-08-05 record preserved as history. |

No `src/`, `e2e/`, `tests/`, or config files were touched. No engineering.

## Old-UI reference remapping (old → new)

| Old touchpoint (pre-redesign) | New location in the redesigned workspace |
|---|---|
| "Open the lab (recording ON)" → `/lab/nuclear-chain-reaction?research=1` | NOT used. That button still links to the legacy lab; in-app event capture is wired to the legacy `/lab` route only (code-verified). The redesign session starts at the homepage ask form → `/demos/[id]`; consent/pre/post/notes/export on `/research` work unchanged. Runbook states honestly that `interactionEvidence` in the export will typically be empty for the rail journey and must not be backfilled. |
| Trust "badge" on the demo | Trust chip in the header only (TrustBadge in demonstration-shell header, aria-label "Trust: <level>"). |
| Prediction prompt BEFORE controls unlock | Rail Predict step first; Continue gated until "Submit prediction". |
| Controls unlock after prediction | Rail Continue gating on the Interact step; step names the real control (e.g. "Move the Orbital speed slider."); unlocks only on real touch → "Interaction recorded.". |
| "Open the table representation" (Compare step) | LEFT representation tabs on `/demos/[id]` (`3D Model \| 2D Model \| Diagram \| Table \| Timeline \| Text sequence`); Table tab. |
| "Switch to one-variable mode" adaptation suggestion + "Held constant" labels | NOT present in the redesigned workspace (orbits showcase `adaptationContext.allowed: false`; no adaptation panel in the rail). Honest map: absent; rail's equivalent moment is the Interact gating. Extension no longer probes for it. |
| Trial log on the page | `ⓘ About this model` dialog → "Trial log" section; replay restores parameters honestly ("Restore these parameters" also on the Complete step — fresh run, labeled). |
| Visible save button | `ⓘ About this model` → Save status (DemoSaveControl): "Not saved" → guest "Saved on this device" / signed-in "Saved to your account". |
| "Built from the offline catalog" badge | Provenance inside `ⓘ About this model`: "Offline catalog" / "Curated engine (offline catalog)". |
| "Verified answer" grading label | Never present in the rail: Explain is self-assessed (engine: free text; conceptual: options; timeline: "I saw it"); no "Verified answer" label (verified in lesson-rail tests). |
| Concept question (nuclear chain reaction wording) | Topic-agnostic fixed question, unchanged: "What happens to the system when one thing changes?" (research-recorder.ts, verified). |

## Exact query phrase that yields the orbits showcase

The mandated task text itself, verbatim — **"Ask UnseenLab to help you
understand why planets remain in orbit."** — routes to the orbits showcase:
`routeQuery` scores it `engine:orbits` (keywords "planets" + "orbit", score 2,
not ambiguous), `matchShowcase` resolves it to orbits, and `interpret` yields
concept "Gravity & Orbits". Also confirmed: "why do planets stay in orbit"
routes identically. The 2026-08-05 wording discrepancy is resolved — no phrase
substitution is needed; the facilitator must use the mandated text verbatim.

## Verification steps (all read-only)

1. Read `src/demonstrations/generation/offline/router.ts` (orbits alias "solar system orbit"; scoring rules) and `src/demonstrations/spec/demo-spec.ts` (orbits keywords: "orbit", "planets", ...), `src/demonstrations/showcases/index.ts` (`SHOWCASE_QUERIES` incl. "Show why planets stay in orbit." and "orbit"), `src/demonstrations/generation/intent/route.ts` (interpret), `src/demonstrations/generation/intent/normalize.ts`.
2. Executed the actual router/showcase/interpret code via bun with a throwaway script outside the repo (`/tmp/verify-router.ts`, since removed): all four candidate phrases ("Ask UnseenLab to help you understand why planets remain in orbit.", "why do planets stay in orbit", "Show why planets stay in orbit.", "why planets remain in orbit") → `engine:orbits`, not ambiguous, showcase orbits, concept "Gravity & Orbits".
3. Read `tests/demonstrations/ui/lesson-rail.test.tsx` — confirmed rail step headings (Predict/Interact/Observe/Explain/Complete), gated "Continue", "Back never relocks", "Interaction recorded.", AboutThisModel dialog contents and save states ("Not saved" → "Saved on this device"), "Restore these parameters", "New concept" link.
4. Read `src/research/research-recorder.ts` + `src/components/research/research-session.tsx` + `src/app/research/page.tsx` — consent copy, pre/post fields, notes, export, clear; `useResearchRecorder` wired only in `src/components/lab/experiment-shell.tsx` (legacy lab); SessionCard "Open the lab (recording ON)" links to the legacy lab route.
5. Read `src/components/demonstrations/demonstration-shell.tsx` (TrustBadge in header), `representation-tabs.tsx` (LEFT tabs), `about-this-model.tsx` (provenance, save status, trial log), `demo-save-control.tsx` (device vs account save).
6. Live spot-check on the preview (Playwright, read-only): homepage loads with ask form "What topic do you need help with?" and footer link "Product research session"; `/research` consent gate renders the consent copy verbatim with "Agree and begin" / "Continue without research recording" and the "Everything stays on this device…" line.

## Honest status

READY — awaiting participant. Nothing recorded yet. No session has run: no
consent, pre/post answers, observations, quotes, screenshots, export, or
revision-log rows exist. The only blocker is the human participant (none is
available to this agent). All templates remain empty by design.
