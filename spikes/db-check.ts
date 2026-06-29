/** Dev utility: dump a quick snapshot of the local SQLite database. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const tables = await c.execute(
	"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
console.log('Tables:', tables.rows.map((x) => x.name).join(', '));

const profile = await c.execute('SELECT current_goal, sessions_per_week, time_budget_min, experience FROM profile');
console.log('Profile:', profile.rows[0] ?? '(none)');

const commitments = await c.execute('SELECT label, weekday FROM recurring_commitments ORDER BY weekday');
console.log('Commitments:', commitments.rows.map((r) => `${r.label}:${r.weekday}`).join(', ') || '(none)');

const counts = await c.execute('SELECT (SELECT count(*) FROM exercises) AS ex, (SELECT count(*) FROM equipment) AS eq');
console.log('Library:', `${counts.rows[0].ex} exercises, ${counts.rows[0].eq} equipment`);
