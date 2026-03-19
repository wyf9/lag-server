# Voice Quality & Full-Screen Voice UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve voice audio quality and build a full-screen voice experience with participant grid and screen sharing support.

**Architecture:** Two independent changes: (1) Boost LiveKit audio quality settings in both server config and client Room options, (2) Transform the room view into a full-screen layout when voice is active — showing participant tiles in a grid and rendering incoming screen shares as video elements. Chat stays accessible as a collapsible sidebar.

**Tech Stack:** LiveKit Client SDK (livekit-client), SvelteKit, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `livekit.yaml` | Modify | Boost server-side audio quality |
| `web/src/lib/stores/voice.svelte.ts` | Modify | Better Room config, track screen share state |
| `web/src/lib/components/room-view.svelte` | Modify | Full-screen voice layout with grid + chat toggle |
| `web/src/lib/components/participant-tile.svelte` | Modify | Larger tiles with video/screen share rendering |
| `web/src/lib/components/screen-share-view.svelte` | Create | Renders a screen share track as a `<video>` |
| `web/src/lib/components/voice-controls.svelte` | Modify | Add screen share toggle, move into room-view |

---

### Task 1: Boost Audio Quality

**Files:**
- Modify: `web/src/lib/stores/voice.svelte.ts` (Room constructor ~line 282, audio defaults ~line 285)

- [ ] **Step 1: Update LiveKit Room options for higher audio quality**

In `voice.svelte.ts`, update the `new Room({...})` constructor:

```typescript
liveKitRoom = new Room({
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  },
  audioOutput: {
    deviceId: 'default',
  },
  publishDefaults: {
    audioPreset: {
      maxBitrate: 64_000,
    },
    dtx: true,
    red: true,
  },
});
```

Key changes:
- `sampleRate: 48000` — full-bandwidth audio instead of default 16kHz
- `maxBitrate: 64_000` — 64kbps Opus (default is ~32kbps), clearer voice
- `dtx: true` — Discontinuous Transmission, saves bandwidth during silence
- `red: true` — Redundant encoding for packet loss resilience

- [ ] **Step 2: Rebuild and test voice quality**

```bash
podman compose down && EXTERNAL_IP=127.0.0.1 podman compose up -d --build
```

Test: Join voice in a room, speak — audio should sound noticeably clearer.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/stores/voice.svelte.ts
git commit -m "feat: boost voice audio quality (48kHz, 64kbps Opus, RED)"
```

---

### Task 2: Track Screen Share State in Voice Store

**Files:**
- Modify: `web/src/lib/stores/voice.svelte.ts`

- [ ] **Step 1: Add screen share tracking to VoiceState and VoiceParticipant**

Add to the `VoiceParticipant` interface:

```typescript
export interface VoiceParticipant {
  userId: string;
  nickname: string;
  avatarColor: string;
  isMuted: boolean;
  isSpeaking: boolean;
  videoTrack: RemoteVideoTrack | LocalVideoTrack | null;      // camera
  screenShareTrack: RemoteVideoTrack | LocalVideoTrack | null; // screen
}
```

Add to `VoiceState`:

```typescript
export interface VoiceState {
  // ... existing fields
  isScreenSharing: boolean;
}
```

Update `initialState`:

```typescript
const initialState: VoiceState = {
  // ... existing
  isScreenSharing: false,
};
```

- [ ] **Step 2: Update participantToViewModel to extract video tracks**

```typescript
function participantToViewModel(p: Participant): VoiceParticipant {
  const id = p.identity;
  const profile = participantDirectory.get(id);

  let videoTrack = null;
  let screenShareTrack = null;

  for (const pub of p.videoTrackPublications.values()) {
    if (pub.track && pub.isSubscribed) {
      if (pub.source === Track.Source.ScreenShare) {
        screenShareTrack = pub.track;
      } else if (pub.source === Track.Source.Camera) {
        videoTrack = pub.track;
      }
    }
  }

  // Also check local participant's published tracks
  if ('audioTrackPublications' in p && p === liveKitRoom?.localParticipant) {
    for (const pub of p.videoTrackPublications.values()) {
      if (pub.track) {
        if (pub.source === Track.Source.ScreenShare) {
          screenShareTrack = pub.track;
        } else if (pub.source === Track.Source.Camera) {
          videoTrack = pub.track;
        }
      }
    }
  }

  return {
    userId: id,
    nickname: profile?.nickname ?? p.name ?? id,
    avatarColor: profile?.avatarColor ?? '#43b8b0',
    isMuted: p.isMicrophoneEnabled === false,
    isSpeaking: activeSpeakers.has(id),
    videoTrack,
    screenShareTrack,
  };
}
```

- [ ] **Step 3: Add screen share toggle function**

```typescript
export async function toggleScreenShare(): Promise<void> {
  if (!liveKitRoom) return;

  const isSharing = liveKitRoom.localParticipant.isScreenShareEnabled;

  try {
    await liveKitRoom.localParticipant.setScreenShareEnabled(!isSharing, {
      audio: true,
      resolution: { width: 1920, height: 1080, frameRate: 15 },
    });
    _state = { ..._state, isScreenSharing: !isSharing };
    syncParticipants();
  } catch {
    // User cancelled the screen share picker — ignore
  }
}
```

- [ ] **Step 4: Add TrackSubscribed/Unsubscribed handlers for video tracks**

In `bindEvents`, update the existing TrackSubscribed handler and add video track handling:

```typescript
room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
  if (track.kind === Track.Kind.Audio) {
    const remoteTrack = track as RemoteAudioTrack;
    const el = remoteTrack.attach() as HTMLAudioElement;
    el.autoplay = true;
    el.volume = 1;
    el.muted = _state.deafened;
    remoteAudioElements.set(participant.identity, el);
  }
  // Video/screen share tracks — just sync participants so UI picks them up
  if (track.kind === Track.Kind.Video) {
    syncParticipants();
  }
});

room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
  if (track.kind === Track.Kind.Audio) {
    const remoteTrack = track as RemoteAudioTrack;
    remoteTrack.detach().forEach((el) => {
      if (el instanceof HTMLAudioElement) {
        el.srcObject = null;
        el.remove();
      }
    });
    remoteAudioElements.delete(participant.identity);
  }
  if (track.kind === Track.Kind.Video) {
    syncParticipants();
  }
});
```

Also update the `cleanupConnection` to reset screen sharing:

```typescript
function cleanupConnection(): void {
  // ... existing cleanup
  _state = { ..._state, isScreenSharing: false };
}
```

- [ ] **Step 5: Update imports**

Add to the imports at the top of voice.svelte.ts:

```typescript
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  type LocalVideoTrack,
} from 'livekit-client';
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/stores/voice.svelte.ts
git commit -m "feat: track screen share and video state in voice store"
```

---

### Task 3: Create Screen Share View Component

**Files:**
- Create: `web/src/lib/components/screen-share-view.svelte`

- [ ] **Step 1: Create the component**

```svelte
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
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/components/screen-share-view.svelte
git commit -m "feat: add screen share video component"
```

---

### Task 4: Full-Screen Voice Layout in Room View

**Files:**
- Modify: `web/src/lib/components/room-view.svelte`
- Modify: `web/src/lib/components/voice-controls.svelte`

This is the main UI change. When voice is active in the current room, the room view switches to a full-screen layout:
- Screen share takes the main area (if any)
- Participant grid shows below or beside the screen share
- Chat is a toggleable right sidebar
- Voice controls bar at the bottom

- [ ] **Step 1: Update room-view.svelte with full-screen voice mode**

Replace the entire `room-view.svelte` with the new layout that switches between chat-only and voice-active modes:

```svelte
<script lang="ts">
  import { getVoiceState, connectToRoom, disconnectFromRoom, toggleScreenShare, toggleMute, toggleDeafen } from '$lib/stores/voice.svelte';
  import { getChatMessages, sendMessage } from '$lib/stores/chat.svelte';
  import { getSessionState } from '$lib/stores/session.svelte';
  import { deleteRoom, getRooms } from '$lib/stores/rooms.svelte';
  import { goto } from '$app/navigation';
  import ParticipantTile from './participant-tile.svelte';
  import ScreenShareView from './screen-share-view.svelte';

  let { roomId }: { roomId: string } = $props();

  const voice = $derived(getVoiceState());
  const messages = $derived(getChatMessages());
  const session = $derived(getSessionState());

  let messageInput = $state('');
  let chatContainer: HTMLDivElement | undefined = $state();
  let showDeleteConfirm = $state(false);
  let showChat = $state(true);
  let joiningVoice = $state(false);

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
  <!-- VOICE ACTIVE: Full-screen layout -->
  <div class="flex flex-1 flex-col overflow-hidden">
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
```

- [ ] **Step 2: Update participant-tile.svelte with compact mode**

Add a `compact` prop for the strip view below screen shares:

```svelte
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
```

- [ ] **Step 3: Remove the old VoiceControls from room pages**

In `web/src/routes/rooms/+page.svelte` and `web/src/routes/rooms/[roomId]/+page.svelte`, remove the `VoiceControls` import and the `{#if voice.status !== 'disconnected'}` block since controls are now inline in `room-view.svelte`.

For `rooms/+page.svelte`: Remove VoiceControls import and usage.
For `rooms/[roomId]/+page.svelte`: Remove VoiceControls import and usage.

- [ ] **Step 4: Rebuild and test**

```bash
podman compose down && EXTERNAL_IP=127.0.0.1 podman compose up -d --build
```

Test:
1. Open a room — see chat-only view with "Join Voice" button
2. Click "Join Voice" — layout switches to full-screen with participant grid
3. Click screen share button — screen share appears in main area, participants move to strip
4. Toggle chat sidebar with chat button
5. Click disconnect — returns to chat-only view

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/room-view.svelte web/src/lib/components/participant-tile.svelte web/src/lib/components/screen-share-view.svelte web/src/routes/rooms/+page.svelte web/src/routes/rooms/\[roomId\]/+page.svelte
git commit -m "feat: full-screen voice UI with participant grid, screen sharing, and chat sidebar"
```
