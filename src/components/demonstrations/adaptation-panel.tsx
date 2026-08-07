"use client";

import { useState } from "react";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

/**
 * Bounded, deterministic adaptation. Suggestions are derived from the spec
 * and the current UI state — never from open-ended model text. The learner
 * always decides (Accept / Reject) and every decision is recorded in the
 * trial log. When there is nothing useful to offer, the panel renders
 * nothing at all.
 */

export type AdaptationAction =
  | { kind: "set_parameter"; key: string; value: number }
  | { kind: "switch_representation"; representationId: string }
  | { kind: "enable_one_variable_mode" };

export interface AdaptationSuggestion {
  id: string;
  text: string;
  action: AdaptationAction;
}

export interface AdaptationContext {
  activeRepresentation: string | null;
  oneVariableMode: boolean;
  parameters: Record<string, number>;
}

export function deriveAdaptationSuggestions(
  spec: DemoSpecV1,
  context: AdaptationContext
): AdaptationSuggestion[] {
  if (!spec.adaptationContext.allowed) return [];

  const suggestions: AdaptationSuggestion[] = [];
  const activeId = context.activeRepresentation;

  // 1. Parameter suggestion: move one adjustable parameter away from its
  //    current value so the learner can see the effect of a change.
  const firstParameterControl = spec.controls.find(
    (control) => control.target.kind === "parameter"
  );
  const parameterSpec = firstParameterControl
    ? spec.simulation?.parameters.find(
        (p) => p.key === firstParameterControl.target.ref
      )
    : undefined;
  if (firstParameterControl && parameterSpec) {
    const current = context.parameters[parameterSpec.key] ?? parameterSpec.value;
    const mid = (parameterSpec.min + parameterSpec.max) / 2;
    const suggested =
      current >= mid ? parameterSpec.min : parameterSpec.max;
    suggestions.push({
      id: `param-${parameterSpec.key}`,
      text: `Try changing ${parameterSpec.label.toLowerCase()} and watch how the result changes.`,
      action: {
        kind: "set_parameter",
        key: parameterSpec.key,
        value: suggested,
      },
    });
  }

  // 2. Representation suggestions.
  const tableRep = spec.representations.find((rep) => rep.kind === "table");
  if (tableRep && activeId !== tableRep.id) {
    suggestions.push({
      id: `rep-${tableRep.id}`,
      text: "Switch to the table view to compare numbers side by side.",
      action: {
        kind: "switch_representation",
        representationId: tableRep.id,
      },
    });
  }
  const timelineRep = spec.representations.find((rep) => rep.kind === "timeline");
  if (timelineRep && activeId !== timelineRep.id) {
    suggestions.push({
      id: `rep-${timelineRep.id}`,
      text: "Try the timeline view to see the order of events.",
      action: {
        kind: "switch_representation",
        representationId: timelineRep.id,
      },
    });
  }
  const diagramRep = spec.representations.find(
    (rep) => rep.kind === "diagram" || rep.kind === "causal_map"
  );
  if (diagramRep && activeId !== diagramRep.id) {
    suggestions.push({
      id: `rep-${diagramRep.id}`,
      text: "Try the diagram view to see how the parts connect.",
      action: {
        kind: "switch_representation",
        representationId: diagramRep.id,
      },
    });
  }

  // 3. One-variable mode (only when the spec supports it).
  if (
    spec.adaptationContext.oneVariableMode &&
    !context.oneVariableMode &&
    spec.controls.length > 1
  ) {
    suggestions.push({
      id: "one-variable-mode",
      text: "Enable one-variable mode: change one thing at a time.",
      action: { kind: "enable_one_variable_mode" },
    });
  }

  return suggestions.slice(0, 3);
}

interface Props {
  suggestions: AdaptationSuggestion[];
  onDecision: (suggestion: AdaptationSuggestion, accepted: boolean) => void;
}

export function DemonstrationAdaptationPanel({ suggestions, onDecision }: Props) {
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const decide = (suggestion: AdaptationSuggestion, accepted: boolean) => {
    setAnnouncement(
      accepted
        ? `Adaptation applied: ${suggestion.text}`
        : `Adaptation dismissed: ${suggestion.text}`
    );
    onDecision(suggestion, accepted);
  };

  return (
    <>
      {suggestions.length > 0 && (
        <section
          aria-label="Adaptation suggestions"
          className="flex flex-col gap-2 rounded-2xl border border-accent/25 bg-accent-soft/20 p-4 backdrop-blur-sm"
        >
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Suggested adaptation
          </h2>
          <p className="text-sm text-muted-strong">
            One small next move based on where you are now.
          </p>
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="border-t border-accent/15 pt-3 first:border-t-0 first:pt-1"
            >
              <p className="text-sm leading-6">{suggestion.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => decide(suggestion, true)}
                  className="min-h-10 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => decide(suggestion, false)}
                  className="min-h-10 rounded-full border border-border/70 px-4 py-2 text-sm font-medium transition hover:bg-surface-raised/70"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {/* Polite announcement of the learner's adaptation decision. The
          region mounts only with text (like the prediction status) and the
          text changes only on a decision, so it never spams; once mounted it
          stays mounted even when the panel empties, so the final decision is
          still announced. */}
      {announcement !== null && (
        <p role="status" className="sr-only">
          {announcement}
        </p>
      )}
    </>
  );
}
