import fs from 'node:fs';
import path from 'node:path';

// The one thing the assistant can actually do. A visitor asks for the light or
// the dark theme, and this writes the new value into k8s/20-chat-api.yaml on
// GitHub. Nothing here touches the cluster: ArgoCD sees the commit and rolls
// the Deployment on its own, which is the entire point of the demo.
//
// scripts/set-theme.sh makes the same one-word edit from a laptop, with git.
// Inside the pod there is no repo and no git binary, so this goes through the
// contents API instead. Same commit, same rollout.

const THEME_VALUE = /(name:\s*SITE_THEME\s*\r?\n\s*value:\s*")([^"]*)(")/;

// Asking how the demo works is a question for the model. Asking for the light
// theme is an instruction for this file. The difference is the opening word.
const EXPLAIN = /^\s*(how|what|why|when|where|does|is|explain|tell me (how|what|about))\b/i;

const REQUEST = [
  /\b(switch|change|set|flip|toggle|make|turn|put)\b[^.?!]{0,40}\b(theme|palette|colou?rs?|dark mode|light mode|site|page)\b/i,
  /\b(dark|light)\s*mode\b[^.?!]{0,20}\b(please|now)?\b/i,
  /\b(run|trigger|do|start|show me)\b[^.?!]{0,30}\b(the\s+)?(theme|gitops|argocd)\s*(demo|switch|change)?\b/i,
  /\b(cambia|cambiar|pon|poner|activa)\b[^.?!]{0,40}\b(tema|modo oscuro|modo claro|paleta)\b/i
];

// The page tells the visitor they can ask for the login, so asking for it has
// to return the login and not a model answer — the model does not have it.
const LOGIN = [
  /\bargo\s*-?cd?\b[^.?!]{0,40}\b(login|log in|credential|password|user|account|access|url|link|ui|dashboard)\b/i,
  /\b(login|credential|password|user|account|access|url|link)\b[^.?!]{0,40}\bargo\s*-?cd?\b/i
];

const TO_LIGHT = /\b(light|paper|white|bright|day|claro)\b/i;
const TO_DARK = /\b(dark|default|black|night|oscuro)\b/i;

const LABEL = { default: 'dark', paper: 'light' };

function label(theme) {
  return LABEL[theme] ?? theme;
}

// null means "not a theme request" — the question goes to the model as usual.
// { target: null } means "flip it", whichever way it is pointing right now.
export function readThemeRequest(question) {
  if (EXPLAIN.test(question)) return null;
  if (LOGIN.some((pattern) => pattern.test(question))) return null;
  if (!REQUEST.some((pattern) => pattern.test(question))) return null;

  if (TO_LIGHT.test(question)) return { target: 'paper' };
  if (TO_DARK.test(question)) return { target: 'default' };

  return { target: null };
}

// "What is the ArgoCD login" is a question, so EXPLAIN does not apply here:
// asking for it IS the request, and only this file knows the answer.
export function readLoginRequest(question) {
  return LOGIN.some((pattern) => pattern.test(question));
}

function pushedMessage({ from, to, commit, commitUrl, argocd }) {
  const lines = [
    `Done. Pushed the switch from ${label(from)} to ${label(to)}.`,
    '',
    `commit ${commit} "Set site theme to ${to}"`,
    commitUrl,
    '',
    'Nothing touched the cluster. ArgoCD does the rest.',
    '',
    'What to check, in this order:',
    '',
    '1. ArgoCD shows the app OutOfSync, then syncs it.',
    '   It polls every 3 minutes, or you can hit Refresh.',
    '2. A new chat-api pod replaces the running one.',
    '3. Reload this page. Same page, new palette.'
  ];

  return lines.concat(argocdBlock(argocd)).join('\n');
}

function argocdBlock(argocd) {
  if (!argocd.url || !argocd.password) return [];

  return [
    '',
    `ArgoCD: ${argocd.url}`,
    `user: ${argocd.username}`,
    `password: ${argocd.password}`,
    '',
    'That account is read-only. Sync and delete both come',
    'back 403 permission denied. A commit is the only way in.'
  ];
}

function loginMessage(argocd) {
  if (!argocd.url || !argocd.password) {
    return 'The ArgoCD UI is not published on this copy of the site.';
  }

  return [
    'The ArgoCD UI is open, read-only:',
    '',
    argocd.url,
    `user: ${argocd.username}`,
    `password: ${argocd.password}`,
    '',
    'Sync and delete both come back 403 permission denied.',
    'Ask me to switch the theme if you want to watch it',
    'deploy something.'
  ].join('\n');
}

export function createThemeSwitcher({ github, argocd, cooldownSeconds, publicPath, analytics }) {
  const enabled = Boolean(github.token && github.repo);
  let lastPushAt = 0;
  let inFlight = false;

  async function api(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(github.timeoutMs),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${github.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'hire-jose-chat-api',
        ...(init.body ? { 'content-type': 'application/json' } : {})
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub ${init.method ?? 'GET'} ${response.status}`);
    }

    return response.json();
  }

  // The manifest on the branch is the source of truth, not SITE_THEME in this
  // process: a pod that is mid-rollout is running the old value.
  async function readManifest() {
    const file = await api(
      `${github.apiUrl}/repos/${github.repo}/contents/${github.manifestPath}` +
        `?ref=${encodeURIComponent(github.branch)}`
    );
    const text = Buffer.from(file.content, 'base64').toString('utf8');
    const match = text.match(THEME_VALUE);

    if (!match) throw new Error(`No SITE_THEME value in ${github.manifestPath}`);

    return { text, sha: file.sha, current: match[2] };
  }

  function commitManifest({ text, sha, to }) {
    return api(`${github.apiUrl}/repos/${github.repo}/contents/${github.manifestPath}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Set site theme to ${to}`,
        content: Buffer.from(text.replace(THEME_VALUE, `$1${to}$3`), 'utf8').toString('base64'),
        sha,
        branch: github.branch
      })
    });
  }

  // A theme that has no stylesheet would leave the page on the base palette
  // and look like nothing happened, so it is refused before the commit —
  // the same check set-theme.sh does against frontend/public/themes.
  function exists(theme) {
    return fs.existsSync(path.join(publicPath, 'themes', `${theme}.css`));
  }

  async function run(requestedTarget) {
    if (!enabled) {
      return {
        outcome: 'disabled',
        message:
          'The theme switch only runs on the deployed site, and this copy is ' +
          'not wired up to the repo.'
      };
    }

    const waited = (Date.now() - lastPushAt) / 1000;
    if (inFlight || waited < cooldownSeconds) {
      return {
        outcome: 'cooldown',
        message:
          'A theme change went out less than a minute ago. Give ArgoCD time ' +
          'to roll that one out first, then ask again.'
      };
    }

    inFlight = true;

    try {
      const { text, sha, current } = await readManifest();
      const to = requestedTarget ?? (current === 'default' ? 'paper' : 'default');

      if (!exists(to)) {
        return {
          outcome: 'unknown-theme',
          message: `There is no ${to} stylesheet in the repo, so there is nothing to switch to.`
        };
      }

      if (current === to) {
        return {
          outcome: 'unchanged',
          message: [
            `The site is already on the ${label(to)} theme, so there is nothing to push.`,
            '',
            `Ask for the ${label(to === 'paper' ? 'default' : 'paper')} one and you get a commit.`
          ]
            .concat(argocdBlock(argocd))
            .join('\n')
        };
      }

      const result = await commitManifest({ text, sha, to });
      lastPushAt = Date.now();

      return {
        outcome: 'pushed',
        message: pushedMessage({
          from: current,
          to,
          commit: result.commit.sha.slice(0, 7),
          commitUrl: result.commit.html_url,
          argocd
        })
      };
    } catch (error) {
      analytics.themeSwitchFailed(error.message);

      return {
        outcome: 'failed',
        message:
          'I could not push the change to git just now. The ArgoCD UI is at ' +
          `${argocd.url || 'the link on the page'} if you want to look at the app anyway.`
      };
    } finally {
      inFlight = false;
    }
  }

  return { enabled, run, login: () => loginMessage(argocd) };
}
