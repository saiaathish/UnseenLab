"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { useSession } from "@/lib/supabase/use-session";
import { clearLocalSession, rotateLocalSessionId } from "@/storage/session-storage";
import { SignOutDialog } from "@/components/auth/sign-out-dialog";
import type { SettingsUserInfo } from "./settings-tabs";

/**
 * Privacy and data tab (copy spec §6.4). Export, delete saved learning data
 * (with confirmation), clear local device data (with confirmation), and
 * sign out. Account deletion is not implemented and is never offered.
 */

const ONBOARDING_DRAFT_KEY = "unseenlab.onboarding-draft.v1";

export function PrivacySettings({ user }: { user: SettingsUserInfo }) {
  const router = useRouter();
  const { user: sessionUser } = useSession();
  const userId = sessionUser?.id ?? user.id;

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);

  const handleExport = async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    setExporting(true);
    try {
      const [sessionsResult, preferencesResult] = await Promise.all([
        supabase
          .from("learning_sessions")
          .select("*")
          .order("updated_at", { ascending: false }),
        supabase.from("learner_preferences").select("*").maybeSingle(),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        preferences: preferencesResult.data ?? null,
        sessions: sessionsResult.data ?? [],
        label:
          "Initial design case study evidence. Not a statistically validated learning study.",
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "unseenlab-learning-data.json";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Your learning data is ready to download.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("learning_sessions").delete().eq("user_id", userId),
        supabase.from("learner_preferences").delete().eq("user_id", userId),
      ]);
      setDeleteDialogOpen(false);
      toast.success("Your saved learning data was deleted.");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleClearLocal = () => {
    clearLocalSession();
    // Rotate the session id so the NEXT local session can never silently
    // overwrite the user's existing cloud row with fresh local evidence.
    rotateLocalSessionId();
    try {
      globalThis.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
    } catch {
      // Ignore: storage unavailable means nothing to clear.
    }
    setClearDialogOpen(false);
  };

  return (
    <section aria-labelledby="privacy-heading" className="space-y-4">
      <h1
        id="privacy-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Privacy and data
      </h1>

      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        We save your learning preferences and lab sessions to your account so
        you can continue on another device. Your saved learning data is private
        to your account. We do not ask for diagnosis information.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Export saved learning data</p>
              <p className="text-xs text-muted-foreground">
                Downloads a JSON file of your preferences and sessions.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "Export saved learning data"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Delete my saved learning data</p>
              <p className="text-xs text-muted-foreground">
                Permanently removes your preferences and session history from
                your account.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete my saved learning data
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Clear local device data</p>
              <p className="text-xs text-muted-foreground">
                Removes locally stored lab work and preferences from this
                device only.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearDialogOpen(true)}
            >
              Clear local device data
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-xs text-muted-foreground">
              Ends this session on this device. Your local lab work stays on
              this device.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSignOutDialogOpen(true)}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete your saved learning data?</DialogTitle>
            <DialogDescription>
              This permanently deletes your preferences and session history
              from your account. You can keep using the lab without an account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Keep my data
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete my data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Clear data on this device?</DialogTitle>
            <DialogDescription>
              This removes locally stored lab work and preferences from this
              device only. Data saved to your account is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleClearLocal}>
              Clear data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignOutDialog
        open={signOutDialogOpen}
        onOpenChange={setSignOutDialogOpen}
      />
    </section>
  );
}
