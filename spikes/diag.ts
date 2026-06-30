/** Diagnostic: for the next planned session, show each exercise and how many
 *  history dates it has — to spot exercises whose history is under a different name. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const sessions = await c.execute('SELECT id, date FROM planned_sessions ORDER BY date');
for (const s of sessions.rows) {
	console.log(`\nsession ${s.id} (${s.date})`);
	const ex = await c.execute({
		sql: `SELECT e.name,
		             (SELECT count(DISTINCT date) FROM logged_sets WHERE exercise_id = e.id) AS hist_dates
		      FROM planned_exercises px JOIN exercises e ON e.id = px.exercise_id
		      WHERE px.session_id = ? ORDER BY px.order_index`,
		args: [s.id]
	});
	for (const r of ex.rows) {
		const flag = Number(r.hist_dates) === 0 ? '  <-- NO HISTORY' : '';
		console.log(`  ${String(r.name).padEnd(30)} hist_days=${String(r.hist_dates).padEnd(4)}${flag}`);
	}
}
