/**
 * AI exercise selection (Phase 6). Claude picks WHICH exercise fills each slot,
 * from an equipment-matched candidate pool, preferring the user's real lifts and
 * keeping variety/balance. The deterministic engine still owns every weight, rep,
 * set, and rest number — the AI only chooses exercises. Returns null on any
 * failure so the caller can fall back to deterministic selection.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

const MODEL = 'claude-sonnet-4-6';

export interface Candidate {
	id: number;
	name: string;
	history: boolean; // user has logged this lift before
	compound: boolean;
}
export interface DayPlan {
	label: string;
	slots: { role: 'compound' | 'accessory'; target: string; options: Candidate[] }[];
}

const SYSTEM = `You select strength-training exercises. For each slot you are given candidate exercises; choose exactly ONE candidate id per slot.
Rules:
- Strongly prefer candidates with "history": true (the user already trains these).
- Match the slot's role (compound vs accessory) when possible.
- No exercise twice in the same day; vary sensibly across days.
- Only choose from the provided candidate ids.
Respond with ONLY a JSON object: {"days": [[id, id, ...], ...]} where each inner array gives the chosen exercise id per slot, in slot order, for that day (same order as the input days/slots).`;

function extractJson(text: string): unknown {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1) throw new Error('no json');
	return JSON.parse(text.slice(start, end + 1));
}

/** Returns per-day arrays of chosen exercise ids (slot order), or null on failure. */
export async function selectExercises(
	goal: string,
	phase: string,
	days: DayPlan[]
): Promise<number[][] | null> {
	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) return null;

	const client = new Anthropic({ apiKey });
	const payload = { goal, phase, days };

	try {
		const res = await client.messages.create({
			model: MODEL,
			max_tokens: 1500,
			system: SYSTEM,
			messages: [{ role: 'user', content: JSON.stringify(payload) }]
		});
		const text = res.content
			.filter((c): c is Anthropic.TextBlock => c.type === 'text')
			.map((c) => c.text)
			.join('');
		const parsed = extractJson(text) as { days?: number[][] };
		if (!parsed.days || !Array.isArray(parsed.days)) return null;
		return parsed.days.map((d) => (Array.isArray(d) ? d.map(Number) : []));
	} catch (err) {
		console.error('[ai] exercise selection failed, falling back to deterministic:', err);
		return null;
	}
}
