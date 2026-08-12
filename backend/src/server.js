import { createApp } from './app.js';
import { config } from './config.js';

const { app, knowledge, tokenFingerprint } = await createApp(config);

app.listen(config.port, config.host, () => {
  console.log(
    `chat-api listening on ${config.host}:${config.port} · model ${config.ollama.model} · ` +
      `${knowledge.documents.length} knowledge files`
  );
  console.log(`active chat_bot_token fingerprint: ${tokenFingerprint}`);
});
