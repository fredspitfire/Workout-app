/**
 * Split structure → ordered day templates for a week.
 *
 * Each day is a list of slots (a muscle/movement role to fill with an exercise).
 * The plan generator fills each slot with a real library exercise. The chosen
 * split + sessions/week decides the weekly sequence; 'auto' resolves from days.
 */
export type SplitType = 'auto' | 'fullbody' | 'upper_lower' | 'ppl';
export type SlotRole = 'compound' | 'accessory';

export interface Slot {
	role: SlotRole;
	group: string; // matches exercises.substitutionGroup
}

export interface DayTemplate {
	name: string;
	slots: Slot[];
}

const c = (group: string): Slot => ({ role: 'compound', group });
const a = (group: string): Slot => ({ role: 'accessory', group });

const FULL: DayTemplate = {
	name: 'Full body',
	slots: [c('squat'), c('horiz_press'), c('vert_pull'), c('hinge'), a('lateral_raise'), a('biceps_curl'), a('triceps_ext'), a('calf')]
};
const UPPER: DayTemplate = {
	name: 'Upper',
	slots: [c('horiz_press'), c('horiz_pull'), c('vert_press'), c('vert_pull'), a('lateral_raise'), a('biceps_curl'), a('triceps_ext')]
};
const LOWER: DayTemplate = {
	name: 'Lower',
	slots: [c('squat'), c('hinge'), a('leg_ext'), a('leg_curl'), a('calf'), a('core')]
};
const PUSH: DayTemplate = {
	name: 'Push',
	slots: [c('horiz_press'), c('vert_press'), c('incline_press'), a('triceps_ext'), a('lateral_raise'), a('chest_fly')]
};
const PULL: DayTemplate = {
	name: 'Pull',
	slots: [c('vert_pull'), c('horiz_pull'), a('biceps_curl'), a('rear_delt'), a('core')]
};
const LEGS: DayTemplate = {
	name: 'Legs',
	slots: [c('squat'), c('hinge'), a('leg_ext'), a('leg_curl'), a('calf')]
};

/** Resolve 'auto' to a concrete split based on how many days you train. */
export function resolveSplit(split: SplitType, sessionsPerWeek: number): Exclude<SplitType, 'auto'> {
	if (split !== 'auto') return split;
	if (sessionsPerWeek <= 3) return 'fullbody';
	if (sessionsPerWeek === 4) return 'upper_lower';
	return 'ppl';
}

/** The ordered day templates for one week, length = sessionsPerWeek. */
export function weekTemplates(split: SplitType, sessionsPerWeek: number): DayTemplate[] {
	const resolved = resolveSplit(split, sessionsPerWeek);
	const cycle: DayTemplate[] =
		resolved === 'fullbody' ? [FULL] : resolved === 'upper_lower' ? [UPPER, LOWER] : [PUSH, PULL, LEGS];
	return Array.from({ length: sessionsPerWeek }, (_, i) => cycle[i % cycle.length]);
}
