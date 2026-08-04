"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";
import { GOAL_LABELS } from "@/personalization/profile-to-learner-preferences";
import type {
  LearnerPreferencesRow,
  LearningSessionRow,
} from "@/lib/mongo/types";
import { formatRelativeTime, labTitleFromSlug } from "./continue-learning-card";

/**
 * Recommended next step (copy spec §5.3). Deterministic rules R1–R6 computed
 * from REAL state only — never AI-generated, never "recommended for you".
 */

export interface RecommendedStep {
  title: string;
  supporting: string | null;
  actionLabel: string;
  href: string;
}

export function recommendedNextStep(
  sessions: LearningSessionRow[],
  preferences: LearnerPreferencesRow | null,
): RecommendedStep | null {
  const lab = NUCLEAR_CHAIN_REACTION_EXPERIMENT;
  const labHref = `/lab/${lab.slug}`;

  // R1 — an in-progress session exists.
  const active = sessions.find((session) => session.status === "active");
  if (active) {
    const title = labTitleFromSlug(active.lab_slug, active.title);
    return {
      title: `Resume your ${title} session`,
      supporting: `You last worked on this ${formatRelativeTime(active.updated_at)}.`,
      actionLabel: "Resume",
      href: `${labHref}?resume=${active.id}`,
    };
  }

  const goal = preferences?.learning_goal ?? null;
  const hasCompleted = sessions.some((session) => session.status === "complete");

  // R2–R4 — completed sessions, guided by the stored learning goal.
  if (hasCompleted && goal) {
    const goalLabel = GOAL_LABELS[goal].toLowerCase();
    if (goal === "understand_concept") {
      return {
        title: "Try changing one variable to deepen your understanding.",
        supporting: `From your goal: ${goalLabel}.`,
        actionLabel: "Start this lab",
        href: labHref,
      };
    }
    if (goal === "prepare_for_class") {
      return {
        title: `Run a quick review of the ${lab.title} lab before class.`,
        supporting: `From your goal: ${goalLabel}.`,
        actionLabel: "Start this lab",
        href: labHref,
      };
    }
    return {
      title: `Explore a new run in the ${lab.title} lab.`,
      supporting: `From your goal: ${goalLabel}.`,
      actionLabel: "Start this lab",
      href: labHref,
    };
  }

  // R5 — no sessions at all.
  if (sessions.length === 0) {
    return {
      title: "Start your first lab — the Nuclear Chain Reaction lab is ready now.",
      supporting: null,
      actionLabel: "Start this lab",
      href: labHref,
    };
  }

  // R6 — onboarding skipped, no goal stored.
  if (!goal) {
    return {
      title: "Continue with the Nuclear Chain Reaction lab.",
      supporting: null,
      actionLabel: "Start this lab",
      href: labHref,
    };
  }

  return null;
}

export function RecommendedNextStepCard({
  sessions,
  preferences,
}: {
  sessions: LearningSessionRow[];
  preferences: LearnerPreferencesRow | null;
}) {
  const step = recommendedNextStep(sessions, preferences);
  if (!step) return null;

  return (
    <section
      aria-labelledby="recommended-next-step-heading"
      className="space-y-3"
    >
      <h2
        id="recommended-next-step-heading"
        className="text-xl font-semibold tracking-tight"
      >
        Recommended next step
      </h2>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <h3 className="text-base font-medium">{step.title}</h3>
          {step.supporting ? (
            <p className="text-sm text-muted-foreground">{step.supporting}</p>
          ) : null}
          <div className="mt-1">
            <Link href={step.href} className={buttonVariants()}>
              {step.actionLabel}
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
