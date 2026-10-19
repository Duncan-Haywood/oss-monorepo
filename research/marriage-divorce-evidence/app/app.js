// UI for the couple divorce-odds calculator. All computation is local (couple.js, engine.js).
import { SCHOOL, DEGREE, WORK, RELIGION, unsupported, project, constantSurvival, explain, groupedTerms, selfChanges, idealPartners, lensSummary, encodeScenario, decodeScenario } from './couple.js';

const $ = (s) => document.querySelector(s);
const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const DEFAULTS = {
  a: { sex: 'Woman', age: 36, school: '16–17 years', degree: 'Bachelor', wages: 55000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false },
  b: { sex: 'Man', age: 38, school: '13–15 years', degree: 'Some college', wages: 60000, work: '2,000+ hours', religion: 'Never', priorMarriage: false },
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
    <label>Age at first marriage <input name="${who}.firstMarriageAge" type="number" min="13" max="80" placeholder="this marriage if first"></label>`;
}

function readForm() {
  const f = new FormData($('#form'));
  const person = (w) => {
    const p = {};
    for (const k of ['sex', 'age', 'school', 'degree', 'wages', 'work', 'religion', 'firstMarriageAge']) p[k] = f.get(`${w}.${k}`);
    p.age = Number(p.age);
    p.wages = p.wages === '' ? NaN : Number(p.wages);
    p.priorMarriage = f.get(`${w}.priorMarriage`) === 'on';
    return p;
  };
  const couple = { yearsMarried: Number(f.get('yearsMarried') || 0), familyIncome: f.get('familyIncome') };
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
  const h = encodeScenario(formFields());
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
    </dl>${s.scorable ? '' : '<p class="note">This lens’s inputs do not map onto the form yet, so it shows what it covers but gives no number.</p>'}`;
  $('#lensTable').innerHTML = '<thead><tr><th>Lens</th><th>Target</th><th class="num">Models</th><th class="num">Best held-out gain</th><th>In the calculator</th></tr></thead><tbody>'
    + lenses.map(({ summary: z }) => `<tr><td>${esc(z.label)}</td><td>${esc(z.target)}</td><td class="num">${z.models}</td><td class="num">${z.best ? z.best.improvement.toFixed(1) + '%' : '—'}</td><td>${z.scorable ? 'yes' : 'listed only'}</td></tr>`).join('') + '</tbody>';
  return cur;
}

function render() {
  const cur = renderLens();
  saveHash();
  if (!cur.summary.scorable) {
    $('#refuse').hidden = false;
    $('#results').hidden = true;
    $('#refuse').innerHTML = `<strong>No estimate from this lens.</strong> ${esc(cur.summary.label)} uses inputs the form does not collect yet. Pick another lens to score a couple.`;
    return;
  }
  bundle = cur.bundle;
  const { a, b, couple, horizon } = readForm();
  const why = unsupported(a, b);
  $('#refuse').hidden = why.length === 0;
  $('#results').hidden = why.length > 0;
  if (why.length) {
    $('#refuse').innerHTML = '<strong>No estimate.</strong> ' + why.map(esc).join(' ');
    return;
  }
  const years = project(bundle, a, b, couple, horizon);
  state = { a, b, couple, years };
  renderTiles(years, couple);
  renderChart(years, couple);
  renderYearTable(years);
  renderModels(years);
  renderExplain();
  renderChanges(a, b, couple);
}

function at(years, couple, n) {
  return years.find((y) => y.year === couple.yearsMarried + n);
}

function renderTiles(years, couple) {
  const marks = [5, 10, 20, 30, years.length].filter((n, i, arr) => n <= years.length && arr.indexOf(n) === i);
  $('#tiles').innerHTML = marks.map((n) => {
    const y = at(years, couple, n);
    const all = years.slice(0, n).every((z) => z.inSupport);
    const label = n === years.length ? `Through year ${y.year} (“lifelong” proxy)` : `Through year ${y.year}`;
    return `<div class="tile${all ? '' : ' out'}"><div class="k">${label}</div><div class="v">${pct(y.meanSurvival)}</div>
      <div class="r">models: ${pct(y.minSurvival)}–${pct(y.maxSurvival)}</div>${all ? '' : '<div class="flag">includes years outside the data</div>'}</div>`;
  }).join('');
  const outside = years.filter((y) => !y.inSupport);
  const avg = constantSurvival(bundle, 10);
  $('#support').innerHTML = (outside.length
    ? `<strong>${outside.length} of ${years.length} projected years are outside the training data</strong> (${esc(outside[0].issues[0])}${outside[0].issues.length > 1 ? ', …' : ''}); treat those as extrapolation. `
    : 'Every projected year is inside the range of ages and marriage lengths the models were trained on. ')
    + `For reference, the average training rate alone gives ${pct(avg)} no divorce over 10 years.`;
}

function renderChart(years, couple) {
  const W = 900, H = 340, L = 44, R = 16, T = 12, B = 34;
  const n = years.length;
  const x0 = couple.yearsMarried;
  const xs = (yr) => L + ((yr - x0) / n) * (W - L - R);
  const minS = Math.min(...years.map((y) => y.minSurvival));
  const lo = Math.max(0, Math.floor((minS - 0.05) * 10) / 10);
  const ys = (v) => T + (1 - (v - lo) / (1 - lo)) * (H - T - B);
  const pts = [{ year: x0, meanSurvival: 1, minSurvival: 1, maxSurvival: 1, survival: Object.fromEntries(bundle.models.map((m) => [m.key, 1])) }, ...years];
  const line = (f) => pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.year).toFixed(1)},${ys(f(p)).toFixed(1)}`).join('');
  const band = line((p) => p.maxSurvival) + pts.slice().reverse().map((p) => `L${xs(p.year).toFixed(1)},${ys(p.minSurvival).toFixed(1)}`).join('') + 'Z';
  let shade = '';
  for (const y of years) if (!y.inSupport) shade += `<rect x="${xs(y.year - 1)}" y="${T}" width="${xs(y.year) - xs(y.year - 1) + 0.5}" height="${H - T - B}" fill="var(--outside)"/>`;
  let grid = '';
  for (let v = lo; v <= 1.0001; v += (1 - lo) / 5) grid += `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${pct(v)}</text>`;
  const step = n > 30 ? 10 : 5;
  for (let yr = x0; yr <= x0 + n; yr += step) grid += `<text x="${xs(yr)}" y="${H - 12}" text-anchor="middle">${yr}</text>`;
  grid += `<text x="${(W + L) / 2}" y="${H}" text-anchor="middle">year of marriage</text>`;
  const models = bundle.models.map((m) => `<path d="${line((p) => p.survival[m.key])}" fill="none" stroke="var(--model-line)" stroke-width="1"/>`).join('');
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance of no divorce by year of marriage">
    ${shade}${grid}<path d="${band}" fill="var(--band)"/>${models}
    <path d="${line((p) => p.meanSurvival)}" fill="none" stroke="var(--series-1)" stroke-width="2.5"/>
    <line id="cross" y1="${T}" y2="${H - B}" stroke="var(--text-muted)" stroke-dasharray="3 3" visibility="hidden"/>
    <circle id="dot" r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg>`;
  $('#legend').innerHTML = `<span><i style="background:var(--series-1)"></i>Average of ${bundle.models.length} models</span><span><i style="background:var(--band)"></i>Range across models</span><span><i style="background:var(--model-line);height:2px"></i>Each model</span><span><i style="background:var(--outside);border:1px solid var(--border)"></i>Outside training data</span>`;
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
      + bundle.models.map((m) => `${esc(m.label)}: ${pct(y.survival[m.key], 1)}`).join('<br>');
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
    + bundle.models.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${m.heldout.deviance_improvement_percent.toFixed(1)}%</td><td class="num">${(1000 * years[0].rates[m.key]).toFixed(1)} per 1,000</td><td class="num">${pct(y10.survival[m.key], 1)}</td><td class="num">${pct(last.survival[m.key], 1)}</td></tr>`).join('')
    + `<tr><td>Average training rate (no inputs)</td><td class="num">0%</td><td class="num">${(1000 * bundle.constant_rate).toFixed(1)} per 1,000</td><td class="num">${pct(constantSurvival(bundle, 10), 1)}</td><td class="num">${pct(constantSurvival(bundle, years.length), 1)}</td></tr></tbody>`;
}

function renderExplain() {
  const sel = $('#explainModel');
  if (sel.dataset.lens !== bundle.id) {
    sel.dataset.lens = bundle.id;
    sel.innerHTML = bundle.models.map((m) => `<option value="${m.key}"${m.key === 'additive_enriched' ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
  }
  const m = bundle.models.find((z) => z.key === sel.value);
  const { a, b, couple } = state;
  $('#explainYear').textContent = couple.yearsMarried + 1;
  const e = explain(bundle, m, a, b, couple, 0);
  if (e.tree) {
    const describe = (t) => t.steps.map((s) => `<li><code>${esc(s.feature.replace(/^(num|cat)__/, ''))}</code> ${s.left ? '≤' : '>'} ${s.threshold.toFixed(2)} (value ${s.value.toFixed(2)})</li>`).join('');
    $('#explain').innerHTML = `<div class="two path"><div><h3>Scored as the man</h3><ol>${describe(e.tree[0])}</ol><p>Leaf rate ${(1000 * e.tree[0].rate).toFixed(1)} per 1,000 per year (${e.tree[0].leafSamples.toLocaleString()} training intervals)</p></div>
      <div><h3>Scored as the woman</h3><ol>${describe(e.tree[1])}</ol><p>Leaf rate ${(1000 * e.tree[1].rate).toFixed(1)} per 1,000 per year (${e.tree[1].leafSamples.toLocaleString()} training intervals)</p></div></div>`;
    return;
  }
  const rows = groupedTerms(e.terms).filter(([, v]) => Math.abs(v) > 0.005);
  const maxAbs = Math.max(0.1, ...rows.map(([, v]) => Math.abs(v)));
  $('#explain').innerHTML = `<div class="bars">${rows.map(([k, v]) => {
    const w = (Math.abs(v) / maxAbs) * 50;
    const left = v < 0 ? 50 - w : 50;
    return `<div>${esc(k)}</div><div class="track"><div class="axis"></div><div class="bar" style="left:${left}%;width:${w}%;opacity:${v < 0 ? 0.55 : 1}"></div></div><div class="val">×${Math.exp(v).toFixed(2)}</div>`;
  }).join('')}</div><p class="small">Bars right of the line raise the model’s rate; left lower it. Reference rate ${(1000 * Math.exp(e.intercept)).toFixed(1)} per 1,000 per year.</p>`;
}

function renderChanges(a, b, couple) {
  const pts = (x) => `${x >= 0 ? '+' : '−'}${(100 * Math.abs(x)).toFixed(1)}`;
  const list = (opts) => opts.slice(0, 6).map((o) => {
    const cls = o.delta > 0 ? 'up' : 'down';
    return `<li>${esc(o.label)}: <span class="d ${cls}">${pts(o.delta)} pts</span> <small>models range ${pts(o.lo)} to ${pts(o.hi)} pts; ${o.agree} of ${o.models} agree on the direction</small></li>`;
  }).join('');
  const none = (opts) => (opts.length && opts[0].delta > 0 ? '' : '<li class="note">None of the changes searched raises the estimate in these models.</li>');
  const ca = selfChanges(bundle, 'a', a, b, couple);
  const cb = selfChanges(bundle, 'b', a, b, couple);
  $('#changesA').innerHTML = none(ca) + list(ca);
  $('#changesB').innerHTML = none(cb) + list(cb);
  const ideal = idealPartners(bundle, a, b, couple);
  const k = ideal.models;
  $('#idealTable').innerHTML = `<thead><tr><th>Partner age</th><th>Degree</th><th class="num">Partner wages</th><th class="num">No divorce by year 10</th><th class="num">Model range</th><th class="num">Models scoring it above your partner as entered</th><th>Data support</th></tr></thead><tbody>`
    + `<tr class="ref"><td colspan="3">Your partner as entered</td><td class="num">${pct(ideal.current.meanSurvival, 1)}</td><td class="num">${pct(ideal.current.minSurvival, 1)}–${pct(ideal.current.maxSurvival, 1)}</td><td class="num">—</td><td></td></tr>`
    + ideal.best.map((r) => `<tr><td>${r.partner.age}</td><td>${esc(r.partner.degree)}</td><td class="num">$${r.partner.wages.toLocaleString('en-US')}</td><td class="num">${pct(r.meanSurvival, 1)}</td><td class="num">${pct(r.minSurvival, 1)}–${pct(r.maxSurvival, 1)}</td><td class="num">${r.beats} of ${k}</td><td>${r.inSupport ? 'in range' : 'extrapolated'}</td></tr>`).join('')
    + `<tr class="out"><td colspan="3">Lowest-scoring of ${ideal.considered} profiles searched</td><td class="num">${pct(ideal.worst.meanSurvival, 1)}</td><td class="num">${pct(ideal.worst.minSurvival, 1)}–${pct(ideal.worst.maxSurvival, 1)}</td><td class="num">${ideal.worst.beats} of ${k}</td><td></td></tr></tbody>`;
  const tiedText = ideal.tied > 1
    ? `${ideal.tied} of ${ideal.considered} searched profiles have a model range that overlaps the top profile’s, so the models cannot tell them apart.`
    : `The top profile’s model range does not overlap any other of the ${ideal.considered} searched.`;
  const topsText = ideal.distinctTops === 1 ? `All ${k} models put the same profile first on their own.` : `On their own, the ${k} models put ${ideal.distinctTops} different profiles first.`;
  $('#idealNote').innerHTML = `<strong>No single ideal partner.</strong> ${tiedText} ${topsText} Partner age enters the models as that person’s own age, and older people divorced less in these data; it is not evidence of an ideal age gap.`;
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
      const b = await (await fetch('models/' + encodeURIComponent(entry.file))).json();
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
  lenses = await loadLenses();
  const scorableFirst = lenses.slice().sort((x, y) => Number(y.summary.scorable) - Number(x.summary.scorable));
  $('#lensSel').innerHTML = scorableFirst.map((l) => `<option value="${esc(l.summary.id)}">${esc(l.summary.label)}${l.summary.scorable ? '' : ' (listed only)'}</option>`).join('');
  const fromHash = decodeScenario(location.hash);
  applyFields(fromHash);
  if (fromHash.lens && lenses.some((l) => l.summary.id === fromHash.lens)) $('#lensSel').value = fromHash.lens;
  $('#form').addEventListener('input', render);
  $('#form').addEventListener('change', render);
  $('#lensSel').addEventListener('change', render);
  $('#explainModel').addEventListener('change', renderExplain);
  $('#share').addEventListener('click', async () => {
    saveHash();
    let ok = false;
    try { await navigator.clipboard.writeText(location.href); ok = true; } catch { /* clipboard blocked */ }
    $('#shareStatus').textContent = ok ? 'Link copied.' : 'Copy the address bar to share this scenario.';
  });
  window.addEventListener('hashchange', () => { applyFields(decodeScenario(location.hash)); render(); });
  render();
}
main();
