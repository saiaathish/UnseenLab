# Lumina Provenance

Status of the Lumina source used as a reference for the UnseenLab Generative
Demonstration Engine. Recorded at Phase 0 of
`feature/generative-demonstration-engine` (2026-08-04).

## Source

- **Repository**: `/Users/saiaathishkarthik/Desktop/UnseenLab/dstl/stem-main`
  (local copy, kept read-only during extraction; not published inside
  UnseenLab — `dstl/` is git-ignored).
- **Upstream context**: Lumina, a STEMist Hacks IV entry built by the UnseenLab
  user ("saiaathish") and one collaborator.

## Ownership status

| Item | Status |
| --- | --- |
| User's own contributions | Authorized for reuse by the user's explicit request |
| Collaborator contributions | `UNCLEAR` — no written permission on file |
| Repository license | **None found** (no LICENSE/COPYING in `dstl/stem-main` or headers) |
| Third-party assets (fonts, images, screenshots) | Not inspected for clearance; **none reused** |

Consequence (per the provenance gate): **no direct copying of Lumina source**.
The engine *concepts* (SimModule contract shape, seeded PRNG, parameter-bound
sanitization, word-aware offline routing, RK4 / inverse-square gravity /
finite-difference wave equation / Gray–Scott / B3/S23 numerical methods) are
reimplemented clean-room inside `src/demonstrations/`, informed by reading the
reference but written against UnseenLab's own stack (Next.js server routes,
Firebase identity, MongoDB persistence, existing adaptation system).

## Code classification

| Classification | Scope |
| --- | --- |
| Directly reused code | **None** — no Lumina file is imported by UnseenLab |
| Adapted code | **None** — no line-by-line adaptation |
| Clean-room rewrites | Engine contract, runner lifecycle, parameter bounds, sanitizer philosophy, offline routing, numerical methods (RK4, inverse-square, quadratic drag, elastic collisions, finite-difference wave, Gray–Scott, B3/S23) |
| Rejected assets | `devpost-gallery/`, `lumina-thumbnail.*`, `thumbnail.html`, `lumina-documentation.zip`, obsolete fonts/images without provenance |
| Rejected systems | Browser BYOK model calls, localStorage API keys, Python FastAPI backend (`server/`), Render Workflow, in-memory job storage, Vite shell, Zustand app state, duplicated quiz/scene catalogs |

## Attribution

- Conceptual attribution: "Demonstration-engine concepts inspired by Lumina
  (STEMist Hacks IV), built by the same author with a collaborator; the
  UnseenLab implementation is a clean-room rewrite for the IncludAI Track 1
  entry." Documented in `docs/lumina-port-map.md`.

## Outstanding permission

- Written collaborator permission for any future *direct* reuse. Until then,
  clean-room only. `docs/lumina-port-map.md` tracks the concept mapping so a
  future license can be applied file-by-file if needed.
