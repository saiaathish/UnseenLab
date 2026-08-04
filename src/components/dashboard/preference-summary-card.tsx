"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DENSITY_LABELS,
  EXPLANATION_LABELS,
  GOAL_LABELS,
  PACE_LABELS,
  REPRESENTATION_LABELS,
} from "@/personalization/profile-to-learner-preferences";
import type { LearnerPreferencesRow } from "@/lib/mongo/types";

/**
 * Your learning preferences (copy spec §5.4). Summary rows show only real
 * saved values; accessibility choices appear only when they are set.
 */

function summaryRows(preferences: LearnerPreferencesRow): string[] {
  const rows: string[] = [
    `Goal: ${GOAL_LABELS[preferences.learning_goal]}`,
    `Explanations: ${EXPLANATION_LABELS[preferences.explanation_style]}`,
    `Pace: ${PACE_LABELS[preferences.learning_pace]}`,
    `Representation: ${REPRESENTATION_LABELS[preferences.preferred_representation]}`,
    `Information density: ${DENSITY_LABELS[preferences.information_density]}`,
  ];
  if (preferences.one_variable_mode) rows.push("One-variable mode: On");
  if (preferences.reduced_motion) rows.push("Reduced motion: On");
  if (preferences.high_contrast) rows.push("High contrast: On");
  if (preferences.text_scale > 1) {
    rows.push(`Text size: ${Math.round(preferences.text_scale * 100)}%`);
  }
  if (preferences.topic_interests.length > 0) {
    rows.push(`Topics: ${preferences.topic_interests.join(", ")}`);
  }
  return rows;
}

export function PreferenceSummaryCard({
  preferences,
}: {
  preferences: LearnerPreferencesRow | null;
}) {
  return (
    <section
      aria-labelledby="preference-summary-heading"
      className="space-y-3"
    >
      <h2
        id="preference-summary-heading"
        className="text-xl font-semibold tracking-tight"
      >
        Your learning preferences
      </h2>
      {preferences ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {summaryRows(preferences).map((row) => (
                <li key={row} className="text-foreground">
                  {row}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              You can change these anytime.
            </p>
            <div>
              <Link href="/settings" className={buttonVariants()}>
                Adjust preferences
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">No preferences yet.</p>
            <p className="text-sm text-muted-foreground">
              Set them up now — it takes under a minute — or keep exploring
              without them.
            </p>
            <div className="mt-1">
              <Link href="/onboarding" className={buttonVariants()}>
                Set up preferences
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
