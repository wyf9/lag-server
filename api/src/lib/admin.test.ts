import assert from 'node:assert/strict';
import test from 'node:test';
import { validUserSearch } from './admin.js';

test('admin user search permits lists, exact UUIDs, and two-character terms', () => {
  assert.equal(validUserSearch(undefined), true);
  assert.equal(validUserSearch(''), true);
  assert.equal(validUserSearch('ab'), true);
  assert.equal(validUserSearch('a'), false);
  assert.equal(validUserSearch('3f9b76be-f816-4a69-a073-51bfffe25220'), true);
});
