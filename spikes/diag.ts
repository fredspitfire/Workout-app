/** Diagnostic: active block phase/week + the Squat prescription (to watch progression). */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const b = await c.execute("SELECT id, current_phase, current_week_index FROM blocks WHERE status='active'");
const blk = b.rows[0];
console.log(blk ? `Block #${blk.id}  phase=${blk.current_phase}  week=${blk.current_week_index}` : 'no active block');

const ph = await c.execute('SELECT phase, target_sessions, banked_sessions, actual_weeks FROM block_phases ORDER BY order_index');
console.log('Phases:', ph.rows.map((r) => `${r.phase}(bank ${r.banked_sessions}/${r.target_sessions},wk ${r.actual_weeks})`).join('  '));

const sq = await c.execute(
	`SELECT px.top_weight, px.rep_min, px.rep_max, px.sets FROM planned_exercises px
	 JOIN exercises e ON e.id = px.exercise_id WHERE e.name = 'Barbell Squat' LIMIT 1`
);
const r = sq.rows[0];
console.log(r ? `Squat: top ${r.top_weight} x ${r.rep_min}-${r.rep_max}, ${r.sets} sets` : 'no squat this week');
