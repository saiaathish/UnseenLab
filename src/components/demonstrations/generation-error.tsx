"use client";

export type GenerationErrorKind = "unsafe" | "unsupported" | "network";

interface GenerationErrorProps {
  /** Which honest rejection surface to show. */
  kind: GenerationErrorKind;
  /** The safe, learner-facing message (never raw model output). */
  message: string;
  /** Example requests the learner can try instead. */
  suggestions: readonly string[];
  /** Re-submits the previous request. */
  onRetry: () => void;
  /** Submits one of the suggestion chips directly. */
  onTryExample: (example: string) => void;
}

const ERROR_HEADINGS: Record<GenerationErrorKind, string> = {
  unsafe: "I can’t help with that request",
  unsupported: "Not currently supported",
  network: "We couldn’t generate a demonstration",
};

/**
 * Safe error surfaces for unsafe / unsupported / network-failure outcomes.
 * Every message shown here is vetted copy — learner text and model output are
 * never echoed back.
 */
export function GenerationError({
  kind,
  message,
  suggestions,
  onRetry,
  onTryExample,
}: GenerationErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-l-2 border-white/15 border-l-amber-300/70 bg-white/5 p-6 text-left backdrop-blur-md"
    >
      <h3 className="text-lg font-semibold tracking-tight text-white">
        {ERROR_HEADINGS[kind]}
      </h3>
      <p className="mt-2 text-base leading-7 text-gray-300">{message}</p>

      <p className="mt-4 text-sm font-medium text-gray-200">
        You could try one of these instead:
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => onTryExample(example)}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-6 py-3 font-semibold text-[#070b14] transition-colors hover:bg-teal-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
