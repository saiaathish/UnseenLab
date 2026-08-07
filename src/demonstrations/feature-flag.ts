/**
 * Feature flag for the Ask-to-Demonstration experience.
 *
 * NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED
 *   - "0" (default) → the existing UnseenLab product works exactly as before.
 *   - "1" → the generative demonstration engine becomes available.
 *
 * Rollback is a one-line change: set the flag back to "0". No code rollback
 * is ever required. The Nuclear Chain Reaction lab is reachable in both
 * states and must never depend on this flag.
 */

const ENV_KEY = "NEXT_PUBLIC_GENERATIVE_DEMOS_ENABLED";

/** True when the generative demo experience is enabled (flag === "1"). */
export const GENERATIVE_DEMOS_ENABLED: boolean =
  (process.env[ENV_KEY] ?? "0") === "1";

/** Client-safe mirror used by React components (server env is inlined at build). */
export const isGenerativeDemosEnabled = (): boolean => GENERATIVE_DEMOS_ENABLED;
