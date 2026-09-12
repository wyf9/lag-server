import type { RoomRole } from './room-authorization.js';

type ManagerRole = RoomRole | null | undefined;

export function canManageRole(actorRole: ManagerRole, isAdmin: boolean, targetRole: string | null | undefined): boolean {
  if (isAdmin || actorRole === 'owner') return true;
  return actorRole === 'moderator' && targetRole !== null && targetRole !== undefined
    && targetRole !== 'owner' && targetRole !== 'moderator';
}

export function publicInvitation<T extends { tokenHash?: string | null }>(invitation: T): Omit<T, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...safe } = invitation;
  return safe;
}
