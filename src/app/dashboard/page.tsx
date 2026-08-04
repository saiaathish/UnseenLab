import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/navigation/app-header";
import { AvailableLabCard } from "@/components/dashboard/available-lab-card";
import { ContinueLearningCard } from "@/components/dashboard/continue-learning-card";
import { Greeting } from "@/components/dashboard/greeting";
import { PreferenceSummaryCard } from "@/components/dashboard/preference-summary-card";
import { RecentSessions } from "@/components/dashboard/recent-sessions";
import { RecommendedNextStepCard } from "@/components/dashboard/recommendation-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { Db } from "mongodb";
import { verifySessionUser, type SessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type {
  LearnerPreferencesRow,
  LearningSessionRow,
  ProfileRow,
} from "@/lib/mongo/types";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

export const dynamic = "force-dynamic";

export type SessionGate =
  | { kind: "redirect"; to: "/?auth=open" }
  | { kind: "ok"; user: SessionUser };

export type DashboardLoad =
  | { kind: "error" }
  | { kind: "redirect"; to: "/onboarding" }
  | {
      kind: "ready";
      profile: ProfileRow;
      preferences: LearnerPreferencesRow | null;
      sessions: LearningSessionRow[];
      email: string | null;
    };

/**
 * Mongo rows carry a driver-managed `_id`; destructure it away so documents
 * match the snake_case row contract the UI expects.
 */
function stripDocId<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> {
  const { _id, ...row } = doc;
  return row;
}

/**
 * Session gate for the protected dashboard. Returns a redirect target when
 * no verified session user exists, otherwise the user (uid derived from the
 * session cookie — never from a request body).
 */
export async function resolveSession(
  user: SessionUser | null,
): Promise<SessionGate> {
  if (!user) return { kind: "redirect", to: "/?auth=open" };
  return { kind: "ok", user };
}

/**
 * Loads the real dashboard data: profile, learner preferences, and the ten
 * most recent learning sessions. Returns a redirect when onboarding is
 * incomplete, or a calm error state instead of crashing on query failure.
 */
export async function loadDashboardData(
  db: Db,
  user: SessionUser,
): Promise<DashboardLoad> {
  let profileDoc;
  let preferencesDoc;
  let sessionDocs;
  try {
    [profileDoc, preferencesDoc, sessionDocs] = await Promise.all([
      db
        .collection<ProfileRow>(COLLECTIONS.profiles)
        .findOne({ user_id: user.uid }),
      db
        .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
        .findOne({ user_id: user.uid }),
      db
        .collection<LearningSessionRow>(COLLECTIONS.learningSessions)
        .find({ user_id: user.uid })
        .sort({ updated_at: -1 })
        .limit(10)
        .toArray(),
    ]);
  } catch {
    return { kind: "error" };
  }

  const profile = profileDoc ? stripDocId(profileDoc) : null;
  if (!profile || profile.onboarding_version < CURRENT_ONBOARDING_VERSION) {
    return { kind: "redirect", to: "/onboarding" };
  }

  return {
    kind: "ready",
    profile,
    preferences: preferencesDoc ? stripDocId(preferencesDoc) : null,
    sessions: sessionDocs.map((doc) => stripDocId(doc)),
    email: user.email ?? null,
  };
}

/** The rendered dashboard: one section per copy spec §5, in order. */
export function DashboardContent({
  profile,
  preferences,
  sessions,
  email,
}: {
  profile: ProfileRow;
  preferences: LearnerPreferencesRow | null;
  sessions: LearningSessionRow[];
  email: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 pt-28 pb-20 sm:px-6">
      <Greeting displayName={profile.display_name} email={email} />
      <ContinueLearningCard sessions={sessions} />
      <RecommendedNextStepCard sessions={sessions} preferences={preferences} />
      <PreferenceSummaryCard preferences={preferences} />
      <RecentSessions sessions={sessions} />
      <AvailableLabCard />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      data-testid="dashboard-skeleton"
      role="status"
      className="mx-auto w-full max-w-3xl space-y-10 px-4 pt-28 pb-20 sm:px-6"
      aria-label="Loading your dashboard"
    >
      <Skeleton className="h-9 w-72 max-w-full" />
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-28 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export function LoadError() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-28 pb-20 sm:px-6">
      <Alert>
        <AlertTitle>Something went wrong.</AlertTitle>
        <AlertDescription>
          We couldn&apos;t load your dashboard. Please try again in a moment.
        </AlertDescription>
      </Alert>
      <div className="mt-4">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}

async function DashboardData({ db, user }: { db: Db; user: SessionUser }) {
  const load = await loadDashboardData(db, user);
  if (load.kind === "redirect") redirect(load.to);
  if (load.kind === "error") return <LoadError />;
  return (
    <DashboardContent
      profile={load.profile}
      preferences={load.preferences}
      sessions={load.sessions}
      email={load.email}
    />
  );
}

export default async function DashboardPage() {
  const user = await verifySessionUser();
  const gate = await resolveSession(user);
  if (gate.kind === "redirect") redirect(gate.to);

  // Unconfigured MongoDB means no stored platform rows — the same guest mode
  // as an unverified session, so redirect to sign-in rather than render empty.
  const db = await getPlatformDb();
  if (!db) redirect("/?auth=open");

  return (
    <div className="bg-background text-foreground">
      <AppHeader />
      <main id="main-content" className="min-h-screen bg-background">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData db={db} user={gate.user} />
        </Suspense>
      </main>
    </div>
  );
}
