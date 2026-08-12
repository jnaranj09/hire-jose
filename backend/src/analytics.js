const CATEGORIES = [
  ['kubernetes', /\bk8s\b|kubernet|helm|pod|cluster|namespace/i],
  ['terraform', /terraform|iac|infrastructure as code/i],
  ['aws', /\baws\b|privatelink|transit gateway|\bs3\b|\bvpc\b/i],
  ['cicd', /ci\/?cd|pipeline|gitlab|github action|deploy|release|rollback|tag/i],
  ['observability', /observab|monitor|metric|log|trace|grafana|prometheus|opensearch/i],
  ['incident-response', /incident|outage|on-?call|pager|postmortem|root cause/i],
  ['leadership', /lead|mentor|team|ownership|collaborat/i],
  ['projects', /project|built|side project|portfolio|repo/i],
  ['career', /experience|background|hire|resume|cv|year|career|why should/i]
];

function categorize(question) {
  const match = CATEGORIES.find(([, pattern]) => pattern.test(question));
  return match ? match[0] : 'other';
}

export function createAnalytics(log = console.log) {
  function emit(event, fields = {}) {
    log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
  }

  return {
    sessionAttempt(record) {
      emit('session_attempt', record);
    },
    sessionRejected(record) {
      emit('session_rejected', record);
    },
    questionAsked(question) {
      emit('question_asked', { category: categorize(question), length: question.length });
    },
    responseGenerated(latencyMs, characters) {
      emit('response_generated', { latency_ms: latencyMs, characters });
    },
    modelError(reason) {
      emit('model_error', { reason });
    },
    requestRejected(reason) {
      emit('request_rejected', { reason });
    }
  };
}
