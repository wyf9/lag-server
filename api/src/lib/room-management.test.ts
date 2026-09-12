import assert from 'node:assert/strict';
import test from 'node:test';
import { canManageRole, publicInvitation } from './room-management.js';

test('room role management preserves moderator boundaries', () => {
  assert.equal(canManageRole('owner', false, 'moderator'), true);
  assert.equal(canManageRole('moderator', false, 'speaker'), true);
  assert.equal(canManageRole('moderator', false, 'moderator'), false);
  assert.equal(canManageRole('moderator', false, null), false);
  assert.equal(canManageRole('listener', false, 'listener'), false);
  assert.equal(canManageRole(null, true, 'owner'), true);
});

test('public invitations never include token hashes', () => {
  assert.deepEqual(publicInvitation({ id: 'invite', tokenHash: 'secret-hash', permission: 'speaker' }), {
    id: 'invite',
    permission: 'speaker',
  });
});
