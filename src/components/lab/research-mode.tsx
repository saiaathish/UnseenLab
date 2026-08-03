"use client";

import { useState } from "react";
import type { LocalSession } from "@/storage/session-storage";
import {
  clearLocalSession,
  downloadSessionJson,
  exportSessionJson,
} from "@/storage/session-storage";
import type { LearnerPreferences } from "@/domain/learner";

interface Props {
  session: LocalSession;
  preferences: LearnerPreferences;
  onClear: () => void;
}

const FEEDBACK_LABEL =
  "Initial design case study evidence. Not a statistically validated learning study.";

/**
 * Local, anonymous research mode. Pre/post questions, confidence, mental
 * effort, and free-text feedback. Everything stays on the device; the JSON
 * export is the only way data leaves the app, and it is learner-initiated.
 * The free-text answers are intentionally NOT part of the persistence schema
 * in this commit (see session-storage); they live in component state.
 */
export function ResearchMode({ session, onClear }: Props) {
  const [preConfidence, setPreConfidence] = useState(3);
  const [preEffort, setPreEffort] = useState(3);
  const [preLearning, setPreLearning] = useState("");
  const [postConfidence, setPostConfidence] = useState(3);
  const [postEffort, setPostEffort] = useState(3);
  const [clearer, setClearer] = useState("");
  const [confusing, setConfusing] = useState("");
  const [removeOrChange, setRemoveOrChange] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);

  const trialCount = session.evidence.trials.length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label="Before using the lab">
        <h3 className="font-semibold">Before you used the lab</h3>
        <div className="mt-3 flex flex-col gap-3">
          <Slider
            id="pre-confidence"
            label="How confident are you that you understand chain reactions?"
            min={1}
            max={5}
            value={preConfidence}
            onChange={setPreConfidence}
          />
          <Slider
            id="pre-effort"
            label="How much mental effort do you expect this to take?"
            min={1}
            max={5}
            value={preEffort}
            onChange={setPreEffort}
          />
          <label htmlFor="pre-learning" className="flex flex-col gap-1 text-sm">
            What helps you learn best?
            <textarea
              id="pre-learning"
              rows={2}
              value={preLearning}
              onChange={(e) => setPreLearning(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section aria-label="After using the lab">
        <h3 className="font-semibold">After you used the lab</h3>
        <div className="mt-3 flex flex-col gap-3">
          <Slider
            id="post-confidence"
            label="How confident are you now?"
            min={1}
            max={5}
            value={postConfidence}
            onChange={setPostConfidence}
          />
          <Slider
            id="post-effort"
            label="How much mental effort did it take?"
            min={1}
            max={5}
            value={postEffort}
            onChange={setPostEffort}
          />
          <label htmlFor="post-clearer" className="flex flex-col gap-1 text-sm">
            What became clearer?
            <textarea
              id="post-clearer"
              rows={2}
              value={clearer}
              onChange={(e) => setClearer(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
          <label htmlFor="post-confusing" className="flex flex-col gap-1 text-sm">
            What remained confusing?
            <textarea
              id="post-confusing"
              rows={2}
              value={confusing}
              onChange={(e) => setConfusing(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
          <label htmlFor="post-remove" className="flex flex-col gap-1 text-sm">
            What should we remove or change?
            <textarea
              id="post-remove"
              rows={2}
              value={removeOrChange}
              onChange={(e) => setRemoveOrChange(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <div className="lg:col-span-2">
        <p className="text-sm text-muted">{FEEDBACK_LABEL}</p>
        <p className="mt-1 text-sm text-muted">
          Trials recorded on this device: {trialCount}. Nothing is transmitted
          externally — the export button below is the only way your anonymous
          session can leave this browser.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadSessionJson(session)}
            className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Export anonymous session data (JSON)
          </button>
          <button
            type="button"
            onClick={() => {
              if (!clearConfirm) {
                setClearConfirm(true);
                return;
              }
              clearLocalSession();
              onClear();
              setClearConfirm(false);
              setClearer("");
              setConfusing("");
              setRemoveOrChange("");
            }}
            className="rounded-lg border border-danger/50 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
          >
            {clearConfirm ? "Really clear? Press again to confirm" : "Clear local session"}
          </button>
        </div>
        <pre
          className="mt-4 hidden max-h-64 overflow-auto rounded-lg bg-surface-raised p-3 text-xs"
          aria-hidden="true"
        >
          {exportSessionJson(session)}
        </pre>
      </div>
    </div>
  );
}

function Slider({
  id,
  label,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-sm text-muted">
          {value}/{max}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-accent"
      />
    </div>
  );
}
