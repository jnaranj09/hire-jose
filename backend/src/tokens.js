import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fingerprint } from './session.js';

// Access tokens used to live in one env var, so revoking one meant editing
// .env and restarting the pod — which killed every link at once. They live in
// a JSON file now, owned by this process, so the admin page can add and revoke
// them while the pod keeps running.
//
// The raw token is never stored. Only a SHA-256 of it, which is what a login
// attempt is compared against. SHA-256 and not an HMAC on purpose: the hash
// must not depend on CHAT_BOT_SECRET, or rotating that secret to cut active
// sessions would silently invalidate every link as well.

const PREFIX = 'hj_';
const TOKEN_BYTES = 24;
const TOUCH_INTERVAL_MS = 60_000;

export function newToken() {
  return PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function sameHash(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function statusOf(record, at = Date.now()) {
  if (record.revokedAt) return 'revoked';
  if (record.expiresAt && record.expiresAt <= at) return 'expired';
  return 'active';
}

// What the admin page is allowed to see. The hash never leaves the process:
// it is not the token, but it is the only thing that verifies one.
export function publicView(record, at = Date.now()) {
  return {
    id: record.id,
    label: record.label,
    fingerprint: record.fingerprint,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    uses: record.uses,
    status: statusOf(record, at)
  };
}

export function createTokenStore({ filePath, secret, now = () => Date.now() }) {
  let records = [];
  let knownMtimeMs = -1;

  function readFile() {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tokens)) throw new Error('tokens.json has no tokens array');
    return parsed.tokens;
  }

  // Re-read only when the file changed under us. That keeps a hand edit of
  // tokens.json working without a restart, and costs one stat per call.
  function sync({ strict = false } = {}) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      // No file yet. That is the first run, not an error.
      records = [];
      knownMtimeMs = -1;
      return;
    }

    if (stat.mtimeMs === knownMtimeMs) return;

    try {
      records = readFile();
      knownMtimeMs = stat.mtimeMs;
    } catch (err) {
      // A half-written or hand-broken file must not wipe the tokens that are
      // already loaded, and must not take the chat down.
      if (strict) throw err;
      console.error(JSON.stringify({ event: 'token_store_reload_failed', reason: err.message }));
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ version: 1, tokens: records }, null, 2)}\n`, {
      mode: 0o600
    });
    fs.renameSync(temp, filePath);
    knownMtimeMs = fs.statSync(filePath).mtimeMs;
  }

  function find(id) {
    return records.find((record) => record.id === id) ?? null;
  }

  // Says which of unknown / revoked / expired / active the candidate is.
  // "unknown" is kept apart from the rest on purpose: a real token that was
  // revoked is still a real token, and the caller must not log a preview of it
  // the way it logs somebody guessing "admin".
  //
  // Every record is compared, so the time taken does not reveal which matched.
  function check(candidate) {
    sync();
    const hash = hashToken(candidate);

    let hit = null;
    for (const record of records) {
      if (sameHash(record.hash, hash)) hit = record;
    }
    if (!hit) return { status: 'unknown', record: null };

    const at = now();
    const status = statusOf(hit, at);
    if (status !== 'active') return { status, record: publicView(hit, at) };

    hit.uses += 1;
    if (!hit.lastUsedAt || at - hit.lastUsedAt > TOUCH_INTERVAL_MS) {
      hit.lastUsedAt = at;
      persist();
    }

    return { status, record: publicView(hit, at) };
  }

  return {
    load() {
      sync({ strict: true });
      return records.length;
    },

    list() {
      sync();
      const at = now();
      // Live links first, then newest first within each group — the dead ones
      // are history, not what you came to the page for.
      return records
        .map((record) => publicView(record, at))
        .sort((a, b) => {
          const live = (row) => (row.status === 'active' ? 0 : 1);
          return live(a) - live(b) || b.createdAt - a.createdAt;
        });
    },

    // Returns the raw token exactly once. Nothing keeps it afterwards.
    create({ label, expiresAt = null }) {
      sync();
      const token = newToken();
      const at = now();

      const record = {
        id: randomBytes(6).toString('hex'),
        label: String(label ?? '').trim().slice(0, 80) || 'unnamed',
        hash: hashToken(token),
        // Logs fingerprint an attempt with HMAC(token, CHAT_BOT_SECRET), so
        // storing the same value here is what lets you grep the log for one
        // link. Rotating the secret makes this stale; verification still works.
        fingerprint: fingerprint(token, secret),
        createdAt: at,
        expiresAt: expiresAt ?? null,
        revokedAt: null,
        lastUsedAt: null,
        uses: 0
      };

      records.push(record);
      persist();
      return { token, record: publicView(record, at) };
    },

    revoke(id) {
      sync();
      const record = find(id);
      if (!record || record.revokedAt) return null;

      record.revokedAt = now();
      persist();
      return publicView(record, now());
    },

    remove(id) {
      sync();
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) return false;

      records.splice(index, 1);
      persist();
      return true;
    },

    check,

    // The record only when the token may be used right now, null otherwise.
    verify(candidate) {
      const { status, record } = check(candidate);
      return status === 'active' ? record : null;
    }
  };
}
