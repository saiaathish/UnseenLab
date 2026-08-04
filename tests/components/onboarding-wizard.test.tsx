import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ONBOARDING_DRAFT_KEY,
  OnboardingWizard,
} from "@/components/onboarding/onboarding-wizard";
import type { LearnerPreferencesRow } from "@/lib/supabase/types";
import {
  CURRENT_ONBOARDING_VERSION,
  emptyOnboardingDraft,
  type OnboardingDraft,
} from "@/personalization/onboarding-schema";
import { draftToPreferencesRow } from "@/personalization/profile-to-learner-preferences";

const TEST_USER = { id: "user-platform-a", email: "ada@example.com" };

// Session is mocked for full control (including the graceful degradation case
// where the browser client is null while a user is present). The real
// useSession is exercised in tests/app/onboarding-page.test.tsx.
const sessionState = vi.hoisted(() => ({
  user: null as null | typeof TEST_USER,
  loading: false,
  client: null as unknown,
}));

vi.mock("@/lib/supabase/use-session", () => ({
  useSession: () => ({
    user: sessionState.user,
    loading: sessionState.loading,
    client: sessionState.client,
  }),
}));

const mocks = vi.hoisted(() => {
  const upsert = vi.fn<() => { error: Error | null }>(() => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const updateEq = vi.fn<() => { error: Error | null }>(() => ({ error: null }));
  const push = vi.fn();
  const client = {
    from: (table: string) => {
      if (table === "learner_preferences") return { upsert };
      if (table === "profiles") return { update };
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { upsert, update, updateEq, push, client };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const STEP_QUESTIONS = [
  "What would you like help doing?",
  "How do explanations make the most sense to you?",
  "What should the experience feel like?",
  "What topics are you working on?",
];

/** Clicks Continue from `fromStep` until it reaches `toStep`. */
async function goThroughSteps(
  user: ReturnType<typeof userEvent.setup>,
  fromStep: number,
  toStep: number
) {
  for (let step = fromStep; step < toStep; step += 1) {
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[step] });
  }
}

/** Presses Tab until the given role/name is focused (max 20 tabs). */
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  role: string,
  name: string
) {
  for (let i = 0; i < 20; i += 1) {
    await user.tab();
    const element = screen.queryByRole(role, { name });
    if (element && element === document.activeElement) return element;
  }
  throw new Error(`never reached ${role} "${name}" via Tab`);
}

function learnerPreferencesFixture(
  overrides: Partial<LearnerPreferencesRow> = {}
): LearnerPreferencesRow {
  return {
    user_id: "user-platform-a",
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
    created_at: "2026-08-03T10:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    sessionState.user = TEST_USER;
    sessionState.loading = false;
    sessionState.client = mocks.client;
  });

  it("shows a skeleton while the session is loading", () => {
    sessionState.loading = true;
    render(<OnboardingWizard />);
    expect(
      screen.getByRole("status", { name: "Loading onboarding" })
    ).toBeInTheDocument();
  });

  it("walks through exactly four steps, one question each, with correct progress", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    // "Step {n} of 4" is a live region (role="status").
    expect(screen.getByText("Step 1 of 4")).toHaveAttribute("role", "status");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-label", "Onboarding progress");

    // One question per view: the other three are never present.
    for (let q = 1; q < STEP_QUESTIONS.length; q += 1) {
      expect(
        screen.queryByRole("heading", { name: STEP_QUESTIONS[q] })
      ).not.toBeInTheDocument();
    }

    for (let target = 1; target < 4; target += 1) {
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByRole("heading", { name: STEP_QUESTIONS[target] });
      expect(
        screen.getByText(`Step ${target + 1} of 4`)
      ).toHaveAttribute("role", "status");
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        String(target + 1)
      );
    }

    // Step 4 is the last step: no Continue, the actions are Back/Skip/Start.
    expect(
      screen.queryByRole("button", { name: "Continue" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start learning" })
    ).toBeInTheDocument();
  });

  it("persists selections immediately and resumes at the saved step after a refresh", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    await user.click(screen.getByText("Prepare for class or a test."));
    expect(JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_KEY) ?? "{}")).toEqual(
      expect.objectContaining({ learningGoal: "prepare_for_class", step: 1 })
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[1] });
    expect(JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_KEY) ?? "{}")).toEqual(
      expect.objectContaining({ step: 2 })
    );

    // A fresh mount (refresh) with the same storage resumes at the saved step.
    cleanup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[1] });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2"
    );
  });

  it("resumes at the stored step with stored answers intact", async () => {
    const seededDraft: OnboardingDraft = {
      step: 3,
      learningGoal: "understand_concept",
      explanationStyle: "visual_first",
      learningPace: "quick",
      reducedMotion: true,
      textScale: 1.15,
      highContrast: false,
      topicInterests: ["Nuclear chain reactions"],
    };
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(seededDraft));

    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[2] });

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "3"
    );
    expect(screen.getByRole("radio", { name: "Quick pace" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Reduce animation motion" })
    ).toBeChecked();
    expect(screen.getByText("Text size: 115%")).toBeInTheDocument();
  });

  it("falls back to a clean draft when the stored draft is corrupt or invalid", async () => {
    localStorage.setItem(ONBOARDING_DRAFT_KEY, "{not-json");
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1"
    );

    // Invalid draft (step out of range) on a fresh mount also falls back.
    cleanup();
    localStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ ...emptyOnboardingDraft(), step: 9 })
    );
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1"
    );
  });

  it("Back returns to the previous step with every answer preserved", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    await user.click(screen.getByText("Explore through experiments."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[1] });

    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    expect(
      screen.getByRole("radio", { name: "Explore through experiments." })
    ).toBeChecked();
  });

  it("completes with defaults and no topics (optional fields are skippable)", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    await goThroughSteps(user, 1, 4);

    // Nothing was added — the review says so and completion still works.
    expect(screen.getByText("Topics: None yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start learning" }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert).toHaveBeenCalledWith({
      ...draftToPreferencesRow(emptyOnboardingDraft()),
      user_id: TEST_USER.id,
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
    expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("completion persists every choice and bumps the onboarding version", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    await user.click(screen.getByText("Explore through experiments."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[1] });

    await user.click(screen.getByText("Keep it concise."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[2] });

    await user.click(screen.getByText("Quick pace"));
    await user.click(
      screen.getByRole("switch", { name: "Reduce animation motion" })
    );
    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole("button", { name: "Increase text size" }));
    }
    expect(screen.getByText("Text size: 125%")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "High contrast" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: STEP_QUESTIONS[3] });

    await user.type(
      screen.getByRole("textbox", { name: "Add a topic" }),
      "Nuclear chain reactions{Enter}"
    );
    expect(
      screen.getByRole("button", { name: "Remove Nuclear chain reactions" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start learning" }));

    const expectedDraft: OnboardingDraft = {
      step: 4,
      learningGoal: "explore_experiments",
      explanationStyle: "concise",
      learningPace: "quick",
      reducedMotion: true,
      textScale: 1.25,
      highContrast: true,
      topicInterests: ["Nuclear chain reactions"],
    };
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert).toHaveBeenCalledWith({
      ...draftToPreferencesRow(expectedDraft),
      user_id: TEST_USER.id,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_version: CURRENT_ONBOARDING_VERSION,
        onboarding_completed_at: expect.any(String),
      })
    );
    expect(mocks.updateEq).toHaveBeenCalledWith("user_id", TEST_USER.id);
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
    expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("Step 4 Skip finishes without topics but keeps steps 1-3 choices", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    await user.click(screen.getByText("Explore through experiments."));
    await goThroughSteps(user, 1, 4);

    await user.type(
      screen.getByRole("textbox", { name: "Add a topic" }),
      "Why reactions accelerate{Enter}"
    );
    expect(
      screen.getByRole("button", { name: "Remove Why reactions accelerate" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_goal: "explore_experiments",
        topic_interests: [],
      })
    );
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("Skip for now completes onboarding with defaults and no preferences", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        onboarding_version: CURRENT_ONBOARDING_VERSION,
        onboarding_completed_at: expect.any(String),
      })
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
    expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("shows a calm inline error and keeps the draft when saving fails, then retries", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    await goThroughSteps(user, 1, 4);

    mocks.upsert.mockReturnValueOnce({ error: new Error("db down") });
    await user.click(screen.getByRole("button", { name: "Start learning" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn't save your preferences. Try again."
      )
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    // Draft retained — nothing is lost.
    expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("completes locally with a calm notice when the browser client is unavailable", async () => {
    sessionState.client = null;
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    await goThroughSteps(user, 1, 4);

    await user.click(screen.getByRole("button", { name: "Start learning" }));

    expect(
      screen.getByText(/couldn't save to your account right now/i)
    ).toHaveAttribute("role", "status");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
    expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("existing preferences prefill the controls via the initialPrefs prop", async () => {
    const user = userEvent.setup();
    const prefs = learnerPreferencesFixture({
      learning_goal: "prepare_for_class",
      explanation_style: "visual_first",
      learning_pace: "quick",
      reduced_motion: true,
      high_contrast: true,
      text_scale: 1.25,
      topic_interests: ["Nuclear chain reactions"],
    });
    render(<OnboardingWizard initialPrefs={prefs} />);

    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    expect(
      screen.getByRole("radio", { name: "Prepare for class or a test." })
    ).toBeChecked();

    await goThroughSteps(user, 1, 3);
    expect(screen.getByRole("radio", { name: "Quick pace" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Reduce animation motion" })
    ).toBeChecked();
    expect(screen.getByRole("switch", { name: "High contrast" })).toBeChecked();
    expect(screen.getByText("Text size: 125%")).toBeInTheDocument();

    await goThroughSteps(user, 3, 4);
    expect(
      screen.getByRole("button", { name: "Remove Nuclear chain reactions" })
    ).toBeInTheDocument();
    expect(screen.getByText("Help with: Prepare for class or a test")).toBeInTheDocument();
    expect(screen.getByText("Pace: Quick pace")).toBeInTheDocument();
    expect(screen.getByText("Motion: On")).toBeInTheDocument();
    expect(screen.getByText("Text size: 125%")).toBeInTheDocument();
    expect(screen.getByText("High contrast: On")).toBeInTheDocument();
  });

  it("rerunning onboarding updates the saved preferences to the new choices", async () => {
    const user = userEvent.setup();
    const prefs = learnerPreferencesFixture({
      learning_goal: "prepare_for_class",
      topic_interests: ["Nuclear chain reactions"],
    });
    render(<OnboardingWizard initialPrefs={prefs} />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    await user.click(screen.getByText("Explore through experiments."));
    await goThroughSteps(user, 1, 4);
    await user.click(screen.getByRole("button", { name: "Start learning" }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_goal: "explore_experiments",
        topic_interests: ["Nuclear chain reactions"],
      })
    );
  });

  it("never asks for diagnosis information and avoids forbidden language", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    const forbidden = [
      /\bguest\b/i,
      /\bdemo\b/i,
      /anonymous/i,
      /\btrial\b/i,
      /\btemporary\b/i,
      /\blimited\b/i,
      /\brestricted\b/i,
      /\blite\b/i,
      /\bbasic\b/i,
      /\bsandbox\b/i,
      /\bthrowaway\b/i,
      /\bupgrade\b/i,
      /\bunlock\b/i,
      /\bpreview\b/i,
      /\bdiagnos/i,
      /\bADHD\b/i,
      /\bautis/i,
      /\bdyslex/i,
      /\bdyscalcul/i,
      /neurodiverg/i,
      /clinical/i,
      /\bmedical\b/i,
      /\bspecial needs\b/i,
      /disability/i,
      /accommodat/i,
      /\bsymptoms?\b/i,
      /\bcondition\b/i,
      /\bevaluate\b/i,
      /\bassess\b/i,
    ];

    const collectText = () => {
      const texts: string[] = [document.body.textContent ?? ""];
      document.querySelectorAll("[aria-label]").forEach((el) => {
        texts.push(el.getAttribute("aria-label") ?? "");
      });
      return texts.join("\n");
    };

    expect(collectText()).not.toMatch(new RegExp(forbidden.map((r) => r.source).join("|"), "i"));

    for (let target = 1; target < 4; target += 1) {
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByRole("heading", { name: STEP_QUESTIONS[target] });
      expect(
        collectText()
      ).not.toMatch(new RegExp(forbidden.map((r) => r.source).join("|"), "i"));
    }
  });

  it("completes the whole flow keyboard-only (Tab + Space/Enter + radio arrows)", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });

    // Step 1: Tab to the checked radio (native radio-group order), then
    // ArrowDown moves the selection within the group.
    await tabTo(user, "radio", "Understand a difficult concept.");
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("radio", { name: "Prepare for class or a test." })
    ).toBeChecked();
    await tabTo(user, "button", "Continue");
    await user.keyboard("{Enter}");
    // Focus moves to the step heading on step change.
    await screen.findByRole("heading", { name: STEP_QUESTIONS[1] });
    expect(
      screen.getByRole("heading", { name: STEP_QUESTIONS[1] })
    ).toHaveFocus();

    // Step 2
    await tabTo(user, "radio", "Walk me through it step by step.");
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("radio", { name: "Keep it concise." })
    ).toBeChecked();
    await tabTo(user, "button", "Continue");
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: STEP_QUESTIONS[2] });

    // Step 3
    await tabTo(user, "radio", "Balanced pace");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Quick pace" })).toBeChecked();
    await tabTo(user, "switch", "Reduce animation motion");
    await user.keyboard(" ");
    expect(
      screen.getByRole("switch", { name: "Reduce animation motion" })
    ).toBeChecked();
    await tabTo(user, "button", "Continue");
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: STEP_QUESTIONS[3] });

    // Step 4
    await tabTo(user, "textbox", "Add a topic");
    await user.keyboard("Nuclear chain reactions{Enter}");
    await tabTo(user, "button", "Start learning");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_goal: "prepare_for_class",
        explanation_style: "concise",
        learning_pace: "quick",
        reduced_motion: true,
        topic_interests: ["Nuclear chain reactions"],
      })
    );
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("fits 320px: the wizard root is fluid and no element forces a wider layout", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: STEP_QUESTIONS[0] });
    await goThroughSteps(user, 1, 4);

    const root = screen.getByTestId("onboarding-wizard");
    expect(root.className).toContain("w-full");
    expect(root.className).toContain("max-w-xl");

    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const inlineWidth = parseInt(el.style.width || el.style.minWidth, 10);
      if (!Number.isNaN(inlineWidth) && inlineWidth > 320) {
        offenders.push(`inline width ${inlineWidth}px on <${el.tagName}>`);
      }
      const className = typeof el.className === "string" ? el.className : "";
      const fixed = className.match(/(?:min-w|w)-\[(\d{3,})px\]/);
      if (fixed && Number(fixed[1]) > 320) {
        offenders.push(`class ${fixed[0]}`);
      }
    });
    expect(offenders).toEqual([]);
  });
});
