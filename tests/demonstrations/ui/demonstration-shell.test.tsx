/**
 * Demonstration shell UI suite (70/30 lesson workspace).
 *
 * jsdom has no canvas rasterizer and no WebGL, so the 2D runner runs against
 * its no-op fallback context and the 3D renderer reports webgl_unavailable —
 * exactly the fallback paths this suite exercises. The requestAnimationFrame
 * loop is stubbed to a no-op so no per-frame state churn leaks into
 * assertions; setScene still emits the initial readouts synchronously.
 *
 * The suite preserves the pre-redesign intents: prediction-first gating,
 * reveal gating on manipulation, one-variable mode, honest replay labels,
 * honest save status, live-region announcements, the nuclear chain reaction
 * card, the WebGL fallback, and readouts in the table view. Provenance,
 * limitations, save status and the trial log now live in AboutThisModel (the
 * ⓘ button), so those assertions open the dialog first.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useMemo, useState } from "react";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { TrialRecord } from "@/demonstrations/state/demo-store";
import { demoStore } from "@/demonstrations/state/demo-store";
import { validateDemoSpec } from "@/demonstrations/validation";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
import { DemonstrationShell } from "@/components/demonstrations/demonstration-shell";
import { orderedRepresentations } from "@/components/demonstrations/representation-tabs";
import type { RepresentationMode } from "@/domain/learner";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  // No-op the animation loop: setScene still emits initial readouts.
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  demoStore.clear();
  window.localStorage.clear();
});

// ---------------------------------------------------------------------------
// Fixtures (all validated with validateDemoSpec in the tests that use them)
// ---------------------------------------------------------------------------

function baseLimits(overrides: Partial<DemoSpecV1["limits"]> = {}): DemoSpecV1["limits"] {
  return {
    maxObjects: 80,
    maxParticles: 1500,
    maxTimelineEvents: 30,
    maxControls: 6,
    ...overrides,
  };
}

/** Level 1 verified simulation: pendulum, two parameter sliders, graded. */
function verifiedPendulumSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-pendulum",
    generationId: "gen-pend-1",
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

/** Level 3 explanatory animation: timeline + table, no controls, ungraded. */
function explanatoryTimelineSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-water",
    generationId: "gen-water-1",
    userQuery: "What are the stages of the water cycle?",
    normalizedConcept: "Water cycle stages",
    title: "The Water Cycle",
    learningObjective: "Order the stages of the water cycle.",
    trust: {
      level: "explanatory_animation",
      label: "Explanatory animation",
      limitations: ["Simplified order; real cycles are continuous."],
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "timeline",
      preferredAspectRatio: 1.78,
      background: "dark",
    },
    timeline: {
      events: [
        { title: "Evaporation", description: "Warmth turns surface water into vapor.", startMs: 0, durationMs: 1000 },
        { title: "Condensation", description: "Vapor cools into clouds.", startMs: 1000, durationMs: 1000 },
        { title: "Precipitation", description: "Water falls back down.", startMs: 2000, durationMs: 1000 },
      ],
    },
    controls: [],
    prediction: {
      prompt: "Which stage comes first?",
      options: ["Evaporation", "Condensation"],
    },
    observationPrompts: [{ prompt: "List the stages in order." }],
    representations: [
      { id: "rep-timeline", kind: "timeline", label: "Timeline" },
      { id: "rep-table", kind: "table", label: "Table" },
    ],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "template_composition",
      templateIds: ["timeline_sequence"],
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    limits: baseLimits(),
  };
}

/** Level 1 spec that names the nuclear_chain_reaction engine. */
function nuclearChainReactionSpec(): DemoSpecV1 {
  const spec = verifiedPendulumSpec();
  spec.id = "demo-nuclear";
  spec.generationId = "gen-nuc-1";
  spec.title = "Nuclear Chain Reaction";
  spec.learningObjective = "Explore how absorber rods control a chain reaction.";
  spec.trust.engineId = "nuclear_chain_reaction";
  spec.trust.limitations = [
    "Dimensionless model; not a real reactor.",
    "Numbers are illustrative, not physical.",
  ];
  spec.simulation = {
    engineId: "nuclear_chain_reaction",
    engineVersion: "1.0.0",
    seed: 7,
    parameters: [
      { key: "initialNeutrons", label: "Initial neutrons", min: 1, max: 1000, step: 1, value: 50 },
      { key: "absorber", label: "Absorber", min: 0, max: 1, step: 0.05, value: 0.3 },
      { key: "multiplication", label: "Multiplication", min: 1, max: 3, step: 0.1, value: 2 },
    ],
    readouts: [
      { key: "neutronCount", label: "Neutron count", format: "raw" },
      { key: "generation", label: "Generation", format: "raw" },
    ],
  };
  spec.prediction = {
    prompt: "What happens when the absorber is removed?",
    options: ["The count rises", "The count stays the same"],
    correctIndex: 0,
  };
  spec.controls = [
    { id: "absorber-control", type: "slider", label: "Absorber", target: { kind: "parameter", ref: "absorber" }, min: 0, max: 1, step: 0.05 },
  ];
  return spec;
}

/** Level 2 conceptual 3D spec (WebGL unavailable → accessible fallback). */
function conceptual3dSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-energy",
    generationId: "gen-energy-1",
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
// Harness — mirrors demonstration-page's state wiring around the shell
// ---------------------------------------------------------------------------

function Harness({
  spec,
  initialOneVariable = false,
  reducedMotion = false,
  preferredRepresentations = ["animation"],
}: {
  spec: DemoSpecV1;
  initialOneVariable?: boolean;
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
  const [oneVariableMode, setOneVariableMode] = useState(initialOneVariable);
  const [lockedControl, setLockedControl] = useState<string | null>(null);
  const [activeRep, setActiveRep] = useState<string | null>(null);
  const [manipulatedNodeIds, setManipulatedNodeIds] = useState<string[]>([]);
  const [touchedControls, setTouchedControls] = useState<string[]>([]);
  const [observationSelections, setObservationSelections] = useState<
    Record<string, boolean>
  >({});
  const [observationNotes, setObservationNotes] = useState("");
  const [observationsSaved, setObservationsSaved] = useState(false);
  const [replay, setReplay] = useState<{ trial: TrialRecord; token: number } | null>(null);
  const [, setStoreTick] = useState(0);

  // Seed the store session so recordTrial/saveToDevice have somewhere to write.
  useEffect(() => {
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  useEffect(() => demoStore.subscribe(() => setStoreTick((t) => t + 1)), []);

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
        setTouchedControls((prev) =>
          prev.includes(id) ? prev : [...prev, id]
        );
      }}
      oneVariableMode={oneVariableMode}
      lockedControl={lockedControl}
      onOneVariableModeChange={setOneVariableMode}
      activeRepresentation={activeRep ?? ordered[0]?.id ?? ""}
      onRepresentationChange={setActiveRep}
      reducedMotion={reducedMotion}
      preferredRepresentations={preferredRepresentations}
      observationSelections={observationSelections}
      observationNotes={observationNotes}
      observationsSaved={observationsSaved}
      onObservationToggle={(prompt, checked) =>
        setObservationSelections((prev) => ({ ...prev, [prompt]: checked }))
      }
      onObservationNotesChange={setObservationNotes}
      onSaveObservations={() => {
        setObservationsSaved(true);
        demoStore.recordTrial({
          predictionIndex: null,
          parameters: { ...parameters },
          readouts: readouts.map((r) => ({ label: r.label, value: r.value })),
          controls: { playing, speed },
          adaptations: [],
        });
      }}
      adaptationSuggestions={[]}
      onAdaptationDecision={() => {}}
      trials={demoStore.getTrials()}
      replay={replay}
      onReplayTrial={(trial) => {
        setParameters({ ...trial.parameters });
        setResetSignal((n) => n + 1);
        setReplay({ trial, token: Date.now() });
      }}
      onDismissReplay={() => setReplay(null)}
      onNodeManipulate={(nodeId) => {
        if (predictionIndex === null) return;
        setManipulatedNodeIds((prev) =>
          prev.includes(nodeId) ? prev : [...prev, nodeId]
        );
      }}
      manipulatedNodeIds={manipulatedNodeIds}
      touchedControls={touchedControls}
    />
  );
}

async function submitPrediction(
  user: ReturnType<typeof userEvent.setup>,
  optionName: string
) {
  await user.click(screen.getByLabelText(optionName));
  await user.click(screen.getByRole("button", { name: "Submit prediction" }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DemonstrationShell", () => {
  it("renders the title and trust chip; provenance is demoted into AboutThisModel", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    expect(
      screen.getByRole("heading", { name: "Pendulum Motion" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Trust: Verified simulation")).toBeInTheDocument();

    // Demoted, never deleted: the source badge, limitations and provenance
    // are NOT in the primary workspace; they open via the ⓘ button.
    expect(screen.queryByText("Offline catalog")).not.toBeInTheDocument();
    expect(screen.queryByText("Air resistance is ignored.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "About this model" }));

    expect(screen.getByText("Offline catalog")).toBeInTheDocument();
    expect(screen.getByText("Air resistance is ignored.")).toBeInTheDocument();
    expect(screen.getByText("test-model")).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();

    // Escape closes the dialog.
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Air resistance is ignored.")).not.toBeInTheDocument();
  });

  it("keeps controls disabled until a prediction is submitted (prediction-first)", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    const lengthSlider = screen.getByRole("slider", { name: "Length" });
    expect(lengthSlider).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "Predict" })
    ).toBeInTheDocument();

    await submitPrediction(user, "It increases but not by double");

    expect(screen.getByText("Prediction locked in")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Length" })).toBeEnabled();
    expect(screen.getByRole("slider", { name: "Amplitude" })).toBeEnabled();
  });

  it("freezes every control except the selected one in one-variable mode", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} initialOneVariable />);

    await submitPrediction(user, "It increases but not by double");

    const lengthSlider = screen.getByRole("slider", { name: "Length" });
    const amplitudeSlider = screen.getByRole("slider", { name: "Amplitude" });
    expect(lengthSlider).toBeEnabled();
    expect(amplitudeSlider).toBeEnabled();

    // Touching one control freezes the others.
    fireEvent.change(lengthSlider, { target: { value: "2.5" } });

    expect(amplitudeSlider).toBeDisabled();
    expect(
      screen.getAllByText("Held constant (one-variable mode)").length
    ).toBeGreaterThan(0);
  });

  it("shows live readouts in the table representation for Level 1", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    await user.click(screen.getByRole("tab", { name: "Data table" }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("Parameters and live readouts")).toBeInTheDocument();
    expect(within(table).getByText("Pendulum length")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(table).getByText("Period")).toBeInTheDocument();
    });
  });

  it("switches between timeline and table representations for Level 3", async () => {
    const spec = explanatoryTimelineSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    // First ordered representation (timeline) is active by default.
    const timeline = screen.getByLabelText("Timeline of events");
    expect(within(timeline).getByText("Evaporation")).toBeInTheDocument();
    expect(within(timeline).getByText("Condensation")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Table" }));
    expect(screen.getByText("Declared parameters and limits")).toBeInTheDocument();
    expect(screen.getByText("Max timeline events")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    const timelineAgain = screen.getByLabelText("Timeline of events");
    expect(within(timelineAgain).getByText("Precipitation")).toBeInTheDocument();
  });

  it("shows the verified lab card with a link for the nuclear engine", () => {
    const spec = nuclearChainReactionSpec();
    assertValidSpec(spec);
    render(<Harness spec={spec} />);

    expect(
      screen.getByText(
        "The Nuclear Chain Reaction lab is the verified home for this topic"
      )
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "Open the Nuclear Chain Reaction lab",
    });
    expect(link).toHaveAttribute("href", "/lab/nuclear-chain-reaction");
  });

  it("falls back to the accessible representation when WebGL is unavailable", async () => {
    const spec = conceptual3dSpec();
    assertValidSpec(spec);
    render(<Harness spec={spec} />);

    expect(
      await screen.findByText(/WebGL is not available here/)
    ).toBeInTheDocument();
    // The fallback diagram is the interactive surface (callbacks wired), so
    // its svg is a role="group" container (A10 role contract); a static
    // diagram would keep role="img".
    expect(
      screen.getByRole("group", { name: /Relationship diagram/ })
    ).toBeInTheDocument();
  });

  it("records a prediction and replays its parameters with honest labels", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    await submitPrediction(user, "It increases but not by double");

    // Trial log lives in AboutThisModel (demoted, not deleted).
    await user.click(screen.getByRole("button", { name: "About this model" }));
    expect(screen.getByText("Entry 1 · Prediction")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Restore these parameters" })
    );

    // The dialog closes so the replay banner can take focus.
    expect(screen.queryByText("Entry 1 · Prediction")).not.toBeInTheDocument();
    expect(screen.getByText("Replay entry 1")).toBeInTheDocument();
    expect(
      screen.getByText(/Parameters restored from entry 1.*simulation restarts fresh/)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss replay" }));
    expect(screen.queryByText("Replay entry 1")).not.toBeInTheDocument();
  });

  it("gates the graded reveal on manipulation and never reveals early", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    // No reveal before a prediction exists.
    expect(
      screen.queryByRole("button", { name: "Reveal the verified answer" })
    ).not.toBeInTheDocument();

    await submitPrediction(user, "It increases but not by double");

    const reveal = screen.getByRole("button", {
      name: "Reveal the verified answer",
    });
    expect(reveal).toBeDisabled();

    // Manipulate once, then the reveal unlocks.
    fireEvent.change(screen.getByRole("slider", { name: "Length" }), {
      target: { value: "3" },
    });
    expect(reveal).toBeEnabled();

    await user.click(reveal);
    expect(screen.getByText("Verified answer")).toBeInTheDocument();
    expect(screen.getByText("Your prediction was correct.")).toBeInTheDocument();
  });

  it("never grades an ungraded prediction", async () => {
    const spec = conceptual3dSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    await submitPrediction(user, "From source to sink");

    expect(screen.getByText("Compare with what you observed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reveal the verified answer" })
    ).not.toBeInTheDocument();
  });

  it("saves to the device for guests and reports the status honestly", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    await user.click(screen.getByRole("button", { name: "About this model" }));
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Saved on this device")).toBeInTheDocument();
    });
    const stored = window.localStorage.getItem("unseenlab.demo.demo-pendulum");
    expect(stored).toContain("demo-pendulum");
    expect(demoStore.getSession()?.savedToDevice).toBe(true);
  });

  it("announces representation switches in a live region and keeps it quiet otherwise", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    const tabsSection = screen.getByLabelText("Representations");
    const liveRegion = within(tabsSection).getByText(
      (_content, element) => element?.getAttribute("aria-live") === "polite"
    );

    // Nothing announced on first render.
    expect(liveRegion).toHaveTextContent("");

    await user.click(within(tabsSection).getByRole("tab", { name: "Data table" }));
    expect(liveRegion).toHaveTextContent("View: Data table");

    // Switching back announces again.
    await user.click(within(tabsSection).getByRole("tab", { name: "Stage" }));
    expect(liveRegion).toHaveTextContent("View: Stage");
  });

  it("lays out the 70/30 workspace: model column first, lesson rail beside it", () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    render(<Harness spec={spec} />);

    const grid = document.querySelector(".grid.gap-6");
    expect(grid).not.toBeNull();
    expect(grid!.className).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_minmax\(320px,380px\)\]/);
    expect(grid!.className).not.toMatch(/(^|\s)grid-cols-/);

    // The lesson rail is present with the five step names.
    const rail = screen.getByLabelText("Lesson");
    for (const step of ["Predict", "Interact", "Observe", "Explain", "Complete"]) {
      expect(within(rail).getAllByText(step).length).toBeGreaterThan(0);
    }

    // The primary workspace no longer shows the standalone observability
    // cards: no trial log, no limitations, no save button in the header.
    expect(screen.queryByText("Trial log")).not.toBeInTheDocument();
    expect(screen.queryByText("Limitations & provenance")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
