import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CloudSyncStatus } from "@/components/sync/cloud-sync-status";

/**
 * Contract label matrix (copy spec §7.1): signed-out learners always see
 * "Saved on this device"; signed-in learners see Saving… / Saved (which fades
 * after 2500 ms) / the calm offline message; cloud_newer renders the honest
 * "Saved on this device".
 */

describe("CloudSyncStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'Saved on this device' for signed-out learners regardless of sync status", () => {
    const { rerender } = render(
      <CloudSyncStatus status="saved" signedIn={false} />
    );
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();

    rerender(<CloudSyncStatus status="saving" signedIn={false} />);
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();

    rerender(<CloudSyncStatus status="offline" signedIn={false} />);
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });

  it('shows "Saving…" while a save is in flight', () => {
    render(<CloudSyncStatus status="saving" signedIn />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it('shows "Saved" and fades it away after 2500 ms', () => {
    render(<CloudSyncStatus status="saved" signedIn />);
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // Before the fade window the confirmation is still visible.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();

    // After 2500 ms the label disappears, but the status region stays for a
    // stable layout.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the calm offline message and never fades it away", () => {
    render(<CloudSyncStatus status="offline" signedIn />);
    expect(
      screen.getByText("Couldn't sync — your work is safe on this device")
    ).toBeInTheDocument();

    // Failures stay visible (the fade only applies to "Saved").
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.getByText("Couldn't sync — your work is safe on this device")
    ).toBeInTheDocument();
  });

  it('renders the honest "Saved on this device" for cloud_newer', () => {
    render(<CloudSyncStatus status="cloud_newer" signedIn />);
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });

  it("renders nothing for idle but keeps the status region", () => {
    render(<CloudSyncStatus status="idle" signedIn />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/Saved|Saving|sync/i)).not.toBeInTheDocument();
  });

  it("re-shows a later 'Saved' after a faded state passes through another status", () => {
    const { rerender } = render(<CloudSyncStatus status="saved" signedIn />);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    // Any non-saved status resets showSaved (0 ms effect timer), so a later
    // "saved" state is visible again instead of staying permanently hidden.
    rerender(<CloudSyncStatus status="saving" signedIn />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(0);
    });

    rerender(<CloudSyncStatus status="saved" signedIn />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
