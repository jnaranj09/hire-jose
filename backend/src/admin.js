import express from 'express';

// The token admin page. It runs on its own listener, not on the public one,
// so there is no path on the public site that reaches any of this and no
// HAProxy rule to get wrong.
//
// Two guards are still here, because "loopback only" is not the same as
// "unreachable from a browser":
//
//   * Host allow-list — stops DNS rebinding, where a page you visit resolves
//     its own domain to 127.0.0.1 and then talks to this port as same-origin.
//   * A custom header on every write — a cross-site form or fetch cannot set
//     one without a preflight, and nothing here answers a preflight.

const MAX_DAYS = 3650;
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// "127.0.0.1:3001" -> "127.0.0.1", "[::1]:3001" -> "[::1]".
export function hostname(raw) {
  const host = String(raw ?? '').trim();
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0];
}

function guardHost(req, res, next) {
  if (!ALLOWED_HOSTS.has(hostname(req.headers.host))) {
    res.status(403).json({ error: 'BAD_HOST' });
    return;
  }
  next();
}

function guardWrite(req, res, next) {
  if (req.get('x-admin-request') !== '1') {
    res.status(403).json({ error: 'MISSING_ADMIN_HEADER' });
    return;
  }
  next();
}

function expiryFrom(body) {
  const raw = body?.expiresInDays;
  if (raw === null || raw === undefined || raw === '') return null;

  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) {
    return new Error(`expiresInDays must be a number between 1 and ${MAX_DAYS}, or empty for never`);
  }
  return Date.now() + Math.round(days * 86400 * 1000);
}

export function createAdminApp({ tokens, adminPath, siteUrl = '' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(guardHost);

  const api = express.Router();

  api.use((req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
  });

  api.get('/tokens', (req, res) => {
    res.json({ tokens: tokens.list(), siteUrl });
  });

  api.post('/tokens', guardWrite, (req, res) => {
    const expiresAt = expiryFrom(req.body);
    if (expiresAt instanceof Error) {
      res.status(400).json({ error: 'BAD_EXPIRY', message: expiresAt.message });
      return;
    }

    const label = String(req.body?.label ?? '').trim();
    if (!label) {
      res.status(400).json({ error: 'MISSING_LABEL', message: 'Give the link a label so you know who has it' });
      return;
    }

    // The only time the raw token exists outside the caller's browser.
    const { token, record } = tokens.create({ label, expiresAt });
    res.status(201).json({
      token,
      link: `${siteUrl}/?chat_bot_token=${encodeURIComponent(token)}`,
      record
    });
  });

  api.post('/tokens/:id/revoke', guardWrite, (req, res) => {
    const record = tokens.revoke(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.json({ record });
  });

  api.delete('/tokens/:id', guardWrite, (req, res) => {
    if (!tokens.remove(req.params.id)) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.status(204).end();
  });

  app.use('/api', api);

  app.use(
    express.static(adminPath, {
      index: 'index.html',
      dotfiles: 'ignore',
      setHeaders(res) {
        res.set('cache-control', 'no-store');
      }
    })
  );

  app.use((req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  return app;
}
