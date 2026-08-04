# Accessibility Audit — New Platform Surfaces (A11Y-01)

Date: 2026-08-03 · Auditor: A11Y-01 (read-only)
Scope: sign-in/sign-out dialogs, user menu, app header (+mobile panel/inert), onboarding
wizard, dashboard page + cards, settings page + tabs + four settings panels, cloud sync
status, guest-import & session-resume dialogs, and the new lab header strip in
`experiment-shell.tsx`. The hardened lab itself was out of scope.

Method: static review of every file above against WCAG 2.2 (AA) + 2.5.8/2.5.5 target
sizes; computed contrast ratios for the token palette (and blended/alpha variants);
verified base-ui 1.6 primitive behavior in `node_modules` (Dialog focus in/out, Tabs
ARIA pattern, Menu keyboard model); ran `npx vitest run` on the 7 a11y-relevant
component suites (77/77 pass, including a keyboard-only onboarding walkthrough).
`e2e/keyboard.spec.ts` was NOT run (requires a production build).

---

## 1. Contrast ratios (WCAG 1.4.3 / 1.4.11)

Computed (sRGB, WCAG formula). AA normal-text threshold 4.5:1; UI-component/state
boundary 3:1.

| Pair | Ratio | Result |
|---|---|---|
| `#5b6b79` (muted) on `#ffffff` | 5.49 | PASS |
| `#5b6b79` on `#f5f8fa` (background) | 5.15 | PASS |
| `#5b6b79` on `#edf3f5` (surface-raised) | 4.90 | PASS |
| `#3d4c59` (muted-strong) on `#ffffff` | 8.84 | PASS |
| `#0f766e` (accent/primary) on `#ffffff` | 5.47 | PASS |
| `#0f766e` on `#f5f8fa` | 5.13 | PASS |
| `#ffffff` on `#0f766e` (primary button fg) | 5.47 | PASS |
| `#b42318` (danger) on `#ffffff` | 6.57 | PASS |
| `#9a6700` (warn) on `#ffffff` | 4.87 | PASS |
| `#15803d` (ok) on `#ffffff` | 5.02 | PASS |
| `#175cd3` (info) on `#ffffff` | 5.99 | PASS |
| `white/90` ≈ `#e7e7e9` on `#0b1220` (header pill) | 15.16 | PASS |
| `text-teal-300` `#5eead4` on `#0b1220` | 12.66 | PASS |
| high-contrast mode `#ffffff` on `#0f5f58` | 7.51 | PASS |
| **`text-muted/90` ≈ `#6b7a86` on `#ffffff`** | **4.42** | **FAIL 1.4.3** |
| **`text-muted/90` ≈ `#6b7a86` on `#f5f8fa`** | **4.20** | **FAIL 1.4.3** |
| **`#9a6700` on `bg-warn/10` ≈ `#f5f0e6`** | **4.29** | **FAIL 1.4.3** |
| **`border-primary/60` ≈ `#6fada8` vs white (selected radio card)** | **2.56** | **FAIL 1.4.11** |
| INFO: `#d8e2e8` (border) on `#ffffff` | 1.32 | text-identified controls only |

Every defined token pair passes AA. The three failures are all alpha/blended variants.
No failure appears in the high-contrast mode (all tokens darken).

---

## 2. Findings

| # | SEVERITY | file:line | Issue | WCAG | Fix |
|---|---|---|---|---|---|
| F1 | **MED** | `src/components/lab/experiment-shell.tsx:651` | `text-muted/90` (text-xs) = 4.42:1 on white, 4.20:1 on `#f5f8fa` — the saved-preferences summary strip is unreadable for low-vision users | 1.4.3 (AA) | Use `text-muted-strong` or full `text-muted`; drop the `/90` alpha |
| F2 | **MED** | `src/components/lab/experiment-shell.tsx:716-723` | Notice bar (`role="alert"`) renders `text-warn` on `bg-warn/10` ≈ `#f5f0e6` = 4.29:1 (text-sm) — fails AA normal text | 1.4.3 (AA) | Darken warn text on tinted bg (`text-warn` → `text-[#7a4d00]`-ish or use `text-foreground` like the onboarding save-error does) |
| F3 | **MED** | `src/components/settings/settings-tabs.tsx:72-79` + `src/components/ui/tabs.tsx:27,61` | At 150% root font (text scale / browser zoom) on a 320px viewport: TabsList is fixed `h-8` (32px) while trigger text-sm grows to ~21px line + `py-0.5` → vertical clip; `whitespace-nowrap` + 4 long labels ("Learning preferences", "Privacy and data") overflow horizontally with no scroll container | 1.4.4 (AA), 1.4.10 | Drop the fixed `h-8`; add `overflow-x-auto` to TabsList; allow triggers to wrap or shrink |
| F4 | **MED** | `src/components/onboarding/onboarding-wizard.tsx:566-573` (remove-topic `p-0.5` + `h-3.5` icon ≈ 18×18px); `src/components/lab/experiment-shell.tsx:655,669-675,677-687` (sync-strip `text-xs` buttons ≈ 16–20px tall, no padding); `onboarding-wizard.tsx:552` (chips `py-1` ≈ 28px); `onboarding-wizard.tsx:323` ("Skip for now" ≈ 20px) | Several interactive targets are < 24×24px — genuine WCAG 2.5.8 AA failures (the 18px and 16px ones); the rest (36px hamburger `app-header.tsx:98`, 32px `Button` default `button.tsx:24`, 28px sm buttons, 28px menu items `dropdown-menu.tsx:91`, 32px desktop nav links `app-header.tsx:67`) pass AA but fail 2.5.5 AAA 44px | 2.5.8 (AA) for the sub-24px items; 2.5.5 (AAA) for the rest | Give the sync-strip buttons and remove-topic buttons real padding/min-h-6; consider `p-2`/`min-h-9` on chips and the header hamburger |
| F5 | **LOW** | `src/components/onboarding/onboarding-wizard.tsx:117` (`border-primary/60 bg-primary/10` selected RadioCard) | The selected-state indicator is color-only and below 3:1: selected border ≈ `#6fada8` vs card white = 2.56:1; the checked/unchecked border difference (vs `#d8e2e8`) is ~1.9:1 | 1.4.11 (AA) | Raise border alpha to `/80` or add a check glyph; the state is also announced via the sr-only radio, so SR users are fine — this is sighted low-vision |
| F6 | **LOW** | `src/components/auth/sign-out-dialog.tsx:71-95` + `src/components/ui/dialog.tsx:105` (`DialogFooter` = `flex-col-reverse` on mobile) | On mobile the visual order is reversed, so the destructive "Sign out and clear data on this device" renders TOP-most, above Cancel and the keep-data primary. Standard destructive-action guidance puts the least-destructive option first | (UX/order, not a WCAG failure) | Reorder DOM to `clear, keep, Cancel` with `flex-col-reverse`, or drop `flex-col-reverse` on this dialog |
| F7 | **LOW** | `src/components/auth/sign-out-dialog.tsx:38-59` | While `signOut()` is in flight all buttons are disabled but labels stay static ("Sign out and keep my data…") — no "Signing out…" feedback and no `aria-busy`, so keyboard/SR users get silence during a multi-second operation | 4.1.2 (name/role/value stability), UX | Set busy labels ("Signing out…") and `aria-busy` on the footer while `busy !== null` |
| F8 | **LOW** | `src/components/settings/privacy-settings.tsx:194-221,223-245` | `role="alertdialog"` + `showCloseButton={false}` correctly forces a choice, but base-ui Dialog remains Escape-dismissible by default — Escape bypasses the delete/clear confirmation | APG alertdialog guidance (not a WCAG failure) | Set `dismissible={false}` on these two dialogs, or accept Escape as cancel |
| F9 | **LOW** | `src/components/sync/cloud-sync-status.tsx:52-64` | `role="status"` span text is removed 2.5s after "Saved" (`label = null`), so the live region empties — some SRs announce the removal/blank, causing a double announcement ("Saved" then empty) | 4.1.3 (status messages) | Keep a stable label ("Saved on this device" / "—") instead of null, or keep the region non-empty |
| F10 | **LOW** | `src/app/globals.css:72-77` + `src/components/navigation/app-header.tsx:134` | The `data-reduced-motion` kill-switch covers all CSS animations/transitions (including the `transition-[max-height,opacity]` mobile panel and tw-animate-css dialog animations — verified: `!important` beats inline styles). However the attribute is only set on the lab page (`experiment-shell.tsx:216-219`, which honors OS `prefers-reduced-motion`) and settings (`accessibility-settings.tsx:96-99`, preference only). Header/dashboard/onboarding never map OS reduced-motion → an OS-level reduced-motion user still sees the 300ms panel animation and dialog fades on those pages | 2.3.3 (AAA) / UX | Set the attribute globally (e.g. in the root layout from `matchMedia("(prefers-reduced-motion: reduce)")`) |
| F11 | LOW | `src/components/onboarding/onboarding-wizard.tsx:464-469` | "Text size" output span has fixed `w-24` (96px); at 150% root font "Text size: 150%" (~21px) overflows the box | 1.4.4 (AA) | `min-w` / auto width |
| F12 | INFO | `src/components/auth/user-menu.tsx:88-94` | Sign-out dialog opened from the dropdown: the last-focused element (menu item) unmounts when the menu closes; base-ui Dialog `returnFocus` (verified in `DialogPopup.mjs`: `returnFocus: finalFocus`) targets it and falls back when disconnected. On cancel, verify manually that focus returns to the avatar trigger (both sign-out paths navigate to "/" anyway) | 2.4.3 (AA) | Manual test; if focus lands on body, add `finalFocus` on the Dialog |
| F13 | INFO | `src/components/lab/experiment-shell.tsx:601-604` | When Adaptation Replay opens, the whole shell becomes `inert`; on close, focus restoration targets the "Adaptation Replay" button (replay's own Dialog restores focus — `adaptation-replay.tsx:357-361`). Order of inert-removal vs restore is timing-sensitive | 2.4.3 (AA) | Manual keyboard test of replay open/close; the replay itself was already audited with the lab |

---

## 3. Sign-out dialog — dedicated review (requested item)

`src/components/auth/sign-out-dialog.tsx`

- Naming: `DialogTitle` "Sign out of UnseenLab?" + `DialogDescription` explaining the
  choice — announced on open. PASS.
- Destructive separation: the clear-data action is `variant="destructive"`
  (bg-destructive/10, text-danger, 5.58:1 — readable) and visually distinct from the
  primary keep-data button and the outline Cancel. PASS on desktop (right-most);
  mobile order issue = F6.
- Double-confirmation semantics: choice is forced (Cancel + two explicit outcomes),
  no ambiguous single "Sign out" button. PASS.
- Disabled-while-busy guard (`busy !== null` blocks re-entry) — PASS; missing busy
  feedback = F7.
- Escape: default base-ui Escape closes the dialog = cancels; acceptable here (not a
  data-loss confirmation like F8).
- Local-data nuance is spelled out in the description ("kept private to this browser")
  — good plain-language disclosure.

Verdict on this component: sound structure, two LOW fixes (F6 order, F7 feedback).

---

## 4. PASS list

**Keyboard / focus**
- Dialog focus: base-ui 1.6 verified — `initialFocus` defaults to the popup, `returnFocus`
  to the last focused element (`dialog/popup/DialogPopup.mjs:75,105`); focus trap
  enforced. All dialogs in scope (sign-in, sign-out, guest-import, session-resume,
  delete/clear confirmations) inherit this. PASS.
- Onboarding step-change focus: h1 takes `tabIndex={-1}` and `headingRef.focus({preventScroll})`
  on every step change (`onboarding-wizard.tsx:155-162,349-355`). PASS.
- Radio groups (onboarding RadioCard, settings density) are real `<input type=radio>`
  with shared `name` → arrow-key roving works natively; visible `has-[:focus-visible]`
  ring on the card (`onboarding-wizard.tsx:115`). Verified by the keyboard-only vitest
  walkthrough. PASS.
- Sliders: settings text scale / animation speed are native `<input type="range">`
  (`accessibility-settings.tsx:58-67`) → arrow keys work; values echoed in an
  `<output>`. Onboarding text scale is ± buttons (not a slider) — fully keyboard
  operable. PASS.
- Dropdown menu: base-ui Menu keyboard model (arrows, Home/End, typeahead, Escape),
  focus moves to first item on open and returns to trigger on close. PASS.
- Mobile menu: `aria-expanded` + `aria-controls` + toggle label + `inert` + `aria-hidden`
  on the closed panel (`app-header.tsx:92-97,130-137`). No focus trap needed (disclosure,
  not modal). PASS.
- No keyboard traps found anywhere in scope. PASS.
- `details/summary` (lab "See the result another way", "Compare one change") are
  natively keyboard-operable. PASS.

**Naming / semantics**
- Every dialog has a `DialogTitle` (base-ui links it via aria-labelledby): sign-in
  (`sign-in-dialog.tsx:76`), sign-out (`sign-out-dialog.tsx:65`), guest-import
  (`guest-import-dialog.tsx:92`), resume (`session-resume-dialog.tsx:109`), delete/clear
  (`privacy-settings.tsx:197,226`). PASS.
- Icon-only buttons: dialog close has `<span class="sr-only">Close</span>`
  (`dialog.tsx:75`); remove-topic has `aria-label` (`onboarding-wizard.tsx:568`); menu
  icons are `aria-hidden` (`user-menu.tsx:77,81,89`). PASS.
- Avatar trigger label: `aria-label="Account menu for {name}"` (`user-menu.tsx:50`);
  `AvatarImage alt=""` is correctly decorative. PASS.
- `role="alert"` used for real errors (sign-in `sign-in-dialog.tsx:108`, topic length
  `onboarding-wizard.tsx:537`, save errors, lab notice `experiment-shell.tsx:718`).
  `role="status"` for non-critical progress (step text, text-size echo, "Saved.",
  "Running the simulation…"). Appropriate. PASS.
- Sync status is a polite live region (`cloud-sync-status.tsx:52`) — announced on
  change, no spamming (see F9 for the trailing-empty edge). PASS.
- Progressbar: `role="progressbar" aria-valuemin=1 aria-valuemax=4 aria-valuenow={step}`
  — values correct and complete at step 4 (`onboarding-wizard.tsx:333-345`). PASS.
- Tabs in settings are base-ui `Tabs` → real `role=tablist/tab/tabpanel`, roving
  tabindex, arrow/Home/End keys, `aria-selected`, `TabsList aria-label="Settings
  sections"` (`settings-tabs.tsx:72`, `tabs.tsx`). PASS (F3 is the visual/zoom issue).
- Landmarks: `main id="main-content"` on dashboard/settings/onboarding/lab pages;
  header `nav aria-label` distinct from the lab's "Experiment progress" nav; only one
  nav exposed at a time (mobile panel hidden+inert on desktop). PASS.
- Headings: exactly one `h1` per page in scope (dashboard Greeting
  `dashboard/page.tsx` + `greeting.tsx:70`; per-settings-panel h1, only one panel
  mounted at a time; wizard step h1; lab `experiment-shell.tsx:614`), sections use
  h2/h3 in order. PASS.
- Step indicator: `aria-current="step"` on the active lab step (`experiment-shell.tsx:735`). PASS.

**Contrast** — all named token pairs pass AA (table above); failures are only the
blended F1/F2 and state-indicator F5. High-contrast mode overrides darken every token
to well above threshold. PASS overall.

**Reduced motion** — kill-switch `html[data-reduced-motion="true"] * { animation:
none !important; transition: none !important; }` (`globals.css:72-77`) covers all
CSS-driven animation in scope, including dialog enter/exit (tw-animate-css) and the
mobile panel transition; no inline `animation`/`transition` styles found in the new
surfaces. PASS (OS-level gap on non-lab pages = F10).

**Text scale / zoom** — no fixed-width dashboard cards or dialog bodies (dialogs use
`max-w-[calc(100%-2rem)]`, cards are fluid); header pill fits 320px at 150% (≈250px
used of 288px available). F3 (settings tabs) and F11 (wizard output width) are the only
breakages.

**Tests** — `npx vitest run` on app-header, sign-in, sign-out, user-menu,
onboarding-wizard, dashboard-page, settings-page suites: 7 files / 77 tests pass,
including keyboard-only onboarding and sign-out dialog Escape/name assertions.
`e2e/keyboard.spec.ts` exists (adversarial browser-level coverage) but was skipped —
requires a build; recommended for CI.

---

## 5. Verdict

**BLOCKERS (must fix before participant testing): none.**

All core flows are keyboard-operable, every dialog is named and focus-managed by
base-ui, one h1 per page, real tablist/radio/progressbar semantics, and every named
token passes AA contrast. Nothing prevents a keyboard-only or screen-reader participant
from completing sign-in → onboarding → dashboard → settings → lab.

**Recommended before participant testing (MED — fix these):**

1. F1 + F2 — two 1.4.3 AA contrast failures in the lab header strip (`text-muted/90`,
   warn-on-warn/10). Both are one-line token changes.
2. F4 — sub-24px touch targets (2.5.8 AA): sync-strip `text-xs` buttons
   (`experiment-shell.tsx:655,669,677`) and the 18px remove-topic button
   (`onboarding-wizard.tsx:570`). Especially relevant for touch-tablet participants.
3. F3 — settings tabs clip/overflow at 150% root font on 320px; participants using
   the in-app text scale will hit it.
4. F6 — destructive-first visual order in the sign-out dialog on mobile.

**Acceptable as-is (LOW/INFO):** F5, F7–F13 above. F5/F12/F13 are flagged for manual
verification during the participant-test dry run rather than code changes.
