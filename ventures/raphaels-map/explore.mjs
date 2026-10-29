// @ts-check
// Explore: county choropleth with a metric switcher, a state picker, and a
// side panel that traces the selected value back to its source file.
// Areas only; no person markers of any kind.
import { isMissing, loadCore, metricIndex, sourceIndex, countyIndex, statesWithCounties } from './data.mjs';
import { esc, obsText, num, moe, flagBadges, classBadge, emptyState, vintageLine, vintageHtml, acronyms, metricLabel, missingReason, isNum } from './format.mjs';
import { renderMap } from './map.mjs';
import { observedMetricIds } from './rank.mjs';

const PREFERRED = ['women_20_24', 'women_25_29', 'never_married_women_20_24', 'never_married_women_20_29', 'catholic_adherents', 'catholic_adherents_per_1000', 'public_venues'];

/** The trace from source to displayed value, as label/value pairs. */
export function traceSteps(metric, source, o) {
  const m = metric || {};
  const s = source || {};
  const files = (s.files || []).slice(0, 3).map((f) => f.url).filter(Boolean);
  const denomFlags = ((o && o.flags) || []).filter((f) => f === 'denominator_all_ages' || f === 'vintage_mismatch');
  return [
    { k: 'Source', v: s.title ? `${s.title}${s.provider ? `, ${s.provider}` : ''}` : `Not in the source register (${m.source_id || 'unknown'})`, href: s.landing_url },
    { k: 'Version', v: [s.dataset_version && `version ${s.dataset_version}`, s.reference_period && `period ${s.reference_period}`, s.retrieved_at && `retrieved ${String(s.retrieved_at).slice(0, 10)}`, s.status && `status ${s.status}`].filter(Boolean).join(', ') || 'Not stated' },
    { k: 'File or API', v: files.length ? files.join(' ; ') : 'No file recorded', href: files[0] },
    { k: 'Transform', v: [m.method, m.source_variable_ids && m.source_variable_ids.length ? `variables ${m.source_variable_ids.join(', ')}` : ''].filter(Boolean).join('; ') || 'Not stated' },
    { k: 'Denominator / universe', v: `${m.universe || 'Not stated'}${denomFlags.length ? ` (${denomFlags.map((f) => (f === 'denominator_all_ages' ? 'denominator is all ages' : 'numerator and denominator from different years')).join('; ')})` : ''}` },
    { k: 'Value', v: o && isNum(o.e) ? obsText(o, m.unit) : `Not available: ${missingReason(o)}` },
  ];
}

let rootEl = null;
export async function mount(el, ctx) {
  rootEl = el;
  el.innerHTML = '<div class="loading">Loading map…</div>';
  await update(ctx);
}

export async function update(ctx) {
  const el = rootEl;
  if (!el) return;
  const core = await loadCore(ctx.data);
  const ax = acronyms();
  const metricsById = metricIndex(core.metrics);
  const sourcesById = sourceIndex(core.sources);
  const counties = countyIndex(core.geos);
  const states = statesWithCounties(core.geos);
  const p = ctx.state.params;
  const st = p.st || (p.id && /^\d{5}$/.test(p.id) ? p.id.slice(0, 2) : '08');
  const observed = [...observedMetricIds(core.county)];
  const order = [...metricsById.keys()];
  const metricIds = observed.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
  const metric = metricIds.includes(p.m) ? p.m : PREFERRED.find((m) => metricIds.includes(m)) || metricIds[0] || p.m || 'women_20_24';
  const def = metricsById.get(metric) || {};
  const selected = p.id && counties.has(p.id) ? p.id : null;

  const stateOpts = [...states.map((x) => `<option value="${esc(x.id)}"${x.id === st ? ' selected' : ''}>${esc(x.name)}</option>`), `<option value="us"${st === 'us' ? ' selected' : ''}>All U.S. counties</option>`].join('');
  const metricOpts = metricIds.map((m) => `<option value="${esc(m)}"${m === metric ? ' selected' : ''}>${esc(metricLabel(metricsById, m))}</option>`).join('');

  el.innerHTML = `
  <h2>Explore the map</h2>
  <p class="lede">${esc(ax('County values from published files. Counties without a value are hatched and say "Not available"; they are never coloured as low. Click or press Enter on a county for its raw value, MOE, universe, period and source trace.'))}</p>
  ${vintageHtml(vintageLine(core.county, core.sources))}
  <div class="controls card row">
    <div><label for="ex-st">State</label><select id="ex-st">${stateOpts || '<option>Not available</option>'}</select></div>
    <div><label for="ex-m">Metric</label><select id="ex-m">${metricOpts || '<option>Not available</option>'}</select></div>
  </div>
  <div class="explore">
    <div class="map-col"><div id="ex-map"></div><div id="ex-meta"></div></div>
    <aside class="panel card" id="ex-panel" aria-live="polite"></aside>
  </div>
  <details class="card"><summary>Table view of this map</summary><div id="ex-table"></div></details>`;

  el.querySelector('#ex-st')?.addEventListener('change', (e) => ctx.setState({ params: { st: e.target.value, id: null } }));
  el.querySelector('#ex-m')?.addEventListener('change', (e) => { ctx.record('explore_metric_changed'); ctx.setState({ params: { m: e.target.value } }); });

  const mapEl = /** @type {HTMLElement} */ (el.querySelector('#ex-map'));
  const panel = /** @type {HTMLElement} */ (el.querySelector('#ex-panel'));
  const tableEl = /** @type {HTMLElement} */ (el.querySelector('#ex-table'));
  const metaEl = /** @type {HTMLElement} */ (el.querySelector('#ex-meta'));

  if (isMissing(core.county)) {
    mapEl.innerHTML = emptyState('us/county_observations.json');
    panel.innerHTML = '<p class="muted">Select a county once data are loaded.</p>';
    return;
  }
  const obs = core.county.observations || {};
  const inScope = [...counties.values()].filter((c) => st === 'us' || c.state === st);
  const values = Object.fromEntries(inScope.map((c) => {
    const o = obs[c.id] && obs[c.id][metric];
    return [c.id, o && isNum(o.e) ? o.e : null];
  }));
  const names = Object.fromEntries(inScope.map((c) => [c.id, c.name]));

  const geoPath = st === 'us' ? 'geo/us_counties.json' : `geo/state_${st}.json`;
  const geo = await ctx.data.get(geoPath);
  if (isMissing(geo) || !geo.paths) {
    mapEl.innerHTML = emptyState(geoPath, '<p>The table below still lists every county.</p>');
  } else {
    renderMap(mapEl, {
      geo, values, names, selected, unit: def.unit, title: `${metricLabel(metricsById, metric)} by county`,
      onSelect: (id) => { ctx.record('explore_county_selected'); ctx.setState({ params: { id } }); },
    });
    if (selected) {
      /** @type {HTMLElement|null} */ (mapEl.querySelector(`path[data-id="${CSS.escape(selected)}"]`))?.focus({ preventScroll: true });
    }
  }
  const src = sourcesById.get(def.source_id) || {};
  metaEl.innerHTML = `<p class="chart-meta">${classBadge(def.class)} <strong>${esc(metricLabel(metricsById, metric))}</strong>. Population: ${esc(def.universe || 'not stated')}. Period: ${esc(src.reference_period || 'not stated')}. Source: ${esc(src.title || def.source_id || 'not stated')}. Quantile bins over the counties shown.${def.caveats ? ` ${esc(def.caveats)}` : ''}</p>`;

  tableEl.innerHTML = `<div class="table-scroll"><table class="data compact"><thead><tr><th scope="col">County</th><th scope="col">${esc(metricLabel(metricsById, metric))}</th><th scope="col">Flags</th></tr></thead><tbody>${inScope
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const o = obs[c.id] && obs[c.id][metric];
      return `<tr><th scope="row"><a href="#explore?id=${esc(c.id)}&m=${esc(metric)}&st=${esc(st)}">${esc(c.name)}${st === 'us' ? `, ${esc(c.state_name || '')}` : ''}</a></th><td class="num">${esc(obsText(o, def.unit))}</td><td>${o ? flagBadges(o.flags) : '<span class="badge flag flag-warn">No row</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;

  if (!selected) {
    panel.innerHTML = `<h3>Select a county</h3><p class="muted">Click a county on the map, or tab to it and press Enter. The panel shows its raw value, margin of error, universe, period, source link, flags and the full trace.</p>`;
    return;
  }
  const c = counties.get(selected);
  const row = obs[selected] || null;
  const o = row ? row[metric] : null;
  const steps = traceSteps(def, src, o);
  const others = metricIds.filter((m) => m !== metric).map((m) => {
    const d = metricsById.get(m) || {};
    const x = row ? row[m] : null;
    return `<tr><th scope="row"><a href="#explore?id=${esc(selected)}&m=${esc(m)}&st=${esc(st)}">${esc(metricLabel(metricsById, m))}</a></th><td class="num">${esc(obsText(x, d.unit))}</td><td>${classBadge(d.class)}</td></tr>`;
  }).join('');
  panel.innerHTML = `
    <h3>${esc(c.name)}<span class="sub">${esc(c.state_name || '')} · FIPS ${esc(c.id)}${c.cbsa_name ? ` · ${esc(c.cbsa_name)}` : ''}</span></h3>
    <p class="metric-name">${esc(metricLabel(metricsById, metric))} ${classBadge(def.class)}</p>
    <p class="big">${o && isNum(o.e) ? esc(num(o.e, { unit: def.unit })) : '<span class="na">Not available</span>'} <span class="moe">${esc(moe(o))}</span></p>
    ${o && isNum(o.moe) ? '<p class="hint">Margin of error at 90% confidence, as published.</p>' : ''}
    ${o && !isNum(o.e) ? `<p class="na-reason">${esc(missingReason(o))}</p>` : ''}
    ${!row ? '<p class="na-reason">This county has no row in the published observations.</p>' : ''}
    <p>${o ? flagBadges(o.flags) : ''}</p>
    <dl class="kv"><dt>Universe</dt><dd>${esc(def.universe || 'Not stated')}</dd><dt>Unit</dt><dd>${esc(def.unit || 'Not stated')}</dd><dt>Period</dt><dd>${esc(src.reference_period || 'Not stated')}</dd><dt>Source</dt><dd>${src.landing_url ? `<a href="${esc(src.landing_url)}" rel="noopener">${esc(src.title || def.source_id)}</a>` : esc(def.source_id || 'Not stated')}</dd></dl>
    <h4>Trace</h4>
    <ol class="trace">${steps.map((t) => `<li><span class="k">${esc(t.k)}</span> ${t.href ? `<a href="${esc(t.href)}" rel="noopener">${esc(t.v)}</a>` : esc(t.v)}</li>`).join('')}</ol>
    <p><a class="button" href="#compare?ids=${esc([...new Set([...(ctx.state.prefs.compare || []), selected])].slice(-10).join(','))}">Add to a comparison</a></p>
    <details><summary>All metrics for this county</summary><div class="table-scroll"><table class="data compact"><tbody>${others}</tbody></table></div></details>`;
}
