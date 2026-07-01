/**
 * Nightly SQLite backups. The whole database is one file, so a consistent snapshot is
 * just `VACUUM INTO <file>` — SQLite writes a fresh, fully-consistent copy even if the
 * app is mid-write (single-user, but correct regardless), and it also compacts.
 *
 * Kept deliberately env-free so the same code serves the SvelteKit server
 * (hooks.server.ts, scheduled) and a plain `tsx` CLI (`npm run db:backup`, one-off).
 */
import { createClient } from '@libsql/client';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface BackupOptions {
	/** libsql url, e.g. `file:./data/coach.db`. Only local `file:` dbs are backed up. */
	databaseUrl: string;
	/** Where snapshots land. Default: a `backups/` dir next to the db file. */
	backupDir?: string;
	/** Keep this many most-recent snapshots; older ones are pruned. Default 14. */
	retention?: number;
}

export interface BackupResult {
	file: string;
	bytes: number;
	pruned: string[];
}

const PREFIX = 'coach-';
const SUFFIX = '.db';

/** Local file path behind a libsql url, or null if it isn't a local `file:` database. */
export function databaseFilePath(url: string): string | null {
	if (!url.startsWith('file:')) return null;
	return url.slice('file:'.length); // libsql resolves `file:./x` relative to cwd
}

function defaultBackupDir(dbPath: string): string {
	return join(dirname(dbPath), 'backups');
}

/** Filesystem-safe, lexically-sortable timestamp: 2026-07-01T03-00-00 */
function stamp(d = new Date()): string {
	return d.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

/** Take one consistent snapshot and prune old ones. Throws on non-file databases. */
export async function runBackup(opts: BackupOptions): Promise<BackupResult> {
	const dbPath = databaseFilePath(opts.databaseUrl);
	if (!dbPath) {
		throw new Error(`Backups only support local file: databases (got "${opts.databaseUrl}")`);
	}
	const dir = opts.backupDir ?? defaultBackupDir(dbPath);
	const retention = opts.retention ?? 14;

	await mkdir(dir, { recursive: true });
	const outFile = join(dir, `${PREFIX}${stamp()}${SUFFIX}`);

	const client = createClient({ url: opts.databaseUrl });
	try {
		// The filename in VACUUM INTO must be an inline literal (no bound params);
		// escape any single quotes for a safe SQLite string literal.
		await client.execute(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
	} finally {
		client.close();
	}

	const { size } = await stat(outFile);
	const pruned = await pruneBackups(dir, retention);
	return { file: outFile, bytes: size, pruned };
}

/** Delete all but the newest `retention` snapshots. Returns the deleted filenames. */
export async function pruneBackups(dir: string, retention: number): Promise<string[]> {
	let names: string[];
	try {
		names = (await readdir(dir)).filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX));
	} catch {
		return [];
	}
	names.sort(); // timestamped names sort chronologically
	const toDelete = names.slice(0, Math.max(0, names.length - retention));
	for (const name of toDelete) {
		await unlink(join(dir, name)).catch(() => {});
	}
	return toDelete;
}

/** Age (ms) of the most recent snapshot, or null if there are none. */
async function newestBackupAgeMs(dir: string): Promise<number | null> {
	let names: string[];
	try {
		names = (await readdir(dir)).filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX));
	} catch {
		return null;
	}
	if (names.length === 0) return null;
	let newest = 0;
	for (const name of names) {
		const s = await stat(join(dir, name));
		newest = Math.max(newest, s.mtimeMs);
	}
	return Date.now() - newest;
}

export interface SchedulerOptions extends BackupOptions {
	/** Local hour of day to run the nightly backup (0–23). Default 3 (3am). */
	hour?: number;
	log?: (msg: string) => void;
	onError?: (err: unknown) => void;
}

let started = false;

/**
 * Start the nightly backup timer. Idempotent (safe under dev HMR / double import).
 * Also makes a catch-up snapshot at boot if the last one is missing or stale, so a
 * box that was powered off overnight still gets protected.
 */
export function startBackupScheduler(opts: SchedulerOptions): void {
	if (started) return;
	started = true;

	const log = opts.log ?? ((m: string) => console.log(`[backup] ${m}`));
	const fail = opts.onError ?? ((e: unknown) => console.error('[backup] failed:', e));
	const hour = opts.hour ?? 3;

	const dbPath = databaseFilePath(opts.databaseUrl);
	if (!dbPath) {
		log(`disabled: "${opts.databaseUrl}" is not a local file: database`);
		return;
	}
	const dir = opts.backupDir ?? defaultBackupDir(dbPath);

	const tick = async () => {
		try {
			const r = await runBackup(opts);
			log(
				`wrote ${basename(r.file)} (${(r.bytes / 1024).toFixed(0)} KB)` +
					(r.pruned.length ? `, pruned ${r.pruned.length}` : '')
			);
		} catch (e) {
			fail(e);
		}
	};

	const scheduleNext = () => {
		const now = new Date();
		const next = new Date(now);
		next.setHours(hour, 0, 0, 0);
		if (next <= now) next.setDate(next.getDate() + 1);
		const ms = next.getTime() - now.getTime();
		log(`next backup at ${next.toISOString()} (in ${(ms / 3_600_000).toFixed(1)}h)`);
		const t = setTimeout(async () => {
			await tick();
			scheduleNext();
		}, ms);
		t.unref?.(); // don't keep the process alive just for the timer
	};

	// Boot catch-up: snapshot now if there's nothing from roughly the last day.
	void (async () => {
		try {
			const age = await newestBackupAgeMs(dir);
			if (age === null || age > 20 * 3_600_000) {
				log(age === null ? 'no existing backup — creating one now' : 'last backup is stale — creating one now');
				await tick();
			}
		} catch (e) {
			fail(e);
		}
	})();

	scheduleNext();
}
