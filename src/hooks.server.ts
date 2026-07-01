/**
 * Server bootstrap. Runs once when the SvelteKit server module loads (not during
 * build/prerender). We use it to start the nightly SQLite backup timer — the local
 * db file is the owner's entire training history, so it must be protected.
 */
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { startBackupScheduler } from '$lib/server/backup';
import type { HandleServerError } from '@sveltejs/kit';

if (!building) {
	startBackupScheduler({
		databaseUrl: env.DATABASE_URL ?? 'file:./data/coach.db',
		backupDir: env.BACKUP_DIR || undefined,
		retention: env.BACKUP_RETENTION ? Number(env.BACKUP_RETENTION) : undefined,
		hour: env.BACKUP_HOUR ? Number(env.BACKUP_HOUR) : undefined
	});
}

/**
 * Central error monitoring. SvelteKit calls this for any unexpected server error
 * (thrown in a load/action, not an explicit `error()`/`fail()`/`redirect()`). We log
 * it with a short reference id + request context, and hand the client a safe message
 * plus that id — so a stack trace never leaks, but the user can quote the code.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = Math.random().toString(36).slice(2, 8);
	console.error(
		`[error ${id}] ${event.request.method} ${event.url.pathname} (${status}) ${message}`,
		error
	);
	return {
		message: status >= 500 ? 'Something went wrong on our end.' : message,
		id
	};
};
