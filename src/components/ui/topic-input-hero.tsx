"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MiniNavbar } from "@/components/ui/mini-navbar";
import { routeTopic, type TopicRoute } from "@/lib/topic-routing";

const HeroWaveBackground = dynamic(
  () =>
    import("@/components/ui/hero-wave-background").then(
      (m) => m.HeroWaveBackground,
    ),
  { ssr: false },
);

const PLACEHOLDER_PHRASES: readonly string[] = [
  "nuclear chain reactions",
  "why chain reactions speed up",
  "how absorbers affect a reaction",
  "nonlinear growth in nuclear systems",
];

const STATIC_PLACEHOLDER = "Describe a topic — for example, nuclear chain reactions";

const SUGGESTIONS: readonly string[] = [
  "Nuclear chain reactions",
  "Why reactions accelerate",
  "How absorbers change reactions",
];

const TYPE_DELAY_MS = 60;
const HOLD_DELAY_MS = 2600;
const DELETE_DELAY_MS = 30;
const PAUSE_DELAY_MS = 900;

const PREFERENCES_KEY = "unseenlab.preferences.v1";

type AnimPhase = "typing" | "holding" | "deleting" | "paused";

/**
 * Read the effective reduced-motion preference (OS setting OR in-app
 * preference). Safe to call during render on client and server: anything
 * unreadable is treated as "motion allowed".
 */
function readReducedMotion(): boolean {
  try {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return true;
    }
    const stored = window.localStorage.getItem(PREFERENCES_KEY);
    if (!stored) return false;
    const prefs = JSON.parse(stored) as { reducedMotion?: unknown };
    return prefs?.reducedMotion === true;
  } catch {
    return false;
  }
}

/** Subscribe to OS reduced-motion changes and in-app preference changes. */
function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const mediaQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  mediaQuery?.addEventListener("change", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    mediaQuery?.removeEventListener("change", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/** Client-only gate (never true during SSR / hydration). */
function subscribeNoop(): () => void {
  return () => {};
}
function isClientSnapshot(): boolean {
  return true;
}
function isServerSnapshot(): boolean {
  return false;
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function TopicInputHero() {
  const isMounted = useSyncExternalStore(
    subscribeNoop,
    isClientSnapshot,
    isServerSnapshot,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    () => false,
  );
  const [value, setValue] = useState("");
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState(
    STATIC_PLACEHOLDER,
  );
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TopicRoute | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // The placeholder animation only runs when it cannot be mistaken for input.
  const animating = !reducedMotion && !focused && value.length === 0;

  useEffect(() => {
    if (!animating) return;

    const timers: number[] = [];
    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.length = 0;
    };

    const schedule = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        const index = timers.indexOf(id);
        if (index !== -1) timers.splice(index, 1);
        fn();
      }, delay);
      timers.push(id);
    };

    const state = { phrase: 0, char: 0, phase: "typing" as AnimPhase };

    const step = () => {
      const phrase = PLACEHOLDER_PHRASES[state.phrase];
      if (!phrase) return;
      if (state.phase === "typing") {
        state.char += 1;
        setAnimatedPlaceholder(phrase.slice(0, state.char));
        if (state.char >= phrase.length) {
          state.phase = "holding";
          schedule(step, HOLD_DELAY_MS);
        } else {
          schedule(step, TYPE_DELAY_MS);
        }
      } else if (state.phase === "holding") {
        state.phase = "deleting";
        schedule(step, DELETE_DELAY_MS);
      } else if (state.phase === "deleting") {
        state.char -= 1;
        setAnimatedPlaceholder(phrase.slice(0, state.char));
        if (state.char <= 0) {
          state.phase = "paused";
          schedule(step, PAUSE_DELAY_MS);
        } else {
          schedule(step, DELETE_DELAY_MS);
        }
      } else {
        state.phrase = (state.phrase + 1) % PLACEHOLDER_PHRASES.length;
        state.phase = "typing";
        schedule(step, TYPE_DELAY_MS);
      }
    };

    schedule(step, TYPE_DELAY_MS);

    return clearTimers;
  }, [animating]);

  useEffect(() => {
    if (!result) return;
    const id = window.requestAnimationFrame(() => {
      resultHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [result]);

  const submitTopic = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a topic or choose one of the examples.");
      setResult(null);
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    setResult(routeTopic(trimmed));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitTopic();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitTopic();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    if (result || error) {
      setResult(null);
      setError(null);
    }
  };

  const handleChipClick = (chip: string) => {
    setValue(chip);
    setResult(null);
    setError(null);
    textareaRef.current?.focus();
  };

  const handleEditTopic = () => {
    setResult(null);
    setError(null);
    textareaRef.current?.focus();
  };

  return (
    <section
      aria-label="Find a learning path"
      className="relative flex min-h-[100svh] flex-col overflow-hidden bg-[#070b14] text-white"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {isMounted ? <HeroWaveBackground /> : null}
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <MiniNavbar />

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            What topic do you need help with?
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-300/90 sm:text-lg">
            Describe the idea that feels unclear. We’ll guide you to the closest interactive learning experience.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-xl">
            <label htmlFor="topic-input" className="sr-only">
              Describe the topic you need help with
            </label>
            <textarea
              id="topic-input"
              ref={textareaRef}
              rows={3}
              maxLength={180}
              value={value}
              placeholder={
                animating ? animatedPlaceholder : STATIC_PLACEHOLDER
              }
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-base text-white backdrop-blur-md transition-colors placeholder:text-gray-500 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/25 sm:text-lg"
            />

            <div className="mt-2 flex min-h-[1.375rem] items-start justify-between gap-3">
              {error ? (
                <p role="status" className="text-left text-sm text-amber-300/90">
                  {error}
                </p>
              ) : null}
              {value.length > 140 ? (
                <p id="topic-char-count" className="ml-auto text-right text-sm text-gray-400/90">
                  {value.length}/180
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-center">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3.5 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                Find my learning path
                <ArrowRightIcon />
              </button>
            </div>
          </form>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleChipClick(chip)}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
              >
                {chip}
              </button>
            ))}
          </div>

          <div aria-live="polite" className="w-full">
            {result && result.status === "supported" ? (
              <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-white/15 bg-white/5 p-5 text-left backdrop-blur-md">
                <h2
                  ref={resultHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-tight text-white"
                >
                  We found an interactive lab for this topic.
                </h2>
                <p className="mt-2 text-lg font-semibold text-white">{result.labTitle}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/lab/nuclear-chain-reaction?topic=${encodeURIComponent(result.normalizedTopic)}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
                  >
                    Start this lab
                    <ArrowRightIcon />
                  </Link>
                  <button
                    type="button"
                    onClick={handleEditTopic}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
                  >
                    Edit my topic
                  </button>
                </div>
              </div>
            ) : result && result.status === "unsupported" ? (
              <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-l-2 border-white/15 border-l-amber-300/70 bg-white/5 p-5 text-left backdrop-blur-md">
                <h2
                  ref={resultHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-tight text-white"
                >
                  That topic is not available as an interactive lab yet.
                </h2>
                <p className="mt-2 text-gray-300">
                  The Nuclear Chain Reaction lab is currently ready.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href="/lab/nuclear-chain-reaction"
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
                  >
                    Try Nuclear Chain Reaction
                    <ArrowRightIcon />
                  </Link>
                  <button
                    type="button"
                    onClick={handleEditTopic}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
                  >
                    Edit my topic
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
