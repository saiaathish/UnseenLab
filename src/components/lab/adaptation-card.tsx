"use client";

import { useState } from "react";
import type { AdaptationProposal } from "@/domain/evidence";
import type { LearnerPreferences } from "@/domain/learner";

interface Props {
  proposals: AdaptationProposal[];
  preferences: LearnerPreferences;
  onAccept: (proposal: AdaptationProposal) => void;
  onReject: (proposal: AdaptationProposal) => void;
  onModify: (
    proposal: AdaptationProposal,
    changes: Record<string, unknown>,
  ) => void;
}

const CHANGE_LABELS: Record<string, string> = {
  animationSpeed: "Animation speed",
  oneVariableMode: "One-variable mode",
  informationDensity: "Information density",
  preferredRepresentations: "Add a view",
  reducedMotion: "Reduced motion",
  textScale: "Text size",
  feedbackTiming: "Feedback timing",
  highContrast: "High contrast",
};

/**
 * Every adaptation is an explainable offer: what was observed, what would
 * change, why it may help — and the learner always decides (accept, reject,
 * or modify). Nothing is ever silently applied.
 */
export function AdaptationCard({
  proposals,
  onAccept,
  onReject,
  onModify,
}: Props) {
  if (proposals.length === 0) {
    return (
      <section
        aria-label="Adaptation suggestions"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Adaptation suggestions
        </h2>
        <p className="mt-2 text-sm text-muted">
          No suggestions right now. Run a trial to see if the lab can offer
          anything helpful.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Adaptation suggestions"
      className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-surface p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">
        Suggested adaptation
      </h2>
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          onAccept={onAccept}
          onReject={onReject}
          onModify={onModify}
        />
      ))}
    </section>
  );
}

function ProposalCard({
  proposal,
  onAccept,
  onReject,
  onModify,
}: {
  proposal: AdaptationProposal;
  onAccept: (proposal: AdaptationProposal) => void;
  onReject: (proposal: AdaptationProposal) => void;
  onModify: (proposal: AdaptationProposal, changes: Record<string, unknown>) => void;
}) {
  const [modifying, setModifying] = useState(false);
  const changeKeys = Object.keys(proposal.proposedChanges);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(changeKeys),
  );

  const actionText =
    proposal.type === "show_graph"
      ? "Open the graph view"
      : proposal.type === "show_causal_view"
        ? "Open the causal view"
        : null;

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-3">
      <p
        aria-hidden="true"
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          proposal.source === "llm"
            ? "bg-accent-soft text-accent"
            : "bg-border/40 text-muted"
        }`}
      >
        {proposal.source === "llm" ? "AI interpretation" : "Offline rules"}
      </p>
      <p className="mt-1 text-sm leading-6">{proposal.reason}</p>

      {changeKeys.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-muted">
          {changeKeys.map((key) => (
            <li key={key}>
              {CHANGE_LABELS[key] ?? key}: {String(proposal.proposedChanges[key])}
            </li>
          ))}
        </ul>
      )}
      {actionText && (
        <p className="mt-2 text-sm text-accent">{actionText}</p>
      )}
      {proposal.followUpQuestion && (
        <p className="mt-2 text-sm">
          Try this question: <em>{proposal.followUpQuestion}</em>
        </p>
      )}

      {modifying ? (
        <div className="mt-3">
          <p className="text-sm font-medium">Choose which changes to apply:</p>
          <div className="mt-2 flex flex-col gap-2">
            {changeKeys.map((key) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-accent"
                />
                {CHANGE_LABELS[key] ?? key}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const subset: Record<string, unknown> = {};
                for (const key of selected) subset[key] = proposal.proposedChanges[key];
                onModify(proposal, subset);
              }}
              className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Apply selected
            </button>
            <button
              type="button"
              onClick={() => setModifying(false)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAccept(proposal)}
            className="rounded-lg bg-accent-strong px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => onReject(proposal)}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
          >
            Reject
          </button>
          {changeKeys.length > 0 && (
            <button
              type="button"
              onClick={() => setModifying(true)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-raised"
            >
              Modify
            </button>
          )}
        </div>
      )}
      {changeKeys.length === 0 && (
        <p className="mt-2 text-xs text-muted">
          This one is just a suggestion to try something — nothing is forced.
        </p>
      )}
    </div>
  );
}
