"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { useSession } from "@/lib/firebase/use-session";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";
import type { ProfileRow } from "@/lib/mongo/types";
import type { SettingsUserInfo } from "./settings-tabs";

/**
 * Profile tab (copy spec §6.1). Display name edit, avatar preview, provider
 * note, onboarding status, and a link to rerun onboarding.
 */

function initialsFor(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "U";
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileSettings({
  profile,
  onProfileChange,
  user,
}: {
  profile: ProfileRow | null;
  onProfileChange: (profile: ProfileRow | null) => void;
  user: SettingsUserInfo;
}) {
  const { user: sessionUser } = useSession();
  const [displayName, setDisplayName] = useState(
    profile?.display_name ?? user.fullName ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const provider = sessionUser?.provider ?? user.provider;
  const avatarUrl = profile?.avatar_url ?? user.avatarUrl;

  const onboardingComplete =
    profile !== null &&
    profile.onboarding_version >= CURRENT_ONBOARDING_VERSION;

  const handleSave = async () => {
    const trimmed = displayName.trim();
    setSaving(true);
    setStatus("idle");
    try {
      if (!isFirebaseConfigured()) {
        setStatus("error");
        return;
      }
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: trimmed.length > 0 ? trimmed : null,
        }),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      if (profile) {
        onProfileChange({ ...profile, display_name: trimmed || null });
      }
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="profile-heading" className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Account details</p>
        <h2
          id="profile-heading"
          className="mt-1 text-2xl font-semibold tracking-tight"
        >
          Profile
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Update the name and account information used across your learning
          workspace.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col justify-between gap-8 bg-muted/30 p-6 sm:p-8 lg:border-r">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-4 ring-background sm:h-20 sm:w-20">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-xl">
                  {initialsFor(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">
                  {displayName.trim() || "Learner"}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {user.email ?? "No email on file"}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Sign-in method</span>
                <span className="font-medium">{providerLabel(provider)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Learning setup</span>
                <span className="font-medium text-right">
                  {onboardingComplete ? "Complete" : "In progress"}
                </span>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <CardHeader className="p-6 pb-0 sm:p-8 sm:pb-0">
              <CardTitle className="text-base">Personal information</CardTitle>
              <CardDescription>
                This is how your account appears in UnseenLab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="profile-display-name"
                    className="text-sm font-medium"
                  >
                    Display name
                  </label>
                  <Input
                    id="profile-display-name"
                    value={displayName}
                    maxLength={60}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      setStatus("idle");
                    }}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <span className="block text-sm font-medium">Email</span>
                  <p className="min-h-10 break-all rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {user.email ?? "—"}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Changes apply across your learning workspace.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSave}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>

              {status === "saved" ? (
                <p role="status" className="text-sm text-ok">
                  Saved.
                </p>
              ) : null}
              {status === "error" ? (
                <Alert>
                  <AlertDescription>
                    We couldn&apos;t save your profile. Try again.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </div>
        </div>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl space-y-1.5">
            <p className="text-base font-semibold">Learning setup</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Rerun the four questions to update how the dashboard guides you.
              Your current choices stay until you finish again.
            </p>
          </div>
          <Link
            href="/onboarding?rerun=1"
            className={buttonVariants({ variant: "outline" })}
          >
            Rerun onboarding
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

function providerLabel(provider: string | null): string {
  if (provider === "google" || provider === "google.com" || provider === "Google") {
    return "Google";
  }
  return provider ?? "Account";
}
