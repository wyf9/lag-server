<script lang="ts">
	import { api, ApiError } from '$lib/api';
	let { title, endpoint, collection, description }: { title: string; endpoint: string; collection?: string; description: string } = $props();
	let data = $state<unknown[]>([]); let loading = $state(true); let forbidden = $state(false); let unavailable = $state(false); let error = $state('');
	$effect(() => { load(); });
	async function load() {
		try { const result = await api<unknown>(endpoint); const value = collection && result && typeof result === 'object' ? (result as Record<string, unknown>)[collection] : result; data = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>).map(([key, val]) => ({ key, value: val })) : []; }
		catch (cause) { if (cause instanceof ApiError && cause.status === 403) forbidden = true; else if (cause instanceof ApiError && cause.status === 404) unavailable = true; else error = cause instanceof Error ? cause.message : 'Request failed'; }
		loading = false;
	}
	function display(value: unknown) { return value == null ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
	const columns = $derived(data.length && data[0] && typeof data[0] === 'object' ? Object.keys(data[0] as object).slice(0, 7) : []);
</script>
<div><h2 class="text-2xl">{title}</h2><p class="mb-6 mt-1 text-sm text-text-secondary">{description}</p>
{#if loading}<p class="text-text-muted">Loading...</p>{:else if forbidden}<div class="rounded-lg border border-lag-danger/40 bg-lag-danger-dim p-5"><h3>Access denied</h3><p class="text-sm text-text-secondary">The API returned 403. Your account does not have access to this resource.</p></div>{:else if unavailable}<div class="rounded-lg border border-border bg-surface p-5"><h3>Endpoint unavailable</h3><p class="text-sm text-text-secondary">This frontend expects <code>{endpoint}</code>, but this server does not provide it yet.</p></div>{:else if error}<p class="text-lag-danger">{error}</p>{:else if !data.length}<p class="rounded-lg bg-surface p-5 text-text-muted">No records returned.</p>{:else}<div class="overflow-x-auto rounded-lg border border-border"><table class="w-full min-w-[640px] text-left text-sm"><thead class="bg-card text-text-muted"><tr>{#each columns as column}<th class="px-3 py-2 font-medium">{column}</th>{/each}</tr></thead><tbody>{#each data as row}<tr class="border-t border-border">{#each columns as column}<td class="max-w-64 truncate px-3 py-2 text-text-secondary" title={display((row as Record<string, unknown>)[column])}>{display((row as Record<string, unknown>)[column])}</td>{/each}</tr>{/each}</tbody></table></div>{/if}</div>
