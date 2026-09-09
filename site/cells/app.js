'use strict';

const el = {
  grid: document.getElementById('grid'),
  status: document.getElementById('status'),
  tally: document.getElementById('tally'),
  total: document.getElementById('total'),
  query: document.getElementById('q'),
  programChips: document.getElementById('programChips'),
  speciesChips: document.getElementById('speciesChips'),
  boxChips: document.getElementById('boxChips'),
  overlay: document.getElementById('overlay'),
  modal: document.getElementById('modal'),
};

const state = {
  records: [],
  program: 'All',
  species: 'All',
  box: 'All',
  query: '',
};

function matches(rec) {
  if (state.program !== 'All' && rec.program !== state.program) return false;
  if (state.species !== 'All' && rec.species !== state.species) return false;
  if (state.box !== 'All' && !(rec.locations || []).some((location) => location.box === state.box)) return false;
  if (!state.query) return true;
  const hay = [rec.name, rec.catalog, rec.organism, rec.tissue, rec.marker, rec.program, rec.role]
    .join(' ').toLowerCase();
  return hay.includes(state.query);
}

function line(className, text) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

function vials(rec) {
  if (!rec.qty) return '—';
  return rec.qty + (rec.qty === '1' ? ' vial' : ' vials');
}

function cardFor(rec) {
  const card = document.createElement('div');
  card.className = 'card cell';
  card.tabIndex = 0;
  card.addEventListener('click', () => openModal(rec));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(rec); }
  });

  card.appendChild(line('pos', rec.catalog));
  card.appendChild(line('name', rec.name));
  card.appendChild(line('sub', rec.organism));
  card.appendChild(line('sub', rec.tissue));
  if (rec.marker) card.appendChild(line('marker', rec.marker));
  if (rec.medium) card.appendChild(line('medium', rec.medium));

  const meta = document.createElement('div');
  meta.className = 'meta';
  const species = document.createElement('span');
  species.textContent = rec.species || '—';
  const qty = document.createElement('span');
  qty.textContent = vials(rec);
  meta.append(species, qty);
  card.appendChild(meta);
  return card;
}

function render() {
  const rows = state.records.filter(matches);
  el.tally.textContent = rows.length;
  el.grid.replaceChildren();

  if (!rows.length) {
    el.status.hidden = false;
    el.status.textContent = 'Nothing matches those filters.';
    return;
  }
  el.status.hidden = true;

  const frag = document.createDocumentFragment();
  for (const rec of rows) {
    frag.appendChild(cardFor(rec));
  }
  el.grid.appendChild(frag);
}

function openModal(rec) {
  el.modal.replaceChildren();

  const head = document.createElement('div');
  head.className = 'modal-head';
  const pos = document.createElement('span');
  pos.className = 'pos';
  pos.textContent = rec.catalog + (rec.program ? ' · ' + rec.program : '');
  const close = document.createElement('button');
  close.className = 'modal-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeModal);
  head.append(pos, close);
  el.modal.appendChild(head);

  const title = document.createElement('h2');
  title.id = 'modalTitle';
  title.textContent = rec.name;
  el.modal.appendChild(title);

  el.modal.appendChild(line('cas', rec.organism || 'organism not recorded'));

  if (rec.url) {
    const link = document.createElement('div');
    link.className = 'link';
    const a = document.createElement('a');
    a.href = rec.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'ATCC ' + rec.catalog + ' ↗';
    link.appendChild(a);
    el.modal.appendChild(link);
  }

  const details = document.createElement('div');
  details.className = 'details';
  const fields = [
    ['Program', rec.program || '—', ''],
    ['Species', rec.species || '—', ''],
    ['Freezer location', (rec.locations || []).map((location) => `${location.box}: ${location.row}${location.col}`).join(', ') || '—', 'wide'],
    ['Tissue / disease', rec.tissue || '—', ''],
    ['Marker', rec.marker || '—', ''],
    ['Quantity', vials(rec), ''],
    ['Base medium', rec.medium || 'not recorded', 'wide'],
    ['Role in project', rec.role || 'not recorded', 'note'],
  ];
  for (const [label, value, className] of fields) {
    const cell = document.createElement('div');
    cell.className = className;
    const l = document.createElement('label');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    cell.append(l, v);
    details.appendChild(cell);
  }
  el.modal.appendChild(details);

  el.overlay.classList.add('on');
  close.focus();
}

function closeModal() {
  el.overlay.classList.remove('on');
}

function buildChips(container, values, counts, isActive, onPick) {
  container.replaceChildren();
  for (const value of values) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (isActive(value) ? ' on' : '');
    chip.textContent = value;
    if (counts && counts.has(value)) {
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = counts.get(value);
      chip.appendChild(n);
    }
    chip.addEventListener('click', () => onPick(value));
    container.appendChild(chip);
  }
}

function tally(key) {
  const counts = new Map();
  for (const rec of state.records) {
    counts.set(rec[key], (counts.get(rec[key]) || 0) + 1);
  }
  counts.set('All', state.records.length);
  return counts;
}

function refreshChips(data) {
  buildChips(
    el.programChips,
    ['All', ...data.programs],
    tally('program'),
    (v) => state.program === v,
    (v) => { state.program = v; refreshChips(data); render(); }
  );
  buildChips(
    el.speciesChips,
    ['All', ...data.species],
    tally('species'),
    (v) => state.species === v,
    (v) => { state.species = v; refreshChips(data); render(); }
  );
  buildChips(
    el.boxChips,
    ['All', ...(data.boxes || [...new Set(state.records.flatMap((rec) => (rec.locations || []).map((location) => location.box)))])],
    tallyBoxes(),
    (v) => state.box === v,
    (v) => { state.box = v; refreshChips(data); render(); }
  );
}

function tallyBoxes() {
  const counts = new Map();
  for (const rec of state.records) {
    for (const box of new Set((rec.locations || []).map((location) => location.box))) {
      counts.set(box, (counts.get(box) || 0) + 1);
    }
  }
  counts.set('All', state.records.length);
  return counts;
}

el.query.addEventListener('input', (e) => {
  state.query = e.target.value.trim().toLowerCase();
  render();
});

el.overlay.addEventListener('click', (e) => {
  if (e.target === el.overlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

fetch('data.json')
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then((data) => {
    state.records = data.records;
    el.total.textContent = 'of ' + data.records.length;
    refreshChips(data);
    render();
  })
  .catch((err) => {
    el.status.hidden = false;
    el.status.textContent = 'Could not load cell line data: ' + err.message;
  });
