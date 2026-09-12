import type { FastifyPluginAsync } from 'fastify';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { getConfig } from '../config.js';
import { auditEvents, logoutEvents, oauthIdentities, oauthTransactions, roleGrants, sessions, users } from '../db/schema.js';
import { createAuthorization, dotPath, exchangeCode, matchesClaim, metadata, newOAuthSecrets, resolveClaims, validateNonce } from '../lib/oauth.js';
import { createSession, csrfCookieOptions, hashToken, revokeSession, sessionCookieOptions, CSRF_COOKIE, SESSION_COOKIE } from '../lib/session.js';

const COLORS = ['#43b8b0', '#34d399', '#f0b429', '#e62a3c', '#a78bfa', '#f472b6', '#60a5fa', '#fb923c'];
const color = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function requestOrigin(host: string | undefined, allowedOrigins: ReadonlySet<string>): string | undefined {
  if (!host) return undefined;
  return [...allowedOrigins].find((origin) => new URL(origin).host === host);
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const config = getConfig();

  fastify.get('/api/auth/config', async () => ({
    provider: { label: config.auth.label ?? config.auth.provider, mode: config.auth.provider },
    guestEnabled: config.guestEnabled,
  }));

  fastify.get('/api/auth/login', async (request, reply) => {
    const origin = requestOrigin(request.headers.host, config.allowedOrigins);
    if (!origin) return reply.code(400).send({ error: 'Request host is not allowed' });
    const redirectUri = `${origin}/api/auth/callback`;
    const provider = await metadata(config.auth);
    const secrets = newOAuthSecrets();
    const pkce = config.auth.pkce === 'required' || (config.auth.pkce === 'auto' && (provider.code_challenge_methods_supported?.includes('S256') ?? config.auth.provider === 'oauth2'));
    await fastify.db.insert(oauthTransactions).values({ stateHash: hashToken(secrets.state), nonce: config.auth.provider === 'oauth2' ? null : secrets.nonce, codeVerifier: pkce ? secrets.verifier : null, redirectUri, expiresAt: new Date(Date.now() + config.oauthTransactionSeconds * 1000) });
    return reply.redirect(createAuthorization(config.auth, provider, redirectUri, secrets.state, secrets.nonce, secrets.verifier));
  });

  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/auth/callback', async (request, reply) => {
    if (request.query.error || !request.query.code || !request.query.state) return reply.code(400).send({ error: 'OAuth authorization failed' });
    const now = new Date();
    const transaction = await fastify.db.transaction(async (tx) => {
      const [pending] = await tx.select().from(oauthTransactions).where(and(eq(oauthTransactions.stateHash, hashToken(request.query.state!)), isNull(oauthTransactions.consumedAt), gt(oauthTransactions.expiresAt, now))).for('update').limit(1);
      if (!pending) return undefined;
      await tx.update(oauthTransactions).set({ consumedAt: now }).where(eq(oauthTransactions.id, pending.id));
      return pending;
    });
    if (!transaction) return reply.code(400).send({ error: 'Invalid or expired OAuth state' });
    const origin = requestOrigin(request.headers.host, config.allowedOrigins);
    if (!origin || transaction.redirectUri !== `${origin}/api/auth/callback`) return reply.code(400).send({ error: 'OAuth callback origin mismatch' });

    const provider = await metadata(config.auth);
    const tokens = await exchangeCode(config.auth, provider, transaction.redirectUri, request.query.code, transaction.codeVerifier ?? undefined);
    if (config.auth.provider !== 'oauth2') validateNonce(tokens.id_token, transaction.nonce!);
    const claims = await resolveClaims(config.auth, provider, tokens, transaction.nonce ?? undefined);
    if (config.auth.provider !== 'oauth2' && claims.nonce !== transaction.nonce) return reply.code(400).send({ error: 'OIDC nonce mismatch' });
    const subject = dotPath(claims, config.auth.subjectPath);
    const name = dotPath(claims, config.auth.namePath);
    const email = dotPath(claims, config.auth.emailPath);
    const avatar = dotPath(claims, config.auth.avatarPath);
    if (typeof subject !== 'string' || !subject || typeof name !== 'string' || !name) return reply.code(400).send({ error: 'Provider claims are missing subject or name' });

    const result = await fastify.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(715924801)`);
      const [existing] = await tx.select({ userId: oauthIdentities.userId }).from(oauthIdentities).where(and(eq(oauthIdentities.provider, config.auth.provider), eq(oauthIdentities.issuer, provider.issuer), eq(oauthIdentities.subject, subject))).limit(1);
      let userId = existing?.userId;
      let bootstrap = false;
      if (!userId) {
        const [created] = await tx.insert(users).values({ nickname: name.slice(0, 64), email: typeof email === 'string' ? email.slice(0, 320) : null, avatarUrl: typeof avatar === 'string' ? avatar : null, avatarColor: color() }).returning({ id: users.id });
        userId = created.id;
        await tx.insert(oauthIdentities).values({ userId, provider: config.auth.provider, issuer: provider.issuer, subject, claims });
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(oauthIdentities);
        bootstrap = count === 1;
      } else {
        await tx.update(oauthIdentities).set({ claims, updatedAt: now }).where(and(eq(oauthIdentities.provider, config.auth.provider), eq(oauthIdentities.issuer, provider.issuer), eq(oauthIdentities.subject, subject)));
        await tx.update(users).set({ nickname: name.slice(0, 64), email: typeof email === 'string' ? email.slice(0, 320) : null, avatarUrl: typeof avatar === 'string' ? avatar : null, updatedAt: now }).where(eq(users.id, userId));
      }
      const grants: Array<{ role: string; scopeType: string; scopeId: string | null; source: string }> = [];
      if (bootstrap || matchesClaim(claims, config.auth.adminClaimPath, config.auth.adminClaimValue)) grants.push({ role: 'platform_admin', scopeType: 'platform', scopeId: null, source: bootstrap ? 'bootstrap' : 'claim' });
      if (config.auth.provider === 'prism') {
        const configuredTeamId = config.auth.prism.teamId;
        const flatTeamRole = configuredTeamId ? dotPath(claims, `role_in_team_${configuredTeamId}`) : undefined;
        if (configuredTeamId && config.auth.prism.ownerRoles.includes(String(flatTeamRole))) grants.push({ role: 'platform_admin', scopeType: 'platform', scopeId: null, source: 'prism' });
        const teams = dotPath(claims, config.auth.prism.teamClaimPath);
        if (Array.isArray(teams)) for (const team of teams) {
          const teamId = dotPath(team, config.auth.prism.teamIdPath); const role = dotPath(team, config.auth.prism.teamRolePath);
          if (typeof teamId === 'string' && teamId === configuredTeamId && config.auth.prism.ownerRoles.includes(String(role))) grants.push({ role: 'platform_admin', scopeType: 'platform', scopeId: null, source: 'prism' });
        }
      }
      await tx.delete(roleGrants).where(and(eq(roleGrants.userId, userId), sql`${roleGrants.source} IN ('claim', 'prism')`));
      for (const grant of grants) await tx.insert(roleGrants).values({ userId, ...grant }).onConflictDoNothing();
      await tx.insert(auditEvents).values({ actorUserId: userId, action: 'auth.login', targetType: 'user', targetId: userId, metadata: { provider: config.auth.provider, bootstrap }, clientIp: request.clientIp });
      return { userId };
    });

    const session = await createSession(fastify.db, config, { userId: result.userId, idToken: tokens.id_token, providerSessionId: typeof claims.sid === 'string' ? claims.sid : undefined, userAgent: request.headers['user-agent'], clientIp: request.clientIp });
    reply.setCookie(SESSION_COOKIE, session.token, sessionCookieOptions(config.sessionAbsoluteSeconds));
    reply.setCookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions(config.sessionAbsoluteSeconds));
    return reply.redirect(origin);
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    const [stored] = await fastify.db.select({ idToken: sessions.idToken }).from(sessions).where(eq(sessions.id, request.session.id)).limit(1);
    await revokeSession(fastify.db, request.session.id);
    await fastify.db.insert(auditEvents).values({ actorUserId: request.userId, action: 'auth.logout', targetType: 'session', targetId: request.session.id, metadata: {}, clientIp: request.clientIp });
    reply.clearCookie(SESSION_COOKIE, { path: '/' }); reply.clearCookie(CSRF_COOKIE, { path: '/' });
    const provider = await metadata(config.auth);
    if (stored?.idToken && provider.end_session_endpoint) {
      const origin = requestOrigin(request.headers.host, config.allowedOrigins);
      const endpoint = new URL(provider.end_session_endpoint); endpoint.searchParams.set('id_token_hint', stored.idToken); if (origin) endpoint.searchParams.set('post_logout_redirect_uri', origin);
      return reply.send({ logoutUrl: endpoint.toString() });
    }
    return { success: true };
  });

  fastify.post<{ Body: { logout_token?: string } | string }>('/api/auth/backchannel-logout', async (request, reply) => {
    if (config.auth.provider !== 'prism') return reply.code(404).send({ error: 'Not found' });
    const provider = await metadata(config.auth);
    const logoutToken = typeof request.body === 'string' ? new URLSearchParams(request.body).get('logout_token') : request.body?.logout_token;
    if (!logoutToken || !provider.jwks_uri) return reply.code(400).send({ error: 'Missing logout token' });
    const { payload } = await jwtVerify(logoutToken, createRemoteJWKSet(new URL(provider.jwks_uri)), { issuer: provider.issuer, audience: config.auth.clientId, maxTokenAge: '5 minutes' });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events || !('http://schemas.openid.net/event/backchannel-logout' in events) || payload.nonce || (!payload.sub && !payload.sid)) return reply.code(400).send({ error: 'Invalid logout token' });
    const eventKey = typeof payload.jti === 'string' ? payload.jti : hashToken(logoutToken);
    try { await fastify.db.insert(logoutEvents).values({ provider: 'prism', issuer: provider.issuer, eventKey, subject: payload.sub, sessionId: typeof payload.sid === 'string' ? payload.sid : undefined }); }
    catch { return reply.code(409).send({ error: 'Logout token already processed' }); }
    if (typeof payload.sid === 'string') await fastify.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.providerSessionId, payload.sid));
    if (payload.sub) {
      const identities = fastify.db.select({ userId: oauthIdentities.userId }).from(oauthIdentities).where(and(eq(oauthIdentities.provider, 'prism'), eq(oauthIdentities.issuer, provider.issuer), eq(oauthIdentities.subject, payload.sub)));
      await fastify.db.update(sessions).set({ revokedAt: new Date() }).where(sql`${sessions.userId} IN (${identities})`);
    }
    return reply.code(204).send();
  });
};
export default authRoutes;
