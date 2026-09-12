import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { and, eq } from 'drizzle-orm';
import { voiceRoomParticipants, users } from '../db/schema.js';
import { verifySession, SESSION_COOKIE } from '../lib/session.js';
import { getConfig } from '../config.js';
import { assertCanEnter, getRoomAccess } from '../lib/room-authorization.js';

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

// Connected clients: userId -> Set of WebSockets
const connectedClients = new Map<string, Set<WebSocket>>();

// Room subscribers: roomId -> Set of WebSockets (null key = global/lobby)
const roomSubscribers = new Map<string | null, Set<WebSocket>>();

// Per-socket subscriptions for cleanup
const socketToRooms = new Map<WebSocket, Set<string | null>>();

function addSocketToRoom(roomId: string | null, socket: WebSocket): void {
  if (!roomSubscribers.has(roomId)) {
    roomSubscribers.set(roomId, new Set());
  }
  roomSubscribers.get(roomId)!.add(socket);
  if (!socketToRooms.has(socket)) {
    socketToRooms.set(socket, new Set());
  }
  socketToRooms.get(socket)!.add(roomId);
}

function removeSocketFromRoom(roomId: string | null, socket: WebSocket): void {
  const set = roomSubscribers.get(roomId);
  if (set) {
    set.delete(socket);
    if (set.size === 0) roomSubscribers.delete(roomId);
  }
  socketToRooms.get(socket)?.delete(roomId);
}

function removeSocketFromAllRooms(socket: WebSocket): void {
  const rooms = socketToRooms.get(socket);
  if (!rooms) return;
  for (const roomId of rooms) {
    const set = roomSubscribers.get(roomId);
    if (set) {
      set.delete(socket);
      if (set.size === 0) roomSubscribers.delete(roomId);
    }
  }
  socketToRooms.delete(socket);
}

export function broadcastToRoom(roomId: string | null, message: WsMessage): void {
  const data = JSON.stringify(message);
  // Send to subscribers of the specific room
  const sockets = roomSubscribers.get(roomId);
  if (sockets) {
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }
  // Global events (room_created, room_deleted) go to lobby subscribers too
  if (roomId === null) {
    // Broadcast to ALL connected sockets for global events
    for (const socketSet of connectedClients.values()) {
      for (const socket of socketSet) {
        if (socket.readyState === socket.OPEN) socket.send(data);
      }
    }
  }
}

export function broadcastToUser(userId: string, message: WsMessage): void {
  const sockets = connectedClients.get(userId);
  if (!sockets) return;
  const data = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(data);
  }
}

export function disconnectUser(userId: string, code = 4003, reason = 'Access changed'): void {
  const sockets = connectedClients.get(userId);
  if (!sockets) return;
  for (const socket of [...sockets]) socket.close(code, reason);
}

export function disconnectRoomSubscribers(roomId: string, code = 4003, reason = 'Room access changed'): void {
  const sockets = roomSubscribers.get(roomId);
  if (!sockets) return;
  for (const socket of [...sockets]) socket.close(code, reason);
}

export function isUserConnected(userId: string): boolean {
  return connectedClients.has(userId);
}

const WS_RATE_WINDOW_MS = 10_000;
const WS_RATE_MAX = 30;
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 90_000;
const STALE_SWEEP_INTERVAL_MS = 120_000;

const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/ws', { websocket: true }, async (socket, request) => {
    const cookieToken = request.headers.cookie?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    const token = cookieToken ? decodeURIComponent(cookieToken) : undefined;

    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing token' }));
      socket.close(4001, 'Missing token');
      return;
    }

    let userId: string;
    try {
      const decoded = await verifySession(fastify.db, getConfig(), token);
      if (!decoded) throw new Error('invalid session');
      userId = decoded.userId;
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      socket.close(4001, 'Invalid token');
      return;
    }

    // Register the connection
    if (!connectedClients.has(userId)) {
      connectedClients.set(userId, new Set());
    }
    connectedClients.get(userId)!.add(socket);

    // Subscribe to global events by default
    addSocketToRoom(null, socket);

    // Update last seen
    fastify.db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, userId))
      .catch(() => {});

    let wsMessageTimestamps: number[] = [];

    socket.on('message', async (raw: any) => {
      const now = Date.now();
      wsMessageTimestamps = wsMessageTimestamps.filter((t) => now - t < WS_RATE_WINDOW_MS);
      wsMessageTimestamps.push(now);
      if (wsMessageTimestamps.length > WS_RATE_MAX) {
        socket.close(4029, 'Rate limit exceeded');
        return;
      }

      try {
        const message = JSON.parse(raw.toString()) as WsMessage;

        switch (message.type) {
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }));
            break;
          case 'subscribe_room': {
            const roomId = message.roomId as string;
            if (roomId) {
              try {
                const access = await getRoomAccess(fastify.db, roomId, userId);
                assertCanEnter(access);
                addSocketToRoom(roomId, socket);
              } catch {
                socket.send(JSON.stringify({ type: 'error', message: 'Room access denied' }));
              }
            }
            break;
          }
          case 'unsubscribe_room': {
            const roomId = message.roomId as string;
            if (roomId) removeSocketFromRoom(roomId, socket);
            break;
          }
          case 'typing_start':
          case 'typing_stop': {
            const roomId = message.roomId as string;
            if (!roomId || !socketToRooms.get(socket)?.has(roomId)) break;
            broadcastToRoom(roomId, {
              type: 'typing',
              roomId,
              userId,
              typing: message.type === 'typing_start',
            });
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });

    let lastPongTime = Date.now();
    socket.on('pong', () => { lastPongTime = Date.now(); });

    const pingInterval = setInterval(() => {
      if (socket.readyState !== socket.OPEN) return;
      if (Date.now() - lastPongTime > PONG_TIMEOUT_MS) {
        socket.close(4000, 'Pong timeout');
        return;
      }
      socket.ping();
    }, PING_INTERVAL_MS);

    socket.on('close', () => {
      clearInterval(pingInterval);
      removeSocketFromAllRooms(socket);

      const sockets = connectedClients.get(userId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          connectedClients.delete(userId);

          // Clean up voice room participants on disconnect
          fastify.db
            .select({ roomId: voiceRoomParticipants.roomId })
            .from(voiceRoomParticipants)
            .where(eq(voiceRoomParticipants.userId, userId))
            .then((rows) =>
              Promise.all(
                rows.map(({ roomId }) =>
                  fastify.db
                    .delete(voiceRoomParticipants)
                    .where(
                      and(
                        eq(voiceRoomParticipants.roomId, roomId),
                        eq(voiceRoomParticipants.userId, userId),
                      ),
                    )
                    .then(() => {
                      broadcastToRoom(roomId, {
                        type: 'voice_room_user_left',
                        roomId,
                        userId,
                      });
                    }),
                ),
              ),
            )
            .catch((err) => {
              console.error(`Failed to clean up voice participants for ${userId}:`, err);
            });
        }
      }
    });

    socket.on('error', (err: Error) => {
      console.error(`WebSocket error for ${userId}:`, err);
    });
  });
};

// Stale participant sweep
export function startStaleParticipantSweep(db: any): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      const rows = await db
        .select({ roomId: voiceRoomParticipants.roomId, userId: voiceRoomParticipants.userId })
        .from(voiceRoomParticipants);

      for (const { roomId, userId } of rows) {
        if (!connectedClients.has(userId)) {
          await db
            .delete(voiceRoomParticipants)
            .where(
              and(
                eq(voiceRoomParticipants.roomId, roomId),
                eq(voiceRoomParticipants.userId, userId),
              ),
            );
          broadcastToRoom(roomId, {
            type: 'voice_room_user_left',
            roomId,
            userId,
          });
          console.log(`[stale sweep] Removed orphaned participant ${userId} from room ${roomId}`);
        }
      }
    } catch (err) {
      console.error('[stale sweep] Failed:', err);
    }
  }, STALE_SWEEP_INTERVAL_MS);
}

export default wsRoutes;
