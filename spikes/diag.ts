/** Diagnostic: library size + breakdown by equipment type and a muscle sample. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });

const total = await c.execute('SELECT count(*) AS n FROM exercises');
console.log('Total exercises:', total.rows[0].n);

const byEquip = await c.execute('SELECT equipment_type, count(*) AS n FROM exercises GROUP BY equipment_type ORDER BY n DESC');
console.log('By equipment:');
for (const r of byEquip.rows) console.log(`  ${String(r.equipment_type).padEnd(12)} ${r.n}`);

const bySource = await c.execute('SELECT source, count(*) AS n FROM exercises GROUP BY source');
console.log('By source:', bySource.rows.map((r) => `${r.source}:${r.n}`).join(', '));

const sample = await c.execute("SELECT name, equipment_type, primary_muscle, is_compound FROM exercises WHERE source='catalog' AND equipment_type='barbell' LIMIT 5");
console.log('Sample barbell catalog exercises:');
for (const r of sample.rows) console.log(`  ${String(r.name).padEnd(36)} ${r.primary_muscle} compound=${r.is_compound}`);
