import { api } from '$lib/api';

export interface Room {
	id: string;
	name: string;
	createdBy: string | null;
	maxParticipants: number;
	createdAt: string;
	participantCount: number;
}

export interface RoomParticipant {
	userId: string;
	nickname: string;
	avatarColor: string;
	joinedAt: string;
}

let _rooms = $state<Room[]>([]);
let _loading = $state(false);

export function getRooms(): Room[] {
	return _rooms;
}

export function isLoading(): boolean {
	return _loading;
}

export async function fetchRooms(): Promise<void> {
	_loading = true;
	try {
		const data = await api<{ rooms: Room[] }>('/api/rooms');
		_rooms = data.rooms;
	} finally {
		_loading = false;
	}
}

export async function createRoom(name: string, maxParticipants?: number): Promise<Room> {
	const data = await api<{ room: Room }>('/api/rooms', {
		method: 'POST',
		body: { name, maxParticipants },
	});
	return data.room;
}

export async function deleteRoom(roomId: string): Promise<void> {
	await api(`/api/rooms/${roomId}`, { method: 'DELETE' });
}

export async function fetchRoomDetails(roomId: string): Promise<{ room: Room; participants: RoomParticipant[] }> {
	return api(`/api/rooms/${roomId}`);
}

export function handleRoomCreated(room: Room): void {
	_rooms = [..._rooms.filter((r) => r.id !== room.id), { ...room, participantCount: room.participantCount ?? 0 }];
}

export function handleRoomDeleted(roomId: string): void {
	_rooms = _rooms.filter((r) => r.id !== roomId);
}

export function updateParticipantCount(roomId: string, delta: number): void {
	_rooms = _rooms.map((r) =>
		r.id === roomId ? { ...r, participantCount: Math.max(0, r.participantCount + delta) } : r,
	);
}
