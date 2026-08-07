# Closure Video Readiness — AGENT 12 (Three-Minute Demo Director)

Verified 2026-08-05 against `docs/demo-script-generative.md` (full read),
`docs/demo-script-final.md` (full read), `validation-pack/demo-failure-script.md`
(full read). Read-only audit; no fabrication. Recording is NOT possible in this
environment — readiness only.

## CORRECTION 2026-08-05 (post-review, Executive Director)

The findings below were captured against the script's earlier 7-beat draft.
`docs/demo-script-generative.md` was then corrected (doc-truth correction,
feature freeze respected — no product code touched) and re-scored:

- Beat structure: NOW the mandated 11-beat structure verbatim (0:00–0:18 …
  2:50–3:00), timings sum to exactly 180 s; the two previously missing
  timed beats — "revised prediction + replay" (2:05–2:20) and "participant
  evidence and revision" (2:37–2:50, with exact no-session fallback
  language) — are now explicit.
- Mandated pitch verbatim: NOW PRESENT in the script's Required pitch block:
  "UnseenLab lets AI compose the learning experience, but never lets AI
  invent the science." (alternate honest phrasing retained below it).
- Fallback lines: model=YES slow=YES webgl=YES mongo=YES firebase=YES
  no-participant=YES refresh=YES (exact language in the script's
  "Fallback lines" section).
- Path note: `demo-failure-script.md` lives at `validation-pack/` (repo
  root) — confirmed.
- Remaining blockers unchanged: human video recording; the participant
  session (Gate 5/6) before the 2:37–2:50 beat can be filmed.

## VIDEO READINESS (original A12 findings, pre-correction)

- Script: docs/demo-script-generative.md | beats: 7 | total runtime: 180 s | ≤3:00: YES
- Mandated pitch verbatim: NO
- Forbidden claims found: NONE
- Fallback lines: model=y slow=n webgl=n mongo=n firebase=n no-participant=n refresh=y
- Orbit verified-sequence: YES | Photosynthesis conceptual: YES
- Final video: NOT_COMPLETE (no recording possible in this environment)
- Blocker: human recording + participant section

## Detailed findings

### 1. Beat structure

The script declares its own 7-beat structure (header lines 12-16), NOT the
11-beat mandated structure supplied to this agent:

| Script beat (declared) | Duration | Sum |
|---|---|---|
| 1. 0:00-0:20 problem (types "Show why planets stay in orbit") | 20 s | 20 |
| 2. 0:20-0:35 solution + honest pitch (Generate demonstration) | 15 s | 35 |
| 3. 0:35-1:25 verified demo (orbits: verified badge, prediction gate, Orbital speed, table, optional 3D) | 50 s | 85 |
| 4. 1:25-2:00 conceptual demos (photosynthesis, then mitosis) | 35 s | 120 |
| 5. 2:00-2:25 AI boundary (escalation impossible, rejection) | 25 s | 145 |
| 6. 2:25-2:55 impact honesty + save (guest/account, reload restores) | 30 s | 175 |
| 7. 2:55-3:00 closing claim | 5 s | 180 |

Declared total = 180 s = 3:00 wall clock (2:45 spoken + ~15 s interaction
latency, line 10). Sum of the mandated 11-beat structure from the brief
(18+14+16+17+25+18+17+15+17+13+10) = 180 s. Both fit 3:00.

DISCREPANCY: the script's timed beats do not match the mandated 11-beat map.
Covered in-script (content mapped to different timestamps): learner problem,
orbital ask, hosted composition + trust label, prediction gate, launch-speed
manipulation, 3D/2D/table canonical agreement, bounded adaptation, conceptual
photosynthesis, closing claim. MISSING as timed beats: "revised prediction +
replay" (2:05-2:20) and "participant evidence and revision" (2:37-2:50) —
the latter appears only as a recording note (lines 105-107: participant
revision happens AFTER the session, exactly one revision, logged in
`validation-pack/revision-log.md`), never as a spoken beat. The script header
labels its own 7-beat order "Mandated beats (do not reorder)", which conflicts
with the mandated structure in this brief. Needs a human call on which
structure governs the final cut.

### 2. Pitch lines

- Mandated verbatim "UnseenLab lets AI compose the learning experience, but
  never lets AI invent the science." — NOT present in
  `docs/demo-script-generative.md` and NOT found anywhere in `docs/` or
  `validation-pack/` (grep verified). The script's own mandated pitch is the
  honest-pitch phrasing (line 21-22):
  "AI composes and personalizes a validated interactive experience from
  trusted engines and primitives — it never invents the science." (echoed in
  Beat 5). The closing claim (line 86) is a different sentence: "The AI
  composes the path to the science — the science stays the science."
- Verdict: mandated verbatim line ABSENT; honest-pitch phrasing PRESENT.

### 3. Forbidden claims scan

Scanned for: instant generation, universal science coverage, AI-generated
equations, statistically proven learning gains, validated by many users, all
demonstrations are simulations, zero hallucinations, perfect accuracy,
production scale. NONE found. Adjacent claims checked:
- "0 fallbacks" (facts table line 94) is a 29/29 benchmark result on hosted
  spec generation, not a hallucination claim.
- "p50 10.9 s" is an honest latency figure — no "instant" language.
- Beat 3 explicitly denies model-written numbers: "it's an engine readout,
  not a number the model wrote."
- Verified/Conceptual/Explanatory badge contrast (Beat 4) explicitly denies
  "all demonstrations are simulations".
- No user-count or learning-gain claims; participant revision deferred to
  post-session per lines 105-107.

### 4. Fallback language (scored against the generative video script)

- model=y — recording note (lines 104-105): offline fallback beat, ask again
  with the flag off → "Built from the offline catalog" badge.
- slow=n — no spoken fallback for slow generation; Beat 3 only notes "Summary
  card appears (~10 s)". (demo-script-final.md F5 covers slow network for the
  nuclear lab; the closest generation-side latency buffer is the 0:35-1:25
  window, line 40.)
- webgl=n — no scripted spoken line in any of the three scripts. WebGL failure
  handling exists only as engineering docs (`docs/3d-renderer.md`:
  webglcontextlost/restored, onError webgl_unavailable;
  `docs/accessibility-equivalents.md`: accessible_diagram fallback when
  engine/WebGL cannot start).
- mongo=n — not in the generative script. demo-script-final.md F3 has the
  verbatim line ("Couldn't sync — your work is safe on this device").
- firebase=n — not in the generative script. demo-script-final.md F2 has the
  verbatim line (guest-continuation recovery).
- no-participant=n — the generative script has no participant-evidence beat
  and no placeholder/fallback line; the mandated 2:37-2:50 participant beat is
  absent from the timed script. Placeholder block exists in
  `demo-script-final.md` (Segment 6) and failure mode 9 of
  `validation-pack/demo-failure-script.md` ("User evidence is incomplete").
- refresh=y — Beat 6 (line 80): "A reload restores it — verified." (also F6 in
  demo-script-final.md).

### 5. Verified simulation / conceptual labels

- Orbit sequence uses the VERIFIED simulation: Beat 3 points at the
  "Verified simulation" badge and "Generated by the demonstration model"
  source badge; Period readout (115.4 s → 180.0 s) is engine-owned; table
  shows the same engine value; 3D view driven by same engine state (optional).
- Photosynthesis is labeled CONCEPTUAL: Beat 4 points at the "Conceptual
  demonstration" badge and the "no numbers invented" limitation line.

### 6. Alternative scripts

- `docs/demo-script-final.md` — EXISTS (read; FINAL submission script for
  Track 1 nuclear-chain-reaction lab, 3:00, mandated structure 0:00-0:20 →
  0:35-1:25 hero flow → 2:55-3:00 closing, its own mandated pitch "AI never
  changes the science. It changes how the learner reaches the science.").
- `docs/validation-pack/demo-failure-script.md` — DOES NOT EXIST at that
  path. The failure script lives at `validation-pack/demo-failure-script.md`
  (repo root, re-stamped on the final-hardening branch; 10 failure modes:
  app not load, animation freeze, adaptation missing, counterfactual fail,
  localStorage fail, graph fail, network down, video playback fail, user
  evidence incomplete, hosted model down/garbage; plus seeded-state
  checklists). Path must be corrected in any doc referencing it.

## Blocker

1. Human recording of the 3:00 video (no recording possible in this
   environment; backups listed as `validation-pack/backups/hero-flow.mp4` etc.
   are for the OTHER track's script).
2. Participant section: the mandated 2:37-2:50 participant-evidence-and-
   revision beat is not in the generative script's timed beats, and its
   revision is deferred until after the session — needs the participant
   session (Gate 5/6) before that beat can be filmed.
3. Beat-structure discrepancy (7-beat script vs 11-beat mandate) and the
   absent mandated pitch verbatim need a human decision before the final cut.
