'use strict';

const el = {
  kit: document.getElementById('kit'),
  picker: document.getElementById('picker'),
  bar: document.getElementById('kitBar'),
  status: document.getElementById('status'),
  tally: document.getElementById('tally'),
  query: document.getElementById('q'),
};

const state = {
  kits: [],
  current: null,
  query: '',
};

// Material fields searched by the box, whatever columns the sheet has.
const SEARCHED = ['no', 'name', 'spec', 'cas', 'catalog', 'vendor', 'use', 'notes'];

const PARTS = [
  ['materials', 'Materials', renderMaterials],
  ['recipe', 'Formulation', renderRecipe],
  ['protocol', 'Preparation & protocol', renderProtocol],
];

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function kitHref(kit, part) {
  return '#' + encodeURIComponent(kit.name) + (part ? '/' + part : '');
}

function materialCount(kit) {
  return kit.materials ? kit.materials.groups.reduce((n, g) => n + g.items.length, 0) : 0;
}

function section(id, title) {
  const wrap = node('section', 'kit-part');
  wrap.id = id;
  wrap.appendChild(node('h2', '', title));
  return wrap;
}

function table(columns, rows) {
  const scroll = node('div', 'kit-scroll');
  const t = node('table', 'kit-table');
  const head = node('tr');
  for (const label of columns) head.appendChild(node('th', '', label));
  t.appendChild(node('thead')).appendChild(head);
  const body = node('tbody');
  for (const row of rows) body.appendChild(row);
  t.appendChild(body);
  scroll.appendChild(t);
  return scroll;
}

function materialMatches(item) {
  if (!state.query) return true;
  return SEARCHED.map((f) => item[f] || '').join(' ').toLowerCase().includes(state.query);
}

function renderMaterials(materials) {
  const part = section('materials', 'Materials');
  // The full name / spec rides under the material name instead of taking a column.
  const cols = materials.columns.filter((c) => c.key !== 'spec');
  let shown = 0;
  const rows = [];
  for (const group of materials.groups) {
    const items = group.items.filter(materialMatches);
    if (!items.length) continue;
    if (group.title) {
      const tr = node('tr', 'kit-group');
      const td = node('td', '', group.title);
      td.colSpan = cols.length;
      tr.appendChild(td);
      rows.push(tr);
    }
    for (const item of items) {
      const tr = node('tr');
      for (const c of cols) {
        const td = node('td', 'k-' + c.key, item[c.key] || '');
        if (c.key === 'name' && item.spec && item.spec !== item.name) {
          td.appendChild(node('span', 'kit-spec', item.spec));
        }
        tr.appendChild(td);
      }
      rows.push(tr);
      shown++;
    }
  }
  if (shown) {
    part.appendChild(table(cols.map((c) => c.label), rows));
  } else {
    part.appendChild(node('p', 'kit-empty', 'No material matches “' + state.query + '”.'));
  }
  return part;
}

function renderRecipe(recipe) {
  const part = section('recipe', 'Formulation');
  for (const s of recipe) {
    part.appendChild(node('h3', '', s.title));
    for (const block of s.blocks) {
      if (block.kind === 'params') {
        const dl = node('dl', 'kit-params');
        for (const [label, value] of block.items) {
          const item = node('div');
          item.append(node('dt', '', label), node('dd', '', value));
          dl.appendChild(item);
        }
        part.appendChild(dl);
      } else {
        const rows = block.rows.map((r) => {
          const tr = node('tr');
          r.forEach((v, i) => tr.appendChild(node('td', i ? '' : 'k-name', v)));
          return tr;
        });
        part.appendChild(table(block.columns, rows));
      }
    }
  }
  return part;
}

function renderProtocol(protocol) {
  const part = section('protocol', 'Preparation & protocol');
  for (const s of protocol.sections) {
    if (s.title) part.appendChild(node('h3', '', s.title));
    const ol = node('ol', 'kit-steps');
    for (const step of s.steps) ol.appendChild(node('li', '', step));
    part.appendChild(ol);
  }
  return part;
}

function renderPicker() {
  el.picker.replaceChildren();
  for (const kit of state.kits) {
    const card = node('a', 'section-card');
    card.href = kitHref(kit);
    card.appendChild(node('h2', '', kit.name));
    const count = node('div', 'count');
    count.appendChild(node('strong', '', materialCount(kit)));
    count.appendChild(document.createTextNode(' materials'));
    card.appendChild(count);
    if (kit.protocol && kit.protocol.intro) card.appendChild(node('p', '', kit.protocol.intro));
    el.picker.appendChild(card);
  }
}

function renderKit() {
  const kit = state.current;
  el.kit.replaceChildren();

  el.kit.appendChild(node('h1', 'kit-title', kit.name));
  if (kit.protocol && kit.protocol.intro) el.kit.appendChild(node('p', 'kit-intro', kit.protocol.intro));

  const parts = PARTS.filter(([key]) => kit[key]);
  const jump = node('nav', 'kit-jump');
  for (const [key, label] of parts) {
    const a = node('a', '', label);
    a.href = kitHref(kit, key);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(key).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    jump.appendChild(a);
  }
  el.kit.appendChild(jump);

  for (const [key, , fn] of parts) el.kit.appendChild(fn(kit[key]));
}

// The hash picks the view: empty -> the kit buttons, '#<kit>[/<part>]' -> that kit.
function route() {
  const [name, part] = location.hash.slice(1).split('/').map(decodeURIComponent);
  const kit = state.kits.find((k) => k.name === name) || null;
  if (kit !== state.current) {
    state.current = kit;
    state.query = '';
    el.query.value = '';
  }
  el.picker.hidden = !!kit;
  el.bar.hidden = !kit;
  el.kit.hidden = !kit;
  if (!kit) {
    document.title = 'Kits · Lab Inventory';
    return;
  }
  document.title = kit.name + ' · Kits · Lab Inventory';
  renderKit();
  const target = part && document.getElementById(part);
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

el.query.addEventListener('input', (e) => {
  state.query = e.target.value.trim().toLowerCase();
  const materials = document.getElementById('materials');
  if (materials && state.current.materials) materials.replaceWith(renderMaterials(state.current.materials));
});

window.addEventListener('hashchange', route);

fetch('data.json')
  .then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then((data) => {
    state.kits = data.kits;
    el.tally.textContent = data.kits.length;
    if (!data.kits.length) {
      el.status.textContent = 'No kits in the sheet yet. Add a materials tab, then its formulation and protocol tabs after it.';
      return;
    }
    el.status.hidden = true;
    renderPicker();
    route();
  })
  .catch((err) => {
    el.status.hidden = false;
    el.status.textContent = 'Could not load kit data: ' + err.message;
  });
