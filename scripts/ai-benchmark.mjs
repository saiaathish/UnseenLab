#!/usr/bin/env node
/**
 * AI adaptation benchmark for the bounded hosted-model path.
 *
 * POSTs a set of curated session fixtures to `${APP_BASE_URL}/api/adapt` and
 * scores the responses: schema validity, acceptable intervention, taxonomy
 * agreement (misconception id), latency, fallback rate, and retry rate
 * (HTTP 429/5xx responses from the app).
 *
 * Modes (no rebuild needed — shell env beats .env):
 *   rules  — server started with LLM_API_KEY= (empty)  => deterministic path
 *   llm    — server started normally (key from .env)   => real hosted model
 *
 * Usage:
 *   node scripts/ai-benchmark.mjs --mode=rules --base-url=http://localhost:3102
 *   node scripts/ai-benchmark.mjs --mode=llm  --base-url=http://localhost:3101
 *
 * Output: results JSON at scripts/benchmark-results-<mode>-<ts>.json
 *
 * Hygiene: logs fixture ids and outcome codes only — never the API key, never
 * learner text, never raw model output.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PER_FIXTURE_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { mode: "rules", baseUrl: null, out: null };
  for (const arg of argv) {
    const [key, value] = arg.split("=");
    if (key === "--mode") args.mode = value ?? "rules";
    else if (key === "--base-url") args.baseUrl = value;
    else if (key === "--out") args.out = value;
    else if (key === "--help") args.help = true;
  }
  if (args.mode !== "rules" && args.mode !== "llm") {
    console.error(`[benchmark] unknown mode "${args.mode}" (expected rules|llm)`);
    process.exit(2);
  }
  if (!args.baseUrl) {
    args.baseUrl = args.mode === "llm" ? "http://localhost:3101" : "http://localhost:3102";
  }
  return args;
}

// ---------------------------------------------------------------------------
// Fixture builders (inputs conform to src/adaptation/llm-schema.ts shapes)
// ---------------------------------------------------------------------------
const BASE_PREFERENCES = {
  animationSpeed: 1,
  reducedMotion: false,
  informationDensity: "medium",
  preferredRepresentations: ["animation"],
  feedbackTiming: "after_trial",
  oneVariableMode: true,
  highContrast: false,
  textScale: 1,
};

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:01:00.000Z";
const TP = "2026-01-01T00:00:30.000Z";

function snap(step, free) {
  return {
    step,
    freeNeutrons: free,
    absorbedNeutrons: 0,
    escapedNeutrons: 0,
    reactionEvents: free > 1 ? 1 : 0,
    cumulativeEnergyUnits: 0,
  };
}

function nonlinearSnapshots(start) {
  // Geometric doubling capped at the 500 ceiling: final >= 8x initial.
  const out = [];
  let value = start;
  for (let i = 0; i < 8; i++) {
    out.push(snap(i * 10, Math.min(value, 500)));
    value *= 2;
  }
  return out;
}

function moderateSnapshots(start) {
  const ratios = [1, 1.2, 1.5, 1.8, 2.2, 2.6];
  return ratios.map((r, i) => snap(i * 10, Math.round(start * r)));
}

function decliningSnapshots(start) {
  return [start, 7, 4, 2, 1, 0].map((v, i) => snap(i * 10, v));
}

function params(overrides = {}) {
  return {
    absorberPosition: 0.9,
    startingNeutrons: 3,
    materialDensity: 0.9,
    absorptionProbability: 0.25,
    durationSteps: 60,
    seed: 42,
    ...overrides,
  };
}

function makeTrial(id, parameters, { snapshots, changedVariables = [], startedAt = T0, completedAt = T1 } = {}) {
  return { id, parameters, snapshots, changedVariables, startedAt, completedAt };
}

function makePrediction(trialId, { id = crypto.randomUUID(), answer = "", structuredAnswer = null, confidence = 3 } = {}) {
  return {
    id,
    trialId,
    prompt: "What will happen to the reaction?",
    answer,
    structuredAnswer,
    confidence,
    createdAt: TP,
  };
}

function buildInput({ trials, predictions, preferences = BASE_PREFERENCES, representationEvents = [] }) {
  return {
    preferences,
    predictions,
    trials,
    sessionEvidence: {
      predictions,
      trials,
      representationEvents,
      adaptationProposals: [],
      conceptEvidence: [],
      counterfactuals: [],
    },
  };
}

// Shortcut builders for the two most common trial shapes.
function nonlinearTrial(id, seed = 42, start = 3) {
  return makeTrial(id, params({ absorberPosition: 0.05, absorptionProbability: 0.01, materialDensity: 1, durationSteps: 120, seed, startingNeutrons: start }), {
    snapshots: nonlinearSnapshots(start),
  });
}

function moderateTrial(id, seed = 42, start = 10, absorberPosition = 0.9) {
  return makeTrial(id, params({ absorberPosition, seed, startingNeutrons: start }), {
    snapshots: moderateSnapshots(start),
  });
}

function decliningTrial(id, seed = 42, start = 10) {
  return makeTrial(id, params({ absorberPosition: 0.9, seed, startingNeutrons: start }), {
    snapshots: decliningSnapshots(start),
  });
}

// ---------------------------------------------------------------------------
// Fixtures (31, spanning the full misconception taxonomy; real ids only)
// ---------------------------------------------------------------------------

const FIXTURES = [
  {
    id: "growth-linear-pred-nonlinear-actual",
    name: "Linear prediction vs. observed nonlinear growth",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation", "reduce_density", "ask_prediction_again"],
    notes: "slightly_faster vs. accelerating growth: the classic contradiction.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 4 })],
    }),
  },
  {
    id: "growth-nonlinear-pred-supported",
    name: "Nonlinear prediction matches nonlinear growth",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["ask_prediction_again"],
    notes: "much_faster_nonlinear predicted and observed: supported.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 4 })],
    }),
  },
  {
    id: "growth-freetext-linear-vs-nonlinear",
    name: "Free-text linear intent vs. nonlinear growth",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Keyword 'linear' in free text while the run accelerated.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "I think it will grow linearly, just a bit faster", confidence: 3 })],
    }),
  },
  {
    id: "growth-pred-faster-actual-declining",
    name: "Faster prediction vs. declining population",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["show_graph", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density", "slow_animation"],
    notes: "slightly_faster predicted, population declined to extinction.",
    input: buildInput({
      trials: [decliningTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "growth-no-prediction-latest",
    name: "No prediction on record for the latest trial",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["ask_prediction_again"],
    unacceptableInterventionIds: ["reduce_density", "slow_animation"],
    notes: "Nothing to compare yet: ask for the prediction first.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [],
    }),
  },
  {
    id: "absorber-withdrawn-pred-slower",
    name: "Absorber withdrawn but learner predicted slower",
    expectedMisconceptionId: "ABSORBER_EFFECT",
    acceptableInterventionIds: ["show_causal_view", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density", "slow_animation"],
    notes: "Withdrawing the absorber frees neutrons (faster); prediction said slower.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10, 0.9), moderateTrial("t2", 43, 10, 0.3)],
      predictions: [makePrediction("t2", { answer: "It gets slower", structuredAnswer: "slower", confidence: 4 })],
    }),
  },
  {
    id: "absorber-withdrawn-pred-faster",
    name: "Absorber withdrawn, faster predicted and observed",
    expectedMisconceptionId: "ABSORBER_EFFECT",
    acceptableInterventionIds: ["show_causal_view", "compare_trials"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Direction supported: withdrawal -> faster.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10, 0.9), moderateTrial("t2", 43, 10, 0.3)],
      predictions: [makePrediction("t2", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 4 })],
    }),
  },
  {
    id: "absorber-inserted-pred-slower",
    name: "Absorber inserted, slower predicted and observed",
    expectedMisconceptionId: "ABSORBER_EFFECT",
    acceptableInterventionIds: ["show_causal_view", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "Inserting the absorber slows the reaction; prediction matched.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10, 0.3), moderateTrial("t2", 43, 10, 0.9)],
      predictions: [makePrediction("t2", { answer: "It gets slower", structuredAnswer: "slower", confidence: 3 })],
    }),
  },
  {
    id: "absorber-withdrawn-freetext",
    name: "Absorber effect with a free-text prediction",
    expectedMisconceptionId: "ABSORBER_EFFECT",
    acceptableInterventionIds: ["show_causal_view", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "Free text about escaping neutrons; no structured direction.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10, 0.9), moderateTrial("t2", 43, 10, 0.3)],
      predictions: [makePrediction("t2", { answer: "More neutrons will escape, so it should speed up", confidence: 3 })],
    }),
  },
  {
    id: "start-pop-up-final-up",
    name: "Starting population raised, final population rose",
    expectedMisconceptionId: "STARTING_POPULATION_EFFECT",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "startNeutrons 3->10, finals up: supported.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 3), moderateTrial("t2", 43, 10)],
      predictions: [makePrediction("t2", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 4 })],
    }),
  },
  {
    id: "start-pop-down-final-down",
    name: "Starting population lowered, final population fell",
    expectedMisconceptionId: "STARTING_POPULATION_EFFECT",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "startNeutrons 10->3, finals down: supported.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10), moderateTrial("t2", 43, 3)],
      predictions: [makePrediction("t2", { answer: "It gets slower", structuredAnswer: "slower", confidence: 3 })],
    }),
  },
  {
    id: "start-pop-up-final-down",
    name: "Starting population raised but reaction died out",
    expectedMisconceptionId: "STARTING_POPULATION_EFFECT",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "startNeutrons 3->10 yet finals fell: contradicted.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 3), decliningTrial("t2", 43, 10)],
      predictions: [makePrediction("t2", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 4 })],
    }),
  },
  {
    id: "random-event-same-params-same-shape",
    name: "Same parameters, different seeds, same growth shape",
    expectedMisconceptionId: "RANDOM_EVENT_VS_SYSTEM_PATTERN",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Pattern repeats across seeds: system, not luck.",
    input: buildInput({
      trials: [nonlinearTrial("t1", 1), nonlinearTrial("t2", 2)],
      predictions: [makePrediction("t2", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 3 })],
    }),
  },
  {
    id: "random-event-same-params-different-shape",
    name: "Same parameters, different seeds, different shapes",
    expectedMisconceptionId: "RANDOM_EVENT_VS_SYSTEM_PATTERN",
    acceptableInterventionIds: ["compare_trials", "show_graph", "show_causal_view"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Outcome varies run to run: chance at play.",
    input: buildInput({
      trials: [nonlinearTrial("t1", 1), moderateTrial("t2", 2)],
      predictions: [makePrediction("t2", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 2 })],
    }),
  },
  {
    id: "replay-same-run-twice",
    name: "Identical run replayed (same seed and parameters)",
    expectedMisconceptionId: "RANDOM_EVENT_VS_SYSTEM_PATTERN",
    acceptableInterventionIds: ["slow_animation", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density", "ask_prediction_again"],
    notes: "Exact replay: slow the animation to make the pattern followable.",
    input: buildInput({
      trials: [moderateTrial("t1", 42), moderateTrial("t2", 42)],
      predictions: [makePrediction("t2", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "confounded-three-variables",
    name: "Three variables changed at once",
    expectedMisconceptionId: "MULTIPLE_VARIABLE_CONFOUNDING",
    acceptableInterventionIds: ["freeze_variables", "compare_trials"],
    unacceptableInterventionIds: ["slow_animation", "reduce_density"],
    notes: "absorber + density + duration changed together.",
    input: buildInput({
      trials: [
        makeTrial("t1", params(), { snapshots: moderateSnapshots(3), changedVariables: [] }),
        makeTrial("t2", params({ absorberPosition: 0.3, materialDensity: 0.5, durationSteps: 90 }), {
          snapshots: moderateSnapshots(3),
          changedVariables: ["absorberPosition", "materialDensity", "durationSteps"],
        }),
      ],
      predictions: [makePrediction("t2", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "confounded-two-variables",
    name: "Two variables changed at once",
    expectedMisconceptionId: "MULTIPLE_VARIABLE_CONFOUNDING",
    acceptableInterventionIds: ["freeze_variables", "compare_trials"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Two knobs moved: attribution is ambiguous.",
    input: buildInput({
      trials: [
        makeTrial("t1", params(), { snapshots: moderateSnapshots(3), changedVariables: [] }),
        makeTrial("t2", params({ absorberPosition: 0.3, materialDensity: 0.5 }), {
          snapshots: moderateSnapshots(3),
          changedVariables: ["absorberPosition", "materialDensity"],
        }),
      ],
      predictions: [makePrediction("t2", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "confounded-absorber-density-start",
    name: "Absorber, density and starting population changed",
    expectedMisconceptionId: "MULTIPLE_VARIABLE_CONFOUNDING",
    acceptableInterventionIds: ["freeze_variables"],
    unacceptableInterventionIds: ["slow_animation", "reduce_density"],
    notes: "Three variables incl. the absorber: isolate first.",
    input: buildInput({
      trials: [
        makeTrial("t1", params(), { snapshots: moderateSnapshots(3), changedVariables: [] }),
        makeTrial("t2", params({ absorberPosition: 0.2, materialDensity: 0.4, startingNeutrons: 8 }), {
          snapshots: moderateSnapshots(3),
          changedVariables: ["absorberPosition", "materialDensity", "startingNeutrons"],
        }),
      ],
      predictions: [makePrediction("t2", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "safety-ceiling-hit",
    name: "Run hit the safety ceiling (500 population)",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["reduce_density", "show_graph", "compare_trials"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Details hidden by the ceiling; lowering density reveals the curve.",
    input: buildInput({
      trials: [nonlinearTrial("t1", 42, 10)],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 4 })],
    }),
  },
  {
    id: "high-confidence-wrong-prediction",
    name: "High confidence with an incorrect prediction",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["ask_prediction_again", "slow_animation"],
    notes: "Confidence 5 but the prediction contradicted the outcome.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 5 })],
    }),
  },
  {
    id: "uncertain-vague-prediction",
    name: "Uncertain, vague learner response",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph", "ask_prediction_again"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "Low confidence free text with no directional intent.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "not sure, maybe something happens", confidence: 1 })],
    }),
  },
  {
    id: "unchanged-prediction-after-contradiction",
    name: "Prediction unchanged after a contradiction",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation", "reduce_density"],
    notes: "slightly_faster repeated across two nonlinear trials.",
    input: buildInput({
      trials: [nonlinearTrial("t1", 1), nonlinearTrial("t2", 2)],
      predictions: [
        makePrediction("t1", { id: "p1", answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 4 }),
        makePrediction("t2", { id: "p2", answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 4 }),
      ],
    }),
  },
  {
    id: "extinction-pred-explosion",
    name: "Explosion predicted but the reaction died out",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["show_graph", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "much_faster_nonlinear vs. declining to zero.",
    input: buildInput({
      trials: [decliningTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 5 })],
    }),
  },
  {
    id: "absorber-withdrawn-nonlinear-growth",
    name: "Absorber withdrawn with nonlinear growth",
    expectedMisconceptionId: "ABSORBER_EFFECT",
    acceptableInterventionIds: ["show_causal_view", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "Withdrawal -> acceleration; prediction matched direction.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10, 0.9), nonlinearTrial("t2", 43, 10)],
      predictions: [makePrediction("t2", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 4 })],
    }),
  },
  {
    id: "start-pop-1-to-10-nonlinear",
    name: "Starting population 1 to 10 with nonlinear growth",
    expectedMisconceptionId: "STARTING_POPULATION_EFFECT",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Small start died; large start took off.",
    input: buildInput({
      trials: [decliningTrial("t1", 42, 1), nonlinearTrial("t2", 43, 10)],
      predictions: [makePrediction("t2", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 4 })],
    }),
  },
  {
    id: "delayed-feedback-manual-contradiction",
    name: "Delayed feedback preference with a contradiction",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "feedbackTiming=manual; comparison still the right move.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
      preferences: { ...BASE_PREFERENCES, feedbackTiming: "manual" },
    }),
  },
  {
    id: "random-event-three-seeds-same-shape",
    name: "Three seeds, same shape: repeatable pattern",
    expectedMisconceptionId: "RANDOM_EVENT_VS_SYSTEM_PATTERN",
    acceptableInterventionIds: ["compare_trials"],
    unacceptableInterventionIds: ["slow_animation"],
    notes: "Nonlinear across seeds 1,2,3: a system pattern.",
    input: buildInput({
      trials: [nonlinearTrial("t1", 1), nonlinearTrial("t2", 2), nonlinearTrial("t3", 3)],
      predictions: [makePrediction("t3", { answer: "It grows much faster than before", structuredAnswer: "much_faster_nonlinear", confidence: 3 })],
    }),
  },
  {
    id: "two-vars-no-prediction",
    name: "Two variables changed, no prediction on record",
    expectedMisconceptionId: "MULTIPLE_VARIABLE_CONFOUNDING",
    acceptableInterventionIds: ["freeze_variables", "ask_prediction_again"],
    unacceptableInterventionIds: ["reduce_density", "slow_animation"],
    notes: "Confounded run with nothing predicted yet.",
    input: buildInput({
      trials: [
        makeTrial("t1", params(), { snapshots: moderateSnapshots(3), changedVariables: [] }),
        makeTrial("t2", params({ absorberPosition: 0.3, startingNeutrons: 8 }), {
          snapshots: moderateSnapshots(3),
          changedVariables: ["absorberPosition", "startingNeutrons"],
        }),
      ],
      predictions: [],
    }),
  },
  {
    id: "moderate-growth-linear-pred",
    name: "Gentle linear prediction with moderate growth",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials", "show_graph"],
    unacceptableInterventionIds: ["reduce_density", "slow_animation"],
    notes: "slightly_faster vs. moderate: consistent (supported).",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10)],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "absorber-inserted-pred-faster",
    name: "Absorber inserted but faster predicted",
    expectedMisconceptionId: "ABSORBER_EFFECT",
    acceptableInterventionIds: ["show_causal_view", "compare_trials"],
    unacceptableInterventionIds: ["reduce_density"],
    notes: "Insertion slows the reaction; prediction said faster.",
    input: buildInput({
      trials: [moderateTrial("t1", 42, 10, 0.3), moderateTrial("t2", 43, 10, 0.9)],
      predictions: [makePrediction("t2", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 3 })],
    }),
  },
  {
    id: "graph-opened-still-contradicted",
    name: "Contradiction persists after the graph was already opened",
    expectedMisconceptionId: "LINEAR_VS_NONLINEAR_GROWTH",
    acceptableInterventionIds: ["compare_trials"],
    unacceptableInterventionIds: ["slow_animation", "reduce_density"],
    notes: "Graph seen, contradiction remains: side-by-side comparison next.",
    input: buildInput({
      trials: [nonlinearTrial("t1")],
      predictions: [makePrediction("t1", { answer: "It gets slightly faster", structuredAnswer: "slightly_faster", confidence: 4 })],
      representationEvents: [{ mode: "graph", openedAt: "2026-01-01T00:00:50.000Z" }],
    }),
  },
];

// ---------------------------------------------------------------------------
// Response scoring
// ---------------------------------------------------------------------------
function validateDataShape(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const nonEmptyString = (v) => typeof v === "string" && v.length > 0;
  return (
    nonEmptyString(data.misconception_id) &&
    typeof data.confidence === "number" &&
    data.confidence >= 0 &&
    data.confidence <= 1 &&
    Array.isArray(data.evidence) &&
    data.evidence.length >= 1 &&
    data.evidence.length <= 3 &&
    data.evidence.every((e) => typeof e === "string") &&
    nonEmptyString(data.intervention) &&
    nonEmptyString(data.reason) &&
    (data.follow_up_question === null || typeof data.follow_up_question === "string")
  );
}

async function runFixture(fixture, baseUrl) {
  const startedAt = performance.now();
  let httpStatus = null;
  let body = null;
  let connectionError = null;
  try {
    const response = await fetch(`${baseUrl}/api/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fixture.input),
      signal: AbortSignal.timeout(PER_FIXTURE_TIMEOUT_MS),
    });
    httpStatus = response.status;
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = null; // non-JSON body: counts as schema-invalid
    }
  } catch (error) {
    connectionError =
      error && error.name === "TimeoutError" ? "timeout" : (error && error.message) || "unknown";
  }
  const latencyMs = Math.round(performance.now() - startedAt);

  const data = body && typeof body === "object" && !Array.isArray(body) ? body.data ?? null : null;
  const isFallback = Boolean(body && body.fallback === true);
  const schemaValid = validateDataShape(data) || isFallback;

  return {
    id: fixture.id,
    name: fixture.name,
    httpStatus,
    connectionError,
    latencyMs,
    schemaValid,
    fallback: isFallback,
    fallbackReason: isFallback && body && typeof body.reason === "string" ? body.reason : null,
    misconceptionId: data ? data.misconception_id : null,
    acceptableIntervention:
      data && fixture.acceptableInterventionIds
        ? fixture.acceptableInterventionIds.includes(data.intervention)
        : null,
    unacceptableInterventionChosen:
      data && fixture.unacceptableInterventionIds
        ? fixture.unacceptableInterventionIds.includes(data.intervention)
        : null,
    taxonomyAgreement: data ? data.misconception_id === fixture.expectedMisconceptionId : null,
    expectedMisconceptionId: fixture.expectedMisconceptionId,
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index] * 10) / 10;
}

function aggregate(records) {
  const n = records.length;
  const rate = (count) => (n === 0 ? null : Math.round((count / n) * 1000) / 10);

  const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
  const withData = records.filter((r) => r.misconceptionId !== null);
  const accepted = withData.filter((r) => r.acceptableIntervention === true);
  const taxonomyAgreed = withData.filter((r) => r.taxonomyAgreement === true);
  const fallbackCount = records.filter((r) => r.fallback).length;
  const retryCount = records.filter((r) => r.httpStatus !== null && (r.httpStatus === 429 || r.httpStatus >= 500)).length;
  const connectionErrors = records.filter((r) => r.connectionError !== null).length;

  const httpStatusCounts = {};
  for (const r of records) {
    if (r.httpStatus !== null) httpStatusCounts[r.httpStatus] = (httpStatusCounts[r.httpStatus] ?? 0) + 1;
  }
  const fallbackReasonCounts = {};
  for (const r of records) {
    if (r.fallbackReason) fallbackReasonCounts[r.fallbackReason] = (fallbackReasonCounts[r.fallbackReason] ?? 0) + 1;
  }

  return {
    fixtureCount: n,
    schemaValidRate: rate(records.filter((r) => r.schemaValid).length),
    acceptableInterventionRate: withData.length > 0 ? Math.round((accepted.length / withData.length) * 1000) / 10 : null,
    unacceptableInterventionRate: withData.length > 0 ? Math.round((withData.filter((r) => r.unacceptableInterventionChosen === true).length / withData.length) * 1000) / 10 : null,
    taxonomyAgreementRate: withData.length > 0 ? Math.round((taxonomyAgreed.length / withData.length) * 1000) / 10 : null,
    judgedFixtureCount: withData.length,
    fallbackRate: rate(fallbackCount),
    retryRate: rate(retryCount),
    connectionErrorRate: rate(connectionErrors),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      mean: n > 0 ? Math.round((latencies.reduce((a, b) => a + b, 0) / n) * 10) / 10 : null,
      min: n > 0 ? latencies[0] : null,
      max: n > 0 ? latencies[n - 1] : null,
    },
    httpStatusCounts,
    fallbackReasonCounts,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/ai-benchmark.mjs --mode=rules|llm [--base-url=URL] [--out=FILE]\n" +
        "  rules: server started with LLM_API_KEY= (deterministic path)\n" +
        "  llm:   server started normally (hosted model path)",
    );
    return;
  }

  const startedAtIso = new Date().toISOString();
  const timestamp = startedAtIso.replace(/[:.]/g, "-");
  const outPath = args.out ?? join(SCRIPT_DIR, `benchmark-results-${args.mode}-${timestamp}.json`);

  console.log(`[benchmark] mode=${args.mode} base-url=${args.baseUrl} fixtures=${FIXTURES.length}`);

  const records = [];
  for (const fixture of FIXTURES) {
    const record = await runFixture(fixture, args.baseUrl);
    records.push(record);
    const outcome = record.connectionError
      ? `CONN_ERR(${record.connectionError})`
      : record.schemaValid
        ? record.fallback
          ? `fallback(${record.fallbackReason ?? "?"})`
          : `ok`
        : `schema-invalid(http ${record.httpStatus})`;
    console.log(
      `[benchmark] ${record.id.padEnd(46)} ${String(record.latencyMs).padStart(6)}ms ${outcome}`,
    );
  }

  const metrics = aggregate(records);
  const report = {
    mode: args.mode,
    baseUrl: args.baseUrl,
    startedAt: startedAtIso,
    finishedAt: new Date().toISOString(),
    metrics,
    fixtures: records,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[benchmark] results written to ${outPath}`);
  console.log(`[benchmark] summary: schemaValid=${metrics.schemaValidRate}% fallback=${metrics.fallbackRate}% ` +
    `acceptable=${metrics.acceptableInterventionRate}% taxonomy=${metrics.taxonomyAgreementRate}% ` +
    `p50=${metrics.latencyMs.p50}ms p95=${metrics.latencyMs.p95}ms retryRate=${metrics.retryRate}%`);
  if (args.mode === "llm" && metrics.fallbackReasonCounts && metrics.fallbackReasonCounts.no_api_key) {
    console.warn("[benchmark] WARNING: llm mode saw 'no_api_key' fallbacks — the server likely had no key at start.");
  }
}

main().catch((error) => {
  console.error("[benchmark] fatal:", error.message);
  process.exit(1);
});
