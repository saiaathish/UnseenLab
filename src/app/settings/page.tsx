import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import {
  SettingsTabs,
  type SettingsUserInfo,
} from "@/components/settings/settings-tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

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
  const supabase = await createClient();
  if (!supabase) redirect("/?auth=open");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?auth=open");

  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("learner_preferences").select("*").maybeSingle(),
  ]);

  if (profileResult.error || preferencesResult.error) {
    return (
      <div className="bg-background text-foreground">
        <AppHeader />
        <LoadError />
      </div>
    );
  }

  const userInfo: SettingsUserInfo = {
    id: user.id,
    email: user.email ?? null,
    provider:
      typeof user.app_metadata?.provider === "string"
        ? user.app_metadata.provider
        : null,
    avatarUrl:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : null,
    fullName:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null,
  };

  return (
    <div className="bg-background text-foreground">
      <AppHeader />
      <SettingsTabs
        initialProfile={profileResult.data}
        initialPreferences={preferencesResult.data}
        user={userInfo}
      />
    </div>
  );
}
