"use client";

import { useEffect, useState } from "react";

import { demoStore } from "@/demonstrations/state/demo-store";
import { useSession } from "@/lib/firebase/use-session";

type SaveState =
  | { phase: "idle"; label: string }
  | { phase: "busy"; label: string }
  | { phase: "done"; label: string }
  | { phase: "error"; label: string };

/**
 * Save control. Guests always save to the device; signed-in learners try the
 * account first and fall back to the device with an honest notice on a 401.
 * Auth is never forced; the control works for everyone.
 */
export function DemoSaveControl() {
  const { user, loading: sessionLoading } = useSession();
  const [session, setSession] = useState(() => demoStore.getSession());
  const [state, setState] = useState<SaveState>({ phase: "idle", label: "" });

  useEffect(
    () => demoStore.subscribe(() => setSession(demoStore.getSession())),
    []
  );

  const savedToDevice = session?.savedToDevice ?? false;
  const savedToCloud = session?.savedToCloud ?? false;

  const statusLabel = savedToCloud
    ? "Saved to your account"
    : savedToDevice
      ? "Saved on this device"
      : "Not saved";

  const handleSave = async () => {
    const current = demoStore.getSession();
    if (!current) {
      setState({ phase: "error", label: "Nothing to save yet." });
      return;
    }
    setState({ phase: "busy", label: "Saving…" });

    // Signed-in learners sync to their account; guests save on this device.
    if (!user || sessionLoading) {
      const ok = demoStore.saveToDevice();
      setState(
        ok
          ? { phase: "done", label: "Saved on this device" }
          : { phase: "error", label: "Could not save on this device." }
      );
      return;
    }

    const result = await demoStore.saveToCloud();
    if (result.ok) {
      setState({ phase: "done", label: "Saved to your account" });
      return;
    }
    if (result.error === "unauthorized") {
      // Session cookie lost or rejected: never force auth, keep the work.
      const ok = demoStore.saveToDevice();
      setState(
        ok
          ? {
              phase: "done",
              label: "Couldn't reach your account. Saved on this device instead.",
            }
          : { phase: "error", label: "Couldn't reach your account or save on this device." }
      );
      return;
    }
    setState({ phase: "error", label: "Couldn't save right now. Try again in a moment." });
  };

  const busy = state.phase === "busy";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy}
        className="min-h-11 rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? state.label : savedToCloud ? "Saved" : savedToDevice ? "Save again" : "Save"}
      </button>
      <p
        aria-live="polite"
        className="text-xs text-muted"
      >
        {state.phase === "done" || state.phase === "error" ? state.label : statusLabel}
      </p>
    </div>
  );
}
