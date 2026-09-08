'use strict';

const el = {
  grid: document.getElementById('grid'),
  status: document.getElementById('status'),
  tally: document.getElementById('tally'),
  total: document.getElementById('total'),
  query: document.getElementById('q'),
  programChips: document.getElementById('programChips'),
  overlay: document.getElementById('overlay'),
  modal: document.getElementById('modal'),
};

const state = {
  records: [],
  program: 'All',
  query: '',
};

function matches(rec) {
  if (state.program !== 'All' && rec.program !== state.program) return false;
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

function locationsFor(rec, box) {
  return (rec.locations || [])
    .filter((location) => location.box === box)
    .map((location) => `${location.row}${location.col}`)
    .join(', ');
}

function cardFor(rec, box) {
  const card = document.createElement('div');
  card.className = 'card cell';
  card.tabIndex = 0;
  card.addEventListener('click', () => openModal(rec));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(rec); }
  });

  card.appendChild(line('pos', box ? locationsFor(rec, box) : rec.catalog));
  card.appendChild(line('name', rec.name));
  card.appendChild(line('sub', rec.organism));
  card.appendChild(line('sub', rec.tissue));
  if (rec.marker) card.appendChild(line('marker', rec.marker));

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
  const groups = [
    ...['Box A', 'Box B', 'Box C', 'Box D'].map((box) => ({
      name: box,
      rows: rows.filter((rec) => (rec.locations || []).some((location) => location.box === box)),
    })),
    { name: 'No freezer location', rows: rows.filter((rec) => !(rec.locations || []).length) },
  ];
  for (const group of groups) {
    const boxRows = group.rows;
    if (!boxRows.length) continue;
    const section = document.createElement('section');
    section.className = 'cell-group';
    const heading = document.createElement('h2');
    heading.textContent = group.name;
    section.appendChild(heading);
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const rec of boxRows) grid.appendChild(cardFor(rec, group.name === 'No freezer location' ? '' : group.name));
    section.appendChild(grid);
    frag.appendChild(section);
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
