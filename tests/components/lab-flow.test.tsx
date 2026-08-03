import { beforeEach, describe, expect, it } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";
import { ExperimentShell } from "@/components/lab/experiment-shell";
import { SimulationCanvas } from "@/components/lab/simulation-canvas";
import { AdaptationReplay } from "@/components/lab/adaptation-replay";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import { createDefaultParameters } from "@/domain/experiments";

const EVIDENCE_KEY = "unseenlab.evidence.v1";
const PREFERENCES_KEY = "unseenlab.preferences.v1";

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

async function submitUpdatedPrediction(
  user: ReturnType<typeof userEvent.setup>,
  radioName: string | RegExp = /grows much faster than before/i,
) {
  await user.click(screen.getByRole("button", { name: /update my prediction/i }));
  await user.click(screen.getByRole("radio", { name: radioName }));
  await user.click(
    screen.getByRole("button", { name: /submit updated prediction/i }),
  );
}

function storedEvidence() {
  return JSON.parse(window.localStorage.getItem(EVIDENCE_KEY) ?? "null");
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

  it("start over resets both the UI and the stored evidence", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/state summary:/i);
    expect(storedEvidence().trials).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /start over/i }));

    expect(
      screen.getByRole("heading", { name: /predict first/i }),
    ).toBeInTheDocument();
    expect(storedEvidence().trials).toHaveLength(0);
    expect(storedEvidence().predictions).toHaveLength(0);
  });
});

describe("truthful change evidence", () => {
  it("records first-trial changes against the real defaults", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    const evidence = storedEvidence();
    expect(evidence.trials).toHaveLength(1);
    expect(evidence.trials[0].changedVariables).toContain("absorberPosition");

    // Replay must never say defaults were used when parameters differ.
    await user.click(screen.getByRole("button", { name: /adaptation replay/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/defaults were used/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText("Absorber position")).toBeInTheDocument();
  });

  it("records an empty change list when the first trial truly used defaults", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    expect(storedEvidence().trials[0].changedVariables).toEqual([]);

    // Here the "defaults were used" claim is truthful and may appear.
    await user.click(screen.getByRole("button", { name: /adaptation replay/i }));
    expect(screen.getByText(/defaults were used/i)).toBeInTheDocument();
  });
});

describe("repeatable adaptive loop", () => {
  it("requires an updated prediction before a second trial can run", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    // Results view: no Run control until the prediction for the next trial
    // has been submitted — the updated prediction is the gate.
    expect(
      screen.queryByRole("button", { name: /run trial/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /ready for another trial/i }),
    ).toBeInTheDocument();
  });

  it("appends a second trial after an updated prediction", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    await submitUpdatedPrediction(user);

    // The experiment step returns, explicitly labeled as another trial.
    expect(
      screen.getByRole("heading", { name: /trial 2 — run another trial/i }),
    ).toBeInTheDocument();

    const density = screen.getByLabelText(/material density/i);
    fireEvent.change(density, { target: { value: "0.4" } });
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    const evidence = storedEvidence();
    expect(evidence.trials).toHaveLength(2);
    // The second trial's change list is computed against the FIRST trial.
    expect(evidence.trials[1].changedVariables).toEqual(["materialDensity"]);
    expect(evidence.predictions).toHaveLength(2);
    expect(evidence.predictions[1].trialId).toBe(evidence.trials[1].id);
  });

  it("supports three consecutive trials without state corruption", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    await submitUpdatedPrediction(user);
    const density = screen.getByLabelText(/material density/i);
    fireEvent.change(density, { target: { value: "0.4" } });
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    await submitUpdatedPrediction(user, /it stays about the same/i);
    const neutrons = screen.getByLabelText(/starting neutrons/i);
    fireEvent.change(neutrons, { target: { value: "5" } });
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    const evidence = storedEvidence();
    expect(evidence.trials).toHaveLength(3);
    expect(evidence.predictions).toHaveLength(3);
    expect(evidence.trials[2].changedVariables).toEqual(["startingNeutrons"]);

    // Replay shows every trial in order.
    await user.click(screen.getByRole("button", { name: /adaptation replay/i }));
    expect(screen.getByText(/trial 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByText(/trial 2 of 3/i)).toBeInTheDocument();
    expect(screen.getByText(/trial 3 of 3/i)).toBeInTheDocument();
  });

  it("applies an accepted adaptation to the persisted preferences", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/suggested adaptation/i);

    for (const button of screen.getAllByRole("button", { name: "Accept" })) {
      await user.click(button);
    }

    // The ceiling run offers reduce_density; accepting it must persist.
    const preferences = JSON.parse(
      window.localStorage.getItem(PREFERENCES_KEY) ?? "null",
    );
    expect(preferences.informationDensity).toBe("low");
  });

  it("does not reoffer a rejected adaptation on the next trial", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/suggested adaptation/i);

    for (const button of screen.getAllByRole("button", { name: "Reject" })) {
      await user.click(button);
    }

    await submitUpdatedPrediction(user);
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    const evidence = storedEvidence();
    const trialTwoProposals = evidence.adaptationProposals.filter(
      (proposal: { evidenceIds: string[] }) =>
        proposal.evidenceIds.includes(evidence.trials[1].id),
    );
    expect(trialTwoProposals.length).toBeGreaterThan(0);
    expect(
      trialTwoProposals.some(
        (proposal: { type: string }) => proposal.type === "show_graph",
      ),
    ).toBe(false);
  });

  it("restores the results stage after a reload with persisted evidence", async () => {
    const user = userEvent.setup();
    const first = render(
      <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />,
    );
    await submitPrediction(user);
    await withdrawAbsorber();
    await runTrial(user);
    await screen.findByText(/state summary:/i);
    first.unmount();

    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    // No empty initial state while retained evidence says trials exist. The
    // restore happens after hydration, so wait for it.
    expect(
      await screen.findByRole("heading", { name: /watch what happened/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /predict first/i }),
    ).not.toBeInTheDocument();
    expect(storedEvidence().trials).toHaveLength(1);
    expect(storedEvidence().predictions).toHaveLength(1);
  });

  it("restores a pending updated prediction after a reload", async () => {
    const user = userEvent.setup();
    const first = render(
      <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />,
    );
    await submitPrediction(user);
    await runTrial(user);
    await screen.findByText(/state summary:/i);
    await submitUpdatedPrediction(user);
    first.unmount();

    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    // The second-trial experiment step is restored with the pending answer.
    expect(
      await screen.findByRole("heading", {
        name: /trial 2 — run another trial/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/it grows much faster than before/i)).toBeInTheDocument();
    // And running it still appends exactly one trial.
    await runTrial(user);
    await screen.findByText(/state summary:/i);
    expect(storedEvidence().trials).toHaveLength(2);
  });

  it("records exactly one trial per run", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await withdrawAbsorber();

    const runButton = screen.getByRole("button", { name: /run trial/i });
    await user.click(runButton);
    await screen.findByText(/state summary:/i);

    // The run button is disabled while processing (see run-guard.test.tsx for
    // the deferred-provider proof), so one click yields exactly one trial.
    expect(storedEvidence().trials).toHaveLength(1);
    expect(storedEvidence().predictions).toHaveLength(1);
  });

  it("fails safely when persisted evidence is corrupt", async () => {
    window.localStorage.setItem(EVIDENCE_KEY, "{definitely not json");
    const first = render(
      <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />,
    );
    expect(
      screen.getByRole("heading", { name: /predict first/i }),
    ).toBeInTheDocument();
    first.unmount();

    window.localStorage.setItem(
      EVIDENCE_KEY,
      JSON.stringify({ trials: [{ not: "a real trial" }] }),
    );
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    expect(
      screen.getByRole("heading", { name: /predict first/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run trial/i })).not.toBeInTheDocument();
  });
});

describe("text scaling", () => {
  it("scales rem-based text through the root element", async () => {
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    expect(document.documentElement.style.fontSize).toBe("100%");

    await user.click(
      screen.getByRole("button", { name: /accessibility & display/i }),
    );
    const slider = screen.getByLabelText("Text size");
    fireEvent.change(slider, { target: { value: "1.5" } });

    expect(document.documentElement.style.fontSize).toBe("150%");
    const heading = screen.getByRole("heading", { name: /what do you expect/i });
    // 1.5rem at a 150% root must measure larger than 1.5rem at 100%.
    expect(parseFloat(getComputedStyle(heading).fontSize)).toBeGreaterThan(24);
  });

  it("removes the root font-size override on unmount", () => {
    const { unmount } = render(
      <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />,
    );
    unmount();
    expect(document.documentElement.style.fontSize).toBe("");
  });
});

describe("replay dialog keyboard behavior", () => {
  async function openReplay(user: ReturnType<typeof userEvent.setup>) {
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);
    await submitPrediction(user);
    await runTrial(user);
    await screen.findByText(/state summary:/i);
    const opener = screen.getByRole("button", { name: /adaptation replay/i });
    await user.click(opener);
    return opener;
  }

  it("moves focus into the dialog and restores it on close", async () => {
    const user = userEvent.setup();
    const opener = await openReplay(user);

    expect(
      screen.getByRole("button", { name: /close replay/i }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("traps Tab and Shift+Tab inside the dialog", async () => {
    const user = userEvent.setup();
    await openReplay(user);

    const closeButton = screen.getByRole("button", { name: /close replay/i });
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
  });

  it("makes background content inert while the dialog is open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />,
    );
    await submitPrediction(user);
    await runTrial(user);
    await screen.findByText(/state summary:/i);

    const shellRoot = container.firstElementChild;
    expect(shellRoot).not.toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: /adaptation replay/i }));
    expect(shellRoot).toHaveAttribute("inert");

    await user.keyboard("{Escape}");
    expect(shellRoot).not.toHaveAttribute("inert");
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

  it("announces only meaningful transitions, never every frame", async () => {
    const user = userEvent.setup();
    renderCanvas(false);

    // Manual stepping updates the visual counter without announcements.
    await user.click(screen.getByRole("button", { name: "Step forward" }));
    await user.click(screen.getByRole("button", { name: "Step forward" }));
    await user.click(screen.getByRole("button", { name: "Step forward" }));
    expect(
      screen.queryByText(/animation (started|paused|reached the end)/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play animation" }));
    expect(screen.getByText("Animation started")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause animation" }));
    expect(screen.getByText("Animation paused")).toBeInTheDocument();
    // Both the outcome notice and the transition message are live regions.
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
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
      counterfactuals: [],
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
          counterfactuals: [],
        }}
        lastTrial={null}
        counterfactualResult={null}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/no replay history yet/i)).toBeInTheDocument();
  });
});
