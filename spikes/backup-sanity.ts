import { runBackup } from '../src/lib/server/backup.ts';
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const toUrl = (p: string) => 'file:' + p.split('\\').join('/');

const work = mkdtempSync(join(tmpdir(), 'bk-'));
const dbFile = join(work, 'coach.db');
const url = toUrl(dbFile);

const c = createClient({ url });
await c.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
await c.execute("INSERT INTO t (v) VALUES ('hello'), ('world')");
c.close();

const bdir = join(work, 'backups');

// Retention: 5 runs, keep 3. Open nothing so no OS locks interfere with prune.
let last!: Awaited<ReturnType<typeof runBackup>>;
for (let i = 0; i < 5; i++) {
	if (i > 0) await new Promise((res) => setTimeout(res, 1100));
	last = await runBackup({ databaseUrl: url, backupDir: bdir, retention: 3 });
}
const snaps = readdirSync(bdir).filter((f) => f.startsWith('coach-') && f.endsWith('.db'));
console.log('snapshots after prune (expect 3):', snaps.length);

// Now verify the newest snapshot is a real, consistent database.
const v = createClient({ url: toUrl(last.file) });
const rows = await v.execute('SELECT count(*) AS n FROM t');
console.log('rows in snapshot (expect 2):', rows.rows[0].n);
v.close();

// non-file url should be rejected
let rejected = false;
try {
	await runBackup({ databaseUrl: 'libsql://remote.example' });
} catch {
	rejected = true;
}
console.log('rejected remote url (expect true):', rejected);

try {
	rmSync(work, { recursive: true, force: true });
} catch {
	/* Windows may still hold a lock on freshly-opened snapshot sidecars; ignore. */
}
console.log('OK');
