import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ResearchPage from "@/app/research/page";
import { CONSENT_COPY } from "@/components/research/research-session";

/**
 * P1-B semantic consent regression tests.
 *
 * The eight required clauses must be communicated to the participant in the
 * app's consent copy. Assertions are semantic (key phrases, normalized
 * whitespace, case-insensitive) rather than exact paragraph matches, so the
 * copy can be reworded naturally without breaking tests — as long as every
 * clause stays present.
 */

interface Clause {
  id: number;
  label: string;
  /** Any one of these phrases satisfies the clause (semantic match). */
  phrases: string[];
}

const CLAUSES: Clause[] = [
  {
    id: 1,
    label: "participation is voluntary",
    phrases: ["voluntary", "voluntarily", "your choice"],
  },
  {
    id: 2,
    label: "may stop at any time",
    phrases: ["stop at any time", "stop whenever", "can stop"],
  },
  {
    id: 3,
    label: "anonymized notes (and responses) may be collected",
    phrases: ["anonymized notes", "notes may be"],
  },
  {
    id: 4,
    label: "anonymized quotes may be used",
    phrases: ["anonymized quotes", "quotes"],
  },
  {
    id: 5,
    label: "anonymized screenshots may be used",
    phrases: ["anonymized screenshots", "screenshots"],
  },
  {
    id: 6,
    label: "recording is optional and requires permission",
    phrases: ["recording is optional", "your permission", "with your permission"],
  },
  {
    id: 7,
    label: "not a diagnosis or evaluation",
    phrases: ["not a diagnosis", "no diagnosis", "not an evaluation", "not a test"],
  },
  {
    id: 8,
    label: "participation does not guarantee a learning benefit",
    phrases: ["does not guarantee", "no guarantee", "not guarantee"],
  },
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

function missingClauses(text: string): number[] {
  return CLAUSES.filter(
    (clause) =>
      !clause.phrases.some((phrase) =>
        normalize(text).includes(normalize(phrase)),
      ),
  ).map((clause) => clause.id);
}

describe("research consent copy — all eight clauses", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("covers all 8 required clauses in the app consent copy", () => {
    const missing = missingClauses(CONSENT_COPY);
    expect(missing).toEqual([]);
  });

  it("renders the consent gate with all 8 clauses visible to the participant", () => {
    render(<ResearchPage />);
    const gate = screen.getByLabelText("Research consent");
    const missing = missingClauses(gate.textContent ?? "");
    expect(missing).toEqual([]);
  });

  it("addresses the participant directly in plain, honest language", () => {
    const text = normalize(CONSENT_COPY);
    // The participant is spoken to directly ("you"), not abstracted away.
    expect(text).toContain("you");
    // No clinical/legal boilerplate that would undermine plain honesty.
    const jargon = ["informed consent", "data subject", "de-identified", "gdpr", "irb", "hereby"];
    expect(jargon.filter((term) => text.includes(term))).toEqual([]);
  });
});
