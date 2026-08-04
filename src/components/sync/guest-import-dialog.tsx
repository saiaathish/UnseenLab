"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { CloudSessionRepository } from "@/sync/cloud-session-repository";
import {
  dismissImportForVisit,
  hasGuestEvidence,
  importGuestSession,
  isImportDismissedForVisit,
  isSessionImported,
} from "@/sync/guest-session-import";
import { getLocalSessionId } from "@/storage/session-storage";
import type { LocalSession } from "@/storage/session-storage";

/**
 * Consent-only guest-session import (copy spec §7.2). Shown once per visit
 * when a signed-out learner with local evidence signs in; never uploads
 * automatically; idempotent by stable session id.
 */
export function GuestImportDialog({
  user,
  session,
  title,
  requestOpen,
  onRequestHandled,
}: {
  user: User | null;
  session: LocalSession;
  title: string;
  /** Explicit re-trigger (e.g. "Save this session to your account"). */
  requestOpen: boolean;
  /** Called once the explicit request has been handled so it cannot stick. */
  onRequestHandled: () => void;
}) {
  const [busy, setBusy] = useState(false);

  // Fully derived: no effect-setState. The dialog is open when explicitly
  // requested, or when the auto-offer condition holds (local evidence, not
  // yet imported, not dismissed this visit). "Not now" and "Save" both make
  // the derived condition false, so the dialog closes by itself.
  const shouldAutoOffer =
    Boolean(user) &&
    hasGuestEvidence(session) &&
    !isSessionImported(getLocalSessionId()) &&
    !isImportDismissedForVisit(getLocalSessionId());

  const handleSave = useCallback(async () => {
    const client = getBrowserClient();
    if (!client || !user) return;
    setBusy(true);
    const repo = new CloudSessionRepository(client, user.id);
    const outcome = await importGuestSession(
      repo,
      session,
      getLocalSessionId(),
      title
    );
    setBusy(false);
    if (outcome === "imported") {
      toast.success("Your session is saved to your account.");
    } else if (outcome === "offline") {
      toast.error(
        "We couldn't save your session right now. Your work is safe on this device — you can try again from the lab."
      );
    }
    // "already_imported" closes silently — the derived condition is false.
    onRequestHandled();
  }, [session, title, user, onRequestHandled]);

  const handleNotNow = useCallback(() => {
    dismissImportForVisit(getLocalSessionId());
    onRequestHandled();
  }, [onRequestHandled]);

  return (
    <Dialog
      open={requestOpen || shouldAutoOffer}
      onOpenChange={(next) => (next ? undefined : handleNotNow())}
    >      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save your current learning session?</DialogTitle>
          <DialogDescription>
            This will add your current progress to your private account so you
            can continue on another device.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={handleNotNow} disabled={busy}>
            Not now
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save to my account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
