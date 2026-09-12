export interface RoomAction {
	id: string;
	type: 'invitation' | 'ownership-transfer';
	roomId: string;
	invitationId?: string;
	role?: string;
}

let _actions = $state<RoomAction[]>([]);

export function getRoomActions(): RoomAction[] {
	return _actions;
}

export function addRoomAction(action: Omit<RoomAction, 'id'>): void {
	const key = `${action.type}:${action.roomId}:${action.invitationId ?? ''}`;
	if (_actions.some((item) => item.id === key)) return;
	_actions = [..._actions, { ...action, id: key }];
}

export function dismissRoomAction(id: string): void {
	_actions = _actions.filter((action) => action.id !== id);
}

export function dismissRoomActions(roomId: string): void {
	_actions = _actions.filter((action) => action.roomId !== roomId);
}

export async function loadPendingRoomActions(): Promise<void> {
	const [invitations, transfers] = await Promise.all([
		api<{ invitations: Array<{ id: string; roomId: string; permission: string }> }>('/api/room-invitations/pending'),
		api<{ transfers: Array<{ roomId: string }> }>('/api/room-ownership-transfers/pending'),
	]);
	for (const invitation of invitations.invitations) addRoomAction({ type: 'invitation', roomId: invitation.roomId, invitationId: invitation.id, role: invitation.permission });
	for (const transfer of transfers.transfers) addRoomAction({ type: 'ownership-transfer', roomId: transfer.roomId });
}
import { api } from '$lib/api';
