/**
 * Accessibility suite for the generative demonstration engine shell.
 *
 * Covers the ED accessibility contract:
 *  - keyboard-only predict → manipulate → observe → compare → adapt journey
 *    inside the accessible representation (no pointer-only interactions),
 *  - reduced-motion: the stage passes `reducedMotion` to the 3D renderer and
 *    representation ordering demotes stage views,
 *  - live regions: a polite region announces prediction submit and tab
 *    switches, and exactly one region changes per action (no spam),
 *  - canvas fallback: visible note + polite announcement when WebGL is
 *    unavailable (jsdom returns null for getContext("webgl")),
 *  - labels: every control (slider/switch/button/tab/radio) has an
 *    accessible name,
 *  - no color-only meaning: trust badge and graded result carry text,
 *  - text scale / zoom and 320px width: structural checks (no fixed px
 *    widths/heights on shell containers; responsive grid). Real 200% zoom is
 *    a MANUAL-CHECK — see docs/accessibility-equivalents.md.
 *
 * The 3D renderer module is mocked so reducedMotion can be asserted via the
 * constructor options; the mock can also report webgl_unavailable to
 * exercise the fallback path (the real renderer cannot run in jsdom).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useMemo, useState } from "react";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { DEFAULT_LEARNER_PREFERENCES } from "@/domain/learner";
import type { TrialRecord } from "@/demonstrations/state/demo-store";
import { demoStore } from "@/demonstrations/state/demo-store";
import { validateDemoSpec } from "@/demonstrations/validation";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
import { DemonstrationShell } from "@/components/demonstrations/demonstration-shell";
import { DemonstrationPage } from "@/components/demonstrations/demonstration-page";
import { orderedRepresentations } from "@/components/demonstrations/representation-tabs";
import {
  deriveAdaptationSuggestions,
  type AdaptationSuggestion,
} from "@/components/demonstrations/adaptation-panel";
import { TrustBadge } from "@/components/demonstrations/trust-badge";
import type { RepresentationMode } from "@/domain/learner";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

/** The 3D renderer cannot run in jsdom; mock it so we can assert options. */
const mock3d = vi.hoisted(() => ({
  instances: [] as Array<{
    options: { reducedMotion?: boolean; mobile?: boolean };
  }>,
  failWebGL: false,
}));

vi.mock("@/demonstrations/renderers/primitive-3d", () => {
  class MockPrimitiveSceneRenderer {
    options: { reducedMotion?: boolean; mobile?: boolean };
    constructor(_canvas: unknown, options: { reducedMotion?: boolean; mobile?: boolean }) {
      this.options = options;
      mock3d.instances.push(this);
      if (mock3d.failWebGL) {
        // Mirror the real renderer's WebGL-unavailable report.
        (
          options as { onError?: (err: { reason: string }) => void }
        ).onError?.({ reason: "webgl_unavailable" });
      }
    }
    setSpec() {}
    setPlaying() {}
    setSpeed() {}
    dispose() {}
  }
  return { PrimitiveSceneRenderer: MockPrimitiveSceneRenderer };
});

/** OS prefers-reduced-motion, controllable per test. */
const matchMediaState = vi.hoisted(() => ({ matches: false }));

beforeAll(() => {
  // No-op the animation loop: setScene still emits initial readouts.
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: matchMediaState.matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mock3d.instances = [];
  mock3d.failWebGL = false;
  matchMediaState.matches = false;
  demoStore.clear();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-reduced-motion");
  document.body.classList.remove("high-contrast");
  document.documentElement.style.fontSize = "";
});

// ---------------------------------------------------------------------------
// Fixtures (validated before use)
// ---------------------------------------------------------------------------

function baseLimits(): DemoSpecV1["limits"] {
  return {
    maxObjects: 80,
    maxParticles: 1500,
    maxTimelineEvents: 30,
    maxControls: 6,
  };
}

/** Level 1 verified simulation: pendulum, two parameter sliders, graded. */
function verifiedPendulumSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "a11y-pendulum",
    generationId: "gen-a11y-pendulum",
    userQuery: "How does length affect a pendulum?",
    normalizedConcept: "Pendulum period",
    title: "Pendulum Motion",
    learningObjective: "Observe how length and amplitude affect the period.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Air resistance is ignored."],
      engineId: "pendulum",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "data_table",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "pendulum",
      engineVersion: "1.0.0",
      seed: 42,
      parameters: [
        { key: "length", label: "Pendulum length", min: 0.1, max: 5, step: 0.1, value: 1.2, unit: "m" },
        { key: "amplitude", label: "Amplitude", min: 5, max: 90, step: 5, value: 30, unit: "°" },
      ],
      readouts: [
        { key: "period", label: "Period", format: "fixed2" },
        { key: "angle", label: "Angle", format: "raw" },
      ],
    },
    controls: [
      { id: "length-control", type: "slider", label: "Length", target: { kind: "parameter", ref: "length" }, min: 0.1, max: 5, step: 0.1 },
      { id: "amplitude-control", type: "slider", label: "Amplitude", target: { kind: "parameter", ref: "amplitude" }, min: 5, max: 90, step: 5 },
      { id: "play-control", type: "play_pause", label: "Play", target: { kind: "scene", ref: "play_pause" } },
    ],
    prediction: {
      prompt: "What happens to the period if the length doubles?",
      options: ["It doubles", "It stays the same", "It increases but not by double"],
      correctIndex: 2,
    },
    observationPrompts: [{ prompt: "Record the period for two lengths." }],
    representations: [
      { id: "rep-stage", kind: "stage_2d", label: "Stage" },
      { id: "rep-table", kind: "table", label: "Data table" },
    ],
    adaptationContext: { allowed: true, oneVariableMode: true },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

/** Level 2 conceptual 3D spec: stage falls back to the accessible diagram. */
function conceptual3dSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "a11y-energy",
    generationId: "gen-a11y-energy",
    userQuery: "How does energy move through a system?",
    normalizedConcept: "Energy transfer through a connected system",
    title: "Energy Transfer",
    learningObjective: "Identify the direction of energy flow in a simple system.",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: ["Qualitative only; no numeric claims."],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 1.5,
      background: "light",
    },
    scene3d: {
      objects: [
        { id: "source", kind: "process_node", label: "Source", position: { x: -2, y: 0, z: 0 } },
        { id: "sink", kind: "process_node", label: "Sink", position: { x: 2, y: 0, z: 0 } },
      ],
      relationships: [
        { id: "flow", type: "flows_to", from: "source", to: "sink", label: "Energy flow" },
      ],
      animations: [{ id: "pulse", target: "source", operator: "pulse" }],
    },
    controls: [
      { id: "play", type: "play_pause", label: "Play", target: { kind: "scene", ref: "play_pause" } },
    ],
    prediction: {
      prompt: "Which direction does energy flow?",
      options: ["From source to sink", "From sink to source"],
    },
    observationPrompts: [{ prompt: "Describe what happens to the energy." }],
    representations: [
      { id: "rep-3d", kind: "stage_3d", label: "3D stage" },
      { id: "rep-diagram", kind: "diagram", label: "Diagram" },
    ],
    adaptationContext: { allowed: true, oneVariableMode: false },
    provenance: {
      source: "template_composition",
      templateIds: ["process_flow"],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

function assertValidSpec(spec: DemoSpecV1) {
  const outcome = validateDemoSpec(JSON.stringify(spec));
  expect(outcome.status).toBe("valid");
  expect(outcome.reasons).toEqual([]);
}

// ---------------------------------------------------------------------------
// Harness — mirrors demonstration-page's state wiring around the shell,
// including adaptation suggestions derived from the spec like the page does.
// ---------------------------------------------------------------------------

function Harness({
  spec,
  reducedMotion = false,
  preferredRepresentations = ["animation"],
}: {
  spec: DemoSpecV1;
  reducedMotion?: boolean;
  preferredRepresentations?: RepresentationMode[];
}) {
  const ordered = useMemo(
    () => orderedRepresentations(spec, reducedMotion, preferredRepresentations),
    [spec, reducedMotion, preferredRepresentations]
  );
  const paramDefaults = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of spec.simulation?.parameters ?? []) out[p.key] = p.value;
    return out;
  }, [spec]);

  const [parameters, setParameters] = useState<Record<string, number>>(paramDefaults);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [resetSignal, setResetSignal] = useState(0);
  const [readouts, setReadouts] = useState<Readout[]>([]);
  const [predictionIndex, setPredictionIndex] = useState<number | null>(null);
  const [manipulated, setManipulated] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [oneVariableMode, setOneVariableMode] = useState(false);
  const [lockedControl, setLockedControl] = useState<string | null>(null);
  const [activeRep, setActiveRep] = useState<string | null>(null);
  const [adaptationDecisions, setAdaptationDecisions] = useState<Record<string, boolean>>({});
  const [replay, setReplay] = useState<{ trial: TrialRecord; token: number } | null>(null);
  const [, setStoreTick] = useState(0);

  useEffect(() => {
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  useEffect(() => demoStore.subscribe(() => setStoreTick((t) => t + 1)), []);

  const activeRepresentationId = activeRep ?? ordered[0]?.id ?? "";
  const suggestions = useMemo(
    () =>
      deriveAdaptationSuggestions(spec, {
        activeRepresentation: activeRepresentationId,
        oneVariableMode,
        parameters,
      }),
    [spec, activeRepresentationId, oneVariableMode, parameters]
  );
  const visibleSuggestions = suggestions.filter(
    (s) => adaptationDecisions[s.id] === undefined
  );

  const applyAdaptation = (suggestion: AdaptationSuggestion) => {
    const action = suggestion.action;
    if (action.kind === "set_parameter") {
      setParameters((prev) => ({ ...prev, [action.key]: action.value }));
    } else if (action.kind === "switch_representation") {
      setActiveRep(action.representationId);
    } else if (action.kind === "enable_one_variable_mode") {
      setOneVariableMode(true);
    }
  };

  return (
    <DemonstrationShell
      spec={spec}
      source="offline"
      savedToDevice={false}
      savedToCloud={false}
      predictionSubmitted={predictionIndex !== null}
      predictionIndex={predictionIndex}
      manipulated={manipulated}
      revealed={revealed}
      onPredictionSubmit={(index) => {
        setPredictionIndex(index);
        demoStore.recordTrial({
          predictionIndex: index,
          parameters: { ...parameters },
          readouts: readouts.map((r) => ({ label: r.label, value: r.value })),
          controls: { playing, speed },
          adaptations: [],
        });
      }}
      onReveal={() => setRevealed(true)}
      parameters={parameters}
      playing={playing}
      speed={speed}
      resetSignal={resetSignal}
      readouts={readouts}
      onReadouts={setReadouts}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      onPlayPause={() => setPlaying((p) => !p)}
      onSpeedChange={setSpeed}
      onReset={() => setResetSignal((n) => n + 1)}
      onControlTouched={(id) => {
        setManipulated(true);
        setLockedControl(id);
      }}
      oneVariableMode={oneVariableMode}
      lockedControl={lockedControl}
      onOneVariableModeChange={setOneVariableMode}
      activeRepresentation={activeRepresentationId}
      onRepresentationChange={setActiveRep}
      reducedMotion={reducedMotion}
      preferredRepresentations={preferredRepresentations}
      observationSelections={{}}
      observationNotes=""
      observationsSaved={false}
      onObservationToggle={() => {}}
      onObservationNotesChange={() => {}}
      onSaveObservations={() => {}}
      adaptationSuggestions={predictionIndex !== null ? visibleSuggestions : []}
      onAdaptationDecision={(suggestion, accepted) => {
        setAdaptationDecisions((prev) => ({ ...prev, [suggestion.id]: accepted }));
        if (accepted) applyAdaptation(suggestion);
      }}
      trials={demoStore.getTrials()}
      replay={replay}
      onReplayTrial={(trial) => {
        setParameters({ ...trial.parameters });
        setResetSignal((n) => n + 1);
        setReplay({ trial, token: Date.now() });
      }}
      onDismissReplay={() => setReplay(null)}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All polite live regions + status roles with their current text. */
function politeRegions(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[aria-live], [role='status']")
  ).map((el) => ({ el, text: el.textContent ?? "" }));
}

/** Which region texts changed between two snapshots. */
function changedRegionTexts(before: Array<{ text: string }>, after: Array<{ text: string }>) {
  return after
    .map((region, index) => (region.text !== before[index]?.text ? region.text : null))
    .filter((text): text is string => text !== null);
}

async function submitPredictionKeyboard(
  user: ReturnType<typeof userEvent.setup>,
  optionName: string
) {
  // Tabs land on the first radio of the group; select the target by typing
  // its label text directly (keyboard-only, no pointer).
  const option = screen.getByLabelText(optionName);
  option.focus();
  await user.keyboard(" ");
  await user.tab();
  await user.keyboard("{Enter}");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("demonstration shell accessibility", () => {
  it("completes predict → manipulate → observe → compare → adapt by keyboard inside the accessible representation", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    // -- represent: switch to the accessible (table) view with arrow keys ----
    const stageTab = screen.getByRole("tab", { name: "Stage" });
    stageTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Data table" })).toHaveFocus();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Pendulum length")).toBeInTheDocument();

    // -- predict: Tab order — the always-enabled one-variable switch, then
    // the first radio of the group (disabled controls are skipped). The
    // option is chosen with arrow keys inside the group, like a real
    // keyboard user. ---------------------------------------------------------
    await user.tab();
    expect(screen.getByRole("switch", { name: "One-variable mode" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("radio", { name: "It doubles" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("radio", { name: "It increases but not by double" })
    ).toBeChecked();
    await user.tab();
    expect(screen.getByRole("button", { name: "Submit prediction" })).toHaveFocus();
    await user.keyboard("{Enter}");

    // Gate transition: announced politely AND focus moves to the first
    // experiment control (predict → manipulate handoff).
    expect(screen.getByText("Prediction locked in")).toBeInTheDocument();
    const lengthSlider = screen.getByRole("slider", { name: "Length" });
    await waitFor(() => expect(lengthSlider).toHaveFocus());

    // -- manipulate: arrow keys on the slider (no pointer needed) ------------
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(within(table).getByText(/^1\.3/)).toBeInTheDocument();
    });

    // -- observe: live readout appears in the table --------------------------
    await waitFor(() => {
      expect(within(table).getByText("Period")).toBeInTheDocument();
    });

    // -- compare: Tab order continues controls → reveal → observations -------
    await user.tab(); // Amplitude slider
    expect(screen.getByRole("slider", { name: "Amplitude" })).toHaveFocus();
    await user.tab(); // Play/Pause (playing → "Pause")
    expect(screen.getByRole("button", { name: "Pause" })).toHaveFocus();
    await user.tab(); // Reveal (now enabled after manipulation)
    const reveal = screen.getByRole("button", { name: "Reveal the verified answer" });
    expect(reveal).toHaveFocus();
    expect(reveal).toBeEnabled();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Your prediction was correct.")).toBeInTheDocument();
    expect(screen.getByText("Verified answer")).toBeInTheDocument();

    // -- adapt: Tab to the first Accept and take it ---------------------------
    await user.tab(); // observation checkbox
    await user.tab(); // notes textarea
    await user.tab(); // save observations
    await user.tab(); // first adaptation Accept
    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    expect(acceptButtons[0]).toHaveFocus();
    await user.keyboard("{Enter}");

    // Accepted adaptation applied the suggested parameter change (length → 5).
    await waitFor(() => {
      expect(within(table).getByText("5 m")).toBeInTheDocument();
    });
  });

  it("passes reducedMotion to the 3D renderer and demotes stage views under reduced motion", async () => {
    const spec = conceptual3dSpec();
    assertValidSpec(spec);

    // Non-reduced: renderer is created with reducedMotion false.
    const { unmount } = render(<Harness spec={spec} reducedMotion={false} />);
    await waitFor(() => expect(mock3d.instances.length).toBe(1));
    expect(mock3d.instances[0].options.reducedMotion).toBe(false);
    unmount();

    mock3d.instances = [];
    render(<Harness spec={spec} reducedMotion />);
    await waitFor(() => expect(mock3d.instances.length).toBe(1));
    expect(mock3d.instances[0].options.reducedMotion).toBe(true);

    // Spec variants: no stage representation may lead the order under
    // reduced motion (auto-camera animation stays out of the default view).
    const ordered = orderedRepresentations(spec, true, ["plain_language"]);
    expect(ordered[0].kind).not.toBe("stage_3d");
    expect(ordered[0].kind).not.toBe("stage_2d");
    expect(ordered.at(-1)?.kind).toBe("stage_3d");
  });

  it("maps OS reduced motion / high contrast / text scale to the document for the demo page", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");

    // Stored learner preferences (settings page) feed the demo page.
    window.localStorage.setItem(
      "unseenlab.preferences.v1",
      JSON.stringify({
        ...DEFAULT_LEARNER_PREFERENCES,
        highContrast: true,
        textScale: 1.3,
        reducedMotion: true,
      })
    );

    // OS does NOT request reduced motion; the stored preference still wins.
    matchMediaState.matches = false;

    const { unmount } = render(<DemonstrationPage demoId={spec.id} />);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("true");
      expect(document.body.classList.contains("high-contrast")).toBe(true);
      expect(document.documentElement.style.fontSize).toBe("130%");
    });

    // Nothing leaks after leaving the page.
    unmount();
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBeNull();
    expect(document.body.classList.contains("high-contrast")).toBe(false);
    expect(document.documentElement.style.fontSize).toBe("");
  });

  it("announces prediction submit and tab switches in live regions and never spams", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    const { container } = render(<Harness spec={spec} />);

    const tabsSection = screen.getByLabelText("Representations");
    const tabRegion = within(tabsSection).getByText(
      (_content, element) => element?.getAttribute("aria-live") === "polite"
    );
    expect(tabRegion).toHaveTextContent("");

    // Initial render: every region is either empty or carrying static status.
    const beforeSubmit = politeRegions(container);
    expect(beforeSubmit.length).toBeGreaterThanOrEqual(2); // tabs + save status

    await submitPredictionKeyboard(user, "It increases but not by double");

    // Exactly ONE region changed text on prediction submit.
    const afterSubmit = politeRegions(container);
    const changedOnSubmit = changedRegionTexts(beforeSubmit, afterSubmit);
    expect(changedOnSubmit).toHaveLength(1);
    expect(changedOnSubmit[0]).toContain("Prediction recorded");

    // The prediction panel carries the status region.
    const predictionSection = screen.getByLabelText("Prediction");
    expect(
      within(predictionSection).getByRole("status")
    ).toHaveTextContent("Prediction recorded — controls unlocked.");

    // Tab switch announces only the tab region.
    const beforeTab = politeRegions(container);
    await user.click(screen.getByRole("tab", { name: "Data table" }));
    const afterTab = politeRegions(container);
    const changedOnTab = changedRegionTexts(beforeTab, afterTab);
    expect(changedOnTab).toHaveLength(1);
    expect(changedOnTab[0]).toBe("View: Data table");
  });

  it("renders a visible, announced canvas-fallback message when WebGL is unavailable", async () => {
    const spec = conceptual3dSpec();
    assertValidSpec(spec);
    mock3d.failWebGL = true;
    render(<Harness spec={spec} />);

    // Visible note, politely announced (role=status), plus the accessible
    // representation as the working substitute.
    const note = await screen.findByText(/WebGL is not available here/);
    expect(note).toBeVisible();
    expect(note).toHaveAttribute("role", "status");
    expect(screen.getByRole("img", { name: /Relationship diagram/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Accessible representation")).toBeInTheDocument();
  });

  it("gives every control an accessible name", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    // Tabs.
    expect(screen.getByRole("tab", { name: "Stage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data table" })).toBeInTheDocument();

    // Sliders (disabled pre-submit but still named).
    expect(screen.getByRole("slider", { name: "Length" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Amplitude" })).toBeInTheDocument();

    // Play/pause, switch, radios, submit. (Harness starts playing, so the
    // play/pause control reads "Pause".)
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "One-variable mode" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "It doubles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit prediction" })).toBeInTheDocument();

    // Notes textarea + save.
    expect(screen.getByRole("textbox", { name: "Your notes" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save observations to my trial log" })
    ).toBeInTheDocument();

    // Trust badge, source badge, back link, details summaries.
    expect(screen.getByLabelText("Trust: Verified simulation")).toBeInTheDocument();
    expect(screen.getByLabelText("Source: Offline catalog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to home" })).toBeInTheDocument();
    expect(screen.getByText("Trial log")).toBeInTheDocument();
    expect(screen.getByText("Limitations & provenance")).toBeInTheDocument();

    await submitPredictionKeyboard(user, "It increases but not by double");
    expect(
      screen.getByRole("button", { name: "Reveal the verified answer" })
    ).toBeInTheDocument();

    // Adaptation buttons carry text names (Accept / Reject).
    expect(screen.getAllByRole("button", { name: "Accept" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Reject" }).length).toBeGreaterThan(0);

    // No focusable control in the shell may lack an accessible name
    // (implicit label associations and aria-label both count). Hidden
    // form-ownership inputs (aria-hidden, tabindex -1) are not controls.
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, input, textarea, summary, [role='switch'], [role='tab']"
      )
    )) {
      if (el.getAttribute("aria-hidden") === "true") continue;
      try {
        expect(el).toHaveAccessibleName();
      } catch (error) {
        throw new Error(
          `Control without an accessible name: ${el.outerHTML.slice(0, 300)}`,
          { cause: error }
        );
      }
    }
  });

  it("never conveys meaning by color alone: trust badge and graded result carry text", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    const { container } = render(<Harness spec={spec} />);

    // Trust badge: text + aria-label, icon aria-hidden (not announced).
    const badge = screen.getByLabelText("Trust: Verified simulation");
    expect(within(badge).getByText("Verified simulation")).toBeInTheDocument();
    expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    // All three trust levels render their label text (never color alone).
    const { container: levelContainer } = render(
      <div>
        <TrustBadge level="verified_simulation" />
        <TrustBadge level="conceptual_demonstration" />
        <TrustBadge level="explanatory_animation" />
      </div>
    );
    expect(within(levelContainer as HTMLElement).getByText("Conceptual demonstration")).toBeInTheDocument();
    expect(within(levelContainer as HTMLElement).getByText("Explanatory animation")).toBeInTheDocument();

    // Graded result: the verdict is text ("…correct."/"…differed…"), not
    // just text-ok/text-danger color.
    await submitPredictionKeyboard(user, "It increases but not by double");
    // Focus lands on the first control (Length); manipulate it, then Tab to
    // the reveal.
    await user.keyboard("{ArrowRight}");
    await user.tab();
    await user.tab();
    await user.tab();
    const reveal = screen.getByRole("button", { name: "Reveal the verified answer" });
    expect(reveal).toBeEnabled();
    await user.click(reveal);
    expect(container.textContent).toContain("Your prediction was correct.");
  });

  it("uses responsive, non-fixed shell containers (text scale / zoom / 320px structural checks)", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const { container } = render(<Harness spec={spec} />);

    // Shell root: fluid width + max-width, never a fixed pixel width.
    const shellRoot = container.querySelector(".mx-auto.w-full.max-w-6xl");
    expect(shellRoot).not.toBeNull();

    // No fixed pixel widths/heights or fixed min-widths anywhere in the
    // shell: rem-based Tailwind spacing + w-full/max-w-* only, so 200% zoom
    // and 320px viewports reflow (real zoom is a MANUAL-CHECK — jsdom cannot
    // measure layout). min-w-0 (min-width: 0) is fluid and fine.
    //
    // Exemptions (documented in docs/accessibility-equivalents.md):
    //  - the Switch component root (data-slot="switch") carries fixed px
    //    sizes from src/components/ui/switch.tsx, which is outside this
    //    audit's editable scope; its expanded hit area is 56×34.4px (meets
    //    the WCAG AA 24px minimum, below the AAA 44px target).
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("[class]"))) {
      if (el.getAttribute("data-slot") === "switch") continue;
      // SVG elements expose className as SVGAnimatedString; normalize.
      const cls = String(el.className);
      expect(cls).not.toMatch(/w-\[\d+(\.\d+)?px\]/);
      expect(cls).not.toMatch(/min-w-\[\d+(\.\d+)?px\]/);
      expect(cls).not.toMatch(/h-\[\d+(\.\d+)?px\]/);
      expect(cls).not.toMatch(/max-w-\[\d+(\.\d+)?px\]/);
      // Visually-hidden form-ownership inputs use inline px (clip-path
      // hiding) — they are not layout containers, so they are exempt.
      const style = el.getAttribute("style") ?? "";
      // jsdom gives <canvas> a default inline width/height of 1px (no real
      // rasterizer); the stage canvas is sized by w-full h-full classes.
      // Percentages (e.g. the slider track fill) are fluid and fine.
      const isJsdomCanvas = el.tagName === "CANVAS";
      if (!style.includes("clip-path") && !isJsdomCanvas) {
        try {
          expect(el.style.width).not.toMatch(/px$/);
          expect(el.style.height).not.toMatch(/px$/);
        } catch (error) {
          throw new Error(
            `Unexpected fixed inline size: ${el.outerHTML.slice(0, 300)}`,
            { cause: error }
          );
        }
      }
    }

    // 320px: the two-column desktop grid is lg-gated; below lg it is a
    // single fluid column (grid with no column template).
    const grid = container.querySelector<HTMLElement>(".grid.gap-6");
    expect(grid).not.toBeNull();
    expect(grid!.className).toMatch(/lg:grid-cols-/);
    expect(grid!.className).not.toMatch(/(^|\s)grid-cols-/);
  });
});
