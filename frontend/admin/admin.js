// Token admin. No framework, no build step — same as the public site.

const $ = (id) => document.getElementById(id);
const MASK = '•'.repeat(36);

const el = {
  form: $('create'),
  label: $('label'),
  expiry: $('expiry'),
  customWrap: $('customWrap'),
  customDays: $('customDays'),
  createError: $('createError'),
  created: $('created'),
  secretText: $('secretText'),
  toggleSecret: $('toggleSecret'),
  copySecret: $('copySecret'),
  createdLabel: $('createdLabel'),
  createdPrint: $('createdPrint'),
  rows: $('rows'),
  count: $('count'),
  empty: $('empty'),
  listError: $('listError')
};

let lastLink = '';

// ---- helpers ---------------------------------------------------------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body
      ? { 'content-type': 'application/json', 'x-admin-request': '1' }
      : { 'x-admin-request': '1' },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function show(node, message) {
  node.textContent = message;
  node.classList.toggle('hidden', !message);
}

function date(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function relative(ms) {
  if (!ms) return '';
  const days = Math.round((ms - Date.now()) / 86400000);
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}

function cell(row, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  row.appendChild(td);
  return td;
}

// ---- list ------------------------------------------------------------

function render(tokens) {
  el.rows.replaceChildren();
  el.empty.classList.toggle('hidden', tokens.length > 0);

  const active = tokens.filter((token) => token.status === 'active').length;
  el.count.textContent = tokens.length
    ? `${active} active of ${tokens.length}`
    : '';

  for (const token of tokens) {
    const row = document.createElement('tr');
    if (token.status !== 'active') row.className = 'gone';

    cell(row, token.label, 'label');
    cell(row, token.fingerprint, 'print');
    cell(row, date(token.createdAt), 'when');

    const expires = cell(row, token.expiresAt ? date(token.expiresAt) : 'never', 'when');
    if (token.expiresAt) expires.title = relative(token.expiresAt);

    cell(row, token.lastUsedAt ? date(token.lastUsedAt) : 'never', 'when');
    cell(row, String(token.uses), 'num');

    const status = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${token.status}`;
    pill.textContent = token.status;
    status.appendChild(pill);
    row.appendChild(status);

    const actions = document.createElement('td');
    actions.className = 'actions';

    if (token.status === 'active') {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'ghost danger';
      revoke.textContent = 'Revoke';
      revoke.onclick = () => act(
        `Revoke "${token.label}"? The link stops working straight away.`,
        () => api('POST', `/api/tokens/${token.id}/revoke`, {})
      );
      actions.appendChild(revoke);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost danger';
    remove.textContent = 'Delete';
    remove.onclick = () => act(
      `Delete "${token.label}"? The row and its history go too. Revoke instead if you want the record.`,
      () => api('DELETE', `/api/tokens/${token.id}`)
    );
    actions.appendChild(remove);

    row.appendChild(actions);
    el.rows.appendChild(row);
  }
}

async function load() {
  try {
    const data = await api('GET', '/api/tokens');
    show(el.listError, '');
    render(data.tokens);
  } catch (err) {
    show(el.listError, `Could not load the tokens: ${err.message}`);
  }
}

async function act(question, run) {
  if (!window.confirm(question)) return;

  try {
    await run();
    show(el.listError, '');
    await load();
  } catch (err) {
    show(el.listError, err.message);
  }
}

// ---- create ----------------------------------------------------------

el.expiry.addEventListener('change', () => {
  el.customWrap.classList.toggle('hidden', el.expiry.value !== 'custom');
});

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  show(el.createError, '');

  const choice = el.expiry.value;
  const expiresInDays = choice === 'custom' ? Number(el.customDays.value) : (choice || null);

  try {
    const data = await api('POST', '/api/tokens', {
      label: el.label.value,
      expiresInDays
    });

    lastLink = data.link;
    el.secretText.textContent = MASK;
    el.secretText.classList.add('masked');
    el.toggleSecret.textContent = 'Reveal';
    el.toggleSecret.setAttribute('aria-pressed', 'false');
    el.createdLabel.textContent = data.record.label;
    el.createdPrint.textContent = data.record.fingerprint;
    el.created.classList.remove('hidden');
    el.form.reset();
    el.customWrap.classList.add('hidden');

    await load();
  } catch (err) {
    show(el.createError, err.message);
  }
});

// ---- the one-time secret --------------------------------------------

el.toggleSecret.addEventListener('click', () => {
  const hidden = el.secretText.classList.contains('masked');
  el.secretText.textContent = hidden ? lastLink : MASK;
  el.secretText.classList.toggle('masked', !hidden);
  el.toggleSecret.textContent = hidden ? 'Hide' : 'Reveal';
  el.toggleSecret.setAttribute('aria-pressed', String(hidden));
});

el.copySecret.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastLink);
    el.copySecret.textContent = 'Copied';
  } catch {
    el.copySecret.textContent = 'Copy failed';
  }
  setTimeout(() => { el.copySecret.textContent = 'Copy'; }, 1500);
});

load();
