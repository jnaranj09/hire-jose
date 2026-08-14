import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { createTokenStore, hashToken, statusOf } from '../src/tokens.js';

const SECRET = 'test-secret-at-least-16-chars';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-jose-tokens-'));
let file;
let clock;

function store() {
  return createTokenStore({ filePath: file, secret: SECRET, now: () => clock });
}

beforeEach(() => {
  file = path.join(dir, `${Math.random().toString(16).slice(2)}.json`);
  clock = Date.UTC(2026, 0, 1);
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('token store', () => {
  it('starts empty when the file does not exist yet', () => {
    const tokens = store();
    assert.equal(tokens.load(), 0);
    assert.deepEqual(tokens.list(), []);
  });

  it('accepts a token it created', () => {
    const tokens = store();
    const { token, record } = tokens.create({ label: 'Buffer' });

    assert.match(token, /^hj_[\w-]{32}$/);
    assert.equal(record.status, 'active');
    assert.equal(tokens.verify(token).label, 'Buffer');
  });

  it('never writes the raw token to disk', () => {
    const tokens = store();
    const { token } = tokens.create({ label: 'Buffer' });
    const raw = fs.readFileSync(file, 'utf8');

    assert.ok(!raw.includes(token), 'tokens.json must not contain the token');
    assert.ok(raw.includes(hashToken(token)), 'it should contain the hash instead');
  });

  it('rejects an unknown token', () => {
    const tokens = store();
    tokens.create({ label: 'Buffer' });

    assert.equal(tokens.verify('hj_not-a-real-token'), null);
    assert.equal(tokens.verify(''), null);
    assert.equal(tokens.verify(undefined), null);
  });

  it('rejects a revoked token straight away', () => {
    const tokens = store();
    const { token, record } = tokens.create({ label: 'Buffer' });

    assert.ok(tokens.verify(token));
    assert.equal(tokens.revoke(record.id).status, 'revoked');
    assert.equal(tokens.verify(token), null);
  });

  it('rejects a token past its expiry', () => {
    const tokens = store();
    const { token } = tokens.create({ label: 'Buffer', expiresAt: clock + 1000 });

    assert.ok(tokens.verify(token));
    clock += 1001;
    assert.equal(tokens.verify(token), null);
    assert.equal(tokens.list()[0].status, 'expired');
  });

  it('treats a null expiry as never', () => {
    const tokens = store();
    const { token } = tokens.create({ label: 'forever' });

    clock += 365 * 86400 * 1000;
    assert.ok(tokens.verify(token));
  });

  it('deletes a token and its row', () => {
    const tokens = store();
    const { token, record } = tokens.create({ label: 'Buffer' });

    assert.equal(tokens.remove(record.id), true);
    assert.equal(tokens.remove(record.id), false);
    assert.equal(tokens.verify(token), null);
    assert.deepEqual(tokens.list(), []);
  });

  it('survives a restart', () => {
    const first = store();
    const { token } = first.create({ label: 'Buffer', expiresAt: clock + 86400000 });

    const second = store();
    assert.equal(second.load(), 1);
    assert.equal(second.verify(token).label, 'Buffer');
  });

  // This is what "no restart" rests on: the file is the source of truth and
  // is re-read whenever it changes.
  it('picks up a change made by another process', () => {
    const writer = store();
    const reader = store();
    reader.load();

    const { token } = writer.create({ label: 'made elsewhere' });
    assert.equal(reader.verify(token).label, 'made elsewhere');

    writer.revoke(writer.list()[0].id);
    assert.equal(reader.verify(token), null);
  });

  it('keeps working when the file is corrupted under it', () => {
    const tokens = store();
    const { token } = tokens.create({ label: 'Buffer' });

    fs.writeFileSync(file, '{ not json');
    assert.ok(tokens.verify(token), 'a broken file must not lock everyone out');
  });

  it('refuses to start on a corrupt file', () => {
    fs.writeFileSync(file, '{ not json');
    assert.throws(() => store().load());
  });

  it('records use without exposing anything new', () => {
    const tokens = store();
    const { token } = tokens.create({ label: 'Buffer' });

    tokens.verify(token);
    const [row] = tokens.list();

    assert.equal(row.uses, 1);
    assert.equal(row.lastUsedAt, clock);
    assert.equal(row.hash, undefined, 'the hash must never reach the admin page');
  });

  it('labels blank input rather than storing an empty one', () => {
    const tokens = store();
    const { record } = tokens.create({ label: '   ' });
    assert.equal(record.label, 'unnamed');
  });

  it('reports status from the record', () => {
    assert.equal(statusOf({ revokedAt: 5, expiresAt: null }, 10), 'revoked');
    assert.equal(statusOf({ revokedAt: null, expiresAt: 5 }, 10), 'expired');
    assert.equal(statusOf({ revokedAt: null, expiresAt: 50 }, 10), 'active');
    assert.equal(statusOf({ revokedAt: null, expiresAt: null }, 10), 'active');
  });
});
