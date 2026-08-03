import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CounterfactualPanel } from "@/components/lab/counterfactual-panel";
import { NUCLEAR_PARAMETER_SPECS } from "@/domain/experiments";
import { runSimulation } from "@/simulation/nuclear-chain-reaction";
import { createDefaultParameters } from "@/domain/experiments";

beforeEach(() => {
  window.localStorage.clear();
});

describe("CounterfactualPanel", () => {
  it("emits exactly one variable change and renders the comparison", async () => {
    const user = userEvent.setup();
    const trial = runSimulation({ ...createDefaultParameters(), seed: 42 }).trial;
    const onRun = vi.fn();

    render(
      <CounterfactualPanel
        trial={trial}
        result={null}
        spec={NUCLEAR_PARAMETER_SPECS}
        onRun={onRun}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText(/which variable to change/i),
      "startingNeutrons",
    );
    await user.click(screen.getByRole("button", { name: "Run comparison" }));

    expect(onRun).toHaveBeenCalledTimes(1);
    const [variable] = onRun.mock.calls[0];
    expect(variable).toBe("startingNeutrons");
  });

  it("shows the empty state without a trial", () => {
    render(
      <CounterfactualPanel
        trial={null}
        result={null}
        spec={NUCLEAR_PARAMETER_SPECS}
        onRun={() => undefined}
      />,
    );
    expect(
      screen.getByText(/run a trial first to compare/i),
    ).toBeInTheDocument();
  });

  it("renders a completed comparison with the single changed variable", () => {
    const original = runSimulation({ ...createDefaultParameters(), seed: 42 })
      .trial;
    const counterfactual = runSimulation({
      ...createDefaultParameters(),
      seed: 42,
      startingNeutrons: 8,
    }).trial;

    render(
      <CounterfactualPanel
        trial={original}
        result={{
          original,
          counterfactual,
          changedVariable: "startingNeutrons",
        }}
        spec={NUCLEAR_PARAMETER_SPECS}
        onRun={() => undefined}
      />,
    );

    expect(
      screen.getByText(/changed exactly one variable/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/starting neutrons/i).length,
    ).toBeGreaterThan(0);
  });
});
