import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals are disabled, so RTL's auto-cleanup never registers itself.
afterEach(() => {
  cleanup();
});
