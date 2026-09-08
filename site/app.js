'use strict';

const el = {
  grid: document.getElementById('grid'),
  status: document.getElementById('status'),
  tally: document.getElementById('tally'),
  total: document.getElementById('total'),
  query: document.getElementById('q'),
  boxChips: document.getElementById('boxChips'),
  groupChips: document.getElementById('groupChips'),
  overlay: document.getElementById('overlay'),
  modal: document.getElementById('modal'),
};

const state = {
  records: [],
  box: 'All',
  groups: new Set(),   // empty means "no group filter"
  query: '',
};

function matches(rec) {
  if (state.box !== 'All' && rec.box !== state.box) return false;
  for (const g of state.groups) {
    if (!rec.groups.includes(g)) return false;   // groups combine with AND
  }
  if (!state.query) return true;
  const hay = [rec.name, rec.cas, rec.catalog, rec.vendor, rec.position]
    .join(' ').toLowerCase();
  return hay.includes(state.query);
}

function structureFrame(rec, className) {
  const frame = document.createElement('div');
  frame.className = className;
  if (rec.structure) {
    const img = document.createElement('img');
    img.src = rec.structure;
    img.alt = 'Structure of ' + rec.name;
    img.loading = 'lazy';
    frame.appendChild(img);
  } else {
    frame.classList.add('blank');
    frame.textContent = 'no structure';
  }
  return frame;
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
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.addEventListener('click', () => openModal(rec));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(rec); }
    });

    const pos = document.createElement('div');
    pos.className = 'pos';
    pos.textContent = rec.position;
    card.appendChild(pos);

    card.appendChild(structureFrame(rec, 'frame'));

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = rec.name;
    card.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const qty = document.createElement('span');
    qty.textContent = rec.qty ? rec.qty + ' g' : '—';
    const vendor = document.createElement('span');
    vendor.textContent = rec.vendor;
    if (rec.caveat) vendor.className = 'flag';
    meta.append(qty, vendor);
    card.appendChild(meta);

    frag.appendChild(card);
  }
  el.grid.appendChild(frag);
}

function openModal(rec) {
  el.modal.replaceChildren();

  const head = document.createElement('div');
  head.className = 'modal-head';
  const pos = document.createElement('span');
  pos.className = 'pos';
  pos.textContent = rec.position + ' · ' + rec.box + ' · ' + rec.storage;
  const close = document.createElement('button');
  close.className = 'modal-close';
  close.textContent = '\u00d7';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeModal);
  head.append(pos, close);
  el.modal.appendChild(head);

  const title = document.createElement('h2');
  title.id = 'modalTitle';
  title.textContent = rec.name;
  el.modal.appendChild(title);

  const cas = document.createElement('div');
  cas.className = 'cas';
  cas.textContent = 'CAS ' + (rec.cas || 'not recorded');
  el.modal.appendChild(cas);

  el.modal.appendChild(structureFrame(rec, 'frame'));

  if (rec.groups.length) {
    const tags = document.createElement('div');
    tags.className = 'tags';
    for (const g of rec.groups) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = g;
      tags.appendChild(tag);
    }
    el.modal.appendChild(tags);
  }

  const details = document.createElement('div');
  details.className = 'details';
  const fields = [
    ['Quantity', rec.qty ? rec.qty + ' g' : '—'],
    ['Vendor', rec.vendor || '—'],
    ['Catalog no.', rec.catalog || '—'],
    ['Storage', rec.storage],
  ];
  for (const [label, value] of fields) {
    const cell = document.createElement('div');
    const l = document.createElement('label');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    cell.append(l, v);
    details.appendChild(cell);
  }

  const smiles = document.createElement('div');
  smiles.className = 'wide';
  const sl = document.createElement('label');
  sl.textContent = 'SMILES';
  const sv = document.createElement('span');
  sv.textContent = rec.smiles || 'not recorded';
  smiles.append(sl, sv);
  details.appendChild(smiles);

  if (rec.caveat) {
    const caveat = document.createElement('div');
    caveat.className = 'caveat';
    caveat.textContent = 'Structure caveat: ' + rec.caveat +
      '. Worth confirming against the bottle before use.';
    details.appendChild(caveat);
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
    chip.textContent = value.replace(/^Box /, '');
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

function refreshChips(data) {
  const boxCounts = new Map();
  for (const rec of state.records) {
    boxCounts.set(rec.box, (boxCounts.get(rec.box) || 0) + 1);
  }
  boxCounts.set('All', state.records.length);

  buildChips(
    el.boxChips,
    ['All', ...data.boxes],
    boxCounts,
    (v) => state.box === v,
    (v) => { state.box = v; refreshChips(data); render(); }
  );

  const groupCounts = new Map();
  for (const rec of state.records) {
    for (const g of rec.groups) {
      groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
    }
  }

  buildChips(
    el.groupChips,
    data.groups,
    groupCounts,
    (v) => state.groups.has(v),
    (v) => {
      if (state.groups.has(v)) state.groups.delete(v);
      else state.groups.add(v);
      refreshChips(data);
      render();
    }
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
    el.status.textContent = 'Could not load inventory data: ' + err.message;
  });
