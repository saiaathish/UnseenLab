import { describe, expect, it } from "vitest";
import { isSafeRedirectPath } from "@/lib/auth/redirect-safety";

describe("isSafeRedirectPath", () => {
  it("accepts plain same-origin paths", () => {
    expect(isSafeRedirectPath("/dashboard")).toBe(true);
    expect(isSafeRedirectPath("/lab/nuclear-chain-reaction")).toBe(true);
    expect(isSafeRedirectPath("/")).toBe(true);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(isSafeRedirectPath("https://evil.example")).toBe(false);
    expect(isSafeRedirectPath("http://evil.example/x")).toBe(false);
    expect(isSafeRedirectPath("//evil.example")).toBe(false);
    expect(isSafeRedirectPath("//evil.example/path")).toBe(false);
  });

  it("rejects backslash-prefixed URLs", () => {
    expect(isSafeRedirectPath("/\\evil.example")).toBe(false);
    expect(isSafeRedirectPath("/\\/evil.example")).toBe(false);
  });

  it("rejects javascript: and other schemes", () => {
    expect(isSafeRedirectPath("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectPath("data:text/html,<script>")).toBe(false);
    expect(isSafeRedirectPath("mailto:x@y.z")).toBe(false);
  });

  it("rejects null and empty", () => {
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath("")).toBe(false);
  });

  // Red-team findings: control characters are stripped by the WHATWG URL
  // parser before authority detection, so "/\t/evil.com" resolves off-site.
  it.each([
    "/\t/evil.example", // %09
    "/\n/evil.example", // %0a
    "/\r/evil.example", // %0d
    "/\t\t//evil.example",
    "/\r\n/evil.example",
    "/\v/evil.example",
    "/\f//evil.example",
  ])("rejects control-character injection %j", (candidate) => {
    expect(isSafeRedirectPath(candidate)).toBe(false);
  });

  it("rejects encoded separators once decoded", () => {
    // In the real flow the callback's searchParams decodes before the check,
    // so the decoded control characters are what the function sees.
    expect(isSafeRedirectPath(decodeURIComponent("/%09/evil.example"))).toBe(false);
    expect(isSafeRedirectPath(decodeURIComponent("/%0a/evil.example"))).toBe(false);
  });

  it("accepts literal encoded separators (they resolve same-origin)", () => {
    // A raw "%09" in a path is just characters — same-origin, safe.
    expect(isSafeRedirectPath("/%09/evil.example")).toBe(true);
  });

  it("still accepts encoded plain paths", () => {
    expect(isSafeRedirectPath("/lab/nuclear-chain-reaction?topic=a%20b")).toBe(true);
  });
});
