"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN } from "@/domain/learner";
import { useSession } from "@/lib/supabase/use-session";
import type { LearnerPreferencesRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  CURRENT_ONBOARDING_VERSION,
  emptyOnboardingDraft,
  onboardingDraftSchema,
  type ExplanationStyle,
  type LearningGoal,
  type LearningPace,
  type OnboardingDraft,
} from "@/personalization/onboarding-schema";
import {
  draftToPreferencesRow,
  EXPLANATION_LABELS,
  GOAL_LABELS,
  PACE_LABELS,
} from "@/personalization/profile-to-learner-preferences";

/**
 * Four-step onboarding wizard (copy spec §4). One question per step, under a
 * minute, keyboard-operable, and refresh-safe: every selection and every step
 * change is persisted to `unseenlab.onboarding-draft.v1` (zod-validated on
 * read, so corrupt data falls back to a clean draft). Completion writes the
 * learner_preferences row and bumps the profile's onboarding version, then
 * lands on /dashboard. When the browser client is unavailable the wizard
 * still lets the learner finish locally and says so calmly.
 */

export const ONBOARDING_DRAFT_KEY = "unseenlab.onboarding-draft.v1";

export const SUGGESTED_TOPICS = [
  "Nuclear chain reactions",
  "Why reactions accelerate",
  "How absorbers change reactions",
] as const;

const TEXT_SCALE_STEP = 0.05;
const MAX_TOPICS = 12;
const MAX_TOPIC_LENGTH = 40;

const goalOptions: Array<{ value: LearningGoal; label: string }> = [
  { value: "understand_concept", label: "Understand a difficult concept." },
  { value: "prepare_for_class", label: "Prepare for class or a test." },
  { value: "explore_experiments", label: "Explore through experiments." },
];

const explanationOptions: Array<{ value: ExplanationStyle; label: string }> = [
  { value: "visual_first", label: "Show me visually first." },
  { value: "step_by_step", label: "Walk me through it step by step." },
  { value: "concise", label: "Keep it concise." },
];

const paceOptions: Array<{ value: LearningPace; label: string }> = [
  { value: "calm", label: "Calm pace" },
  { value: "balanced", label: "Balanced pace" },
  { value: "quick", label: "Quick pace" },
];

function roundScale(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reads and validates the persisted draft; corrupt data yields null. */
function readStoredDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = onboardingDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Converts a stored learner_preferences row into a starting draft (rerun). */
function draftFromPreferences(prefs: LearnerPreferencesRow): OnboardingDraft {
  return {
    step: 1,
    learningGoal: prefs.learning_goal,
    explanationStyle: prefs.explanation_style,
    learningPace: prefs.learning_pace,
    reducedMotion: prefs.reduced_motion,
    textScale: roundScale(prefs.text_scale),
    highContrast: prefs.high_contrast,
    topicInterests: prefs.topic_interests,
  };
}

function RadioCard({
  label,
  checked,
  name,
  onChange,
}: {
  label: string;
  checked: boolean;
  name: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50",
        checked
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-background text-foreground hover:bg-muted/40"
      )}
    >
      <input
        type="radio"
        name={name}
        value={label}
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="sr-only"
      />
      {label}
    </label>
  );
}

export function OnboardingWizard({
  initialPrefs = null,
}: {
  initialPrefs?: LearnerPreferencesRow | null;
}) {
  const router = useRouter();
  const { user, loading, client } = useSession();

  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const stored = readStoredDraft();
    if (stored) return stored;
    return initialPrefs
      ? draftFromPreferences(initialPrefs)
      : emptyOnboardingDraft();
  });
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveUnavailable, setSaveUnavailable] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // On every step change the question heading takes focus so keyboard users
  // always know where they are. The wizard is a plain page flow — no modal,
  // so no focus trap is needed.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [draft.step]);

  const updateDraft = (next: OnboardingDraft) => {
    setDraft(next);
    try {
      window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode, quota) — never block the wizard.
    }
  };

  const goTo = (step: number) => updateDraft({ ...draft, step });

  const addTopic = (raw: string) => {
    const topic = raw.trim();
    if (!topic) return;
    if (topic.length > MAX_TOPIC_LENGTH) {
      setTopicError(true);
      return;
    }
    setTopicError(false);
    if (
      draft.topicInterests.includes(topic) ||
      draft.topicInterests.length >= MAX_TOPICS
    ) {
      return;
    }
    updateDraft({
      ...draft,
      topicInterests: [...draft.topicInterests, topic],
    });
    setTopicInput("");
  };

  const removeTopic = (topic: string) => {
    updateDraft({
      ...draft,
      topicInterests: draft.topicInterests.filter((t) => t !== topic),
    });
  };

  /**
   * Completes onboarding: upserts learner_preferences, bumps
   * profiles.onboarding_version, clears the draft, and redirects. If the
   * browser client is unavailable the learner still finishes locally — a calm
   * notice says the account save did not happen. On a real save error the
   * draft is retained and a Retry is offered (ERR-07).
   */
  const completeWithPreferences = async (finalDraft: OnboardingDraft) => {
    if (!user) return;
    setSaving(true);
    setSaveError(false);
    setSaveUnavailable(false);
    try {
      if (client) {
        const { error: prefsError } = await client
          .from("learner_preferences")
          .upsert({ ...draftToPreferencesRow(finalDraft), user_id: user.id });
        if (prefsError) throw prefsError;

        const { error: profileError } = await client
          .from("profiles")
          .update({
            onboarding_version: CURRENT_ONBOARDING_VERSION,
            onboarding_completed_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        if (profileError) throw profileError;
      } else {
        setSaveUnavailable(true);
      }
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      router.push("/dashboard");
    } catch {
      // Draft is intentionally retained so nothing is lost.
      setSaveError(true);
      setSaving(false);
    }
  };

  /**
   * "Skip for now" (step 1, OB-C5): bumps the onboarding version so the gate
   * stays closed, writes no preferences (database defaults apply), and heads
   * to the dashboard. Best-effort — leaving the wizard never blocks on the
   * network.
   */
  const skipOnboarding = async () => {
    try {
      if (client && user) {
        await client
          .from("profiles")
          .update({
            onboarding_version: CURRENT_ONBOARDING_VERSION,
            onboarding_completed_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
      }
    } catch {
      // Ignored on purpose.
    } finally {
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      router.push("/dashboard");
    }
  };

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading onboarding"
        className="w-full max-w-xl space-y-4"
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (!user) return null;

  const step = draft.step;

  const reviewRows = [
    { key: "goal", text: `Help with: ${GOAL_LABELS[draft.learningGoal]}`, step: 1 },
    {
      key: "explanation",
      text: `Explanations: ${EXPLANATION_LABELS[draft.explanationStyle]}`,
      step: 2,
    },
    { key: "pace", text: `Pace: ${PACE_LABELS[draft.learningPace]}`, step: 3 },
    { key: "motion", text: `Motion: ${draft.reducedMotion ? "On" : "Off"}`, step: 3 },
    {
      key: "text",
      text: `Text size: ${Math.round(draft.textScale * 100)}%`,
      step: 3,
    },
    { key: "contrast", text: `High contrast: ${draft.highContrast ? "On" : "Off"}`, step: 3 },
    {
      key: "topics",
      text: `Topics: ${
        draft.topicInterests.length > 0
          ? draft.topicInterests.join(", ")
          : "None yet"
      }`,
      step: 4,
    },
  ];

  return (
    <div
      data-testid="onboarding-wizard"
      className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="mb-6 flex justify-end">
        {step === 1 && (
          <button
            type="button"
            onClick={skipOnboarding}
            className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Skip for now
          </button>
        )}
      </div>

      <p role="status" className="text-sm font-semibold text-muted-foreground">
        Step {step} of 4
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={step}
        aria-label="Onboarding progress"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      {step === 1 && (
        <section className="mt-6">
          <h1
            id="ob-q-step-1"
            tabIndex={-1}
            ref={headingRef}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            What would you like help doing?
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This shapes how your dashboard guides you. You can change it
            anytime.
          </p>
          <fieldset aria-labelledby="ob-q-step-1" className="mt-6 space-y-3">
            {goalOptions.map((option) => (
              <RadioCard
                key={option.value}
                name="ob-learning-goal"
                label={option.label}
                checked={draft.learningGoal === option.value}
                onChange={() =>
                  updateDraft({ ...draft, learningGoal: option.value })
                }
              />
            ))}
          </fieldset>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6">
          <h1
            id="ob-q-step-2"
            tabIndex={-1}
            ref={headingRef}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            How do explanations make the most sense to you?
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            There&apos;s no right answer — choose what feels clearest to you.
          </p>
          <fieldset aria-labelledby="ob-q-step-2" className="mt-6 space-y-3">
            {explanationOptions.map((option) => (
              <RadioCard
                key={option.value}
                name="ob-explanation-style"
                label={option.label}
                checked={draft.explanationStyle === option.value}
                onChange={() =>
                  updateDraft({ ...draft, explanationStyle: option.value })
                }
              />
            ))}
          </fieldset>
        </section>
      )}

      {step === 3 && (
        <section className="mt-6">
          <h1
            id="ob-q-step-3"
            tabIndex={-1}
            ref={headingRef}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            What should the experience feel like?
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pick a pace and any adjustments that make the lab comfortable. You
            can change these in Settings anytime.
          </p>
          <fieldset aria-labelledby="ob-q-step-3" className="mt-6 space-y-3">
            {paceOptions.map((option) => (
              <RadioCard
                key={option.value}
                name="ob-learning-pace"
                label={option.label}
                checked={draft.learningPace === option.value}
                onChange={() =>
                  updateDraft({ ...draft, learningPace: option.value })
                }
              />
            ))}
          </fieldset>

          <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Reduce animation motion</span>
              <Switch
                checked={draft.reducedMotion}
                onCheckedChange={(checked) =>
                  updateDraft({ ...draft, reducedMotion: checked })
                }
                aria-label="Reduce animation motion"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Text size</span>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateDraft({
                      ...draft,
                      textScale: roundScale(
                        Math.max(TEXT_SCALE_MIN, draft.textScale - TEXT_SCALE_STEP)
                      ),
                    })
                  }
                  disabled={draft.textScale <= TEXT_SCALE_MIN}
                >
                  Decrease text size
                </Button>
                <span
                  role="status"
                  className="w-24 text-right text-sm tabular-nums text-muted-foreground"
                >
                  Text size: {Math.round(draft.textScale * 100)}%
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateDraft({
                      ...draft,
                      textScale: roundScale(
                        Math.min(TEXT_SCALE_MAX, draft.textScale + TEXT_SCALE_STEP)
                      ),
                    })
                  }
                  disabled={draft.textScale >= TEXT_SCALE_MAX}
                >
                  Increase text size
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">High contrast</span>
              <Switch
                checked={draft.highContrast}
                onCheckedChange={(checked) =>
                  updateDraft({ ...draft, highContrast: checked })
                }
                aria-label="High contrast"
              />
            </div>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="mt-6">
          <h1
            id="ob-q-step-4"
            tabIndex={-1}
            ref={headingRef}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            What topics are you working on?
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Optional — add a few topics and we&apos;ll point you to relevant
            labs as they become available. The Nuclear Chain Reaction lab is
            ready now.
          </p>

          <div className="mt-6">
            <Input
              aria-label="Add a topic"
              placeholder="Add a topic and press Enter"
              value={topicInput}
              onChange={(event) => {
                setTopicInput(event.target.value);
                if (topicError) setTopicError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTopic(topicInput);
                }
              }}
              disabled={draft.topicInterests.length >= MAX_TOPICS}
              aria-invalid={topicError || undefined}
            />
            {topicError && (
              <p role="alert" className="mt-2 text-sm text-danger">
                Each topic can be up to 40 characters.
              </p>
            )}
            {draft.topicInterests.length >= MAX_TOPICS && (
              <p className="mt-2 text-xs text-muted-foreground">
                You can add up to 12 topics.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => addTopic(topic)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {topic}
                </button>
              ))}
            </div>
            {draft.topicInterests.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {draft.topicInterests.map((topic) => (
                  <li
                    key={topic}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-foreground"
                  >
                    {topic}
                    <button
                      type="button"
                      aria-label={`Remove ${topic}`}
                      onClick={() => removeTopic(topic)}
                      className="min-h-6 min-w-6 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
            <h2 className="text-sm font-semibold">Your choices</h2>
            <div className="mt-3 space-y-2">
              {reviewRows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-foreground">{row.text}</span>
                  <button
                    type="button"
                    onClick={() => goTo(row.step)}
                    className="shrink-0 text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
                  >
                    Change
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 1 ? (
          <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>
            Back
          </Button>
        ) : (
          <span aria-hidden="true" />
        )}
        <div className="flex items-center gap-3">
          {step === 4 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => completeWithPreferences({ ...draft, topicInterests: [] })}
              disabled={saving}
            >
              Skip
            </Button>
          )}
          {step < 4 ? (
            <Button type="button" onClick={() => goTo(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => completeWithPreferences(draft)}
              disabled={saving}
            >
              Start learning
            </Button>
          )}
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-foreground"
        >
          <span>We couldn&apos;t save your preferences. Try again.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => completeWithPreferences(draft)}
            disabled={saving}
          >
            Retry
          </Button>
        </div>
      )}
      {saveUnavailable && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        >
          We couldn&apos;t save to your account right now. Your choices are
          stored on this device.
        </p>
      )}
    </div>
  );
}
