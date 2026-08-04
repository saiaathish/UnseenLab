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
      <div className="mx-auto w-full max-w-3xl px-4 pt-28 pb-20 sm:px-6">
        <Tabs defaultValue="profile">
          <TabsList aria-label="Settings sections">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">
              Learning preferences
            </TabsTrigger>
            <TabsTrigger value="accessibility">Accessibility</TabsTrigger>
            <TabsTrigger value="privacy">Privacy and data</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-6">
            <ProfileSettings
              profile={profile}
              onProfileChange={setProfile}
              user={user}
            />
          </TabsContent>
          <TabsContent value="preferences" className="mt-6">
            <LearningPreferencesSettings
              preferences={preferences}
              onPreferencesChange={setPreferences}
            />
          </TabsContent>
          <TabsContent value="accessibility" className="mt-6">
            <AccessibilitySettings
              preferences={preferences}
              onPreferencesChange={setPreferences}
            />
          </TabsContent>
          <TabsContent value="privacy" className="mt-6">
            <PrivacySettings />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
