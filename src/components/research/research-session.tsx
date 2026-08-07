"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { EXPLANATION_LABELS } from "@/personalization/profile-to-learner-preferences";
import { EXPLANATION_STYLES } from "@/personalization/onboarding-schema";
import type { ResearchSession as ResearchSessionRecord } from "@/research/research-recorder";
import {
  RESEARCH_CONCEPT_QUESTION,
  RESEARCH_LABEL,
  attachResearchPost,
  clearAllResearchData,
  createResearchSession,
  downloadResearchExport,
  getResearchConsent,
  getResearchNotes,
  loadResearchSession,
  saveResearchNotes,
  setResearchConsent,
} from "@/research/research-recorder";

/**
 * Facilitator-only research session page: consent gate, pre/post measures,
 * lab entry with recording enabled, facilitator notes, anonymized export, and
 * a full research-data wipe. Everything stays in localStorage until the
 * facilitator explicitly exports. Declined consent records nothing.
 */
export function ResearchSession() {
  const [consent, setConsent] = useState(getResearchConsent);
  const [session, setSession] = useState<ResearchSessionRecord | null>(() =>
    loadResearchSession(),
  );
  const [notes, setNotes] = useState(getResearchNotes);
  const [exported, setExported] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const handleAgree = useCallback(() => {
    setResearchConsent("agreed");
    setConsent("agreed");
  }, []);

  const handleDecline = useCallback(() => {
    setResearchConsent("declined");
    setConsent("declined");
  }, []);

  const handlePreSubmitted = useCallback(() => {
    setSession(loadResearchSession());
  }, []);

  const handlePostSubmitted = useCallback(() => {
    setSession(loadResearchSession());
  }, []);

  const handleExport = useCallback(() => {
    setExported(downloadResearchExport());
  }, []);

  const handleClear = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    clearAllResearchData();
    setClearConfirm(false);
    setSession(null);
    setNotes("");
    setExported(false);
    setConsent(null);
  }, [clearConfirm]);

  if (consent === null) {
    return (
      <ConsentGate onAgree={handleAgree} onDecline={handleDecline} />
    );
  }

  if (consent === "declined") {
    return <DeclinedView onChangeDecision={() => setConsent(null)} />;
  }

  const preRecorded = session?.pre != null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <p className="text-sm leading-6 text-muted">{RESEARCH_LABEL}</p>

      {!preRecorded && (
        <PreForm
          sessionId={session?.sessionId ?? null}
          onSubmit={handlePreSubmitted}
        />
      )}

      {preRecorded && <SessionCard session={session!} />}

      <PostForm
        session={session}
        disabled={!preRecorded}
        onSubmit={handlePostSubmitted}
      />

      <section
        aria-label="Facilitator notes"
        className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      >
        <h2 className="font-semibold">Facilitator notes</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          Manual observations only: hesitation timestamps, help requests,
          verbal comments, navigation confusion. Saved locally as you type;
          included in the export.
        </p>
        <textarea
          aria-label="Facilitator notes log"
          rows={5}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            saveResearchNotes(event.target.value);
          }}
          className="mt-3 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm leading-6"
          placeholder="e.g. 00:00:42 — long pause before adjusting the absorber; asked for reassurance once."
        />
      </section>

      <section
        aria-label="Export and cleanup"
        className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      >
        <h2 className="font-semibold">Export and cleanup</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          The export contains the session id, consent state, pre/post answers,
          interaction evidence, facilitator notes, and timestamps — no email,
          no account token, no diagnosis.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={session === null}
            className="rounded-lg bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export anonymized session (JSON)
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-danger/50 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
          >
            {clearConfirm
              ? "Really clear all research data? Press again to confirm"
              : "Clear all research data"}
          </button>
        </div>
        {exported && (
          <p role="status" className="mt-3 text-sm text-foreground">
            Export downloaded.
          </p>
        )}
      </section>
    </div>
  );
}

/** Consent copy shown to the participant at the research gate. */
export const CONSENT_COPY =
  "This session is voluntary — you can stop at any time, no questions asked. If you agree, we may collect anonymized notes, anonymized quotes, anonymized screenshots, and your responses to help improve the product. Recording is optional and only happens with your permission. This is not a diagnosis or an evaluation of you, and taking part does not guarantee any learning benefit.";

function ConsentGate({
  onAgree,
  onDecline,
}: {
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <section
      aria-label="Research consent"
      className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <h1 className="text-xl font-semibold tracking-tight">
        Product research session
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground">{CONSENT_COPY}</p>
      <p className="mt-2 text-xs leading-5 text-muted">
        Everything stays on this device until the facilitator exports an
        anonymous JSON file. No account is required.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onAgree}
          className="rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Agree and begin
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-raised"
        >
          Continue without research recording
        </button>
      </div>
    </section>
  );
}

function DeclinedView({
  onChangeDecision,
}: {
  onChangeDecision: () => void;
}) {
  return (
    <section
      aria-label="Research recording is off"
      className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <h1 className="text-xl font-semibold tracking-tight">
        Research recording is OFF
      </h1>
      <p className="mt-3 text-sm leading-6 text-foreground">
        You chose to continue without research recording. You can still use the
        lab normally — nothing from this session will be recorded, exported, or
        kept on this device.
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        No research data is being collected.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/lab/nuclear-chain-reaction"
          className="rounded-lg bg-accent-strong px-4 py-2.5 text-center text-sm font-semibold text-white hover:brightness-110"
        >
          Open the lab without recording
        </Link>
        <button
          type="button"
          onClick={onChangeDecision}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-raised"
        >
          Change decision
        </button>
      </div>
    </section>
  );
}

function PreForm({
  sessionId,
  onSubmit,
}: {
  sessionId: string | null;
  onSubmit: () => void;
}) {
  const [confidence, setConfidence] = useState(3);
  const [expectedEffort, setExpectedEffort] = useState(3);
  const [explanationStyle, setExplanationStyle] = useState<
    (typeof EXPLANATION_STYLES)[number]
  >("step_by_step");

  return (
    <section
      aria-label="Before the lab"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 className="font-semibold">Before the lab</h2>
      <p className="mt-2 text-sm leading-6 text-foreground">
        {RESEARCH_CONCEPT_QUESTION}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Slider
          id="pre-confidence"
          label="How confident are you in your answer? (1 = not at all, 5 = very)"
          min={1}
          max={5}
          value={confidence}
          onChange={setConfidence}
        />
        <Slider
          id="pre-effort"
          label="How much mental effort do you expect this to take? (1 = little, 5 = a lot)"
          min={1}
          max={5}
          value={expectedEffort}
          onChange={setExpectedEffort}
        />
        <div>
          <label
            htmlFor="pre-explanation-style"
            className="text-sm font-medium"
          >
            Preferred explanation style
          </label>
          <select
            id="pre-explanation-style"
            value={explanationStyle}
            onChange={(event) =>
              setExplanationStyle(
                event.target.value as (typeof EXPLANATION_STYLES)[number],
              )
            }
            className="mt-1 block w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
          >
            {EXPLANATION_STYLES.map((style) => (
              <option key={style} value={style}>
                {EXPLANATION_LABELS[style]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          createResearchSession({
            confidence,
            expectedEffort,
            explanationStyle,
            answeredAt: new Date().toISOString(),
          });
          onSubmit();
        }}
        className="mt-5 rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        Start session
      </button>
      {sessionId && (
        <p className="mt-2 text-xs text-muted">
          Continuing existing session {sessionId.slice(0, 8)}…
        </p>
      )}
    </section>
  );
}

function SessionCard({ session }: { session: ResearchSessionRecord }) {
  return (
    <section
      aria-label="Lab session"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 className="font-semibold">Session started</h2>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Session id</dt>
          <dd className="font-mono text-xs text-foreground">
            {session.sessionId}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Events recorded</dt>
          <dd className="text-foreground">{session.events.length}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Post answers</dt>
          <dd className="text-foreground">{session.post ? "recorded" : "not yet"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-foreground">
        Open the lab to begin. Recording is on.
      </p>
      <Link
        href="/lab/nuclear-chain-reaction?research=1"
        className="mt-2 inline-block rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
      >
        Open the lab (recording ON)
      </Link>
    </section>
  );
}

function PostForm({
  session,
  disabled,
  onSubmit,
}: {
  session: ResearchSessionRecord | null;
  disabled: boolean;
  onSubmit: () => void;
}) {
  const [confidence, setConfidence] = useState(3);
  const [actualEffort, setActualEffort] = useState(3);
  const [clearer, setClearer] = useState("");
  const [confusing, setConfusing] = useState("");
  const [remove, setRemove] = useState("");
  const [keep, setKeep] = useState("");

  const recorded = session?.post != null;

  return (
    <section
      aria-label="After the lab"
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 className="font-semibold">After the lab</h2>
      {disabled ? (
        <p className="mt-2 text-sm text-muted">
          Start the pre-session form first. The post form becomes available
          after the participant has used the lab.
        </p>
      ) : recorded ? (
        <p className="mt-2 text-sm text-foreground">
          Post answers recorded. You can update them and submit again.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-foreground">
            {RESEARCH_CONCEPT_QUESTION}
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Slider
              id="post-confidence"
              label="How confident are you now? (1 = not at all, 5 = very)"
              min={1}
              max={5}
              value={confidence}
              onChange={setConfidence}
            />
            <Slider
              id="post-effort"
              label="How much mental effort did it take? (1 = little, 5 = a lot)"
              min={1}
              max={5}
              value={actualEffort}
              onChange={setActualEffort}
            />
            <FreeText
              id="post-clearer"
              label="What became clearer?"
              value={clearer}
              onChange={setClearer}
            />
            <FreeText
              id="post-confusing"
              label="What remained confusing?"
              value={confusing}
              onChange={setConfusing}
            />
            <FreeText
              id="post-remove"
              label="One thing to remove"
              value={remove}
              onChange={setRemove}
            />
            <FreeText
              id="post-keep"
              label="One thing to keep"
              value={keep}
              onChange={setKeep}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              attachResearchPost({
                confidence,
                actualEffort,
                clearer,
                confusing,
                remove,
                keep,
                answeredAt: new Date().toISOString(),
              });
              onSubmit();
            }}
            className="mt-5 rounded-lg bg-accent-strong px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            Record post answers
          </button>
        </>
      )}
    </section>
  );
}

function FreeText({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm leading-6"
      />
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
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-accent"
      />
    </div>
  );
}
