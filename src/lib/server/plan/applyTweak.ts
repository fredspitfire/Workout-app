/**
 * Apply a natural-language tweak to the active plan: gather each planned
 * exercise's alternatives (same movement/muscle, equipment-matched), ask Claude
 * what to swap, then apply the swaps — recomputing weight/increment for any new
 * exercise via the engine. Keeps the slot's reps/sets/rest unchanged.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { and, asc, eq } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { roundToIncrement } from '../../engine/index.ts';
import { loadContext, DEFAULT_TOP, DEFAULT_ACC, type ExCtx } from './generatePlan.ts';
import { tweakPlan, type TweakExercise } from '../ai/tweakPlan.ts';

type DB = LibSQLDatabase<typeof schema>;

/** Alternatives for one exercise: same movement group or same muscle, capped. */
function alternativesFor(current: ExCtx, ctx: ExCtx[]): ExCtx[] {
	const seen = new Set<number>([current.id]);
	const out: ExCtx[] = [current];
	for (const e of ctx) {
		if (seen.has(e.id)) continue;
		const sameGroup = current.group && e.group === current.group;
		const sameMuscle = current.muscle !== 'unknown' && e.muscle === current.muscle;
		if (sameGroup || sameMuscle) {
			seen.add(e.id);
			out.push(e);
		}
	}
	out.sort((a, b) => Number(b.hasHistory) - Number(a.hasHistory) || a.name.localeCompare(b.name));
	return out.slice(0, 8);
}

export interface TweakOutcome {
	ok: boolean;
	summary: string;
	changed: number;
}

export async function applyTweak(db: DB, request: string): Promise<TweakOutcome> {
	const [block] = await db.select().from(schema.blocks).where(eq(schema.blocks.status, 'active'));
	if (!block) return { ok: false, summary: 'No active plan to adjust.', changed: 0 };

	const rows = await db
		.select({
			plannedId: schema.plannedExercises.id,
			exerciseId: schema.plannedExercises.exerciseId,
			type: schema.plannedExercises.prescriptionType,
			date: schema.plannedSessions.date,
			name: schema.exercises.name
		})
		.from(schema.plannedExercises)
		.innerJoin(schema.plannedSessions, eq(schema.plannedSessions.id, schema.plannedExercises.sessionId))
		.innerJoin(schema.exercises, eq(schema.exercises.id, schema.plannedExercises.exerciseId))
		.where(eq(schema.plannedSessions.blockId, block.id))
		.orderBy(asc(schema.plannedSessions.date), asc(schema.plannedExercises.orderIndex));

	const ctx = await loadContext(db);
	const ctxById = new Map(ctx.map((c) => [c.id, c]));

	const exercises: TweakExercise[] = rows.map((r) => {
		const cur = ctxById.get(r.exerciseId);
		const options = cur ? alternativesFor(cur, ctx) : [];
		return {
			plannedId: r.plannedId,
			name: r.name,
			role: r.type === 'ramp' ? 'compound' : 'accessory',
			day: r.date,
			options: options.map((o) => ({ id: o.id, name: o.name }))
		};
	});

	const result = await tweakPlan(request, exercises);
	if (!result) return { ok: false, summary: "Couldn't apply that — try rephrasing.", changed: 0 };

	const rowByPlanned = new Map(rows.map((r) => [r.plannedId, r]));
	let changed = 0;
	for (const swap of result.swaps) {
		const row = rowByPlanned.get(swap.plannedId);
		const next = ctxById.get(swap.newId);
		if (!row || !next) continue;
		const ramp = row.type === 'ramp';
		const inc = next.increment || 5;
		const base = next.top ?? (ramp ? DEFAULT_TOP : DEFAULT_ACC)[next.equipmentType] ?? (ramp ? 45 : 25);
		await db
			.update(schema.plannedExercises)
			.set({
				exerciseId: next.id,
				topWeight: roundToIncrement(base * (ramp ? 0.9 : 1), inc),
				perSetIncrement: ramp ? Math.max(inc * 2, 5) : null
			})
			.where(eq(schema.plannedExercises.id, swap.plannedId));
		changed++;
	}

	return { ok: true, summary: result.summary, changed };
}
