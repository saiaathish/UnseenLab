import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DashboardContent,
  loadDashboardData,
  resolveSession,
} from "@/app/dashboard/page";
import type {
  Database,
  LearnerPreferencesRow,
  LearningSessionRow,
  ProfileRow,
} from "@/lib/supabase/types";

/**
 * Dashboard server logic (test plan §E2, UNIT): the page redirects signed-out
 * visitors to /?auth=open, incomplete onboarding to /onboarding, and renders
 * when onboarding is complete. The page is an async server component that
 * Next renders natively, so its decisions are extracted into the exported
 * `resolveSession` / `loadDashboardData` functions and tested directly with
 * a mocked Supabase client — the honest substitute for a live session.
 */

vi.mock("@/lib/supabase/server-client", () => ({
  createClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/navigation/app-header", () => ({
  AppHeader: () => <header>app header</header>,
}));

const USER = { id: "user-platform-a", email: "ada@example.com" };

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

function mockSupabaseClient({
  user = USER,
  profile = profileFixture(),
  preferences = preferencesFixture(),
  sessions = [sessionFixture()],
  failQueries = false,
}: {
  user?: typeof USER | null;
  profile?: ProfileRow | null;
  preferences?: LearnerPreferencesRow | null;
  sessions?: LearningSessionRow[];
  failQueries?: boolean;
} = {}) {
  const fail = failQueries
    ? { data: null, error: new Error("boom") }
    : undefined;
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () =>
              fail ?? { data: profile, error: null },
            ),
          })),
        };
      }
      if (table === "learner_preferences") {
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () =>
              fail ?? { data: preferences, error: null },
            ),
          })),
        };
      }
      if (table === "learning_sessions") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () =>
                fail ?? { data: sessions, error: null },
              ),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

/** Test double accepted where the page's data functions expect a real client. */
function asSupabaseClient(
  client: object,
): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>;
}

describe("resolveSession — signed-in gating", () => {
  it("redirects to /?auth=open when Supabase is not configured", async () => {
    expect(await resolveSession(null)).toEqual({
      kind: "redirect",
      to: "/?auth=open",
    });
  });

  it("redirects to /?auth=open when there is no session user", async () => {
    const client = mockSupabaseClient({ user: null });
    expect(await resolveSession(asSupabaseClient(client))).toEqual({
      kind: "redirect",
      to: "/?auth=open",
    });
  });

  it("passes the client and email through for a signed-in user", async () => {
    const client = mockSupabaseClient();
    const gate = await resolveSession(asSupabaseClient(client));
    expect(gate).toMatchObject({ kind: "ok", email: "ada@example.com" });
    if (gate.kind === "ok") {
      expect(gate.supabase).toBe(client);
    }
  });
});

describe("loadDashboardData — onboarding gate and data loading", () => {
  it("returns an error load instead of crashing when queries fail", async () => {
    const client = mockSupabaseClient({ failQueries: true });
    expect(await loadDashboardData(asSupabaseClient(client), null)).toEqual({ kind: "error" });
  });

  it("redirects to /onboarding when the profile is missing", async () => {
    const client = mockSupabaseClient({ profile: null });
    expect(await loadDashboardData(asSupabaseClient(client), null)).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
  });

  it("redirects to /onboarding when onboarding is incomplete", async () => {
    const client = mockSupabaseClient({
      profile: profileFixture({ onboarding_version: 0 }),
    });
    expect(await loadDashboardData(asSupabaseClient(client), null)).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
  });

  it("does not redirect when onboarding is complete", async () => {
    const client = mockSupabaseClient({
      profile: profileFixture({ onboarding_version: 1 }),
    });
    const load = await loadDashboardData(asSupabaseClient(client), "ada@example.com");
    expect(load.kind).toBe("ready");
  });

  it("loads profile, preferences, and the ten most recent sessions", async () => {
    const sessions = [sessionFixture()];
    const client = mockSupabaseClient({
      profile: profileFixture(),
      preferences: preferencesFixture(),
      sessions,
    });

    const load = await loadDashboardData(asSupabaseClient(client), "ada@example.com");
    expect(load).toMatchObject({
      kind: "ready",
      email: "ada@example.com",
    });
    if (load.kind === "ready") {
      expect(load.profile.display_name).toBe("Ada");
      expect(load.preferences?.learning_goal).toBe("understand_concept");
      expect(load.sessions).toBe(sessions);
    }

    const fromMock = client.from as ReturnType<typeof vi.fn>;
    const tables = fromMock.mock.calls.map(([table]) => table);
    expect(tables).toEqual(
      expect.arrayContaining([
        "profiles",
        "learner_preferences",
        "learning_sessions",
      ]),
    );
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
    const client = mockSupabaseClient();
    const load = await loadDashboardData(asSupabaseClient(client), null);
    expect(load).not.toHaveProperty("to");
  });
});
