import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OnboardingPage from "@/app/onboarding/page";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

/**
 * Server-side behavior of /onboarding (defense in depth on top of the proxy):
 * no session or unconfigured Supabase → /?auth=open; completed onboarding
 * (onboarding_version >= CURRENT_ONBOARDING_VERSION) → /dashboard; otherwise
 * the header + wizard render.
 */

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
  const createClient = vi.fn();
  const push = vi.fn();
  const browserUser = { id: "user-platform-a", email: "ada@example.com" };
  return { redirect, createClient, push, browserUser };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mocks.redirect(path),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createClient: () => mocks.createClient(),
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  getBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.browserUser }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
        maybeSingle: async () => ({ data: null, error: null }),
        order: async () => ({ data: [], error: null }),
      }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock("@/components/navigation/app-header", () => ({
  AppHeader: () => <header>App header marker</header>,
}));

interface ServerClientShape {
  auth: { getUser: () => Promise<{ data: { user: unknown }; error: null }> };
  from: (
    table: string
  ) => {
    select: () => {
      maybeSingle: () => Promise<{ data: unknown; error: null }>;
    };
  };
}

function serverClient({
  user,
  profileVersion,
}: {
  user: unknown;
  profileVersion: number | null;
}): ServerClientShape {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        maybeSingle: async () => ({
          data:
            table === "profiles" && profileVersion !== null
              ? { onboarding_version: profileVersion }
              : null,
          error: null,
        }),
      }),
    }),
  };
}

describe("OnboardingPage (server component)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects signed-out visitors to /?auth=open", async () => {
    mocks.createClient.mockResolvedValue(
      serverClient({ user: null, profileVersion: null })
    );

    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/?auth=open");
    expect(mocks.redirect).toHaveBeenCalledWith("/?auth=open");
  });

  it("redirects to /?auth=open when Supabase is not configured", async () => {
    mocks.createClient.mockResolvedValue(null);

    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("/?auth=open");
    expect(mocks.redirect).toHaveBeenCalledWith("/?auth=open");
  });

  it("sends completed learners straight to /dashboard", async () => {
    mocks.createClient.mockResolvedValue(
      serverClient({
        user: mocks.browserUser,
        profileVersion: CURRENT_ONBOARDING_VERSION,
      })
    );

    await expect(OnboardingPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("/dashboard");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the header and the wizard when onboarding is incomplete (no profile)", async () => {
    mocks.createClient.mockResolvedValue(
      serverClient({ user: mocks.browserUser, profileVersion: null })
    );

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
    mocks.createClient.mockResolvedValue(
      serverClient({ user: mocks.browserUser, profileVersion: 0 })
    );

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

  it("lets completed learners rerun onboarding via ?rerun=1", async () => {
    mocks.createClient.mockResolvedValue(
      serverClient({
        user: mocks.browserUser,
        profileVersion: CURRENT_ONBOARDING_VERSION,
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
  });
});
