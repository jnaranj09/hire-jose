import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { PromptLeakError, REFUSAL, createLeakDetector, isOverrideAttempt } from '../guard.js';
import { buildMessages } from '../prompt.js';
import { ResponseFilter } from '../response-filter.js';
import { openStream } from '../sse.js';

export function chatRoute({ knowledge, ollama, analytics, limits, guards }) {
  const router = Router({ mergeParams: true });
  const revealsPrompt = createLeakDetector(`${knowledge.persona}\n${knowledge.reminder}`);

  router.post('/', ...guards, async (req, res) => {
    const question = req.question;
    const stream = openStream(res);
    const startedAt = Date.now();
    const abort = new AbortController();
    const filter = new ResponseFilter({
      maxSentences: limits.maxSentences,
      maxChars: limits.maxAnswerChars,
      revealsPrompt
    });
    let answerLength = 0;

    res.on('close', () => {
      if (!res.writableFinished) abort.abort('client-closed');
    });

    const emit = (text) => {
      if (!text) return;
      answerLength += text.length;
      stream.send('chunk', { delta: text });
    };

    const finish = () => {
      stream.send('done', { finish_reason: 'stop', is_complete: true });
      stream.close();
    };

    stream.send('meta', { assistant_message_id: randomUUID() });

    if (isOverrideAttempt(question)) {
      analytics.requestRejected('override_attempt');
      emit(REFUSAL);
      finish();
      return;
    }

    analytics.questionAsked(question);

    try {
      await ollama.streamCompletion(
        buildMessages(knowledge, question),
        (delta) => {
          const { text, complete } = filter.push(delta);
          emit(text);
          return !complete;
        },
        abort.signal
      );

      emit(filter.flush());
      finish();
      analytics.responseGenerated(Date.now() - startedAt, answerLength);
    } catch (error) {
      if (error instanceof PromptLeakError) {
        abort.abort('prompt-leak');
        analytics.requestRejected('prompt_leak');
        emit(REFUSAL);
        finish();
      } else if (!abort.signal.aborted) {
        analytics.modelError(error.message);
        stream.send('error', { error: 'DANA_LLM_UNAVAILABLE', partial_saved: false });
        stream.close();
      } else {
        stream.close();
      }
    }
  });

  router.get('/conversations/:id/messages', (_req, res) => {
    res.json({ messages: [] });
  });

  router.post('/interrupt', (_req, res) => {
    res.status(204).end();
  });

  return router;
}
