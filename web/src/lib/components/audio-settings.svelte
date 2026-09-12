<script lang="ts">
	import { getAudioSettings, saveAudioSettings, type AudioSettings } from '$lib/stores/voice.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let settings = $state<AudioSettings>(getAudioSettings());

	const bitrateOptions = [
		{ value: 32_000, label: '32 kbps (Low)' },
		{ value: 64_000, label: '64 kbps (Medium)' },
		{ value: 96_000, label: '96 kbps (High)' },
		{ value: 128_000, label: '128 kbps (Very High)' },
		{ value: 196_000, label: '196 kbps (Music)' },
	];

	function handleSave() {
		saveAudioSettings(settings);
		onclose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	role="presentation"
	class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
	onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
	<div class="w-full max-w-sm rounded-lg border border-border bg-surface-elevated p-6 shadow-lg">
		<h3 class="text-lg font-heading text-foreground mb-4">Audio Settings</h3>
		<p class="text-xs text-text-muted mb-4">Changes apply on next voice connection.</p>

		<div class="space-y-4">
			<label class="flex items-center justify-between">
				<span class="text-sm text-foreground">Echo cancellation</span>
				<input type="checkbox" bind:checked={settings.echoCancellation} class="h-4 w-4 accent-primary" />
			</label>

			<label class="flex items-center justify-between">
				<span class="text-sm text-foreground">Noise suppression</span>
				<input type="checkbox" bind:checked={settings.noiseSuppression} class="h-4 w-4 accent-primary" />
			</label>

			<label class="flex items-center justify-between">
				<span class="text-sm text-foreground">Auto gain control</span>
				<input type="checkbox" bind:checked={settings.autoGainControl} class="h-4 w-4 accent-primary" />
			</label>

			<div>
				<label for="bitrate" class="block text-sm text-foreground mb-1.5">Audio bitrate</label>
				<select
					id="bitrate"
					bind:value={settings.bitrate}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
				>
					{#each bitrateOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="flex justify-end gap-3 mt-6">
			<button
				onclick={onclose}
				class="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-foreground"
			>
				Cancel
			</button>
			<button
				onclick={handleSave}
				class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
			>
				Save
			</button>
		</div>
	</div>
</div>
