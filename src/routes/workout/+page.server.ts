import { redirect, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { advanceWeek } from '$lib/server/plan/generatePlan';
import { topAchieved, type WorkingSet } from '$lib/engine';
import type { PageServerLoad, Actions } from './$types';

const isoDate = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const load: PageServerLoad = async ({ url }) => {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) throw redirect(303, '/setup');

	const [block] = await db.select().from(schema.blocks).where(eq(schema.blocks.status, 'active'));
	if (!block) throw redirect(303, '/');

	// Default to today's session; ?session=<id> opens a specific one (start early).
	const sessionId = url.searchParams.get('session');
	const today = isoDate(new Date());
	const [session] = sessionId
		? await db
				.select()
				.from(schema.plannedSessions)
				.where(and(eq(schema.plannedSessions.blockId, block.id), eq(schema.plannedSessions.id, Number(sessionId))))
		: await db
				.select()
				.from(schema.plannedSessions)
				.where(and(eq(schema.plannedSessions.blockId, block.id), eq(schema.plannedSessions.date, today)));
	if (!session) throw redirect(303, '/'); // nothing to log

	const exercises = await db
		.select({
			exerciseId: schema.plannedExercises.exerciseId,
			name: schema.exercises.name,
			type: schema.plannedExercises.prescriptionType,
			topWeight: schema.plannedExercises.topWeight,
			repMin: schema.plannedExercises.repMin,
			repMax: schema.plannedExercises.repMax,
			sets: schema.plannedExercises.sets,
			perSetIncrement: schema.plannedExercises.perSetIncrement,
			restSeconds: schema.plannedExercises.restSeconds,
			increment: schema.exercises.defaultIncrement
		})
		.from(schema.plannedExercises)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.plannedExercises.exerciseId))
		.where(eq(schema.plannedExercises.sessionId, session.id))
		.orderBy(asc(schema.plannedExercises.orderIndex));

	// Recent history per exercise (last 3 sessions of that lift, app + imported).
	const history: Record<number, { date: string; sets: { weight: number; reps: number }[] }[]> = {};
	for (const ex of exercises) {
		const rows = await db
			.select({ date: schema.loggedSets.date, weight: schema.loggedSets.weight, reps: schema.loggedSets.reps })
			.from(schema.loggedSets)
			.where(eq(schema.loggedSets.exerciseId, ex.exerciseId))
			.orderBy(desc(schema.loggedSets.date), asc(schema.loggedSets.setIndex))
			.limit(50);
		const byDate = new Map<string, { weight: number; reps: number }[]>();
		for (const r of rows) {
			if (!byDate.has(r.date)) byDate.set(r.date, []);
			byDate.get(r.date)!.push({ weight: r.weight, reps: r.reps });
		}
		history[ex.exerciseId] = [...byDate.entries()].slice(0, 3).map(([date, sets]) => ({ date, sets }));
	}

	return { profile, block, session, exercises, history };
};

interface FinishPayload {
	sessionId: number;
	date: string;
	exercises: Array<{ exerciseId: number; repTarget: number; sets: Array<{ weight: number; reps: number }> }>;
}

export const actions: Actions = {
	finish: async ({ request }) => {
		const form = await request.formData();
		let payload: FinishPayload;
		try {
			payload = JSON.parse(String(form.get('payload') ?? ''));
		} catch {
			return fail(400, { error: 'bad payload' });
		}

		// 1. Persist the essential result atomically: every logged set + the session
		//    marked done. In one transaction so a mid-write failure can't leave the
		//    session "done" with no sets, or half-inserted sets that a retry doubles.
		const rows = payload.exercises.flatMap((ex) =>
			ex.sets.map((s, i) => ({
				sessionId: payload.sessionId,
				exerciseId: ex.exerciseId,
				date: payload.date,
				setIndex: i,
				weight: s.weight,
				reps: s.reps,
				source: 'app' as const
			}))
		);
		try {
			await db.transaction(async (tx) => {
				if (rows.length > 0) await tx.insert(schema.loggedSets).values(rows);
				await tx
					.update(schema.plannedSessions)
					.set({ status: 'completed' })
					.where(eq(schema.plannedSessions.id, payload.sessionId));
			});
		} catch (e) {
			console.error('[workout finish] failed to persist session', payload.sessionId, e);
			return fail(500, { error: 'Couldn’t save your workout. Please try again.' });
		}

		// 2. Derived follow-ups (below) are best-effort: the workout is already saved,
		//    so a failure here must NOT 500 the user or tempt a re-submit. Log and move
		//    on — these self-heal on the next finish / plan generation.
		try {
			// If that was the last session of the week, advance the block (progress the
			// weights; the engine extends the phase instead if sessions were missed).
			const [sess] = await db
				.select({ blockId: schema.plannedSessions.blockId })
				.from(schema.plannedSessions)
				.where(eq(schema.plannedSessions.id, payload.sessionId));
			if (sess) {
				const remaining = await db
					.select({ id: schema.plannedSessions.id })
					.from(schema.plannedSessions)
					.where(and(eq(schema.plannedSessions.blockId, sess.blockId), ne(schema.plannedSessions.status, 'completed')));
				if (remaining.length === 0) await advanceWeek(db);
			}

			// Update each exercise's stored working max. Only ever RAISE it — an
			// intentionally-light On-Ramp session must not drag your true max down.
			for (const ex of payload.exercises) {
				const achieved = topAchieved(ex.sets as WorkingSet[], ex.repTarget);
				if (achieved <= 0) continue;
				const [existing] = await db
					.select()
					.from(schema.exerciseState)
					.where(eq(schema.exerciseState.exerciseId, ex.exerciseId));
				if (!existing) {
					await db
						.insert(schema.exerciseState)
						.values({ exerciseId: ex.exerciseId, currentTop: achieved, lastRepTarget: ex.repTarget });
				} else if (achieved > existing.currentTop) {
					await db
						.update(schema.exerciseState)
						.set({ currentTop: achieved, lastRepTarget: ex.repTarget, updatedAt: Date.now() })
						.where(eq(schema.exerciseState.id, existing.id));
				}
			}
		} catch (e) {
			console.error('[workout finish] post-save follow-up failed (workout was saved)', e);
		}

		throw redirect(303, '/');
	}
};
