"use client";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

/**
 * Bounded, deterministic adaptation. Suggestions are derived from the spec
 * and the current UI state, never from open-ended model text. The learner
 * always decides (Accept / Reject) and every decision is recorded in the
 * trial log. When there is nothing useful to offer, no suggestions are
 * produced.
 *
 * Rendering lives in the lesson rail's complete step (demoted from the
 * primary workspace); this module keeps the derivation logic and types so
 * the recording contract is unchanged.
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
