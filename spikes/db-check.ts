/** Dev utility: dump a quick snapshot of the local SQLite database. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const tables = await c.execute(
	"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
console.log('Tables:', tables.rows.map((x) => x.name).join(', '));

const profile = await c.execute('SELECT current_goal, split_type, sessions_per_week, time_budget_min, experience FROM profile');
console.log('Profile:', profile.rows[0] ?? '(none)');

const commitments = await c.execute('SELECT label, weekday FROM recurring_commitments ORDER BY weekday');
console.log('Commitments:', commitments.rows.map((r) => `${r.label}:${r.weekday}`).join(', ') || '(none)');

const counts = await c.execute('SELECT (SELECT count(*) FROM exercises) AS ex, (SELECT count(*) FROM equipment) AS eq, (SELECT count(*) FROM logged_sets) AS sets');
console.log('Library:', `${counts.rows[0].ex} exercises, ${counts.rows[0].eq} equipment, ${counts.rows[0].sets} logged sets`);

const anchors = await c.execute(
	"SELECT e.name, s.current_top, s.last_rep_target FROM exercise_state s JOIN exercises e ON e.id = s.exercise_id WHERE e.name IN ('Barbell Squat','Barbell Bench Press','Barbell Deadlift','Barbell Bent Over Row','Barbell Standing Military Press') ORDER BY e.name"
);
console.log('Seeded working weights:');
for (const r of anchors.rows) console.log(`   ${String(r.name).padEnd(32)} top ${r.current_top} x${r.last_rep_target}`);

const blocks = await c.execute("SELECT id, goal, status, current_phase FROM blocks");
console.log('Blocks:', blocks.rows.map((r) => `#${r.id} ${r.goal}/${r.status}/${r.current_phase}`).join(', ') || '(none)');
const ps = await c.execute('SELECT id, date, phase FROM planned_sessions ORDER BY date');
console.log('Planned sessions:', ps.rows.map((r) => `${r.date}(${r.phase})`).join(', ') || '(none)');
const pe = await c.execute('SELECT count(*) AS n FROM planned_exercises');
console.log('Planned exercises total:', pe.rows[0].n);
const peByGroup = await c.execute(
	'SELECT s.date, e.name FROM planned_exercises px JOIN planned_sessions s ON s.id = px.session_id JOIN exercises e ON e.id = px.exercise_id ORDER BY s.date, px.order_index LIMIT 8'
);
console.log('Sample prescriptions:', peByGroup.rows.map((r) => `${r.date}:${r.name}`).join(' | ') || '(none)');
