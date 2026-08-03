import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";
import { ExperimentShell } from "@/components/lab/experiment-shell";
import { SimulationCanvas } from "@/components/lab/simulation-canvas";
import { AdaptationReplay } from "@/components/lab/adaptation-replay";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import { createDefaultParameters } from "@/domain/experiments";

beforeEach(() => {
  window.localStorage.clear();
});

async function submitPrediction(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("radio", { name: /gets slightly faster/i }),
  );
  await user.click(screen.getByRole("button", { name: "Submit prediction" }));
}

async function withdrawAbsorber() {
  const absorber = screen.getByLabelText(/absorber position/i);
  fireEvent.change(absorber, { target: { value: "0" } });
}

async function runTrial(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /run trial/i }));
}

describe("ExperimentShell main learner flow", () => {
  it("requires a prediction before a trial can run", async () => {
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    // Guided flow: the Run trial control only exists once a prediction has
    // been submitted, so the gate is structural rather than a notice.
    expect(
      screen.queryByRole("button", { name: /run trial/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /predict first/i }),
    ).toBeInTheDocument();
  });

  it("runs a trial, records the outcome, and offers an adaptation", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);

    expect(await screen.findByText(/state summary:/i)).toBeInTheDocument();

    // Withdrawing the absorber makes the run hit the safety ceiling, which
    // (with a "slightly faster" prediction) triggers adaptation proposals.
    expect(await screen.findByText(/suggested adaptation/i)).toBeInTheDocument();
  });

  it("accepts all offered adaptations and applies their preference changes", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);

    await screen.findByText(/suggested adaptation/i);
    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    expect(acceptButtons.length).toBeGreaterThan(0);
    for (const button of acceptButtons) {
      await user.click(button);
    }

    // All proposals resolved: the whole suggestion section disappears.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Accept" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/try one helpful change/i)).not.toBeInTheDocument();
  });

  it("rejects all offered adaptations and keeps control", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);

    await screen.findByText(/suggested adaptation/i);
    const rejectButtons = screen.getAllByRole("button", { name: "Reject" });
    expect(rejectButtons.length).toBeGreaterThan(0);
    for (const button of rejectButtons) {
      await user.click(button);
    }

    // All proposals resolved: the whole suggestion section disappears.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Reject" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/try one helpful change/i)).not.toBeInTheDocument();
  });

  it("shows the safety-ceiling notice for an explosive run", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);

    expect(
      await screen.findByText(/the simulation stopped at the safety ceiling/i),
    ).toBeInTheDocument();
  });

  it("clears the session and returns to the predict step", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    await user.click(screen.getByRole("button", { name: /research mode/i }));
    await user.click(screen.getByRole("button", { name: /clear local session/i }));
    await user.click(screen.getByRole("button", { name: /really clear/i }));

    // Guided flow: clearing the session returns to the first step, so the
    // trial control is gated again until a new prediction is submitted.
    expect(
      screen.getByRole("heading", { name: /predict first/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run trial/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SimulationCanvas", () => {
  function renderCanvas(reducedMotion: boolean) {
    const trial = runSimulation({
      ...createDefaultParameters(),
      durationSteps: 10,
      seed: 42,
    }).trial;
    return render(
      <SimulationCanvas
        trial={trial}
        stopReason="completed"
        preferences={{
          animationSpeed: 1,
          reducedMotion,
          informationDensity: "medium",
          preferredRepresentations: ["animation"],
          feedbackTiming: "after_trial",
          oneVariableMode: false,
          highContrast: false,
          textScale: 1,
        }}
      />,
    );
  }

  it("renders a static reduced-motion view when the preference is on", () => {
    const { container } = renderCanvas(true);
    const section = container.querySelector("[data-reduced-motion]");
    expect(section).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByText(/state summary:/i)).toBeInTheDocument();
  });

  it("advances the displayed step with the step control", async () => {
    const user = userEvent.setup();
    const { container } = renderCanvas(false);
    const section = container.querySelector("[data-step]");
    expect(section).toHaveAttribute("data-step", "0");
    await user.click(screen.getByRole("button", { name: "Step forward" }));
    expect(section).toHaveAttribute("data-step", "1");
  });
});

describe("AdaptationReplay", () => {
  it("renders recorded evidence: prediction, friction, and decision", () => {
    const trial = runSimulation({ ...createDefaultParameters(), seed: 7 }).trial;
    const now = new Date().toISOString();
    const evidence = {
      predictions: [
        {
          id: "p1",
          trialId: trial.id,
          prompt: "Find out what happens to the reaction when you withdraw the absorber.",
          answer: "It gets slightly faster",
          structuredAnswer: "slightly_faster",
          confidence: 3,
          createdAt: now,
        },
      ],
      trials: [trial],
      representationEvents: [],
      adaptationProposals: [
        {
          id: "a1",
          type: "compare_trials" as const,
          reason:
            "A side-by-side comparison of two runs that differ in only one variable can show what actually caused the difference.",
          evidenceIds: ["p1", trial.id],
          proposedChanges: {},
          decision: "pending" as const,
          createdAt: now,
          decidedAt: null,
          source: "rules" as const,
          followUpQuestion: null,
        },
      ],
      conceptEvidence: [
        {
          conceptId: "LINEAR_VS_NONLINEAR_GROWTH",
          status: "contradicted" as const,
          evidenceIds: ["p1", trial.id],
        },
      ],
    };

    render(
      <AdaptationReplay
        evidence={evidence}
        lastTrial={trial}
        counterfactualResult={null}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText(/initial prediction/i)).toBeInTheDocument();
    expect(screen.getByText(/it gets slightly faster/i)).toBeInTheDocument();
    expect(screen.getByText(/possible conceptual friction/i)).toBeInTheDocument();
    expect(screen.getByText(/linear vs\. nonlinear growth/i)).toBeInTheDocument();
    expect(screen.getByText(/your decision:/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("shows the empty state without any trials", () => {
    render(
      <AdaptationReplay
        evidence={{
          predictions: [],
          trials: [],
          representationEvents: [],
          adaptationProposals: [],
          conceptEvidence: [],
        }}
        lastTrial={null}
        counterfactualResult={null}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/no replay history yet/i)).toBeInTheDocument();
  });
});
