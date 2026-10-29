// @ts-check
// Methodology and source inspector: every metric definition with its class,
// the source register with licences and access, the outcome-versus-proxy
// distinction, why incompatible averages are never multiplied, how the index
// is computed, and the open uncertainties (SPEC 12).
import { isMissing, loadCore } from './data.mjs';
import { esc, classBadge, emptyState, acronyms, CLASS_LABELS, FLAG_LABELS, FLAG_HELP } from './format.mjs';
import { DIMENSIONS, DIMENSION_LABELS, DIMENSION_HELP, MODES } from './score.mjs';

const CLASS_HELP = {
  observed: 'Read from an official tabulation for that geography (for example an American Community Survey county estimate).',
  survey_estimate: 'A weighted share from a sample survey, with its sample size and interval.',
  projection: 'A modelled future or interpolated value, not an observation.',
  proxy: 'An indirect measure of what you care about (for example Catholic adherents of all ages, not weekly Mass attendance).',
  unvalidated_hypothesis: 'A candidate predictor not yet tested against the outcome in compatible data. Off by default.',
  user_listing: 'A hand-maintained list of public venues, with the date and way each was checked.',
};

const UNCERTAINTIES = [
  'No validated joint distribution establishes a location-level prevalence of unmarried practising Catholic women in the target ages who want a large family, a home-centred vocation and lifelong marriage. The tool builds honest partial views instead.',
  'Strongly religious, unmarried young women may be sparse in national surveys; country differences are not necessarily robust for the exact subgroup.',
  'Catholic parish membership is not weekly Mass attendance, and affiliation is measured at a different grain from age, sex and marital status.',
  'County vote totals or hunting rates may be ecological correlates, but their usefulness for this outcome must be tested and can be confounded by rurality, age, education and region.',
  'Homeschool participation is measured among current parents and school-age children, not as unmarried women\'s future intentions.',
  'Low measured divorce may reflect law, low marriage incidence or unrecorded separation. A crude divorce rate is never the probability that a marriage ends in divorce.',
  'International comparisons need translation checks, country-specific weighting and aligned reference years.',
  'Meeting someone is reciprocal; no dataset can tell whether a particular person would be interested in you.',
  'The final choice about a spouse is interpersonal and spiritual, not reducible to geographic rankings.',
];

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
  const ax = acronyms();

  const metrics = isMissing(core.metrics)
    ? emptyState('metrics.json')
    : `<div class="table-scroll"><table class="data compact methods"><thead><tr><th scope="col">Metric</th><th scope="col">Class</th><th scope="col">Universe and unit</th><th scope="col">Definition and method</th><th scope="col">Source</th><th scope="col">Caveats</th></tr></thead><tbody>${(core.metrics.metrics || []).map((m) => `<tr id="metric-${esc(m.metric_id)}"><th scope="row">${esc(m.label)}<span class="sub"><code>${esc(m.metric_id)}</code></span></th><td>${classBadge(m.class)}</td><td>${esc(m.universe || 'Not stated')}<span class="sub">${esc(m.unit || '')}</span></td><td>${esc(ax(m.definition || ''))}${m.method ? `<span class="sub">${esc(m.method)}</span>` : ''}${(m.source_variable_ids || []).length ? `<span class="sub">Variables: ${esc(m.source_variable_ids.join(', '))}</span>` : ''}</td><td><code>${esc(m.source_id || '')}</code></td><td>${esc(m.caveats || '')}</td></tr>`).join('')}</tbody></table></div>`;

  const sources = isMissing(core.sources)
    ? emptyState('sources.json')
    : `<div class="table-scroll"><table class="data compact methods"><thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Version and period</th><th scope="col">Licence</th><th scope="col">Access</th><th scope="col">Files</th><th scope="col">Citation</th></tr></thead><tbody>${(core.sources.sources || []).map((s) => `<tr id="source-${esc(s.id)}"><th scope="row"><a href="${esc(s.landing_url)}" rel="noopener">${esc(ax(s.title))}</a><span class="sub">${esc(s.provider || '')} · <code>${esc(s.id)}</code></span></th><td><span class="badge status status-${esc(s.status)}">${esc(s.status)}</span>${s.retrieved_at ? `<span class="sub">retrieved ${esc(String(s.retrieved_at).slice(0, 10))}</span>` : ''}</td><td>${esc(s.dataset_version || 'Not stated')}<span class="sub">${esc(s.reference_period || '')}</span></td><td>${esc(s.license || 'Not stated')}</td><td>${esc(s.access || 'Not stated')}</td><td>${(s.files || []).length ? (s.files || []).map((f) => `<span class="sub"><a href="${esc(f.url)}" rel="noopener">${esc(String(f.url).replace(/^https?:\/\//, '').slice(0, 48))}</a>${f.sha256 ? ` <code title="SHA-256">${esc(String(f.sha256).slice(0, 12))}…</code>` : ''}</span>`).join('') : 'None recorded'}</td><td>${esc(s.citation || '')}${s.notes ? `<span class="sub">${esc(s.notes)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;

  el.innerHTML = `
  <h2>Methodology</h2>
  <p class="lede">${esc(ax('What each number is, where it comes from and what it cannot tell you. Every value on the page is read from a published file; when a file or cell is missing the page says "Not available" and substitutes nothing.'))}</p>

  <section class="card"><h3>Kinds of evidence</h3><dl class="classes">${Object.entries(CLASS_LABELS).map(([k, l]) => `<dt>${classBadge(k)}</dt><dd>${esc(ax(CLASS_HELP[k] || l))}</dd>`).join('')}</dl></section>

  <section class="card"><h3>Outcomes are not proxies</h3>
    <p><strong>Direct outcomes and attitudes</strong> ask about the thing itself: ideal number of children, preference for homemaking, views on the permanence of marriage, religious service attendance, intention to marry.</p>
    <p><strong>Partial or related measures</strong> are nearby but different: expected births, current children, relationship status, religious identification, general attitudes to divorce or gender roles.</p>
    <p><strong>Ecological proxies</strong> describe places, not people: fertility rates, crude divorce rates, Catholic adherents per capita, county vote share. A place's average says nothing about any individual woman.</p>
    <p><strong>Access measures</strong> are about meeting at all: the number of women in the age band, distance, and publicly advertised parish and young-adult events.</p>
    <p>A direct measure is always preferred to a proxy when comparable and precise enough. Proxies that have not been tested are labelled <span class="badge cls cls-unvalidated_hypothesis">Unvalidated hypothesis</span> and are left out of the default weights.</p>
  </section>

  <section class="card"><h3>Why incompatible averages are never multiplied</h3>
    <p>It is tempting to estimate a number of "ideal matches" as women in the age band × the share who are Catholic (all ages) × the share holding traditional views (another survey) × the share wanting four or more children (a third survey). This tool never does that. The traits are correlated, the definitions and populations differ, and no source observes their joint distribution, so the product would look precise while being unfounded.</p>
    <p>Instead there are separate scorecards: <em>opportunity and capacity</em> (counts, Catholic presence, venues) and <em>values evidence</em> (directly measured, weighted survey shares with their sample sizes), and an optional research priority index that is labelled as exactly that.</p>
  </section>

  <section class="card"><h3>How the research priority index works</h3>
    <ul>${DIMENSIONS.map((d) => `<li><strong>${esc(DIMENSION_LABELS[d])}.</strong> ${esc(ax(DIMENSION_HELP[d]))}</li>`).join('')}</ul>
    <p>Each component is scored 0 to 100 against the other areas being compared, by percentile or by a log-scaled min-to-max, so a very large county does not automatically win. A dimension with no data is left out for that area and the remaining weights are re-normalised to sum to 100%; missing data is never scored as zero. You set the minimum number of dimensions an area needs to be ranked, and the Rank page shows how each area's rank moves when each weight is nudged up or down.</p>
    <p>Two starting points: ${Object.values(MODES).map((m) => `<strong>${esc(m.label)}</strong> (${esc(m.help)})`).join('; ')}.</p>
  </section>

  <section class="card"><h3>Quality flags</h3><dl class="classes">${Object.entries(FLAG_LABELS).map(([k, l]) => `<dt><span class="badge flag">${esc(l)}</span></dt><dd>${esc(ax(FLAG_HELP[k] || ''))}</dd>`).join('')}</dl>
    <p class="hint">${esc(ax('Margins of error are the ACS 90% margins. For summed cells the Census Bureau approximation is used and flagged. Survey percentages with an effective sample below 30 are suppressed; between 30 and 100 they are flagged exploratory.'))}</p></section>

  <section><h3>Metric definitions</h3>${metrics}</section>
  <section><h3>Sources, licences and access</h3>${sources}</section>

  <section class="card"><h3>Open uncertainties</h3><ul>${UNCERTAINTIES.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></section>`;
}
