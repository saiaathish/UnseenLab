import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@supabase/supabase-js";

/**
 * UserMenu sign-out path (PRIV-01): the "Sign out" item opens the choice
 * dialog instead of signing out immediately. Label stays `Sign out`;
 * confirming with the primary action signs out and navigates home.
 * The base-ui popup mounts asynchronously, so menu interactions poll via
 * findByRole (same pattern as sign-in-dialog's async assertions).
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

import { UserMenu } from "@/components/auth/user-menu";

const signedInUser = {
  id: "user-platform-a",
  email: "ada@example.com",
  user_metadata: {
    full_name: "Ada Lovelace",
    avatar_url: "https://example.com/ada.jpg",
  },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
} as User;

async function openMenu() {
  const user = userEvent.setup();
  render(<UserMenu user={signedInUser} />);
  await user.click(
    screen.getByRole("button", { name: "Account menu for Ada" }),
  );
  // The base-ui popup mounts asynchronously after the trigger click.
  await screen.findByRole("menu");
  return user;
}

describe("UserMenu", () => {
  beforeEach(() => {
    localStorage.clear();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(null);
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
  });

  it("offers Dashboard, Settings, and Sign out items", async () => {
    await openMenu();

    expect(
      await screen.findByRole("menuitem", { name: /Dashboard/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Settings/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("opens the sign-out dialog instead of signing out directly", async () => {
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));

    expect(
      await screen.findByRole("heading", { name: "Sign out of UnseenLab?" }),
    ).toBeInTheDocument();
    // No sign-out happens at open time; the choice is the learner's.
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("confirming the primary action signs out and navigates home", async () => {
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    await user.click(
      await screen.findByRole("button", {
        name: "Sign out and keep my data on this device",
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(routerPushMock).toHaveBeenCalledWith("/");
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("navigates to Settings from the menu", async () => {
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: /Settings/ }));

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith("/settings"));
  });
});
