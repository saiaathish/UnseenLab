import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

// The hero is a heavy client component; the real page.tsx contributes no h1 of
// its own (the sole h1 comes from the hero), so the mock mirrors the hero's h1
// to keep the "exactly one h1" invariant of the composed page intact.
vi.mock("@/components/ui/topic-input-hero", () => ({
  TopicInputHero: () => (
    <section aria-label="Find a learning path">
      <h1>What topic do you need help with?</h1>
      topic hero
    </section>
  ),
}));

// The platform header (client) renders auth state and its own SignInDialog.
// Keep it deterministic: signed-out session, no search params, no OAuth calls.
// isSafeRedirectPath comes from the real (pure) allowlist module, so only the
// Firebase hooks and the popup call are stubbed.
vi.mock("@/lib/firebase/use-session", () => ({
  useSession: () => ({ user: null, loading: false }),
}));

vi.mock("@/lib/firebase/auth", () => ({
  signInWithGoogle: vi.fn(async () => null),
  signOut: vi.fn(async () => null),
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

describe("Homepage", () => {
  it("shows the three how-it-works steps with their sentences", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "How it works" }),
    ).toBeInTheDocument();

    const steps: Array<[string, string]> = [
      ["Describe", "Tell us which idea feels unclear."],
      ["Experiment", "Change one variable and watch what happens."],
      ["Understand", "Compare your prediction with the result."],
    ];
    for (const [title, sentence] of steps) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByText(sentence)).toBeInTheDocument();
    }
  });

  it("promotes the available lab with a link to it", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Available lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nuclear Chain Reaction" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Interactive lab ready")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Start this lab" });
    expect(link).toHaveAttribute("href", "/lab/nuclear-chain-reaction");
  });

  it("states the accessibility commitments", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Accessibility" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No timer. No diagnosis-based presets. Reduced motion, adjustable pacing, keyboard access, and learner-controlled adaptations.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the simulation disclaimer in the footer", () => {
    render(<Home />);
    expect(
      screen.getByText(/not physically predictive/i),
    ).toBeInTheDocument();
  });

  it("offers a sign-in entry in the header and no sign-up surface", () => {
    render(<Home />);
    // The platform header adds the single auth entry point (AUTH-10).
    expect(
      screen.getAllByRole("button", { name: "Sign in" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/login|sign ?up/i)).not.toBeInTheDocument();
  });

  it("renders exactly one h1 in the whole document", () => {
    render(<Home />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
