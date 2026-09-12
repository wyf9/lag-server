import { and, lt, or, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '../db/client.js';
import { auditEvents, logoutEvents, oauthTransactions, roomInvites, roomMessages, sessions, voiceRooms } from '../db/schema.js';

const DAY = 86_400_000;

export async function cleanupExpiredData(db: Database, now = new Date()) {
  const oldSessions = new Date(now.getTime() - 30 * DAY); const auditCutoff = new Date(now.getTime() - 365 * DAY);
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(or(lt(sessions.absoluteExpiresAt, oldSessions), and(sql`${sessions.revokedAt} IS NOT NULL`, lt(sessions.revokedAt, oldSessions))));
    await tx.delete(oauthTransactions).where(lt(oauthTransactions.expiresAt, now));
    await tx.delete(roomInvites).where(or(lt(roomInvites.expiresAt, now), and(sql`${roomInvites.maxUses} IS NOT NULL`, sql`${roomInvites.useCount} >= ${roomInvites.maxUses}`)));
    await tx.delete(logoutEvents).where(lt(logoutEvents.receivedAt, new Date(now.getTime() - 30 * DAY)));
    await tx.delete(auditEvents).where(lt(auditEvents.createdAt, auditCutoff));
    await tx.delete(roomMessages).where(sql`EXISTS (SELECT 1 FROM ${voiceRooms} r WHERE r.id = ${roomMessages.roomId} AND r.retention <> 'forever' AND ${roomMessages.createdAt} < ${now} - (r.retention::int * INTERVAL '1 day'))`);
  });
}

export function startPeriodicCleanup(db: Database, logger: FastifyBaseLogger) {
  const run = () => cleanupExpiredData(db).catch((error) => logger.error(error, 'periodic cleanup failed'));
  void run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000); timer.unref();
}
