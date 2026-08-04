import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopicInputHero } from "@/components/ui/topic-input-hero";

// Keep the hero isolated and fast: the dynamically imported wave background
// (next/dynamic) is not needed for these tests.
vi.mock("@/components/ui/hero-wave-background", () => ({
  default: () => <div aria-hidden="true" />,
}));

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText(
    "Describe the topic you need help with",
  ) as HTMLTextAreaElement;
}

describe("TopicInputHero", () => {
  it("renders the main heading at level 1", () => {
    render(<TopicInputHero />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "What topic do you need help with?",
      }),
    ).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<TopicInputHero />);
    expect(
      screen.getByText(/Describe the idea that feels unclear/i),
    ).toBeInTheDocument();
  });

  it("labels the textarea accessibly", () => {
    render(<TopicInputHero />);
    expect(textarea()).toBeInTheDocument();
  });

  it("shows an inline message and focuses the input on empty submission", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.click(
      screen.getByRole("button", { name: "Find my learning path" }),
    );

    expect(
      screen.getByText("Enter a topic or choose one of the examples."),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(textarea());
    expect(
      screen.queryByRole("heading", {
        name: "We found an interactive lab for this topic.",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "That topic is not available as an interactive lab yet.",
      }),
    ).not.toBeInTheDocument();
  });

  it("routes a supported topic to the lab", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.type(textarea(), "nuclear chain reaction");
    await user.click(
      screen.getByRole("button", { name: "Find my learning path" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "We found an interactive lab for this topic.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start this lab" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/lab/nuclear-chain-reaction"),
    );
  });

  it("shows the unsupported fallback without error words", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.type(textarea(), "photosynthesis");
    await user.click(
      screen.getByRole("button", { name: "Find my learning path" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "That topic is not available as an interactive lab yet.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The Nuclear Chain Reaction lab is currently ready\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Try Nuclear Chain Reaction" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/error|failed|invalid/i),
    ).not.toBeInTheDocument();
  });

  it("fills the input from a suggestion chip without submitting", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.click(
      screen.getByRole("button", { name: "Why reactions accelerate" }),
    );

    expect(textarea().value).toBe("Why reactions accelerate");
    expect(
      screen.queryByRole("heading", { name: /We found an interactive lab/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /not available as an interactive lab/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("returns to the form when the learner edits the topic", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.type(textarea(), "photosynthesis");
    await user.click(
      screen.getByRole("button", { name: "Find my learning path" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "That topic is not available as an interactive lab yet.",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit my topic" }));

    expect(
      screen.queryByRole("heading", {
        name: "That topic is not available as an interactive lab yet.",
      }),
    ).not.toBeInTheDocument();
    expect(textarea().value).toBe("photosynthesis");
    expect(document.activeElement).toBe(textarea());
  });

  it("caps the input at 180 characters", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    expect(textarea()).toHaveAttribute("maxlength", "180");
    await user.type(textarea(), "x".repeat(200));
    expect(textarea().value).toHaveLength(180);
  });

  it("shows the HOME-04 account-value line as a muted auth link", () => {
    render(<TopicInputHero />);

    const link = screen.getByRole("link", {
      name: "Sign in to save preferences and continue across devices.",
    });
    expect(link).toHaveAttribute("href", "/?auth=open");
    // Quieter than the primary action: small, muted gray text, no fill.
    expect(link.className).toMatch(/text-gray-400/);
    expect(link.className).not.toMatch(/bg-teal-500/);
  });

  it("keeps the guest path working with no sign-up surface", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    // The only auth affordance is the HOME-04 link — no sign-up anywhere.
    expect(
      screen.queryByRole("button", { name: /sign ?up/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /sign ?up/i }),
    ).not.toBeInTheDocument();

    // Topic input still works without any auth step.
    await user.type(textarea(), "nuclear chain reaction");
    await user.click(
      screen.getByRole("button", { name: "Find my learning path" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "We found an interactive lab for this topic.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start this lab" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/lab/nuclear-chain-reaction"),
    );
  });

  it("shows the character counter past 140 characters", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.type(textarea(), "a".repeat(141));
    expect(screen.getByText(/141\/180/)).toBeInTheDocument();
  });

  it("submits on Enter without Shift", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.type(textarea(), "nuclear chain reaction{Enter}");
    expect(
      screen.getByRole("heading", {
        name: "We found an interactive lab for this topic.",
      }),
    ).toBeInTheDocument();
  });

  it("inserts a newline on Shift+Enter without submitting", async () => {
    const user = userEvent.setup();
    render(<TopicInputHero />);

    await user.type(textarea(), "nuclear chain{Shift>}{Enter}{/Shift}reaction");
    expect(textarea().value).toBe("nuclear chain\nreaction");
    expect(
      screen.queryByRole("heading", { name: /We found an interactive lab/i }),
    ).not.toBeInTheDocument();
  });
});
