"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/firebase/auth";
import {
  clearLocalSession,
  rotateLocalSessionId,
} from "@/storage/session-storage";

/**
 * Sign-out choice (shared-device privacy, copy spec §6.4 SET-52..54). User A's
 * local lab evidence is kept private to this browser; when they sign out, the
 * next person on the same browser could see it. The dialog makes the choice
 * explicit: keep the local data (current behavior) or clear it too. Cloud
 * data is never touched by either action — rows are owned server-side by
 * the signed-in user and unaffected.
 */
export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // "keep" | "clear" while a sign-out is in flight; null when idle.
  const [busy, setBusy] = useState<null | "keep" | "clear">(null);

  const handleSignOut = async (clearDeviceData: boolean) => {
    if (busy !== null) return;
    setBusy(clearDeviceData ? "clear" : "keep");
    if (clearDeviceData) {
      clearLocalSession();
      // Rotate the session id so the NEXT local session can never silently
      // overwrite the user's existing cloud row with fresh local evidence.
      rotateLocalSessionId();
      try {
        globalThis.localStorage.removeItem("unseenlab.onboarding-draft.v1");
      } catch {
        // Ignore: storage unavailable means nothing to clear.
      }
    }
    // Only the account session is cleared; local evidence is either kept
    // (primary action) or was cleared above (secondary action). Cloud rows
    // are untouched either way.
    await signOut();
    onOpenChange(false);
    router.push("/");
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Sign out of UnseenLab?</DialogTitle>
          <DialogDescription>
            Your learning data on this device is kept private to this browser.
            Choose what happens to it when you sign out.
          </DialogDescription>
        </DialogHeader>
        {/* Stacked, full-width choices — the single-row footer wraps badly on
            narrow dialogs. Keep = soft surface (least destructive, current
            behavior), clear = soft red tint, Cancel = quiet ghost below. */}
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => void handleSignOut(false)}
            disabled={busy !== null}
          >
            Sign out and keep my data on this device
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="w-full justify-center"
            onClick={() => void handleSignOut(true)}
            disabled={busy !== null}
          >
            Sign out and clear data on this device
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-center text-muted-foreground"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
