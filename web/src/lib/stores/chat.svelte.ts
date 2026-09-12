import { api } from '$lib/api';

export interface ChatMessage {
	id: string;
	roomId: string;
	userId: string | null;
	content: string;
	createdAt: string;
	nickname: string;
	avatarColor: string;
}

let _messages = $state<ChatMessage[]>([]);
let _currentRoomId = $state<string | null>(null);
let _nextCursor = $state<string | null>(null);
let _loadingOlder = $state(false);
let _loadError = $state('');

export function getChatMessages(): ChatMessage[] {
	return _messages;
}

export function getCurrentChatRoomId(): string | null {
	return _currentRoomId;
}

export function getChatPagination() {
	return { nextCursor: _nextCursor, loading: _loadingOlder, error: _loadError };
}

export async function loadMessages(roomId: string): Promise<void> {
	_currentRoomId = roomId;
	try {
		const data = await api<{ messages: ChatMessage[]; nextCursor: string | null }>(`/api/rooms/${roomId}/messages?limit=50`);
		if (_currentRoomId === roomId) {
			_messages = data.messages;
			_nextCursor = data.nextCursor;
			_loadError = '';
		}
	} catch {
		_messages = [];
		_nextCursor = null;
	}
}

export async function loadOlderMessages(roomId: string): Promise<number> {
	if (_loadingOlder || !_nextCursor || _currentRoomId !== roomId) return 0;
	_loadingOlder = true;
	_loadError = '';
	try {
		const data = await api<{ messages: ChatMessage[]; nextCursor: string | null }>(
			`/api/rooms/${roomId}/messages?limit=50&cursor=${encodeURIComponent(_nextCursor)}`,
		);
		if (_currentRoomId !== roomId) return 0;
		const known = new Set(_messages.map((message) => message.id));
		const older = data.messages.filter((message) => !known.has(message.id));
		_messages = [...older, ..._messages];
		_nextCursor = data.nextCursor;
		return older.length;
	} catch (cause) {
		_loadError = cause instanceof Error ? cause.message : 'Unable to load older messages';
		return 0;
	} finally {
		_loadingOlder = false;
	}
}

export async function sendMessage(roomId: string, content: string): Promise<void> {
	const data = await api<{ message: ChatMessage }>(`/api/rooms/${roomId}/messages`, {
		method: 'POST',
		body: { content },
	});
	if (data.message) {
		addMessage(data.message);
	}
}

export function addMessage(message: ChatMessage): void {
	if (message.roomId !== _currentRoomId) return;
	if (_messages.some((m) => m.id === message.id)) return;
	_messages = [..._messages, message];
}

export function clearChat(): void {
	_messages = [];
	_currentRoomId = null;
	_nextCursor = null;
	_loadingOlder = false;
	_loadError = '';
}
