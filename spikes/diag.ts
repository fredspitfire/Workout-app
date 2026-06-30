/** Diagnostic: equipment availability + the plan's exercises with their equipment. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const eq = await c.execute('SELECT type, available FROM equipment ORDER BY type');
console.log('Equipment:', eq.rows.map((r) => `${r.type}=${r.available ? 'yes' : 'no'}`).join(', '));

const rows = await c.execute(
	`SELECT s.date, e.name, e.equipment_type
	 FROM planned_exercises px
	 JOIN planned_sessions s ON s.id = px.session_id
	 JOIN exercises e ON e.id = px.exercise_id
	 JOIN blocks b ON b.id = s.block_id AND b.status = 'active'
	 ORDER BY s.date, px.order_index`
);
console.log('Planned exercises:');
for (const r of rows.rows) console.log(`  ${String(r.date)}  ${String(r.name).padEnd(26)} [${r.equipment_type}]`);
