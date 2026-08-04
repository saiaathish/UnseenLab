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
import { createClient } from "@/lib/supabase/server-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";
import type {
  Database,
  LearnerPreferencesRow,
  LearningSessionRow,
  ProfileRow,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export type SessionGate =
  | { kind: "redirect"; to: "/?auth=open" }
  | { kind: "ok"; supabase: SupabaseClient<Database>; email: string | null };

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
 * Session gate for the protected dashboard. Returns a redirect target when
 * Supabase is unconfigured or no session user exists, otherwise the client.
 */
export async function resolveSession(
  supabase: SupabaseClient<Database> | null,
): Promise<SessionGate> {
  if (!supabase) return { kind: "redirect", to: "/?auth=open" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "redirect", to: "/?auth=open" };
  return { kind: "ok", supabase, email: user.email ?? null };
}

/**
 * Loads the real dashboard data: profile, learner preferences, and the ten
 * most recent learning sessions. Returns a redirect when onboarding is
 * incomplete, or a calm error state instead of crashing on query failure.
 */
export async function loadDashboardData(
  supabase: SupabaseClient<Database>,
  email: string | null,
): Promise<DashboardLoad> {
  const [profileResult, preferencesResult, sessionsResult] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("learner_preferences").select("*").maybeSingle(),
    supabase
      .from("learning_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  if (profileResult.error || preferencesResult.error || sessionsResult.error) {
    return { kind: "error" };
  }

  const profile = profileResult.data;
  if (!profile || profile.onboarding_version < CURRENT_ONBOARDING_VERSION) {
    return { kind: "redirect", to: "/onboarding" };
  }

  return {
    kind: "ready",
    profile,
    preferences: preferencesResult.data,
    sessions: sessionsResult.data ?? [],
    email,
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

async function DashboardData({
  supabase,
  email,
}: {
  supabase: SupabaseClient<Database>;
  email: string | null;
}) {
  const load = await loadDashboardData(supabase, email);
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
  const gate = await resolveSession(await createClient());
  if (gate.kind === "redirect") redirect(gate.to);

  return (
    <div className="bg-background text-foreground">
      <AppHeader />
      <main id="main-content" className="min-h-screen bg-background">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData supabase={gate.supabase} email={gate.email} />
        </Suspense>
      </main>
    </div>
  );
}
