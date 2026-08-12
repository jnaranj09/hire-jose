import { PromptLeakError } from './guard.js';

const HOLD_BACK_CHARS = 400;
const SENTENCE_END = /[.!?]+["'”’)\]]*(?=\s|$)/g;
const REPEAT_RUN = /(\b[\w'-]{1,20}\b)(?:[\s,]+\1\b){7,}/i;

function endOfSentence(text, limit) {
  let seen = 0;

  for (const match of text.matchAll(SENTENCE_END)) {
    seen += 1;
    if (seen === limit) return match.index + match[0].length;
  }

  return -1;
}

export class ResponseFilter {
  #text = '';
  #released = 0;
  #clipped = false;

  constructor({ maxSentences, maxChars, revealsPrompt }) {
    this.maxSentences = maxSentences;
    this.maxChars = maxChars;
    this.revealsPrompt = revealsPrompt;
  }

  push(delta) {
    this.#text += delta;

    if (this.revealsPrompt(this.#text)) {
      throw new PromptLeakError('Model started reproducing its instructions');
    }

    const cut = endOfSentence(this.#text, this.maxSentences);
    if (cut !== -1) return this.#stop(cut);

    if (this.#text.length >= this.maxChars || REPEAT_RUN.test(this.#text)) {
      return this.#stop(this.maxChars);
    }

    const held = this.#text.length < HOLD_BACK_CHARS;
    return { text: held ? '' : this.#releaseUpTo(this.#text.length), complete: false };
  }

  flush() {
    return this.#clipped ? '' : this.#releaseUpTo(this.#text.length);
  }

  #stop(index) {
    this.#clipped = true;
    return { text: this.#releaseUpTo(index), complete: true };
  }

  #releaseUpTo(index) {
    const pending = this.#text.slice(this.#released, index);
    this.#released = Math.max(this.#released, index);
    return pending;
  }
}
