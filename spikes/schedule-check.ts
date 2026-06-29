/** Verify the recovery-aware scheduler on the user's case: hockey Tue & Thu. */
import { chooseLiftWeekdays, assignTemplatesToDays, daysUntilNextHockey } from '../src/lib/server/plan/schedule.ts';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hockey = [2, 4]; // Tue, Thu

for (const n of [2, 3, 4]) {
	const days = chooseLiftWeekdays(hockey, n);
	console.log(`\n${n} lift days  ->  ${days.map((d) => DOW[d]).join(', ')}`);
	const cycle =
		n === 3
			? [{ name: 'Push', legLoad: 0 }, { name: 'Pull', legLoad: 0 }, { name: 'Legs', legLoad: 2 }]
			: [{ name: 'Upper', legLoad: 0 }, { name: 'Lower', legLoad: 2 }];
	const templates = Array.from({ length: n }, (_, i) => cycle[i % cycle.length]);
	const assigned = assignTemplatesToDays(days, templates as any, hockey);
	days.forEach((d, i) =>
		console.log(`   ${DOW[d].padEnd(4)} -> ${assigned[i].name.padEnd(6)} (${daysUntilNextHockey(d, hockey)}d before next hockey)`)
	);
}
