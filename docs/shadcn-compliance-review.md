# shadcn Compliance Review — UnseenLab (feature/personalized-auth-onboarding-platform)

- **Reviewer:** AGENT UI-01 (shadcn compliance, read-only)
- **Date:** 2026-08-03
- **Scope:** `src/components/ui/*.tsx` (15 generated components), new app components (`auth/**`, `navigation/**`, `onboarding/**`, `dashboard/**`, `settings/**`, `sync/**`, `app/**`, `lab/**`), `src/app/globals.css`, `components.json`
- **Method:** the shadcn skill was NOT loaded during implementation (recorded honestly in docs/skills-audit.md); this review compensated by byte-diffing every local component against the live official registry (`https://ui.shadcn.com/r/styles/base-nova/<name>.json`), Tailwind v4.3.3 real compile of `globals.css` with project content detection, `tsc --noEmit` (0 errors), and schema validation against `https://ui.shadcn.com/schema.json`.

---

## 1. Per-component verdict table

All 15 components are **byte-identical to official base-nova registry stock** except for two classes of diff, both produced by the CLI's normal install-time transforms:
- `IconPlaceholder` (registry's icon-library-agnostic helper) replaced with the concrete lucide-react icon — this is exactly what `npx shadcn add` emits when `components.json` has `"iconLibrary": "lucide"`.
- Removal of preset-utility classes (`cn-font-heading`, `cn-menu-target`, `cn-menu-translucent`, `cn-rtl-flip`) that only exist when font/menu presets are configured. None of those utilities are defined anywhere in this project, so the removals are consistent no-ops (verified: `--font-heading`/`cn-font-*` undefined in `src/`).

No renamed exports, no removed variants, no injected hardcoded colors inside `ui/*`. Typecheck of the whole repo passes (0 errors), and a real Tailwind compile of `globals.css` over the full component tree succeeds — including the exotic variants (`in-data-[slot=…]`, `not-data-[variant=…]:focus:**:…`, `data-open`, `group-data-horizontal/tabs`), which Tailwind v4.3.3 handles natively (verified in compiled CSS output).

| Component | Verdict | Diff vs registry stock | Notes / fix |
|---|---|---|---|
| `button.tsx` | COMPLIANT | none (beyond the import-path alias rewrite) | — |
| `card.tsx` | COMPLIANT (note) | `card.tsx:41` — `cn-font-heading` dropped from `CardTitle` | No-op (utility undefined); if a heading font is ever added, restore it |
| `avatar.tsx` | COMPLIANT | none | `size` prop + `AvatarBadge`/`AvatarGroup` all stock |
| `dropdown-menu.tsx` | COMPLIANT (note) | `dropdown-menu.tsx:44` — `cn-menu-target cn-menu-translucent` dropped from popup; `dropdown-menu.tsx:122` — `cn-rtl-flip` dropped from sub-trigger chevron | No-op without a menu preset; popup still styled (`bg-popover`, `shadow-md`, `ring-1`) |
| `dialog.tsx` | COMPLIANT (note) | `dialog.tsx:125` — `cn-font-heading` dropped from `DialogTitle`; `XIcon` swapped in for `IconPlaceholder` | Same no-op reasoning; keep the lucide import |
| `progress.tsx` | COMPLIANT | none | — |
| `tabs.tsx` | COMPLIANT | none | — |
| `badge.tsx` | COMPLIANT | none | — |
| `skeleton.tsx` | COMPLIANT | none | — |
| `switch.tsx` | COMPLIANT | none | — |
| `input.tsx` | COMPLIANT | none | — |
| `select.tsx` | COMPLIANT (note) | `select.tsx:86` — `cn-menu-target cn-menu-translucent` dropped from popup | Same no-op reasoning |
| `separator.tsx` | COMPLIANT | none | — |
| `alert.tsx` | COMPLIANT | none | — |
| `sonner.tsx` | COMPLIANT | icon swap only | `--normal-bg/--normal-text/--normal-border` + `cn-toast` class match stock |
| `spinner.tsx` | COMPLIANT | icon swap only | `spinner` **is** an official base-nova registry item (verified via registry fetch), not a hand-rolled component |

**Process note:** the mandated flow (CLI init / `add --dry-run --diff`) was not followed — these files were copied in by hand. The copies are faithful, but that is why the init-time artifacts the CLI would have emitted are missing (see §3: the `--radius-*` scale and the `shadcn/tailwind.css` import). That is the single systemic consequence of skipping the CLI.

---

## 2. Usage discipline findings (new app code)

### BLOCKER

None found. The app typechecks, compiles, and every shadcn primitive used is used with a correct composition.

### HIGH

1. **Hand-rolled modal Dialog duplicates the installed shadcn Dialog** — `src/components/lab/adaptation-replay.tsx:361-434` (`function Dialog({ title, onClose, children })`), used at `adaptation-replay.tsx:64` and `:100` (mounted via `experiment-shell.tsx:1012`). A custom focus trap, Escape handler, and `role="dialog" aria-modal="true" aria-label` are re-implemented while `src/components/ui/dialog.tsx` (Base UI Dialog: portal, backdrop, scroll lock, focus management, aria wiring) sits installed and unused. The custom version is in-place (no portal), adds no scroll lock, and uses raw `bg-black/60`. **Fix:** delete the local `Dialog` and render `<Dialog open onOpenChange>` with `DialogContent`/`DialogHeader`/`DialogTitle` (see `guest-import-dialog.tsx` for the exact pattern).

2. **Radius scale tokens are referenced by the components but never defined** — `globals.css` defines only `--radius: 0.5rem` (`globals.css:36`); the official v4 theme defines `--radius-sm … --radius-4xl` (`apps/v4/app/globals.css` upstream: `--radius-md: calc(var(--radius) * 0.8)` etc.). As a result `min(var(--radius-md), 10px)` in:
   - `src/components/ui/button.tsx:25` (size `xs`), `:26` (size `sm`), `:30` (icon-xs), `:32` (icon-sm)
   - `src/components/ui/select.tsx:44` (`data-[size=sm]`)
   is *invalid at computed-value time* → `border-radius: 0`. Every `size="sm"`/`size="xs"` Button (sign-in header button, wizard steppers, retry chips) and the sm Select trigger render with **square corners**. The class compiles (verified in CSS output) but the variable is undefined at runtime. **Fix:** add the scale to `:root`/`@theme inline` in `globals.css`:
   ```css
   --radius-sm: calc(var(--radius) * 0.6);
   --radius-md: calc(var(--radius) * 0.8);
   --radius-lg: var(--radius);
   --radius-xl: calc(var(--radius) * 1.4);
   ```

### MEDIUM

3. **Installed shadcn `Select` is unused; settings use a raw native `<select>`** — `src/components/settings/learning-preferences-settings.tsx:84` hand-rolls `<select className="h-8 w-full rounded-lg border border-input …">` with no chevron and no Base UI behavior, while `src/components/ui/select.tsx` is never imported anywhere (verified by grep). This is the skill's "raw select when shadcn primitives exist" anti-pattern and a visible styling mismatch (no `SelectTrigger` affordance). **Fix:** replace `SelectField`'s native element with `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`.

4. **Installed `Progress` is unused; onboarding hand-rolls a progressbar** — `src/components/onboarding/onboarding-wizard.tsx:333-345` builds `<div role="progressbar" aria-valuemin…>` + inner width bar instead of `src/components/ui/progress.tsx` (installed, zero usages). **Fix:** use `<Progress value={(step/4)*100}><ProgressLabel/><ProgressValue/></Progress>`.

5. **Error/status surfaces use raw `<p role="alert">` instead of the installed `Alert`** — the same 3-line hand-rolled pattern appears at:
   - `src/components/auth/sign-in-dialog.tsx:108`
   - `src/components/onboarding/onboarding-wizard.tsx:537`, `:638-654` (save-error box), `:655-663`
   - `src/components/settings/profile-settings.tsx:161` (saved), `:166` (error)
   - `src/components/settings/learning-preferences-settings.tsx:240`
   - `src/components/settings/accessibility-settings.tsx:251`
   `Alert` is used correctly only in the two SSR load-error states (`src/app/dashboard/page.tsx:143-148`, `src/app/settings/page.tsx`). **Fix:** `Alert variant="destructive"` + `AlertTitle`/`AlertDescription` for all of the above.

6. **Duplicate button system in the lab** — 8+ hand-rolled CTA buttons styled `bg-accent-strong px-4 py-2 … text-white hover:brightness-110` instead of `Button`/`buttonVariants`: `src/components/lab/experiment-shell.tsx:748` and `:821`, `prediction-panel.tsx:180`, `research-mode.tsx:138`, `counterfactual-panel.tsx:125`, `adaptation-card.tsx:168` and `:186`, `simulation-canvas.tsx:148`, `representation-tabs.tsx:121`. Same raw `text-white` + `bg-accent-strong` class bundle duplicated in six files (no shared variant). **Fix:** add a lab action variant via `cva` in `button.tsx` (the documented extension path) or compose `buttonVariants({ variant: "secondary" })` with `className="bg-accent-strong text-white"`.

7. **`space-y-*` used 40× in new code** — the mandated direction is `gap-*`. Representative sites: `src/app/dashboard/page.tsx:105` (`space-y-10`), `onboarding-wizard.tsx:272,361,390,420,434,582`, `available-lab-card.tsx:22,23,53,61`, `recent-sessions.tsx:28,53`, `continue-learning-card.tsx:60`, `preference-summary-card.tsx:48`, `recommendation-card.tsx:111`, `profile-settings.tsx:83`, `privacy-settings.tsx:106`, `accessibility-settings.tsx:141`, `learning-preferences-settings.tsx:156`, `experiment-shell.tsx:850`. **Fix:** convert list/section stacks to `flex flex-col gap-*` (or `grid`).

8. **Custom tab strip in the lab duplicates `Tabs`** — `src/components/lab/representation-tabs.tsx` builds its own mode switcher (selected state at `:121` as `bg-accent-strong text-white`) while `ui/tabs.tsx` is used only in `settings-tabs.tsx`. **Fix:** migrate to `Tabs`/`TabsList`/`TabsTrigger` (orientation prop supports vertical).

9. **`--font-sans: var(--font-geist-sans)` inside `@theme inline`** — `globals.css:108`. Per the shadcn skill, `@theme inline` resolves at parse time and cannot see the runtime variable Next injects via `className` on `<html>`, so the `font-sans` utility resolves to nothing (the app only renders correctly because `body { font-family: var(--font-geist-sans) … }` at `globals.css:120` applies the runtime var directly). **Fix:** literal stack, e.g. `--font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;` (same for mono).

10. **`--color-muted` overloads a pre-existing text-color semantic with the shadcn surface token** — `globals.css:4-19` already defined `--muted: #5b6b79` as a *text* tone; the shadcn mapping `--color-muted: var(--muted)` (`globals.css:84`) makes every *surface* that uses `bg-muted` (CardFooter `bg-muted/50`, Skeleton `bg-muted`, Progress track, AvatarFallback, tabs list `bg-muted`) a mid-dark gray instead of the expected light neutral. In `body.high-contrast` (`globals.css:39-70`) `--muted: #333333` turns Skeleton blocks near-black on white — the wrong direction for a loading indicator. **Fix:** point `--color-muted` at a light surface token (e.g. `--surface-raised`/`--secondary`) and keep `--muted` for text only (or rename the shadcn mapping to `--color-muted-surface`).

### LOW

11. **Destructive confirmations use `Dialog` + `role="alertdialog"`** — `src/components/settings/privacy-settings.tsx:195` and `:224`. The skill directs `AlertDialog` for destructive flows; it is not installed, and `role="alertdialog"` + `showCloseButton={false}` is a reasonable fallback. Recommend `npx shadcn add alert-dialog` later.
12. **`SignInDialog` lacks `DialogDescription`** — `src/components/auth/sign-in-dialog.tsx:75-81`: `DialogHeader`+`DialogTitle` are correct (Base UI auto-wires `aria-labelledby`), but the descriptive paragraph at `:79` is a plain `<p>`, so nothing is wired to `aria-describedby`. All other dialogs (`guest-import-dialog.tsx:93-96`, `session-resume-dialog.tsx:110-116`, `sign-out-dialog.tsx:66-69`, `privacy-settings.tsx`) use `DialogDescription` correctly. **Fix:** add `DialogDescription`.
13. **`Spinner` is dead code** — zero usages (verified by grep). Loading states use disabled buttons + text swaps ("Saving…", "Opening Google…"), which is acceptable; either use `Spinner` in long actions (export, sign-in) or drop it.
14. **Raw `h-px bg-border` dividers instead of `Separator`** — `sign-in-dialog.tsx:93-95` ("or" divider; the skill's auth recipe calls for a social `Separator`), `app-header.tsx:54,74` (dark variant). `Separator` is used only in `profile-settings.tsx:108`.
15. **Home page and header hardcode the dark brand palette** — `src/app/page.tsx` (`bg-[#070b14]`, `text-teal-300`, `bg-teal-500`, `text-gray-400`, `border-white/10`) and `app-header.tsx:46-156` (`bg-[#0b1220]/95`, `text-white/90`, `text-teal-300`) instead of semantic tokens. This is a deliberate marketing/dark-identity surface, but per the skill's "avoid ad-hoc hex values" rule it should be tokenized (e.g. `--color-hero-*`) if it must keep working under the high-contrast variant (currently `text-white/90` and `bg-[#0b1220]` ignore high-contrast entirely — a real a11y gap). Also: home CTA (`page.tsx:88`) is a hand-rolled button instead of `Button`/`buttonVariants`, and the "Interactive lab ready" dot (`page.tsx:78-84`) is a raw span instead of `Badge`.
16. **Raw `<button>` elements (32 total in new code)** — `app-header.tsx:92` (mobile toggle), `onboarding-wizard.tsx:320,548,566` (skip link, topic chips, remove-topic), plus the lab components listed in finding 6. Each could be `Button`; at minimum the header toggle and wizard chips should be.
17. **No `.dark` block** — the base-nova components ship `dark:` variants that can never fire. The app is intentionally light-only with `body.high-contrast`; acceptable, but note the dark header pill sits on light pages with no dark-mode story.
18. **Global `:focus-visible` outline double-skins component rings** — `globals.css:136-140` applies `outline: 3px solid var(--focus); outline-offset: 3px; border-radius: 6px` to every focused element, stacking on top of the components' `focus-visible:ring-3 ring-ring/50`. Consider scoping it to non-interactive elements or removing it.
19. **SVG chart colors are raw hex** — `simulation-canvas.tsx` (`fill="#fbbf24"`, `#0d9488`, `#5eead4`, `stroke="#78350f"`, …), `representation-tabs.tsx:198-220`, `counterfactual-panel.tsx:205,221`. Data-viz colors; consider chart tokens (`--color-chart-*`), and note they will not adapt to high-contrast.
20. **Dialog footers hand-rolled in two sync dialogs** — `guest-import-dialog.tsx:98` and `session-resume-dialog.tsx:118` use `<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">`, which is exactly what `DialogFooter` renders (`dialog.tsx:102-118`). Use `DialogFooter`.

### What is done right (verified)

- **Dialogs:** every dialog except `SignInDialog` ships `DialogTitle` + `DialogDescription` + (where applicable) `DialogFooter`; controlled `open`/`onOpenChange` everywhere.
- **Avatar:** `AvatarFallback` used in `user-menu.tsx:56` and `profile-settings.tsx:96` (with `AvatarImage` guarded by `avatarUrl`).
- **Loading:** `Skeleton` for dashboard (`dashboard/page.tsx:116-138`), onboarding (`onboarding-wizard.tsx:267-281`), greeting (`greeting.tsx:55-62`); buttons disabled during in-flight work everywhere (sign-in, save, export, delete, sign-out).
- **Badge** for statuses in all three dashboard cards; **Alert** for the two SSR error states; **Tabs** in settings; **Switch** for all toggles; **Separator** in profile.
- **Tokens:** new app code consistently uses semantic classes (`bg-card`, `text-muted-foreground`, `border-border`, `text-danger`, `text-ok`, `border-warn/40 bg-warn/10`, `bg-primary/10`) — no ad-hoc grays in the dashboard/settings/onboarding/sync surfaces.
- **Empty states** are designed surfaces (Cards, not placeholder text) in `recent-sessions.tsx:35-51`, `continue-learning-card.tsx:93-105`, `preference-summary-card.tsx:76-91`.
- `tsc --noEmit` passes with 0 errors.

---

## 3. Token review (`src/app/globals.css`)

- **Coverage:** all tokens the base-nova components consume are mapped in `@theme inline` (`globals.css:79-110`): background, foreground, card(+fg), popover(+fg), primary(+fg), secondary(+fg), muted(+fg), accent(+fg), destructive(+fg), border, input, ring, radius. Matches the palette (`--primary`/`--accent` = brand teal `#0f766e`, `--destructive` = `#b42318`, `--ring` = `#0e7490`).
- **High-contrast variant:** `body.high-contrast` (`globals.css:39-70`) re-maps every shadcn token (deeper `--primary: #0f5f58`, `--destructive: #9f1717`, `--input: #111111`, `--muted-foreground: #333333`). Good — with two caveats: (a) the `--muted` surface overload (finding 10) produces near-black `bg-muted` skeletons; (b) the dark header/hero (`app-header.tsx`, `page.tsx`) bypass the variant entirely.
- **Conflicts with pre-existing tokens:**
  - `--muted` (text semantic) now also feeds the shadcn *surface* token — overload (finding 10).
  - `--accent` (brand teal) is also the shadcn hover/accent surface: dropdown items, tabs, selects get a teal `focus:bg-accent` with white text. Deliberate-looking brand choice; contrast holds; noted for awareness.
  - **Missing radius scale** (`--radius-sm/md/lg/xl/2xl/3xl/4xl`) — components reference `--radius-md` (finding 2, HIGH).
  - No `--chart-*`/`--sidebar-*` tokens — no chart/sidebar components installed; not an error.
  - No `.dark` — intentional (finding 17).
- The global `:focus-visible` outline (`globals.css:136-140`) predates the components and stacks with `ring-*` (finding 18).

## 4. `components.json` vs official schema

Validated against `https://ui.shadcn.com/schema.json` (HTTP 200): required keys (`style`, `tailwind{config,css,baseColor,cssVariables}`, `rsc`, `aliases{utils,components}`) all present; `"style": "base-nova"` is in the official enum (one of 24 valid styles); `"iconLibrary": "lucide"` matches the icon rewrite observed in the components; `"baseColor": "neutral"` is a valid string. `"tailwind.config": ""` is the documented Tailwind v4 convention. No `registries` block — fine (optional). Only note: `baseColor: "neutral"` is informational here because the theme is a custom teal palette, not a base color preset.

---

## 5. Final verdict

**Safe to ship, with 2 must-fix items and a short must-do list.** The 15 generated components are registry-faithful (no hand-edits beyond the CLI's standard icon/preset transforms), `components.json` is schema-valid, the typecheck is clean, and usage discipline in the new app code is broadly strong (dialogs, avatars, skeletons, badges, alerts, disabled states, semantic tokens, designed empty states).

**Must-fix before/with ship:**
1. **HIGH — define the `--radius-*` scale in `globals.css`** (finding 2). Without it, `size="sm"`/`xs` buttons and the sm select render with 0 border-radius (`button.tsx:25,26,30,32`, `select.tsx:44`).
2. **HIGH — replace the hand-rolled modal in `adaptation-replay.tsx:361-434` with the shadcn `Dialog`** (finding 1). Duplicate system + no portal/scroll-lock.

**Should-fix (MEDIUM, next pass):** use `Select` in learning-preferences (`learning-preferences-settings.tsx:84`), use `Progress` in the wizard (`onboarding-wizard.tsx:333-345`), migrate the six `<p role="alert">` error surfaces to `Alert` (finding 5), add a shared lab-action button variant (finding 6), convert the 40 `space-y-*` usages to `gap-*` (finding 7), replace the custom representation tab strip (finding 8), literal font stack in `@theme inline` (finding 9), de-overload the `muted` token (finding 10).

**Process recommendation:** the CLI was skipped; the artifacts it would have emitted (radius scale, `@import "shadcn/tailwind.css"`) were the only casualties. The components are correct as-is; for future changes run the mandated flow (`npx shadcn@latest add <name> --dry-run --diff` / `init -d`) so registry drift can't reappear silently.
