import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import {
  SettingsTabs,
  type SettingsUserInfo,
} from "@/components/settings/settings-tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { verifySessionUser } from "@/lib/firebase/server";
import { COLLECTIONS, getPlatformDb } from "@/lib/mongo/client";
import type {
  LearnerPreferencesRow,
  ProfileRow,
} from "@/lib/mongo/types";

export const dynamic = "force-dynamic";

/**
 * Mongo rows carry a driver-managed `_id`; destructure it away so documents
 * match the snake_case row contract the UI expects.
 */
function stripDocId<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> {
  const { _id, ...row } = doc;
  return row;
}

function LoadError() {
  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 pt-28 pb-20 sm:px-6">
        <Alert>
          <AlertTitle>Something went wrong.</AlertTitle>
          <AlertDescription>
            We couldn&apos;t load your settings. Please try again in a moment.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link
            href="/settings"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Try again
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function SettingsPage() {
  const user = await verifySessionUser();
  if (!user) redirect("/?auth=open");

  const db = await getPlatformDb();
  if (!db) redirect("/?auth=open");

  let profile: ProfileRow | null = null;
  let preferences: LearnerPreferencesRow | null = null;
  try {
    const [profileDoc, preferencesDoc] = await Promise.all([
      db
        .collection<ProfileRow>(COLLECTIONS.profiles)
        .findOne({ user_id: user.uid }),
      db
        .collection<LearnerPreferencesRow>(COLLECTIONS.learnerPreferences)
        .findOne({ user_id: user.uid }),
    ]);
    if (profileDoc) profile = stripDocId(profileDoc);
    if (preferencesDoc) preferences = stripDocId(preferencesDoc);
  } catch {
    return (
      <div className="bg-background text-foreground">
        <AppHeader />
        <LoadError />
      </div>
    );
  }

  const userInfo: SettingsUserInfo = {
    id: user.uid,
    email: user.email,
    // Only Google is offered today; other providers show no badge.
    provider: user.provider === "google.com" ? "Google" : null,
    avatarUrl: user.avatarUrl,
    fullName: user.displayName,
  };

  return (
    <div className="bg-background text-foreground">
      <AppHeader />
      <SettingsTabs
        initialProfile={profile}
        initialPreferences={preferences}
        user={userInfo}
      />
    </div>
  );
}
