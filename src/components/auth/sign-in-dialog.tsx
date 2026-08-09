"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<null | "popup" | "offline" | "generic">(null);
  // The raw Firebase error code (e.g. auth/unauthorized-domain) for diagnosis.
  // Surfaced as a muted secondary line — the primary copy stays the pinned
  // generic message (e2e/auth-dialog.spec.ts) so learner-facing text is stable
  // while operators can read the exact rejection.
  const [errorCode, setErrorCode] = useState<string | null>(null);

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
    setErrorCode(null);
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
      // The UI deliberately keeps learner copy generic, but the exact
      // FirebaseError code must be visible for diagnosis (e.g.
      // auth/unauthorized-domain when a hostname is missing from the
      // project's Authorized domains in the Firebase console).
      const code =
        error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code
          : null;
      console.error("[sign-in] Google sign-in failed", { code, error });
      setErrorCode(code);
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
      <DialogContent
        className="sm:max-w-md"
        initialFocus={titleRef}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} className="text-lg">
            Sign in to UnseenLab
          </DialogTitle>
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
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <Spinner aria-hidden="true" />
                Opening Google…
              </>
            ) : (
              "Continue with Google"
            )}
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
            <Alert>
              <AlertDescription>
                {effectiveErrorKey === "generic"
                  ? "We couldn't sign you in with Google. Please try again."
                  : "Sign-in needs an internet connection. You can keep using the lab without an account."}
                {errorCode && (
                  <span className="mt-1 block font-mono text-[11px] leading-none text-muted-foreground/80">
                    {errorCode}
                  </span>
                )}
              </AlertDescription>
            </Alert>
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
