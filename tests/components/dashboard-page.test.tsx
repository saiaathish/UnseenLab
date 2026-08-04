import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DashboardContent,
  DashboardSkeleton,
  LoadError,
} from "@/app/dashboard/page";
import { AvailableLabCard } from "@/components/dashboard/available-lab-card";
import {
  ContinueLearningCard,
  formatRelativeTime,
} from "@/components/dashboard/continue-learning-card";
import { Greeting, greetingForHour } from "@/components/dashboard/greeting";
import { PreferenceSummaryCard } from "@/components/dashboard/preference-summary-card";
import {
  recommendedNextStep,
  RecommendedNextStepCard,
} from "@/components/dashboard/recommendation-card";
import { RecentSessions } from "@/components/dashboard/recent-sessions";
import type {
  LearnerPreferencesRow,
  LearningSessionRow,
  ProfileRow,
} from "@/lib/mongo/types";

/**
 * Dashboard tests (test plan §E1). Seeded real data renders real UI;
 * an empty store renders honest empty states — never sample rows.
 * The page itself is an async server component (Next streams it with the
 * skeleton fallback below), so the sections, skeleton, and fallback are
 * tested here as components, and the data-loading logic is unit-tested in
 * tests/app/dashboard-page.test.tsx.
 */

vi.mock("@/components/navigation/app-header", () => ({
  AppHeader: () => <header>app header</header>,
}));

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function profileFixture(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: "user-platform-a",
    display_name: "Ada",
    avatar_url: null,
    onboarding_version: 1,
    onboarding_completed_at: "2026-08-03T10:00:00.000Z",
    created_at: "2026-08-03T09:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

function preferencesFixture(
  overrides: Partial<LearnerPreferencesRow> = {},
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

function sessionFixture(
  status: "active" | "complete",
  overrides: Partial<LearningSessionRow> = {},
): LearningSessionRow {
  const completedAt = status === "complete" ? "2026-08-03T11:00:00.000Z" : null;
  return {
    id: "session-1",
    user_id: "user-platform-a",
    lab_slug: "nuclear-chain-reaction",
    status,
    title: "Chain reaction basics",
    schema_version: 1,
    evidence: {
      predictions: [],
      trials: [],
      adaptationProposals: [],
      counterfactuals: [],
    },
    workflow: { pendingPrediction: null },
    created_at: "2026-08-03T09:30:00.000Z",
    updated_at: hoursAgo(2),
    completed_at: completedAt,
    ...overrides,
  };
}

function evidenceWithTrials(count: number) {
  return {
    predictions: [],
    trials: Array.from({ length: count }, (_, index) => ({ id: `t${index}` })),
    adaptationProposals: [],
    counterfactuals: [],
  };
}

describe("Greeting", () => {
  it("computes the time-of-day boundaries per the copy spec", () => {
    expect(greetingForHour(5)).toBe("morning");
    expect(greetingForHour(11)).toBe("morning");
    expect(greetingForHour(12)).toBe("afternoon");
    expect(greetingForHour(16)).toBe("afternoon");
    expect(greetingForHour(17)).toBe("evening");
    expect(greetingForHour(23)).toBe("evening");
    expect(greetingForHour(4)).toBe("evening");
  });

  it("greets with the first name once mounted", async () => {
    render(<Greeting displayName="Ada Lovelace" email="ada@example.com" />);
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(
      /^Good (morning|afternoon|evening), Ada\.$/,
    );
  });

  it("falls back to the email local part when there is no display name", async () => {
    render(<Greeting displayName={null} email="ada@example.com" />);
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(
      /^Good (morning|afternoon|evening), ada\.$/,
    );
  });

  it("drops the name entirely when nothing is available", async () => {
    render(<Greeting displayName={null} email={null} />);
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^Good (morning|afternoon|evening)\.$/);
  });
});

describe("formatRelativeTime", () => {
  it("renders hours for a two-hour-old session", () => {
    expect(formatRelativeTime(hoursAgo(2))).toBe("2 hours ago");
  });

  it("renders minutes for a recent session", () => {
    expect(formatRelativeTime(hoursAgo(1 / 60))).toBe("1 minute ago");
  });

  it("handles missing timestamps", () => {
    expect(formatRelativeTime(null)).toBe("recently");
  });
});

describe("ContinueLearningCard", () => {
  it("shows the real active session with its stage and continue link", () => {
    const session = sessionFixture("active", {
      evidence: evidenceWithTrials(2),
    });
    render(<ContinueLearningCard sessions={[session]} />);

    expect(
      screen.getByRole("heading", { name: "Continue learning" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Trial 3 of your session")).toBeInTheDocument();
    expect(
      screen.getByText(/You last worked on this .* ago\./),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Continue session" });
    expect(link).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction?resume=session-1",
    );
  });

  it("shows 'Make your prediction' when a prediction is pending", () => {
    const session = sessionFixture("active", {
      workflow: { pendingPrediction: { trialId: "t2", answer: "faster" } },
    });
    render(<ContinueLearningCard sessions={[session]} />);
    expect(screen.getByText("Make your prediction")).toBeInTheDocument();
  });

  it("shows an honest empty state when nothing is in progress", () => {
    render(<ContinueLearningCard sessions={[]} />);
    expect(
      screen.getByText("Nothing in progress right now."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start this lab" })).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction",
    );
  });
});

describe("RecommendedNextStep (rules R1–R6)", () => {
  const completed = sessionFixture("complete");

  it("R1: an in-progress session resumes it", () => {
    const step = recommendedNextStep(
      [sessionFixture("active")],
      preferencesFixture(),
    );
    expect(step).toMatchObject({
      title: "Resume your Nuclear Chain Reaction session",
      actionLabel: "Resume",
      href: "/lab/nuclear-chain-reaction?resume=session-1",
    });
    expect(step?.supporting).toMatch(/You last worked on this .* ago\./);
  });

  it("R2: completed session + understand_concept goal", () => {
    const step = recommendedNextStep(
      [completed],
      preferencesFixture({ learning_goal: "understand_concept" }),
    );
    expect(step?.title).toBe(
      "Try changing one variable to deepen your understanding.",
    );
    expect(step?.supporting).toBe(
      "From your goal: understand a difficult concept.",
    );
    expect(step?.actionLabel).toBe("Start this lab");
  });

  it("R3: completed session + prepare_for_class goal", () => {
    const step = recommendedNextStep(
      [completed],
      preferencesFixture({ learning_goal: "prepare_for_class" }),
    );
    expect(step?.title).toBe(
      "Run a quick review of the Nuclear Chain Reaction lab before class.",
    );
  });

  it("R4: completed session + explore_experiments goal", () => {
    const step = recommendedNextStep(
      [completed],
      preferencesFixture({ learning_goal: "explore_experiments" }),
    );
    expect(step?.title).toBe(
      "Explore a new run in the Nuclear Chain Reaction lab.",
    );
  });

  it("R5: no sessions at all", () => {
    const step = recommendedNextStep([], preferencesFixture());
    expect(step?.title).toBe(
      "Start your first lab — the Nuclear Chain Reaction lab is ready now.",
    );
  });

  it("R6: no stored goal falls back without goal references", () => {
    const step = recommendedNextStep([completed], null);
    expect(step?.title).toBe("Continue with the Nuclear Chain Reaction lab.");
    expect(step?.supporting).toBeNull();
  });

  it("renders the R6 fallback for completed sessions with no stored goal", () => {
    render(
      <RecommendedNextStepCard sessions={[completed]} preferences={null} />,
    );
    expect(
      screen.getByRole("heading", { name: "Recommended next step" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Continue with the Nuclear Chain Reaction lab."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start this lab" })).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction",
    );
  });
});

describe("PreferenceSummaryCard", () => {
  it("summarizes the saved preference values and only active toggles", () => {
    render(
      <PreferenceSummaryCard
        preferences={preferencesFixture({
          learning_goal: "prepare_for_class",
          preferred_representation: "graph",
          explanation_style: "visual_first",
          learning_pace: "quick",
          information_density: "full",
          reduced_motion: true,
          high_contrast: false,
          text_scale: 1.25,
          one_variable_mode: false,
          topic_interests: ["Absorbers"],
        })}
      />,
    );

    expect(screen.getByText("Goal: Prepare for class or a test")).toBeInTheDocument();
    expect(screen.getByText("Explanations: Show me visually first")).toBeInTheDocument();
    expect(screen.getByText("Pace: Quick pace")).toBeInTheDocument();
    expect(screen.getByText("Representation: Graphs")).toBeInTheDocument();
    expect(screen.getByText("Information density: Full detail")).toBeInTheDocument();
    expect(screen.getByText("Reduced motion: On")).toBeInTheDocument();
    expect(screen.getByText("Text size: 125%")).toBeInTheDocument();
    expect(screen.getByText("Topics: Absorbers")).toBeInTheDocument();
    expect(screen.getByText("You can change these anytime.")).toBeInTheDocument();

    // Only active toggles are listed — never fabricated ones.
    expect(screen.queryByText("High contrast: On")).not.toBeInTheDocument();
    expect(screen.queryByText("One-variable mode: On")).not.toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Adjust preferences" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("shows the empty state when onboarding was skipped", () => {
    render(<PreferenceSummaryCard preferences={null} />);
    expect(screen.getByText("No preferences yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Set them up now — it takes under a minute — or keep exploring without them.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up preferences" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });
});

describe("RecentSessions", () => {
  it("shows a completed session with a Review action and trial count", () => {
    render(
      <RecentSessions
        sessions={[
          sessionFixture("complete", { evidence: evidenceWithTrials(2) }),
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText(/2 completed trials/)).toBeInTheDocument();
    const review = screen.getByRole("link", { name: "Review" });
    expect(review).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction?resume=session-1",
    );
  });

  it("shows an active session with a Resume action", () => {
    render(<RecentSessions sessions={[sessionFixture("active")]} />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction?resume=session-1",
    );
  });

  it("renders an honest empty state with no fabricated rows", () => {
    render(<RecentSessions sessions={[]} />);
    expect(screen.getByText("No sessions yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Your lab sessions will appear here once you start one."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).not.toBeInTheDocument();
  });
});

describe("AvailableLabCard", () => {
  it("shows the ready lab with a start action and planned labs without one", () => {
    render(<AvailableLabCard />);

    expect(
      screen.getByRole("heading", { name: "Available lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Interactive lab ready")).toBeInTheDocument();
    const start = screen.getByRole("link", {
      name: "Start the Nuclear Chain Reaction lab",
    });
    expect(start).toHaveAttribute("href", "/lab/nuclear-chain-reaction");

    expect(
      screen.getByText("High-Voltage Circuit Failure — planned"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Exothermic Thermal Runaway — planned"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "These labs are in development. You'll see them here when they're ready.",
      ),
    ).toBeInTheDocument();

    // Planned labs have no start action.
    expect(
      screen.queryByRole("link", { name: /High-Voltage/i }),
    ).not.toBeInTheDocument();
  });
});

describe("DashboardContent (all sections from real data)", () => {
  it("renders every section in order from seeded real data", async () => {
    render(
      <DashboardContent
        profile={profileFixture()}
        preferences={preferencesFixture()}
        sessions={[sessionFixture("active", { evidence: evidenceWithTrials(1) })]}
        email="ada@example.com"
      />,
    );

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Continue learning" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recommended next step" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your learning preferences" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recent sessions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Available lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Future labs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continue session" }),
    ).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction?resume=session-1",
    );
  });

  it("shows the loading skeleton that streams while the data fetch is pending", () => {
    render(<DashboardSkeleton />);
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading your dashboard")).toBeInTheDocument();
  });

  it("shows a calm fallback with a retry link when the cloud queries fail", () => {
    render(<LoadError />);
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn't load your dashboard/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
