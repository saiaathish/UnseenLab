import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResearchPage from "@/app/research/page";
import {
  RESEARCH_CONSENT_KEY,
  RESEARCH_NOTES_KEY,
  RESEARCH_SESSION_KEY,
} from "@/research/research-recorder";

beforeEach(() => {
  window.localStorage.clear();
});

const CONSENT_COPY =
  "This session records your interactions, responses, and anonymized screenshots for product testing. You may stop at any time.";

async function agreeAndStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Agree and begin" }));
  await user.click(screen.getByRole("button", { name: "Start session" }));
}

function stored(key: string) {
  return window.localStorage.getItem(key);
}

describe("research page — consent gate", () => {
  it("blocks the pre/post forms until consent is agreed", () => {
    render(<ResearchPage />);
    expect(screen.getByText(CONSENT_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/before the lab/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/after the lab/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start session" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record post answers" }),
    ).not.toBeInTheDocument();
  });

  it("stores the consent decision and reveals the pre-session form on agree", async () => {
    const user = userEvent.setup();
    render(<ResearchPage />);
    await user.click(screen.getByRole("button", { name: "Agree and begin" }));

    expect(JSON.parse(stored(RESEARCH_CONSENT_KEY)!)).toBe("agreed");
    expect(screen.getByText(/before the lab/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        /how confident are you in your answer\? \(1 = not at all, 5 = very\)/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/preferred explanation style/i),
    ).toBeInTheDocument();
  });

  it("declined consent shows the no-recording path and records nothing", async () => {
    const user = userEvent.setup();
    render(<ResearchPage />);
    await user.click(
      screen.getByRole("button", { name: "Continue without research recording" }),
    );

    expect(JSON.parse(stored(RESEARCH_CONSENT_KEY)!)).toBe("declined");
    expect(
      screen.getByRole("heading", { name: "Research recording is OFF" }),
    ).toBeInTheDocument();
    expect(stored(RESEARCH_SESSION_KEY)).toBeNull();
    expect(stored(RESEARCH_NOTES_KEY)).toBeNull();

    // The lab stays reachable, clearly labeled, with no research param.
    const labLink = screen.getByRole("link", {
      name: "Open the lab without recording",
    });
    expect(labLink).toHaveAttribute("href", "/lab/nuclear-chain-reaction");
    expect(labLink.getAttribute("href")).not.toContain("research=");
  });
});

describe("research page — session flow", () => {
  it("creates a session record from the pre form and offers the recording lab link", async () => {
    const user = userEvent.setup();
    render(<ResearchPage />);
    await agreeAndStart(user);

    expect(screen.getByRole("heading", { name: "Session started" })).toBeInTheDocument();
    const session = JSON.parse(stored(RESEARCH_SESSION_KEY)!);
    expect(session.consent).toBe("agreed");
    expect(session.pre).toMatchObject({
      confidence: 3,
      expectedEffort: 3,
      explanationStyle: "step_by_step",
    });
    expect(session.events).toEqual([]);

    const labLink = screen.getByRole("link", {
      name: "Open the lab (recording ON)",
    });
    expect(labLink).toHaveAttribute(
      "href",
      "/lab/nuclear-chain-reaction?research=1",
    );
  });

  it("records post answers into the same session", async () => {
    const user = userEvent.setup();
    render(<ResearchPage />);
    await agreeAndStart(user);

    fireEvent.change(
      screen.getByLabelText(
        /how confident are you now\? \(1 = not at all, 5 = very\)/i,
      ),
      { target: { value: "5" } },
    );
    await user.type(
      screen.getByLabelText("What became clearer?"),
      "The graph made the growth obvious",
    );
    await user.type(screen.getByLabelText("What remained confusing?"), "The seed");
    await user.type(screen.getByLabelText("One thing to remove"), "Equation view");
    await user.type(screen.getByLabelText("One thing to keep"), "The animation");

    await user.click(screen.getByRole("button", { name: "Record post answers" }));

    expect(screen.getByText(/post answers recorded/i)).toBeInTheDocument();
    const session = JSON.parse(stored(RESEARCH_SESSION_KEY)!);
    expect(session.post).toMatchObject({
      confidence: 5,
      clearer: "The graph made the growth obvious",
      confusing: "The seed",
      remove: "Equation view",
      keep: "The animation",
    });
    expect(session.completedAt).not.toBeNull();
  });

  it("keeps facilitator notes locally and in the export", async () => {
    const user = userEvent.setup();
    render(<ResearchPage />);
    await agreeAndStart(user);

    await user.type(
      screen.getByLabelText("Facilitator notes log"),
      "hesitated before adjusting the absorber",
    );
    expect(stored(RESEARCH_NOTES_KEY)).toContain("hesitated before adjusting");
  });
});

describe("research page — export", () => {
  it("downloads the anonymized shape with no email, token, or diagnosis fields", async () => {
    let capturedBlob: Blob | null = null;
    // jsdom does not implement the blob-URL API; install it so the download
    // path can be exercised and its payload inspected.
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:research";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const user = userEvent.setup();
    render(<ResearchPage />);
    await agreeAndStart(user);
    await user.click(
      screen.getByRole("button", { name: "Export anonymized session (JSON)" }),
    );

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:research");
    expect(screen.getByText("Export downloaded.")).toBeInTheDocument();

    expect(capturedBlob).not.toBeNull();
    const parsed = JSON.parse(await capturedBlob!.text());
    expect(parsed.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(parsed.consent).toBe("agreed");
    expect(parsed.pre.confidence).toBe(3);
    expect(parsed.interactionEvidence).toEqual([]);

    const forbidden = [
      "email",
      "token",
      "secret",
      "diagnosis",
      "firebase",
      "mongo",
      "password",
      "credential",
      "account",
      "user",
      "auth",
    ];
    const keys: string[] = [];
    const collect = (value: unknown, prefix: string) => {
      if (Array.isArray(value)) {
        for (const item of value) collect(item, prefix);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          keys.push(`${prefix}${key}`);
          collect(child, `${prefix}${key}.`);
        }
      }
    };
    collect(parsed, "");
    const offenders = keys.filter((key) =>
      forbidden.some((term) => key.toLowerCase().includes(term)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("research page — cleanup", () => {
  it("clears all research data and returns to the consent gate", async () => {
    const user = userEvent.setup();
    render(<ResearchPage />);
    await agreeAndStart(user);
    await user.type(
      screen.getByLabelText("Facilitator notes log"),
      "temporary note",
    );

    await user.click(screen.getByRole("button", { name: "Clear all research data" }));
    expect(
      screen.getByRole("button", {
        name: "Really clear all research data? Press again to confirm",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Really clear all research data? Press again to confirm",
      }),
    );

    expect(stored(RESEARCH_CONSENT_KEY)).toBeNull();
    expect(stored(RESEARCH_SESSION_KEY)).toBeNull();
    expect(stored(RESEARCH_NOTES_KEY)).toBeNull();
    expect(screen.getByText(CONSENT_COPY)).toBeInTheDocument();
  });
});
