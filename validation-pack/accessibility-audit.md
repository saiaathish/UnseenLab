# UnseenLab — Accessibility Audit and Test Plan

> **RE-STAMPED on the final-hardening branch.** The "Current implementation status" lines in
> the test bodies below reflect the ORIGINAL audit snapshot. On the final-hardening branch the
> following statuses are **superseded** (verified in source and covered by tests); treat the
> correction table as authoritative:
>
> | Test | Original status | Current status (final-hardening) |
> |---|---|---|
> | A11Y-012 (accessibility settings) | IMPLEMENTED (incl. feedback timing radios) | IMPLEMENTED — the `feedbackTiming` radio group was REMOVED (dead control); remaining controls: animation speed, reduced motion, information density, one-variable mode, high contrast, text size, preferred views |
> | A11Y-016 (replay dialog scroll/closable) | PARTIAL | PARTIAL — unchanged; closes fine, small-viewport scrolling needs manual confirmation |
> | A11Y-022 (dialog initial focus) | MISSING | **IMPLEMENTED** — focus moves to the Close button on open (`adaptation-replay.tsx`, focus management on mount) |
> | A11Y-023 (dialog focus trap) | MISSING | **IMPLEMENTED** — Tab/Shift+Tab are trapped inside the dialog |
> | A11Y-024 (focus restore on close) | MISSING | **IMPLEMENTED** — focus returns to the opener on close |
> | A11Y-026 (roving tabindex on tabs) | MISSING | **IMPLEMENTED** — representation tabs implement the WAI-ARIA tabs pattern (roving tabindex, Arrow Left/Right with wrap, `representation-tabs.tsx`) |
> | A11Y-028 (skip-to-content link) | MISSING | MISSING — unchanged |
> | A11Y-030 (OS `prefers-reduced-motion`) | MISSING | **IMPLEMENTED** — `matchMedia("(prefers-reduced-motion: reduce)")` seeds the preference on load (lab shell and homepage components); manual override wins |
> | A11Y-043 (aria-live spam while playing) | PARTIAL | **FIXED** — no `aria-live` region exists in the lab components anymore; the state summary is plain content with deliberate announcements only |
> | A11Y-049 (planned-lab card semantics) | MISSING (semantics) | **RESOLVED** — the landing page no longer renders `aria-disabled` div cards; future labs are a native `<details>`/`<summary>` list |
> | A11Y-050 (primary-button contrast) | MISSING | **FIXED** — `--accent-strong` is now `#0f766e` (white on it ≈ 5.5:1, passes AA) |
> | A11Y-052 (text-size effectiveness) | MISSING | **FIXED** — text scale is applied to `document.documentElement.style.fontSize`, so rem-based text scales |
> | A11Y-061 (one-variable explanation loss) | PARTIAL | PARTIAL — unchanged |
> | A11Y-066 (announce view switches) | PARTIAL | PARTIAL — unchanged |
> | A11Y-069 (`feedbackTiming` dead control) | MISSING (consumer) | **RESOLVED** — control removed; nothing in the settings UI promises behavior that does not exist |

**Product:** UnseenLab — Adaptive Virtual STEM Laboratory (Next.js 16 / React 19 / Zod 4 / Tailwind v4), Track 1 (AI for Learners Who Think Differently). Implemented lab: Conceptual Nuclear Chain Reaction at `/lab/nuclear-chain-reaction`.

**Audit date:** 2026-08-03

**Method:** Static source inspection (citations below) plus a planned manual test battery. **The manual tests have NOT been executed.** Every test carries a "Current implementation status" line derived from source inspection:

- **IMPLEMENTED** — behavior exists in source; manual execution still pending.
- **PARTIAL** — behavior exists but is incomplete or risky (detail in test).
- **MISSING** — required behavior is absent from source (static-proven fail).
- **NOT YET INSPECTABLE** — requires manual execution; source alone cannot decide.

Scope: one lab (`/lab/nuclear-chain-reaction`), the landing page, and the learner settings that apply lab-wide. Design participant: a ~17-year-old high-school senior with disclosed ADHD for whom interactivity and animation matter; universal-design position (any learner who benefits from interactivity, animation, representation choice, reduced information density, adjustable pacing, explicit causal comparison). No clinical claims.

**Severity scale:** S0 Disqualifying | S1 Winner-blocking | S2 Finalist-blocking | S3 Important | S4 Polish.

**Rubric weights:** Impact on Neurodivergent Youth 30% | Innovation in AI Application 25% | Usability and Accessibility 25% | Technical Execution 10% | Presentation Quality 10%.

---

## Section 0 — Summary

| Area | Tests | IMPLEMENTED | PARTIAL | MISSING | NOT YET INSPECTABLE |
|---|---|---|---|---|---|
| 1. Keyboard | 17 | 16 | 0 | 0 | 1 |
| 2. Focus | 9 | 5 | 0 | 1 | 3 |
| 3. Motion | 7 | 7 | 0 | 0 | 0 |
| 4. Screen readers | 10 | 9 | 0 | 1 | 0 |
| 5. Visual presentation | 8 | 5 | 0 | 0 | 3 |
| 6. Cognitive accessibility | 9 | 6 | 2 | 0 | 1 |
| 7. Interactivity and animation | 6 | 4 | 0 | 0 | 2 |
| **Total** | **66** | **52** | **2** | **1** | **10** |

Pass count (by inspection, after the final-hardening re-stamp): **52** — all pending manual execution. Fail count (static-proven): **1**. Open items: **12** (2 partial, 10 not yet inspectable).

> Re-stamp note: at the original audit the counts were 42 IMPLEMENTED / 4 PARTIAL / 10 MISSING / 10 open. The final-hardening branch fixed nine of the ten static-proven failures (focus management A11Y-022..024, roving tabs A11Y-026, OS reduced motion A11Y-030, planned-card semantics A11Y-049, primary-button contrast A11Y-050, text-scale effectiveness A11Y-052, `feedbackTiming` A11Y-069) and the aria-live spam risk (A11Y-043). The one remaining static-proven miss is the skip-to-content link (A11Y-028, S4).

The original four most consequential failures are all resolved on the final-hardening branch:

1. **Adaptation Replay dialog focus management** (initial focus, trap, restore) — **IMPLEMENTED** (`src/components/lab/adaptation-replay.tsx`: focus moves to the Close button on open, Tab/Shift+Tab are trapped, focus returns to the trigger on close).
2. **OS `prefers-reduced-motion` support** — **IMPLEMENTED** (seeded from `matchMedia` on load in the lab shell and homepage components; manual override wins).
3. **`aria-live` summary announcing every animation step** — **FIXED** (no `aria-live` region in the lab components; the summary is announced at deliberate points only).
4. **Text-size preference no-op** — **FIXED** (applied at `document.documentElement` font-size, so rem-based text scales; also the primary-button contrast failure A11Y-050 is fixed via `--accent-strong: #0f766e`).

---

## Area 1 — Keyboard (A11Y-001..017)

Requirement: every task in the learner flow — landing, lab entry, prediction, variable control, playback, representation switching, accessibility settings, adaptation decisions, counterfactual comparison, replay, export, deletion — must be fully operable with Tab / Enter / Space / Arrow keys. **Fail if drag is mandatory anywhere.** All controls inspected are native `button` / `input` / `select` elements; no drag-only interaction was found in source.

### A11Y-001 — Landing page: reach the lab with the keyboard
| Field | Content |
|---|---|
| Setup | Load `/` fresh. |
| Steps | Tab from page load to the topic input ("What topic do you need help with?"); type a supported topic and press Enter, or Tab to the "Start this lab" link and press Enter. Tab past the "Future labs" list. |
| Expected result | The topic input routes into the lab on Enter, and the "Start this lab" link (`src/app/page.tsx`) is reachable and activates on Enter. Future labs are a native `<details>`/`<summary>` list — cleanly keyboard-operable. (RE-STAMPED: the old "Enter the lab" link was replaced by the topic-input hero + "Start this lab" on the final-hardening branch.) |
| Failure condition | Any focusable element that traps focus, or a page where Enter does not navigate. |
| Severity | S3 — keyboard entry is baseline usability, but a skip here does not block judging (S1 requires flow-level breakage). |
| Rubric weight | Usability and Accessibility (25%) — keyboard entry is the base gate for the whole lab. |
| Current implementation status | IMPLEMENTED (manual execution pending). |
| Repair estimate | n/a. |

### A11Y-002 — Lab header actions toggle and close with keyboard
| Field | Content |
|---|---|
| Setup | Enter the lab. |
| Steps | Tab to "Accessibility & display", "Adaptation Replay", "Research mode" (`src/components/lab/experiment-shell.tsx:344-368`); activate each with Enter and Space; close with the same control. |
| Expected result | All three toggle correctly and announce their `aria-expanded` state (`experiment-shell.tsx:347,362`). |
| Failure condition | A button that cannot be activated with Enter or Space, or a panel that cannot be closed. |
| Severity | S3 — settings are reachable another way only by reloading; still recoverable. |
| Rubric weight | Usability and Accessibility (25%) — settings panel is a core adaptive feature. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-003 — Prediction choice: radio group with arrow keys
| Field | Content |
|---|---|
| Setup | Fresh lab session. |
| Steps | Tab into the prediction choice group (`src/components/lab/prediction-panel.tsx:89-110`); use Arrow Up/Down and Arrow Left/Right to move between options; Tab to the textarea. |
| Expected result | Native radio semantics: arrow keys move selection, Tab moves out of the group. |
| Failure condition | Arrow keys do nothing or selection cannot change without the pointer. |
| Severity | S3 — one of three prediction controls; textarea remains a fallback. |
| Rubric weight | Usability and Accessibility (25%) — prediction is the first mandatory task. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-004 — Free-text prediction field
| Field | Content |
|---|---|
| Setup | Prediction panel open. |
| Steps | Tab to "Your prediction in your own words" textarea (`prediction-panel.tsx:112-122`); type; Tab away and back. |
| Expected result | Labeled textarea; text persists until submit; focus returns predictably. |
| Failure condition | Unlabeled textarea or lost input. |
| Severity | S3 — optional field, but part of the required flow's affordance. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — free expression matters for this learner profile. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-005 — Confidence slider keyboard control
| Field | Content |
|---|---|
| Setup | Prediction panel open. |
| Steps | Tab to the confidence range (`prediction-panel.tsx:132-143`); Arrow keys step 1..5; Home and End jump to bounds; verify `<output>` changes. |
| Expected result | Full keyboard operation with announced value. |
| Failure condition | Arrows do not move the slider. |
| Severity | S3 — slider is native; failure would be unexpected. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — low-pressure self-assessment is part of the design. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-006 — Submit prediction: disabled until valid, activates on Enter
| Field | Content |
|---|---|
| Setup | Prediction panel, nothing entered. |
| Steps | Tab to "Submit prediction"; observe disabled state (`prediction-panel.tsx:160-161`); choose a radio option; press Enter. |
| Expected result | Button becomes enabled only when a choice or free text exists; Enter submits. |
| Failure condition | Submit possible with empty answer, or Enter does not submit. |
| Severity | S3 — blocking control in the mandatory prediction gate. |
| Rubric weight | Usability and Accessibility (25%) — clear consequence of "predict first" flow. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-007 — Run trial with keyboard
| Field | Content |
|---|---|
| Setup | Prediction submitted. |
| Steps | Tab to "Run trial" (`experiment-shell.tsx:409-415`); press Enter; also try running with no prediction to trigger the alert. |
| Expected result | Trial runs; with no prediction the `role="alert"` notice appears (`experiment-shell.tsx:383-390`). |
| Failure condition | Run button unreachable or alert not announced. |
| Severity | S3 — core loop control. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-008 — Parameter sliders all keyboard-operable
| Field | Content |
|---|---|
| Setup | Lab, prediction submitted. |
| Steps | Tab through absorber position, starting neutrons, material density, neutron absorption chance, duration (`src/components/lab/variable-controls.tsx:69-104`); Arrow Left/Right on each; Home/End. |
| Expected result | Each slider moves with arrows, shows its `<output>` value (`variable-controls.tsx:79-84`), and has a labeled `<label htmlFor>` (`variable-controls.tsx:76-78`). |
| Failure condition | Any of the five sliders unresponsive to arrows. |
| Severity | S3 — all five are native inputs; failure would indicate a rendering regression. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — tactile, incremental variable control is a core adaptive feature. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-009 — Seed (advanced) toggle and slider
| Field | Content |
|---|---|
| Setup | Variable controls panel. |
| Steps | Tab to "Show advanced: randomness seed" (`variable-controls.tsx:107-114`); activate; verify slider appears and `aria-expanded` flips; operate slider with arrows. |
| Expected result | Progressive disclosure works and the hidden slider is keyboard-reachable. |
| Failure condition | Seed slider unreachable after toggle, or `aria-expanded` static. |
| Severity | S3 — advanced control; hidden behind toggle. |
| Rubric weight | Innovation in AI Application (25%) — seed = deterministic reproducibility, the counterfactual guarantee. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-010 — Playback buttons (Play/Pause/Step/Reset)
| Field | Content |
|---|---|
| Setup | Run a trial; canvas renders. |
| Steps | Tab to Play/Pause, Step backward, Step forward, Reset (`src/components/lab/simulation-canvas.tsx:128-171`); activate each with Enter and Space; verify disabled states at first/last step. |
| Expected result | All four buttons operable; `aria-label` reads "Play animation", "Pause animation", "Step backward", "Step forward", "Reset animation to the start" (`simulation-canvas.tsx:131,143,155,167`); disabled at boundaries (`:142,154,166`). |
| Failure condition | Any playback button unreachable or boundary disabled states wrong. |
| Severity | S1 if broken — playback is the core interaction for the design participant. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — animation pacing control is the flagship adaptation. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-011 — Representation tabs activation
| Field | Content |
|---|---|
| Setup | Run a trial. |
| Steps | Tab into the tablist (`src/components/lab/representation-tabs.tsx:43-59`); activate each of Animation, Graph, Equation, Causal, Plain language with Enter/Space. |
| Expected result | Every tab activates and switches the panel; `aria-selected` updates (`representation-tabs.tsx:48`). |
| Failure condition | A tab that does not switch the view. |
| Severity | S3 — all tabs remain Tab-reachable; see A11Y-026 for missing arrow navigation. |
| Rubric weight | Innovation in AI Application (25%) — five representations are the product's core differentiator. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-012 — Accessibility settings fully keyboard-operable
| Field | Content |
|---|---|
| Setup | Open "Accessibility & display". |
| Steps | Tab through: animation speed slider, reduced-motion toggle (`src/components/lab/accessibility-controls.tsx`), information density radios, one-variable toggle, high-contrast toggle, text size slider, preferred views checkboxes. (The former "Feedback timing" radio group was REMOVED on the final-hardening branch — it was a dead control.) Toggle switches with Space; confirm `role="switch"` and `aria-checked` flip. |
| Expected result | Every control operable with keyboard; each has a visible label and current value. |
| Failure condition | Any setting unreachable or a toggle that cannot be flipped with Space. |
| Severity | S1 if broken — the settings block is the product's accessibility promise. |
| Rubric weight | Impact on Neurodivergent Youth (30%) + Usability and Accessibility (25%) — self-service adaptation is the thesis. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-013 — Adaptation card: Accept / Reject / Modify with keyboard
| Field | Content |
|---|---|
| Setup | Trigger an adaptation (e.g., change 2+ variables → freeze_variables). |
| Steps | Tab to Accept / Reject / Modify (`src/components/lab/adaptation-card.tsx:167-191`); activate Modify; Tab through change checkboxes (123-143); apply with "Apply selected" (146-156) or Cancel (157-163). |
| Expected result | All decisions reachable and actionable; the "pending" proposal disappears after a decision (`experiment-shell.tsx:272`). |
| Failure condition | Modify sub-form unreachable by keyboard, or Accept/Reject do nothing. |
| Severity | S1 if broken — learner agency over adaptations is the product's ethical core. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — "you decide, nothing is forced" is the trust contract. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-014 — Counterfactual Microscope with keyboard
| Field | Content |
|---|---|
| Setup | Run a trial. |
| Steps | Tab to variable `<select>` (`src/components/lab/counterfactual-panel.tsx:69-94`); choose with arrows; tab to new-value slider (109-118); activate "Run comparison" (122-128). |
| Expected result | All three controls native and operable; result renders with a text explanation (`counterfactual-panel.tsx:186-190,234`). |
| Failure condition | Select or slider unusable by keyboard. |
| Severity | S3 — standard form controls; failure unlikely. |
| Rubric weight | Innovation in AI Application (25%) — same-seed single-variable comparison is the causal microscope. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-015 — Export and clear-session with keyboard
| Field | Content |
|---|---|
| Setup | Open "Research mode". |
| Steps | Tab to "Export anonymous session data (JSON)" (`src/components/lab/research-mode.tsx:135-141`); activate; verify a download starts. Tab to "Clear local session" (142-159); activate once; verify label changes to "Really clear? Press again to confirm"; activate again. |
| Expected result | Two-step destructive confirm is keyboard-operable; the confirm label change is visible text (announced on focus return). |
| Failure condition | One press clears data, or the export does not download. |
| Severity | S3 — destructive action has a guard; data export is learner-initiated. |
| Rubric weight | Technical Execution (10%) — local-only storage and export are the privacy architecture. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-016 — Adaptation Replay dialog scrollable and closable by keyboard
| Field | Content |
|---|---|
| Setup | Run at least one trial; open "Adaptation Replay". |
| Steps | Press Escape; reopen; Tab to the Close button (`src/components/lab/adaptation-replay.tsx:277-284`); activate. With a long replay, scroll the 9-step list on a short viewport. |
| Expected result | Escape closes (listener at `adaptation-replay.tsx:43-49`); Close button works; content is reachable and scrollable. |
| Failure condition | Escape fails, or on short viewports the overflow container (`adaptation-replay.tsx:269`) cannot be scrolled because it is not focusable and content overflows. |
| Severity | S3 — Escape and Close work; overflow scrolling on short screens is the risk. |
| Rubric weight | Usability and Accessibility (25%) — replay is a whole-learning review surface. |
| Current implementation status | PARTIAL — closes fine; scrollability on small viewports needs manual confirmation (risk: non-focusable `overflow-y-auto` region, `adaptation-replay.tsx:269`). |
| Repair estimate | 0.25h if scrolling is broken (add `tabIndex={0}` on the scroll region or shorten the list). |

### A11Y-017 — Explicit: no drag-only interaction anywhere (fail if drag is mandatory)
| Field | Content |
|---|---|
| Setup | Full lab walkthrough with keyboard only. |
| Steps | Complete the entire learner flow — predict, adjust all six parameters, run, play/pause/step/reset, switch all five representations, change every accessibility setting, accept/reject/modify an adaptation, run a counterfactual, open the replay, export, clear — without touching the pointer. |
| Expected result | Every step is possible with Tab/Enter/Space/Arrows; no widget requires a drag gesture (source scan confirms only native `button`/`input`/`select` elements exist: `variable-controls.tsx:86-96,107-114`; `simulation-canvas.tsx:128-171`; `adaptation-card.tsx:128-163`; `counterfactual-panel.tsx:69-128`). |
| Failure condition | Any task requires pointer-only interaction (drag-scrub, hover-dependent control). |
| Severity | S0 — a drag-mandatory widget would disqualify the accessibility claim. |
| Rubric weight | Usability and Accessibility (25%) — absolute gate for keyboard users. |
| Current implementation status | IMPLEMENTED (by inspection; manual confirmation pending). |
| Repair estimate | n/a. |

---

## Area 2 — Focus (A11Y-020..028)

Requirement: visible focus at all times, logical tab order, focus is moved deliberately after dialogs, after adaptation decisions, and after simulation completion, and no keyboard traps exist. **Known gap: the Adaptation Replay dialog never manages focus.**

### A11Y-020 — Visible focus indicator everywhere
| Field | Content |
|---|---|
| Setup | Any screen. |
| Steps | Tab through every control in default and high-contrast mode. |
| Expected result | A 2px `--focus` outline with 2px offset on every keyboard focus (`src/app/globals.css:70-74`). |
| Failure condition | Any control with no visible focus, or focus styles disabled in high-contrast mode (`globals.css:34` sets `--focus: #0d47a1`). |
| Severity | S1 — invisible focus makes the lab unusable for keyboard learners. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — focus clarity is a low-effort, high-value accommodation. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-021 — Logical tab order through the whole flow
| Field | Content |
|---|---|
| Setup | Fresh session. |
| Steps | Walk Tab order: header → prediction → variables → run → canvas controls → tabs → adaptation → counterfactual → research mode. |
| Expected result | Order follows reading order (`experiment-shell.tsx:392-455` grid: left column then center then right); no jumps into hidden panels (settings/replay/research are rendered only when open, `experiment-shell.tsx:372-381,457-470,472-479`). |
| Failure condition | Focus jumps behind an open overlay or skips a panel. |
| Severity | S3 — recoverable, but disorienting for ADHD learners. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — predictable order reduces cognitive load. |
| Current implementation status | NOT YET INSPECTABLE (manual). |
| Repair estimate | n/a. |

### A11Y-022 — Dialog receives initial focus on open (FAILING)
| Field | Content |
|---|---|
| Setup | Run one trial; open "Adaptation Replay". |
| Steps | Note where focus lands when the dialog opens. |
| Expected result | Focus moves into the dialog (traditionally to the Close button or first step heading). |
| Failure condition | Focus stays on the "Adaptation Replay" launcher or on `<body>` — source has no focus call anywhere in `src/components/lab/adaptation-replay.tsx` (only a keydown listener at :43-49). Screen readers announce the page behind, not the dialog. |
| Severity | S1 — with `aria-modal="true"` (`adaptation-replay.tsx:272`) the contract with assistive tech is broken; a screen-reader user cannot tell the replay opened. |
| Rubric weight | Usability and Accessibility (25%) — modal dialog semantics without focus management is a known AA-level failure. |
| Current implementation status | MISSING. |
| Repair estimate | 0.5h (focus the Close button in a layout effect on mount). |

### A11Y-023 — Dialog focus trap (FAILING)
| Field | Content |
|---|---|
| Setup | Replay dialog open. |
| Steps | Tab repeatedly; Shift+Tab repeatedly. |
| Expected result | Focus cycles inside the dialog and never reaches the page behind. |
| Failure condition | Focus leaves the dialog and reaches lab controls behind the overlay — source has no trap logic (no keydown handler for Tab in `adaptation-replay.tsx:43-49`). The page remains interactive and reachable behind `aria-modal="true"`. |
| Severity | S1 — keyboard and screen-reader users can stray behind a modal overlay; the replay claims exclusive mode it does not enforce. |
| Rubric weight | Usability and Accessibility (25%) — WCAG 2.4.3 / 2.1.2 modal behavior. |
| Current implementation status | MISSING. |
| Repair estimate | 1.5h (trap Tab/Shift+Tab within the dialog container, or adopt a `focus-trap` primitive). |

### A11Y-024 — Focus restored after dialog close (FAILING)
| Field | Content |
|---|---|
| Setup | Replay dialog open; close it (Escape or Close). |
| Steps | Observe where focus lands after close. |
| Expected result | Focus returns to the "Adaptation Replay" button (`experiment-shell.tsx:353-359`). |
| Failure condition | Focus returns to `<body>` — source has no restore logic; the launcher is not re-focused (`adaptation-replay.tsx` unmounts without touching focus). |
| Severity | S1 — a screen-reader or keyboard user who closes the dialog must re-walk the whole page to continue. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | MISSING. |
| Repair estimate | 0.5h (remember the trigger element on open; restore on close). |

### A11Y-025 — Focus after adaptation Accept/Reject/Modify
| Field | Content |
|---|---|
| Setup | Trigger an adaptation; accept it. |
| Steps | After pressing Accept/Reject/Apply selected, note the focus location. |
| Expected result | Focus lands on a sensible successor: the next proposal, or the adaptation section heading (`adaptation-card.tsx:62`). |
| Failure condition | Focus jumps to `<body>` because the proposal element unmounts (`experiment-shell.tsx:272` removes the proposal from state) — React drops focus on removal. |
| Severity | S3 — recoverable by Tab, but a trust break after a decision the learner just made. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — where focus lands right after a decision shapes perceived control. |
| Current implementation status | NOT YET INSPECTABLE (manual; source risk noted). |
| Repair estimate | 0.5h if it fails (move focus to the section heading or next card). |

### A11Y-026 — Roving tabindex on representation tabs (FAILING)
| Field | Content |
|---|---|
| Setup | Run a trial. |
| Steps | Tab to the tablist; press Arrow Left/Right; Arrow Up/Down. |
| Expected result | Only the active tab is in the tab order; arrows move selection per WAI-ARIA tabs pattern. |
| Failure condition | Arrow keys do nothing and all five tabs are individually Tab-stops — current source: `role="tablist"`/`role="tab"` are present (`representation-tabs.tsx:43-59`) but every tab is a plain focusable button; no roving tabindex, no arrow handling. |
| Severity | S3 — tabs are fully usable via Tab+Enter; the pattern miss is an assistive-tech and efficiency regression, not a blocker. |
| Rubric weight | Usability and Accessibility (25%) — ARIA pattern conformance. |
| Current implementation status | MISSING. |
| Repair estimate | 1h (roving `tabIndex` + Arrow Left/Right handler). |

### A11Y-027 — Focus after simulation completion
| Field | Content |
|---|---|
| Setup | Play the animation to the end (or step to the last frame). |
| Steps | Observe focus while playback ends; check the `role="status"` stop label (`simulation-canvas.tsx:90-97`) is announced. |
| Expected result | Focus never moves on its own during playback (canvas never auto-plays on mount, `simulation-canvas.tsx:22-24`); at completion the stop reason is announced via `role="status"` (`simulation-canvas.tsx:92`). |
| Failure condition | Playback steals focus, or the completion announcement is never delivered. |
| Severity | S3 — passive completion is the desired behavior; focus theft would fail. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — no forced attention shifts. |
| Current implementation status | NOT YET INSPECTABLE (manual; source design is passive). |
| Repair estimate | n/a. |

### A11Y-028 — Skip-to-content link
| Field | Content |
|---|---|
| Setup | Any page. |
| Steps | Press Tab on load. |
| Expected result | A "Skip to main content" link appears first and jumps to `<main>` (`experiment-shell.tsx:392`; landing `<main>` at `src/app/page.tsx:10`). |
| Failure condition | No skip link exists — none found in `layout.tsx`, `page.tsx`, or `experiment-shell.tsx`. |
| Severity | S4 — the header is short; skip links matter most on long pages. |
| Rubric weight | Presentation Quality (10%) — a visible-a11y nicety for demos. |
| Current implementation status | MISSING. |
| Repair estimate | 0.25h. |

---

## Area 3 — Motion (A11Y-030..036)

Requirement: learners must be able to eliminate, pause, slow, and step through animation; the system must respect the OS reduced-motion preference; and no flashing or uncontrolled bursts may occur. The app's in-app reduced-motion implementation is solid; **the OS-preference hook is missing.**

### A11Y-030 — OS `prefers-reduced-motion` honored (FAILING)
| Field | Content |
|---|---|
| Setup | macOS: System Settings → Accessibility → Display → Reduce motion ON. Load the lab with default settings. |
| Steps | Enter the lab; run a trial. |
| Expected result | The app detects `prefers-reduced-motion: reduce` and behaves as if reduced motion is on (static frames, no pulses, slower base cadence). |
| Failure condition | No `matchMedia("(prefers-reduced-motion: reduce)")` call exists anywhere in `src/` — reduced motion is only the manual toggle (`accessibility-controls.tsx:49-55` → `experiment-shell.tsx:100-104` → `simulation-canvas.tsx:34`). An OS-level reduced-motion user gets full motion by default. |
| Severity | S2 — WCAG 2.2.2 pause/stop is satisfied by the reachable manual toggle (AA), so this is not S1; but it is the highest-profile motion gap for a motion-forward product, and borders S1 given the judging theme. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — motion sensitivity is a common disclosure; first-run experience must not assume animation is welcome. |
| Current implementation status | MISSING. |
| Repair estimate | 2h (init pref from `matchMedia`, subscribe to change, keep manual override wins; add a Playwright test with emulated media). |

### A11Y-031 — In-app reduced-motion toggle works end to end
| Field | Content |
|---|---|
| Setup | Settings open; run a trial first. |
| Steps | Toggle "Reduced motion" on; play the animation; toggle off. |
| Expected result | `data-reduced-motion` flips on `<html>` (`experiment-shell.tsx:101-104`) killing all CSS animations/transitions (`globals.css:39-44`); canvas renders static frames with "!" markers at reaction sites (`simulation-canvas.tsx:323-335`); base frame delay rises 900→1100ms (`simulation-canvas.tsx:34`). |
| Failure condition | Pulses or transitions persist with the toggle on. |
| Severity | S1 if broken — this is the flagship manual accommodation. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-032 — Pause control halts motion immediately
| Field | Content |
|---|---|
| Setup | Animation playing. |
| Steps | Press Pause mid-play; press Play to resume. |
| Expected result | The `setInterval` is torn down on pause (`simulation-canvas.tsx:39-51` clears on dependency change/`playing=false`); step counter freezes; Resume continues from the same step. |
| Failure condition | Motion continues after Pause, or resume restarts from step 0. |
| Severity | S1 if broken — pausing is the single most important motion control. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-033 — Animation speed 0.25×–2× honored
| Field | Content |
|---|---|
| Setup | Settings open; run a trial. |
| Steps | Set speed to 0.25×, 1×, 2×; play; observe pacing. |
| Expected result | `frameDelay = base/speed`, clamped 60–3000ms (`simulation-canvas.tsx:33-37`); 0.25× ≈ 3.6s/step (1100ms base with reduced motion ≈ 4.4s), 2× ≈ 450ms/step. |
| Failure condition | Speed setting has no effect on pacing, or delay leaves the clamp range. |
| Severity | S1 if broken — pacing adaptation is the headline feature for the design participant. |
| Rubric weight | Impact on Neurodivergent Youth (30%) + Innovation in AI Application (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-034 — Static-state alternative always available
| Field | Content |
|---|---|
| Setup | Run a trial with reduced motion on. |
| Steps | Step through frames; read the state summary. |
| Expected result | Every frame is fully legible as a static image (SVG renders one snapshot per step, `simulation-canvas.tsx:67,267-337`); the numeric summary (`simulation-canvas.tsx:219-231`) carries the same information as the motion; reaction events get "!" markers instead of pulses (`simulation-canvas.tsx:323-335`). |
| Failure condition | Any information exists only in the motion itself. |
| Severity | S2 — WCAG 2.2.2 static alternative; currently well implemented. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-035 — No flashing content
| Field | Content |
|---|---|
| Setup | Play an intense run (high starting neutrons, withdrawn absorber). |
| Steps | Watch for any full-screen or large-area flashing; check the reaction rings. |
| Expected result | Reaction feedback is a small ring expanding r=3→14 (`globals.css:78-91`), capped at 12 rings (`simulation-canvas.tsx:261`); nothing flashes faster than ~1.1Hz per element; no area of the viewport ever alternates brightness. |
| Failure condition | Any region flashing at 3+ Hz, or any full-viewport flash. |
| Severity | S1 if found — flashing is an S0/S1-adjacent seizure risk; source design appears safe. |
| Rubric weight | Impact on Neurodivergent Youth (30%) + Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED (by inspection; manual confirmation pending). |
| Repair estimate | n/a. |

### A11Y-036 — No uncontrolled particle bursts
| Field | Content |
|---|---|
| Setup | Run with maximum growth (absorber withdrawn, high density). |
| Steps | Watch the neutron count; trigger the safety ceiling. |
| Expected result | Population is capped at 500 (`src/domain/experiments.ts:18`) with a stop reason announced (`simulation-canvas.tsx:74-81`); at most 120 neutrons render with "+N more" (`simulation-canvas.tsx:15,225-227,249,280-290`); duration ≤ 120 steps (`experiments.ts:19`). |
| Failure condition | Unbounded particle rendering or population growth. |
| Severity | S3 — caps exist; failure would be a regression. |
| Rubric weight | Technical Execution (10%) + Impact on Neurodivergent Youth (30%) — burst density is an overload trigger. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

---

## Area 4 — Screen readers (A11Y-040..049)

Requirement: every learning surface has a text equivalent in reading order: lab title, current task, parameter labels, prediction prompt, simulation state, result summary, adaptation reason, counterfactual difference, replay sequence. The animation must have a text alternative. **The `aria-live` summary announces every step while playing — a spam risk.**

### A11Y-040 — Lab title, goal, and current task announced
| Field | Content |
|---|---|
| Setup | Enter the lab with a screen reader (or inspect accessibility tree). |
| Steps | Read the page top to bottom. |
| Expected result | `<h1>` title (`experiment-shell.tsx:334`), goal sentence (`:337`), and section labels (`aria-label` on experiment variables `variable-controls.tsx:54`, simulation animation `simulation-canvas.tsx:84-86`, representations `representation-tabs.tsx:39-43`) are announced. |
| Failure condition | Title, goal, or any section label missing. |
| Severity | S2 — orientation for assistive-tech users depends on these. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-041 — Parameter labels and values announced
| Field | Content |
|---|---|
| Setup | Variables panel. |
| Steps | Read each slider with a screen reader; change a value. |
| Expected result | Each range input has `<label htmlFor="param-...">` (`variable-controls.tsx:76-78`), a live `<output>` (`:79-84`), and a plain-language explanation (`:97-101`); "Changed since last run" lists names (`:116-123`). |
| Failure condition | Any slider unlabeled, or value changes unannounced. |
| Severity | S2 — parameter control is the core manipulation surface. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-042 — Prediction prompt announced
| Field | Content |
|---|---|
| Setup | Fresh session. |
| Steps | Read the prediction panel. |
| Expected result | Goal text, `fieldset`/`legend` "What do you think will happen?" (`prediction-panel.tsx:89-92`), textarea label (`:112-114`), confidence label with verbal scale (`:124-130`) are all announced. |
| Failure condition | The prediction question is not announced. |
| Severity | S2 — prediction is the mandatory first task. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — "predict without judgment" is the emotional contract. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-043 — Simulation state summary: announced but must not spam (FAILING risk)
| Field | Content |
|---|---|
| Setup | Run a trial; play the animation. |
| Steps | With a screen reader, press Play and listen for 10 steps. |
| Expected result | The state summary (`simulation-canvas.tsx:219-231`) is `aria-live="polite"` and announces step/population/reactions — at a deliberate cadence. |
| Failure condition | Announcement fires on every step while playing — frame delay is 900ms default, ~450ms at 2× speed (`simulation-canvas.tsx:33-37`); a ~0.5–1s live-region update rate monopolizes the virtual cursor for the entire playback of up to 120 steps (`experiments.ts:19`). |
| Severity | S2 — the summary is excellent content wrapped in a spammy live region; usable but exhausting for screen-reader learners. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — assistive-tech users on the spectrum face the same overload the app is designed to remove. |
| Current implementation status | PARTIAL — region exists and is correct; cadence is the defect. |
| Repair estimate | 1.5h (announce on pause/end/step-back only, or debounce the live region to ≥2s; keep full text in a normal paragraph). |

### A11Y-044 — Result and stop reason announced
| Field | Content |
|---|---|
| Setup | Run a trial that hits the ceiling, one that goes extinct. |
| Steps | Note announcements at trial end. |
| Expected result | Stop reason is a `role="status"` paragraph (`simulation-canvas.tsx:90-97`) — "safety ceiling: 500 free neutrons" / "no neutrons left to react" / "full duration" (`:74-81`); final numbers are in the state summary. |
| Failure condition | Stop reason missing or not announced. |
| Severity | S2 — the outcome sentence is the learning payoff. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-045 — Adaptation reason and decision announced
| Field | Content |
|---|---|
| Setup | Trigger `freeze_variables` (change 2+ variables) or `slow_animation` (replay same parameters). |
| Steps | Read the adaptation card; make a decision. |
| Expected result | The `reason` text (`src/adaptation/deterministic-provider.ts:91-98`) is plain content; Accept/Reject/Modify are labeled buttons (`adaptation-card.tsx:168-190`); Modify shows labeled checkboxes (`:123-143`). |
| Failure condition | Reason unreadable, or decision controls unlabeled. |
| Severity | S2 — explainability of the AI offer is the product's honesty mechanism. |
| Rubric weight | Innovation in AI Application (25%) — explainable, learner-controlled adaptation is the innovation. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-046 — Counterfactual difference announced
| Field | Content |
|---|---|
| Setup | Run a comparison. |
| Steps | Read the result block. |
| Expected result | A plain sentence states the changed variable, old→new value, and outcome delta (`counterfactual-panel.tsx:186-190,234`); the number grid uses `<dl>`/`<dt>`/`<dd>` (`:206-232`); sparklines are `aria-hidden` (`:159`) with text equivalents present. |
| Failure condition | Difference exists only in the two sparklines. |
| Severity | S2 — the causal sentence is the whole point of the feature. |
| Rubric weight | Innovation in AI Application (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-047 — Replay sequence readable as text
| Field | Content |
|---|---|
| Setup | Two trials with decisions; open the replay. |
| Steps | Read the replay with a screen reader. |
| Expected result | A 9-step ordered list (`adaptation-replay.tsx:95-223`): initial prediction, variables changed, trial outcome, interaction pattern, conceptual friction, adaptation offered + decision, updated prediction, counterfactual comparison, what changed in understanding — all plain text, plus the "nothing is fabricated" note (`:225-228`). |
| Failure condition | Any step presents data only as graphics. |
| Severity | S2 — the replay is the retrospective reflection surface. |
| Rubric weight | Innovation in AI Application (25%) — evidence reconstruction is the AI's showcase. |
| Current implementation status | IMPLEMENTED (focus defects tracked in A11Y-022..024). |
| Repair estimate | n/a. |

### A11Y-048 — Animation has a dynamic text alternative
| Field | Content |
|---|---|
| Setup | Run a trial; step the animation. |
| Steps | Inspect the SVG accessibility tree at several steps. |
| Expected result | The canvas is `role="img"` with `aria-label` "Neutron population at step N" (`simulation-canvas.tsx:101-106`); the absorber rect has a `<title>` with insertion percent (`:291-301`); the label updates as steps change (dynamic label). |
| Failure condition | No accessible name on the canvas, or a static label that never reflects the current step. |
| Severity | S2 — text alternative for animation is a WCAG 1.1.1 requirement. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED (note: label changes are not themselves announced; paired with A11Y-043 the information still arrives). |
| Repair estimate | n/a. |

### A11Y-049 — Planned-lab cards have honest semantics (FAILING)
| Field | Content |
|---|---|
| Setup | Landing page. |
| Steps | Read the "Planned" cards. |
| Expected result | Inert cards are either omitted from the accessibility tree or marked in a way assistive tech understands. |
| Failure condition | `aria-disabled="true"` sits on a plain `<div>` with no role (`src/app/page.tsx:60`) — the attribute is only meaningful on interactive roles, so screen readers ignore it and announce the card as ordinary content; users discover inertness only by trying to focus. |
| Severity | S4 — cosmetic semantic issue; the visible "Planned"/"Not built yet" text carries the meaning. |
| Rubric weight | Presentation Quality (10%). |
| Current implementation status | MISSING (semantics); visible text is present. |
| Repair estimate | 0.25h (add `aria-hidden="true"` + a visually-hidden "Planned" label, or give the card a real `role` + `aria-disabled`). |

---

## Area 5 — Visual presentation (A11Y-050..057)

Requirement: WCAG 1.4 contrast in default and high-contrast themes, effective text scaling, no color-only meaning, clear legends and labels, adequately sized controls, small-screen usability (~375px), and unambiguous disabled/error states. **Two static contrast failures and a likely-ineffective text scale.**

### A11Y-050 — Contrast on primary action buttons (FAILING)
| Field | Content |
|---|---|
| Setup | Any screen with a primary button: Run trial, Submit prediction, Accept, Apply selected, Export, Enter the lab. |
| Steps | Measure computed contrast of white text on `--accent-strong` (#14b8a6, `globals.css:11`). |
| Expected result | ≥ 4.5:1 for the 14–16px button text. |
| Failure condition | Computed contrast ≈ 2.5:1 — white on #14b8a6 fails even the 3:1 large-text threshold. Affected: `experiment-shell.tsx:412`, `prediction-panel.tsx:161`, `adaptation-card.tsx:153,171`, `research-mode.tsx:138`, `page.tsx:28,51`. The causal diagram's white text on #0d9488 (≈3.8:1 at 11–13px, `representation-tabs.tsx:210-213,232-235`) also fails. |
| Severity | S2 — WCAG AA failure on the single most-used button in the app. |
| Rubric weight | Usability and Accessibility (25%) — contrast is the most commonly cited accessibility defect. |
| Current implementation status | MISSING (static-proven; pending manual confirmation). |
| Repair estimate | 0.75h (use the dark teal #0f766e — already defined in high-contrast mode at `globals.css:28` — for `--accent-strong` and the causal-view fills; white on #0f766e ≈ 5.5:1). |

### A11Y-051 — High-contrast mode ratios
| Field | Content |
|---|---|
| Setup | Toggle "High contrast" on. |
| Steps | Read the full page; verify borders, links, warnings. |
| Expected result | Near-black #0a0a0a on white (`globals.css:22-36`); muted #333333 on white ≈ 10.9:1; borders #111111; focused elements use #0d47a1 (`:34`). |
| Failure condition | Any pair below 4.5:1, or a control that becomes invisible in the light theme. |
| Severity | S2 — the mode must be a strict improvement. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | IMPLEMENTED (manual confirmation pending). |
| Repair estimate | n/a. |

### A11Y-052 — Text-size setting actually scales text (FAILING)
| Field | Content |
|---|---|
| Setup | Set "Text size" to 1.5×. |
| Steps | Compare heading, label, and paragraph sizes before/after. |
| Expected result | All interface text grows ~50%. |
| Failure condition | The setting applies `font-size: 150%` to the shell container (`experiment-shell.tsx:327-329`), but Tailwind v4 text utilities are rem-based (text-xs/sm/base/lg/xl/2xl/4xl/5xl throughout) and rem resolves against the `<html>` root, not the container — so virtually no text changes. Only `em`-based descendants (if any) respond. |
| Severity | S2 — a published accessibility control that is a no-op damages trust for the exact user it exists for. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — adjustable pacing/reading size is a named requirement of the design brief. |
| Current implementation status | MISSING (effectiveness). |
| Repair estimate | 1.5h (move scaling to `documentElement.style.fontSize = textScale*100%` in the same effect that already manages `data-reduced-motion` at `experiment-shell.tsx:99-105`; note SVG viewBox text will not scale — accept or scale via `font-size` on `foreignObject`). |

### A11Y-053 — No color-only meaning
| Field | Content |
|---|---|
| Setup | Canvas legend, graph, counterfactual sparklines, default and reduced-motion modes. |
| Steps | Identify each color-coded item without color. |
| Expected result | Canvas has a text legend (`simulation-canvas.tsx:174-215`); graph has a figcaption (`representation-tabs.tsx:154-166`); reduced motion replaces pulses with "!" (`simulation-canvas.tsx:323-335`). |
| Failure condition | Reaction rings (amber, `simulation-canvas.tsx:311-321`) are distinguishable only by color + motion in default mode; a static color-blind view may not separate "reaction event" from "free neutron" (both amber). |
| Severity | S3 — legend mitigates, but the ring-vs-dot distinction is color+shape-adjacent. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | NOT YET INSPECTABLE (manual; risk noted). |
| Repair estimate | 0.5h if confirmed (add "×" markers or stroke style to rings in all modes). |

### A11Y-054 — Graph labels and legend clear
| Field | Content |
|---|---|
| Setup | Run a trial; open the Graph tab. |
| Steps | Read the graph. |
| Expected result | Axis titles "Step"/"Count" (`representation-tabs.tsx:128-140`), tick labels (`:118-125`), series legend with final values (`:154-166`), safety-ceiling annotation (`:148-152`). |
| Failure condition | Any axis unlabeled or series unnamed. |
| Severity | S3 — labels exist; failure would be a regression. |
| Rubric weight | Technical Execution (10%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-055 — Control size and spacing at ~375px
| Field | Content |
|---|---|
| Setup | iPhone SE / 375px viewport. |
| Steps | Inspect Play/Step/Reset row and all buttons; verify no overlap and adequate hit areas. |
| Expected result | All controls ≥ 24px hit area (WCAG 2.5.8 AA minimum); playback row wraps without clipping (`simulation-canvas.tsx:127` uses flex-wrap); no horizontal scroll. |
| Failure condition | Controls below 24px, overlapping, or the 3-column grid (`experiment-shell.tsx:393`) collapsing badly. |
| Severity | S3 — buttons are ~34–38px tall (px-3/py-2 at 14px text) — pass the 24px minimum, below the 44px best practice. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — small screens with big fingers. |
| Current implementation status | NOT YET INSPECTABLE (manual; risk noted). |
| Repair estimate | 0.5h if any target is sub-24px or overlaps. |

### A11Y-056 — Disabled and error states unambiguous
| Field | Content |
|---|---|
| Setup | Prediction panel empty; playback at boundaries; run without prediction. |
| Steps | Observe disabled buttons and the alert. |
| Expected result | Disabled = `disabled:opacity-40` + `cursor-not-allowed` (`prediction-panel.tsx:161`; `simulation-canvas.tsx:144,156,168`); errors use `role="alert"` with a plain sentence (`experiment-shell.tsx:383-390`); the two-step clear confirms with changed label (`research-mode.tsx:158`). |
| Failure condition | Disabled state conveyed only by color, or errors not announced. |
| Severity | S3 — present and consistent by inspection. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — unambiguous state reduces uncertainty. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-057 — 200% zoom / 320px no horizontal scroll
| Field | Content |
|---|---|
| Setup | Browser zoom 200% at 320px width. |
| Steps | Pan the full flow. |
| Expected result | No horizontal scroll; the SVG canvas (`viewBox` 800×480, `simulation-canvas.tsx:101-106,17-18`) scales down proportionally; header buttons wrap (`experiment-shell.tsx:332-344`). |
| Failure condition | Any horizontal scrolling or clipped control. |
| Severity | S3 — WCAG 1.4.10 reflow. |
| Rubric weight | Usability and Accessibility (25%). |
| Current implementation status | NOT YET INSPECTABLE (manual; design is fluid). |
| Repair estimate | n/a. |

---

## Area 6 — Cognitive accessibility (A11Y-060..069)

Requirement: one primary task at a time, persistent instructions, plain language, stable navigation, no forced time limits, undo/reset, clear consequences, progressive disclosure, no unexplained interface changes, and a learner-controlled adaptation contract.

### A11Y-060 — One primary task at a time
| Field | Content |
|---|---|
| Setup | Fresh session. |
| Steps | Observe the enforced sequence: prediction → run → result → adaptation → counterfactual → replay. |
| Expected result | Run is blocked until a prediction exists with a plain alert ("A prediction is required before running a trial…", `experiment-shell.tsx:165-171`); after a trial the next task (adaptation decision) appears in the right rail. |
| Failure condition | The learner can run without predicting, or tasks compete for attention simultaneously. |
| Severity | S3 — sequence is enforced; failure would be a regression. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — single-task structure is a core design brief item. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-061 — Persistent instructions and meaningful density reduction (PARTIAL)
| Field | Content |
|---|---|
| Setup | Low information density on; then one-variable mode on. |
| Steps | Compare header and variables panel in each mode. |
| Expected result | The goal stays visible in the header at all densities (`experiment-shell.tsx:337`); low density hides the disclaimer and the causal sentence — a genuine, meaningful reduction (`experiment-shell.tsx:338-342`; `representation-tabs.tsx:286-288`). |
| Failure condition | (a) Density settings change nothing; (b) **one-variable mode removes the per-slider plain-language explanations** (`variable-controls.tsx:97-101` render only when `!oneVariableMode`) — exactly when the learner is being asked to manipulate one knob, the explanation for that knob disappears. |
| Severity | S3 — density reduction works; the one-variable explanation loss is a real but minor friction. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — reduced density is a named requirement. |
| Current implementation status | PARTIAL. |
| Repair estimate | 0.5h (always render the explanation for the active slider in one-variable mode). |

### A11Y-062 — Plain, non-judgmental language
| Field | Content |
|---|---|
| Setup | Read goal, explanations, adaptation reasons, disclaimer, replay copy. |
| Steps | Sample each text surface. |
| Expected result | Fictionalized-model disclaimer (`experiments.ts:12-15`); plain slider explanations (`experiments.ts:69-129`); adaptation reasons speak about actions, never identity ("This run changed several things at once…", `deterministic-provider.ts:92-98`); "records it, without judgment" (landing, `page.tsx:88`). |
| Failure condition | Any evaluative language about the learner ("you struggle", "you were wrong"). |
| Severity | S1 if found — judgmental framing would break the trust contract for the target learner. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-063 — Stable navigation and layout
| Field | Content |
|---|---|
| Setup | Full flow. |
| Steps | Watch for layout jumps: settings panel opening, adaptation card appearing, tabs switching. |
| Expected result | Page never reloads mid-flow (all state is client-side, `experiment-shell.tsx:71-97`); panels appear in reserved places (right rail for adaptation, `:439-453`); the canvas remounts only per trial (`key={lastTrial?.id}`, `:425`). |
| Failure condition | Content shifts under the pointer or focus, or a full reload wipes state. |
| Severity | S3 — recoverable, but a known ADHD friction. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | NOT YET INSPECTABLE (manual). |
| Repair estimate | n/a. |

### A11Y-064 — No forced time limit
| Field | Content |
|---|---|
| Setup | Any state. |
| Steps | Leave the app idle mid-flow; pause playback. |
| Expected result | No timers act on the learner: playback advances only while `playing` (`simulation-canvas.tsx:39-51`); no autosave countdown; the learner can pause indefinitely. |
| Failure condition | Any automatic progression, timeout, or auto-advance. |
| Severity | S1 if found — forced pacing is the exact failure mode this product exists to remove. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-065 — Undo, reset, and clear consequences
| Field | Content |
|---|---|
| Setup | Run a trial; open research mode. |
| Steps | Reset animation; clear the session (two-step). |
| Expected result | Animation Reset returns to step 0 (`simulation-canvas.tsx:160-171`); parameter changes are always re-runnable; clearing is two-step ("Really clear? Press again to confirm", `research-mode.tsx:142-159`) and resets all state (`experiment-shell.tsx:311-322`); the counterfactual never mutates the original trial (deep clone, `src/simulation/counterfactual.ts:29-58`). |
| Failure condition | One press destroys data, or a counterfactual corrupts the original. |
| Severity | S3 — destructive actions are guarded. |
| Rubric weight | Technical Execution (10%) — evidence integrity. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-066 — Progressive disclosure without unexplained changes (PARTIAL)
| Field | Content |
|---|---|
| Setup | Trigger `show_graph` or `show_causal_view`. |
| Steps | Accept the adaptation; watch the representation area. |
| Expected result | The card explains what will change ("Open the graph view", `adaptation-card.tsx:95-117`); accepting a view adaptation switches the active tab (`experiment-shell.tsx:263-267`) — a visible change the learner just approved. |
| Failure condition | A change happens with no explanation, or the tab switches without the learner's action. |
| Severity | S3 — the switch is consented, but the user is not told "your view changed" at the moment it happens. |
| Rubric weight | Innovation in AI Application (25%) — transparency of the adaptive engine. |
| Current implementation status | PARTIAL. |
| Repair estimate | 0.5h (announce the switch: e.g., the notice region or an `aria-live` "Showing the graph view now"). |

### A11Y-067 — Learner can always reject an adaptation
| Field | Content |
|---|---|
| Setup | Trigger any proposal. |
| Steps | Reject it; run another trial that would normally re-trigger it. |
| Expected result | Reject removes the card (`experiment-shell.tsx:272`); rejected types are never re-proposed in the session (`deterministic-provider.ts:39-43,61`); nothing is applied without a decision (`deterministic-provider.ts` — proposals are always pending until decided). |
| Failure condition | A rejected adaptation is re-offered or silently applied. |
| Severity | S1 if broken — non-negotiated adaptation would be the product's core ethical failure. |
| Rubric weight | Impact on Neurodivergent Youth (30%) + Innovation in AI Application (25%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-068 — Adaptation decisions have visible recorded consequences
| Field | Content |
|---|---|
| Setup | Accept `freeze_variables`; accept `slow_animation`. |
| Steps | Check the settings panel and the replay afterward. |
| Expected result | Accepted changes appear in settings (speed shows 0.5×; one-variable toggle on) and in the replay under "Adaptation offered" with the decision (`adaptation-replay.tsx:156-175`). |
| Failure condition | A decision changes nothing visible anywhere. |
| Severity | S3 — evidence integrity. |
| Rubric weight | Innovation in AI Application (25%) — recorded, auditable decisions. |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-069 — No dead controls: feedbackTiming (FAILING)
| Field | Content |
|---|---|
| Setup | Open accessibility settings; read "Feedback timing". |
| Steps | Set each of immediate / after_trial / hints_only / manual; run trials; observe any behavior change. |
| Expected result | The setting changes when feedback appears (or the control does not exist). |
| Failure condition | `feedbackTiming` is settable and persisted (`src/domain/learner.ts:38,56,70`; `accessibility-controls.tsx:115-134`) but no code consumes it — no consumer exists in `experiment-shell.tsx`, `deterministic-provider.ts`, `simulation-canvas.tsx`, or anywhere else in `src/`. The learner changes a control and nothing happens. |
| Severity | S3 — a dead control erodes trust ("this app lies to me"), though nothing breaks. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — unexplained ineffective controls. |
| Current implementation status | MISSING (consumer). |
| Repair estimate | 1.5h — either implement a gating effect (e.g., hold adaptation cards until "after_trial" / "manual" policy) or remove the control until it does something. |

---

## Area 7 — Interactivity and animation (A11Y-070..075)

Requirement: animation is meaningful rather than decorative, variable changes visibly affect the model, the learner controls all motion, animation remains understandable when slowed, no precision interaction is needed, and the graph and animation are comparable side by side.

### A11Y-070 — Animation is meaningful (renders recorded data)
| Field | Content |
|---|---|
| Setup | Run a trial. |
| Steps | Cross-check canvas frames against the Graph tab and state summary numbers. |
| Expected result | The canvas renders recorded `snapshots` — every frame is a real model state (`simulation-canvas.tsx:30,67`), keyed per step; step counter and numbers match (`:223-230`); nothing animated is fabricated or decorative. |
| Failure condition | Visuals that disagree with the model data. |
| Severity | S1 if found — decorative animation would be a false claim about the model. |
| Rubric weight | Innovation in AI Application (25%) — "AI represents the evidence" is the pitch. |
| Current implementation status | IMPLEMENTED (manual cross-check pending). |
| Repair estimate | n/a. |

### A11Y-071 — Variable changes visibly affect the model
| Field | Content |
|---|---|
| Setup | Absorber position 1.0; run; withdraw to 0.1 with same seed; run. |
| Steps | Compare outcomes; repeat with density and absorption chance. |
| Expected result | Each parameter shift produces a visibly different trial; in one-variable mode only the touched knob changes between runs (`variable-controls.tsx:70-73`; the mode notice at `:61-66`). |
| Failure condition | Changing a parameter changes nothing, or several variables change at once despite one-variable mode. |
| Severity | S1 if found — the manipulation→outcome link is the educational core. |
| Rubric weight | Impact on Neurodivergent Youth (30%) — visible causality is the pedagogy. |
| Current implementation status | NOT YET INSPECTABLE (manual). |
| Repair estimate | n/a. |

### A11Y-072 — Learner fully controls the animation
| Field | Content |
|---|---|
| Setup | Fresh trial renders. |
| Steps | Play, pause, step back, step forward, reset, slow, reduce motion. |
| Expected result | Canvas never starts playing on mount (documented at `simulation-canvas.tsx:22-24`); all motion is learner-initiated; controls listed in A11Y-010/A11Y-031/A11Y-033. |
| Failure condition | Any auto-play on mount or after trial completion. |
| Severity | S1 if found — the design participant's core requirement. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-073 — Animation understandable when slowed
| Field | Content |
|---|---|
| Setup | Speed 0.25×; play a growth run. |
| Steps | Follow one neutron's behavior across steps; use Step forward. |
| Expected result | At ~3.6s/step each frame is inspectable; Step forward/backward (`simulation-canvas.tsx:136-159`) allow frame-exact study; the numeric summary (`:219-231`) names what changed between frames. |
| Failure condition | Slowing down hides information or makes the animation janky. |
| Severity | S3 — designed for it; failure would be a regression. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED (manual). |
| Repair estimate | n/a. |

### A11Y-074 — No precision interaction required
| Field | Content |
|---|---|
| Setup | Any control. |
| Steps | Operate sliders and selects with coarse movements / keyboard only. |
| Expected result | All range inputs are stepped (e.g., absorber 0.1 steps, `experiments.ts:75`; density 0.1, `:95`; duration 5, `:115`) so any click position lands on a value; keyboard arrows give exact control (`variable-controls.tsx:86-96`). |
| Failure condition | A control that requires pixel-precise dragging. |
| Severity | S3 — coarse-grained sliders are an ADHD-motor accommodation. |
| Rubric weight | Impact on Neurodivergent Youth (30%). |
| Current implementation status | IMPLEMENTED. |
| Repair estimate | n/a. |

### A11Y-075 — Graph and animation comparable side by side
| Field | Content |
|---|---|
| Setup | Run a trial; open Graph. |
| Steps | Compare the animation's final frame with the graph's end values and the plain-language summary. |
| Expected result | The animation sits above the tab bar (`experiment-shell.tsx:423-436`), the graph is one Enter away, and both share the same snapshot data; the counterfactual panel renders original vs. counterfactual side by side (`counterfactual-panel.tsx:200-233`) with text deltas. |
| Failure condition | Values in the animation and graph differ, or switching representations resets understanding context. |
| Severity | S3 — cross-representation consistency is the causal-comparison claim. |
| Rubric weight | Innovation in AI Application (25%). |
| Current implementation status | IMPLEMENTED (manual). |
| Repair estimate | n/a. |

---

## Prioritized fix list (re-stamped on the final-hardening branch)

### P0 — Done on the final-hardening branch (originally ≈ 8.25h, now shipped)
| Fix | Tests | Status |
|---|---|---|
| Adaptation Replay dialog: initial focus, focus trap, focus restore | A11Y-022, 023, 024 | **SHIPPED** |
| Honor OS `prefers-reduced-motion` (init + live subscription; manual override wins) | A11Y-030 | **SHIPPED** |
| Remove per-frame `aria-live` announcements from the state summary | A11Y-043 | **SHIPPED** |
| Make text-size preference effective (scale `documentElement` font-size) | A11Y-052 | **SHIPPED** |
| Fix white-on-teal contrast (`--accent-strong` → `#0f766e`; causal-view fills) | A11Y-050 | **SHIPPED** |

### P1 — Done on the final-hardening branch (originally ≈ 3.75h)
| Fix | Tests | Status |
|---|---|---|
| Roving tabindex + arrow keys on representation tabs | A11Y-026 | **SHIPPED** |
| `feedbackTiming`: remove the dead control | A11Y-069 | **SHIPPED** (control removed) |
| Honest semantics for planned-lab cards (replaced by native `<details>` list) | A11Y-049 | **SHIPPED** |

### Remaining (verification, not code)
| Item | Tests | Hours |
|---|---|---|
| Skip-to-content link (optional, S4) | A11Y-028 | 0.25 |
| Restore plain-language explanations for the active slider in one-variable mode | A11Y-061 | 0.5 |
| Announce view switches caused by accepted adaptations | A11Y-066 | 0.5 |
| Verify/fix control target sizes at 375px | A11Y-055 | 0.5 |
| Non-color marker for reaction rings (all modes) | A11Y-053 | 0.5 |
| **Manual verification passes: keyboard-only walkthrough, screen-reader run, axe/WCAG scan** | A11Y-017, A11Y-043 (re-verify), whole battery | 3–5 |

**Total estimate (remaining): ≈ 5h, almost all verification.** The code-side P0 set that was the honest minimum to defend "Usability and Accessibility" at the rubric weight (25%) is now shipped and covered by tests; what remains is proving it with a person and a screen reader.
