/**
 * CLI: take a one-off SQLite backup now. Run with `npm run db:backup`.
 * Handy for manual snapshots before risky changes, or from an external cron.
 * Runs outside SvelteKit, so it reads process.env directly (no $env).
 */
import { runBackup } from '../backup.ts';

const r = await runBackup({
	databaseUrl: process.env.DATABASE_URL ?? 'file:./data/coach.db',
	backupDir: process.env.BACKUP_DIR || undefined,
	retention: process.env.BACKUP_RETENTION ? Number(process.env.BACKUP_RETENTION) : undefined
});

console.log(
	`Backup written: ${r.file} (${(r.bytes / 1024).toFixed(0)} KB)` +
		(r.pruned.length ? `; pruned ${r.pruned.length} old snapshot(s)` : '')
);
