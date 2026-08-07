import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals are disabled, so RTL's auto-cleanup never registers itself.
afterEach(() => {
  cleanup();
});

/**
 * Storage interop shim (jsdom 30 + vitest 4).
 *
 * jsdom 30.0.1 does not expose `localStorage`/`sessionStorage` on the window
 * created by vitest's jsdom environment, so any test that touches device
 * persistence (`localStorage.clear()` etc.) fails with "undefined (reading
 * 'clear')". Raw `new JSDOM(url)` does expose them, so this is an environment
 * wiring gap, not a missing browser API. We attach a per-test in-memory
 * Storage implementation only when the window lacks one, and reset it on
 * every `afterEach` so tests never observe each other's storage.
 */
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

function attachStorageIfMissing(scope: Window & typeof globalThis) {
  if (typeof scope.localStorage === "undefined") {
    Object.defineProperty(scope, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  }
  if (typeof scope.sessionStorage === "undefined") {
    Object.defineProperty(scope, "sessionStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  }
}

if (typeof window !== "undefined") {
  attachStorageIfMissing(window);
  // jsdom environment keeps globals in sync with the window.
  if (typeof globalThis.localStorage === "undefined") {
    attachStorageIfMissing(globalThis as Window & typeof globalThis);
  }
}

afterEach(() => {
  // Fresh storage per test, mirroring a clean browser profile.
  if (typeof window !== "undefined") {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  }
});
