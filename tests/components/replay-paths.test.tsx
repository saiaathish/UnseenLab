import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createDefaultParameters } from "@/domain/experiments";
import type { SessionEvidence } from "@/domain/evidence";
import { AdaptationReplay } from "@/components/lab/adaptation-replay";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";

/**
 * Adversarial check: the replay must reflect the ACTUAL recorded path, not a
 * fixed nine-step narrative. Two learner paths with the same nine steps are
 * rendered from hand-crafted evidence and must disagree where the evidence
 * disagrees.
 */

describe("AdaptationReplay evidence-driven paths", () => {
  it("Path A (correct prediction, equation view, rejected every offer) is replayed truthfully", () => {
    // Capped run: the reaction hits the population ceiling, so predicting
    // "much faster than before" is correct — no conceptual friction.
    const trial = {
      ...runSimulation({ ...createDefaultParameters(), seed: 7, absorberPosition: 0.2 })
        .trial,
      changedVariables: [],
    };
    const prediction = {
      id: "pA",
      trialId: trial.id,
      prompt: "Find out what happens to the reaction when you withdraw the absorber.",
      answer: "It grows much faster than before",
      structuredAnswer: "much_faster_nonlinear",
      confidence: 4,
      createdAt: "2026-01-01T00:00:30.000Z",
    };
    const evidence: SessionEvidence = {
      predictions: [prediction],
      trials: [trial],
      // The learner inspected the EQUATION view, never the graph.
      representationEvents: [
        { mode: "equation", openedAt: "2026-01-01T00:01:00.000Z" },
      ],
      // Every adaptation offer was explicitly rejected.
      adaptationProposals: [
        {
          id: "a1",
          type: "show_graph",
          reason:
            "Seeing the population on a graph can show how it actually grew.",
          evidenceIds: [prediction.id, trial.id],
          proposedChanges: { preferredRepresentations: ["animation", "graph"] },
          decision: "rejected",
          createdAt: "2026-01-01T00:02:00.000Z",
          decidedAt: "2026-01-01T00:02:30.000Z",
          source: "rules",
          followUpQuestion: null,
        },
        {
          id: "a2",
          type: "reduce_density",
          reason:
            "The reaction hit the safety ceiling, so the details were hidden.",
          evidenceIds: [prediction.id, trial.id],
          proposedChanges: { informationDensity: "low" },
          decision: "rejected",
          createdAt: "2026-01-01T00:02:00.000Z",
          decidedAt: "2026-01-01T00:02:35.000Z",
          source: "rules",
          followUpQuestion: null,
        },
      ],
      conceptEvidence: [
        {
          conceptId: "LINEAR_VS_NONLINEAR_GROWTH",
          status: "supported",
          evidenceIds: [prediction.id, trial.id],
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

    // Offers exist and every one of them shows the rejected decision.
    expect(
      screen.queryByText(/no adaptations were offered/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/your decision:/i)).toHaveLength(2);
    expect(screen.getAllByText(/rejected/i)).toHaveLength(2);

    // Single first trial with zero changed variables and the equation view:
    // the pattern flags "did not inspect the graph", never "replayed the
    // animation" or "changed multiple variables".
    expect(
      screen.queryByText(/replayed the animation several times/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/changed multiple variables at once/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/did not inspect the graph/i)).toBeInTheDocument();

    // A correct prediction means no friction is flagged for the concept.
    expect(
      screen.getByText(/linear vs\. nonlinear growth/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/evidence suggests: supported/i)).toBeInTheDocument();

    // No counterfactual was computed for this sequence.
    expect(
      screen.getByText(/no counterfactual comparison in this sequence/i),
    ).toBeInTheDocument();
  });

  it("Path B (correct prediction, graph inspected, no offers at all) is replayed truthfully", () => {
    // Moderate run: completes well below the ceiling with steady growth, so a
    // "slightly faster" prediction lines up with the outcome.
    const trial = {
      ...runSimulation({
        ...createDefaultParameters(),
        seed: 42,
        absorberPosition: 0.2,
        durationSteps: 10,
      }).trial,
      changedVariables: [],
    };
    const prediction = {
      id: "pB",
      trialId: trial.id,
      prompt: "Find out what happens to the reaction when you withdraw the absorber.",
      answer: "It gets slightly faster",
      structuredAnswer: "slightly_faster",
      confidence: 4,
      createdAt: "2026-01-01T00:00:30.000Z",
    };
    const evidence: SessionEvidence = {
      predictions: [prediction],
      trials: [trial],
      // The learner inspected the graph, so no "did not inspect the graph"
      // flag fires and the default pattern applies.
      representationEvents: [
        { mode: "graph", openedAt: "2026-01-01T00:01:00.000Z" },
      ],
      adaptationProposals: [],
      conceptEvidence: [],
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

    // No offers were ever made on this path.
    expect(
      screen.getByText(/no adaptations were offered/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/your decision:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rejected/i)).not.toBeInTheDocument();

    // One trial, nothing changed, graph inspected: default pattern.
    expect(screen.getByText(/ran a single controlled trial/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/did not inspect the graph/i),
    ).not.toBeInTheDocument();

    // Empty concept evidence shows the "Nothing flagged" line.
    expect(
      screen.getByText(/nothing flagged/i),
    ).toBeInTheDocument();

    // No counterfactual was computed for this sequence either.
    expect(
      screen.getByText(/no counterfactual comparison in this sequence/i),
    ).toBeInTheDocument();
  });
});
