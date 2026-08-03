import { describe, expect, it } from "vitest";
import {
  normalizeTopic,
  routeTopic,
  SUPPORTED_LAB_SLUG,
} from "@/lib/topic-routing";
import { NUCLEAR_CHAIN_REACTION_EXPERIMENT } from "@/domain/experiments";

describe("normalizeTopic", () => {
  it("lowercases, trims, collapses whitespace, and strips punctuation", () => {
    expect(normalizeTopic("  How   do control rods WORK?!  ")).toBe(
      "how do control rods work",
    );
  });

  it("keeps letters, digits, and spaces", () => {
    expect(normalizeTopic("Nuclear chain reaction #1: 2x!")).toBe(
      "nuclear chain reaction 1 2x",
    );
  });

  it("handles empty and whitespace-only input", () => {
    expect(normalizeTopic("")).toBe("");
    expect(normalizeTopic("   ")).toBe("");
  });
});

describe("routeTopic", () => {
  it("routes 'nuclear chain reaction' to the supported lab", () => {
    expect(routeTopic("nuclear chain reaction")).toEqual({
      status: "supported",
      labSlug: NUCLEAR_CHAIN_REACTION_EXPERIMENT.slug,
      labTitle: NUCLEAR_CHAIN_REACTION_EXPERIMENT.title,
      normalizedTopic: "nuclear chain reaction",
    });
  });

  it("routes 'How do control rods work?' to the supported lab", () => {
    const result = routeTopic("How do control rods work?");
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.labSlug).toBe(SUPPORTED_LAB_SLUG);
      expect(result.labTitle).toBe("Nuclear Chain Reaction");
      expect(result.normalizedTopic).toBe("how do control rods work");
    }
  });

  it("routes 'neutron fission' to the supported lab", () => {
    expect(routeTopic("neutron fission").status).toBe("supported");
  });

  it("routes 'photosynthesis' to unsupported", () => {
    expect(routeTopic("photosynthesis").status).toBe("unsupported");
  });

  it("returns empty for empty and whitespace-only input", () => {
    expect(routeTopic("")).toEqual({ status: "empty" });
    expect(routeTopic("   ")).toEqual({ status: "empty" });
  });

  it("normalizes punctuation and capitalization before matching", () => {
    expect(routeTopic("NUCLEAR CHAIN REACTION!").status).toBe("supported");
    expect(normalizeTopic("NUCLEAR CHAIN REACTION!")).toBe(
      "nuclear chain reaction",
    );
    expect(routeTopic("Nuclear, chain, reaction?").status).toBe("supported");
    expect(normalizeTopic("Nuclear, chain, reaction?")).toBe(
      "nuclear chain reaction",
    );
  });

  it("collapses repeated whitespace before matching", () => {
    expect(routeTopic("nuclear   chain   reaction").status).toBe("supported");
    expect(normalizeTopic("nuclear   chain   reaction")).toBe(
      "nuclear chain reaction",
    );
  });

  it("returns the normalized topic for unsupported input", () => {
    const result = routeTopic("Tell me about photosynthesis in plants!");
    expect(result.status).toBe("unsupported");
    if (result.status === "unsupported") {
      expect(result.normalizedTopic).toBe(
        "tell me about photosynthesis in plants",
      );
    }
  });

  it("returns the correct lab slug and title for supported input", () => {
    const result = routeTopic("How does a control rod work?");
    expect(result.status).toBe("supported");
    if (result.status === "supported") {
      expect(result.labSlug).toBe(SUPPORTED_LAB_SLUG);
      expect(result.labSlug).toBe(NUCLEAR_CHAIN_REACTION_EXPERIMENT.slug);
      expect(result.labTitle).toBe("Nuclear Chain Reaction");
      expect(result.labTitle).toBe(NUCLEAR_CHAIN_REACTION_EXPERIMENT.title);
    }
  });
});
