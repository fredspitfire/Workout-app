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

// Whitelists — reject anything not in the allowed set (fall back to a safe default)
// so a crafted or malformed POST can't wedge plan generation with junk values.
const GOALS = ['strength', 'hypertrophy', 'general', 'hockey'] as const;
const SPLITS = ['auto', 'fullbody', 'upper_lower', 'ppl'] as const;
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

const oneOf = <T extends readonly string[]>(v: FormDataEntryValue | null, allowed: T, fallback: T[number]): T[number] =>
	(allowed as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : fallback;

/** Parse to an integer within [min,max]; non-numeric or out-of-range → clamped/fallback. */
const intIn = (v: FormDataEntryValue | null, min: number, max: number, fallback: number): number => {
	const n = Math.round(Number(v));
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
};

export const actions: Actions = {
	default: async ({ request }) => {
		const f = await request.formData();

		const goal = oneOf(f.get('goal'), GOALS, 'strength') as Goal;
		const splitType = oneOf(f.get('splitType'), SPLITS, 'auto');
		const experience = oneOf(f.get('experience'), LEVELS, 'intermediate');
		const sessionsPerWeek = intIn(f.get('sessionsPerWeek'), 1, 7, 3);
		const timeBudgetMin = intIn(f.get('timeBudgetMin'), 10, 240, 60);
		const commitmentLabel = String(f.get('commitmentLabel') ?? 'Hockey').trim().slice(0, 40) || 'Hockey';
		// Only valid weekdays (0–6), de-duplicated.
		const days = [...new Set(f.getAll('commitmentDays').map((d) => Number(d)))].filter(
			(d) => Number.isInteger(d) && d >= 0 && d <= 6
		);

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
