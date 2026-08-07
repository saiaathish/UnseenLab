import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/demonstrations/generate/route";
import { GET as healthGET } from "@/app/api/demonstrations/health/route";
import { createDefaultPreferences } from "@/domain/learner";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import type { GenerateDemoResult } from "@/demonstrations/generation/model/pipeline";

/**
 * HTTP-level tests for POST /api/demonstrations/generate and
 * GET /api/demonstrations/health.
 *
 * The pipeline module is mocked so the guards (rate limit, body cap, strict
 * input schema, envelope mapping) are tested in isolation, mirroring how the
 * adapt route guard suite treats callLlmModel. The rate limiter is
 * module-level, so every test mints with a FRESH source IP.
 */

const pipelineMocks = vi.hoisted(() => ({
  generateDemo: vi.fn(),
  generationCircuitState: vi.fn(() => ({ state: "closed", failures: 0 })),
}));

vi.mock("@/demonstrations/generation/model/pipeline", () => ({
  generateDemo: pipelineMocks.generateDemo,
  generationCircuitState: pipelineMocks.generationCircuitState,
}));

const ORBITS_QUERY = "Show why planets stay in orbit.";

/** A complete valid DemoSpecV1 (from the deterministic offline layer). */
const SAMPLE_SPEC: DemoSpecV1 = (() => {
  const result = generateOfflineDemo(ORBITS_QUERY, createDefaultPreferences());
  if (result.status !== "spec" || !result.spec) {
    throw new Error("offline generator did not produce a spec");
  }
  return result.spec;
})();

const GENERATE_URL = "http://localhost:3100/api/demonstrations/generate";

/** Unique source IP per call so rate-limit state never leaks across tests. */
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function post(body: unknown, ip: string = freshIp()): Promise<Response> {
  return POST(
    new Request(GENERATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/demonstrations/generate", () => {
  beforeEach(() => {
    pipelineMocks.generateDemo.mockReset();
    pipelineMocks.generateDemo.mockResolvedValue({
      data: { outcome: "spec", spec: SAMPLE_SPEC, source: "model" },
    } satisfies GenerateDemoResult);
  });

  afterEach(() => {
    pipelineMocks.generateDemo.mockReset();
    delete process.env.LLM_API_KEY;
  });

  it("returns the 200 data envelope for a valid request", async () => {
    const response = await post({ query: ORBITS_QUERY });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.outcome).toBe("spec");
    expect(body.data.source).toBe("model");
    expect(body.data.spec.schemaVersion).toBe(1);
    expect(body.data.spec.trust.engineId).toBe("orbits");
  });

  it("passes preferences through to the pipeline", async () => {
    const preferences = createDefaultPreferences();
    const response = await post({ query: ORBITS_QUERY, preferences });
    expect(response.status).toBe(200);
    expect(pipelineMocks.generateDemo).toHaveBeenCalledWith(
      ORBITS_QUERY,
      preferences,
    );
  });

  it("passes no preferences when the field is omitted", async () => {
    const response = await post({ query: ORBITS_QUERY });
    expect(response.status).toBe(200);
    expect(pipelineMocks.generateDemo).toHaveBeenCalledWith(
      ORBITS_QUERY,
      undefined,
    );
  });

  it("maps clarify/unsafe/unsupported envelopes unchanged", async () => {
    pipelineMocks.generateDemo.mockResolvedValueOnce({
      data: { outcome: "clarify", question: "Which cell topic?", source: "offline" },
    } satisfies GenerateDemoResult);
    const clarify = await (await post({ query: "Show me cells." })).json();
    expect(clarify.data.outcome).toBe("clarify");
    expect(clarify.data.question).toBe("Which cell topic?");
    expect(clarify.data.source).toBe("offline");

    pipelineMocks.generateDemo.mockResolvedValueOnce({
      data: { outcome: "unsafe", reason: "safe notice", source: "offline" },
    } satisfies GenerateDemoResult);
    const unsafe = await (await post({ query: "harmful" })).json();
    expect(unsafe.data.outcome).toBe("unsafe");
    expect(unsafe.data.reason).toBe("safe notice");
  });

  it("maps the failure envelope when the pipeline falls back (200)", async () => {
    pipelineMocks.generateDemo.mockResolvedValue({
      fallback: true,
      reason: "timeout",
    } satisfies GenerateDemoResult);

    const response = await post({ query: ORBITS_QUERY });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      fallback: true,
      reason: "timeout",
    });
  });

  it("rejects malformed JSON with 400 invalid_input (no pipeline call)", async () => {
    const response = await post("{not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
    expect(pipelineMocks.generateDemo).not.toHaveBeenCalled();
  });

  it("rejects unknown top-level keys with 400 invalid_input", async () => {
    const response = await post({ query: ORBITS_QUERY, extra: 1 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
  });

  it("rejects unknown preference keys with 400 invalid_input", async () => {
    const response = await post({
      query: ORBITS_QUERY,
      preferences: { ...createDefaultPreferences(), bogus: true },
    });
    expect(response.status).toBe(400);
  });

  it("rejects an empty query with 400 invalid_input", async () => {
    const response = await post({ query: "" });
    expect(response.status).toBe(400);
  });

  it("rejects a query over 500 chars with 400 invalid_input", async () => {
    const response = await post({ query: "x".repeat(501) });
    expect(response.status).toBe(400);
  });

  it("rejects a body over the 64 KB cap with 413 too_large", async () => {
    const response = await post({ query: "x".repeat(65 * 1024) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
    expect(pipelineMocks.generateDemo).not.toHaveBeenCalled();
  });

  it("rate-limits a single IP after 30 calls (429), other IPs unaffected", async () => {
    let last: Response | null = null;
    for (let index = 0; index < 31; index += 1) {
      last = await post({ query: ORBITS_QUERY }, "203.0.113.200");
    }
    expect(last?.status).toBe(429);
    expect(await last!.json()).toEqual({ error: "rate_limited" });

    const other = await post({ query: ORBITS_QUERY }, "203.0.113.201");
    expect(other.status).toBe(200);
  });
});

describe("GET /api/demonstrations/health", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    pipelineMocks.generationCircuitState.mockReturnValue({
      state: "closed",
      failures: 0,
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("reports offline when no API key is configured and never calls the network", async () => {
    const response = await healthGET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: false,
      provider: "offline",
      circuit: { state: "closed", failures: 0 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports ok when the provider responds", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await healthGET();
    expect(await response.json()).toEqual({
      ok: true,
      provider: "ok",
      circuit: { state: "closed", failures: 0 },
    });
  });

  it("reports unavailable on HTTP 503", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));

    const response = await healthGET();
    expect(await response.json()).toEqual({
      ok: false,
      provider: "unavailable",
      circuit: { state: "closed", failures: 0 },
    });
  });

  it("reports unavailable on HTTP 429", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));

    const response = await healthGET();
    expect((await response.json()).provider).toBe("unavailable");
  });

  it("reports unavailable on a network error", async () => {
    process.env.LLM_API_KEY = "test-key";
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    const response = await healthGET();
    expect((await response.json()).provider).toBe("unavailable");
  });

  it("never includes the API key in the response body", async () => {
    process.env.LLM_API_KEY = "super-secret-key-value";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const response = await healthGET();
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("super-secret-key-value");
  });
});
