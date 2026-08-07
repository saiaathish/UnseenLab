# Lesson Workspace Redesign — Program (2026-08-07)

**Status:** IN EXECUTION, consecutive firm dispatch.
**Branch:** `feature/generative-demonstration-engine` (draft PR #9 — NOT merged;
this work lands on the same branch).
**Evidence:** `docs/red-team-lesson-workspace-2026-08-07.md` (judge critique —
frozen input).
**Gate rule:** every implementation assignment must leave the repo green:
`npm run typecheck` → `npm run lint` → `npm test` → `npm run build`, plus
touching tests updated. No assignment may modify files owned by another
assignment (single-writer per file). The `demo-spec.ts` contract itself should
NOT change unless a change is unavoidable — the canonical graph already exists
in the spec (`scene3d.objects` + `scene3d.relationships` with `causes |
activates | inhibits | …` types); the work is making every surface render THAT
graph.

## Frozen UX contract

1. **70/30 workspace.** Left column (≈70%): the model only — stage/diagram
   plus minimal playback controls. Right column (≈30%): the sequential lesson
   rail. Mobile: model first, rail below; never a crushed three-column layout.
2. **Lesson rail state machine:** `predict → interact → observe → explain →
   complete`. One instruction/question per step. Back always available;
   Continue gated on completion of the current step; completed steps persist —
   going backward never relocks them. The rail is Duolingo lesson *mechanics*,
   not Duolingo styling.
   - predict: one question, answer required before Continue (existing
     prediction gate; `correctIndex` grading only where the engine owns truth).
   - interact: one instruction referencing a REAL model object/control
     (e.g. "Remove Cause A"). Completes only when that object has actually
     been manipulated (event-driven completion, not a timer).
   - observe: "Which effects changed?" — one answer.
   - explain: "Why did D change though A never connected directly to D?" —
     selectable explanation; learner-self-assessed for conceptual demos
     (matches existing trust model; no invented grading).
   - complete: tiny recap, replay or new concept.
3. **Provenance demoted, never deleted.** One small trust chip near the title
   ("Conceptual" / "Verified simulation"). An `ⓘ` opens "About this model"
   with source, provenance, limitations, save status. CUT from the primary
   workspace: top-right Save button, "Offline catalog" badge, trial log,
   adaptation-suggestion card, standalone observation card, visible
   limitations list, separate Guide tab, relationship-legend duplication,
   giant Controls card.
4. **View controls** renamed to Model/Diagram language ("3D | Diagram",
   "Model | Diagram") — no "Explore / See / Guide" vagueness.
5. **Canonical graph invariant (semantic mirror).** `nodes` = scene objects
   (labels attach to nodes, never standalone floating objects); `edges` =
   `scene3d.relationships` (typed: causes | activates | inhibits | …). Arrows
   are EDGES, never objects. The 2D diagram, the 3D stage, and the lesson rail
   all resolve against the same canonical graph. Lesson copy references model
   IDs literally: "Cause A" is the same node the renderer owns.
6. **3D semantic rules (where a 3D surface exists):** arrowhead attaches to
   the destination; `inhibits` ends in a bar (`—|`); labels stay locked above
   nodes and always face the camera; default camera orthographic or
   near-orthographic; rotation heavily restricted. No decorative objects
   (floating `arrow` primitives, detached labels). Click node → node
   highlights → outgoing edge lights up → downstream nodes respond in order;
   hover/click an edge → everything outside that causal path dims.
7. **2D diagram parity:** the accessible SVG diagram renders ONLY the
   canonical graph (nodes + relationship edges); decorative arrow/process-edge
   objects must not appear as shapes.
8. **Templates:** `template-builder.ts` conceptual scenes stop emitting
   standalone `arrow`/`process_edge` objects (e.g. `ar1`/`ar2`/`ar3` in
   `cause_effect_network`, `ar1` in `energy_transfer`); edges derive from
   `relationships`. Scene node labels/positions stay unchanged so 2D/3D agree.

## Firm assignments (consecutive, disjoint file ownership)

Dispatched one at a time, in order. Each agent uses its saved profile as
`subagent_type` (never general-purpose). Each writes its report to
`.superpowers/sdd/<assignment>-report.md` and returns only status + commit
range + test summary + concerns.

| # | Saved profile | Files (exclusive ownership) | Deliverable |
| --- | --- | --- | --- |
| A1 | `canonical-state-architect` | `src/demonstrations/generation/offline/template-builder.ts`; `src/demonstrations/renderers/primitive-3d/**` (types, scene-graph, operators, renderer, index); `src/components/demonstrations/demonstration-stage.tsx` (renderer↔React adapter: interaction event surface); `src/components/demonstrations/accessible-representation.tsx`; tests covering those modules | Canonical graph invariant: templates emit nodes+relationships only; 3D derives edges from relationships (arrowheads at destination, `—|` for inhibits, camera-facing labels above nodes, near-orthographic default, clamped rotation); 2D diagram shows only nodes + relationship edges; node-click edge-path highlight/dim interaction exposed via an event surface the rail (A2) consumes |
| A2 | `demo-presentation-director` | `src/components/demonstrations/demonstration-shell.tsx`, `demonstration-page.tsx`, `lesson-rail.tsx` (new), `about-this-model.tsx` (new), `trust-badge.tsx`, `demo-limitations.tsx`, `demo-save-control.tsx`, `prediction-panel.tsx`, `observation-panel.tsx`, `adaptation-panel.tsx`; `tests/demonstrations/ui/demonstration-shell.test.tsx` + new rail tests | 70/30 shell; lesson rail state machine with completion gating + persisted completion; provenance demoted to chip + `ⓘ`; observability cut from primary workspace; rail consumes renderer interaction events (A1 contract) |
| A3 | `evidence-revision-engineer` | `src/demonstrations/showcases/orbits/build-spec.ts`, `electric-fields/build-spec.ts`, `wave-interference/build-spec.ts`; `src/demonstrations/generation/offline/engine-builder.ts`; any tests covering those labels | View-control labels → Model/Diagram language; no behavior change |
| A4 | `accessibility-device-qa` | Read-only audit of the new workspace + fixes ONLY within A1/A2-owned files (allowed to modify, since it runs after them); new `tests/demonstrations/ui/lesson-rail-a11y.test.tsx` | Keyboard order, focus management (Continue focus after step), aria-live announcements, contrast, reduced motion, screen-reader flow through rail |
| A5 | `browser-e2e-engineer` | New `e2e/demo-lesson-rail.spec.ts` (feature-flag-on), plus minimal edits to existing e2e specs only if the redesign breaks them | Browser verification: 70/30 layout, rail gating, interaction completion, persisted completion on back-nav, provenance demoted |
| A6 | `pr-documentation-editor` | `validation-pack/claim-register.md`, `validation-pack/evidence-claims-register.md`, `docs/redesign-lesson-workspace.md` (status section), PR description | Claims updated to match implemented reality; no new unverified claims |
| A7 | `independent-red-team` | read-only; writes `.superpowers/sdd/red-team-report.md` only | Hostile review of the full branch diff against the frozen contract; no code changes |
| A8 | `final-integration-engineer` | integration only (resolves cross-assignment conflicts, runs final gates, fixes only what gates require) | Final gate run + merge verdict |

## Verification gates (run after A1, A2, A3, A5, A8)

1. `npm run typecheck` && `npm run lint` && `npm test` && `npm run build`
2. `npx playwright test` (guest build; `cross-device-resume` self-skips)
3. `node browser-verify.mjs` (lab smoke, must stay green)
4. Feature-flag-on browser smoke of the redesigned lesson page

## Honest limitations (must stay documented)

- The rail's `explain` step for conceptual demos (L2/L3) is learner
  self-assessment — there is no engine-owned truth to grade against; only
  curated-engine predictions keep `correctIndex` grading.
- Live-model end-to-end remains a preview gate (unchanged from prior
  programs); this program only changes UI/rendering, not the pipeline.
- 3D remains one surface among several; the diagram view is the default for
  causal graphs where depth adds no meaning.
