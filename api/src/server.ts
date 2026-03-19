import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
// import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import dbPlugin from './plugins/db.js';
import authPlugin from './plugins/auth.js';
import roomRoutes from './routes/rooms.js';
import wsRoutes, { startStaleParticipantSweep } from './routes/ws.js';
import healthRoutes from './routes/health.js';
import { autoMigrate } from './db/migrate.js';
import { getDb } from './db/client.js';
import { eq } from 'drizzle-orm';
import { users } from './db/schema.js';
import { createSessionToken } from './lib/session.js';

const PORT = parseInt(process.env.API_PORT ?? '3001', 10);
const HOST = '0.0.0.0';

if (!process.env.DATABASE_URL) {
  console.error('Missing required environment variable: DATABASE_URL');
  process.exit(1);
}

const AVATAR_COLORS = ['#43b8b0', '#34d399', '#f0b429', '#e62a3c', '#a78bfa', '#f472b6', '#60a5fa', '#fb923c'];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

async function main() {
  // Auto-migrate on startup
  await autoMigrate();

  const fastify = Fastify({ logger: { level: 'info' } });

  await fastify.register(cors, {
    origin: true,
    credentials: true,
    maxAge: 86400,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Rate limiting disabled for self-hosted deployments

  await fastify.register(websocket);
  await fastify.register(dbPlugin);
  await fastify.register(authPlugin);

  // Session routes (before room routes since they share prefix)
  fastify.post<{ Body: { nickname: string } }>('/api/session', async (request, reply) => {
    const { nickname } = request.body ?? {};
    if (!nickname || nickname.trim().length === 0 || nickname.trim().length > 64) {
      return reply.code(400).send({ error: 'Nickname must be between 1 and 64 characters' });
    }

    const avatarColor = randomAvatarColor();
    const [user] = await fastify.db
      .insert(users)
      .values({ nickname: nickname.trim(), avatarColor })
      .returning();

    const token = await createSessionToken(user.id, user.nickname);

    return reply.code(201).send({
      token,
      user: { id: user.id, nickname: user.nickname, avatarColor: user.avatarColor },
    });
  });

  fastify.get('/api/session', async (request, reply) => {
    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'User not found' });

    return { user: { id: user.id, nickname: user.nickname, avatarColor: user.avatarColor } };
  });

  fastify.patch<{ Body: { nickname: string } }>('/api/session', async (request, reply) => {
    const { nickname } = request.body ?? {};
    if (!nickname || nickname.trim().length === 0 || nickname.trim().length > 64) {
      return reply.code(400).send({ error: 'Nickname must be between 1 and 64 characters' });
    }

    const [user] = await fastify.db
      .update(users)
      .set({ nickname: nickname.trim() })
      .where(eq(users.id, request.userId))
      .returning();

    if (!user) return reply.code(404).send({ error: 'User not found' });

    return { user: { id: user.id, nickname: user.nickname, avatarColor: user.avatarColor } };
  });

  await fastify.register(roomRoutes);
  await fastify.register(wsRoutes);
  await fastify.register(healthRoutes);

  startStaleParticipantSweep(fastify.db);

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Self-hosted Lag API listening on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('API failed to start:', err);
  process.exit(1);
});
