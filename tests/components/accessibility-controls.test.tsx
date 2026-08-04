import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AccessibilityControls,
} from "@/components/lab/accessibility-controls";
import { DEFAULT_LEARNER_PREFERENCES } from "@/domain/learner";

function renderControls(onChange = vi.fn()) {
  return render(
    <AccessibilityControls
      preferences={DEFAULT_LEARNER_PREFERENCES}
      onChange={onChange}
    />,
  );
}

describe("AccessibilityControls", () => {
  it("renders every learner-controlled display control", () => {
    renderControls();

    // Sliders with live values.
    expect(
      screen.getByLabelText("Animation speed"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Text size"),
    ).toBeInTheDocument();

    // Toggles (role=switch).
    expect(
      screen.getByRole("switch", { name: "Reduced motion" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "One-variable mode" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "High contrast" }),
    ).toBeInTheDocument();

    // Radio group for information density.
    expect(
      screen.getByRole("radio", { name: "low" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "medium" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "full" }),
    ).toBeInTheDocument();

    // Preferred views checkboxes.
    for (const mode of DEFAULT_LEARNER_PREFERENCES.preferredRepresentations) {
      expect(
        screen.getByRole("checkbox", { name: mode.replace("_", " ") }),
      ).toBeInTheDocument();
    }
  });

  it("no longer offers a feedback timing radio group", () => {
    renderControls();

    // The feedback timing control is a dead control (nothing consumes
    // LearnerPreferences.feedbackTiming), so the visible radio group must be
    // gone even though the schema field remains for backward compatibility.
    expect(
      screen.queryByRole("radio", {
        name: /immediate|after trial|hints|manual/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Feedback timing" }),
    ).not.toBeInTheDocument();
  });

  it("reports high contrast toggle changes to onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderControls(onChange);

    await user.click(screen.getByRole("switch", { name: "High contrast" }));

    expect(onChange).toHaveBeenCalledWith({ highContrast: true });
  });
});
