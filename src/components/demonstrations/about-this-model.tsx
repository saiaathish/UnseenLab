"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { TRUST_LABELS } from "@/demonstrations/spec/demo-spec";
import type { DemoSource, TrialRecord } from "@/demonstrations/state/demo-store";
import { cn } from "@/lib/utils";

import { TrustBadge } from "./trust-badge";
import { DemoSaveControl } from "./demo-save-control";

const DISPLAY_SOURCE: Record<DemoSource, string> = {
  model: "AI-generated",
  offline: "Offline catalog",
};

const ORIGIN_LABELS: Record<DemoSpecV1["provenance"]["source"], string> = {
  curated_engine: "Curated engine (offline catalog)",
  template_composition: "Template composition (offline catalog)",
  model_generated_spec: "Model-generated spec",
};

export interface AboutThisModelProps {
  spec: DemoSpecV1;
  source: DemoSource;
  trials: TrialRecord[];
  onReplayTrial: (trial: TrialRecord) => void;
}

/**
 * Demoted provenance dialog. Trust, source, save status, provenance,
 * limitations, the compact trial log and adaptation history live here: one
 * ⓘ next to the trust chip opens them. Nothing is deleted, only moved out of
 * the primary workspace. Escape closes and focus returns to the trigger
 * (base-ui Dialog defaults).
 */
export function AboutThisModel({
  spec,
  source,
  trials,
  onReplayTrial,
}: AboutThisModelProps) {
  const [open, setOpen] = useState(false);

  const handleReplay = (trial: TrialRecord) => {
    // Close first so the replay banner (which takes focus) never fights the
    // dialog's focus trap.
    setOpen(false);
    onReplayTrial(trial);
  };

  return (
    <>
      <button
        type="button"
        aria-label="About this model"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-surface-raised px-1.5 text-sm font-semibold text-muted-strong hover:bg-surface"
      >
        <span aria-hidden="true">ⓘ</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">About this model</DialogTitle>
            <DialogDescription>
              Trust, source, limitations and your saved work for this
              demonstration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <section aria-label="Trust and source">
              <TrustBadge level={spec.trust.level} />
              <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-muted">Trust level</dt>
                  <dd className="font-medium">{TRUST_LABELS[spec.trust.level]}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-muted">Source</dt>
                  <dd className="font-medium">{DISPLAY_SOURCE[source]}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-muted">Origin</dt>
                  <dd className="font-medium">
                    {ORIGIN_LABELS[spec.provenance.source]}
                  </dd>
                </div>
              </dl>
            </section>

            <section aria-label="Save status">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
                Save status
              </h3>
              <div className="mt-2">
                <DemoSaveControl />
              </div>
            </section>

            <section aria-label="Provenance">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
                Provenance
              </h3>
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                {spec.provenance.model && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-muted">Model</dt>
                    <dd className="font-medium">{spec.provenance.model}</dd>
                  </div>
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-muted">Generated</dt>
                  <dd className="font-medium">
                    {new Date(spec.provenance.generatedAt).toLocaleString()}
                  </dd>
                </div>
                {spec.provenance.templateIds.length > 0 && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-muted">Templates</dt>
                    <dd className="font-medium">
                      {spec.provenance.templateIds.join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section aria-label="Limitations">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
                Limitations
              </h3>
              {spec.trust.limitations.length > 0 ? (
                <ul className="mt-2 flex list-inside list-disc flex-col gap-1.5 text-sm text-muted-strong">
                  {spec.trust.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  No limitations were declared for this demonstration.
                </p>
              )}
            </section>

            <TrialLogSection
              spec={spec}
              trials={trials}
              onReplayTrial={handleReplay}
            />

            <AdaptationHistorySection trials={trials} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Compact trial log (existing entries; replay restores parameters honestly)
// ---------------------------------------------------------------------------

function entryKind(
  trial: TrialRecord
): "prediction" | "observation" | "adaptation" {
  if (trial.predictionIndex !== null) return "prediction";
  if (trial.adaptations.length > 0) return "adaptation";
  return "observation";
}

function TrialLogSection({
  spec,
  trials,
  onReplayTrial,
}: {
  spec: DemoSpecV1;
  trials: TrialRecord[];
  onReplayTrial: (trial: TrialRecord) => void;
}) {
  return (
    <section aria-label="Trial log">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
        Trial log
      </h3>
      {trials.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nothing recorded yet. Submit a prediction to start your trial log.
        </p>
      ) : (
        <ol className="mt-2 flex flex-col gap-3">
          {trials.map((trial) => {
            const kind = entryKind(trial);
            return (
              <li
                key={trial.trial}
                className="rounded-lg border border-border bg-surface-raised p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    Entry {trial.trial} ·{" "}
                    {kind === "prediction"
                      ? "Prediction"
                      : kind === "adaptation"
                        ? "Adaptation decision"
                        : "Observation"}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(trial.recordedAt).toLocaleTimeString()}
                  </p>
                </div>

                {trial.predictionIndex !== null && (
                  <p className="mt-1 text-sm">
                    Prediction:{" "}
                    <span className="font-medium">
                      {spec.prediction.options[trial.predictionIndex] ??
                        "Unknown option"}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Parameters:{" "}
                  {Object.entries(trial.parameters)
                    .map(([key, value]) => `${key} ${value}`)
                    .join(", ") || "none"}
                </p>
                {trial.readouts.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted">
                    Readouts captured when this entry was saved:{" "}
                    {trial.readouts
                      .map((r) => `${r.label} ${r.value}`)
                      .join("; ")}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onReplayTrial(trial)}
                  className="mt-2 min-h-11 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-raised"
                >
                  Restore these parameters
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Adaptation history (recorded decisions, never invented)
// ---------------------------------------------------------------------------

function AdaptationHistorySection({ trials }: { trials: TrialRecord[] }) {
  const decisions = trials.flatMap((trial) => trial.adaptations);
  return (
    <section aria-label="Adaptation history">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-muted">
        Adaptation history
      </h3>
      {decisions.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No adaptation decisions recorded.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted-strong">
          {decisions.map((decision) => (
            <li
              key={`${decision.accepted}-${decision.suggestion}`}
              className={cn(
                "rounded-lg border border-border bg-surface-raised px-3 py-2"
              )}
            >
              {decision.accepted ? "Accepted" : "Rejected"}:{" "}
              {decision.suggestion}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
