"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { CloudSessionRepository, type SessionSnapshot } from "@/sync/cloud-session-repository";
import { profileToLearnerPreferences } from "@/personalization/profile-to-learner-preferences";
import { saveLocalSession, type LocalSession } from "@/storage/session-storage";

const DISMISSED_KEY = "unseenlab.resume-dismissed.v1";

/**
 * Resume prompt: shown to a signed-in learner with no local evidence when an
 * incomplete cloud session exists for this lab (or one is explicitly
 * requested via ?resume=<id>). Local evidence always wins — cloud snapshots
 * are never loaded over it.
 */
export function SessionResumeDialog({
  user,
  onResume,
  onNewSession,
}: {
  user: { id: string } | null;
  onResume: (session: LocalSession, cloudId: string) => void;
  onNewSession: () => void;
}) {
  const searchParams = useSearchParams();
  const resumeParam = searchParams.get("resume");

  const [candidate, setCandidate] = useState<SessionSnapshot | null>(null);
  const fetching = useRef(false);
  const offeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || fetching.current || candidate) return;

    const sessionId = resumeParam;
    const visitedKey = `${DISMISSED_KEY}.${sessionId ?? "auto"}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(visitedKey)) {
      return;
    }

    fetching.current = true;
    if (!isFirebaseConfigured()) {
      fetching.current = false;
      return;
    }
    const repo = new CloudSessionRepository(user.id);

    void (async () => {
      try {
        const found =
          sessionId !== null
            ? await repo.getById(sessionId)
            : await repo.getIncompleteForLab("nuclear-chain-reaction");
        if (found && found.evidence && offeredFor.current !== found.id) {
          offeredFor.current = found.id;
          setCandidate(found);
        }
      } finally {
        fetching.current = false;
      }
    })();
  }, [user, resumeParam, candidate]);

  const handleResume = useCallback(() => {
    if (!candidate) return;
    const restored: LocalSession = {
      preferences: profileToLearnerPreferences(null),
      evidence: (candidate.evidence ?? {}) as unknown as LocalSession["evidence"],
      workflow: (candidate.workflow ?? {}) as unknown as LocalSession["workflow"],
    };
    saveLocalSession(restored);
    if (resumeParam) {
      window.sessionStorage.setItem(`${DISMISSED_KEY}.${resumeParam}`, "1");
    }
    setCandidate(null);
    onResume(restored, candidate.id);
  }, [candidate, resumeParam, onResume]);

  const handleNew = useCallback(() => {
    window.sessionStorage.setItem(`${DISMISSED_KEY}.${resumeParam ?? "auto"}`, "1");
    setCandidate(null);
    onNewSession();
  }, [resumeParam, onNewSession]);

  if (!candidate) return null;

  const trialCount = Array.isArray(candidate.evidence?.trials)
    ? (candidate.evidence.trials as unknown[]).length
    : 0;

  return (
    <Dialog
      open={candidate !== null}
      onOpenChange={(next) => (next ? undefined : handleNew())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Continue where you left off?</DialogTitle>
          <DialogDescription>
            You have a saved Nuclear Chain Reaction session with{" "}
            {trialCount === 0
              ? "a prediction in progress"
              : `${trialCount} completed ${trialCount === 1 ? "trial" : "trials"}`}
            . Your progress stays on record either way.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={handleNew}>
            Start a new session
          </Button>
          <Button type="button" onClick={handleResume}>
            Continue saved session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
