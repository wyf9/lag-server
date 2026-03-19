<script lang="ts">
	import { goto } from '$app/navigation';
	import { createSession } from '$lib/stores/session.svelte';

	let nickname = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!nickname.trim()) return;

		loading = true;
		error = '';

		try {
			await createSession(nickname.trim());
			goto('/rooms');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create session';
		} finally {
			loading = false;
		}
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div>
		<label for="nickname" class="block text-sm font-medium text-text-secondary mb-1.5">
			Choose a nickname
		</label>
		<input
			id="nickname"
			type="text"
			bind:value={nickname}
			placeholder="Enter your nickname"
			maxlength={64}
			class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"
			disabled={loading}
		/>
	</div>

	{#if error}
		<p class="text-sm text-lag-danger">{error}</p>
	{/if}

	<button
		type="submit"
		disabled={!nickname.trim() || loading}
		class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
	>
		{loading ? 'Joining...' : 'Join'}
	</button>
</form>
