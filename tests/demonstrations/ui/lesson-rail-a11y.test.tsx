/**
 * Lesson rail accessibility suite (A4).
 *
 * Pins the keyboard + screen-reader contract of the rail and its surfaces:
 *  - a full predict → interact → observe → explain → complete journey driven
 *    by keyboard only (no pointer),
 *  - focus management on step advance: a fresh step hands focus to its
 *    heading, an already-completable step (completed steps never relock)
 *    hands focus to the enabled Continue button; a disabled Continue is never
 *    focused,
 *  - live regions: exactly one polite/status region changes per step
 *    transition, the region is silent on first render, and the interact
 *    completion status mounts only when the interaction lands while the step
 *    is displayed (re-advancing over a completed step does not double-announce),
 *  - the AboutThisModel dialog traps focus while open and returns focus to
 *    the trigger on Escape,
 *  - the disabled Continue is perceivable without color (native disabled +
 *    an explicit visible reason),
 *  - reduced motion: the page maps the OS/learner preference to
 *    data-reduced-motion and the rail itself carries no animation classes,
 *  - the honest accessible completion path: when WebGL is unavailable, the
 *    fallback diagram's nodes become real buttons that fire the canonical
 *    onNodeManipulate surface, so the graph interact step completes through a
 *    real interaction, not a fake gate.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
import type { RepresentationMode } from "@/domain/learner";
import { DEFAULT_LEARNER_PREFERENCES } from "@/domain/learner";
import { DemonstrationShell } from "@/components/demonstrations/demonstration-shell";
import { DemonstrationPage } from "@/components/demonstrations/demonstration-page";
import { LessonRail } from "@/components/demonstrations/lesson-rail";
import { AboutThisModel } from "@/components/demonstrations/about-this-model";
import { orderedRepresentations } from "@/components/demonstrations/representation-tabs";
import {
  deriveAdaptationSuggestions,
  type AdaptationSuggestion,
} from "@/components/demonstrations/adaptation-panel";

// ---------------------------------------------------------------------------
// Mocks (mirror demo-shell-a11y: the 3D renderer cannot run in jsdom)
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

const mock3d = vi.hoisted(() => ({
  instances: [] as Array<{ options: { reducedMotion?: boolean; mobile?: boolean } }>,
  failWebGL: false,
}));

vi.mock("@/demonstrations/renderers/primitive-3d", () => {
  class MockPrimitiveSceneRenderer {
    constructor(
      _canvas: unknown,
      options: { reducedMotion?: boolean; mobile?: boolean; onError?: (err: { reason: string }) => void }
    ) {
      mock3d.instances.push({ options });
      if (mock3d.failWebGL) {
        options.onError?.({ reason: "webgl_unavailable" });
      }
    }
    setSpec() {}
    setPlaying() {}
    setSpeed() {}
    setEngineState() {}
    dispose() {}
  }
  return { PrimitiveSceneRenderer: MockPrimitiveSceneRenderer };
});

const matchMediaState = vi.hoisted(() => ({ matches: false }));

beforeAll(() => {
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

/** Level 1 verified simulation: pendulum, one parameter slider, graded. */
function verifiedPendulumSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "rail-a11y-pendulum",
    generationId: "gen-rail-a11y-pendulum",
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
      readouts: [{ key: "period", label: "Period", format: "fixed2" }],
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
    id: "rail-a11y-cen",
    generationId: "gen-rail-a11y-cen",
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

function assertValidSpec(spec: DemoSpecV1) {
  const outcome = validateDemoSpec(JSON.stringify(spec));
  expect(outcome.status).toBe("valid");
  expect(outcome.reasons).toEqual([]);
}

// ---------------------------------------------------------------------------
// Harnesses
// ---------------------------------------------------------------------------

/** Rail-only harness: the model state is mutated by simulator buttons, the
 * way the stage and controls emit events in the real page. */
function RailHarness({ spec }: { spec: DemoSpecV1 }) {
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
    demoStore.recordTrial({
      trial: latest + 1,
      predictionIndex: null,
      parameters: {},
      readouts: [],
      controls: {},
      adaptations: [],
      recordedAt: new Date().toISOString(),
      ...overrides,
    });
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
      {/* Simulator: sits after the rail in DOM order, like the stage and
          controls sit before it in the real shell. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setManipulatedNodeIds((prev) =>
              prev.includes("a") ? prev : [...prev, "a"]
            )
          }
        >
          simulate manipulate a
        </button>
        <button
          type="button"
          onClick={() => {
            setManipulated(true);
            setTouchedControls((prev) =>
              prev.includes("length-control")
                ? prev
                : [...prev, "length-control"]
            );
          }}
        >
          simulate touch length-control
        </button>
      </div>
    </div>
  );
}

/** Full-shell harness mirroring demonstration-page's state wiring (used for
 * the WebGL-unavailable path, where the fallback diagram must become the
 * interaction surface). */
function ShellHarness({
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
  const [manipulatedNodeIds, setManipulatedNodeIds] = useState<string[]>([]);
  const [touchedControls, setTouchedControls] = useState<string[]>([]);
  const [observationSelections, setObservationSelections] = useState<
    Record<string, boolean>
  >({});
  const [observationNotes, setObservationNotes] = useState("");
  const [observationsSaved, setObservationsSaved] = useState(false);
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
        setTouchedControls((prev) =>
          prev.includes(id) ? prev : [...prev, id]
        );
      }}
      oneVariableMode={oneVariableMode}
      lockedControl={lockedControl}
      onOneVariableModeChange={setOneVariableMode}
      activeRepresentation={activeRepresentationId}
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
      onSaveObservations={() => setObservationsSaved(true)}
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function continueButton(): HTMLElement {
  return screen.getByRole("button", { name: "Continue" });
}

async function submitPredictionKeyboard(
  user: ReturnType<typeof userEvent.setup>,
  optionName: string
) {
  const option = screen.getByLabelText(optionName);
  option.focus();
  await user.keyboard(" ");
  await user.tab();
  await user.keyboard("{Enter}");
}

/**
 * Region snapshot: every polite/status region with its text. A region that
 * unmounts (e.g. the predict status when the predict step is left) is not an
 * announcement; a newly mounted region announces its text on mount.
 */
function regionSnapshot(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[aria-live], [role='status']")
  ).map((node) => ({ node, text: node.textContent ?? "" }));
}

/** The announcement texts caused by an action: changed persistent regions
 * plus newly mounted regions with non-empty text. */
function changedRegionTexts(
  before: Array<{ node: HTMLElement; text: string }>,
  after: Array<{ node: HTMLElement; text: string }>
): string[] {
  const changed: string[] = [];
  const afterByNode = new Map(after.map((r) => [r.node, r]));
  for (const b of before) {
    const a = afterByNode.get(b.node);
    if (a && a.text !== b.text) changed.push(a.text);
  }
  const beforeNodes = new Set(before.map((r) => r.node));
  for (const a of after) {
    if (!beforeNodes.has(a.node) && a.text.trim() !== "") changed.push(a.text);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("lesson rail accessibility", () => {
  it("completes the whole lesson by keyboard only (no pointer)", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    // predict: radio via Space, submit via Enter (explicit focus, keyboard
    // only; the rail harness has no controls section to hand focus to).
    await submitPredictionKeyboard(user, "It increases but not by double");
    expect(
      screen.getByText("Prediction locked in")
    ).toBeInTheDocument();

    // tab → Continue (the only remaining focusable in the predict step).
    await user.tab();
    expect(continueButton()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Interact" })
    ).toBeInTheDocument();

    // interact (fresh step): heading has focus; the disabled Continue is
    // skipped by Tab.
    expect(
      screen.getByRole("heading", { name: "Interact" })
    ).toHaveFocus();
    await user.tab(); // Back
    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();

    // The real page hands focus to the experiment control after the
    // prediction gate (predict → manipulate handoff); the harness simulator
    // stands in for that control. Activate it by keyboard.
    screen.getByRole("button", { name: "simulate touch length-control" }).focus();
    await user.keyboard("{Enter}"); // touch length-control
    expect(screen.getByText("Interaction recorded.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // The rail's own focus rule applies on the completed step: Continue is
    // the next action, so a real keyboard user lands on it directly.
    continueButton().focus();
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Observe" })
    ).toBeInTheDocument();

    // observe: check the box, tab to Continue, advance.
    await user.tab(); // checkbox
    await user.keyboard(" "); // check it
    await user.tab(); // notes
    await user.tab(); // Back
    await user.tab(); // Continue
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Explain" })
    ).toBeInTheDocument();

    // explain: type, tab to Continue, advance.
    await user.tab(); // textarea
    await user.type(
      screen.getByRole("textbox", { name: "Your explanation" }),
      "A longer pendulum swings more slowly."
    );
    await user.tab(); // Back
    await user.tab(); // Continue
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Complete" })
    ).toBeInTheDocument();

    // complete: the replay button (the harness records trials exactly like
    // the real page) and then the home link are the final stops.
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Restore these parameters" })
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "New concept" })).toHaveFocus();
  });

  it("hands focus to Continue on arrival when the step is already completable, and to the heading on a fresh step", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    await submitPredictionKeyboard(user, "It increases but not by double");
    await user.tab(); // Continue
    await user.keyboard("{Enter}");

    // Fresh step: the heading is the focus target (Continue is disabled and
    // must never receive focus).
    expect(
      screen.getByRole("heading", { name: "Interact" })
    ).toHaveFocus();

    // Complete interact, advance to observe (fresh → heading), complete
    // observe, advance to explain (fresh → heading).
    await user.click(screen.getByRole("button", { name: "simulate touch length-control" }));
    await user.click(continueButton());
    expect(
      screen.getByRole("heading", { name: "Observe" })
    ).toHaveFocus();
    await user.click(screen.getByLabelText("Record the period for two lengths."));
    await user.click(continueButton());
    expect(
      screen.getByRole("heading", { name: "Explain" })
    ).toHaveFocus();

    // Back to the completed observe step: Continue is enabled and focused,
    // so re-advancing is a single Enter (fast-forward, never relocked).
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(continueButton()).toHaveFocus();
    expect(continueButton()).toBeEnabled();

    // Completed steps are exposed to assistive tech as text, never by color
    // alone: the nav carries an sr-only ", completed" suffix inside the step
    // indicator, and the current step carries aria-current="step".
    const stepsNav = screen.getByRole("navigation", { name: "Lesson steps" });
    const observeIndicator = within(stepsNav).getByText("Observe");
    expect(observeIndicator.textContent).toContain("completed");
    expect(observeIndicator).toHaveAttribute("aria-current", "step");
    // Predict and Interact are completed too; the upcoming Explain is not.
    expect(
      within(stepsNav).getByText("Predict").textContent
    ).toContain("completed");
    expect(within(stepsNav).getByText("Explain").textContent).not.toContain(
      "completed"
    );

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Explain" })
    ).toBeInTheDocument();
  });

  it("announces each step transition in exactly one polite region and stays silent on first render", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    const { container } = render(<RailHarness spec={spec} />);

    // First render: the rail's polite region is mounted but empty, so nothing
    // is announced on page load.
    const initial = regionSnapshot(container);
    expect(initial.length).toBeGreaterThanOrEqual(1);
    expect(initial[0].text).toBe("");

    // Prediction submit: exactly one change (the predict status).
    await submitPredictionKeyboard(user, "It increases but not by double");
    const afterSubmit = regionSnapshot(container);
    expect(changedRegionTexts(initial, afterSubmit)).toEqual([
      "Prediction recorded. Controls unlocked.",
    ]);

    // Step advance to a fresh step: exactly one change (the rail region).
    await user.click(continueButton());
    const afterAdvance = regionSnapshot(container);
    expect(changedRegionTexts(afterSubmit, afterAdvance)).toEqual([
      "Lesson step: Interact",
    ]);

    // The interaction completing while displayed: exactly one change (the
    // interact status); the rail region does not re-announce.
    await user.click(
      screen.getByRole("button", { name: "simulate touch length-control" })
    );
    const afterTouch = regionSnapshot(container);
    expect(changedRegionTexts(afterAdvance, afterTouch)).toEqual([
      "Interaction recorded.",
    ]);

    // Advance again: exactly one change, and the interact status region does
    // not double-announce (it unmounts with the step; unmounts are silent).
    await user.click(continueButton());
    const afterObserve = regionSnapshot(container);
    expect(changedRegionTexts(afterTouch, afterObserve)).toEqual([
      "Lesson step: Observe",
    ]);

    // Back over the completed interact step: exactly one change (the rail
    // region), and the completion status must NOT mount on arrival — the
    // transition stays a single announcement.
    await user.click(screen.getByRole("button", { name: "Back" }));
    const afterRevisit = regionSnapshot(container);
    expect(changedRegionTexts(afterObserve, afterRevisit)).toEqual([
      "Lesson step: Interact",
    ]);

    // Re-advancing over the completed step is again a single announcement.
    await user.click(continueButton());
    const afterForward = regionSnapshot(container);
    expect(changedRegionTexts(afterRevisit, afterForward)).toEqual([
      "Lesson step: Observe",
    ]);
  });

  it("traps focus inside the AboutThisModel dialog and returns it to the trigger on Escape", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(
      <AboutThisModel spec={spec} source="offline" trials={[]} onReplayTrial={() => {}} />
    );

    const trigger = screen.getByRole("button", { name: "About this model" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("About this model");
    // Focus moved into the dialog (base-ui focuses the popup on open).
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab cycles stay inside the dialog (no focus escape to the trigger).
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Escape closes and focus returns to the trigger.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps Continue perceivably disabled: native disabled plus a visible reason, never color alone", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<RailHarness spec={spec} />);

    const disabled = continueButton();
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute("disabled");
    // The reason is stated in text (opacity alone is not perceivable).
    expect(
      screen.getByText("Complete this step to continue.")
    ).toBeInTheDocument();

    await submitPredictionKeyboard(user, "It increases but not by double");
    expect(continueButton()).toBeEnabled();
    expect(
      screen.queryByText("Complete this step to continue.")
    ).not.toBeInTheDocument();
  });

  it("honors reduced motion: the page maps the preference to data-reduced-motion and the rail carries no animation", async () => {
    const spec = verifiedPendulumSpec();
    assertValidSpec(spec);

    // OS does NOT request reduced motion; the stored learner preference wins
    // and must reach the document as data-reduced-motion (the CSS
    // kill-switch in globals.css keys off it).
    matchMediaState.matches = false;
    window.localStorage.setItem(
      "unseenlab.preferences.v1",
      JSON.stringify({
        ...DEFAULT_LEARNER_PREFERENCES,
        reducedMotion: true,
      })
    );
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");

    const { unmount, container } = render(<DemonstrationPage demoId={spec.id} />);
    await waitFor(() => {
      expect(
        document.documentElement.getAttribute("data-reduced-motion")
      ).toBe("true");
    });

    // The rail is motion-free by construction: no animation or transition
    // classes anywhere inside it, so the kill-switch has nothing to suppress
    // and nothing can run under any motion preference.
    const rail = container.querySelector('[aria-label="Lesson"]');
    expect(rail).not.toBeNull();
    for (const el of Array.from(rail!.querySelectorAll<HTMLElement>("[class]"))) {
      const cls = String(el.className);
      expect(cls).not.toMatch(/(^|\s)(animate|transition)-/);
    }

    // Nothing leaks after leaving the page.
    unmount();
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBeNull();
  });

  it("completes the graph interact step through the accessible fallback diagram when WebGL is unavailable", async () => {
    const spec = causeEffectNetworkSpec();
    assertValidSpec(spec);
    mock3d.failWebGL = true;
    const user = userEvent.setup();
    render(<ShellHarness spec={spec} />);

    // The stage fell back to the accessible representation, and its graph
    // nodes became real buttons firing the canonical interaction surface.
    expect(await screen.findByText(/WebGL is not available here/)).toBeVisible();
    const causeA = screen.getByRole("button", { name: "Cause A" });
    expect(causeA).toHaveAttribute("aria-pressed", "false");
    for (const label of ["Effect B", "Effect C", "Inhibited D"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // The stage fallback IS the interactive diagram surface: its svg is a
    // role="group" container (A10 role contract — static diagrams keep
    // role="img") holding the four node buttons. The Diagram tab
    // (representation-tabs) provides the same interactive surface; that path
    // is pinned by the dedicated tab-interaction test below.
    expect(
      within(screen.getByRole("group", { name: /Relationship diagram/ })).getAllByRole("button").length
    ).toBe(4);

    // Commit a prediction, then reach the interact step.
    await submitPredictionKeyboard(user, "B and C (and D through C)");
    await user.click(continueButton());
    expect(
      screen.getByText("Click Cause A and watch what happens downstream.")
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    // Keyboard activation of the node on the accessible surface: a real
    // manipulation (the same onNodeManipulate event the 3D renderer fires),
    // never a fake gate.
    causeA.focus();
    await user.keyboard("{Enter}");
    expect(causeA).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Interaction recorded.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();

    // Escape clears the selection but the completed step never relocks.
    await user.keyboard("{Escape}");
    expect(causeA).toHaveAttribute("aria-pressed", "false");
    expect(continueButton()).toBeEnabled();

    // The lesson continues past the fallback interact step normally. The
    // observe checkboxes derive from the graph's downstream nodes (scoped by
    // role: the diagram's node buttons share their labels).
    await user.click(continueButton());
    expect(
      screen.getByRole("heading", { name: "Observe" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Effect B" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Inhibited D" })
    ).toBeInTheDocument();
  });

  it("completes the graph interact step through the Diagram TAB's interactive nodes — 2D parity, no 3D stage activation", async () => {
    const spec = causeEffectNetworkSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<ShellHarness spec={spec} />);

    // Commit a prediction, then reach the interact step.
    await submitPredictionKeyboard(user, "B and C (and D through C)");
    await user.click(continueButton());
    expect(
      screen.getByText("Click Cause A and watch what happens downstream.")
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();

    // Switch to the Diagram tab. The 3D stage is never activated: WebGL is
    // available (no fallback) and the interaction happens entirely inside the
    // tab's diagram — the same canonical node ids the stage owns.
    await user.click(screen.getByRole("tab", { name: "Diagram" }));
    expect(screen.queryByText(/WebGL is not available here/)).not.toBeInTheDocument();
    const panel = screen.getByRole("tabpanel");
    const causeA = within(panel).getByRole("button", { name: "Cause A" });
    expect(causeA).toHaveAttribute("aria-pressed", "false");

    // One click on the node completes the interact step: the rail records the
    // canonical manipulation and unlocks Continue — exactly like the 3D path.
    await user.click(causeA);
    expect(causeA).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Interaction recorded.")).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });
});
