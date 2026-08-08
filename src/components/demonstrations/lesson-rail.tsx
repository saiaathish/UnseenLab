"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { TRUST_LABELS } from "@/demonstrations/spec/demo-spec";
import {
  predictionTruth,
  type TrialRecord,
} from "@/demonstrations/state/demo-store";
// Imported from the pure scene-graph module (not the renderer barrel) so the
// rail keeps working in environments where the Three.js barrel is mocked
// (jsdom a11y suites): these helpers are side-effect free.
import {
  buildSceneGraph,
  cascadeOrder,
  GRAPH_NODE_KINDS,
  isGraphLikeScene,
} from "@/demonstrations/renderers/primitive-3d/scene-graph";
import type {
  SceneGraph,
  SceneGraphRelationship,
} from "@/demonstrations/renderers/primitive-3d";
import { engineMappingForSpec } from "@/demonstrations/showcases/coupling";
import {
  controlReferenceContextForSpec,
  filterUnavailableControlPrompts,
} from "@/demonstrations/validation/control-references";
import { cn } from "@/lib/utils";

import type { AdaptationSuggestion } from "./adaptation-panel";

// ---------------------------------------------------------------------------
// The lesson rail state machine: predict → interact → observe → explain →
// complete. One step visible at a time; Continue is gated on the current
// step's completion condition; Back is always available; completed steps
// persist for the session (going backward never relocks them). The rail holds
// its own step state; the page owns the session lifecycle (store, trials,
// replay, parameter state).
// ---------------------------------------------------------------------------

export type LessonStepId =
  | "predict"
  | "interact"
  | "observe"
  | "explain"
  | "complete";

export const LESSON_STEPS: readonly LessonStepId[] = [
  "predict",
  "interact",
  "observe",
  "explain",
  "complete",
];

const STEP_TITLES: Record<LessonStepId, string> = {
  predict: "Predict",
  interact: "Interact",
  observe: "Observe",
  explain: "Explain",
  complete: "Complete",
};

// ---------------------------------------------------------------------------
// Lesson plan derivation (pure): every instruction and option references a
// REAL model object or control from the spec (the same ids the renderers
// own), never invented claims.
// ---------------------------------------------------------------------------

export type LessonMode = "graph" | "engine" | "timeline";

export interface ObserveOption {
  id: string;
  label: string;
}

export interface LessonPlan {
  mode: LessonMode;
  interactInstruction: string;
  /** graph mode: the canonical node id the interact step references. */
  nodeId?: string;
  nodeLabel?: string;
  /** engine mode: the control id the interact step references. */
  controlId?: string;
  controlLabel?: string;
  observeQuestion: string;
  observeOptions: ObserveOption[];
  explainQuestion: string;
  /** graph mode: selectable explanations; engine/timeline: free text. */
  explainOptions: string[] | null;
}

const RELATIONSHIP_VERBS: Record<string, string> = {
  causes: "causes",
  activates: "activates",
  inhibits: "inhibits",
  flows_to: "flows into",
  transfers_to: "transfers to",
  attracts: "attracts",
  repels: "repels",
  orbits: "orbits",
  collides_with: "collides with",
  oscillates_with: "oscillates with",
  contains: "contains",
  transforms_into: "transforms into",
};

const CONTROL_INSTRUCTIONS: Record<string, (label: string) => string> = {
  slider: (label) => `Move the ${label} slider.`,
  toggle: (label) => `Flip the ${label} toggle.`,
  segmented_control: (label) => `Change the ${label} setting.`,
  button: (label) => `Press the ${label} button.`,
  reset: (label) => `Press the ${label} button.`,
  play_pause: (label) => `Press ${label}.`,
  speed_control: (label) => `Change the ${label}.`,
};

function labelOf(graph: SceneGraph, nodeId: string): string {
  const node = graph.nodes.find((n) => n.id === nodeId);
  return node?.label ?? `node ${nodeId}`;
}

function firstGraphRelationship(
  graph: SceneGraph
): SceneGraphRelationship | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const rel of graph.relationships) {
    const from = byId.get(rel.from);
    const to = byId.get(rel.to);
    if (
      from &&
      to &&
      GRAPH_NODE_KINDS.has(from.kind) &&
      GRAPH_NODE_KINDS.has(to.kind)
    ) {
      return rel;
    }
  }
  return null;
}

function pathBetween(
  relationships: SceneGraphRelationship[],
  startId: string,
  endId: string
): string[] | null {
  const parent = new Map<string, string>();
  const seen = new Set<string>([startId]);
  const queue: string[] = [startId];
  for (let qi = 0; qi < queue.length; qi++) {
    const current = queue[qi];
    if (current === endId) break;
    for (const rel of relationships) {
      if (rel.from !== current || seen.has(rel.to)) continue;
      seen.add(rel.to);
      parent.set(rel.to, current);
      queue.push(rel.to);
    }
  }
  if (!seen.has(endId)) return null;
  const path = [endId];
  let current = endId;
  while (current !== startId) {
    current = parent.get(current)!;
    path.unshift(current);
  }
  return path;
}

function describeChain(
  graph: SceneGraph,
  relationships: SceneGraphRelationship[],
  path: string[]
): string {
  const segments: string[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const rel = relationships.find(
      (r) => r.from === path[i] && r.to === path[i + 1]
    );
    const fromLabel = labelOf(graph, path[i]);
    const toLabel = labelOf(graph, path[i + 1]);
    const verb = rel ? (RELATIONSHIP_VERBS[rel.type] ?? "affects") : "affects";
    segments.push(`${fromLabel} ${verb} ${toLabel}`);
  }
  return segments.join(", ");
}

/**
 * Render-side defense for the lesson-action contract: observation prompts
 * that instruct the learner to manipulate a control are run through the same
 * filter the validation boundary uses, so the rail only ever offers actions
 * the learner can actually perform. When every prompt is dropped (nothing
 * actionable remains), a single valid observation option derived from what
 * the learner CAN do keeps the observe step completable.
 */
function filteredObserveOptions(
  spec: DemoSpecV1,
  fallback: string
): ObserveOption[] {
  const filtered = filterUnavailableControlPrompts(
    spec.observationPrompts,
    spec.controls,
    controlReferenceContextForSpec(spec)
  );
  if (filtered.length > 0) {
    return filtered.map((p) => ({ id: p.prompt, label: p.prompt }));
  }
  return [{ id: fallback, label: fallback }];
}

/**
 * Resolve the lesson plan against the spec's canonical graph and controls.
 * Graph-like scenes (conceptual templates) drive a node interaction; engine
 * specs drive a real control; timeline-only specs get a watch-and-confirm
 * step. The referenced ids are the same ids the stage and diagram own.
 */
export function deriveLessonPlan(spec: DemoSpecV1): LessonPlan {
  const graph = spec.scene3d ? buildSceneGraph(spec).graph : null;
  // Hybrid showcase scenes (orbits/charges/waves) never fire node callbacks
  // (A1 renderer rule: graph mode requires NO engine mapping). Their
  // relationships are motion couplings, not graph edges, so the rail drives
  // them through real controls instead.
  const isHybridShowcase = engineMappingForSpec(spec) !== null;

  if (graph && !isHybridShowcase && isGraphLikeScene(graph)) {
    const rel = firstGraphRelationship(graph);
    if (rel) {
      const startId = rel.from;
      const startLabel = labelOf(graph, startId);
      const downstream = cascadeOrder(graph.relationships, startId).filter(
        (id) => id !== startId
      );
      if (downstream.length > 0) {
        const endId = downstream[downstream.length - 1];
        const endLabel = labelOf(graph, endId);
        const hasDirectEdge = graph.relationships.some(
          (r) => r.from === startId && r.to === endId
        );
        const path =
          pathBetween(graph.relationships, startId, endId) ??
          [startId, ...downstream];
        const hops = path.length - 1;

        const options: string[] = [];
        if (hops >= 2) {
          options.push(
            `The effect travels the chain: ${describeChain(
              graph,
              graph.relationships,
              path
            )}.`
          );
        } else {
          const direct = graph.relationships.find(
            (r) => r.from === startId && r.to === endId
          );
          const verb = direct
            ? (RELATIONSHIP_VERBS[direct.type] ?? "affects")
            : "affects";
          options.push(
            `${endLabel} changed because ${startLabel} ${verb} ${endLabel} directly.`
          );
        }
        options.push(
          hasDirectEdge
            ? `${endLabel} changed on its own, with no connection to ${startLabel}.`
            : `${endLabel} changed because it is directly connected to ${startLabel}.`
        );

        return {
          mode: "graph",
          interactInstruction: `Click ${startLabel} and watch what happens downstream.`,
          nodeId: startId,
          nodeLabel: startLabel,
          observeQuestion: "Which effects changed?",
          observeOptions: downstream.map((id) => ({
            id,
            label: labelOf(graph, id),
          })),
          explainQuestion: hasDirectEdge
            ? `Why did ${endLabel} change when you interacted with ${startLabel}?`
            : `Why did ${endLabel} change even though ${startLabel} is not directly connected to it?`,
          explainOptions: options,
        };
      }
    }
  }

  const control =
    spec.controls.find(
      (c) => c.target.kind === "parameter" && c.type !== "drag_handle"
    ) ?? spec.controls.find((c) => c.type !== "drag_handle");

  if (control) {
    const instruction =
      CONTROL_INSTRUCTIONS[control.type]?.(control.label) ??
      `Use the ${control.label} control.`;
    return {
      mode: "engine",
      interactInstruction: instruction,
      controlId: control.id,
      controlLabel: control.label,
      observeQuestion: "What did you observe?",
      observeOptions: filteredObserveOptions(
        spec,
        `Watch how the readout changes when you use the ${control.label} control.`
      ),
      explainQuestion: spec.simulation
        ? "Why did the result change? Compare the readouts before and after your change."
        : "Explain the behavior you observed in your own words.",
      explainOptions: null,
    };
  }

  return {
    mode: "timeline",
    interactInstruction: "Watch the animation play through.",
    observeQuestion: "What did you observe?",
    observeOptions: filteredObserveOptions(
      spec,
      "Describe what you saw happen, in order."
    ),
    explainQuestion:
      "Why do the stages happen in this order? Explain in your own words.",
    explainOptions: null,
  };
}

// ---------------------------------------------------------------------------
// Rail props: the page owns all model state; the rail owns step state.
// ---------------------------------------------------------------------------

export interface LessonRailProps {
  spec: DemoSpecV1;

  // predict step
  predictionSubmitted: boolean;
  predictionIndex: number | null;
  /** True after the learner changed at least one control. */
  manipulated: boolean;
  revealed: boolean;
  onPredictionSubmit: (index: number) => void;
  onReveal: () => void;

  // interact step (canonical interaction surface, graph scenes only)
  manipulatedNodeIds: string[];
  touchedControls: string[];

  // observe step (page-owned so selections survive back-navigation)
  observationSelections: Record<string, boolean>;
  observationNotes: string;
  observationsSaved: boolean;
  onObservationToggle: (prompt: string, checked: boolean) => void;
  onObservationNotesChange: (value: string) => void;
  onSaveObservations: () => void;

  // adaptations (demoted into the complete step; recording unchanged)
  adaptationSuggestions: AdaptationSuggestion[];
  onAdaptationDecision: (
    suggestion: AdaptationSuggestion,
    accepted: boolean
  ) => void;

  // complete step: replay restores the latest trial's parameters
  trials: TrialRecord[];
  onReplayTrial: (trial: TrialRecord) => void;
}

export function LessonRail(props: LessonRailProps) {
  const plan = useMemo(() => deriveLessonPlan(props.spec), [props.spec]);

  const [currentStep, setCurrentStep] = useState<LessonStepId>("predict");
  const [completedSteps, setCompletedSteps] = useState<
    Partial<Record<LessonStepId, boolean>>
  >({});
  const [sawIt, setSawIt] = useState(false);
  const [explainSelection, setExplainSelection] = useState<string | null>(null);
  const [explainText, setExplainText] = useState("");
  const [announcement, setAnnouncement] = useState("");

  // -- completion conditions -------------------------------------------------

  const stepConditionMet = (step: LessonStepId): boolean => {
    switch (step) {
      case "predict":
        return props.predictionSubmitted;
      case "interact":
        if (plan.mode === "graph") {
          return (
            plan.nodeId !== undefined &&
            props.manipulatedNodeIds.includes(plan.nodeId)
          );
        }
        if (plan.mode === "engine") {
          return (
            plan.controlId !== undefined &&
            props.touchedControls.includes(plan.controlId)
          );
        }
        return sawIt;
      case "observe":
        return (
          Object.values(props.observationSelections).some(Boolean) ||
          (plan.observeOptions.length === 0 &&
            props.observationNotes.trim().length > 0)
        );
      case "explain":
        return plan.explainOptions
          ? explainSelection !== null
          : explainText.trim().length > 0;
      case "complete":
        return true;
    }
  };

  const canContinue = (step: LessonStepId): boolean =>
    completedSteps[step] === true || stepConditionMet(step);

  // Focus + polite announcement on step change (skipped on first render so a
  // page load never yanks focus into the rail).
  //
  // The next action gets focus: Continue when the newly shown step is already
  // completable (completed steps never relock, so Back then re-advance can be
  // fast-forwarded), otherwise the step heading. A disabled Continue must
  // never receive focus. The gating value is mirrored into a ref by a
  // render-frequency effect (refs are never touched during render); the focus
  // effect below is declared after it, so on a step change it reads the
  // freshly shown step's gating without re-running on every completion-state
  // change, which would steal focus mid-step.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const firstRender = useRef(true);
  const continueEnabledRef = useRef(false);
  useEffect(() => {
    continueEnabledRef.current = canContinue(currentStep);
  });
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (currentStep !== "complete" && continueEnabledRef.current) {
      continueRef.current?.focus();
    } else {
      headingRef.current?.focus();
    }
    setAnnouncement(`Lesson step: ${STEP_TITLES[currentStep]}`);
  }, [currentStep]);

  // -- navigation ------------------------------------------------------------

  const handleBack = () => {
    const index = LESSON_STEPS.indexOf(currentStep);
    if (index <= 0) return;
    setCurrentStep(LESSON_STEPS[index - 1]);
  };

  const handleAdvance = () => {
    if (!canContinue(currentStep)) return;
    if (currentStep === "observe" && !props.observationsSaved) {
      props.onSaveObservations();
    }
    setCompletedSteps((prev) => ({ ...prev, [currentStep]: true }));
    const index = LESSON_STEPS.indexOf(currentStep);
    const next = LESSON_STEPS[index + 1];
    if (next) setCurrentStep(next);
  };

  return (
    <section
      aria-label="Lesson"
      className="flex flex-col rounded-xl border border-border bg-surface p-4"
    >
      {/* Polite announcement of step transitions; mounted first so late
          regions (step statuses) never shift it, and empty on first render
          so nothing is announced on page load. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <nav aria-label="Lesson steps" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {LESSON_STEPS.map((step) => {
          const isCurrent = step === currentStep;
          const isDone = completedSteps[step] === true;
          return (
            <span
              key={step}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "text-sm font-medium",
                isCurrent
                  ? "text-accent"
                  : isDone
                    ? "text-foreground"
                    : "text-muted"
              )}
            >
              {isDone && (
                <span aria-hidden="true" className="mr-1">
                  ✓
                </span>
              )}
              {STEP_TITLES[step]}
              {isDone && <span className="sr-only">, completed</span>}
            </span>
          );
        })}
      </nav>

      <div className="mt-4">
        {currentStep === "predict" && (
          <PredictStep
            spec={props.spec}
            submitted={props.predictionSubmitted}
            predictionIndex={props.predictionIndex}
            manipulated={props.manipulated}
            revealed={props.revealed}
            onSubmit={props.onPredictionSubmit}
            onReveal={props.onReveal}
            headingRef={headingRef}
          />
        )}
        {currentStep === "interact" && (
          <InteractStep
            plan={plan}
            complete={stepConditionMet("interact")}
            sawIt={sawIt}
            onSawIt={() => setSawIt(true)}
            headingRef={headingRef}
          />
        )}
        {currentStep === "observe" && (
          <ObserveStep
            plan={plan}
            selections={props.observationSelections}
            notes={props.observationNotes}
            onToggle={props.onObservationToggle}
            onNotesChange={props.onObservationNotesChange}
            headingRef={headingRef}
          />
        )}
        {currentStep === "explain" && (
          <ExplainStep
            plan={plan}
            selection={explainSelection}
            text={explainText}
            onSelect={setExplainSelection}
            onTextChange={setExplainText}
            headingRef={headingRef}
          />
        )}
        {currentStep === "complete" && (
          <CompleteStep
            spec={props.spec}
            plan={plan}
            predictionIndex={props.predictionIndex}
            manipulatedNodeIds={props.manipulatedNodeIds}
            touchedControls={props.touchedControls}
            observationSelections={props.observationSelections}
            adaptations={props.adaptationSuggestions}
            onAdaptationDecision={props.onAdaptationDecision}
            latestTrial={props.trials[props.trials.length - 1] ?? null}
            onReplayTrial={props.onReplayTrial}
            headingRef={headingRef}
          />
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        {currentStep !== "predict" ? (
          <button
            type="button"
            onClick={handleBack}
            className="min-h-11 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised"
          >
            <span aria-hidden="true">← </span>
            Back
          </button>
        ) : (
          <span />
        )}
        {currentStep !== "complete" && (
          <button
            ref={continueRef}
            type="button"
            onClick={handleAdvance}
            disabled={!canContinue(currentStep)}
            className="ml-auto min-h-11 rounded-lg bg-accent-strong px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
        )}
      </div>
      {/* The gate is never silent: when Continue is disabled, the reason is
          stated in text (opacity alone is not a perceivable disabled state). */}
      {currentStep !== "complete" && !canContinue(currentStep) && (
        <p className="mt-3 text-xs leading-5 text-muted">
          Complete this step to continue.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step heading (focus target on step change)
// ---------------------------------------------------------------------------

function StepHeading({
  title,
  headingRef,
  intro,
}: {
  title: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  intro: string;
}) {
  return (
    <div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold leading-tight outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        {title}
      </h2>
      <p className="mt-1.5 leading-6">{intro}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// predict
// ---------------------------------------------------------------------------

function PredictStep({
  spec,
  submitted,
  predictionIndex,
  manipulated,
  revealed,
  onSubmit,
  onReveal,
  headingRef,
}: {
  spec: DemoSpecV1;
  submitted: boolean;
  predictionIndex: number | null;
  manipulated: boolean;
  revealed: boolean;
  onSubmit: (index: number) => void;
  onReveal: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const prediction = spec.prediction;
  const truth = predictionTruth(spec);
  const chosenOption =
    predictionIndex !== null ? prediction.options[predictionIndex] : null;

  if (submitted && chosenOption) {
    return (
      <section aria-label="Prediction">
        <StepHeading
          title="Predict"
          headingRef={headingRef}
          intro={prediction.prompt}
        />
        {/* Polite announcement of the gate transition; the text only changes
            when a prediction is submitted, so the region never spams. */}
        <p role="status" className="sr-only">
          Prediction recorded. Controls unlocked.
        </p>
        <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-muted">
          Prediction locked in
        </p>
        <blockquote className="mt-1.5 border-l-2 border-accent pl-3 leading-6">
          {chosenOption}
        </blockquote>

        {truth.graded ? (
          revealed ? (
            <GradedResult
              prediction={prediction}
              correctIndex={truth.correctIndex!}
              chosen={predictionIndex!}
            />
          ) : (
            <div className="mt-3">
              <button
                type="button"
                onClick={onReveal}
                disabled={!manipulated}
                className="w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reveal the verified answer
              </button>
              <p className="mt-2 text-xs leading-5 text-muted">
                {manipulated
                  ? "Compare what you expected with the verified answer."
                  : "Manipulate the demonstration first. The answer stays hidden until you have observed the behavior."}
              </p>
            </div>
          )
        ) : (
          <div className="mt-3 rounded-lg bg-surface-raised px-3 py-2.5">
            <p className="text-sm font-medium">Compare with what you observed</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              This {TRUST_LABELS[spec.trust.level].toLowerCase()} is not
              graded. Watch what happens as you change the controls and judge
              your prediction against your own observations.
            </p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Prediction">
      <StepHeading
        title="Predict"
        headingRef={headingRef}
        intro={prediction.prompt}
      />
      <fieldset className="mt-3">
        <legend className="text-sm font-medium">
          What do you think will happen?
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {prediction.options.map((option, index) => (
            <label
              key={`${option}-${index}`}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-raised"
            >
              <input
                type="radio"
                name="prediction-option"
                checked={choice === index}
                onChange={() => setChoice(index)}
                className="h-4 w-4 accent-accent"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => {
          if (choice === null) return;
          onSubmit(choice);
          setChoice(null);
        }}
        disabled={choice === null}
        className="mt-4 w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit prediction
      </button>
    </section>
  );
}

function GradedResult({
  prediction,
  correctIndex,
  chosen,
}: {
  prediction: DemoSpecV1["prediction"];
  correctIndex: number;
  chosen: number;
}) {
  const correct = prediction.options[correctIndex];
  const chosenOption = prediction.options[chosen];
  const isCorrect = correctIndex === chosen;

  // The Reveal button is replaced by this result; take focus so keyboard
  // users stay on the outcome instead of being dropped to <body>.
  const resultRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    resultRef.current?.focus();
  }, []);

  return (
    <div
      ref={resultRef}
      tabIndex={-1}
      className="mt-3 rounded-lg border border-border bg-surface-raised p-3"
    >
      <p
        role="status"
        className={cn(
          "text-sm font-semibold",
          isCorrect ? "text-ok" : "text-danger"
        )}
      >
        {isCorrect
          ? "Your prediction was correct."
          : "Your prediction differed from the verified answer."}
      </p>
      <dl className="mt-2 flex flex-col gap-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Your prediction</dt>
          <dd className="text-right font-medium">{chosenOption}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Verified answer</dt>
          <dd className="text-right font-medium">{correct}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// interact
// ---------------------------------------------------------------------------

function InteractStep({
  plan,
  complete,
  sawIt,
  onSawIt,
  headingRef,
}: {
  plan: LessonPlan;
  complete: boolean;
  sawIt: boolean;
  onSawIt: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  // The completion status ("Interaction recorded.") mounts only when the
  // interaction lands while this step is displayed. When the step is
  // re-visited already complete (Back then re-advance over a completed step),
  // the status must NOT mount: the step-transition announcement alone conveys
  // the state, and a second simultaneous region change would double-announce.
  const [completionVisible, setCompletionVisible] = useState(false);
  const wasCompleteRef = useRef(complete);
  useEffect(() => {
    if (complete && !wasCompleteRef.current) setCompletionVisible(true);
    wasCompleteRef.current = complete;
  }, [complete]);

  return (
    <section aria-label="Interact">
      <StepHeading
        title="Interact"
        headingRef={headingRef}
        intro={plan.interactInstruction}
      />
      <p className="mt-2 text-xs leading-5 text-muted">
        {plan.mode === "graph"
          ? "Click the node on the model. The linked effects respond in order."
          : plan.mode === "engine"
            ? "Use the control under the model."
            : "There are no adjustable controls in this model. Watch the animation and confirm when you are ready."}
      </p>
      {plan.mode === "timeline" && !sawIt && (
        <button
          type="button"
          onClick={onSawIt}
          className="mt-3 min-h-11 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          I saw it
        </button>
      )}
      {completionVisible && (
        <p role="status" className="mt-3 text-sm font-medium text-ok">
          {plan.mode === "timeline" ? "Animation watched." : "Interaction recorded."}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// observe
// ---------------------------------------------------------------------------

function ObserveStep({
  plan,
  selections,
  notes,
  onToggle,
  onNotesChange,
  headingRef,
}: {
  plan: LessonPlan;
  selections: Record<string, boolean>;
  notes: string;
  onToggle: (prompt: string, checked: boolean) => void;
  onNotesChange: (value: string) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-label="Observe">
      <StepHeading
        title="Observe"
        headingRef={headingRef}
        intro={plan.observeQuestion}
      />
      {plan.observeOptions.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">
            Check what you observed
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {plan.observeOptions.map((option) => (
              <label
                key={option.id}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-raised"
              >
                <input
                  type="checkbox"
                  checked={selections[option.id] ?? false}
                  onChange={(event) =>
                    onToggle(option.id, event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No observation prompts were declared for this demonstration.
        </p>
      )}

      <label
        htmlFor="lesson-observe-notes"
        className="mt-4 block text-sm font-medium"
      >
        Your notes
      </label>
      <textarea
        id="lesson-observe-notes"
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        rows={3}
        placeholder="What changed when you adjusted the controls?"
        className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// explain
// ---------------------------------------------------------------------------

function ExplainStep({
  plan,
  selection,
  text,
  onSelect,
  onTextChange,
  headingRef,
}: {
  plan: LessonPlan;
  selection: string | null;
  text: string;
  onSelect: (option: string) => void;
  onTextChange: (value: string) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section aria-label="Explain">
      <StepHeading
        title="Explain"
        headingRef={headingRef}
        intro={plan.explainQuestion}
      />
      {plan.explainOptions ? (
        <>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">
              Choose the explanation that matches your observation
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              {plan.explainOptions.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-raised"
                >
                  <input
                    type="radio"
                    name="explain-option"
                    checked={selection === option}
                    onChange={() => onSelect(option)}
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-2 text-xs leading-5 text-muted">
            Self-assessment: this demonstration is not graded. Choose the
            explanation that matches what you observed.
          </p>
        </>
      ) : (
        <>
          <label
            htmlFor="lesson-explain-text"
            className="mt-3 block text-sm font-medium"
          >
            Your explanation
          </label>
          <textarea
            id="lesson-explain-text"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            rows={4}
            placeholder="Explain in your own words."
            className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
          />
          <p className="mt-2 text-xs leading-5 text-muted">
            Self-assessment: there is no single correct answer. Judge your
            explanation against what you observed.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------

function CompleteStep({
  spec,
  plan,
  predictionIndex,
  manipulatedNodeIds,
  touchedControls,
  observationSelections,
  adaptations,
  onAdaptationDecision,
  latestTrial,
  onReplayTrial,
  headingRef,
}: {
  spec: DemoSpecV1;
  plan: LessonPlan;
  predictionIndex: number | null;
  manipulatedNodeIds: string[];
  touchedControls: string[];
  observationSelections: Record<string, boolean>;
  adaptations: AdaptationSuggestion[];
  onAdaptationDecision: (
    suggestion: AdaptationSuggestion,
    accepted: boolean
  ) => void;
  latestTrial: TrialRecord | null;
  onReplayTrial: (trial: TrialRecord) => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const observedCount = Object.values(observationSelections).filter(
    Boolean
  ).length;
  const interactedGraph =
    plan.mode === "graph" &&
    plan.nodeId !== undefined &&
    manipulatedNodeIds.includes(plan.nodeId);
  const interactedEngine =
    plan.mode === "engine" &&
    plan.controlId !== undefined &&
    touchedControls.includes(plan.controlId);

  const recap: string[] = [];
  if (predictionIndex !== null) {
    recap.push(`You predicted: ${spec.prediction.options[predictionIndex]}`);
  }
  if (interactedGraph) {
    recap.push(`You clicked ${plan.nodeLabel}.`);
  } else if (interactedEngine) {
    recap.push(`You changed ${plan.controlLabel}.`);
  } else {
    recap.push("You watched the animation.");
  }
  recap.push(
    observedCount > 0
      ? `You recorded ${observedCount} observation${observedCount === 1 ? "" : "s"}.`
      : "You recorded your observations."
  );
  recap.push(
    plan.explainOptions
      ? "You chose an explanation."
      : "You wrote your own explanation."
  );

  return (
    <section aria-label="Complete">
      <StepHeading
        title="Complete"
        headingRef={headingRef}
        intro="You finished this lesson. Here is what you did."
      />
      <ul className="mt-3 flex list-inside list-disc flex-col gap-1.5 text-sm text-muted">
        {recap.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      {adaptations.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-surface-raised p-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">
            Suggested adaptation
          </p>
          <AdaptationAnnouncement
            adaptations={adaptations}
            onDecision={onAdaptationDecision}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {latestTrial && (
          <button
            type="button"
            onClick={() => onReplayTrial(latestTrial)}
            className="min-h-11 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised"
          >
            Restore these parameters
          </button>
        )}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-accent-strong px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          New concept
        </Link>
      </div>
    </section>
  );
}

/**
 * Polite announcement of the learner's adaptation decision. The region mounts
 * only with text and the text changes only on a decision, so it never spams.
 */
function AdaptationAnnouncement({
  adaptations,
  onDecision,
}: {
  adaptations: AdaptationSuggestion[];
  onDecision: (suggestion: AdaptationSuggestion, accepted: boolean) => void;
}) {
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const decide = (suggestion: AdaptationSuggestion, accepted: boolean) => {
    setAnnouncement(
      accepted
        ? `Adaptation applied: ${suggestion.text}`
        : `Adaptation dismissed: ${suggestion.text}`
    );
    onDecision(suggestion, accepted);
  };

  return (
    <>
      {adaptations.map((suggestion) => (
        <div key={suggestion.id} className="mt-2">
          <p className="text-sm leading-6">{suggestion.text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide(suggestion, true)}
              className="min-h-11 rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => decide(suggestion, false)}
              className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
      {announcement !== null && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}
    </>
  );
}
