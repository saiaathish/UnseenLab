import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Controllable search params so `?auth=open` / `?auth=error` states can be
// exercised (test-plan §2: next/navigation is mocked, never faked in e2e).
const { mockSearchParams, mockSignInWithGoogle } = vi.hoisted(() => ({
  mockSearchParams: vi.fn(),
  mockSignInWithGoogle: vi.fn(),
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
  useSearchParams: () => mockSearchParams(),
}));

vi.mock("@/lib/supabase/use-session", () => ({
  useSession: () => ({ user: null, loading: false, client: null }),
}));

// Keep the real isSafeRedirectPath allowlist; stub only the OAuth call.
vi.mock("@/lib/supabase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/auth")>();
  return {
    ...actual,
    signInWithGoogle: mockSignInWithGoogle,
  };
});

import { SignInDialog } from "@/components/auth/sign-in-dialog";

/** Controlled harness so open/close wiring is exercised for real. */
function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <SignInDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

const AUTH_STRINGS = [
  "Sign in to UnseenLab",
  "Save your learning preferences and continue across devices.",
  "Continue with Google",
  "or",
  "Try without an account",
  "Try the lab now. Sign in whenever you want to save progress across devices.",
  "Your saved learning data is private to your account. We do not ask for diagnosis information.",
] as const;

describe("SignInDialog", () => {
  beforeEach(() => {
    mockSearchParams.mockReturnValue(new URLSearchParams(""));
    mockSignInWithGoogle.mockReset();
    mockSignInWithGoogle.mockResolvedValue(null);
  });

  it("renders the AUTH-01..07 copy verbatim", () => {
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Sign in to UnseenLab" }),
    ).toBeInTheDocument();
    for (const text of AUTH_STRINGS) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers Try without an account as the secondary action", () => {
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Try without an account" }),
    ).toBeInTheDocument();
  });

  it("closes when the learner chooses Try without an account", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Try without an account" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls signInWithGoogle with a callback redirect", async () => {
    const user = userEvent.setup();
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    const redirectTo = mockSignInWithGoogle.mock.calls[0][0] as string;
    expect(new URL(redirectTo).pathname).toBe("/auth/callback");
    expect(redirectTo.endsWith("/auth/callback")).toBe(true);
  });

  it("appends a safe next param to the callback redirect", async () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("next=/dashboard"),
    );
    const user = userEvent.setup();
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    const redirectTo = mockSignInWithGoogle.mock.calls[0][0] as string;
    const url = new URL(redirectTo);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/dashboard");
  });

  it("ignores an unsafe next param in the redirect", async () => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams("next=https://evil.com"),
    );
    const user = userEvent.setup();
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    const redirectTo = mockSignInWithGoogle.mock.calls[0][0] as string;
    const url = new URL(redirectTo);
    expect(url.pathname).toBe("/auth/callback");
    expect(url.search).toBe("");
  });

  it("auto-opens on ?auth=open", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("auth=open"));
    render(<DialogHarness />);

    expect(
      screen.getByRole("heading", { name: "Sign in to UnseenLab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("auto-opens on ?auth=error and shows the failure copy", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("auth=error"));
    render(<DialogHarness />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't sign you in with Google. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows the inline error copy when the OAuth call fails", async () => {
    mockSignInWithGoogle.mockResolvedValue(
      new Error("Authentication is not configured yet."),
    );
    const user = userEvent.setup();
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("We couldn't sign you in with Google. Please try again.");
    // The dialog stays open; the learner can retry or dismiss.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
