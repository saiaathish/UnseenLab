"use client";

import type { ObservationPrompt } from "@/demonstrations/spec/demo-spec";

interface Props {
  prompts: ObservationPrompt[];
  selections: Record<string, boolean>;
  notes: string;
  onToggle: (prompt: string, checked: boolean) => void;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  /** Becomes true right after a successful save (honest confirmation). */
  savedNotice: boolean;
}

/**
 * Observation prompts with checkboxes and free notes. Saving records an
 * observation entry to the trial log with a snapshot of the current
 * parameters and readouts, plus the confirmation is shown inline.
 */
export function DemonstrationObservationPanel({
  prompts,
  selections,
  notes,
  onToggle,
  onNotesChange,
  onSave,
  savedNotice,
}: Props) {
  return (
    <section
      aria-label="Observations"
      className="rounded-2xl border border-border/70 bg-surface/60 p-4 backdrop-blur-sm"
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Notice
      </h2>
      <p className="mt-1 text-sm text-muted-strong">
        What changed when you tested your idea?
      </p>

      {prompts.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="sr-only">Check what you observed</legend>
          <div className="flex flex-col gap-1.5">
            {prompts.map((prompt) => (
              <label
                key={prompt.prompt}
                className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 text-sm leading-5 transition hover:bg-surface-raised/70"
              >
                <input
                  type="checkbox"
                  checked={selections[prompt.prompt] ?? false}
                  onChange={(event) =>
                    onToggle(prompt.prompt, event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                {prompt.prompt}
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
        htmlFor="demo-observation-notes"
        className="mt-3 block text-xs font-medium text-muted-strong"
      >
        Your notes <span className="font-normal text-muted">— one thing you noticed</span>
      </label>
      <textarea
        id="demo-observation-notes"
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        rows={2}
        placeholder="What changed?"
        className="mt-1 w-full resize-y rounded-xl border border-border/70 bg-transparent px-3 py-2 text-sm placeholder:text-muted focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
      />

      <button
        type="button"
        onClick={onSave}
        className="mt-3 w-full rounded-full border border-border bg-surface-raised/70 px-4 py-2.5 text-sm font-semibold transition hover:bg-surface-raised"
      >
        Save observations to my trial log
      </button>
      {savedNotice && (
        <p role="status" className="mt-2 text-sm text-ok">
          Observations recorded to your trial log.
        </p>
      )}
    </section>
  );
}
