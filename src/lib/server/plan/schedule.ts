/**
 * Recovery-aware scheduling. Two jobs:
 *  1. chooseLiftWeekdays — pick which weekdays to lift, given fixed hockey days:
 *     spread lifts apart (no back-to-back), avoid the day BEFORE hockey, and
 *     stay as far from hockey as possible.
 *  2. assignTemplatesToDays — place the week's sessions so leg-heavy days land
 *     farthest from hockey (fresh skating legs), upper days closer.
 *
 * Weekdays are 0=Sun .. 6=Sat. The week is treated as circular so spacing
 * accounts for the roll into next week.
 */

/** Circular distance between two weekdays (0..3). */
export function circDist(a: number, b: number): number {
	const d = Math.abs(a - b);
	return Math.min(d, 7 - d);
}

/** Forward distance from `day` to the next hockey day (1..7; 7 if none). */
export function daysUntilNextHockey(day: number, hockey: number[]): number {
	if (hockey.length === 0) return 7;
	let best = 7;
	for (const h of hockey) {
		let d = (h - day + 7) % 7;
		if (d === 0) d = 7;
		best = Math.min(best, d);
	}
	return best;
}

function kCombinations<T>(arr: T[], k: number): T[][] {
	if (k <= 0) return [[]];
	if (k > arr.length) return [];
	const [first, ...rest] = arr;
	const withFirst = kCombinations(rest, k - 1).map((c) => [first, ...c]);
	const withoutFirst = kCombinations(rest, k);
	return [...withFirst, ...withoutFirst];
}

/** Score a candidate set of lift weekdays. Higher is better, compared lexically. */
function score(combo: number[], hockey: number[]): [number, number, number] {
	// 1) spacing between lift days (avoid back-to-back lifting) — most important.
	let minLiftGap = 7;
	for (let i = 0; i < combo.length; i++)
		for (let j = i + 1; j < combo.length; j++) minLiftGap = Math.min(minLiftGap, circDist(combo[i], combo[j]));
	// 2) distance from hockey (recovery around games).
	let minHockeyGap = 7;
	for (const d of combo) for (const h of hockey) minHockeyGap = Math.min(minHockeyGap, circDist(d, h));
	// 3) fewer lifts landing the day AFTER hockey (carried fatigue).
	const hockeySet = new Set(hockey);
	const dayAfter = combo.filter((d) => hockeySet.has((d + 6) % 7)).length;
	return [minLiftGap, minHockeyGap, -dayAfter];
}

function better(a: [number, number, number], b: [number, number, number]): boolean {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return false;
}

/**
 * Choose `n` lifting weekdays around the given hockey weekdays.
 * Hard-avoids the day immediately before hockey when there's room; relaxes only
 * if there aren't enough days otherwise.
 */
export function chooseLiftWeekdays(hockey: number[], n: number): number[] {
	const all = [0, 1, 2, 3, 4, 5, 6];
	const hockeySet = new Set(hockey);
	const dayBefore = new Set(hockey.map((h) => (h + 6) % 7));

	let candidates = all.filter((d) => !hockeySet.has(d) && !dayBefore.has(d));
	if (candidates.length < n) candidates = all.filter((d) => !hockeySet.has(d));
	if (candidates.length < n) candidates = all;

	const k = Math.min(n, candidates.length);
	let best: number[] = candidates.slice(0, k);
	let bestScore = score(best, hockey);
	for (const combo of kCombinations(candidates, k)) {
		const s = score(combo, hockey);
		if (better(s, bestScore)) {
			best = combo;
			bestScore = s;
		}
	}
	return [...best].sort((a, b) => a - b);
}

/**
 * Assign templates to the chosen lift days so the highest-leg-load session lands
 * on the day with the most room before the next hockey day. Returns templates in
 * the same order as the input `weekdays`/`dates`.
 */
export function assignTemplatesToDays<T extends { legLoad: number }>(
	weekdays: number[],
	templates: T[],
	hockey: number[]
): T[] {
	const slotOrder = weekdays
		.map((wd, i) => ({ i, gap: daysUntilNextHockey(wd, hockey) }))
		.sort((a, b) => b.gap - a.gap); // most room before hockey first
	const byLeg = [...templates].sort((a, b) => b.legLoad - a.legLoad); // heaviest legs first

	const out = new Array<T>(weekdays.length);
	slotOrder.forEach((slot, k) => (out[slot.i] = byLeg[k]));
	return out;
}
