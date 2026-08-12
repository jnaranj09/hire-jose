import path from 'node:path';
import express from 'express';
import { createAnalytics } from './analytics.js';
import { loadKnowledge } from './knowledge.js';
import { OllamaClient } from './ollama.js';
import { createSessions, fingerprint } from './session.js';
import { rateLimit } from './middleware/rateLimit.js';
import { requireSession } from './middleware/requireSession.js';
import { validateQuestion } from './middleware/validateQuestion.js';
import { chatRoute } from './routes/chat.js';
import { healthRoute } from './routes/health.js';
import { sessionRoute } from './routes/session.js';

function cors(allowedOrigins) {
  return function applyCors(req, res, next) {
    const origin = req.get('origin');

    if (origin && allowedOrigins.includes(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('vary', 'Origin');
      res.set('access-control-allow-headers', 'content-type');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  };
}

const HOUR = 3600;
const WEEK = 604800;

// The site is plain files. Nothing here reads a query string or a token — it
// only decides how long a browser may keep an asset.
function staticSite(publicPath) {
  return express.static(publicPath, {
    index: 'index.html',
    dotfiles: 'ignore',
    setHeaders(res, filePath) {
      const parts = filePath.split(path.sep);

      if (parts.includes('vendor')) {
        res.set('cache-control', `public, max-age=${WEEK}`);
      } else if (parts.includes('assets')) {
        res.set('cache-control', `public, max-age=${HOUR}`);
      }
    }
  });
}

// /assets/theme.css is not a file on disk — it is whichever theme the
// SITE_THEME setting names. That setting comes from a ConfigMap in git, so
// changing one word there repaints the whole page on the next rollout.
function themeSheet(publicPath, theme) {
  return (req, res) => {
    res.set('cache-control', 'no-store');
    res.type('text/css');
    res.sendFile(path.join(publicPath, 'themes', `${theme}.css`), (err) => {
      // An unknown theme name should not take the page down; it just means
      // the base palette in site.css stays as it is.
      if (err) res.status(200).end('');
    });
  };
}

export async function createApp(config) {
  const knowledge = await loadKnowledge({
    personaPath: config.paths.persona,
    reminderPath: config.paths.reminder,
    knowledgePath: config.paths.knowledge
  });

  const ollama = new OllamaClient(config.ollama);
  const analytics = createAnalytics();
  const sessions = createSessions({
    secret: config.access.secret,
    ttlSeconds: config.access.sessionTtlSeconds
  });

  const limiter = () =>
    rateLimit({
      requests: config.limits.rateLimitRequests,
      windowSeconds: config.limits.rateLimitWindowSeconds,
      onReject: analytics.requestRejected
    });

  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  app.use(cors(config.allowedOrigins));
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', healthRoute({ ollama, model: config.ollama.model }));
  app.use(
    '/api',
    sessionRoute({
      sessions,
      accessToken: config.access.token,
      secret: config.access.secret,
      ttlSeconds: config.access.sessionTtlSeconds,
      analytics,
      guards: [limiter()]
    })
  );

  app.use(
    '/api/chat/:session',
    chatRoute({
      knowledge,
      ollama,
      analytics,
      limits: config.limits,
      guards: [
        limiter(),
        requireSession({ sessions, secret: config.access.secret, analytics }),
        validateQuestion({
          maxLength: config.limits.maxRequestLength,
          onReject: analytics.requestRejected
        })
      ]
    })
  );

  app.get('/assets/theme.css', themeSheet(config.paths.public, config.theme));

  // Last, so /api never falls through to a file.
  app.use(staticSite(config.paths.public));

  return {
    app,
    knowledge,
    tokenFingerprint: fingerprint(config.access.token, config.access.secret)
  };
}
