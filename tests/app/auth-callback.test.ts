import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  profile: vi.fn(),
  redirect: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: URL) => {
      mocks.redirect(url.toString());
      return { url: url.toString() };
    },
  },
}));

function callbackUrl(code: string | null, next: string | null): string {
  const params = new URLSearchParams();
  if (code !== null) params.set("code", code);
  if (next !== null) params.set("next", next);
  return `http://localhost:3000/auth/callback${params.size ? `?${params}` : ""}`;
}

describe("auth callback route", () => {
  beforeEach(() => {
    mocks.exchange.mockReset().mockResolvedValue({ error: null });
    mocks.profile.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.redirect.mockReset();
    mocks.createClient
      .mockReset()
      .mockImplementation(async () => ({
        auth: {
          exchangeCodeForSession: mocks.exchange,
        },
        from: () => ({
          select: () => ({
            maybeSingle: mocks.profile,
          }),
        }),
      }));
  });

  it("redirects to /?auth=error without a code", async () => {
    await GET(new Request(callbackUrl(null, null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/?auth=error");
  });

  it("redirects to /?auth=error when the code exchange fails", async () => {
    mocks.exchange.mockResolvedValue({ error: new Error("bad code") });
    await GET(new Request(callbackUrl("code-1", null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/?auth=error");
  });

  it("redirects to /?auth=error when Supabase is not configured (createClient → null)", async () => {
    // getSupabaseConfig() returns no url/key in the guest build, so
    // createClient() resolves to null and the route must fail safe.
    mocks.createClient.mockResolvedValue(null);
    await GET(new Request(callbackUrl("code-1", "/dashboard")));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/?auth=error");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("honors a safe next destination for learners with complete onboarding", async () => {
    mocks.profile.mockResolvedValue({ data: { onboarding_version: 1 }, error: null });
    await GET(new Request(callbackUrl("code-1", "/lab/nuclear-chain-reaction")));
    expect(mocks.redirect).toHaveBeenCalledWith(
      "http://localhost:3000/lab/nuclear-chain-reaction"
    );
  });

  it("rejects unsafe next destinations (open redirect defense) and falls back to /dashboard", async () => {
    mocks.profile.mockResolvedValue({ data: { onboarding_version: 1 }, error: null });
    await GET(new Request(callbackUrl("code-1", "https://evil.example")));
    expect(mocks.redirect).not.toHaveBeenCalledWith(
      "http://localhost:3000/https://evil.example"
    );
    expect(mocks.redirect).not.toHaveBeenCalledWith("https://evil.example");
    // The positive contract: the learner lands on /dashboard, never a sign-in
    // failure — a regression that routed unsafe-next users to /?auth=error
    // must fail this test.
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("falls back safely when the profile fetch fails (server error, no crash)", async () => {
    // A failing profile query must not crash the route: onboarding state is
    // unknown, so the learner is sent to the safe /onboarding branch instead.
    mocks.profile.mockResolvedValue({
      data: null,
      error: new Error("db down"),
    });
    const response = await GET(
      new Request(callbackUrl("code-1", "/lab/nuclear-chain-reaction"))
    );
    expect(response).toBeDefined();
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });

  it("sends learners with incomplete onboarding to /onboarding", async () => {
    mocks.profile.mockResolvedValue({ data: { onboarding_version: 0 }, error: null });
    await GET(new Request(callbackUrl("code-1", null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });

  it("sends learners with complete onboarding to /dashboard", async () => {
    mocks.profile.mockResolvedValue({ data: { onboarding_version: 1 }, error: null });
    await GET(new Request(callbackUrl("code-1", null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/dashboard");
  });

  it("sends learners with no profile row to /onboarding", async () => {
    mocks.profile.mockResolvedValue({ data: null, error: null });
    await GET(new Request(callbackUrl("code-1", null)));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });

  it("routes an onboarding-incomplete learner to /onboarding even with a safe next", async () => {
    // Program rule: signed-in users with incomplete onboarding go to /onboarding.
    mocks.profile.mockResolvedValue({ data: { onboarding_version: 0 }, error: null });
    await GET(new Request(callbackUrl("code-1", "/dashboard")));
    expect(mocks.redirect).toHaveBeenCalledWith("http://localhost:3000/onboarding");
  });
});
