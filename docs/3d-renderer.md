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
