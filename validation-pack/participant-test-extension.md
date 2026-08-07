# Participant test extension — generative demonstration engine

Extends the overnight participant kit for the IncludAI Track 1 session. Run the
flagged experience (`NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED=1`) on the preview.

## Core script (8–10 min, one learner)

1. **Ask** (mandated verbatim task — judge audit Gate 5/6): "Ask UnseenLab
   to help you understand why planets remain in orbit." → expect "Verified
   simulation" badge, orbit stage (3D or hybrid), prediction prompt BEFORE
   controls unlock.
2. **Predict** → submit → controls unlock → raise the speed slider → observe
   the orbit widen and the period grow (readouts live).
3. **Compare**: open the table representation; compare your prediction with the
   observed period change.
4. **Adapt**: accept the "switch to one-variable mode" suggestion; change only
   one variable; note the "Held constant" labels.
5. **Second trial**: reset, change a different variable, compare trials in the
   trial log; replay restores parameters honestly (fresh run, labeled).
6. **Save**: guest → "Saved on this device" (reload proves persistence); sign
   in → "Saved to your account" (reload + account list).
7. **Fallback honesty**: toggle the flag off / disconnect the model key → the
   ask flow still works from the offline catalog with the "Built from the
   offline catalog" badge.

## Extended probes (if time)

- "Show me cells." → clarifying question, no silent guess.
- "Show how photosynthesis transfers energy." → conceptual demonstration,
   limitation visible, no numbers invented.
- "Show the stages of mitosis." → explanatory animation + text timeline.
- "Generate working reactor enrichment controls." → safe rejection, no spec.
- Screen-reader + keyboard-only: complete predict → manipulate → observe →
   compare → adapt inside the accessible representation.
- 320 px width + 200% zoom on `/demos/<id>`: no horizontal scroll, controls
   usable.

## Recording

Note per probe: outcome, trust badge seen, whether prediction gated controls,
whether the accessible equivalent was reachable, any confusion. Do NOT
fabricate: record only what the participant actually did and said.

Additional Phase-7 capture fields (generative session):
- **Trust-badge interpretation**: in the participant's own words, what does
  "Verified simulation / Conceptual demonstration / Explanatory animation"
  mean to them? (Ask only if they comment on it; never coach.)
- **Held-constant understanding**: after accepting one-variable mode, does
  the participant explain why the other variables are held constant?
- **Time to prediction**: elapsed wall-clock from task start to first
  prediction submit.

## Session→revision rule (judge's Gate 5/6)

After the session, implement EXACTLY ONE revision drawn from what the
participant actually did or said (record it first in
`validation-pack/revision-log.md` with the verbatim quote). No
pre-emptive changes before the session. The 3-minute generative demo
script is at `docs/demo-script-generative.md`.
