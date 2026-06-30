import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** Recent training days, each with its exercises and logged sets (app + imported). */
export const load: PageServerLoad = async () => {
	const dateRows = await db
		.selectDistinct({ date: schema.loggedSets.date })
		.from(schema.loggedSets)
		.orderBy(desc(schema.loggedSets.date))
		.limit(40);
	const dates = dateRows.map((r) => r.date);
	if (dates.length === 0) return { days: [] };

	const rows = await db
		.select({
			date: schema.loggedSets.date,
			exerciseId: schema.loggedSets.exerciseId,
			name: schema.exercises.name,
			weight: schema.loggedSets.weight,
			reps: schema.loggedSets.reps,
			source: schema.loggedSets.source
		})
		.from(schema.loggedSets)
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.loggedSets.exerciseId))
		.where(inArray(schema.loggedSets.date, dates))
		.orderBy(desc(schema.loggedSets.date), asc(schema.loggedSets.exerciseId), asc(schema.loggedSets.setIndex));

	// Group rows → date → exercise → sets.
	type Ex = { name: string; source: string; sets: { weight: number; reps: number }[] };
	const byDate = new Map<string, Map<number, Ex>>();
	for (const r of rows) {
		if (!byDate.has(r.date)) byDate.set(r.date, new Map());
		const exMap = byDate.get(r.date)!;
		if (!exMap.has(r.exerciseId)) exMap.set(r.exerciseId, { name: r.name, source: r.source, sets: [] });
		exMap.get(r.exerciseId)!.sets.push({ weight: r.weight, reps: r.reps });
	}

	const days = dates
		.filter((d) => byDate.has(d))
		.map((date) => ({ date, exercises: [...byDate.get(date)!.values()] }));

	return { days };
};
