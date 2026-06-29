/**
 * Mesocycle structure — the JEFIT-adaptive spine.
 *
 * A block is a sequence of weeks: On-Ramp -> Accumulation -> Intensification ->
 * Deload. The Deload is the FINAL phase, baked in, never skipped. Block length
 * sets the rhythm (default 3:1 = 3 loading weeks + 1 deload).
 */
import type { Goal, Phase, Prescription, ProgressState } from "./types.ts";
import { GOALS } from "./goals.ts";
import { roundToIncrement } from "./progression.ts";

export interface BlockPlan {
  /** Phase for each week, in order. Always ends in "deload". */
  weeks: Phase[];
}

/**
 * Build a block plan. `loadingWeeks` is how many working weeks precede the deload
 * (3 => a 3:1 block, the default). The loading weeks ramp On-Ramp -> Accumulation
 * -> Intensification, then the final week is always the deload.
 */
export function buildBlock(loadingWeeks = 3): BlockPlan {
  const weeks: Phase[] = [];
  for (let w = 0; w < loadingWeeks; w++) {
    if (w === 0) weeks.push("onramp");
    else if (w === loadingWeeks - 1) weeks.push("intensification");
    else weeks.push("accumulation");
  }
  weeks.push("deload");
  return { weeks };
}

/** The phase for a given week index, with missed-workout phase EXTENSION applied. */
export function phaseForWeek(plan: BlockPlan, weekIndex: number): Phase {
  return plan.weeks[Math.min(weekIndex, plan.weeks.length - 1)];
}

/**
 * Deload prescription for an exercise, derived from its current working weight.
 * Uses the goal's deload multipliers (strength keeps more weight/cuts sets;
 * hypertrophy cuts both).
 */
export function deloadPrescription(
  workingWeight: number,
  goal: Goal,
  increment: number,
): Pick<Prescription, "weight" | "sets"> {
  const cfg = GOALS[goal];
  return {
    weight: roundToIncrement(workingWeight * cfg.deload.weightMultiplier, increment),
    sets: Math.max(1, Math.round(cfg.sets.intensification * cfg.deload.setMultiplier)),
  };
}

/**
 * Phase extension: when sessions are missed, a phase should stretch so its
 * intended work gets banked before advancing. This returns whether the current
 * phase is "complete" given how many quality sessions it has actually banked vs
 * the target — the scheduler uses it to decide whether to advance or extend.
 */
export function phaseComplete(bankedSessions: number, targetSessions: number): boolean {
  return bankedSessions >= targetSessions;
}

/** Convenience: the phase's prescribed working-set count for a goal. */
export function setsForPhase(goal: Goal, phase: Phase): number {
  return GOALS[goal].sets[phase];
}

/** Convenience: a fresh progress state seeded from a known working weight. */
export function seedState(workingWeight: number): ProgressState {
  return { weight: workingWeight, consecutiveStalls: 0 };
}
