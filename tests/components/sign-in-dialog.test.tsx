import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Controllable search params so `?auth=open` / `?auth=error` states can be
// exercised (test-plan §2: next/navigation is mocked, never faked in e2e).
const { mockSearchParams, mockSignInWithGoogle, mockLocationAssign } =
  vi.hoisted(() => ({
    mockSearchParams: vi.fn(),
    mockSignInWithGoogle: vi.fn(),
    mockLocationAssign: vi.fn(),
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

vi.mock("@/lib/firebase/use-session", () => ({
  useSession: () => ({ user: null, loading: false }),
}));

// The popup + cookie-minting call is stubbed; `isSafeRedirectPath` is the
// real module (pure allowlist) and `window.location.assign` carries the
// post-sign-in navigation.
vi.mock("@/lib/firebase/auth", () => ({
  signInWithGoogle: mockSignInWithGoogle,
}));

// jsdom does not implement location.assign; capture the navigation instead.
Object.defineProperty(window, "location", {
  value: {
    origin: "http://localhost:3000",
    assign: mockLocationAssign,
  },
  writable: true,
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
    mockLocationAssign.mockReset();
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

  it("calls signInWithGoogle with no arguments and navigates to the callback", async () => {
    const user = userEvent.setup();
    render(<SignInDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignInWithGoogle).toHaveBeenCalledWith();

    await waitFor(() => expect(mockLocationAssign).toHaveBeenCalledTimes(1));
    const url = new URL(mockLocationAssign.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("http://localhost:3000/auth/callback");
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

    await waitFor(() => expect(mockLocationAssign).toHaveBeenCalledTimes(1));
    const url = new URL(mockLocationAssign.mock.calls[0][0] as string);
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

    await waitFor(() => expect(mockLocationAssign).toHaveBeenCalledTimes(1));
    const url = new URL(mockLocationAssign.mock.calls[0][0] as string);
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

  it("shows the inline error copy when the OAuth call fails and does not navigate", async () => {
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
    expect(mockLocationAssign).not.toHaveBeenCalled();
  });
});
