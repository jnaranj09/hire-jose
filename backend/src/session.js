import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function fingerprint(value, secret) {
  return createHmac('sha256', secret).update(String(value ?? '')).digest('hex').slice(0, 12);
}

export function matches(candidate, expected) {
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSessions({ secret, ttlSeconds }) {
  return {
    // A session must never outlive the token that opened it, so the caller can
    // ask for a shorter one when the token expires first.
    issue(seconds = ttlSeconds) {
      const payload = `${Date.now() + Math.max(1, seconds) * 1000}.${randomBytes(9).toString('base64url')}`;
      return `${payload}.${sign(payload, secret)}`;
    },

    verify(value) {
      const parts = String(value ?? '').split('.');
      if (parts.length !== 3) return false;

      const [expiresAt, nonce, signature] = parts;
      if (!matches(signature, sign(`${expiresAt}.${nonce}`, secret))) return false;

      return Number(expiresAt) > Date.now();
    }
  };
}
