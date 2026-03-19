<script lang="ts">
	import { getVoiceState, toggleMute, toggleDeafen, disconnectFromRoom } from '$lib/stores/voice.svelte';
	import { cn } from '$lib/utils';

	const voice = $derived(getVoiceState());
</script>

<div class="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card">
	<div class="mx-auto flex max-w-lg items-center justify-center gap-4 px-4 py-3">
		<div class="flex items-center gap-2 text-sm text-text-secondary">
			<span class="h-2 w-2 rounded-full" class:bg-lag-success={voice.status === 'connected'} class:bg-lag-warning={voice.status === 'reconnecting'} class:bg-text-muted={voice.status === 'connecting'}></span>
			<span class="truncate max-w-[120px]">{voice.roomName ?? 'Voice'}</span>
		</div>

		<div class="flex items-center gap-2">
			<button
				onclick={toggleMute}
				class={cn(
					'rounded-lg px-3 py-2 text-xs font-medium',
					voice.muted
						? 'bg-lag-danger text-white hover:bg-lag-danger-hover'
						: 'bg-surface text-foreground hover:bg-surface-hover'
				)}
			>
				{voice.muted ? 'Unmute' : 'Mute'}
			</button>

			<button
				onclick={toggleDeafen}
				class={cn(
					'rounded-lg px-3 py-2 text-xs font-medium',
					voice.deafened
						? 'bg-lag-danger text-white hover:bg-lag-danger-hover'
						: 'bg-surface text-foreground hover:bg-surface-hover'
				)}
			>
				{voice.deafened ? 'Undeafen' : 'Deafen'}
			</button>

			<button
				onclick={() => disconnectFromRoom()}
				class="rounded-lg bg-lag-danger px-3 py-2 text-xs font-medium text-white hover:bg-lag-danger-hover"
			>
				Disconnect
			</button>
		</div>
	</div>
</div>
