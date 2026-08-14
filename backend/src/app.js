import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import { createAnalytics } from './analytics.js';
import { loadKnowledge } from './knowledge.js';
import { OllamaClient } from './ollama.js';
import { createSessions, fingerprint } from './session.js';
import { createThemeSwitcher } from './theme.js';
import { createTokenStore } from './tokens.js';
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

// index.html is served with max-age=0, but the CSS and JS it points at are
// cached for an hour here and up to four at the Cloudflare edge. Without this,
// deploying a stylesheet change and reloading still shows the old page until
// that expires. Stamping a build id on the asset URLs sidesteps the whole
// problem: new build, new URL, nothing to invalidate.
function buildId(publicPath) {
  const files = [
    'assets/site.css', 'assets/chat.css',
    'assets/site.js', 'assets/chat.js'
  ];
  const stamp = files
    .map((f) => {
      try {
        return String(fs.statSync(path.join(publicPath, f)).mtimeMs);
      } catch {
        return '0';
      }
    })
    .join('|');

  return createHash('sha1').update(stamp).digest('hex').slice(0, 8);
}

// Rewrites /assets/<name>.(css|js) -> /assets/<name>.(css|js)?v=<build>.
// theme.css is deliberately skipped: it is already no-store, and its content
// changes with SITE_THEME rather than with a build.
function indexPage(publicPath) {
  const file = path.join(publicPath, 'index.html');
  const version = buildId(publicPath);

  return (req, res, next) => {
    fs.readFile(file, 'utf8', (err, html) => {
      if (err) {
        next();
        return;
      }

      res.set('cache-control', 'public, max-age=0, must-revalidate');
      res.type('html');
      res.send(
        html.replace(
          /(\/assets\/(?!theme\.css)[\w.-]+\.(?:css|js))/g,
          `$1?v=${version}`
        )
      );
    });
  };
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

  const tokens = createTokenStore({
    filePath: config.access.storePath,
    secret: config.access.secret
  });
  tokens.load();

  const theme = createThemeSwitcher({
    ...config.themeDemo,
    publicPath: config.paths.public,
    analytics
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
      tokens,
      legacyToken: config.access.token,
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
      theme,
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

  // Before the static handler, or express.static answers / with the raw file
  // and the asset URLs never get their build stamp.
  app.get(['/', '/index.html'], indexPage(config.paths.public));

  // Last, so /api never falls through to a file.
  app.use(staticSite(config.paths.public));

  return {
    app,
    knowledge,
    tokens,
    // Only the original env token gets a fingerprint printed at startup. The
    // managed ones carry theirs on the admin page, next to their label.
    tokenFingerprint: config.access.token
      ? fingerprint(config.access.token, config.access.secret)
      : null
  };
}
