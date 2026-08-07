"use client";

import { useState, type FormEvent } from "react";

interface ClarificationCardProps {
  /** The single short question the learner must answer to proceed. */
  question: string;
  /** Called with the learner's answer; the parent resubmits the request. */
  onSubmit: (answer: string) => void;
  /** Abandon this path and return to the ask form. */
  onStartOver: () => void;
}

/**
 * One short clarifying question + an answer input. The learner's answer is
 * appended to the original request on resubmit.
 */
export function ClarificationCard({
  question,
  onSubmit,
  onStartOver,
}: ClarificationCardProps) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) {
      setError("Add a short answer so I can narrow this down.");
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-left backdrop-blur-md">
      <h3 className="text-lg font-semibold tracking-tight text-white">
        One detail to narrow it down
      </h3>
      <p className="mt-2 text-base leading-7 text-gray-300">{question}</p>

      <form onSubmit={handleSubmit} className="mt-5">
        <label
          htmlFor="clarification-answer"
          className="block text-sm font-medium text-gray-200"
        >
          Your answer
        </label>
        <input
          id="clarification-answer"
          type="text"
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. Mercury around the Sun"
          aria-describedby={error ? "clarification-error" : undefined}
          className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-base text-white backdrop-blur-md transition-colors placeholder:text-gray-400 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/25"
        />
        {error ? (
          <p
            id="clarification-error"
            role="status"
            className="mt-2 text-sm text-amber-300/90"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-xl px-4 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
          >
            Start over
          </button>
        </div>
      </form>
    </div>
  );
}
