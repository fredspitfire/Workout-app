/**
 * Database connection. Server-only ($lib/server is never bundled to the client).
 * Single local SQLite file via libsql — trivial to back up (just copy the file).
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { env } from '$env/dynamic/private';
import * as schema from './schema.ts';

const url = env.DATABASE_URL ?? 'file:./data/coach.db';

const client = createClient({ url });

export const db = drizzle(client, { schema });
export { schema };
