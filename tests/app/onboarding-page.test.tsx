import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OnboardingPage from "@/app/onboarding/page";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";
import type { LearnerPreferencesRow } from "@/lib/mongo/types";

/**
 * Server-side behavior of /onboarding (defense in depth on top of the proxy):
 * no session or unconfigured Firebase/MongoDB → /?auth=open; completed
 * onboarding (onboarding_version >= CURRENT_ONBOARDING_VERSION) → /dashboard;
 * otherwise the header + wizard render. Rerun mode (?rerun=1) passes the
 * saved preferences into the wizard as initialPrefs.
 */

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
  return {
    redirect,
    verifySessionUser: vi.fn(),
    getPlatformDb: vi.fn(),
    push: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mocks.redirect(path),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/firebase/server", () => ({
  verifySessionUser: mocks.verifySessionUser,
}));

vi.mock("@/lib/mongo/client", () => ({
  COLLECTIONS: {
    profiles: "profiles",
    learnerPreferences: "learner_preferences",
    learningSessions: "learning_sessions",
  },
  getPlatformDb: mocks.getPlatformDb,
}));

vi.mock("@/components/navigation/app-header", () => ({
  AppHeader: () => <header>App header marker</header>,
}));

// The wizard is a client component: mock the current useSession module so
// the render is deterministic.
vi.mock("@/lib/firebase/use-session", () => ({
  useSession: () => ({
    user: {
      id: "user-platform-a",
      email: "ada@example.com",
      displayName: "Ada",
      avatarUrl: null,
      provider: "google.com",
    },
    loading: false,
  }),
}));

const SESSION_USER = {
  uid: "user-platform-a",
  email: "ada@example.com",
  displayName: "Ada",
  avatarUrl: null,
  provider: "google.com",
};

function preferencesFixture(): LearnerPreferencesRow {
  return {
    user_id: "user-platform-a",
    learning_goal: "explore_experiments",
    preferred_representation: "animation",
    explanation_style: "step_by_step",
    learning_pace: "calm",
    animation_speed: 0.5,
    information_density: "medium",
    reduced_motion: true,
    high_contrast: false,
    text_scale: 1,
    one_variable_mode: true,
    topic_interests: ["quantum"],
    schema_version: 1,
    created_at: "2026-08-03T10:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
  };
}

/** Fake Mongo handle: profile by onboarding version, optional preferences. */
function platformDb({
  profileVersion,
  preferences = null,
}: {
  profileVersion: number | null;
  preferences?: LearnerPreferencesRow | null;
}) {
  return {
    collection: (name: string) => ({
      findOne: vi.fn(async () => {
        if (name === "profiles") {
          return profileVersion !== null
            ? { onboarding_version: profileVersion }
            : null;
        }
        if (name === "learner_preferences") return preferences;
        return null;
      }),
    }),
  };
}

describe("OnboardingPage (server component)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("redirects signed-out visitors to /?auth=open", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);

    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/?auth=open");
    expect(mocks.redirect).toHaveBeenCalledWith("/?auth=open");
    expect(mocks.getPlatformDb).not.toHaveBeenCalled();
  });

  it("redirects to /?auth=open when MongoDB is not configured", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.getPlatformDb.mockResolvedValue(null);

    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("/?auth=open");
    expect(mocks.redirect).toHaveBeenCalledWith("/?auth=open");
  });

  it("sends completed learners straight to /dashboard", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.getPlatformDb.mockResolvedValue(
      platformDb({ profileVersion: CURRENT_ONBOARDING_VERSION })
    );

    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("/dashboard");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the header and the wizard when onboarding is incomplete (no profile)", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.getPlatformDb.mockResolvedValue(platformDb({ profileVersion: null }));

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    expect(mocks.redirect).not.toHaveBeenCalled();
    render(element);

    expect(screen.getByText("App header marker")).toBeInTheDocument();
    await screen.findByRole("heading", {
      name: "What would you like help doing?",
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1"
    );
    expect(
      screen.getByRole("button", { name: "Skip for now" })
    ).toBeInTheDocument();
  });

  it("renders the wizard when the profile exists but onboarding is incomplete (version 0)", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.getPlatformDb.mockResolvedValue(platformDb({ profileVersion: 0 }));

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    expect(mocks.redirect).not.toHaveBeenCalled();
    render(element);

    await screen.findByRole("heading", {
      name: "What would you like help doing?",
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1"
    );
  });

  it("lets completed learners rerun onboarding via ?rerun=1 and prefills the wizard", async () => {
    const preferences = preferencesFixture();
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.getPlatformDb.mockResolvedValue(
      platformDb({
        profileVersion: CURRENT_ONBOARDING_VERSION,
        preferences,
      })
    );

    const element = await OnboardingPage({
      searchParams: Promise.resolve({ rerun: "1" }),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    render(element);

    await screen.findByRole("heading", {
      name: "What would you like help doing?",
    });
    // initialPrefs flowed into the wizard: the saved learning goal (rather
    // than the default) is the checked option on step 1.
    expect(
      screen.getByRole("radio", { name: "Explore through experiments." })
    ).toBeChecked();
  });
});
