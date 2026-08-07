import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
  it("omits the ask-demo section and renders the static welcome hero instead", () => {
    render(<HomeComponent />);

    // The page keeps exactly one h1 (the static welcome hero).
    expect(
      screen.getByRole("heading", {
        name: "Adaptive interactive STEM learning",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    // The flag-gated ask-demo section is absent: no heading, no form, no
    // input for asking a demonstration.
    expect(
      screen.queryByRole("heading", { name: "Ask for a demonstration" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Generate demonstration")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // The legacy nuclear hero and the nuclear homepage sections are gone in
    // both flag states.
    expect(
      screen.queryByRole("region", { name: "Find a learning path" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Available lab" }),
    ).not.toBeInTheDocument();
  });
});
