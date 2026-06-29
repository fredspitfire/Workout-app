/**
 * Deterministic plan generator. Turns your profile (goal, split, days, time,
 * hockey schedule) + seeded working weights into a real mesocycle block and this
 * week's sessions. Exercise *selection* is deterministic here; the AI takes over
 * picking/rotating exercises in Phase 6. The engine still owns every number.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { GOALS, buildBlock, roundToIncrement, type Goal, type Phase } from '../../engine/index.ts';
import { weekTemplates, type Slot } from './splitTemplates.ts';

type DB = LibSQLDatabase<typeof schema>;

const iso = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fallback starting weights when a slot's exercise has no logged history.
const DEFAULT_TOP: Record<string, number> = { barbell: 95, dumbbell: 40, cable: 80, machine: 100, bodyweight: 0, unknown: 45 };
const DEFAULT_ACC: Record<string, number> = { barbell: 45, dumbbell: 25, cable: 40, machine: 70, bodyweight: 0, unknown: 25 };

interface Chosen {
	id: number;
	increment: number;
	equipmentType: string;
	top?: number; // seeded working weight, if any
}

/** Pick one library exercise per substitution group, preferring your real lifts. */
async function chooseByGroup(db: DB): Promise<Map<string, Chosen>> {
	const all = await db.select().from(schema.exercises);
	const states = await db.select().from(schema.exerciseState);
	const topById = new Map<number, number>();
	for (const s of states) topById.set(s.exerciseId, s.currentTop);

	const available = new Set(
		(await db.select().from(schema.equipment)).filter((e) => e.available).map((e) => e.type)
	);
	available.add('bodyweight');

	const byGroup = new Map<string, Chosen>();
	for (const ex of all) {
		if (!ex.substitutionGroup) continue;
		if (!available.has(ex.equipmentType) && ex.equipmentType !== 'unknown') continue;
		const top = topById.get(ex.id);
		const current = byGroup.get(ex.substitutionGroup);
		// Rank: seeded weight beats none; then builtin beats imported.
		const score = (top !== undefined ? 2 : 0) + (ex.source === 'builtin' ? 1 : 0);
		const curScore = current ? (current.top !== undefined ? 2 : 0) + 1 : -1;
		if (!current || score > curScore) {
			byGroup.set(ex.substitutionGroup, {
				id: ex.id,
				increment: ex.defaultIncrement || 5,
				equipmentType: ex.equipmentType,
				top
			});
		}
	}
	return byGroup;
}

export interface GenerateResult {
	blockId: number;
	sessions: number;
	exercises: number;
}

export async function generatePlan(db: DB, today = new Date()): Promise<GenerateResult> {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) throw new Error('No profile — run setup first.');

	const goal = profile.currentGoal as Goal;
	const sessionsPerWeek = profile.sessionsPerWeek;
	const cfg = GOALS[goal];

	// 1. Replace any existing plan. We don't use historical blocks yet, so wipe
	// them; cascades clear their phases/sessions/exercises, and logged sets
	// survive because their session link is set to null on delete (real history
	// is in logged_sets, not planned_sessions). Block archiving can come later.
	await db.delete(schema.blocks);

	const [block] = await db
		.insert(schema.blocks)
		.values({ goal, loadingWeeks: 3, startDate: iso(today), currentPhase: 'onramp', currentWeekIndex: 0 })
		.returning({ id: schema.blocks.id });

	// 2. Phase plan (On-Ramp → Accumulation → Intensification → Deload).
	const plan = buildBlock(3);
	await db.insert(schema.blockPhases).values(
		plan.weeks.map((phase, i) => ({
			blockId: block.id,
			phase,
			orderIndex: i,
			plannedWeeks: 1,
			targetSessions: phase === 'deload' ? Math.max(1, Math.round(sessionsPerWeek / 2)) : sessionsPerWeek
		}))
	);

	// 3. Choose exercises + figure out this week's dates (skip hockey days).
	const byGroup = await chooseByGroup(db);
	const commitments = await db.select().from(schema.recurringCommitments);
	const hockey = new Set(commitments.map((c) => c.weekday));

	const dates: string[] = [];
	const cursor = new Date(today);
	for (let i = 0; i < 14 && dates.length < sessionsPerWeek; i++) {
		if (!hockey.has(cursor.getDay())) dates.push(iso(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}

	// 4. Build the week's sessions. New block opens in the On-Ramp phase.
	const phase: Phase = 'onramp';
	const range = cfg.repRange[phase];
	const setCount = cfg.sets[phase];
	const maxExercises = Math.max(3, Math.floor(profile.timeBudgetMin / 9));
	const templates = weekTemplates(profile.splitType, sessionsPerWeek);

	let exerciseCount = 0;
	for (let d = 0; d < dates.length; d++) {
		const template = templates[d];
		const [session] = await db
			.insert(schema.plannedSessions)
			.values({ blockId: block.id, date: dates[d], phase, orderIndex: d })
			.returning({ id: schema.plannedSessions.id });

		const slots = template.slots.slice(0, maxExercises);
		const rows = slots
			.map((slot, i) => buildPrescription(slot, byGroup, range, setCount, session.id, i))
			.filter((r): r is NonNullable<typeof r> => r !== null);
		if (rows.length > 0) {
			await db.insert(schema.plannedExercises).values(rows);
			exerciseCount += rows.length;
		}
	}

	return { blockId: block.id, sessions: dates.length, exercises: exerciseCount };
}

function buildPrescription(
	slot: Slot,
	byGroup: Map<string, Chosen>,
	range: { min: number; max: number },
	setCount: number,
	sessionId: number,
	orderIndex: number
) {
	const chosen = byGroup.get(slot.group);
	if (!chosen) return null;
	const inc = chosen.increment || 5;

	if (slot.role === 'compound') {
		// On-Ramp eases in at ~90% of your seeded top, then climbs over the block.
		const base = chosen.top ?? DEFAULT_TOP[chosen.equipmentType] ?? 45;
		const topWeight = roundToIncrement(base * 0.9, inc || 5);
		return {
			sessionId,
			exerciseId: chosen.id,
			orderIndex,
			prescriptionType: 'ramp' as const,
			topWeight,
			repMin: range.min,
			repMax: range.max,
			sets: setCount,
			perSetIncrement: Math.max(inc * 2, 5)
		};
	}

	// Accessory: straight sets, higher reps, no ramp.
	const base = chosen.top ?? DEFAULT_ACC[chosen.equipmentType] ?? 25;
	return {
		sessionId,
		exerciseId: chosen.id,
		orderIndex,
		prescriptionType: 'straight' as const,
		topWeight: roundToIncrement(base, inc || 5),
		repMin: Math.max(8, range.min + 3),
		repMax: Math.max(12, range.max + 4),
		sets: 3,
		perSetIncrement: null
	};
}
