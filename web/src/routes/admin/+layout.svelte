<script lang="ts">
	import { goto } from '$app/navigation';
	import AdminShell from '$lib/components/admin-shell.svelte';
	import { getSessionState, isPlatformAdmin } from '$lib/stores/session.svelte';
	let { children } = $props();
	const session = $derived(getSessionState());
	$effect(() => { if (session.loaded && !session.user) goto('/'); });
</script>
{#if session.user && isPlatformAdmin(session.user)}<AdminShell {children} />{:else if session.loaded}<div class="flex min-h-screen items-center justify-center bg-background p-6 text-center"><div><h1 class="text-2xl">Access denied</h1><p class="mt-2 text-text-secondary">Platform administrator access is required.</p><a class="mt-4 inline-block text-primary" href="/rooms">Return to rooms</a></div></div>{/if}
