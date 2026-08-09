/**
 * Closure-90 a11y matrix pinning tests.
 *
 * These tests pin, in jsdom, the exact behaviors verified live in Chromium
 * during the Phase 6 readiness run (docs/closure-90-a11y.md):
 *  - pre-gate disabled controls are excluded from the keyboard tab cycle and
 *    join it only after the prediction gate unlocks (focus never lands on a
 *    disabled control),
 *  - the representation tablist uses a roving tabindex and supports
 *    Home/End in addition to the arrow keys,
 *  - the one-variable switch toggles with Space alone (keyboard-only),
 *  - the save control announces the outcome in a polite live region
 *    ("Not saved" -> "Saved on this device"), one region, no spam.
 *
 * The 3D renderer is mocked exactly like demo-shell-a11y.test.tsx (jsdom has
 * no WebGL); the shell harness mirrors demonstration-page's state wiring.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useMemo, useState } from "react";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { demoStore } from "@/demonstrations/state/demo-store";
import type { TrialRecord } from "@/demonstrations/state/demo-store";
import { validateDemoSpec } from "@/demonstrations/validation";
import { DemonstrationShell } from "@/components/demonstrations/demonstration-shell";
import { DemoSaveControl } from "@/components/demonstrations/demo-save-control";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
import type { RepresentationMode } from "@/domain/learner";
import type { AdaptationSuggestion } from "@/components/demonstrations/adaptation-panel";
import { deriveAdaptationSuggestions } from "@/components/demonstrations/adaptation-panel";
import { orderedRepresentations } from "@/components/demonstrations/representation-tabs";

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

vi.mock("@/demonstrations/renderers/primitive-3d", () => {
  class MockPrimitiveSceneRenderer {
    constructor(
      _canvas: unknown,
      options: { onError?: (err: { reason: string }) => void }
    ) {
      options.onError?.({ reason: "webgl_unavailable" });
    }
    setSpec() {}
    getEscapeClassification() {
      return null;
    }
    readLabelProjections() {
      return null;
    }
    getIdentityAnchor() {
      return null;
    }
    getEdgeAnchor() {
      return null;
    }
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
  matchMediaState.matches = false;
  demoStore.clear();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-reduced-motion");
  document.body.classList.remove("high-contrast");
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** Level 1 verified simulation with two sliders, a gate, and two tabs. */
function matrixSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "a11y-matrix",
    generationId: "gen-a11y-matrix",
    userQuery: "Why do planets remain in orbit?",
    normalizedConcept: "Orbital mechanics",
    title: "Orbit Demo",
    learningObjective: "Observe how speed and mass affect the orbit.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Idealized two-body system."],
      engineId: "orbits",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "data_table",
      preferredAspectRatio: 1.6,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0.0",
      seed: 7,
      parameters: [
        { key: "speed", label: "Orbital speed", min: 0.5, max: 2, step: 0.1, value: 1, unit: "x" },
        { key: "bodyMass", label: "Planet mass", min: 0.5, max: 2, step: 0.1, value: 1, unit: "x" },
      ],
      readouts: [
        { key: "period", label: "Period", format: "fixed2" },
        { key: "distance", label: "Distance", format: "raw" },
      ],
    },
    controls: [
      { id: "speed-control", type: "slider", label: "Orbital speed", target: { kind: "parameter", ref: "speed" }, min: 0.5, max: 2, step: 0.1 },
      { id: "mass-control", type: "slider", label: "Planet mass", target: { kind: "parameter", ref: "bodyMass" }, min: 0.5, max: 2, step: 0.1 },
      { id: "play-control", type: "play_pause", label: "Play", target: { kind: "scene", ref: "play_pause" } },
      { id: "reset-control", type: "reset", label: "Reset", target: { kind: "scene", ref: "reset" } },
    ],
    prediction: {
      prompt: "What happens to the orbit if speed increases?",
      options: ["It moves to a larger orbit", "It moves to a smaller orbit"],
      correctIndex: 0,
    },
    observationPrompts: [
      { prompt: "Watch the readouts for period and distance." },
      { prompt: "Change the speed slider and observe the orbit shape." },
      { prompt: "Notice how the arrows combine into a curved path." },
    ],
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
    limits: { maxObjects: 80, maxParticles: 1500, maxTimelineEvents: 30, maxControls: 6 },
  };
}

function assertValidSpec(spec: DemoSpecV1) {
  const outcome = validateDemoSpec(JSON.stringify(spec));
  expect(outcome.status).toBe("valid");
}

// ---------------------------------------------------------------------------
// Harness — same state wiring as demonstration-page around the shell
// ---------------------------------------------------------------------------

function Harness({
  spec,
  preferredRepresentations = ["animation"],
}: {
  spec: DemoSpecV1;
  preferredRepresentations?: RepresentationMode[];
}) {
  const ordered = useMemo(
    () => orderedRepresentations(spec, false, preferredRepresentations),
    [spec, preferredRepresentations]
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
  const [oneVariableMode, setOneVariableMode] = useState(
    spec.adaptationContext?.oneVariableMode ?? false
  );
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
      reducedMotion={false}
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("closure-90 a11y matrix pins", () => {
  it("never moves keyboard focus onto a disabled control; gated controls join the tab cycle only after unlock", async () => {
    const spec = matrixSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    const disabledControls = [
      screen.getByRole("slider", { name: "Orbital speed" }),
      screen.getByRole("slider", { name: "Planet mass" }),
      screen.getByRole("button", { name: "Pause" }),
      screen.getByRole("button", { name: "Reset" }),
      screen.getByRole("button", { name: "Submit prediction" }),
    ];
    for (const c of disabledControls) expect(c).toBeDisabled();

    // Walk the full pre-gate tab cycle; focus must never land on a disabled
    // control, and the sliders/pause/reset/submit must not appear at all.
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      seen.push(el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName);
      expect(el).not.toBeDisabled();
    }
    expect(seen).not.toContain("Orbital speed");
    expect(seen).not.toContain("Planet mass");
    expect(seen).not.toContain("Pause");
    expect(seen).not.toContain("Reset");
    expect(seen).not.toContain("Submit prediction");

    // Unlock the gate through the keyboard journey.
    await submitPredictionKeyboard(user, "It moves to a larger orbit");
    await waitFor(() => expect(screen.getByRole("slider", { name: "Orbital speed" })).toBeEnabled());

    // The gate hands focus to the first experiment control (predict →
    // manipulate handoff) — exactly what the browser run observed.
    await waitFor(() =>
      expect(screen.getByRole("slider", { name: "Orbital speed" })).toHaveFocus()
    );

    // Post-gate the same controls are now real tab stops (one full cycle).
    const afterGate: string[] = [];
    for (let i = 0; i < 22; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      afterGate.push(el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName);
    }
    expect(afterGate).toContain("Orbital speed");
    expect(afterGate).toContain("Pause");
    expect(afterGate).toContain("Reset");
  });

  it("supports Home/End on the representation tablist with a roving tabindex", async () => {
    const spec = matrixSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    const first = screen.getByRole("tab", { name: "Stage" });
    const last = screen.getByRole("tab", { name: "Data table" });
    expect(first).toHaveAttribute("tabindex", "0");
    expect(last).toHaveAttribute("tabindex", "-1");

    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-selected", "true");
    expect(last).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{End}");
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(last).toHaveAttribute("tabindex", "-1");
  });

  it("toggles the one-variable switch with Space alone", async () => {
    const spec = matrixSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    render(<Harness spec={spec} />);

    const switchEl = screen.getByRole("switch", { name: "One-variable mode" });
    expect(switchEl).toHaveAttribute("aria-checked", "true");
    switchEl.focus();
    expect(switchEl).toHaveFocus();
    await user.keyboard(" ");
    expect(switchEl).toHaveAttribute("aria-checked", "false");
    await user.keyboard(" ");
    expect(switchEl).toHaveAttribute("aria-checked", "true");
  });

  it("announces the save outcome in a polite live region", async () => {
    const spec = matrixSpec();
    assertValidSpec(spec);
    const user = userEvent.setup();
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    render(<DemoSaveControl />);

    const status = screen.getByText("Not saved");
    expect(status).toHaveAttribute("aria-live", "polite");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Saved on this device")).toBeInTheDocument());
    expect(screen.getByText("Saved on this device")).toHaveAttribute("aria-live", "polite");

    // The store persisted the session (device save actually happened).
    expect(demoStore.getSession()?.savedToDevice).toBe(true);
  });
});
