import type { FastifyPluginAsync } from 'fastify';
import { and, asc, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { isUuid, requirePlatformAdmin, validUserSearch } from '../lib/admin.js';
import {
  auditEvents, oauthIdentities, platformSettings, roleGrants, roomMembers, sessions, users,
  roomOwnershipTransfers, voiceRoomParticipants, voiceRooms,
} from '../db/schema.js';
import { disconnectUser } from './ws.js';

const PRODUCT_SETTINGS = ['productName', 'supportUrl', 'announcement'] as const;
type ProductSetting = typeof PRODUCT_SETTINGS[number];
const isProductSetting = (key: string): key is ProductSetting => PRODUCT_SETTINGS.includes(key as ProductSetting);
const parseLimit = (value: string | undefined, fallback = 50) => Math.min(Math.max(Number.parseInt(value ?? String(fallback), 10) || fallback, 1), 100);

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requirePlatformAdmin);

  fastify.get<{ Querystring: { q?: string; limit?: string; offset?: string } }>('/api/admin/users', async (request, reply) => {
    const q = request.query.q?.trim();
    if (!validUserSearch(q)) return reply.code(400).send({ error: 'Search must be exact user ID/email or at least 2 characters' });
    const limit = parseLimit(request.query.limit); const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
    const filter = q ? (isUuid(q) ? eq(users.id, q) : or(ilike(users.nickname, `%${q}%`), eq(users.email, q))) : undefined;
    const rows = await fastify.db.select({
      id: users.id, nickname: users.nickname, email: users.email, avatarColor: users.avatarColor,
      disabled: users.disabled, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt,
      identityType: sql<'oauth' | 'guest'>`CASE WHEN EXISTS (SELECT 1 FROM ${oauthIdentities} oi WHERE oi.user_id = ${users.id}) THEN 'oauth' ELSE 'guest' END`,
      roleSources: sql<Array<{ role: string; scopeType: string; scopeId: string | null; source: string }>>`COALESCE((SELECT jsonb_agg(jsonb_build_object('role', rg.role, 'scopeType', rg.scope_type, 'scopeId', rg.scope_id, 'source', rg.source) ORDER BY rg.created_at) FROM ${roleGrants} rg WHERE rg.user_id = ${users.id}), '[]'::jsonb)`,
    }).from(users).where(filter).orderBy(desc(users.createdAt), asc(users.id)).limit(limit + 1).offset(offset);
    return { users: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
  });

  fastify.patch<{ Params: { userId: string }; Body: { disabled: boolean } }>('/api/admin/users/:userId/status', async (request, reply) => {
    if (typeof request.body?.disabled !== 'boolean') return reply.code(400).send({ error: 'disabled must be boolean' });
    if (request.params.userId === request.userId && request.body.disabled) return reply.code(409).send({ error: 'Administrators cannot disable their own account' });
    let user;
    try {
      user = await fastify.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(715924802)`);
        if (request.body.disabled) {
          const [targetAdmin] = await tx.select({ id: roleGrants.id }).from(roleGrants).where(and(eq(roleGrants.userId, request.params.userId), eq(roleGrants.role, 'platform_admin'), eq(roleGrants.scopeType, 'platform'))).limit(1);
          if (targetAdmin) {
            const activeAdmins = await tx.selectDistinct({ userId: roleGrants.userId }).from(roleGrants).innerJoin(users, eq(users.id, roleGrants.userId)).where(and(eq(roleGrants.role, 'platform_admin'), eq(roleGrants.scopeType, 'platform'), eq(users.disabled, false)));
            if (activeAdmins.length <= 1) throw new Error('LAST_ADMIN');
          }
        }
        const [updated] = await tx.update(users).set({ disabled: request.body.disabled, updatedAt: new Date() }).where(eq(users.id, request.params.userId)).returning();
        if (updated && request.body.disabled) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, request.params.userId), sql`${sessions.revokedAt} IS NULL`));
        if (updated) await tx.insert(auditEvents).values({ actorUserId: request.userId, action: request.body.disabled ? 'admin.user.disable' : 'admin.user.enable', targetType: 'user', targetId: updated.id, metadata: {}, clientIp: request.clientIp });
        return updated;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'LAST_ADMIN') return reply.code(409).send({ error: 'Cannot disable the last active platform administrator' });
      throw error;
    }
    if (!user) return reply.code(404).send({ error: 'User not found' });
    if (request.body.disabled) disconnectUser(user.id, 4003, 'Account disabled');
    return { user };
  });

  fastify.post<{ Params: { userId: string } }>('/api/admin/users/:userId/revoke-sessions', async (request, reply) => {
    const [target] = await fastify.db.select({ id: users.id }).from(users).where(eq(users.id, request.params.userId)).limit(1);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    const revoked = await fastify.db.transaction(async (tx) => {
      const rows = await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, target.id), sql`${sessions.revokedAt} IS NULL`)).returning({ id: sessions.id });
      await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'admin.user.sessions_revoke', targetType: 'user', targetId: target.id, metadata: { count: rows.length }, clientIp: request.clientIp });
      return rows;
    });
    disconnectUser(target.id, 4003, 'Sessions revoked');
    return { revoked: revoked.length };
  });

  fastify.put<{ Params: { userId: string }; Body: { granted: boolean } }>('/api/admin/users/:userId/platform-admin', async (request, reply) => {
    if (typeof request.body?.granted !== 'boolean') return reply.code(400).send({ error: 'granted must be boolean' });
    const [target] = await fastify.db.select({ id: users.id, disabled: users.disabled }).from(users).where(eq(users.id, request.params.userId)).limit(1);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (request.body.granted && target.disabled) return reply.code(409).send({ error: 'Cannot grant administration to a disabled user' });
    let changed = false;
    try {
      await fastify.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(715924802)`);
        if (request.body.granted) {
          const inserted = await tx.insert(roleGrants).values({ userId: target.id, role: 'platform_admin', scopeType: 'platform', source: 'manual' }).onConflictDoNothing().returning({ id: roleGrants.id });
          changed = inserted.length > 0;
        } else {
          const grants = await tx.select({ userId: roleGrants.userId }).from(roleGrants).innerJoin(users, eq(users.id, roleGrants.userId)).where(and(eq(roleGrants.role, 'platform_admin'), eq(roleGrants.scopeType, 'platform'), eq(users.disabled, false))).for('update');
          const targetGrants = await tx.select({ id: roleGrants.id, source: roleGrants.source }).from(roleGrants).where(and(eq(roleGrants.userId, target.id), eq(roleGrants.role, 'platform_admin'), eq(roleGrants.scopeType, 'platform'))).for('update');
          if (!targetGrants.some((grant) => grant.source === 'manual')) return;
          if (targetGrants.length === 1 && new Set(grants.map((grant) => grant.userId)).size <= 1) throw new Error('LAST_ADMIN');
          const deleted = await tx.delete(roleGrants).where(and(eq(roleGrants.userId, target.id), eq(roleGrants.role, 'platform_admin'), eq(roleGrants.scopeType, 'platform'), eq(roleGrants.source, 'manual'))).returning({ id: roleGrants.id });
          changed = deleted.length > 0;
        }
        if (changed) await tx.insert(auditEvents).values({ actorUserId: request.userId, action: request.body.granted ? 'admin.user.admin_grant' : 'admin.user.admin_revoke', targetType: 'user', targetId: target.id, metadata: { source: 'manual' }, clientIp: request.clientIp });
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'LAST_ADMIN') return reply.code(409).send({ error: 'Cannot remove the last platform administrator' });
      throw error;
    }
    return { success: true, changed };
  });

  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/api/admin/rooms', async (request) => {
    const limit = parseLimit(request.query.limit); const offset = Math.max(Number.parseInt(request.query.offset ?? '0', 10) || 0, 0);
    const rows = await fastify.db.select({
      id: voiceRooms.id, name: voiceRooms.name, createdBy: voiceRooms.createdBy, visibility: voiceRooms.visibility,
      allowGuests: voiceRooms.allowGuests, maxParticipants: voiceRooms.maxParticipants, createdAt: voiceRooms.createdAt,
      ownerId: sql<string | null>`(SELECT rm.user_id FROM ${roomMembers} rm WHERE rm.room_id = ${voiceRooms.id} AND rm.role = 'owner' LIMIT 1)`,
      memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${roomMembers} rm WHERE rm.room_id = ${voiceRooms.id})`,
      participantCount: sql<number>`(SELECT COUNT(*)::int FROM ${voiceRoomParticipants} rp WHERE rp.room_id = ${voiceRooms.id})`,
    }).from(voiceRooms).orderBy(desc(voiceRooms.createdAt), asc(voiceRooms.id)).limit(limit + 1).offset(offset);
    return { rooms: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
  });

  fastify.post<{ Params: { roomId: string }; Body: { reason: string } }>('/api/admin/rooms/:roomId/takeover', async (request, reply) => {
    const reason = request.body?.reason?.trim();
    if (!reason || reason.length < 3 || reason.length > 1000) return reply.code(400).send({ error: 'Reason must be between 3 and 1000 characters' });
    const result = await fastify.db.transaction(async (tx) => {
      const [room] = await tx.select({ id: voiceRooms.id }).from(voiceRooms).where(eq(voiceRooms.id, request.params.roomId)).for('update').limit(1);
      if (!room) return null;
      const [previous] = await tx.select({ userId: roomMembers.userId }).from(roomMembers).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, 'owner'))).for('update').limit(1);
      if (previous?.userId !== request.userId) {
        await tx.update(roomMembers).set({ role: 'moderator' }).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, 'owner')));
        await tx.insert(roomMembers).values({ roomId: room.id, userId: request.userId, role: 'owner' }).onConflictDoUpdate({ target: [roomMembers.roomId, roomMembers.userId], set: { role: 'owner' } });
        await tx.update(voiceRooms).set({ createdBy: request.userId }).where(eq(voiceRooms.id, room.id));
      }
      await tx.delete(roomOwnershipTransfers).where(eq(roomOwnershipTransfers.roomId, room.id));
      await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'admin.room.takeover', targetType: 'room', targetId: room.id, metadata: { reason, previousOwnerId: previous?.userId ?? null }, clientIp: request.clientIp });
      return { previousOwnerId: previous?.userId ?? null };
    });
    if (!result) return reply.code(404).send({ error: 'Room not found' });
    return { success: true, ownerId: request.userId, ...result };
  });

  fastify.get('/api/admin/settings', async () => {
    const rows = await fastify.db.select().from(platformSettings).where(sql`${platformSettings.key} IN (${sql.join(PRODUCT_SETTINGS.map((key) => sql`${key}`), sql`, `)})`);
    return { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  });

  fastify.patch<{ Body: Record<string, unknown> }>('/api/admin/settings', async (request, reply) => {
    const entries = Object.entries(request.body ?? {});
    if (!entries.length || entries.some(([key, value]) => !isProductSetting(key) || (value !== null && (typeof value !== 'string' || value.length > 500)))) return reply.code(400).send({ error: `Settings must contain only: ${PRODUCT_SETTINGS.join(', ')}` });
    await fastify.db.transaction(async (tx) => {
      for (const [key, value] of entries) await tx.insert(platformSettings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
      await tx.insert(auditEvents).values({ actorUserId: request.userId, action: 'admin.settings.update', targetType: 'platform', targetId: 'product', metadata: { keys: entries.map(([key]) => key) }, clientIp: request.clientIp });
    });
    return { success: true };
  });

  fastify.get<{ Querystring: { action?: string; actorUserId?: string; targetType?: string; targetId?: string; cursor?: string; before?: string; limit?: string } }>('/api/admin/audit', async (request, reply) => {
    const limit = parseLimit(request.query.limit); const conditions = [];
    if (request.query.action) conditions.push(eq(auditEvents.action, request.query.action));
    if (request.query.actorUserId) conditions.push(eq(auditEvents.actorUserId, request.query.actorUserId));
    if (request.query.targetType) conditions.push(eq(auditEvents.targetType, request.query.targetType));
    if (request.query.targetId) conditions.push(eq(auditEvents.targetId, request.query.targetId));
    if (request.query.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(request.query.cursor, 'base64url').toString()) as { at: string; id: string };
        const at = new Date(cursor.at);
        if (Number.isNaN(at.getTime()) || !isUuid(cursor.id)) throw new Error('invalid');
        conditions.push(sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (${at}, ${cursor.id}::uuid)`);
      } catch { return reply.code(400).send({ error: 'Invalid audit cursor' }); }
    } else if (request.query.before) { const before = new Date(request.query.before); if (Number.isNaN(before.getTime())) return reply.code(400).send({ error: 'Invalid before date' }); conditions.push(lt(auditEvents.createdAt, before)); }
    const events = await fastify.db.select().from(auditEvents).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(limit + 1);
    const page = events.slice(0, limit); const last = page.at(-1);
    return { events: page, nextCursor: events.length > limit && last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null };
  });
};

export default adminRoutes;
