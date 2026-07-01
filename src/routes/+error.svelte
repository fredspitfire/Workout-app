<script lang="ts">
	import { page } from '$app/state';

	const isServer = $derived(page.status >= 500);
	const heading = $derived(
		page.status === 404 ? 'Not found' : isServer ? 'Something broke' : 'That didn’t work'
	);
</script>

<main>
	<section class="card">
		<span class="code">{page.status}</span>
		<h1>{heading}</h1>
		<p class="msg">{page.error?.message ?? 'Unexpected error.'}</p>
		{#if page.error?.id}
			<p class="ref">Reference: <code>{page.error.id}</code></p>
		{/if}
		<a class="primary big" href="/">Back to Today</a>
	</section>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 40px 16px;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 28px 20px;
		text-align: center;
	}
	.code {
		display: inline-block;
		font-size: 13px;
		font-weight: 700;
		color: var(--danger);
		background: color-mix(in srgb, var(--danger) 16%, var(--surface));
		border: 1px solid var(--danger);
		border-radius: 999px;
		padding: 4px 12px;
		margin-bottom: 14px;
	}
	h1 {
		font-size: 24px;
	}
	.msg {
		color: var(--muted);
		line-height: 1.5;
		margin: 10px 0 0;
	}
	.ref {
		color: var(--muted);
		font-size: 13px;
		margin: 8px 0 0;
	}
	.ref code {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.big {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		padding: 0 24px;
		margin-top: 22px;
		text-decoration: none;
		border-radius: 12px;
	}
</style>
