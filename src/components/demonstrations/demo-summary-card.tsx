"use client";

import { useRouter } from "next/navigation";
import {
  TRUST_LABELS,
  type DemoSpecV1,
} from "@/demonstrations/spec/demo-spec";
import { demoStore, type DemoSource } from "@/demonstrations/state/demo-store";

interface DemoSummaryCardProps {
  spec: DemoSpecV1;
  source: DemoSource;
  generatedAt: string;
  /** Return to the ask form with a fresh request. */
  onStartOver: () => void;
}

/**
 * A quiet hand-off from question → learning environment. It keeps the trust
 * boundary visible but avoids turning generation into a product summary or
 * feature card. The actual demo/store routing contract is unchanged.
 */
export function DemoSummaryCard({
  spec,
  source,
  generatedAt,
  onStartOver,
}: DemoSummaryCardProps) {
  const router = useRouter();

  const trustLabel = TRUST_LABELS[spec.trust.level] ?? spec.trust.label;
  const primaryLimitation = spec.trust.limitations[0];
  const mainControls = spec.controls.slice(0, 4);

  const handleEnterDemo = () => {
    demoStore.startDemo(spec, source, generatedAt);
    router.push(`/demos/${spec.id}`);
  };

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 px-5 py-7 text-center backdrop-blur-md sm:px-8 sm:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/70 to-transparent"
      />

      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300/90">
        Ready to explore
      </p>
      <h3 className="mx-auto mt-3 max-w-xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {spec.title}
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-300 sm:text-base">
        {spec.learningObjective}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 font-medium text-teal-200">
          {trustLabel}
        </span>
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 font-medium text-gray-300">
          {source === "offline" ? "Offline catalog" : "AI-composed"}
        </span>
      </div>

      {source === "offline" ? (
        <p className="mt-2 text-xs text-gray-400">Built from the offline catalog</p>
      ) : null}

      <ul className="sr-only" aria-label="Main controls">
        {mainControls.map((control) => (
          <li key={control.id}>{control.label}</li>
        ))}
      </ul>

      {primaryLimitation ? (
        <p className="mx-auto mt-4 max-w-lg text-xs leading-5 text-gray-400">
          <span className="font-medium text-gray-300">Keep in mind:</span>{" "}
          {primaryLimitation}
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleEnterDemo}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-teal-400 px-6 py-3 font-semibold text-[#070b14] transition hover:bg-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/70"
        >
          Enter demonstration
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="min-h-12 rounded-full px-4 py-3 text-sm font-medium text-gray-300 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/60"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
