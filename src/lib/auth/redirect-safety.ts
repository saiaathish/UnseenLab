/**
 * Rejects open-redirect targets. Only same-origin relative paths are allowed.
 * `//evil.com`, `/\evil.com`, control-character injection (`/%09/evil.com`,
 * `/%0a/evil.com`), `javascript:` and absolute URLs are rejected.
 *
 * A path is safe only when it starts with "/" and the WHATWG URL parser
 * resolves it to the same origin.
 */
export function isSafeRedirectPath(next: string | null): next is string {
  if (!next) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.startsWith("/\\")) return false;
  // Control characters (< 0x20) are stripped by URL parsing before authority
  // detection, so "/\t/evil.com" would parse as a cross-origin redirect.
  for (let i = 0; i < next.length; i += 1) {
    if (next.charCodeAt(i) < 0x20) return false;
  }
  if (typeof URL !== "undefined") {
    const resolved = new URL(next, "https://unseenlab.local");
    if (resolved.origin !== "https://unseenlab.local") return false;
  }
  return true;
}
