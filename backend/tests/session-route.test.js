import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { createAnalytics } from '../src/analytics.js';
import { createSessions } from '../src/session.js';
import { createTokenStore } from '../src/tokens.js';
import { sessionRoute } from '../src/routes/session.js';

const SECRET = 'test-secret-at-least-16-chars';
const LEGACY = 'legacy-token-from-the-environment';
const TTL = 3600;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-jose-session-'));
const logged = [];

let server;
let base;
let tokens;

before(async () => {
  tokens = createTokenStore({ filePath: path.join(dir, 'tokens.json'), secret: SECRET });
  tokens.load();

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    sessionRoute({
      sessions: createSessions({ secret: SECRET, ttlSeconds: TTL }),
      tokens,
      legacyToken: LEGACY,
      secret: SECRET,
      ttlSeconds: TTL,
      analytics: createAnalytics((line) => logged.push(JSON.parse(line))),
      guards: []
    })
  );

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function open(chat_bot_token) {
  return fetch(`${base}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_bot_token })
  });
}

describe('POST /api/session', () => {
  it('opens a session for a managed token', async () => {
    const { token } = tokens.create({ label: 'Buffer' });
    const res = await open(token);

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.session.split('.').length, 3);
    assert.equal(data.expires_in, TTL);
  });

  // The point of keeping this: a link sent before the admin page existed must
  // not break.
  it('still opens a session for the original env token', async () => {
    const res = await open(LEGACY);
    assert.equal(res.status, 200);

    const attempt = logged.findLast((line) => line.event === 'session_attempt');
    assert.equal(attempt.accepted, true);
    assert.equal(attempt.token_label, 'environment');
  });

  it('refuses a wrong token', async () => {
    const res = await open('hj_definitely-not-valid');
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'INVALID_TOKEN');
  });

  it('refuses a missing token', async () => {
    const res = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(res.status, 401);
  });

  it('refuses a revoked token, with no restart in between', async () => {
    const { token, record } = tokens.create({ label: 'revoke me' });
    assert.equal((await open(token)).status, 200);

    tokens.revoke(record.id);
    assert.equal((await open(token)).status, 401);
  });

  it('cuts the session short when the token expires first', async () => {
    const { token } = tokens.create({ label: 'short', expiresAt: Date.now() + 60_000 });
    const data = await (await open(token)).json();

    assert.ok(data.expires_in <= 60, `expected <= 60s, got ${data.expires_in}`);
    assert.ok(data.expires_in > 0);
  });

  it('logs the label on an accepted attempt and a preview on a rejected one', async () => {
    const { token } = tokens.create({ label: 'log check' });
    await open(token);
    assert.equal(logged.at(-1).token_label, 'log check');
    assert.equal(logged.at(-1).token_preview, null);

    await open('admin');
    assert.equal(logged.at(-1).accepted, false);
    assert.equal(logged.at(-1).token_preview, 'admin');
    assert.equal(logged.at(-1).token_label, null);
  });

  // A revoked token is still a real token. Logging the first 12 characters of
  // it, the way a guess of "admin" is logged, would put part of it on disk.
  it('logs a revoked token by label, never by preview', async () => {
    const { token, record } = tokens.create({ label: 'cut off' });
    tokens.revoke(record.id);

    assert.equal((await open(token)).status, 401);
    const line = logged.at(-1);

    assert.equal(line.accepted, false);
    assert.equal(line.reason, 'revoked');
    assert.equal(line.token_label, 'cut off');
    assert.equal(line.token_preview, null);
  });

  it('never logs an accepted token in readable form', async () => {
    const { token } = tokens.create({ label: 'secrecy' });
    await open(token);

    const dump = JSON.stringify(logged);
    assert.ok(!dump.includes(token));
    assert.ok(!dump.includes(LEGACY));
  });
});
