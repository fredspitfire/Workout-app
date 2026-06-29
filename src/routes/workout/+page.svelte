<script lang="ts">
	import { onDestroy } from 'svelte';
	import { generateRamp, nextRampWeight, intraSessionAdjust } from '$lib/engine';

	let { data } = $props();
	const exercises = data.exercises;

	// Fixed per-exercise plan info (ramp plan / set counts) — not reactive.
	const plans = exercises.map((ex) =>
		ex.type === 'ramp'
			? generateRamp(ex.topWeight, ex.repMax, ex.sets, ex.perSetIncrement ?? ex.increment, ex.increment)
			: null
	);
	const totalSets = exercises.map((ex, i) => (ex.type === 'ramp' ? plans[i]!.sets.length : ex.sets));

	// Reactive logging state.
	let log = $state(
		exercises.map((ex) => ({ done: [] as { weight: number; reps: number }[], complete: false, straightWeight: ex.topWeight }))
	);

	const currentIndex = $derived(log.findIndex((l) => !l.complete));
	const allDone = $derived(currentIndex === -1);

	function suggestedWeight(i: number): number {
		const ex = exercises[i];
		if (ex.type === 'ramp') return nextRampWeight(plans[i]!, log[i].done) ?? plans[i]!.topWeight;
		return log[i].straightWeight;
	}

	// Editable inputs for the active set; reset whenever the active set changes.
	let inputWeight = $state(0);
	let inputReps = $state(0);
	$effect(() => {
		const i = currentIndex;
		if (i === -1) return;
		// depend on how many sets are done so this re-runs after each log
		log[i].done.length;
		inputWeight = suggestedWeight(i);
		inputReps = exercises[i].repMax;
	});

	// Rest timer.
	let rest = $state(0);
	let restTimer: ReturnType<typeof setInterval> | undefined;
	function startRest() {
		clearInterval(restTimer);
		rest = 120;
		restTimer = setInterval(() => {
			rest = Math.max(0, rest - 1);
			if (rest === 0) clearInterval(restTimer);
		}, 1000);
	}
	onDestroy(() => clearInterval(restTimer));

	function logSet() {
		const i = currentIndex;
		if (i === -1) return;
		const ex = exercises[i];
		const w = Number(inputWeight);
		const r = Number(inputReps);
		if (!Number.isFinite(w) || !Number.isFinite(r) || r < 0) return;

		log[i].done = [...log[i].done, { weight: w, reps: r }];

		if (ex.type === 'straight') {
			const adj = intraSessionAdjust(log[i].straightWeight, log[i].done, { min: ex.repMin, max: ex.repMax }, { increment: ex.increment, stallLimit: 2 });
			if (adj !== null) log[i].straightWeight = adj;
		}
		if (log[i].done.length >= totalSets[i]) log[i].complete = true;
		startRest();
	}

	function adjustReps(delta: number) {
		inputReps = Math.max(0, Number(inputReps) + delta);
	}
	function adjustWeight(delta: number) {
		inputWeight = Math.max(0, Number(inputWeight) + delta);
	}

	const payload = $derived(
		JSON.stringify({
			sessionId: data.session.id,
			date: data.session.date,
			exercises: exercises.map((ex, i) => ({ exerciseId: ex.exerciseId, repTarget: ex.repMax, sets: log[i].done }))
		})
	);

	const mins = $derived(Math.floor(rest / 60));
	const secs = $derived(String(rest % 60).padStart(2, '0'));
</script>

<main>
	<header>
		<a class="back" href="/">‹ Today</a>
		<span class="count">{Math.min(currentIndex === -1 ? exercises.length : currentIndex + 1, exercises.length)} / {exercises.length}</span>
	</header>

	{#each exercises as ex, i}
		{@const active = i === currentIndex}
		<section class="card" class:active class:done={log[i].complete} class:upcoming={i > currentIndex && currentIndex !== -1}>
			<div class="ex-head">
				<h2>{ex.name}</h2>
				<span class="target">
					{#if ex.type === 'ramp'}ramp · {ex.repMax} reps{:else}{ex.sets} × {ex.repMin}–{ex.repMax}{/if}
				</span>
			</div>

			<!-- logged sets -->
			{#if log[i].done.length > 0}
				<div class="chips">
					{#each log[i].done as s}
						<span class="set logged" class:miss={s.reps < ex.repMin}>{s.weight}<small>×{s.reps}</small></span>
					{/each}
				</div>
			{/if}

			<!-- active set entry -->
			{#if active && !log[i].complete}
				<div class="entry">
					<div class="field">
						<span class="lbl">Weight</span>
						<div class="stepper">
							<button type="button" onclick={() => adjustWeight(-ex.increment || -5)}>−</button>
							<input type="number" inputmode="decimal" bind:value={inputWeight} />
							<button type="button" onclick={() => adjustWeight(ex.increment || 5)}>+</button>
						</div>
					</div>
					<div class="field">
						<span class="lbl">Reps <em>(target {ex.repMax})</em></span>
						<div class="stepper">
							<button type="button" onclick={() => adjustReps(-1)}>−</button>
							<input type="number" inputmode="numeric" bind:value={inputReps} />
							<button type="button" onclick={() => adjustReps(1)}>+</button>
						</div>
					</div>
					<button type="button" class="primary log" onclick={logSet}>Log set {log[i].done.length + 1}</button>
					{#if ex.type === 'ramp'}
						<p class="hint">Hit {ex.repMax}? Next set climbs. Miss it and the weight holds.</p>
					{/if}
				</div>
			{/if}
		</section>
	{/each}

	{#if rest > 0}
		<div class="rest">Rest {mins}:{secs}</div>
	{/if}

	<form method="POST" action="?/finish">
		<input type="hidden" name="payload" value={payload} />
		<button type="submit" class="primary finish" class:ready={allDone}>
			{allDone ? 'Finish workout ✓' : 'Finish early'}
		</button>
	</form>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 16px 16px 120px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.back {
		color: var(--accent-2);
		text-decoration: none;
		font-size: 15px;
	}
	.count {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		transition: opacity 0.2s;
	}
	.card.upcoming {
		opacity: 0.5;
	}
	.card.active {
		border-color: var(--accent);
	}
	.card.done .ex-head h2::after {
		content: ' ✓';
		color: var(--success);
	}
	.ex-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		font-size: 17px;
		font-weight: 600;
	}
	.target {
		color: var(--muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	.set {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 8px 10px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.set small {
		color: var(--muted);
		font-weight: 500;
		margin-left: 2px;
	}
	.set.logged {
		border-color: var(--success);
	}
	.set.miss {
		border-color: var(--warning);
		color: var(--warning);
	}
	.entry {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.lbl {
		font-size: 13px;
		color: var(--muted);
	}
	.lbl em {
		font-style: normal;
		opacity: 0.7;
	}
	.stepper {
		display: flex;
		gap: 8px;
	}
	.stepper button {
		width: 56px;
		height: 56px;
		font-size: 24px;
		flex: 0 0 auto;
	}
	.stepper input {
		flex: 1;
		min-width: 0;
		height: 56px;
		text-align: center;
		font-size: 22px;
		font-weight: 700;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.log {
		height: 56px;
		font-size: 17px;
	}
	.hint {
		color: var(--muted);
		font-size: 12px;
		margin: 0;
		text-align: center;
	}
	.rest {
		position: sticky;
		bottom: 84px;
		align-self: center;
		background: var(--surface-2);
		border: 1px solid var(--accent);
		color: var(--accent-2);
		padding: 8px 18px;
		border-radius: 999px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.finish {
		height: 56px;
		font-size: 17px;
		background: var(--surface-2);
		border-color: var(--border);
		color: var(--text);
	}
	.finish.ready {
		background: var(--success);
		border-color: var(--success);
		color: #06210f;
		font-weight: 700;
	}
</style>
