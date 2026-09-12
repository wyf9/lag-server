import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { and, eq } from 'drizzle-orm';
import { getConfig } from '../config.js';
import { CSRF_COOKIE, SESSION_COOKIE, hashToken, verifySession, type AuthenticatedSession } from '../lib/session.js';
import { sessions } from '../db/schema.js';

declare module 'fastify' { interface FastifyRequest { userId: string; session: AuthenticatedSession; clientIp: string } }
const PUBLIC = new Set(['/api/health', '/api/discover', '/api/auth/config', '/api/auth/login', '/api/auth/callback', '/api/auth/backchannel-logout']);

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const config = getConfig();
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    const requestOrigin = request.headers.host && [...config.allowedOrigins].find((allowed) => new URL(allowed).host === request.headers.host);
    if (!requestOrigin) return reply.code(400).send({ error: 'Request host is not allowed' });
    const forwarded = config.proxyHeader ? request.headers[config.proxyHeader] : undefined;
    request.clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.ip;
    const origin = request.headers.origin;
    if (origin && origin !== requestOrigin) return reply.code(403).send({ error: 'Origin not allowed' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && path !== '/api/auth/backchannel-logout' && origin !== requestOrigin) {
      return reply.code(403).send({ error: 'Valid Origin required' });
    }
    if (PUBLIC.has(path) || path === '/api/ws' || (config.guestEnabled && request.method === 'POST' && path === '/api/session')) return;

    const token = request.cookies[SESSION_COOKIE];
    if (!token) return reply.code(401).send({ error: 'Authentication required' });
    const session = await verifySession(fastify.db, config, token);
    if (!session) return reply.code(401).send({ error: 'Invalid or expired session' });
    request.session = session; request.userId = session.userId;

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || csrf !== request.cookies[CSRF_COOKIE]) return reply.code(403).send({ error: 'Invalid CSRF token' });
      const [valid] = await fastify.db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, session.id), eq(sessions.csrfHash, hashToken(csrf)))).limit(1);
      if (!valid) return reply.code(403).send({ error: 'Invalid CSRF token' });
    }
  });
};
export default fp(authPlugin, { name: 'auth', dependencies: ['@fastify/cookie', 'db'] });
