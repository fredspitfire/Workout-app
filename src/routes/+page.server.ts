import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, gte } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generatePlan, advanceWeek } from '$lib/server/plan/generatePlan';
import { applyTweak } from '$lib/server/plan/applyTweak';
import type { PageServerLoad, Actions } from './$types';

const isoDate = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const load: PageServerLoad = async () => {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) throw redirect(303, '/setup');

	const today = isoDate(new Date());
	const games = await db
		.select()
		.from(schema.datedEvents)
		.where(gte(schema.datedEvents.date, today))
		.orderBy(asc(schema.datedEvents.date));

	const [block] = await db.select().from(schema.blocks).where(eq(schema.blocks.status, 'active'));

	// Populate below when a block exists. Single return shape (not a union of
	// two shapes) — a union trips up the template's `data.block` narrowing → `never`.
	let week: { id: number; date: string; phase: string; status: string }[] = [];
	let session: typeof schema.plannedSessions.$inferSelect | null = null;
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

	if (block) {
		week = await db
			.select({
				id: schema.plannedSessions.id,
				date: schema.plannedSessions.date,
				phase: schema.plannedSessions.phase,
				status: schema.plannedSessions.status
			})
			.from(schema.plannedSessions)
			.where(eq(schema.plannedSessions.blockId, block.id))
			.orderBy(asc(schema.plannedSessions.date));

		const [s] = await db
			.select()
			.from(schema.plannedSessions)
			.where(and(eq(schema.plannedSessions.blockId, block.id), eq(schema.plannedSessions.date, today)));
		session = s ?? null;

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
	}

	return { profile, block: block ?? null, session, exercises, week, today, games };
};

export const actions: Actions = {
	generate: async () => {
		try {
			await generatePlan(db);
		} catch (e) {
			console.error('[action generate]', e);
			return fail(500, { error: 'Couldn’t generate your plan. Please try again.' });
		}
		throw redirect(303, '/');
	},
	tweak: async ({ request }) => {
		const text = String((await request.formData()).get('tweak') ?? '').trim();
		if (!text) return fail(400, { tweak: { ok: false, summary: 'Type a request first.', changed: 0 } });
		try {
			const result = await applyTweak(db, text);
			return { tweak: result };
		} catch (e) {
			console.error('[action tweak]', e);
			return fail(500, { tweak: { ok: false, summary: 'Couldn’t apply that — please try again.', changed: 0 } });
		}
	},
	advance: async () => {
		try {
			await advanceWeek(db);
		} catch (e) {
			console.error('[action advance]', e);
			return fail(500, { error: 'Couldn’t advance the week. Please try again.' });
		}
		throw redirect(303, '/');
	},
	addGame: async ({ request }) => {
		const f = await request.formData();
		const date = String(f.get('date') ?? '').trim();
		const label = String(f.get('label') ?? 'Game').trim() || 'Game';
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { gameError: 'Pick a date.' });
		try {
			await db.insert(schema.datedEvents).values({ label, date, type: 'game' });
			await generatePlan(db); // re-plan so this week accounts for the game
		} catch (e) {
			console.error('[action addGame]', e);
			return fail(500, { gameError: 'Couldn’t add that game. Please try again.' });
		}
		throw redirect(303, '/');
	},
	removeGame: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		try {
			if (id) await db.delete(schema.datedEvents).where(eq(schema.datedEvents.id, id));
			await generatePlan(db);
		} catch (e) {
			console.error('[action removeGame]', e);
			return fail(500, { gameError: 'Couldn’t remove that game. Please try again.' });
		}
		throw redirect(303, '/');
	}
};
