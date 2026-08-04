"use client";

import { useEffect, useState } from "react";
import type { CloudSyncStatus as Status } from "@/sync/use-cloud-session-sync";

/**
 * Non-distracting sync status (copy spec §7.1). Signed-out learners see the
 * honest "Saved on this device"; signed-in learners see Saving… / Saved /
 * the calm offline message. The region keeps a stable layout and announces
 * changes politely without spam.
 */
export function CloudSyncStatus({
  status,
  signedIn,
}: {
  status: Status;
  signedIn: boolean;
}) {
  const [showSaved, setShowSaved] = useState(true);

  // "Saved" fades away after a moment; failures and saving stay visible.
  // Deferred updates keep the effect free of synchronous setState.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (status === "saved") {
        setShowSaved(false);
      } else {
        setShowSaved(true);
      }
    }, status === "saved" ? 2500 : 0);
    return () => window.clearTimeout(timer);
  }, [status]);

  let label: string | null;
  if (!signedIn) {
    label = "Saved on this device";
  } else if (status === "saving") {
    label = "Saving…";
  } else if (status === "offline") {
    label = "Couldn't sync — your work is safe on this device";
  } else if (status === "cloud_newer") {
    // The cloud has newer progress from another device; the local copy is
    // intact and safe — an honest, calm status.
    label = "Saved on this device";
  } else if (status === "saved" && showSaved) {
    label = "Saved";
  } else {
    label = null;
  }

  return (
    <span className="inline-flex h-5 items-center" role="status" aria-live="polite">
      {label ? (
        <span
          className={
            status === "offline"
              ? "text-xs text-warn"
              : "text-xs text-muted"
          }
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
