"use client";

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  LearnerPreferencesRow,
  ProfileRow,
} from "@/lib/mongo/types";
import { AccessibilitySettings } from "./accessibility-settings";
import { LearningPreferencesSettings } from "./learning-preferences-settings";
import { PrivacySettings } from "./privacy-settings";
import { ProfileSettings } from "./profile-settings";

/**
 * Settings shell (copy spec §6). Four tabs — Profile, Learning preferences,
 * Accessibility, Privacy and data — each with its own h1 and primary action.
 */

export interface SettingsUserInfo {
  id: string;
  email: string | null;
  provider: string | null;
  avatarUrl: string | null;
  fullName: string | null;
}

/** Fallback row matching the platform schema defaults. */
export function emptyPreferencesRow(userId: string): LearnerPreferencesRow {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    learning_goal: "understand_concept",
    preferred_representation: "animation",
    explanation_style: "step_by_step",
    learning_pace: "balanced",
    animation_speed: 1,
    information_density: "medium",
    reduced_motion: false,
    high_contrast: false,
    text_scale: 1,
    one_variable_mode: true,
    topic_interests: [],
    schema_version: 1,
    created_at: now,
    updated_at: now,
  };
}

export function SettingsTabs({
  initialProfile,
  initialPreferences,
  user,
}: {
  initialProfile: ProfileRow | null;
  initialPreferences: LearnerPreferencesRow | null;
  user: SettingsUserInfo;
}) {
  const [profile, setProfile] = useState<ProfileRow | null>(initialProfile);
  const [preferences, setPreferences] = useState<LearnerPreferencesRow>(
    initialPreferences ?? emptyPreferencesRow(user.id),
  );

  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-20 sm:px-6 lg:px-8">
        <header className="mb-8 max-w-2xl">
          <p className="text-sm font-medium tracking-wide text-primary">
            Account workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Settings
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Keep your profile, learning experience, and saved data working the
            way you want.
          </p>
        </header>

        <Tabs defaultValue="profile">
          <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
            <TabsList
              aria-label="Settings sections"
              className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl bg-muted/60 p-1 sm:grid-cols-4 lg:grid-cols-1"
            >
              <TabsTrigger
                value="profile"
                className="min-h-11 justify-start px-3 py-2 text-left"
              >
                <span>
                  <span className="block">Profile</span>
                  <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block lg:block">
                    Your account details
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="preferences"
                className="min-h-11 justify-start px-3 py-2 text-left"
              >
                <span>
                  <span className="block">Learning preferences</span>
                  <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block lg:block">
                    Shape your path
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="accessibility"
                className="min-h-11 justify-start px-3 py-2 text-left"
              >
                <span>
                  <span className="block">Accessibility</span>
                  <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block lg:block">
                    Tune the interface
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="privacy"
                className="min-h-11 justify-start px-3 py-2 text-left"
              >
                <span>
                  <span className="block">Privacy and data</span>
                  <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground sm:block lg:block">
                    Manage saved data
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>

            <div className="min-w-0">
              <TabsContent value="profile" className="mt-0">
                <ProfileSettings
                  profile={profile}
                  onProfileChange={setProfile}
                  user={user}
                />
              </TabsContent>
              <TabsContent value="preferences" className="mt-0">
                <LearningPreferencesSettings
                  preferences={preferences}
                  onPreferencesChange={setPreferences}
                />
              </TabsContent>
              <TabsContent value="accessibility" className="mt-0">
                <AccessibilitySettings
                  preferences={preferences}
                  onPreferencesChange={setPreferences}
                />
              </TabsContent>
              <TabsContent value="privacy" className="mt-0">
                <PrivacySettings />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </main>
  );
}
