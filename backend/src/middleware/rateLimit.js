import { clientIp } from '../client.js';

export function rateLimit({ requests, windowSeconds, onReject }) {
  const windowMs = windowSeconds * 1000;
  const hits = new Map();

  function countFor(key, now) {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length;
  }

  function evictExpired(now) {
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= windowMs)) hits.delete(key);
    }
  }

  return function limiter(req, res, next) {
    const now = Date.now();
    evictExpired(now);

    if (countFor(clientIp(req), now) > requests) {
      onReject?.('rate_limited');
      res.status(429).json({ error: 'DANA_RATE_LIMITED' });
      return;
    }

    next();
  };
}
