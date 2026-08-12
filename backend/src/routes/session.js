import { Router } from 'express';
import { clientIp, userAgent } from '../client.js';
import { fingerprint, matches } from '../session.js';

const PREVIEW_CHARS = 12;

export function sessionRoute({ sessions, accessToken, secret, ttlSeconds, analytics, guards }) {
  const router = Router();

  router.post('/session', ...guards, (req, res) => {
    const candidate = String(req.body?.chat_bot_token ?? '');
    const accepted = matches(candidate, accessToken);

    analytics.sessionAttempt({
      accepted,
      fingerprint: fingerprint(candidate, secret),
      token_length: candidate.length,
      token_preview: accepted ? null : candidate.slice(0, PREVIEW_CHARS),
      ip: clientIp(req),
      user_agent: userAgent(req)
    });

    if (!accepted) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }

    res.json({ session: sessions.issue(), expires_in: ttlSeconds });
  });

  return router;
}
