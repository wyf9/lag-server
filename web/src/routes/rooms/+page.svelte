<script lang="ts">
	import { goto } from '$app/navigation';
	import { getSessionState } from '$lib/stores/session.svelte';
	import { getRooms, fetchRooms } from '$lib/stores/rooms.svelte';
	import { connectWs, disconnectWs } from '$lib/stores/websocket.svelte';
	import RoomSidebar from '$lib/components/room-sidebar.svelte';

	const session = $derived(getSessionState());

	let initialized = false;

	$effect(() => {
		if (session.loaded && !session.token) {
			goto('/');
		}
	});

	$effect(() => {
		if (session.token && !initialized) {
			initialized = true;
			fetchRooms();
			connectWs();
		}
	});
</script>

<div class="flex h-screen bg-background">
	<RoomSidebar />

	<div class="flex flex-1 flex-col items-center justify-center">
		<div class="text-center">
			<h2 class="text-2xl font-heading text-foreground mb-2">Welcome, {session.user?.nickname}</h2>
			<p class="text-text-secondary text-sm">Select a room from the sidebar or create a new one</p>
		</div>
	</div>

</div>
