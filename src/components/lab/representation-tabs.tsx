"use client";

import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import type {
  SimulationStopReason,
  TrialRecord,
} from "@/domain/experiments";
import { MAX_POPULATION } from "@/domain/experiments";
import type { LearnerPreferences, RepresentationMode } from "@/domain/learner";
import { REPRESENTATION_MODES } from "@/domain/learner";

interface Props {
  active: RepresentationMode;
  trial: TrialRecord | null;
  stopReason: SimulationStopReason | null;
  preferences: LearnerPreferences;
  /** Saved explanation style (optional account layer) — changes plain-language copy only, never science. */
  explanationStyle?: "visual_first" | "step_by_step" | "concise";
  onChange: (mode: RepresentationMode) => void;
}

const MODE_LABELS: Record<RepresentationMode, string> = {
  animation: "Animation",
  graph: "Graph",
  equation: "Equation",
  causal: "Causal",
  plain_language: "Plain language",
};

/**
 * Five ways to view the same trial. Switching is learner-controlled and every
 * open is recorded in the session evidence.
 */
export function RepresentationTabs({
  active,
  trial,
  stopReason,
  preferences,
  explanationStyle,
  onChange,
}: Props) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /**
   * Preferred views come first (stable order for the rest), so a saved
   * preference visibly changes what the learner sees first.
   */
  const orderedModes = useMemo(() => {
    const preferred = preferences.preferredRepresentations.filter((mode) =>
      REPRESENTATION_MODES.includes(mode),
    );
    const rest = REPRESENTATION_MODES.filter(
      (mode) => !preferred.includes(mode),
    );
    return [...preferred, ...rest];
  }, [preferences.preferredRepresentations]);

  /**
   * WAI-ARIA tabs pattern: ArrowRight/ArrowLeft move selection (wrapping),
   * Home/End jump to the first/last tab. Only keyboard-originated changes
   * move focus; clicks select without stealing focus. Navigation starts from
   * the FOCUSED tab (falling back to the selected one) so focus and selection
   * can never drift apart.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = tabRefs.current.findIndex(
      (node) => node === document.activeElement,
    );
    const currentIndex =
      focusedIndex >= 0 ? focusedIndex : orderedModes.indexOf(active);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % orderedModes.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + orderedModes.length) % orderedModes.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = orderedModes.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(orderedModes[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section
      aria-label="Representations"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div
        role="tablist"
        aria-label="View the trial as"
        onKeyDown={handleKeyDown}
        className="flex flex-wrap gap-1"
      >
        {orderedModes.map((mode, index) => (
          <button
            key={mode}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            id={`rep-tab-${mode}`}
            aria-selected={active === mode}
            aria-controls="rep-panel"
            tabIndex={active === mode ? 0 : -1}
            onClick={() => onChange(mode)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              active === mode
                ? "bg-accent-strong text-white"
                : "border border-border hover:bg-surface-raised"
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <div
        className="mt-4"
        role="tabpanel"
        id="rep-panel"
        aria-labelledby={`rep-tab-${active}`}
      >
        {!trial ? (
          <p className="text-sm text-muted">
            Run a trial first to see this view.
          </p>
        ) : active === "graph" ? (
          <GraphView trial={trial} />
        ) : active === "equation" ? (
          <EquationView trial={trial} />
        ) : active === "causal" ? (
          <CausalView trial={trial} />
        ) : active === "plain_language" ? (
          <PlainLanguageView
            trial={trial}
            stopReason={stopReason}
            preferences={preferences}
            explanationStyle={explanationStyle}
          />
        ) : (
          <p className="text-sm text-muted">
            Switch to the Animation tab for the interactive animation (above
            the tabs).
          </p>
        )}
      </div>
    </section>
  );
}

function last(snapshots: TrialRecord["snapshots"]) {
  return snapshots[snapshots.length - 1];
}

function GraphView({ trial }: { trial: TrialRecord }) {
  const snapshots = trial.snapshots;
  const final = last(snapshots);
  const W = 720;
  const H = 260;
  const pad = 36;
  const maxY = Math.max(final.freeNeutrons, 10);
  const xFor = (i: number) =>
    pad + (i / Math.max(snapshots.length - 1, 1)) * (W - pad * 2);
  const yFor = (v: number) => H - pad - (v / maxY) * (H - pad * 2);
  const points = snapshots
    .map((s, i) => `${xFor(i)},${yFor(s.freeNeutrons)}`)
    .join(" ");
  const reactionPoints = snapshots
    .map((s, i) => `${xFor(i)},${yFor(s.reactionEvents)}`)
    .join(" ");

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Graph of free neutrons and reactions over the trial steps"
        className="h-auto w-full"
      >
        {Array.from({ length: 5 }, (_, i) => {
          const v = Math.round((maxY / 4) * (4 - i));
          const y = yFor(v);
          return (
            <g key={v}>
              <line x1={pad} x2={W - pad} y1={y} y2={y} stroke="#2a333d" strokeDasharray="4 4" />
              <text x={pad - 6} y={y + 4} textAnchor="end" fill="#9aa7b4" fontSize="11">
                {v}
              </text>
            </g>
          );
        })}
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#9aa7b4" />
        <line x1={pad} x2={pad} y1={pad} y2={H - pad} stroke="#9aa7b4" />
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#9aa7b4" fontSize="12">
          Step
        </text>
        <text
          x={12}
          y={H / 2}
          textAnchor="middle"
          fill="#9aa7b4"
          fontSize="12"
          transform={`rotate(-90 12 ${H / 2})`}
        >
          Count
        </text>
        <polyline points={points} fill="none" stroke="#fbbf24" strokeWidth="2.5" />
        <polyline
          points={reactionPoints}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="2"
        />
        {final.freeNeutrons >= MAX_POPULATION && (
          <text x={W - pad} y={yFor(MAX_POPULATION) - 8} textAnchor="end" fill="#fbbf24" fontSize="12">
            safety ceiling (500)
          </text>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 bg-amber-400" /> Free
          neutrons
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 bg-teal-400" /> Reactions
        </span>
        <span>
          Final: {final.freeNeutrons} free neutrons, {final.reactionEvents}{" "}
          reactions
        </span>
      </figcaption>
    </figure>
  );
}

function EquationView({ trial }: { trial: TrialRecord }) {
  const final = last(trial.snapshots);
  const start = trial.parameters.startingNeutrons;
  return (
    <div className="text-sm leading-7">
      <p className="font-medium">The abstract balance (simplified):</p>
      <p className="mt-2 rounded-lg bg-surface-raised p-3 font-mono">
        free neutrons ≈ started + released − absorbed − escaped
      </p>
      <ul className="mt-3 list-inside list-disc text-muted">
        <li>Started: {start}</li>
        <li>Released by reactions: {final.reactionEvents}</li>
        <li>Absorbed by absorber: {final.absorbedNeutrons}</li>
        <li>Escaped: {final.escapedNeutrons}</li>
        <li>Final free neutrons: {final.freeNeutrons}</li>
        <li>Abstract energy units: {final.cumulativeEnergyUnits}</li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        This is a conceptual educational model with fictionalized values — not
        real physics equations.
      </p>
    </div>
  );
}

function CausalView({ trial }: { trial: TrialRecord }) {
  const final = last(trial.snapshots);
  const absorberPercent = Math.round(trial.parameters.absorberPosition * 100);
  return (
    <div className="text-sm leading-7">
      <p className="font-medium">How the controls connect to the outcome:</p>
      <svg
        viewBox="0 0 720 180"
        role="img"
        aria-label="Causal diagram: absorber affects free neutrons, density affects reactions, free neutrons drive the chain reaction"
        className="mt-2 h-auto w-full"
      >
        <g>
          <rect x="10" y="30" width="180" height="56" rx="8" fill="#0d9488" />
          <text x="100" y="54" textAnchor="middle" fill="#fff" fontSize="13">
            Absorber ({absorberPercent}%)
          </text>
          <text x="100" y="72" textAnchor="middle" fill="#ccfbf1" fontSize="11">
            absorbs free neutrons
          </text>
          <line x1="190" x2="250" y1="58" y2="58" stroke="#5eead4" strokeWidth="2" />
          <polygon points="250,52 262,58 250,64" fill="#5eead4" />
        </g>
        <g>
          <rect x="262" y="30" width="180" height="56" rx="8" fill="#1c222a" stroke="#2a333d" />
          <text x="352" y="54" textAnchor="middle" fill="#e7ecf1" fontSize="13">
            Free neutrons
          </text>
          <text x="352" y="72" textAnchor="middle" fill="#9aa7b4" fontSize="11">
            {final.freeNeutrons} at the end
          </text>
          <line x1="442" x2="502" y1="58" y2="58" stroke="#5eead4" strokeWidth="2" />
          <polygon points="502,52 514,58 502,64" fill="#5eead4" />
        </g>
        <g>
          <rect x="514" y="30" width="180" height="56" rx="8" fill="#134e4a" />
          <text x="604" y="54" textAnchor="middle" fill="#fff" fontSize="13">
            Chain reaction
          </text>
          <text x="604" y="72" textAnchor="middle" fill="#ccfbf1" fontSize="11">
            {final.reactionEvents} reactions
          </text>
        </g>
        <g>
          <rect x="262" y="130" width="180" height="40" rx="8" fill="#1c222a" stroke="#2a333d" />
          <text x="352" y="155" textAnchor="middle" fill="#e7ecf1" fontSize="13">
            Material density ({Math.round(trial.parameters.materialDensity * 100)}%)
          </text>
          <line x1="442" y1="150" x2="502" y2="74" stroke="#5eead4" strokeWidth="2" />
          <polygon points="502,68 512,78 496,80" fill="#5eead4" />
        </g>
      </svg>
      <p className="mt-2 text-muted">
        More absorber → fewer surviving neutrons → fewer reactions. Withdrawn
        absorber → more surviving neutrons → the reaction feeds itself.
      </p>
    </div>
  );
}

function PlainLanguageView({
  trial,
  stopReason,
  preferences,
  explanationStyle,
}: {
  trial: TrialRecord;
  stopReason: SimulationStopReason | null;
  preferences: LearnerPreferences;
  explanationStyle?: "visual_first" | "step_by_step" | "concise";
}) {
  const final = last(trial.snapshots);
  const p = trial.parameters;
  const outcome =
    stopReason === "max_population"
      ? "The population grew so fast it hit the safety ceiling of 500 free neutrons."
      : stopReason === "extinct"
        ? "The population ran out and the reaction stopped."
        : "The trial ran for its full duration.";
  const growthShape =
    final.freeNeutrons > p.startingNeutrons * 8
      ? "accelerating — it grew much faster than a steady climb"
      : final.freeNeutrons < p.startingNeutrons
        ? "declining — it shrank"
        : "roughly steady";
  const lowDensity = preferences.informationDensity === "low";
  const fullDensity = preferences.informationDensity === "full";

  // The saved explanation style shapes the plain-language copy (never the
  // science): step-by-step lists the causal chain, concise keeps one short
  // paragraph, visual-first points to the animation. Defaults match the
  // pre-account behavior.
  if (explanationStyle === "step_by_step") {
    return (
      <div className="flex flex-col gap-2 text-sm leading-7">
        <p>
          With {p.startingNeutrons} starting neutrons and the absorber{" "}
          {Math.round(p.absorberPosition * 100)}% inserted, the population was{" "}
          {growthShape}. {outcome}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>
            Starting neutrons{" "}
            {p.absorberPosition >= 0.5
              ? "mostly meet the absorber"
              : "mostly survive"}{" "}
            — {final.freeNeutrons} were free at the end.
          </li>
          <li>
            Each surviving neutron can cause a reaction: {final.reactionEvents}{" "}
            happened, releasing {final.cumulativeEnergyUnits} abstract energy
            units.
          </li>
          <li>
            Reactions release more neutrons, so a growing population feeds
            itself — which is why it can accelerate.
          </li>
        </ol>
      </div>
    );
  }

  const mechanism =
    lowDensity
      ? ""
      : " Withdrawing the absorber lets more neutrons survive, so more of them can cause reactions — and each reaction releases more neutrons, which is why the population can accelerate.";
  const extra =
    fullDensity && explanationStyle !== "concise"
      ? ` The ceiling stopped the count at ${MAX_POPULATION} free neutrons, so the exact timing after that is not shown.`
      : "";
  const visualNote =
    explanationStyle === "visual_first"
      ? " Watch the animation above and pause at the moment the count changes."
      : "";

  return (
    <p className="text-sm leading-7">
      With {p.startingNeutrons} starting neutrons and the absorber{" "}
      {Math.round(p.absorberPosition * 100)}% inserted, the population was{" "}
      {growthShape}. {outcome} There were {final.reactionEvents} reactions and{" "}
      {final.cumulativeEnergyUnits} abstract energy units.
      {mechanism}
      {extra}
      {visualNote}
    </p>
  );
}
