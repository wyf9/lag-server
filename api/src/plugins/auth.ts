import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { verifySessionToken, type SessionPayload } from '../lib/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    session: SessionPayload;
  }
}

const PUBLIC_ROUTES = ['/api/health', '/api/discover'];

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];

    if (request.method === 'POST' && path === '/api/session') return;
    if (request.method === 'GET' && PUBLIC_ROUTES.includes(path)) return;
    if (path === '/api/ws') return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    try {
      const token = authHeader.slice(7);
      const payload = await verifySessionToken(token);
      request.userId = payload.sub;
      request.session = payload;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired session' });
    }
  });
};

export default fp(authPlugin, { name: 'auth' });
