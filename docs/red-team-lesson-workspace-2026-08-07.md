# Red-Team Critique — Demo Lesson Workspace (2026-08-07)

**Source:** strict judge audit of the generative-demonstration lesson page
(screenshot-based, `feature/generative-demonstration-engine`).
**Status:** evidence for `docs/redesign-lesson-workspace.md`; verdicts below are
frozen inputs to that program.

## Verdict

> The current screen is still a dashboard pretending to be a learning tool.
> The 3D view is semantically worse than the 2D view: it turns arrows into
> floating objects, changes the spatial relationships, overlaps labels, and
> makes the learner decode the renderer before they can learn the concept.

Rubric placement (current → after redesign):

| Criterion | Current | After redesign |
| --- | --- | --- |
| Impact — 30% | Finalist potential | Finalist |
| AI Innovation — 25% | Finalist | Finalist |
| Usability & Accessibility — 25% | Meets Bar | Winner-range potential |
| Technical Execution — 10% | Finalist | Finalist/Winner |
| Presentation — 10% | Meets Bar | Finalist/Winner |

Weakest axis: **Usability & Accessibility**.

## Red-pen findings (verbatim contract inputs)

1. The page throws title, description, trust level, source, save state,
   Explore/See/Guide, 3D stage, legend, controls, prediction result,
   observation checklist, notes, trial log, provenance, limitations at the
   learner simultaneously. Developer-facing observability leaks into the
   learning experience.
2. First 60 seconds should be: open lesson → understand what you are looking
   at → answer one question → interact with model → observe result → answer
   next question. Nothing else.
3. 2D says "Cause A → Effect B → Effect C ┤ Inhibited D". 3D must say the
   exact same thing at a glance. `Ar1`/`Ar2`/`Ar3`, detached labels, floating
   arrows, and spheres create a second visual language. Kill it.
4. 3D must not be mandatory just because a 3D renderer was built. For causal
   graphs a clean 2.5D graph may be the better product. Full 3D is for
   orbit/molecules/fields/waves/geometry — where depth encodes meaning.
5. Lesson mechanics, not dashboard: right side is a state machine
   `predict → interact → observe → explain → done`. One question/instruction
   per step; answer required before Continue; interaction steps unlock only
   after the interaction actually happens; Back always available; forward only
   after completion; completed steps persist (backwards never relocks).
6. Provenance/limitations/trust stay honest but demoted: one small trust chip
   ("Conceptual" / "Verified simulation"), `ⓘ` opens "About this model".
7. Canonical graph shared by both renderers: same `nodes[]`/`edges[]`, same
   topology, labels, arrow directions, inhibition meaning, selection state.
   3D = alternate projection, never an alternate interpretation.
8. 3D edge semantics: arrows are edges never nodes; arrowhead attaches to the
   destination; inhibition uses a bar ending (`—|`); labels locked above nodes
   and always face the camera; default camera orthographic or
   near-orthographic; rotation heavily restricted.
9. Interaction: click Cause A → A highlights → outgoing edge lights up → B
   responds → C responds → D visibly changes. Hover/click an edge → dim
   everything except that causal path.
10. View controls: "Explore / See / Guide" is vague → use "Model | Diagram"
    or "3D | Diagram".
11. Winning edge (technical sentence to defend): "The AI can compose the
    lesson, but the diagram, simulation state, interactions, and assessment
    all resolve against the same bounded canonical model."

## Judge Q&A (defense prep)

1. "Why is this in 3D?" — for concepts without meaningful depth, default to
   Diagram/2.5D; 3D only where depth encodes meaning.
2. "How do 2D and 3D not teach contradictions?" — both are projections of the
   same canonical graph/state, never independently generated scenes.
3. "What stops random clicking?" — prediction-first gating + sequential
   lesson states + interaction completion conditions.
4. "Chatbot beside PhET?" — lesson sequence, controls, representation and
   observation tasks are composed around the requested concept; scientific
   behavior remains engine-owned.
5. "Why show provenance during learning?" — demoted, not deleted; trust stays
   one click away.
