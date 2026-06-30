/**
 * Database schema — the single source of truth for what the app stores.
 *
 * One user (you). SQLite via libsql. Plain-language notes on each table so the
 * whole data model reads top to bottom. Engine types (Goal/Phase) are reused as
 * column types so the DB and engine never drift.
 */
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import type { Goal, Phase } from '../../engine/types.ts';

const now = () => Date.now();

/** Your single profile + global training preferences. One row (id = 1). */
export const profile = sqliteTable('profile', {
	id: integer('id').primaryKey({ autoIncrement: false }).default(1),
	units: text('units').$type<'lb' | 'kg'>().notNull().default('lb'),
	experience: text('experience')
		.$type<'beginner' | 'intermediate' | 'advanced'>()
		.notNull()
		.default('intermediate'),
	currentGoal: text('current_goal').$type<Goal>().notNull().default('strength'),
	splitType: text('split_type')
		.$type<'auto' | 'fullbody' | 'upper_lower' | 'ppl'>()
		.notNull()
		.default('auto'),
	sessionsPerWeek: integer('sessions_per_week').notNull().default(3),
	timeBudgetMin: integer('time_budget_min').notNull().default(60),
	updatedAt: integer('updated_at').notNull().$defaultFn(now)
});

/** What you own. Drives which exercises are possible and the smallest weight jump. */
export const equipment = sqliteTable('equipment', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	type: text('type')
		.$type<'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'band'>()
		.notNull(),
	smallestIncrement: real('smallest_increment').notNull().default(5),
	available: integer('available', { mode: 'boolean' }).notNull().default(true)
});

/** The exercise library. Exercises sharing a substitutionGroup can swap for each other. */
export const exercises = sqliteTable('exercises', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	primaryMuscle: text('primary_muscle').notNull(),
	equipmentType: text('equipment_type').notNull(),
	isCompound: integer('is_compound', { mode: 'boolean' }).notNull().default(false),
	defaultIncrement: real('default_increment').notNull().default(5),
	substitutionGroup: text('substitution_group'),
	source: text('source').$type<'builtin' | 'jefit' | 'custom'>().notNull().default('builtin'),
	jefitId: text('jefit_id') // maps to JEFIT eid for import
});

/** Recurring fixed commitments — e.g. hockey practice every Tue/Thu. */
export const recurringCommitments = sqliteTable('recurring_commitments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	label: text('label').notNull(),
	weekday: integer('weekday').notNull(), // 0 = Sunday .. 6 = Saturday
	startMinute: integer('start_minute'), // minutes from midnight, nullable
	endMinute: integer('end_minute')
});

/** Specific dated events the plan must work around — first-class so games matter. */
export const datedEvents = sqliteTable('dated_events', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	label: text('label').notNull(),
	date: text('date').notNull(), // yyyy-mm-dd
	type: text('type').$type<'game' | 'travel' | 'other'>().notNull().default('game'),
	notes: text('notes')
});

/** A mesocycle block. Ends in a Deload phase by design. Length = loadingWeeks : 1. */
export const blocks = sqliteTable('blocks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	goal: text('goal').$type<Goal>().notNull(),
	loadingWeeks: integer('loading_weeks').notNull().default(3), // 3:1 default
	startDate: text('start_date').notNull(),
	status: text('status').$type<'active' | 'completed'>().notNull().default('active'),
	currentPhase: text('current_phase').$type<Phase>().notNull().default('onramp'),
	currentWeekIndex: integer('current_week_index').notNull().default(0),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

/**
 * Per-block phase plan. Tracks target vs banked work so a missed week can EXTEND
 * a phase (actualWeeks grows past plannedWeeks) instead of skipping its work.
 */
export const blockPhases = sqliteTable('block_phases', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	blockId: integer('block_id')
		.notNull()
		.references(() => blocks.id, { onDelete: 'cascade' }),
	phase: text('phase').$type<Phase>().notNull(),
	orderIndex: integer('order_index').notNull(),
	plannedWeeks: integer('planned_weeks').notNull().default(1),
	actualWeeks: integer('actual_weeks').notNull().default(0),
	targetSessions: integer('target_sessions').notNull().default(0),
	bankedSessions: integer('banked_sessions').notNull().default(0)
});

/** A planned training day within a block. */
export const plannedSessions = sqliteTable('planned_sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	blockId: integer('block_id')
		.notNull()
		.references(() => blocks.id, { onDelete: 'cascade' }),
	date: text('date').notNull(), // yyyy-mm-dd
	phase: text('phase').$type<Phase>().notNull(),
	orderIndex: integer('order_index').notNull().default(0),
	status: text('status').$type<'planned' | 'completed' | 'skipped'>().notNull().default('planned')
});

/** The engine's prescription for one exercise in one planned session. */
export const plannedExercises = sqliteTable('planned_exercises', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id')
		.notNull()
		.references(() => plannedSessions.id, { onDelete: 'cascade' }),
	exerciseId: integer('exercise_id')
		.notNull()
		.references(() => exercises.id),
	orderIndex: integer('order_index').notNull().default(0),
	prescriptionType: text('prescription_type').$type<'ramp' | 'straight'>().notNull().default('ramp'),
	topWeight: real('top_weight').notNull(), // ramp top set, or straight-set weight
	repMin: integer('rep_min').notNull(),
	repMax: integer('rep_max').notNull(),
	sets: integer('sets').notNull().default(3),
	perSetIncrement: real('per_set_increment'), // ramp step between sets, nullable
	restSeconds: integer('rest_seconds').notNull().default(90) // engine-prescribed rest
});

/**
 * Every set you actually log. Also where imported JEFIT history lands (source =
 * 'jefit_import', sessionId null). date is denormalized so history queries are easy.
 */
export const loggedSets = sqliteTable('logged_sets', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id').references(() => plannedSessions.id, { onDelete: 'set null' }),
	exerciseId: integer('exercise_id')
		.notNull()
		.references(() => exercises.id),
	date: text('date').notNull(), // yyyy-mm-dd
	setIndex: integer('set_index').notNull(),
	weight: real('weight').notNull(),
	reps: integer('reps').notNull(),
	intraAdjusted: integer('intra_adjusted', { mode: 'boolean' }).notNull().default(false),
	swappedFromExerciseId: integer('swapped_from_exercise_id'),
	effortTag: text('effort_tag').$type<'easy' | 'hard'>(),
	source: text('source').$type<'app' | 'jefit_import'>().notNull().default('app'),
	loggedAt: integer('logged_at').notNull().$defaultFn(now)
});

/** Carry-forward engine state per exercise (so progression survives between sessions). */
export const exerciseState = sqliteTable('exercise_state', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	exerciseId: integer('exercise_id')
		.notNull()
		.references(() => exercises.id),
	blockId: integer('block_id').references(() => blocks.id, { onDelete: 'cascade' }),
	currentTop: real('current_top').notNull(),
	consecutiveMisses: integer('consecutive_misses').notNull().default(0),
	lastRepTarget: integer('last_rep_target'),
	updatedAt: integer('updated_at').notNull().$defaultFn(now)
});
