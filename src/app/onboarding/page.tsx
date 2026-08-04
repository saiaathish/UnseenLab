import { redirect } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { createClient } from "@/lib/supabase/server-client";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

export const dynamic = "force-dynamic";

/**
 * /onboarding — protected route. The proxy already gates the route
 * (src/proxy.ts), and the page verifies the session again server-side as
 * defense in depth: no session (or unconfigured Supabase) sends the visitor
 * to the sign-in dialog via `/?auth=open`; a profile that already carries the
 * current onboarding version goes straight to /dashboard (version gate),
 * unless `?rerun=1` explicitly asks to redo onboarding from Settings.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ rerun?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/?auth=open");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?auth=open");

  const rerun = (await searchParams).rerun === "1";

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_version")
    .maybeSingle();

  if (
    !rerun &&
    profile &&
    (profile.onboarding_version ?? 0) >= CURRENT_ONBOARDING_VERSION
  ) {
    redirect("/dashboard");
  }

  // Rerun mode prefills the wizard with the saved preferences so existing
  // learners see their current choices.
  const { data: preferences } = rerun
    ? await supabase.from("learner_preferences").select("*").maybeSingle()
    : { data: null };

  return (
    <>
      <AppHeader />
      <main
        id="main-content"
        className="flex min-h-dvh flex-col items-center justify-center px-4 py-24"
      >
        <OnboardingWizard initialPrefs={preferences} />
      </main>
    </>
  );
}
