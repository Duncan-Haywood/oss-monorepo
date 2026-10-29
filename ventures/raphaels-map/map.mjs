// @ts-check
// SVG choropleth from geo/*.json. Quantile bins; a county with no value is
// hatched and labelled "Not available", never coloured as the lowest bin.
// Areas only: this module draws no point markers of any kind.
import { esc, num } from './format.mjs';

/**
 * Quantile break points for k bins over the non-null values. Returns the
 * upper bound of each bin but the last, deduplicated, so fewer distinct
 * values give fewer bins.
 * @param {(number|null|undefined)[]} values
 * @param {number} [k]
 * @returns {number[]}
 */
export function quantileBreaks(values, k = 5) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return [];
  const breaks = [];
  for (let i = 1; i < k; i++) {
    const pos = (v.length - 1) * (i / k);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    const q = v[lo] + (v[hi] - v[lo]) * (pos - lo);
    if (q < v[v.length - 1] && (!breaks.length || q > breaks[breaks.length - 1])) breaks.push(q);
  }
  return breaks;
}

/**
 * Bin index for v: 0..breaks.length; -1 for a missing value.
 * @param {number|null|undefined} v
 * @param {number[]} breaks
 */
export function binOf(v, breaks) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return -1;
  let i = 0;
  while (i < breaks.length && v > breaks[i]) i++;
  return i;
}

/** Legend entries: [{bin, from, to}] plus the missing entry. */
export function legendEntries(values, breaks) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return [];
  const lo = Math.min(...v), hi = Math.max(...v);
  const edges = [lo, ...breaks, hi];
  const out = [];
  for (let i = 0; i < edges.length - 1; i++) out.push({ bin: i, from: edges[i], to: edges[i + 1] });
  return out;
}

/** Spread the bins over 5 colour steps so 3 bins still span light to dark. */
export function colorStep(bin, nBins) {
  if (bin < 0) return -1;
  if (nBins <= 1) return 2;
  return Math.round((bin / (nBins - 1)) * 4);
}

/**
 * Build the SVG markup. Pure; the caller wires events.
 * @param {{
 *   geo: {viewBox: string, paths: Record<string,string>, states?: Record<string,string>},
 *   values: Record<string, number|null>,
 *   names?: Record<string, string>,
 *   selected?: string|null,
 *   unit?: string,
 *   title?: string,
 *   k?: number,
 * }} o
 */
export function choroplethSVG({ geo, values, names = {}, selected = null, unit, title = 'Map', k = 5 }) {
  const ids = Object.keys(geo.paths || {});
  const vals = ids.map((id) => (id in values ? values[id] : null));
  const breaks = quantileBreaks(vals, k);
  const nBins = breaks.length + 1;
  const shapes = ids
    .map((id, i) => {
      const bin = binOf(vals[i], breaks);
      const step = colorStep(bin, nBins);
      const cls = bin < 0 ? 'area missing' : `area q${step}`;
      const name = names[id] || id;
      const valueText = bin < 0 ? 'Not available' : num(vals[i], { unit });
      return `<path d="${esc(geo.paths[id])}" class="${cls}${id === selected ? ' selected' : ''}" data-id="${esc(id)}" tabindex="0" role="button" aria-pressed="${id === selected}" aria-label="${esc(`${name}: ${valueText}`)}"><title>${esc(`${name}: ${valueText}`)}</title></path>`;
    })
    .join('');
  const outline = Object.values(geo.states || {}).map((d) => `<path d="${esc(d)}" class="state-outline"/>`).join('');
  const svg = `<svg class="choropleth" viewBox="${esc(geo.viewBox)}" role="group" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-line"/></pattern></defs>
<g class="areas">${shapes}</g><g class="outlines" pointer-events="none">${outline}</g></svg>`;
  return { svg, breaks, nBins };
}

/** Legend markup for the bins and the hatched missing swatch. */
export function legendHTML(values, breaks, unit, missingCount) {
  const entries = legendEntries(values, breaks);
  const n = entries.length;
  const items = entries
    .map((e) => `<li><span class="swatch q${colorStep(e.bin, n)}"></span>${esc(num(e.from, { unit }))} – ${esc(num(e.to, { unit }))}</li>`)
    .join('');
  const miss = `<li><span class="swatch missing-swatch"></span>Not available${missingCount ? ` (${missingCount})` : ''}</li>`;
  return `<ul class="legend" aria-label="Legend: quantile bins">${items}${miss}</ul>`;
}

/**
 * Render into an element and wire click + keyboard selection.
 * @param {HTMLElement} el
 * @param {Parameters<typeof choroplethSVG>[0] & {onSelect?: (id: string) => void}} o
 */
export function renderMap(el, o) {
  const { svg, breaks } = choroplethSVG(o);
  const ids = Object.keys(o.geo.paths || {});
  const vals = ids.map((id) => (id in o.values ? o.values[id] : null));
  const missing = vals.filter((v) => typeof v !== 'number' || !Number.isFinite(v)).length;
  el.innerHTML = `<div class="map-wrap">${svg}</div>${legendHTML(vals, breaks, o.unit, missing)}`;
  const pick = (t) => {
    const p = t && t.closest ? t.closest('path[data-id]') : null;
    if (p && o.onSelect) o.onSelect(p.getAttribute('data-id'));
  };
  el.querySelector('svg')?.addEventListener('click', (ev) => pick(ev.target));
  el.querySelector('svg')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      pick(ev.target);
    }
  });
}
