import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import type { AppConfig } from '../config.js';

export const SESSION_COOKIE = '__Host-lag_session';
export const CSRF_COOKIE = '__Host-lag_csrf';
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const opaqueToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export interface AuthenticatedSession {
  id: string;
  userId: string;
  csrfToken?: string;
}

export async function createSession(db: Database, config: AppConfig, input: { userId: string; idToken?: string; providerSessionId?: string; userAgent?: string; clientIp?: string }) {
  const token = opaqueToken();
  const csrfToken = opaqueToken();
  const now = Date.now();
  const [session] = await db.insert(sessions).values({
    userId: input.userId, tokenHash: hashToken(token), csrfHash: hashToken(csrfToken), idToken: input.idToken,
    providerSessionId: input.providerSessionId, userAgent: input.userAgent, clientIp: input.clientIp,
    idleExpiresAt: new Date(now + config.sessionIdleSeconds * 1000), absoluteExpiresAt: new Date(now + config.sessionAbsoluteSeconds * 1000),
  }).returning({ id: sessions.id });
  return { ...session, token, csrfToken };
}

export async function verifySession(db: Database, config: AppConfig, token: string): Promise<AuthenticatedSession | null> {
  const now = new Date();
  const [session] = await db.select({ id: sessions.id, userId: sessions.userId, lastSeenAt: sessions.lastSeenAt, absoluteExpiresAt: sessions.absoluteExpiresAt })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), eq(users.disabled, false), isNull(sessions.revokedAt), gt(sessions.idleExpiresAt, now), gt(sessions.absoluteExpiresAt, now))).limit(1);
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60 * 1000) {
    const idleExpiresAt = new Date(Math.min(session.absoluteExpiresAt.getTime(), now.getTime() + config.sessionIdleSeconds * 1000));
    await db.update(sessions).set({ lastSeenAt: now, idleExpiresAt }).where(eq(sessions.id, session.id));
  }
  return { id: session.id, userId: session.userId };
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export const sessionCookieOptions = (maxAge: number) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: true, maxAge });
export const csrfCookieOptions = (maxAge: number) => ({ path: '/', httpOnly: false, sameSite: 'lax' as const, secure: true, maxAge });
