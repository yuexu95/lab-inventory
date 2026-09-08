'use strict';

const BOXES = {
  'Box A': { rows: 9, cols: 9 },
  'Box B': { rows: 9, cols: 9 },
  'Box C': { rows: 10, cols: 10 },
  'Box D': { rows: 10, cols: 10 },
};
const LETTERS = 'ABCDEFGHIJKLMNOP';
const el = {
  boxes: document.getElementById('boxes'),
  list: document.getElementById('lineList'),
  query: document.getElementById('q'),
  status: document.getElementById('status'),
  tally: document.getElementById('tally'),
  tip: document.getElementById('tip'),
};

let records = [];
let occupied = new Map();
let picked = null;

function key(location) {
  return `${location.box}|${location.row}${location.col}`;
}

function clearHighlight() {
  picked = null;
  document.querySelectorAll('.freezer-well').forEach((well) => {
    well.classList.remove('lit', 'dim');
  });
  el.list.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
  });
}

function highlight(name) {
  picked = name;
  document.querySelectorAll('.freezer-well').forEach((well) => {
    well.classList.toggle('lit', well.dataset.line === name);
    well.classList.toggle('dim', !!name && well.dataset.line !== name);
  });
  el.list.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.line === name));
  });
}

function drawBox(box, dimensions) {
  const locationsInBox = [...occupied.keys()].filter((location) => location.startsWith(`${box}|`));
  const card = document.createElement('section');
  card.className = 'freezer-box';

  const title = document.createElement('h2');
  title.textContent = box;
  card.appendChild(title);
  const summary = document.createElement('p');
  summary.className = 'freezer-sub mono';
  summary.textContent = `${locationsInBox.length} / ${dimensions.rows * dimensions.cols} filled · ${dimensions.rows * dimensions.cols - locationsInBox.length} free`;
  card.appendChild(summary);

  const grid = document.createElement('div');
  grid.className = 'freezer-grid';
  grid.style.gridTemplateColumns = `20px repeat(${dimensions.cols}, minmax(22px, 1fr))`;
  grid.appendChild(document.createElement('div'));
  for (let col = 1; col <= dimensions.cols; col += 1) {
    const header = document.createElement('div');
    header.className = 'freezer-hd mono';
    header.textContent = col;
    grid.appendChild(header);
  }

  for (let rowIndex = 0; rowIndex < dimensions.rows; rowIndex += 1) {
    const row = LETTERS[rowIndex];
    const rowHeader = document.createElement('div');
    rowHeader.className = 'freezer-rh mono';
    rowHeader.textContent = row;
    grid.appendChild(rowHeader);
    for (let col = 1; col <= dimensions.cols; col += 1) {
      const location = { box, row, col };
      const name = occupied.get(key(location));
      const well = document.createElement('button');
      well.type = 'button';
      well.className = `freezer-well${name ? ' full' : ''}`;
      well.dataset.box = box;
      well.dataset.pos = `${row}${col}`;
      if (name) well.dataset.line = name;
      well.setAttribute('aria-label', `${box} ${row}${col}: ${name || 'empty'}`);
      grid.appendChild(well);
    }
  }
  card.appendChild(grid);
  el.boxes.appendChild(card);
}

function renderList() {
  el.list.replaceChildren();
  const sorted = [...records]
    .filter((record) => record.locations.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const record of sorted) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.line = record.name;
    button.setAttribute('aria-pressed', 'false');
    const name = document.createElement('span');
    name.textContent = record.name;
    const count = document.createElement('span');
    count.className = 'freezer-count mono';
    count.textContent = record.locations.length;
    button.append(name, count);
    item.appendChild(button);
    el.list.appendChild(item);
  }
}

function render() {
  el.boxes.querySelectorAll('.freezer-box').forEach((box) => box.remove());
  for (const [box, dimensions] of Object.entries(BOXES)) drawBox(box, dimensions);
  const totalSlots = Object.values(BOXES).reduce((sum, box) => sum + box.rows * box.cols, 0);
  el.tally.innerHTML = `<strong>${occupied.size}</strong> occupied · <strong>${totalSlots - occupied.size}</strong> free`;
  el.status.hidden = true;
}

el.list.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.line === picked) clearHighlight();
  else highlight(button.dataset.line);
});

el.boxes.addEventListener('click', (event) => {
  const well = event.target.closest('.freezer-well');
  if (!well || !well.dataset.line) return;
  if (well.dataset.line === picked) clearHighlight();
  else highlight(well.dataset.line);
});

el.boxes.addEventListener('mouseover', (event) => {
  const well = event.target.closest('.freezer-well');
  if (!well) return;
  el.tip.textContent = `${well.dataset.box} · ${well.dataset.pos} · ${well.dataset.line || 'empty slot'}`;
  el.tip.style.opacity = '1';
});
el.boxes.addEventListener('mousemove', (event) => {
  el.tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - 270)}px`;
  el.tip.style.top = `${event.clientY + 18}px`;
});
el.boxes.addEventListener('mouseout', (event) => {
  if (event.target.closest('.freezer-well')) el.tip.style.opacity = '0';
});

el.query.addEventListener('input', (event) => {
  const term = event.target.value.trim().toLowerCase();
  el.list.querySelectorAll('li').forEach((item) => {
    item.hidden = term !== '' && !item.querySelector('button').dataset.line.toLowerCase().includes(term);
  });
  document.querySelectorAll('.freezer-well').forEach((well) => {
    const matches = well.dataset.line && well.dataset.line.toLowerCase().includes(term);
    well.classList.toggle('lit', !!term && !!matches);
    well.classList.toggle('dim', !!term && !matches);
  });
  if (!term) clearHighlight();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    el.query.value = '';
    clearHighlight();
  }
});

fetch('../data.json')
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    records = data.records;
    occupied = new Map();
    for (const record of records) {
      for (const location of record.locations || []) occupied.set(key(location), record.name);
    }
    renderList();
    render();
  })
  .catch((error) => {
    el.status.hidden = false;
    el.status.textContent = `Could not load freezer map data: ${error.message}`;
  });
