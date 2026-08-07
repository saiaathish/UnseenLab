"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
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

const PENDING_STAGES: readonly string[] = [
  "Understanding your request…",
  "Building your demonstration…",
  ...DEMO_GENERATION_STAGES,
];

const HERO_EXAMPLES: readonly string[] = [
  "Nuclear chain reactions",
  "Why reactions accelerate",
  "How absorbers change reactions",
];

const RECOVERY_EXAMPLES: readonly string[] = [
  "Show why planets stay in orbit.",
  "What does Newton's second law say about force and mass?",
  "How does air resistance change a projectile's flight?",
  "How does photosynthesis transfer energy?",
  "What makes a pendulum swing faster?",
  "Why do ripples cancel each other out?",
];

const PLACEHOLDER_PHRASES: readonly string[] = [
  "second law of newton",
  "why planets stay in orbit",
  "how photosynthesis transfers energy",
  "why ripples cancel each other out",
];
const STATIC_PLACEHOLDER = "Describe a STEM idea that feels unclear";
const TYPE_DELAY_MS = 55;
const HOLD_DELAY_MS = 1200;
const DELETE_DELAY_MS = 30;
const PAUSE_DELAY_MS = 450;

const UNSAFE_DEFAULT_MESSAGE =
  "That request is outside what I can help with.";
const UNSUPPORTED_DEFAULT_MESSAGE =
  "I don’t have a demonstration for that topic yet.";
const OFFLINE_FAILURE_MESSAGE =
  "We couldn’t build a demonstration right now. Check your connection and try again.";

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

interface AskDemoFormProps {
  ctaLabel?: string;
}

function readPreferences() {
  return loadLocalSession().preferences;
}

function reducedMotionRequested(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const osReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const attributeReduced =
      document.documentElement.getAttribute("data-reduced-motion") === "true";
    const raw = window.localStorage.getItem("unseenlab.preferences.v1");
    const inAppReduced = raw
      ? (JSON.parse(raw) as { reducedMotion?: unknown }).reducedMotion === true
      : false;
    return osReduced || attributeReduced || inAppReduced;
  } catch {
    return false;
  }
}

export function AskDemoForm({
  ctaLabel = "Generate demonstration",
}: AskDemoFormProps = {}) {
  const [value, setValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [focused, setFocused] = useState(false);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState(
    STATIC_PLACEHOLDER,
  );

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousPhaseRef = useRef<Phase>(phase);
  const phasePanelRef = useRef<HTMLDivElement | null>(null);

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

  const shouldAnimatePlaceholder =
    phase.kind === "idle" &&
    !focused &&
    value.length === 0 &&
    !reducedMotionRequested();

  // Recovered from the original hero: a typewriter placeholder that only
  // runs while the field is empty/unfocused. All state changes occur from
  // timer callbacks, so the effect remains a pure external subscription.
  useEffect(() => {
    if (!shouldAnimatePlaceholder) return;

    let cancelled = false;
    let timer: number | undefined;
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const schedule = (delay: number) => {
      timer = window.setTimeout(step, delay);
    };

    const step = () => {
      if (cancelled) return;
      const phrase = PLACEHOLDER_PHRASES[phraseIndex] ?? STATIC_PLACEHOLDER;

      if (!deleting) {
        charIndex += 1;
        setAnimatedPlaceholder(phrase.slice(0, charIndex));
        if (charIndex >= phrase.length) {
          deleting = true;
          schedule(HOLD_DELAY_MS);
        } else {
          schedule(TYPE_DELAY_MS);
        }
        return;
      }

      charIndex -= 1;
      setAnimatedPlaceholder(phrase.slice(0, Math.max(0, charIndex)));
      if (charIndex <= 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % PLACEHOLDER_PHRASES.length;
        schedule(PAUSE_DELAY_MS);
      } else {
        schedule(DELETE_DELAY_MS);
      }
    };

    schedule(TYPE_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [shouldAnimatePlaceholder]);

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
        question: result.question || "Could you add a little more detail?",
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
      setValidationError("Enter a topic or choose one of the examples.");
      inputRef.current?.focus();
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

      if (!response.ok || body === null) {
        runOffline(query);
        return;
      }

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

      runOffline(query);
    } catch {
      runOffline(query);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitQuery(value);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    if (validationError) setValidationError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submitQuery(value);
    }
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
            <label htmlFor="ask-demo-topic" className="sr-only">
              What topic do you need help with?
            </label>
            <textarea
              id="ask-demo-topic"
              ref={inputRef}
              rows={3}
              maxLength={500}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                shouldAnimatePlaceholder
                  ? animatedPlaceholder
                  : STATIC_PLACEHOLDER
              }
              aria-describedby={
                validationError ? "ask-demo-validation" : undefined
              }
              className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-base text-white shadow-[0_18px_70px_rgba(0,0,0,0.16)] backdrop-blur-md transition-colors placeholder:text-gray-400 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/25 sm:text-lg"
            />
            {validationError ? (
              <p
                id="ask-demo-validation"
                role="status"
                className="mt-2 text-center text-sm text-amber-300/90"
              >
                {validationError}
              </p>
            ) : null}
            <div className="mt-5 flex justify-center">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3.5 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                {ctaLabel}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {HERO_EXAMPLES.map((example) => (
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
            suggestions={RECOVERY_EXAMPLES}
            onRetry={() => void submitQuery(phase.query)}
            onTryExample={(example) => void submitQuery(example)}
          />
        </div>
      ) : null}
    </div>
  );
}

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
        Describe the idea that feels unclear. We’ll guide you to the closest
        interactive learning experience.
      </p>
      <div className="mt-8 w-full max-w-xl text-left">
        <AskDemoForm />
      </div>
    </section>
  );
}
