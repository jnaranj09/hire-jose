import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function list(name) {
  return (process.env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function required(name) {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(`${name} must be set to at least 16 characters. See README.`);
  }
  return value;
}

// Same length rule, but absence is allowed. Used for the original single
// access token, which is now optional: tokens are managed on the admin page.
function optional(name) {
  const value = process.env[name] ?? '';
  if (value && value.length < 16) {
    throw new Error(`${name} must be at least 16 characters when set. See README.`);
  }
  return value;
}

function flag(name, fallback) {
  const value = (process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return value !== 'false' && value !== '0' && value !== 'off';
}

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: int('PORT', 3000),
  allowedOrigins: list('ALLOWED_ORIGINS'),

  access: {
    // The original single token. Still accepted, so links already sent keep
    // working, but it cannot be revoked without a restart — that is exactly
    // what the managed tokens below fix. Leave it unset once they are in use.
    token: optional('CHAT_BOT_TOKEN'),
    secret: required('CHAT_BOT_SECRET'),
    sessionTtlSeconds: int('CHAT_SESSION_TTL', 43200),
    storePath: process.env.TOKEN_STORE_PATH ?? path.join(repoRoot, 'data/tokens.json')
  },

  // The token admin page. It listens on its own port, which is deliberately
  // not in the Kubernetes Service and not behind HAProxy, so the edge has
  // nothing to route to it. Reach it over kubectl port-forward, or on
  // localhost when running with docker compose.
  admin: {
    enabled: flag('ADMIN_ENABLED', true),
    host: process.env.ADMIN_HOST ?? '127.0.0.1',
    port: int('ADMIN_PORT', 3001),
    // Used only to build the link shown after a token is created.
    siteUrl: (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  },

  ollama: {
    url: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL ?? 'hire-jose',
    temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.2),
    maxTokens: int('OLLAMA_MAX_TOKENS', 260),
    timeoutMs: int('OLLAMA_TIMEOUT_MS', 60000)
  },

  limits: {
    maxRequestLength: int('MAX_REQUEST_LENGTH', 4000),
    maxSentences: int('MAX_ANSWER_SENTENCES', 4),
    maxAnswerChars: int('MAX_ANSWER_CHARS', 900),
    rateLimitRequests: int('RATE_LIMIT_REQUESTS', 20),
    rateLimitWindowSeconds: int('RATE_LIMIT_WINDOW', 60)
  },

  // The theme switch the assistant can run for a visitor. It is on only when
  // a GitHub token is present, so a checkout without one cannot commit
  // anything. The token needs contents:write on this repo and nothing else.
  themeDemo: {
    cooldownSeconds: int('THEME_COOLDOWN', 60),

    github: {
      token: process.env.GITHUB_TOKEN ?? '',
      repo: process.env.GITHUB_REPO ?? 'jnaranj09/hire-jose',
      branch: process.env.GITHUB_BRANCH ?? 'main',
      manifestPath: process.env.THEME_MANIFEST_PATH ?? 'k8s/20-chat-api.yaml',
      apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
      timeoutMs: int('GITHUB_TIMEOUT_MS', 10000)
    },

    // Handed to the visitor with the answer so they can watch the sync. The
    // account is read-only and the password still does not belong in git.
    argocd: {
      url: process.env.ARGOCD_URL ?? '',
      username: process.env.ARGOCD_USERNAME ?? 'viewer',
      password: process.env.ARGOCD_PASSWORD ?? ''
    }
  },

  // Which file under frontend/public/themes is served as /assets/theme.css.
  // Lowercase letters, digits and dashes only — the value lands in a file
  // path, so anything else is thrown away and 'default' is used instead.
  theme: /^[a-z0-9-]+$/.test(process.env.SITE_THEME ?? '')
    ? process.env.SITE_THEME
    : 'default',

  paths: {
    persona: process.env.PERSONA_PATH ?? path.join(repoRoot, 'prompts/persona.md'),
    reminder: process.env.REMINDER_PATH ?? path.join(repoRoot, 'prompts/reminder.md'),
    knowledge: process.env.KNOWLEDGE_PATH ?? path.join(repoRoot, 'knowledge'),
    public: process.env.PUBLIC_PATH ?? path.join(repoRoot, 'frontend/public'),
    admin: process.env.ADMIN_PATH ?? path.join(repoRoot, 'frontend/admin')
  }
};
