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
  // The country file's own metric list is the more specific one for country metrics.
  for (const m of file.metrics || []) byId.set(m.metric_id, { ...(byId.get(m.metric_id) || {}), ...m });
  const ids = countryMetricIds(file);
  const all = file.countries || [];
  const withData = ids.filter((m) => all.some((c) => isNum(c.observations?.[m]?.e)));
  const p = ctx.state.params;
  const chosen = p.ms ? p.ms.split(',').filter((m) => ids.includes(m)) : withData.slice(0, 5);
  const sortBy = p.sort && (p.sort === 'name' || chosen.includes(p.sort)) ? p.sort : 'name';
  const sortFn = (a, b) => {
    if (sortBy === 'name') return String(a.name).localeCompare(String(b.name));
    const x = a.observations?.[sortBy]?.e, y = b.observations?.[sortBy]?.e;
    if (!isNum(x) && !isNum(y)) return String(a.name).localeCompare(String(b.name));
    if (!isNum(x)) return 1;
    if (!isNum(y)) return -1;
    return y - x;
  };
  const head = `<tr><th scope="col"><button type="button" class="sort" data-sort="name">Country${sortBy === 'name' ? ' ▲' : ''}</button></th>${chosen.map((m) => {
    const d = byId.get(m) || {};
    return `<th scope="col"><button type="button" class="sort" data-sort="${esc(m)}">${esc(d.label || m)}${sortBy === m ? ' ▼' : ''}</button> ${classBadge(d.class)}</th>`;
  }).join('')}</tr>`;
  const row = (c) => `<tr><th scope="row">${esc(c.name)}<span class="sub">${esc(c.iso3)}</span></th>${chosen.map((m) => {
    const o = c.observations ? c.observations[m] : null;
    const d = byId.get(m) || {};
    const yr = valueYear(o, d);
    const ownClass = o && o.class && o.class !== d.class ? ` ${classBadge(o.class)}` : '';
    const status = o && o.status_label ? `<span class="sub">${esc(o.status_label)}</span>` : '';
    return o && isNum(o.e)
      ? `<td class="num">${esc(num(o.e, { unit: d.unit === 'percent' ? 'percent' : undefined }))}<span class="sub">${yr ? esc(yr) : 'Year not stated'}${o.source_id && o.source_id !== d.source_id ? ` · ${esc(o.source_id)}` : ''}</span>${status}${ownClass}${flagBadges(o.flags)}</td>`
      : `<td><span class="na">Not available</span><span class="sub"${o && o.note ? ` title="${esc(o.note)}"` : ''}>${esc(o && o.source_status === 'gated' ? 'Survey needs registration; not imported' : missingReason(o))}</span></td>`;
  }).join('')}</tr>`;
  const table = (list) => `<div class="table-scroll"><table class="data intl"><thead>${head}</thead><tbody>${list.slice().sort(sortFn).map(row).join('')}</tbody></table></div>`;
  // Group by data availability (SPEC 3) when the file says how.
  const byIso = new Map(all.map((c) => [c.iso3, c]));
  const groups = (file.groups || []).map((g) => ({ ...g, list: (g.countries || []).map((x) => byIso.get(x)).filter(Boolean) })).filter((g) => g.list.length);
  const grouped = new Set(groups.flatMap((g) => g.list.map((c) => c.iso3)));
  const rest = all.filter((c) => !grouped.has(c.iso3));
  const tables = !all.length
    ? '<div class="empty" role="status"><p>No countries in the published file yet.</p></div>'
    : !chosen.length
      ? '<div class="empty" role="status"><p>Choose at least one measure above.</p></div>'
      : groups.length
        ? groups.map((g) => `<section class="intl-group"><h3>Countries with ${esc((g.sources || []).join(' + ') || g.id)} data</h3><p class="hint">${esc(ax(g.description || ''))}</p>${table(g.list)}</section>`).join('') + (rest.length ? `<section class="intl-group"><h3>Other countries</h3>${table(rest)}</section>` : '')
        : table(all);
  const picker = `<fieldset class="card metric-pick"><legend>Measures to show</legend>${ids.map((m) => {
    const d = byId.get(m) || {};
    const has = withData.includes(m);
    return `<label class="check"><input type="checkbox" value="${esc(m)}"${chosen.includes(m) ? ' checked' : ''}> <span>${esc(d.label || m)} ${classBadge(d.class)}${has ? '' : ' <span class="muted">(no values yet)</span>'}</span></label>`;
  }).join('')}</fieldset>`;
  const defs = chosen.map((m) => {
    const d = byId.get(m) || {};
    return `<li><strong>${esc(d.label || m)}</strong> <code>${esc(m)}</code>: ${esc(ax(d.definition || 'Definition not published yet.'))}${d.universe ? ` Universe: ${esc(d.universe)}.` : ''}${d.unit ? ` Unit: ${esc(d.unit)}.` : ''}${d.caveats ? ` ${esc(d.caveats)}` : ''}${d.source_id ? ` Source <code>${esc(d.source_id)}</code>.` : ''}</li>`;
  }).join('');
  el.innerHTML = `${intro}
  ${picker}
  ${tables}
  ${defs ? `<h3>Definitions</h3><ul class="defs">${defs}</ul>` : ''}
  ${file.notes ? `<p class="hint">${esc(ax(String(file.notes)))}</p>` : ''}
  <p class="hint">A country's religious culture is not a claim about any individual. A total fertility rate is births, not desired family size; a crude divorce rate is not the probability that a marriage ends.</p>`;
  el.querySelectorAll('.metric-pick input[type="checkbox"]').forEach((cb) => cb.addEventListener('change', () => {
    const ms = [...el.querySelectorAll('.metric-pick input:checked')].map((x) => x.value);
    ctx.setState({ params: { ms: ms.join(',') || '-' } });
  }));
  el.querySelectorAll('button.sort').forEach((b) => b.addEventListener('click', () => ctx.setState({ params: { sort: b.getAttribute('data-sort') } })));
}
