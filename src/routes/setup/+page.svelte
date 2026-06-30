<script lang="ts">
	let { data } = $props();

	const goals = [
		{ id: 'strength', label: 'Strength', blurb: 'Heavier, lower reps' },
		{ id: 'hypertrophy', label: 'Size', blurb: 'Moderate reps, more volume' },
		{ id: 'general', label: 'General', blurb: 'Balanced fitness' },
		{ id: 'hockey', label: 'Hockey support', blurb: 'Power, manage in-season' }
	];

	const splits = [
		{ id: 'auto', label: 'Auto', blurb: 'Engine picks from your days' },
		{ id: 'fullbody', label: 'Full body', blurb: 'Whole body each session' },
		{ id: 'upper_lower', label: 'Upper / Lower', blurb: 'Alternate upper & lower' },
		{ id: 'ppl', label: 'Push / Pull / Legs', blurb: 'Classic 3-way split' }
	];

	const equipmentOptions = [
		{ type: 'barbell', label: 'Barbell + plates' },
		{ type: 'dumbbell', label: 'Dumbbells' },
		{ type: 'machine', label: 'Machines' },
		{ type: 'cable', label: 'Cable machine' },
		{ type: 'band', label: 'Resistance bands' }
	];
	const ownedTypes = new Set(data.equipment.filter((e) => e.available).map((e) => e.type));

	const weekdays = [
		{ n: 0, label: 'Sun' },
		{ n: 1, label: 'Mon' },
		{ n: 2, label: 'Tue' },
		{ n: 3, label: 'Wed' },
		{ n: 4, label: 'Thu' },
		{ n: 5, label: 'Fri' },
		{ n: 6, label: 'Sat' }
	];

	const p = data.profile;
	const checkedDays = new Set(data.commitments.map((c) => c.weekday));
	const existingLabel = data.commitments[0]?.label ?? 'Hockey';
</script>

<main>
	<header>
		<h1>{p ? 'Edit setup' : "Let's set up your coach"}</h1>
		<p class="sub">Tell the engine your goal, time, and fixed commitments. You can change all of this later.</p>
	</header>

	<form method="POST">
		<section class="card">
			<h2>Goal</h2>
			<div class="goals">
				{#each goals as g}
					<label class="goal">
						<input type="radio" name="goal" value={g.id} checked={(p?.currentGoal ?? 'strength') === g.id} />
						<span class="goal-body">
							<span class="goal-label">{g.label}</span>
							<span class="goal-blurb">{g.blurb}</span>
						</span>
					</label>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2>Plan structure</h2>
			<div class="goals">
				{#each splits as s}
					<label class="goal">
						<input type="radio" name="splitType" value={s.id} checked={(p?.splitType ?? 'auto') === s.id} />
						<span class="goal-body">
							<span class="goal-label">{s.label}</span>
							<span class="goal-blurb">{s.blurb}</span>
						</span>
					</label>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2>Equipment</h2>
			<p class="hint">What you can train with — exercises get matched to this.</p>
			<div class="equip">
				{#each equipmentOptions as eq}
					<label class="chip">
						<input type="checkbox" name="equipment" value={eq.type} checked={ownedTypes.has(eq.type)} />
						<span>{eq.label}</span>
					</label>
				{/each}
			</div>
			<p class="subtle">Bodyweight is always available.</p>
		</section>

		<section class="card">
			<h2>Training</h2>
			<div class="row">
				<label class="field">
					<span>Sessions / week</span>
					<input type="number" name="sessionsPerWeek" min="1" max="7" value={p?.sessionsPerWeek ?? 3} />
				</label>
				<label class="field">
					<span>Time / session (min)</span>
					<input type="number" name="timeBudgetMin" min="20" max="180" step="5" value={p?.timeBudgetMin ?? 60} />
				</label>
			</div>
			<label class="field">
				<span>Experience</span>
				<select name="experience">
					{#each ['beginner', 'intermediate', 'advanced'] as e}
						<option value={e} selected={(p?.experience ?? 'intermediate') === e}>{e}</option>
					{/each}
				</select>
			</label>
		</section>

		<section class="card">
			<h2>Fixed commitments</h2>
			<p class="hint">Days the plan must work around (e.g. hockey). The engine keeps lifting off these and protects recovery near them.</p>
			<label class="field">
				<span>Label</span>
				<input type="text" name="commitmentLabel" value={existingLabel} placeholder="Hockey" />
			</label>
			<div class="days">
				{#each weekdays as d}
					<label class="day">
						<input type="checkbox" name="commitmentDays" value={d.n} checked={checkedDays.has(d.n)} />
						<span>{d.label}</span>
					</label>
				{/each}
			</div>
		</section>

		<button class="primary save" type="submit">Save &amp; continue</button>
	</form>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 20px 16px 40px;
	}
	header h1 {
		font-size: 26px;
	}
	.sub {
		color: var(--muted);
		font-size: 14px;
		margin: 6px 0 16px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
	}
	h2 {
		font-size: 16px;
		margin-bottom: 12px;
	}
	.goals {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.goal {
		display: flex;
		position: relative;
		cursor: pointer;
	}
	.goal input {
		position: absolute;
		opacity: 0;
	}
	.goal-body {
		flex: 1;
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: var(--tap);
	}
	.goal input:checked + .goal-body {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
	}
	.goal-label {
		font-weight: 600;
	}
	.goal-blurb {
		color: var(--muted);
		font-size: 12px;
	}
	.row {
		display: flex;
		gap: 10px;
	}
	.row .field {
		flex: 1;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
	}
	.field:last-child {
		margin-bottom: 0;
	}
	.field span {
		font-size: 13px;
		color: var(--muted);
	}
	input[type='number'],
	input[type='text'],
	select {
		min-height: var(--tap);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		padding: 0 12px;
		font: inherit;
	}
	.hint {
		color: var(--muted);
		font-size: 13px;
		margin: 0 0 12px;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.day {
		position: relative;
		cursor: pointer;
	}
	.day input {
		position: absolute;
		opacity: 0;
	}
	.day span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface-2);
		font-size: 14px;
	}
	.day input:checked + span {
		border-color: var(--accent);
		color: var(--accent-2);
		background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
	}
	.equip {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		position: relative;
		cursor: pointer;
	}
	.chip input {
		position: absolute;
		opacity: 0;
	}
	.chip span {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--surface-2);
		font-size: 14px;
	}
	.chip input:checked + span {
		border-color: var(--accent);
		color: var(--accent-2);
		background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
	}
	.subtle {
		color: var(--muted);
		font-size: 12px;
		margin: 10px 0 0;
	}
	.save {
		height: 56px;
		font-size: 17px;
	}
</style>
