import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDefaultParameters } from "@/domain/experiments";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import type { LearnerPreferences, RepresentationMode } from "@/domain/learner";
import { REPRESENTATION_MODES } from "@/domain/learner";
import { RepresentationTabs } from "@/components/lab/representation-tabs";

const PREFERENCES: LearnerPreferences = {
  animationSpeed: 1,
  reducedMotion: false,
  informationDensity: "medium",
  preferredRepresentations: ["animation"],
  feedbackTiming: "after_trial",
  oneVariableMode: false,
  highContrast: false,
  textScale: 1,
};

const TRIAL = runSimulation({
  ...createDefaultParameters(),
  seed: 42,
}).trial;

const TAB_NAMES: Record<RepresentationMode, string> = {
  animation: "Animation",
  graph: "Graph",
  equation: "Equation",
  causal: "Causal",
  plain_language: "Plain language",
};

/**
 * RepresentationTabs is controlled, so the harness keeps its own `active`
 * state (mirroring how ExperimentShell drives it) while also reporting every
 * change to a spy.
 */
function Harness({
  initialActive,
  onChange,
}: {
  initialActive: RepresentationMode;
  onChange?: (mode: RepresentationMode) => void;
}) {
  const [active, setActive] = useState<RepresentationMode>(initialActive);
  return (
    <RepresentationTabs
      active={active}
      trial={TRIAL}
      stopReason="completed"
      preferences={PREFERENCES}
      onChange={(mode) => {
        setActive(mode);
        onChange?.(mode);
      }}
    />
  );
}

function tabByName(mode: RepresentationMode) {
  return screen.getByRole("tab", { name: TAB_NAMES[mode] });
}

function assertSingleFocusableTab(active: RepresentationMode) {
  const tabs = screen.getAllByRole("tab");
  expect(tabs).toHaveLength(REPRESENTATION_MODES.length);
  for (const tab of tabs) {
    if (tab === tabByName(active)) {
      expect(tab).toHaveAttribute("tabindex", "0");
    } else {
      expect(tab).toHaveAttribute("tabindex", "-1");
    }
  }
}

describe("RepresentationTabs WAI-ARIA keyboard pattern", () => {
  it("gives exactly one tab tabIndex 0 and roves it as selection changes", async () => {
    const user = userEvent.setup();
    render(<Harness initialActive="graph" />);

    assertSingleFocusableTab("graph");

    tabByName("graph").focus();
    await user.keyboard("{ArrowRight}");

    assertSingleFocusableTab("equation");
  });

  it("ArrowRight selects and focuses the next tab, calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialActive="animation" onChange={onChange} />);

    tabByName("animation").focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("graph");
    expect(tabByName("graph")).toHaveAttribute("aria-selected", "true");
    expect(tabByName("graph")).toHaveAttribute("tabindex", "0");
    expect(tabByName("graph")).toHaveFocus();
  });

  it("wraps ArrowRight from the last tab back to the first", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialActive="plain_language" onChange={onChange} />);

    tabByName("plain_language").focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("animation");
    expect(tabByName("animation")).toHaveFocus();
  });

  it("ArrowLeft selects and focuses the previous tab, calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialActive="equation" onChange={onChange} />);

    tabByName("equation").focus();
    await user.keyboard("{ArrowLeft}");

    expect(onChange).toHaveBeenCalledWith("graph");
    expect(tabByName("graph")).toHaveAttribute("aria-selected", "true");
    expect(tabByName("graph")).toHaveAttribute("tabindex", "0");
    expect(tabByName("graph")).toHaveFocus();
  });

  it("wraps ArrowLeft from the first tab to the last", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialActive="animation" onChange={onChange} />);

    tabByName("animation").focus();
    await user.keyboard("{ArrowLeft}");

    expect(onChange).toHaveBeenCalledWith("plain_language");
    expect(tabByName("plain_language")).toHaveFocus();
  });

  it("Home selects the first tab and End selects the last", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialActive="equation" onChange={onChange} />);

    tabByName("equation").focus();
    await user.keyboard("{Home}");

    expect(onChange).toHaveBeenCalledWith("animation");
    expect(tabByName("animation")).toHaveAttribute("aria-selected", "true");
    expect(tabByName("animation")).toHaveFocus();

    await user.keyboard("{End}");

    expect(onChange).toHaveBeenLastCalledWith("plain_language");
    expect(tabByName("plain_language")).toHaveAttribute("aria-selected", "true");
    expect(tabByName("plain_language")).toHaveFocus();
  });

  it("wires tab ids, aria-controls, and the panel's aria-labelledby", () => {
    render(<Harness initialActive="causal" />);

    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-label",
      "View the trial as",
    );

    for (const mode of REPRESENTATION_MODES) {
      expect(tabByName(mode)).toHaveAttribute("id", `rep-tab-${mode}`);
      expect(tabByName(mode)).toHaveAttribute("aria-controls", "rep-panel");
    }

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "rep-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "rep-tab-causal");
    expect(screen.getByRole("tab", { name: "Causal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("clicking a tab selects it and leaves keyboard navigation working", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initialActive="animation" onChange={onChange} />);

    await user.click(tabByName("equation"));

    expect(onChange).toHaveBeenCalledWith("equation");
    assertSingleFocusableTab("equation");
    expect(tabByName("equation")).toHaveFocus();

    // Focus is not stuck on the clicked tab: arrow keys keep working.
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenLastCalledWith("causal");
    assertSingleFocusableTab("causal");
    expect(tabByName("causal")).toHaveFocus();
  });
});
