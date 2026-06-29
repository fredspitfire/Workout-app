/**
 * Seed the reference data: full-setup equipment + a starter exercise library.
 * Idempotent — only inserts when a table is empty. Run with `npm run db:seed`.
 * Uses its own libsql client (this runs outside SvelteKit, so no $env here).
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' }), {
	schema
});

const EQUIPMENT: (typeof schema.equipment.$inferInsert)[] = [
	{ name: 'Barbell', type: 'barbell', smallestIncrement: 5 },
	{ name: 'Dumbbells', type: 'dumbbell', smallestIncrement: 5 },
	{ name: 'Cable Machine', type: 'cable', smallestIncrement: 10 },
	{ name: 'Machines', type: 'machine', smallestIncrement: 10 },
	{ name: 'Bodyweight', type: 'bodyweight', smallestIncrement: 0 }
];

type Ex = typeof schema.exercises.$inferInsert;
const EXERCISES: Ex[] = [
	// Compounds (ramp to a top set)
	{ name: 'Barbell Squat', primaryMuscle: 'legs', equipmentType: 'barbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'squat' },
	{ name: 'Barbell Bench Press', primaryMuscle: 'chest', equipmentType: 'barbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'horiz_press' },
	{ name: 'Barbell Incline Bench Press', primaryMuscle: 'chest', equipmentType: 'barbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'incline_press' },
	{ name: 'Barbell Deadlift', primaryMuscle: 'back', equipmentType: 'barbell', isCompound: true, defaultIncrement: 10, substitutionGroup: 'hinge' },
	{ name: 'Barbell Bent Over Row', primaryMuscle: 'back', equipmentType: 'barbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'horiz_pull' },
	{ name: 'Barbell Shoulder Press', primaryMuscle: 'shoulders', equipmentType: 'barbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'vert_press' },
	{ name: 'Barbell Romanian Deadlift', primaryMuscle: 'hamstrings', equipmentType: 'barbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'hinge' },
	{ name: 'Pull Ups', primaryMuscle: 'back', equipmentType: 'bodyweight', isCompound: true, defaultIncrement: 0, substitutionGroup: 'vert_pull' },
	{ name: 'Dumbbell Bench Press', primaryMuscle: 'chest', equipmentType: 'dumbbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'horiz_press' },
	{ name: 'Dumbbell Shoulder Press', primaryMuscle: 'shoulders', equipmentType: 'dumbbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'vert_press' },
	{ name: 'Goblet Squat', primaryMuscle: 'legs', equipmentType: 'dumbbell', isCompound: true, defaultIncrement: 5, substitutionGroup: 'squat' },
	{ name: 'Cable Lat Pulldown', primaryMuscle: 'back', equipmentType: 'cable', isCompound: true, defaultIncrement: 10, substitutionGroup: 'vert_pull' },
	{ name: 'Cable Seated Row', primaryMuscle: 'back', equipmentType: 'cable', isCompound: true, defaultIncrement: 10, substitutionGroup: 'horiz_pull' },
	{ name: 'Leg Press', primaryMuscle: 'legs', equipmentType: 'machine', isCompound: true, defaultIncrement: 10, substitutionGroup: 'squat' },
	// Accessories (straight sets)
	{ name: 'Dumbbell Romanian Deadlift', primaryMuscle: 'hamstrings', equipmentType: 'dumbbell', isCompound: false, defaultIncrement: 5, substitutionGroup: 'hinge_accessory' },
	{ name: 'Dumbbell Lateral Raise', primaryMuscle: 'shoulders', equipmentType: 'dumbbell', isCompound: false, defaultIncrement: 5, substitutionGroup: 'lateral_raise' },
	{ name: 'Barbell Curl', primaryMuscle: 'biceps', equipmentType: 'barbell', isCompound: false, defaultIncrement: 5, substitutionGroup: 'biceps_curl' },
	{ name: 'Dumbbell Hammer Curl', primaryMuscle: 'biceps', equipmentType: 'dumbbell', isCompound: false, defaultIncrement: 5, substitutionGroup: 'biceps_curl' },
	{ name: 'Cable Triceps Pushdown', primaryMuscle: 'triceps', equipmentType: 'cable', isCompound: false, defaultIncrement: 10, substitutionGroup: 'triceps_ext' },
	{ name: 'Barbell Lying Triceps Extension', primaryMuscle: 'triceps', equipmentType: 'barbell', isCompound: false, defaultIncrement: 5, substitutionGroup: 'triceps_ext' },
	{ name: 'Leg Extension', primaryMuscle: 'quads', equipmentType: 'machine', isCompound: false, defaultIncrement: 10, substitutionGroup: 'leg_ext' },
	{ name: 'Lying Leg Curl', primaryMuscle: 'hamstrings', equipmentType: 'machine', isCompound: false, defaultIncrement: 10, substitutionGroup: 'leg_curl' },
	{ name: 'Standing Calf Raise', primaryMuscle: 'calves', equipmentType: 'machine', isCompound: false, defaultIncrement: 10, substitutionGroup: 'calf' },
	{ name: 'Dumbbell Fly', primaryMuscle: 'chest', equipmentType: 'dumbbell', isCompound: false, defaultIncrement: 5, substitutionGroup: 'chest_fly' },
	{ name: 'Cable Face Pull', primaryMuscle: 'rear delts', equipmentType: 'cable', isCompound: false, defaultIncrement: 5, substitutionGroup: 'rear_delt' },
	{ name: 'Hanging Leg Raise', primaryMuscle: 'core', equipmentType: 'bodyweight', isCompound: false, defaultIncrement: 0, substitutionGroup: 'core' }
];

async function count(table: typeof schema.equipment | typeof schema.exercises): Promise<number> {
	const r = await db.select({ n: sql<number>`count(*)` }).from(table);
	return r[0]?.n ?? 0;
}

async function main() {
	if ((await count(schema.equipment)) === 0) {
		await db.insert(schema.equipment).values(EQUIPMENT);
		console.log(`Seeded ${EQUIPMENT.length} equipment items.`);
	} else {
		console.log('Equipment already present — skipped.');
	}

	if ((await count(schema.exercises)) === 0) {
		await db.insert(schema.exercises).values(EXERCISES);
		console.log(`Seeded ${EXERCISES.length} exercises.`);
	} else {
		console.log('Exercises already present — skipped.');
	}
}

main();
