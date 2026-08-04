import { beforeEach, describe, expect, it } from "vitest";
import {
  RESEARCH_CONSENT_KEY,
  RESEARCH_NOTES_KEY,
  RESEARCH_SESSION_KEY,
  attachResearchPost,
  clearAllResearchData,
  createResearchSession,
  exportResearchSession,
  getResearchConsent,
  getResearchNotes,
  loadResearchSession,
  recordAbandonment,
  recordResearchEvent,
  researchConsentSchema,
  researchEventSchema,
  researchExportSchema,
  researchParamEnabled,
  researchSessionSchema,
  saveResearchNotes,
  setResearchConsent,
} from "@/research/research-recorder";

beforeEach(() => {
  window.localStorage.clear();
});

function iso() {
  return new Date().toISOString();
}

function preAnswers() {
  return {
    confidence: 2,
    expectedEffort: 4,
    explanationStyle: "step_by_step" as const,
    answeredAt: iso(),
  };
}

function postAnswers() {
  return {
    confidence: 4,
    actualEffort: 3,
    clearer: "The absorber controls the reaction rate.",
    confusing: "Why the seed matters.",
    remove: "The equation view.",
    keep: "The animation.",
    answeredAt: iso(),
  };
}

describe("capture gating by consent", () => {
  it("records nothing before any consent decision", () => {
    expect(getResearchConsent()).toBeNull();
    const recorded = recordResearchEvent({
      type: "replay_opened",
      at: iso(),
    });
    expect(recorded).toBe(false);
    expect(window.localStorage.getItem(RESEARCH_SESSION_KEY)).toBeNull();
  });

  it("records nothing when consent is declined", () => {
    setResearchConsent("declined");
    expect(getResearchConsent()).toBe("declined");
    const recorded = recordResearchEvent({
      type: "replay_opened",
      at: iso(),
    });
    expect(recorded).toBe(false);
    expect(window.localStorage.getItem(RESEARCH_SESSION_KEY)).toBeNull();
  });

  it("records when consent is agreed", () => {
    setResearchConsent("agreed");
    expect(getResearchConsent()).toBe("agreed");
    const recorded = recordResearchEvent({
      type: "replay_opened",
      at: iso(),
    });
    expect(recorded).toBe(true);
    const session = loadResearchSession();
    expect(session).not.toBeNull();
    expect(session!.consent).toBe("agreed");
    expect(session!.events).toHaveLength(1);
    expect(session!.events[0].type).toBe("replay_opened");
  });

  it("creates a session only after consent", () => {
    expect(createResearchSession(preAnswers())).toBeNull();
    setResearchConsent("agreed");
    const session = createResearchSession(preAnswers());
    expect(session).not.toBeNull();
    expect(session!.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe("capture-on-event", () => {
  it("appends every event type in order with its timestamp", () => {
    setResearchConsent("agreed");
    const events = [
      {
        type: "prediction_submitted" as const,
        trialId: "t1",
        answer: "It gets slightly faster",
        structuredAnswer: "slightly_faster",
        confidence: 3,
        at: iso(),
      },
      {
        type: "trial_completed" as const,
        trialId: "t1",
        changedVariables: ["absorberPosition"],
        stopReason: "completed" as const,
        at: iso(),
      },
      {
        type: "representation_opened" as const,
        mode: "graph" as const,
        at: iso(),
      },
      {
        type: "adaptation_offered" as const,
        proposalId: "a1",
        proposalType: "show_graph" as const,
        source: "rules" as const,
        at: iso(),
      },
      {
        type: "adaptation_decided" as const,
        proposalId: "a1",
        proposalType: "show_graph" as const,
        decision: "accepted" as const,
        at: iso(),
      },
      {
        type: "counterfactual_run" as const,
        originalTrialId: "t1",
        changedVariable: "materialDensity",
        at: iso(),
      },
      { type: "replay_opened" as const, at: iso() },
      { type: "error" as const, message: "adaptation provider failed", at: iso() },
    ];
    for (const event of events) {
      expect(recordResearchEvent(event)).toBe(true);
    }
    const session = loadResearchSession();
    expect(session!.events).toHaveLength(8);
    expect(session!.events.map((e) => e.type)).toEqual([
      "prediction_submitted",
      "trial_completed",
      "representation_opened",
      "adaptation_offered",
      "adaptation_decided",
      "counterfactual_run",
      "replay_opened",
      "error",
    ]);
    for (const event of session!.events) {
      expect(researchEventSchema.safeParse(event).success).toBe(true);
      expect(new Date(event.at).getTime()).not.toBeNaN();
    }
  });

  it("records an abandonment point when the participant leaves mid-session", () => {
    setResearchConsent("agreed");
    createResearchSession(preAnswers());
    recordResearchEvent({ type: "replay_opened", at: iso() });
    expect(recordAbandonment("understand")).toBe(true);
    const session = loadResearchSession();
    expect(session!.events.at(-1)).toMatchObject({
      type: "abandoned",
      point: "understand",
    });
  });

  it("drops the abandonment point when nothing was recorded", () => {
    setResearchConsent("agreed");
    createResearchSession(preAnswers());
    expect(recordAbandonment("predict")).toBe(false);
    expect(loadResearchSession()!.events).toHaveLength(0);
  });

  it("drops the abandonment point when the session completed normally", () => {
    setResearchConsent("agreed");
    createResearchSession(preAnswers());
    recordResearchEvent({ type: "replay_opened", at: iso() });
    attachResearchPost(postAnswers());
    expect(recordAbandonment("understand")).toBe(false);
    expect(loadResearchSession()!.events).toHaveLength(1);
  });
});

describe("session lifecycle", () => {
  it("attaches pre answers to an already-started lab session without losing events", () => {
    setResearchConsent("agreed");
    // Lab opened before the pre form: the recorder lazily creates a session.
    recordResearchEvent({
      type: "trial_completed",
      trialId: "t1",
      changedVariables: ["absorberPosition"],
      stopReason: "completed",
      at: iso(),
    });
    const session = createResearchSession(preAnswers());
    expect(session).not.toBeNull();
    expect(session!.pre).toEqual(expect.objectContaining({ confidence: 2 }));
    expect(session!.events).toHaveLength(1);
    expect(session!.events[0].type).toBe("trial_completed");
    expect(loadResearchSession()!.pre!.explanationStyle).toBe("step_by_step");
  });

  it("marks the session complete when post answers are attached", () => {
    setResearchConsent("agreed");
    createResearchSession(preAnswers());
    expect(attachResearchPost(postAnswers())).toBe(true);
    const session = loadResearchSession();
    expect(session!.post).toEqual(expect.objectContaining({ keep: "The animation." }));
    expect(session!.completedAt).not.toBeNull();
    expect(session!.post!.answeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("starts a fresh session after the previous one completed", () => {
    setResearchConsent("agreed");
    const first = createResearchSession(preAnswers())!;
    attachResearchPost(postAnswers());
    const second = createResearchSession(preAnswers());
    expect(second).not.toBeNull();
    expect(second!.sessionId).not.toBe(first.sessionId);
    expect(second!.events).toHaveLength(0);
  });
});

describe("zod validation", () => {
  it("fails safely when persisted data is corrupt", () => {
    setResearchConsent("agreed");
    window.localStorage.setItem(RESEARCH_SESSION_KEY, "{definitely not json");
    expect(loadResearchSession()).toBeNull();
    // Recording still works: a fresh validated session is created.
    expect(recordResearchEvent({ type: "replay_opened", at: iso() })).toBe(true);
    expect(researchSessionSchema.safeParse(loadResearchSession()).success).toBe(true);
  });

  it("rejects a corrupt consent value", () => {
    window.localStorage.setItem(RESEARCH_CONSENT_KEY, JSON.stringify("maybe"));
    expect(getResearchConsent()).toBeNull();
    expect(researchConsentSchema.safeParse("maybe").success).toBe(false);
  });

  it("never persists an invalid event", () => {
    setResearchConsent("agreed");
    const recorded = recordResearchEvent({
      type: "replay_opened",
      // Missing the required `at` timestamp.
    } as never);
    expect(recorded).toBe(false);
    expect(window.localStorage.getItem(RESEARCH_SESSION_KEY)).toBeNull();
  });

  it("rejects unknown event types", () => {
    const parsed = researchEventSchema.safeParse({
      type: "made_up_event",
      at: iso(),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("export shape", () => {
  function fullSession() {
    setResearchConsent("agreed");
    createResearchSession(preAnswers());
    recordResearchEvent({
      type: "prediction_submitted",
      trialId: "t1",
      answer: "It gets slightly faster",
      structuredAnswer: "slightly_faster",
      confidence: 3,
      at: iso(),
    });
    recordResearchEvent({
      type: "trial_completed",
      trialId: "t1",
      changedVariables: ["absorberPosition"],
      stopReason: "completed",
      at: iso(),
    });
    saveResearchNotes("00:00:42 — long pause before touching the absorber.");
    attachResearchPost(postAnswers());
  }

  it("contains exactly the anonymized fields and passes zod validation", () => {
    fullSession();
    const json = exportResearchSession();
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(researchExportSchema.safeParse(parsed).success).toBe(true);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "label",
        "exportedAt",
        "sessionId",
        "consent",
        "conceptQuestion",
        "pre",
        "post",
        "interactionEvidence",
        "facilitatorNotes",
        "timestamps",
      ].sort(),
    );
    expect(parsed.consent).toBe("agreed");
    expect(parsed.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(parsed.pre.confidence).toBe(2);
    expect(parsed.post.keep).toBe("The animation.");
    expect(parsed.interactionEvidence).toHaveLength(2);
    expect(parsed.facilitatorNotes).toContain("long pause");
    expect(parsed.timestamps.startedAt).toBeTruthy();
    expect(parsed.timestamps.exportedAt).toBeTruthy();
  });

  it("never contains email, token, diagnosis, or credential fields — at any depth", () => {
    fullSession();
    const parsed = JSON.parse(exportResearchSession()!);
    const forbidden = [
      "email",
      "token",
      "secret",
      "diagnosis",
      "firebase",
      "mongo",
      "password",
      "credential",
      "account",
      "user",
      "auth",
    ];
    const keys: string[] = [];
    const collect = (value: unknown, prefix: string) => {
      if (Array.isArray(value)) {
        for (const item of value) collect(item, prefix);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          keys.push(`${prefix}${key}`);
          collect(child, `${prefix}${key}.`);
        }
      }
    };
    collect(parsed, "");
    const offenders = keys.filter((key) =>
      forbidden.some((term) => key.toLowerCase().includes(term)),
    );
    expect(offenders).toEqual([]);
  });

  it("returns null when there is no session to export", () => {
    expect(exportResearchSession()).toBeNull();
  });

  it("returns null when the stored session would not validate", () => {
    setResearchConsent("agreed");
    window.localStorage.setItem(RESEARCH_SESSION_KEY, JSON.stringify({ junk: true }));
    expect(exportResearchSession()).toBeNull();
  });
});

describe("notes and cleanup", () => {
  it("saves and loads facilitator notes", () => {
    saveResearchNotes("asked for help once");
    expect(getResearchNotes()).toBe("asked for help once");
    saveResearchNotes("");
    expect(getResearchNotes()).toBe("");
  });

  it("clears consent, session, and notes together", () => {
    setResearchConsent("agreed");
    createResearchSession(preAnswers());
    recordResearchEvent({ type: "replay_opened", at: iso() });
    saveResearchNotes("notes");
    expect(window.localStorage.getItem(RESEARCH_SESSION_KEY)).not.toBeNull();
    clearAllResearchData();
    expect(getResearchConsent()).toBeNull();
    expect(loadResearchSession()).toBeNull();
    expect(getResearchNotes()).toBe("");
    expect(window.localStorage.getItem(RESEARCH_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(RESEARCH_NOTES_KEY)).toBeNull();
  });
});

describe("URL gating", () => {
  it("is enabled only when the URL carries ?research=1", () => {
    window.history.replaceState({}, "", "/lab/nuclear-chain-reaction");
    expect(researchParamEnabled()).toBe(false);
    window.history.replaceState({}, "", "/lab/nuclear-chain-reaction?research=1");
    expect(researchParamEnabled()).toBe(true);
    window.history.replaceState({}, "", "/");
    expect(researchParamEnabled()).toBe(false);
  });
});
