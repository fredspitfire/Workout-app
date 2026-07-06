/**
 * Natural-language plan tweaks (Phase 6). The user types something like
 * "my shoulder's tweaky" or "swap squats for something else" and Claude decides
 * which planned exercises to swap, choosing replacements from each exercise's
 * provided alternatives. Returns null on failure (caller reports "couldn't apply").
 * The engine recomputes the numbers for any swapped exercise.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

const MODEL = 'claude-sonnet-4-6';

export interface TweakExercise {
	plannedId: number;
	name: string;
	role: string;
	day: string;
	options: { id: number; name: string }[];
}
export interface TweakResult {
	swaps: { plannedId: number; newId: number }[];
	summary: string;
}

const SYSTEM = `You adjust a user's workout plan based on a free-text request.
You may ONLY swap exercises: for an exercise you decide to change, pick a replacement from THAT exercise's "options" list (by id). Leave everything else unchanged.
Guidance: interpret intent (e.g. "shoulder's tweaky" -> swap painful overhead/pressing movements for gentler options in their options; "more arms" -> swap an accessory for a biceps/triceps option if present). Make the smallest set of swaps that satisfies the request.
Respond with ONLY JSON: {"swaps":[{"plannedId":N,"newId":N}],"summary":"one short sentence describing what you changed"}. If nothing should change, return an empty swaps array with a summary explaining why.`;

function extractJson(text: string): unknown {
	const s = text.indexOf('{');
	const e = text.lastIndexOf('}');
	if (s === -1 || e === -1) throw new Error('no json');
	return JSON.parse(text.slice(s, e + 1));
}

export async function tweakPlan(request: string, exercises: TweakExercise[]): Promise<TweakResult | null> {
	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return null;
	const client = new Anthropic({ apiKey });

	try {
		const res = await client.messages.create({
			model: MODEL,
			max_tokens: 800,
			system: SYSTEM,
			messages: [{ role: 'user', content: JSON.stringify({ request, exercises }) }]
		});
		const text = res.content
			.filter((c): c is Anthropic.TextBlock => c.type === 'text')
			.map((c) => c.text)
			.join('');
		const parsed = extractJson(text) as { swaps?: { plannedId: number; newId: number }[]; summary?: string };

		// Validate: each swap must reference a real planned exercise and one of its options.
		const byPlanned = new Map(exercises.map((e) => [e.plannedId, new Set(e.options.map((o) => o.id))]));
		const swaps = (parsed.swaps ?? [])
			.map((s) => ({ plannedId: Number(s.plannedId), newId: Number(s.newId) }))
			.filter((s) => byPlanned.get(s.plannedId)?.has(s.newId));

		return { swaps, summary: parsed.summary ?? 'Updated your plan.' };
	} catch (err) {
		console.error('[ai] tweak failed:', err);
		return null;
	}
}
