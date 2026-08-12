function openWidget(widget) {
  if (widget.store?.getState().windowState !== 'open') {
    widget.store?.setState({ windowState: 'open' });
  }
}

function composer(widget) {
  const form = widget.shadowRoot?.querySelector('form');
  const textarea = form?.querySelector('textarea');
  return form && textarea ? { form, textarea } : null;
}

async function ask(widget, question) {
  openWidget(widget);
  await widget.updateComplete;

  const target = composer(widget);
  if (!target) return;

  target.textarea.value = question;
  target.textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  target.form.requestSubmit();
}

export function mountPrompts({ container, questions, widget }) {
  if (!container) return;

  for (const question of questions) {
    const item = document.createElement('li');
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'prompt';
    button.textContent = question;
    button.addEventListener('click', () => ask(widget, question));

    item.append(button);
    container.append(item);
  }
}
