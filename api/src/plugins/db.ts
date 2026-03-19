import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { getDb, type Database } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const db = getDb();
  fastify.decorate('db', db);
};

export default fp(dbPlugin, { name: 'db' });
