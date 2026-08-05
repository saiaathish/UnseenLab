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
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
        What do you notice?
      </h2>

      {prompts.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">
            Check what you observed
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {prompts.map((prompt) => (
              <label
                key={prompt.prompt}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-raised"
              >
                <input
                  type="checkbox"
                  checked={selections[prompt.prompt] ?? false}
                  onChange={(event) =>
                    onToggle(prompt.prompt, event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 accent-accent"
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
        className="mt-4 block text-sm font-medium"
      >
        Your notes
      </label>
      <textarea
        id="demo-observation-notes"
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        rows={3}
        placeholder="What changed when you adjusted the controls?"
        className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm placeholder:text-muted"
      />

      <button
        type="button"
        onClick={onSave}
        className="mt-3 w-full rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
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
