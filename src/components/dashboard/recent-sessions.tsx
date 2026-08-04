"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LearningSessionRow } from "@/lib/supabase/types";
import { formatRelativeTime, labTitleFromSlug } from "./continue-learning-card";

/**
 * Recent sessions (copy spec §5.5). Real sessions only, newest first, with an
 * honest empty state — never sample or fabricated rows.
 */

export function completedTrialCount(session: LearningSessionRow): number {
  const evidence = session.evidence as { trials?: unknown[] } | null;
  return Array.isArray(evidence?.trials) ? evidence.trials.length : 0;
}

export function RecentSessions({
  sessions,
}: {
  sessions: LearningSessionRow[];
}) {
  const latest = sessions.slice(0, 5);

  return (
    <section aria-labelledby="recent-sessions-heading" className="space-y-3">
      <h2
        id="recent-sessions-heading"
        className="text-xl font-semibold tracking-tight"
      >
        Recent sessions
      </h2>
      {latest.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-2">
            <p className="text-sm font-medium">No sessions yet.</p>
            <p className="text-sm text-muted-foreground">
              Your lab sessions will appear here once you start one.
            </p>
            <div className="mt-1">
              <Link
                href="/lab/nuclear-chain-reaction"
                className={buttonVariants({ variant: "outline" })}
              >
                Start this lab
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {latest.map((session) => {
            const trials = completedTrialCount(session);
            const active = session.status === "active";
            return (
              <li key={session.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold">
                        {labTitleFromSlug(session.lab_slug, session.title)}
                      </h3>
                      <Badge variant={active ? "secondary" : "outline"}>
                        {active ? "In progress" : "Completed"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatRelativeTime(session.updated_at)} · {trials}{" "}
                      completed {trials === 1 ? "trial" : "trials"}
                    </p>
                    <div>
                      <Link
                        href={`/lab/nuclear-chain-reaction?resume=${session.id}`}
                        className={buttonVariants({
                          variant: "outline",
                        })}
                      >
                        {active ? "Resume" : "Review"}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
