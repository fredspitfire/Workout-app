/**
 * Remove catalog exercises that duplicate one of the user's own lifts (JEFIT) or
 * the seed. Matches on a normalized BASE name — lowercased, with grip/variation
 * suffixes ("- Medium Grip"), parentheticals, and punctuation stripped — so
 * "Barbell Bench Press - Medium Grip" is treated as a dup of "Barbell Bench Press".
 * Keeps the user's version (it has history). Reversible via `npm run import:catalog`.
 *
 * Dry run by default; pass `delete` to actually remove. `npm run dedup:catalog [delete]`
 */
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { inArray } from 'drizzle-orm';
import * as schema from './schema.ts';
import { baseKey } from './exerciseName.ts';

const db = drizzle(createClient({ url: process.env.DATABASE_URL ?? 'file:./data/coach.db' }), {
	schema
});

const all = await db.select().from(schema.exercises);

// Keys owned by the user's lifts / seed (these win).
const keep = new Set<string>();
for (const e of all) if (e.source !== 'catalog') keep.add(baseKey(e.name));

const dupes = all.filter((e) => e.source === 'catalog' && keep.has(baseKey(e.name)));

console.log(`Catalog duplicates of your lifts: ${dupes.length}`);
for (const d of dupes.slice(0, 40)) console.log(`  ${d.name}  ->  matches "${baseKey(d.name)}"`);
if (dupes.length > 40) console.log(`  ...and ${dupes.length - 40} more`);

if (process.argv[2] === 'delete' && dupes.length > 0) {
	const ids = dupes.map((d) => d.id);
	for (let i = 0; i < ids.length; i += 100) await db.delete(schema.exercises).where(inArray(schema.exercises.id, ids.slice(i, i + 100)));
	console.log(`\nDeleted ${ids.length} duplicate catalog exercises.`);
} else if (dupes.length > 0) {
	console.log(`\nDry run. Re-run with: npm run dedup:catalog delete`);
}
