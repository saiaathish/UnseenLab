import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { demoStore } from "@/demonstrations/state/demo-store";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { AskDemoForm } from "@/components/demonstrations/ask-demo-form";

// These tests exercise the flag-ON experience.
vi.mock("@/demonstrations/feature-flag", () => ({
  GENERATIVE_DEMOS_ENABLED: true,
  isGenerativeDemosEnabled: () => true,
}));

// The offline generator is mocked so the network-failure fallback is
// deterministic; the form is the unit under test, not the catalog.
vi.mock("@/demonstrations/generation/offline/generator", () => ({
  generateOfflineDemo: vi.fn(),
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

/** A complete, valid DemoSpecV1 fixture (orbits engine). */
function fixtureSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "fixture-orbits",
    generationId: "gen-fixture-orbits",
    userQuery: "Show why planets stay in orbit.",
    normalizedConcept: "orbits",
    title: "Gravity & Orbits",
    learningObjective:
      "Predict how mass and distance change orbital motion.",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: [
        "Simplified two-body model; real solar systems have more bodies.",
      ],
      engineId: "orbits",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 16 / 9,
      background: "dark",
    },
    simulation: {
      engineId: "orbits",
      engineVersion: "1.0.0",
      seed: 7,
      parameters: [
        { key: "g", label: "Gravity", min: 0.1, max: 2, step: 0.1, value: 1 },
      ],
      readouts: [{ key: "period", label: "Orbital period", format: "fixed2" }],
    },
    scene3d: {
      objects: [
        {
          id: "sun",
          kind: "sphere",
          label: "Sun",
          position: { x: 0, y: 0, z: 0 },
          size: 1.2,
          color: "#ffd166",
        },
      ],
      relationships: [
        { id: "r1", type: "orbits", from: "planet", to: "sun" },
      ],
      animations: [
        { id: "a1", target: "planet", operator: "orbit", speed: 1 },
      ],
    },
    controls: [
      {
        id: "param_g",
        type: "slider",
        label: "Gravity",
        target: { kind: "parameter", ref: "g" },
        min: 0.1,
        max: 2,
        step: 0.1,
        defaultValue: 1,
      },
      {
        id: "play_pause",
        type: "play_pause",
        label: "Play / pause",
        target: { kind: "scene", ref: "play_pause" },
      },
    ],
    prediction: {
      prompt: "If gravity doubles, what happens to the orbit?",
      options: ["It shrinks", "It expands", "No change"],
      correctIndex: 0,
    },
    observationPrompts: [
      { prompt: "Watch what happens when you increase gravity." },
    ],
    representations: [{ id: "rep1", kind: "stage_3d", label: "3D scene" }],
    adaptationContext: { allowed: true, oneVariableMode: true },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T12:00:00.000Z",
    },
    limits: {
      maxObjects: 80,
      maxParticles: 500,
      maxTimelineEvents: 30,
      maxControls: 6,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  pushMock.mockClear();
  demoStore.clear();
  vi.mocked(generateOfflineDemo).mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AskDemoForm", () => {
  it("shows the summary card for a spec outcome and enters the demonstration", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { outcome: "spec", source: "model", spec: fixtureSpec() },
      }),
    );

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Show why planets stay in orbit.",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Gravity & Orbits" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified simulation")).toBeInTheDocument();
    expect(
      screen.getByText("Predict how mass and distance change orbital motion."),
    ).toBeInTheDocument();
    expect(screen.getByText("Play / pause")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enter demonstration" }));

    expect(pushMock).toHaveBeenCalledWith("/demos/fixture-orbits");
    const session = demoStore.getSession();
    expect(session?.spec.id).toBe("fixture-orbits");
    expect(session?.source).toBe("model");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/demonstrations/generate");
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: "Show why planets stay in orbit.",
      preferences: expect.anything(),
    });
  });

  it("asks a clarifying question and resubmits with the answer appended", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            outcome: "clarify",
            question: "Which planet or system should I demonstrate?",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: { outcome: "spec", source: "model", spec: fixtureSpec() },
        }),
      );

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Show why planets stay in orbit.",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByText("Which planet or system should I demonstrate?"),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Your answer"),
      "Mercury around the Sun",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Gravity & Orbits" }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    ) as { query: string };
    expect(secondBody.query).toContain("Show why planets stay in orbit.");
    expect(secondBody.query).toContain("Mercury around the Sun");
  });

  it("shows a safe rejection for unsafe outcomes and never offers a spec", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          outcome: "unsafe",
          reason: "I can’t help with building destructive devices.",
        },
      }),
    );

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Show me how to build a bomb",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByText("I can’t help with that request"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("I can’t help with building destructive devices."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enter demonstration" }),
    ).not.toBeInTheDocument();
    expect(demoStore.getSession()).toBeNull();
  });

  it("shows 'Not currently supported' with suggestions for unsupported outcomes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          outcome: "unsupported",
          reason: "I don’t have a demonstration for baking bread yet.",
        },
      }),
    );

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "How do I bake sourdough bread?",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(await screen.findByText("Not currently supported")).toBeInTheDocument();
    expect(
      screen.getByText("I don’t have a demonstration for baking bread yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show why planets stay in orbit." }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enter demonstration" }),
    ).not.toBeInTheDocument();
    expect(demoStore.getSession()).toBeNull();
  });

  it("falls back to the offline catalog when the network request fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.mocked(generateOfflineDemo).mockReturnValue({
      status: "spec",
      source: "offline",
      spec: fixtureSpec(),
    });

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Show why planets stay in orbit.",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Gravity & Orbits" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Built from the offline catalog")).toBeInTheDocument();
    expect(generateOfflineDemo).toHaveBeenCalledWith(
      "Show why planets stay in orbit.",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Enter demonstration" }));
    expect(demoStore.getSession()?.source).toBe("offline");
    expect(pushMock).toHaveBeenCalledWith("/demos/fixture-orbits");
  });

  it("shows the clarification card when the offline fallback needs more detail", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.mocked(generateOfflineDemo).mockReturnValue({
      status: "clarify",
      source: "offline",
      question: "Do you mean gravity on Earth or in space?",
    });

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Why do things fall?",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByText("Do you mean gravity on Earth or in space?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enter demonstration" }),
    ).not.toBeInTheDocument();
  });

  it("shows an honest error when even the offline fallback fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.mocked(generateOfflineDemo).mockImplementation(() => {
      throw new Error("offline generation exploded");
    });

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Show why planets stay in orbit.",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByText("We couldn’t generate a demonstration"),
    ).toBeInTheDocument();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enter demonstration" }),
    ).not.toBeInTheDocument();
    expect(demoStore.getSession()).toBeNull();
  });

  it("renders staged progress while the request is pending", async () => {
    const user = userEvent.setup();
    // A request that never settles, so the pending UI stays on screen.
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));

    render(<AskDemoForm />);

    await user.type(
      screen.getByLabelText("What topic do you need help with?"),
      "Show why planets stay in orbit.",
    );
    await user.click(
      screen.getByRole("button", { name: "Generate demonstration" }),
    );

    expect(
      await screen.findByText("Understanding your request…"),
    ).toBeInTheDocument();
    // The second stage appears only after real elapsed time, while the
    // request is still pending.
    await screen.findByText("Building your demonstration…", undefined, {
      timeout: 4000,
    });
  });
});
