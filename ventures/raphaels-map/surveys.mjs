// @ts-check
// Survey explorer: exact question text, weighted percentages with intervals,
// n and n_eff, suppressed cells as "Insufficient sample", alignment labels,
// non-equivalent wording warnings, and held-out proxy tests. Filters are
// offered only for variables and values that exist in the tables.
import { isMissing } from './data.mjs';
import { esc, num, flagBadges, emptyState, acronyms } from './format.mjs';

export const FILTER_KEYS = ['sex', 'age_band', 'relig', 'attend', 'marital'];
const FILTER_LABELS = { sex: 'Sex', age_band: 'Age band', relig: 'Religion', attend: 'Attendance', marital: 'Marital status' };
const ALIGN = {
  direct: { label: 'Direct measure', help: 'Asks about the outcome itself (for example ideal number of children).' },
  partial: { label: 'Partial measure', help: 'Related to the outcome but not the same thing (for example a general role norm, not her own preference).' },
  related: { label: 'Related context', help: 'Context only; not a measure of the outcome.' },
};

/** Distinct values for each filter key across the tables (only those present). */
export function filterOptions(tables) {
  const out = {};
  for (const k of FILTER_KEYS) {
    const vals = new Set();
    for (const t of tables) if (t.filters && t.filters[k] !== undefined && t.filters[k] !== null) vals.add(String(t.filters[k]));
    if (vals.size) out[k] = [...vals].sort();
  }
  return out;
}

/** Tables matching the chosen dataset, variable and filter values. */
export function matchTables(tables, sel) {
  return tables.filter((t) =>
    (!sel.ds || t.dataset_id === sel.ds) &&
    (!sel.v || t.variable === sel.v) &&
    FILTER_KEYS.every((k) => !sel[k] || String((t.filters || {})[k]) === sel[k]));
}

/** Questions that share a concept but differ in wording or dataset. */
export function nonEquivalent(questions) {
  const by = new Map();
  for (const q of questions) {
    if (!q.harmonized_concept) continue;
    if (!by.has(q.harmonized_concept)) by.set(q.harmonized_concept, []);
    by.get(q.harmonized_concept).push(q);
  }
  return [...by].filter(([, qs]) => new Set(qs.map((q) => q.original_text)).size > 1).map(([concept, qs]) => ({ concept, questions: qs }));
}

function ciBar(r) {
  if (![r.pct, r.ci_low, r.ci_high].every((x) => typeof x === 'number')) return '';
  const W = 160;
  const x = (v) => (Math.max(0, Math.min(100, v)) / 100) * W;
  return `<svg class="ci" viewBox="0 0 ${W} 12" width="${W}" height="12" aria-hidden="true"><rect x="0" y="5" width="${W}" height="2" class="ci-axis"/><rect x="${x(r.ci_low)}" y="3" width="${Math.max(1, x(r.ci_high) - x(r.ci_low))}" height="6" rx="2" class="ci-span"/><circle cx="${x(r.pct)}" cy="6" r="3.5" class="ci-dot"/></svg>`;
}

let rootEl = null;
export async function mount(el, ctx) {
  rootEl = el;
  el.innerHTML = '<div class="loading">Loading surveys…</div>';
  await update(ctx);
}

export async function update(ctx) {
  const el = rootEl;
  if (!el) return;
  const [qf, cf, pf] = await Promise.all([ctx.data.get('surveys/questions.json'), ctx.data.get('surveys/crosstabs.json'), ctx.data.get('surveys/proxy_tests.json')]);
  const ax = acronyms();
  const p = ctx.state.params;
  const intro = `<h2>Survey explorer</h2><p class="lede">${esc(ax('Weighted national survey estimates such as the GSS and NSFG, shown with the exact question wording, the sample behind each number and its uncertainty. These are national or subgroup shares, never county figures and never a statement about any one person.'))}</p>`;
  if (isMissing(qf)) {
    el.innerHTML = intro + emptyState('surveys/questions.json');
    return;
  }
  const datasets = qf.datasets || [];
  const questions = qf.questions || [];
  const tables = isMissing(cf) ? [] : cf.tables || [];
  const sel = { ds: p.ds || '', v: p.v || '' };
  for (const k of FILTER_KEYS) sel[k] = p[k] || '';
  const dsTables = tables.filter((t) => !sel.ds || t.dataset_id === sel.ds);
  const opts = filterOptions(dsTables.filter((t) => !sel.v || t.variable === sel.v));
  const vars = questions.filter((q) => !sel.ds || q.dataset_id === sel.ds);
  const found = matchTables(tables, sel);
  const qKey = (t) => questions.find((q) => q.dataset_id === t.dataset_id && q.variable === t.variable);

  const select = (id, label, options, value) => `<div><label for="sv-${id}">${esc(label)}</label><select id="sv-${id}" data-key="${id}"><option value="">Any</option>${options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const controls = `<div class="controls card row">
    ${select('ds', 'Dataset', datasets.map((d) => [d.id, ax(d.title)]), sel.ds)}
    ${select('v', 'Question', vars.map((q) => [q.variable, `${q.variable}: ${q.harmonized_concept || ''}`]), sel.v)}
    ${Object.entries(opts).map(([k, vals]) => select(k, FILTER_LABELS[k], vals.map((v) => [v, v.replace(/_/g, ' ')]), sel[k])).join('')}
  </div>`;

  const shownQs = [...new Set(found.map(qKey).filter(Boolean))];
  const neq = nonEquivalent(shownQs.length ? shownQs : vars);
  const neqHTML = neq.length ? `<div class="notes" role="note"><strong>Not equivalent questions.</strong> ${neq.map((g) => `Concept "${esc(g.concept)}" is asked with different wording (${g.questions.map((q) => esc(`${q.dataset_id}.${q.variable}`)).join(', ')}); do not compare their percentages as if they were the same question.`).join(' ')}</div>` : '';

  const cards = found.map((t) => {
    const q = qKey(t) || {};
    const ds = datasets.find((d) => d.id === t.dataset_id) || {};
    const al = ALIGN[q.alignment] || { label: q.alignment || 'Alignment not stated', help: '' };
    const suppressed = !t.rows || (t.flags || []).includes('suppressed_small_sample');
    const filters = Object.entries(t.filters || {}).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${FILTER_LABELS[k] || k}: ${String(v).replace(/_/g, ' ')}`).join(' · ');
    const rows = suppressed
      ? `<p class="na"><strong>Insufficient sample.</strong> Effective sample size ${esc(num(t.n_eff, { digits: 0 }))} is below 30, so no percentage is shown.</p>`
      : `<table class="data compact"><thead><tr><th scope="col">Response</th><th scope="col">Weighted %</th><th scope="col">Confidence interval</th><th scope="col"><span class="sr-only">Interval chart</span></th></tr></thead><tbody>${t.rows.map((r) => `<tr><th scope="row">${esc(r.category)}</th><td class="num">${esc(num(r.pct, { unit: 'percent', digits: 1 }))}</td><td class="num">${typeof r.ci_low === 'number' ? `${esc(num(r.ci_low, { digits: 1 }))}–${esc(num(r.ci_high, { digits: 1 }))}` : 'Not available'}</td><td>${ciBar(r)}</td></tr>`).join('')}</tbody></table>`;
    const ex = t.excluded || {};
    return `<article class="card survey">
      <header><h3>${esc(q.original_text || `${t.dataset_id}.${t.variable}`)}</h3>
      <p class="sub"><span class="badge align align-${esc(q.alignment || 'none')}" title="${esc(al.help)}">${esc(al.label)}</span> <span class="badge cls cls-survey_estimate">Survey estimate</span> ${flagBadges(t.flags)}</p>
      <p class="sub">${esc(ax(ds.title || t.dataset_id))} · variable <code>${esc(t.variable)}</code> · years ${esc((t.years || []).join(', ') || 'not stated')} · weight <code>${esc(ds.weight_variable || 'not stated')}</code></p>
      <p class="sub">${esc(filters || 'All respondents')}</p></header>
      ${rows}
      <p class="sub">n = ${esc(num(t.n, { digits: 0 }))} · n_eff = ${esc(num(t.n_eff, { digits: 0 }))} (effective sample size after weighting)${typeof t.weighted_base === 'number' ? ` · weighted base ${esc(num(t.weighted_base))}` : ''} · excluded: don't know ${esc(num(ex.dk, { digits: 0 }))}, refused ${esc(num(ex.refused, { digits: 0 }))}, not asked ${esc(num(ex.iap, { digits: 0 }))}</p>
      ${q.alignment === 'partial' ? '<p class="hint">A partial measure: a general attitude, not the respondent\'s own plans.</p>' : ''}
      ${ds.design ? `<p class="hint">Design: ${esc(ds.design)}</p>` : ''}
    </article>`;
  }).join('');

  let proxy = '';
  if (isMissing(pf)) proxy = emptyState('surveys/proxy_tests.json');
  else if (!(pf.tests || []).length) proxy = '<p class="muted">No proxy hypothesis has been tested yet.</p>';
  else {
    proxy = `<div class="table-scroll"><table class="data compact"><thead><tr><th scope="col">Hypothesis</th><th scope="col">Outcome</th><th scope="col">Predictors</th><th scope="col">Train → test years</th><th scope="col">n train / test</th><th scope="col">${esc(ax('AUC'))} (interval) vs baseline</th><th scope="col">Brier vs baseline</th><th scope="col">Verdict</th></tr></thead><tbody>${pf.tests.map((t) => `<tr><th scope="row">${esc(t.hypothesis)}${t.notes ? `<span class="sub">${esc(t.notes)}</span>` : ''}</th><td>${esc(t.outcome)}</td><td>${esc((t.predictors || []).join(', '))}</td><td>${esc((t.train_years || []).join(', '))} → ${esc((t.test_years || []).join(', '))}</td><td class="num">${esc(num(t.n_train, { digits: 0 }))} / ${esc(num(t.n_test, { digits: 0 }))}</td><td class="num">${esc(num(t.auc, { digits: 3 }))}${Array.isArray(t.auc_ci) ? ` (${esc(num(t.auc_ci[0], { digits: 3 }))}–${esc(num(t.auc_ci[1], { digits: 3 }))})` : ''} vs ${esc(num(t.baseline_auc, { digits: 3 }))}</td><td class="num">${esc(num(t.brier, { digits: 3 }))} vs ${esc(num(t.baseline_brier, { digits: 3 }))}</td><td>${esc(t.verdict || 'Not stated')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  el.innerHTML = `${intro}${controls}
  ${isMissing(cf) ? emptyState('surveys/crosstabs.json') : ''}
  ${neqHTML}
  <p class="summary">${found.length} table${found.length === 1 ? '' : 's'} match. Cells with an effective sample below 30 are suppressed; 30 to 100 are flagged exploratory.</p>
  ${!isMissing(cf) && !found.length ? '<div class="empty" role="status"><p>No table matches these filters. Your choices are kept; set one back to "Any" to widen.</p></div>' : ''}
  <div class="surveys">${cards}</div>
  <h3>Do the proxies predict anything? Held-out tests</h3>
  <p class="hint">${esc(ax('Each hypothesis is fitted on earlier survey years and scored on later ones, against a baseline. A proxy that does not beat its baseline stays an unvalidated hypothesis.'))}</p>
  ${proxy}`;

  el.querySelectorAll('select[data-key]').forEach((s) => s.addEventListener('change', (e) => {
    const k = e.target.getAttribute('data-key');
    ctx.record('survey_filter_changed');
    const patch = { [k]: e.target.value || null };
    if (k === 'ds') { patch.v = null; }
    ctx.setState({ params: patch });
  }));
}
