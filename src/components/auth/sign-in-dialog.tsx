"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/firebase/auth";
import { useSession } from "@/lib/firebase/use-session";
import { isSafeRedirectPath } from "@/lib/auth/redirect-safety";

/**
 * Single auth surface for the whole app (copy spec §2.1). Controlled by the
 * app header, and auto-opened via `/?auth=open` when a signed-out visitor
 * hits a protected route. "Try without an account" closes it — the lab is
 * fully usable signed out.
 */
export function SignInDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useSession();

  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<null | "popup" | "offline" | "generic">(null);

  const authMode = searchParams.get("auth");
  const next = searchParams.get("next");

  // `/?auth=open` and `/?auth=error` from the proxy open the dialog. The
  // error copy is derived from the query param so no effect-setState is
  // needed.
  useEffect(() => {
    if (authMode === "open" || authMode === "error") {
      onOpenChange(true);
    }
  }, [authMode, onOpenChange]);

  // Once signed in the dialog is unnecessary; drop the query params so a
  // reload doesn't reopen it.
  useEffect(() => {
    if (!open || !user || loading) return;
    if (authMode) router.replace("/");
  }, [open, user, loading, authMode, router]);

  const close = useCallback(() => {
    onOpenChange(false);
    setErrorKey(null);
    setSubmitting(false);
  }, [onOpenChange]);

  const effectiveErrorKey = errorKey ?? (authMode === "error" ? "generic" : null);

  const handleGoogle = async () => {
    setSubmitting(true);
    setErrorKey(null);
    // The popup flow mints the httpOnly session cookie server-side; the
    // caller then routes through /auth/callback so onboarding and the safe
    // `next` destination are handled in exactly one place.
    const error = await signInWithGoogle();
    if (error) {
      setErrorKey("generic");
      setSubmitting(false);
      return;
    }
    const origin = window.location.origin;
    const safeNext = isSafeRedirectPath(next) ? `?next=${encodeURIComponent(next)}` : "";
    window.location.assign(`${origin}/auth/callback${safeNext}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Sign in to UnseenLab</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Save your learning preferences and continue across devices.
          </p>

          <Button
            type="button"
            className="w-full"
            onClick={handleGoogle}
            disabled={submitting}
          >
            {submitting ? "Opening Google…" : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Button type="button" variant="ghost" className="w-full" onClick={close}>
              Try without an account
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Try the lab now. Sign in whenever you want to save progress across devices.
            </p>
          </div>

          {effectiveErrorKey && (
            <p role="alert" className="text-sm text-danger">
              {effectiveErrorKey === "generic"
                ? "We couldn't sign you in with Google. Please try again."
                : "Sign-in needs an internet connection. You can keep using the lab without an account."}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Your saved learning data is private to your account. We do not ask for
            diagnosis information.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
