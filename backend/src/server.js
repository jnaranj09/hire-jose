import { createAdminApp } from './admin.js';
import { createApp } from './app.js';
import { config } from './config.js';

const { app, knowledge, tokens, tokenFingerprint } = await createApp(config);

app.listen(config.port, config.host, () => {
  console.log(
    `chat-api listening on ${config.host}:${config.port} · model ${config.ollama.model} · ` +
      `${knowledge.documents.length} knowledge files`
  );

  if (tokenFingerprint) {
    console.log(`active chat_bot_token fingerprint: ${tokenFingerprint} (from the environment)`);
  }

  const active = tokens.list().filter((token) => token.status === 'active').length;
  console.log(`managed access tokens: ${active} active · ${config.access.storePath}`);

  if (!tokenFingerprint && active === 0) {
    console.warn('no access token is set and none are stored — nobody can open the chat');
  }
});

// Separate listener, separate port. It is not in the Kubernetes Service and
// not behind HAProxy, so the only ways in are localhost or a port-forward.
if (config.admin.enabled) {
  const admin = createAdminApp({
    tokens,
    adminPath: config.paths.admin,
    siteUrl: config.admin.siteUrl
  });

  admin.listen(config.admin.port, config.admin.host, () => {
    console.log(`token admin listening on ${config.admin.host}:${config.admin.port}`);
  });
}
