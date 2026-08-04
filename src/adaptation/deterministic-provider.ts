import type { AdaptationInput, AdaptationProvider } from "@/domain/adaptation";
import type {
  AdaptationProposal,
  AdaptationProposalType,
  RepresentationEvent,
} from "@/domain/evidence";
import { MAX_POPULATION, type TrialRecord } from "@/domain/experiments";
import type { RepresentationMode } from "@/domain/learner";
import {
  classifyConceptEvidence,
  finalFreeNeutronsOf,
  findPredictionFor,
  parametersEqual,
} from "./misconception-taxonomy";

// Web Crypto is available in browsers and in Node >= 19 (tests run on Node 22).
const randomUUID = (): string => globalThis.crypto.randomUUID();

/** Hard cap on proposals produced by a single propose() call. */
const MAX_PROPOSALS = 3;

/**
 * Offline, deterministic adaptation provider. It applies bounded rules in a
 * fixed order and proposes changes to how the experiment is represented,
 * paced, or structured — never to scientific truth.
 *
 * Determinism: for the same input the same rules fire in the same order.
 * Proposal IDs come from a UUID and may vary between calls; rule selection
 * does not. Language is plain and non-judgmental: the provider speaks about
 * what the learner did and what could help, never about who the learner is.
 */
export class DeterministicAdaptationProvider implements AdaptationProvider {
  async propose(input: AdaptationInput): Promise<AdaptationProposal[]> {
    const proposals: AdaptationProposal[] = [];
    const { preferences, trials, sessionEvidence } = input;

    // Documented general rule: a proposal type that the learner previously
    // rejected is never proposed again in this session.
    const rejectedTypes = new Set<AdaptationProposalType>(
      sessionEvidence.adaptationProposals
        .filter((proposal) => proposal.decision === "rejected")
        .map((proposal) => proposal.type),
    );
    const hasAcceptedProposal = sessionEvidence.adaptationProposals.some(
      (proposal) => proposal.decision === "accepted",
    );

    const latest = trials.length > 0 ? trials[trials.length - 1] : null;

    const linearNonlinear = classifyConceptEvidence(input).find(
      (concept) => concept.conceptId === "LINEAR_VS_NONLINEAR_GROWTH",
    );

    const push = (
      type: AdaptationProposalType,
      reason: string,
      evidenceIds: string[],
      proposedChanges: Record<string, unknown>,
    ): void => {
      if (proposals.length >= MAX_PROPOSALS) return;
      if (rejectedTypes.has(type)) return;
      proposals.push({
        id: randomUUID(),
        type,
        reason,
        evidenceIds,
        proposedChanges,
        decision: "pending",
        createdAt: new Date().toISOString(),
        decidedAt: null,
        source: "rules",
        followUpQuestion: null,
      });
    };

    // 1. ask_prediction_again
    if (latest && !input.predictions.some((p) => p.trialId === latest.id)) {
      push(
        "ask_prediction_again",
        "Before we compare, it helps to have your prediction on record. " +
          "Would you like to add one for this trial?",
        [latest.id],
        {},
      );
    }

    // 2. freeze_variables
    if (
      latest &&
      latest.changedVariables.length >= 2 &&
      !preferences.oneVariableMode
    ) {
      push(
        "freeze_variables",
        "This run changed several things at once, which makes it hard to see " +
          "which one caused the result. We could freeze everything except one " +
          "variable.",
        [latest.id],
        { oneVariableMode: true },
      );
    }

    // 3. show_graph
    const latestPrediction =
      latest !== null ? findPredictionFor(latest.id, input.predictions) : null;
    if (
      latest &&
      latestPrediction &&
      linearNonlinear?.status === "contradicted" &&
      !hasRepresentationAfter(sessionEvidence.representationEvents, "graph", latest.startedAt)
    ) {
      push(
        "show_graph",
        "The prediction and the result differed. Seeing the population on a " +
          "graph can show how it actually grew.",
        [latestPrediction.id, latest.id],
        {
          preferredRepresentations: withMode(
            preferences.preferredRepresentations,
            "graph",
          ),
        },
      );
    }

    // 4. compare_trials
    if (latest && latestPrediction && linearNonlinear?.status === "contradicted") {
      push(
        "compare_trials",
        "A side-by-side comparison of two runs that differ in only one " +
          "variable can show what actually caused the difference.",
        [latestPrediction.id, latest.id],
        {},
      );
    }

    // 5. slow_animation
    if (
      latest &&
      trials.length >= 2 &&
      !preferences.reducedMotion &&
      trials.filter((trial) => parametersEqual(trial.parameters, latest.parameters))
        .length >= 2
    ) {
      // Documented: learners with reduced motion enabled never receive
      // motion-related suggestions.
      push(
        "slow_animation",
        "The same run was repeated. A slower speed can make the pattern " +
          "easier to follow.",
        trials
          .filter((trial) =>
            parametersEqual(trial.parameters, latest.parameters),
          )
          .map((trial) => trial.id),
        { animationSpeed: 0.5 },
      );
    }

    // 6. show_causal_view
    if (latest && trials.length >= 2) {
      const differingEarlier = findEarlierAbsorberTrial(trials, latest);
      const causalOpened = sessionEvidence.representationEvents.some(
        (event) => event.mode === "causal",
      );
      if (differingEarlier && !causalOpened) {
        push(
          "show_causal_view",
          "A causal view shows which knob controls what. It may help to trace " +
            "the absorber's effect step by step.",
          [differingEarlier.id, latest.id],
          {
            preferredRepresentations: withMode(
              preferences.preferredRepresentations,
              "causal",
            ),
          },
        );
      }
    }

    // 7. reduce_density
    if (
      latest &&
      finalFreeNeutronsOf(latest) === MAX_POPULATION &&
      !hasAcceptedProposal
    ) {
      push(
        "reduce_density",
        "The reaction hit the safety ceiling, so the details were hidden. " +
          "Lowering the material density would let us see more of the curve.",
        [latest.id],
        { informationDensity: "low" },
      );
    }

    return proposals;
  }
}

/** Whether a representation of the given mode was opened at/after a time. */
function hasRepresentationAfter(
  events: RepresentationEvent[],
  mode: RepresentationMode,
  after: string,
): boolean {
  return events.some(
    (event) => event.mode === mode && event.openedAt > after,
  );
}

/** Appends a representation mode, preserving order and removing duplicates. */
function withMode(
  modes: RepresentationMode[],
  mode: RepresentationMode,
): RepresentationMode[] {
  return [...new Set([...modes, mode])];
}

/** Most recent trial before the latest one that used a different absorber. */
function findEarlierAbsorberTrial(
  trials: TrialRecord[],
  latest: TrialRecord,
): TrialRecord | null {
  for (let i = trials.length - 2; i >= 0; i--) {
    if (
      trials[i].parameters.absorberPosition !==
      latest.parameters.absorberPosition
    ) {
      return trials[i];
    }
  }
  return null;
}
