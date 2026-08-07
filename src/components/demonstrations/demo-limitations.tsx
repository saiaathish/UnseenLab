"use client";

import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { TRUST_LABELS } from "@/demonstrations/spec/demo-spec";

const SOURCE_LABELS: Record<DemoSpecV1["provenance"]["source"], string> = {
  curated_engine: "Curated engine (offline catalog)",
  template_composition: "Template composition (offline catalog)",
  model_generated_spec: "Model-generated spec",
};

/**
 * Collapsible limitations + provenance. <details> is natively
 * keyboard-operable and needs no custom state. Everything shown is declared
 * by the spec itself — no added or softened claims.
 */
export function DemonstrationLimitations({ spec }: { spec: DemoSpecV1 }) {
  const { provenance } = spec;
  return (
    <details className="group rounded-xl border border-border bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold uppercase tracking-widest text-muted">
        Limitations &amp; provenance
        <span aria-hidden="true" className="text-muted group-open:hidden">
          Show
        </span>
        <span aria-hidden="true" className="hidden text-muted group-open:inline">
          Hide
        </span>
      </summary>

      <div className="mt-3">
        <h3 className="text-sm font-medium">Limitations</h3>
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

        <h3 className="mt-4 text-sm font-medium">Provenance</h3>
        <dl className="mt-2 flex flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Trust level</dt>
            <dd className="font-medium">{TRUST_LABELS[spec.trust.level]}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Source</dt>
            <dd className="font-medium">{SOURCE_LABELS[provenance.source]}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-muted">Generated</dt>
            <dd className="font-medium">
              {new Date(provenance.generatedAt).toLocaleString()}
            </dd>
          </div>
          {provenance.model && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Model</dt>
              <dd className="font-medium">{provenance.model}</dd>
            </div>
          )}
        </dl>
      </div>
    </details>
  );
}
