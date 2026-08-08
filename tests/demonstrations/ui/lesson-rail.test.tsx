/**
 * Lesson rail UI suite: the sequential predict → interact → observe → explain
 * → complete state machine, its completion gating, persisted completion on
 * back-navigation, the canonical interaction event surface (onNodeManipulate
 * for graph demos, control touch for engine demos), self-assessed explain for
 * conceptual demos, and the demoted AboutThisModel provenance dialog.
 *
 * The harness owns the model state exactly like demonstration-page does; the
 * simulator row mutates that state the way the stage and controls would
 * (node manipulation events and control touches), so the rail only ever sees
 * real event-shaped props.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { TrialRecord } from "@/demonstrations/state/demo-store";
import { demoStore } from "@/demonstrations/state/demo-store";
import { validateDemoSpec } from "@/demonstrations/validation";
import {
  deriveLessonPlan,
  LessonRail,
} from "@/components/demonstrations/lesson-rail";
import { AboutThisModel } from "@/components/demonstrations/about-this-model";

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
// Fixtures (validated in the tests that use them)
// ---------------------------------------------------------------------------

function baseLimits(): DemoSpecV1["limits"] {
  return {
    maxObjects: 80,
    maxParticles: 1500,
    maxTimelineEvents: 30,
    maxControls: 6,
  };
}

/** Level 1 verified simulation: pendulum, one parameter slider, graded. */
function verifiedPendulumSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "rail-pendulum",
    generationId: "gen-rail-pendulum",
    userQuery: "How does length affect a pendulum?",
    normalizedConcept: "Pendulum period",
    title: "Pendulum Motion",
    learningObjective: "Observe how length affects the period.",
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
      ],
      readouts: [
        { key: "period", label: "Period", format: "fixed2" },
      ],
    },
    controls: [
      { id: "length-control", type: "slider", label: "Length", target: { kind: "parameter", ref: "length" }, min: 0.1, max: 5, step: 0.1 },
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
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

/** Level 2 conceptual graph: the canonical cause_effect_network template. */
function causeEffectNetworkSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "rail-cen",
    generationId: "gen-rail-cen",
    userQuery: "How do causes spread through a network?",
    normalizedConcept: "Cause and effect networks",
    title: "Cause and Effect",
    learningObjective:
      "Map how one event triggers or suppresses another in a network of causes and effects.",
    trust: {
      level: "conceptual_demonstration",
      label: "Conceptual demonstration",
      limitations: [
        "Real systems usually have many more connections than the few shown here.",
      ],
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 1.5,
      background: "light",
    },
    scene3d: {
      objects: [
        { id: "a", kind: "process_node", label: "Cause A", position: { x: -3, y: 1, z: 0 }, size: 1 },
        { id: "b", kind: "process_node", label: "Effect B", position: { x: 0, y: 1, z: 0 }, size: 1 },
        { id: "c", kind: "process_node", label: "Effect C", position: { x: 0, y: -1, z: 0 }, size: 1 },
        { id: "d", kind: "process_node", label: "Inhibited D", position: { x: 3, y: -1, z: 0 }, size: 1 },
      ],
      relationships: [
        { id: "r1", type: "causes", from: "a", to: "b" },
        { id: "r2", type: "activates", from: "b", to: "c" },
        { id: "r3", type: "inhibits", from: "c", to: "d" },
      ],
      animations: [],
    },
    controls: [],
    prediction: {
      prompt: "If Cause A is removed, which effects do you expect to change?",
      options: ["B and C (and D through C)", "Only D", "Nothing changes"],
    },
    observationPrompts: [
      { prompt: "Follow each arrow to see which events trigger or suppress others." },
    ],
    representations: [
      { id: "rep-3d", kind: "stage_3d", label: "3D stage" },
      { id: "rep-diagram", kind: "diagram", label: "Diagram" },
    ],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "template_composition",
      templateIds: ["cause_effect_network"],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: baseLimits(),
  };
}

/** Level 1 hybrid showcase: spheres + orbits relationship + engine coupling. */
function hybridOrbitsSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "rail-orbits",
    generationId: "gen-rail-orbits",
    userQuery: "Why do planets stay in orbit?",
    normalizedConcept: "Orbital mechanics",
    title: "Orbit Demo",
    learningObjective: "Observe how launch speed sets the orbit shape.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Idealized two-body system."],
      engineId: "orbits",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "hybrid",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 16 / 9,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0.0",
      seed: 7,
      parameters: [
        { key: "speed", label: "Orbital speed", min: 0.5, max: 2, step: 0.1, value: 1, unit: "x" },
      ],
      readouts: [{ key: "period", label: "Period", format: "fixed2" }],
    },
    scene3d: {
      objects: [
        { id: "star", kind: "sphere", label: "Star", position: { x: 0, y: 0, z: 0 }, size: 2 },
        { id: "planet", kind: "sphere", label: "Planet", position: { x: 6, y: 0, z: 0 }, size: 1 },
      ],
      relationships: [
        { id: "rel-planet-orbits-star", type: "orbits", from: "planet", to: "star" },
      ],
      animations: [],
    },
    controls: [
      { id: "speed-control", type: "slider", label: "Orbital speed", target: { kind: "parameter", ref: "speed" }, min: 0.5, max: 2, step: 0.1 },
    ],
    prediction: {
      prompt: "What happens to the orbit if speed increases?",
      options: ["It moves to a larger orbit", "It moves to a smaller orbit"],
      correctIndex: 0,
    },
    observationPrompts: [{ prompt: "Watch the period readout." }],
    representations: [
      { id: "rep-stage", kind: "stage_3d", label: "3D stage" },
      { id: "rep-table", kind: "table", label: "Data table" },
    ],
    adaptationContext: { allowed: false, oneVariableMode: false },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    limits: baseLimits(),
  };
}

/** Level 3 explanatory animation: timeline only, no controls, ungraded. */
function explanatoryTimelineSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "rail-water",
    generationId: "gen-rail-water",
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

function assertValidSpec(spec: DemoSpecV1) {
  const outcome = validateDemoSpec(JSON.stringify(spec));
  expect(outcome.status).toBe("valid");
  expect(outcome.reasons).toEqual([]);
}

// ---------------------------------------------------------------------------
// Harness — mirrors demonstration-page's model state around the rail. The
// simulator row mutates state the way the stage and controls emit events.
// ---------------------------------------------------------------------------

function RailHarness({
  spec,
  withSimulator = true,
}: {
  spec: DemoSpecV1;
  withSimulator?: boolean;
}) {
  const [predictionIndex, setPredictionIndex] = useState<number | null>(null);
  const [manipulated, setManipulated] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [manipulatedNodeIds, setManipulatedNodeIds] = useState<string[]>([]);
  const [touchedControls, setTouchedControls] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [observationsSaved, setObservationsSaved] = useState(false);
  const [trials, setTrials] = useState<TrialRecord[]>([]);

  useEffect(() => {
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  const record = (overrides: Partial<TrialRecord>) => {
    const latest = demoStore.getTrials().length;
    const trial: TrialRecord = {
      trial: latest + 1,
      predictionIndex: null,
      parameters: {},
      readouts: [],
      controls: {},
      adaptations: [],
      recordedAt: new Date().toISOString(),
      ...overrides,
    };
    demoStore.recordTrial(trial);
    setTrials(demoStore.getTrials());
  };

  return (
    <div>
      <LessonRail
        spec={spec}
        predictionSubmitted={predictionIndex !== null}
        predictionIndex={predictionIndex}
        manipulated={manipulated}
        revealed={revealed}
        onPredictionSubmit={(index) => {
          setPredictionIndex(index);
          record({ predictionIndex: index });
        }}
        onReveal={() => setRevealed(true)}
        manipulatedNodeIds={manipulatedNodeIds}
        touchedControls={touchedControls}
        observationSelections={selections}
        observationNotes={notes}
        observationsSaved={observationsSaved}
        onObservationToggle={(prompt, checked) =>
          setSelections((prev) => ({ ...prev, [prompt]: checked }))
        }
        onObservationNotesChange={setNotes}
        onSaveObservations={() => {
          setObservationsSaved(true);
          record({});
        }}
        adaptationSuggestions={[]}
        onAdaptationDecision={() => {}}
        trials={trials}
        onReplayTrial={() => {}}
      />
      {withSimulator && (
        <div className="mt-4 flex flex-wrap gap-2 border border-border p-2">
          <button
            type="button"
            onClick={() => setManipulatedNodeIds((prev) =>
              prev.includes("a") ? prev : [...prev, "a"]
            )}
          >
            simulate manipulate a
          </button>
          <button
            type="button"
            onClick={() => {
              setManipulated(true);
              setTouchedControls((prev) =>
                prev.includes("length-control") ? prev : [...prev, "length-control"]
              );
            }}
          >
            simulate touch length-control
          </button>
          <button
            type="button"
            onClick={() => {
              setManipulated(true);
              setTouchedControls((prev) =>
                prev.includes("speed-control") ? prev : [...prev, "speed-control"]
              );
            }}
          >
            simulate touch speed-control
          </button>
        </div>
      )}
    </div>
  );
}

async function submitPrediction(
  user: ReturnType<typeof userEvent.setup>,
  optionName: string
) {
  await user.click(screen.getByLabelText(optionName));
  await user.click(screen.getByRole("button", { name: "Submit prediction" }));
}

function continueButton(): HTMLElement {
  return screen.getByRole("button", { name: "Continue" });
}

async function advance(user: ReturnType<typeof userEvent.setup>) {
  await user.click(continueButton());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LessonRail", () => {
  it("walks predict → interact → observe → explain → complete, gating Continue on each completion", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    // predict: Continue disabled until a prediction is committed.
    expect(continueButton()).toBeDisabled();
    await submitPrediction(user, "It increases but not by double");
    expect(continueButton()).toBeEnabled();

    // interact: the instruction references a real control; Continue gated on
    // that control actually being touched.
    await advance(user);
    expect(
      screen.getByRole("heading", { name: "Interact" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Move the Length slider.")
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "simulate touch length-control" })
    );
    expect(screen.getByText("Interaction recorded.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // observe: at least one selection required.
    await advance(user);
    expect(
      screen.getByRole("heading", { name: "Observe" })
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
    await user.click(screen.getByLabelText("Record the period for two lengths."));
    expect(continueButton()).toBeEnabled();

    // explain (engine): free-text self-assessment, no grading.
    await advance(user);
    expect(
      screen.getByRole("heading", { name: "Explain" })
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Your explanation" }),
      "A longer pendulum swings more slowly."
    );
    expect(continueButton()).toBeEnabled();

    // complete: recap, honest replay, and the home link.
    await advance(user);
    expect(
      screen.getByRole("heading", { name: "Complete" })
    ).toBeInTheDocument();
    expect(screen.getByText(/You predicted: It increases but not by double/)).toBeInTheDocument();
    expect(screen.getByText("You changed Length.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restore these parameters" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New concept" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("completes the interact step on onNodeManipulate for graph demos, with spec-derived copy", async () => {
    const spec = causeEffectNetworkSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    await submitPrediction(user, "B and C (and D through C)");
    await advance(user);

    // The instruction references the canonical node the renderer owns.
    expect(
      screen.getByText("Click Cause A and watch what happens downstream.")
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    // A different node's manipulation does not complete the step.
    // (Simulator only fires node "a"; see the observe options instead.)

    await user.click(screen.getByRole("button", { name: "simulate manipulate a" }));
    expect(screen.getByText("Interaction recorded.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // observe derives its options from the graph's downstream nodes.
    await advance(user);
    for (const label of ["Effect B", "Effect C", "Inhibited D"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    await user.click(screen.getByLabelText("Effect C"));
    expect(continueButton()).toBeEnabled();

    // explain: topology-derived question and self-assessed options, never
    // graded.
    await advance(user);
    expect(
      screen.getByText(
        "Why did Inhibited D change even though Cause A is not directly connected to it?"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The effect travels the chain: Cause A causes Effect B, Effect B activates Effect C, Effect C inhibits Inhibited D."
      )
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
    await user.click(
      screen.getByLabelText(
        "The effect travels the chain: Cause A causes Effect B, Effect B activates Effect C, Effect C inhibits Inhibited D."
      )
    );
    expect(continueButton()).toBeEnabled();
    expect(screen.queryByText("Verified answer")).not.toBeInTheDocument();
  });

  it("uses a watch-and-confirm interact step for timeline-only specs (no invented interactions)", async () => {
    const spec = explanatoryTimelineSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    await submitPrediction(user, "Evaporation");
    await advance(user);

    expect(
      screen.getByText("Watch the animation play through.")
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "I saw it" }));
    expect(screen.getByText("Animation watched.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });

  it("never relocks completed steps: Back shows them completed and re-advancing skips the conditions", async () => {
    const spec = causeEffectNetworkSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    await submitPrediction(user, "B and C (and D through C)");
    await advance(user); // → interact
    await user.click(screen.getByRole("button", { name: "simulate manipulate a" }));
    await advance(user); // → observe
    await user.click(screen.getByLabelText("Effect B"));
    await advance(user); // → explain
    await user.click(
      screen.getByLabelText(
        "The effect travels the chain: Cause A causes Effect B, Effect B activates Effect C, Effect C inhibits Inhibited D."
      )
    );
    await advance(user); // → complete (every step now completed)

    // Back to explain: completed steps never relock.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Explain" })
    ).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // Back to observe: it shows completed and Continue stays enabled even
    // after the learner unchecks the condition that unlocked it.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Observe" })
    ).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
    await user.click(screen.getByLabelText("Effect B")); // uncheck
    expect(continueButton()).toBeEnabled(); // completed steps never relock

    // Back through interact to predict: still completed, Continue enabled.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Interact" })
    ).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Predict" })
    ).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // Re-advance through the whole rail without re-doing any interaction:
    // every step's Continue is already unlocked.
    await advance(user); // → interact
    expect(continueButton()).toBeEnabled();
    await advance(user); // → observe
    expect(continueButton()).toBeEnabled();
    await advance(user); // → explain
    expect(continueButton()).toBeEnabled();
    await advance(user); // → complete
    expect(
      screen.getByRole("heading", { name: "Complete" })
    ).toBeInTheDocument();
  });

  it("records the observation trial exactly once when advancing past observe", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    await submitPrediction(user, "It increases but not by double");
    await advance(user);
    await user.click(
      screen.getByRole("button", { name: "simulate touch length-control" })
    );
    await advance(user);
    await user.click(screen.getByLabelText("Record the period for two lengths."));
    await advance(user); // observe → explain records the observation trial
    await advance(user); // explain → complete
    await user.click(screen.getByRole("button", { name: "Back" }));
    await advance(user); // re-advance past observe: no duplicate recording

    expect(demoStore.getTrials().length).toBe(2); // prediction + observation
  });

  it("treats hybrid showcase scenes as engine demos, never graph demos (A1 opt-out)", async () => {
    const spec = hybridOrbitsSpec();
    assertValidSpec(spec);

    // The plan resolves against the engine mapping, not the sphere
    // relationships (hybrid showcases never fire node callbacks).
    expect(deriveLessonPlan(spec).mode).toBe("engine");

    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    await submitPrediction(user, "It moves to a larger orbit");
    await advance(user);

    // The interact step references the real control, not a node click.
    expect(
      screen.getByText("Move the Orbital speed slider.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Click /)).not.toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    // Touching a different control does not complete the step.
    await user.click(
      screen.getByRole("button", { name: "simulate touch length-control" })
    );
    expect(continueButton()).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "simulate touch speed-control" })
    );
    expect(screen.getByText("Interaction recorded.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });

  it("derives engine observeOptions only from prompts that reference real controls (dangling controlId filtered)", () => {
    const spec = hybridOrbitsSpec();
    // A controlId'd prompt may reference a control the spec does not ship
    // (e.g. an AI generator emitting "gravity" while only launch speed is a
    // real control). The lesson plan must never offer an instruction the
    // learner cannot act on.
    spec.observationPrompts = [
      {
        prompt: "Watch the period readout as you change the launch speed.",
        controlId: "speed-control",
      },
      {
        prompt: "Try increasing the gravitational constant.",
        controlId: "gravity",
      },
    ] as unknown as DemoSpecV1["observationPrompts"];

    const plan = deriveLessonPlan(spec);
    expect(plan.mode).toBe("engine");
    const observeLabels = plan.observeOptions.map((o) => o.label);
    expect(observeLabels).toContain(
      "Watch the period readout as you change the launch speed."
    );
    expect(observeLabels).not.toContain(
      "Try increasing the gravitational constant."
    );
  });

  it("shows AboutThisModel provenance and save status (demoted, never deleted)", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    const user = userEvent.setup();
    render(
      <AboutThisModel
        spec={spec}
        source="offline"
        trials={[]}
        onReplayTrial={() => {}}
      />
    );

    // Closed by default: nothing leaks into the workspace.
    expect(screen.queryByText("About this model")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "About this model" }));

    expect(screen.getAllByText("Verified simulation").length).toBeGreaterThan(0);
    expect(screen.getByText("Offline catalog")).toBeInTheDocument();
    expect(screen.getByText("Curated engine (offline catalog)")).toBeInTheDocument();
    expect(screen.getByText("test-model")).toBeInTheDocument();
    expect(screen.getByText("Air resistance is ignored.")).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();

    // Save status works inside the dialog (guest → device).
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Saved on this device")).toBeInTheDocument();
    });
    expect(demoStore.getSession()?.savedToDevice).toBe(true);

    // Escape closes and the trigger keeps its role.
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Air resistance is ignored.")).not.toBeInTheDocument();
  });
});
