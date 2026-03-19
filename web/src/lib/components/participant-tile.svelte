<script lang="ts">
	import type { VoiceParticipant } from '$lib/stores/voice.svelte';

	let { participant, compact = false }: { participant: VoiceParticipant; compact?: boolean } = $props();
</script>

{#if compact}
	<div class="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 {participant.isSpeaking ? 'border-primary bg-primary/10' : 'border-border bg-surface'}">
		<div
			class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
			style:background-color={participant.avatarColor}
		>
			{participant.nickname?.charAt(0).toUpperCase() ?? '?'}
		</div>
		<span class="text-xs text-foreground max-w-[80px] truncate">{participant.nickname}</span>
		{#if participant.isMuted}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-3 w-3 text-lag-danger">
				<line x1="1" y1="1" x2="23" y2="23" />
				<path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
			</svg>
		{/if}
	</div>
{:else}
	<div class="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all {participant.isSpeaking ? 'border-primary bg-primary/10 speaking-glow' : 'border-border bg-surface'}">
		<div
			class="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white {participant.isSpeaking ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}"
			style:background-color={participant.avatarColor}
		>
			{participant.nickname?.charAt(0).toUpperCase() ?? '?'}
		</div>
		<span class="text-sm font-medium text-foreground max-w-[120px] truncate">{participant.nickname}</span>
		<span class="text-[10px] text-text-muted">
			{#if participant.isMuted}
				Muted
			{:else if participant.isSpeaking}
				Speaking
			{:else}
				Connected
			{/if}
		</span>
	</div>
{/if}

<style>
	.speaking-glow {
		animation: speaking-pulse 1.5s ease-in-out infinite;
	}
	@keyframes speaking-pulse {
		0%, 100% { box-shadow: 0 0 0 0 rgba(67, 184, 176, 0.3); }
		50% { box-shadow: 0 0 12px 4px rgba(67, 184, 176, 0.2); }
	}
</style>
