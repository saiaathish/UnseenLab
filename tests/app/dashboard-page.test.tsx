import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage, {
  DashboardContent,
  loadDashboardData,
  resolveSession,
} from "@/app/dashboard/page";
import type { SessionUser } from "@/lib/firebase/server";
import type { Db } from "mongodb";
import type {
  LearnerPreferencesRow,
  LearningSessionRow,
  ProfileRow,
} from "@/lib/mongo/types";

/**
 * Dashboard server logic (test plan §E2, UNIT): the page redirects signed-out
 * visitors to /?auth=open (no session or unconfigured MongoDB), incomplete
 * onboarding to /onboarding, and renders when onboarding is complete. The
 * page is an async server component that Next renders natively, so its
 * decisions are extracted into the exported `resolveSession` /
 * `loadDashboardData` functions and tested directly with a fake Mongo handle
 * — the honest substitute for a live session.
 */

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
  return {
    redirect,
    verifySessionUser: vi.fn(),
    getPlatformDb: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mocks.redirect(path),
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
  AppHeader: () => <header>app header</header>,
}));

const USER: SessionUser = {
  uid: "user-platform-a",
  email: "ada@example.com",
  displayName: "Ada",
  avatarUrl: null,
  provider: "google.com",
};

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

function preferencesFixture(): LearnerPreferencesRow {
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
  };
}

function sessionFixture(): LearningSessionRow {
  return {
    id: "session-1",
    user_id: "user-platform-a",
    lab_slug: "nuclear-chain-reaction",
    status: "active",
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
    updated_at: "2026-08-03T10:30:00.000Z",
    completed_at: null,
  };
}

interface FakeDb {
  db: Db;
  findOneSpies: {
    profiles: ReturnType<typeof vi.fn>;
    learnerPreferences: ReturnType<typeof vi.fn>;
    learningSessions: ReturnType<typeof vi.fn>;
  };
  findSpy: ReturnType<typeof vi.fn>;
  sortSpy: ReturnType<typeof vi.fn>;
  limitSpy: ReturnType<typeof vi.fn>;
}

/**
 * Fake Mongo handle mirroring the driver chain the page uses, with the
 * spies exposed so tests can assert the security invariant (every query
 * filtered by the verified session uid).
 */
function fakeDb({
  profile = profileFixture(),
  preferences = preferencesFixture(),
  sessions = [sessionFixture()],
  failQueries = false,
}: {
  profile?: ProfileRow | null;
  preferences?: LearnerPreferencesRow | null;
  sessions?: LearningSessionRow[];
  failQueries?: boolean;
} = {}): FakeDb {
  const fail = (): never => {
    throw new Error("boom");
  };
  const findOneSpies = {
    profiles: vi.fn(async () => (failQueries ? fail() : profile)),
    learnerPreferences: vi.fn(async () =>
      failQueries ? fail() : preferences
    ),
    learningSessions: vi.fn(async () => (failQueries ? fail() : null)),
  };
  const limitSpy = vi.fn(() => ({
    toArray: vi.fn(async () => (failQueries ? fail() : sessions)),
  }));
  const sortSpy = vi.fn(() => ({ limit: limitSpy }));
  const findSpy = vi.fn(() => ({ sort: sortSpy }));
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "profiles") return { findOne: findOneSpies.profiles };
      if (name === "learner_preferences") {
        return { findOne: findOneSpies.learnerPreferences };
      }
      if (name === "learning_sessions") {
        return { findOne: findOneSpies.learningSessions, find: findSpy };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  } as unknown as Db;
  return { db, findOneSpies, findSpy, sortSpy, limitSpy };
}

describe("DashboardPage (server component) — session gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /?auth=open when the session cookie verifies to no user", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT:/?auth=open");
    expect(mocks.redirect).toHaveBeenCalledWith("/?auth=open");
    expect(mocks.getPlatformDb).not.toHaveBeenCalled();
  });

  it("redirects to /?auth=open when MongoDB is not configured (db → null)", async () => {
    mocks.verifySessionUser.mockResolvedValue(USER);
    mocks.getPlatformDb.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT:/?auth=open");
    expect(mocks.redirect).toHaveBeenCalledWith("/?auth=open");
  });
});

describe("resolveSession — signed-in gating", () => {
  it("redirects to /?auth=open when there is no verified session user", async () => {
    expect(await resolveSession(null)).toEqual({
      kind: "redirect",
      to: "/?auth=open",
    });
  });

  it("passes the user through for a verified session", async () => {
    const gate = await resolveSession(USER);
    expect(gate).toEqual({ kind: "ok", user: USER });
  });
});

describe("loadDashboardData — onboarding gate and data loading", () => {
  it("returns an error load instead of crashing when queries fail", async () => {
    const { db } = fakeDb({ failQueries: true });
    expect(await loadDashboardData(db, USER)).toEqual({ kind: "error" });
  });

  it("redirects to /onboarding when the profile is missing", async () => {
    const { db } = fakeDb({ profile: null });
    expect(await loadDashboardData(db, USER)).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
  });

  it("redirects to /onboarding when onboarding is incomplete", async () => {
    const { db } = fakeDb({ profile: profileFixture({ onboarding_version: 0 }) });
    expect(await loadDashboardData(db, USER)).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
  });

  it("does not redirect when onboarding is complete", async () => {
    const { db } = fakeDb({ profile: profileFixture({ onboarding_version: 1 }) });
    const load = await loadDashboardData(db, USER);
    expect(load.kind).toBe("ready");
  });

  it("loads profile, preferences, and the ten most recent sessions by user id", async () => {
    const sessions = [sessionFixture()];
    const { db, findOneSpies, findSpy } = fakeDb({
      profile: profileFixture(),
      preferences: preferencesFixture(),
      sessions,
    });

    const load = await loadDashboardData(db, USER);
    expect(load).toMatchObject({
      kind: "ready",
      email: "ada@example.com",
    });
    if (load.kind === "ready") {
      expect(load.profile.display_name).toBe("Ada");
      expect(load.preferences?.learning_goal).toBe("understand_concept");
      // stripDocId copies the rows, so compare structurally rather than by
      // identity.
      expect(load.sessions).toStrictEqual(sessions);
    }

    // The security invariant: every read filters by the verified session uid,
    // never a client-supplied id.
    expect(findOneSpies.profiles).toHaveBeenCalledWith({
      user_id: "user-platform-a",
    });
    expect(findOneSpies.learnerPreferences).toHaveBeenCalledWith({
      user_id: "user-platform-a",
    });
    expect(findSpy).toHaveBeenCalledWith({ user_id: "user-platform-a" });
  });

  it("sorts sessions by updated_at descending and limits to ten", async () => {
    const { db, sortSpy, limitSpy } = fakeDb();
    await loadDashboardData(db, USER);
    expect(sortSpy).toHaveBeenCalledWith({ updated_at: -1 });
    expect(limitSpy).toHaveBeenCalledWith(10);
  });
});

describe("DashboardContent — complete onboarding renders", () => {
  it("renders the dashboard sections for a complete profile", async () => {
    render(
      <DashboardContent
        profile={profileFixture()}
        preferences={preferencesFixture()}
        sessions={[sessionFixture()]}
        email="ada@example.com"
      />,
    );

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your learning preferences" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recent sessions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Available lab" }),
    ).toBeInTheDocument();
  });
});

describe("Dashboard server gating — no dangling redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the ready path never produces a redirect", async () => {
    const { db } = fakeDb();
    const load = await loadDashboardData(db, USER);
    expect(load).not.toHaveProperty("to");
  });
});
