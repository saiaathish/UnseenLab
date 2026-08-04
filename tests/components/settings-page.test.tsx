import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SettingsTabs,
  type SettingsUserInfo,
} from "@/components/settings/settings-tabs";
import type { AppUser } from "@/lib/firebase/use-session";
import type {
  LearnerPreferencesRow,
  ProfileRow,
} from "@/lib/mongo/types";

/**
 * Settings tests (copy spec §6). Profile save, debounced preference save,
 * accessibility applied immediately, export download, confirmed deletions,
 * and sign-out navigation — all against the account API routes, with the
 * Firebase session and global fetch mocked.
 */

const {
  signOutMock,
  toastSuccessMock,
  routerPushMock,
  routerRefreshMock,
  fetchMock,
  isFirebaseConfiguredMock,
  sessionState,
} = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => null),
  toastSuccessMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  fetchMock: vi.fn(),
  isFirebaseConfiguredMock: vi.fn(() => true),
  sessionState: { user: null as AppUser | null, loading: false },
}));

vi.mock("@/lib/firebase/use-session", () => ({
  useSession: () => ({
    user: sessionState.user,
    loading: sessionState.loading,
  }),
}));
vi.mock("@/lib/firebase/config", () => ({
  isFirebaseConfigured: isFirebaseConfiguredMock,
}));
vi.mock("@/lib/firebase/auth", () => ({ signOut: signOutMock }));
vi.mock("sonner", () => ({ toast: { success: toastSuccessMock } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));

const SESSION_USER: AppUser = {
  id: "user-platform-a",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: "https://example.com/ada.jpg",
  provider: "google",
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

function jsonResponse(data: unknown, ok = true): Response {
  return { ok, json: async () => data } as unknown as Response;
}

interface ApiRoute {
  method: string;
  url: string;
  response: Response;
}

/** Installs a per-URL/method fetch implementation (snake_case wire format). */
function mockApi(routes: ApiRoute[]) {
  fetchMock.mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes.find(
        (r) => r.method === method && url.startsWith(r.url),
      );
      if (!route) {
        return Promise.reject(new Error(`Unhandled fetch: ${method} ${url}`));
      }
      return Promise.resolve(route.response);
    },
  );
}

function defaultRoutes(): ApiRoute[] {
  return [
    {
      method: "GET",
      url: "/api/account",
      response: jsonResponse({
        data: {
          profile: profileFixture(),
          preferences: preferencesFixture(),
        },
      }),
    },
    {
      method: "GET",
      url: "/api/cloud/sessions",
      response: jsonResponse({
        data: { sessions: [] },
      }),
    },
    {
      method: "PATCH",
      url: "/api/account/profile",
      response: jsonResponse({ data: { profile: profileFixture() } }),
    },
    {
      method: "PUT",
      url: "/api/account/preferences",
      response: jsonResponse({
        data: { preferences: preferencesFixture() },
      }),
    },
    {
      method: "DELETE",
      url: "/api/account",
      response: jsonResponse({ ok: true }),
    },
  ];
}

function findFetchCall(method: string, url: string) {
  return fetchMock.mock.calls.find(([input, init]) => {
    const callUrl = typeof input === "string" ? input : String(input);
    return (init?.method ?? "GET").toUpperCase() === method &&
      callUrl.startsWith(url);
  });
}

function bodyOf(call: unknown[] | undefined): Record<string, unknown> {
  const [, init] = call ?? [];
  return JSON.parse((init as RequestInit).body as string) as Record<
    string,
    unknown
  >;
}

function renderSettings() {
  return render(
    <SettingsTabs
      initialProfile={profileFixture()}
      initialPreferences={preferencesFixture()}
      user={USER_INFO}
    />,
  );
}

async function openTab(name: string) {
  await userEvent.click(screen.getByRole("tab", { name }));
}

describe("Settings — Profile tab", () => {
  beforeEach(() => {
    sessionState.user = SESSION_USER;
    sessionState.loading = false;
    isFirebaseConfiguredMock.mockReturnValue(true);
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mockApi(defaultRoutes());
  });

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

  it("saves an edited display name via PATCH /api/account/profile", async () => {
    renderSettings();
    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, "Ada X");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/account/profile",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ display_name: "Ada X" }),
        }),
      );
    });
    expect(
      await screen.findByText("Saved."),
    ).toBeInTheDocument();
  });

  it("shows the error state when saving fails", async () => {
    mockApi([
      {
        method: "PATCH",
        url: "/api/account/profile",
        response: jsonResponse({ error: "boom" }, false),
      },
    ]);
    renderSettings();
    const input = screen.getByLabelText("Display name");
    await userEvent.clear(input);
    await userEvent.type(input, "Ada X");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("We couldn't save your profile. Try again."),
    ).toBeInTheDocument();
  });

  it("shows the error state when the account layer is unconfigured", async () => {
    isFirebaseConfiguredMock.mockReturnValue(false);
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("We couldn't save your profile. Try again."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Settings — Learning preferences tab", () => {
  beforeEach(() => {
    sessionState.user = SESSION_USER;
    sessionState.loading = false;
    isFirebaseConfiguredMock.mockReturnValue(true);
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mockApi(defaultRoutes());
  });

  it("saves a changed preference after the debounce via PUT /api/account/preferences", async () => {
    renderSettings();
    await openTab("Learning preferences");

    expect(
      screen.getByRole("heading", { name: "Learning preferences" }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Learning goal"),
      "prepare_for_class",
    );

    await waitFor(() => {
      const call = findFetchCall("PUT", "/api/account/preferences");
      expect(call).toBeDefined();
    });
    const payload = bodyOf(findFetchCall("PUT", "/api/account/preferences"));
    expect(payload.learning_goal).toBe("prepare_for_class");
    // The server derives ownership from the session cookie.
    expect(payload).not.toHaveProperty("user_id");
  });

  it("links to onboarding rerun for the four-question flow", async () => {
    renderSettings();
    await openTab("Learning preferences");
    expect(screen.getByRole("link", { name: "Rerun onboarding" })).toHaveAttribute(
      "href",
      "/onboarding?rerun=1",
    );
  });

  it("shows the save error when unconfigured", async () => {
    isFirebaseConfiguredMock.mockReturnValue(false);
    renderSettings();
    await openTab("Learning preferences");

    await userEvent.selectOptions(
      screen.getByLabelText("Learning goal"),
      "prepare_for_class",
    );

    expect(
      await screen.findByText(
        "We couldn't save that right now. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Settings — Accessibility tab", () => {
  beforeEach(() => {
    sessionState.user = SESSION_USER;
    sessionState.loading = false;
    isFirebaseConfiguredMock.mockReturnValue(true);
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mockApi(defaultRoutes());
  });

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

  it("persists accessibility changes after the debounce, without user_id", async () => {
    renderSettings();
    await openTab("Accessibility");

    await userEvent.click(screen.getByRole("switch", { name: "High contrast" }));

    await waitFor(() => {
      const call = findFetchCall("PUT", "/api/account/preferences");
      expect(call).toBeDefined();
    });
    const payload = bodyOf(findFetchCall("PUT", "/api/account/preferences"));
    expect(payload.high_contrast).toBe(true);
    expect(payload).not.toHaveProperty("user_id");
  });
});

describe("Settings — Privacy and data tab", () => {
  beforeEach(() => {
    sessionState.user = SESSION_USER;
    sessionState.loading = false;
    isFirebaseConfiguredMock.mockReturnValue(true);
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    mockApi(defaultRoutes());
  });

  it("exports the saved learning data as a client-side JSON download", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    try {
      renderSettings();
      await openTab("Privacy and data");

      await userEvent.click(
        screen.getByRole("button", { name: "Export saved learning data" }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/account");
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/cloud/sessions?limit=1000",
        );
      });
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Your learning data is ready to download.",
      );
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("requires confirmation before deleting saved learning data", async () => {
    renderSettings();
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
    expect(fetchMock).not.toHaveBeenCalled();

    // Confirm path: DELETE /api/account, then a toast and refresh.
    await userEvent.click(
      screen.getByRole("button", { name: "Delete my saved learning data" }),
    );
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/account",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Your saved learning data was deleted.",
    );
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it("no-ops silently when unconfigured", async () => {
    isFirebaseConfiguredMock.mockReturnValue(false);
    renderSettings();
    await openTab("Privacy and data");

    await userEvent.click(
      screen.getByRole("button", { name: "Export saved learning data" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete my saved learning data" }),
    );
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
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

  it("signs out through the choice dialog and navigates home", async () => {
    localStorage.setItem("unseenlab.evidence.v1", JSON.stringify({ trials: [] }));

    renderSettings();
    await openTab("Privacy and data");

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign out of UnseenLab?" }),
    ).toBeInTheDocument();

    // Primary action keeps local device data and signs out.
    await userEvent.click(
      screen.getByRole("button", {
        name: "Sign out and keep my data on this device",
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("unseenlab.evidence.v1")).not.toBeNull();
    expect(routerPushMock).toHaveBeenCalledWith("/");
    expect(routerRefreshMock).toHaveBeenCalled();
  });
});
