/**
 * Plan generator. Turns your profile (goal, split, days, time, hockey schedule)
 * + seeded working weights into a real mesocycle block and this week's sessions.
 *
 * Exercise SELECTION is AI-assisted (Claude picks which exercise fills each slot
 * from an equipment-matched candidate pool, preferring your real lifts); if the
 * AI is unavailable it falls back to a deterministic pick (history-first). Either
 * way, the deterministic engine owns every weight, rep, set, and rest number.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { GOALS, buildBlock, roundToIncrement, restSeconds, type Goal, type Phase } from '../../engine/index.ts';
import { weekTemplates, type Slot } from './splitTemplates.ts';
import { chooseLiftWeekdays, assignTemplatesToDays } from './schedule.ts';
import { selectExercises, type DayPlan } from '../ai/selectExercises.ts';

type DB = LibSQLDatabase<typeof schema>;

const iso = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DEFAULT_TOP: Record<string, number> = { barbell: 95, dumbbell: 40, cable: 80, machine: 100, bodyweight: 0, unknown: 45 };
const DEFAULT_ACC: Record<string, number> = { barbell: 45, dumbbell: 25, cable: 40, machine: 70, bodyweight: 0, unknown: 25 };

// Slot movement group → catalog primary muscles (for pulling in alternatives).
const SLOT_MUSCLES: Record<string, string[]> = {
	squat: ['quadriceps', 'glutes'],
	hinge: ['hamstrings', 'glutes', 'lower back'],
	horiz_press: ['chest'],
	incline_press: ['chest', 'shoulders'],
	vert_press: ['shoulders'],
	horiz_pull: ['middle back', 'lats', 'traps'],
	vert_pull: ['lats', 'middle back'],
	lateral_raise: ['shoulders'],
	biceps_curl: ['biceps'],
	triceps_ext: ['triceps'],
	leg_ext: ['quadriceps'],
	leg_curl: ['hamstrings'],
	calf: ['calves'],
	chest_fly: ['chest'],
	rear_delt: ['shoulders', 'traps'],
	hinge_accessory: ['hamstrings', 'glutes'],
	core: ['abdominals']
};

interface ExCtx {
	id: number;
	name: string;
	muscle: string;
	equipmentType: string;
	compound: boolean;
	increment: number;
	source: string;
	group: string | null;
	top?: number;
	hasHistory: boolean;
}

/** Load the equipment-matched library with history flags + seeded working weights. */
async function loadContext(db: DB): Promise<ExCtx[]> {
	const exs = await db.select().from(schema.exercises);
	const states = await db.select().from(schema.exerciseState);
	const topById = new Map(states.map((s) => [s.exerciseId, s.currentTop]));
	const hist = await db.selectDistinct({ id: schema.loggedSets.exerciseId }).from(schema.loggedSets);
	const histIds = new Set(hist.map((h) => h.id));

	const available = new Set(
		(await db.select().from(schema.equipment)).filter((e) => e.available).map((e) => e.type)
	);
	available.add('bodyweight');
	available.add('unknown'); // never exclude the user's own lifts

	return exs
		.filter((e) => available.has(e.equipmentType))
		.map((e) => ({
			id: e.id,
			name: e.name,
			muscle: e.primaryMuscle,
			equipmentType: e.equipmentType,
			compound: e.isCompound,
			increment: e.defaultIncrement || 5,
			source: e.source,
			group: e.substitutionGroup,
			top: topById.get(e.id),
			hasHistory: histIds.has(e.id)
		}));
}

/** Candidate exercises for a slot: the curated movement + catalog options by muscle,
 *  ranked history-first / role-matched, capped. */
function candidatesFor(slot: Slot, ctx: ExCtx[]): ExCtx[] {
	const muscles = SLOT_MUSCLES[slot.group] ?? [];
	const roleCompound = slot.role === 'compound';
	const seen = new Set<number>();
	const out: ExCtx[] = [];
	for (const e of ctx) {
		const match = e.group === slot.group || (e.source === 'catalog' && muscles.includes(e.muscle));
		if (!match || seen.has(e.id)) continue;
		seen.add(e.id);
		out.push(e);
	}
	out.sort(
		(a, b) =>
			Number(b.hasHistory) - Number(a.hasHistory) ||
			Number(b.compound === roleCompound) - Number(a.compound === roleCompound) ||
			a.name.localeCompare(b.name)
	);
	return out.slice(0, 8);
}

export interface GenerateResult {
	blockId: number;
	sessions: number;
	exercises: number;
	aiSelected: boolean;
}

export async function generatePlan(db: DB, today = new Date()): Promise<GenerateResult> {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) throw new Error('No profile — run setup first.');

	const goal = profile.currentGoal as Goal;
	const sessionsPerWeek = profile.sessionsPerWeek;
	const cfg = GOALS[goal];

	// 1. Replace any existing plan (logged sets survive via session set-null).
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

	// 3. Recovery-aware lift weekdays + content placement + library context.
	const ctx = await loadContext(db);
	const commitments = await db.select().from(schema.recurringCommitments);
	const hockey = commitments.map((c) => c.weekday);
	const liftWeekdays = chooseLiftWeekdays(hockey, sessionsPerWeek);
	const placed = assignTemplatesToDays(liftWeekdays, weekTemplates(profile.splitType, sessionsPerWeek), hockey);

	const todayWd = today.getDay();
	const days = liftWeekdays
		.map((wd, i) => {
			const date = new Date(today);
			date.setDate(date.getDate() + ((wd - todayWd + 7) % 7));
			return { date: iso(date), template: placed[i] };
		})
		.sort((a, b) => a.date.localeCompare(b.date));

	// 4. Build per-day slot candidates, then let the AI pick (fallback: history-first).
	const phase: Phase = 'onramp';
	const range = cfg.repRange[phase];
	const setCount = cfg.sets[phase];
	const maxExercises = Math.max(3, Math.floor(profile.timeBudgetMin / 9));

	const dayCandidates = days.map(({ template }) =>
		template.slots.slice(0, maxExercises).map((slot) => ({ slot, options: candidatesFor(slot, ctx) }))
	);
	const aiInput: DayPlan[] = days.map(({ template }, d) => ({
		label: template.name,
		slots: dayCandidates[d].map(({ slot, options }) => ({
			role: slot.role,
			target: slot.group,
			options: options.map((o) => ({ id: o.id, name: o.name, history: o.hasHistory, compound: o.compound }))
		}))
	}));

	const picks = await selectExercises(goal, phase, aiInput);
	const aiSelected = picks !== null;
	console.log(`[ai] exercise selection ${aiSelected ? 'USED (Claude)' : 'fell back (deterministic)'}`);

	// 5. Create sessions + prescriptions for the chosen exercises.
	let exerciseCount = 0;
	for (let d = 0; d < days.length; d++) {
		const [session] = await db
			.insert(schema.plannedSessions)
			.values({ blockId: block.id, date: days[d].date, phase, orderIndex: d })
			.returning({ id: schema.plannedSessions.id });

		const rows = [];
		for (let i = 0; i < dayCandidates[d].length; i++) {
			const { slot, options } = dayCandidates[d][i];
			if (options.length === 0) continue;
			const pickedId = picks?.[d]?.[i];
			const chosen = options.find((o) => o.id === pickedId) ?? options[0];
			rows.push(buildPrescription(chosen, slot.role, range, setCount, session.id, i, phase));
		}
		if (rows.length > 0) {
			await db.insert(schema.plannedExercises).values(rows);
			exerciseCount += rows.length;
		}
	}

	return { blockId: block.id, sessions: days.length, exercises: exerciseCount, aiSelected };
}

function buildPrescription(
	chosen: ExCtx,
	role: 'compound' | 'accessory',
	range: { min: number; max: number },
	setCount: number,
	sessionId: number,
	orderIndex: number,
	phase: Phase
) {
	const inc = chosen.increment || 5;
	if (role === 'compound') {
		const base = chosen.top ?? DEFAULT_TOP[chosen.equipmentType] ?? 45;
		return {
			sessionId,
			exerciseId: chosen.id,
			orderIndex,
			prescriptionType: 'ramp' as const,
			topWeight: roundToIncrement(base * 0.9, inc),
			repMin: range.min,
			repMax: range.max,
			sets: setCount,
			perSetIncrement: Math.max(inc * 2, 5),
			restSeconds: restSeconds({ compound: true, repMax: range.max, phase })
		};
	}
	const base = chosen.top ?? DEFAULT_ACC[chosen.equipmentType] ?? 25;
	const repMax = Math.max(12, range.max + 4);
	return {
		sessionId,
		exerciseId: chosen.id,
		orderIndex,
		prescriptionType: 'straight' as const,
		topWeight: roundToIncrement(base, inc),
		repMin: Math.max(8, range.min + 3),
		repMax,
		sets: 3,
		perSetIncrement: null,
		restSeconds: restSeconds({ compound: false, repMax, phase })
	};
}
