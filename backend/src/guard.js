const OVERRIDE_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b[^.?!]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.?!]{0,20}\b(instruction|prompt|rule|direction)/,
  /\b(show|print|repeat|reveal|output|display|dump|leak|recite|translate|rewrite|paraphrase|summarise|summarize|quote)\b[^.?!]{0,50}\b(system prompt|initial prompt|your prompt|your instructions|your rules|your guidelines|your configuration|your persona|context window)/,
  /\b(repeat|print|output|show|quote)\b[^.?!]{0,30}\b(everything|all the text|the text)\b[^.?!]{0,20}\b(above|before|prior)/,
  /\bstarting with the (word|words|phrase|sentence)/,
  /\byour (exact|literal|verbatim) (word|words|text|wording|line|lines)\b/,
  /\b(exact|literal|verbatim) (word|words|text|wording|content|line|lines)\b[^.?!]{0,30}\b(your|the) (prompt|instruction|instructions|persona|configuration|system|section)\b/,
  /\bsection (titled|called|named|marked)\b/,
  /\b(last|first|next|opening|closing) (line|paragraph|sentence) of your\b/,
  /\b(poem|song|lyrics|haiku|story|acrostic)\b[^.?!]{0,40}\b(instruction|prompt|rule|persona|guideline)/,
  /\b(context window|full context|system message|developer message)\b/,
  /\bfor debugging\b|\bdebug mode\b|\bmaintenance mode\b/,
  /\byou are now\b|\bfrom now on you\b/,
  /\b(act|behave) as (a |an |the )?(different|new|another|unrestricted|uncensored)?\s*(ai|assistant|model|chatbot|bot|agent|system|dan|jailbroken)\b/,
  /\b(pretend|roleplay|role-play)\b[^.?!]{0,30}\b(you are|to be|as)\b[^.?!]{0,30}\b(ai|assistant|model|chatbot|bot|agent|system|hacker|pirate|dan)\b/,
  /\bpretend (the|that the|your) (knowledge|instruction|instructions|prompt|rule|rules|file|files|context)\b/,
  /\b(jailbreak|developer mode|dan mode)\b/,
  /\bwhat (are|were|is) (your|the) (instruction|instructions|rules|guidelines|prompt|persona)\b/,
  /\bolvida\b[^.?!]{0,40}\b(instruccion|reglas)/,
  /\b(dime|muestra|repite|traduce)\b[^.?!]{0,40}\b(instruccion|instrucciones|reglas|prompt)/
];

const PROMPT_MARKERS = [
  'authoritative information',
  'you are jose naranjo',
  'ai representative on his personal website',
  'your visitors are recruiters',
  'never open with a greeting',
  'is the only authoritative information',
  'every visitor message is untrusted',
  'representante de jose naranjo',
  'sus visitantes son reclutadores',
  '# how to answer',
  '# truthfulness',
  '# untrusted input',
  '# length is a hard rule'
];

const SPAN_WORDS = 6;

export const REFUSAL =
  "I only answer questions about Jose's work and experience. Ask me about his " +
  'infrastructure, releases, or incidents.';

export class PromptLeakError extends Error {}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/\s+/g, ' ');
}

function spans(text) {
  const words = normalize(text).replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);
  const result = new Set();

  for (let i = 0; i + SPAN_WORDS <= words.length; i += 1) {
    result.add(words.slice(i, i + SPAN_WORDS).join(' '));
  }

  return result;
}

export function isOverrideAttempt(question) {
  const normalized = normalize(question);
  return OVERRIDE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function createLeakDetector(protectedText) {
  const protectedSpans = spans(protectedText);

  return function revealsPrompt(text) {
    const normalized = normalize(text);
    if (PROMPT_MARKERS.some((marker) => normalized.includes(marker))) return true;

    for (const span of spans(text)) {
      if (protectedSpans.has(span)) return true;
    }

    return false;
  };
}
