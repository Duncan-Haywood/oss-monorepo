// @ts-check
// The Structure tab's "Where the capacity goes" section, the 3D view's
// "Colour by structural use" switch and tap-to-inspect, and the framing plans
// coloured by use. The numbers come from utilisation.mjs; this file only
// draws them.

import { utilisation, marginReport, heatById, BANDS, UNCHECKED, bandOf, REASONS } from './utilisation.mjs';
import { heatSheets, heatSheetSvg } from './utilisation-sheets.mjs';
import { buildShed } from './model.mjs';
import { estimate } from './estimate.mjs';

const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (r) => `${Math.round(r * 100)}%`;
const TARGET_KEY = 'shed-designer-util-target';

/** @type {any} */
let viewer = null;
/** @type {any} */
let shed = null;
/** @type {import('./utilisation.mjs').Use[]} */
let uses = [];
let turn = 0;
let target = 0.7;
/** @type {(event: string) => void} */
let count = () => {};
/** The page's prices, for what each lighter option saves. @type {() => any} */
let pricesNow = () => undefined;
const open = new Set();

const heatOn = () => /** @type {HTMLInputElement|null} */ (document.querySelector('#heat-3d'))?.checked === true;

/**
 * Options for viewer.show: a heat map when the switch is on.
 * @param {any} s @param {any} [sc]
 */
export function heatOption(s, sc) {
  if (!heatOn()) return {};
  const map = new Map();
  for (const [id, u] of heatById(utilisation(s, sc))) map.set(id, BANDS[bandOf(u.ratio)].rgb);
  return { heat: map };
}

function legendHtml() {
  return [...BANDS, UNCHECKED].map((b) => `<span class="util-key"><span class="swatch" style="background:${b.hex}"></span>${esc(b.label)}</span>`).join(' ');
}

function useHtml(u) {
  const band = u.governs === 'none' ? UNCHECKED : BANDS[bandOf(u.ratio)];
  const parts = [...u.parts].sort((a, b) => b.ratio - a.ratio);
  const body = u.governs === 'none'
    ? `<p>${esc(u.explain)}</p>`
    : `${u.explain ? `<p>${esc(u.explain)}</p>` : ''}
      ${u.inputs.length ? `<dl class="util-in">${u.inputs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${parts.length ? `<ol class="util-parts">${parts.map((p, i) => `<li${i === 0 ? ' class="gov"' : ''}><strong>${esc(p.name)}${i === 0 ? ' (governs)' : ''}: ${pct(p.ratio)}.</strong> ${esc(p.words)}</li>`).join('')}</ol>`
        : `<p class="muted">${u.verified ? '' : 'This member\'s breakdown could not be reproduced from its check, so only the Structure table\'s result is shown.'}</p>`}`;
  return `<li><details data-key="${esc(u.key)}"${open.has(u.key) ? ' open' : ''}><summary><span class="swatch" style="background:${band.hex}"></span><strong>${esc(u.key)}</strong> <span class="muted">${esc(u.size)}</span> <span class="util-pct">${u.governs === 'none' ? 'carries no load' : `${pct(u.ratio)}, ${esc(u.governs)}`}</span></summary>${body}</details></li>`;
}

/**
 * What a far member's lighter option saves in materials, at the page's prices.
 * @param {{ reason: string, option?: { change?: Record<string, any> } }} f
 */
function savesText(f) {
  if (f.reason !== 'oversized' || !f.option?.change || !shed) return '-';
  const p = pricesNow();
  const now = estimate(shed, p).total;
  const alt = estimate(buildShed({ ...shed.design, ...f.option.change }, p), p).total;
  const d = now - alt;
  return Math.abs(d) < 0.5 ? '$0' : d > 0 ? `$${Math.round(d).toLocaleString('en-US')}` : `costs $${Math.round(-d).toLocaleString('en-US')} more`;
}

function renderMargin() {
  const box = $('#util-margin');
  if (!box || !shed) return;
  const r = marginReport(shed, target, uses);
  let html = '';
  if (r.over.length) html += `<p class="fail"><strong>Over capacity:</strong> ${r.over.map((u) => `${esc(u.key)} (${pct(u.ratio)})`).join('; ')}.</p>`;
  html += r.above.length
    ? `<p><strong>Above your ${pct(target)} target</strong> (passes, but needs a bigger size or a shorter span to keep that margin): ${r.above.map((u) => `${esc(u.key)} at ${pct(u.ratio)}, ${esc(u.governs)}`).join('; ')}.</p>`
    : `<p>No member is above your ${pct(target)} target.</p>`;
  if (r.far.length) {
    html += `<p><strong>Far below it</strong> (under ${pct(target / 2)}), and why:</p><div class="table-wrap"><table class="util-far"><thead><tr><th scope="col">Member</th><th scope="col" class="n">Use</th><th scope="col">Reason</th><th scope="col">What the tool found</th><th scope="col" class="n">Saves</th></tr></thead><tbody>${
      r.far.map((f) => `<tr><th scope="row">${esc(f.use.key)}</th><td class="n">${f.use.governs === 'none' ? '-' : pct(f.use.ratio)}</td><td>${esc(REASONS[f.reason])}</td><td>${esc(f.why)}</td><td class="n">${savesText(f)}</td></tr>`).join('')}</tbody></table></div>`;
    if (r.far.some((f) => f.reason === 'oversized')) html += '<p class="muted">"Saves" is materials before tax at your prices for that one change. The cheaper build under "Options made for you" prices these beside its other moves.</p>';
  }
  box.innerHTML = html;
}

function renderPlans() {
  const box = $('#util-plans');
  const det = /** @type {HTMLDetailsElement|null} */ (document.querySelector('#util-sheets'));
  if (!box || !shed || !det?.open) return;
  const sheets = heatSheets(shed, heatById(uses));
  box.innerHTML = sheets.map((s, i) => `<figure class="sheet">${heatSheetSvg(s, { name: shed.design.name, number: i + 1, of: sheets.length })}</figure>`).join('');
}

/** Open one member's check in the list and bring it into view. */
function reveal(key) {
  const el = /** @type {HTMLDetailsElement|null} */ ([...document.querySelectorAll('#util-list details')].find((d) => /** @type {HTMLElement} */ (d).dataset.key === key) || null);
  if (!el) return;
  el.open = true;
  open.add(key);
  el.scrollIntoView({ block: 'nearest' });
  /** @type {HTMLElement} */ (el.querySelector('summary')).focus({ preventScroll: true });
}

function showStructureTab() {
  /** @type {HTMLElement|null} */ (document.querySelector('[data-panel="panel-structure"]'))?.click();
}

/**
 * Draw the list now; the margin report (it builds lighter variants) and the
 * coloured plans just after, and only while they are on screen.
 * @param {any} s @param {any} sc structuralChecks(s)
 */
export function renderUtilisation(s, sc) {
  shed = s;
  uses = utilisation(s, sc);
  const list = $('#util-list');
  if (!list) return;
  list.innerHTML = uses.map(useHtml).join('');
  const t = ++turn;
  setTimeout(() => {
    if (t !== turn || $('#panel-structure')?.hidden) return;
    renderMargin();
    renderPlans();
  }, 0);
  const legend = $('#heat-legend');
  if (legend) { legend.hidden = !heatOn(); legend.innerHTML = `${legendHtml()}<br>Tap a member to see its check.`; }
}

/**
 * Wire the controls once.
 * @param {{ viewer: any, count?: (event: string) => void, storage?: Storage | null, prices?: () => any }} opts
 */
export function initUtilisation(opts) {
  viewer = opts.viewer;
  if (opts.count) count = opts.count;
  if (opts.prices) pricesNow = opts.prices;
  try { const v = Number(opts.storage?.getItem(TARGET_KEY)); if (v >= 0.3 && v <= 1) target = v; } catch { /* storage can be off */ }
  const input = /** @type {HTMLInputElement|null} */ (document.querySelector('#util-target'));
  if (input) {
    input.value = String(Math.round(target * 100));
    input.addEventListener('change', () => {
      const v = Number(input.value) / 100;
      if (!(v >= 0.3 && v <= 1)) { input.value = String(Math.round(target * 100)); return; }
      target = v;
      try { opts.storage?.setItem(TARGET_KEY, String(v)); } catch { /* storage can be off */ }
      renderMargin();
    });
  }
  $('#util-list')?.addEventListener('toggle', (e) => {
    const d = /** @type {HTMLDetailsElement} */ (e.target);
    if (!d.dataset?.key) return;
    if (d.open) { open.add(d.dataset.key); count('utilisation-opened'); } else open.delete(d.dataset.key);
  }, true);
  document.querySelector('[data-panel="panel-structure"]')?.addEventListener('click', () => setTimeout(() => { renderMargin(); renderPlans(); }, 0));
  document.querySelector('#util-sheets')?.addEventListener('toggle', () => renderPlans());
  $('#util-plans')?.addEventListener('click', (e) => {
    const cls = /** @type {Element} */ (e.target).getAttribute?.('class') || '';
    const id = /mid-(\S+)/.exec(cls)?.[1];
    const u = id && heatById(uses).get(id);
    if (u) reveal(u.key);
  });
  document.querySelector('#heat-3d')?.addEventListener('change', () => {
    if (heatOn()) count('utilisation-opened');
    else { const info = $('#pick-info'); if (info) info.textContent = ''; }
    if (!shed) return;
    viewer?.show(shed, heatOption(shed));
    const legend = $('#heat-legend');
    if (legend) legend.hidden = !heatOn();
  });
  // A tap (not a drag) on the 3D view, with the colours on, names the member and its check.
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.querySelector('#view3d'));
  let down = null;
  canvas?.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas?.addEventListener('pointerup', (e) => {
    const info = $('#pick-info');
    if (!down || !heatOn() || !viewer || !info) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 5) return;
    const id = viewer.pick(e.clientX, e.clientY);
    const m = id && shed?.members.find((x) => x.id === id);
    const u = id && heatById(uses).get(id);
    if (!m) { info.textContent = ''; return; }
    info.innerHTML = u
      ? `<strong>${esc(m.kind)} ${esc(m.id)}</strong> (${esc(m.material)}): ${esc(u.key)}, ${pct(u.ratio)} of capacity, ${esc(u.governs)}. <button type="button" class="link" id="pick-open">See the check</button>`
      : `<strong>${esc(m.kind)} ${esc(m.id)}</strong> (${esc(m.material)}): not checked on its own.`;
    document.querySelector('#pick-open')?.addEventListener('click', () => { showStructureTab(); reveal(/** @type {any} */ (u).key); });
  });
}
