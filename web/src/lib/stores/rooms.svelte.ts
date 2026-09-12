import { api } from '$lib/api';

export interface Room {
	id: string;
	name: string;
	createdBy: string | null;
	maxParticipants: number;
	createdAt: string;
	participantCount: number;
	visibility: 'public' | 'unlisted' | 'private';
	allowGuests: boolean;
	defaultRole: 'speaker' | 'listener';
	historyVisibility: 'all' | 'since_membership' | 'none';
	retention: '1' | '7' | '30' | 'forever';
	role: RoomRole | null;
}

export type RoomRole = 'owner' | 'moderator' | 'speaker' | 'listener';

export interface RoomOptions {
	name: string;
	maxParticipants: number;
	visibility: Room['visibility'];
	allowGuests: boolean;
	defaultRole: Room['defaultRole'];
	historyVisibility: Room['historyVisibility'];
	retention: Room['retention'];
}

export interface RoomParticipant {
	userId: string;
	nickname: string;
	avatarColor: string;
	joinedAt: string;
	role: RoomRole | null;
}

export interface RoomMember extends RoomParticipant { role: RoomRole; }

export interface RoomUserSearchResult { id: string; nickname: string; avatar: string; }
export interface RoomInvitation { id: string; roomId: string; permission: Exclude<RoomRole, 'owner'>; expiresAt: string; token?: string; }

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

export async function createRoom(options: RoomOptions): Promise<Room> {
	const data = await api<{ room: Room }>('/api/rooms', {
		method: 'POST',
		body: options,
	});
	return data.room;
}

export async function updateRoomSettings(roomId: string, options: Partial<RoomOptions>): Promise<Room> {
	const data = await api<{ room: Room }>(`/api/rooms/${roomId}/settings`, { method: 'PATCH', body: options });
	_rooms = _rooms.map((room) => room.id === roomId ? { ...room, ...data.room } : room);
	return data.room;
}

export async function fetchRoomMembers(roomId: string): Promise<RoomMember[]> {
	return (await api<{ members: RoomMember[] }>(`/api/rooms/${roomId}/members`)).members;
}

export async function updateMemberRole(roomId: string, userId: string, role: Exclude<RoomRole, 'owner'>): Promise<void> {
	await api(`/api/rooms/${roomId}/members/${userId}`, { method: 'PATCH', body: { role } });
}

export async function removeMember(roomId: string, userId: string, action: 'kick' | 'ban'): Promise<void> {
	await api(`/api/rooms/${roomId}/members/${userId}/remove`, { method: 'POST', body: { action } });
}

export async function searchRoomUsers(roomId: string, query: string): Promise<RoomUserSearchResult[]> {
	return (await api<{ users: RoomUserSearchResult[] }>(`/api/rooms/${roomId}/users/search?q=${encodeURIComponent(query)}`)).users;
}

export async function inviteRoomUser(roomId: string, userId: string, role: Exclude<RoomRole, 'owner'>, expiresInHours: number): Promise<RoomInvitation> {
	return (await api<{ invitation: RoomInvitation }>(`/api/rooms/${roomId}/invitations/users`, { method: 'POST', body: { userId, role, expiresInHours } })).invitation;
}

export async function createRoomInviteLink(roomId: string, role: Exclude<RoomRole, 'owner'>, expiresInHours: number, maxUses: number): Promise<RoomInvitation> {
	return (await api<{ invitation: RoomInvitation }>(`/api/rooms/${roomId}/invitations/links`, { method: 'POST', body: { role, expiresInHours, maxUses } })).invitation;
}

export async function transferRoomOwnership(roomId: string, userId: string): Promise<void> {
	await api(`/api/rooms/${roomId}/ownership-transfer`, { method: 'POST', body: { userId } });
}

export async function confirmRoomOwnership(roomId: string): Promise<void> {
	await api(`/api/rooms/${roomId}/ownership-transfer/confirm`, { method: 'POST' });
}

export async function unbanRoomUser(roomId: string, userId: string): Promise<void> {
	await api(`/api/rooms/${roomId}/bans/${userId}`, { method: 'DELETE' });
}

export async function acceptRoomInvitation(invitation: string): Promise<{ roomId: string }> {
	return api(`/api/room-invitations/${invitation}/accept`, { method: 'POST' });
}

export async function leaveRoom(roomId: string): Promise<void> {
	await api(`/api/rooms/${roomId}/leave`, { method: 'DELETE' });
}

export async function leaveRoomMembership(roomId: string): Promise<void> {
	await api(`/api/rooms/${roomId}/membership`, { method: 'DELETE' });
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
