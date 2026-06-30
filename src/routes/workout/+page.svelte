<script lang="ts">
	import { onDestroy } from 'svelte';
	import { generateRamp, nextRampWeight, intraSessionAdjust } from '$lib/engine';

	let { data } = $props();
	const exercises = data.exercises;
	const n = exercises.length;

	const plans = exercises.map((ex) =>
		ex.type === 'ramp'
			? generateRamp(ex.topWeight, ex.repMax, ex.sets, ex.perSetIncrement ?? ex.increment, ex.increment)
			: null
	);
	const totalSets = exercises.map((ex, i) => (ex.type === 'ramp' ? plans[i]!.sets.length : ex.sets));

	let log = $state(
		exercises.map((ex) => ({ done: [] as { weight: number; reps: number }[], complete: false, straightWeight: ex.topWeight }))
	);

	// Which exercise is on screen (one at a time). Starts on the first to do.
	let view = $state(0);
	const allDone = $derived(log.every((l) => l.complete));

	// Horizontal slide state (live finger-follow + slide-in on change).
	let dragX = $state(0);
	let dragging = $state(false);

	function goTo(i: number) {
		if (i < 0 || i >= n || i === view) {
			dragX = 0;
			return;
		}
		const dir = i > view ? 1 : -1;
		view = i;
		dragX = dir * 360; // new card starts off-screen, then slides to centre
		requestAnimationFrame(() => requestAnimationFrame(() => (dragX = 0)));
	}

	function suggestedWeight(i: number): number {
		const ex = exercises[i];
		if (ex.type === 'ramp') return nextRampWeight(plans[i]!, log[i].done) ?? plans[i]!.topWeight;
		return log[i].straightWeight;
	}

	let inputWeight = $state(0);
	let inputReps = $state(0);
	$effect(() => {
		const i = view;
		log[i].done.length; // re-run after each logged set
		inputWeight = suggestedWeight(i);
		inputReps = exercises[i].repMax;
	});

	// Rest timer (engine-prescribed seconds).
	let rest = $state(0);
	let restTimer: ReturnType<typeof setInterval> | undefined;
	function startRest(seconds: number) {
		clearInterval(restTimer);
		rest = seconds;
		restTimer = setInterval(() => {
			rest = Math.max(0, rest - 1);
			if (rest === 0) clearInterval(restTimer);
		}, 1000);
	}
	onDestroy(() => clearInterval(restTimer));
	const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

	// Previous-sessions history for the current exercise.
	let showHistory = $state(false);
	function dayName(date: string) {
		return new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
	const histCompact = (sets: { weight: number; reps: number }[]) =>
		sets.map((s) => `${s.weight}×${s.reps}`).join(', ');

	function logSet() {
		const i = view;
		const ex = exercises[i];
		const w = Number(inputWeight);
		const r = Number(inputReps);
		if (!Number.isFinite(w) || !Number.isFinite(r) || r < 0) return;

		log[i].done = [...log[i].done, { weight: w, reps: r }];
		if (ex.type === 'straight') {
			const adj = intraSessionAdjust(log[i].straightWeight, log[i].done, { min: ex.repMin, max: ex.repMax }, { increment: ex.increment, stallLimit: 2 });
			if (adj !== null) log[i].straightWeight = adj;
		}
		if (log[i].done.length >= totalSets[i]) {
			log[i].complete = true;
			startRest(ex.restSeconds ?? 120);
			// Auto-advance to the next unfinished exercise.
			const next = log.findIndex((l) => !l.complete);
			if (next !== -1) setTimeout(() => goTo(next), 350);
		} else {
			startRest(ex.restSeconds ?? 120);
		}
	}

	function adjustReps(d: number) {
		inputReps = Math.max(0, Number(inputReps) + d);
	}
	function adjustWeight(d: number) {
		inputWeight = Math.max(0, Number(inputWeight) + d);
	}

	// Swipe between exercises — card follows the finger, then snaps/slides.
	let startX = 0;
	function onTouchStart(e: TouchEvent) {
		startX = e.changedTouches[0].clientX;
		dragging = true;
	}
	function onTouchMove(e: TouchEvent) {
		if (dragging) dragX = e.changedTouches[0].clientX - startX;
	}
	function onTouchEnd() {
		dragging = false;
		const dx = dragX;
		if (dx < -60) goTo(view + 1);
		else if (dx > 60) goTo(view - 1);
		else dragX = 0; // not far enough — snap back
	}

	const payload = $derived(
		JSON.stringify({
			sessionId: data.session.id,
			date: data.session.date,
			exercises: exercises.map((ex, i) => ({ exerciseId: ex.exerciseId, repTarget: ex.repMax, sets: log[i].done }))
		})
	);

	const ex = $derived(exercises[view]);
	const st = $derived(log[view]);
</script>

<main>
	<header>
		<a class="back" href="/">‹ Today</a>
		<span class="count">{view + 1} / {n}</span>
	</header>

	<div class="dots">
		{#each exercises as _, i}
			<button class="dot" class:active={i === view} class:done={log[i].complete} aria-label={`exercise ${i + 1}`} onclick={() => goTo(i)}></button>
		{/each}
	</div>

	<section
		class="card"
		style="transform: translateX({dragX}px); transition: {dragging ? 'none' : 'transform 0.25s ease'};"
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
	>
		<div class="ex-head">
			<h2>{ex.name}{#if st.complete}<span class="check"> ✓</span>{/if}</h2>
			<span class="target">
				{#if ex.type === 'ramp'}ramp · {ex.repMax} reps{:else}{ex.sets} × {ex.repMin}–{ex.repMax}{/if} · rest {fmt(ex.restSeconds)}
			</span>
		</div>

		{#if st.done.length > 0}
			<div class="chips">
				{#each st.done as s}
					<span class="set logged" class:miss={s.reps < ex.repMin}>{s.weight}<small>×{s.reps}</small></span>
				{/each}
			</div>
		{/if}

		{#if !st.complete}
			<div class="entry">
				<div class="field">
					<span class="lbl">Weight</span>
					<div class="stepper">
						<button type="button" onclick={() => adjustWeight(-(ex.increment || 5))}>−</button>
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
				<button type="button" class="primary log" onclick={logSet}>Log set {st.done.length + 1}</button>
				{#if ex.type === 'ramp'}
					<p class="hint">Hit {ex.repMax}? Next set climbs. Miss it and the weight holds.</p>
				{/if}
			</div>
		{:else}
			<p class="donenote">Done. Swipe or tap ❯ for the next exercise.</p>
		{/if}

		<button type="button" class="prevbtn" onclick={() => (showHistory = !showHistory)}>
			{showHistory ? 'Hide' : 'Previous'} sessions
		</button>
		{#if showHistory}
			<div class="histlist">
				{#each data.history[ex.exerciseId] ?? [] as h}
					<div class="histrow"><span class="hd">{dayName(h.date)}</span><span class="hs">{histCompact(h.sets)}</span></div>
				{/each}
				{#if !(data.history[ex.exerciseId]?.length)}<p class="muted">No previous logs for this lift.</p>{/if}
			</div>
		{/if}
	</section>

	<div class="nav">
		<button type="button" class="navbtn" onclick={() => goTo(view - 1)} disabled={view === 0}>❮ Prev</button>
		<button type="button" class="navbtn" onclick={() => goTo(view + 1)} disabled={view === n - 1}>Next ❯</button>
	</div>

	{#if rest > 0}
		<div class="rest">Rest {fmt(rest)}</div>
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
		overflow-x: hidden;
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
	.dots {
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.dot {
		width: 22px;
		height: 10px;
		min-height: 10px;
		padding: 0;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface-2);
	}
	.dot.done {
		background: var(--success);
		border-color: var(--success);
	}
	.dot.active {
		border-color: var(--accent);
		background: var(--accent);
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		padding: 18px;
		min-height: 220px;
		touch-action: pan-y;
		will-change: transform;
	}
	.ex-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		font-size: 20px;
		font-weight: 600;
	}
	.check {
		color: var(--success);
	}
	.target {
		color: var(--muted);
		font-size: 13px;
		text-align: right;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
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
		margin-top: 18px;
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
		width: 60px;
		height: 60px;
		font-size: 26px;
		flex: 0 0 auto;
	}
	.stepper input {
		flex: 1;
		min-width: 0;
		height: 60px;
		text-align: center;
		font-size: 24px;
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
	.hint,
	.donenote {
		color: var(--muted);
		font-size: 13px;
		text-align: center;
		margin: 4px 0 0;
	}
	.prevbtn {
		margin-top: 14px;
		width: 100%;
		height: 44px;
		background: transparent;
		border-color: var(--border);
		color: var(--accent-2);
		font-size: 14px;
	}
	.histlist {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.histrow {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 13px;
		padding: 8px 10px;
		background: var(--surface-2);
		border-radius: 8px;
	}
	.hd {
		color: var(--muted);
		flex: 0 0 auto;
	}
	.hs {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.muted {
		color: var(--muted);
		font-size: 13px;
		text-align: center;
	}
	.nav {
		display: flex;
		gap: 10px;
	}
	.navbtn {
		flex: 1;
		height: 48px;
	}
	.navbtn:disabled {
		opacity: 0.4;
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
