import { clientIp, userAgent } from '../client.js';
import { fingerprint } from '../session.js';

export function requireSession({ sessions, secret, analytics }) {
  return function check(req, res, next) {
    if (sessions.verify(req.params.session)) {
      next();
      return;
    }

    analytics.sessionRejected({
      fingerprint: fingerprint(req.params.session, secret),
      ip: clientIp(req),
      user_agent: userAgent(req)
    });

    res.status(401).json({ error: 'INVALID_SESSION' });
  };
}
