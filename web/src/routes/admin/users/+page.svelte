<script lang="ts">
	import { api } from '$lib/api';

	interface Grant { role: string; source: string; scopeType: string; }
	interface User { id: string; nickname: string; email: string | null; disabled: boolean; identityType: string; lastSeenAt: string | null; roleSources: Grant[]; }
	let users = $state<User[]>([]); let query = $state(''); let nextOffset = $state<number | null>(null); let loading = $state(false); let error = $state(''); let notice = $state('');
	const manualAdmin = (user: User) => user.roleSources.some((grant) => grant.role === 'platform_admin' && grant.scopeType === 'platform' && grant.source === 'manual');

	async function load(offset = 0, append = false) {
		loading = true; error = '';
		try { const result = await api<{ users: User[]; nextOffset: number | null }>(`/api/admin/users?limit=25&offset=${offset}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`); users = append ? [...users, ...result.users] : result.users; nextOffset = result.nextOffset; }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to load users'; }
		finally { loading = false; }
	}
	$effect(() => { load(); });
	async function mutate(user: User, action: 'status' | 'sessions' | 'admin') {
		const disabling = action === 'status' && !user.disabled; const granting = action === 'admin' && !manualAdmin(user);
		const prompt = action === 'sessions' ? `Revoke every active session for ${user.nickname}?` : action === 'status' ? `${disabling ? 'Disable' : 'Enable'} ${user.nickname}?${disabling ? ' Their sessions will also be revoked.' : ''}` : `${granting ? 'Grant' : 'Revoke'} manual platform administrator access for ${user.nickname}?`;
		if (!confirm(prompt)) return; error = ''; notice = '';
		try {
			if (action === 'status') await api(`/api/admin/users/${user.id}/status`, { method: 'PATCH', body: { disabled: !user.disabled } });
			if (action === 'sessions') { const result = await api<{ revoked: number }>(`/api/admin/users/${user.id}/revoke-sessions`, { method: 'POST' }); notice = `${result.revoked} session${result.revoked === 1 ? '' : 's'} revoked for ${user.nickname}.`; }
			if (action === 'admin') await api(`/api/admin/users/${user.id}/platform-admin`, { method: 'PUT', body: { granted: granting } });
			await load(); if (action !== 'sessions') notice = `${user.nickname} updated.`;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Update failed'; }
	}
</script>

<div><h2 class="text-2xl">Users</h2><p class="mb-5 mt-1 text-sm text-text-secondary">Manage account access, sessions, and manual administrator grants.</p>
	<form class="mb-4 flex gap-2" onsubmit={(event) => { event.preventDefault(); load(); }}><input bind:value={query} placeholder="Nickname, exact email, or user ID" class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" /><button class="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Search</button></form>
	{#if error}<p class="mb-3 rounded-lg bg-lag-danger-dim p-3 text-sm text-lag-danger">{error}</p>{/if}{#if notice}<p class="mb-3 rounded-lg bg-emerald-950/30 p-3 text-sm text-lag-success">{notice}</p>{/if}
	<div class="space-y-3">{#each users as user (user.id)}<article class="rounded-lg border border-border bg-surface p-4"><div class="flex flex-wrap items-start gap-3"><div class="min-w-48 flex-1"><h3 class="font-medium text-foreground">{user.nickname} {#if user.disabled}<span class="ml-1 text-xs text-lag-danger">Disabled</span>{/if}</h3><p class="break-all text-xs text-text-muted">{user.email ?? user.id} · {user.identityType}</p><p class="mt-1 text-xs text-text-secondary">{user.roleSources.length ? user.roleSources.map((grant) => `${grant.role} (${grant.source})`).join(', ') : 'No grants'}</p></div><div class="flex flex-wrap gap-2"><button onclick={() => mutate(user, 'status')} class="rounded border border-border px-2.5 py-1.5 text-xs {user.disabled ? 'text-lag-success' : 'text-lag-warning'}">{user.disabled ? 'Enable' : 'Disable'}</button><button onclick={() => mutate(user, 'sessions')} class="rounded border border-border px-2.5 py-1.5 text-xs text-text-secondary">Revoke sessions</button><button onclick={() => mutate(user, 'admin')} class="rounded border border-border px-2.5 py-1.5 text-xs {manualAdmin(user) ? 'text-lag-danger' : 'text-primary'}">{manualAdmin(user) ? 'Revoke admin' : 'Grant admin'}</button></div></div></article>{/each}</div>
	{#if !loading && !users.length}<p class="rounded-lg bg-surface p-5 text-text-muted">No users found.</p>{/if}{#if nextOffset !== null}<button disabled={loading} onclick={() => load(nextOffset ?? 0, true)} class="mt-4 w-full rounded-lg border border-border py-2 text-sm text-text-secondary disabled:opacity-50">{loading ? 'Loading...' : 'Load more'}</button>{/if}
</div>
