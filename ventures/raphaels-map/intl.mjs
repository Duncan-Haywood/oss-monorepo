// @ts-check
// International: country-level table only, with the year of every value and
// an explicit state for every missing one. Travel, language and meeting
// opportunities are a separate question from these statistics.
import { isMissing, metricIndex } from './data.mjs';
import { esc, num, flagBadges, classBadge, emptyState, acronyms, missingReason, isNum } from './format.mjs';

/** Metric ids present in any country, in first-seen order. */
export function countryMetricIds(file) {
  const ids = [];
  for (const c of (file && file.countries) || []) for (const k of Object.keys(c.observations || {})) if (!ids.includes(k)) ids.push(k);
  return ids;
}

/** The year a value refers to: its own year/period, else the metric's, else null. */
export function valueYear(o, def) {
  if (o && (o.year || o.period)) return String(o.year || o.period);
  if (def && (def.year || def.period)) return String(def.year || def.period);
  return null;
}

let rootEl = null;
export async function mount(el, ctx) {
  rootEl = el;
  el.innerHTML = '<div class="loading">Loading…</div>';
  await update(ctx);
}

export async function update(ctx) {
  const el = rootEl;
  if (!el) return;
  const [file, metrics] = await Promise.all([ctx.data.get('intl/countries.json'), ctx.data.get('metrics.json')]);
  const ax = acronyms();
  const intro = `<h2>International comparison</h2><p class="lede">${esc(ax('Country-level values only, because survey samples rarely support city estimates. Each value carries its own year; surveys from different years are not treated as contemporaneous. Travel, language and real chances to meet people are separate questions this table does not answer.'))}</p>`;
  if (isMissing(file)) {
    el.innerHTML = intro + emptyState('intl/countries.json');
    return;
  }
  const byId = metricIndex(metrics);
  for (const m of file.metrics || []) if (!byId.has(m.metric_id)) byId.set(m.metric_id, m);
  const ids = countryMetricIds(file);
  const sortBy = ctx.state.params.sort || 'name';
  const countries = (file.countries || []).slice().sort((a, b) => {
    if (sortBy === 'name') return String(a.name).localeCompare(String(b.name));
    const x = a.observations?.[sortBy]?.e, y = b.observations?.[sortBy]?.e;
    if (!isNum(x) && !isNum(y)) return String(a.name).localeCompare(String(b.name));
    if (!isNum(x)) return 1;
    if (!isNum(y)) return -1;
    return y - x;
  });
  const head = `<tr><th scope="col"><button type="button" class="sort" data-sort="name">Country${sortBy === 'name' ? ' ▲' : ''}</button></th>${ids.map((m) => {
    const d = byId.get(m) || {};
    return `<th scope="col"><button type="button" class="sort" data-sort="${esc(m)}">${esc(ax(d.label || m))}${sortBy === m ? ' ▼' : ''}</button> ${classBadge(d.class)}</th>`;
  }).join('')}</tr>`;
  const rows = countries.map((c) => `<tr><th scope="row">${esc(c.name)}<span class="sub">${esc(c.iso3)}</span></th>${ids.map((m) => {
    const o = c.observations ? c.observations[m] : null;
    const d = byId.get(m) || {};
    const yr = valueYear(o, d);
    return o && isNum(o.e)
      ? `<td class="num">${esc(num(o.e, { unit: d.unit }))}<span class="sub">${yr ? esc(yr) : 'Year not stated'}</span>${flagBadges(o.flags)}</td>`
      : `<td><span class="na">Not available</span><span class="sub">${esc(missingReason(o))}</span>${o ? flagBadges(o.flags) : ''}</td>`;
  }).join('')}</tr>`).join('');
  const defs = ids.map((m) => {
    const d = byId.get(m) || {};
    return `<li><strong>${esc(ax(d.label || m))}</strong> <code>${esc(m)}</code>: ${esc(ax(d.definition || 'Definition not published yet.'))}${d.source_id ? ` Source <code>${esc(d.source_id)}</code>.` : ''}</li>`;
  }).join('');
  el.innerHTML = `${intro}
  ${!countries.length ? '<div class="empty" role="status"><p>No countries in the published file yet.</p></div>' : `<div class="table-scroll"><table class="data intl"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`}
  ${defs ? `<h3>Definitions</h3><ul class="defs">${defs}</ul>` : ''}
  ${file.notes ? `<p class="hint">${esc(ax(String(file.notes)))}</p>` : ''}
  <p class="hint">A country's religious culture is not a claim about any individual. A total fertility rate is births, not desired family size; a crude divorce rate is not the probability that a marriage ends.</p>`;
  el.querySelectorAll('button.sort').forEach((b) => b.addEventListener('click', () => ctx.setState({ params: { sort: b.getAttribute('data-sort') } })));
}
