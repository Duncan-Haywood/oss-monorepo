// @ts-check
// Compare 2–10 counties or metros: a sortable table, small-multiple bars
// with margins of error, missingness / vintage / unit warnings, and a CSV or
// Markdown export that keeps definitions and citations.
import { isMissing, loadCore, metricIndex, sourceIndex, countyIndex, statesWithCounties } from './data.mjs';
import { esc, obsText, num, flagBadges, classBadge, emptyState, vintageLine, vintageHtml, acronyms, metricLabel, isNum } from './format.mjs';
import { toReportCSV, toReportMarkdown, download } from './export.mjs';

export const MAX_AREAS = 10;

/** Parse "08013,m19740" into area refs. Metros carry an "m" prefix because CBSA codes are also five digits. */
export function parseIds(s) {
  return [...new Set(String(s || '').split(',').map((x) => x.trim()).filter((x) => /^(\d{5}|m\d{5})$/.test(x)))].slice(0, MAX_AREAS);
}

/**
 * Sort areas by a metric. Missing values always sort last, whatever the
 * direction, so "Not available" is never read as the smallest.
 */
export function sortAreas(areas, metric, dir = 'desc') {
  const val = (a) => (a.observations && a.observations[metric] && isNum(a.observations[metric].e) ? a.observations[metric].e : null);
  return areas.slice().sort((a, b) => {
    if (metric === 'name') return dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    const x = val(a), y = val(b);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return dir === 'asc' ? x - y : y - x;
  });
}

/** Warnings about what in this comparison is not comparable or not there. */
export function comparisonWarnings(areas, metricIds, metricsById) {
  const w = [];
  if (areas.length && areas.length < 2) w.push('Add at least one more area to compare.');
  const kinds = new Set(areas.map((a) => a.kind));
  if (kinds.size > 1) w.push('This mixes counties and metros. A metro is its own published unit, not a sum of the counties shown; compare like with like.');
  for (const m of metricIds) {
    const missing = areas.filter((a) => !(a.observations && a.observations[m] && isNum(a.observations[m].e)));
    if (missing.length && missing.length < areas.length) w.push(`${metricLabel(metricsById, m)}: not available for ${missing.map((a) => a.name).join(', ')}.`);
    const vm = areas.filter((a) => a.observations && a.observations[m] && (a.observations[m].flags || []).includes('vintage_mismatch'));
    if (vm.length) w.push(`${metricLabel(metricsById, m)}: numerator and denominator come from different years (vintage mismatch).`);
  }
  return [...new Set(w)];
}

/** Whether the two leading values' 90% intervals overlap (difference not clear). */
export function intervalsOverlap(a, b) {
  if (!a || !b || !isNum(a.e) || !isNum(b.e) || !isNum(a.moe) || !isNum(b.moe)) return false;
  return a.e - a.moe <= b.e + b.moe && b.e - b.moe <= a.e + a.moe;
}

function barsSVG(areas, metric, unit) {
  const vals = areas.map((a) => (a.observations && a.observations[metric]) || null);
  const hi = Math.max(0, ...vals.map((o) => (o && isNum(o.e) ? o.e + (isNum(o.moe) ? o.moe : 0) : 0)));
  const rowH = 22, labelW = 130, W = 420, plotW = W - labelW - 90;
  const H = areas.length * rowH + 4;
  const x = (v) => labelW + (hi > 0 ? (Math.max(0, v) / hi) * plotW : 0);
  const rows = areas.map((a, i) => {
    const o = vals[i];
    const y = i * rowH + 4;
    const name = a.name.length > 20 ? `${a.name.slice(0, 19)}…` : a.name;
    if (!o || !isNum(o.e)) {
      return `<g><text x="${labelW - 6}" y="${y + 12}" class="bar-label" text-anchor="end">${esc(name)}</text><rect x="${labelW}" y="${y + 2}" width="${plotW}" height="12" class="bar-missing"/><text x="${labelW + 6}" y="${y + 12}" class="bar-na">Not available</text></g>`;
    }
    const w = Math.max(1, x(o.e) - labelW);
    const err = isNum(o.moe) ? `<line x1="${x(o.e - o.moe)}" x2="${x(o.e + o.moe)}" y1="${y + 8}" y2="${y + 8}" class="bar-err"/>` : '';
    return `<g><title>${esc(`${a.name}: ${obsText(o, unit)}`)}</title><text x="${labelW - 6}" y="${y + 12}" class="bar-label" text-anchor="end">${esc(name)}</text><rect x="${labelW}" y="${y + 2}" width="${w}" height="12" rx="2" class="bar"/>${err}<text x="${labelW + plotW + 6}" y="${y + 12}" class="bar-value">${esc(num(o.e, { unit }))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="bars" role="img" aria-label="${esc(`Bar chart of ${metric} for the areas compared; the table above has the same values`)}">${rows}</svg>`;
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
  const core = await loadCore(ctx.data);
  const cbsaObs = await ctx.data.get('us/cbsa_observations.json');
  const ax = acronyms();
  const metricsById = metricIndex(core.metrics);
  const counties = countyIndex(core.geos);
  const cbsas = new Map((isMissing(core.geos) ? [] : core.geos.cbsas || []).map((c) => [c.id, c]));
  const p = ctx.state.params;
  const ids = parseIds(p.ids);
  if (JSON.stringify(ids) !== JSON.stringify(ctx.state.prefs.compare || [])) {
    // Remember the shortlist for the Explore page's "Add to a comparison".
    queueMicrotask(() => ctx.setState({ prefs: { compare: ids } }));
  }
  const sortBy = p.sort || 'name';
  const dir = p.dir === 'asc' ? 'asc' : p.dir === 'desc' ? 'desc' : sortBy === 'name' ? 'asc' : 'desc';

  const areas = ids.map((ref) => {
    if (ref.startsWith('m')) {
      const id = ref.slice(1);
      const c = cbsas.get(id);
      return { ref, id, name: c ? c.name : `Metro ${id}`, kind: 'metro', observations: isMissing(cbsaObs) ? null : (cbsaObs.observations || {})[id] || null };
    }
    const c = counties.get(ref);
    return { ref, id: ref, name: c ? `${c.name}${c.state_name ? `, ${c.state_name}` : ''}` : `County ${ref}`, kind: 'county', observations: isMissing(core.county) ? null : (core.county.observations || {})[ref] || null };
  });

  const order = [...metricsById.keys()];
  const present = new Set();
  for (const a of areas) for (const k of Object.keys(a.observations || {})) present.add(k);
  const metricIds = [...present].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  const sorted = sortAreas(areas, sortBy, dir);
  const warnings = comparisonWarnings(areas, metricIds, metricsById);
  if (areas.some((a) => !a.observations)) warnings.unshift(`No published values for ${areas.filter((a) => !a.observations).map((a) => a.name).join(', ')}${isMissing(core.county) ? ' (county statistics not built yet)' : ''}.`);
  if (areas.some((a) => a.kind === 'metro') && isMissing(cbsaObs)) warnings.unshift('Metro statistics have not been built yet.');

  const states = statesWithCounties(core.geos);
  const pickSt = p.pst && states.some((s) => s.id === p.pst) ? p.pst : (ids.find((x) => /^\d/.test(x)) || '08').slice(0, 2);
  const countyOpts = [...counties.values()].filter((c) => c.state === pickSt && !ids.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const metroOpts = [...cbsas.values()].filter((c) => !ids.includes(`m${c.id}`)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="m${esc(c.id)}">${esc(c.name)} (${esc(c.kind || 'metro')})</option>`).join('');

  const sortHead = (key, label) => {
    const active = sortBy === key;
    const next = active && dir === 'desc' ? 'asc' : active ? 'desc' : key === 'name' ? 'asc' : 'desc';
    return `<th scope="col" aria-sort="${active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort" data-sort="${esc(key)}" data-dir="${next}">${esc(label)}${active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
  };
  const table = areas.length
    ? `<div class="table-scroll"><table class="data compare-table"><caption>Areas compared. Values with 90% margins of error where published.</caption><thead><tr>${sortHead('name', 'Area')}${metricIds.map((m) => sortHead(m, metricLabel(metricsById, m))).join('')}<th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>
      ${sorted.map((a) => `<tr><th scope="row">${esc(a.name)}<span class="sub">${a.kind === 'metro' ? 'Metro' : 'County'} ${esc(a.id)}</span></th>${metricIds.map((m) => {
        const o = a.observations ? a.observations[m] : null;
        const d = metricsById.get(m) || {};
        return `<td class="num">${o && isNum(o.e) ? esc(obsText(o, d.unit)) : '<span class="na">Not available</span>'}${o ? `<span class="flags">${flagBadges((o.flags || []).filter((f) => f !== 'moe_approx' && f !== 'derived'))}</span>` : ''}</td>`;
      }).join('')}<td><button type="button" class="link remove" data-ref="${esc(a.ref)}" aria-label="Remove ${esc(a.name)}">Remove</button></td></tr>`).join('')}
      </tbody></table></div>`
    : '';

  const multiples = areas.length >= 1 && metricIds.length
    ? `<h3>Small multiples</h3><p class="hint">One chart per metric, same areas in the same order. Whiskers are 90% margins of error. Hatched rows have no value.</p><div class="multiples">${metricIds.map((m) => {
        const d = metricsById.get(m) || {};
        const lead = sortAreas(areas, m, 'desc');
        const overlap = lead.length >= 2 && intervalsOverlap(lead[0].observations && lead[0].observations[m], lead[1].observations && lead[1].observations[m]);
        return `<figure class="card mini"><figcaption><strong>${esc(metricLabel(metricsById, m))}</strong> ${classBadge(d.class)}<span class="sub">${esc(d.universe || '')}</span>${overlap ? '<span class="sub warn">The two highest values are within each other\'s margins of error.</span>' : ''}</figcaption>${barsSVG(areas, m, d.unit)}</figure>`;
      }).join('')}</div>`
    : '';

  el.innerHTML = `
  <h2>Compare areas</h2>
  <p class="lede">${esc(ax('Pick 2 to 10 counties or metros. Only values from the published files are shown; anything missing says so. Export keeps each definition, citation and vintage.'))}</p>
  ${vintageHtml(vintageLine(core.county, core.sources))}
  <div class="controls card row">
    <div><label for="cmp-st">State</label><select id="cmp-st">${states.map((s) => `<option value="${esc(s.id)}"${s.id === pickSt ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div><label for="cmp-county">County</label><select id="cmp-county"><option value="">Choose a county…</option>${countyOpts}</select></div>
    <div><label for="cmp-metro">Metro or micro area</label><select id="cmp-metro"><option value="">Choose a metro…</option>${metroOpts}</select></div>
  </div>
  ${isMissing(core.geos) ? emptyState('us/geographies.json') : ''}
  ${!areas.length ? '<div class="empty" role="status"><p>No areas chosen yet. Add counties above, use "Add to a comparison" on the map, or "Compare the top 5" on the Rank page.</p></div>' : ''}
  ${ids.length >= MAX_AREAS ? `<p class="hint">At most ${MAX_AREAS} areas.</p>` : ''}
  ${warnings.length ? `<div class="notes" role="note"><strong>Before you compare</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
  ${table}
  ${areas.length ? '<div class="actions"><button type="button" id="cmp-csv">Download CSV</button><button type="button" id="cmp-md" class="secondary">Download Markdown report</button><button type="button" id="cmp-copy" class="secondary">Copy link</button></div>' : ''}
  ${multiples}`;

  const setIds = (next) => ctx.setState({ params: { ids: next.join(',') || null } }, { replace: false });
  el.querySelector('#cmp-st')?.addEventListener('change', (e) => ctx.setState({ params: { pst: e.target.value } }));
  el.querySelector('#cmp-county')?.addEventListener('change', (e) => { if (e.target.value && ids.length < MAX_AREAS) { ctx.record('compare_area_added'); setIds([...ids, e.target.value]); } });
  el.querySelector('#cmp-metro')?.addEventListener('change', (e) => { if (e.target.value && ids.length < MAX_AREAS) { ctx.record('compare_area_added'); setIds([...ids, e.target.value]); } });
  el.querySelectorAll('button.remove').forEach((b) => b.addEventListener('click', () => setIds(ids.filter((x) => x !== b.getAttribute('data-ref')))));
  el.querySelectorAll('button.sort').forEach((b) => b.addEventListener('click', () => ctx.setState({ params: { sort: b.getAttribute('data-sort'), dir: b.getAttribute('data-dir') } })));
  const report = () => ({
    areas: sorted, metricIds, metricsById, sourcesById: sourceIndex(core.sources), vintage: vintageLine(core.county, core.sources),
    title: "Raphael's Map: area comparison", generatedAt: new Date().toISOString().slice(0, 10), notes: warnings,
  });
  el.querySelector('#cmp-csv')?.addEventListener('click', () => { ctx.record('export_csv'); download('raphaels-map-comparison.csv', toReportCSV(report()), 'text/csv'); });
  el.querySelector('#cmp-md')?.addEventListener('click', () => { ctx.record('export_markdown'); download('raphaels-map-comparison.md', toReportMarkdown(report()), 'text/markdown'); });
  el.querySelector('#cmp-copy')?.addEventListener('click', async (e) => {
    const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; } catch { btn.textContent = 'Copy the address bar to share'; }
  });
}
