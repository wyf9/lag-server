import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
// import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import dbPlugin from './plugins/db.js';
import authPlugin from './plugins/auth.js';
import roomRoutes from './routes/rooms.js';
import wsRoutes, { startStaleParticipantSweep } from './routes/ws.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { autoMigrate } from './db/migrate.js';
import { getDb } from './db/client.js';
import { eq } from 'drizzle-orm';
import { oauthIdentities, users } from './db/schema.js';
import { isPlatformAdmin } from './lib/admin.js';
import { startPeriodicCleanup } from './lib/cleanup.js';
import { createSession, csrfCookieOptions, sessionCookieOptions, CSRF_COOKIE, SESSION_COOKIE } from './lib/session.js';
import { getConfig } from './config.js';

const HOST = '0.0.0.0';

const AVATAR_COLORS = ['#43b8b0', '#34d399', '#f0b429', '#e62a3c', '#a78bfa', '#f472b6', '#60a5fa', '#fb923c'];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

async function main() {
  const config = getConfig();
  // Auto-migrate on startup
  await autoMigrate();

  const fastify = Fastify({ logger: { level: 'info' } });

  await fastify.register(cors, {
    origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.has(origin)),
    credentials: true,
    maxAge: 86400,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Rate limiting disabled for self-hosted deployments

  await fastify.register(websocket);
  await fastify.register(cookie);
  await fastify.register(formbody);
  await fastify.register(dbPlugin);
  await fastify.register(authPlugin);
  await fastify.register(authRoutes);

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

    const session = await createSession(fastify.db, config, { userId: user.id, userAgent: request.headers['user-agent'], clientIp: request.clientIp });
    reply.setCookie(SESSION_COOKIE, session.token, sessionCookieOptions(config.sessionAbsoluteSeconds));
    reply.setCookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions(config.sessionAbsoluteSeconds));

    return reply.code(201).send({
      user: { id: user.id, nickname: user.nickname, avatarColor: user.avatarColor, identityType: 'guest', platformAdmin: false },
    });
  });

  fastify.get('/api/session', async (request, reply) => {
    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    if (!user) return reply.code(404).send({ error: 'User not found' });

    const [identity] = await fastify.db.select({ id: oauthIdentities.id }).from(oauthIdentities).where(eq(oauthIdentities.userId, user.id)).limit(1);
    return { user: { id: user.id, nickname: user.nickname, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl, identityType: identity ? 'oauth' : 'guest', platformAdmin: await isPlatformAdmin(fastify.db, user.id) } };
  });

  fastify.patch<{ Body: { nickname: string } }>('/api/session', async (request, reply) => {
    const [identity] = await fastify.db.select({ id: oauthIdentities.id }).from(oauthIdentities).where(eq(oauthIdentities.userId, request.userId)).limit(1);
    if (identity) return reply.code(403).send({ error: 'OAuth nicknames are managed by the identity provider' });
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
  await fastify.register(adminRoutes);
  await fastify.register(wsRoutes);
  await fastify.register(healthRoutes);

  startStaleParticipantSweep(fastify.db);
  startPeriodicCleanup(fastify.db, fastify.log);

  try {
    await fastify.listen({ port: config.port, host: HOST });
    fastify.log.info(`Self-hosted Lag API listening on http://${HOST}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('API failed to start:', err);
  process.exit(1);
});
