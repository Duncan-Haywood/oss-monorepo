// @ts-check
// The page: several designs, a drag editor, the 3D view, the lists and the
// plan sheets, all rebuilt from one design object on every change.

import { buildShed, normalize, defaultDesign, PRESETS, WALLS, WALL_LABEL, wallFaceLength } from './model.mjs';
import { estimate, examplePrices, cutSheetCsv, shoppingCsv } from './estimate.mjs';
import { buildSheets, sheetSvg, sheetsDxf } from './drawings.mjs';
import { createViewer, LAYERS } from './render3d.mjs';
import { drawPlan, drawEnd } from './editor.mjs';
import { fmtIn, fmtFtIn, actual, STANDARD_LENGTHS_FT, EXAMPLE_ITEMS } from './lumber.mjs';
import { recordUsage, clearUsage } from './usage.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { generateCandidates } from './candidates.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';

const $ = (sel) => /** @type {any} */ (document.querySelector(sel));
const $$ = (sel) => /** @type {any[]} */ ([...document.querySelectorAll(sel)]);
const STORE = 'shed-designer-state-v1';
const OPT = 'shed-designer-usage-preference';
const KEEP = 'shed-designer-keep-designs';
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let storage = null;
try { storage = globalThis.localStorage; } catch { storage = null; }
const optedOut = () => Boolean($('#optout')?.checked);
const count = (event) => recordUsage(storage, optedOut(), event);

/** @type {{ designs: any[], active: number, prices: any }} */
const state = { designs: [], active: 0, prices: examplePrices() };
const undo = []; const redo = [];
const thumbs = new Map();

// ---------- persistence ----------
function save() {
  if (!storage || !$('#keep').checked) return;
  try { storage.setItem(STORE, JSON.stringify(state)); } catch { /* storage full or denied */ }
}
function load() {
  try {
    const raw = storage?.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.designs) && s.designs.length) {
        state.designs = s.designs.map(normalize);
        state.active = Math.min(s.designs.length - 1, Math.max(0, Number(s.active) || 0));
        if (s.prices?.lumber) state.prices = { lumber: { ...state.prices.lumber, ...s.prices.lumber }, items: { ...state.prices.items, ...s.prices.items } };
      }
    }
  } catch { /* a bad saved state starts fresh */ }
  const m = /#d=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    try {
      const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
      state.designs.push(normalize(JSON.parse(json)));
      state.active = state.designs.length - 1;
      history.replaceState(null, '', location.pathname + location.search);
    } catch { /* ignore a broken link */ }
  }
  if (!state.designs.length) state.designs = [defaultDesign()];
}
const design = () => state.designs[state.active];

// ---------- changes ----------
function commit(next, label = 'edit') {
  undo.push(JSON.stringify(design()));
  if (undo.length > 100) undo.shift();
  redo.length = 0;
  state.designs[state.active] = normalize(next);
  if (/moved|resized|changed/.test(label)) count('drags');
  render();
  $('#status').textContent = `Updated: ${label}.`;
}

let previewQueued = null;
function preview(next) {
  if (previewQueued) { previewQueued = next; return; }
  previewQueued = next;
  requestAnimationFrame(() => {
    const d = normalize(previewQueued);
    previewQueued = null;
    const shed = buildShed(d);
    viewer?.show(shed);
    $('#live').textContent = `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)}, ${fmtFtIn(d.wallHeight)} walls, ${d.pitch}/12 roof, ${d.overhang}" overhang`;
  });
}

// ---------- form ----------
const FIELDS = ['name', 'lengthFt', 'widthFt', 'wallHeight', 'pitch', 'overhang', 'studSize', 'studSpacing', 'joistSize', 'joistSpacing',
  'rafterSize', 'rafterSpacing', 'tieSize', 'skidSize', 'skidSpacing', 'foundation', 'floorTreated', 'siding', 'roofing', 'gableVents', 'ventWidth', 'ventHeight', 'kerf',
  'roofType', 'beamSize', 'sidingColor', 'polkaDots', 'autoWall', 'autoPitch',
  'autoOverhang', 'snowLoad', 'windLoad', 'roofColor', 'trimColor', 'glitter', 'interior'];

function fillForm(d) {
  const set = (id, v) => { const e = /** @type {any} */ (document.getElementById(id)); if (!e || e === document.activeElement) return; if (e.type === 'checkbox') e.checked = Boolean(v); else e.value = String(v); };
  set('name', d.name);
  set('lengthFt', +(d.length / 12).toFixed(2));
  set('widthFt', +(d.width / 12).toFixed(2));
  set('maxPeakFt', +(d.maxPeak / 12).toFixed(2));
  for (const f of FIELDS.slice(3)) set(f, d[f]);
  for (const cb of $$('input[name="stock"]')) cb.checked = d.lengths.includes(Number(cb.value));
}

function readForm() {
  const v = (id) => /** @type {any} */ (document.getElementById(id));
  const d = { ...design() };
  d.name = v('name').value;
  d.length = Math.round(Number(v('lengthFt').value) * 12);
  d.width = Math.round(Number(v('widthFt').value) * 12);
  d.maxPeak = Math.round(Number(v('maxPeakFt').value) * 12);
  for (const f of ['wallHeight', 'pitch', 'overhang', 'studSpacing', 'joistSpacing', 'rafterSpacing', 'skidSpacing', 'ventWidth', 'ventHeight', 'kerf', 'snowLoad', 'windLoad']) d[f] = Number(v(f).value);
  for (const f of ['studSize', 'joistSize', 'rafterSize', 'tieSize', 'skidSize', 'foundation', 'roofType', 'beamSize', 'sidingColor', 'roofColor', 'trimColor', 'interior']) d[f] = v(f).value;
  for (const f of ['floorTreated', 'siding', 'roofing', 'gableVents', 'polkaDots', 'autoWall', 'autoPitch', 'autoOverhang', 'glitter']) d[f] = v(f).checked;
  d.lengths = $$('input[name="stock"]:checked').map((c) => Number(c.value));
  return d;
}

function renderOpenings(d) {
  const tbody = $('#openings tbody');
  if (tbody.contains(document.activeElement)) return;
  tbody.innerHTML = '';
  d.openings.forEach((op, i) => {
    const tr = document.createElement('tr');
    const wallOpts = WALLS.map((w) => `<option value="${w}"${w === op.wall ? ' selected' : ''}>${WALL_LABEL[w]}</option>`).join('');
    tr.innerHTML = `
      <td><select data-i="${i}" data-k="kind" aria-label="Opening ${i + 1} type"><option value="door"${op.kind === 'door' ? ' selected' : ''}>Door</option><option value="window"${op.kind === 'window' ? ' selected' : ''}>Window</option></select></td>
      <td><select data-i="${i}" data-k="wall" aria-label="Opening ${i + 1} wall">${wallOpts}</select></td>
      <td><input type="number" min="0" max="480" step="1" data-i="${i}" data-k="offset" value="${op.offset}" aria-label="Opening ${i + 1} distance from the wall's left corner, as seen from outside (in)"></td>
      <td><input type="number" min="12" max="144" step="1" data-i="${i}" data-k="width" value="${op.width}" aria-label="Opening ${i + 1} rough opening width (in)"></td>
      <td><input type="number" min="12" max="120" step="1" data-i="${i}" data-k="height" value="${op.height}" aria-label="Opening ${i + 1} rough opening height (in)"></td>
      <td>${op.kind === 'window' ? `<input type="number" min="6" max="96" step="1" data-i="${i}" data-k="sill" value="${op.sill ?? 42}" aria-label="Opening ${i + 1} sill height above the floor (in)">` : '<span class="muted">floor</span>'}</td>
      <td><button type="button" class="link" data-remove="${i}" aria-label="Remove opening ${i + 1}">Remove</button></td>`;
    tbody.appendChild(tr);
  });
}

// ---------- results ----------
function renderSummary(shed, est) {
  const d = shed.design;
  $('#total').textContent = money(est.total);
  $('#summary-lines').innerHTML = [
    ['Footprint', `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)} (${est.footprintSqFt.toFixed(0)} sq ft)`],
    ['Peak above the gravel', fmtFtIn(shed.dims.peak)],
    ['Boards to buy', `${est.boards} for ${est.pieces} pieces`],
    ['Lumber', `${money(est.lumberCost)} (lower bound ${money(est.lowerBound)})`],
    ['Sheets', `${est.floorSheets} floor, ${est.roofSheets} roof${d.siding ? `, ${shed.sidingFull.length + (shed.sidingUpper.length ? 1 : 0)}+ siding` : ''}`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const msgs = [...shed.warnings, ...est.problems];
  $('#warnings').innerHTML = msgs.length ? `<strong>Check these:</strong><ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  $('#notes').innerHTML = shed.notes.length ? `<ul>${shed.notes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  $('#live').textContent = `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)}, ${fmtFtIn(d.wallHeight)} walls, ${d.pitch}/12 roof, ${d.overhang}" overhang`;
}

function renderShopping(est) {
  let html = '';
  let section = '';
  for (const r of est.shopping) {
    if (r.section !== section) { section = r.section; html += `<tr class="sec"><th colspan="6" scope="colgroup">${esc(section)}</th></tr>`; }
    html += `<tr><td>${esc(r.name)}</td><td class="n">${r.qty}</td><td>${r.unit}</td><td class="n">${money(r.price)}</td><td class="n">${money(r.total)}</td><td>${sourceCell(r.source)}</td></tr>`;
  }
  html += `<tr class="tot"><th colspan="4" scope="row">Estimated total</th><td class="n">${money(est.total)}</td><td></td></tr>`;
  $('#shopping tbody').innerHTML = html;
}

/** A price's source as a short cell: a link to the listing, or what kind of estimate it is. */
function sourceCell(s) {
  if (!s) return '';
  const tip = esc(s.note || '');
  if (s.kind === 'yours') return '<span class="muted">your price</span>';
  if (s.url) return `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${tip}">${esc(s.store || 'listing')}, ${esc(s.seen || '')}</a>${s.kind === 'derived' ? ' <span class="muted">(scaled)</span>' : ''}`;
  return `<span class="muted" title="${tip}">estimate</span>`;
}

function renderStructure(shed) {
  const c = connectionChecks(shed);
  $('#connections tbody').innerHTML = c.rows.map((x) => `<tr><th scope="row">${esc(x.check)}</th><td>${esc(x.detail)}</td><td class="${x.ok ? 'ok' : 'fail'}">${x.ok ? 'passes' : 'needs fixing'}</td></tr>`).join('');
  const r = structuralChecks(shed);
  $('#structure-note').textContent = `Loads you set: ${r.loads.snow} psf snow on the roof, ${r.loads.wind} psf wind on the walls, plus ${r.loads.roofDead} psf roof dead load and ${r.loads.floorLive} psf on the floor. SPF No. 2 lumber, allowable-stress (NDS) checks of the kind a span table encodes: a screening check, not an engineer's review. Connections, uplift, racking and the foundation are not checked; ask your building department for your area's snow and wind loads.`;
  $('#structure tbody').innerHTML = r.rows.map((x) => {
    const pct = Math.round(x.ratio * 100);
    const meter = `<span class="meter${x.ratio > 0.9 ? ' hot' : ''}"><span style="width:${Math.min(100, pct)}%"></span></span>${pct}%`;
    return `<tr><th scope="row">${esc(x.member)}</th><td>${esc(x.size)}</td><td>${esc(x.detail)}</td><td class="n">${x.governs === 'none' ? '-' : meter}</td><td class="${x.ok ? 'ok' : 'fail'}">${x.governs === 'none' ? 'not a beam' : x.ok ? 'passes' : 'over capacity'}</td></tr>`;
  }).join('');
  return r;
}

function renderPrices(est, d) {
  const box = $('#price-grid');
  if (box.contains(document.activeElement)) return;
  const mats = est.lumber.map((l) => l.material);
  const lens = d.lengths;
  let html = `<table class="grid"><thead><tr><th scope="col">Board</th>${lens.map((ft) => `<th scope="col">${ft}'</th>`).join('')}</tr></thead><tbody>`;
  for (const m of mats) {
    html += `<tr><th scope="row">${m}</th>${lens.map((ft) => `<td><input type="number" min="0" step="0.01" data-mat="${m}" data-ft="${ft}" value="${state.prices.lumber[m]?.[ft] ?? ''}" aria-label="Price of a ${m} ${ft} ft board ($)"></td>`).join('')}</tr>`;
  }
  html += '</tbody></table><div class="items">';
  for (const r of est.shopping.filter((x) => x.section !== 'Lumber')) {
    const key = Object.entries(state.prices.items).find(([k]) => labelOfItem(k) && r.name.startsWith(labelOfItem(k)))?.[0];
    if (key) html += `<label>${esc(r.name)} ($ per ${r.unit})<input type="number" min="0" step="0.01" data-item="${key}" value="${state.prices.items[key]}"></label>`;
  }
  box.innerHTML = html + '</div>';
}
const labelOfItem = (k) => /** @type {any} */ (EXAMPLE_ITEMS)[k]?.name;

function renderCuts(est) {
  let html = '';
  let n = 0;
  for (const l of est.lumber) {
    const s = actual(l.material);
    html += `<h4>${l.material} <span class="muted">(actual ${fmtIn(s.thick)} x ${fmtIn(s.depth)})</span>: ${l.result.boards.length} boards, ${money(l.result.cost)}, ${(l.result.waste * 100).toFixed(1)}% offcut</h4><ol class="boards" start="${n + 1}">`;
    for (const b of l.result.boards) {
      n += 1;
      let x = 0;
      const segs = b.cuts.map((c) => {
        const w = (c.len / b.stock) * 100;
        const seg = `<span class="cut" style="left:${x}%;width:${w}%" title="${c.mark}: ${c.kind} ${fmtIn(c.len)}">${c.mark} ${fmtIn(c.len)}</span>`;
        x += w;
        return seg;
      }).join('');
      html += `<li><span class="board-name">${b.stock / 12}' board</span><span class="bar">${segs}</span><span class="off">offcut ${fmtIn(b.offcut)}</span></li>`;
    }
    html += '</ol>';
  }
  $('#cuts').innerHTML = html;
}

function renderParts(est) {
  $('#parts tbody').innerHTML = est.parts.map((p) => {
    const s = actual(p.material);
    const where = Object.entries(p.where).map(([k, v]) => `${k} ${v}`).join(', ');
    return `<tr><th scope="row">${p.mark}</th><td>${esc(p.kind)}</td><td>${p.material} <span class="muted">${fmtIn(s.thick)} x ${fmtIn(s.depth)}</span></td><td class="n">${fmtIn(p.length)}</td><td class="n">${p.qty}</td><td>${esc(where)}</td><td>${esc(p.note)}</td></tr>`;
  }).join('');
}

let sheetsCache = [];
function renderPlans(shed, est) {
  const marks = new Map();
  for (const p of est.parts) for (const id of p.ids) marks.set(id, p.mark);
  sheetsCache = buildSheets(shed, marks);
  $('#plans').innerHTML = sheetsCache.map((s, i) => `<figure class="sheet" id="sheet-${s.id}">${sheetSvg(s, { name: shed.design.name, number: i + 1, of: sheetsCache.length })}<figcaption>${i + 1}. ${esc(s.title)} <button type="button" class="link" data-svg="${i}">Download SVG</button> <button type="button" class="link" data-dxf="${i}">DXF</button></figcaption></figure>`).join('');
}

let buildMd = '';
function renderBuild(shed, est) {
  const sections = buildInstructions(shed, est);
  buildMd = instructionsMarkdown(sections, shed.design.name);
  $('#build-steps').innerHTML = sections.map((s) => `<li><h3>${esc(s.title)}</h3>${s.why ? `<p class="muted">${esc(s.why)}</p>` : ''}<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${s.check?.length ? `<div class="check"><strong>Check:</strong> ${s.check.map(esc).join(' ')}</div>` : ''}</li>`).join('');
}

function renderTabs() {
  const nav = $('#design-tabs');
  nav.innerHTML = state.designs.map((d, i) => `<button type="button" role="tab" aria-selected="${i === state.active}" data-design="${i}">${esc(d.name)}</button>`).join('');
}

function renderCompare() {
  const rows = state.designs.map((d, i) => {
    const shed = buildShed(d);
    const est = estimate(shed, state.prices);
    return { d, i, shed, est };
  });
  const cheapest = Math.min(...rows.map((r) => r.est.total));
  $('#compare-cards').innerHTML = rows.map(({ d, i, shed, est }) => `
    <article class="card${i === state.active ? ' active' : ''}">
      ${thumbs.get(JSON.stringify(d)) ? `<img src="${thumbs.get(JSON.stringify(d))}" alt="3D view of ${esc(d.name)}" width="360" height="240">` : '<div class="thumb-wait">rendering...</div>'}
      <h4>${esc(d.name)}${est.total === cheapest && rows.length > 1 ? ' <span class="pill">lowest cost</span>' : ''}</h4>
      <dl>
        <div><dt>Footprint</dt><dd>${fmtFtIn(d.length)} x ${fmtFtIn(d.width)}</dd></div>
        <div><dt>Floor area</dt><dd>${est.footprintSqFt.toFixed(0)} sq ft</dd></div>
        <div><dt>Walls / roof</dt><dd>${fmtFtIn(d.wallHeight)}, ${d.pitch}/12</dd></div>
        <div><dt>Peak</dt><dd>${fmtFtIn(shed.dims.peak)}</dd></div>
        <div><dt>Boards</dt><dd>${est.boards}</dd></div>
        <div><dt>Total</dt><dd>${money(est.total)}</dd></div>
        <div><dt>Per sq ft</dt><dd>${money(est.total / est.footprintSqFt)}</dd></div>
      </dl>
      <button type="button" data-design="${i}">${i === state.active ? 'Editing' : 'Open this design'}</button>
    </article>`).join('');
}

// Thumbnails come from a second, off-page viewer so the main view never flickers.
let thumbViewer = null;
let thumbTimer = /** @type {any} */ (0);
function queueThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    if (!thumbViewer) {
      const c = document.createElement('canvas'); c.width = 720; c.height = 480;
      thumbViewer = createViewer(c);
    }
    if (!thumbViewer) return;
    let changed = false;
    for (const d of state.designs) {
      const key = JSON.stringify(d);
      if (thumbs.has(key)) continue;
      thumbViewer.show(buildShed(d), { refit: true });
      thumbs.set(key, thumbViewer.snapshot());
      changed = true;
    }
    if (changed) renderCompare();
  }, 350);
}

let lastEst = null;
function render() {
  const d = design();
  const shed = buildShed(d);
  const est = estimate(shed, state.prices);
  lastEst = est;
  fillForm(shed.design);
  renderOpenings(d);
  renderTabs();
  const hooks = { onChange: commit, onPreview: preview };
  drawPlan($('#plan'), d, hooks);
  drawEnd($('#endview'), d, shed.dims, hooks);
  viewer?.show(shed);
  renderSummary(shed, est);
  const sc = renderStructure(shed);
  const worst = sc.rows.reduce((m, x) => Math.max(m, x.ratio), 0);
  const cc = connectionChecks(shed);
  $('#summary-lines').insertAdjacentHTML('beforeend', `<div><dt>Structure</dt><dd>${sc.ok ? `all ${sc.rows.length} load checks pass` : `${sc.rows.filter((x) => !x.ok).length} over capacity`} (highest ${Math.round(worst * 100)}%); ${cc.ok ? `all ${cc.rows.length} connection checks pass` : `${cc.rows.filter((x) => !x.ok).length} connection checks fail`}</dd></div>`);
  renderShopping(est);
  renderPrices(est, d);
  renderCuts(est);
  renderParts(est);
  renderPlans(shed, est);
  renderBuild(shed, est);
  renderCompare();
  queueThumbs();
  $('#undo').disabled = !undo.length;
  $('#redo').disabled = !redo.length;
  count('builds');
  save();
}

// ---------- downloads ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = () => design().name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shed';

// ---------- wiring ----------
const viewer = createViewer($('#view3d'));
if (!viewer) $('#view3d-fallback').hidden = false;

function wire() {
  const form = $('#settings');
  const onForm = (e) => {
    const t = e.target;
    if (t.dataset.i !== undefined) {
      const i = Number(t.dataset.i);
      const d = { ...design(), openings: design().openings.map((o) => ({ ...o })) };
      const op = d.openings[i];
      op[t.dataset.k] = t.type === 'number' ? Number(t.value) : t.value;
      if (t.dataset.k === 'wall') op.offset = Math.max(0, Math.min(op.offset, wallFaceLength(d, op.wall) - op.width));
      if (t.dataset.k === 'kind' && t.value === 'window' && op.sill === undefined) op.sill = 42;
      commit(d, `changed opening ${i + 1}`);
      if (e.type === 'change' && t.tagName === 'SELECT') { $('#openings tbody').innerHTML = ''; renderOpenings(design()); }
      return;
    }
    if (t.dataset.mat) { state.prices.lumber[t.dataset.mat][t.dataset.ft] = Number(t.value); render(); return; }
    if (t.dataset.item) { state.prices.items[t.dataset.item] = Number(t.value); render(); return; }
    if (t.closest('#settings')) {
      const next = readForm();
      // Typing a pitch or wall height means you want that number, not the automatic one.
      if (t.id === 'pitch') next.autoPitch = false;
      if (t.id === 'wallHeight') next.autoWall = false;
      if (t.id === 'overhang') next.autoOverhang = false;
      commit(next, `changed ${t.labels?.[0]?.textContent?.trim().toLowerCase() || t.id}`);
    }
  };
  form.addEventListener('change', onForm);
  form.addEventListener('input', (e) => { if (e.target.type === 'number' || e.target.type === 'text') onForm(e); });
  $('#price-grid').addEventListener('change', onForm);
  $('#openings').addEventListener('click', (e) => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    const d = { ...design(), openings: design().openings.filter((_, k) => k !== Number(i)) };
    $('#openings tbody').innerHTML = '';
    commit(d, 'removed an opening');
    renderOpenings(design());
  });
  const addOpening = (kind) => {
    const d = design();
    const id = `o${Date.now().toString(36)}`;
    const op = kind === 'door' ? { id, kind, wall: 'left', offset: Math.max(0, Math.round(d.width / 2 - 26)), width: 52, height: 80 }
      : { id, kind, wall: 'back', offset: Math.max(0, Math.round(d.length / 2 - 16)), width: 32, height: 24, sill: 48 };
    $('#openings tbody').innerHTML = '';
    commit({ ...d, openings: [...d.openings, op] }, `added a ${kind}`);
    renderOpenings(design());
  };
  $('#add-door').addEventListener('click', () => addOpening('door'));
  $('#add-window').addEventListener('click', () => addOpening('window'));

  $('#design-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-design]');
    if (!b) return;
    state.active = Number(b.dataset.design);
    undo.length = 0; redo.length = 0;
    render();
  });
  $('#compare-cards').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-design]');
    if (!b) return;
    state.active = Number(b.dataset.design);
    count('compares');
    render();
    $('#workspace').scrollIntoView({ behavior: 'smooth' });
  });
  $('#new-design').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    const d = v === 'copy' ? { ...structuredClone(design()), name: `${design().name} (copy)` } : PRESETS[v]();
    state.designs.push(normalize(d));
    state.active = state.designs.length - 1;
    e.target.value = '';
    count('designs');
    undo.length = 0; redo.length = 0;
    render();
  });
  $('#delete-design').addEventListener('click', () => {
    if (state.designs.length < 2) { $('#status').textContent = 'This is your only design; change it instead of deleting it.'; return; }
    if (!confirm(`Delete "${design().name}"?`)) return;
    state.designs.splice(state.active, 1);
    state.active = Math.max(0, state.active - 1);
    render();
  });
  $('#undo').addEventListener('click', () => {
    if (!undo.length) return;
    redo.push(JSON.stringify(design()));
    state.designs[state.active] = JSON.parse(/** @type {string} */ (undo.pop()));
    render();
  });
  $('#redo').addEventListener('click', () => {
    if (!redo.length) return;
    undo.push(JSON.stringify(design()));
    state.designs[state.active] = JSON.parse(/** @type {string} */ (redo.pop()));
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || /** @type {any} */ (e.target).closest?.('input, select, textarea')) return;
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); $('#undo').click(); }
    if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); $('#redo').click(); }
  });

  for (const cb of $$('#layers input')) cb.addEventListener('change', () => viewer?.setLayer(cb.value, cb.checked));
  $('#framing-only').addEventListener('click', () => {
    for (const cb of $$('#layers input')) { cb.checked = !['sheathing', 'siding', 'roofing', 'trim', 'interior', 'front lining', 'decor'].includes(cb.value); viewer?.setLayer(cb.value, cb.checked); }
  });
  $('#finished').addEventListener('click', () => { for (const cb of $$('#layers input')) { cb.checked = true; viewer?.setLayer(cb.value, true); } });
  $('#view-front').addEventListener('click', () => viewer?.view(-Math.PI / 2, 0.12));
  $('#view-side').addEventListener('click', () => viewer?.view(0, 0.12));
  $('#view-top').addEventListener('click', () => viewer?.view(-Math.PI / 2 + 0.01, 1.45));
  $('#view-reset').addEventListener('click', () => viewer?.reset());
  $('#view-inside').addEventListener('click', () => {
    for (const cb of $$('#layers input')) {
      cb.checked = !['sheathing', 'siding', 'roofing', 'roof', 'trim', 'front wall', 'front lining'].includes(cb.value);
      viewer?.setLayer(cb.value, cb.checked);
    }
    viewer?.view(-Math.PI / 2, 0.35);
  });
  $('#posterFile').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f || !viewer) return;
    try {
      const img = await createImageBitmap(f);
      viewer.setPosterImage(img);
      $('#status').textContent = 'Your picture is on the big poster. It stays in this browser and is not saved with the design.';
    } catch { $('#status').textContent = 'That file could not be read as a picture.'; }
  });
  $('#make-options').addEventListener('click', () => {
    const opts = generateCandidates(design(), state.prices);
    const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 480; thumbCanvas.height = 320;
    const tv = createViewer(thumbCanvas);
    $('#option-cards').innerHTML = opts.map((o, i) => {
      let img = '';
      if (tv) { tv.show(buildShed(o.design), { refit: true }); img = `<img src="${tv.snapshot()}" alt="3D view of option ${i + 1}" width="480" height="320">`; }
      return `<article class="card"><div>${img}</div><h4>${i === 0 ? '<span class="pill">best value</span> ' : ''}${esc(o.label)}</h4>
        <dl><div><dt>Total</dt><dd>${money(o.total)}</dd></div><div><dt>Lumber</dt><dd>${money(o.lumber)}, ${o.boards} boards</dd></div>
        <div><dt>Roof</dt><dd>${esc(o.summary)}</dd></div><div><dt>Structure</dt><dd class="${o.ok ? 'ok' : 'fail'}">${o.ok ? 'passes' : 'over capacity'} (${Math.round(o.worst * 100)}%)</dd></div>
        ${o.warnings ? `<div><dt>Warnings</dt><dd>${o.warnings}</dd></div>` : ''}</dl>
        <button type="button" data-option="${i}">Use this one</button></article>`;
    }).join('');
    $('#option-cards').onclick = (ev) => {
      const b = ev.target.closest('button[data-option]');
      if (!b) return;
      state.designs.push(normalize(opts[Number(b.dataset.option)].design));
      state.active = state.designs.length - 1;
      count('designs');
      render();
      $('#workspace').scrollIntoView({ behavior: 'smooth' });
    };
  });
  $('#zoom-in').addEventListener('click', () => viewer?.zoom(1 / 1.2));
  $('#zoom-out').addEventListener('click', () => viewer?.zoom(1.2));

  for (const b of $$('.result-tabs button')) {
    b.addEventListener('click', () => {
      for (const o of $$('.result-tabs button')) o.setAttribute('aria-selected', String(o === b));
      for (const p of $$('.result-panel')) p.hidden = p.id !== b.dataset.panel;
    });
  }
  $('#plans').addEventListener('click', (e) => {
    const i = e.target.dataset.svg ?? e.target.dataset.dxf;
    if (i === undefined) return;
    const s = sheetsCache[Number(i)];
    if (e.target.dataset.svg !== undefined) {
      download(`${slug()}-${s.id}.svg`, sheetSvg(s, { name: design().name, number: Number(i) + 1, of: sheetsCache.length }), 'image/svg+xml');
      count('svg-downloads');
    } else {
      download(`${slug()}-${s.id}.dxf`, sheetsDxf([s]), 'application/dxf');
      count('dxf-downloads');
    }
  });
  $('#dxf-all').addEventListener('click', () => { download(`${slug()}-plans.dxf`, sheetsDxf(sheetsCache), 'application/dxf'); count('dxf-downloads'); });
  $('#csv-cuts').addEventListener('click', () => { download(`${slug()}-cut-sheet.csv`, cutSheetCsv(lastEst), 'text/csv'); count('csv-downloads'); });
  $('#csv-shopping').addEventListener('click', () => { download(`${slug()}-shopping-list.csv`, shoppingCsv(lastEst), 'text/csv'); count('csv-downloads'); });
  $('#json-export').addEventListener('click', () => download(`${slug()}.shed.json`, JSON.stringify(design(), null, 2), 'application/json'));
  $('#json-import').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      state.designs.push(normalize(JSON.parse(await f.text())));
      state.active = state.designs.length - 1;
      render();
    } catch { $('#status').textContent = 'That file is not a shed design saved by this tool.'; }
    e.target.value = '';
  });
  $('#share').addEventListener('click', async () => {
    const json = JSON.stringify(design());
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = `${location.origin}${location.pathname}#d=${b64}`;
    try { await navigator.clipboard.writeText(url); $('#status').textContent = 'Link copied. It carries the design in the link itself; nothing is uploaded.'; } catch { prompt('Copy this link:', url); }
    count('links-copied');
  });
  const printWhat = (what) => {
    document.body.dataset.print = what;
    count('plans-printed');
    window.print();
  };
  $('#print-plans').addEventListener('click', () => printWhat('plans'));
  $('#print-build').addEventListener('click', () => printWhat('build'));
  $('#md-build').addEventListener('click', () => { download(`${slug()}-how-to-build.md`, buildMd, 'text/markdown'); count('csv-downloads'); });
  $('#print-cuts').addEventListener('click', () => printWhat('cuts'));
  window.addEventListener('afterprint', () => { delete document.body.dataset.print; });

  // Preferences.
  try {
    const pref = storage?.getItem(OPT);
    if (pref !== null && pref !== undefined) $('#optout').checked = pref === '1';
    const keep = storage?.getItem(KEEP);
    if (keep === '0') $('#keep').checked = false;
  } catch { /* storage denied */ }
  $('#optout').addEventListener('change', () => {
    try { storage?.setItem(OPT, $('#optout').checked ? '1' : '0'); } catch { /* denied */ }
    if ($('#optout').checked) clearUsage(storage);
  });
  $('#keep').addEventListener('change', () => {
    try {
      storage?.setItem(KEEP, $('#keep').checked ? '1' : '0');
      if (!$('#keep').checked) storage?.removeItem(STORE); else save();
    } catch { /* denied */ }
  });
}

// Stock length checkboxes and layer toggles are generated once.
function buildStatic() {
  $('#stock').innerHTML = STANDARD_LENGTHS_FT.map((ft) => `<label class="check"><input type="checkbox" name="stock" value="${ft}"> ${ft} ft</label>`).join('');
  $('#layers').innerHTML = LAYERS.map((l) => `<label class="check"><input type="checkbox" value="${l}" checked> ${l[0].toUpperCase() + l.slice(1)}</label>`).join('');
}

buildStatic();
load();
wire();
render();
