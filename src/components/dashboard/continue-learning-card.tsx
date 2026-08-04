"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EXPERIMENT_REGISTRY } from "@/domain/experiments";
import type { LearningSessionRow } from "@/lib/supabase/types";

/**
 * Continue learning card (copy spec §5.2). Shows the first in-progress
 * session only, derived from real stored state — never fabricated progress.
 */

/** Real `updated_at`, rendered as e.g. "2 hours ago". */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Lab title from the experiments registry, falling back to the stored title. */
export function labTitleFromSlug(slug: string, fallback: string): string {
  return EXPERIMENT_REGISTRY[slug]?.title ?? fallback;
}

/**
 * Where the learner is inside the session, derived from the saved evidence
 * and workflow JSON: a pending prediction means the next step is to make it;
 * otherwise the next trial number is one past the completed trials.
 */
export function sessionStage(session: LearningSessionRow): string {
  const workflow = session.workflow as { pendingPrediction?: unknown } | null;
  if (workflow?.pendingPrediction) return "Make your prediction";
  const evidence = session.evidence as { trials?: unknown[] } | null;
  const trials = Array.isArray(evidence?.trials) ? evidence.trials.length : 0;
  return `Trial ${trials + 1} of your session`;
}

export function ContinueLearningCard({
  sessions,
}: {
  sessions: LearningSessionRow[];
}) {
  const active = sessions.find((session) => session.status === "active");

  return (
    <section aria-labelledby="continue-learning-heading" className="space-y-3">
      <h2
        id="continue-learning-heading"
        className="text-xl font-semibold tracking-tight"
      >
        Continue learning
      </h2>
      {active ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                {labTitleFromSlug(active.lab_slug, active.title)}
              </h3>
              <Badge variant="secondary">In progress</Badge>
            </div>
            <p className="text-sm font-medium text-accent">
              {sessionStage(active)}
            </p>
            <p className="text-sm text-muted-foreground">
              You last worked on this {formatRelativeTime(active.updated_at)}.
            </p>
            <div>
              <Link
                href={`/lab/nuclear-chain-reaction?resume=${active.id}`}
                className={buttonVariants()}
              >
                Continue session
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Nothing in progress right now.
            </p>
            <Link
              href="/lab/nuclear-chain-reaction"
              className={buttonVariants({ variant: "outline" })}
            >
              Start this lab
            </Link>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
