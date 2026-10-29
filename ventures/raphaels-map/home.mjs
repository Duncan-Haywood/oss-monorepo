// @ts-check
// Home: what is loaded, and the top areas for further research in the
// default view (Colorado, state 08, unless the URL says otherwise).
import { isMissing, statesWithCounties } from './data.mjs';
import { esc, emptyState, vintageLine, vintageHtml, acronyms, obsText, metricLabel } from './format.mjs';
import { computeRanking, effectiveSettings } from './rank.mjs';
import { MODES, AGE_BANDS } from './score.mjs';

const STATUS_LABEL = { ingested: 'Imported', not_ingested: 'Not imported yet', gated: 'Needs registration', failed: 'Download failed' };

let rootEl = null;
export async function mount(el, ctx) {
  rootEl = el;
  el.innerHTML = '<div class="loading">Loading…</div>';
  await update(ctx);
}

export async function update(ctx) {
  const el = rootEl;
  if (!el) return;
  const s = effectiveSettings(ctx.state);
  const r = await computeRanking(ctx, s);
  const ax = acronyms();
  const { sources, county, geos } = r.core;

  let sourcesHTML;
  if (isMissing(sources)) sourcesHTML = emptyState('sources.json');
  else {
    const list = sources.sources || [];
    const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, list.filter((x) => x.status === k).length]));
    sourcesHTML = `
      <p>${counts.ingested} of ${list.length} sources imported${counts.not_ingested ? `, ${counts.not_ingested} not imported yet` : ''}${counts.gated ? `, ${counts.gated} needing registration` : ''}${counts.failed ? `, ${counts.failed} failed to download` : ''}.</p>
      <div class="table-scroll"><table class="data compact"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Reference period</th><th scope="col">Retrieved</th></tr></thead><tbody>
      ${list.map((x) => `<tr><th scope="row"><a href="${esc(x.landing_url)}" rel="noopener">${esc(ax(x.title))}</a></th><td><span class="badge status status-${esc(x.status)}">${esc(STATUS_LABEL[x.status] || x.status)}</span></td><td>${esc(x.reference_period || 'Not stated')}</td><td>${esc((x.retrieved_at || '').slice(0, 10) || 'Not retrieved')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  let coverage = '';
  if (!isMissing(county) && !isMissing(geos)) {
    const obs = county.observations || {};
    const withData = Object.values(obs).filter((row) => Object.values(row || {}).some((o) => o && typeof o.e === 'number')).length;
    coverage = `<p>${withData.toLocaleString('en-US')} of ${(geos.counties || []).length.toLocaleString('en-US')} counties have at least one published value.</p>`;
  }

  const states = statesWithCounties(geos);
  const stName = s.st === 'us' ? 'all U.S. counties' : (states.find((x) => x.id === s.st) || {}).name || `state ${s.st}`;
  let topHTML;
  if (isMissing(county)) topHTML = emptyState('us/county_observations.json');
  else if (isMissing(geos)) topHTML = emptyState('us/geographies.json');
  else if (!r.result || !r.ids.length) topHTML = `<div class="empty" role="status"><p>No counties with published values in ${esc(stName)} yet.</p></div>`;
  else {
    const bandLabel = (AGE_BANDS.find((b) => b.id === r.band) || {}).label || r.band;
    const ranked = r.result.rows.filter((x) => x.rank !== null).slice(0, 10);
    const unit = (m) => (r.metricsById.get(m) || {}).unit;
    topHTML = ranked.length
      ? `<ol class="toplist">${ranked.map((x) => {
          const o = county.observations[x.id] || {};
          return `<li><a href="#explore?id=${esc(x.id)}&st=${esc(x.id.slice(0, 2))}"><strong>${esc(r.names[x.id] || x.id)}</strong></a>
            <span class="meta">Index ${x.index.toFixed(1)} · ${x.coverage.scored} of ${x.coverage.considered} dimensions with data</span>
            <span class="meta">${esc(metricLabel(r.metricsById, `women_${r.band}`))}: ${esc(obsText(o[`women_${r.band}`], unit(`women_${r.band}`)))} · ${esc(metricLabel(r.metricsById, 'catholic_adherents'))}: ${esc(obsText(o.catholic_adherents, unit('catholic_adherents')))}</span></li>`;
        }).join('')}</ol>
        <p class="hint">${esc(MODES[s.mode].label)}, women ${esc(bandLabel)}, your saved weights. <a href="#rank?st=${esc(s.st)}">Change weights and see why each ranks where it does</a>.</p>`
      : '<div class="empty" role="status"><p>No county has enough dimensions with data to be ranked under the current minimum. Lower it on the Rank page.</p></div>';
  }

  const stateOpts = [`<option value="us"${s.st === 'us' ? ' selected' : ''}>All U.S. counties</option>`, ...states.map((x) => `<option value="${esc(x.id)}"${x.id === s.st ? ' selected' : ''}>${esc(x.name)}</option>`)].join('');

  el.innerHTML = `
  <div class="hero">
    <h2>Where could I meet more compatible, marriage-minded Catholic adults?</h2>
    <p class="lede">${esc(ax('A research tool built only on public aggregates: ACS county demographics, the 2020 U.S. Religion Census, publicly advertised Catholic venues and national survey estimates. It ranks places to look further, never people, and it shows what is measured, what is a proxy and what is missing.'))}</p>
  </div>
  ${vintageHtml(vintageLine(county, sources))}
  <div class="grid two">
    <section class="card" aria-labelledby="h-top">
      <h3 id="h-top">Top areas for further research</h3>
      <label for="home-st">Area</label><select id="home-st">${stateOpts}</select>
      ${topHTML}
      <p class="hint">A research priority, not a prediction: no dataset can say whether any particular person would be interested in you.</p>
    </section>
    <section class="card" aria-labelledby="h-loaded">
      <h3 id="h-loaded">What is loaded</h3>
      ${coverage}
      ${sourcesHTML}
      <p class="hint"><a href="#methodology">How each number is defined and sourced</a> · <a href="#intl">International comparison</a></p>
    </section>
  </div>`;
  el.querySelector('#home-st')?.addEventListener('change', (e) => ctx.setState({ params: { st: e.target.value } }));
}
