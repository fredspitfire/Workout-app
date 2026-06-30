<script lang="ts">
	let { data } = $props();

	function dayName(date: string) {
		return new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
	const compact = (sets: { weight: number; reps: number }[]) =>
		sets.map((s) => `${s.weight}×${s.reps}`).join(', ');
</script>

<main>
	<header>
		<a class="back" href="/">‹ Today</a>
		<h1>History</h1>
	</header>

	{#if data.days.length === 0}
		<p class="empty">No training logged yet.</p>
	{:else}
		{#each data.days as day}
			<section class="card">
				<h2>{dayName(day.date)}</h2>
				<ul>
					{#each day.exercises as ex}
						<li>
							<span class="name">{ex.name}{#if ex.source === 'jefit_import'}<span class="tag">imported</span>{/if}</span>
							<span class="sets">{compact(ex.sets)}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		<p class="note">Showing your most recent {data.days.length} training days.</p>
	{/if}
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 16px 16px 40px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.back {
		color: var(--accent-2);
		text-decoration: none;
		font-size: 15px;
	}
	h1 {
		font-size: 28px;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px 16px;
	}
	h2 {
		font-size: 15px;
		font-weight: 600;
		color: var(--accent-2);
		margin-bottom: 10px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 14px;
	}
	.name {
		color: var(--text);
		flex: 0 0 auto;
	}
	.tag {
		font-size: 10px;
		color: var(--muted);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 1px 4px;
		margin-left: 6px;
		vertical-align: middle;
	}
	.sets {
		color: var(--muted);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.empty,
	.note {
		color: var(--muted);
		text-align: center;
	}
	.note {
		font-size: 12px;
	}
</style>
