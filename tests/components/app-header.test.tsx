import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@supabase/supabase-js";

// Auth state is injected per test via mockSessionState (see test-plan §2.3
// pattern: components read useSession, tests control the return value).
const { mockSessionState } = vi.hoisted(() => ({
  mockSessionState: vi.fn(),
}));

vi.mock("@/lib/supabase/use-session", () => ({
  useSession: () => {
    const { user, loading } = mockSessionState();
    return { user, loading, client: null };
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/supabase/auth", () => ({
  signInWithGoogle: vi.fn(async () => null),
  signOut: vi.fn(async () => null),
  isSafeRedirectPath: (next: string | null) =>
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//"),
}));

import { AppHeader } from "@/components/navigation/app-header";

const signedInUser = {
  id: "user-platform-a",
  email: "sai@example.com",
  user_metadata: { full_name: "Sai" },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
} as User;

describe("AppHeader", () => {
  beforeEach(() => {
    mockSessionState.mockReturnValue({ user: null, loading: false });
  });

  it("renders the brand as a link home", () => {
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "UnseenLab" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows signed-out navigation and the Sign in button", () => {
    render(<AppHeader />);

    for (const [label, href] of [
      ["How it works", "/#how-it-works"],
      ["Available lab", "/#available-lab"],
      ["Accessibility", "/#accessibility"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }

    expect(
      screen.getAllByRole("button", { name: "Sign in" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("shows learner navigation and the avatar menu when signed in", () => {
    mockSessionState.mockReturnValue({ user: signedInUser, loading: false });
    render(<AppHeader />);

    expect(
      screen.getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Lab" })).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction",
    );

    // AUTH-11: avatar trigger labelled with the learner's first name.
    expect(
      screen.getByRole("button", { name: "Account menu for Sai" }),
    ).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "How it works" }),
    ).not.toBeInTheDocument();
  });

  it("opens the sign-in dialog from the header Sign in button", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const signInButton = screen.getAllByRole("button", {
      name: "Sign in",
    })[0];
    await user.click(signInButton);

    expect(
      screen.getByRole("heading", { name: "Sign in to UnseenLab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("keeps the dialog closed by default", () => {
    render(<AppHeader />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
