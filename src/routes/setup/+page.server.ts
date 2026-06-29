import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { Goal } from '$lib/engine';
import type { PageServerLoad, Actions } from './$types';

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
		const experience = String(f.get('experience') ?? 'intermediate') as
			| 'beginner'
			| 'intermediate'
			| 'advanced';
		const sessionsPerWeek = Number(f.get('sessionsPerWeek') ?? 3);
		const timeBudgetMin = Number(f.get('timeBudgetMin') ?? 60);
		const commitmentLabel = String(f.get('commitmentLabel') ?? 'Hockey').trim() || 'Hockey';
		const days = f.getAll('commitmentDays').map((d) => Number(d));

		// Upsert the single profile row.
		const values = { currentGoal: goal, experience, sessionsPerWeek, timeBudgetMin, updatedAt: Date.now() };
		await db
			.insert(schema.profile)
			.values({ id: 1, ...values })
			.onConflictDoUpdate({ target: schema.profile.id, set: values });

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
