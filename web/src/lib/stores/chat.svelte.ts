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

export function getChatMessages(): ChatMessage[] {
	return _messages;
}

export function getCurrentChatRoomId(): string | null {
	return _currentRoomId;
}

export async function loadMessages(roomId: string): Promise<void> {
	_currentRoomId = roomId;
	try {
		const data = await api<{ messages: ChatMessage[] }>(`/api/rooms/${roomId}/messages`);
		if (_currentRoomId === roomId) {
			_messages = data.messages;
		}
	} catch {
		_messages = [];
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
}
