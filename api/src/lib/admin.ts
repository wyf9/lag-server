import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { roleGrants } from '../db/schema.js';

export async function isPlatformAdmin(db: Database, userId: string): Promise<boolean> {
  const [grant] = await db.select({ id: roleGrants.id }).from(roleGrants).where(and(
    eq(roleGrants.userId, userId),
    eq(roleGrants.role, 'platform_admin'),
    eq(roleGrants.scopeType, 'platform'),
  )).limit(1);
  return Boolean(grant);
}

export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!await isPlatformAdmin(request.server.db, request.userId)) {
    return reply.code(403).send({ error: 'Platform administrator required' });
  }
}

export function validUserSearch(query: string | undefined): boolean {
  if (query === undefined || query.trim() === '') return true;
  const value = query.trim();
  return value.length >= 2 || isUuid(value);
}

export const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
