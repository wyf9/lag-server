<script lang="ts">
	import { goto } from '$app/navigation';
	import { createRoom } from '$lib/stores/rooms.svelte';
	import { connectToRoom } from '$lib/stores/voice.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let name = $state('');
	let maxParticipants = $state(50);
	let visibility = $state<'public' | 'unlisted' | 'private'>('public');
	let allowGuests = $state(true);
	let defaultRole = $state<'speaker' | 'listener'>('listener');
	let historyVisibility = $state<'all' | 'since_membership' | 'none'>('all');
	let retention = $state<'7' | '30' | 'forever'>('30');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!name.trim()) return;

		loading = true;
		error = '';

		try {
			const room = await createRoom({ name: name.trim(), maxParticipants, visibility, allowGuests, defaultRole, historyVisibility, retention });
			onclose();
			goto(`/rooms/${room.id}`);
			try {
				await connectToRoom(room.id, room.name);
			} catch {}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create room';
		} finally {
			loading = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
	onclick={handleBackdropClick}
	role="presentation"
>
	<div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface-elevated p-6 shadow-lg">
		<h2 class="text-lg font-heading text-foreground mb-4">Create Room</h2>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="room-name" class="block text-sm font-medium text-text-secondary mb-1.5">
					Room name
				</label>
				<input
					id="room-name"
					type="text"
					bind:value={name}
					placeholder="General"
					maxlength={64}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"
					disabled={loading}
				/>
			</div>

			<div>
				<label for="max-participants" class="block text-sm font-medium text-text-secondary mb-1.5">
					Max participants
				</label>
				<input
					id="max-participants"
					type="number"
					bind:value={maxParticipants}
					min={1}
					max={100}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"
					disabled={loading}
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<label class="text-sm text-text-secondary">Visibility
					<select bind:value={visibility} onchange={() => { if (visibility === 'private') allowGuests = false; }} class="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground"><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select>
				</label>
				<label class="text-sm text-text-secondary">Default role
					<select bind:value={defaultRole} class="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground"><option value="listener">Listener</option><option value="speaker">Speaker</option></select>
				</label>
				<label class="text-sm text-text-secondary">Chat history
					<select bind:value={historyVisibility} class="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground"><option value="all">All history</option><option value="since_membership">Since joining</option><option value="none">Disabled</option></select>
				</label>
				<label class="text-sm text-text-secondary">Retention
					<select bind:value={retention} class="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground"><option value="7">7 days</option><option value="30">30 days</option><option value="forever">Forever</option></select>
				</label>
			</div>
			<label class="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" bind:checked={allowGuests} disabled={visibility === 'private'} /> Allow guest accounts</label>

			{#if error}
				<p class="text-sm text-lag-danger">{error}</p>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					type="button"
					onclick={onclose}
					class="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-foreground"
					disabled={loading}
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!name.trim() || loading}
					class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{loading ? 'Creating...' : 'Create'}
				</button>
			</div>
		</form>
	</div>
</div>
