import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Sign-out choice dialog (PRIV-01). Two honest paths: keep local device data
 * (primary — the default promise) or clear it too (secondary). Both sign out
 * and land on "/"; neither touches cloud rows. Dismissal (Cancel/Esc/X) does
 * nothing. Mock pattern per test-plan-platform §2.3.
 */

const { signOutMock, routerPushMock, routerRefreshMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => null),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({ signOut: signOutMock }));
vi.mock("@/lib/supabase/use-session", () => ({
  useSession: () => ({ user: null, loading: false, client: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));

import { SignOutDialog } from "@/components/auth/sign-out-dialog";

/** Controlled harness so dismiss wiring is exercised for real. */
function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sign-out
      </button>
      <SignOutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

const EVIDENCE_KEY = "unseenlab.evidence.v1";
const PREFERENCES_KEY = "unseenlab.preferences.v1";
const WORKFLOW_KEY = "unseenlab.workflow.v1";
const SESSION_ID_KEY = "unseenlab.session-id.v1";
const ONBOARDING_DRAFT_KEY = "unseenlab.onboarding-draft.v1";
const SEEDED_SESSION_ID = "11111111-1111-4111-8111-111111111111";

/** Seeds the local evidence a signed-out user would have on the device. */
function seedLocalStorage() {
  localStorage.setItem(EVIDENCE_KEY, JSON.stringify({ trials: [] }));
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ seed: "prefs" }));
  localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ pendingPrediction: null }));
  localStorage.setItem(SESSION_ID_KEY, SEEDED_SESSION_ID);
  localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ step: 2 }));
}

function expectLocalEvidenceIntact() {
  expect(localStorage.getItem(EVIDENCE_KEY)).not.toBeNull();
  expect(localStorage.getItem(PREFERENCES_KEY)).not.toBeNull();
  expect(localStorage.getItem(WORKFLOW_KEY)).not.toBeNull();
  expect(localStorage.getItem(SESSION_ID_KEY)).toBe(SEEDED_SESSION_ID);
  expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).not.toBeNull();
}

function expectLocalEvidenceCleared() {
  expect(localStorage.getItem(EVIDENCE_KEY)).toBeNull();
  expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  expect(localStorage.getItem(WORKFLOW_KEY)).toBeNull();
  expect(localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  // The session id is rotated (fresh UUID), never the previously used one,
  // so the NEXT local session can never silently overwrite the user's
  // existing cloud row with fresh local evidence.
  expect(localStorage.getItem(SESSION_ID_KEY)).not.toBe(SEEDED_SESSION_ID);
}

describe("SignOutDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(null);
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it("renders the mandated heading, body, and both actions", () => {
    render(<SignOutDialog open={true} onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Sign out of UnseenLab?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/kept private to this browser/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Sign out and keep my data on this device",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Sign out and clear data on this device",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("primary action signs out and keeps local device data intact", async () => {
    const user = userEvent.setup();
    seedLocalStorage();
    render(<SignOutDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "Sign out and keep my data on this device",
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expectLocalEvidenceIntact();
    expect(routerPushMock).toHaveBeenCalledWith("/");
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("secondary action clears local device data, then signs out", async () => {
    const user = userEvent.setup();
    seedLocalStorage();
    render(<SignOutDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: "Sign out and clear data on this device",
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expectLocalEvidenceCleared();
    expect(routerPushMock).toHaveBeenCalledWith("/");
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("Cancel dismisses without signing out or touching local data", async () => {
    const user = userEvent.setup();
    seedLocalStorage();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open sign-out" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(signOutMock).not.toHaveBeenCalled();
    expectLocalEvidenceIntact();
  });

  it("Escape dismisses without signing out", async () => {
    const user = userEvent.setup();
    seedLocalStorage();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open sign-out" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(signOutMock).not.toHaveBeenCalled();
    expectLocalEvidenceIntact();
  });
});
