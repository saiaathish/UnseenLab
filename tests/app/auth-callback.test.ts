import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";
import { CURRENT_ONBOARDING_VERSION } from "@/personalization/onboarding-schema";

/**
 * Post-sign-in router (test plan §E1): the callback verifies the httpOnly
 * session cookie and reads the Mongo profile instead of exchanging an OAuth
 * code. Any failure degrades to /?auth=error; incomplete onboarding always
 * wins over a `?next` hint.
 */

const mocks = vi.hoisted(() => ({
  verifySessionUser: vi.fn(),
  findOne: vi.fn(),
  redirect: vi.fn(),
  getPlatformDb: vi.fn(),
}));

vi.mock("@/lib/firebase/server", () => ({
  verifySessionUser: mocks.verifySessionUser,
}));

vi.mock("@/lib/mongo/client", () => ({
  COLLECTIONS: {
    profiles: "profiles",
    learnerPreferences: "learner_preferences",
    learningSessions: "learning_sessions",
  },
  getPlatformDb: mocks.getPlatformDb,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => {
      mocks.redirect(url.toString());
      return { url: url.toString() };
    },
  },
}));

const SESSION_USER = {
  uid: "user-platform-a",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  provider: "google.com",
};

/** Fake Mongo handle: the callback only reads the profiles collection. */
function platformDb() {
  return {
    collection: (name: string) => ({
      findOne: name === "profiles" ? mocks.findOne : vi.fn(async () => null),
    }),
  };
}

function callbackUrl(next: string | null): string {
  const params = new URLSearchParams();
  if (next !== null) params.set("next", next);
  return `http://localhost:3000/auth/callback${params.size ? `?${params}` : ""}`;
}

describe("auth callback route", () => {
  beforeEach(() => {
    mocks.verifySessionUser.mockReset();
    mocks.findOne.mockReset().mockResolvedValue(null);
    mocks.redirect.mockReset();
    mocks.getPlatformDb.mockReset().mockImplementation(async () => platformDb());
  });

  it("redirects to /?auth=error when no session cookie is present", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    await GET(new Request(callbackUrl(null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/?auth=error");
  });

  it("redirects to /?auth=error when the session cookie does not verify", async () => {
    mocks.verifySessionUser.mockResolvedValue(null);
    await GET(new Request(callbackUrl("/dashboard")));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/?auth=error");
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("looks up the profile by the uid derived from the verified session", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue({
      onboarding_version: CURRENT_ONBOARDING_VERSION,
    });
    await GET(new Request(callbackUrl(null)));
    expect(mocks.findOne).toHaveBeenCalledWith({ user_id: "user-platform-a" });
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("treats an unconfigured database as needs-onboarding (no profile)", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.getPlatformDb.mockResolvedValue(null);
    await GET(new Request(callbackUrl("/dashboard")));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });

  it("honors a safe next destination for learners with complete onboarding", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue({
      onboarding_version: CURRENT_ONBOARDING_VERSION,
    });
    await GET(new Request(callbackUrl("/lab/nuclear-chain-reaction")));
    expect(mocks.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/lab/nuclear-chain-reaction"
    );
  });

  it("rejects unsafe next destinations (open redirect defense) and falls back to /dashboard", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue({
      onboarding_version: CURRENT_ONBOARDING_VERSION,
    });
    await GET(new Request(callbackUrl("https://evil.example")));
    expect(mocks.redirect).not.toHaveBeenCalledWith(
      "http://localhost:3000/https://evil.example"
    );
    expect(mocks.redirect).not.toHaveBeenCalledWith("https://evil.example");
    // The positive contract: the learner lands on /dashboard, never a sign-in
    // failure — a regression that routed unsafe-next users to /?auth=error
    // must fail this test.
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("sends learners with incomplete onboarding to /onboarding", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue({ onboarding_version: 0 });
    await GET(new Request(callbackUrl(null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });

  it("sends learners with complete onboarding to /dashboard", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue({
      onboarding_version: CURRENT_ONBOARDING_VERSION,
    });
    await GET(new Request(callbackUrl(null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("sends learners with no profile row to /onboarding", async () => {
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue(null);
    await GET(new Request(callbackUrl(null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });

  it("routes an onboarding-incomplete learner to /onboarding even with a safe next", async () => {
    // Program rule: signed-in users with incomplete onboarding go to /onboarding.
    mocks.verifySessionUser.mockResolvedValue(SESSION_USER);
    mocks.findOne.mockResolvedValue({ onboarding_version: 0 });
    await GET(new Request(callbackUrl("/dashboard")));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });
});
