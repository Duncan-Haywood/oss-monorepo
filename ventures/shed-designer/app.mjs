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
import { quoteRequest, mailtoLink, STORES } from './quote.mjs';
import { PRODUCTS } from './products.mjs';
import { storeComparison, swapsFor, storeTotals, storeList, pricesFor } from './catalog.mjs';
import { simplify, cutMetrics, budget, laborHours } from './simplify.mjs';

const $ = (sel) => /** @type {any} */ (document.querySelector(sel));
const $$ = (sel) => /** @type {any[]} */ ([...document.querySelectorAll(sel)]);
const STORE = 'shed-designer-state-v1';
const OPT = 'shed-designer-usage-preference';
const KEEP = 'shed-designer-keep-designs';
const money = (n) => {
  const format = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let storage = null;
try { storage = globalThis.localStorage; } catch { storage = null; }
const optedOut = () => Boolean($('#optout')?.checked);
const count = (event) => recordUsage(storage, optedOut(), event);

/** @type {{ designs: any[], active: number, prices: any, have: string[], buyAt: string }} */
const state = { designs: [], active: 0, prices: examplePrices(), have: [], buyAt: 'mixed' };

/**
 * The estimate as one store would sell it, or line by line from wherever each
 * was priced ('mixed'). One store's version re-runs the cut optimizer on its
 * prices and marks the lines it has no listing for.
 */
function storeEstimate(shed, key = state.buyAt) {
  if (key === 'mixed') return estimate(shed, state.prices);
  const est = estimate(shed, pricesFor(key, state.prices));
  const sl = storeList(est, key);
  const tax = Math.round(sl.total * shed.design.taxRate) / 100;
  return { ...est, shopping: sl.lines, total: sl.total, tax, grandTotal: Math.round((sl.total + tax + est.deliveryFee) * 100) / 100, storeList: sl };
}
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
        if (typeof s.buyAt === 'string') state.buyAt = s.buyAt;
        if (Array.isArray(s.have)) state.have = s.have.filter((x) => typeof x === 'string');
        if (s.prices?.lumber) state.prices = { lumber: { ...state.prices.lumber, ...s.prices.lumber }, items: { ...state.prices.items, ...s.prices.items }, delivery: { ...(state.prices.delivery || {}), ...(s.prices.delivery || {}) } };
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
  'autoOverhang', 'snowLoad', 'windLoad', 'roofColor', 'trimColor', 'glitter', 'interior', 'sidingType', 'roofCover', 'insulation', 'wallTrim', 'rafterSeat', 'maxFootprint', 'compaction', 'pad', 'floorPanel', 'spares', 'taxRate', 'delivery', 'laborRate'];

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
  for (const f of ['wallHeight', 'pitch', 'overhang', 'studSpacing', 'joistSpacing', 'rafterSpacing', 'skidSpacing', 'ventWidth', 'ventHeight', 'kerf', 'snowLoad', 'windLoad', 'maxFootprint', 'spares', 'taxRate', 'laborRate']) d[f] = Number(v(f).value);
  for (const f of ['studSize', 'joistSize', 'rafterSize', 'tieSize', 'skidSize', 'foundation', 'roofType', 'beamSize', 'sidingColor', 'roofColor', 'trimColor', 'interior', 'sidingType', 'roofCover', 'wallTrim', 'rafterSeat', 'compaction', 'pad', 'floorPanel', 'delivery']) d[f] = v(f).value;
  for (const f of ['floorTreated', 'siding', 'roofing', 'gableVents', 'polkaDots', 'autoWall', 'autoPitch', 'autoOverhang', 'glitter', 'insulation']) d[f] = v(f).checked;
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
      <td><select data-i="${i}" data-k="product" aria-label="Opening ${i + 1} product"><option value="">Custom size</option>${op.kind === 'door' ? `<option value="site-built"${op.product === 'site-built' ? ' selected' : ''}>Build it on site: siding skin on a 2x4 Z frame, tee hinges (keeps this rough opening)</option>` : ''}${PRODUCTS.filter((p) => p.kind === op.kind).map((p) => `<option value="${p.id}"${p.id === op.product ? ' selected' : ''}>${esc(p.name)} (R.O. ${fmtIn(p.roW)} x ${fmtIn(p.roH)}, $${p.price.toFixed(2)})</option>`).join('')}</select></td>
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
  $('#total').textContent = money(est.grandTotal);
  $('#summary-lines').innerHTML = [
    ['Materials', `${money(est.total)}${est.tax ? ` + ${money(est.tax)} tax (${d.taxRate}%)` : ' (no sales tax set)'}${d.delivery !== 'pickup' ? (est.deliveryFee ? ` + ${money(est.deliveryFee)} delivery` : ' + delivery (type your store\'s charge under Prices)') : ''}`],
    ['Footprint', `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)} (${est.footprintSqFt.toFixed(0)} sq ft)`],
    ['Peak above the gravel', fmtFtIn(shed.dims.peak)],
    ['Boards to buy', `${est.boards} for ${est.pieces} pieces`],
    ['Lumber', `${money(est.lumberCost)}; the cut sheet's boards, ${money(est.cutSheetCost)}, are ${est.cutSheetCost - est.lowerBound < 0.005 ? 'proven the cheapest possible' : `within ${((est.cutSheetCost / est.lowerBound - 1) * 100).toFixed(1)}% of the least any order could cost (${money(est.lowerBound)})`}`],
    ['Sheets', `${est.floorSheets} floor, ${est.roofSheets} roof${d.siding ? `, ${shed.sidingFull.length + (shed.sidingUpper.length ? 1 : 0)}+ siding` : ''}`],
    ['Your time', (() => { const h = laborHours(shed, est); return `about ${Math.round(h)} hours${d.laborRate ? `, ${money(h * d.laborRate)} at ${money(d.laborRate)} an hour (materials and time ${money(est.total + h * d.laborRate)})` : ''}`; })()],
    ['Saw cuts', (() => { const c = cutMetrics(shed, est); return `${c.straight} straight, ${c.angled} angled${c.notches ? `, ${c.notches} notches` : ''}; ${(c.waste * 100).toFixed(1)}% offcut`; })()],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const msgs = [...shed.warnings, ...est.problems];
  $('#warnings').innerHTML = msgs.length ? `<strong>Check these:</strong><ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  $('#notes').innerHTML = shed.notes.length ? `<ul>${shed.notes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  $('#live').textContent = `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)}, ${fmtFtIn(d.wallHeight)} walls, ${d.pitch}/12 roof, ${d.overhang}" overhang`;
}

function renderShopping(est) {
  let html = '';
  let section = '';
  // Lines you already have stay on the list (so the plans and quotes are whole) but come off what is left to buy.
  const have = new Set(state.have);
  let had = 0;
  for (const r of est.shopping) {
    if (r.section !== section) { section = r.section; html += `<tr class="sec"><th colspan="7" scope="colgroup">${esc(section)}</th></tr>`; }
    const got = have.has(r.name);
    if (got) had += r.total;
    html += `<tr${got ? ' class="have"' : ''}><td>${esc(r.name)}</td><td class="n">${r.qty}</td><td>${r.unit}</td><td class="n">${money(r.price)}</td><td class="n">${money(r.total)}</td><td>${r.elsewhere ? `<span class="muted">not listed at ${esc(est.storeList.store)}: </span>` : ''}${sourceCell(r.source)}</td><td><input type="checkbox" data-have="${esc(r.name)}"${got ? ' checked' : ''} aria-label="I already have: ${esc(r.name)}"></td></tr>`;
  }
  html += `<tr class="tot"><th colspan="4" scope="row">Materials</th><td class="n">${money(est.total)}</td><td></td><td></td></tr>`;
  if (had) html += `<tr><th colspan="4" scope="row">Less what you already have</th><td class="n">-${money(had)}</td><td></td><td></td></tr><tr class="tot"><th colspan="4" scope="row">Still to buy</th><td class="n">${money(est.total - had)}</td><td></td><td></td></tr>`;
  const tax = (Math.round((est.total - had) * design().taxRate) / 100);
  if (tax) html += `<tr><th colspan="4" scope="row">Sales tax at ${design().taxRate}%</th><td class="n">${money(tax)}</td><td></td><td></td></tr>`;
  if (est.deliveryFee) html += `<tr><th colspan="4" scope="row">Delivery</th><td class="n">${money(est.deliveryFee)}</td><td></td><td></td></tr>`;
  if (tax || est.deliveryFee) html += `<tr class="tot"><th colspan="4" scope="row">Estimated total</th><td class="n">${money(est.total - had + tax + est.deliveryFee)}</td><td></td><td></td></tr>`;
  $('#shopping tbody').innerHTML = html;
  const sl = est.storeList;
  $('#buy-at-note').textContent = sl ? `${sl.here} of ${sl.lines.length} lines (${sl.share}% of the money) at ${sl.store}, its own prices and item numbers; the rest are marked with where we found them.` : 'Each line at wherever it was priced.';
  for (const cb of $$('#shopping input[data-have]')) {
    cb.addEventListener('change', () => {
      const set = new Set(state.have);
      if (cb.checked) set.add(cb.dataset.have); else set.delete(cb.dataset.have);
      state.have = [...set];
      save();
      renderShopping(est);
    });
  }
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
  if (d.delivery !== 'pickup') {
    const fee = state.prices.delivery?.[d.delivery];
    html += `<label>${d.delivery === 'lowes' ? "Lowe's" : 'Home Depot'} delivery charge ($)<input type="number" min="0" step="1" data-delivery="${d.delivery}" value="${fee ?? ''}" placeholder="your store's charge"></label>`;
  }
  box.innerHTML = html + '</div>';
}
const labelOfItem = (k) => /** @type {any} */ (EXAMPLE_ITEMS)[k]?.name;

/** The same parts at other stores, and design swaps priced against this design. */
function renderStores(est, d) {
  const cmp = storeComparison(est);
  const whole = storeTotals(est);
  const two = whole.stores.filter((x) => x.lines > 0);
  let html = `<h4>The whole list at each store</h4><div class="table-wrap"><table><thead><tr><th scope="col">Store</th><th scope="col" class="n">Lines priced there</th><th scope="col" class="n">Those lines</th><th scope="col" class="n">Other lines, at the list's price</th><th scope="col" class="n">Total</th></tr></thead><tbody>${two.map((x) => `<tr><th scope="row">${esc(x.store)}</th><td class="n">${x.lines} of ${x.of}</td><td class="n">${money(x.priced)}</td><td class="n">${money(x.carried)}</td><td class="n">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>`;
  if (whole.shared) html += `<p class="muted">Like for like, on the ${whole.shared} lines every store here lists: ${Object.entries(whole.sharedTotals).map(([st, t]) => `${esc(st)} ${money(t)}`).join(', ')}.</p>`;
  html += `<h4>Line by line</h4><div class="table-wrap"><table><thead><tr><th scope="col">Item</th><th scope="col" class="n">Qty</th>${cmp.stores.map((s) => `<th scope="col">${esc(s)}</th>`).join('')}<th scope="col" class="n">Saving at the cheapest</th></tr></thead><tbody>`;
  for (const row of cmp.rows) {
    html += `<tr><td>${esc(row.line.name)}</td><td class="n">${row.line.qty}</td>${cmp.stores.map((st) => {
      const o = row.offers.find((x) => x.store === st);
      if (!o) return '<td class="muted">no listing found</td>';
      const best = o === row.best ? ' <strong>cheapest</strong>' : '';
      return `<td><a href="${esc(o.url)}" target="_blank" rel="noopener" title="${esc(o.note || '')}">${money(o.price)}</a>${best}<br><span class="muted">${esc(o.name)}; ${esc(o.model)}</span></td>`;
    }).join('')}<td class="n">${money(row.saving)}</td></tr>`;
  }
  html += `<tr class="tot"><th colspan="2" scope="row">These lines at one store</th>${cmp.stores.map((st) => `<td>${cmp.totals[st].missing === cmp.rows.length ? '<span class="muted">none of these</span>' : `${money(cmp.totals[st].total)}${cmp.totals[st].missing ? ` <span class="muted">(${cmp.totals[st].missing} not listed)</span>` : ''}`}</td>`).join('')}<td class="n">${money(cmp.cheapestMix)} mixed</td></tr></tbody></table></div>`;
  // A second trip or delivery is only worth it for a real saving.
  const worth = cmp.addOns.filter((a) => a.saving >= 25);
  if (cmp.oneStop && worth.length) {
    html += `<p><strong>Where to buy:</strong> ${esc(cmp.oneStop.store)} is the cheapest single store for these lines (${money(cmp.oneStop.total)}). ${worth.map((a) => `Adding ${esc(a.store)} for ${a.lines.map(esc).join(', ')} saves ${money(a.saving)}`).join('; ')}. Buying every line at its cheapest store saves ${money(cmp.splitSaving)} in all. Savings are before any delivery charge for a second order.</p>`;
  } else if (cmp.oneStop) {
    html += `<p><strong>One stop:</strong> ${esc(cmp.oneStop.store)}${cmp.splitSaving > 0 ? `, within ${money(cmp.splitSaving)} of splitting the order between stores, which is not worth a second trip` : ' is cheapest or tied on every compared line'}.</p>`;
  }
  html += `<p class="muted">Prices read from search-result copies of each product page on ${cmp.seen}; follow the link to check today's price and see the product. Lines with no listing at a second store are not shown.</p>`;
  const swaps = swapsFor(d);
  if (swaps.length) {
    html += '<h4>Swaps worth a look</h4><ul class="swaps">';
    for (const sw of swaps) {
      const alt = estimate(buildShed(normalize({ ...d, ...sw.change })), state.prices);
      const diff = alt.total - est.total;
      html += `<li><strong>${esc(sw.title)}</strong>: ${diff < 0 ? `saves ${money(-diff)}` : `adds ${money(diff)}`}. ${esc(sw.why)} <span class="muted">${esc(sw.cost)}</span> <button type="button" class="btn" data-swap="${esc(sw.id)}">Try it and show me</button></li>`;
    }
    html += '</ul>';
  }
  $('#stores').innerHTML = html;
  for (const b of $$('#stores [data-swap]')) {
    b.addEventListener('click', () => {
      const sw = swapsFor(d).find((x) => x.id === b.dataset.swap);
      if (!sw) return;
      commit({ ...design(), ...sw.change }, `swap: ${sw.title}`);
      $('#v3d-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

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
  if (est.trimCuts) {
    html += `<h4>1x4 wall trim <span class="muted">(primed, actual 3/4 x 3-1/2)</span>: ${est.trimCuts.boards.length} boards</h4><ol class="boards">`;
    for (const b of est.trimCuts.boards) {
      let x = 0;
      const segs = b.cuts.map((len) => { const w = (len / b.stock) * 100; const seg = `<span class="cut" style="left:${x}%;width:${w}%" title="${fmtIn(len)}">${fmtIn(len)}</span>`; x += w; return seg; }).join('');
      html += `<li><span class="board-name">${b.stock / 12}' board</span><span class="bar">${segs}</span><span class="off">offcut ${fmtIn(b.stock - b.cuts.reduce((t, c) => t + c, 0))}</span></li>`;
    }
    html += `</ol><p class="muted">Trim pieces: ${est.trimCuts.pieces.map((p) => `${esc(p.where)} ${fmtIn(p.length)}`).join('; ')}. Cut each to fit on site; these are the longest each needs.</p>`;
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

let lastQuote = null;
let quoteCtx = null;
function renderQuote(shed, est) {
  quoteCtx = { shed, est };
  const box = $('#quote-body');
  if (box === document.activeElement) return;
  const who = { name: $('#quote-name').value, phone: $('#quote-phone').value, zip: $('#quote-zip').value, date: $('#quote-date').value };
  const pick = $('#quote-store').value;
  // "Both": one draft per store, each naming that store's own item numbers.
  const keys = pick === 'both' ? ['homedepot', 'lowes'] : [pick];
  const drafts = keys.map((k) => quoteRequest(shed, k === 'yard' ? est : storeEstimate(shed, k === 'homedepot' || k === 'lowes' ? k : 'mixed'), /** @type {any} */ (k), who));
  lastQuote = drafts[0];
  box.value = drafts.map((q) => `Subject: ${q.subject}\n\n${q.body}`).join('\n\n----- next email -----\n\n');
  const setLink = (a, q) => { const href = q && mailtoLink(q); if (href) { a.href = href; a.removeAttribute('aria-disabled'); } else { a.href = '#'; a.setAttribute('aria-disabled', 'true'); } };
  setLink($('#quote-mail'), drafts[0]);
  $('#quote-mail').textContent = drafts.length > 1 ? 'Open the Home Depot email' : 'Open in my email app';
  $('#quote-mail2').hidden = drafts.length < 2;
  setLink($('#quote-mail2'), drafts[1]);
  $('#quote-note').textContent = `${keys.map((k) => /** @type {any} */ (STORES)[k].note).join(' ')} Nothing is sent from this page: the draft opens in your own email app (or copy it), and you attach the files.`;
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
  const est = storeEstimate(shed);
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
  renderStores(est, d);
  renderPrices(est, d);
  renderCuts(est);
  renderParts(est);
  renderPlans(shed, est);
  renderBuild(shed, est);
  renderQuote(shed, est);
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
      if (t.dataset.k === 'kind' || t.dataset.k === 'width' || t.dataset.k === 'height') delete op.product;
      if (t.dataset.k === 'product' && !t.value) delete op.product;
      commit(d, `changed opening ${i + 1}`);
      if (e.type === 'change' && t.tagName === 'SELECT') { $('#openings tbody').innerHTML = ''; renderOpenings(design()); }
      return;
    }
    if (t.dataset.mat) { state.prices.lumber[t.dataset.mat][t.dataset.ft] = Number(t.value); render(); return; }
    if (t.dataset.item) { state.prices.items[t.dataset.item] = Number(t.value); render(); return; }
    if (t.dataset.delivery) { state.prices.delivery = { ...(state.prices.delivery || {}), [t.dataset.delivery]: Number(t.value) }; render(); return; }
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
  $('#show-dims').addEventListener('change', (e) => viewer?.setDimensions(e.target.checked));
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
  $('#budget').addEventListener('click', () => {
    $('#budget').disabled = true;
    $('#budget-out').innerHTML = '<p class="muted">Pricing the alternatives...</p>';
    setTimeout(() => {
      const r = budget(design(), state.prices);
      const b = r.best;
      const ft = (x) => fmtFtIn(Math.round(x * 8) / 8);
      let html = '';
      if (!b.steps.length) {
        html = `<p>Nothing cheaper passed the checks: your design is already the cheapest of the ${r.evaluated} tried.</p>`;
      } else {
        const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 480; thumbCanvas.height = 320;
        const tv = createViewer(thumbCanvas);
        let img = '';
        if (tv) { tv.show(buildShed(b.design), { refit: true }); img = `<img src="${tv.snapshot()}" alt="3D view of the cheaper build" width="480" height="320" style="max-width:100%;height:auto">`; }
        html += `<article class="card">${img}<h4>${money(b.total)} of materials, ${money(r.base.total - b.total)} less than your ${money(r.base.total)}; about ${Math.round(b.hours)} hours of work (yours: ${Math.round(r.base.hours)})</h4>
          <ol>${b.steps.map((st) => `<li>${esc(st.label)}: saves ${money(st.saving)}${st.hours ? ` (${st.materials >= 0 ? `${money(st.materials)} of materials` : `${money(-st.materials)} more materials`}, ${Math.abs(st.hours)} h ${st.hours > 0 ? 'less' : 'more'} work)` : ''}</li>`).join('')}</ol>
          <p class="muted">Same ${fmtFtIn(b.design.length)} x ${fmtFtIn(b.design.width)} footprint. Peak ${ft(b.peak)}${Math.abs(b.peak - r.base.peak) > 0.06 ? ` (yours is ${ft(r.base.peak)})` : ''}. ${r.evaluated} designs priced and checked.</p>
          <button type="button" data-budget-use>Use this one</button></article>`;
      }
      if (r.also.length) html += `<p><strong>Also possible, if you will change the structure you chose:</strong> ${r.also.map((a) => `${esc(a.label)} saves ${money(a.saving)} more counting your time (${money(a.materials)} of materials, ${a.hours >= 0 ? `${a.hours} h less` : `${-a.hours} h more`} work)`).join('; ')}.</p>`;
      if (r.taller.length) html += `<p><strong>Held back by height:</strong> ${r.taller.map((a) => `${esc(a.label)} would save ${money(a.saving)} more but put the peak at ${ft(a.peak)}`).join('; ')}.</p>`;
      $('#budget-out').innerHTML = html;
      $('#budget-out').onclick = (ev) => {
        if (!ev.target.closest('button[data-budget-use]')) return;
        state.designs.push(normalize({ ...b.design, name: `${design().name}: cheaper build` }));
        state.active = state.designs.length - 1;
        count('designs');
        render();
        $('#workspace').scrollIntoView({ behavior: 'smooth' });
      };
      $('#budget').disabled = false;
    }, 30);
  });
  $('#simplify').addEventListener('click', () => {
    $('#simplify').disabled = true;
    $('#simplify-out').innerHTML = '<p class="muted">Building and checking variations...</p>';
    setTimeout(() => {
      const r = simplify(design(), state.prices, { resize: $('#simplify-resize').checked });
      const cutsText = (c) => `${c.straight} straight, ${c.angled} angled${c.notches ? `, ${c.notches} birdsmouth notches` : ''}`;
      // One card per distinct design; goals that land on the same one share it.
      const picks = [];
      for (const w of Object.values(r.winners)) {
        const same = picks.find((p) => JSON.stringify(p.design) === JSON.stringify(w.design));
        if (same) same.goal += ` / ${w.goal.toLowerCase()}`; else picks.push({ ...w });
      }
      const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 480; thumbCanvas.height = 320;
      const tv = createViewer(thumbCanvas);
      let html = `<p class="muted">Tried ${r.evaluated} designs; each kept passes every load and connection check${design().maxFootprint ? `, stays within ${design().maxFootprint} sq ft` : ''} and is no more than 1" taller. Your design: ${money(r.base.total)}, ${cutsText(r.base.cuts)} cuts, ${(r.base.cuts.waste * 100).toFixed(1)}% offcut.</p><div class="cards">`;
      html += picks.map((w, i) => {
        let img = '';
        if (tv) { tv.show(buildShed(w.design), { refit: true }); img = `<img src="${tv.snapshot()}" alt="3D view of the ${esc(w.goal.toLowerCase())} pick" width="480" height="320">`; }
        return `<article class="card"><div>${img}</div><h4>${esc(w.goal)}</h4>
          <dl><div><dt>Changes</dt><dd>${w.changes.length ? esc(w.changes.join(', ')) : 'none: yours is already best for this goal'}</dd></div>
          <div><dt>Total</dt><dd>${money(w.total)} (${w.total <= r.base.total ? 'saves' : 'adds'} ${money(Math.abs(r.base.total - w.total))})</dd></div>
          <div><dt>Saw cuts</dt><dd>${cutsText(w.cuts)}</dd></div><div><dt>Offcut</dt><dd>${(w.cuts.waste * 100).toFixed(1)}% of the lumber bought</dd></div></dl>
          <button type="button" data-pick="${i}">Use this one</button></article>`;
      }).join('');
      html += '</div><h4>Every design found that nothing else beats on cost, cuts and angled cuts at once</h4><div class="table-wrap"><table><thead><tr><th scope="col" class="n">Total</th><th scope="col" class="n">Straight cuts</th><th scope="col" class="n">Angled</th><th scope="col" class="n">Notches</th><th scope="col">Roof</th><th scope="col">Size</th></tr></thead><tbody>';
      html += r.front.map((f) => `<tr><td class="n">${money(f.total)}</td><td class="n">${f.cuts.straight}</td><td class="n">${f.cuts.angled}</td><td class="n">${f.cuts.notches}</td><td>${f.design.pitch}/12, ${fmtIn(f.design.overhang)} overhang, ${f.design.roofType === 'ridgeBeam' ? 'ridge beam' : 'ridge board and ties'}, ${f.design.rafterSeat === 'connector' ? 'connectors' : 'birdsmouth'}</td><td>${fmtFtIn(f.design.length)} x ${fmtFtIn(f.design.width)}</td></tr>`).join('');
      html += '</tbody></table></div>';
      $('#simplify-out').innerHTML = html;
      $('#simplify-out').onclick = (ev) => {
        const b = ev.target.closest('button[data-pick]');
        if (!b) return;
        state.designs.push(normalize({ ...picks[Number(b.dataset.pick)].design, name: `${design().name}: ${picks[Number(b.dataset.pick)].goal.toLowerCase()}` }));
        state.active = state.designs.length - 1;
        count('designs');
        render();
        $('#workspace').scrollIntoView({ behavior: 'smooth' });
      };
      $('#simplify').disabled = false;
    }, 30);
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
  for (const id of ['#quote-store', '#quote-name', '#quote-phone', '#quote-zip', '#quote-date']) $(id).addEventListener('input', () => quoteCtx && renderQuote(quoteCtx.shed, quoteCtx.est));
  $('#quote-store').addEventListener('change', () => quoteCtx && renderQuote(quoteCtx.shed, quoteCtx.est));
  $('#buy-at').value = state.buyAt;
  $('#buy-at').addEventListener('change', () => { state.buyAt = $('#buy-at').value; render(); });
  $('#quote-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#quote-body').value); $('#status').textContent = 'Email copied.'; } catch { $('#quote-body').select(); }
  });
  $('#quote-attach').addEventListener('click', () => {
    download(`${slug()}-plans.dxf`, sheetsDxf(sheetsCache), 'application/dxf');
    download(`${slug()}-cut-sheet.csv`, cutSheetCsv(lastEst), 'text/csv');
    download(`${slug()}-shopping-list.csv`, shoppingCsv(lastEst), 'text/csv');
    count('csv-downloads');
  });
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
