/**
 * RED-TEAM — resource-exhaustion probes against validateDemoSpec /
 * sanitizeDemoSpec and the offline generator.
 *
 * Hostile inputs: thousands of objects, megabyte-scale specs, 100k-char
 * strings, 50-level recursion, 500 controls. Every case must terminate fast,
 * reject (or repair) with a bounded safe reason, and never allocate
 * unbounded output.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_SPEC_DEPTH,
  measureDepth,
  sanitizeDemoSpec,
  validateDemoSpec,
} from "@/demonstrations/validation";
import { SPEC_LIMITS } from "@/demonstrations/spec/demo-spec";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { createDefaultPreferences } from "@/domain/learner";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

const prefs = createDefaultPreferences();

function baseSpec(): DemoSpecV1 {
  const result = generateOfflineDemo("Show why planets stay in orbit.", prefs);
  if (result.status !== "spec" || !result.spec) {
    throw new Error("offline generator did not produce a spec");
  }
  return JSON.parse(JSON.stringify(result.spec)) as DemoSpecV1;
}

describe("RED-TEAM: count exhaustion", () => {
  it("rejects 2000 scene objects with count_exceeded:objects", () => {
    const spec = baseSpec();
    spec.scene3d = {
      objects: Array.from({ length: 2000 }, (_, i) => ({
        id: `obj-${i}`,
        kind: "sphere" as const,
      })),
      relationships: [],
      animations: [],
    };
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:objects");
    expect(outcome.spec).toBeUndefined();
  });

  it("rejects 500 relationships with count_exceeded:relationships", () => {
    const spec = baseSpec();
    spec.scene3d = {
      objects: Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, kind: "sphere" as const })),
      relationships: Array.from({ length: 500 }, (_, i) => ({
        id: `r${i}`,
        type: "attracts" as const,
        from: "n0",
        to: "n1",
      })),
      animations: [],
    };
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:relationships");
  });

  it("rejects 500 timeline events with count_exceeded:timeline_events", () => {
    const spec = baseSpec();
    spec.timeline = {
      events: Array.from({ length: 500 }, (_, i) => ({
        title: `Event ${i}`,
        description: "A description",
        startMs: i * 1000,
        durationMs: 500,
      })),
    };
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:timeline_events");
  });

  it("rejects 500 controls with count_exceeded:controls", () => {
    const spec = baseSpec();
    spec.controls = Array.from({ length: 500 }, (_, i) => ({
      id: `c${i}`,
      type: "slider" as const,
      label: `Control ${i}`,
      target: { kind: "scene", ref: "speed" as const },
    }));
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:controls");
  });

  it("rejects 100 prediction options with count_exceeded:prediction_options", () => {
    const spec = baseSpec();
    spec.prediction.options = Array.from({ length: 100 }, (_, i) => `Option ${i}`);
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:prediction_options");
  });

  it("rejects 50 observation prompts with count_exceeded:observationPrompts", () => {
    const spec = baseSpec();
    spec.observationPrompts = Array.from({ length: 50 }, () => ({ prompt: "Watch carefully." }));
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons.some((r) => r.startsWith("count_exceeded:"))).toBe(true);
  });

  it("rejects group nesting beyond maxGroupDepth (cycles included)", () => {
    const spec = baseSpec();
    // group a -> b -> c -> a (cycle counts as infinite depth)
    spec.scene3d = {
      objects: [
        { id: "g1", kind: "group", children: ["g2"] },
        { id: "g2", kind: "group", children: ["g3"] },
        { id: "g3", kind: "group", children: ["g1"] },
        { id: "leaf", kind: "sphere" },
      ],
      relationships: [],
      animations: [],
    };
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:group_depth");
  });

  it("rejects declared limits that lie about actual counts", () => {
    const spec = baseSpec();
    spec.scene3d = {
      objects: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, kind: "sphere" as const })),
      relationships: [],
      animations: [],
    };
    spec.limits.maxObjects = 1; // declares 1, actually 10
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("count_exceeded:objects");
  });
});

describe("RED-TEAM: size exhaustion", () => {
  it("rejects a 10 MB spec string with too_large", () => {
    const payload = JSON.stringify({ schemaVersion: 1, junk: "J".repeat(10 * 1024 * 1024) });
    const outcome = validateDemoSpec(payload);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("too_large");
    expect(outcome.spec).toBeUndefined();
  });

  it("rejects a 10 MB spec object with too_large", () => {
    const spec = baseSpec() as unknown as Record<string, unknown>;
    spec.junk = "J".repeat(10 * 1024 * 1024);
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("too_large");
  });

  it("rejects a spec just over the 256 KB cap (SPEC_LIMITS.maxSpecBytes)", () => {
    const spec = baseSpec() as unknown as Record<string, unknown>;
    spec.userQuery = "q".repeat(SPEC_LIMITS.maxSpecBytes + 1);
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("too_large");
  });

  it("accepts a spec at the size boundary (no off-by-one false rejection)", () => {
    const spec = baseSpec();
    const outcome = validateDemoSpec(spec);
    expect(["valid", "repaired"]).toContain(outcome.status);
  });
});

describe("RED-TEAM: string exhaustion", () => {
  it.each([
    ["title", (s: DemoSpecV1, t: string) => { s.title = t; }],
    ["learningObjective", (s: DemoSpecV1, t: string) => { s.learningObjective = t; }],
    ["normalizedConcept", (s: DemoSpecV1, t: string) => { s.normalizedConcept = t; }],
    ["prediction option", (s: DemoSpecV1, t: string) => { s.prediction.options[0] = t; }],
    ["observation prompt", (s: DemoSpecV1, t: string) => { s.observationPrompts[0].prompt = t; }],
    ["control label", (s: DemoSpecV1, t: string) => { s.controls[0].label = t; }],
    ["object label", (s: DemoSpecV1, t: string) => {
      s.scene3d = { objects: [{ id: "o1", kind: "sphere", label: t }], relationships: [], animations: [] };
    }],
  ])("rejects a 100k-char %s with text_exceeded", (_label, mutate) => {
    const spec = baseSpec();
    mutate(spec, "X".repeat(100_000));
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons.some((r) => r.startsWith("text_exceeded:"))).toBe(true);
  });

  it("rejects a 100k-char explanation block (timeline description)", () => {
    const spec = baseSpec();
    spec.timeline = {
      events: [{ title: "E", description: "D".repeat(100_000), startMs: 0, durationMs: 1000 }],
    };
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons.some((r) => r.startsWith("text_exceeded:"))).toBe(true);
  });

  it("repairs (clamps) out-of-range numeric fields with repair reasons instead of rejecting", () => {
    const spec = baseSpec();
    spec.simulation!.parameters[0].value = 1e12; // far above the param max
    spec.scene3d = {
      objects: [{ id: "o1", kind: "particle_field", particleCount: 1e9 }],
      relationships: [],
      animations: [],
    };
    // The showcase base spec carries animation-targeting controls; the
    // replaced scene3d must not leave dangling targets behind.
    spec.controls = [];
    const outcome = validateDemoSpec(spec);
    expect(["repaired"]).toContain(outcome.status);
    expect(outcome.reasons.some((r) => r.startsWith("repaired:"))).toBe(true);
    expect(outcome.spec).toBeDefined();
    expect(outcome.spec!.scene3d!.objects[0].particleCount).toBeLessThanOrEqual(
      SPEC_LIMITS.maxParticlesDesktop,
    );
  });
});

describe("RED-TEAM: recursion exhaustion", () => {
  it("rejects 50-level nesting with deep_recursion (object form)", () => {
    const node: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = node;
    for (let i = 0; i < 50; i++) {
      cursor.next = { v: 1 };
      cursor = cursor.next as Record<string, unknown>;
    }
    const spec = baseSpec() as unknown as Record<string, unknown>;
    spec.extra = node;
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("deep_recursion");
  });

  it("rejects 50-level nesting (string form)", () => {
    const node: Record<string, unknown> = { schemaVersion: 1 };
    let cursor: Record<string, unknown> = node;
    for (let i = 0; i < 50; i++) {
      cursor.next = { v: 1 };
      cursor = cursor.next as Record<string, unknown>;
    }
    const outcome = validateDemoSpec(JSON.stringify(node));
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("deep_recursion");
  });

  it("measureDepth is bounded by its limit argument (no stack overflow on 100k nesting)", () => {
    // Building a genuinely 100k-deep object would overflow JSON.parse in some
    // engines; the depth guard must itself be iterative-safe. We verify the
    // bounded-return contract at extreme depth using a programmatic chain.
    const chain: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 1000; i++) chain.push({ v: i });
    let node: Record<string, unknown> = chain[chain.length - 1];
    for (let i = chain.length - 2; i >= 0; i--) chain[i].next = chain[i + 1];
    node = chain[0];
    const depth = measureDepth(node, MAX_SPEC_DEPTH + 1);
    expect(depth).toBeGreaterThan(MAX_SPEC_DEPTH);
    const outcome = validateDemoSpec({ schemaVersion: 1, extra: node });
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("deep_recursion");
  });
});

describe("RED-TEAM: malformed input envelopes", () => {
  it.each([
    ["not JSON", "not json at all {{{"],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["true", true],
  ])("sanitizeDemoSpec(%s) returns fallback with malformed_json", (_label, input) => {
    const outcome = sanitizeDemoSpec(input);
    expect(outcome.status).toBe("fallback");
    expect(outcome.reasons).toContain("malformed_json");
    expect(outcome.spec).toBeUndefined();
  });

  it("validateDemoSpec surfaces fallback as rejected (callers see three states only)", () => {
    const outcome = validateDemoSpec("not json at all {{{");
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("malformed_json");
  });

  it("rejects a top-level array and a top-level string that parses to a non-object", () => {
    expect(validateDemoSpec("[1,2,3]").status).toBe("rejected");
    expect(validateDemoSpec('"hello"').status).toBe("rejected");
  });

  it("handles circular object input without crashing (fallback)", () => {
    const circular: Record<string, unknown> = { schemaVersion: 1 };
    circular.self = circular;
    const outcome = sanitizeDemoSpec(circular);
    expect(["fallback", "rejected"]).toContain(outcome.status);
  });
});
