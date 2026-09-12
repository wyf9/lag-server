import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createAuthorization, dotPath, matchesClaim, type ProviderMetadata } from './oauth.js';
import type { AuthConfig } from '../config.js';

const auth: AuthConfig = {
  provider: 'oidc', clientId: 'client', scopes: ['openid'], issuer: 'https://id.test',
  subjectPath: 'sub', namePath: 'profile.name', pkce: 'required', prism: { teamClaimPath: 'teams', teamIdPath: 'id', teamRolePath: 'role', ownerRoles: ['owner', 'co-owner'] },
};
const provider: ProviderMetadata = { issuer: 'https://id.test', authorization_endpoint: 'https://id.test/authorize', token_endpoint: 'https://id.test/token', code_challenge_methods_supported: ['S256'] };

test('dot paths and dynamic claims support nested and array values', () => {
  const claims = { profile: { name: 'Ada' }, roles: ['member', 'admin'] };
  assert.equal(dotPath(claims, 'profile.name'), 'Ada');
  assert.equal(matchesClaim(claims, 'roles', 'admin'), true);
});

test('authorization request contains state nonce and S256 PKCE', () => {
  const result = new URL(createAuthorization(auth, provider, 'https://app.example.test/api/auth/callback', 'state', 'nonce', 'verifier'));
  assert.equal(result.searchParams.get('state'), 'state');
  assert.equal(result.searchParams.get('nonce'), 'nonce');
  assert.equal(result.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(result.searchParams.get('code_challenge'), createHash('sha256').update('verifier').digest('base64url'));
});
