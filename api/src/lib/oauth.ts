import { createHash } from 'node:crypto';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import type { AuthConfig } from '../config.js';
import { opaqueToken } from './session.js';

export interface ProviderMetadata { issuer: string; authorization_endpoint: string; token_endpoint: string; userinfo_endpoint?: string; end_session_endpoint?: string; jwks_uri?: string; code_challenge_methods_supported?: string[] }
const cache = new Map<string, Promise<ProviderMetadata>>();

export function dotPath(value: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value);
}

export function matchesClaim(claims: unknown, path?: string, expected?: string): boolean {
  if (!path || expected === undefined) return false;
  const value = dotPath(claims, path);
  return Array.isArray(value) ? value.map(String).includes(expected) : String(value) === expected;
}

export async function metadata(config: AuthConfig): Promise<ProviderMetadata> {
  if (config.provider === 'oauth2') return { issuer: 'oauth2', authorization_endpoint: config.authorizationEndpoint!, token_endpoint: config.tokenEndpoint!, userinfo_endpoint: config.userinfoEndpoint };
  const issuer = config.issuer!;
  let promise = cache.get(issuer);
  if (!promise) {
    promise = fetch(`${issuer}/.well-known/openid-configuration`).then(async (response) => {
      if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
      const result = await response.json() as ProviderMetadata;
      if (result.issuer.replace(/\/+$/, '') !== issuer) throw new Error('OIDC discovery issuer mismatch');
      return result;
    });
    cache.set(issuer, promise);
  }
  return promise;
}

export function createAuthorization(config: AuthConfig, provider: ProviderMetadata, redirectUri: string, state: string, nonce: string, verifier: string) {
  const endpoint = new URL(provider.authorization_endpoint);
  endpoint.searchParams.set('response_type', 'code'); endpoint.searchParams.set('client_id', config.clientId);
  endpoint.searchParams.set('redirect_uri', redirectUri); endpoint.searchParams.set('scope', config.scopes.join(' ')); endpoint.searchParams.set('state', state);
  if (config.provider !== 'oauth2') endpoint.searchParams.set('nonce', nonce);
  const supportsPkce = provider.code_challenge_methods_supported?.includes('S256') ?? config.provider === 'oauth2';
  if (config.pkce === 'required' && !supportsPkce) throw new Error('Provider does not advertise PKCE S256');
  if (config.pkce === 'required' || (config.pkce === 'auto' && supportsPkce)) {
    endpoint.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); endpoint.searchParams.set('code_challenge_method', 'S256');
  }
  return endpoint.toString();
}

export async function exchangeCode(config: AuthConfig, provider: ProviderMetadata, redirectUri: string, code: string, verifier?: string) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: config.clientId });
  if (config.clientSecret) body.set('client_secret', config.clientSecret); if (verifier) body.set('code_verifier', verifier);
  const response = await fetch(provider.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body });
  if (!response.ok) throw new Error(`Token exchange failed (${response.status})`);
  return response.json() as Promise<{ access_token: string; id_token?: string }>;
}

export async function resolveClaims(config: AuthConfig, provider: ProviderMetadata, tokens: { access_token: string; id_token?: string }, nonce?: string): Promise<JWTPayload> {
  if (config.provider !== 'oauth2') {
    if (!tokens.id_token || !provider.jwks_uri) throw new Error('OIDC response omitted ID token or JWKS URI');
    const idClaims = (await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(provider.jwks_uri)), { issuer: provider.issuer, audience: config.clientId, requiredClaims: ['nonce'] })).payload;
    if (!provider.userinfo_endpoint) return idClaims;
    const response = await fetch(provider.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' } });
    if (!response.ok) throw new Error(`Userinfo request failed (${response.status})`);
    const userinfo = await response.json() as JWTPayload;
    if (userinfo.sub !== idClaims.sub) throw new Error('Userinfo subject does not match ID token');
    return { ...idClaims, ...userinfo, sub: idClaims.sub, iss: idClaims.iss, aud: idClaims.aud, nonce: idClaims.nonce };
  }
  const response = await fetch(provider.userinfo_endpoint!, { headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' } });
  if (!response.ok) throw new Error(`Userinfo request failed (${response.status})`);
  return response.json() as Promise<JWTPayload>;
}

export function validateNonce(idToken: string | undefined, expected: string): void {
  if (!idToken || decodeJwt(idToken).nonce !== expected) throw new Error('OIDC nonce mismatch');
}

export const newOAuthSecrets = () => ({ state: opaqueToken(), nonce: opaqueToken(), verifier: opaqueToken(48) });
