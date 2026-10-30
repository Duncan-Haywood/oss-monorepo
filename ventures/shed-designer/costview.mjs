// @ts-check
// The "Where the money goes" tab: ranked bars of the cost by assembly or by
// material type (tap a bar for its lines), the cost change of the last edit by
// assembly, and the bridge from your design to the cheapest passing one. The
// HTML builders are pure so the tests can read them; showCosts and the
// handlers below drive the page.

import { costBreakdown, costDelta, costBridge, deltaPhrase, signedDollars } from './costs.mjs';
import { buildShed } from './model.mjs';
import { estimate } from './estimate.mjs';

/** @typedef {import('./costs.mjs').Breakdown} Breakdown */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => `${n < -0.004 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** The breakdown of a design at a set of prices, for comparing two designs like for like. */
export function breakdownOf(design, prices) {
  const shed = buildShed(design);
  return costBreakdown(shed, estimate(shed, prices));
}

/**
 * Ranked bars, one per assembly (or material type), largest first, one hue. Each
 * row is a button that opens its lines; the bar's length is its share of the
 * largest group, and the amount and share are printed beside it.
 * @param {Breakdown} b @param {'assemblies' | 'materials'} by @param {Set<string>} [open] @param {number} [off] lines you have or left out
 */
export function breakdownHtml(b, by, open = new Set(), off = 0) {
  const groups = b[by];
  const top = Math.max(0.01, ...groups.map((g) => g.total));
  const rows = groups.map((g) => {
    const id = `cost-${by}-${g.key}`;
    const isOpen = open.has(g.key);
    const lines = g.lines.map((l) => `<tr><td>${esc(l.name)}${l.note ? ` <span class="muted">(${esc(l.note)})</span>` : ''}</td><td class="n">${l.qty !== undefined ? `${l.qty} ${esc(l.unit || '')}` : ''}</td><td class="n">${money(l.total)}</td></tr>`).join('');
    return `<li data-cost="${g.key}"><button type="button" class="cost-row" aria-expanded="${isOpen}" aria-controls="${id}">`
      + `<span class="cost-name">${esc(g.label)}</span>`
      + `<span class="cost-track" aria-hidden="true"><span class="cost-bar" style="width:${((g.total / top) * 100).toFixed(1)}%"></span></span>`
      + `<span class="cost-amt">${money(g.total)} <span class="muted">${pct(g.total, b.total)}%</span></span></button>`
      + `<div class="cost-lines" id="${id}"${isOpen ? '' : ' hidden'}><table><caption class="sr-only">${esc(g.label)}: lines</caption><thead><tr><th scope="col">Line</th><th scope="col" class="n">Qty</th><th scope="col" class="n">Cost</th></tr></thead><tbody>${lines}</tbody></table></div></li>`;
  }).join('');
  return `<ol class="cost-bars" aria-label="Materials cost ${by === 'materials' ? 'by material type' : 'by assembly'}, largest first">${rows}</ol>`
    + `<p class="muted cost-foot">${money(b.total)} of materials before tax and delivery${off ? `, less the ${off} line${off === 1 ? '' : 's'} you have or left out` : ''}. Lumber is bought by the board and cut for several assemblies, so each board's price is shared among its pieces by length, offcut and spares included.</p>`;
}

/** A short tooltip body: the group's biggest lines. @param {Breakdown} b @param {'assemblies' | 'materials'} by @param {string} key */
export function tipHtml(b, by, key) {
  const g = b[by].find((x) => x.key === key);
  if (!g) return '';
  const shown = g.lines.slice(0, 4);
  const more = g.lines.length - shown.length;
  return `<strong>${esc(g.label)}: ${money(g.total)}</strong><ul>${shown.map((l) => `<li><span>${esc(l.name)}</span> <span class="n">${money(l.total)}</span></li>`).join('')}</ul>${more > 0 ? `<span class="muted">and ${more} more; tap for all</span>` : ''}`;
}

/**
 * The change between two breakdowns as a sentence, with the new total.
 * @param {Breakdown} from @param {Breakdown} to @param {string} lead
 */
export function deltaSentence(from, to, lead) {
  const total = to.total - from.total;
  if (Math.abs(total) < 0.005 && !costDelta(from, to).length) return '';
  const phrase = deltaPhrase(costDelta(from, to));
  return `${lead}: materials ${signedDollars(total)}${phrase ? ` (${phrase})` : ''}.`;
}

/**
 * The bridge as a horizontal waterfall: totals in grey from zero, savings in
 * blue and rises in red floating from the running total, every step labelled
 * with its signed amount so colour is never the only cue.
 * @param {Breakdown} from @param {Breakdown} to @param {{ toLabel?: string }} [opts]
 */
export function bridgeHtml(from, to, opts = {}) {
  const br = costBridge(from, to);
  const scale = Math.max(0.01, br.max);
  const rows = br.steps.map((s, i) => {
    const lo = Math.min(s.start, s.end);
    const w = Math.abs(s.end - s.start);
    const label = s.kind === 'total' && i > 0 ? (opts.toLabel || s.label) : s.label;
    const value = s.kind === 'total' ? money(s.value) : signedDollars(s.value);
    const say = s.kind === 'total' ? `${label}: ${money(s.value)}` : `${label}: ${s.value < 0 ? 'saves' : 'adds'} ${money(Math.abs(s.value))}`;
    return `<li class="bridge-${s.kind}"><span class="cost-name">${esc(label)}</span>`
      + `<span class="cost-track" aria-hidden="true"><span class="bridge-bar" style="left:${((lo / scale) * 100).toFixed(2)}%;width:${Math.max(0.4, (w / scale) * 100).toFixed(2)}%"></span></span>`
      + `<span class="cost-amt" aria-hidden="true">${value}</span><span class="sr-only">${esc(say)}</span></li>`;
  }).join('');
  const legend = '<p class="bridge-legend" aria-hidden="true"><span class="sw sw-total"></span> total <span class="sw sw-down"></span> saves <span class="sw sw-up"></span> costs more</p>';
  return `${legend}<ol class="bridge" aria-label="From your design's materials to the cheapest passing design, by assembly">${rows}</ol>`
    + `<p class="muted cost-foot">${br.saving >= 0.005 ? `${money(br.saving)} less in materials` : br.saving <= -0.005 ? `${money(-br.saving)} more in materials, saved back in your time` : 'No change in materials'}. Each step is one assembly's change between the two designs, savings first.</p>`;
}

// ---------- page wiring ----------

/** @type {{ b: Breakdown | null, by: 'assemblies' | 'materials', open: Set<string>, off: number, last: { index: number, name: string, b: Breakdown } | null }} */
const view = { b: null, by: 'assemblies', open: new Set(), off: 0, last: null };

const $ = (s) => /** @type {HTMLElement} */ (document.querySelector(s));

/**
 * Draw the tab and the summary's "last change" line for this render.
 * @param {any} shed @param {any} est @param {{ index: number, name: string, off?: number }} who
 */
export function showCosts(shed, est, who) {
  const b = costBreakdown(shed, est);
  view.b = b;
  view.off = who.off || 0;
  const chart = $('#cost-chart');
  if (chart) chart.innerHTML = breakdownHtml(b, view.by, view.open, view.off);
  const out = $('#cost-delta');
  const last = view.last;
  if (out && last && Math.abs(last.b.total - b.total) >= 0.005) {
    const lead = last.index === who.index ? 'Last change' : `Against "${last.name}"`;
    out.textContent = deltaSentence(last.b, b, lead);
    const change = $('#cost-change');
    if (change) change.textContent = out.textContent;
  } else if (out && last && last.index !== who.index) {
    out.textContent = '';
  }
  view.last = { index: who.index, name: who.name, b };
  return b;
}

/** Wire the view switch, the rows, the hover tip, print and the bridge button once. @param {{ runBudget: () => { from: Breakdown, to: Breakdown } | null, print: (what: string) => void }} hooks */
export function wireCosts(hooks) {
  const chart = $('#cost-chart');
  if (!chart) return;
  for (const btn of document.querySelectorAll('[data-cost-by]')) {
    btn.addEventListener('click', () => {
      view.by = /** @type {any} */ (btn).dataset.costBy;
      view.open.clear();
      for (const o of document.querySelectorAll('[data-cost-by]')) o.setAttribute('aria-pressed', String(o === btn));
      if (view.b) chart.innerHTML = breakdownHtml(view.b, view.by, view.open, view.off);
    });
  }
  chart.addEventListener('click', (e) => {
    const row = /** @type {HTMLElement} */ (e.target).closest?.('button.cost-row');
    if (!row) return;
    const li = /** @type {HTMLElement} */ (row.parentElement);
    const key = li.dataset.cost || '';
    const opened = row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', String(opened));
    /** @type {HTMLElement} */ (li.querySelector('.cost-lines')).hidden = !opened;
    if (opened) view.open.add(key); else view.open.delete(key);
    tip.hidden = true;
  });
  // Hover (mouse or pen) shows a row's biggest lines; a tap or Enter opens them all.
  const tip = $('#cost-tip');
  chart.addEventListener('pointerover', (e) => {
    if (/** @type {PointerEvent} */ (e).pointerType === 'touch' || !view.b) return;
    const li = /** @type {HTMLElement} */ (e.target).closest?.('li[data-cost]');
    if (!li || li.querySelector('.cost-row')?.getAttribute('aria-expanded') === 'true') { tip.hidden = true; return; }
    tip.innerHTML = tipHtml(view.b, view.by, /** @type {HTMLElement} */ (li).dataset.cost || '');
    const r = li.getBoundingClientRect();
    const host = /** @type {HTMLElement} */ (chart.offsetParent || document.body).getBoundingClientRect();
    tip.style.top = `${r.bottom - host.top + 4}px`;
    tip.style.left = `${Math.max(0, Math.min(r.left - host.left + 40, host.width - 300))}px`;
    tip.hidden = false;
  });
  chart.addEventListener('pointerleave', () => { tip.hidden = true; });
  $('#cost-print')?.addEventListener('click', () => hooks.print('costs'));
  $('#cost-bridge-run')?.addEventListener('click', () => {
    const btn = /** @type {HTMLButtonElement} */ ($('#cost-bridge-run'));
    btn.disabled = true;
    $('#cost-bridge').innerHTML = '<p class="muted">Pricing and checking the alternatives...</p>';
    setTimeout(() => {
      const r = hooks.runBudget();
      $('#cost-bridge').innerHTML = !r ? '<p>Nothing cheaper passed every check: your design is already the cheapest the search found.</p>' : bridgeHtml(r.from, r.to);
      btn.disabled = false;
    }, 30);
  });
}
