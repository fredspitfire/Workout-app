/**
 * Spike 0a (step 2): engine sanity + preference-fit harness.
 *
 * Part A — Simulation: run the engine over 2 mesocycles for a made-up lifter to
 *   show progression, the cap-at-top signal, and the built-in deload week firing.
 * Part B — Real-data sanity: run the engine across the user's real bench history
 *   and confirm it produces SANE prescriptions (sensible jumps, no wild numbers).
 *   NOTE: history is MANUAL training, not the adaptive algorithm, so divergence
 *   from what was actually done is expected — this is a sanity check, not a match.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseJefitExport,
  extractExerciseEntries,
  type LoggedSet,
} from "../src/lib/import/jefitCsv.ts";
import {
  GOALS,
  buildBlock,
  phaseForWeek,
  deloadPrescription,
  seedState,
  evaluate,
  nextWeight,
  roundToIncrement,
  type ExerciseParams,
  type ProgressState,
  type WorkingSet,
} from "../src/lib/engine/index.ts";

// --------------------------------------------------------------------------
// Part A: simulation
// --------------------------------------------------------------------------
function simulate() {
  const goal = "strength" as const;
  const params: ExerciseParams = { increment: 5, stallLimit: 2 };
  const block = buildBlock(3); // 3:1
  const totalWeeks = block.weeks.length * 2; // two blocks

  // Made-up lifter: at `capacity` they can just hit the bottom of the range;
  // every `increment` below adds ~1 rep. Capacity creeps up 2 lb/week (adaptation).
  let capacity = 175;
  let state: ProgressState = seedState(150);

  console.log(`\n=== Part A: simulated lifter, goal=${goal}, 2x 3:1 blocks ===`);
  console.log(`${"wk".padEnd(3)}${"phase".padEnd(16)}${"presc".padStart(8)}  ${"reps".padEnd(6)}  result        verdict`);

  for (let i = 0; i < totalWeeks; i++) {
    const weekInBlock = i % block.weeks.length;
    const phase = phaseForWeek(block, weekInBlock);
    const range = GOALS[goal].repRange[phase];
    const sets = GOALS[goal].sets[phase];

    if (phase === "deload") {
      const d = deloadPrescription(state.weight, goal, params.increment);
      console.log(
        `${String(i + 1).padEnd(3)}${phase.padEnd(16)}${String(d.weight).padStart(8)}  ${`${range.min}-${range.max}`.padEnd(6)}  (deload, ${d.sets} sets)  —`,
      );
      capacity += 2;
      continue;
    }

    const presc = state.weight;
    // Simulate achieved reps per set from capacity.
    const achievable = Math.max(0, range.min + Math.floor((capacity - presc) / params.increment));
    const result: WorkingSet[] = Array.from({ length: sets }, () => ({
      weight: presc,
      reps: Math.min(range.max, achievable),
    }));
    const verdict = evaluate(result, range);
    console.log(
      `${String(i + 1).padEnd(3)}${phase.padEnd(16)}${String(presc).padStart(8)}  ${`${range.min}-${range.max}`.padEnd(6)}  ${result.map((s) => s.reps).join("/").padEnd(12)}  ${verdict}`,
    );

    state = nextWeight(state, result, range, params);
    capacity += 2;
  }
}

// --------------------------------------------------------------------------
// Part B: real-data sanity
// --------------------------------------------------------------------------
function workingSets(sets: LoggedSet[]): LoggedSet[] {
  const max = Math.max(...sets.map((s) => s.weight));
  return sets.filter((s) => s.weight === max && s.weight > 0);
}

function modalReps(sets: LoggedSet[]): number {
  const counts = new Map<number, number>();
  for (const s of sets) counts.set(s.reps, (counts.get(s.reps) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function realDataSanity() {
  const dir = join(process.cwd(), "Jefit Data");
  const file = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".csv"))!;
  const exp = parseJefitExport(readFileSync(join(dir, file), "utf8"));
  const entries = extractExerciseEntries(exp)
    .filter((e) => e.name === "Barbell Bench Press")
    .sort((a, b) => a.date.localeCompare(b.date));

  const params: ExerciseParams = { increment: 5, stallLimit: 2 };
  const recent = entries.slice(-16);

  console.log(`\n=== Part B: engine sanity on real bench history (manual data) ===`);
  console.log(`${"date".padEnd(12)}${"work wt".padStart(8)}  ${"reps".padEnd(10)}  ${"target".padEnd(7)}  ${"engine->next".padStart(12)}  ${"you did next".padStart(12)}`);

  for (let i = 0; i < recent.length - 1; i++) {
    const e = recent[i];
    const w = workingSets(e.sets);
    if (w.length === 0) continue;
    const top = modalReps(w);
    const range = { min: Math.max(1, top - 2), max: top };
    const state: ProgressState = seedState(w[0].weight);
    const result: WorkingSet[] = w.map((s) => ({ weight: s.weight, reps: s.reps }));
    const next = nextWeight(state, result, range, params);

    const nextActual = workingSets(recent[i + 1].sets);
    const youDid = nextActual.length ? nextActual[0].weight : 0;

    console.log(
      `${e.date.padEnd(12)}${String(w[0].weight).padStart(8)}  ${w.map((s) => s.reps).join("/").padEnd(10)}  ${`${range.min}-${range.max}`.padEnd(7)}  ${String(next.weight).padStart(12)}  ${String(youDid).padStart(12)}`,
    );
  }
  console.log(`\n(History is your MANUAL training; divergence is expected. This only checks the engine stays sane on real inputs.)\n`);
}

simulate();
realDataSanity();
