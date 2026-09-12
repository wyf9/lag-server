<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiHref } from '$lib/api';
	import { getSessionState } from '$lib/stores/session.svelte';
	import NicknameForm from '$lib/components/nickname-form.svelte';

	const session = $derived(getSessionState());

	$effect(() => {
		if (session.loaded && session.user) {
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

		{#if !session.user}
			<a href={apiHref('/api/auth/login')} class="block w-full rounded-lg bg-primary px-4 py-2.5 text-center font-medium text-primary-foreground hover:brightness-110">
				Continue with {session.discovery.providerName ?? session.discovery.provider ?? 'your account'}
			</a>
			{#if session.discovery.guestEnabled}
				<div class="my-5 flex items-center gap-3 text-xs text-text-muted"><span class="h-px flex-1 bg-border"></span>or join as a guest<span class="h-px flex-1 bg-border"></span></div>
				<NicknameForm />
			{/if}
		{:else}
			<div class="flex justify-center">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
			</div>
		{/if}
	</div>
</div>
