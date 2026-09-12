<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getSessionState } from '$lib/stores/session.svelte';
	import { fetchRooms } from '$lib/stores/rooms.svelte';
	import { connectWs, disconnectWs, subscribeRoom, unsubscribeRoom } from '$lib/stores/websocket.svelte';
	import { loadMessages, clearChat } from '$lib/stores/chat.svelte';
	import RoomSidebar from '$lib/components/room-sidebar.svelte';
	import RoomView from '$lib/components/room-view.svelte';

	const session = $derived(getSessionState());
	const roomId = $derived($page.params.roomId ?? '');

	let initialized = false;

	$effect(() => {
		if (session.loaded && !session.user) {
			goto('/');
		}
	});

	$effect(() => {
		if (roomId) {
			subscribeRoom(roomId);
			loadMessages(roomId);
			return () => {
				unsubscribeRoom(roomId);
				clearChat();
			};
		}
	});

	$effect(() => {
		if (session.user && !initialized) {
			initialized = true;
			fetchRooms();
			connectWs();
		}
	});
</script>

<div class="flex h-screen bg-background">
	<RoomSidebar />

	<div class="flex flex-1 flex-col">
		<RoomView {roomId} />
	</div>

</div>
