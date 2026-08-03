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

  it("offers no login or signup anywhere", () => {
    render(<Home />);
    expect(
      screen.queryByRole("button", { name: /log ?in/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign ?up/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/login|signup/i)).not.toBeInTheDocument();
  });

  it("renders exactly one h1 in the whole document", () => {
    render(<Home />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
