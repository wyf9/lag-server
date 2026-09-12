import { getWsUrl } from '$lib/api';
import { handleRoomCreated, handleRoomDeleted, updateParticipantCount, type Room } from './rooms.svelte';
import { addMessage, type ChatMessage } from './chat.svelte';
import { addRoomAction, dismissRoomActions } from './notifications.svelte';

let ws: WebSocket | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _connected = $state(false);
let reconnectEnabled = false;
const desiredRooms = new Set<string>();

export function isWsConnected(): boolean {
	return _connected;
}

export function connectWs(): void {
	if (ws) return;
	reconnectEnabled = true;

	const url = getWsUrl();
	ws = new WebSocket(url);

	ws.onopen = () => {
		_connected = true;
		for (const roomId of desiredRooms) send({ type: 'subscribe_room', roomId });
		pingInterval = setInterval(() => {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'ping' }));
			}
		}, 30_000);
	};

	ws.onmessage = (event) => {
		try {
			const msg = JSON.parse(event.data);
			handleMessage(msg);
		} catch {}
	};

	ws.onclose = () => {
		cleanup();
		if (reconnectEnabled) reconnectTimer = setTimeout(() => connectWs(), 2000);
	};

	ws.onerror = () => {
		ws?.close();
	};
}

export function disconnectWs(): void {
	reconnectEnabled = false;
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	if (ws) {
		ws.onclose = null;
		ws.close();
	}
	cleanup();
}

export function subscribeRoom(roomId: string): void {
	desiredRooms.add(roomId);
	send({ type: 'subscribe_room', roomId });
}

export function unsubscribeRoom(roomId: string): void {
	desiredRooms.delete(roomId);
	send({ type: 'unsubscribe_room', roomId });
}

export function sendTypingStart(roomId: string): void {
	send({ type: 'typing_start', roomId });
}

export function sendTypingStop(roomId: string): void {
	send({ type: 'typing_stop', roomId });
}

function send(msg: unknown): void {
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(msg));
	}
}

function cleanup(): void {
	_connected = false;
	if (pingInterval) {
		clearInterval(pingInterval);
		pingInterval = null;
	}
	ws = null;
}

function handleMessage(msg: any): void {
	switch (msg.type) {
		case 'pong':
			break;
		case 'room_created':
			handleRoomCreated(msg.room as Room);
			break;
		case 'room_deleted':
			handleRoomDeleted(msg.roomId);
			break;
		case 'voice_room_user_joined':
			updateParticipantCount(msg.roomId, 1);
			break;
		case 'voice_room_user_left':
			updateParticipantCount(msg.roomId, -1);
			break;
		case 'room_message':
			addMessage(msg.message as ChatMessage);
			break;
		case 'room_invitation':
			addRoomAction({ type: 'invitation', roomId: msg.roomId, invitationId: msg.invitationId, role: msg.role });
			break;
		case 'room_ownership_transfer_requested':
			addRoomAction({ type: 'ownership-transfer', roomId: msg.roomId });
			break;
		case 'room_ownership_transferred':
			dismissRoomActions(msg.roomId);
			break;
	}
}
