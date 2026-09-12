import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { oauthIdentities, roleGrants, roomBans, roomMembers, users, voiceRooms } from '../db/schema.js';

export const ROOM_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export const ROOM_ROLES = ['owner', 'moderator', 'speaker', 'listener'] as const;
export const HISTORY_VISIBILITIES = ['all', 'since_membership', 'none'] as const;
export const RETENTIONS = ['7', '30', 'forever'] as const;
export type RoomRole = typeof ROOM_ROLES[number];

export class RoomAccessError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export async function getRoomAccess(db: Database, roomId: string, userId: string) {
  const [room] = await db.select().from(voiceRooms).where(eq(voiceRooms.id, roomId)).limit(1);
  if (!room) throw new RoomAccessError(404, 'Room not found');

  const [[user], [member], [ban], [identity], [adminGrant]] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId))).limit(1),
    db.select().from(roomBans).where(and(eq(roomBans.roomId, roomId), eq(roomBans.userId, userId))).limit(1),
    db.select({ id: oauthIdentities.id }).from(oauthIdentities).where(eq(oauthIdentities.userId, userId)).limit(1),
    db.select({ id: roleGrants.id }).from(roleGrants).where(and(eq(roleGrants.userId, userId), eq(roleGrants.role, 'platform_admin'), eq(roleGrants.scopeType, 'platform'))).limit(1),
  ]);
  if (!user) throw new RoomAccessError(401, 'User not found');
  const isAdmin = Boolean(adminGrant);
  const role = (member?.role ?? room.defaultRole) as RoomRole;
  return { room, user, member, ban, isAdmin, isGuest: !identity, role };
}

export function assertCanEnter(access: Awaited<ReturnType<typeof getRoomAccess>>): void {
  if (access.isAdmin) return;
  if (access.ban) throw new RoomAccessError(403, 'You are banned from this room');
  if (access.room.visibility === 'private' && (!access.member || access.isGuest)) {
    throw new RoomAccessError(403, 'Private rooms require non-guest membership');
  }
  if (access.isGuest && !access.room.allowGuests) {
    throw new RoomAccessError(403, 'Guests are not allowed in this room');
  }
}

export function assertOwner(access: Awaited<ReturnType<typeof getRoomAccess>>): void {
  if (!access.isAdmin && access.member?.role !== 'owner') throw new RoomAccessError(403, 'Owner role required');
}

export function assertModerator(access: Awaited<ReturnType<typeof getRoomAccess>>): void {
  if (!access.isAdmin && access.member?.role !== 'owner' && access.member?.role !== 'moderator') {
    throw new RoomAccessError(403, 'Moderator role required');
  }
}

export function canPublish(role: RoomRole, isAdmin = false): boolean {
  return isAdmin || role === 'owner' || role === 'moderator' || role === 'speaker';
}
