"use client";

import { useEffect, useMemo, useState } from "react";
import type { TrialRecord, SimulationStopReason } from "@/domain/experiments";
import type { LearnerPreferences } from "@/domain/learner";
import { createSeededRandom } from "@/simulation/nuclear-chain-reaction";

interface Props {
  trial: TrialRecord | null;
  stopReason: SimulationStopReason | null;
  preferences: LearnerPreferences;
}

/** Display cap for rendered neutrons; the rest is shown as a counter. */
const MAX_RENDERED_NEUTRONS = 120;

const VIEW_W = 800;
const VIEW_H = 480;
const ABSORBER_X = VIEW_W - 70;

/**
 * Interactive animation of the seeded trial. Playback is controlled locally;
 * the canvas never starts playing on mount. In reduced-motion mode the step
 * state is rendered statically (no motion, no pulses).
 */
export function SimulationCanvas({ trial, stopReason, preferences }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Only meaningful transitions are announced to assistive technology —
  // per-frame counter updates must never spam the live region.
  const [liveMessage, setLiveMessage] = useState<string | null>(null);

  const snapshots = trial?.snapshots ?? [];
  const lastIndex = snapshots.length - 1;

  const frameDelay = useMemo(() => {
    const base = preferences.reducedMotion ? 1100 : 900;
    const speed = Math.min(Math.max(preferences.animationSpeed, 0.25), 2);
    return Math.min(Math.max(base / speed, 60), 3000);
  }, [preferences.animationSpeed, preferences.reducedMotion]);

  useEffect(() => {
    if (!playing || snapshots.length === 0) return;
    const timer = window.setInterval(() => {
      setCurrentStep((previous) => {
        if (previous >= lastIndex) {
          // Final frame: stop playback and announce completion once. Both
          // updates are idempotent, so StrictMode double-invocation is safe.
          setPlaying(false);
          setLiveMessage("Animation reached the end");
          return previous;
        }
        return previous + 1;
      });
    }, frameDelay);
    return () => window.clearInterval(timer);
  }, [playing, frameDelay, lastIndex, snapshots.length]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      setLiveMessage("Animation paused");
    } else {
      setPlaying(true);
      setLiveMessage("Animation started");
    }
  };

  if (!trial || snapshots.length === 0) {
    return (
      <section
        aria-label="Simulation animation"
        className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-border bg-surface p-6 text-center"
      >
        <p className="text-lg font-medium">Run a trial to see the animation</p>
        <p className="mt-2 text-sm text-muted">
          Submit a prediction, adjust the variables, and press “Run trial”.
        </p>
      </section>
    );
  }

  const snapshot = snapshots[Math.min(currentStep, lastIndex)];
  const previous = snapshots[currentStep - 1] ?? null;
  const reactionDelta = previous
    ? snapshot.reactionEvents - previous.reactionEvents
    : snapshot.reactionEvents;
  const stepCount = snapshots.length - 1;

  const stopLabel =
    stopReason === "max_population"
      ? "The simulation stopped at the safety ceiling: 500 free neutrons."
      : stopReason === "extinct"
        ? "The population reached zero — no neutrons left to react."
        : stopReason === "completed"
          ? "The trial ran for the full duration."
          : "";

  return (
    <section
      aria-label="Simulation animation"
      className="rounded-xl border border-border bg-surface p-4"
      data-reduced-motion={String(preferences.reducedMotion)}
      data-step={currentStep}
    >
      {stopLabel && (
        <p
          role="status"
          className="mb-3 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm text-info"
        >
          {stopLabel}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={`Neutron population at step ${snapshot.step}`}
            className="h-auto w-full rounded-lg border border-border bg-[#0b0f13]"
          >
            <NeutronField
              free={snapshot.freeNeutrons}
              step={snapshot.step}
              absorberPosition={trial.parameters.absorberPosition}
              reactionDelta={reactionDelta}
              reducedMotion={preferences.reducedMotion}
            />
            <text
              x={VIEW_W / 2}
              y={VIEW_H - 12}
              textAnchor="middle"
              className="fill-[#9aa7b4]"
              fontSize="14"
            >
              Step {snapshot.step} of {stepCount}
            </text>
          </svg>
        </div>

        <div className="flex flex-col justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause animation" : "Play animation"}
              className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCurrentStep((s) => Math.max(0, s - 1));
              }}
              disabled={currentStep === 0}
              aria-label="Step backward"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-40"
            >
              ‹ Step
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCurrentStep((s) => Math.min(lastIndex, s + 1));
              }}
              disabled={currentStep >= lastIndex}
              aria-label="Step forward"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-40"
            >
              Step ›
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setCurrentStep(0);
              }}
              disabled={currentStep === 0}
              aria-label="Reset animation to the start"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised disabled:opacity-40"
            >
              Reset
            </button>
          </div>

          <div className="rounded-lg border border-border bg-surface-raised p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Legend
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs">
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400"
                />
                Free neutron
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full border-2 border-teal-400"
                />
                Absorbed by absorber
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-zinc-400"
                />
                Escaped
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-300"
                />
                Reaction event
              </li>
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-2 rounded-sm bg-teal-600"
                />
                Absorber (more inserted = taller)
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p
        aria-hidden="true"
        className="mt-3 rounded-lg bg-surface-raised px-3 py-2 text-sm leading-6"
      >
        <span className="font-semibold">State summary:</span> step{" "}
        {snapshot.step} of {stepCount}. Free neutrons: {snapshot.freeNeutrons}
        {snapshot.freeNeutrons > MAX_RENDERED_NEUTRONS
          ? ` (${snapshot.freeNeutrons - MAX_RENDERED_NEUTRONS} not shown)`
          : ""}
        . Reactions: {snapshot.reactionEvents}. Absorbed:{" "}
        {snapshot.absorbedNeutrons}. Escaped: {snapshot.escapedNeutrons}.
        Energy units: {snapshot.cumulativeEnergyUnits}.
      </p>
      {liveMessage && (
        <p role="status" className="sr-only">
          {liveMessage}
        </p>
      )}
    </section>
  );
}

function NeutronField({
  free,
  step,
  absorberPosition,
  reactionDelta,
  reducedMotion,
}: {
  free: number;
  step: number;
  absorberPosition: number;
  reactionDelta: number;
  reducedMotion: boolean;
}) {
  const shown = Math.min(free, MAX_RENDERED_NEUTRONS);
  const rand = createSeededRandom(step * 1000 + 7);
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < shown; i += 1) {
    points.push({
      x: 30 + rand() * (ABSORBER_X - 90),
      y: 30 + rand() * (VIEW_H - 110),
    });
  }

  const absorberTop = VIEW_H - 40 - absorberPosition * (VIEW_H - 90);
  const ringRand = createSeededRandom(step * 7919 + 13);
  const ringCount = Math.min(reactionDelta, 12);
  const rings = Array.from({ length: ringCount }, () => ({
    x: 60 + ringRand() * (ABSORBER_X - 120),
    y: 40 + ringRand() * (VIEW_H - 140),
  }));

  return (
    <g>
      {points.map((p, i) => (
        <circle
          key={`${step}-${i}`}
          cx={p.x}
          cy={p.y}
          r={4}
          fill="#fbbf24"
          stroke="#78350f"
          strokeWidth="1"
        />
      ))}
      {free > MAX_RENDERED_NEUTRONS && (
        <text
          x={30}
          y={30}
          fill="#fbbf24"
          fontSize="14"
          className="font-mono"
        >
          +{free - MAX_RENDERED_NEUTRONS} more
        </text>
      )}
      <rect
        x={ABSORBER_X}
        y={absorberTop}
        width="16"
        height={VIEW_H - 40 - absorberTop}
        rx="3"
        fill="#0d9488"
        aria-label={`Absorber ${Math.round(absorberPosition * 100)}% inserted`}
      >
        <title>{`Absorber ${Math.round(absorberPosition * 100)}% inserted`}</title>
      </rect>
      <text
        x={ABSORBER_X + 8}
        y={VIEW_H - 24}
        textAnchor="middle"
        fill="#5eead4"
        fontSize="12"
      >
        absorber
      </text>
      {rings.map((ring, i) => (
        <circle
          key={`ring-${step}-${i}`}
          cx={ring.x}
          cy={ring.y}
          r={6}
          fill="none"
          stroke="#fcd34d"
          strokeWidth="2"
          className={reducedMotion ? undefined : "lab-pulse"}
        />
      ))}
      {reducedMotion &&
        rings.map((ring, i) => (
          <text
            key={`rx-${step}-${i}`}
            x={ring.x}
            y={ring.y - 8}
            textAnchor="middle"
            fill="#fcd34d"
            fontSize="11"
          >
            !
          </text>
        ))}
    </g>
  );
}