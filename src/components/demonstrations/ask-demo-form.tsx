"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { DemoSource } from "@/demonstrations/state/demo-store";
import {
  generateOfflineDemo,
  type OfflineDemoResult,
} from "@/demonstrations/generation/offline/generator";
import { loadLocalSession } from "@/storage/session-storage";
import { ClarificationCard } from "./clarification-card";
import { DemoSummaryCard } from "./demo-summary-card";
import {
  DEMO_GENERATION_STAGES,
  GenerationProgress,
} from "./generation-progress";
import { GenerationError, type GenerationErrorKind } from "./generation-error";

/**
 * Ask-to-Demonstration flow (flag-gated by the homepage).
 *
 * Submits the learner's request to POST /api/demonstrations/generate and maps
 * every outcome to a safe surface:
 *   spec        → demo summary card (hand-off via demoStore + router.push)
 *   clarify     → one short question; the answer is appended on resubmit
 *   unsafe      → safe rejection, no spec
 *   unsupported → "Not currently supported" + suggestions
 *   network/HTTP failure → client-side offline fallback via the deterministic
 *                          offline catalog; if that also fails, an honest error.
 */

/** The ask flow prepends its own stages to the canonical generation stages. */
const PENDING_STAGES: readonly string[] = [
  "Understanding your request…",
  "Building your demonstration…",
  ...DEMO_GENERATION_STAGES,
];

const EXAMPLES: readonly string[] = [
  "Show why planets stay in orbit.",
  "What does Newton's second law say about force and mass?",
  "How does air resistance change a projectile's flight?",
  "How does photosynthesis transfer energy?",
  "What makes a pendulum swing faster?",
  "Why do ripples cancel each other out?",
];

const UNSAFE_DEFAULT_MESSAGE =
  "That request is outside what I can help with.";
const UNSUPPORTED_DEFAULT_MESSAGE =
  "I don’t have a demonstration for that topic yet.";
const OFFLINE_FAILURE_MESSAGE =
  "We couldn’t build a demonstration right now. Check your connection and try again.";

/** Response envelope of POST /api/demonstrations/generate (success shape). */
interface GenerateApiData {
  outcome?: "spec" | "clarify" | "unsafe" | "unsupported";
  spec?: DemoSpecV1;
  question?: string;
  reason?: string;
  source?: string;
}

interface GenerateApiResponse {
  data?: GenerateApiData;
  fallback?: boolean;
  reason?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "pending"; startedAt: number; query: string }
  | { kind: "clarify"; question: string; query: string }
  | {
      kind: "spec";
      spec: DemoSpecV1;
      source: DemoSource;
      generatedAt: string;
    }
  | { kind: "error"; errorKind: GenerationErrorKind; message: string; query: string };

function readPreferences() {
  return loadLocalSession().preferences;
}

export function AskDemoForm() {
  const [value, setValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousPhaseRef = useRef<Phase>(phase);
  // The phase panels swap the form away on advance; focus the panel so
  // keyboard users land on the new content instead of <body>.
  const phasePanelRef = useRef<HTMLDivElement | null>(null);

  // Returning to the ask form (e.g. "Start over") moves focus back to the
  // input so keyboard users don't lose their place.
  useEffect(() => {
    const previous = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    if (phase.kind === "idle" && previous.kind !== "idle") {
      inputRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase.kind !== "idle") {
      phasePanelRef.current?.focus();
    }
  }, [phase.kind]);

  const runOffline = (query: string) => {
    let result: OfflineDemoResult;
    try {
      result = generateOfflineDemo(query, readPreferences());
    } catch {
      setPhase({
        kind: "error",
        errorKind: "network",
        message: OFFLINE_FAILURE_MESSAGE,
        query,
      });
      return;
    }

    if (result.status === "spec" && result.spec) {
      setPhase({
        kind: "spec",
        spec: result.spec,
        source: "offline",
        generatedAt: result.spec.provenance.generatedAt,
      });
    } else if (result.status === "clarify") {
      setPhase({
        kind: "clarify",
        question:
          result.question || "Could you add a little more detail?",
        query,
      });
    } else if (result.status === "unsafe") {
      setPhase({
        kind: "error",
        errorKind: "unsafe",
        message: result.reason || UNSAFE_DEFAULT_MESSAGE,
        query,
      });
    } else {
      setPhase({
        kind: "error",
        errorKind: "unsupported",
        message: result.reason || UNSUPPORTED_DEFAULT_MESSAGE,
        query,
      });
    }
  };

  const submitQuery = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      setValidationError("Enter a topic or choose an example.");
      return;
    }
    setValidationError(null);
    setPhase({ kind: "pending", startedAt: Date.now(), query });

    try {
      const preferences = readPreferences();
      const response = await fetch("/api/demonstrations/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, preferences }),
      });

      let body: GenerateApiResponse | null = null;
      try {
        body = (await response.json()) as GenerateApiResponse;
      } catch {
        body = null;
      }

      // HTTP failure or an unparseable body → offline fallback.
      if (!response.ok || body === null) {
        runOffline(query);
        return;
      }

      // Server-side model + offline both failed (defensive envelope).
      if (body.fallback === true) {
        setPhase({
          kind: "error",
          errorKind: "network",
          message:
            body.reason ||
            "The demonstration service couldn’t finish right now. Please try again.",
          query,
        });
        return;
      }

      const data = body.data;
      if (data?.outcome === "spec" && data.spec) {
        setPhase({
          kind: "spec",
          spec: data.spec,
          source: data.source === "offline" ? "offline" : "model",
          generatedAt: data.spec.provenance?.generatedAt ?? new Date().toISOString(),
        });
        return;
      }
      if (data?.outcome === "clarify" && data.question) {
        setPhase({ kind: "clarify", question: data.question, query });
        return;
      }
      if (data?.outcome === "unsafe") {
        setPhase({
          kind: "error",
          errorKind: "unsafe",
          message: data.reason || UNSAFE_DEFAULT_MESSAGE,
          query,
        });
        return;
      }
      if (data?.outcome === "unsupported") {
        setPhase({
          kind: "error",
          errorKind: "unsupported",
          message: data.reason || UNSUPPORTED_DEFAULT_MESSAGE,
          query,
        });
        return;
      }

      // Unknown response shape — treat as a service failure.
      runOffline(query);
    } catch {
      runOffline(query);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitQuery(value);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    if (validationError) setValidationError(null);
  };

  const handleExampleClick = (example: string) => {
    setValue(example);
    setValidationError(null);
    inputRef.current?.focus();
  };

  const startOver = () => {
    setPhase({ kind: "idle" });
    setValidationError(null);
  };

  const statusText =
    phase.kind === "pending"
      ? "Generating your demonstration"
      : phase.kind === "spec"
        ? "Your demonstration is ready"
        : phase.kind === "clarify"
          ? "One more detail needed"
          : phase.kind === "error"
            ? "There was a problem with your request"
            : null;

  return (
    <div>
      {statusText ? (
        <p role="status" className="sr-only">
          {statusText}
        </p>
      ) : null}

      {phase.kind === "idle" ? (
        <>
          <form onSubmit={handleSubmit} className="w-full">
            <label
              htmlFor="ask-demo-topic"
              className="block text-base font-medium text-gray-100"
            >
              What topic do you need help with?
            </label>
            <input
              id="ask-demo-topic"
              ref={inputRef}
              type="text"
              maxLength={500}
              value={value}
              onChange={handleChange}
              placeholder="For example: Show why planets stay in orbit."
              aria-describedby={
                validationError ? "ask-demo-validation" : undefined
              }
              className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-base text-white backdrop-blur-md transition-colors placeholder:text-gray-400 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/25"
            />
            {validationError ? (
              <p
                id="ask-demo-validation"
                role="status"
                className="mt-2 text-sm text-amber-300/90"
              >
                {validationError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-start">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                Generate demonstration
              </button>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-sm font-medium text-gray-200">
              Or try an example:
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => handleExampleClick(example)}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {phase.kind === "pending" ? (
        <div ref={phasePanelRef} tabIndex={-1} className="mt-6">
          <p className="text-sm text-gray-400">
            Building a demonstration for{" "}
            <span className="font-medium text-white">“{phase.query}”</span>
          </p>
          <div className="mt-4">
            <GenerationProgress
              startedAt={phase.startedAt}
              stages={PENDING_STAGES}
            />
          </div>
        </div>
      ) : null}

      {phase.kind === "clarify" ? (
        <div ref={phasePanelRef} tabIndex={-1} className="mt-6">
          <ClarificationCard
            question={phase.question}
            onSubmit={(answer) => void submitQuery(`${phase.query} ${answer}`)}
            onStartOver={startOver}
          />
        </div>
      ) : null}

      {phase.kind === "spec" ? (
        <div ref={phasePanelRef} tabIndex={-1} className="mt-6">
          <DemoSummaryCard
            spec={phase.spec}
            source={phase.source}
            generatedAt={phase.generatedAt}
            onStartOver={startOver}
          />
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div ref={phasePanelRef} tabIndex={-1} className="mt-6">
          <GenerationError
            kind={phase.errorKind}
            message={phase.message}
            suggestions={EXAMPLES}
            onRetry={() => void submitQuery(phase.query)}
            onTryExample={(example) => void submitQuery(example)}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The homepage hero that hosts the ask-demo form — the single entrance to the
 * generative pipeline. Rendered only when isGenerativeDemosEnabled() is true
 * (see src/app/page.tsx).
 */
export function AskDemoSection() {
  return (
    <section
      id="ask-for-demonstration"
      aria-labelledby="ask-for-demonstration-heading"
      className="relative flex min-h-[70svh] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center"
    >
      <h1
        id="ask-for-demonstration-heading"
        className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl"
      >
        Ask for a demonstration
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
        Type any STEM concept — like “What does Newton’s second law say?” — and
        we’ll build an interactive learning experience you can enter, step by
        step.
      </p>
      <div className="mt-8 w-full max-w-2xl text-left">
        <AskDemoForm />
      </div>
    </section>
  );
}
