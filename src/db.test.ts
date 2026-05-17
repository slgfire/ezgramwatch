import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';

test('db: account upsert and retrieval', () => {
  const db = openDb(':memory:');
  db.upsertAccount('a1', 'testuser', 'myalias');
  const row = db.getAccount('a1');
  assert.equal(row?.username, 'testuser');
  assert.equal(row?.alias, 'myalias');
  assert.equal(row?.initial_import_done, 0);

  db.upsertAccount('a1', 'updated', undefined);
  assert.equal(db.getAccount('a1')?.username, 'updated');
  db.close();
});

test('db: insertMedia deduplication', () => {
  const db = openDb(':memory:');
  db.upsertAccount('a1', null, undefined);

  const item = { id: 'm1', account_id: 'a1', media_type: 'IMAGE', timestamp: '2025-01-01T10:00:00Z' };
  assert.equal(db.insertMedia(item), true, 'first insert should return true');
  assert.equal(db.insertMedia(item), false, 'duplicate insert should return false');
  db.close();
});

test('db: posting flow', () => {
  const db = openDb(':memory:');
  db.upsertAccount('a1', null, undefined);
  db.insertMedia({ id: 'm1', account_id: 'a1', media_type: 'IMAGE', timestamp: '2025-01-01T09:00:00Z' });
  db.insertMedia({ id: 'm2', account_id: 'a1', media_type: 'VIDEO', timestamp: '2025-01-01T10:00:00Z' });

  const unposted = db.getUnposted('a1');
  assert.equal(unposted.length, 2);
  assert.equal(unposted[0].id, 'm1', 'should be ordered by timestamp ASC');

  db.markPosted('m1');
  assert.equal(db.getUnposted('a1').length, 1);

  db.markAllPosted('a1');
  assert.equal(db.getUnposted('a1').length, 0);
  db.close();
});

test('db: limitFirstRunItems keeps N newest', () => {
  const db = openDb(':memory:');
  db.upsertAccount('a1', null, undefined);
  for (let i = 1; i <= 5; i++) {
    db.insertMedia({ id: `m${i}`, account_id: 'a1', media_type: 'IMAGE', timestamp: `2025-01-0${i}T00:00:00Z` });
  }
  db.limitFirstRunItems('a1', 2);
  const unposted = db.getUnposted('a1');
  assert.equal(unposted.length, 2);
  assert.equal(unposted[0].id, 'm4');
  assert.equal(unposted[1].id, 'm5');
  db.close();
});

test('db: app_state get/set', () => {
  const db = openDb(':memory:');
  assert.equal(db.getState('missing'), undefined);
  db.setState('access_token', 'tok123');
  assert.equal(db.getState('access_token'), 'tok123');
  db.setState('access_token', 'tok456');
  assert.equal(db.getState('access_token'), 'tok456');
  db.close();
});
