function parseEventStream(text, onDelta) {
  for (const block of text.split('\n\n')) {
    const line = block.trim();
    if (!line.startsWith('data:')) continue;

    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return true;

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }

    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta && onDelta(delta) === false) return true;
  }

  return false;
}

export class OllamaClient {
  constructor({ url, model, temperature, maxTokens, timeoutMs }) {
    this.endpoint = `${url.replace(/\/+$/, '')}/v1/chat/completions`;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeoutMs = timeoutMs;
  }

  async isReachable() {
    try {
      const response = await fetch(this.endpoint.replace('/v1/chat/completions', '/api/tags'), {
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async streamCompletion(messages, onDelta, signal) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        stream: true
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama responded with HTTP ${response.status}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });

      const lastBreak = buffer.lastIndexOf('\n\n');
      if (lastBreak === -1) continue;

      const done = parseEventStream(buffer.slice(0, lastBreak), onDelta);
      buffer = buffer.slice(lastBreak + 2);
      if (done) return;
    }

    parseEventStream(buffer, onDelta);
  }
}
