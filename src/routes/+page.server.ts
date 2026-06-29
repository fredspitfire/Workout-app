import { redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generatePlan } from '$lib/server/plan/generatePlan';
import type { PageServerLoad, Actions } from './$types';

const isoDate = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const load: PageServerLoad = async () => {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) throw redirect(303, '/setup');

	const [block] = await db.select().from(schema.blocks).where(eq(schema.blocks.status, 'active'));
	if (!block) return { profile, block: null, session: null, exercises: [], week: [] };

	const today = isoDate(new Date());

	const week = await db
		.select({ id: schema.plannedSessions.id, date: schema.plannedSessions.date, phase: schema.plannedSessions.phase })
		.from(schema.plannedSessions)
		.where(eq(schema.plannedSessions.blockId, block.id))
		.orderBy(asc(schema.plannedSessions.date));

	const [session] = await db
		.select()
		.from(schema.plannedSessions)
		.where(and(eq(schema.plannedSessions.blockId, block.id), eq(schema.plannedSessions.date, today)));

	let exercises: Array<{
		id: number;
		name: string;
		type: 'ramp' | 'straight';
		topWeight: number;
		repMin: number;
		repMax: number;
		sets: number;
		perSetIncrement: number | null;
		increment: number;
	}> = [];

	if (session) {
		exercises = await db
			.select({
				id: schema.plannedExercises.id,
				name: schema.exercises.name,
				type: schema.plannedExercises.prescriptionType,
				topWeight: schema.plannedExercises.topWeight,
				repMin: schema.plannedExercises.repMin,
				repMax: schema.plannedExercises.repMax,
				sets: schema.plannedExercises.sets,
				perSetIncrement: schema.plannedExercises.perSetIncrement,
				increment: schema.exercises.defaultIncrement
			})
			.from(schema.plannedExercises)
			.innerJoin(schema.exercises, eq(schema.exercises.id, schema.plannedExercises.exerciseId))
			.where(eq(schema.plannedExercises.sessionId, session.id))
			.orderBy(asc(schema.plannedExercises.orderIndex));
	}

	return { profile, block, session: session ?? null, exercises, week, today };
};

export const actions: Actions = {
	generate: async () => {
		await generatePlan(db);
		throw redirect(303, '/');
	}
};
