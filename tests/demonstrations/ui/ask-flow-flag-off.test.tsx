import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The hero is a heavy client component; the real page.tsx contributes no h1 of
// its own (the sole h1 comes from the hero), so the mock mirrors the hero's h1
// to keep the "exactly one h1" invariant of the composed page intact.
vi.mock("@/components/ui/topic-input-hero", () => ({
  TopicInputHero: () => (
    <section aria-label="Find a learning path">
      <h1>What topic do you need help with?</h1>
      topic hero
    </section>
  ),
}));

// The platform header (client) renders auth state and its own SignInDialog.
// Keep it deterministic: signed-out session, no search params, no OAuth calls.
vi.mock("@/lib/firebase/use-session", () => ({
  useSession: () => ({ user: null, loading: false }),
}));

vi.mock("@/lib/firebase/auth", () => ({
  signInWithGoogle: vi.fn(async () => null),
  signOut: vi.fn(async () => null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
}));

let HomeComponent: typeof import("@/app/page").default;

beforeAll(async () => {
  // The flag is read from the environment at module load. Force it off so this
  // suite is deterministic regardless of the developer's shell environment,
  // then import the page module after stubbing.
  vi.stubEnv("NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED", "0");
  HomeComponent = (await import("@/app/page")).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("Homepage with the generative demonstration flag off", () => {
  it("keeps the existing topic-first hero and omits the ask-demo section", () => {
    render(<HomeComponent />);

    // The existing topic-first hero is untouched.
    expect(screen.getByText("topic hero")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    // The flag-gated ask-demo section is absent: no heading, no form, no
    // input for asking a demonstration.
    expect(
      screen.queryByRole("heading", { name: "Ask for a demonstration" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Generate demonstration")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
