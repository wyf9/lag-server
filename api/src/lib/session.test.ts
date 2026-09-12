import assert from 'node:assert/strict';
import test from 'node:test';
import { hashToken, opaqueToken, sessionCookieOptions } from './session.js';

test('opaque session material is random and stored by hash', () => {
  const first = opaqueToken(); const second = opaqueToken();
  assert.notEqual(first, second); assert.equal(hashToken(first).length, 64); assert.notEqual(hashToken(first), first);
});

test('session cookie is secure host-only HttpOnly SameSite=Lax', () => {
  const options = sessionCookieOptions(60);
  assert.deepEqual(options, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 });
  assert.equal('domain' in options, false);
});
