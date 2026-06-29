/** Build a realistic "finished workout" payload for a session and write it to a
 *  file, so we can POST it to the finish action in a test. Usage: tsx sim-finish.ts <sessionId> <outFile> */
import { writeFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { generateRamp } from '../src/lib/engine/index.ts';

const sid = Number(process.argv[2] ?? 9);
const out = process.argv[3] ?? './data/_payload.json';
const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const sess = await c.execute({ sql: 'SELECT date FROM planned_sessions WHERE id = ?', args: [sid] });
const rows = await c.execute({
	sql: `SELECT px.exercise_id, px.prescription_type AS type, px.top_weight, px.rep_max, px.sets, px.per_set_increment, e.default_increment AS inc
	      FROM planned_exercises px JOIN exercises e ON e.id = px.exercise_id WHERE px.session_id = ? ORDER BY px.order_index`,
	args: [sid]
});

const exercises = rows.rows.map((r) => {
	const top = Number(r.top_weight);
	const repMax = Number(r.rep_max);
	const sets = Number(r.sets);
	const inc = Number(r.inc) || 5;
	let logged;
	if (r.type === 'ramp') {
		const plan = generateRamp(top, repMax, sets, Number(r.per_set_increment) || inc, inc);
		logged = plan.sets.map((s) => ({ weight: s.weight, reps: repMax })); // hit target on every ramp set
	} else {
		logged = Array.from({ length: sets }, () => ({ weight: top, reps: repMax }));
	}
	return { exerciseId: Number(r.exercise_id), repTarget: repMax, sets: logged };
});

const payload = { sessionId: sid, date: String(sess.rows[0].date), exercises };
writeFileSync(out, JSON.stringify(payload));
console.log(`wrote ${out} (${exercises.length} exercises)`);
