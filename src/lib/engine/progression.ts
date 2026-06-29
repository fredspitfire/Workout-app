/**
 * The deterministic progression rules — the heart of the engine.
 *
 * Design rule that shapes everything: the user pushes to the TOP of the rep range
 * and STOPS (never exceeds it). So the only signal is "did you reach the top, and
 * did reps hold across sets?" There is no "blew past the target" case.
 */
import type {
  ExerciseParams,
  Prescription,
  ProgressState,
  RepRange,
  Verdict,
  WorkingSet,
} from "./types.ts";

/** Round a weight to the nearest achievable increment (never below one increment). */
export function roundToIncrement(weight: number, increment: number): number {
  return Math.max(increment, Math.round(weight / increment) * increment);
}

/**
 * Judge a completed set of working sets against the target range.
 * - progress: every working set reached the TOP of the range (room to grow).
 * - hold:     every set landed in range, but not all at the top (consolidate).
 * - stall:    at least one set fell below the bottom of the range.
 */
export function evaluate(sets: WorkingSet[], reps: RepRange): Verdict {
  if (sets.length === 0) return "hold";
  const repCounts = sets.map((s) => s.reps);
  if (repCounts.every((r) => r >= reps.max)) return "progress";
  if (repCounts.every((r) => r >= reps.min)) return "hold";
  return "stall";
}

/**
 * Decide next session's working weight from this session's result.
 * Returns the new carry-forward state (weight + stall counter).
 */
export function nextWeight(
  prev: ProgressState,
  result: WorkingSet[],
  reps: RepRange,
  params: ExerciseParams,
): ProgressState {
  const verdict = evaluate(result, reps);

  if (verdict === "progress") {
    return { weight: prev.weight + params.increment, consecutiveStalls: 0 };
  }
  if (verdict === "hold") {
    return { weight: prev.weight, consecutiveStalls: 0 };
  }
  // stall
  const stalls = prev.consecutiveStalls + 1;
  if (stalls >= params.stallLimit) {
    // Regress ~10%, rounded to a real increment, then reset the counter.
    const regressed = roundToIncrement(prev.weight * 0.9, params.increment);
    return { weight: Math.min(regressed, prev.weight - params.increment), consecutiveStalls: 0 };
  }
  return { weight: prev.weight, consecutiveStalls: stalls };
}

/**
 * Intra-session autoregulation: adjust the weight for the REMAINING sets based on
 * how the sets logged so far went. Because the user caps at the top, the only
 * move is to EASE DOWN when a set drops below the range. (Optional bump-up is gated
 * on an explicit "felt easy" effort tag, not inferred — added later.)
 *
 * Returns the weight to use for the next set, or null to leave it unchanged.
 */
export function intraSessionAdjust(
  prescribedWeight: number,
  setsSoFar: WorkingSet[],
  reps: RepRange,
  params: ExerciseParams,
): number | null {
  if (setsSoFar.length === 0) return null;
  const last = setsSoFar[setsSoFar.length - 1];
  if (last.reps < reps.min) {
    // Ease ~7%, at least one increment, never below one increment.
    const eased = roundToIncrement(prescribedWeight * 0.93, params.increment);
    const target = Math.min(eased, prescribedWeight - params.increment);
    return Math.max(params.increment, target);
  }
  return null;
}

/** Build the next prescription, combining the new weight with the phase's rep range/sets. */
export function buildPrescription(
  state: ProgressState,
  reps: RepRange,
  sets: number,
  phase: Prescription["phase"],
): Prescription {
  return { weight: state.weight, reps, sets, phase };
}
