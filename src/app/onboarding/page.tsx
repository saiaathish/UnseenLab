import { redirect } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type {
  LearnerPreferencesRow,
  ProfileRow,
} from "@/lib/mongo/types";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

export const dynamic = "force-dynamic";

/**
 * Mongo rows carry a driver-managed `_id`; destructure it away so documents
 * match the snake_case row contract the UI expects.
 */
function stripDocId<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> {
  const { _id, ...row } = doc;
  return row;
}

/**
 * /onboarding — protected route. The proxy already gates the route
 * (src/proxy.ts), and the page verifies the session again server-side as
 * defense in depth: no session (or unconfigured Firebase/MongoDB) sends the
 * visitor to the sign-in dialog via `/?auth=open`; a profile that already
 * carries the current onboarding version goes straight to /dashboard
 * (version gate), unless `?rerun=1` explicitly asks to redo onboarding from
 * Settings.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ rerun?: string }>;
}) {
  const user = await verifySessionUser();
  if (!user) redirect("/?auth=open");

  const db = await getPlatformDb();
  if (!db) redirect("/?auth=open");

  const rerun = (await searchParams).rerun === "1";

  const profileDoc = await db
    .collection<ProfileRow>(COLLECTIONS.profiles)
    .findOne({ user_id: user.uid });
  const profile = profileDoc ? stripDocId(profileDoc) : null;

  if (
    !rerun &&
    profile &&
    (profile.onboarding_version ?? 0) >= CURRENT_ONBOARDING_VERSION
  ) {
    redirect("/dashboard");
  }

  // Rerun mode prefills the wizard with the saved preferences so existing
  // learners see their current choices.
  const preferencesDoc = rerun
    ? await db
        .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
        .findOne({ user_id: user.uid })
    : null;
  const initialPrefs = preferencesDoc ? stripDocId(preferencesDoc) : null;

  return (
    <>
      <AppHeader />
      <main
        id="main-content"
        className="flex min-h-dvh flex-col items-center justify-center px-4 py-24"
      >
        <OnboardingWizard initialPrefs={initialPrefs} />
      </main>
    </>
  );
}
