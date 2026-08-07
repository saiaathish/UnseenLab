/**
 * Feature flag for the Ask-to-Demonstration experience.
 *
 * NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED
 *   - "1" (default) → the generative demonstration engine is available.
 *   - "0" → explicit rollback to the static fallback homepage.
 *
 * Production now defaults to the generative experience because it is the
 * primary shipped product. Rollback remains a one-line environment change:
 * set the flag to "0". The Nuclear Chain Reaction lab remains reachable in
 * either state and does not depend on this flag.
 */

const ENV_KEY = "NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED";

/** True unless the generative demo experience is explicitly disabled. */
export const GENERATIVE_DEMOS_ENABLED: boolean =
  (process.env[ENV_KEY] ?? "1") === "1";

/** Client-safe mirror used by React components (server env is inlined at build). */
export const isGenerativeDemosEnabled = (): boolean => GENERATIVE_DEMOS_ENABLED;
