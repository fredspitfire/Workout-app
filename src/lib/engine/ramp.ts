/**
 * Ramp-to-top-set progression — the actual JEFIT-adaptive mechanic.
 *
 * Main lifts aren't a fixed weight you hit-or-miss. The engine prescribes an
 * ASCENDING ramp of sets toward a top set at the phase's rep target. Within the
 * session you climb each set as long as you hit the rep target; the moment you
 * miss it, you HOLD that weight (you've found today's working load). The heaviest
 * weight you hit at the target reps is the session's "top achieved", and that top
 * climbs week to week. Accessories use straight sets instead (see straightSets).
 */
import type { WorkingSet } from "./types.ts";
import { roundToIncrement } from "./progression.ts";

export interface RampSet {
  weight: number;
  repTarget: number;
}

export interface RampPlan {
  sets: RampSet[];
  topWeight: number;
  repTarget: number;
  increment: number;
}

/**
 * Build a ramp of `rampSets` ascending to `topWeight` at `repTarget`, stepping by
 * `perSetIncrement` between sets (rounded to the implement increment).
 */
export function generateRamp(
  topWeight: number,
  repTarget: number,
  rampSets: number,
  perSetIncrement: number,
  increment: number,
): RampPlan {
  const sets: RampSet[] = [];
  for (let i = 0; i < rampSets; i++) {
    const stepsBelow = rampSets - 1 - i;
    const weight = roundToIncrement(topWeight - stepsBelow * perSetIncrement, increment);
    sets.push({ weight: Math.min(weight, topWeight), repTarget });
  }
  return { sets, topWeight, repTarget, increment };
}

/**
 * Intra-session: given the sets logged so far, what weight should the NEXT set
 * be? Follow the planned ramp while the lifter hits the rep target; the moment a
 * set misses the target, hold that weight for the remaining sets (stop climbing).
 * Returns null when the ramp is complete.
 */
export function nextRampWeight(plan: RampPlan, done: WorkingSet[]): number | null {
  if (done.length >= plan.sets.length) return null;
  const last = done[done.length - 1];
  if (last && last.reps < plan.repTarget) {
    return last.weight; // missed the target -> hold, don't climb
  }
  return plan.sets[done.length].weight; // on track -> next planned ramp step
}

/** The heaviest weight the lifter actually hit at (or above) the rep target. */
export function topAchieved(done: WorkingSet[], repTarget: number): number {
  const good = done.filter((s) => s.reps >= repTarget).map((s) => s.weight);
  return good.length ? Math.max(...good) : 0;
}

export type RampVerdict = "advance" | "hold" | "regress";

/**
 * Week-over-week decision for the top set, given how this session's ramp went.
 * - advance: hit the planned top at target reps -> next week's top climbs.
 * - hold:    missed the planned top but still worked hard -> a "bridge", repeat.
 * - regress: missed badly / repeated misses -> back the top off.
 */
export function nextTop(
  plannedTop: number,
  achieved: number,
  increment: number,
  consecutiveMisses: number,
  stallLimit: number,
): { top: number; verdict: RampVerdict; consecutiveMisses: number } {
  if (achieved >= plannedTop) {
    return { top: plannedTop + increment, verdict: "advance", consecutiveMisses: 0 };
  }
  const misses = consecutiveMisses + 1;
  if (misses >= stallLimit) {
    const regressed = roundToIncrement(plannedTop * 0.9, increment);
    return { top: Math.min(regressed, plannedTop - increment), verdict: "regress", consecutiveMisses: 0 };
  }
  return { top: plannedTop, verdict: "hold", consecutiveMisses: misses };
}
