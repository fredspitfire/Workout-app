/** Dev utility: clear app-logged sets and reset all planned sessions to 'planned'
 *  (a clean slate for testing the logging flow). Does not touch JEFIT history. */
import { createClient } from '@libsql/client';

const c = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' });
await c.execute("DELETE FROM logged_sets WHERE source = 'app'");
await c.execute("UPDATE planned_sessions SET status = 'planned'");
console.log('Cleared app-logged sets and reset session statuses.');
