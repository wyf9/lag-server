<script lang="ts">
	import { goto } from '$app/navigation';
	import { getSessionState } from '$lib/stores/session.svelte';
	import NicknameForm from '$lib/components/nickname-form.svelte';

	const session = $derived(getSessionState());

	$effect(() => {
		if (session.loaded && session.token) {
			goto('/rooms');
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="w-full max-w-md px-6">
		<div class="mb-8 flex flex-col items-center">
			<img src="/lag_logo_trimmed_dark_mode.png" alt="Lag" class="h-12 mb-2" />
			<p class="text-text-secondary text-sm">Self-hosted voice communication</p>
		</div>

		{#if !session.token}
			<NicknameForm />
		{:else}
			<div class="flex justify-center">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
			</div>
		{/if}
	</div>
</div>
