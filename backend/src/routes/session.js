import { Router } from 'express';
import { clientIp, userAgent } from '../client.js';
import { fingerprint, matches } from '../session.js';

const PREVIEW_CHARS = 12;

export function sessionRoute({ sessions, tokens, legacyToken, secret, ttlSeconds, analytics, guards }) {
  const router = Router();

  router.post('/session', ...guards, (req, res) => {
    const candidate = String(req.body?.chat_bot_token ?? '');

    // A managed token first, then the original env one if it is still set.
    const { status, record } = tokens.check(candidate);
    const legacy = status === 'unknown' && Boolean(legacyToken) && matches(candidate, legacyToken);
    const accepted = status === 'active' || legacy;

    // A revoked or expired token is still a real one, so it gets no preview —
    // only an outright wrong guess does. Its label is logged instead, which is
    // the more useful signal: somebody is still trying a link you cut off.
    const known = status !== 'unknown' || legacy;

    analytics.sessionAttempt({
      accepted,
      reason: accepted ? null : status,
      fingerprint: fingerprint(candidate, secret),
      token_label: record ? record.label : (legacy ? 'environment' : null),
      token_length: candidate.length,
      token_preview: known ? null : candidate.slice(0, PREVIEW_CHARS),
      ip: clientIp(req),
      user_agent: userAgent(req)
    });

    if (!accepted) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }

    // Cut the session short if the token dies first, so revoking a link is not
    // undone by a session that was handed out minutes earlier.
    const remaining = record?.expiresAt
      ? Math.ceil((record.expiresAt - Date.now()) / 1000)
      : ttlSeconds;
    const ttl = Math.max(1, Math.min(ttlSeconds, remaining));

    res.json({ session: sessions.issue(ttl), expires_in: ttl });
  });

  return router;
}
