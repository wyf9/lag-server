<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getRooms } from '$lib/stores/rooms.svelte';
	import { getSessionState, clearSession } from '$lib/stores/session.svelte';
	import { getVoiceState, connectToRoom, disconnectFromRoom } from '$lib/stores/voice.svelte';
	import CreateRoomModal from './create-room-modal.svelte';
	import { cn } from '$lib/utils';

	const rooms = $derived(getRooms());
	const session = $derived(getSessionState());
	const voice = $derived(getVoiceState());
	const currentRoomId = $derived($page.params.roomId);

	let showCreateModal = $state(false);

	async function handleJoinRoom(roomId: string, roomName: string) {
		goto(`/rooms/${roomId}`);
		if (voice.roomId !== roomId) {
			try {
				await connectToRoom(roomId, roomName);
			} catch {
				// Voice connection failed - user can still see chat
			}
		}
	}

	function handleLogout() {
		if (voice.status !== 'disconnected') {
			disconnectFromRoom();
		}
		clearSession();
		goto('/');
	}
</script>

<aside class="flex h-full w-64 flex-col border-r border-border bg-card">
	<div class="flex items-center justify-between border-b border-border p-4">
		<img src="/lag_logo_trimmed_dark_mode.png" alt="Lag" class="h-7" />
		<button
			onclick={() => showCreateModal = true}
			class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110"
		>
			New Room
		</button>
	</div>

	<div class="flex-1 overflow-y-auto p-2">
		{#if rooms.length === 0}
			<p class="px-2 py-4 text-center text-sm text-text-muted">No rooms yet</p>
		{/if}

		{#each rooms as room (room.id)}
			<button
				onclick={() => handleJoinRoom(room.id, room.name)}
				class={cn(
					'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors',
					currentRoomId === room.id
						? 'bg-surface-hover text-foreground'
						: 'text-text-secondary hover:bg-surface hover:text-foreground'
				)}
			>
				<span class="truncate text-sm font-medium">{room.name}</span>
				{#if room.participantCount > 0}
					<span class="ml-2 flex items-center gap-1 text-xs text-lag-success">
						<span class="h-1.5 w-1.5 rounded-full bg-lag-success"></span>
						{room.participantCount}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="border-t border-border p-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
					style:background-color={session.user?.avatarColor ?? '#43b8b0'}
				>
					{session.user?.nickname?.charAt(0).toUpperCase() ?? '?'}
				</div>
				<span class="text-sm font-medium text-foreground truncate max-w-[120px]">
					{session.user?.nickname}
				</span>
			</div>
			<button
				onclick={handleLogout}
				class="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface hover:text-foreground"
			>
				Leave
			</button>
		</div>
	</div>
</aside>

{#if showCreateModal}
	<CreateRoomModal onclose={() => showCreateModal = false} />
{/if}
