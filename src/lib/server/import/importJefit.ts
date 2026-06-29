/**
 * JEFIT import — one-time migration of the CSV export into the database.
 *
 * Reuses the validated parser (src/lib/import/jefitCsv.ts). Maps each JEFIT
 * exercise into our library (creating any we don't have), inserts every set as
 * logged history (source = 'jefit_import'), and seeds each exercise's current
 * working weight so the engine starts from reality, not a blank slate.
 *
 * Idempotent: clears prior import rows first, so re-running with a fresh export
 * just refreshes the history.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { parseJefitExport, extractExerciseEntries, type ExerciseEntry } from '../../import/jefitCsv.ts';

type DB = LibSQLDatabase<typeof schema>;

export interface ImportResult {
	entries: number;
	exercisesCreated: number;
	setsInserted: number;
	statesSeeded: number;
}

const norm = (s: string) => s.trim().toLowerCase();

async function insertChunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
	for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/** Latest working top per exercise: heaviest weight (reps > 0) on its most recent date. */
function seedStates(entries: ExerciseEntry[], idByName: Map<string, number>) {
	const latest = new Map<number, { date: string; top: number; repTarget: number }>();
	for (const e of entries) {
		const id = idByName.get(norm(e.name));
		if (!id) continue;
		const working = e.sets.filter((s) => s.weight > 0);
		if (working.length === 0) continue;
		const top = Math.max(...working.map((s) => s.weight));
		const repTarget = Math.max(...working.filter((s) => s.weight === top).map((s) => s.reps));
		const cur = latest.get(id);
		if (!cur || e.date > cur.date) latest.set(id, { date: e.date, top, repTarget });
	}
	return [...latest.entries()].map(([exerciseId, v]) => ({
		exerciseId,
		currentTop: v.top,
		lastRepTarget: v.repTarget,
		consecutiveMisses: 0
	}));
}

export async function importJefitCsv(db: DB, csvText: string): Promise<ImportResult> {
	const exp = parseJefitExport(csvText);
	const entries = extractExerciseEntries(exp);

	// 1. Clear any previous import so this is idempotent.
	await db.delete(schema.loggedSets).where(eq(schema.loggedSets.source, 'jefit_import'));
	await db.delete(schema.exerciseState);

	// 2. Map exercises by normalized name; create the ones we don't have yet.
	const existing = await db.select().from(schema.exercises);
	const idByName = new Map<string, number>();
	for (const e of existing) idByName.set(norm(e.name), e.id);

	const toCreate = new Map<string, { name: string; jefitId: string }>();
	for (const e of entries) {
		const key = norm(e.name);
		if (!idByName.has(key) && !toCreate.has(key)) {
			toCreate.set(key, { name: e.name, jefitId: e.exerciseId });
		}
	}
	let exercisesCreated = 0;
	if (toCreate.size > 0) {
		const rows = [...toCreate.values()].map((c) => ({
			name: c.name,
			primaryMuscle: 'unknown',
			equipmentType: 'unknown',
			isCompound: false,
			defaultIncrement: 5,
			source: 'jefit' as const,
			jefitId: c.jefitId
		}));
		await insertChunked(rows, 100, (b) => db.insert(schema.exercises).values(b));
		exercisesCreated = rows.length;
		// Re-read to pick up the new ids.
		const after = await db.select({ id: schema.exercises.id, name: schema.exercises.name }).from(schema.exercises);
		idByName.clear();
		for (const e of after) idByName.set(norm(e.name), e.id);
	}

	// 3. Insert every set as imported history.
	const setRows: (typeof schema.loggedSets.$inferInsert)[] = [];
	for (const e of entries) {
		const exId = idByName.get(norm(e.name));
		if (!exId) continue;
		e.sets.forEach((s, i) => {
			setRows.push({
				exerciseId: exId,
				date: e.date,
				setIndex: i,
				weight: s.weight,
				reps: s.reps,
				source: 'jefit_import',
				sessionId: null
			});
		});
	}
	await insertChunked(setRows, 100, (b) => db.insert(schema.loggedSets).values(b));

	// 4. Seed current working weights so the engine starts from reality.
	const states = seedStates(entries, idByName);
	if (states.length > 0) await insertChunked(states, 100, (b) => db.insert(schema.exerciseState).values(b));

	return { entries: entries.length, exercisesCreated, setsInserted: setRows.length, statesSeeded: states.length };
}
