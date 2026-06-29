<script lang="ts">
	import { generateRamp } from '$lib/engine';

	let { data } = $props();

	const goalLabels: Record<string, string> = {
		strength: 'Strength',
		hypertrophy: 'Size',
		general: 'General',
		hockey: 'Hockey support'
	};
	const phaseLabels: Record<string, string> = {
		onramp: 'On-Ramp',
		accumulation: 'Accumulation',
		intensification: 'Intensification',
		deload: 'Deload'
	};
	const splitLabels: Record<string, string> = {
		auto: 'Auto split',
		fullbody: 'Full body',
		upper_lower: 'Upper / Lower',
		ppl: 'Push / Pull / Legs'
	};

	const goalLabel = goalLabels[data.profile.currentGoal] ?? data.profile.currentGoal;

	const todayLabel = new Date().toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});

	function ramp(ex: (typeof data.exercises)[number]) {
		return generateRamp(ex.topWeight, ex.repMax, ex.sets, ex.perSetIncrement ?? ex.increment, ex.increment);
	}

	function dayName(date: string) {
		return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	const nextSession = $derived(data.week.find((w) => w.date >= (data.today ?? '')));
</script>

<main>
	{#if !data.block}
		<!-- No plan yet -->
		<header><h1>Ready when you are</h1></header>
		<section class="card">
			<p class="lead">Your settings are saved. Generate your first block and the engine will lay out this week around your schedule, anchored to your real working weights.</p>
			<ul class="summary">
				<li><span>Goal</span><b>{goalLabel}</b></li>
				<li><span>Structure</span><b>{splitLabels[data.profile.splitType]}</b></li>
				<li><span>Days / week</span><b>{data.profile.sessionsPerWeek}</b></li>
				<li><span>Time / session</span><b>{data.profile.timeBudgetMin} min</b></li>
			</ul>
			<form method="POST" action="?/generate">
				<button class="primary big" type="submit">Generate my plan</button>
			</form>
			<a class="muted-link" href="/setup">Edit setup</a>
		</section>
	{:else if data.session}
		<!-- Today's workout -->
		<header>
			<div>
				<h1>Today</h1>
				<p class="sub">{todayLabel}</p>
			</div>
			<span class="phase">{goalLabel} · {phaseLabels[data.block.currentPhase]} Wk {data.block.currentWeekIndex + 1}</span>
		</header>

		{#each data.exercises as ex}
			<section class="card">
				<div class="ex-head">
					<h2>{ex.name}</h2>
					<span class="target">
						{#if ex.type === 'ramp'}top set · {ex.repMax} reps{:else}{ex.sets} × {ex.repMin}–{ex.repMax}{/if}
					</span>
				</div>
				{#if ex.type === 'ramp'}
					<div class="ramp">
						{#each ramp(ex).sets as s, i}
							<span class="set" class:top={i === ex.sets - 1}>{s.weight}<small>×{s.repTarget}</small></span>
						{/each}
					</div>
				{:else}
					<div class="ramp">
						<span class="set">{ex.topWeight} lb</span>
						<span class="straight">{ex.sets} sets · {ex.repMin}–{ex.repMax} reps</span>
					</div>
				{/if}
			</section>
		{/each}

		<button class="primary big">Start workout</button>
		<p class="note">Engine-generated from your real weights. <a href="/setup">Edit setup</a></p>
	{:else}
		<!-- Rest day -->
		<header>
			<div>
				<h1>Rest day</h1>
				<p class="sub">{todayLabel}</p>
			</div>
			<span class="phase">{goalLabel} · {phaseLabels[data.block.currentPhase]}</span>
		</header>
		<section class="card">
			<p class="lead">Nothing scheduled today.</p>
			{#if nextSession}
				<p class="muted">Next session: <b>{dayName(nextSession.date)}</b></p>
			{/if}
		</section>
		<section class="card">
			<h2>This week</h2>
			<ul class="week">
				{#each data.week as w}
					<li class:isToday={w.date === data.today}>
						<span>{dayName(w.date)}</span>
						<span class="wphase">{phaseLabels[w.phase]}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
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
	.lead {
		margin: 0 0 14px;
		line-height: 1.5;
	}
	.summary {
		list-style: none;
		margin: 0 0 16px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.summary li {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding-bottom: 8px;
	}
	.summary span {
		color: var(--muted);
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
		align-items: center;
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
	.straight {
		color: var(--muted);
		font-size: 13px;
	}
	.big {
		height: 56px;
		font-size: 17px;
		margin-top: 4px;
	}
	.note,
	.muted {
		color: var(--muted);
		font-size: 13px;
	}
	.note {
		text-align: center;
		font-size: 12px;
		margin: 6px 0 0;
	}
	.muted-link {
		display: block;
		text-align: center;
		margin-top: 12px;
		font-size: 13px;
	}
	.week {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.week li {
		display: flex;
		justify-content: space-between;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface-2);
	}
	.week li.isToday {
		border-color: var(--accent);
	}
	.wphase {
		color: var(--muted);
		font-size: 13px;
	}
</style>
