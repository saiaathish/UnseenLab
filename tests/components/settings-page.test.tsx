import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SettingsTabs,
  type SettingsUserInfo,
} from "@/components/settings/settings-tabs";
import type {
  LearnerPreferencesRow,
  ProfileRow,
} from "@/lib/supabase/types";

/**
 * Settings tests (copy spec §6). Profile save, debounced preference save,
 * accessibility applied immediately, export download, confirmed deletions,
 * and sign-out navigation — all against a mocked browser client.
 */

const {
  signOutMock,
  toastSuccessMock,
  routerPushMock,
  routerRefreshMock,
  getBrowserClientMock,
} = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => null),
  toastSuccessMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  getBrowserClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  getBrowserClient: getBrowserClientMock,
}));
vi.mock("@/lib/supabase/auth", () => ({ signOut: signOutMock }));
vi.mock("sonner", () => ({ toast: { success: toastSuccessMock } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));

const SESSION_USER = {
  id: "user-platform-a",
  email: "ada@example.com",
  user_metadata: {
    full_name: "Ada Lovelace",
    avatar_url: "https://example.com/ada.jpg",
  },
  app_metadata: { provider: "google" },
};

const USER_INFO: SettingsUserInfo = {
  id: "user-platform-a",
  email: "ada@example.com",
  provider: "google",
  avatarUrl: "https://example.com/ada.jpg",
  fullName: "Ada Lovelace",
};

function profileFixture(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    user_id: "user-platform-a",
    display_name: "Ada",
    avatar_url: "https://example.com/ada.jpg",
    onboarding_version: 1,
    onboarding_completed_at: "2026-08-03T10:00:00.000Z",
    created_at: "2026-08-03T09:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

function preferencesFixture(
  overrides: Partial<LearnerPreferencesRow> = {},
): LearnerPreferencesRow {
  return {
    user_id: "user-platform-a",
    learning_goal: "understand_concept",
    preferred_representation: "animation",
    explanation_style: "step_by_step",
    learning_pace: "balanced",
    animation_speed: 1,
    information_density: "medium",
    reduced_motion: false,
    high_contrast: false,
    text_scale: 1,
    one_variable_mode: true,
    topic_interests: [],
    schema_version: 1,
    created_at: "2026-08-03T10:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

function createSettingsClient() {
  const upsert = vi.fn(async (payload: Record<string, unknown>) => ({
    error: null,
    payload,
  }));
  const updateProfile = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const deleteSessions = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const deletePreferences = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const selectSessions = vi.fn(() => ({
    order: vi.fn(async () => ({
      data: [
        {
          id: "session-1",
          user_id: "user-platform-a",
          lab_slug: "nuclear-chain-reaction",
          status: "complete",
          title: "Chain reaction basics",
          schema_version: 1,
          evidence: {},
          workflow: {},
          created_at: "2026-08-03T09:30:00.000Z",
          updated_at: "2026-08-03T11:00:00.000Z",
          completed_at: "2026-08-03T11:00:00.000Z",
        },
      ],
      error: null,
    })),
  }));
  const selectPreferences = vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: preferencesFixture(),
      error: null,
    })),
  }));

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: SESSION_USER }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return { update: updateProfile };
      }
      if (table === "learner_preferences") {
        return { upsert, select: selectPreferences, delete: deletePreferences };
      }
      if (table === "learning_sessions") {
        return { select: selectSessions, delete: deleteSessions };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    client,
    upsert,
    updateProfile,
    deleteSessions,
    deletePreferences,
    selectSessions,
  };
}

function renderSettings(client = createSettingsClient()) {
  getBrowserClientMock.mockReturnValue(client.client);
  const utils = render(
    <SettingsTabs
      initialProfile={profileFixture()}
      initialPreferences={preferencesFixture()}
      user={USER_INFO}
    />,
  );
  return { ...utils, ...client };
}

async function openTab(name: string) {
  await userEvent.click(screen.getByRole("tab", { name }));
}

describe("Settings — Profile tab", () => {
  it("renders profile info, provider note, and rerun onboarding", async () => {
    renderSettings();
    expect(
      await screen.findByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Signed in with Google")).toBeInTheDocument();
    expect(screen.getByText("Onboarding complete")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada");
    expect(screen.getByRole("link", { name: "Rerun onboarding" })).toHaveAttribute(
      "href",
      "/onboarding?rerun=1",
    );
  });

  it("saves an edited display name to the profile row", async () => {
    const { updateProfile } = renderSettings();
    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, "Ada X");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({ display_name: "Ada X" });
    });
    expect(
      await screen.findByText("Saved."),
    ).toBeInTheDocument();
  });
});

describe("Settings — Learning preferences tab", () => {
  it("saves a changed preference after the debounce", async () => {
    const { upsert } = renderSettings();
    await openTab("Learning preferences");

    expect(
      screen.getByRole("heading", { name: "Learning preferences" }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Learning goal"),
      "prepare_for_class",
    );

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const payload = upsert.mock.calls[0][0];
    expect(payload.user_id).toBe("user-platform-a");
    expect(payload.learning_goal).toBe("prepare_for_class");
  });

  it("links to onboarding rerun for the four-question flow", async () => {
    renderSettings();
    await openTab("Learning preferences");
    expect(screen.getByRole("link", { name: "Rerun onboarding" })).toHaveAttribute(
      "href",
      "/onboarding?rerun=1",
    );
  });
});

describe("Settings — Accessibility tab", () => {
  it("applies body classes and root styles immediately on change", async () => {
    renderSettings();
    await openTab("Accessibility");

    expect(
      screen.getByRole("heading", { name: "Accessibility" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "High contrast" }));
    expect(document.body.classList.contains("high-contrast")).toBe(true);

    await userEvent.click(
      screen.getByRole("switch", { name: "Reduce animation motion" }),
    );
    expect(document.documentElement.dataset.reducedMotion).toBe("true");

    fireEvent.change(screen.getByLabelText(/text size/i), {
      target: { value: "1.3" },
    });
    expect(document.documentElement.style.fontSize).toBe("130%");
  });

  it("persists accessibility changes to learner_preferences after the debounce", async () => {
    const { upsert } = renderSettings();
    await openTab("Accessibility");

    await userEvent.click(screen.getByRole("switch", { name: "High contrast" }));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0][0].high_contrast).toBe(true);
  });
});

describe("Settings — Privacy and data tab", () => {
  it("exports the saved learning data as a client-side JSON download", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const { selectSessions } = renderSettings();
    await openTab("Privacy and data");

    await userEvent.click(
      screen.getByRole("button", { name: "Export saved learning data" }),
    );

    await waitFor(() => expect(selectSessions).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Your learning data is ready to download.",
    );

    vi.unstubAllGlobals();
  });

  it("requires confirmation before deleting saved learning data", async () => {
    const { deleteSessions, deletePreferences } = renderSettings();
    await openTab("Privacy and data");

    await userEvent.click(
      screen.getByRole("button", { name: "Delete my saved learning data" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(
      screen.getByText("Delete your saved learning data?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /This permanently deletes your preferences and session history/,
      ),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();

    // Cancel path: nothing is deleted.
    await userEvent.click(screen.getByRole("button", { name: "Keep my data" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(deleteSessions).not.toHaveBeenCalled();
    expect(deletePreferences).not.toHaveBeenCalled();

    // Confirm path: both tables are deleted, then a toast and refresh.
    await userEvent.click(
      screen.getByRole("button", { name: "Delete my saved learning data" }),
    );
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));

    await waitFor(() => expect(deleteSessions).toHaveBeenCalledTimes(1));
    expect(deleteSessions).toHaveBeenCalledWith();
    expect(deletePreferences).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Your saved learning data was deleted.",
    );
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("requires confirmation before clearing local device data", async () => {
    localStorage.setItem("unseenlab.preferences.v1", "{}");
    localStorage.setItem("unseenlab.evidence.v1", "{}");
    localStorage.setItem("unseenlab.workflow.v1", "{}");
    localStorage.setItem("unseenlab.onboarding-draft.v1", "{}");

    renderSettings();
    await openTab("Privacy and data");

    await userEvent.click(
      screen.getByRole("button", { name: "Clear local device data" }),
    );
    await screen.findByRole("alertdialog");
    expect(
      screen.getByText("Clear data on this device?"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear data" }));

    await waitFor(() => {
      expect(localStorage.getItem("unseenlab.preferences.v1")).toBeNull();
      expect(localStorage.getItem("unseenlab.evidence.v1")).toBeNull();
      expect(localStorage.getItem("unseenlab.workflow.v1")).toBeNull();
      expect(localStorage.getItem("unseenlab.onboarding-draft.v1")).toBeNull();
    });
  });

  it("signs out without confirmation and navigates home", async () => {
    renderSettings();
    await openTab("Privacy and data");

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(routerPushMock).toHaveBeenCalledWith("/");
    expect(routerRefreshMock).toHaveBeenCalled();
  });
});
