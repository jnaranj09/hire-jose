/* Page behaviour: the request path, the skill filter, and the reveal.
   No framework, no build step — same rule as the rest of this site. */

const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- the request path -------------------------------------------- */

function railPath() {
  const rail = document.querySelector('#rail');
  if (!rail) return;

  const hops = [...rail.querySelectorAll('.hop')];
  hops.forEach((hop, i) => hop.style.setProperty('--i', i));

  const heads = [...rail.querySelectorAll('.hop-head[aria-controls]')];

  function close(head) {
    head.setAttribute('aria-expanded', 'false');
    head.closest('.hop').classList.remove('on');
    document.querySelector(`#${head.getAttribute('aria-controls')}`).style.display = 'none';
  }

  function open(head) {
    head.setAttribute('aria-expanded', 'true');
    head.closest('.hop').classList.add('on');
    document.querySelector(`#${head.getAttribute('aria-controls')}`).style.display = 'block';
  }

  for (const head of heads) {
    head.addEventListener('click', () => {
      const wasOpen = head.getAttribute('aria-expanded') === 'true';
      heads.forEach(close);
      if (!wasOpen) open(head);
    });
  }

  if (still) {
    rail.classList.add('drawn');
    return;
  }

  const draw = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      rail.classList.add('drawn');
      draw.disconnect();
    }
  }, { threshold: 0.2 });

  draw.observe(rail);
}

/* ---- skills, wired to the rest of the page ----------------------- */

function skillFilter() {
  const pills = [...document.querySelectorAll('.pill')];
  const rail = document.querySelector('#rail');
  const lists = [...document.querySelectorAll('.work')];
  const note = document.querySelector('#skills-note');
  const idle = note?.textContent ?? '';

  function clear() {
    pills.forEach((p) => p.classList.remove('on'));
    rail?.classList.remove('filtered');
    rail?.querySelectorAll('.hop').forEach((h) => h.classList.remove('hit'));
    lists.forEach((list) => {
      list.classList.remove('filtered');
      list.querySelectorAll('li').forEach((li) => li.classList.remove('hit'));
    });
    if (note) note.textContent = idle;
  }

  function apply(pill) {
    const tool = pill.dataset.tool;
    clear();
    pill.classList.add('on');

    const hops = [...(rail?.querySelectorAll(`.hop[data-tool="${tool}"]`) ?? [])];
    hops.forEach((hop) => hop.classList.add('hit'));
    if (hops.length) rail.classList.add('filtered');

    let bullets = 0;
    for (const list of lists) {
      const found = [...list.querySelectorAll('li')]
        .filter((li) => (li.dataset.tools ?? '').split(' ').includes(tool));
      found.forEach((li) => li.classList.add('hit'));
      if (found.length) list.classList.add('filtered');
      bullets += found.length;
    }

    if (note) {
      const bits = [];
      if (hops.length) bits.push(`${hops.length} hop${hops.length > 1 ? 's' : ''} on this page`);
      if (bullets) bits.push(`${bullets} thing${bullets > 1 ? 's' : ''} I shipped with it`);
      note.textContent = bits.length
        ? `${pill.textContent}: ${bits.join(', ')}. Pick again to clear.`
        : `${pill.textContent} is not called out anywhere on this page. Pick again to clear.`;
    }
  }

  for (const pill of pills) {
    pill.addEventListener('click', () => {
      if (pill.classList.contains('on')) clear();
      else apply(pill);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clear();
  });
}

/* ---- reveal ------------------------------------------------------ */

function reveal() {
  const blocks = [...document.querySelectorAll('.reveal')];

  if (still || !('IntersectionObserver' in window)) {
    blocks.forEach((block) => block.classList.add('shown'));
    return;
  }

  const watch = new IntersectionObserver((entries, self) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('shown');
      self.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  blocks.forEach((block) => watch.observe(block));
}

/* Nothing on this page is allowed to stay invisible because a script broke. */
function showEverything() {
  document.querySelectorAll('.reveal').forEach((b) => b.classList.add('shown'));
  document.querySelector('#rail')?.classList.add('drawn');
}

try {
  railPath();
  skillFilter();
  reveal();
} catch {
  showEverything();
}

setTimeout(showEverything, 2500);
