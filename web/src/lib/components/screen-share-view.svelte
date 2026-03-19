<script lang="ts">
	import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client';

	let { track, nickname }: { track: RemoteVideoTrack | LocalVideoTrack; nickname: string } = $props();

	let videoEl: HTMLVideoElement | undefined = $state();

	$effect(() => {
		if (videoEl && track) {
			track.attach(videoEl);
			return () => {
				track.detach(videoEl!);
			};
		}
	});
</script>

<div class="relative w-full h-full bg-black rounded-lg overflow-hidden">
	<video
		bind:this={videoEl}
		autoplay
		playsinline
		class="w-full h-full object-contain"
	></video>
	<div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
		{nickname}'s screen
	</div>
</div>
