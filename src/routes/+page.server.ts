import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.id, 1));
	// No profile yet → first run, send them through setup.
	if (!profile) throw redirect(303, '/setup');
	return { profile };
};
