// UI for the comparison views: population percentiles, "just me", candidates (me + many
// people), batch CSV scoring and the dashboard. Computation lives in population.js, batch.js,
// dashboard.js and couple.js; this module only renders. Nothing is sent anywhere: files are
// read in the browser, and results download from a local Blob.
import { SCHOOL, DEGREE, WORK, RELIGION, RACE_ETH, refusals } from './couple.js';
import { referenceFor, populationComparison, justMe } from './population.js';
import { validateCouples, validateCandidates, couplesTemplate, candidatesTemplate, scoreBatch, resultsCsv, rankCandidates, normalise, PERSON_COLUMNS, COUPLE_COLUMNS, allowedValues, MAX_ROWS } from './batch.js';
import { partnerDashboard, whatIfs, decodeConstraints, encodeConstraints, cleanConstraints, emptyConstraints, SEARCH_CAP } from './dashboard.js';

const $ = (s, root = document) => root.querySelector(s);
const pct = (x, d = 0) => (Number.isFinite(x) ? (100 * x).toFixed(d) + '%' : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pts = (x) => `${x >= 0 ? '+' : '−'}${(100 * Math.abs(x)).toFixed(1)}`;
const fmtN = (x) => Math.round(x).toLocaleString('en-US');

export const VIEWS = ['couple', 'justme', 'candidates', 'batch', 'dashboard'];
let constraints = emptyConstraints();
let view = 'couple';

// ---- URL fragment: the view and the dashboard's constraints (never batch data) ------------
export function readHashExtras(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const v = q.get('view');
  view = VIEWS.includes(v) ? v : 'couple';
  constraints = decodeConstraints(hash);
  return view;
}
export function hashExtras() {
  const parts = [];
  if (view !== 'couple') parts.push('view=' + view);
  const c = encodeConstraints(constraints);
  if (c) parts.push(c);
  return parts.join('&');
}
export const currentView = () => view;
export function setView(v) { view = VIEWS.includes(v) ? v : 'couple'; }

// ---- Percentile wording ------------------------------------------------------------------
function pctText(c) {
  if (!c || !Number.isFinite(c.percentile)) return '—';
  if (c.below) return 'below p1';
  if (c.above) return 'above p99';
  return 'p' + (c.percentile < 10 ? c.percentile.toFixed(1) : Math.round(c.percentile));
}
const pctCell = (c) => `<td class="num">${esc(pctText(c))}</td>`;

// The population panel for the couple view: percentiles of the couple's wedding-day risk.
export function renderPopulation(el, bundle, a, b, couple) {
  const ref = referenceFor(bundle);
  if (!ref) {
    el.innerHTML = `<p class="note">No population reference for this lens. Its bundle has no distribution of predicted risk across the surveyed people${/nlsy79/.test(bundle.id) ? ' (the NLSY79 person-level extracts are not in the repository, so it cannot be computed here)' : ''}, so the app cannot say where this couple sits. Switch to an NSFG 2002 lens for a percentile.</p>`;
    return;
  }
  const cmp = populationComparison(bundle, a, b, couple);
  if (!cmp || cmp.refused) { el.innerHTML = `<p class="note">No percentile: ${esc(cmp?.refused?.[0] || 'the lens gives this couple no number.')}</p>`; return; }
  el.innerHTML = populationTable(cmp, (couple.yearsMarried || 0) > 0);
}

function populationTable(cmp, rewound) {
  const hs = cmp.horizons;
  const subs = hs[0].subgroups.filter((s) => Number.isFinite(s.median));
  const head = `<tr><th scope="col">Compared with</th>${hs.map((h) => `<th class="num" scope="col">Percentile, ${h.horizon} years</th><th class="num" scope="col">Group median risk, ${h.horizon} y</th>`).join('')}</tr>`;
  const you = `<tr class="ref"><td>Your predicted break-up risk</td>${hs.map((h) => `<td class="num">${pct(h.risk, 1)}</td><td></td>`).join('')}</tr>`;
  const all = `<tr><td>All surveyed first marriages (n=${fmtN(hs[0].overall.n)})</td>${hs.map((h) => pctCell(h.overall) + `<td class="num">${pct(h.overall.median, 1)}</td>`).join('')}</tr>`;
  const rows = subs.map((s) => `<tr><td>${esc(s.label)}: ${esc(s.level)} (n=${fmtN(s.n)})</td>${hs.map((h) => {
    const z = h.subgroups.find((x) => x.variable === s.variable);
    return pctCell(z) + `<td class="num">${pct(z.median, 1)}</td>`;
  }).join('')}</tr>`).join('');
  const skipped = cmp.skipped.length ? `<p class="small">Not compared: ${cmp.skipped.map((s) => `${esc(s.label)} (${esc(s.reason)})`).join('; ')}.</p>` : '';
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${you}${all}${rows}</tbody></table></div>
    <p class="small">A percentile of 30 means 30% of the surveyed marriages in that group had a lower predicted risk than yours, and 70% a higher one. The surveyed marriages were scored by models that never saw them (person-held-out folds), with their own inputs and wedding years; quantiles are survey-weighted, and groups with fewer than 100 marriages are not shown.${rewound ? ' Your couple is compared as of its wedding day, so the risk here counts from the wedding, not from today.' : ''} Risk is the lens’s own outcome (for NSFG: divorce, annulment or separation of a first marriage).</p>${skipped}`;
}

// ---- Person fields for "just me" and candidate cards --------------------------------------
const opt = (list, v) => list.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
function personInputs(prefix, p) {
  return `
    <label>Name or label <input data-f="name" name="${prefix}.name" value="${esc(p.name || '')}" maxlength="60"></label>
    <label>Sex <select data-f="sex" name="${prefix}.sex">${opt(['Woman', 'Man'], p.sex)}</select></label>
    <label>Age today <input data-f="age" name="${prefix}.age" type="number" min="16" max="100" value="${esc(p.age)}"></label>
    <label>Years of schooling <select data-f="school" name="${prefix}.school">${opt(SCHOOL, p.school)}</select></label>
    <label>Highest degree <select data-f="degree" name="${prefix}.degree">${opt(DEGREE, p.degree)}</select></label>
    <label>Wages last year, $ <input data-f="wages" name="${prefix}.wages" type="number" min="0" step="1000" value="${Number.isFinite(p.wages) ? p.wages : ''}"></label>
    <label>Work hours last year <select data-f="work" name="${prefix}.work">${opt(WORK, p.work)}</select></label>
    <label>Religious service attendance <select data-f="religion" name="${prefix}.religion">${opt(RELIGION, p.religion)}</select></label>
    <label class="check"><input data-f="priorMarriage" name="${prefix}.priorMarriage" type="checkbox"${p.priorMarriage ? ' checked' : ''}> Married before</label>
    <label>Children from an earlier relationship <select data-f="priorChildren" name="${prefix}.priorChildren">${opt(['No', 'Yes'], p.priorChildren)}</select></label>
    <label>Lived with both parents from birth to 18 <select data-f="intactFamily" name="${prefix}.intactFamily">${opt(['Yes', 'No'], p.intactFamily)}</select></label>
    <label>Race-ethnicity <select data-f="raceEth" name="${prefix}.raceEth"><option value="">Prefer not to say</option>${opt(RACE_ETH, p.raceEth)}</select></label>`;
}
function readPerson(root) {
  const p = {};
  for (const el of root.querySelectorAll('[data-f]')) p[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
  p.age = Number(p.age);
  p.wages = p.wages === '' ? NaN : Number(p.wages);
  return p;
}

// ---- Just me -------------------------------------------------------------------------------
export function renderJustMe(ctx) {
  const { lenses, a, couple } = ctx;
  const rows = lenses.filter((l) => l.summary.scorable).map((l) => {
    const r = justMe(l.bundle, a, { ...couple, yearsMarried: 0 });
    if (!r.available) return `<tr class="out"><td>${esc(l.summary.label)}</td><td colspan="5">${esc(r.reason)}</td></tr>`;
    const h = Object.fromEntries(r.horizons.map((x) => [x.horizon, x]));
    const cmp = r.comparison?.horizons.find((x) => x.horizon === 10);
    const subs = cmp ? cmp.subgroups.filter((s) => Number.isFinite(s.percentile)).map((s) => `${esc(s.label)} ${esc(s.level)}: ${esc(pctText(s))}`).join('; ') : '';
    return `<tr><td>${esc(l.summary.label)}<small>${fmtN(r.n)} surveyed marriages like you; ${r.profiles} partner profiles covering ${pct(r.coverage)} of them${r.refusedShare > 0 ? `; the lens abstains on ${pct(r.refusedShare)} of that partner mix` : ''}</small></td>`
      + [5, 10, 20].map((k) => `<td class="num">${pct(h[k].meanSurvival, 1)}<small>${pct(h[k].minSurvival, 1)}–${pct(h[k].maxSurvival, 1)}</small></td>`).join('')
      + `<td class="num">${cmp ? esc(pctText(cmp.overall)) : '—'}</td><td>${subs || '—'}</td></tr>`;
  });
  $('#justMeOut').innerHTML = `<div class="table-wrap"><table><thead><tr><th scope="col">Lens</th><th class="num" scope="col">No break-up, 5 years</th><th class="num" scope="col">10 years</th><th class="num" scope="col">20 years</th><th class="num" scope="col">Population percentile (10 y)</th><th scope="col">Within your own groups (10 y)</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

// ---- Candidates (me + many people) ---------------------------------------------------------
let cards = [];
let nextCard = 1;
const defaultCandidate = (me) => ({ name: `Candidate ${nextCard}`, sex: me.sex === 'Man' ? 'Woman' : 'Man', age: Number(me.age) + 2 || 30, school: '13–15 years', degree: 'Some college', wages: 50000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, priorChildren: 'No', intactFamily: 'Yes', raceEth: me.raceEth || '' });

function drawCards() {
  $('#cardList').innerHTML = cards.map((c, i) => `<fieldset class="card" data-card="${i}"><legend>${esc(c.name || `Candidate ${i + 1}`)}</legend>${personInputs(`c${c.id}`, c)}
    <p class="card-actions"><button type="button" data-act="dup" data-i="${i}">Duplicate</button> <button type="button" data-act="del" data-i="${i}">Remove</button></p></fieldset>`).join('')
    || '<p class="note">No candidates yet. Add a card, copy the partner from the form, or load a CSV.</p>';
}
function syncCards() {
  for (const fs of document.querySelectorAll('#cardList fieldset')) {
    const i = Number(fs.dataset.card);
    cards[i] = { ...cards[i], ...readPerson(fs) };
  }
}

export function initCandidates(ctx, rerender) {
  const add = (p) => { cards.push({ ...p, id: nextCard++ }); drawCards(); rerender(); };
  $('#addCard').addEventListener('click', () => { syncCards(); add(defaultCandidate(ctx().a)); $('#cardList fieldset:last-of-type input')?.focus(); });
  $('#copyPartner').addEventListener('click', () => { syncCards(); add({ ...ctx().b, name: 'Partner from the form' }); });
  $('#cardList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    syncCards();
    const i = Number(btn.dataset.i);
    if (btn.dataset.act === 'dup') cards.splice(i + 1, 0, { ...cards[i], name: `${cards[i].name} (copy)`, id: nextCard++ });
    else cards.splice(i, 1);
    drawCards();
    rerender();
    $('#addCard').focus();
  });
  $('#cardList').addEventListener('input', () => { syncCards(); debounce('cand', rerender); });
  $('#cardList').addEventListener('change', () => { syncCards(); for (const fs of document.querySelectorAll('#cardList fieldset')) $('legend', fs).textContent = cards[fs.dataset.card].name || 'Candidate'; debounce('cand', rerender); });
  $('#candTemplate').addEventListener('click', () => download('candidates_template.csv', candidatesTemplate()));
  const load = (text) => {
    const v = validateCandidates(text);
    $('#candErrors').innerHTML = v.fatal ? `<p class="refuse-inline">${esc(v.fatal)}</p>` : errorList(v.errors);
    if (v.fatal) return;
    for (const p of v.candidates) cards.push({ ...p, id: nextCard++ });
    drawCards();
    rerender();
  };
  $('#candFile').addEventListener('change', async (ev) => { const f = ev.target.files[0]; if (f) load(await f.text()); ev.target.value = ''; });
  $('#candPasteGo').addEventListener('click', () => load($('#candPaste').value));
  drawCards();
}

export function renderCandidates(ctx) {
  const { lenses, a, couple, mortality } = ctx;
  syncCards();
  if (!cards.length) { $('#candOut').innerHTML = ''; return; }
  const list = cards.map((c) => ({ ...normalise(c, null, couple, couple.currentYear).a, name: c.name || 'Candidate' }));
  const me = normalise(a, null, couple, couple.currentYear).a;
  const out = rankCandidates(lenses, me, list, couple, { mortality });
  $('#candOut').innerHTML = out.map((o) => {
    const rows = o.ranked.map((r, i) => `<tr${r.inSupport ? '' : ' class="out"'}><td class="num">${i + 1}</td><td>${esc(r.description)}</td>`
      + [5, 10, 20].map((h) => `<td class="num">${pct(r.at[h].meanSurvival, 1)}<small>${pct(r.at[h].minSurvival, 1)}–${pct(r.at[h].maxSurvival, 1)}</small></td>`).join('')
      + `<td class="num">${r.lifelong ? `${pct(r.lifelong.widowhood.mean)}<small>divorce ${pct(r.lifelong.divorce.mean)}</small>` : '—'}</td>`
      + `<td class="num">${r.percentile ? esc(pctText(r.percentile[10])) : '—'}</td>`
      + `<td>${r.indistinguishable ? '<span class="tag">indistinguishable from the top</span>' : 'below the top’s range'}${r.inSupport ? '' : '<small>extrapolated</small>'}</td></tr>`).join('')
      + o.refused.map((r) => `<tr class="out"><td class="num">—</td><td>${esc(r.description)}</td><td colspan="6">no number: ${esc(r.refused[0])}</td></tr>`).join('');
    return `<h3>${esc(o.label)}</h3><p class="small">${o.ranked.length ? `${o.tied} of ${o.ranked.length} scored candidates have a model range that overlaps the top candidate’s, so this lens cannot tell them apart.` : 'This lens gives none of these candidates a number.'} ${o.hasReference ? 'Percentile: among the surveyed marriages, from the wedding day.' : 'No population reference for this lens.'}</p>
      <div class="table-wrap"><table><thead><tr><th class="num" scope="col">#</th><th scope="col">Candidate</th><th class="num" scope="col">No divorce, 5 y</th><th class="num" scope="col">10 y (ranked)</th><th class="num" scope="col">20 y</th><th class="num" scope="col">Lifelong, 40 y (mortality)</th><th class="num" scope="col">Population percentile</th><th scope="col">Versus the top</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('') + '<p class="small">Ranked separately in each lens; the lenses’ outcomes differ, so their numbers are never averaged together. A higher rank is a model association in past survey data, not a verdict on a person.</p>';
}

// ---- Batch CSV -----------------------------------------------------------------------------
let batchResults = null;
export function initBatch(ctx) {
  $('#batchCap').textContent = MAX_ROWS.toLocaleString('en-US');
  $('#batchSchema').innerHTML = `<thead><tr><th scope="col">Column</th><th scope="col">Meaning</th><th scope="col">Allowed values</th></tr></thead><tbody>
    <tr><td><code>id</code></td><td>your label for the couple (blank = row number)</td><td>any text, unique</td></tr>
    ${PERSON_COLUMNS.map(([c, f, d]) => `<tr><td><code>a_${c}</code>, <code>b_${c}</code></td><td>${esc(d)}</td><td>${esc(allowedValues(f))}</td></tr>`).join('')}
    ${COUPLE_COLUMNS.map(([c, f, d]) => `<tr><td><code>${c}</code></td><td>${esc(d)}</td><td>${esc(allowedValues(f))}</td></tr>`).join('')}</tbody>`;
  $('#batchTemplate').addEventListener('click', () => download('couples_template.csv', couplesTemplate()));
  const run = async (text) => {
    batchResults = null;
    $('#batchDownload').disabled = true;
    const v = validateCouples(text, { currentYear: new Date().getFullYear() });
    $('#batchErrors').innerHTML = v.fatal ? `<p class="refuse-inline">${esc(v.fatal)}</p>` : errorList(v.errors);
    if (v.fatal || !v.couples.length) { $('#batchPreview').innerHTML = ''; $('#batchStatus').textContent = v.fatal ? '' : 'No valid rows to score.'; return; }
    const bar = $('#batchProgress');
    bar.hidden = false;
    bar.max = v.couples.length;
    const res = await scoreBatch(ctx().lenses, v.couples, { onProgress: (d, t) => { bar.value = d; $('#batchStatus').textContent = `Scored ${fmtN(d)} of ${fmtN(t)} couples…`; } });
    bar.hidden = true;
    batchResults = res;
    $('#batchStatus').textContent = `Scored ${fmtN(res.length)} couples in every lens${v.errors.length ? `; ${fmtN(new Set(v.errors.map((e) => e.line)).size)} rows skipped for errors` : ''}.`;
    $('#batchDownload').disabled = false;
    const ls = ctx().lenses.filter((l) => l.summary.scorable);
    $('#batchPreview').innerHTML = `<div class="table-wrap"><table><caption>First ${Math.min(20, res.length)} couples: chance of no divorce by year 10, per lens (model range; population percentile)</caption><thead><tr><th scope="col">id</th>${ls.map((l) => `<th scope="col">${esc(l.summary.label.split(' (')[0])}</th>`).join('')}</tr></thead><tbody>`
      + res.slice(0, 20).map((r) => `<tr><td>${esc(r.id)}</td>${ls.map((l) => {
        const x = r.lenses.find((z) => z.lens === l.summary.id);
        if (x.status !== 'ok') return `<td class="out-cell" title="${esc(x.reason)}">${esc(x.status === 'abstain' ? 'abstains' : 'not scored')}<small>${esc(x.reason.length > 60 ? x.reason.slice(0, 57) + '…' : x.reason)}</small></td>`;
        return `<td>${pct(x.at[10].mean, 1)}<small>${pct(x.at[10].min, 1)}–${pct(x.at[10].max, 1)}${x.percentile ? '; ' + esc(pctText(x.percentile[10])) : ''}${x.at[10].inSupport ? '' : '; extrapolated'}</small></td>`;
      }).join('')}</tr>`).join('') + '</tbody></table></div>';
  };
  $('#batchFile').addEventListener('change', async (ev) => { const f = ev.target.files[0]; if (f) run(await f.text()); ev.target.value = ''; });
  $('#batchPasteGo').addEventListener('click', () => run($('#batchPaste').value));
  $('#batchDownload').addEventListener('click', () => { if (batchResults) download('divorce_odds_batch_results.csv', resultsCsv(batchResults)); });
}

function errorList(errors) {
  if (!errors.length) return '';
  const rows = errors.slice(0, 50).map((e) => `<tr><td class="num">${e.line}</td><td><code>${esc(e.column)}</code></td><td>${esc(e.value)}</td><td>${esc(e.message)}</td></tr>`).join('');
  return `<details open><summary>${fmtN(errors.length)} problem${errors.length > 1 ? 's' : ''} found; those rows are skipped${errors.length > 50 ? ' (first 50 shown)' : ''}</summary><div class="table-wrap"><table><thead><tr><th class="num" scope="col">Line</th><th scope="col">Column</th><th scope="col">Value</th><th scope="col">Problem</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Dashboard -----------------------------------------------------------------------------
const OWN_LOCKS = [['a.degree', 'My education (degree)'], ['a.work', 'My work hours'], ['a.wages', 'My wages'], ['a.religion', 'My religious attendance'], ['a.age', 'My age / wedding timing'], ['couple.cohabitedFirst', 'Living together before marrying']];
const PARTNER_FIELDS = [['age', 'Age', null], ['degree', 'Degree', DEGREE], ['work', 'Work hours', WORK], ['religion', 'Religious attendance', RELIGION], ['raceEth', 'Race-ethnicity', RACE_ETH], ['priorMarriage', 'Married before', null], ['priorChildren', 'Children from before', ['No', 'Yes']], ['intactFamily', 'Grew up with both parents', ['Yes', 'No']]];

export function initDashboard(rerender) {
  const id = (s) => s.replace(/\W/g, '_');
  $('#ownLocks').innerHTML = OWN_LOCKS.map(([k, l]) => `<label class="check"><input type="checkbox" data-lock="${k}" id="lk_${id(k)}"> ${esc(l)}</label>`).join('');
  $('#partnerRules').innerHTML = PARTNER_FIELDS.map(([k, l, vals]) => `<div class="rule"><label class="check"><input type="checkbox" data-lock="b.${k}"> Partner’s ${esc(l.toLowerCase())}: keep as in the form</label>${vals ? `<fieldset class="excl"><legend>Must not be</legend>${vals.map((v) => `<label class="check"><input type="checkbox" data-ex="b.${k}" value="${esc(v)}"> ${esc(v)}</label>`).join('')}</fieldset>` : ''}</div>`).join('')
    + '<label>Largest age gap, years <input type="number" id="gapMax" min="0" max="30" step="1" placeholder="no limit"></label>';
  const sync = () => {
    const c = { locks: [...document.querySelectorAll('#dashboard [data-lock]:checked')].map((x) => x.dataset.lock), exclude: {}, gapMax: $('#gapMax').value === '' ? null : Number($('#gapMax').value) };
    for (const x of document.querySelectorAll('#dashboard [data-ex]:checked')) (c.exclude[x.dataset.ex] ||= []).push(x.value);
    constraints = cleanConstraints(c);
    debounce('dash', rerender);
  };
  $('#constraints').addEventListener('change', sync);
  $('#constraints').addEventListener('input', sync);
  $('#clearRules').addEventListener('click', () => { constraints = emptyConstraints(); applyConstraintsToForm(); rerender(); });
  applyConstraintsToForm();
}
function applyConstraintsToForm() {
  for (const x of document.querySelectorAll('#dashboard [data-lock]')) x.checked = constraints.locks.includes(x.dataset.lock);
  for (const x of document.querySelectorAll('#dashboard [data-ex]')) x.checked = (constraints.exclude[x.dataset.ex] || []).includes(x.value);
  if ($('#gapMax')) $('#gapMax').value = constraints.gapMax ?? '';
}
export const syncConstraintControls = applyConstraintsToForm;

export function renderDashboard(ctx) {
  const { bundle, a, b, couple, label } = ctx;
  const why = refusals(bundle, a, b, couple);
  $('#dashLens').textContent = label;
  if (why.length && refusals(bundle, a, { ...b, sex: a.sex === 'Man' ? 'Woman' : 'Man' }, couple).length) {
    $('#dashOut').innerHTML = `<p class="refuse-inline">This lens cannot speak to your profile: ${esc(why[0])}</p>`;
    return;
  }
  const t0 = performance.now();
  const d = partnerDashboard(bundle, a, b, couple, constraints);
  const w = why.length ? null : whatIfs(bundle, a, b, couple, constraints);
  const ms = performance.now() - t0;
  const r = d.ranking;
  const top = r.ranked.slice(0, 12);
  const yourPct = why.length ? null : populationComparison(bundle, a, b, couple);
  const p10 = yourPct?.horizons?.find((h) => h.horizon === 10);
  const card = (k, v, sub) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="r">${sub}</div></div>`;
  const cards = [
    d.reference ? card('Your estimate with the partner in the form: no divorce by year 10', pct(d.reference.meanSurvival), `models ${pct(d.reference.minSurvival)}–${pct(d.reference.maxSurvival)}`) : card('Your estimate with the partner in the form', '—', esc(why[0] || '')),
    card('Your population percentile (10-year risk)', referenceFor(bundle) ? esc(pctText(p10?.overall)) : 'none', referenceFor(bundle) ? 'among surveyed marriages; lower is less risk' : 'no population reference for this lens'),
    d.tier ? card('Top tier of partner profiles, year 10', `${pct(d.tier.meanLo)}–${pct(d.tier.meanHi)}`, `${d.tier.count} of ${d.tier.of} profiles indistinguishable; models ${pct(d.tier.lo)}–${pct(d.tier.hi)}`) : card('Top tier of partner profiles', '—', 'no profile can be scored under these rules'),
  ];
  const held = d.space.heldForSpeed.length ? ` To keep it fast (cap ${SEARCH_CAP}), these were held at the partner in the form: ${d.space.heldForSpeed.map(esc).join(', ')}; lock or exclude other traits to search them.` : '';
  const conflict = d.space.conflicts.length ? `<p class="refuse-inline">Your rules leave no allowed value for: ${d.space.conflicts.map(esc).join(', ')}.</p>` : '';
  const table = top.length ? `<div class="table-wrap"><table><thead><tr><th class="num" scope="col">#</th><th scope="col">Partner profile</th><th class="num" scope="col">No divorce, 10 y</th><th class="num" scope="col">Model range</th><th class="num" scope="col">5 y</th><th class="num" scope="col">20 y</th><th class="num" scope="col">Models above the partner in the form</th><th class="num" scope="col">Population percentile</th><th scope="col">Tier</th></tr></thead><tbody>`
    + top.map((x, i) => `<tr${x.inSupport ? '' : ' class="out"'}><td class="num">${i + 1}</td><td>${esc(x.description)}</td><td class="num">${pct(x.meanSurvival, 1)}</td><td class="num">${pct(x.minSurvival, 1)}–${pct(x.maxSurvival, 1)}</td><td class="num">${pct(x.at[5].meanSurvival, 1)}</td><td class="num">${pct(x.at[20].meanSurvival, 1)}</td><td class="num">${x.beats === null ? '—' : `${x.beats} of ${d.models}`}</td><td class="num">${x.percentile ? esc(pctText(x.percentile[10])) : '—'}</td><td>${x.indistinguishable ? '<span class="tag">top tier</span>' : '—'}${x.inSupport ? '' : '<small>extrapolated</small>'}</td></tr>`).join('')
    + '</tbody></table></div>' : '';
  const perTrait = d.perTrait.map((t) => `<div class="trait"><h4>${esc(t.label)}</h4><table><thead><tr><th scope="col">Value</th><th class="num" scope="col">No divorce, 10 y</th><th class="num" scope="col">Change vs the form</th><th class="num" scope="col">Percentile</th></tr></thead><tbody>${t.rows.map((x) => x.refused
    ? `<tr class="out"><td>${esc(x.label)}</td><td colspan="3">no number: ${esc(x.refused)}</td></tr>`
    : `<tr${x.isReference ? ' class="ref"' : x.inSupport ? '' : ' class="out"'}><td>${esc(x.label)}${x.isReference ? ' <small>(in the form)</small>' : ''}</td><td class="num">${pct(x.meanSurvival, 1)}<small>${pct(x.minSurvival, 1)}–${pct(x.maxSurvival, 1)}</small></td><td class="num">${x.delta === null ? '—' : x.isReference ? '—' : `${pts(x.delta)} pts<small>${x.agree} of ${d.models} agree</small>`}</td><td class="num">${x.percentile ? esc(pctText(x.percentile[10])) : '—'}</td></tr>`).join('')}</tbody></table></div>`).join('');
  $('#dashOut').innerHTML = `<div class="tiles three">${cards.join('')}</div>
    <h3>Partner profiles, ranked for you</h3>
    <p class="sub">Searched ${fmtN(d.space.size)} partner profiles over the traits this lens models (${fmtN(d.space.total)} before the cap) in ${Math.round(ms)} ms, holding your profile and the marriage as entered.${held} Profiles whose model range overlaps the best one’s form a single top tier: the models cannot tell them apart. No profile is an “ideal” partner.</p>${conflict}${table}
    <details><summary>One trait at a time (the rest held at the partner in the form)</summary><div class="traits">${perTrait || '<p class="note">No partner trait is left to vary under your rules.</p>'}</div></details>
    <h3>What-ifs for you</h3>${w ? whatIfBars(w) : '<p class="note">What-ifs need a partner profile the lens can score; adjust the partner in the form.</p>'}`;
}

function whatIfBars(w) {
  if (!w.items.length) return `<p class="note">This lens has nothing you could change that is not locked: its inputs are history and background.${w.blocked.length ? ` Blocked by your rules: ${w.blocked.map((b) => esc(b.label)).join('; ')}.` : ''}</p>`;
  const all = [...w.items, ...(w.combined ? [{ label: 'All helpful changes together: ' + w.combined.labels.join(' + '), ...w.combined, changeability: 'combined', combined: true }] : [])];
  const maxAbs = Math.max(0.005, ...all.map((x) => Math.abs(x.at[w.rankAt].delta)));
  const row = (x) => {
    const r = x.at[w.rankAt];
    const width = (Math.abs(r.delta) / maxAbs) * 50;
    const left = r.delta < 0 ? 50 - width : 50;
    const zero = x.unchanged ? ` ${x.unchanged} of ${x.models} models do not move${x.unchangedTrees ? ' (trees that never split on this input)' : ''}.` : '';
    return `<li class="wi${x.combined ? ' combined' : ''}"><div class="wi-label">${esc(x.label)} <small>${esc(x.changeability)}</small></div>
      <div class="track" aria-hidden="true"><div class="axis"></div><div class="bar ${r.delta >= 0 ? 'pos' : 'neg'}" style="left:${left}%;width:${width}%"></div></div>
      <div class="wi-val"><span class="d ${r.delta >= 0 ? 'up' : 'down'}">${pts(r.delta)} pts</span> at ${w.rankAt} y<small>5 y ${pts(x.at[5].delta)}, 20 y ${pts(x.at[20].delta)}; models ${pts(r.lo)} to ${pts(r.hi)}; ${r.agree} of ${x.models} agree.${zero}</small></div></li>`;
  };
  return `<p class="sub">Change in the chance of no divorce, against your current estimate (${pct(w.base[10].meanSurvival, 1)} by year 10). Bars right of the line raise it. Associations in survey data, not causes.${w.blocked.length ? ` ${w.blocked.length} change${w.blocked.length > 1 ? 's' : ''} skipped by your rules.` : ''} Not searched because they cannot be changed: ${w.fixed.map(esc).join(', ')}.</p><ol class="whatifs">${all.map(row).join('')}</ol>`;
}

// ---- Debounce ------------------------------------------------------------------------------
const timers = {};
function debounce(key, fn, ms = 120) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(fn, ms);
}

