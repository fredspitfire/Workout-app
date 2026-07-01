/**
 * Server bootstrap. Runs once when the SvelteKit server module loads (not during
 * build/prerender). We use it to start the nightly SQLite backup timer — the local
 * db file is the owner's entire training history, so it must be protected.
 */
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { startBackupScheduler } from '$lib/server/backup';

if (!building) {
	startBackupScheduler({
		databaseUrl: env.DATABASE_URL ?? 'file:./data/coach.db',
		backupDir: env.BACKUP_DIR || undefined,
		retention: env.BACKUP_RETENTION ? Number(env.BACKUP_RETENTION) : undefined,
		hour: env.BACKUP_HOUR ? Number(env.BACKUP_HOUR) : undefined
	});
}
