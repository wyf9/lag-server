import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://example.invalid/app', AUTH_PROVIDER: 'oidc', ALLOWED_HOSTS: 'https://app.example.test',
  AUTH_CLIENT_ID: 'client', OIDC_ISSUER: 'https://id.example.test',
};

test('loads centralized OIDC defaults and exact origins', () => {
  const config = loadConfig(base);
  assert.equal(config.sessionIdleSeconds, 7 * 24 * 60 * 60);
  assert.equal(config.sessionAbsoluteSeconds, 30 * 24 * 60 * 60);
  assert.equal(config.auth.pkce, 'required');
  assert.equal(config.auth.label, 'OpenID Connect');
  assert.equal(config.allowedOrigins.has('https://app.example.test'), true);
  assert.equal(config.allowedOrigins.has('https://app.example.test.evil'), false);
});

test('supports a public-facing provider label', () => {
  assert.equal(loadConfig({ ...base, AUTH_PROVIDER_LABEL: 'Company SSO' }).auth.label, 'Company SSO');
});

test('rejects hosts that are not full origins', () => {
  assert.throws(() => loadConfig({ ...base, ALLOWED_HOSTS: 'app.example.test' }), /Invalid URL|full origin/);
});

test('requires explicit generic OAuth endpoints and fields', () => {
  assert.throws(() => loadConfig({ ...base, AUTH_PROVIDER: 'oauth2', OIDC_ISSUER: undefined }), /OAUTH_AUTHORIZATION_ENDPOINT/);
});
