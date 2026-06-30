/**
 * Goal presets. Goal = parameters, one engine. Each goal sets the rep ranges per
 * phase, the working-set count per phase, and how a deload is executed.
 *
 * Deload numbers come from the research: strength → cut sets ~40-50%, keep weight
 * 70-80%; hypertrophy → cut both volume and intensity ~30-40%.
 */
import type { Goal, Phase, RepRange } from "./types.ts";

export interface GoalConfig {
  repRange: Record<Phase, RepRange>;
  sets: Record<Phase, number>;
  /** Applied to the working weight during the deload phase. */
  deload: { weightMultiplier: number; setMultiplier: number };
}

export const GOALS: Record<Goal, GoalConfig> = {
  strength: {
    repRange: {
      onramp: { min: 5, max: 8 },
      accumulation: { min: 4, max: 6 },
      intensification: { min: 2, max: 4 },
      deload: { min: 3, max: 5 },
    },
    sets: { onramp: 5, accumulation: 5, intensification: 4, deload: 3 },
    deload: { weightMultiplier: 0.75, setMultiplier: 0.5 },
  },
  hypertrophy: {
    repRange: {
      onramp: { min: 10, max: 15 },
      accumulation: { min: 8, max: 12 },
      intensification: { min: 6, max: 10 },
      deload: { min: 8, max: 12 },
    },
    sets: { onramp: 4, accumulation: 4, intensification: 4, deload: 3 },
    deload: { weightMultiplier: 0.65, setMultiplier: 0.6 },
  },
  general: {
    repRange: {
      onramp: { min: 8, max: 12 },
      accumulation: { min: 6, max: 10 },
      intensification: { min: 5, max: 8 },
      deload: { min: 8, max: 10 },
    },
    sets: { onramp: 4, accumulation: 4, intensification: 4, deload: 3 },
    deload: { weightMultiplier: 0.7, setMultiplier: 0.6 },
  },
  // Hockey-support: power/posterior emphasis, lower reps, ramp to a top set.
  // (In-season fatigue management lives in the scheduler, not here.)
  hockey: {
    repRange: {
      onramp: { min: 5, max: 8 },
      accumulation: { min: 4, max: 6 },
      intensification: { min: 3, max: 5 },
      deload: { min: 4, max: 6 },
    },
    sets: { onramp: 5, accumulation: 5, intensification: 4, deload: 3 },
    deload: { weightMultiplier: 0.7, setMultiplier: 0.5 },
  },
};
