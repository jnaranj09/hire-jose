import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createAdminApp } from '../src/admin.js';
import { createTokenStore } from '../src/tokens.js';

const SECRET = 'test-secret-at-least-16-chars';
const here = path.dirname(fileURLToPath(import.meta.url));
const adminPath = path.resolve(here, '../../frontend/admin');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-jose-admin-'));

let server;
let base;
let tokens;

before(async () => {
  tokens = createTokenStore({ filePath: path.join(dir, 'tokens.json'), secret: SECRET });
  tokens.load();

  const app = createAdminApp({
    tokens,
    adminPath,
    siteUrl: 'https://demo.example'
  });

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function call(method, url, { body, headers = {} } = {}) {
  return fetch(`${base}${url}`, {
    method,
    headers: {
      'x-admin-request': '1',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function rawGet(url, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, path: url, method: 'GET', headers: { host, 'x-admin-request': '1' } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('admin api', () => {
  it('creates a token and returns the link once', async () => {
    const res = await call('POST', '/api/tokens', { body: { label: 'Buffer', expiresInDays: 30 } });
    assert.equal(res.status, 201);

    const data = await res.json();
    assert.match(data.token, /^hj_/);
    assert.equal(data.link, `https://demo.example/?chat_bot_token=${encodeURIComponent(data.token)}`);
    assert.equal(data.record.label, 'Buffer');
    assert.ok(data.record.expiresAt > Date.now());
  });

  it('lists tokens without the token or its hash', async () => {
    const res = await call('GET', '/api/tokens');
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.ok(data.tokens.length >= 1);
    for (const row of data.tokens) {
      assert.equal(row.hash, undefined);
      assert.equal(row.token, undefined);
      assert.equal(row.fingerprint.length, 12);
    }
  });

  it('refuses a token with no label', async () => {
    const res = await call('POST', '/api/tokens', { body: { label: '  ' } });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'MISSING_LABEL');
  });

  it('refuses a silly expiry', async () => {
    for (const expiresInDays of [0, -3, 99999, 'soon']) {
      const res = await call('POST', '/api/tokens', { body: { label: 'x', expiresInDays } });
      assert.equal(res.status, 400, `expiresInDays=${expiresInDays}`);
    }
  });

  it('accepts an empty expiry as never', async () => {
    const res = await call('POST', '/api/tokens', { body: { label: 'forever', expiresInDays: null } });
    assert.equal((await res.json()).record.expiresAt, null);
  });

  it('revokes, then reports 404 the second time', async () => {
    const created = await (await call('POST', '/api/tokens', { body: { label: 'gone' } })).json();

    const first = await call('POST', `/api/tokens/${created.record.id}/revoke`, { body: {} });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).record.status, 'revoked');

    const second = await call('POST', `/api/tokens/${created.record.id}/revoke`, { body: {} });
    assert.equal(second.status, 404);
  });

  it('deletes a token', async () => {
    const created = await (await call('POST', '/api/tokens', { body: { label: 'delete me' } })).json();

    assert.equal((await call('DELETE', `/api/tokens/${created.record.id}`)).status, 204);
    assert.equal((await call('DELETE', `/api/tokens/${created.record.id}`)).status, 404);
  });

  // A page on another site can send a plain POST to localhost. It cannot set a
  // custom header without a preflight, and nothing here answers one.
  it('refuses a write without the admin header', async () => {
    const res = await fetch(`${base}/api/tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'csrf' })
    });

    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'MISSING_ADMIN_HEADER');
  });

  // DNS rebinding: a domain that resolves to 127.0.0.1 arrives with its own
  // name in the Host header. fetch() refuses to set that header, so this one
  // goes through the raw client.
  it('refuses a request for a host that is not localhost', async () => {
    const { status, body } = await rawGet('/api/tokens', 'evil.example');
    assert.equal(status, 403);
    assert.equal(JSON.parse(body).error, 'BAD_HOST');
  });

  it('allows the hosts a port-forward and a browser actually send', async () => {
    for (const host of ['localhost:1234', '127.0.0.1:1234', '[::1]:1234']) {
      assert.equal((await rawGet('/api/tokens', host)).status, 200, host);
    }
  });

  it('serves the page itself', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Access tokens/);
  });
});
