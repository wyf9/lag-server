import { createHash, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { and, asc, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  auditEvents, oauthIdentities, roleGrants, roomBans, roomInvites, roomMembers, roomMessages, roomOwnershipTransfers, users,
  voiceRoomParticipants, voiceRooms,
} from '../db/schema.js';
import {
  HISTORY_VISIBILITIES, RETENTIONS, ROOM_VISIBILITIES, RoomAccessError,
  assertCanEnter, assertModerator, assertOwner, canPublish, getRoomAccess,
  type RoomRole,
} from '../lib/room-authorization.js';
import { canManageRole, publicInvitation } from '../lib/room-management.js';
import { createVoiceToken, removeVoiceParticipant, updateVoicePermissions } from '../lib/voice-provider.js';
import { broadcastToRoom, broadcastToUser, disconnectRoomSubscribers, disconnectUser } from './ws.js';

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === 'string' && values.includes(value as T);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validHours = (value: unknown, fallback: number) => value === undefined
  ? fallback
  : typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 720 ? value : null;
const invalidUuid = (value: string) => !UUID_PATTERN.test(value);

function accessError(reply: FastifyReply, error: unknown) {
  if (error instanceof RoomAccessError) return reply.code(error.statusCode).send({ error: error.message });
  throw error;
}

const roomRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/rooms', async (request) => {
    const rooms = await fastify.db.select({
      id: voiceRooms.id, name: voiceRooms.name, createdBy: voiceRooms.createdBy,
      maxParticipants: voiceRooms.maxParticipants, visibility: voiceRooms.visibility,
      allowGuests: voiceRooms.allowGuests, defaultRole: voiceRooms.defaultRole,
      historyVisibility: voiceRooms.historyVisibility, retention: voiceRooms.retention,
      createdAt: voiceRooms.createdAt,
      participantCount: sql<number>`(SELECT COUNT(*)::int FROM voice_room_participants p WHERE p.room_id = ${voiceRooms.id})`,
      role: roomMembers.role,
    }).from(voiceRooms).leftJoin(roomMembers, and(
      eq(roomMembers.roomId, voiceRooms.id), eq(roomMembers.userId, request.userId),
    )).where(or(
      eq(voiceRooms.visibility, 'public'), sql`${roomMembers.userId} IS NOT NULL`,
      sql`EXISTS (SELECT 1 FROM ${roleGrants} rg WHERE rg.user_id = ${request.userId} AND rg.role = 'platform_admin' AND rg.scope_type = 'platform')`,
    ))
      .orderBy(asc(voiceRooms.createdAt), asc(voiceRooms.id));
    return { rooms };
  });

  fastify.post<{ Body: { name: string; maxParticipants?: number; visibility?: string; allowGuests?: boolean; defaultRole?: string; historyVisibility?: string; retention?: string } }>(
    '/api/rooms', async (request, reply) => {
      const { name, maxParticipants = 50, visibility = 'public', allowGuests = true, defaultRole, historyVisibility = 'all', retention = '30' } = request.body ?? {};
      if (!name?.trim() || name.trim().length > 64) return reply.code(400).send({ error: 'Room name must be between 1 and 64 characters' });
      if (maxParticipants < 1 || maxParticipants > 100) return reply.code(400).send({ error: 'Max participants must be between 1 and 100' });
      if (!isOneOf(visibility, ROOM_VISIBILITIES)) return reply.code(400).send({ error: 'Invalid visibility' });
      const resolvedDefaultRole = defaultRole ?? (visibility === 'private' ? 'speaker' : 'listener');
      if (!isOneOf(resolvedDefaultRole, ['speaker', 'listener'] as const)) return reply.code(400).send({ error: 'Invalid default role' });
      if (!isOneOf(historyVisibility, HISTORY_VISIBILITIES)) return reply.code(400).send({ error: 'Invalid history visibility' });
      if (!isOneOf(retention, RETENTIONS)) return reply.code(400).send({ error: 'Invalid retention' });
      if (visibility === 'private' || !allowGuests) {
        const [identity] = await fastify.db.select({ id: oauthIdentities.id }).from(oauthIdentities).where(eq(oauthIdentities.userId, request.userId)).limit(1);
        if (!identity) return reply.code(403).send({ error: 'OAuth account required for guest-restricted rooms' });
      }

      const room = await fastify.db.transaction(async (tx) => {
        const [created] = await tx.insert(voiceRooms).values({
          name: name.trim(), createdBy: request.userId, maxParticipants, visibility, allowGuests,
          defaultRole: resolvedDefaultRole, historyVisibility, retention,
        }).returning();
        await tx.insert(roomMembers).values({ roomId: created.id, userId: request.userId, role: 'owner' });
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.create', targetType: 'room', targetId: created.id, metadata: { visibility: created.visibility }, clientIp: request.clientIp });
        return created;
      });
      if (room.visibility === 'public') broadcastToRoom(null, { type: 'room_created', room: { ...room, participantCount: 0, role: 'owner' } });
      return reply.code(201).send({ room: { ...room, role: 'owner' } });
    },
  );

  fastify.get<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId);
      assertCanEnter(access);
      const participants = await fastify.db.select({
        userId: voiceRoomParticipants.userId, nickname: users.nickname, avatarColor: users.avatarColor,
        joinedAt: voiceRoomParticipants.joinedAt, role: roomMembers.role,
      }).from(voiceRoomParticipants).innerJoin(users, eq(users.id, voiceRoomParticipants.userId))
        .leftJoin(roomMembers, and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, users.id)))
        .where(eq(voiceRoomParticipants.roomId, request.params.id));
      return { room: { ...access.room, role: access.role }, participants };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/rooms/:id/settings', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId);
      assertOwner(access);
      const body = request.body ?? {};
      if (body.visibility !== undefined && !isOneOf(body.visibility, ROOM_VISIBILITIES)) return reply.code(400).send({ error: 'Invalid visibility' });
      if (body.defaultRole !== undefined && !isOneOf(body.defaultRole, ['speaker', 'listener'] as const)) return reply.code(400).send({ error: 'Invalid default role' });
      if (body.historyVisibility !== undefined && !isOneOf(body.historyVisibility, HISTORY_VISIBILITIES)) return reply.code(400).send({ error: 'Invalid history visibility' });
      if (body.retention !== undefined && !isOneOf(body.retention, RETENTIONS)) return reply.code(400).send({ error: 'Invalid retention' });
      if (body.allowGuests !== undefined && typeof body.allowGuests !== 'boolean') return reply.code(400).send({ error: 'allowGuests must be boolean' });
      if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 64)) return reply.code(400).send({ error: 'Invalid room name' });
      if (body.maxParticipants !== undefined && (typeof body.maxParticipants !== 'number' || body.maxParticipants < 1 || body.maxParticipants > 100)) return reply.code(400).send({ error: 'Invalid max participants' });
      if (access.isGuest && (body.visibility === 'private' || body.allowGuests === false)) return reply.code(403).send({ error: 'OAuth account required for guest-restricted rooms' });
      const changes: Record<string, unknown> = {};
      for (const key of ['visibility', 'defaultRole', 'historyVisibility', 'retention', 'allowGuests', 'maxParticipants']) {
        if (body[key] !== undefined) changes[key] = body[key];
      }
      if (body.name !== undefined) changes.name = (body.name as string).trim();
      if (!Object.keys(changes).length) return { room: access.room };
      const [room] = await fastify.db.update(voiceRooms).set(changes).where(eq(voiceRooms.id, request.params.id)).returning();
      await fastify.db.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.settings.update', targetType: 'room', targetId: request.params.id, metadata: { keys: Object.keys(changes) }, clientIp: request.clientIp });
      broadcastToRoom(request.params.id, { type: 'room_settings_updated', room });
      if (body.visibility !== undefined || body.allowGuests !== undefined || body.defaultRole !== undefined) disconnectRoomSubscribers(request.params.id);
      return { room };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.delete<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertOwner(access);
      await fastify.db.transaction(async (tx) => {
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.delete', targetType: 'room', targetId: request.params.id, metadata: { name: access.room.name }, clientIp: request.clientIp });
        await tx.delete(voiceRooms).where(eq(voiceRooms.id, request.params.id));
      });
      broadcastToRoom(null, { type: 'room_deleted', roomId: request.params.id });
      return { success: true };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.post<{ Params: { id: string } }>('/api/rooms/:id/join', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertCanEnter(access);
      const joined = await fastify.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM voice_rooms WHERE id = ${request.params.id}::uuid FOR UPDATE`);
        const [count] = await tx.select({ count: sql<number>`COUNT(*)::int` }).from(voiceRoomParticipants).where(eq(voiceRoomParticipants.roomId, request.params.id));
        const [existing] = await tx.select({ userId: voiceRoomParticipants.userId }).from(voiceRoomParticipants).where(and(eq(voiceRoomParticipants.roomId, request.params.id), eq(voiceRoomParticipants.userId, request.userId))).limit(1);
        if (!existing && count.count >= access.room.maxParticipants) return false;
        await tx.delete(voiceRoomParticipants).where(eq(voiceRoomParticipants.userId, request.userId));
        await tx.insert(roomMembers).values({ roomId: request.params.id, userId: request.userId, role: access.role }).onConflictDoNothing();
        await tx.insert(voiceRoomParticipants).values({ roomId: request.params.id, userId: request.userId }).onConflictDoNothing();
        return true;
      });
      if (!joined) return reply.code(409).send({ error: 'Room is full' });
      const publish = canPublish(access.role, access.isAdmin);
      const token = await createVoiceToken({ roomId: request.params.id, userId: request.userId, displayName: access.user.nickname, canPublish: publish });
      broadcastToRoom(request.params.id, { type: 'voice_room_user_joined', roomId: request.params.id, userId: request.userId, nickname: access.user.nickname, avatarColor: access.user.avatarColor, role: access.role });
      return { ...token, canPublish: publish, role: access.role, room: { id: access.room.id, name: access.room.name } };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.delete<{ Params: { id: string } }>('/api/rooms/:id/leave', async (request) => {
    await fastify.db.delete(voiceRoomParticipants).where(and(eq(voiceRoomParticipants.roomId, request.params.id), eq(voiceRoomParticipants.userId, request.userId)));
    broadcastToRoom(request.params.id, { type: 'voice_room_user_left', roomId: request.params.id, userId: request.userId });
    return { success: true };
  });

  fastify.delete<{ Params: { id: string } }>('/api/rooms/:id/membership', async (request, reply) => {
    const [member] = await fastify.db.select({ role: roomMembers.role }).from(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.userId))).limit(1);
    if (!member) return reply.code(404).send({ error: 'Membership not found' });
    if (member.role === 'owner') return reply.code(409).send({ error: 'Room owners must transfer ownership before leaving' });
    await fastify.db.transaction(async (tx) => {
      await tx.delete(voiceRoomParticipants).where(and(eq(voiceRoomParticipants.roomId, request.params.id), eq(voiceRoomParticipants.userId, request.userId)));
      await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.userId)));
      await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.membership.leave', targetType: 'room', targetId: request.params.id, metadata: {}, clientIp: request.clientIp });
    });
    await removeVoiceParticipant(request.params.id, request.userId);
    broadcastToRoom(request.params.id, { type: 'room_member_left', roomId: request.params.id, userId: request.userId });
    return { success: true };
  });

  fastify.get<{ Params: { id: string }; Querystring: { cursor?: string; before?: string; limit?: string } }>('/api/rooms/:id/messages', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertCanEnter(access);
      if (access.room.historyVisibility === 'none') return { messages: [], nextCursor: null };
      if (access.room.retention !== 'forever') {
        await fastify.db.delete(roomMessages).where(and(
          eq(roomMessages.roomId, request.params.id),
          sql`${roomMessages.createdAt} < NOW() - (${Number(access.room.retention)} * INTERVAL '1 day')`,
        ));
      }
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? '50', 10) || 50, 1), 100);
      let cursorDate: Date | undefined; let cursorId: string | undefined;
      if (request.query.cursor) {
        try { const parsed = JSON.parse(Buffer.from(request.query.cursor, 'base64url').toString()) as { at: string; id: string }; cursorDate = new Date(parsed.at); cursorId = parsed.id; } catch { return reply.code(400).send({ error: 'Invalid cursor' }); }
      } else if (request.query.before) cursorDate = new Date(request.query.before);
      if (cursorDate && Number.isNaN(cursorDate.getTime())) return reply.code(400).send({ error: 'Invalid cursor date' });
      const conditions = [eq(roomMessages.roomId, request.params.id)];
      if (cursorDate) conditions.push(cursorId
        ? sql`(${roomMessages.createdAt}, ${roomMessages.id}) < (${cursorDate}, ${cursorId}::uuid)`
        : sql`${roomMessages.createdAt} < ${cursorDate}`);
      if (access.room.historyVisibility === 'since_membership' && !access.isAdmin) {
        if (!access.member) return { messages: [], nextCursor: null };
        conditions.push(sql`${roomMessages.createdAt} >= ${access.member.joinedAt}`);
      }
      if (access.room.retention !== 'forever') conditions.push(gt(roomMessages.createdAt, sql`NOW() - (${Number(access.room.retention)} * INTERVAL '1 day')`));
      const rows = await fastify.db.select({ id: roomMessages.id, roomId: roomMessages.roomId, userId: roomMessages.userId, content: roomMessages.content, createdAt: roomMessages.createdAt, nickname: users.nickname, avatarColor: users.avatarColor })
        .from(roomMessages).leftJoin(users, eq(users.id, roomMessages.userId)).where(and(...conditions))
        .orderBy(desc(roomMessages.createdAt), desc(roomMessages.id)).limit(limit + 1);
      const hasMore = rows.length > limit; const page = rows.slice(0, limit); const last = page.at(-1);
      return { messages: page.reverse(), nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.post<{ Params: { id: string }; Body: { content: string } }>('/api/rooms/:id/messages', async (request, reply) => {
    try {
      const content = request.body?.content; if (!content?.trim() || content.length > 2000) return reply.code(400).send({ error: 'Message must be between 1 and 2000 characters' });
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertCanEnter(access);
      const [message] = await fastify.db.insert(roomMessages).values({ roomId: request.params.id, userId: request.userId, content: content.trim() }).returning();
      const fullMessage = { ...message, nickname: access.user.nickname, avatarColor: access.user.avatarColor };
      broadcastToRoom(request.params.id, { type: 'room_message', message: fullMessage });
      return reply.code(201).send({ message: fullMessage });
    } catch (error) { return accessError(reply, error); }
  });

  fastify.get<{ Params: { id: string } }>('/api/rooms/:id/members', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId);
      if (!access.member && !access.isAdmin) throw new RoomAccessError(403, 'Membership required');
      const members = await fastify.db.select({ userId: roomMembers.userId, role: roomMembers.role, joinedAt: roomMembers.joinedAt, nickname: users.nickname, avatarColor: users.avatarColor })
        .from(roomMembers).innerJoin(users, eq(users.id, roomMembers.userId)).where(eq(roomMembers.roomId, request.params.id)).orderBy(asc(roomMembers.joinedAt));
      return { members };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.get<{ Params: { id: string }; Querystring: { q?: string } }>('/api/rooms/:id/users/search', async (request, reply) => {
    const q = request.query.q?.trim();
    if (!q || q.length < 2) return reply.code(400).send({ error: 'Search must be at least 2 characters' });
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      const results = await fastify.db.select({ id: users.id, nickname: users.nickname, avatar: users.avatarColor })
        .from(users).innerJoin(oauthIdentities, eq(oauthIdentities.userId, users.id))
        .where(and(eq(users.disabled, false), or(ilike(users.nickname, `%${q}%`), eq(users.email, q))))
        .orderBy(asc(users.nickname), asc(users.id)).limit(20);
      return { users: results };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.patch<{ Params: { id: string; userId: string }; Body: { role: string } }>('/api/rooms/:id/members/:userId', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      if (!isOneOf(request.body?.role, ['moderator', 'speaker', 'listener'] as const)) return reply.code(400).send({ error: 'Invalid role; ownership uses the transfer endpoint' });
      const [target] = await fastify.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.params.userId))).limit(1);
      if (!target) return reply.code(404).send({ error: 'Member not found' });
      if (target.role === 'owner') return reply.code(409).send({ error: 'Owner role can only change through ownership transfer' });
      if (!access.isAdmin && access.member?.role === 'moderator' && (target.role === 'moderator' || request.body.role === 'moderator')) return reply.code(403).send({ error: 'Only owners manage moderators' });
      const [member] = await fastify.db.update(roomMembers).set({ role: request.body.role }).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.params.userId))).returning();
      try { await updateVoicePermissions(request.params.id, request.params.userId, canPublish(member.role as RoomRole)); }
      catch (error) {
        await fastify.db.update(roomMembers).set({ role: target.role }).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.params.userId)));
        throw error;
      }
      await fastify.db.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.member.role_update', targetType: 'user', targetId: request.params.userId, metadata: { roomId: request.params.id, previousRole: target.role, role: member.role }, clientIp: request.clientIp });
      broadcastToRoom(request.params.id, { type: 'room_member_role_updated', roomId: request.params.id, userId: request.params.userId, role: member.role });
      return { member };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.post<{ Params: { id: string; userId: string }; Body: { action: 'kick' | 'ban' } }>('/api/rooms/:id/members/:userId/remove', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      if (request.body?.action !== 'kick' && request.body?.action !== 'ban') return reply.code(400).send({ error: 'Action must be kick or ban' });
      const [target] = await fastify.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.params.userId))).limit(1);
      if (!target) return reply.code(404).send({ error: 'Member not found' });
      if (target?.role === 'owner' || (!access.isAdmin && access.member?.role === 'moderator' && target?.role === 'moderator')) return reply.code(403).send({ error: 'Cannot remove this member' });
      await fastify.db.transaction(async (tx) => {
        await tx.delete(voiceRoomParticipants).where(and(eq(voiceRoomParticipants.roomId, request.params.id), eq(voiceRoomParticipants.userId, request.params.userId)));
        if (request.body.action === 'kick') await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.params.userId)));
        if (request.body.action === 'ban') {
          await tx.insert(roomBans).values({ roomId: request.params.id, userId: request.params.userId, bannedBy: request.userId, bannedRole: target.role }).onConflictDoUpdate({ target: [roomBans.roomId, roomBans.userId], set: { bannedBy: request.userId, bannedRole: target.role, createdAt: new Date() } });
          await tx.delete(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.params.userId)));
        }
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: `room.member.${request.body.action}`, targetType: 'user', targetId: request.params.userId, metadata: { roomId: request.params.id }, clientIp: request.clientIp });
      });
      await removeVoiceParticipant(request.params.id, request.params.userId);
      broadcastToUser(request.params.userId, { type: request.body.action === 'ban' ? 'room_banned' : 'room_kicked', roomId: request.params.id });
      disconnectUser(request.params.userId, 4003, request.body.action === 'ban' ? 'Banned from room' : 'Removed from room');
      broadcastToRoom(request.params.id, { type: 'voice_room_user_left', roomId: request.params.id, userId: request.params.userId });
      return { success: true };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.get<{ Params: { id: string } }>('/api/rooms/:id/bans', async (request, reply) => {
    try {
      if (invalidUuid(request.params.id)) return reply.code(400).send({ error: 'Invalid room ID' });
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      const rows = await fastify.db.select({
        userId: roomBans.userId, nickname: users.nickname, avatarColor: users.avatarColor,
        bannedBy: roomBans.bannedBy, role: roomBans.bannedRole, createdAt: roomBans.createdAt,
      }).from(roomBans).innerJoin(users, eq(users.id, roomBans.userId))
        .where(eq(roomBans.roomId, request.params.id)).orderBy(desc(roomBans.createdAt), asc(roomBans.userId));
      return { bans: rows.filter((ban) => canManageRole(access.member?.role as RoomRole | undefined, access.isAdmin, ban.role)) };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.delete<{ Params: { id: string; userId: string } }>('/api/rooms/:id/bans/:userId', async (request, reply) => {
    try {
      if (invalidUuid(request.params.id)) return reply.code(400).send({ error: 'Invalid room ID' });
      if (invalidUuid(request.params.userId)) return reply.code(400).send({ error: 'Invalid user ID' });
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      const [ban] = await fastify.db.select().from(roomBans).where(and(eq(roomBans.roomId, request.params.id), eq(roomBans.userId, request.params.userId))).limit(1);
      if (!ban) return reply.code(404).send({ error: 'Ban not found' });
      if (!canManageRole(access.member?.role as RoomRole | undefined, access.isAdmin, ban.bannedRole)) return reply.code(403).send({ error: 'Only owners manage moderator bans' });
      await fastify.db.transaction(async (tx) => {
        await tx.delete(roomBans).where(and(eq(roomBans.roomId, request.params.id), eq(roomBans.userId, request.params.userId)));
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.member.unban', targetType: 'user', targetId: request.params.userId, metadata: { roomId: request.params.id, role: ban.bannedRole }, clientIp: request.clientIp });
      });
      return { success: true };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.get<{ Params: { id: string } }>('/api/rooms/:id/invitations', async (request, reply) => {
    try {
      if (invalidUuid(request.params.id)) return reply.code(400).send({ error: 'Invalid room ID' });
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      const invitations = await fastify.db.select({
        id: roomInvites.id, roomId: roomInvites.roomId, invitedUserId: roomInvites.invitedUserId,
        invitedNickname: users.nickname, permission: roomInvites.permission, expiresAt: roomInvites.expiresAt,
        maxUses: roomInvites.maxUses, useCount: roomInvites.useCount, createdBy: roomInvites.createdBy, createdAt: roomInvites.createdAt,
      }).from(roomInvites).leftJoin(users, eq(users.id, roomInvites.invitedUserId)).where(and(
        eq(roomInvites.roomId, request.params.id), gt(roomInvites.expiresAt, new Date()),
        or(isNull(roomInvites.maxUses), sql`${roomInvites.useCount} < ${roomInvites.maxUses}`),
      )).orderBy(desc(roomInvites.createdAt), asc(roomInvites.id));
      return { invitations: invitations.filter((invite) => canManageRole(access.member?.role as RoomRole | undefined, access.isAdmin, invite.permission)) };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.delete<{ Params: { id: string; invitationId: string } }>('/api/rooms/:id/invitations/:invitationId', async (request, reply) => {
    try {
      if (invalidUuid(request.params.id)) return reply.code(400).send({ error: 'Invalid room ID' });
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      if (invalidUuid(request.params.invitationId)) return reply.code(400).send({ error: 'Invalid invitation ID' });
      const [invite] = await fastify.db.select({ id: roomInvites.id, permission: roomInvites.permission }).from(roomInvites).where(and(eq(roomInvites.roomId, request.params.id), eq(roomInvites.id, request.params.invitationId))).limit(1);
      if (!invite) return reply.code(404).send({ error: 'Invitation not found' });
      if (!canManageRole(access.member?.role as RoomRole | undefined, access.isAdmin, invite.permission)) return reply.code(403).send({ error: 'Only owners manage moderator invitations' });
      await fastify.db.transaction(async (tx) => {
        await tx.delete(roomInvites).where(eq(roomInvites.id, invite.id));
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.invitation.revoke', targetType: 'invitation', targetId: invite.id, metadata: { roomId: request.params.id, role: invite.permission }, clientIp: request.clientIp });
      });
      return { success: true };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.post<{ Params: { id: string }; Body: { userId: string; role?: string; expiresInHours?: number } }>('/api/rooms/:id/invitations/users', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      const role = request.body?.role ?? access.room.defaultRole;
      const expiresInHours = validHours(request.body?.expiresInHours, 168);
      if (!isOneOf(role, ['moderator', 'speaker', 'listener'] as const)) return reply.code(400).send({ error: 'Invalid role' });
      if (!request.body?.userId || !UUID_PATTERN.test(request.body.userId)) return reply.code(400).send({ error: 'Invalid user ID' });
      if (expiresInHours === null) return reply.code(400).send({ error: 'expiresInHours must be an integer between 1 and 720' });
      if (!access.isAdmin && access.member?.role !== 'owner' && role === 'moderator') return reply.code(403).send({ error: 'Only owners invite moderators' });
      const [target] = await fastify.db.select({ id: users.id }).from(users).innerJoin(oauthIdentities, eq(oauthIdentities.userId, users.id)).where(and(eq(users.id, request.body.userId), eq(users.disabled, false))).limit(1);
      if (!target) return reply.code(404).send({ error: 'OAuth user not found' });
      const [existing] = await fastify.db.select({ userId: roomMembers.userId }).from(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, target.id))).limit(1);
      if (existing) return reply.code(409).send({ error: 'User is already a room member' });
      const invite = await fastify.db.transaction(async (tx) => {
        const [created] = await tx.insert(roomInvites).values({ roomId: request.params.id, invitedUserId: target.id, permission: role, createdBy: request.userId, expiresAt: new Date(Date.now() + expiresInHours * 3_600_000), maxUses: 1 }).returning();
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.invitation.create', targetType: 'invitation', targetId: created.id, metadata: { roomId: request.params.id, kind: 'direct', role, invitedUserId: target.id }, clientIp: request.clientIp });
        return created;
      });
      broadcastToUser(target.id, { type: 'room_invitation', invitationId: invite.id, roomId: request.params.id, role });
      return reply.code(201).send({ invitation: publicInvitation(invite) });
    } catch (error) { return accessError(reply, error); }
  });

  fastify.post<{ Params: { id: string }; Body: { role?: string; expiresInHours?: number; maxUses?: number } }>('/api/rooms/:id/invitations/links', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertModerator(access);
      const role = request.body?.role ?? access.room.defaultRole; const maxUses = request.body?.maxUses ?? 1;
      const expiresInHours = validHours(request.body?.expiresInHours, 24);
      if (!isOneOf(role, ['moderator', 'speaker', 'listener'] as const) || typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) return reply.code(400).send({ error: 'Invalid invitation options' });
      if (expiresInHours === null) return reply.code(400).send({ error: 'expiresInHours must be an integer between 1 and 720' });
      if (!access.isAdmin && access.member?.role !== 'owner' && role === 'moderator') return reply.code(403).send({ error: 'Only owners invite moderators' });
      const token = randomBytes(32).toString('base64url');
      const invite = await fastify.db.transaction(async (tx) => {
        const [created] = await tx.insert(roomInvites).values({ roomId: request.params.id, tokenHash: hashToken(token), permission: role, createdBy: request.userId, expiresAt: new Date(Date.now() + expiresInHours * 3_600_000), maxUses }).returning();
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.invitation.create', targetType: 'invitation', targetId: created.id, metadata: { roomId: request.params.id, kind: 'link', role, maxUses }, clientIp: request.clientIp });
        return created;
      });
      return reply.code(201).send({ invitation: { ...publicInvitation(invite), token } });
    } catch (error) { return accessError(reply, error); }
  });

  fastify.get('/api/room-invitations/pending', async (request) => {
    const invitations = await fastify.db.select({
      id: roomInvites.id, roomId: roomInvites.roomId, roomName: voiceRooms.name,
      permission: roomInvites.permission, expiresAt: roomInvites.expiresAt, createdBy: roomInvites.createdBy, createdAt: roomInvites.createdAt,
    }).from(roomInvites).innerJoin(voiceRooms, eq(voiceRooms.id, roomInvites.roomId)).where(and(
      eq(roomInvites.invitedUserId, request.userId), gt(roomInvites.expiresAt, new Date()),
      sql`${roomInvites.useCount} < ${roomInvites.maxUses}`,
      sql`NOT EXISTS (SELECT 1 FROM ${roomMembers} member WHERE member.room_id = ${roomInvites.roomId} AND member.user_id = ${request.userId})`,
    )).orderBy(asc(roomInvites.expiresAt), asc(roomInvites.id));
    return { invitations };
  });

  fastify.post<{ Params: { invitation: string } }>('/api/room-invitations/:invitation/accept', async (request, reply) => {
    const invitation = request.params.invitation;
    const isId = UUID_PATTERN.test(invitation);
    const [invite] = await fastify.db.select().from(roomInvites).where(isId
      ? eq(roomInvites.id, invitation)
      : eq(roomInvites.tokenHash, hashToken(invitation))).limit(1);
    if (!invite || invite.expiresAt <= new Date() || (invite.maxUses !== null && invite.useCount >= invite.maxUses)) return reply.code(404).send({ error: 'Invitation is invalid or expired' });
    if (invite.invitedUserId && invite.invitedUserId !== request.userId) return reply.code(403).send({ error: 'Invitation belongs to another user' });
    const [ban] = await fastify.db.select({ userId: roomBans.userId }).from(roomBans).where(and(eq(roomBans.roomId, invite.roomId), eq(roomBans.userId, request.userId))).limit(1);
    if (ban) return reply.code(403).send({ error: 'You are banned from this room' });
    const [identity] = await fastify.db.select({ id: oauthIdentities.id }).from(oauthIdentities).where(eq(oauthIdentities.userId, request.userId)).limit(1);
    if (invite.invitedUserId && !identity) return reply.code(403).send({ error: 'OAuth account required to accept this invitation' });
    const [room] = await fastify.db.select().from(voiceRooms).where(eq(voiceRooms.id, invite.roomId)).limit(1);
    if (!room) return reply.code(404).send({ error: 'Invitation is invalid or expired' });
    if (!identity && (room.visibility === 'private' || !room.allowGuests)) return reply.code(403).send({ error: 'Guests are not allowed in this room' });
    try {
      await fastify.db.transaction(async (tx) => {
        const joined = await tx.insert(roomMembers).values({ roomId: invite.roomId, userId: request.userId, role: invite.permission, invitedBy: invite.createdBy }).onConflictDoNothing().returning({ userId: roomMembers.userId });
        if (!joined.length) throw new RoomAccessError(409, 'User is already a room member');
        const claimed = await tx.update(roomInvites).set({ useCount: sql`${roomInvites.useCount} + 1` }).where(and(eq(roomInvites.id, invite.id), gt(roomInvites.expiresAt, new Date()), or(isNull(roomInvites.maxUses), sql`${roomInvites.useCount} < ${roomInvites.maxUses}`))).returning({ id: roomInvites.id });
        if (!claimed.length) throw new RoomAccessError(409, 'Invitation has already been used');
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.invitation.accept', targetType: 'invitation', targetId: invite.id, metadata: { roomId: invite.roomId, role: invite.permission }, clientIp: request.clientIp });
      });
      return { success: true, roomId: invite.roomId, role: invite.permission };
    } catch (error) { return accessError(reply, error); }
  });

  fastify.post<{ Params: { id: string }; Body: { userId: string } }>('/api/rooms/:id/ownership-transfer', async (request, reply) => {
    try {
      const access = await getRoomAccess(fastify.db, request.params.id, request.userId); assertOwner(access);
      if (!request.body?.userId || !UUID_PATTERN.test(request.body.userId)) return reply.code(400).send({ error: 'Invalid user ID' });
      const [target] = await fastify.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, request.body.userId))).limit(1);
      if (!target) return reply.code(404).send({ error: 'Ownership recipient must be a room member' });
      if (target.userId === request.userId) return reply.code(400).send({ error: 'User already owns the room' });
      const [owner] = await fastify.db.select().from(roomMembers).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.role, 'owner'))).limit(1);
      if (!owner) return reply.code(409).send({ error: 'Room has no owner' });
      if (target.userId === owner.userId) return reply.code(400).send({ error: 'User already owns the room' });
      const transfer = await fastify.db.transaction(async (tx) => {
        const [created] = await tx.insert(roomOwnershipTransfers).values({ roomId: request.params.id, fromUserId: owner.userId, toUserId: target.userId, expiresAt: new Date(Date.now() + 24 * 3_600_000) }).onConflictDoUpdate({ target: roomOwnershipTransfers.roomId, set: { fromUserId: owner.userId, toUserId: target.userId, expiresAt: new Date(Date.now() + 24 * 3_600_000), createdAt: new Date() } }).returning();
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.ownership.request', targetType: 'room', targetId: request.params.id, metadata: { fromUserId: owner.userId, toUserId: target.userId, expiresAt: created.expiresAt.toISOString() }, clientIp: request.clientIp });
        return created;
      });
      broadcastToUser(target.userId, { type: 'room_ownership_transfer_requested', roomId: request.params.id });
      return reply.code(201).send({ transfer });
    } catch (error) { return accessError(reply, error); }
  });

  fastify.get('/api/room-ownership-transfers/pending', async (request) => {
    const transfers = await fastify.db.select({
      roomId: roomOwnershipTransfers.roomId, roomName: voiceRooms.name,
      fromUserId: roomOwnershipTransfers.fromUserId, fromNickname: users.nickname,
      toUserId: roomOwnershipTransfers.toUserId, expiresAt: roomOwnershipTransfers.expiresAt, createdAt: roomOwnershipTransfers.createdAt,
    }).from(roomOwnershipTransfers).innerJoin(voiceRooms, eq(voiceRooms.id, roomOwnershipTransfers.roomId))
      .innerJoin(users, eq(users.id, roomOwnershipTransfers.fromUserId))
      .innerJoin(roomMembers, and(eq(roomMembers.roomId, roomOwnershipTransfers.roomId), eq(roomMembers.userId, roomOwnershipTransfers.toUserId)))
      .where(and(
        eq(roomOwnershipTransfers.toUserId, request.userId), gt(roomOwnershipTransfers.expiresAt, new Date()),
      )).orderBy(asc(roomOwnershipTransfers.expiresAt), asc(roomOwnershipTransfers.roomId));
    return { transfers };
  });

  fastify.post<{ Params: { id: string } }>('/api/rooms/:id/ownership-transfer/confirm', async (request, reply) => {
    try {
      const [transfer] = await fastify.db.select().from(roomOwnershipTransfers).where(and(eq(roomOwnershipTransfers.roomId, request.params.id), eq(roomOwnershipTransfers.toUserId, request.userId), gt(roomOwnershipTransfers.expiresAt, new Date()))).limit(1);
      if (!transfer) return reply.code(404).send({ error: 'Pending ownership transfer not found' });
      await fastify.db.transaction(async (tx) => {
        const changedOwner = await tx.update(roomMembers).set({ role: 'moderator' }).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, transfer.fromUserId), eq(roomMembers.role, 'owner'))).returning({ userId: roomMembers.userId });
        if (!changedOwner.length) throw new RoomAccessError(409, 'Room ownership changed before confirmation');
        const changedTarget = await tx.update(roomMembers).set({ role: 'owner' }).where(and(eq(roomMembers.roomId, request.params.id), eq(roomMembers.userId, transfer.toUserId))).returning({ userId: roomMembers.userId });
        if (!changedTarget.length) throw new RoomAccessError(409, 'Ownership recipient is no longer a member');
        await tx.update(voiceRooms).set({ createdBy: transfer.toUserId }).where(eq(voiceRooms.id, request.params.id));
        await tx.delete(roomOwnershipTransfers).where(eq(roomOwnershipTransfers.roomId, request.params.id));
        await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'room.ownership.transfer', targetType: 'room', targetId: request.params.id, metadata: { previousOwnerId: transfer.fromUserId, ownerId: transfer.toUserId }, clientIp: request.clientIp });
      });
      const permissionUpdates = await Promise.allSettled([updateVoicePermissions(request.params.id, transfer.fromUserId, true), updateVoicePermissions(request.params.id, transfer.toUserId, true)]);
      for (const result of permissionUpdates) {
        if (result.status === 'rejected') request.log.warn({ err: result.reason, roomId: request.params.id }, 'Failed to refresh voice permissions after ownership transfer');
      }
      broadcastToRoom(request.params.id, { type: 'room_ownership_transferred', roomId: request.params.id, ownerId: transfer.toUserId, previousOwnerId: transfer.fromUserId });
      return { success: true };
    } catch (error) { return accessError(reply, error); }
  });
};

export default roomRoutes;
