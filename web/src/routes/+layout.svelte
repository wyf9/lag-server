<script lang="ts">
	import '../app.css';
	import { getSessionState, initSession } from '$lib/stores/session.svelte';

	let { children } = $props();

	const session = $derived(getSessionState());

	$effect(() => {
		if (!session.loaded) {
			initSession();
		}
	});
</script>

{#if session.loaded}
	{@render children()}
{:else}
	<div class="flex min-h-screen items-center justify-center bg-background">
		<div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
	</div>
{/if}
