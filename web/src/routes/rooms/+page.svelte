<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getSessionState } from '$lib/stores/session.svelte';
	import { acceptRoomInvitation, confirmRoomOwnership, getRooms, fetchRooms } from '$lib/stores/rooms.svelte';
	import { dismissRoomAction, getRoomActions, loadPendingRoomActions } from '$lib/stores/notifications.svelte';
	import { connectWs, disconnectWs } from '$lib/stores/websocket.svelte';
	import RoomSidebar from '$lib/components/room-sidebar.svelte';

	const session = $derived(getSessionState());
	const actions = $derived(getRoomActions());
	let actionError = $state('');

	let initialized = false;
	let invitationHandled = false;

	$effect(() => {
		if (session.loaded && !session.user) {
			goto('/');
		}
	});

	async function completeAction(action: (typeof actions)[number]) {
		actionError = '';
		try {
			if (action.type === 'invitation' && action.invitationId) await acceptRoomInvitation(action.invitationId);
			else await confirmRoomOwnership(action.roomId);
			dismissRoomAction(action.id);
			await fetchRooms();
			goto(`/rooms/${action.roomId}`);
		} catch (cause) { actionError = cause instanceof Error ? cause.message : 'Unable to complete room action'; }
	}

	$effect(() => {
		if (session.user && !initialized) {
			initialized = true;
			fetchRooms();
			loadPendingRoomActions().catch(() => {});
			connectWs();
		}
	});

	$effect(() => {
		const invitation = $page.url.searchParams.get('invitation');
		if (session.user && invitation && !invitationHandled) {
			invitationHandled = true;
			(async () => {
				try { const result = await acceptRoomInvitation(invitation); await fetchRooms(); goto(`/rooms/${result.roomId}`); }
				catch (cause) { actionError = cause instanceof Error ? cause.message : 'Unable to accept invitation'; }
			})();
		}
	});
</script>

<div class="flex h-screen bg-background">
	<RoomSidebar />

	<div class="flex flex-1 flex-col items-center justify-center">
		<div class="w-full max-w-lg px-5 text-center">
			<h2 class="text-2xl font-heading text-foreground mb-2">Welcome, {session.user?.nickname}</h2>
			<p class="text-text-secondary text-sm">Select a room from the sidebar or create a new one</p>
			{#if actions.length}<div class="mt-6 space-y-2 text-left">{#each actions as action (action.id)}<div class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"><span class="min-w-48 flex-1 text-sm text-text-secondary">{action.type === 'invitation' ? `Room invitation (${action.role ?? 'member'})` : 'Pending room ownership transfer'}</span><button onclick={() => completeAction(action)} class="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">{action.type === 'invitation' ? 'Accept invitation' : 'Accept ownership'}</button><button onclick={() => dismissRoomAction(action.id)} class="text-xs text-text-muted">Dismiss</button></div>{/each}</div>{/if}
			{#if actionError}<p class="mt-3 text-sm text-lag-danger">{actionError}</p>{/if}
		</div>
	</div>

</div>
