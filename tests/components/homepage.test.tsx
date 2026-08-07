import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The platform header (client) renders auth state and its own SignInDialog.
// Keep it deterministic: signed-out session, no search params, no OAuth calls.
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

let HomeComponent: typeof import("@/app/page").default;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED", "1");
  HomeComponent = (await import("@/app/page")).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("Homepage (generative flag on)", () => {
  it("renders the generative ask hero as the single entrance with breadth examples", () => {
    render(<HomeComponent />);

    expect(
      screen.getByRole("heading", { name: "Ask for a demonstration", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "What topic do you need help with?" }),
    ).toBeInTheDocument();

    // Breadth examples — the product promise, not a single nuclear lab.
    expect(
      screen.getByRole("button", { name: "Show why planets stay in orbit." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "What does Newton's second law say about force and mass?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How does photosynthesis transfer energy?",
      }),
    ).toBeInTheDocument();
  });

  it("no longer routes the main input through the legacy nuclear hero", () => {
    render(<HomeComponent />);

    // The legacy hero ("Find a learning path") and its nuclear chips are gone.
    expect(
      screen.queryByRole("region", { name: "Find a learning path" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Nuclear chain reactions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Why reactions accelerate" }),
    ).not.toBeInTheDocument();

    // The nuclear-centric homepage sections are gone.
    expect(
      screen.queryByRole("heading", { name: "Available lab" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Start this lab" }),
    ).not.toBeInTheDocument();
  });

  it("shows the three how-it-works steps with their sentences", () => {
    render(<HomeComponent />);

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

  it("states the accessibility commitments", () => {
    render(<HomeComponent />);

    expect(
      screen.getByRole("heading", { name: "Accessibility" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No timer\. No diagnosis-based presets\./),
    ).toBeInTheDocument();
  });
});
