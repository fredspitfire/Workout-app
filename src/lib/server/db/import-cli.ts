/**
 * CLI: import the JEFIT CSV sitting in ./Jefit Data into the local database.
 * Run with `npm run import:jefit`. Uses its own libsql client (runs outside
 * SvelteKit, so no $env here).
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from './schema.ts';
import { importJefitCsv } from '../import/importJefit.ts';

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' }), {
	schema
});

const dir = join(process.cwd(), 'Jefit Data');
const file = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.csv'));
if (!file) throw new Error(`No .csv found in ${dir}`);

console.log(`Importing ${file} ...`);
const r = await importJefitCsv(db, readFileSync(join(dir, file), 'utf8'));
console.log(
	`Done. ${r.entries} exercise-sessions → ${r.setsInserted} sets, ` +
		`${r.exercisesCreated} new exercises created, ${r.statesSeeded} working weights seeded.`
);
