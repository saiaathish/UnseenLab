"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { DemoSpecV1, RepresentationSpec } from "@/demonstrations/spec/demo-spec";
import type { RepresentationMode } from "@/domain/learner";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";
import { cn } from "@/lib/utils";

import { DemonstrationStage, type StageProps } from "./demonstration-stage";
import {
  AccessibleDiagram,
  DataTableView,
  TextSequenceView,
  TimelineView,
} from "./accessible-representation";

interface Props {
  spec: DemoSpecV1;
  activeId: string;
  reducedMotion: boolean;
  preferredRepresentations: RepresentationMode[];
  readouts: Readout[];
  parameters: Record<string, number>;
  onRepresentationChange: (id: string) => void;
  /** Forwarded to the stage (kept mounted while a non-stage tab is active). */
  stage: StageProps;
}

/** Representation kind → the learner preference mode it best serves. */
const REP_KIND_TO_MODE: Partial<Record<RepresentationSpec["kind"], RepresentationMode>> = {
  stage_2d: "animation",
  stage_3d: "animation",
  graph: "graph",
  table: "graph",
  diagram: "causal",
  causal_map: "causal",
  timeline: "plain_language",
  text_sequence: "plain_language",
};

function isStageRep(rep: RepresentationSpec): boolean {
  return rep.kind === "stage_2d" || rep.kind === "stage_3d";
}

/**
 * Orders the spec's representations so that:
 *  - preferred non-3D views come first when the learner prefers them, and
 *  - stage/3D views always come last under reduced motion.
 * The order is stable so the rest of the UI keeps a consistent sequence.
 */
export function orderedRepresentations(
  spec: DemoSpecV1,
  reducedMotion: boolean,
  preferredRepresentations: RepresentationMode[]
): RepresentationSpec[] {
  const reps = [...spec.representations];
  const preferred: RepresentationMode[] = preferredRepresentations.filter(
    (mode) => mode !== "animation"
  );
  const rank = (rep: RepresentationSpec): number => {
    const mode = REP_KIND_TO_MODE[rep.kind];
    const index = mode ? preferred.indexOf(mode) : -1;
    return index === -1 ? preferred.length : index;
  };
  reps.sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (reducedMotion) {
      if (isStageRep(a) && !isStageRep(b)) return 1;
      if (!isStageRep(a) && isStageRep(b)) return -1;
    }
    return 0;
  });
  return reps;
}

/**
 * Tabs over spec.representations. Stage tabs render the canvas (the stage
 * stays mounted, hidden, while another view is active so readouts keep
 * flowing); diagram/table/timeline/text_sequence render accessible views.
 * A polite live region announces ONLY tab switches.
 */
export function DemonstrationRepresentationTabs({
  spec,
  activeId,
  reducedMotion,
  preferredRepresentations,
  readouts,
  parameters,
  onRepresentationChange,
  stage,
}: Props) {
  const ordered = useMemo(
    () => orderedRepresentations(spec, reducedMotion, preferredRepresentations),
    [spec, reducedMotion, preferredRepresentations]
  );
  const active =
    ordered.find((rep) => rep.id === activeId) ?? ordered[0] ?? null;

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = tabRefs.current.findIndex(
      (node) => node === document.activeElement
    );
    const currentIndex =
      focusedIndex >= 0 ? focusedIndex : Math.max(0, ordered.findIndex((r) => r.id === activeId));
    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % ordered.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + ordered.length) % ordered.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = ordered.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = ordered[nextIndex];
    if (next) {
      handleChange(next.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  const handleChange = (id: string) => {
    if (id === activeId) return;
    const rep = ordered.find((r) => r.id === id);
    if (rep) setAnnouncement(`View: ${rep.label}`);
    onRepresentationChange(id);
  };

  if (!active) {
    return (
      <p className="text-sm text-muted">
        This demonstration declares no representations.
      </p>
    );
  }

  const stageActive = isStageRep(active);
  const hasStageRep = ordered.some(isStageRep);
  /**
   * Hybrid showcase specs (renderer.kind hybrid/primitive_3d + simulation)
   * render TWO surfaces: the verified lumina-2d engine stage is kept mounted
   * (hidden while the 3D view is active) so live readouts keep flowing into
   * the table; the 3D stage mounts only when its tab is active — one visible
   * canvas at a time.
   */
  const hybridEngineDriver =
    !!spec.simulation && spec.renderer.kind !== "lumina_2d";

  return (
    <section
      aria-label="Representations"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div
        role="tablist"
        aria-label="View the demonstration as"
        onKeyDown={handleKeyDown}
        className="flex flex-wrap gap-1"
      >
        {ordered.map((rep, index) => (
          <button
            key={rep.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`demo-rep-tab-${rep.id}`}
            aria-selected={rep.id === active.id}
            aria-controls="demo-rep-panel"
            tabIndex={rep.id === active.id ? 0 : -1}
            onClick={() => handleChange(rep.id)}
            className={cn(
              "min-h-11 rounded-lg px-3 py-2 text-sm font-medium",
              rep.id === active.id
                ? "bg-accent-strong text-white"
                : "border border-border hover:bg-surface-raised"
            )}
          >
            {rep.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="demo-rep-panel"
        aria-labelledby={`demo-rep-tab-${active.id}`}
        className="mt-4"
      >
        {hasStageRep && !hybridEngineDriver && (
          <div hidden={!stageActive}>
            <DemonstrationStage {...stage} />
          </div>
        )}
        {hybridEngineDriver && (
          <>
            <div hidden={active.kind !== "stage_2d"}>
              <DemonstrationStage {...stage} mode="2d" />
            </div>
            {active.kind === "stage_3d" && (
              <DemonstrationStage {...stage} mode="3d" />
            )}
          </>
        )}
        {!stageActive && (
          <NonStageView
            spec={spec}
            rep={active}
            readouts={readouts}
            parameters={parameters}
          />
        )}
      </div>

      {/* Announce only on tab switch; the region stays mounted but empty
          until then so nothing is announced on first render. */}
      <p aria-live="polite" className="sr-only">
        {announcement ?? ""}
      </p>
    </section>
  );
}

function NonStageView({
  spec,
  rep,
  readouts,
  parameters,
}: {
  spec: DemoSpecV1;
  rep: RepresentationSpec;
  readouts: Readout[];
  parameters: Record<string, number>;
}) {
  switch (rep.kind) {
    case "diagram":
    case "causal_map":
      return <AccessibleDiagram spec={spec} />;
    case "table":
      return <DataTableView spec={spec} readouts={readouts} parameters={parameters} />;
    case "timeline":
      return spec.timeline ? (
        <TimelineView timeline={spec.timeline} />
      ) : (
        <p className="text-sm text-muted">No timeline is declared for this demonstration.</p>
      );
    case "text_sequence":
      return <TextSequenceView spec={spec} />;
    case "graph":
      return <GraphView spec={spec} readouts={readouts} />;
    default:
      return (
        <p className="text-sm text-muted">
          This representation is not available in this environment.
        </p>
      );
  }
}

/**
 * Honest graph view: real live readout values only, and only for Level 1
 * specs. Level 2/3 make no quantitative claims, so no graph is invented.
 */
function GraphView({
  spec,
  readouts,
}: {
  spec: DemoSpecV1;
  readouts: Readout[];
}) {
  const isLevel1 =
    spec.trust.level === "verified_simulation" && Boolean(spec.simulation);
  if (!isLevel1) {
    return (
      <p className="text-sm text-muted">
        This demonstration makes no quantitative claims, so there is no data to
        plot. Try the diagram or timeline view instead.
      </p>
    );
  }
  if (readouts.length === 0) {
    return (
      <p className="text-sm text-muted">
        No readouts yet — the simulation will produce values shortly.
      </p>
    );
  }
  const values = readouts.map((r) => {
    const parsed = Number.parseFloat(r.value);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const max = Math.max(1, ...values.filter((v): v is number => v !== null));
  return (
    <div aria-label="Readout values as bars" className="flex flex-col gap-2">
      {readouts.map((readout, index) => {
        const value = values[index];
        return (
          <div key={`${readout.label}-${index}`} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-muted">{readout.label}</span>
            <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-surface-raised">
              {value !== null && (
                <div
                  className="h-full rounded bg-accent-strong/70"
                  style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                />
              )}
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-xs">
              {readout.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
