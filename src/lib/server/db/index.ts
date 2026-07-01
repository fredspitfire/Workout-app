/**
 * Database connection. Server-only ($lib/server is never bundled to the client).
 * Single local SQLite file via libsql — trivial to back up (just copy the file).
 *
 * The connection is opened LAZILY on first use — never at module import. SvelteKit's
 * `vite build` postbuild step imports every server module to analyse it; opening the
 * DB there would fail in any environment where the file/dir doesn't exist yet (e.g.
 * a fresh build container), so we defer `createClient` until an actual query runs.
 */
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';
import * as schema from './schema.ts';

const url = env.DATABASE_URL ?? 'file:./data/coach.db';

let client: Client | undefined;
let instance: LibSQLDatabase<typeof schema> | undefined;

function getDb(): LibSQLDatabase<typeof schema> {
	if (!instance) {
		client = createClient({ url });
		instance = drizzle(client, { schema });
	}
	return instance;
}

/** Drizzle db handle. Transparently connects on first property access. */
export const db = new Proxy({} as LibSQLDatabase<typeof schema>, {
	get(_target, prop) {
		const real = getDb() as unknown as Record<string | symbol, unknown>;
		const value = real[prop];
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

export { schema };
