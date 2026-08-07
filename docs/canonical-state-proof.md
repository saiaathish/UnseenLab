# Canonical State & Scientific Coupling Proof

**Agent 07 closure evidence for PR #9** — every learner control modifies exactly
ONE canonical engine state field, and every visual (3D stage, 2D stage,
readouts/table, replay) reads THAT field — for the three verified showcases:
orbital mechanics, electric fields, wave interference.

Status: **PROVEN** (with 2 control-semantics defects and 3 decorative issues
recorded below; none of them create duplicated scientific state).

---

## 1. The canonical-state architecture (one field per control)

- The lumina-2d engine module owns ALL scientific state: `params`, `bodies`,
  `charges`, `u` (`src/demonstrations/renderers/lumina-2d/engines/{orbits,charges,waves}.ts`).
- The runner is a pure owner of canvas/time; it forwards parameter writes via
  `setParam` (`runner.ts:293-295`) and emits `getVisualState()` at ~15 Hz
  (`runner.ts:251-262`, `VISUAL_STATE_INTERVAL` at `runner.ts:28`).
- The page holds exactly ONE lifted copy of the canonical state
  (`parameters`, `readouts`, `visualState` — `demonstration-page.tsx:219-230`)
  and forwards it to every surface (`demonstration-page.tsx:359-405`).
- The curated mapping (`src/demonstrations/showcases/coupling.ts:77-101`) is the
  only bridge from 3D scene object ids to engine body keys / grid sentinels;
  the 3D renderer consumes it read-only (`renderer.ts:1034-1055`,
  `applyTransforms` `renderer.ts:1095-1103`, `applyEngineSurface`
  `renderer.ts:1198-1219`, `applyEngineField` `renderer.ts:1228-1264`).
- Engine-owned objects skip position operators so operator animation can never
  diverge from canonical state (`renderer.ts:192-197`, `renderer.ts:1060-1065`).

## 2. Control-State Matrix (17 learner controls)

Columns: Showcase | Control | Canonical field | Engine consumer | 3D consumer |
2D consumer | Readout consumer | Replay proof.

Legend for file references (all under `src/`):
`orbits.ts` = renderers/lumina-2d/engines/orbits.ts, `charges.ts` = .../charges.ts,
`waves.ts` = .../waves.ts, `coupling.ts` = showcases/coupling.ts,
`runner.ts` = renderers/lumina-2d/runner.ts, `renderer.ts` = renderers/primitive-3d/renderer.ts,
`demo-page.tsx` = components/demonstrations/demonstration-page.tsx,
`stage.tsx` = components/demonstrations/demonstration-stage.tsx,
`shell.tsx` = components/demonstrations/demonstration-shell.tsx,
`tabs.tsx` = components/demonstrations/representation-tabs.tsx,
`acc-rep.tsx` = components/demonstrations/accessible-representation.tsx,
`build-spec.ts` = the showcase's own build-spec.ts,
`store.ts` = demonstrations/state/demo-store.ts.

### 2.1 Orbits — `showcase-orbits` (`showcases/orbits/build-spec.ts:188-247`)

| Showcase | Control | Canonical field | Engine consumer | 3D consumer | 2D consumer | Readout consumer | Replay proof |
|---|---|---|---|---|---|---|---|
| orbits | ctl-speed "Launch speed" (slider) | `params.speed` | orbits.ts:259-264 `setParameter` → `placeBodies` orbits.ts:82 (vis-viva launch speed) | planet-system mapping coupling.ts:82 (body "planet", scale 0.04) → renderer.ts:1095-1103 | orbits.ts:205-257 draw (bodies[1]); getVisualState orbits.ts:306-312 | Period/Speed/Distance getReadouts orbits.ts:289-299 → runner.ts:245-249 → demo-page.tsx:223 → stage.tsx:378-398, acc-rep.tsx:294-349 | trial.parameters snapshot store.ts:26,83-91 → demo-page.tsx:348-352 → stage.tsx:185-194 reset+setParam → runner.ts:307-313 re-emits visual state |
| orbits | ctl-g "Gravity strength" (slider) | `params.g` | orbits.ts:259-264, 111 (acceleration), 82 (launch speed) | same mapping (planet trajectory) | same draw/getVisualState | same readouts | same replay path |
| orbits | ctl-play "Play / Pause" | runner `playing` (gates `module.step`) | runner.ts:236-240, 297-301 | renderer setPlaying stage.tsx:295-301 (3D pauses too) | runner loop gate | readouts freeze (no step) | trial.controls.playing store.ts:30, demo-page.tsx:274 |
| orbits | ctl-reset "Reset" | engine re-derives all bodies (`placeBodies`) | runner.ts:307-313 → orbits.ts:284-287 | immediate emitVisualState runner.ts:312 → setEngineState stage.tsx:286-293 | reset re-seeds 2D | readouts re-emitted runner.ts:309 | same as replay reset path stage.tsx:185-194 |
| orbits | ctl-speed-adj "Simulation speed" | runner `speed` (dt multiplier) | runner.ts:303-305, 237 | renderer.setSpeed stage.tsx:299-301 | runner loop | readout cadence scales | trial.controls.speed store.ts:30 |
| orbits | ~~ctl-vectors~~ "Show velocity and gravity vectors" — **REMOVED 2026-08-05** (miswired toggle called play/pause; static arrows removed; see Resolution) | — | — | — | — | — | — |

Non-control engine parameters present in the spec (table rows, not learner
controls): `bodyMass`, `eccentricity`, `distance` (build-spec.ts:42-48;
orbits.ts:27 defaults; readout "Distance" tracks the live radius, not the
parameter).

### 2.2 Electric fields — `showcase-electric-fields` (`showcases/electric-fields/build-spec.ts:146-196`)

| Showcase | Control | Canonical field | Engine consumer | 3D consumer | 2D consumer | Readout consumer | Replay proof |
|---|---|---|---|---|---|---|---|
| fields | ctl-drag-1 / ctl-drag-2 "Drag the ± charge" (drag_handle) | engine `charges[i].x/y` (canonical bodies) | charges.ts:179-197 `pointer` (drag on the 2D engine stage; see Finding F5 for the 3D stage) | charge-positive/negative mappings coupling.ts:85-86 (scale 3/70) → renderer.ts:1095-1103 | draw charges.ts:151-167; getVisualState charges.ts:219-242 (centered px bodies + field grid) | Field strength / Potential from live positions charges.ts:204-211 (midpoint of `charges[]`) | dragged positions are canonical state; full-state restore round-trips them (new test replay-restore.test.ts "pointer-dragged positions survive") |
| fields | ctl-q2 "Charge 2 (q2)" (slider, default -1; replaced the ctl-dipole toggle 2026-08-05) | `params.q2` | charges.ts:172-177 setParameter → `placeCharges` charges.ts:63-71 | same mapping (charge-negative follows q2 via body) | same | same | same replay path |
| fields | ctl-q1 "Charge 1" (slider) | `params.q1` | charges.ts:172-177 → placeCharges; fieldAt charges.ts:82 | same mapping | same | same | same replay path |
| fields | ctl-separation "Separation" (slider) | `params.separation` | charges.ts:172-177 → placeCharges charges.ts:67; grid span charges.ts:224 | charges at ±sep/2·3/70; field-vectors "@field" coupling.ts:89 (scale 3/70) → applyEngineField renderer.ts:1228-1264 | draw grid step + charges; getVisualState span charges.ts:224 | midpoint readouts move with charges | same replay path |
| fields | ctl-field-scale "Field arrow scale" (slider) | `params.fieldScale` | charges.ts:82 (multiplies E), readouts charges.ts:204-211 | arrow length from grid magnitudes renderer.ts:1248-1252 (bounded by max magnitude) | drawn arrow length draw charges.ts:128 | Field strength readout scales | same replay path |

### 2.3 Wave interference — `showcase-wave-interference` (`showcases/wave-interference/build-spec.ts:136-199`)

| Showcase | Control | Canonical field | Engine consumer | 3D consumer | 2D consumer | Readout consumer | Replay proof |
|---|---|---|---|---|---|---|---|
| waves | ctl-frequency "Frequency" (slider) | `params.frequency` | waves.ts:196-200; drive waves.ts:121-122; wave speed waves.ts:168 | source-1/source-2 mappings coupling.ts:95-96; wave-surface "@surface" coupling.ts:98 → applyEngineSurface renderer.ts:1198-1219 | draw image waves.ts:175-194; getVisualState waves.ts:239-250 (u grid + source rows) | Intensity (mean u²) waves.ts:224-231 | same replay path |
| waves | ctl-wavelength "Wavelength" (slider) | `params.wavelength` | waves.ts:168 (cWave); readout waves.ts:227 | surface pattern + sources | same | "Wavelength" readout waves.ts:230 | same replay path |
| waves | ctl-separation "Source separation" (slider) | `params.separation` | waves.ts:74-80 `sourceRows`; drive waves.ts:123-125 | source bodies move to driven rows coupling.ts:95-96 | getVisualState bodies waves.ts:240-248 | pattern-driven Intensity | same replay path |
| waves | ctl-play / ctl-reset / ctl-speed-adj | runner playing/speed; `clearGrid`+`simTime=0` on reset | runner.ts:236-240,297-313; waves.ts:218-221 | same as orbits (3D pauses / re-reads emitted state) | same | same | same replay path |

Non-control engine parameters: `amplitude`, `phase` (build-spec.ts:46-52) —
canonical fields, table rows, no learner control.

## 3. Consumers read the SAME field (evidence chain)

- **Readouts** derive ONLY from the engine module: `getReadouts()` is called by
  the runner loop (`runner.ts:245-249`) and displayed by `ReadoutDisplay`
  (`stage.tsx:378-398`), `DataTableView` (`acc-rep.tsx:294-349`) and the graph
  view (`tabs.tsx:289-341`). The page never computes a scientific value.
- **2D view** draws the same module state (`orbits.ts:205-257`,
  `charges.ts:120-170`, `waves.ts:175-194`).
- **3D stage** reads `getVisualState()` — the same engine state — through
  `coupling.ts` mappings and the renderer's read-only consumers
  (`renderer.ts:1095-1103` positions, `1198-1219` surface, `1228-1264` field).
  Position operators are skipped for engine-owned objects
  (`renderer.ts:1060-1065`), so operator animation cannot diverge.
- **Table** mixes declared parameter rows (page mirror `parameters`, engine is
  authoritative — `setParameter` clamps, e.g. orbits.ts:259-264) with live
  engine readouts (`acc-rep.tsx:306-322`).

## 4. Replay restores the same values (verified)

- Trials snapshot parameters + readouts (`store.ts:83-91`; `demo-page.tsx:268-277`).
- Replay = restore parameters + fresh reset: `demo-page.tsx:348-352`
  (`setParameters(trial.parameters)` + `resetSignal++`) → the 2D stage reset
  effect re-seeds the engine and re-applies every parameter
  (`stage.tsx:185-194`) → `runner.reset()` re-emits the canonical visual state
  immediately (`runner.ts:307-313`) → the 3D stage re-applies it
  (`stage.tsx:286-293`).
- The replay banner is honestly labeled: parameters are restored, past
  simulation state (positions/time) is not (`shell.tsx:270-274`).
- The engines additionally support full-state `serializeState()`/`restoreState()`
  (orbits.ts:314-335, charges.ts:244-258, waves.ts:252-267). Previously only
  the waves round-trip was tested (lumina-2d.test.ts:417-440); **this gap is
  now closed** for all three engines including `getVisualState()` equality and
  identical continuation (new `tests/demonstrations/coupling/replay-restore.test.ts`),
  plus the parameter-only replay path reproduces a from-scratch run exactly.

## 5. Representation switching creates no new state (verified)

- Switching 3D ↔ 2D keeps ONE page-level canonical state
  (`demo-page.tsx:219-230`); the hidden 2D engine stage stays mounted as the
  readout driver while the 3D tab is active (`tabs.tsx:163-229`; hidden 2D at
  216-219, conditional 3D at 220-227) and both surfaces receive the same
  `visualState` + `engineMapping`.
- The 3D renderer treats the state as read-only (new test: `setEngineState`
  never mutates the passed object — renderer-coupling.test.ts), and `draw()`
  never mutates `getVisualState()` for any coupled engine (new test), so
  mounting/drawing a representation cannot create or destroy state.

## 6. Findings (recorded; product code not edited)

Divergence check result — **no duplicated scientific state, no 3D-only
scientific value, no readout-only scientific value**. The engine module is the
single holder of every scientific quantity. Recorded defects:

| # | Finding | Evidence |
|---|---|---|
| F1 | **ctl-dipole toggle semantics inverted vs. its label/docs.** The generic toggle handler writes `q2 = next ? 1 : 0` and renders checked when `q2 > 0.5`; with the curated default q2=-1 the toggle displays OFF, and turning it ON sets q2=+1 (same sign as q1) — the opposite of the documented "on → -q1, off → +1" (build-spec header) and of the label "Dipole preset (opposite signs)". The graded prediction scenario ("Dipole preset on: charges +1 and -1") is unreachable through the control. All surfaces still agree with each other (single canonical field q2) — the defect is control semantics, not state divergence. | demonstration-controls.tsx:239-264; electric-fields/build-spec.ts:23-24,160-165 |
| F2 | **ctl-vectors toggle is miswired and the velocity/gravity arrows are static.** The toggle targets animation `anim-velocity-vector` (orbits/build-spec.ts:227-234) but the toggle handler maps non-parameter targets to play/pause (demonstration-controls.tsx:254-260). Additionally `update_vector` (operators.ts:483-487) writes `NodeState.vector`, consumed only by vector_field/process_edge/energy_packet kinds (renderer.ts:1161-1181) — arrow meshes never move, so the "Velocity"/"Gravity pull" labels imply engine-derived directions that are not. | demonstration-controls.tsx:239-264; operators.ts:483-487; renderer.ts:1161-1181; orbits/build-spec.ts:114-129,227-234 |
| F3 | **orbit-path rings do not match the engine orbit radius.** `orbit_path` radius = size·0.5 (renderer.ts:606-607); "orbit-path-planet" size 6 → radius 3, but the engine-coupled planet orbits at world radius 6 (coupling.ts:46,82). The ring is static while the 2D engine redraws its dashed guide at `params.distance` (orbits.ts:224-231). Decorative, but visually inconsistent with the labeled "Planet orbit". | renderer.ts:604-618; orbits/build-spec.ts:75-81; coupling.ts:46,82; orbits.ts:224-231 |
| F4 | **Moon orbit center artifact.** The moon's orbit center/radius are derived from SPEC positions (scene-graph.ts:422-434) but the moon is a child of the engine-positioned planet-system group, so its local-space circle orbits the group pivot (world point 6 units behind the planet — the star at defaults). Decorative only; already labeled "Moon (illustrative)". | scene-graph.ts:422-434; orbits/build-spec.ts:83-113; coupling.ts:82 |
| F5 | **3D-stage charge drags are camera drags.** The drag_handle note says "drag directly on the stage" (demonstration-controls.tsx:380-388), but the 3D stage pointer handler is orbit-camera only (renderer.ts:1326-1362); charges are dragged on the 2D engine view. Canonical state stays single (drag → engine bodies → both surfaces). UX note, not a divergence. | renderer.ts:1326-1362; demonstration-controls.tsx:380-388 |

## 7. Independently animated scientific representations

None of the independently animated 3D elements feed readouts or verified
results; all are decorative or already downgraded:

- **Already labeled conceptual/decorative:**
  - Moon: label "Moon (illustrative)" + limitation "the engine readouts
    describe the planet only" (orbits/build-spec.ts:108,314).
  - Electric fields: limitation "The 3D stage is stylized; the engine's vector
    field and readouts are the quantitative source" (electric-fields/build-spec.ts:238).
  - Waves: limitation "The intensity readout is the mean squared amplitude over
    the whole tank; the pattern is the primary evidence"
    (wave-interference/build-spec.ts:269).
  - coupling.ts:6-9: unmapped objects are decorative-only (camera, glow pulses,
    label highlights, illustrative companions). midpoint-marker explicitly
    unmapped (coupling.ts:90-92); constructive/destructive markers explicitly
    decorative (coupling.ts:99).
- **Decorative-only by construction (carry no verified claim):** star-glow
  pulse, star rotate, source pulses (opacity), constructive-marker
  `change_color` highlight, midpoint-marker pulse, camera markers.
- **Not yet downgraded (reported, not edited):** velocity/gravity arrows and
  orbit-path rings (Findings F2/F3) — labels imply engine-derived quantities
  but the visuals are static/decorative.

## 8. Coupling test evidence

Baseline before this closure (existing 16 tests, both files pass):

```
Test Files  2 passed (2)
     Tests  16 passed (16)
```

After adding `tests/demonstrations/coupling/replay-restore.test.ts` (5 tests)
and one immutability test in `renderer-coupling.test.ts` (1 test):

```
Test Files  3 passed (3)
     Tests  22 passed (22)
```

New tests:
- `tests/demonstrations/coupling/replay-restore.test.ts` — full-state
  serialize/restore round-trips `getVisualState()` + readouts for orbits,
  charges (incl. pointer-dragged positions) and waves; `draw()` never mutates
  canonical state (representation-switch invariant); parameter-only replay
  equals a from-scratch run for all three engines.
- `renderer-coupling.test.ts` — `setEngineState` never mutates the canonical
  state object shared by all surfaces.

## 9. Verdict

- Control-state matrix: **17 controls mapped** (see §2; file reference
  `docs/canonical-state-proof.md`).
- Divergence found: NONE in canonical state (single engine-held field per
  control; all consumers read it). Two control-semantics defects recorded:
  F1 (dipole toggle), F2 (vectors toggle + static arrows).
- Independent animation issues: F3 (orbit-path ring mismatch), F4 (moon orbit
  center artifact), F5 (3D drag = camera drag).
- Conceptual downgrades already labeled: moon (illustrative), stylized 3D
  field stage, waves intensity caveat, decorative-only unmapped objects.
- Replay: restores parameter values (honestly labeled) and the full-state
  engine path now round-trips canonical state — tested.
- Representation switching: single lifted state; 3D is a read-only consumer —
  tested.
- Verdict: **PROVEN** (canonical-state property holds; F1/F2 are
  control-implementation defects to fix in a follow-up, not state divergences).
- UNKNOWN: none for the three verified showcases.

## Resolution (2026-08-05, post-review — Executive Director)

Findings F1-F3 were fixed in the showcase specs (bug-fix category under the
closure freeze; no engine math, no contract, no renderer logic changed):

| Finding | Resolution | Evidence |
| --- | --- | --- |
| F1 dipole toggle wrote q2∈{1,0} (label lied) | Replaced with `ctl-q2` slider (min -10, max 10, step 0.5, default -1), mirroring `ctl-q1`; header comment corrected. The dipole (q1=+1, q2=-1) is the default state; learners can also set q2=+1 for the same-sign configuration. | electric-fields/build-spec.ts |
| F2 vectors toggle paused the sim + static arrows | Removed `ctl-vectors`, the `velocity-arrow`/`gravity-arrow` objects, and their `update_vector` animations. No misleading labels remain on the verified orbit stage. | orbits/build-spec.ts |
| F3 orbit ring at half the real radius | `orbit-path-planet` size 6→12 (ring radius 6 = engine orbit radius at default); `orbit-path-moon` removed (decorative, incoherent geometry); limitation line now states the ring marks the default orbit and the engine's live path/readouts are the quantitative source. | orbits/build-spec.ts |
| F4 moon orbit artifact | Accepted as designed: moon remains labeled "(illustrative)" with the limitation line; its ring was removed. | orbits/build-spec.ts |
| F5 3D drag = camera drag | Unchanged (UX note; drags work on the 2D engine view, canonical state stays single). | — |

Re-verified: showcases/coupling/offline-generator/benchmark/a11y suites 232/232
green after the changes (vitest run, 2026-08-05 17:05).
