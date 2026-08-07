"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Staged progress for an in-flight demonstration request.
 *
 * Stages are driven ONLY by real elapsed time since `startedAt` — there are
 * no fake timers and no fabricated completion. The bar is capped below 100%
 * while the request is pending, and the parent unmounts this component the
 * moment the request settles. The current stage is announced politely via a
 * live region whose text only changes when the stage actually changes.
 */

/** The canonical generation stages for a single demonstration request. */
export const DEMO_GENERATION_STAGES: readonly string[] = [
  "Choosing a demonstration type…",
  "Building the scene…",
  "Checking controls…",
  "Validating scientific boundaries…",
  "Preparing your prediction…",
];

/** Real elapsed ms a stage must be active before the next stage appears. */
const STAGE_MS = 1000;

/** The bar never claims completion while the request is still pending. */
const MAX_PENDING_PERCENT = 90;

interface GenerationProgressProps {
  /** Wall-clock start of the pending request (Date.now()). */
  startedAt: number;
  /** Stage labels in order; defaults to the five canonical stages. */
  stages?: readonly string[];
}

export function GenerationProgress({
  startedAt,
  stages = DEMO_GENERATION_STAGES,
}: GenerationProgressProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - startedAt));
    tick();
    const intervalId = window.setInterval(tick, 300);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  const activeIndex = Math.min(
    stages.length - 1,
    Math.floor(elapsedMs / STAGE_MS),
  );
  const percent = Math.min(
    MAX_PENDING_PERCENT,
    Math.round(((activeIndex + 1) / stages.length) * 100),
  );

  return (
    <div
      aria-busy="true"
      className="rounded-2xl border border-white/15 bg-white/5 p-5 text-left backdrop-blur-md"
    >
      <p className="text-sm font-semibold text-white">
        Building your demonstration
      </p>
      <p aria-hidden="true" className="mt-1 text-xs text-gray-400">
        {percent}% — stages advance as your request is processed
      </p>
      <Progress
        value={percent}
        aria-label="Demonstration generation progress"
        className="mt-3"
      />
      <ol className="mt-5 space-y-2.5">
        {stages.map((stage, index) => {
          const isActive = index === activeIndex;
          const isDone = index < activeIndex;
          return (
            <li
              key={stage}
              aria-current={isActive ? "step" : undefined}
              className="flex items-center gap-2.5 text-sm"
            >
              {isActive ? (
                <Loader2Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin text-teal-300"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
                    isDone
                      ? "border-teal-400/60 bg-teal-400/15 text-teal-300"
                      : "border-white/15 bg-white/5 text-transparent",
                  )}
                >
                  ✓
                </span>
              )}
              <span
                className={cn(
                  isActive || isDone ? "text-white" : "text-gray-400",
                )}
              >
                {stage}
              </span>
            </li>
          );
        })}
      </ol>
      {/* Polite announcement; the text only changes when the stage changes. */}
      <p role="status" className="sr-only">
        {stages[activeIndex]} — in progress
      </p>
    </div>
  );
}
