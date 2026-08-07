# Canonical State Proof — FINAL (Phase 5, persistence column)

**UNSEENLAB ONE-SHOT 90-READINESS PROGRAM — Canonical State Architect.**

Every learner control modifies exactly ONE canonical engine state field; every
surface (3D stage, 2D stage, readouts/table/graph, replay) reads THAT field;
and the trial parameter snapshot round-trips through demo-store device/cloud
persistence back into the engine. Verified for the three showcase families:
orbital mechanics (`showcase-orbits`), electric fields
(`showcase-electric-fields`), wave interference (`showcase-wave-interference`).

Supersedes `docs/canonical-state-proof.md` (17-control matrix, F1–F3 fixed).
Status: **PROVEN**.

---

## 1. Canonical-state architecture (one field per control)

- The lumina-2d engine module owns ALL scientific state: `params`, `bodies`,
  `charges`, `u` (`src/demonstrations/renderers/lumina-2d/engines/{orbits,charges,waves}.ts`).
- The runner is a pure owner of canvas/time; it forwards parameter writes via
  `setParam` (`runner.ts:293-295`) and emits `getVisualState()` at ~15 Hz
  (`runner.ts:251-262`, `VISUAL_STATE_INTERVAL` `runner.ts:28`).
- The page holds exactly ONE lifted copy of the canonical state
  (`parameters`, `readouts`, `visualState` — `demonstration-page.tsx:219-230`)
  and forwards it to every surface (`demonstration-page.tsx:358-405`).
- The curated mapping (`src/demonstrations/showcases/coupling.ts:77-101`) is
  the only bridge from 3D scene object ids to engine body keys / grid
  sentinels; the 3D renderer consumes it read-only (body override
  `renderer.ts:1095-1101` inside `applyTransforms` `renderer.ts:1086-1110`,
  `applyEngineSurface` `renderer.ts:1198-1224`, `applyEngineField`
  `renderer.ts:1228-1261`).
- Engine-owned objects skip position operators so operator animation can never
  diverge from canonical state (`renderer.ts:1062-1065`).
- Persistence: the trial parameter snapshot is the ONLY persisted scientific
  state; it round-trips through demo-store and re-enters the engine through
  the exact same `setParam` path as live manipulation.

## 2. FINAL Control → Canonical field → Engine → 3D → 2D → Readout → Replay → Persistence matrix (17 controls)

Legend (all under `src/` unless noted): `orbits.ts` =
renderers/lumina-2d/engines/orbits.ts, `charges.ts` = .../charges.ts,
`waves.ts` = .../waves.ts, `coupling.ts` = showcases/coupling.ts,
`runner.ts` = renderers/lumina-2d/runner.ts, `renderer.ts` =
renderers/primitive-3d/renderer.ts, `demo-page.tsx` =
components/demonstrations/demonstration-page.tsx, `stage.tsx` =
components/demonstrations/demonstration-stage.tsx, `shell.tsx` =
components/demonstrations/demonstration-shell.tsx, `store.ts` =
demonstrations/state/demo-store.ts, `build-spec.ts` = the showcase's own
build-spec.ts.

Persistence-proof shorthand (the parameter snapshot path):

> **P1** = `trial.parameters` snapshot (`demo-page.tsx:270-277`
> handlePredictionSubmit; also 296-303 save-observations, 336-342
> adaptations) → `store.ts:83-91` recordTrial → **device** `store.ts:111-126`
> saveToDevice (localStorage key `unseenlab.demo.<spec.id>`, `store.ts:45,118-121`;
> `savedToDevice` flagged BEFORE serializing `store.ts:114-117`) or **cloud**
> `store.ts:165-182` saveToCloud (PUT `/api/demonstrations`) → boot
> `loadFromDevice` (`demo-page.tsx:59`; `store.ts:128-140`) or
> `loadFromCloud` (`demo-page.tsx:65`; `store.ts:192-220`) → replay
> `demo-page.tsx:348-352` handleReplayTrial (`setParameters(trial.parameters)`
> + `resetSignal++`) → stage reset effect `stage.tsx:185-194`
> (`runner.reset()` + `setParam` per key) → `runner.ts:307-313,293-295` →
> engine `setParameter` re-derives state (orbits.ts:259-264, charges.ts:172-177,
> waves.ts:196-200) → 3D stage re-applies emitted state `stage.tsx:286-293`.

**New coupling proof for P1** (Phase 5): `tests/demonstrations/coupling/persistence-roundtrip.test.ts`
runs the full chain with the real showcase specs — manipulated parameter map →
recordTrial → `saveToDevice` → `demoStore.clear()` → `loadFromDevice` →
replay (`reset` + `setParam` per snapshot key) → `getVisualState()` +
`getReadouts()` exactly equal for orbits / charges / waves, and identical
trajectories after 30 further frames.

### 2.1 Orbits — `showcase-orbits` (`showcases/orbits/build-spec.ts:273-352`)

| Showcase | Control | Canonical field | Engine reader | 3D reader | 2D reader | Readout reader | Replay proof | Persistence proof |
|---|---|---|---|---|---|---|---|---|
| orbits | ctl-speed "Launch speed" (slider) | `params.speed` | orbits.ts:259-264 `setParameter` → `placeBodies` orbits.ts:75 (vis-viva launch speed) | "planet-system" mapping coupling.ts:82 (body "planet", scale 6/150, offset −6) → renderer.ts:1095-1101 | draw orbits.ts:205; getVisualState orbits.ts:306 | Period/Speed/Distance getReadouts orbits.ts:289 → runner.ts:245-249 → demo-page.tsx:223 → stage.tsx:378-398, acc-rep table | replay-restore.test.ts:170-197 parameter-only restore reproduces a from-scratch run | **P1** — parameter key `speed`; round-trip proven persistence-roundtrip.test.ts (orbits case) |
| orbits | ctl-g "Gravity strength" (slider) | `params.g` | orbits.ts:259-264 (g only rescales acceleration; no re-aim — 263) | same planet mapping | same draw/getVisualState | same readouts | same replay path | **P1** — parameter key `g`; same device round-trip test |
| orbits | ctl-play "Play / Pause" | runner `playing` (gates `module.step`) | runner.ts:236-240, 297-301 | renderer setPlaying stage.tsx:295-301 (3D pauses too) | runner loop gate | readouts freeze (no step) | recorded as trial.controls.playing (store.ts:30; demo-page.tsx:274) | recorded in the persisted trial entry (`controls`); NOT re-applied on replay — honest banner shell.tsx:271-273 ("past simulation state is not restored"); store round trip demo-store-persistence.test.ts:61-79 |
| orbits | ctl-reset "Reset" | engine re-derives all bodies (`placeBodies`) | runner.ts:307-313 → orbits.ts:286,75 | immediate emitVisualState runner.ts:312 → setEngineState stage.tsx:286-293 | reset re-seeds 2D | readouts re-emitted runner.ts:309 | same as replay reset path stage.tsx:185-194 | no persisted field — reset re-derives the deterministic seeded configuration (fixed seed 20260804, orbits/build-spec.ts:38); engine-level pin lumina-2d.test.ts:442-449 |
| orbits | ctl-speed-adj "Simulation speed" | runner `speed` (dt multiplier) | runner.ts:303-305, 237 | renderer.setSpeed stage.tsx:299-301 | runner loop | readout cadence scales | recorded as trial.controls.speed (store.ts:30; demo-page.tsx:274) | same as ctl-play: persisted in `controls`, not re-applied (honest) |

### 2.2 Electric fields — `showcase-electric-fields` (`showcases/electric-fields/build-spec.ts:235-312`)

| Showcase | Control | Canonical field | Engine reader | 3D reader | 2D reader | Readout reader | Replay proof | Persistence proof |
|---|---|---|---|---|---|---|---|---|
| fields | ctl-drag-1 / ctl-drag-2 "Drag the ± charge" (drag_handle) | engine `charges[i].x/y` (canonical bodies) | charges.ts:179 `pointer` (2D engine stage owns the drag) | charge-positive/negative mappings coupling.ts:85-86 (scale 3/70) → renderer.ts:1095-1101 | draw charges.ts:120; getVisualState charges.ts:219 (bodies + field grid) | Field strength / Potential from live positions charges.ts:204-211 | full-state round trip keeps dragged positions replay-restore.test.ts:104-128; the UI parameter path does NOT restore drags (honest) | **Honest boundary (P1 − body state):** drag positions are canonical but not parameter keys — the persisted snapshot holds only the 4 parameter keys; after reload+replay the charge returns to its parameter-defined position. Pinned by persistence-roundtrip.test.ts (charges honesty test); banner shell.tsx:271-273 |
| fields | ctl-q2 "Charge 2 (q2)" (slider, replaced the inverted ctl-dipole toggle — F1 fixed) | `params.q2` | charges.ts:172-177 → `placeCharges` charges.ts:63-71 | same charge mapping | same | same | same replay path | **P1** — parameter key `q2`; device round-trip (electric-fields case) |
| fields | ctl-q1 "Charge 1 (q1)" (slider) | `params.q1` | charges.ts:172-177 → placeCharges; fieldAt charges.ts:74 | same mapping | same | same | same replay path | **P1** — parameter key `q1`; same round-trip test |
| fields | ctl-separation "Separation" (slider) | `params.separation` | charges.ts:172-177 → placeCharges charges.ts:63; grid span getVisualState charges.ts:219 | charges at ±sep/2·3/70; "field-vectors" "@field" coupling.ts:89 → applyEngineField renderer.ts:1228-1261 | draw grid step + charges; getVisualState span | midpoint readouts move with charges | same replay path | **P1** — parameter key `separation`; same round-trip test |
| fields | ctl-field-scale "Field arrow scale" (slider) | `params.fieldScale` | charges.ts:74 (multiplies E), readouts charges.ts:204-211 | arrow length from grid magnitudes renderer.ts:1254-1258 (bounded by max magnitude) | drawn arrow length draw charges.ts:120-128 | Field strength readout scales | same replay path | **P1** — parameter key `fieldScale`; same round-trip test |

### 2.3 Wave interference — `showcase-wave-interference` (`showcases/wave-interference/build-spec.ts:262-342`)

| Showcase | Control | Canonical field | Engine reader | 3D reader | 2D reader | Readout reader | Replay proof | Persistence proof |
|---|---|---|---|---|---|---|---|---|
| waves | ctl-frequency "Frequency" (slider) | `params.frequency` | waves.ts:196-200; wave speed waves.ts:168 | source-1/source-2 mappings coupling.ts:95-96; "wave-surface" "@surface" coupling.ts:98 → applyEngineSurface renderer.ts:1198-1224 | draw waves.ts:175; getVisualState waves.ts:239 (u grid + source rows) | Intensity (mean u²) waves.ts:223-231 | same replay path | **P1** — parameter key `frequency`; device round-trip (waves case) |
| waves | ctl-wavelength "Wavelength" (slider) | `params.wavelength` | waves.ts:168 (cWave); readout waves.ts:230 | surface pattern + sources | same | "Wavelength" readout waves.ts:230 | same replay path | **P1** — parameter key `wavelength`; same round-trip test |
| waves | ctl-separation "Source separation" (slider) | `params.separation` | waves.ts:74-80 `sourceRows`; drive waves.ts:123-125 | source bodies move to driven rows coupling.ts:95-96 | getVisualState bodies waves.ts:240-248 | pattern-driven Intensity | same replay path | **P1** — parameter key `separation`; same round-trip test |
| waves | ctl-play / ctl-reset / ctl-speed-adj | runner playing/speed; `clearGrid` + `simTime = 0` on reset | runner.ts:236-240,297-313; waves.ts:219-220 | same as orbits (3D pauses / re-reads emitted state) | same | same | same replay path | same as orbits: persisted in `controls`, reset re-derives deterministically, play/speed honestly not restored |

Non-control engine parameters (table rows, not learner controls): `bodyMass`,
`eccentricity`, `distance` (orbits build-spec.ts:42-48); `amplitude`, `phase`
(waves build-spec.ts:46-52). They are canonical engine fields, participate in
the same P1 round trip when present in the lifted page map, and have no
learner control.

## 3. Consumers read the SAME field (evidence chain)

- **Readouts** derive ONLY from the engine module: `getReadouts()` is called by
  the runner loop (`runner.ts:245-249`) and displayed by `ReadoutDisplay`
  (`stage.tsx:378-398`), the data table (`acc-rep.tsx`), and the graph view.
  The page never computes a scientific value.
- **2D view** draws the same module state (`orbits.ts:205`, `charges.ts:120`,
  `waves.ts:175`).
- **3D stage** reads `getVisualState()` — the same engine state — through
  `coupling.ts` mappings and the renderer's read-only consumers
  (`renderer.ts:1095-1101` positions, `1198-1224` surface, `1228-1261` field).
  Position operators are skipped for engine-owned objects
  (`renderer.ts:1062-1065`), so operator animation cannot diverge.
- **Persistence** re-enters through the SAME `setParam` channel: a restored
  snapshot is applied exactly like a live slider move
  (`stage.tsx:169-175` parameter effect vs `stage.tsx:185-194` reset effect —
  both call `runner.setParam`), so the engine, 3D, 2D and readouts cannot
  disagree about a restored value.

## 4. Phase-5 manipulation matrix — all 7 scenarios verified

| # | Scenario | Test citation | What it proves |
|---|---|---|---|
| 1 | manipulate → switch representations | coupling/replay-restore.test.ts:156-168 ("draw() never mutates getVisualState for any coupled engine"); coupling/renderer-coupling.test.ts:625-666 ("setEngineState never mutates the canonical state object — one state shared by all surfaces"); coupling/engine-visual-state.test.ts (every `setParameter` case asserts the new values in `getVisualState`, e.g. 195-203, 238-244); ui/demonstration-shell.test.tsx:478-496 + 613-633 (tab switches keep one lifted state) | Mounting/drawing a representation cannot create or destroy state; switching 3D ↔ 2D after manipulation cannot change values — both surfaces read the same lifted object |
| 2 | manipulate → replay | coupling/replay-restore.test.ts:170-197 ("parameter-only restore (the UI replay path) reproduces a from-scratch run with those parameters" — reset + setParam per key, all three engines); ui/demonstration-shell.test.tsx:527-550 ("records a prediction and replays its parameters with honest labels") | Replay re-applies the recorded parameter values and the engine re-derives identical canonical state + trajectories |
| 3 | manipulate → reload | NEW coupling/persistence-roundtrip.test.ts (manipulated snapshot → saveToDevice → clear → loadFromDevice → replay → `getVisualState()`/`getReadouts()` equal, all three engines); state/demo-store-persistence.test.ts:61-79 ("restores the full session from the device, trials included") and :40-59 (honest `savedToDevice` flag in the blob); a11y/demo-shell-a11y.test.tsx:548-579 (real DemonstrationPage boot path: loadFromDevice → loadFromCloud fallback) | The manipulated parameter snapshot survives the localStorage JSON round trip and reproduces the exact canonical engine state after reload + replay |
| 4 | reset | engine/lumina-2d.test.ts:442-449 ("reset(seed) restores the exact initial state"); coupling/replay-restore.test.ts:170-197 (the reset effect path `stage.tsx:185-194` = `reset()` + `setParam` per key); runner.ts:307-313 (reset re-emits readouts + canonical state immediately) | After manipulation, reset re-seeds the engine to the parameter-defined configuration; the 3D stage snaps back via the immediate emission |
| 5 | second trial | NEW coupling/persistence-roundtrip.test.ts ("records two trials with incrementing numbers and independent parameter snapshots") | `store.ts:85-89` assigns `trial = trials.length + 1`; each entry keeps its own manipulated parameter/readout/control snapshot — no cross-trial state bleed |
| 6 | reduced motion | showcases/showcases.test.ts:257-271 (all three builders: reduced-motion variant validates and drops orbit/oscillate/pulse, only reveal/scale/translate remain); a11y/demo-shell-a11y.test.tsx:525-546 (renderer receives `reducedMotion`, stage views demoted) and :548-579 (OS pref + stored preference map to the document) | Reduced motion changes ANIMATION only — the engine and canonical state are untouched; the 2D engine view still animates at the user-controlled rate (waves build-spec.ts:272-273) |
| 7 | WebGL fallback | ui/demonstration-shell.test.tsx:514-525 ("falls back to the accessible representation when WebGL is unavailable"); a11y/demo-shell-a11y.test.tsx:655-668 ("renders a visible, announced canvas-fallback message") | No WebGL → honest note + accessible representation (table/diagram) reading the SAME lifted `parameters` + `readouts` — the canonical state survives the fallback unchanged |

## 5. No independently animated scientific value remains

F1–F3 fixed (spec edits, 2026-08-05; no engine/contract/renderer logic
changed), F4 accepted as designed, F5 unchanged UX note:

| Finding | Status | Evidence |
|---|---|---|
| F1 dipole toggle wrote q2 ∈ {1, 0} (label lied) | **FIXED** — `ctl-q2` slider (min −10, max 10, step 0.5, default −1) mirrors `ctl-q1`; dipole (q1=+1, q2=−1) is the default state | electric-fields/build-spec.ts:44-49,160-168 |
| F2 vectors toggle paused the sim + static arrows | **FIXED** — `ctl-vectors`, `velocity-arrow`/`gravity-arrow` objects and `update_vector` animations removed; no misleading labels remain on the verified orbit stage | orbits/build-spec.ts:162-214, 56-115 |
| F3 orbit ring at half the real radius | **FIXED** — `orbit-path-planet` size 12 → ring radius 6 = engine orbit radius at default; `orbit-path-moon` removed; limitation line states the ring marks the default orbit | orbits/build-spec.ts:75-81, 281 |
| F4 moon orbit center artifact | Accepted as designed — moon labeled "(illustrative)", ring removed | orbits/build-spec.ts:100, 281 |
| F5 3D drag = camera drag | Unchanged UX note; drags work on the 2D engine view, canonical state stays single | renderer.ts camera handler; demonstration-controls drag note |

## 6. Decorative residuals (all labeled; carry no verified claim)

| Object | Showcase | Label / limitation | Why it is not scientific state |
|---|---|---|---|
| moon | orbits | "Moon (illustrative)" (build-spec.ts:100); limitation "The moon and the 3D orbit ring are illustrative stage guides… the engine's live path, readouts, and table are the quantitative source" (build-spec.ts:281) | NOT in the engine mapping; its orbit is operator animation of a group child |
| orbit-path-planet (ring) | orbits | "Planet orbit" label + same limitation line (build-spec.ts:281) | Static decorative guide at the DEFAULT radius; the live engine path is the quantitative source (F3 limitation line) |
| star-glow | orbits | particle pulse operator | unmapped decorative-only (coupling.ts:6-9); no readout |
| star rotate | orbits | rotate operator | unmapped decorative-only |
| camera-marker | orbits/fields/waves | "Camera view" | explicit decorative-only kind |
| midpoint-marker | fields | "Midpoint"; explicitly NOT mapped (coupling.ts:90-92); limitation "The 3D stage is stylized; the engine's vector field and readouts are the quantitative source" (build-spec.ts:241) | sits at the engine midpoint by construction; pulse is decorative |
| source-1/source-2 pulses | waves | pulse opacity operators | unmapped decorative-only (coupling.ts:99); sources themselves ARE engine-mapped |
| constructive-marker color cycle | waves | "Constructive (bright)" / "Destructive (dark)" labels; explicitly decorative (coupling.ts:99); intensity caveat limitation (build-spec.ts:269) | label highlight only; the intensity readout is the mean u², "the pattern is the primary evidence" |

No 3D element feeds a readout, table cell, or graded result except through the
engine mapping. All continuous 3D animation is either engine-driven
(positions/surface/field) or labeled decorative.

## 7. Divergence check

**NONE.** No duplicated scientific state, no 3D-only scientific value, no
readout-only scientific value, no independently animated scientific value.
The engine module is the single holder of every scientific quantity; the
persisted parameter snapshot is the single persisted scientific state, and it
re-enters through the same `setParam` channel as live manipulation. One honest
boundary (not a divergence): pointer-dragged charge positions are canonical
body state but are not parameter-persisted — replay restores the
parameter-defined configuration, exactly as the banner states
(shell.tsx:271-273); the engines' full-state `serializeState()`/`restoreState()`
(orbits.ts:314-335, charges.ts:244-258, waves.ts:252-267) exists and is tested
for round-trips, but the UI deliberately uses the parameter path.

## 8. Test evidence (exact run)

```
$ npx vitest run tests/demonstrations/coupling/ tests/demonstrations/showcases/ 2>&1 | tail -5
 Test Files  5 passed (5)
      Tests  49 passed (49)
   Start at  17:55:09
   Duration  6.98s (transform 2.95s, setup 5.36s, import 2.77s, tests 1.86s, environment 14.97s)
```

New tests added this phase (the ONLY new file — two real gaps):
- `tests/demonstrations/coupling/persistence-roundtrip.test.ts` (5 tests):
  - second trial — incrementing numbers + independent snapshots (scenario 5),
  - device round trip — manipulated parameters → recordTrial → saveToDevice →
    loadFromDevice → replay → canonical `getVisualState()`/`getReadouts()`
    equal, for orbits, charges and waves (scenario 3 / persistence column P1),
  - honesty boundary — pointer-dragged charge positions are canonical but not
    parameter-persisted (banner-accurate).

## 9. Verdict

- Controls mapped: **17** (orbits 5, electric-fields 6, waves 6).
- Persistence column: **PROVEN** — every control's scientific value reaches
  persistence exclusively as `trial.parameters`/`trial.controls` snapshots
  (demo-page.tsx:270-277 → store.ts:83-91 → store.ts:111-126 or 165-182 →
  demo-page.tsx:59/65 + store.ts:128-140/192-220 → demo-page.tsx:348-352 →
  stage.tsx:185-194 → runner.ts:307-313,293-295 → engine setParameter); device
  round trip proven end-to-end for all three showcase engines by the new
  coupling test.
- Scenario coverage: **7/7** — see §4 matrix with test citations.
- Divergence: **NONE** (one honest, banner-labeled boundary: drag body
  positions are not parameter-persisted).
- Decorative residuals: 8, all labeled (§6).
- Test run: 5 files / 49 tests passed.
- New tests: `tests/demonstrations/coupling/persistence-roundtrip.test.ts`
  (5 tests).
- Verdict: **PROVEN**.
