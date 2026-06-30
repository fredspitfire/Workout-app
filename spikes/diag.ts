/** Diagnostic: show the current plan's prescribed set counts per exercise. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });
const rows = await c.execute(
	`SELECT s.date, e.name, px.prescription_type AS type, px.sets
	 FROM planned_exercises px
	 JOIN planned_sessions s ON s.id = px.session_id
	 JOIN exercises e ON e.id = px.exercise_id
	 JOIN blocks b ON b.id = s.block_id AND b.status = 'active'
	 ORDER BY s.date, px.order_index`
);
for (const r of rows.rows) {
	console.log(`  ${String(r.date)}  ${String(r.name).padEnd(28)} ${r.type}  ${r.sets} sets`);
}
