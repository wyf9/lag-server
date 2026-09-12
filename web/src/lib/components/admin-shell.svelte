<script lang="ts">
	import { page } from '$app/stores';
	let { children }: { children: import('svelte').Snippet } = $props();
	const links = [['Users', '/admin/users'], ['Rooms', '/admin/rooms'], ['Settings', '/admin/settings'], ['Audit', '/admin/audit']];
</script>
<div class="min-h-screen bg-background">
	<header class="border-b border-border bg-card px-4 py-4 sm:px-8"><div class="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><a href="/rooms" class="text-sm text-primary">Back to rooms</a><h1 class="mr-auto text-xl">Administration</h1><nav class="flex flex-wrap gap-1">{#each links as link}<a href={link[1]} class="rounded-md px-3 py-1.5 text-sm {$page.url.pathname === link[1] ? 'bg-primary text-primary-foreground' : 'text-text-secondary hover:bg-surface'}">{link[0]}</a>{/each}</nav></div></header>
	<main class="mx-auto max-w-6xl p-4 sm:p-8">{@render children()}</main>
</div>
