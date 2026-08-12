const PARAM = 'chat_bot_token';

function remember(token) {
  try {
    sessionStorage.setItem(PARAM, token);
  } catch {
    return;
  }
}

function recall() {
  try {
    return sessionStorage.getItem(PARAM);
  } catch {
    return null;
  }
}

function stripFromUrl(url) {
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export function readAccessToken() {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(PARAM);

  if (!fromUrl) return recall();

  remember(fromUrl);
  stripFromUrl(url);
  return fromUrl;
}

export async function openSession(apiUrl, accessToken) {
  const response = await fetch(`${apiUrl}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_bot_token: accessToken })
  });

  if (!response.ok) return null;

  const { session } = await response.json();
  return session ?? null;
}
