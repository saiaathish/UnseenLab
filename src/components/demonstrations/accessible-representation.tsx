/**
 * Accessible representations — the non-canvas views of a demonstration.
 *
 * Every view here is pure HTML/SVG derived deterministically from the spec:
 * no canvas, no WebGL, no invented numbers. A learner who cannot (or prefers
 * not to) use the 3D/canvas stage can still complete the full loop —
 * predict → manipulate → observe → compare — because the controls remain
 * available alongside these views.
 *
 * Shared by:
 *  - demonstration-stage.tsx   (fallback when the engine/WebGL is unavailable)
 *  - representation-tabs.tsx   (diagram / table / timeline / text_sequence)
 */

import type {
  DemoSpecV1,
  FallbackKind,
  PrimitiveObjectSpec,
  TimelineSpec,
} from "@/demonstrations/spec/demo-spec";
import type { Readout } from "@/demonstrations/renderers/lumina-2d/types";

export interface AccessibleRepresentationProps {
  spec: DemoSpecV1;
  kind: FallbackKind;
  readouts: Readout[];
  parameters: Record<string, number>;
}

/** Dispatcher used by the stage fallback. */
export function AccessibleRepresentation({
  spec,
  kind,
  readouts,
  parameters,
}: AccessibleRepresentationProps) {
  if (kind === "timeline" && spec.timeline) {
    return <TimelineView timeline={spec.timeline} />;
  }
  if (kind === "data_table") {
    return <DataTableView spec={spec} readouts={readouts} parameters={parameters} />;
  }
  if (kind === "accessible_diagram") {
    return <AccessibleDiagram spec={spec} />;
  }
  return <TextSequenceView spec={spec} />;
}

// ---------------------------------------------------------------------------
// Diagram (HTML/SVG of scene objects + relationships)
// ---------------------------------------------------------------------------

const VIEW_W = 800;
const VIEW_H = 460;
const PAD = 70;

function objectPosition(
  obj: PrimitiveObjectSpec,
  index: number,
  count: number
): { x: number; y: number } {
  if (obj.position) {
    // z is deliberately ignored — this is a top-down diagram.
    return { x: obj.position.x, y: obj.position.y };
  }
  // Deterministic grid fallback for objects without declared positions.
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cellW = (VIEW_W - PAD * 2) / Math.max(cols, 1);
  const cellH = (VIEW_H - PAD * 2) / Math.max(Math.ceil(count / cols), 1);
  return { x: PAD + cellW * col + cellW / 2, y: PAD + cellH * row + cellH / 2 };
}

function scalePosition(
  p: { x: number; y: number },
  positioned: Array<{ x: number; y: number }>
): { x: number; y: number } {
  if (positioned.length === 0) return { x: VIEW_W / 2, y: VIEW_H / 2 };
  const xs = positioned.map((q) => q.x);
  const ys = positioned.map((q) => q.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  return {
    x: PAD + ((p.x - minX) / spanX) * (VIEW_W - PAD * 2),
    y: PAD + ((p.y - minY) / spanY) * (VIEW_H - PAD * 2),
  };
}

/**
 * Objects that are NOT part of the canonical graph and must never be drawn as
 * diagram shapes. Arrows/process edges are edges, never objects; standalone
 * labels are captions, never nodes. Filtered defensively: templates no longer
 * emit them, but older/malformed specs may.
 */
const NON_GRAPH_KINDS: ReadonlySet<PrimitiveObjectSpec["kind"]> = new Set([
  "arrow",
  "process_edge",
  "label",
]);

function shapeForKind(kind: PrimitiveObjectSpec["kind"]): "circle" | "rect" | "diamond" {
  if (kind === "sphere" || kind === "particle_field" || kind === "energy_packet" || kind === "process_node") {
    return "circle";
  }
  if (kind === "process_edge" || kind === "arrow" || kind === "line" || kind === "label") {
    return "diamond";
  }
  return "rect";
}

function DiagramShape({
  x,
  y,
  shape,
  color,
  label,
}: {
  x: number;
  y: number;
  shape: "circle" | "rect" | "diamond";
  color: string;
  label: string;
}) {
  if (shape === "circle") {
    return (
      <g>
        <circle cx={x} cy={y} r={26} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} />
        <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="currentColor">
          {label}
        </text>
      </g>
    );
  }
  if (shape === "diamond") {
    return (
      <g>
        <rect x={x - 26} y={y - 26} width={52} height={52} rx={6} transform={`rotate(45 ${x} ${y})`} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} />
        <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="currentColor">
          {label}
        </text>
      </g>
    );
  }
  return (
    <g>
      <rect x={x - 30} y={y - 20} width={60} height={40} rx={6} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="currentColor">
        {label}
      </text>
    </g>
  );
}

/** Objects as labeled shapes with relationship arrows — no canvas needed. */
export function AccessibleDiagram({ spec }: { spec: DemoSpecV1 }) {
  const objects = spec.scene3d?.objects ?? [];
  const relationships = spec.scene3d?.relationships ?? [];

  if (objects.length === 0) {
    return (
      <p className="text-sm text-muted">
        No diagram is available for this demonstration.
      </p>
    );
  }

  const roots = objects.filter(
    (o) => o.kind !== "group" && !NON_GRAPH_KINDS.has(o.kind)
  );
  const positions = roots.map((o, i) => objectPosition(o, i, roots.length));
  const scaled = roots.map((o, i) => scalePosition(positions[i], positions));
  const byId = new Map(roots.map((o, i) => [o.id, scaled[i]]));

  const edges = relationships.filter(
    (r) => byId.has(r.from) && byId.has(r.to)
  );

  const summary = `${roots.length} object${roots.length === 1 ? "" : "s"} and ${edges.length} relationship${edges.length === 1 ? "" : "s"}: ${roots
    .map((o) => o.label ?? o.kind)
    .join(", ")}.`;

  return (
    <figure className="text-foreground">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Relationship diagram. ${summary}`}
        className="h-auto w-full rounded-lg border border-border bg-surface-raised"
      >
        <title>{`Relationship diagram. ${summary}`}</title>
        {edges.map((rel) => {
          const from = byId.get(rel.from)!;
          const to = byId.get(rel.to)!;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.max(Math.hypot(dx, dy), 1);
          const ux = dx / len;
          const uy = dy / len;
          const sx = from.x + ux * 34;
          const sy = from.y + uy * 34;
          const ex = to.x - ux * 34;
          const ey = to.y - uy * 34;
          const mx = (sx + ex) / 2;
          const my = (sy + ey) / 2 - 12;
          const inhibits = rel.type === "inhibits";
          return (
            <g key={rel.id} data-edge-type={rel.type}>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={2}
              />
              {inhibits ? (
                // `—|` bar at the destination, perpendicular to the edge.
                <line
                  x1={ex - uy * 11}
                  y1={ey + ux * 11}
                  x2={ex + uy * 11}
                  y2={ey - ux * 11}
                  stroke="currentColor"
                  strokeOpacity={0.85}
                  strokeWidth={3.5}
                />
              ) : (
                <polygon
                  points={`${ex},${ey} ${ex - ux * 10 - uy * 5},${ey - uy * 10 + ux * 5} ${ex - ux * 10 + uy * 5},${ey - uy * 10 - ux * 5}`}
                  fill="currentColor"
                  fillOpacity={0.7}
                />
              )}
              <text x={mx} y={my} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.8}>
                {rel.label ?? rel.type}
              </text>
            </g>
          );
        })}
        {roots.map((o, i) => (
          <DiagramShape
            key={o.id}
            x={scaled[i].x}
            y={scaled[i].y}
            shape={shapeForKind(o.kind)}
            color={o.color ?? "#0f766e"}
            label={o.label ?? o.kind}
          />
        ))}
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        {summary} Lines and arrowheads show the declared relationships between
        the parts; a bar marks an inhibition.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Timeline (ordered, accessible list)
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TimelineView({ timeline }: { timeline: TimelineSpec }) {
  const total = Math.max(
    ...timeline.events.map((e) => e.startMs + e.durationMs),
    1
  );
  return (
    <ol className="flex flex-col gap-3" aria-label="Timeline of events">
      {timeline.events.map((event, index) => {
        const endMs = event.startMs + event.durationMs;
        const widthPct = Math.max(
          4,
          Math.min(100, (event.durationMs / total) * 100)
        );
        return (
          <li
            key={`${event.title}-${index}`}
            className="rounded-lg border border-border bg-surface-raised p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                <span className="text-muted">Step {index + 1}.</span>{" "}
                {event.title}
              </p>
              <p className="text-xs text-muted">
                {formatTime(event.startMs)}–{formatTime(endMs)}
              </p>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-strong">
              {event.description}
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-1.5 w-full rounded-full bg-border"
            >
              <div
                className="h-full rounded-full bg-accent-strong"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

export function DataTableView({
  spec,
  readouts,
  parameters,
}: {
  spec: DemoSpecV1;
  readouts: Readout[];
  parameters: Record<string, number>;
}) {
  const isLevel1 =
    spec.trust.level === "verified_simulation" && Boolean(spec.simulation);

  if (isLevel1 && spec.simulation) {
    const paramRows = spec.simulation.parameters.map((p) => ({
      label: p.label,
      value: `${parameters[p.key] ?? p.value}${p.unit ? ` ${p.unit}` : ""}`,
    }));
    const readoutRows = readouts.map((r) => ({ label: r.label, value: r.value }));
    return (
      <DataTable
        caption="Parameters and live readouts"
        rows={[...paramRows, ...readoutRows]}
        note={
          readouts.length === 0
            ? "The simulation has not produced readouts yet."
            : "Readout values are captured live from the running simulation."
        }
      />
    );
  }

  // Level 2/3: no quantitative claims — show declared parameters and bounds.
  const paramRows: Array<{ label: string; value: string }> = [];
  for (const control of spec.controls) {
    if (control.target.kind === "parameter") {
      const value = parameters[control.target.ref];
      paramRows.push({
        label: control.label,
        value: value !== undefined ? String(value) : "—",
      });
    }
  }
  const limitRows = [
    { label: "Max objects", value: String(spec.limits.maxObjects) },
    { label: "Max particles", value: String(spec.limits.maxParticles) },
    { label: "Max timeline events", value: String(spec.limits.maxTimelineEvents) },
    { label: "Max controls", value: String(spec.limits.maxControls) },
  ];
  return (
    <DataTable
      caption="Declared parameters and limits"
      rows={[...paramRows, ...limitRows]}
      note="This demonstration makes no quantitative claims; these are declared values, not measurements."
    />
  );
}

function DataTable({
  caption,
  rows,
  note,
}: {
  caption: string;
  rows: Array<{ label: string; value: string }>;
  note: string;
}) {
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <caption className="pb-2 text-left text-sm font-medium">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Name
            </th>
            <th scope="col" className="py-2 font-medium">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-3 text-muted">
                Nothing to show yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.label} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 text-muted-strong">{row.label}</td>
                <td className="py-2 font-mono">{row.value}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text sequence (observation prompts + limitations as steps)
// ---------------------------------------------------------------------------

export function TextSequenceView({ spec }: { spec: DemoSpecV1 }) {
  const steps: Array<{ heading: string; body: string }> = [];
  for (const prompt of spec.observationPrompts) {
    steps.push({ heading: "Observe", body: prompt.prompt });
  }
  steps.push({ heading: "Goal", body: spec.learningObjective });
  if (spec.trust.limitations.length > 0) {
    for (const limitation of spec.trust.limitations) {
      steps.push({ heading: "Keep in mind", body: limitation });
    }
  } else {
    steps.push({
      heading: "Keep in mind",
      body: "This demonstration declares no specific limitations.",
    });
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Guided steps">
      {steps.map((step, index) => (
        <li key={index} className="rounded-lg border border-border bg-surface-raised p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Step {index + 1} · {step.heading}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-strong">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
