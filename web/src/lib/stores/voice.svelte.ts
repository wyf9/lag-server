import { api } from '$lib/api';
import {
	Room,
	RoomEvent,
	Track,
	type Participant,
	type RemoteAudioTrack,
	type RemoteVideoTrack,
	type LocalVideoTrack,
} from 'livekit-client';

export interface VoiceParticipant {
	userId: string;
	nickname: string;
	avatarColor: string;
	isMuted: boolean;
	isSpeaking: boolean;
	videoTrack: RemoteVideoTrack | LocalVideoTrack | null;
	screenShareTrack: RemoteVideoTrack | LocalVideoTrack | null;
}

export interface VoiceState {
	status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
	roomId: string | null;
	roomName: string | null;
	muted: boolean;
	deafened: boolean;
	isScreenSharing: boolean;
	participants: VoiceParticipant[];
	localSpeaking: boolean;
}

const initialState: VoiceState = {
	status: 'disconnected',
	roomId: null,
	roomName: null,
	muted: false,
	deafened: false,
	isScreenSharing: false,
	participants: [],
	localSpeaking: false,
};

export interface AudioSettings {
	echoCancellation: boolean;
	noiseSuppression: boolean;
	autoGainControl: boolean;
	bitrate: number;
}

const AUDIO_SETTINGS_KEY = 'lag-server:audio-settings';

const defaultAudioSettings: AudioSettings = {
	echoCancellation: true,
	noiseSuppression: false,
	autoGainControl: true,
	bitrate: 96_000,
};

export function getAudioSettings(): AudioSettings {
	if (typeof window === 'undefined') return { ...defaultAudioSettings };
	try {
		const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
		if (raw) return { ...defaultAudioSettings, ...JSON.parse(raw) };
	} catch {}
	return { ...defaultAudioSettings };
}

export function saveAudioSettings(settings: AudioSettings): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
}

let _state = $state<VoiceState>({ ...initialState });
let liveKitRoom: Room | null = null;
let remoteAudioElements = new Map<string, HTMLAudioElement>();
let participantDirectory = new Map<string, { nickname: string; avatarColor: string }>();
let activeSpeakers = new Set<string>();
let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let micGainNode: GainNode | null = null;
let localStream: MediaStream | null = null;
let speakingCheckInterval: ReturnType<typeof setInterval> | null = null;
let _connectId = 0;

const SPEAKING_THRESHOLD = 8;
const SPEAKING_CHECK_MS = 30;
const SPEAKING_HOLD_MS = 250;
const MAX_RECONNECT_ATTEMPTS = 8;

let _reconnectRoomId: string | null = null;
let _reconnectAttempts = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getVoiceState(): VoiceState {
	return _state;
}

function clearReconnect(): void {
	if (_reconnectTimer) {
		clearTimeout(_reconnectTimer);
		_reconnectTimer = null;
	}
	_reconnectRoomId = null;
	_reconnectAttempts = 0;
}

function scheduleReconnect(roomId: string): void {
	_reconnectRoomId = roomId;
	if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
		clearReconnect();
		_state = { ...initialState };
		return;
	}
	const delay = Math.min(1000 * Math.pow(1.5, _reconnectAttempts++), 30_000);
	_state = { ..._state, status: 'reconnecting' };
	_reconnectTimer = setTimeout(async () => {
		if (!_reconnectRoomId) return;
		try {
			await connectToRoom(_reconnectRoomId);
			clearReconnect();
		} catch {
			if (_reconnectRoomId) scheduleReconnect(_reconnectRoomId);
		}
	}, delay);
}

function participantToViewModel(p: Participant): VoiceParticipant {
	const id = p.identity;
	const profile = participantDirectory.get(id);

	let videoTrack: RemoteVideoTrack | LocalVideoTrack | null = null;
	let screenShareTrack: RemoteVideoTrack | LocalVideoTrack | null = null;

	for (const pub of p.videoTrackPublications.values()) {
		if (pub.track) {
			if (pub.source === Track.Source.ScreenShare && (pub.isSubscribed || p === liveKitRoom?.localParticipant)) {
				screenShareTrack = pub.track as RemoteVideoTrack | LocalVideoTrack;
			} else if (pub.source === Track.Source.Camera && (pub.isSubscribed || p === liveKitRoom?.localParticipant)) {
				videoTrack = pub.track as RemoteVideoTrack | LocalVideoTrack;
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

function syncParticipants(): void {
	if (!liveKitRoom) return;
	const list: VoiceParticipant[] = [];
	list.push(participantToViewModel(liveKitRoom.localParticipant));
	liveKitRoom.remoteParticipants.forEach((p) => list.push(participantToViewModel(p)));
	const deduped = list.filter((p, idx, arr) => arr.findIndex((a) => a.userId === p.userId) === idx);
	_state = { ..._state, participants: deduped };
}

function startSpeakingDetection(): void {
	if (!localStream) return;
	audioContext = new AudioContext();
	const source = audioContext.createMediaStreamSource(localStream);
	micGainNode = audioContext.createGain();
	micGainNode.gain.value = 1;
	source.connect(micGainNode);
	analyserNode = audioContext.createAnalyser();
	analyserNode.fftSize = 512;
	analyserNode.smoothingTimeConstant = 0.3;
	analyserNode.minDecibels = -90;
	analyserNode.maxDecibels = -10;
	micGainNode.connect(analyserNode);

	const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
	let wasSpeaking = false;
	let lastSpeakingTime = 0;

	speakingCheckInterval = setInterval(() => {
		if (!analyserNode || _state.muted) {
			if (_state.localSpeaking) {
				wasSpeaking = false;
				_state = { ..._state, localSpeaking: false };
			}
			return;
		}
		analyserNode.getByteFrequencyData(dataArray);
		let sum = 0;
		for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
		const avg = sum / dataArray.length;
		const now = performance.now();

		if (avg > SPEAKING_THRESHOLD) {
			lastSpeakingTime = now;
			if (!wasSpeaking) {
				wasSpeaking = true;
				_state = { ..._state, localSpeaking: true };
			}
		} else if (wasSpeaking && now - lastSpeakingTime > SPEAKING_HOLD_MS) {
			wasSpeaking = false;
			_state = { ..._state, localSpeaking: false };
		}
	}, SPEAKING_CHECK_MS);
}

function stopSpeakingDetection(): void {
	if (speakingCheckInterval) {
		clearInterval(speakingCheckInterval);
		speakingCheckInterval = null;
	}
	if (audioContext) {
		audioContext.close().catch(() => {});
		audioContext = null;
	}
	analyserNode = null;
	micGainNode = null;
}

function disposeRemoteAudio(): void {
	if (liveKitRoom) {
		for (const p of liveKitRoom.remoteParticipants.values()) {
			for (const pub of p.audioTrackPublications.values()) {
				if (pub.track && pub.track.kind === Track.Kind.Audio) {
					(pub.track as RemoteAudioTrack).detach();
				}
			}
		}
	}
	for (const el of remoteAudioElements.values()) {
		el.srcObject = null;
		el.remove();
	}
	remoteAudioElements = new Map();
}

function cleanupConnection(): void {
	stopSpeakingDetection();
	activeSpeakers.clear();
	participantDirectory = new Map();
	disposeRemoteAudio();
	localStream = null;
	if (liveKitRoom) {
		try {
			liveKitRoom.localParticipant.setMicrophoneEnabled(false).catch(() => {});
		} catch {}
		liveKitRoom.disconnect().catch(() => {});
		liveKitRoom.removeAllListeners();
		liveKitRoom = null;
	}
}

function bindEvents(room: Room, roomId: string): void {
	room.on(RoomEvent.ActiveSpeakersChanged, (participants: Participant[]) => {
		activeSpeakers = new Set(participants.map((p) => p.identity));
		syncParticipants();
	});

	room.on(RoomEvent.Reconnecting, () => {
		if (_state.roomId === roomId) _state = { ..._state, status: 'reconnecting' };
	});

	room.on(RoomEvent.Reconnected, () => {
		if (_state.roomId === roomId) {
			_state = { ..._state, status: 'connected' };
			syncParticipants();
		}
	});

	room.on(RoomEvent.ParticipantConnected, (p) => {
		participantDirectory.set(p.identity, {
			nickname: p.name ?? p.identity,
			avatarColor: '#43b8b0',
		});
		syncParticipants();
	});

	room.on(RoomEvent.ParticipantDisconnected, (p) => {
		activeSpeakers.delete(p.identity);
		syncParticipants();
	});

	room.on(RoomEvent.TrackMuted, () => syncParticipants());
	room.on(RoomEvent.TrackUnmuted, () => syncParticipants());

	room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
		if (track.kind === Track.Kind.Audio) {
			const remoteTrack = track as RemoteAudioTrack;
			const el = remoteTrack.attach() as HTMLAudioElement;
			el.autoplay = true;
			el.volume = 1;
			el.muted = _state.deafened;
			remoteAudioElements.set(participant.identity, el);
		}
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

	room.on(RoomEvent.Disconnected, () => {
		if (_state.roomId !== roomId) return;
		cleanupConnection();
		scheduleReconnect(roomId);
	});
}

export async function connectToRoom(roomId: string, roomName?: string): Promise<void> {
	if (liveKitRoom || localStream) cleanupConnection();
	const myConnectId = ++_connectId;
	_state = { ..._state, status: 'connecting', roomId, roomName: roomName ?? _state.roomName };

	try {
		const data = await api<{
			voiceUrl: string;
			participantToken: string;
			room: { id: string; name: string };
		}>(`/api/rooms/${roomId}/join`, { method: 'POST' });

		if (_connectId !== myConnectId) return;

		const settings = getAudioSettings();
		liveKitRoom = new Room({
			adaptiveStream: true,
			dynacast: true,
			audioCaptureDefaults: {
				echoCancellation: settings.echoCancellation,
				noiseSuppression: settings.noiseSuppression,
				autoGainControl: settings.autoGainControl,
				channelCount: 1,
				sampleRate: 48000,
			},
			publishDefaults: {
				audioEncoding: {
					maxBitrate: settings.bitrate,
				},
				dtx: false,
				red: true,
			} as NonNullable<ConstructorParameters<typeof Room>[0]>['publishDefaults'],
		});

		bindEvents(liveKitRoom, roomId);

		await liveKitRoom.connect(data.voiceUrl, data.participantToken, {
			websocketTimeout: 5_000,
			peerConnectionTimeout: 10_000,
			maxRetries: 1,
		});

		if (_connectId !== myConnectId) {
			liveKitRoom.disconnect();
			return;
		}

		syncParticipants();

		_state = {
			status: 'connected',
			roomId: data.room.id,
			roomName: data.room.name,
			muted: false,
			deafened: false,
			isScreenSharing: false,
			participants: _state.participants,
			localSpeaking: false,
		};

		// Enable mic after connected
		try {
			await liveKitRoom.localParticipant.setMicrophoneEnabled(true);
			for (const pub of liveKitRoom.localParticipant.audioTrackPublications.values()) {
				if (pub.source === Track.Source.Microphone && pub.track) {
					const msTrack = (pub.track as any).mediaStreamTrack as MediaStreamTrack | undefined;
					if (msTrack) {
						localStream = new MediaStream([msTrack]);
						startSpeakingDetection();
					}
					break;
				}
			}
		} catch {
			_state = { ..._state, muted: true };
		}
	} catch (e) {
		if (_connectId !== myConnectId) return;
		cleanupConnection();
		_state = { ...initialState };
		throw e;
	}
}

export async function disconnectFromRoom(): Promise<void> {
	++_connectId;
	clearReconnect();
	const roomId = _state.roomId;
	cleanupConnection();
	_state = { ...initialState };

	if (roomId) {
		try {
			await api(`/api/rooms/${roomId}/leave`, { method: 'DELETE' });
		} catch {}
	}
}

export function toggleMute(): void {
	const newMuted = !_state.muted;
	void liveKitRoom?.localParticipant.setMicrophoneEnabled(!newMuted);
	_state = { ..._state, muted: newMuted };
}

export function toggleDeafen(): void {
	const newDeafened = !_state.deafened;
	for (const el of remoteAudioElements.values()) el.muted = newDeafened;
	_state = {
		..._state,
		deafened: newDeafened,
		muted: newDeafened ? true : _state.muted,
	};
	if (newDeafened) void liveKitRoom?.localParticipant.setMicrophoneEnabled(false);
}

export async function toggleScreenShare(): Promise<void> {
	if (!liveKitRoom) return;
	const isSharing = liveKitRoom.localParticipant.isScreenShareEnabled;
	try {
		await liveKitRoom.localParticipant.setScreenShareEnabled(!isSharing, {
			audio: true,
			video: {
				resolution: { width: 1920, height: 1080, frameRate: 30 },
			},
			contentHint: 'detail',
			screenShareEncoding: {
				maxBitrate: 3_000_000,
				maxFramerate: 30,
			},
		} as Parameters<typeof liveKitRoom.localParticipant.setScreenShareEnabled>[1]);
		_state = { ..._state, isScreenSharing: !isSharing };
		syncParticipants();
	} catch {
		// User cancelled the screen share picker
	}
}
