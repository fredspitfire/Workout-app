/**
 * Core engine types. The deterministic engine owns every weight/rep/progression
 * number; the AI never touches these. Built from training principles, NOT fitted
 * to historical data (history is only a test bed + start-weight/increment source).
 */

export type Goal = "strength" | "hypertrophy" | "general" | "hockey";

/** The four mesocycle phases. Deload is the final phase of every block. */
export type Phase = "onramp" | "accumulation" | "intensification" | "deload";

/**
 * The user always pushes to the TOP of the range and STOPS there (never past).
 * So the engine's only performance signal is: did you reach `max`, and did reps
 * hold across sets?
 */
export interface RepRange {
  min: number;
  max: number;
}

export interface WorkingSet {
  weight: number;
  reps: number;
}

/** What the engine tells you to do for one exercise in one session. */
export interface Prescription {
  weight: number;
  reps: RepRange;
  sets: number;
  phase: Phase;
}

/** Per-exercise tuning. `increment` is the smallest sensible jump for the implement. */
export interface ExerciseParams {
  increment: number; // lbs; e.g. barbell 5, dumbbell pair 5
  stallLimit: number; // consecutive stalls before the engine regresses the weight
}

/** Outcome of evaluating a set of working sets against the target range. */
export type Verdict = "progress" | "hold" | "stall";

/** Carried between sessions so the engine remembers stalls. */
export interface ProgressState {
  weight: number;
  consecutiveStalls: number;
}
