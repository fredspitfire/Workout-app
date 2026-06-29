/**
 * Spike 0a (step 3): validate the ramp-to-top-set model.
 *  A — intra-session ramp: climb while hitting target, hold on a miss.
 *  B — week-over-week: top climbs, reps drop by phase, deload fires.
 *  C — REAL adaptive data: feed the user's June squat sessions and check the
 *      engine's predicted next-week top matches what JEFIT actually prescribed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseJefitExport, extractExerciseEntries, type LoggedSet } from "../src/lib/import/jefitCsv.ts";
import {
  GOALS,
  buildBlock,
  phaseForWeek,
  generateRamp,
  nextRampWeight,
  topAchieved,
  nextTop,
  type WorkingSet,
} from "../src/lib/engine/index.ts";

// A — intra-session ramp -----------------------------------------------------
function partA() {
  console.log(`\n=== A: intra-session ramp (target 6 reps, top 155) ===`);
  const plan = generateRamp(155, 6, 5, 10, 5); // ramp 5 sets, +10/set
  console.log(`planned ramp: ${plan.sets.map((s) => `${s.weight}x${s.repTarget}`).join(" · ")}`);

  // Simulated lifter: hits 6 until 145, then only 5 at 155 (misses target).
  const done: WorkingSet[] = [];
  let weight: number | null = plan.sets[0].weight;
  while (weight !== null) {
    const reps = weight >= 155 ? 5 : 6; // misses the target at the top
    done.push({ weight, reps });
    weight = nextRampWeight(plan, done);
  }
  console.log(`actually did: ${done.map((s) => `${s.weight}x${s.reps}`).join(" · ")}`);
  console.log(`top achieved at target: ${topAchieved(done, 6)} (held instead of forcing 155)`);
}

// B — week over week ---------------------------------------------------------
function partB() {
  console.log(`\n=== B: week-over-week, goal=strength, 3:1 block ===`);
  const goal = "strength" as const;
  const block = buildBlock(3);
  let top = 145;
  let misses = 0;
  for (let i = 0; i < block.weeks.length; i++) {
    const phase = phaseForWeek(block, i);
    const range = GOALS[goal].repRange[phase];
    const repTarget = range.max; // push to the top of the phase's range
    if (phase === "deload") {
      console.log(`wk${i + 1} ${phase.padEnd(15)} top ${Math.round(top * 0.75)} (deload, lighter, fewer sets)`);
      continue;
    }
    // Assume the lifter hits the planned top this week.
    const res = nextTop(top, top, 5, misses, 2);
    console.log(`wk${i + 1} ${phase.padEnd(15)} top ${top} x${repTarget}  -> ${res.verdict} -> next top ${res.top}`);
    top = res.top;
    misses = res.consecutiveMisses;
  }
}

// C — real adaptive squat data ----------------------------------------------
function modalReps(sets: LoggedSet[]): number {
  const c = new Map<number, number>();
  for (const s of sets) c.set(s.reps, (c.get(s.reps) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function partC() {
  const dir = join(process.cwd(), "Jefit Data");
  const file = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".csv"))!;
  const exp = parseJefitExport(readFileSync(join(dir, file), "utf8"));
  const squat = extractExerciseEntries(exp)
    .filter((e) => e.name === "Barbell Squat" && e.date >= "2026-06-01")
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log(`\n=== C: engine vs REAL JEFIT-adaptive squat (June 2026) ===`);
  console.log(`${"date".padEnd(12)} ${"ramp".padEnd(34)} ${"tgt".padStart(3)} ${"top".padStart(4)} ${"engine next".padStart(11)} ${"JEFIT next".padStart(10)}`);
  for (let i = 0; i < squat.length; i++) {
    const e = squat[i];
    const tgt = modalReps(e.sets);
    const top = topAchieved(e.sets as WorkingSet[], tgt);
    const res = nextTop(top, top, 5, 0, 2);
    const jefitNext = i + 1 < squat.length ? topAchieved(squat[i + 1].sets as WorkingSet[], modalReps(squat[i + 1].sets)) : 0;
    const ramp = e.sets.map((s) => `${s.weight}x${s.reps}`).join(",");
    console.log(`${e.date.padEnd(12)} ${ramp.padEnd(34)} ${String(tgt).padStart(3)} ${String(top).padStart(4)} ${String(res.top).padStart(11)} ${String(jefitNext || "-").padStart(10)}`);
  }
  console.log();
}

partA();
partB();
partC();
