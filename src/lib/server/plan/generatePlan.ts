/**
 * Plan generator. Turns your profile (goal, split, days, time, hockey schedule)
 * + seeded working weights into a mesocycle block and generates ONE week at a
 * time. `advanceWeek` moves the block forward (progressing weights by phase) or
 * EXTENDS the current phase when sessions were missed, banking the work first.
 *
 * Exercise SELECTION is AI-assisted (Claude picks from an equipment-matched pool,
 * preferring your real lifts); the deterministic engine owns every number.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { and, eq, gte, lte } from 'drizzle-orm';
import * as schema from '../db/schema.ts';
import { GOALS, buildBlock, roundToIncrement, restSeconds, type Goal, type Phase } from '../../engine/index.ts';
import { weekTemplates, type Slot } from './splitTemplates.ts';
import { chooseLiftWeekdays, assignTemplatesToDays } from './schedule.ts';
import { selectExercises, type DayPlan } from '../ai/selectExercises.ts';

type DB = LibSQLDatabase<typeof schema>;
type Profile = typeof schema.profile.$inferSelect;

const iso = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const DEFAULT_TOP: Record<string, number> = { barbell: 95, dumbbell: 40, cable: 80, machine: 100, bodyweight: 0, unknown: 45 };
export const DEFAULT_ACC: Record<string, number> = { barbell: 45, dumbbell: 25, cable: 40, machine: 70, bodyweight: 0, unknown: 25 };

// Phase intensity: fraction of the working max the week's top set targets. Weights
// climb across the block (On-Ramp eases in → Intensification peaks → Deload backs off).
const PHASE_INTENSITY: Record<Phase, number> = {
	onramp: 0.9,
	accumulation: 0.97,
	intensification: 1.03,
	deload: 0.75
};

const PHASE_ORDER: Phase[] = ['onramp', 'accumulation', 'intensification', 'deload'];

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

export interface ExCtx {
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
export async function loadContext(db: DB): Promise<ExCtx[]> {
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

/** Candidate exercises for a slot: curated movement + catalog by muscle, ranked. */
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
}

/** Build (or rebuild) the active week's sessions for a given phase. Deletes the
 *  block's existing planned sessions first, so only the current week exists. */
async function generateWeek(db: DB, blockId: number, phase: Phase, profile: Profile, today: Date): Promise<number> {
	const goal = profile.currentGoal as Goal;
	const cfg = GOALS[goal];
	const sessionsPerWeek = profile.sessionsPerWeek;

	await db.delete(schema.plannedSessions).where(eq(schema.plannedSessions.blockId, blockId));

	const ctx = await loadContext(db);
	const commitments = await db.select().from(schema.recurringCommitments);

	// Fold any dated games falling in this week into the recovery schedule, so the
	// engine keeps legs off the day before a game just like a recurring practice.
	const weekEnd = new Date(today);
	weekEnd.setDate(weekEnd.getDate() + 6);
	const games = await db
		.select()
		.from(schema.datedEvents)
		.where(and(gte(schema.datedEvents.date, iso(today)), lte(schema.datedEvents.date, iso(weekEnd))));
	const gameWeekdays = games.map((g) => new Date(g.date + 'T00:00:00').getDay());
	const hockey = [...new Set([...commitments.map((c) => c.weekday), ...gameWeekdays])];

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
	console.log(`[ai] exercise selection ${picks !== null ? 'USED (Claude)' : 'fell back (deterministic)'}`);

	let exercises = 0;
	for (let d = 0; d < days.length; d++) {
		const [session] = await db
			.insert(schema.plannedSessions)
			.values({ blockId, date: days[d].date, phase, orderIndex: d })
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
			exercises += rows.length;
		}
	}
	return exercises;
}

/** Start a fresh block (On-Ramp week 1) from the current profile + working maxes. */
export async function generatePlan(db: DB, today = new Date()): Promise<GenerateResult> {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) throw new Error('No profile — run setup first.');
	const sessionsPerWeek = profile.sessionsPerWeek;

	await db.delete(schema.blocks);
	const [block] = await db
		.insert(schema.blocks)
		.values({ goal: profile.currentGoal as Goal, loadingWeeks: 3, startDate: iso(today), currentPhase: 'onramp', currentWeekIndex: 0 })
		.returning({ id: schema.blocks.id });

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

	const exercises = await generateWeek(db, block.id, 'onramp', profile, today);
	return { blockId: block.id, sessions: sessionsPerWeek, exercises };
}

export interface AdvanceResult {
	kind: 'advanced' | 'extended' | 'newblock';
	phase: Phase;
}

/**
 * Move the active block forward. If the current phase's target sessions are
 * banked → advance to the next phase (weights climb; after Deload, start a new
 * block). If sessions were missed (banked < target) → EXTEND the phase with
 * another week so the intended work still gets banked.
 */
export async function advanceWeek(db: DB, today = new Date()): Promise<AdvanceResult | null> {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	if (!profile) return null;
	const [block] = await db.select().from(schema.blocks).where(eq(schema.blocks.status, 'active'));
	if (!block) return null;

	const sessions = await db.select().from(schema.plannedSessions).where(eq(schema.plannedSessions.blockId, block.id));
	const completed = sessions.filter((s) => s.status === 'completed').length;

	const phases = await db.select().from(schema.blockPhases).where(eq(schema.blockPhases.blockId, block.id));
	const cur = phases.find((p) => p.phase === block.currentPhase);
	const banked = (cur?.bankedSessions ?? 0) + completed;
	const target = cur?.targetSessions ?? profile.sessionsPerWeek;

	// Missed work → extend the current phase (bank progress, run another week).
	if (banked < target) {
		if (cur)
			await db
				.update(schema.blockPhases)
				.set({ bankedSessions: banked, actualWeeks: cur.actualWeeks + 1 })
				.where(eq(schema.blockPhases.id, cur.id));
		await db.update(schema.blocks).set({ currentWeekIndex: block.currentWeekIndex + 1 }).where(eq(schema.blocks.id, block.id));
		await generateWeek(db, block.id, block.currentPhase as Phase, profile, today);
		return { kind: 'extended', phase: block.currentPhase as Phase };
	}

	// Phase complete.
	if (cur) await db.update(schema.blockPhases).set({ bankedSessions: banked }).where(eq(schema.blockPhases.id, cur.id));

	if (block.currentPhase === 'deload') {
		await generatePlan(db, today); // block finished → fresh block from climbed maxes
		return { kind: 'newblock', phase: 'onramp' };
	}
	const next = PHASE_ORDER[PHASE_ORDER.indexOf(block.currentPhase as Phase) + 1];
	await db
		.update(schema.blocks)
		.set({ currentPhase: next, currentWeekIndex: block.currentWeekIndex + 1 })
		.where(eq(schema.blocks.id, block.id));
	await generateWeek(db, block.id, next, profile, today);
	return { kind: 'advanced', phase: next };
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
			topWeight: roundToIncrement(base * PHASE_INTENSITY[phase], inc),
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
		topWeight: roundToIncrement(base * PHASE_INTENSITY[phase], inc),
		repMin: Math.max(8, range.min + 3),
		repMax,
		sets: 3,
		perSetIncrement: null,
		restSeconds: restSeconds({ compound: false, repMax, phase })
	};
}
