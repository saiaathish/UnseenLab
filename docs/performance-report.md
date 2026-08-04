# UnseenLab — Performance Report (AGENT PERF-01)

Date: 2026-08-03 · Next.js 16.2.12 (Turbopack build) · React 19.2.4 · Node server `next start` on :3100

Method: measured, not guessed. All numbers below come from the production build in `.next` (build id `jB_Df7CMO6vtL3Ou22YrXMon`, built 21:18; no source file is newer than the build, so no rebuild was run), the prerender/route manifests, the prerendered HTML, and `curl` against the running server.

---

## 1. Client JS bundle

### 1.1 Per-chunk attribution (`.next/static/chunks`, raw bytes / gzip bytes)

| Chunk | Raw | Gzip | Content (attribution method) |
|---|---|---|---|
| `3v31btnwc09zd.js` | 599,664 | 157,950 | three.js r185 + gsap (strings `three.js r185`, `WebGLRenderer`, `gsap`) — **dynamic chunk, not in any initial HTML** |
| `1fh6jwbefmqgn.js` | 531,518 | 143,520 | Next/React shared runtime + app UI kit: `@base-ui/react` (12 refs) + AppHeader (`/lab/nuclear-chain-reaction` link) — **biggest initial chunk** |
| `40muzspfdncjx.js` | 250,432 | 65,772 | `@supabase/supabase-js` + `@supabase/ssr` client stack (`supabase.co`, `@supabase/auth-helpers-*` strings) |
| `16im4wf58d790.js` | 227,538 | 71,034 | react-dom (`createRoot`, `hydrateRoot`) |
| `0k237onpe_i52.js` | 191,179 | 48,170 | React core + Scheduler |
| `0cz1d0mv5g_q7.js` | 112,594 | 39,490 | polyfills (declared in `polyfillFiles`) |
| `329ytpvpnjlxi.js` | 83,242 | 22,314 | lab page: experiment-shell + simulation canvas + panels |
| `14mrh2-p_w84d.js` | 54,646 | 12,880 | Next runtime internals |
| `1l_yxsdfb0ven.js` | 37,940 | 11,309 | settings pages (privacy/learning-preferences markers) |
| `3s0xm7fb7t4ap.js` | 35,637 | 9,842 | lucide-react icons + sonner (+ inert next-themes code) |
| `1-3at-bas7qha.js` | 27,351 | 8,437 | Next client entry |
| `43kmrq_u0npm-.js` / `1x4v5d386xtyy.js` | 24,541 each | ~8.5K each | onboarding route chunks |
| `2fuqv3p2kibes.js` | 15,133 | 4,656 | dashboard chunk (recent-sessions marker) |
| `1zclemcbm8x9f.js` | 14,178 | 4,537 | onboarding wizard |
| `2uja-qpdl0oea.js` | 11,440 | 4,026 | homepage chunk |
| `turbopack-3fhac3m3-750m.js` | 10,547 | 4,171 | Turbopack runtime |
| `26o5n42w86g6r.js` | 5,869 | 2,623 | misc framework |
| `05-c3ty_6dwfk.js` / `178waco1i3t1s.js` / `0rl-cir2abwev.js` | 1,968–3,377 | ~1–1.5K | route entry chunks (lab, onboarding, settings) |

### 1.2 Total initial client JS per route (from prerendered HTML script lists; transfer = gzip, verified: server gzips, e.g. `1fh6jwbefmqgn.js` transfers 144,518 B ≈ its 143,520 B gzip size)

| Route | Scripts | Raw total | Gzip transfer |
|---|---|---|---|
| `/` | 11 | 1,458,751 B (~1.39 MiB) | ~409,965 B (~400 KiB) |
| `/lab/nuclear-chain-reaction` | 12 | 1,532,521 B (~1.46 MiB) | ~429,262 B (~419 KiB) |

- Biggest initial chunk: **`1fh6jwbefmqgn.js`, 531,518 B raw (143,520 B gz)** — the Next/React runtime plus the shared UI kit; `@base-ui/react` and the AppHeader live here, so it is paid on every route.
- Biggest chunk overall: `3v31btnwc09zd.js` (three.js + gsap, 599,664 B raw). It is **already deferred** — it appears in no initial HTML script list — but it is fetched right after hydration on `/` (hero wave) and on the lab (simulation canvas), adding ~158 KB gz on top of the numbers above.
- Note: this Turbopack build emits **no `app-build-manifest.json`**; totals were derived from the script lists in the prerendered HTML plus file sizes, so they are exact for the static routes. Dynamic routes load the same root files plus their route chunks.

---

## 2. Route table (from `.next/prerender-manifest.json` + `app-path-routes-manifest.json`)

| Route | Static? | Evidence |
|---|---|---|
| `/` | **STATIC** | in `prerender-manifest.routes`, `initialRevalidateSeconds: false`; `.next/server/app/index.html` exists |
| `/lab/nuclear-chain-reaction` | **STATIC** | in `prerender-manifest.routes`; `.next/server/app/lab/nuclear-chain-reaction.html` exists |
| `/dashboard` | **DYNAMIC** | not in prerender manifest; `export const dynamic = "force-dynamic"` in `src/app/dashboard/page.tsx:23` |
| `/onboarding` | **DYNAMIC** | not in prerender manifest; server `auth.getUser()` + DB reads |
| `/settings` | **DYNAMIC** | not in prerender manifest; server `auth.getUser()` + DB reads |
| `/api/adapt`, `/auth/callback` | DYNAMIC | route handlers, `force-dynamic` on `/api/adapt` |
| `dynamicRoutes` | — | empty (no `[param]` routes) |

---

## 3. Cloud-request discipline audit (`src/sync/use-cloud-session-sync.ts`)

- **Fingerprint gating — PASS.** `const fingerprint = JSON.stringify([evidenceRef, workflowRef]); if (fingerprint === lastFingerprint.current) return;` (lines 95–97). Identical evidence/workflow cannot schedule a save.
- **Empty-session guard — PASS.** No save until the first trial or prediction exists (lines 88–93): an empty guest visit never creates a cloud row.
- **Debounce — PASS.** `SAVE_DEBOUNCE_MS = 800` (line 21); the timer is cleared and re-armed on each new fingerprint, so bursts coalesce into one save 800 ms after the last event. **At most 1 save per meaningful event** (fewer for bursts).
- **Dependency discipline — PASS.** The effect depends on the evidence/workflow *references* (lines 43–44), so preference-only session updates (new `session` object, same `evidence`/`workflow` refs) never trigger or cancel a pending save.
- **No per-render requests — PASS.** Every network call site in `src` (enumerated by grep over `fetch(`, `.from(`, `getBrowserClient`, `auth.`) lives inside an event handler or a `useEffect`, never in a render body. Effect-driven fetches are all guarded by refs (`fetching.current`, `cloudPrefsApplied.current`) so they fire at most once per mount/visit.
- **Cost note (not a violation):** each save = 2 HTTP requests by design — `getById` (conflict check) + `upsert` (`cloud-session-repository.ts` / `cloud-session-sync.ts`). Budget is "1 save per event", not "1 request per event".

No request was found that can fire per render or per animation frame.

---

## 4. Program budgets — verification

| # | Budget | Verdict | Evidence |
|---|---|---|---|
| a | No cloud request per animation frame | **PASS** | `SimulationCanvas` animates with `setInterval` (frame delay ≥ 60 ms) into *local* state only (`simulation-canvas.tsx:42-57`); it never mutates session/evidence. The sync hook's fingerprint changes only on user events (predict, run, decide, representation, counterfactual). `hero-wave-background.tsx` drives gsap's ticker against DOM only. No `fetch`/`.from(` anywhere in an animation loop. |
| b | No blocking cloud request before guest lab use | **PASS** | `getBrowserClient()` returns `null` when `NEXT_PUBLIC_SUPABASE_URL`/publishable key are missing/blank (`browser-client.ts:14-16`, `config.ts`). `useSession` initializes `loading=false` when client is null and its effect returns before any request (`use-session.ts:22-25`). AppHeader then renders the guest "Sign in" UI and the lab is fully usable signed out (sync hook early-returns without a user). **Empirically confirmed**: this environment has no Supabase env vars, and `/dashboard` returns 307 → `/?auth=open` (would not render without a blocking guard), while `/` and the lab render fine. |
| c | Dashboard skeleton while loading | **PASS** | `DashboardSkeleton` is the `Suspense` fallback around server-side `DashboardData` (`dashboard/page.tsx:189-191`, `data-testid="dashboard-skeleton"`); the 3 dashboard queries run in parallel behind it (`Promise.all`, lines 64-72). |
| d | Cloud save non-blocking | **PASS** | Debounced save is fired `void run()` from a timeout (`use-cloud-session-sync.ts:102-106`); UI only observes `setStatus`. `markComplete` on "Start over" is fire-and-forget with `.catch` (`experiment-shell.tsx:535-538`); cloud preference fetch is async, once per visit, try/catch (`experiment-shell.tsx:277-307`). |

---

## 5. Real TTFB (server already running on :3100 — `next-server v16.2.12`, PID 97109, started 21:21 before this audit; **left running**)

`time curl` equivalent via `curl -w time_starttransfer`, 3 runs each, `Accept-Encoding: gzip`:

| Route | Runs (s) | Median TTFB (s) | HTML size |
|---|---|---|---|
| `/` | 0.0109 / 0.0014 / 0.0076 | **0.0076** | 25,119 B (5,804 B gz) |
| `/lab/nuclear-chain-reaction` | 0.0037 / 0.0014 / 0.0019 | **0.0019** | 21,056 B |
| `/dashboard` (dynamic, contrast) | 0.189 / 0.010 | 0.010–0.189 | 307 → `/?auth=open` |

Both static pages are served from the prerendered output in single-digit milliseconds. The first dashboard hit is slower because it performs server auth + 3 parallel DB queries.

---

## 6. Dependency check: `next-themes`

**Imported, but inert — flag for removal (with a code touch).** `next-themes` is imported and called in `src/components/ui/sonner.tsx:3,8` (`useTheme()`), so it is *not* an unused import. However, **no `ThemeProvider` is mounted anywhere** (`src/app/layout.tsx` wraps nothing). The installed next-themes `useTheme` returns a no-op default (`{ setTheme(){}, themes: [] }`) outside a provider, so the toaster's `theme` always resolves to the `"system"` fallback. The dependency ships in the sonner/lucide chunk (`3s0xm7fb7t4ap.js`, `prefers-color-scheme` x3) and provides zero runtime behavior. Fix: delete the `useTheme` call, hardcode `theme="system"` (or mount the provider if theming is actually wanted), and drop the package.

---

## 7. Top-5 optimizations (priced in minutes)

1. **Lazy-load the Supabase client off static routes — 45 min.** `40muzspfdncjx.js` (250 KB raw / **66 KB gz**) ships in the *initial* JS of `/` and the lab even though `getBrowserClient()` returns null for every unconfigured guest (and the app is guest-first). Convert `useSession`/`AppHeader` to `next/dynamic`-import the client module only when env vars exist (or move auth UI into a lazily-hydrated island). Biggest measurable win on both static pages.
2. **Drop inert `next-themes` — 15 min.** Delete the `useTheme` call in `sonner.tsx`, hardcode the theme prop, remove the dependency, re-verify the sonner chunk shrinks.
3. **Keep three.js+gsap deferred and make it a tested invariant — 30 min.** `3v31btnwc09zd.js` (588 KB raw / 158 KB gz) is already excluded from initial HTML; add a regression check (grep prerendered HTML for the chunk) and consider lazy-mounting the hero wave only when scrolled into view on `/`.
4. **Shrink the shared runtime chunk `1fh6jwbefmqgn.js` (531 KB raw / 143 KB gz) — 60–90 min.** It bundles `@base-ui/react` plus the AppHeader UI on every route. Switch UI components from barrel `@base-ui/react` to deep imports (`@base-ui/react/menu` etc.) so unused primitives tree-shake, and audit whether the full UI kit must be in the root layout chunk or can move to a per-route chunk.
5. **Cut per-save requests from 2 to 1 — 30 min.** `CloudSessionSync.save()` pays a `getById` + `upsert` per save. Cache the last known cloud snapshot (in-memory or localStorage with a TTL) so only the first save of a session performs the conflict-check GET; subsequent saves upsert directly. Respects the mandated conflict policy while halving cloud traffic during a multi-trial lab session.

**Not measured** (say so plainly): no browser-level profiling (FCP/LCP, main-thread time) was run — only static bundle analysis, route manifests, and curl TTFB. No per-route `app-build-manifest.json` exists in this Turbopack build; route totals were computed from prerendered HTML script lists instead, which is exact for the two static routes.
