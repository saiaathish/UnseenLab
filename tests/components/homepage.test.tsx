import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
  it("renders the immersive landing hero as the single generative entrance", () => {
    render(<HomeComponent />);

    expect(
      screen.getByRole("heading", {
        name: "What topic do you need help with?",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Describe the idea that feels unclear. We’ll guide you to the closest interactive learning experience.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "What topic do you need help with?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Find my learning path" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Nuclear chain reactions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Why reactions accelerate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How absorbers change reactions" }),
    ).toBeInTheDocument();
  });

  it("keeps the old visual vocabulary without restoring the legacy router", () => {
    render(<HomeComponent />);

    expect(
      screen.queryByRole("heading", { name: "Available lab" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Start this lab" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Or try an example:")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate demonstration" }),
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
