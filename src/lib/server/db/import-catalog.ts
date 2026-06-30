/**
 * Import the public-domain free-exercise-db catalog (~870 exercises) into the
 * library so the engine/AI can pick from a full range, matched to equipment.
 * Complements the user's imported JEFIT lifts (which keep their history) — dupes
 * by name are skipped. Run with `npm run import:catalog`.
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.ts';

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' }), {
	schema
});

const URLS = [
	'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json',
	'https://raw.githubusercontent.com/yuhonas/free-exercise-db/master/dist/exercises.json'
];

// Map free-exercise-db equipment → our equipment types.
const EQUIP: Record<string, string> = {
	barbell: 'barbell',
	dumbbell: 'dumbbell',
	cable: 'cable',
	machine: 'machine',
	'body only': 'bodyweight',
	bands: 'band',
	kettlebells: 'dumbbell',
	'e-z curl bar': 'barbell',
	'medicine ball': 'other',
	'exercise ball': 'other',
	'foam roll': 'other',
	other: 'other'
};
const INC: Record<string, number> = {
	barbell: 5,
	dumbbell: 5,
	cable: 10,
	machine: 10,
	bodyweight: 0,
	band: 0,
	other: 5
};

const norm = (s: string) => s.trim().toLowerCase();

interface FreeExercise {
	name: string;
	equipment: string | null;
	primaryMuscles: string[];
	mechanic: string | null;
}

async function fetchData(): Promise<FreeExercise[]> {
	for (const u of URLS) {
		try {
			const r = await fetch(u);
			if (r.ok) return (await r.json()) as FreeExercise[];
		} catch {
			/* try next */
		}
	}
	throw new Error('Could not fetch free-exercise-db dataset');
}

const data = await fetchData();
const existing = await db.select({ name: schema.exercises.name }).from(schema.exercises);
const have = new Set(existing.map((e) => norm(e.name)));

const rows: (typeof schema.exercises.$inferInsert)[] = [];
for (const ex of data) {
	if (!ex.name) continue;
	const key = norm(ex.name);
	if (have.has(key)) continue;
	have.add(key);
	const equipmentType = EQUIP[ex.equipment ?? ''] ?? 'other';
	const muscle = ex.primaryMuscles?.[0] ?? 'unknown';
	rows.push({
		name: ex.name,
		primaryMuscle: muscle,
		equipmentType,
		isCompound: ex.mechanic === 'compound',
		defaultIncrement: INC[equipmentType] ?? 5,
		substitutionGroup: norm(muscle),
		source: 'catalog'
	});
}

for (let i = 0; i < rows.length; i += 100) await db.insert(schema.exercises).values(rows.slice(i, i + 100));
console.log(`Imported ${rows.length} catalog exercises (skipped ${data.length - rows.length} dupes/invalid).`);
