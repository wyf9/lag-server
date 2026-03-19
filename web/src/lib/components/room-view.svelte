<script lang="ts">
	import { getVoiceState, connectToRoom, disconnectFromRoom, toggleScreenShare, toggleMute, toggleDeafen } from '$lib/stores/voice.svelte';
	import { getChatMessages, sendMessage } from '$lib/stores/chat.svelte';
	import { getSessionState } from '$lib/stores/session.svelte';
	import { deleteRoom, getRooms } from '$lib/stores/rooms.svelte';
	import { goto } from '$app/navigation';
	import ParticipantTile from './participant-tile.svelte';
	import ScreenShareView from './screen-share-view.svelte';
	import AudioSettings from './audio-settings.svelte';

	let { roomId }: { roomId: string } = $props();

	const voice = $derived(getVoiceState());
	const messages = $derived(getChatMessages());
	const session = $derived(getSessionState());

	let messageInput = $state('');
	let chatContainer: HTMLDivElement | undefined = $state();
	let showDeleteConfirm = $state(false);
	let showChat = $state(true);
	let joiningVoice = $state(false);
	let showAudioSettings = $state(false);

	const isInThisRoom = $derived(voice.roomId === roomId);
	const roomName = $derived(getRooms().find(r => r.id === roomId)?.name ?? 'Room');
	const activeScreenShare = $derived(
		isInThisRoom
			? voice.participants.find(p => p.screenShareTrack)
			: null
	);

	$effect(() => {
		if (messages.length && chatContainer) {
			requestAnimationFrame(() => {
				chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
			});
		}
	});

	async function handleSendMessage(e: Event) {
		e.preventDefault();
		if (!messageInput.trim()) return;
		const content = messageInput.trim();
		messageInput = '';
		try {
			await sendMessage(roomId, content);
		} catch {}
	}

	async function handleToggleVoice() {
		if (isInThisRoom) {
			await disconnectFromRoom();
		} else {
			joiningVoice = true;
			try {
				await connectToRoom(roomId, roomName);
			} catch {}
			joiningVoice = false;
		}
	}

	async function handleDeleteRoom() {
		try {
			if (voice.roomId === roomId) await disconnectFromRoom();
			await deleteRoom(roomId);
			goto('/rooms');
		} catch {}
		showDeleteConfirm = false;
	}
</script>

{#if isInThisRoom && voice.status === 'connected'}
	<!-- VOICE ACTIVE: Full viewport overlay -->
	<div class="fixed inset-0 z-50 flex flex-col bg-background">
		<div class="flex flex-1 overflow-hidden">
			<!-- Main content area -->
			<div class="flex flex-1 flex-col overflow-hidden">
				<!-- Screen share or participant grid -->
				{#if activeScreenShare?.screenShareTrack}
					<div class="flex-1 p-2">
						<ScreenShareView
							track={activeScreenShare.screenShareTrack}
							nickname={activeScreenShare.nickname}
						/>
					</div>
					<!-- Participant strip below screen share -->
					<div class="flex gap-2 px-3 py-2 border-t border-border overflow-x-auto">
						{#each voice.participants as participant (participant.userId)}
							<div class="shrink-0">
								<ParticipantTile {participant} compact />
							</div>
						{/each}
					</div>
				{:else}
					<!-- No screen share: participant grid fills the space -->
					<div class="flex-1 grid gap-3 p-4 content-center" style:grid-template-columns="repeat(auto-fill, minmax(180px, 1fr))">
						{#each voice.participants as participant (participant.userId)}
							<ParticipantTile {participant} />
						{/each}
					</div>
				{/if}

				<!-- Voice controls bar -->
				<div class="flex items-center justify-center gap-3 border-t border-border px-4 py-3 bg-surface">
					<span class="text-sm text-text-secondary mr-2 max-w-[150px] truncate">{roomName}</span>

					<button
						onclick={() => toggleMute()}
						class="rounded-full p-2.5 {voice.muted ? 'bg-lag-danger text-white' : 'bg-surface-elevated text-text-secondary hover:text-foreground'}"
						title={voice.muted ? 'Unmute' : 'Mute'}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
							{#if voice.muted}
								<line x1="1" y1="1" x2="23" y2="23" />
								<path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
								<path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .72-.11 1.42-.31 2.07" />
								<line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
							{:else}
								<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
								<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
								<line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
							{/if}
						</svg>
					</button>

					<button
						onclick={() => toggleDeafen()}
						class="rounded-full p-2.5 {voice.deafened ? 'bg-lag-danger text-white' : 'bg-surface-elevated text-text-secondary hover:text-foreground'}"
						title={voice.deafened ? 'Undeafen' : 'Deafen'}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
							{#if voice.deafened}
								<line x1="1" y1="1" x2="23" y2="23" />
								<path d="M6 18.7A7 7 0 0 1 3 12V9a9 9 0 0 1 14.27-7.3" />
								<path d="M21 12v-2a9 9 0 0 0-1.46-4.93" />
								<path d="M21 14a1 1 0 0 1 0 2h-1a2 2 0 0 1-2-2v-1" />
							{:else}
								<path d="M3 18v-6a9 9 0 0 1 18 0v6" />
								<path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
							{/if}
						</svg>
					</button>

					<button
						onclick={() => toggleScreenShare()}
						class="rounded-full p-2.5 {voice.isScreenSharing ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-secondary hover:text-foreground'}"
						title={voice.isScreenSharing ? 'Stop sharing' : 'Share screen'}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
							<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
							<line x1="8" y1="21" x2="16" y2="21" />
							<line x1="12" y1="17" x2="12" y2="21" />
						</svg>
					</button>

					<button
						onclick={() => showChat = !showChat}
						class="rounded-full p-2.5 {showChat ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-secondary hover:text-foreground'}"
						title={showChat ? 'Hide chat' : 'Show chat'}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
					</button>

					<button
						onclick={() => showAudioSettings = true}
						class="rounded-full p-2.5 bg-surface-elevated text-text-secondary hover:text-foreground"
						title="Audio settings"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
						</svg>
					</button>

					<button
						onclick={handleToggleVoice}
						class="rounded-full p-2.5 bg-lag-danger text-white hover:bg-lag-danger-hover"
						title="Disconnect"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
							<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
							<line x1="23" y1="1" x2="1" y2="23" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Chat sidebar (toggleable) -->
			{#if showChat}
				<div class="w-80 flex flex-col border-l border-border">
					<div class="px-3 py-2 border-b border-border text-sm font-medium text-foreground">Chat</div>
					<div
						bind:this={chatContainer}
						class="flex-1 overflow-y-auto px-3 py-2 space-y-2"
					>
						{#if messages.length === 0}
							<p class="text-center text-xs text-text-muted py-4">No messages yet</p>
						{/if}
						{#each messages as msg (msg.id)}
							<div class="flex items-start gap-2">
								<div
									class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
									style:background-color={msg.avatarColor}
								>
									{msg.nickname?.charAt(0).toUpperCase() ?? '?'}
								</div>
								<div class="min-w-0">
									<span class="text-xs font-semibold text-foreground">{msg.nickname}</span>
									<p class="text-xs text-text-secondary break-words">{msg.content}</p>
								</div>
							</div>
						{/each}
					</div>
					<form onsubmit={handleSendMessage} class="border-t border-border p-2">
						<div class="flex gap-1.5">
							<input
								type="text"
								bind:value={messageInput}
								placeholder="Message..."
								maxlength={2000}
								class="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"
							/>
							<button
								type="submit"
								disabled={!messageInput.trim()}
								class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Send
							</button>
						</div>
					</form>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<!-- CHAT ONLY: Original layout -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-border px-4 py-3">
			<h2 class="text-lg font-heading text-foreground">{roomName}</h2>
		</div>

		<!-- Connecting indicator -->
		{#if voice.status === 'connecting' && voice.roomId === roomId}
			<div class="border-b border-border p-4 text-center text-sm text-text-secondary">
				Connecting to voice...
			</div>
		{/if}

		<!-- Chat messages -->
		<div
			bind:this={chatContainer}
			class="flex-1 overflow-y-auto px-4 py-3 space-y-3"
		>
			{#if messages.length === 0}
				<p class="text-center text-sm text-text-muted py-8">No messages yet</p>
			{/if}

			{#each messages as msg (msg.id)}
				<div class="flex items-start gap-2.5">
					<div
						class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
						style:background-color={msg.avatarColor}
					>
						{msg.nickname?.charAt(0).toUpperCase() ?? '?'}
					</div>
					<div class="min-w-0">
						<div class="flex items-baseline gap-2">
							<span class="text-sm font-semibold text-foreground">{msg.nickname}</span>
							<span class="text-[10px] text-text-muted">
								{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
							</span>
						</div>
						<p class="text-sm text-text-secondary break-words">{msg.content}</p>
					</div>
				</div>
			{/each}
		</div>

		<!-- Chat input + Join Voice -->
		<form onsubmit={handleSendMessage} class="border-t border-border p-3">
			<div class="flex gap-2">
				<input
					type="text"
					bind:value={messageInput}
					placeholder="Type a message..."
					maxlength={2000}
					class="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"
				/>
				<button
					type="submit"
					disabled={!messageInput.trim()}
					class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Send
				</button>
				<button
					type="button"
					onclick={handleToggleVoice}
					disabled={joiningVoice || voice.status === 'connecting'}
					class="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{#if joiningVoice || (voice.status === 'connecting' && voice.roomId === roomId)}
						Joining...
					{:else}
						Join Voice
					{/if}
				</button>
			</div>
		</form>
	</div>
{/if}

{#if showAudioSettings}
	<AudioSettings onclose={() => showAudioSettings = false} />
{/if}

{#if showDeleteConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
		onclick={(e) => { if (e.target === e.currentTarget) showDeleteConfirm = false; }}
	>
		<div class="w-full max-w-sm rounded-lg border border-border bg-surface-elevated p-6 shadow-lg">
			<h3 class="text-lg font-heading text-foreground mb-2">Delete Room</h3>
			<p class="text-sm text-text-secondary mb-4">Are you sure you want to delete this room? This cannot be undone.</p>
			<div class="flex justify-end gap-3">
				<button
					onclick={() => showDeleteConfirm = false}
					class="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-foreground"
				>
					Cancel
				</button>
				<button
					onclick={handleDeleteRoom}
					class="rounded-lg bg-lag-danger px-4 py-2 text-sm font-medium text-white hover:bg-lag-danger-hover"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
