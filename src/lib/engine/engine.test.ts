/**
 * Engine invariants — the deterministic core "owns every number", so lock its
 * behaviour down. These encode the training rules from the project spec:
 * push to the TOP of the range and stop, ramp-to-top-set with hold-on-miss,
 * double progression with intra-session ease-down, and phase-aware rest.
 */
import { describe, it, expect } from 'vitest';
import {
	roundToIncrement,
	evaluate,
	nextWeight,
	intraSessionAdjust,
	buildPrescription
} from './progression.ts';
import { generateRamp, nextRampWeight, topAchieved, nextTop } from './ramp.ts';
import { restSeconds } from './rest.ts';
import type { ExerciseParams, RepRange, WorkingSet } from './types.ts';

const RANGE: RepRange = { min: 8, max: 12 };
const PARAMS: ExerciseParams = { increment: 5, stallLimit: 2 };

describe('roundToIncrement', () => {
	it('rounds to the nearest increment', () => {
		expect(roundToIncrement(102, 5)).toBe(100);
		expect(roundToIncrement(103, 5)).toBe(105);
		expect(roundToIncrement(87.5, 5)).toBe(90);
	});
	it('never returns below a single increment', () => {
		expect(roundToIncrement(2, 5)).toBe(5);
		expect(roundToIncrement(0, 5)).toBe(5);
		expect(roundToIncrement(-10, 5)).toBe(5);
	});
});

describe('evaluate (double progression)', () => {
	const sets = (...reps: number[]): WorkingSet[] => reps.map((r) => ({ weight: 100, reps: r }));
	it('progresses only when every set reaches the TOP of the range', () => {
		expect(evaluate(sets(12, 12, 12), RANGE)).toBe('progress');
		expect(evaluate(sets(12, 12), RANGE)).toBe('progress');
	});
	it('holds when all sets are in range but not all at the top', () => {
		expect(evaluate(sets(12, 10), RANGE)).toBe('hold');
		expect(evaluate(sets(8, 8), RANGE)).toBe('hold');
	});
	it('stalls when any set drops below the bottom of the range', () => {
		expect(evaluate(sets(12, 7), RANGE)).toBe('stall');
	});
	it('treats an empty session as hold, never progress', () => {
		expect(evaluate([], RANGE)).toBe('hold');
	});
});

describe('nextWeight', () => {
	const s = { weight: 100, consecutiveStalls: 0 };
	it('adds one increment on progress and resets stalls', () => {
		expect(nextWeight(s, [{ weight: 100, reps: 12 }, { weight: 100, reps: 12 }], RANGE, PARAMS)).toEqual({
			weight: 105,
			consecutiveStalls: 0
		});
	});
	it('holds weight on hold', () => {
		expect(nextWeight(s, [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }], RANGE, PARAMS)).toEqual({
			weight: 100,
			consecutiveStalls: 0
		});
	});
	it('counts a stall but keeps the weight until the stall limit', () => {
		expect(nextWeight(s, [{ weight: 100, reps: 5 }], RANGE, PARAMS)).toEqual({
			weight: 100,
			consecutiveStalls: 1
		});
	});
	it('regresses ~10% once the stall limit is hit, and resets the counter', () => {
		const prev = { weight: 100, consecutiveStalls: 1 };
		expect(nextWeight(prev, [{ weight: 100, reps: 5 }], RANGE, PARAMS)).toEqual({
			weight: 90,
			consecutiveStalls: 0
		});
	});
});

describe('intraSessionAdjust (ease-down only)', () => {
	it('leaves the weight unchanged before any sets or while in range', () => {
		expect(intraSessionAdjust(100, [], RANGE, PARAMS)).toBeNull();
		expect(intraSessionAdjust(100, [{ weight: 100, reps: 10 }], RANGE, PARAMS)).toBeNull();
	});
	it('eases down after a set falls below the range', () => {
		const next = intraSessionAdjust(100, [{ weight: 100, reps: 6 }], RANGE, PARAMS);
		expect(next).toBe(95);
	});
	it('never bumps the weight up (user caps at the top)', () => {
		expect(intraSessionAdjust(100, [{ weight: 100, reps: 12 }], RANGE, PARAMS)).toBeNull();
	});
});

describe('buildPrescription', () => {
	it('combines the carried weight with the phase rep range/sets', () => {
		expect(buildPrescription({ weight: 135, consecutiveStalls: 0 }, RANGE, 3, 'accumulation')).toEqual({
			weight: 135,
			reps: RANGE,
			sets: 3,
			phase: 'accumulation'
		});
	});
});

describe('generateRamp', () => {
	it('builds an ascending ramp that ends exactly on the top set', () => {
		const plan = generateRamp(100, 5, 3, 10, 5);
		expect(plan.sets.map((s) => s.weight)).toEqual([80, 90, 100]);
		expect(plan.sets.at(-1)!.weight).toBe(plan.topWeight);
		expect(plan.sets.every((s) => s.repTarget === 5)).toBe(true);
	});
	it('never plans a set above the top weight', () => {
		const plan = generateRamp(100, 5, 4, 40, 5);
		expect(Math.max(...plan.sets.map((s) => s.weight))).toBe(100);
	});
});

describe('nextRampWeight (climb, then hold on a miss)', () => {
	const plan = generateRamp(100, 5, 3, 10, 5); // [80, 90, 100]
	it('starts at the first ramp step', () => {
		expect(nextRampWeight(plan, [])).toBe(80);
	});
	it('climbs to the next step while hitting the target', () => {
		expect(nextRampWeight(plan, [{ weight: 80, reps: 5 }])).toBe(90);
	});
	it('holds the weight the moment a set misses the target', () => {
		expect(nextRampWeight(plan, [{ weight: 80, reps: 5 }, { weight: 90, reps: 4 }])).toBe(90);
	});
	it('returns null once the ramp is complete', () => {
		const done = [
			{ weight: 80, reps: 5 },
			{ weight: 90, reps: 5 },
			{ weight: 100, reps: 5 }
		];
		expect(nextRampWeight(plan, done)).toBeNull();
	});
});

describe('topAchieved', () => {
	it('is the heaviest weight hit at or above the rep target', () => {
		const done = [
			{ weight: 80, reps: 5 },
			{ weight: 90, reps: 5 },
			{ weight: 100, reps: 4 }
		];
		expect(topAchieved(done, 5)).toBe(90);
	});
	it('is 0 when no set reached the target', () => {
		expect(topAchieved([{ weight: 100, reps: 3 }], 5)).toBe(0);
	});
});

describe('nextTop (week-over-week top set)', () => {
	it('advances when the planned top was hit at target reps', () => {
		expect(nextTop(100, 100, 5, 0, 2)).toEqual({ top: 105, verdict: 'advance', consecutiveMisses: 0 });
	});
	it('holds (bridges) on a single near-miss', () => {
		expect(nextTop(100, 95, 5, 0, 2)).toEqual({ top: 100, verdict: 'hold', consecutiveMisses: 1 });
	});
	it('regresses once misses reach the stall limit', () => {
		const r = nextTop(100, 90, 5, 1, 2);
		expect(r.verdict).toBe('regress');
		expect(r.top).toBe(90);
		expect(r.consecutiveMisses).toBe(0);
	});
});

describe('restSeconds (phase- and content-aware)', () => {
	it('rests compounds longer than accessories at the same target', () => {
		const compound = restSeconds({ compound: true, repMax: 8, phase: 'accumulation' });
		const accessory = restSeconds({ compound: false, repMax: 8, phase: 'accumulation' });
		expect(compound).toBeGreaterThan(accessory);
	});
	it('rests longer for heavier (lower-rep) targets', () => {
		const heavy = restSeconds({ compound: true, repMax: 3, phase: 'accumulation' });
		const lighter = restSeconds({ compound: true, repMax: 12, phase: 'accumulation' });
		expect(heavy).toBeGreaterThan(lighter);
	});
	it('rests longest in Intensification, shorter in Deload', () => {
		const base = { compound: true, repMax: 5 } as const;
		expect(restSeconds({ ...base, phase: 'intensification' })).toBeGreaterThan(
			restSeconds({ ...base, phase: 'accumulation' })
		);
		expect(restSeconds({ ...base, phase: 'deload' })).toBeLessThan(
			restSeconds({ ...base, phase: 'accumulation' })
		);
	});
	it('clamps to the 45s–240s range', () => {
		expect(restSeconds({ compound: false, repMax: 20, phase: 'deload' })).toBe(45);
		expect(restSeconds({ compound: true, repMax: 3, phase: 'intensification' })).toBe(240);
	});
});
