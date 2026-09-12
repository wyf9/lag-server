import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const url = z.string().url().transform((value) => value.replace(/\/+$/, ''));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  VOICE_PORT: z.coerce.number().int().min(1).max(65535).default(7880),
  EXTERNAL_HOST: z.string().min(1).default('localhost'),
  VOICE_URL: z.string().url().default('ws://localhost:7880'),
  LAG_VOICE_KEY: z.string().min(1).default('devkey'),
  LAG_VOICE_SECRET: z.string().min(1).default('secret'),
  AUTH_PROVIDER: z.enum(['prism', 'oidc', 'oauth2']),
  AUTH_PROVIDER_LABEL: z.string().trim().min(1).max(64).optional(),
  GUEST_ENABLED: bool.default('false'),
  ALLOWED_HOSTS: z.string().min(1),
  PROXY_HEADER: z.string().regex(/^[a-z0-9-]+$/).optional(),
  SESSION_IDLE_SECONDS: positiveInteger(7 * 24 * 60 * 60),
  SESSION_ABSOLUTE_SECONDS: positiveInteger(30 * 24 * 60 * 60),
  OAUTH_TRANSACTION_SECONDS: positiveInteger(10 * 60),
  AUTH_CLIENT_ID: z.string().min(1),
  AUTH_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_SCOPES: z.string().default('openid profile email'),
  AUTH_ADMIN_CLAIM_PATH: z.string().min(1).optional(),
  AUTH_ADMIN_CLAIM_VALUE: z.string().min(1).optional(),
  OIDC_ISSUER: url.optional(),
  OAUTH_AUTHORIZATION_ENDPOINT: z.string().url().optional(),
  OAUTH_TOKEN_ENDPOINT: z.string().url().optional(),
  OAUTH_USERINFO_ENDPOINT: z.string().url().optional(),
  OAUTH_SUBJECT_PATH: z.string().min(1).optional(),
  OAUTH_NAME_PATH: z.string().min(1).optional(),
  OAUTH_EMAIL_PATH: z.string().min(1).optional(),
  OAUTH_AVATAR_PATH: z.string().min(1).optional(),
  AUTH_PKCE: z.enum(['required', 'auto', 'disabled']).default('required'),
  PRISM_ISSUER: url.optional(),
  PRISM_TEAM_CLAIM_PATH: z.string().default('teams'),
  PRISM_TEAM_ID_PATH: z.string().default('id'),
  PRISM_TEAM_ROLE_PATH: z.string().default('role'),
  PRISM_OWNER_ROLES: z.string().default('owner,co-owner'),
  PRISM_TEAM_ID: z.string().min(1).optional(),
});

export interface AuthConfig {
  provider: 'prism' | 'oidc' | 'oauth2';
  label?: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  subjectPath: string;
  namePath: string;
  emailPath?: string;
  avatarPath?: string;
  pkce: 'required' | 'auto' | 'disabled';
  adminClaimPath?: string;
  adminClaimValue?: string;
  prism: { teamClaimPath: string; teamIdPath: string; teamRolePath: string; ownerRoles: string[]; teamId?: string };
}

export interface AppConfig {
  databaseUrl: string;
  port: number;
  webPort: number;
  voicePort: number;
  externalHost: string;
  voiceUrl: string;
  voiceKey: string;
  voiceSecret: string;
  guestEnabled: boolean;
  allowedOrigins: ReadonlySet<string>;
  proxyHeader?: string;
  sessionIdleSeconds: number;
  sessionAbsoluteSeconds: number;
  oauthTransactionSeconds: number;
  auth: AuthConfig;
}

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const allowed = parsed.ALLOWED_HOSTS.split(',').map((entry) => entry.trim().replace(/\/+$/, ''));
  const allowedHostnames = new Set<string>();
  for (const origin of allowed) {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin || parsedOrigin.pathname !== '/') {
      throw new Error(`ALLOWED_HOSTS entry must be a full origin: ${origin}`);
    }
    if (allowedHostnames.has(parsedOrigin.host)) throw new Error(`ALLOWED_HOSTS entries must use unique hosts: ${parsedOrigin.host}`);
    allowedHostnames.add(parsedOrigin.host);
  }

  const issuer = parsed.AUTH_PROVIDER === 'prism' ? parsed.PRISM_ISSUER : parsed.OIDC_ISSUER;
  if ((parsed.AUTH_PROVIDER === 'prism' || parsed.AUTH_PROVIDER === 'oidc') && !issuer) {
    throw new Error(`${parsed.AUTH_PROVIDER === 'prism' ? 'PRISM_ISSUER' : 'OIDC_ISSUER'} is required`);
  }
  if (parsed.AUTH_PROVIDER === 'oauth2') {
    for (const [name, value] of [
      ['OAUTH_AUTHORIZATION_ENDPOINT', parsed.OAUTH_AUTHORIZATION_ENDPOINT],
      ['OAUTH_TOKEN_ENDPOINT', parsed.OAUTH_TOKEN_ENDPOINT],
      ['OAUTH_USERINFO_ENDPOINT', parsed.OAUTH_USERINFO_ENDPOINT],
      ['OAUTH_SUBJECT_PATH', parsed.OAUTH_SUBJECT_PATH],
      ['OAUTH_NAME_PATH', parsed.OAUTH_NAME_PATH],
    ]) if (!value) throw new Error(`${name} is required for oauth2`);
    if (!parsed.AUTH_CLIENT_SECRET) throw new Error('AUTH_CLIENT_SECRET is required for oauth2');
  }
  if (!parsed.AUTH_CLIENT_SECRET && parsed.AUTH_PKCE === 'disabled') {
    throw new Error('AUTH_CLIENT_SECRET is required when PKCE is disabled');
  }

  return {
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    voicePort: parsed.VOICE_PORT,
    externalHost: parsed.EXTERNAL_HOST,
    voiceUrl: parsed.VOICE_URL.replace(/\/+$/, ''),
    voiceKey: parsed.LAG_VOICE_KEY,
    voiceSecret: parsed.LAG_VOICE_SECRET,
    guestEnabled: parsed.GUEST_ENABLED,
    allowedOrigins: new Set(allowed),
    proxyHeader: parsed.PROXY_HEADER,
    sessionIdleSeconds: parsed.SESSION_IDLE_SECONDS,
    sessionAbsoluteSeconds: parsed.SESSION_ABSOLUTE_SECONDS,
    oauthTransactionSeconds: parsed.OAUTH_TRANSACTION_SECONDS,
    auth: {
      provider: parsed.AUTH_PROVIDER,
      label: parsed.AUTH_PROVIDER_LABEL ?? (parsed.AUTH_PROVIDER === 'prism' ? 'Prism' : parsed.AUTH_PROVIDER === 'oidc' ? 'OpenID Connect' : 'OAuth 2.0'),
      clientId: parsed.AUTH_CLIENT_ID,
      clientSecret: parsed.AUTH_CLIENT_SECRET,
      scopes: [...new Set([
        ...parsed.AUTH_SCOPES.split(/\s+/).filter(Boolean),
        ...(parsed.AUTH_PROVIDER === 'prism' && parsed.PRISM_TEAM_ID ? ['teams:read'] : []),
      ])],
      issuer,
      authorizationEndpoint: parsed.OAUTH_AUTHORIZATION_ENDPOINT,
      tokenEndpoint: parsed.OAUTH_TOKEN_ENDPOINT,
      userinfoEndpoint: parsed.OAUTH_USERINFO_ENDPOINT,
      subjectPath: parsed.OAUTH_SUBJECT_PATH ?? 'sub',
      namePath: parsed.OAUTH_NAME_PATH ?? 'preferred_username',
      emailPath: parsed.OAUTH_EMAIL_PATH,
      avatarPath: parsed.OAUTH_AVATAR_PATH,
      pkce: parsed.AUTH_PKCE,
      adminClaimPath: parsed.AUTH_ADMIN_CLAIM_PATH,
      adminClaimValue: parsed.AUTH_ADMIN_CLAIM_VALUE,
      prism: {
        teamClaimPath: parsed.PRISM_TEAM_CLAIM_PATH,
        teamIdPath: parsed.PRISM_TEAM_ID_PATH,
        teamRolePath: parsed.PRISM_TEAM_ROLE_PATH,
        ownerRoles: parsed.PRISM_OWNER_ROLES.split(',').map((role) => role.trim()).filter(Boolean),
        teamId: parsed.PRISM_TEAM_ID,
      },
    },
  };
}

export function getConfig(): AppConfig {
  return cached ??= loadConfig();
}
