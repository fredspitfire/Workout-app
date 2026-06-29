<script lang="ts">
	import { generateRamp } from '$lib/engine';

	// Placeholder session (no database yet — Phase 2). The ramps below are generated
	// by the real engine, so this also proves the engine is wired into the UI.
	const today = new Date().toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});

	const squat = generateRamp(155, 5, 5, 10, 5);
	const incline = generateRamp(135, 6, 4, 10, 5);

	const accessories = [
		{ name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '12' },
		{ name: 'Cable Lat Pulldown', sets: 3, reps: '12' },
		{ name: 'Standing Calf Raise', sets: 3, reps: '12' }
	];
</script>

<main>
	<header>
		<div>
			<h1>Today</h1>
			<p class="sub">{today}</p>
		</div>
		<span class="phase">Accumulation · Wk 2</span>
	</header>

	<section class="card">
		<div class="ex-head">
			<h2>Barbell Squat</h2>
			<span class="target">top set · 5 reps</span>
		</div>
		<div class="ramp">
			{#each squat.sets as s, i}
				<span class="set" class:top={i === squat.sets.length - 1}>{s.weight}<small>×{s.repTarget}</small></span>
			{/each}
		</div>
		<p class="hint">Ramp up — climb while you hit 5; hold the weight the moment you miss it.</p>
	</section>

	<section class="card">
		<div class="ex-head">
			<h2>Barbell Incline Bench</h2>
			<span class="target">top set · 6 reps</span>
		</div>
		<div class="ramp">
			{#each incline.sets as s, i}
				<span class="set" class:top={i === incline.sets.length - 1}>{s.weight}<small>×{s.repTarget}</small></span>
			{/each}
		</div>
	</section>

	{#each accessories as a}
		<section class="card accessory">
			<div class="ex-head">
				<h2>{a.name}</h2>
				<span class="target">{a.sets} × {a.reps}</span>
			</div>
		</section>
	{/each}

	<button class="primary start">Start workout</button>

	<p class="note">Skeleton build — sample session. Logging, your real plan & data come next.</p>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 20px 16px 40px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	h1 {
		font-size: 28px;
	}
	.sub {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 14px;
	}
	.phase {
		background: var(--surface-2);
		border: 1px solid var(--border);
		color: var(--accent-2);
		font-size: 12px;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
	}
	.accessory {
		padding: 14px 16px;
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
	.ramp {
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
	.set.top {
		border-color: var(--success);
		color: var(--success);
	}
	.hint {
		margin: 12px 0 0;
		color: var(--muted);
		font-size: 13px;
	}
	.start {
		margin-top: 8px;
		height: 56px;
		font-size: 17px;
	}
	.note {
		text-align: center;
		color: var(--muted);
		font-size: 12px;
		margin: 6px 0 0;
	}
</style>
