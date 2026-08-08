# 3D renderer — approved-primitive engine

## Technology decision

**Direct Three.js** (`three@0.185.1`, already a dependency). No React Three
Fiber: the renderer surface is one canvas per demo with an imperative
lifecycle (own rAF loop, resize observer, pointer handling, disposal) that is
simpler to test and dispose than a reconciler-driven scene. Bundle impact of
the demo renderers + three core: ~774 KB raw (~205 KB gzipped) measured on the
Phase 9 production build.

## Architecture

```
DemoSpecV1.scene3d
  → buildSceneGraph(spec, {mobile})   pure, no WebGL — clamps limits,
                                      resolves refs, drops invalid nodes
  → PrimitiveSceneRenderer            Three.js — builds meshes/lines/points,
                                      applies animation operators, renders
```

- 18/18 approved primitives implemented (mesh / line / points / sprite / group
  mapping, compile-time exhaustive).
- 12/12 animation operators with bounded parameters (amplitude ≤ 2, speed ≤ 5,
  delay ≤ 10 s) and pure step math.
- Material allowlist: MeshBasicMaterial, MeshStandardMaterial, LineBasicMaterial,
  PointsMaterial, SpriteMaterial. No textures, no shaders, no env maps, no
  imported models.

## Scene pipeline (Wave 3/4 rework — deterministic, gate-enforced)

```
canonicalize spec → resolveLayout (seeded auto-repair)
  → presentation (labels → edges → edge labels → camera)
  → geometry gate (fail loudly / degrade by simplification)
```

Stages and owners (all under `src/demonstrations/renderers/primitive-3d/`):

| Stage | Module | Responsibility |
| --- | --- | --- |
| Canonicalize | `scene-graph.ts` | buildSceneGraph: refs, limits, clamps, graph mode, `graph.layout` attach |
| Layout | `layout/resolve-layout.ts` | deterministic seeded repair: repulsion, grid fallback, z-plane canonicalization, chained-packet snap, short-edge lengthening, identity layout for non-graphs |
| Node labels | `labels.ts` | anchor-order placement, 288px truncation budget, collision-tested, `planNodeLabels` |
| Edges | `edges.ts` | bounded routing (`routeEdgeWithReasons`), radius-aware heads, edge-label candidates, legacy flow/transforms edges |
| Camera | `camera.ts` | envelope+label+margin framing (`graphFrameHalfHeight`), reframe hysteresis on `setEngineState`, canonical views, `projectOrthoToCSS` export |
| Presentation aggregate | `presentation/resolve-presentation.ts` | pure `resolvePresentation`: reproduces the renderer's presentation decisions as plain data (labels → edges → edge labels → camera → GateScene) |
| Gate runner (production) | `presentation/pipeline.ts` | `runGeometryGate(graph, opts)`: I3 shorten/re-place degrade (degrade on), short-head suppression, `checkScene`, surfaced reasons |
| Gate (pure) | `geometry-gate.ts` | `checkScene` — invariants I1–I5 + informational checkers; the corpus expectations and the 2D surface share it |
| Shared geometry | `geometry/envelopes.ts` | single source of extents, clearance constants, collision predicates; sanitizer + layout + gate all read it |
| 2D surface | `src/components/demonstrations/accessible-representation.tsx` | consumes the SAME laid-out graph + runs the SAME gate runner (degrade off) |

### Invariants (geometry gate — all unit-tested)

- **I1** No two node envelopes intersect.
- **I2** No edge crosses a non-endpoint node's envelope.
- **I3** No label overlaps any node envelope, edge, or other label.
- **I4** Every arrowhead anchors on exactly its source→target pair; inset = actual target radius + head length.
- **I5** All rendered content stays inside the framed viewport with margin.

### Fail loudly / degrade by simplification

`PrimitiveSceneRenderer.setSpec` joins the gate runner's verdict into its
`getLastReasons()` surface (placement reasons are deduped at the join — first
occurrence wins). Degrade is real, never silent:

- I3 repairable: colliding node labels are shortened (halving, bounded passes)
  and re-placed — `gate_label_shortened`; the built scene carries the
  shortened labels.
- I4 repairable: edges shorter than `r_s + r_t + headLen` have their arrowheads
  suppressed — `edge_head_suppressed_short_edge` (the I4 checker skips
  suppressed heads; direction is carried by shaft + label).
- Unrepairable residuals emit one `gate_I{n}_violations` per breached
  invariant plus `gate_unverified`; the scene still renders with a documented
  residual — never a silent pass.
- The 2D surface surfaces the same verdict as `data-gate-i1..i5` /
  `data-gate-unverified` / `data-gate-reasons` on the diagram figure (degrade
  off — its own seeded spread handles 2D projection residuals).

### Layout semantics

- Determinism: layout is a pure function of (graph, seed) with a seeded PRNG
  (`mulberry32` / `hashString`); seed = `hashString(spec.id|spec.generationId)`.
- `layout_repaired` marks any successful repair; `layout_collision_remaining` +
  `layout_iterations_capped` surface residuals the budget could not clear
  (surfaced loudly, never silent).
- The 2D diagram consumes the already-laid-out graph (`graph.layout` present)
  instead of re-running `resolveLayout` — 2D and 3D agree on residual scenes
  (ATK-14; no second-pass drift).

### Canonical views + CSS projection

`camera.ts` exports `canonicalViews` (front / left / right / top-down frames
for corpus and screenshots) and `projectOrthoToCSS(world, {center, halfH,
aspect, canvasBox})` — the graph-mode ortho projection (view basis
zAxis = normalize(0, 0.55, 1)) that is math-identical to the frozen
`projectNode` helper in `e2e/demo-lesson-rail.spec.ts`. The gate's I5 verdict
uses the build-time aspect (4/3, `FRAME_ASPECT_DEFAULT`); live 16:9 is covered
by reframe growth plus the browser e2e DOM bbox QA.

### Reason-code catalog (placement + gate surface)

Layout: `layout_repaired`, `layout_grid_fallback`, `layout_labels_shortened`,
`layout_edge_labels_suppressed`, `layout_packet_slots_capped`,
`layout_collision_remaining`, `layout_iterations_capped`,
`follow_path_needs_path`, `update_vector_identity_axis_fallback`.
Labels/edges: `label_truncated_ellipsis`, `label_anchor_fallback`,
`edge_label_skipped_no_space`, `edge_label_suppressed_density`,
`edge_unroutable`, `edge_head_suppressed_short_edge`.
Gate: `gate_I1_violations` … `gate_I5_violations`, `gate_unverified`,
`gate_label_shortened`.

## Lifecycle guarantees (tested)

- One canvas, one renderer, one rAF loop; a second runner on the same canvas
  throws (WeakMap ownership guard).
- DPR cap 2 (1.5 mobile); mobile particle budget 500 vs 1500 desktop.
- `visibilitychange` → pause; dt clamped to 0.05 s.
- `webglcontextlost` → preventDefault + full disposal; `webglcontextrestored` →
  scene rebuild.
- `dispose()` cancels rAF, disposes geometries/materials/renderer, releases
  canvas ownership. 10 mount/unmount cycles leave zero live canvases.
- WebGL unavailable → synchronous `onError({reason:"webgl_unavailable"})`, no
  loop; the shell falls back to the accessible representation.
- Reduced motion: no camera movement; oscillate/pulse/emit frozen, fade/reveal
  discrete.
- Optional `onFps` callback wired to a dependency-free `FrameStatsSampler`
  (`src/demonstrations/performance/frame-stats.ts`).

## Showcase families (curated, engine-coupled)

- **Orbits** (`showcases/orbits`): star + bodies, orbit trails, velocity +
  gravity vectors, camera marker; coupled to the verified orbits engine;
  prediction: speed ↑ → wider elliptical orbit (measured: period 115.5 → 207
  sim-s).
- **Electric fields** (`showcases/electric-fields`): draggable charges, field
  vector_field, dipole preset, null-point observation; coupled to charges
  engine; midpoint potential of a dipole measured exactly 0.
- **Wave interference** (`showcases/wave-interference`): two sources, animated
  wave_surface, separation/wavelength controls, constructive/destructive
  highlights; coupled to waves engine; lobe count rises with separation
  (measured 2–4 at d=40 → 10–15 at d=110).

Each showcase: Level 1 verified, prediction with engine-asserted truth,
≤ 6 controls, non-3D representations (stage_2d / diagram / table / timeline /
text_sequence), reduced-motion variant, counts within SPEC_LIMITS.

## Honest limits

jsdom cannot rasterize: real FPS, DPR visuals and WebGL behavior on device are
verified in the browser gate, not in unit tests. Physics/readouts are fully
unit-verified; rendering correctness is structurally verified.
