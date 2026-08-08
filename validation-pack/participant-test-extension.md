# Participant test extension — generative demonstration engine (redesigned workspace)

Extends the overnight participant kit for the IncludAI Track 1 session. Run the
flagged experience (`NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1`) on the redesign
preview (PR #20 head `917156a`): https://unseen-7cr4flzbr-sai-aathish-karthiks-projects.vercel.app

**UI map (old touchpoints → redesigned workspace):** trust labels are now a
chip in the header only; prediction gating is now the LessonRail Continue gate;
the trial log, save status, and provenance live behind **ⓘ About this model**;
representation comparison uses the LEFT representation tabs
(`3D Model | 2D Model | Diagram | Table | Timeline | Text sequence`). The
"switch to one-variable mode" adaptation suggestion and "Held constant" labels
are NOT present in the redesigned workspace — do not probe for them.

## Core script (8–10 min, one learner)

1. **Ask** (mandated verbatim task — judge audit Gate 5/6): "Ask UnseenLab
   to help you understand why planets remain in orbit." → expect the orbits
   showcase ("Gravity & Orbits"; verified read-only: "planets" + "orbit" route
   to the `orbits` engine and match the orbits showcase), trust chip
   "Verified simulation" in the header, and the rail's **Predict** step FIRST,
   with Continue gated until the prediction is submitted.
2. **Predict** → submit → Continue unlocks → **Interact**: raise the speed
   slider → "Interaction recorded." → observe the orbit widen and the period
   grow (readouts live).
3. **Compare**: open the **Table** representation (LEFT tabs); compare your
   prediction with the observed period change.
4. **Rail honesty (replaces the old Adapt step)**: the redesigned workspace has
   no "switch to one-variable mode" suggestion. Watch instead whether the
   Interact step's Continue unlocks only after the REAL control is touched (a
   different control does not complete the step), and whether the Explain step
   feels honest (engine: free text, never graded; conceptual: self-assessed
   options, never graded, no "Verified answer" label).
5. **Second trial**: use **Back** (never relocks), change a different variable,
   and compare trials in the trial log behind **ⓘ About this model**; replay
   restores parameters honestly ("Restore these parameters" on the Complete
   step — fresh run, labeled).
6. **Save**: behind **ⓘ About this model** → Save status. Guest → "Saved on
   this device" (reload proves persistence); sign in → "Saved to your account"
   (reload + account list).
7. **Fallback honesty**: toggle the flag off / disconnect the model key → the
   ask flow still works from the offline catalog; provenance inside
   **ⓘ About this model** reads "Offline catalog" / "Curated engine (offline
   catalog)".

## Extended probes (if time)

- "Show me cells." → clarifying question, no silent guess.
- "Show how photosynthesis transfers energy." → conceptual demonstration,
   limitation visible, no numbers invented.
- "Show the stages of mitosis." → explanatory animation + text timeline.
- "Generate working reactor enrichment controls." → safe rejection, no spec.
- Screen-reader + keyboard-only: complete predict → interact → observe →
   explain → complete inside the accessible representation.
- 320 px width + 200% zoom on `/demos/<id>`: no horizontal scroll, controls
   usable.

## Recording

Note per probe: outcome, trust chip seen, whether the rail's Continue was gated
until the real interaction, whether the accessible equivalent was reachable,
any confusion. Do NOT fabricate: record only what the participant actually did
and said.

Additional Phase-7 capture fields (generative session):
- **Trust-chip interpretation**: in the participant's own words, what does
  "Verified simulation / Conceptual demonstration / Explanatory animation"
  mean to them? (Ask only if they comment on it; never coach.)
- **Rail-gating observation**: does Continue unlock only after real
  interaction? Does Back ever relock a completed step? (Record observed
  behavior only.)
- **Time to prediction**: elapsed wall-clock from task start to first
  prediction submit.

## Session→revision rule (judge's Gate 5/6)

After the session, implement EXACTLY ONE revision drawn from what the
participant actually did or said (record it first in
`validation-pack/revision-log.md` with the verbatim quote). No
pre-emptive changes before the session. The 3-minute generative demo
script is at `docs/demo-script-generative.md`.
