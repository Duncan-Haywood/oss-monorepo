// UI for the couple divorce-odds calculator. All computation is local (couple.js, engine.js).
import { renderPopulation, renderJustMe, renderCandidates, renderDashboard, initCandidates, initBatch, initDashboard, readHashExtras, hashExtras, currentView, setView, syncConstraintControls } from './compare-ui.js';
import { populationComparison } from './population.js';
import { SCHOOL, DEGREE, WORK, RELIGION, RACE_ETH, refusals, lensNotes, adapterFor, scoringModels, isBaseline, excludeReason, project, lifelong, constantSurvival, explain, groupedTerms, selfChanges, coupleChanges, idealPartners, lensSummary, lensView, shareOod, encodeScenario, decodeScenario } from './couple.js';

const $ = (s) => document.querySelector(s);
const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const DEFAULTS = {
  a: { sex: 'Woman', age: 36, school: '16–17 years', degree: 'Bachelor', wages: 55000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, raceEth: '', priorChildren: 'No', intactFamily: 'Yes' },
  b: { sex: 'Man', age: 38, school: '13–15 years', degree: 'Some college', wages: 60000, work: '2,000+ hours', religion: 'Never', priorMarriage: false, raceEth: '', priorChildren: 'No', intactFamily: 'Yes' },
};

function personFields(who) {
  const d = DEFAULTS[who];
  const opt = (list, v) => list.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  return `
    <label>Sex <select name="${who}.sex">${opt(['Woman', 'Man'], d.sex)}</select></label>
    <label>Age today <input name="${who}.age" type="number" min="16" max="100" value="${d.age}"></label>
    <label>Years of schooling <select name="${who}.school">${opt(SCHOOL, d.school)}</select></label>
    <label>Highest degree <select name="${who}.degree">${opt(DEGREE, d.degree)}</select></label>
    <label>Wages last year, $ <input name="${who}.wages" type="number" min="0" step="1000" value="${d.wages}"><small>Leave blank if unknown; 0 if no paid work</small></label>
    <label>Work hours last year <select name="${who}.work">${opt(WORK, d.work)}</select></label>
    <label>Religious service attendance <select name="${who}.religion">${opt(RELIGION, d.religion)}</select></label>
    <label class="check"><input name="${who}.priorMarriage" type="checkbox"> Married before</label>
    <label>Age at first marriage <input name="${who}.firstMarriageAge" type="number" min="13" max="80" placeholder="this marriage if first"></label>
    <label>Children from an earlier relationship <select name="${who}.priorChildren">${opt(['No', 'Yes'], d.priorChildren)}</select></label>
    <label>Lived with both parents from birth to 18 <select name="${who}.intactFamily">${opt(['Yes', 'No'], d.intactFamily)}</select></label>
    <label>Race-ethnicity <select name="${who}.raceEth"><option value="">Prefer not to say</option>${opt(RACE_ETH, d.raceEth)}</select><small>Only the NSFG lens uses it (the wife’s is required there)</small></label>`;
}

function readForm() {
  const f = new FormData($('#form'));
  const person = (w) => {
    const p = {};
    for (const k of ['sex', 'age', 'school', 'degree', 'wages', 'work', 'religion', 'firstMarriageAge', 'raceEth', 'priorChildren', 'intactFamily']) p[k] = f.get(`${w}.${k}`);
    p.age = Number(p.age);
    p.wages = p.wages === '' ? NaN : Number(p.wages);
    p.priorMarriage = f.get(`${w}.priorMarriage`) === 'on';
    return p;
  };
  const couple = { yearsMarried: Number(f.get('yearsMarried') || 0), familyIncome: f.get('familyIncome'), cohabitedFirst: f.get('cohabitedFirst') || 'Unknown', currentYear: new Date().getFullYear() };
  const a = person('a');
  const b = person('b');
  // A first marriage started at (age - years married).
  for (const p of [a, b]) {
    if (p.firstMarriageAge === '' || p.firstMarriageAge === null) p.firstMarriageAge = p.priorMarriage ? null : p.age - couple.yearsMarried;
    else p.firstMarriageAge = Number(p.firstMarriageAge);
  }
  return { a, b, couple, horizon: Number(f.get('horizon')) };
}

let bundle;
let state;
let lenses = []; // [{ entry, bundle, summary }]
let mortality = null; // UN WPP 2024 U.S. death rates (data/us_mortality_wpp2024.json)

const fmtN = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—');

function formFields() {
  const out = {};
  for (const el of $('#form').elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  out.lens = $('#lensSel').value;
  return out;
}

function applyFields(fields) {
  const form = $('#form');
  for (const [k, v] of Object.entries(fields)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = v === '1';
    else el.value = v;
  }
}

function saveHash() {
  const extra = hashExtras();
  const base = encodeScenario(formFields());
  const h = extra ? (base === '#' ? '#' + extra : base + '&' + extra) : base;
  if (h !== location.hash) history.replaceState(null, '', h === '#' ? location.pathname + location.search : h);
}

function renderLens() {
  const cur = lenses.find((l) => l.summary.id === $('#lensSel').value) || lenses[0];
  const s = cur.summary;
  const t = s.training;
  $('#lensCard').innerHTML = `<dl class="facts">
      <dt>Population</dt><dd>${esc(s.population)}</dd>
      <dt>Target</dt><dd>${esc(s.target)}</dd>
      <dt>Training data</dt><dd>${[t.respondents && fmtN(t.respondents) + ' people', t.intervals && fmtN(t.intervals) + ' intervals', t.events && fmtN(t.events) + ' divorces'].filter(Boolean).join(' · ') || 'not stated'}</dd>
      <dt>Held-out skill</dt><dd>${s.best ? `best of ${s.models} models (${esc(s.best.label)}) beats a constant rate by ${s.best.improvement.toFixed(1)}% in held-out deviance` : `${s.models} models; see the bundle for held-out metrics`}</dd>
      ${s.scorable ? `<dt>Uses from the form</dt><dd>${esc(adapterFor(cur.bundle).uses)}</dd>` : ''}
    </dl>${s.scorable ? '' : '<p class="note">This lens’s inputs do not map onto the form yet, so it shows what it covers but gives no number.</p>'}`;
  $('#lensTable').innerHTML = '<thead><tr><th>Lens</th><th>Target</th><th class="num">Models</th><th class="num">Best held-out gain</th><th>In the calculator</th></tr></thead><tbody>'
    + lenses.map(({ summary: z }) => `<tr><td>${esc(z.label)}</td><td>${esc(z.target)}</td><td class="num">${z.models}</td><td class="num">${z.best ? z.best.improvement.toFixed(1) + '%' : '—'}</td><td>${z.scorable ? 'yes' : 'listed only'}</td></tr>`).join('') + '</tbody>';
  return cur;
}

// Which panels each view shows. The form's partner is the reference profile on the
// dashboard and is hidden where only your own profile is used.
function applyView() {
  const v = currentView();
  for (const t of document.querySelectorAll('[role="tab"]')) {
    const on = t.dataset.view === v;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  $('#form').hidden = v === 'batch';
  $('fieldset[data-who="b"]').hidden = v === 'justme' || v === 'candidates';
  $('fieldset[data-who="b"] legend').textContent = v === 'dashboard' ? 'Reference partner (the profile searches start from)' : 'Your partner';
  $('.share').hidden = v === 'batch';
  for (const [id, view] of [['justMe', 'justme'], ['candidates', 'candidates'], ['dashboard', 'dashboard'], ['batch', 'batch']]) $('#' + id).hidden = v !== view;
  if (v !== 'couple') { $('#results').hidden = true; $('#refuse').hidden = true; }
}

function render() {
  const cur = renderLens();
  saveHash();
  applyView();
  const v = currentView();
  if (v !== 'couple') {
    const f = readForm();
    if (v === 'justme') renderJustMe({ lenses, a: f.a, couple: f.couple });
    else if (v === 'candidates') renderCandidates({ lenses, a: f.a, couple: f.couple, mortality });
    else if (v === 'dashboard') {
      if (!cur.summary.scorable) $('#dashOut').innerHTML = '<p class="note">This lens gives no numbers; pick a scorable lens at the top.</p>';
      else renderDashboard({ bundle: cur.bundle, a: f.a, b: f.b, couple: f.couple, label: cur.summary.label });
    }
    return;
  }
  if (!cur.summary.scorable) {
    $('#refuse').hidden = false;
    $('#results').hidden = true;
    $('#refuse').innerHTML = `<strong>No estimate from this lens.</strong> ${esc(cur.summary.label)} uses inputs the form does not collect yet. Pick another lens to score a couple.`;
    return;
  }
  bundle = cur.bundle;
  const { a, b, couple, horizon } = readForm();
  const why = refusals(bundle, a, b, couple);
  $('#refuse').hidden = why.length === 0;
  $('#results').hidden = why.length > 0;
  if (why.length) {
    const others = otherLenses(cur, a, b, couple);
    $('#refuse').innerHTML = '<strong>No estimate from this lens.</strong> ' + why.map(esc).join(' ')
      + (others ? ` Another lens can score this couple: ${others}.` : '');
    return;
  }
  const years = project(bundle, a, b, couple, horizon);
  state = { a, b, couple, years };
  renderTiles(years, couple);
  renderPopulation($('#popPanel'), bundle, a, b, couple);
  renderLifelong(a, b, couple, horizon);
  renderChart(years, couple);
  renderYearTable(years);
  renderModels(years);
  renderExplain();
  renderChanges(a, b, couple);
  renderCompare(a, b, couple);
}

// Each lens's own 10-year estimate for this couple, or why it gives none. Never pooled.
function renderCompare(a, b, couple) {
  const rows = lenses.map((l) => {
    const name = esc(l.summary.label);
    if (!l.summary.scorable) return `<tr class="out"><td>${name}</td><td colspan="4">listed only: inputs not on the form, or a different outcome</td></tr>`;
    const why = refusals(l.bundle, a, b, couple);
    if (why.length) return `<tr class="out"><td>${name}</td><td colspan="4">no number: ${esc(why[0])}</td></tr>`;
    const cmp = populationComparison(l.bundle, a, b, couple);
    const o = cmp?.horizons?.find((h) => h.horizon === 10)?.overall;
    const pc = !cmp ? 'no reference' : !o ? '—' : o.below ? 'below p1' : o.above ? 'above p99' : 'p' + Math.round(o.percentile);
    const p = project(l.bundle, a, b, couple, 10);
    const y = p[p.length - 1];
    const inData = p.every((z) => z.inSupport);
    const here = l.bundle === bundle ? ' <small>(shown above)</small>' : ` <button type="button" class="link" data-lens="${esc(l.summary.id)}">view</button>`;
    return `<tr${inData ? '' : ' class="out"'}><td>${name}${here}</td><td class="num">${pct(y.meanSurvival, 1)}</td><td class="num">${pct(y.minSurvival, 1)}–${pct(y.maxSurvival, 1)}</td><td class="num">${pc}</td><td>${inData ? 'inside the data' : 'extrapolated: ' + esc(p.find((z) => !z.inSupport).issues[0])}</td></tr>`;
  });
  $('#compareTable').innerHTML = '<thead><tr><th>Lens</th><th class="num">No divorce by year 10</th><th class="num">Model range</th><th class="num">Population percentile (10-year risk)</th><th>Data support</th></tr></thead><tbody>' + rows.join('') + '</tbody>';
}

// Links to the other lenses that can score this couple, inside their own data range.
function otherLenses(cur, a, b, couple) {
  const ok = lenses.filter((l) => l !== cur && l.summary.scorable && !refusals(l.bundle, a, b, couple).length
    && project(l.bundle, a, b, couple, 10).every((y) => y.inSupport));
  return ok.map((l) => `<button type="button" class="link" data-lens="${esc(l.summary.id)}">${esc(l.summary.label)}</button>`).join(', ');
}

function at(years, couple, n) {
  return years.find((y) => y.year === couple.yearsMarried + n);
}

function renderTiles(years, couple) {
  const marks = [5, 10, 20, 30, years.length].filter((n, i, arr) => n <= years.length && arr.indexOf(n) === i);
  $('#tiles').innerHTML = marks.map((n) => {
    const y = at(years, couple, n);
    const all = years.slice(0, n).every((z) => z.inSupport);
    const label = n === years.length ? `Through year ${y.year} (if both partners live)` : `Through year ${y.year}`;
    return `<div class="tile${all ? '' : ' out'}"><div class="k">${label}</div><div class="v">${pct(y.meanSurvival)}</div>
      <div class="r">models: ${pct(y.minSurvival)}–${pct(y.maxSurvival)}</div>${all ? '' : '<div class="flag">includes years outside the data</div>'}</div>`;
  }).join('');
  const outside = years.filter((y) => !y.inSupport);
  const avg = constantSurvival(bundle, 10);
  $('#support').innerHTML = (outside.length
    ? `<strong>${outside.length} of ${years.length} projected years are outside the training data</strong> (${esc(outside[0].issues[0])}${outside[0].issues.length > 1 ? ', …' : ''}); treat those as extrapolation. `
    : 'Every projected year is inside the range of ages and marriage lengths the models were trained on. ')
    + `For reference, the average training rate alone gives ${pct(avg)} no divorce over 10 years.`
    + observedReference()
    + lensNotes(bundle, state.a, state.b, couple).map((n) => ' ' + esc(n)).join('')
    + (years.slice(0, 10).some((y) => !y.inSupport) && otherLenses(lenses.find((l) => l.bundle === bundle), state.a, state.b, couple)
      ? ` The first 10 years of this couple are inside the data of another lens: ${otherLenses(lenses.find((l) => l.bundle === bundle), state.a, state.b, couple)}.` : '');
  $('#outcomeNote').textContent = adapterFor(bundle).outcome || '';
}

// The lens's own survey-weighted Kaplan–Meier curves, when it ships them: what was observed,
// with no model, for all first marriages and for the wife's age-at-marriage group.
function observedReference() {
  const ws = bundle.weighted_survival;
  if (!ws || !state) return '';
  const wife = state.a.sex === 'Woman' ? state.a : state.b;
  const age = wife.age - state.couple.yearsMarried;
  const band = age < 20 ? 'Wife married under 20' : age < 25 ? 'Wife married 20-24' : age < 30 ? 'Wife married 25-29' : 'Wife married 30+';
  const all = ws.find((g) => g.group === 'All first marriages');
  const grp = ws.find((g) => g.group === band);
  const fmt = (g) => (g && Number.isFinite(g.still_married_10y) ? pct(g.still_married_10y) : null);
  if (!fmt(all)) return '';
  return ` Observed in the survey (weighted Kaplan–Meier, no model): ${fmt(all)} of all first marriages were intact at 10 years${fmt(grp) ? `, and ${fmt(grp)} where the ${band.toLowerCase()}` : ''}.`;
}

// The lifelong estimate with competing mortality; the tiles above assume both partners live.
function renderLifelong(a, b, couple, horizon) {
  if (!mortality) {
    $('#lifelong').innerHTML = '<p class="note">The mortality table did not load, so the lifelong split is not shown; the tiles above assume both partners live.</p>';
    return;
  }
  const L = lifelong(bundle, mortality, a, b, couple, horizon);
  const tile = (k, s, note) => `<div class="tile"><div class="k">${k}</div><div class="v">${pct(s.mean)}</div><div class="r">models: ${pct(s.min)}–${pct(s.max)}</div>${note ? `<div class="flag">${note}</div>` : ''}</div>`;
  $('#lifelong').innerHTML = `<div class="tiles three">${tile('Lifelong: ends only when a partner dies', L.widowhood)}${tile('Ends in divorce', L.divorce)}${tile(`Still married, both alive, after year ${L.lastYear}`, L.stillMarried)}</div>`
    + `<p class="small">Each year, the lens’s divorce rate competes with the death of either partner (UN World Population Prospects 2024 U.S. death rates by age, sex and calendar year, CC BY 3.0 IGO). The three shares add to 100%. These are population death rates: married people live longer than average and spouses’ deaths are linked, neither of which is modelled.${L.extrapolated ? ` ${L.extrapolated} of the ${L.horizon} years use divorce rates outside the lens’s data.` : ''}</p>`;
}

function renderChart(years, couple) {
  const W = 900, H = 340, L = 44, R = 16, T = 12, B = 34;
  const n = years.length;
  const x0 = couple.yearsMarried;
  const xs = (yr) => L + ((yr - x0) / n) * (W - L - R);
  const minS = Math.min(...years.map((y) => y.minSurvival));
  const lo = Math.max(0, Math.floor((minS - 0.05) * 10) / 10);
  const ys = (v) => T + (1 - (v - lo) / (1 - lo)) * (H - T - B);
  const pts = [{ year: x0, meanSurvival: 1, minSurvival: 1, maxSurvival: 1, survival: Object.fromEntries(scoringModels(bundle).map((m) => [m.key, 1])) }, ...years];
  const line = (f) => pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.year).toFixed(1)},${ys(f(p)).toFixed(1)}`).join('');
  const band = line((p) => p.maxSurvival) + pts.slice().reverse().map((p) => `L${xs(p.year).toFixed(1)},${ys(p.minSurvival).toFixed(1)}`).join('') + 'Z';
  let shade = '';
  for (const y of years) if (!y.inSupport) shade += `<rect x="${xs(y.year - 1)}" y="${T}" width="${xs(y.year) - xs(y.year - 1) + 0.5}" height="${H - T - B}" fill="var(--outside)"/>`;
  let grid = '';
  for (let v = lo; v <= 1.0001; v += (1 - lo) / 5) grid += `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${pct(v)}</text>`;
  const step = n > 30 ? 10 : 5;
  for (let yr = x0; yr <= x0 + n; yr += step) grid += `<text x="${xs(yr)}" y="${H - 12}" text-anchor="middle">${yr}</text>`;
  grid += `<text x="${(W + L) / 2}" y="${H}" text-anchor="middle">year of marriage</text>`;
  const models = scoringModels(bundle).map((m) => `<path d="${line((p) => p.survival[m.key])}" fill="none" stroke="var(--model-line)" stroke-width="1"/>`).join('');
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance of no divorce by year of marriage">
    ${shade}${grid}<path d="${band}" fill="var(--band)"/>${models}
    <path d="${line((p) => p.meanSurvival)}" fill="none" stroke="var(--series-1)" stroke-width="2.5"/>
    <line id="cross" y1="${T}" y2="${H - B}" stroke="var(--text-muted)" stroke-dasharray="3 3" visibility="hidden"/>
    <circle id="dot" r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg>`;
  $('#legend').innerHTML = `<span><i style="background:var(--series-1)"></i>Average of ${scoringModels(bundle).length} models</span><span><i style="background:var(--band)"></i>Range across models</span><span><i style="background:var(--model-line);height:2px"></i>Each model</span><span><i style="background:var(--outside);border:1px solid var(--border)"></i>Outside training data</span>`;
  const svg = $('#chart svg');
  const tip = $('#tip');
  $('#hit').addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    const yr = Math.min(x0 + n, Math.max(x0 + 1, Math.round(x0 + ((sx - L) / (W - L - R)) * n)));
    const y = years.find((z) => z.year === yr);
    $('#cross').setAttribute('x1', xs(yr)); $('#cross').setAttribute('x2', xs(yr)); $('#cross').setAttribute('visibility', 'visible');
    $('#dot').setAttribute('cx', xs(yr)); $('#dot').setAttribute('cy', ys(y.meanSurvival)); $('#dot').setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>Year ${yr}</b>${y.inSupport ? '' : ' · outside data'}<br>No divorce so far: <b>${pct(y.meanSurvival, 1)}</b> (${pct(y.minSurvival, 1)}–${pct(y.maxSurvival, 1)})<br>Divorce in this year: ${pct(y.meanYearProb, 2)}<br>`
      + scoringModels(bundle).map((m) => `${esc(m.label)}: ${pct(y.survival[m.key], 1)}`).join('<br>');
    tip.style.left = Math.min(window.innerWidth - 300, ev.clientX + 14) + 'px';
    tip.style.top = ev.clientY + 14 + 'px';
  });
  $('#hit').addEventListener('pointerleave', () => { tip.hidden = true; $('#cross').setAttribute('visibility', 'hidden'); $('#dot').setAttribute('visibility', 'hidden'); });
}

function renderYearTable(years) {
  $('#yearTable').innerHTML = '<thead><tr><th>Year of marriage</th><th class="num">Divorce in that year</th><th class="num">Range across models</th><th class="num">No divorce by end of year</th><th>Data support</th></tr></thead><tbody>'
    + years.map((y) => {
      const v = Object.values(y.yearProb);
      return `<tr class="${y.inSupport ? '' : 'out'}"><td>${y.year}</td><td class="num">${pct(y.meanYearProb, 2)}</td><td class="num">${pct(Math.min(...v), 2)}–${pct(Math.max(...v), 2)}</td><td class="num">${pct(y.meanSurvival, 1)}</td><td>${y.inSupport ? 'in range' : esc(y.issues.join('; '))}</td></tr>`;
    }).join('') + '</tbody>';
}

function renderModels(years) {
  const y10 = years[Math.min(9, years.length - 1)];
  const last = years[years.length - 1];
  $('#modelTable').innerHTML = `<thead><tr><th>Model</th><th class="num">Held-out improvement vs average rate</th><th class="num">Divorce rate, first year</th><th class="num">No divorce, year ${y10.year}</th><th class="num">No divorce, year ${last.year}</th></tr></thead><tbody>`
    + scoringModels(bundle).map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${m.heldout.deviance_improvement_percent.toFixed(1)}%</td><td class="num">${(1000 * years[0].rates[m.key]).toFixed(1)} per 1,000</td><td class="num">${pct(y10.survival[m.key], 1)}</td><td class="num">${pct(last.survival[m.key], 1)}</td></tr>`).join('')
    + bundle.models.filter(isBaseline).map((m) => {
      const p = project(bundle, state.a, state.b, state.couple, years.length, [m]);
      return `<tr class="out"><td>${esc(m.label)} — ${esc(excludeReason(m))}</td><td class="num">${m.heldout.deviance_improvement_percent.toFixed(1)}%</td><td class="num">${(1000 * p[0].rates[m.key]).toFixed(1)} per 1,000</td><td class="num">${pct(p[Math.min(9, p.length - 1)].survival[m.key], 1)}</td><td class="num">${pct(p[p.length - 1].survival[m.key], 1)}</td></tr>`;
    }).join('')
    + `<tr><td>Average training rate (no inputs)</td><td class="num">0%</td><td class="num">${(1000 * bundle.constant_rate).toFixed(1)} per 1,000</td><td class="num">${pct(constantSurvival(bundle, 10), 1)}</td><td class="num">${pct(constantSurvival(bundle, years.length), 1)}</td></tr></tbody>`;
}

function renderExplain() {
  const sel = $('#explainModel');
  if (sel.dataset.lens !== bundle.id) {
    sel.dataset.lens = bundle.id;
    const glm = scoringModels(bundle).find((m) => m.key === 'additive_enriched') || scoringModels(bundle).find((m) => m.kind !== 'tree') || scoringModels(bundle)[0];
    sel.innerHTML = scoringModels(bundle).map((m) => `<option value="${m.key}"${m === glm ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
  }
  const m = bundle.models.find((z) => z.key === sel.value);
  const { a, b, couple } = state;
  $('#explainYear').textContent = couple.yearsMarried + 1;
  const e = explain(bundle, m, a, b, couple, 0);
  if (e.tree) {
    const describe = (t) => t.steps.map((s) => `<li><code>${esc(s.feature.replace(/^(num|cat)__/, ''))}</code> ${s.left ? '≤' : '>'} ${s.threshold.toFixed(2)} (value ${s.value.toFixed(2)})</li>`).join('');
    const labels = adapterFor(bundle).rowLabels;
    $('#explain').innerHTML = `<div class="two path">${e.tree.map((t, i) => `<div><h3>${esc(labels[i] || '')}</h3><ol>${describe(t)}</ol><p>Leaf rate ${(1000 * t.rate).toFixed(1)} per 1,000 per year (${t.leafSamples.toLocaleString('en-US')} training intervals)</p></div>`).join('')}</div>`;
    return;
  }
  // Forest attributions are in rate units; every other model's are logs (rate or odds).
  const rateScale = e.scale === 'rate';
  const rows = groupedTerms(e.terms).filter(([, v]) => Math.abs(rateScale ? 1000 * v : v) > 0.005);
  const maxAbs = Math.max(rateScale ? 0.0001 : 0.1, ...rows.map(([, v]) => Math.abs(v)));
  const fmtVal = (v) => (rateScale ? `${v >= 0 ? '+' : '−'}${(1000 * Math.abs(v)).toFixed(1)}/1,000` : `×${Math.exp(v).toFixed(2)}`);
  const unit = { rate: 'Values are changes in the annual rate per 1,000 couples (path attributions summed over the forest’s trees).', hazard_log_odds: 'Values multiply the odds of a break-up in the year.', log_rate: 'Values multiply the annual rate.' }[e.scale] || '';
  $('#explain').innerHTML = `<div class="bars">${rows.map(([k, v]) => {
    const w = (Math.abs(v) / maxAbs) * 50;
    const left = v < 0 ? 50 - w : 50;
    return `<div>${esc(k)}</div><div class="track"><div class="axis"></div><div class="bar" style="left:${left}%;width:${w}%;opacity:${v < 0 ? 0.55 : 1}"></div></div><div class="val">${fmtVal(v)}</div>`;
  }).join('')}</div><p class="small">Bars right of the line raise the model’s rate; left lower it. ${unit}${e.scale === 'log_rate' ? ` Reference rate ${(1000 * Math.exp(e.intercept)).toFixed(1)} per 1,000 per year.` : ''}</p>`;
}

function renderChanges(a, b, couple) {
  const pts = (x) => `${x >= 0 ? '+' : '−'}${(100 * Math.abs(x)).toFixed(1)}`;
  const list = (opts) => opts.slice(0, 6).map((o) => {
    const cls = o.delta > 0 ? 'up' : 'down';
    return `<li>${esc(o.label)}: <span class="d ${cls}">${pts(o.delta)} pts</span> <small>models range ${pts(o.lo)} to ${pts(o.hi)} pts; ${o.agree} of ${o.models} agree on the direction</small></li>`;
  }).join('');
  const none = (opts) => (!opts.length ? '<li class="note">This lens has nothing here a person could change: its inputs are history and background.</li>'
    : opts[0].delta > 0 ? '' : '<li class="note">None of the changes searched raises the estimate in these models.</li>');
  const ca = selfChanges(bundle, 'a', a, b, couple);
  const cb = selfChanges(bundle, 'b', a, b, couple);
  const cc = coupleChanges(bundle, a, b, couple);
  $('#changesA').innerHTML = none(ca) + list(ca);
  $('#changesB').innerHTML = none(cb) + list(cb);
  $('#changesCouple').hidden = !cc.length;
  $('#changesC').innerHTML = none(cc) + list(cc);
  const ideal = idealPartners(bundle, a, b, couple);
  const k = ideal.models;
  $('#idealSearch').textContent = adapterFor(bundle).searchText || '';
  $('#idealTable').innerHTML = `<thead><tr><th>Partner profile</th><th class="num">No divorce by year 10</th><th class="num">Model range</th><th class="num">Models scoring it above your partner as entered</th><th>Data support</th></tr></thead><tbody>`
    + `<tr class="ref"><td>Your partner as entered</td><td class="num">${pct(ideal.current.meanSurvival, 1)}</td><td class="num">${pct(ideal.current.minSurvival, 1)}–${pct(ideal.current.maxSurvival, 1)}</td><td class="num">—</td><td></td></tr>`
    + ideal.best.map((r) => `<tr><td>${esc(r.description)}</td><td class="num">${pct(r.meanSurvival, 1)}</td><td class="num">${pct(r.minSurvival, 1)}–${pct(r.maxSurvival, 1)}</td><td class="num">${r.beats} of ${k}</td><td>${r.inSupport ? 'in range' : 'extrapolated'}</td></tr>`).join('')
    + `<tr class="out"><td>Lowest-scoring of ${ideal.considered} profiles searched: ${esc(ideal.worst.description)}</td><td class="num">${pct(ideal.worst.meanSurvival, 1)}</td><td class="num">${pct(ideal.worst.minSurvival, 1)}–${pct(ideal.worst.maxSurvival, 1)}</td><td class="num">${ideal.worst.beats} of ${k}</td><td></td></tr></tbody>`;
  const tiedText = ideal.tied > 1
    ? `${ideal.tied} of ${ideal.considered} searched profiles have a model range that overlaps the top profile’s, so the models cannot tell them apart.`
    : `The top profile’s model range does not overlap any other of the ${ideal.considered} searched.`;
  const topsText = ideal.distinctTops === 1 ? `All ${k} models put the same profile first on their own.` : `On their own, the ${k} models put ${ideal.distinctTops} different profiles first.`;
  $('#idealNote').innerHTML = `<strong>No single ideal partner.</strong> ${tiedText} ${topsText} ${esc(adapterFor(bundle).ageNote || '')}`;
}

async function loadLenses() {
  let entries;
  try {
    entries = (await (await fetch('models/index.json')).json()).lenses;
  } catch {
    entries = [{ file: 'nlsy79_couples.json', adapter: 'nlsy79_couples' }];
  }
  const loaded = await Promise.all(entries.map(async (entry) => {
    try {
      const b = lensView(await (await fetch('models/' + encodeURIComponent(entry.file))).json());
      return { entry, bundle: b, summary: lensSummary(b, entry) };
    } catch {
      return null; // a lens that fails to load is skipped, not fatal
    }
  }));
  return loaded.filter(Boolean);
}

async function main() {
  $('fieldset[data-who="a"]').insertAdjacentHTML('beforeend', personFields('a'));
  $('fieldset[data-who="b"]').insertAdjacentHTML('beforeend', personFields('b'));
  [lenses, mortality] = await Promise.all([loadLenses(), fetch('data/us_mortality_wpp2024.json').then((r) => r.json()).catch(() => null)]);
  shareOod(lenses.map((l) => l.bundle));
  const scorableFirst = lenses.slice().sort((x, y) => Number(y.summary.scorable) - Number(x.summary.scorable));
  $('#lensSel').innerHTML = scorableFirst.map((l) => `<option value="${esc(l.summary.id)}">${esc(l.summary.label)}${l.summary.scorable ? '' : ' (listed only)'}</option>`).join('');
  const fromHash = decodeScenario(location.hash);
  readHashExtras(location.hash);
  applyFields(fromHash);
  if (fromHash.lens && lenses.some((l) => l.summary.id === fromHash.lens)) $('#lensSel').value = fromHash.lens;
  $('#form').addEventListener('input', render);
  $('#form').addEventListener('change', render);
  $('#lensSel').addEventListener('change', render);
  document.querySelector('main').addEventListener('click', (ev) => {
    const id = ev.target.closest('[data-lens]')?.dataset.lens;
    if (id) { $('#lensSel').value = id; render(); $('#lensSel').focus(); }
  });
  $('#explainModel').addEventListener('change', renderExplain);
  // Views (tabs): click, or arrow keys between tabs.
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const t of tabs) {
    t.addEventListener('click', () => { setView(t.dataset.view); render(); });
    t.addEventListener('keydown', (ev) => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
      if (!k) return;
      const next = tabs[(tabs.indexOf(t) + k + tabs.length) % tabs.length];
      next.focus();
      next.click();
      ev.preventDefault();
    });
  }
  const formCtx = () => readForm();
  initCandidates(formCtx, render);
  initBatch(() => ({ lenses }));
  initDashboard(render);
  $('#share').addEventListener('click', async () => {
    saveHash();
    let ok = false;
    try { await navigator.clipboard.writeText(location.href); ok = true; } catch { /* clipboard blocked */ }
    $('#shareStatus').textContent = ok ? 'Link copied.' : 'Copy the address bar to share this scenario.';
  });
  window.addEventListener('hashchange', () => { readHashExtras(location.hash); syncConstraintControls(); applyFields(decodeScenario(location.hash)); render(); });
  render();
}
main();
