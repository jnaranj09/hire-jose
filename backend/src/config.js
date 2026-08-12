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

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: int('PORT', 3000),
  allowedOrigins: list('ALLOWED_ORIGINS'),

  access: {
    token: required('CHAT_BOT_TOKEN'),
    secret: required('CHAT_BOT_SECRET'),
    sessionTtlSeconds: int('CHAT_SESSION_TTL', 43200)
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

  paths: {
    persona: process.env.PERSONA_PATH ?? path.join(repoRoot, 'prompts/persona.md'),
    reminder: process.env.REMINDER_PATH ?? path.join(repoRoot, 'prompts/reminder.md'),
    knowledge: process.env.KNOWLEDGE_PATH ?? path.join(repoRoot, 'knowledge'),
    public: process.env.PUBLIC_PATH ?? path.join(repoRoot, 'frontend/public')
  }
};
