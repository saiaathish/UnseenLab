import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";
import { ExperimentShell } from "@/components/lab/experiment-shell";
import type { AdaptationProposal } from "@/domain/evidence";

/**
 * While a trial is being processed (the AI interpretation can take 2-12
 * seconds), the Run control must be disabled and show honest progress, and a
 * duplicate click must never create a second trial record. The provider is
 * mocked with a deferred promise so the processing window is fully
 * deterministic.
 */

const proposeState = vi.hoisted(() => ({
  pending: false,
  resolve: undefined as ((value: AdaptationProposal[]) => void) | undefined,
}));

vi.mock("@/adaptation/llm-provider", () => ({
  createAdaptationProvider: () => ({
    propose: () =>
      proposeState.pending
        ? new Promise<AdaptationProposal[]>((resolve) => {
            proposeState.resolve = resolve;
          })
        : Promise.resolve([]),
  }),
}));

const EVIDENCE_KEY = "unseenlab.evidence.v1";

beforeEach(() => {
  window.localStorage.clear();
  proposeState.pending = false;
  proposeState.resolve = undefined;
});

describe("run guard and progress feedback", () => {
  it("disables the run button, shows progress, and ignores duplicate clicks", async () => {
    proposeState.pending = true;
    const user = userEvent.setup();
    render(<ExperimentShell experiment={NUCLEAR_CHAIN_REACTION_EXPERIMENT} />);

    await user.click(
      screen.getByRole("radio", { name: /gets slightly faster/i }),
    );
    await user.click(screen.getByRole("button", { name: "Submit prediction" }));

    const absorber = screen.getByLabelText(/absorber position/i);
    fireEvent.change(absorber, { target: { value: "0" } });

    const runButton = screen.getByRole("button", { name: /run trial/i });
    await user.click(runButton);

    // Processing window: the button is disabled and the live status is shown.
    expect(runButton).toBeDisabled();
    expect(
      screen.getByText(/interpreting your evidence/i),
    ).toBeInTheDocument();

    // The prediction cannot be edited mid-run either: an edit would be
    // silently overwritten when the run completes.
    expect(
      screen.getByRole("button", { name: /update my prediction/i }),
    ).toBeDisabled();

    // A duplicate click while processing cannot start a second run.
    await user.click(runButton).catch(() => undefined);
    expect(
      screen.getByText(/interpreting your evidence/i),
    ).toBeInTheDocument();

    // Completing the interpretation appends exactly one trial. The
    // localStorage write happens in an effect after the state resolves, so
    // await it (fixes an interleaving flake where the assertion raced the
    // write and saw the pre-write snapshot).
    proposeState.pending = false;
    proposeState.resolve?.([]);
    expect(await screen.findByText(/state summary:/i)).toBeInTheDocument();

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(EVIDENCE_KEY) ?? "null",
      );
      expect(stored.trials).toHaveLength(1);
      expect(stored.predictions).toHaveLength(1);
    });
  });
});
