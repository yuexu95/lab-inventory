'use strict';

const BOXES = {
  'Box A': { rows: 9, cols: 9 },
  'Box B': { rows: 9, cols: 9 },
  'Box C': { rows: 10, cols: 10 },
  'Box D': { rows: 10, cols: 10 },
};
const LETTERS = 'ABCDEFGHIJKLMNOP';
// One colour per program, muted to sit on the paper background. Cycles past eight.
const PALETTE = ['#3F6E63', '#B4661F', '#6F4E7C', '#3F5F8A', '#6B7A2E', '#9B3E3A', '#A05C74', '#74553A'];
const NO_PROGRAM = '#6B7570';

const el = {
  boxes: document.getElementById('boxes'),
  legend: document.getElementById('legend'),
  list: document.getElementById('lineList'),
  listToggle: document.getElementById('listToggle'),
  matches: document.getElementById('matches'),
  meter: document.getElementById('meter'),
  pick: document.getElementById('pick'),
  query: document.getElementById('q'),
  sidebar: document.getElementById('freezerSidebar'),
  status: document.getElementById('status'),
  tally: document.getElementById('tally'),
  tip: document.getElementById('tip'),
};

let records = [];
let byName = new Map();
let occupied = new Map();
let programs = [];
let picked = null;
let program = null;

function key(location) {
  return `${location.box}|${location.row}${location.col}`;
}

function colorOf(programName) {
  const index = programs.indexOf(programName);
  return index === -1 ? NO_PROGRAM : PALETTE[index % PALETTE.length];
}

function shortProgram(programName) {
  return programName.replace(/^\d+\s*[-–:.]\s*/, '') || programName;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setListOpen(open) {
  el.sidebar.hidden = !open;
  el.listToggle.setAttribute('aria-expanded', String(open));
  el.listToggle.classList.toggle('on', open);
}

/* ---- highlight state: search term, program chip, picked line ---- */

function applyHighlight() {
  const term = el.query.value.trim().toLowerCase();
  const active = !!(term || program !== null || picked);
  let litLines = new Set();
  let litSlots = 0;
  document.querySelectorAll('.freezer-well').forEach((well) => {
    const name = well.dataset.line;
    let lit = false;
    if (name) {
      lit = true;
      if (picked) lit = name === picked;
      else {
        if (term) lit = lit && name.toLowerCase().includes(term);
        if (program !== null) lit = lit && well.dataset.program === program;
      }
    }
    well.classList.toggle('lit', active && lit);
    well.classList.toggle('dim', active && !lit);
    if (active && lit) { litLines.add(name); litSlots += 1; }
  });
  el.list.querySelectorAll('li').forEach((item) => {
    const name = item.dataset.line;
    item.hidden = !!term && !name.toLowerCase().includes(term);
    item.querySelector('button').setAttribute('aria-pressed', String(name === picked));
  });
  el.legend.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('on', chip.dataset.program === program);
  });
  el.matches.textContent = term && !picked
    ? (litLines.size ? `${litLines.size} line${litLines.size === 1 ? '' : 's'} · ${litSlots} slot${litSlots === 1 ? '' : 's'}` : 'no match')
    : '';
  document.body.classList.toggle('freezer-focus', active);
}

function setPicked(name, { scroll = false } = {}) {
  picked = name && byName.has(name) ? name : null;
  renderPick();
  applyHighlight();
  const hash = picked ? `#${encodeURIComponent(picked)}` : '';
  if (hash !== location.hash) history.replaceState(null, '', location.pathname + hash);
  if (picked && scroll) {
    const first = document.querySelector(`.freezer-well[data-line="${CSS.escape(picked)}"]`);
    if (first) first.closest('.freezer-box').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function setProgram(programName) {
  program = program === programName ? null : programName;
  if (program !== null) setPicked(null);
  applyHighlight();
}

function clearAll() {
  el.query.value = '';
  program = null;
  setPicked(null);
}

function flashSlot(location) {
  const well = document.querySelector(`.freezer-well[data-box="${location.box}"][data-pos="${location.row}${location.col}"]`);
  if (!well) return;
  well.closest('.freezer-box').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  well.classList.remove('flash');
  void well.offsetWidth; // restart the animation
  well.classList.add('flash');
  well.focus({ preventScroll: true });
}

/* ---- rendering ---- */

function renderPick() {
  el.pick.replaceChildren();
  const record = picked ? byName.get(picked) : null;
  el.pick.hidden = !record;
  document.body.classList.toggle('freezer-picked', !!record);
  if (!record) return;

  const swatch = node('span', 'freezer-swatch');
  swatch.style.background = colorOf(record.program);

  const text = node('div', 'freezer-pick-text');
  const title = node('div', 'freezer-pick-name', record.name);
  const sub = node('div', 'freezer-pick-sub mono');
  const bits = [record.program && shortProgram(record.program), record.organism, record.tissue].filter(Boolean);
  sub.textContent = bits.join(' · ');
  text.append(title, sub);

  const slots = node('div', 'freezer-pick-slots');
  const sortedLocations = [...record.locations].sort((a, b) =>
    a.box.localeCompare(b.box) || a.row.localeCompare(b.row) || a.col - b.col);
  for (const location of sortedLocations) {
    const chip = node('button', 'freezer-slot mono');
    chip.type = 'button';
    chip.title = `Show ${location.box} ${location.row}${location.col}`;
    chip.append(node('span', 'freezer-slot-box', location.box.replace('Box ', '')), node('span', '', `${location.row}${location.col}`));
    chip.addEventListener('click', () => flashSlot(location));
    slots.appendChild(chip);
  }
  const count = node('span', 'freezer-pick-count mono',
    `${record.locations.length} slot${record.locations.length === 1 ? '' : 's'}` + (record.qty ? ` · ${record.qty} vial${record.qty === '1' ? '' : 's'}` : ''));
  slots.prepend(count);

  const actions = node('div', 'freezer-pick-actions mono');
  if (record.url) {
    const link = node('a', '', `ATCC ${record.catalog} ↗`);
    link.href = record.url;
    link.target = '_blank';
    link.rel = 'noopener';
    actions.appendChild(link);
  }
  const close = node('button', 'freezer-pick-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Clear selection');
  close.addEventListener('click', () => setPicked(null));
  actions.appendChild(close);

  el.pick.append(swatch, text, slots, actions);
}

function renderLegend() {
  el.legend.replaceChildren();
  const slotsPer = new Map();
  for (const record of records) {
    if (!record.locations.length) continue;
    slotsPer.set(record.program, (slotsPer.get(record.program) || 0) + record.locations.length);
  }
  for (const programName of programs) {
    if (!slotsPer.has(programName)) continue;
    const chip = node('button', 'chip');
    chip.type = 'button';
    chip.dataset.program = programName;
    chip.title = programName;
    const swatch = node('span', 'freezer-swatch');
    swatch.style.background = colorOf(programName);
    chip.append(swatch, node('span', '', shortProgram(programName)), node('span', 'n', slotsPer.get(programName)));
    chip.addEventListener('click', () => setProgram(programName));
    el.legend.appendChild(chip);
  }
  if (slotsPer.has('')) {
    const chip = node('button', 'chip');
    chip.type = 'button';
    chip.dataset.program = '';
    const swatch = node('span', 'freezer-swatch');
    swatch.style.background = NO_PROGRAM;
    chip.append(swatch, node('span', '', 'no program'), node('span', 'n', slotsPer.get('')));
    chip.addEventListener('click', () => setProgram(''));
    el.legend.appendChild(chip);
  }
  const empty = node('span', 'chip freezer-legend-empty');
  empty.append(node('span', 'freezer-swatch freezer-swatch-empty'), node('span', '', 'empty'));
  el.legend.appendChild(empty);
}

function renderMeter(totalSlots) {
  el.meter.replaceChildren();
  const slotsPer = new Map();
  for (const record of records) {
    slotsPer.set(record.program, (slotsPer.get(record.program) || 0) + record.locations.length);
  }
  for (const [programName, count] of slotsPer) {
    if (!count) continue;
    const segment = node('span');
    segment.style.flex = String(count);
    segment.style.background = colorOf(programName);
    el.meter.appendChild(segment);
  }
  const free = node('span', 'free');
  free.style.flex = String(Math.max(totalSlots - occupied.size, 0));
  el.meter.appendChild(free);
}

function drawBox(box, dimensions) {
  const total = dimensions.rows * dimensions.cols;
  const filled = [...occupied.keys()].filter((location) => location.startsWith(`${box}|`)).length;
  const card = node('section', 'freezer-box');
  card.id = `box-${box.slice(-1)}`;

  const head = node('div', 'freezer-box-head');
  const titles = node('div');
  titles.append(node('h2', '', box), node('span', 'freezer-dims mono', `${dimensions.rows} × ${dimensions.cols}`));
  const fill = node('div', 'freezer-fill');
  fill.append(node('span', 'mono', `${filled} / ${total}`), node('span', 'mono soft', `${total - filled} free`));
  const bar = node('div', 'freezer-fill-bar');
  const level = node('span');
  level.style.width = `${(filled / total) * 100}%`;
  bar.appendChild(level);
  fill.appendChild(bar);
  head.append(titles, fill);
  card.appendChild(head);

  const grid = node('div', 'freezer-grid');
  grid.style.gridTemplateColumns = `18px repeat(${dimensions.cols}, minmax(0, 1fr))`;
  grid.appendChild(document.createElement('div'));
  for (let col = 1; col <= dimensions.cols; col += 1) grid.appendChild(node('div', 'freezer-hd mono', col));

  for (let rowIndex = 0; rowIndex < dimensions.rows; rowIndex += 1) {
    const row = LETTERS[rowIndex];
    grid.appendChild(node('div', 'freezer-rh mono', row));
    for (let col = 1; col <= dimensions.cols; col += 1) {
      const location = { box, row, col };
      const name = occupied.get(key(location));
      const well = node('button', `freezer-well${name ? ' full' : ''}`);
      well.type = 'button';
      well.dataset.box = box;
      well.dataset.pos = `${row}${col}`;
      if (name) {
        const record = byName.get(name);
        well.dataset.line = name;
        well.dataset.program = record.program;
        well.style.setProperty('--well', colorOf(record.program));
      }
      well.setAttribute('aria-label', `${box} ${row}${col}: ${name || 'empty'}`);
      grid.appendChild(well);
    }
  }
  card.appendChild(grid);
  el.boxes.appendChild(card);
}

function renderList() {
  el.list.replaceChildren();
  const sorted = records
    .filter((record) => record.locations.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const record of sorted) {
    const item = node('li');
    item.dataset.line = record.name;
    const button = node('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    const swatch = node('span', 'freezer-swatch');
    swatch.style.background = colorOf(record.program);
    const name = node('span', 'freezer-line-name', record.name);
    const count = node('span', 'freezer-count mono', record.locations.length);
    button.append(swatch, name, count);
    button.addEventListener('click', () => setPicked(record.name === picked ? null : record.name, { scroll: true }));
    item.appendChild(button);
    el.list.appendChild(item);
  }
}

function render() {
  el.boxes.querySelectorAll('.freezer-box').forEach((box) => box.remove());
  for (const [box, dimensions] of Object.entries(BOXES)) drawBox(box, dimensions);
  const totalSlots = Object.values(BOXES).reduce((sum, box) => sum + box.rows * box.cols, 0);
  el.tally.innerHTML = `<strong>${occupied.size}</strong> of ${totalSlots} slots filled · ${totalSlots - occupied.size} free`;
  renderMeter(totalSlots);
  renderLegend();
  renderList();
  el.status.hidden = true;
}

/* ---- events ---- */

function measureBar() {
  document.documentElement.style.setProperty('--barh', `${document.querySelector('.freezer-bar').offsetHeight}px`);
}
window.addEventListener('resize', measureBar);
measureBar();

el.listToggle.addEventListener('click', () => setListOpen(el.sidebar.hidden));

el.boxes.addEventListener('click', (event) => {
  const well = event.target.closest('.freezer-well');
  if (!well) return;
  if (!well.dataset.line) { setPicked(null); return; }
  setPicked(well.dataset.line === picked ? null : well.dataset.line);
});

function showTip(well) {
  el.tip.replaceChildren();
  const record = well.dataset.line ? byName.get(well.dataset.line) : null;
  el.tip.append(node('strong', '', record ? record.name : 'Empty slot'));
  if (record) {
    const meta = [record.program && shortProgram(record.program), record.organism].filter(Boolean).join(' · ');
    if (meta) el.tip.append(node('span', '', meta));
  }
  el.tip.append(node('span', 'freezer-tip-pos', `${well.dataset.box} · ${well.dataset.pos}`));
  el.tip.classList.add('on');
}

el.boxes.addEventListener('mouseover', (event) => {
  const well = event.target.closest('.freezer-well');
  if (well) showTip(well);
});
el.boxes.addEventListener('mousemove', (event) => {
  el.tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - 280)}px`;
  el.tip.style.top = `${event.clientY + 18}px`;
});
el.boxes.addEventListener('mouseout', (event) => {
  if (event.target.closest('.freezer-well')) el.tip.classList.remove('on');
});

el.query.addEventListener('input', () => {
  if (picked) { picked = null; renderPick(); history.replaceState(null, '', location.pathname); }
  applyHighlight();
});
el.query.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const term = el.query.value.trim().toLowerCase();
  if (!term) return;
  const hits = records.filter((record) => record.locations.length && record.name.toLowerCase().includes(term));
  if (hits.length === 1) setPicked(hits[0].name, { scroll: true });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  clearAll();
  el.query.blur();
});

window.addEventListener('hashchange', () => {
  setPicked(decodeURIComponent(location.hash.slice(1)), { scroll: true });
});

fetch('../data.json')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    records = data.records.map((record) => ({ ...record, locations: record.locations || [] }));
    programs = data.programs || [...new Set(records.map((record) => record.program).filter(Boolean))];
    byName = new Map(records.map((record) => [record.name, record]));
    occupied = new Map();
    for (const record of records) {
      for (const location of record.locations) occupied.set(key(location), record.name);
    }
    render();
    if (location.hash) setPicked(decodeURIComponent(location.hash.slice(1)), { scroll: true });
  })
  .catch((error) => {
    el.status.hidden = false;
    el.status.textContent = `Could not load freezer map data: ${error.message}`;
  });
