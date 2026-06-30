/**
 * Engine-managed rest periods (replicating JEFIT Adaptive's behavior).
 * Rest is prescribed, not fixed: longer for heavy/low-rep compound work, shorter
 * for higher-rep accessory work, and stretched in the heaviest phase.
 */
import type { Phase } from './types.ts';

export interface RestInput {
	compound: boolean;
	repMax: number; // top of the prescribed range (the heavier the target, the lower this is)
	phase: Phase;
}

/** Prescribed rest in seconds, clamped to a sane 45s–4min range. */
export function restSeconds({ compound, repMax, phase }: RestInput): number {
	let rest = compound ? 150 : 75; // base: compounds rest more than accessories

	// Rep target: fewer reps (heavier) → more rest.
	if (repMax <= 3) rest += 60;
	else if (repMax <= 5) rest += 30;
	else if (repMax <= 8) rest += 0;
	else if (repMax <= 12) rest -= 15;
	else rest -= 30;

	// Phase: heaviest week rests longmost; easier weeks shorter.
	const byPhase: Record<Phase, number> = {
		onramp: -15,
		accumulation: 0,
		intensification: 30,
		deload: -30
	};
	rest += byPhase[phase];

	return Math.max(45, Math.min(240, rest));
}
