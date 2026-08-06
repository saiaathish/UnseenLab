import { describe, expect, it } from "vitest";

import { restoredPredictionIndex } from "@/components/demonstrations/demonstration-page";
import type { TrialRecord } from "@/demonstrations/state/demo-store";

/**
 * Regression: a saved session must return with its recorded prediction
 * re-applied on reload (audit P2 — prediction radio/gate state was lost on
 * bare reload while the trial log kept the evidence). The gate state and
 * the evidence must agree: the LAST prediction-carrying trial wins.
 */
const trial = (predictionIndex: number | null): TrialRecord => ({
  trial: 1,
  predictionIndex,
  parameters: {},
  readouts: [],
  controls: { playing: true, speed: 1 },
  adaptations: [],
  recordedAt: "2026-08-06T00:00:00.000Z",
});

describe("restoredPredictionIndex (demonstration-page)", () => {
  it("returns null for an empty trial log (fresh session keeps the prediction-first gate)", () => {
    expect(restoredPredictionIndex([])).toBeNull();
  });

  it("returns null when no trial ever carried a prediction (observation-only session)", () => {
    expect(restoredPredictionIndex([trial(null), trial(null)])).toBeNull();
  });

  it("re-applies the prediction index from a single prediction trial", () => {
    expect(restoredPredictionIndex([trial(2)])).toBe(2);
  });

  it("re-applies the LAST prediction-carrying trial (later observation entries are skipped)", () => {
    const log = [trial(0), trial(3), trial(null), trial(1)];
    expect(restoredPredictionIndex(log)).toBe(1);
  });

  it("skips observation-only entries that follow the prediction", () => {
    const log = [trial(2), trial(null), trial(null)];
    expect(restoredPredictionIndex(log)).toBe(2);
  });
});
