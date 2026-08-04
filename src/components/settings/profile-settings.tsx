"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <section aria-labelledby="profile-heading" className="space-y-4">
      <h1
        id="profile-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Profile
      </h1>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback>{initialsFor(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {displayName.trim() || "Learner"}
              </p>
              <p className="text-sm text-muted-foreground">
                {user.email ?? "No email on file"}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Email</span>
              <p className="text-sm text-muted-foreground">
                {user.email ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              {provider === "google" ? (
                <p className="text-sm text-muted-foreground">
                  Signed in with Google
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {onboardingComplete
                  ? "Onboarding complete"
                  : "Onboarding in progress"}
              </p>
            </div>
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
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-medium">Onboarding</p>
          <p className="text-sm text-muted-foreground">
            Rerun the four questions to update how the dashboard guides you.
            Your current choices stay until you finish again.
          </p>
          <div>
            <Link
              href="/onboarding?rerun=1"
              className={buttonVariants({ variant: "outline" })}
            >
              Rerun onboarding
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
