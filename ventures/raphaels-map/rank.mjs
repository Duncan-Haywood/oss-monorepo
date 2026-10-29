// @ts-check
// Rank view: research priorities (SPEC 6.4). Dimension scores, weight
// sliders with the re-normalised weights shown, two modes, a missing-data
// policy, rank sensitivity, and the reasons behind each position.
import { isMissing, loadCore, metricIndex, sourceIndex, countyIndex, statesWithCounties, milesBetween } from './data.mjs';
import { esc, obsText, missingReason, flagBadges, emptyState, vintageLine, vintageHtml, acronyms, metricLabel } from './format.mjs';
import {
  DIMENSIONS, PROXY_DIMENSION, DIMENSION_LABELS, DIMENSION_HELP, MODES, AGE_BANDS,
  availableBands, scoreAreas, rankSensitivity, explainRow, renormalise, proxyMetricIds,
} from './score.mjs';
import { toReportCSV, toReportMarkdown, download } from './export.mjs';

/** Every metric id that appears in any observation row. */
export function observedMetricIds(countyObs) {
  const ids = new Set();
  if (isMissing(countyObs)) return ids;
  for (const row of Object.values(countyObs.observations || {})) for (const k of Object.keys(row || {})) ids.add(k);
  return ids;
}

/**
 * Candidate county ids: one state (or 'us' for all), optionally within a
 * straight-line radius of an origin county's centre.
 */
export function candidateIds(geos, countyObs, { st = '08', origin = null, radius = null } = {}) {
  if (isMissing(geos)) return [];
  const byId = countyIndex(geos);
  let list = (geos.counties || []).filter((c) => st === 'us' || c.state === st);
  if (origin && radius && byId.has(origin)) {
    const o = byId.get(origin);
    list = list.filter((c) => {
      const d = milesBetween(o, c);
      return d !== null && d <= radius;
    });
  }
  return list.map((c) => c.id).sort();
}

/** Effective settings: shared-link params override stored preferences. */
export function effectiveSettings(state) {
  const p = state.prefs;
  const q = state.params || {};
  const weights = { ...p.weights };
  if (q.w) {
    const parts = q.w.split(',').map(Number);
    [...DIMENSIONS, PROXY_DIMENSION].forEach((d, i) => { if (Number.isFinite(parts[i])) weights[d] = Math.min(1, Math.max(0, parts[i] / 100)); });
  }
  return {
    st: q.st || '08',
    band: AGE_BANDS.some((b) => b.id === q.band) ? q.band : p.band,
    mode: q.mode in MODES ? q.mode : p.mode,
    weights,
    minDims: [1, 2, 3, 4].includes(Number(q.min)) ? Number(q.min) : p.minDims,
    normalization: p.normalization,
    includeProxies: q.proxies === '1' ? true : p.includeProxies,
    origin: p.origin,
    radius: p.radius,
    delta: [0.05, 0.1, 0.2].includes(Number(q.delta)) ? Number(q.delta) : 0.1,
  };
}

/** Load everything a ranking needs and compute it. */
export async function computeRanking(ctx, s) {
  const core = await loadCore(ctx.data);
  const metricsById = metricIndex(core.metrics);
  const names = Object.fromEntries([...countyIndex(core.geos)].map(([id, c]) => [id, c.name + (s.st === 'us' ? `, ${c.state_name || c.state}` : '')]));
  if (isMissing(core.county) || isMissing(core.geos)) return { core, metricsById, names, ids: [], result: null, sens: null, bands: [] };
  const observed = observedMetricIds(core.county);
  const bands = availableBands(observed);
  const band = bands.some((b) => b.id === s.band) ? s.band : (bands[0] && bands[0].id) || s.band;
  const ids = candidateIds(core.geos, core.county, s).filter((id) => core.county.observations[id]);
  const input = {
    ids, observations: core.county.observations, metricsById, band, mode: s.mode,
    normalization: s.normalization, includeProxies: s.includeProxies,
    proxyMetrics: proxyMetricIds(metricsById).filter((m) => observed.has(m)),
    weights: s.includeProxies ? s.weights : { ...s.weights, [PROXY_DIMENSION]: 0 }, minDims: s.minDims,
  };
  const result = scoreAreas(input);
  const sens = rankSensitivity(result.computed, { weights: input.weights, minDims: s.minDims, delta: s.delta });
  return { core, metricsById, names, ids, result, sens, bands, band, missingIds: candidateIds(core.geos, core.county, s).filter((id) => !core.county.observations[id]) };
}

const pctW = (w) => `${Math.round(w * 100)}%`;

/** A small rank-range strip: base rank dot over the min–max range. */
function rangeSVG(s, n) {
  if (!s || s.base === null || !n) return '<span class="muted">Not ranked</span>';
  const W = 90, x = (r) => 4 + ((r - 1) / Math.max(1, n - 1)) * (W - 8);
  const lo = s.min ?? s.base, hi = s.max ?? s.base;
  return `<svg class="range" viewBox="0 0 ${W} 14" width="${W}" height="14" role="img" aria-label="Rank ${s.base}; between ${lo} and ${hi} under the weight changes"><line x1="4" y1="7" x2="${W - 4}" y2="7" class="range-axis"/><line x1="${x(lo)}" y1="7" x2="${x(hi)}" y2="7" class="range-span"/><circle cx="${x(s.base)}" cy="7" r="4" class="range-dot"/></svg> <span class="range-text">${lo === hi ? 'stable' : `${lo}–${hi}`}</span>`;
}

function weightsSummary(weights, dims) {
  const active = dims.filter((d) => (weights[d] || 0) > 0);
  const w = renormalise(weights, active);
  if (!w) return 'All weights are zero: nothing can be ranked.';
  return active.map((d) => `${DIMENSION_LABELS[d]} ${pctW(w[d])}`).join(' · ');
}

let rootEl = null;

export async function mount(el, ctx) {
  rootEl = el;
  el.innerHTML = '<div class="loading">Loading research priorities…</div>';
  await update(ctx);
}

export async function update(ctx) {
  const el = rootEl;
  if (!el) return;
  const s = effectiveSettings(ctx.state);
  const r = await computeRanking(ctx, s);
  const ax = acronyms();
  const states = statesWithCounties(r.core.geos);
  const dims = s.includeProxies ? [...DIMENSIONS, PROXY_DIMENSION] : DIMENSIONS;
  // Open on wide screens; on phones the results come first and settings fold away.
  const prevOpen = el.querySelector('#rank-settings');
  const settingsOpen = prevOpen ? prevOpen.hasAttribute('open') : !(typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches);

  const stateOptions = [`<option value="us"${s.st === 'us' ? ' selected' : ''}>All U.S. counties</option>`, ...states.map((x) => `<option value="${esc(x.id)}"${x.id === s.st ? ' selected' : ''}>${esc(x.name)}</option>`)].join('');
  const bandOptions = (r.bands.length ? r.bands : AGE_BANDS).map((b) => `<option value="${b.id}"${b.id === (r.band || s.band) ? ' selected' : ''}>${b.label}</option>`).join('');
  const originOptions = ['<option value="">No origin</option>', ...[...countyIndex(r.core.geos).values()].filter((c) => s.st === 'us' || c.state === s.st).map((c) => `<option value="${esc(c.id)}"${c.id === s.origin ? ' selected' : ''}>${esc(c.name)}</option>`)].join('');

  const sliders = dims.map((d) => `
    <div class="slider${d === PROXY_DIMENSION ? ' proxy' : ''}">
      <label for="w-${d}">${esc(DIMENSION_LABELS[d])} <output id="o-${d}">${Math.round((s.weights[d] || 0) * 100)}</output></label>
      <input type="range" id="w-${d}" data-dim="${d}" min="0" max="100" step="5" value="${Math.round((s.weights[d] || 0) * 100)}">
      <p class="hint">${esc(ax(DIMENSION_HELP[d]))}</p>
    </div>`).join('');

  const controls = `
  <details class="card settings" id="rank-settings"${settingsOpen ? ' open' : ''}><summary>Settings: ${esc(MODES[s.mode].label)}, women ${esc((AGE_BANDS.find((b) => b.id === (r.band || s.band)) || {}).label || '')}, ${esc(weightsSummary(s.weights, dims))}</summary>
  <form class="controls" id="rank-controls" onsubmit="return false">
    <div class="grid">
      <div><label for="rank-st">Area</label><select id="rank-st">${stateOptions}</select></div>
      <div><label for="rank-band">Women's age band</label><select id="rank-band">${bandOptions}</select><p class="hint">Only bands the published tables support. Adults only.</p></div>
      <div><label for="rank-min">Minimum dimensions with data</label><select id="rank-min">${[1, 2, 3, 4].map((n) => `<option${n === s.minDims ? ' selected' : ''}>${n}</option>`).join('')}</select><p class="hint">Areas with fewer are listed but not ranked.</p></div>
      <div><label for="rank-norm">Normalisation</label><select id="rank-norm"><option value="percentile"${s.normalization === 'percentile' ? ' selected' : ''}>Percentile among areas compared</option><option value="log_minmax"${s.normalization === 'log_minmax' ? ' selected' : ''}>Log scale, min to max</option></select></div>
    </div>
    <fieldset class="modes"><legend>Research mode</legend>
      ${Object.entries(MODES).map(([k, m]) => `<label class="check"><input type="radio" name="mode" value="${k}"${k === s.mode ? ' checked' : ''}> <span><strong>${esc(m.label)}</strong>. ${esc(m.help)}</span></label>`).join('')}
    </fieldset>
    <div class="sliders">${sliders}</div>
    <p class="weights-line"><strong>Weights after re-normalising:</strong> <span id="weights-summary">${esc(weightsSummary(s.weights, dims))}</span>. Each area re-normalises again over the dimensions it actually has.</p>
    <label class="check"><input type="checkbox" id="rank-proxies"${s.includeProxies ? ' checked' : ''}> <span>Include unvalidated hypotheses (for example county vote share). <span class="badge cls cls-unvalidated_hypothesis">Unvalidated hypothesis</span> They have not been tested against the outcome and are off by default.</span></label>
    <div class="grid">
      <div><label for="rank-origin">Origin county (optional)</label><select id="rank-origin">${originOptions}</select></div>
      <div><label for="rank-radius">Radius, miles</label><input id="rank-radius" type="number" min="1" max="3000" step="1" inputmode="numeric" value="${s.radius ?? ''}" placeholder="Any distance"><p class="hint">Straight-line distance between county centres, not travel time.</p></div>
      <div><label for="rank-delta">Sensitivity test</label><select id="rank-delta">${[0.05, 0.1, 0.2].map((d) => `<option value="${d}"${d === s.delta ? ' selected' : ''}>Each weight ± ${Math.round(d * 100)}</option>`).join('')}</select></div>
    </div>
    <p><button type="button" id="rank-reset" class="secondary">Reset weights to this mode's defaults</button></p>
  </form></details>`;

  let body = '';
  if (isMissing(r.core.county)) body = emptyState('us/county_observations.json');
  else if (isMissing(r.core.geos)) body = emptyState('us/geographies.json');
  else if (!r.ids.length) body = `<div class="empty" role="status"><p>No counties match this area${s.origin && s.radius ? ' and radius' : ''}. Widen the radius or pick another area; your settings are kept.</p></div>`;
  else body = resultsHTML(r, s, dims, ax);

  el.innerHTML = `
  <h2>Research priorities</h2>
  <p class="lede">${esc(ax('A user-weighted index of where to look further, computed only over the dimensions each county has. It is not a probability of meeting anyone and says nothing about any individual. Built from ACS county estimates and the U.S. Religion Census.'))}</p>
  ${vintageHtml(vintageLine(r.core.county, r.core.sources))}
  ${controls}
  ${body}`;
  wire(el, ctx, s, r);
}

function resultsHTML(r, s, allDims, ax) {
  const rows = r.result.rows;
  // A dimension with zero weight and no data anywhere is a column of "Not available"; the note above says so instead.
  const dims = allDims.filter((d) => (s.weights[d] || 0) > 0 || rows.some((x) => x.dims[d].score !== null));
  const n = rows.filter((x) => x.rank !== null).length;
  const label = (id) => metricLabel(r.metricsById, id);
  const bandLabel = (AGE_BANDS.find((b) => b.id === r.band) || {}).label || r.band;
  const notes = [];
  if (r.result.notes.includes('values_evidence_unavailable')) {
    notes.push(s.mode === 'concentrated'
      ? 'Sufficient direct values evidence is unavailable at county level: no survey publishes comparable values estimates for counties. The values dimension is left out (not scored as zero) and the ranking rests on shares and densities.'
      : 'Values evidence is unavailable at county level and is left out, not counted as zero.');
  }
  if (r.missingIds && r.missingIds.length) notes.push(`${r.missingIds.length} count${r.missingIds.length === 1 ? 'y has' : 'ies have'} no row in the published observations and ${r.missingIds.length === 1 ? 'is' : 'are'} not listed.`);
  if (s.includeProxies) notes.push('Unvalidated hypotheses are switched on. Their dimension is labelled; treat any rank change they cause as exploratory.');

  const SHORT = { demographic_capacity: 'Demographic', catholic_ecosystem: 'Catholic', meeting_access: 'Access', values_evidence: 'Values', exploratory_proxies: 'Proxies (unvalidated)' };
  const th = (short, full) => `<th scope="col"${full && full !== short ? ` title="${esc(full)}"` : ''}>${esc(short)}</th>`;
  const rawLabels = { women: `Women ${bandLabel}`, nm: `Never married ${bandLabel}`, cath: 'Catholic adherents', venues: 'Public venues' };
  const head = `<tr>${th('Rank')}${th('Area')}${th('Index', 'Research priority index, 0–100')}${th('Coverage', 'Weighted dimensions with data')}${dims.map((d) => th(SHORT[d], DIMENSION_LABELS[d])).join('')}${th(rawLabels.women)}${th(rawLabels.nm)}${th(rawLabels.cath)}${th(rawLabels.venues)}${th(`Rank under ± ${Math.round(s.delta * 100)}`)}</tr>`;
  const obs = r.core.county.observations;
  const trs = rows.map((row) => {
    const o = obs[row.id] || {};
    const why = explainRow(row, label, n).map((l) => `<li>${esc(l)}</li>`).join('');
    const dimCells = dims.map((d) => {
      const x = row.dims[d];
      return `<td class="num" data-label="${esc(DIMENSION_LABELS[d])}">${x.score === null ? '<span class="na">Not available</span>' : Math.round(x.score)}${x.total && x.score !== null && x.available < x.total ? `<span class="sub">${x.available} of ${x.total} parts</span>` : ''}</td>`;
    }).join('');
    const raw = (m, lab) => {
      const x = o[m];
      const fl = x ? (x.flags || []).filter((f) => f !== 'moe_approx' && f !== 'derived' && !(x.e === null && (f === 'not_published' || f === 'not_ingested'))) : [];
      return `<td class="num raw" data-label="${esc(lab)}">${x && x.e !== null ? esc(obsText(x, (r.metricsById.get(m) || {}).unit)) : `<span class="na" title="${esc(missingReason(x))}">Not available</span>`}${fl.length ? ` ${flagBadges(fl)}` : ''}</td>`;
    };
    return `<tr class="${row.rank === null ? 'unranked' : ''}">
      <td class="num rank-no" data-label="Rank">${row.rank ?? '—'}</td>
      <th scope="row"><a href="#explore?id=${esc(row.id)}&st=${esc(row.id.slice(0, 2))}">${esc(r.names[row.id] || row.id)}</a><details><summary>Why here</summary><ul>${why}</ul></details></th>
      <td class="num strong" data-label="Index">${row.index === null ? '<span class="na">Not ranked</span>' : row.index.toFixed(1)}</td>
      <td data-label="Coverage">${row.coverage.scored} of ${row.coverage.considered}</td>
      ${dimCells}${raw(`women_${r.band}`, rawLabels.women)}${raw(`never_married_women_${r.band}`, rawLabels.nm)}${raw('catholic_adherents', rawLabels.cath)}${raw('public_venues', rawLabels.venues)}
      <td data-label="Rank under ± ${Math.round(s.delta * 100)}">${rangeSVG(r.sens.get(row.id), n)}</td></tr>`;
  }).join('');
  const top = rows.filter((x) => x.rank !== null).slice(0, 5).map((x) => x.id);
  return `
  ${notes.length ? `<div class="notes" role="note">${notes.map((x) => `<p>${esc(ax(x))}</p>`).join('')}</div>` : ''}
  <p class="summary">${n} of ${rows.length} areas ranked. Scores are relative to the areas compared here. Raw counts sit next to every score so no scale is hidden.</p>
  <div class="actions">
    ${top.length >= 2 ? `<a class="button" href="#compare?ids=${top.join(',')}">Compare the top ${top.length}</a>` : ''}
    <button type="button" id="rank-csv" class="secondary">Download CSV</button>
    <button type="button" id="rank-md" class="secondary">Download Markdown report</button>
  </div>
  <div class="table-scroll"><table class="data rank-table"><caption>Research priorities, ${esc(MODES[s.mode].label.toLowerCase())}, women ${esc(bandLabel)}</caption><thead>${head}</thead><tbody>${trs}</tbody></table></div>
  <p class="hint">Rank under ±: the range of ranks this area takes when each weighted dimension's weight moves up or down by ${Math.round(s.delta * 100)} points, one at a time. A wide range means the position depends on your weights more than on the data.</p>`;
}

function wire(el, ctx, s, r) {
  const q = (sel) => el.querySelector(sel);
  const dims = s.includeProxies ? [...DIMENSIONS, PROXY_DIMENSION] : DIMENSIONS;
  const wParam = (w) => [...DIMENSIONS, PROXY_DIMENSION].map((d) => Math.round((w[d] || 0) * 100)).join(',');
  q('#rank-st')?.addEventListener('change', (e) => ctx.setState({ params: { st: e.target.value }, prefs: { origin: null } }));
  q('#rank-band')?.addEventListener('change', (e) => { ctx.record('rank_band_changed'); ctx.setState({ params: { band: e.target.value }, prefs: { band: e.target.value } }); });
  q('#rank-min')?.addEventListener('change', (e) => ctx.setState({ params: { min: e.target.value }, prefs: { minDims: Number(e.target.value) } }));
  q('#rank-norm')?.addEventListener('change', (e) => ctx.setState({ prefs: { normalization: e.target.value } }));
  q('#rank-delta')?.addEventListener('change', (e) => ctx.setState({ params: { delta: e.target.value } }));
  q('#rank-origin')?.addEventListener('change', (e) => ctx.setState({ prefs: { origin: e.target.value || null } }));
  q('#rank-radius')?.addEventListener('change', (e) => ctx.setState({ prefs: { radius: e.target.value ? Number(e.target.value) : null } }));
  q('#rank-proxies')?.addEventListener('change', (e) => {
    ctx.record('rank_proxies_toggled');
    ctx.setState({ params: { proxies: e.target.checked ? '1' : null }, prefs: { includeProxies: e.target.checked } });
  });
  el.querySelectorAll('input[name="mode"]').forEach((inp) => inp.addEventListener('change', (e) => {
    const mode = e.target.value;
    ctx.record(`rank_mode_${mode}`);
    const weights = { ...MODES[mode].weights };
    ctx.setState({ params: { mode, w: wParam(weights) }, prefs: { mode, weights } });
  }));
  q('#rank-reset')?.addEventListener('click', () => {
    const weights = { ...MODES[s.mode].weights };
    ctx.setState({ params: { w: wParam(weights) }, prefs: { weights } });
  });
  el.querySelectorAll('input[type="range"][data-dim]').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const d = e.target.getAttribute('data-dim');
      const out = q(`#o-${d}`);
      if (out) out.textContent = e.target.value;
      const w = { ...s.weights };
      el.querySelectorAll('input[type="range"][data-dim]').forEach((x) => { w[x.getAttribute('data-dim')] = Number(x.value) / 100; });
      const sum = q('#weights-summary');
      if (sum) sum.textContent = weightsSummary(w, dims);
    });
    inp.addEventListener('change', () => {
      const w = { ...s.weights };
      el.querySelectorAll('input[type="range"][data-dim]').forEach((x) => { w[x.getAttribute('data-dim')] = Number(x.value) / 100; });
      ctx.record('rank_weights_changed');
      ctx.setState({ params: { w: wParam(w) }, prefs: { weights: w } });
    });
  });
  const report = () => {
    const metricIds = [`women_${r.band}`, `never_married_women_${r.band}`, 'catholic_adherents', 'catholic_adherents_per_1000', 'catholic_congregations', 'public_venues'].filter((m) => r.metricsById.has(m) || r.result.rows.some((x) => r.core.county.observations[x.id][m]));
    const notes = r.result.rows.map((x) => `Rank ${x.rank ?? 'not ranked'}: ${r.names[x.id] || x.id}, index ${x.index === null ? 'not available' : x.index.toFixed(1)}, ${x.coverage.scored} of ${x.coverage.considered} dimensions; ${explainRow(x, (id) => metricLabel(r.metricsById, id)).join(' ')}`);
    notes.unshift(`Mode: ${MODES[s.mode].label}. Weights after re-normalising: ${weightsSummary(s.weights, dims)}. Normalisation: ${s.normalization}. Minimum dimensions: ${s.minDims}.`);
    return {
      areas: r.result.rows.map((x) => ({ id: x.id, name: r.names[x.id] || x.id, kind: 'county', observations: r.core.county.observations[x.id] })),
      metricIds, metricsById: r.metricsById, sourcesById: sourceIndex(r.core.sources), vintage: vintageLine(r.core.county, r.core.sources),
      title: "Raphael's Map: research priorities", generatedAt: new Date().toISOString().slice(0, 10), notes,
    };
  };
  q('#rank-csv')?.addEventListener('click', () => { ctx.record('export_csv'); download('raphaels-map-priorities.csv', toReportCSV(report()), 'text/csv'); });
  q('#rank-md')?.addEventListener('click', () => { ctx.record('export_markdown'); download('raphaels-map-priorities.md', toReportMarkdown(report()), 'text/markdown'); });
}

