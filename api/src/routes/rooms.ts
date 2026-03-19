import type { FastifyPluginAsync } from 'fastify';
import { eq, and, desc, sql, lt } from 'drizzle-orm';
import { voiceRooms, voiceRoomParticipants, roomMessages, users } from '../db/schema.js';
import { createVoiceToken } from '../lib/voice-provider.js';
import { broadcastToRoom } from './ws.js';

const roomRoutes: FastifyPluginAsync = async (fastify) => {
  // List rooms with participant counts
  fastify.get('/api/rooms', async () => {
    const rooms = await fastify.db
      .select({
        id: voiceRooms.id,
        name: voiceRooms.name,
        createdBy: voiceRooms.createdBy,
        maxParticipants: voiceRooms.maxParticipants,
        createdAt: voiceRooms.createdAt,
        participantCount: sql<number>`(
          SELECT COUNT(*)::int FROM voice_room_participants
          WHERE voice_room_participants.room_id = ${voiceRooms.id}
        )`,
      })
      .from(voiceRooms)
      .orderBy(voiceRooms.createdAt);

    return { rooms };
  });

  // Create room
  fastify.post<{ Body: { name: string; maxParticipants?: number } }>('/api/rooms', async (request, reply) => {
    const { name, maxParticipants } = request.body;
    if (!name || name.trim().length === 0 || name.trim().length > 64) {
      return reply.code(400).send({ error: 'Room name must be between 1 and 64 characters' });
    }

    const max = maxParticipants ?? 50;
    if (max < 1 || max > 100) {
      return reply.code(400).send({ error: 'Max participants must be between 1 and 100' });
    }

    const [room] = await fastify.db
      .insert(voiceRooms)
      .values({
        name: name.trim(),
        createdBy: request.userId,
        maxParticipants: max,
      })
      .returning();

    broadcastToRoom(null, {
      type: 'room_created',
      room: { ...room, participantCount: 0 },
    });

    return reply.code(201).send({ room });
  });

  // Get room details
  fastify.get<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params;

    const [room] = await fastify.db
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.id, id))
      .limit(1);

    if (!room) return reply.code(404).send({ error: 'Room not found' });

    const participants = await fastify.db
      .select({
        userId: voiceRoomParticipants.userId,
        nickname: users.nickname,
        avatarColor: users.avatarColor,
        joinedAt: voiceRoomParticipants.joinedAt,
      })
      .from(voiceRoomParticipants)
      .innerJoin(users, eq(users.id, voiceRoomParticipants.userId))
      .where(eq(voiceRoomParticipants.roomId, id));

    return { room, participants };
  });

  // Delete room (creator only)
  fastify.delete<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params;

    const [room] = await fastify.db
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.id, id))
      .limit(1);

    if (!room) return reply.code(404).send({ error: 'Room not found' });
    if (room.createdBy !== request.userId) {
      return reply.code(403).send({ error: 'Only the room creator can delete this room' });
    }

    await fastify.db.delete(voiceRooms).where(eq(voiceRooms.id, id));

    broadcastToRoom(null, { type: 'room_deleted', roomId: id });

    return { success: true };
  });

  // Join room - get voice token
  fastify.post<{ Params: { id: string } }>('/api/rooms/:id/join', async (request, reply) => {
    const { id } = request.params;

    const [room] = await fastify.db
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.id, id))
      .limit(1);

    if (!room) return reply.code(404).send({ error: 'Room not found' });

    const [currentCount] = await fastify.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(voiceRoomParticipants)
      .where(eq(voiceRoomParticipants.roomId, id));

    if (currentCount.count >= room.maxParticipants) {
      return reply.code(409).send({ error: 'Room is full' });
    }

    // Remove from any other room first
    await fastify.db
      .delete(voiceRoomParticipants)
      .where(eq(voiceRoomParticipants.userId, request.userId));

    // Insert participant
    await fastify.db
      .insert(voiceRoomParticipants)
      .values({ roomId: id, userId: request.userId })
      .onConflictDoNothing();

    // Get user details for the broadcast
    const [user] = await fastify.db
      .select({ nickname: users.nickname, avatarColor: users.avatarColor })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    const token = await createVoiceToken({
      roomId: id,
      userId: request.userId,
      displayName: user?.nickname,
    });

    broadcastToRoom(id, {
      type: 'voice_room_user_joined',
      roomId: id,
      userId: request.userId,
      nickname: user?.nickname ?? 'Unknown',
      avatarColor: user?.avatarColor ?? '#43b8b0',
    });

    return {
      ...token,
      room: { id: room.id, name: room.name },
    };
  });

  // Leave room
  fastify.delete<{ Params: { id: string } }>('/api/rooms/:id/leave', async (request, reply) => {
    const { id } = request.params;

    await fastify.db
      .delete(voiceRoomParticipants)
      .where(
        and(
          eq(voiceRoomParticipants.roomId, id),
          eq(voiceRoomParticipants.userId, request.userId),
        ),
      );

    broadcastToRoom(id, {
      type: 'voice_room_user_left',
      roomId: id,
      userId: request.userId,
    });

    return { success: true };
  });

  // Get messages (paginated)
  fastify.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>(
    '/api/rooms/:id/messages',
    async (request, reply) => {
      const { id } = request.params;
      const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 100);
      const before = request.query.before;

      const conditions = [eq(roomMessages.roomId, id)];
      if (before) {
        conditions.push(lt(roomMessages.createdAt, new Date(before)));
      }

      const messages = await fastify.db
        .select({
          id: roomMessages.id,
          roomId: roomMessages.roomId,
          userId: roomMessages.userId,
          content: roomMessages.content,
          createdAt: roomMessages.createdAt,
          nickname: users.nickname,
          avatarColor: users.avatarColor,
        })
        .from(roomMessages)
        .leftJoin(users, eq(users.id, roomMessages.userId))
        .where(and(...conditions))
        .orderBy(desc(roomMessages.createdAt))
        .limit(limit);

      return { messages: messages.reverse() };
    },
  );

  // Send message
  fastify.post<{ Params: { id: string }; Body: { content: string } }>(
    '/api/rooms/:id/messages',
    async (request, reply) => {
      const { id } = request.params;
      const { content } = request.body;

      if (!content || content.trim().length === 0 || content.length > 2000) {
        return reply.code(400).send({ error: 'Message must be between 1 and 2000 characters' });
      }

      const [room] = await fastify.db
        .select({ id: voiceRooms.id })
        .from(voiceRooms)
        .where(eq(voiceRooms.id, id))
        .limit(1);

      if (!room) return reply.code(404).send({ error: 'Room not found' });

      const [user] = await fastify.db
        .select({ nickname: users.nickname, avatarColor: users.avatarColor })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      const [message] = await fastify.db
        .insert(roomMessages)
        .values({
          roomId: id,
          userId: request.userId,
          content: content.trim(),
        })
        .returning();

      const fullMessage = {
        ...message,
        nickname: user?.nickname ?? 'Unknown',
        avatarColor: user?.avatarColor ?? '#43b8b0',
      };

      broadcastToRoom(id, {
        type: 'room_message',
        message: fullMessage,
      });

      return reply.code(201).send({ message: fullMessage });
    },
  );
};

export default roomRoutes;
