import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { Goal } from '$lib/engine';
import type { PageServerLoad, Actions } from './$types';

// Canonical equipment types the user can own (bodyweight is always available).
const EQUIPMENT_TYPES: { type: string; name: string; inc: number }[] = [
	{ type: 'barbell', name: 'Barbell', inc: 5 },
	{ type: 'dumbbell', name: 'Dumbbells', inc: 5 },
	{ type: 'machine', name: 'Machines', inc: 10 },
	{ type: 'cable', name: 'Cable Machine', inc: 10 },
	{ type: 'band', name: 'Bands', inc: 0 },
	{ type: 'bodyweight', name: 'Bodyweight', inc: 0 }
];

export const load: PageServerLoad = async () => {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	const commitments = await db.select().from(schema.recurringCommitments);
	const equipment = await db.select().from(schema.equipment);
	return { profile: profile ?? null, commitments, equipment };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const f = await request.formData();

		const goal = String(f.get('goal') ?? 'strength') as Goal;
		const splitType = String(f.get('splitType') ?? 'auto') as
			| 'auto'
			| 'fullbody'
			| 'upper_lower'
			| 'ppl';
		const experience = String(f.get('experience') ?? 'intermediate') as
			| 'beginner'
			| 'intermediate'
			| 'advanced';
		const sessionsPerWeek = Number(f.get('sessionsPerWeek') ?? 3);
		const timeBudgetMin = Number(f.get('timeBudgetMin') ?? 60);
		const commitmentLabel = String(f.get('commitmentLabel') ?? 'Hockey').trim() || 'Hockey';
		const days = f.getAll('commitmentDays').map((d) => Number(d));

		// Upsert the single profile row.
		const values = { currentGoal: goal, splitType, experience, sessionsPerWeek, timeBudgetMin, updatedAt: Date.now() };
		await db
			.insert(schema.profile)
			.values({ id: 1, ...values })
			.onConflictDoUpdate({ target: schema.profile.id, set: values });

		// Equipment: set availability per type (bodyweight always on).
		const selected = new Set(f.getAll('equipment').map(String));
		selected.add('bodyweight');
		for (const e of EQUIPMENT_TYPES) {
			const available = selected.has(e.type);
			const existing = await db.select().from(schema.equipment).where(eq(schema.equipment.type, e.type));
			if (existing.length > 0) {
				await db.update(schema.equipment).set({ available }).where(eq(schema.equipment.type, e.type));
			} else {
				await db
					.insert(schema.equipment)
					.values({ name: e.name, type: e.type, smallestIncrement: e.inc, available });
			}
		}

		// Replace recurring commitments with the chosen weekdays.
		await db.delete(schema.recurringCommitments);
		if (days.length > 0) {
			await db
				.insert(schema.recurringCommitments)
				.values(days.map((weekday) => ({ label: commitmentLabel, weekday })));
		}

		throw redirect(303, '/');
	}
};
