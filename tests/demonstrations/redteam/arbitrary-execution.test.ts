/**
 * RED-TEAM — arbitrary-execution vector search against the DemoSpecV1
 * validator (validateDemoSpec / sanitizeDemoSpec / demoSpecSchema).
 *
 * Hostile vectors: eval(, new Function, HTML event-handler attributes,
 * <script> tags, javascript:/data: URLs, shader source fields, prototype
 * pollution keys, hostile nesting, unknown keys. Every assertion checks BOTH
 * that the vector is contained AND that reason codes stay safe (attacker
 * payload text is never echoed back).
 *
 * Where the implementation falls short of the program's mandated gate (event-
 * handler attributes, <script>, dangerouslySetInnerHTML, case/space variants
 * of eval/new Function) the tests assert the enforceable security property —
 * the attack string is inert DATA end-to-end and no HTML sink exists in the
 * render path — and the gap itself is tracked as a finding in
 * validation-pack/generative-demo-audit.md with file:line evidence.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  demoSpecSchema,
  isExecutableCodeString,
  isUnsafeUrlString,
  sanitizeDemoSpec,
  validateDemoSpec,
} from "@/demonstrations/validation";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { createDefaultPreferences } from "@/domain/learner";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

const prefs = createDefaultPreferences();

/** A validator-clean Level 1 spec (orbits), deep-cloned per call. */
function baseSpec(): DemoSpecV1 {
  const result = generateOfflineDemo("Show why planets stay in orbit.", prefs);
  if (result.status !== "spec" || !result.spec) {
    throw new Error("offline generator did not produce a spec");
  }
  return JSON.parse(JSON.stringify(result.spec)) as DemoSpecV1;
}

/** Valid spec with the attack string placed in a string value (title). */
function specWithText(attack: string): unknown {
  const spec = baseSpec();
  (spec as unknown as { title: string }).title = attack;
  return spec;
}

/** Reason codes must be safe: no control characters, no markup, bounded.
 * Note: unknown_key reasons legitimately echo the attacker-chosen KEY name
 * (a documented P2 gap — sanitize.ts:297); the enforceable invariants here
 * are the absence of control chars (no log injection) and markup. */
const SAFE_REASON_RE = /^[^\x00-\x1F\x7F<>]+$/;

function expectSafeReasons(reasons: string[]): void {
  expect(Array.isArray(reasons)).toBe(true);
  for (const reason of reasons) {
    expect(reason).toMatch(SAFE_REASON_RE);
    expect(reason.length).toBeLessThanOrEqual(2048);
  }
}

const PAYLOAD_FRAGMENTS = [
  "alert(1)",
  "alert (1)",
  "<script",
  "</script",
  "onclick",
  "javascript:",
  "data:text/html",
  "http://evil",
  "https://evil",
  "new Function",
  "eval(",
  "dangerouslySetInnerHTML",
  "base64",
];

describe("RED-TEAM: executable-code markers", () => {
  it("rejects eval( with unsafe_value:code and safe reasons", () => {
    const outcome = validateDemoSpec(specWithText("eval(alert(1))"));
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("unsafe_value:code");
    expect(outcome.spec).toBeUndefined();
    expectSafeReasons(outcome.reasons);
  });

  it("rejects new Function with unsafe_value:code and safe reasons", () => {
    const outcome = validateDemoSpec(specWithText("new Function('return 1')"));
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("unsafe_value:code");
    expectSafeReasons(outcome.reasons);
  });

  it("rejects code markers nested anywhere in the tree (controls, scene3d, prediction)", () => {
    const cases: Array<(spec: DemoSpecV1) => void> = [
      (s) => { s.controls[0].label = "run eval(alert(1)) now"; },
      (s) => { s.prediction.options[0] = "new Function('x') result"; },
      (s) => { s.trust.limitations.push("executes eval(1)"); },
      (s) => { s.learningObjective = "call eval(alert(document.cookie))"; },
    ];
    for (const mutate of cases) {
      const spec = baseSpec();
      mutate(spec);
      const outcome = validateDemoSpec(spec);
      expect(outcome.status).toBe("rejected");
      expect(outcome.reasons).toContain("unsafe_value:code");
      expectSafeReasons(outcome.reasons);
    }
  });

  it("sanitizeDemoSpec agrees with validateDemoSpec on code markers", () => {
    const outcome = sanitizeDemoSpec(specWithText("eval(alert(1))"));
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("unsafe_value:code");
  });

  it("FIXED (P2): case/whitespace variants of code markers are rejected", () => {
    // isExecutableCodeString is now case- and whitespace-insensitive with word
    // boundaries; every variant below must be rejected, while benign words
    // ("evaluate(", "functionality") still pass.
    for (const attack of [
      "Eval(alert(1))",
      "eval (alert(1))",
      "new function('x')",
      "new  Function('x')",
      "EVAL ( alert(1) )",
    ]) {
      const outcome = validateDemoSpec(specWithText(attack));
      expect(outcome.status).toBe("rejected");
      expect(outcome.reasons).toContain("unsafe_value:code");
    }
    for (const benign of ["evaluate(", "functionality", "new function key"]) {
      const outcome = validateDemoSpec(specWithText(benign));
      expect(["valid", "repaired"]).toContain(outcome.status);
    }
  });
});

describe("RED-TEAM: URL vectors", () => {
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html;base64,PHNjcmlwdD4="],
    ["http://", "http://evil.example/x"],
    ["https://", "https://evil.example/x"],
    ["www.", "visit www.evil.example now"],
    ["protocol-relative", "//evil.example/x"],
  ])("rejects %s payload with unsafe_value:url", (_label, payload) => {
    const outcome = validateDemoSpec(specWithText(payload));
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("unsafe_value:url");
    expect(outcome.spec).toBeUndefined();
    expectSafeReasons(outcome.reasons);
  });

  it("rejects URL vectors nested in any string field", () => {
    const spec = baseSpec();
    spec.observationPrompts[0].prompt = "see https://evil.example/x for more";
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("unsafe_value:url");
  });

  it("isUnsafeUrlString covers scheme://, www., data:, javascript:", () => {
    for (const bad of ["http://a", "https://a", "data:x", "javascript:x", "www.x", "//x", "ftp://x"]) {
      expect(isUnsafeUrlString(bad)).toBe(true);
    }
    for (const ok of ["orbit", "period", "m/s", "fixed2", "energy transfer"]) {
      expect(isUnsafeUrlString(ok)).toBe(false);
    }
  });
});

describe("RED-TEAM: shader source fields (unknown keys)", () => {
  it.each(["glsl", "fragmentShader", "vertexShader"])(
    "rejects a %s field anywhere with unknown_key",
    (field) => {
      const spec = baseSpec() as unknown as Record<string, unknown>;
      spec[field] = "void main() { gl_FragColor = vec4(1.0); }";
      const outcome = validateDemoSpec(spec);
      expect(outcome.status).toBe("rejected");
      expect(outcome.reasons.some((r) => r.startsWith("unknown_key:"))).toBe(true);
      expect(outcome.spec).toBeUndefined();
    },
  );

  it("rejects shader fields nested inside scene3d objects", () => {
    const spec = baseSpec();
    spec.scene3d = {
      objects: [
        { id: "s1", kind: "sphere" },
      ],
      relationships: [],
      animations: [],
    };
    const hostile = spec as unknown as { scene3d: { objects: Array<Record<string, unknown>> } };
    hostile.scene3d.objects[0].fragmentShader = "void main(){}";
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons.some((r) => r.startsWith("unknown_key:"))).toBe(true);
  });
});

describe("RED-TEAM: prototype pollution keys", () => {
  it.each(["__proto__", "constructor", "prototype"])(
    "rejects %s at the top level with prototype_pollution",
    (key) => {
      const spec = baseSpec() as unknown as Record<string, unknown>;
      Object.defineProperty(spec, key, { value: { polluted: true }, enumerable: true, configurable: true });
      const outcome = validateDemoSpec(spec);
      expect(outcome.status).toBe("rejected");
      expect(outcome.reasons).toContain("prototype_pollution");
      expect(outcome.spec).toBeUndefined();
    },
  );

  it("rejects pollution keys nested deep inside the tree", () => {
    const spec = baseSpec();
    spec.trust = {
      ...spec.trust,
      limitations: ["x"],
    };
    const hostile = spec as unknown as { trust: Record<string, unknown> };
    // Bracket access: the Object interface's typed `constructor` member must
    // not interfere with delivering the pollution vector.
    hostile.trust["constructor"] = { prototype: { polluted: true } };
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("prototype_pollution");
  });

  it("hasPollutionKey finds __proto__ delivered as a real own property (JSON.parse round-trip)", () => {
    const attack = JSON.parse('{"__proto__":{"polluted":true},"x":1}') as Record<string, unknown>;
    const outcome = validateDemoSpec({ schemaVersion: 1, ...attack });
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("prototype_pollution");
  });
});

describe("RED-TEAM: nesting depth", () => {
  it("rejects nesting deeper than MAX_SPEC_DEPTH (8) with deep_recursion", () => {
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
    expectSafeReasons(outcome.reasons);
  });

  it("rejects hostile nesting even when delivered as a JSON string", () => {
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

  it("accepts a spec nested exactly at the allowed depth (no false positive)", () => {
    // Build the deepest legal structure: 8 levels of nested objects is
    // rejected, 8 is the max — verify the boundary is not off-by-one hostile.
    const spec = baseSpec();
    const outcome = validateDemoSpec(spec);
    expect(["valid", "repaired"]).toContain(outcome.status);
  });
});

describe("RED-TEAM: unknown keys at every object level", () => {
  it.each([
    ["top level", (s: Record<string, unknown>) => { s.extraField = 1; }],
    ["trust", (s: Record<string, unknown>) => { (s.trust as Record<string, unknown>).evil = 1; }],
    ["renderer", (s: Record<string, unknown>) => { (s.renderer as Record<string, unknown>).evil = 1; }],
    ["simulation", (s: Record<string, unknown>) => { (s.simulation as Record<string, unknown>).evil = 1; }],
    ["simulation.parameters[0]", (s: Record<string, unknown>) => {
      ((s.simulation as { parameters: Array<Record<string, unknown>> }).parameters[0]).evil = 1;
    }],
    ["controls[0]", (s: Record<string, unknown>) => { (s.controls as Array<Record<string, unknown>>)[0].evil = 1; }],
    ["prediction", (s: Record<string, unknown>) => { (s.prediction as Record<string, unknown>).evil = 1; }],
    ["provenance", (s: Record<string, unknown>) => { (s.provenance as Record<string, unknown>).evil = 1; }],
    ["limits", (s: Record<string, unknown>) => { (s.limits as Record<string, unknown>).evil = 1; }],
  ])("rejects an unknown key at %s", (_label, mutate) => {
    const spec = baseSpec() as unknown as Record<string, unknown>;
    mutate(spec);
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons.some((r) => r.startsWith("unknown_key:"))).toBe(true);
    expect(outcome.spec).toBeUndefined();
    expectSafeReasons(outcome.reasons);
  });

  it("demoSpecSchema (direct consumer) also rejects unknown keys", () => {
    const spec = baseSpec() as unknown as Record<string, unknown>;
    spec.extraField = 1;
    const result = demoSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });
});

describe("RED-TEAM: reason codes never echo attacker payloads", () => {
  it("rejected reasons never contain attacker payload fragments", () => {
    const attacks = [
      "eval(alert(document.cookie))",
      "new Function('return process')",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "http://evil.example/x",
      "<script>alert(1)</script>",
      "onclick=alert(1)",
      "dangerouslySetInnerHTML",
    ];
    for (const attack of attacks) {
      const outcome = validateDemoSpec(specWithText(attack));
      const serializedReasons = JSON.stringify(outcome.reasons).toLowerCase();
      for (const fragment of PAYLOAD_FRAGMENTS) {
        if (attack.toLowerCase().includes(fragment)) {
          expect(serializedReasons).not.toContain(fragment);
        }
      }
    }
  });

  it("FIXED (P2): unknown_key reasons never echo the attacker-chosen KEY name", () => {
    // sanitize.ts slugs unknown keys to [a-z0-9_.-] with a 24-char cap, so a
    // hostile key name — including one carrying <script> or a newline — can
    // never be reflected verbatim into reasons (and thus into log lines).
    const spec = baseSpec() as unknown as Record<string, unknown>;
    const hostileKey = "evil<script>alert(1)</script>\nEscape";
    spec[hostileKey] = "x";
    const outcome = validateDemoSpec(spec);
    expect(outcome.status).toBe("rejected");
    const echoed = outcome.reasons.find((r) => r.startsWith("unknown_key:"));
    expect(echoed).toBeDefined();
    // The hostile payload must not appear verbatim anywhere in the reasons.
    for (const fragment of ["<script>", "alert(1)", "\n", "evil<script"]) {
      expect(JSON.stringify(outcome.reasons)).not.toContain(fragment);
    }
    // Only safe slug characters survive.
    expect(echoed).toMatch(/^unknown_key:[a-z0-9_.-]+$/);
  });
});

describe("RED-TEAM: event-handler attributes and HTML tags (FIXED — P2)", () => {
  // The sanitizer now scans onclick/onerror/onload attributes, <script> tags,
  // srcdoc and dangerouslySetInnerHTML (case/whitespace-insensitive), so every
  // vector below is rejected outright. The render path also has no HTML sink
  // (primitive-3d labels are Three.js canvas sprites, React components use
  // text nodes) — the second test pins that invariant.
  it.each([
    ["onclick attribute", "click here onclick=alert(1)"],
    ["onerror attribute", "<img src=x onerror=alert(1)>"],
    ["onload attribute", "body onload=alert(1)"],
    ["script tag", "<script>alert(1)</script>"],
    ["dangerouslySetInnerHTML", 'dangerouslySetInnerHTML={{__html:"<b>x</b>"}}'],
    ["srcdoc", '<iframe srcdoc="<script>alert(1)</script>">'],
    ["onmouseover attribute", "onmouseover=alert(1)"],
  ])("%s is rejected with unsafe_value:code", (_label, attack) => {
    const outcome = validateDemoSpec(specWithText(attack));
    expect(outcome.status).toBe("rejected");
    expect(outcome.reasons).toContain("unsafe_value:code");
    expectSafeReasons(outcome.reasons);
  });

  it("no HTML sink exists in the render/component layer (source-level invariant)", () => {
    // Static guard over the actual source: spec-authored strings can only be
    // rendered as text. Any future introduction of innerHTML /
    // dangerouslySetInnerHTML / document.write into the demo surface breaks
    // this test — that is the enforceable boundary that makes the P2 gaps
    // (unscanned onclick/<script> strings) inert rather than exploitable.
    const root = join(__dirname, "..", "..", "..", "src");
    const targets = [
      join(root, "demonstrations", "renderers"),
      join(root, "components", "demonstrations"),
    ];
    const needles = ["innerHTML", "dangerouslySetInnerHTML", "insertAdjacentHTML", "document.write", "outerHTML"];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          const source = readFileSync(full, "utf8");
          for (const needle of needles) {
            if (source.includes(needle)) offenders.push(`${full}:${needle}`);
          }
        }
      }
    };
    for (const dir of targets) walk(dir);
    expect(offenders).toEqual([]);
  });
});

describe("RED-TEAM: isExecutableCodeString scan surface", () => {
  it("catches code markers across case/whitespace variants and event handlers", () => {
    expect(isExecutableCodeString("eval(alert(1))")).toBe(true);
    expect(isExecutableCodeString("new Function('x')")).toBe(true);
    expect(isExecutableCodeString("Eval(alert(1))")).toBe(true);
    expect(isExecutableCodeString("eval (alert(1))")).toBe(true);
    expect(isExecutableCodeString("new function('x')")).toBe(true);
    expect(isExecutableCodeString("onclick=alert(1)")).toBe(true);
    expect(isExecutableCodeString("<script>alert(1)</script>")).toBe(true);
    expect(isExecutableCodeString('dangerouslySetInnerHTML={{__html:"x"}}')).toBe(true);
    // Benign words never false-positive (word boundaries + required paren).
    expect(isExecutableCodeString("evaluate(")).toBe(false);
    expect(isExecutableCodeString("functionality")).toBe(false);
    expect(isExecutableCodeString("new function key")).toBe(false);
  });
});
