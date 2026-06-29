/**
 * Spike 0a (step 1): prove we can read the JEFIT export.
 * Prints a section summary, history range, top exercises, and the recent
 * timeline for one anchor lift. No engine yet — just "can we see the data."
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseJefitExport,
  extractExerciseEntries,
  type ExerciseEntry,
  type LoggedSet,
} from "../src/lib/import/jefitCsv.ts";

const DATA_DIR = join(process.cwd(), "Jefit Data");

function findCsv(): string {
  const file = readdirSync(DATA_DIR).find((f) => f.toLowerCase().endsWith(".csv"));
  if (!file) throw new Error(`No .csv found in ${DATA_DIR}`);
  return join(DATA_DIR, file);
}

/** Working sets = the sets at the heaviest weight that day (ignores warmups). */
function workingSets(sets: LoggedSet[]): LoggedSet[] {
  const max = Math.max(...sets.map((s) => s.weight));
  return sets.filter((s) => s.weight === max && s.weight > 0);
}

const ANCHOR = "Barbell Bench Press";

function main() {
  const path = findCsv();
  const text = readFileSync(path, "utf8");
  const exp = parseJefitExport(text);

  console.log(`\n=== JEFIT export: ${path.split(/[\\/]/).pop()} ===\n`);
  console.log("Sections found:");
  for (const [name, s] of exp) {
    console.log(`  ${name.padEnd(24)} ${s.rows.length} rows`);
  }

  const entries = extractExerciseEntries(exp);
  const dates = entries.map((e) => e.date).sort();
  console.log(`\nExercise-session entries: ${entries.length}`);
  console.log(`History range: ${dates[0]} -> ${dates[dates.length - 1]}`);

  // Top exercises by how many sessions they appear in.
  const freq = new Map<string, number>();
  for (const e of entries) freq.set(e.name, (freq.get(e.name) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`\nTop 15 exercises by session count:`);
  for (const [name, n] of top) console.log(`  ${String(n).padStart(4)}  ${name}`);

  // Recent timeline for the anchor lift.
  const anchor = entries
    .filter((e) => e.name === ANCHOR)
    .sort((a, b) => a.date.localeCompare(b.date));
  console.log(`\n=== ${ANCHOR}: last 25 sessions (working sets) ===`);
  console.log(`${"date".padEnd(12)} ${"work wt".padStart(8)}  working sets (all sets)`);
  for (const e of anchor.slice(-25)) {
    const w = workingSets(e.sets);
    const wWt = w.length ? w[0].weight : 0;
    const wReps = w.map((s) => s.reps).join("/");
    const allSets = e.sets.map((s) => `${s.weight}x${s.reps}`).join(",");
    console.log(`${e.date.padEnd(12)} ${String(wWt).padStart(8)}  ${wReps.padEnd(14)} [${allSets}]`);
  }
  console.log();
}

main();
