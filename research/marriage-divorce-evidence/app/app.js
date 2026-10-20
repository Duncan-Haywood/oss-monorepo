// UI for the couple divorce-odds calculator. All computation is local (couple.js, engine.js).
import { renderPopulation, renderJustMe, renderCandidates, renderDashboard, initCandidates, initBatch, initDashboard, readHashExtras, hashExtras, currentView, setView, syncConstraintControls, renderAcsBaselines } from './compare-ui.js';
import { encodeLiterature, decodeLiterature, renderLiteratureQuestions, readLiteratureInputs, renderLiteratureResult, renderNchs } from './literature-ui.js';
import { SCHOOL, DEGREE, WORK, RELIGION, RACE_ETH, refusals, lensNotes, adapterFor, scoringModels, referenceOnlyModels, excludeReason, project, lifelong, constantSurvival, explain, groupedTerms, selfChanges, coupleChanges, idealPartners, lensSummary, lensView, expandLens, shareOod, encodeScenario, decodeScenario, rowLabels, lensHorizons, primaryHorizon, isRateLens, stepAt, fmtYears, modelSkill, STAGES, lensStage, lensesForStage, defaultLens } from './couple.js';
import { valueFromContributions } from './engine.js';
import { QUALITY, HAPMAR, PARTY, PARENTS_VIEW, COUNT3, RELIGION_RAISED, MOTHER_EDU, MOTHER_AGE, ATTEND_DETAIL, OFTEN, STATUS, HOW_MET, PLACE, STATES, YESNO, MARRIAGES_BEFORE, SAT_ITEMS, SAT_SCALE, HOSTILE_ITEMS, HOSTILE_SCALE, QUESTION_LENSES } from './lens-adapters.js';
import { summariseAll, shortName } from './summary.js';
import { datingRefusals, datingRange, datingExternal, datingObserved, handover } from './dating.js';
import { inputsFromFields } from './scenarios.js';
import { initScenarios, renderScenarios, importScenariosFromHash } from './scenarios-ui.js';
import { renderReport } from './report-ui.js';

const $ = (s) => document.querySelector(s);
const pct = (x, d = 0) => (100 * x).toFixed(d) + '%';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const yrs = (h) => `${fmtYears(h)} year${h === 1 ? '' : 's'}`;

// The demo couple (illustrative, not data). Every question has "Prefer not to say".
// Default ages by stage: about the recent U.S. median ages at first marriage before the
// wedding; inside the NLSY79 couples' 35–64 for an existing marriage.
const STAGE_AGES = { before: { a: 28, b: 30 }, married: { a: 36, b: 38 } };
const DEFAULTS = {
  a: { sex: 'Woman', age: STAGE_AGES.before.a, school: '16–17 years', degree: 'Bachelor', wages: 55000, work: '2,000+ hours', religion: 'Less than weekly', priorMarriage: false, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes',
    bornUS: 'Yes', quality: 'Excellent', hapmar: 'Very happy', party: 'Democrat', parentsView: 'Approve', kidsBefore: '0', priorPartners: '0', enrolled: 'No', religionRaised: 'Catholic', attendDetail: 'Less than monthly', motherEdu: 'Some college', motherAgeFirst: '20–24', sat: Array(8).fill('Very satisfied') },
  b: { sex: 'Man', age: STAGE_AGES.before.b, school: '13–15 years', degree: 'Some college', wages: 60000, work: '2,000+ hours', religion: 'Never', priorMarriage: false, raceEth: 'White', priorChildren: 'No', intactFamily: 'Yes',
    bornUS: 'Yes', quality: 'Good', hapmar: 'Very happy', party: 'Independent, other or no preference', parentsView: 'Approve', kidsBefore: '0', priorPartners: '1', enrolled: 'No', religionRaised: 'Other Protestant', attendDetail: 'Never', motherEdu: 'High school', motherAgeFirst: '18–19', sat: ['Very satisfied', 'Very satisfied', 'Somewhat satisfied', 'Somewhat satisfied', 'Very satisfied', 'Somewhat satisfied', 'Very satisfied', 'Very satisfied'] },
};

const lensIds = (keys) => [...new Set(keys.flatMap((k) => QUESTION_LENSES[k] || []))];
let lensNameOf = (id) => id;
const usedBy = (keys) => `<small class="used">Used by: ${lensIds(keys).map((id) => esc(lensNameOf(id))).join(', ')}</small>`;
const opt = (list, v) => list.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
const sel = (name, label, list, v, note = '') => `<label>${label} <select name="${name}"><option value="">Prefer not to say</option>${opt(list, v)}</select>${note}</label>`;

function personFields(who) {
  const d = DEFAULTS[who];
  const you = who === 'a';
  return `
    <label>Sex <select name="${who}.sex">${opt(['Woman', 'Man'], d.sex)}</select></label>
    <label><span class="age-label">Age at the wedding</span> <input name="${who}.age" type="number" min="16" max="100" value="${d.age}"></label>
    <label>Years of schooling <select name="${who}.school">${opt(SCHOOL, d.school)}</select></label>
    <label>Highest degree <select name="${who}.degree">${opt(DEGREE, d.degree)}</select></label>
    <label>Wages last year, $ <input name="${who}.wages" type="number" min="0" step="1000" value="${d.wages}"><small>Leave blank if unknown; 0 if no paid work</small></label>
    <label>Work hours last year <select name="${who}.work">${opt(WORK, d.work)}</select></label>
    <label>Religious service attendance <select name="${who}.religion">${opt(RELIGION, d.religion)}</select></label>
    <label class="check"><input name="${who}.priorMarriage" type="checkbox"> Married before</label>
    <label>Age at first marriage <input name="${who}.firstMarriageAge" type="number" min="13" max="80" placeholder="this marriage if first"></label>
    <label>Children from an earlier relationship <select name="${who}.priorChildren">${opt(['No', 'Yes'], d.priorChildren)}</select></label>
    <label>Lived with both parents from birth to 18 <select name="${who}.intactFamily">${opt(['Yes', 'No'], d.intactFamily)}</select></label>
    <label>Race-ethnicity <select name="${who}.raceEth"><option value="">Prefer not to say</option>${opt(RACE_ETH, d.raceEth)}</select><small>Hispanic of any race; several lenses have no “unknown” group for it</small></label>
    <details class="qgroup"><summary>The relationship, in ${you ? 'your' : 'your partner’s'} words</summary>${usedBy(['quality', 'hapmar', 'party', 'parentsView'])}
      ${sel(`${who}.quality`, 'How would you describe the quality of your relationship?', QUALITY, d.quality)}
      <span data-stage="married">${sel(`${who}.hapmar`, 'Taken all together, how would you describe your marriage?', HAPMAR, d.hapmar, '<small>Only if married</small>')}</span>
      ${sel(`${who}.party`, 'Party preference', PARTY, d.party)}
      ${sel(`${who}.parentsView`, 'Your parents’ view of your partner', PARENTS_VIEW, d.parentsView)}
    </details>
    <details class="qgroup" data-open-before><summary>Background and life before the wedding</summary>${usedBy(['bornUS', 'marriagesBefore', 'kidsBefore', 'priorPartners', 'enrolled', 'religionRaised', 'attendDetail', 'motherEdu', 'motherAgeFirst'])}
      ${sel(`${who}.bornUS`, 'Born in the U.S.', YESNO, d.bornUS)}
      ${sel(`${who}.marriagesBefore`, 'If married before: how many earlier marriages', MARRIAGES_BEFORE, d.marriagesBefore)}
      ${sel(`${who}.kidsBefore`, 'Children born before the wedding (with anyone, including this partner)', COUNT3, d.kidsBefore)}
      ${sel(`${who}.priorPartners`, 'Earlier live-in partners, not counting this one', COUNT3, d.priorPartners)}
      ${sel(`${who}.enrolled`, 'In school or college at the wedding (or now, if not yet married)', YESNO, d.enrolled)}
      ${sel(`${who}.religionRaised`, 'Religion raised in', RELIGION_RAISED, d.religionRaised)}
      ${sel(`${who}.attendDetail`, 'Religious attendance, in more detail', ATTEND_DETAIL, d.attendDetail)}
      ${sel(`${who}.motherEdu`, 'Mother’s schooling', MOTHER_EDU, d.motherEdu)}
      ${sel(`${who}.motherAgeFirst`, 'Mother’s age at her first birth', MOTHER_AGE, d.motherAgeFirst)}
    </details>
    <details class="qgroup" data-stage="married"><summary>Newlywed study questions (optional)</summary>${usedBy(['satisfaction', 'observed', 'vulnerabilities', 'hostility'])}
      <fieldset class="sub"><legend>${you ? 'Your' : 'Your partner’s'} satisfaction with…</legend>
        ${SAT_ITEMS.map((it, i) => sel(`${who}.sat${i + 1}`, esc(it), SAT_SCALE, d.sat?.[i])).join('')}
        <small>The study used 4- and 5-point answers summed to 8–37; here all 8 use one 5-point scale and the sum is rescaled (an approximation).</small>
      </fieldset>
      <fieldset class="sub"><legend>When you two discuss a disagreement, how often ${you ? 'are you' : 'is your partner'}…</legend>
        ${sel(`${who}.obsPos`, 'warm, humorous, affectionate or attentive?', OFTEN, d.obsPos)}
        ${sel(`${who}.obsNeg`, 'hostile, critical, contemptuous, defensive or domineering?', OFTEN, d.obsNeg)}
        ${sel(`${who}.obsEff`, 'clear and calm, considering the other’s view, proposing realistic solutions?', OFTEN, d.obsEff)}
        <small>APPROXIMATION: the study’s model used trained observers’ codes of a videotaped discussion, not self-ratings. Each answer is mapped to a percentile of the observed codes; that mapping is unvalidated.</small>
      </fieldset>
      <fieldset class="sub"><legend>${you ? 'You' : 'Your partner'}, in the past months</legend>
        ${sel(`${who}.substance`, 'Problem drinking or drug use (past 9 months)', YESNO, '')}
        ${sel(`${who}.lowMood`, 'Often sad, hopeless, restless or nervous (last 30 days)', YESNO, '')}
        ${sel(`${who}.ace`, 'Adverse experiences in childhood', YESNO, '')}
        ${sel(`${who}.abuse`, 'Ever abused or assaulted (childhood family violence, sexual assault, a former partner)', YESNO, '')}
      </fieldset>
      <fieldset class="sub"><legend>Hostility in the past 9 months</legend>
        <p class="small">If any of this is happening, your safety comes first. In the U.S., the National Domestic Violence Hotline is 1-800-799-7233. These answers are never put in the shareable link.</p>
        <div class="host">${HOSTILE_ITEMS.map((it, i) => `<div class="host-row"><span>${esc(it)}</span>${sel(`${who}.hostTo${i + 1}`, 'done to you by your partner', HOSTILE_SCALE, '')}${sel(`${who}.hostBy${i + 1}`, 'done by you', HOSTILE_SCALE, '')}</div>`).join('')}</div>
      </fieldset>
    </details>`;
}

// The form's answers as model inputs (scenarios.js holds the one mapping, shared with saved scenarios).
function readForm() {
  return inputsFromFields(formFields(), { currentYear: new Date().getFullYear() });
}

let bundle;
let state;
let lenses = []; // [{ entry, bundle, summary }]
let mortality = null; // UN WPP 2024 U.S. death rates (data/us_mortality_wpp2024.json)
let evidence = null; // verified published hazard ratios (data/literature_evidence.json)
let nchs = null; // CDC/NCHS disruption life tables (data/nchs_disruption_tables.json)
let acs = null; // ACS one-year divorce baselines (data/acs_divorce_baselines.json)
let litAnswers = {}; // answers to the literature questions, mirrored in the # fragment
let stage = 'before'; // 'before' the wedding (default) or 'married'; mirrored in the # fragment
const stageLenses = () => lensesForStage(lenses, stage);

const fmtN = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—');

function formFields() {
  const out = {};
  for (const el of $('#form').elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  out.lens = $('#lensSel').value;
  out.stage = stage;
  // Before the wedding, the projection starts on the wedding day.
  if (stage === 'before') out.yearsMarried = '0';
  return out;
}

function applyFields(fields) {
  if (STAGES.includes(fields.stage)) setStage(fields.stage);
  const form = $('#form');
  for (const [k, v] of Object.entries(fields)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = v === '1';
    else el.value = v;
  }
}

// Put a saved scenario back into the form, every field (a blank answer clears the field), and its
// published-evidence answers; the comparison view stays open for editing and re-saving.
function loadScenario(sc) {
  for (const el of $('#form').elements) {
    if (!el.name) continue;
    const v = sc.fields[el.name];
    if (el.type === 'checkbox') el.checked = v === '1';
    else el.value = v ?? '';
  }
  litAnswers = { ...(sc.lit || {}) };
  if (STAGES.includes(sc.fields.stage)) setStage(sc.fields.stage);
  render();
}

function saveHash() {
  const extra = [hashExtras(), encodeLiterature(litAnswers)].filter(Boolean).join('&');
  const base = encodeScenario(formFields());
  const h = extra ? (base === '#' ? '#' + extra : base + '&' + extra) : base;
  if (h !== location.hash) history.replaceState(null, '', h === '#' ? location.pathname + location.search : h);
}

// Switch between "Before the wedding" and "Already married": the lens list, the summary, the
// just-me and candidate views all use only that stage's lenses; the form follows the stage.
function setStage(next) {
  if (!STAGES.includes(next) || !lenses.length) return;
  stage = next;
  for (const r of document.querySelectorAll('input[name="stagePick"]')) r.checked = r.value === stage;
  const keep = $('#lensSel').value;
  const list = stageLenses().slice().sort((x, y) => Number(y.summary.scorable) - Number(x.summary.scorable));
  $('#lensSel').innerHTML = list.map((l) => `<option value="${esc(l.summary.id)}">${esc(l.summary.label)}${l.summary.scorable ? '' : ' (listed only)'}</option>`).join('');
  $('#lensSel').value = list.some((l) => l.summary.id === keep) ? keep : defaultLens(lenses, stage).summary.id;
  const before = stage === 'before';
  // Untouched default ages follow the stage (a typed age is never changed).
  const ea = $('#form').elements['a.age'];
  const eb = $('#form').elements['b.age'];
  const other = STAGE_AGES[before ? 'married' : 'before'];
  if (ea && eb && Number(ea.value) === other.a && Number(eb.value) === other.b) { ea.value = STAGE_AGES[stage].a; eb.value = STAGE_AGES[stage].b; }
  $('#yearsMarriedField').hidden = before;
  $('fieldset.couple legend').textContent = before ? 'Your planned wedding' : 'Your marriage';
  for (const el of document.querySelectorAll('.age-label')) el.textContent = before ? 'Age at the wedding' : 'Age today';
  // Questions only married-couple lenses read are hidden before the wedding; the pre-wedding
  // background questions open, since most pre-wedding lenses need them.
  for (const el of document.querySelectorAll('[data-stage="married"]')) el.hidden = before;
  if (before) for (const el of document.querySelectorAll('[data-open-before]')) el.open = true;
  // The relationship status follows the stage (only the dating estimate and married lenses read it).
  const st = $('#form').elements.status;
  if (st && before && st.value.startsWith('Married')) st.value = st.value.endsWith('apart') ? 'Not married, not living together' : 'Not married, living together';
  if (st && !before && st.value.startsWith('Not married')) st.value = 'Married, living together';
  $('#datingBox').hidden = !before;
  $('#stageNote').textContent = before
    ? 'Scored only by lenses that start the clock on the wedding day and use facts known by then. Facts that change after the wedding (relationship quality, wages, children together) are not inputs here.'
    : 'For couples who are already married: lenses that score a marriage in progress, including relationship quality and marriage happiness.';
}

function skillText(s) {
  const sk = s.skill;
  if (!sk) return `${s.models} models; see the bundle for held-out metrics`;
  const ci = sk.gainCi ? ` (${sk.gainCi[0].toFixed(1)} to ${sk.gainCi[1].toFixed(1)})` : '';
  return `best scoring model (${esc(sk.label)}) beats a constant rate by ${sk.gain.toFixed(1)}%${ci} held out${Number.isFinite(sk.c) ? `; C-index ${sk.c.toFixed(2)}` : ''}${Number.isFinite(sk.auc) ? `; ${esc(sk.aucLabel)} ${sk.auc.toFixed(2)}` : ''}`;
}

function renderLens() {
  const cur = stageLenses().find((l) => l.summary.id === $('#lensSel').value) || defaultLens(lenses, stage);
  const s = cur.summary;
  const t = s.training;
  const people = t.respondents || t.couples || t.people || t.train_people || t.couple_years;
  $('#lensCard').innerHTML = `<dl class="facts">
      <dt>Population</dt><dd>${esc(s.population)}</dd>
      <dt>Target</dt><dd>${esc(s.target)}</dd>
      <dt>Training data</dt><dd>${[people && fmtN(people) + (t.couples ? ' couples' : ' people'), t.intervals && fmtN(t.intervals) + ' intervals', (t.events || t.train_divorces) && fmtN(t.events || t.train_divorces) + ' break-ups'].filter(Boolean).join(' · ') || 'not stated'}</dd>
      <dt>Held-out skill</dt><dd>${skillText(s)}</dd>
      ${s.scorable ? `<dt>Horizons</dt><dd>${isRateLens(cur.bundle) ? 'year by year (tiles at 5, 10, 20 … years)' : lensHorizons(cur.bundle).map(yrs).join(', ') + ' only: the lens’s own follow-up, never extrapolated'}</dd><dt>Uses from the form</dt><dd>${esc(adapterFor(cur.bundle).uses)}</dd>` : ''}
    </dl>${s.scorable ? '' : '<p class="note">This lens’s inputs do not map onto the form, or its outcome is not divorce, so it shows what it covers but gives no number.</p>'}`;
  $('#lensTable').innerHTML = '<thead><tr><th>Lens</th><th>Target</th><th class="num">Models</th><th class="num">Best held-out gain</th><th>View</th><th>In the calculator</th></tr></thead><tbody>'
    + lenses.map(({ summary: z, bundle: lb }) => `<tr><td>${esc(z.label)}</td><td>${esc(z.target)}</td><td class="num">${z.models}</td><td class="num">${z.best ? z.best.improvement.toFixed(1) + '%' : '—'}</td><td>${lensStage(lb) === 'before' ? 'Before the wedding' : 'Already married'}</td><td>${z.scorable ? 'scored' : 'listed only'}</td></tr>`).join('') + '</tbody>';
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
  $('fieldset[data-who="b"] legend').textContent = v === 'dashboard' ? 'Reference partner (the profile searches start from)' : v === 'report' ? 'The person you are looking at' : 'Your partner';
  $('.share').hidden = v === 'batch';
  for (const [id, view] of [['justMe', 'justme'], ['candidates', 'candidates'], ['dashboard', 'dashboard'], ['batch', 'batch'], ['scenarios', 'scenarios'], ['report', 'report']]) $('#' + id).hidden = v !== view;
  $('#summaryBox').hidden = v !== 'couple';
  $('#datingBox').hidden = v !== 'couple' || stage !== 'before';
  if (v !== 'couple') { $('#results').hidden = true; $('#refuse').hidden = true; }
}

function render() {
  const cur = renderLens();
  saveHash();
  applyView();
  const v = currentView();
  const f = readForm();
  if (v !== 'couple') {
    if (v === 'justme') renderJustMe({ lenses: stageLenses(), a: f.a, couple: f.couple });
    else if (v === 'candidates') renderCandidates({ lenses: stageLenses(), a: f.a, couple: f.couple, mortality });
    else if (v === 'scenarios') renderScenarios();
    else if (v === 'report') renderReport({ el: $('#reportOut'), lens: cur, lenses, a: f.a, b: f.b, couple: f.couple });
    else if (v === 'dashboard') {
      if (!cur.summary.scorable) $('#dashOut').innerHTML = '<p class="note">This lens gives no numbers; pick a scorable lens at the top.</p>';
      else renderDashboard({ bundle: cur.bundle, a: f.a, b: f.b, couple: f.couple, label: cur.summary.label });
    }
    return;
  }
  renderSummary(cur, f.a, f.b, f.couple);
  renderDating(cur, f.a, f.b, f.couple);
  if (!cur.summary.scorable) {
    $('#refuse').hidden = false;
    $('#results').hidden = true;
    $('#refuse').innerHTML = `<strong>No estimate from this lens.</strong> ${esc(cur.summary.label)} uses inputs the form does not collect, or an outcome that is not divorce. Pick another lens to score a couple.`;
    return;
  }
  bundle = cur.bundle;
  const { a, b, couple, horizon } = f;
  const why = refusals(bundle, a, b, couple);
  $('#refuse').hidden = why.length === 0;
  $('#results').hidden = why.length > 0;
  if (why.length) {
    const others = otherLenses(cur, a, b, couple);
    $('#refuse').innerHTML = '<strong>No estimate from this lens.</strong> ' + why.map(esc).join(' ')
      + (others ? ` Another lens can score this couple: ${others}.` : '');
    return;
  }
  const H = isRateLens(bundle) ? horizon : Math.max(...lensHorizons(bundle));
  const years = project(bundle, a, b, couple, H);
  state = { a, b, couple, years };
  renderTiles(years, couple);
  renderPopulation($('#popPanel'), bundle, a, b, couple);
  renderAcsBaselines($('#acsPanel'), acs, a, b, couple);
  renderLifelong(a, b, couple, horizon);
  renderNchs($('#nchsPanel'), nchs, { a, b, couple, years, lensLabel: cur.summary.label });
  renderLiterature(cur, a, b, couple, years);
  renderChart(years, couple);
  renderYearTable(years);
  renderModels(years);
  renderExplain();
  renderChanges(a, b, couple);
}

// The published-evidence layer: questions for factors this lens does not model, and the
// adjusted curve. Labelled literature-based; it never replaces the lens's own estimate. It works
// on a year-by-year curve, so short-horizon lenses do not get it.
function renderLiterature(cur, a, b, couple, years) {
  renderLiteratureQuestions($('#literature'), cur.summary.id, evidence, litAnswers);
  if (!isRateLens(cur.bundle)) {
    $('#litOut').innerHTML = `<p class="note">The literature-based adjustment shifts a year-by-year curve to 5, 10 and 20 years; this lens covers only ${lensHorizons(cur.bundle).map(yrs).join(', ')}, so no adjustment is applied here. Pick a lens with a year-by-year projection to see it.</p>`;
    return;
  }
  renderLiteratureResult($('#litOut'), { lens: cur.summary.id, evidence, litAnswers, a, b, years, yearsMarried: couple.yearsMarried });
}

// Summary across lenses: each scorable lens's own estimate at the horizons it supports, its
// held-out skill and how well this couple fits its data, then a synthesis that pools nothing.
function renderSummary(cur, a, b, couple) {
  const s = summariseAll(stageLenses(), a, b, couple);
  const rows = s.rows.map((r) => {
    const name = `${esc(r.label)}${r.id === cur.summary.id ? ' <small>(selected)</small>' : ` <button type="button" class="link" data-lens="${esc(r.id)}">view</button>`}`;
    if (r.status !== 'ok') return `<tr class="out"><td>${name}</td><td colspan="4">${r.status === 'abstain' ? 'no number: ' : ''}${esc(r.reason)}</td></tr>`;
    const est = r.horizons.map((h) => `<span class="est"><b>${pct(1 - h.mean, 1)}</b> by ${yrs(h.h)}<small>models ${pct(1 - h.max, 1)}–${pct(1 - h.min, 1)}${h.inSupport ? '' : '; extrapolated'}</small></span>`).join('');
    const sk = r.skill;
    const skill = sk ? `gain ${sk.gain.toFixed(1)}%${sk.gainCi ? ` (${sk.gainCi[0].toFixed(1)}–${sk.gainCi[1].toFixed(1)})` : ''}${Number.isFinite(sk.c) ? `<small>C-index ${sk.c.toFixed(2)}${sk.group ? ` among ${esc(sk.group)} (${sk.cPooled.toFixed(2)} pooled)` : ''}</small>` : ''}${Number.isFinite(sk.auc) ? `<small>${esc(sk.aucLabel)} ${sk.auc.toFixed(2)}</small>` : ''}` : '—';
    const fit = `${r.fit.inSupport ? 'inside its data' : `${r.fit.outside} step${r.fit.outside > 1 ? 's' : ''} outside its data`}<small>${Number.isFinite(r.fit.ood) ? `more unusual than ${Math.round(r.fit.ood)}% of its people (abstains above ${r.fit.abstainAbove})` : 'no typicality check in this lens'}</small>`;
    const pc = r.percentile ? `${r.percentile.below || r.percentile.above ? esc(r.percentile.label) : 'p' + Math.round(r.percentile.percentile)}<small>${r.percentile.quantity === 'annual_rate' ? 'annual rate now' : `risk by ${yrs(r.percentile.horizon)}`}</small>` : '<small>no reference</small>';
    return `<tr${r.fit.inSupport ? '' : ' class="out"'}><td>${name}<small>${esc(r.outcome)}</small></td><td class="ests">${est}</td><td class="num">${pc}</td><td>${skill}</td><td>${fit}</td></tr>`;
  });
  $('#summaryTable').innerHTML = '<thead><tr><th scope="col">Lens and its outcome</th><th scope="col">Chance of a break-up (model range)</th><th class="num" scope="col">Population percentile</th><th scope="col">Held-out skill</th><th scope="col">How well you fit its data</th></tr></thead><tbody>' + rows.join('') + '</tbody>';
  $('#synthesis').innerHTML = s.synthesis.lines.map((l) => `<p>${esc(l)}</p>`).join('');
}

// Not engaged yet: will the couple marry each other, or break up first (HCMST dating models,
// combined per the bundles' how_to_combine), and how that hands over to the selected
// before-the-wedding lens. Only in the before-the-wedding view.
function renderDating(cur, a, b, couple) {
  const box = $('#datingOut');
  if (stage !== 'before') return;
  const mB = lenses.find((l) => l.summary.id === 'hcmst_dating_marriage')?.bundle;
  const bB = lenses.find((l) => l.summary.id === 'hcmst_dating_breakup')?.bundle;
  if (!mB || !bB) { box.innerHTML = '<p class="note">The dating-couple models did not load.</p>'; return; }
  const why = datingRefusals(a, b, couple);
  if (why.length) { box.innerHTML = `<p class="note"><strong>No estimate.</strong> ${why.map(esc).join(' ')}</p>`; return; }
  const ch = datingRange(mB, bB, a, b, couple);
  const obs = datingObserved(mB);
  const H = Math.round(ch.years * 10) / 10;
  const rng = (s) => (ch.models > 1 ? `models ${pct(s.min)}–${pct(s.max)}` : 'one model');
  const exM = datingExternal(mB, 'married');
  const exB = datingExternal(bB, 'broke_up');
  let hand = '';
  if (cur.summary.scorable && isRateLens(cur.bundle) && !refusals(cur.bundle, a, b, couple).length) {
    const s10 = project(cur.bundle, a, b, couple, 10)[9].meanSurvival;
    hand = `<p class="small">If you marry: ${esc(shortName(cur.summary.label, cur.summary.id))} puts the chance of no break-up in the first 10 years of the marriage at ${pct(s10)}. Multiplying the two, about <b>${pct(handover(ch, s10))}</b> of couples like you would marry within ${H} years and still be married 10 years after the wedding: an approximation that joins two surveys as if independent.</p>`;
  }
  box.innerHTML = `<div class="tiles three">
      <div class="tile"><div class="k">Marry each other within ${H} years</div><div class="v">${pct(ch.married.mean)}</div><div class="r">${rng(ch.married)}; ${ch.perspectives === 2 ? 'both your ratings' : 'one rating'}</div></div>
      <div class="tile"><div class="k">Break up first</div><div class="v">${pct(ch.brokeUp.mean)}</div><div class="r">${rng(ch.brokeUp)}</div></div>
      <div class="tile"><div class="k">Still together, not married</div><div class="v">${pct(ch.stillTogether.mean)}</div><div class="r">at ${H} years</div></div>
    </div>
    <p class="small">HCMST followed ${obs ? obs.couples.toLocaleString('en-US') : '939'} unmarried couples (dating or living together, different- or same-sex) from 2009 to 2017${obs ? `; overall ${pct(obs.married)} married and ${pct(obs.brokeUp)} broke up first` : ''}. Held out, the marriage model's AUC is ${mB.models.find((m) => m.key === 'additive').heldout.auc.toFixed(2)} and the break-up model's ${bB.models.find((m) => m.key === 'additive').heldout.auc.toFixed(2)}${exM && exB ? `; on HCMST's later 2017 cohort, never used in training, ${exM.auc.toFixed(2)} and ${exB.auc.toFixed(2)} (${esc(exM.window)})` : ''}. The two outcomes were modelled separately, so the split is approximate.${ch.issues ? ' Some inputs are outside the survey’s data, so treat the numbers as extrapolation.' : ''}</p>${hand}`;
}

// Links to the other lenses that can score this couple, inside their own data range.
function otherLenses(cur, a, b, couple) {
  const ok = stageLenses().filter((l) => l !== cur && l.summary.scorable && !refusals(l.bundle, a, b, couple).length
    && project(l.bundle, a, b, couple, primaryHorizon(l.bundle)).every((y) => y.inSupport));
  return ok.map((l) => `<button type="button" class="link" data-lens="${esc(l.summary.id)}">${esc(shortName(l.summary.label, l.summary.id))}</button>`).join(', ');
}

// A lens with one scoring model has no spread across models; say so rather than print "x–x".
const rangeText = (lo, hi) => (scoringModels(bundle).length > 1 ? `models: ${pct(lo)}–${pct(hi)}` : 'one model, so no model range');

function renderTiles(years, couple) {
  const rate = isRateLens(bundle);
  const marks = rate ? [5, 10, 20, 30, years.length].filter((n, i, arr) => n <= years.length && arr.indexOf(n) === i) : lensHorizons(bundle);
  const last = years[years.length - 1].elapsed;
  $('#tiles').innerHTML = marks.map((n) => {
    const y = stepAt(years, n);
    const all = years.filter((z) => z.elapsed <= n + 0.01).every((z) => z.inSupport);
    const label = rate ? (n === last ? `Through year ${y.year} (if both partners live)` : `Through year ${y.year}`) : `No break-up within ${yrs(n)} from ${adapterFor(bundle).referenceAt === 'now' ? 'today' : 'the wedding'}`;
    return `<div class="tile${all ? '' : ' out'}"><div class="k">${label}</div><div class="v">${pct(y.meanSurvival)}</div>
      <div class="r">${rangeText(y.minSurvival, y.maxSurvival)}</div>${all ? '' : '<div class="flag">includes years outside the data</div>'}</div>`;
  }).join('');
  const outside = years.filter((y) => !y.inSupport);
  const avg = constantSurvival(bundle, 10);
  $('#support').innerHTML = (outside.length
    ? `<strong>${outside.length} of ${years.length} projected steps are outside the training data</strong> (${esc(outside[0].issues[0])}${outside[0].issues.length > 1 ? ', …' : ''}); treat those as extrapolation. `
    : 'Every projected step is inside the range the models were trained on. ')
    + (rate ? `For reference, the average training rate alone gives ${pct(avg)} no divorce over 10 years.` : `This lens covers ${lensHorizons(bundle).map(yrs).join(', ')} only and is never projected further.`)
    + observedReference()
    + lensNotes(bundle, state.a, state.b, couple).map((n) => ' ' + esc(n)).join('');
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
  const all = ws.find((g) => /^All first marriages/.test(g.group));
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
  if (!L) {
    $('#lifelong').innerHTML = `<p class="note">This lens covers only ${lensHorizons(bundle).map(yrs).join(', ')}, so it gives no lifelong figure; projecting it further would be extrapolation.</p>`;
    return;
  }
  const tile = (k, s, note) => `<div class="tile"><div class="k">${k}</div><div class="v">${pct(s.mean)}</div><div class="r">${rangeText(s.min, s.max)}</div>${note ? `<div class="flag">${note}</div>` : ''}</div>`;
  $('#lifelong').innerHTML = `<div class="tiles three">${tile('Lifelong: ends only when a partner dies', L.widowhood)}${tile('Ends in divorce', L.divorce)}${tile(`Still married, both alive, after year ${L.lastYear}`, L.stillMarried)}</div>`
    + `<p class="small">Each year, the lens’s divorce rate competes with the death of either partner (UN World Population Prospects 2024 U.S. death rates by age, sex and calendar year, CC BY 3.0 IGO). The three shares add to 100%. These are population death rates: married people live longer than average and spouses’ deaths are linked, neither of which is modelled.${L.extrapolated ? ` ${L.extrapolated} of the ${L.horizon} years use divorce rates outside the lens’s data.` : ''}</p>`;
}

function renderChart(years, couple) {
  const W = 900, H = 340, L = 44, R = 16, T = 12, B = 34;
  const span = years[years.length - 1].elapsed;
  const x0 = couple.yearsMarried;
  const xs = (t) => L + (t / span) * (W - L - R);
  const minS = Math.min(...years.map((y) => y.minSurvival));
  const lo = Math.max(0, Math.floor((minS - 0.05) * 10) / 10);
  const ys = (v) => T + (1 - (v - lo) / (1 - lo)) * (H - T - B);
  const pts = [{ elapsed: 0, meanSurvival: 1, minSurvival: 1, maxSurvival: 1, survival: Object.fromEntries(scoringModels(bundle).map((m) => [m.key, 1])) }, ...years];
  const line = (f) => pts.map((p, i) => `${i ? 'L' : 'M'}${xs(p.elapsed).toFixed(1)},${ys(f(p)).toFixed(1)}`).join('');
  const band = line((p) => p.maxSurvival) + pts.slice().reverse().map((p) => `L${xs(p.elapsed).toFixed(1)},${ys(p.minSurvival).toFixed(1)}`).join('') + 'Z';
  let shade = '';
  for (const y of years) if (!y.inSupport) shade += `<rect x="${xs(y.start)}" y="${T}" width="${xs(y.elapsed) - xs(y.start) + 0.5}" height="${H - T - B}" fill="var(--outside)"/>`;
  let grid = '';
  for (let v = lo; v <= 1.0001; v += (1 - lo) / 5) grid += `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${pct(v)}</text>`;
  const rate = isRateLens(bundle);
  const step = span > 30 ? 10 : span > 12 ? 5 : span > 4 ? 2 : 1;
  for (let t = 0; t <= span + 1e-9; t += step) grid += `<text x="${xs(t)}" y="${H - 12}" text-anchor="middle">${rate ? x0 + t : t}</text>`;
  grid += `<text x="${(W + L) / 2}" y="${H}" text-anchor="middle">${rate ? 'year of marriage' : `years from ${adapterFor(bundle).referenceAt === 'now' ? 'today' : 'the wedding'}`}</text>`;
  const models = scoringModels(bundle).map((m) => `<path d="${line((p) => p.survival[m.key])}" fill="none" stroke="var(--model-line)" stroke-width="1"/>`).join('');
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance of no break-up over time">
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
    const t = (((ev.clientX - r.left) / r.width) * W - L) / (W - L - R) * span;
    const y = years.reduce((best, z) => (Math.abs(z.elapsed - t) < Math.abs(best.elapsed - t) ? z : best));
    $('#cross').setAttribute('x1', xs(y.elapsed)); $('#cross').setAttribute('x2', xs(y.elapsed)); $('#cross').setAttribute('visibility', 'visible');
    $('#dot').setAttribute('cx', xs(y.elapsed)); $('#dot').setAttribute('cy', ys(y.meanSurvival)); $('#dot').setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${rate ? `Year ${y.year}` : `By ${yrs(y.elapsed)}`}</b>${y.inSupport ? '' : ' · outside data'}<br>No break-up so far: <b>${pct(y.meanSurvival, 1)}</b> (${pct(y.minSurvival, 1)}–${pct(y.maxSurvival, 1)})<br>Break-up in this ${rate ? 'year' : 'period'}: ${pct(y.meanYearProb, 2)}<br>`
      + scoringModels(bundle).map((m) => `${esc(m.label)}: ${pct(y.survival[m.key], 1)}`).join('<br>');
    tip.style.left = Math.min(window.innerWidth - 300, ev.clientX + 14) + 'px';
    tip.style.top = ev.clientY + 14 + 'px';
  });
  $('#hit').addEventListener('pointerleave', () => { tip.hidden = true; $('#cross').setAttribute('visibility', 'hidden'); $('#dot').setAttribute('visibility', 'hidden'); });
}

function renderYearTable(years) {
  const rate = isRateLens(bundle);
  $('#yearTable').innerHTML = `<thead><tr><th>${rate ? 'Year of marriage' : 'Period'}</th><th class="num">Break-up in that ${rate ? 'year' : 'period'}</th><th class="num">Range across models</th><th class="num">No break-up by its end</th><th>Data support</th></tr></thead><tbody>`
    + years.map((y) => {
      const v = Object.values(y.yearProb);
      return `<tr class="${y.inSupport ? '' : 'out'}"><td>${rate ? y.year : `${esc(y.label || '')}: ${fmtYears(y.start)}–${fmtYears(y.elapsed)} years`}</td><td class="num">${pct(y.meanYearProb, 2)}</td><td class="num">${pct(Math.min(...v), 2)}–${pct(Math.max(...v), 2)}</td><td class="num">${pct(y.meanSurvival, 1)}</td><td>${y.inSupport ? 'in range' : esc(y.issues.join('; '))}</td></tr>`;
    }).join('') + '</tbody>';
}

function renderModels(years) {
  const rate = isRateLens(bundle);
  const ph = primaryHorizon(bundle);
  const yM = stepAt(years, ph) || years[years.length - 1];
  const last = years[years.length - 1];
  const gain = (m) => { const g = modelSkill(m).gain; return Number.isFinite(g) ? g.toFixed(1) + '%' : '—'; };
  const first = (v) => (rate ? `${(1000 * v).toFixed(1)} per 1,000` : pct(v, 2));
  const col = rate ? 'Divorce rate, first year' : `Break-up chance, first period (${fmtYears(years[0].elapsed)} y)`;
  $('#modelTable').innerHTML = `<thead><tr><th>Model</th><th class="num">Held-out improvement vs a constant</th><th class="num">${col}</th><th class="num">No break-up, ${rate ? 'year ' + yM.year : yrs(yM.elapsed)}</th><th class="num">No break-up, ${rate ? 'year ' + last.year : yrs(last.elapsed)}</th></tr></thead><tbody>`
    + scoringModels(bundle).map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${gain(m)}</td><td class="num">${first(rate ? years[0].rates[m.key] : years[0].yearProb[m.key])}</td><td class="num">${pct(yM.survival[m.key], 1)}</td><td class="num">${pct(last.survival[m.key], 1)}</td></tr>`).join('')
    + referenceOnlyModels(bundle).map((m) => {
      const p = project(bundle, state.a, state.b, state.couple, rate ? years.length : last.elapsed, [m]);
      const pm = stepAt(p, yM.elapsed);
      return `<tr class="out"><td>${esc(m.label)} — ${esc(excludeReason(m, bundle))}</td><td class="num">${gain(m)}</td><td class="num">${first(rate ? p[0].rates[m.key] : p[0].yearProb[m.key])}</td><td class="num">${pct(pm.survival[m.key], 1)}</td><td class="num">${pct(p[p.length - 1].survival[m.key], 1)}</td></tr>`;
    }).join('')
    + (rate ? `<tr><td>Average training rate (no inputs)</td><td class="num">0%</td><td class="num">${(1000 * bundle.constant_rate).toFixed(1)} per 1,000</td><td class="num">${pct(constantSurvival(bundle, 10), 1)}</td><td class="num">${pct(constantSurvival(bundle, years.length), 1)}</td></tr>` : '') + '</tbody>';
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
  const rate = isRateLens(bundle);
  $('#explainYear').textContent = rate ? `marriage year ${couple.yearsMarried + 1}` : `the first period (${fmtYears(state.years[0].start)}–${fmtYears(state.years[0].elapsed)} years)`;
  const e = explain(bundle, m, a, b, couple, 0);
  if (e.tree) {
    const describe = (t) => t.steps.map((s) => `<li><code>${esc(s.feature.replace(/^(num|cat)__/, ''))}</code> ${s.left ? '≤' : '>'} ${s.threshold.toFixed(2)} (value ${s.value.toFixed(2)})</li>`).join('');
    const labels = rowLabels(bundle, a, b, couple);
    const leaf = (t) => (!rate && !/poisson/i.test(m.label) ? `Leaf: ${pct(t.rate, 2)} chance in the period` : `Leaf rate ${(1000 * t.rate).toFixed(1)} per 1,000 per year`);
    $('#explain').innerHTML = `<div class="two path">${e.tree.map((t, i) => `<div><h3>${esc(labels[i] || '')}</h3><ol>${describe(t)}</ol><p>${leaf(t)} (${t.leafSamples.toLocaleString('en-US')} training rows)</p></div>`).join('')}</div>`;
    return;
  }
  // Forest attributions are in rate units; every other model's are logs (rate or odds).
  const rateScale = e.scale === 'rate';
  const fmtVal = (v) => (rateScale ? `${v >= 0 ? '+' : '−'}${(1000 * Math.abs(v)).toFixed(1)}/1,000` : `×${Math.exp(v).toFixed(2)}`);
  const unit = { rate: 'Values are changes in the annual rate per 1,000 couples (path attributions summed over the forest’s trees).', hazard_log_odds: 'Values multiply the odds of a break-up in the year.', log_odds: 'Values multiply the odds of a break-up in the period.', log_rate: 'Values multiply the rate.' }[e.scale] || '';
  const parts = e.perRow || [e];
  const grouped = parts.map((p) => groupedTerms(p.terms).filter(([, v]) => Math.abs(rateScale ? 1000 * v : v) > 0.005));
  // One scale across the perspectives, so their bars compare.
  const maxAbs = Math.max(rateScale ? 0.0001 : 0.1, ...grouped.flat().map(([, v]) => Math.abs(v)));
  const bars = (rows) => `<div class="bars">${rows.map(([k, v]) => {
    const w = (Math.abs(v) / maxAbs) * 50;
    const left = v < 0 ? 50 - w : 50;
    return `<div>${esc(k)}</div><div class="track"><div class="axis"></div><div class="bar" style="left:${left}%;width:${w}%;opacity:${v < 0 ? 0.55 : 1}"></div></div><div class="val">${fmtVal(v)}</div>`;
  }).join('')}</div>`;
  const value = (p) => valueFromContributions(p);
  const show = (x) => (e.scale === 'log_odds' ? `${pct(x, 1)} chance in the period` : `${(1000 * x).toFixed(1)} per 1,000 per year`);
  const ref = e.scale === 'log_rate' ? ` Reference rate ${(1000 * Math.exp(e.intercept)).toFixed(1)} per 1,000 per year.` : '';
  if (parts.length > 1) {
    const labels = rowLabels(bundle, a, b, couple);
    const vals = parts.map(value);
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    $('#explain').innerHTML = `<div class="two">${parts.map((p, i) => `<div><h3>${esc(labels[i] || `Perspective ${i + 1}`)}</h3>${bars(grouped[i])}<p class="small">This perspective: ${show(vals[i])}. Its bars ${rateScale ? 'add up' : 'multiply'} exactly to it.</p></div>`).join('')}</div>`
      + `<p class="small">Bars right of the line raise the model’s risk; left lower it. ${unit}${ref} The couple’s estimate is the average of the ${parts.length} perspectives: ${show(mean)}.</p>`;
    return;
  }
  $('#explain').innerHTML = `${bars(grouped[0])}<p class="small">Bars right of the line raise the model’s risk; left lower it. ${unit}${ref}</p>`;
}

function renderChanges(a, b, couple) {
  const n = primaryHorizon(bundle);
  $('#changesHorizon').textContent = yrs(n);
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
  const ad = adapterFor(bundle);
  $('#idealSearch').textContent = ad.searchText || '';
  if (!ad.partnerGrid(a, b).length) {
    $('#idealNote').innerHTML = '<strong>No partner search in this lens.</strong> Its models do not take the partner’s traits.';
    $('#idealTable').innerHTML = '';
    return;
  }
  const ideal = idealPartners(bundle, a, b, couple);
  const k = ideal.models;
  if (!ideal.current || !ideal.best.length) {
    $('#idealNote').innerHTML = '<strong>No partner profile could be scored here.</strong>';
    $('#idealTable').innerHTML = '';
    return;
  }
  $('#idealTable').innerHTML = `<thead><tr><th>Partner profile</th><th class="num">No break-up by ${yrs(n)}</th><th class="num">Model range</th><th class="num">Models scoring it above your partner as entered</th><th>Data support</th></tr></thead><tbody>`
    + `<tr class="ref"><td>Your partner as entered</td><td class="num">${pct(ideal.current.meanSurvival, 1)}</td><td class="num">${pct(ideal.current.minSurvival, 1)}–${pct(ideal.current.maxSurvival, 1)}</td><td class="num">—</td><td></td></tr>`
    + ideal.best.map((r) => `<tr><td>${esc(r.description)}</td><td class="num">${pct(r.meanSurvival, 1)}</td><td class="num">${pct(r.minSurvival, 1)}–${pct(r.maxSurvival, 1)}</td><td class="num">${r.beats} of ${k}</td><td>${r.inSupport ? 'in range' : 'extrapolated'}</td></tr>`).join('')
    + `<tr class="out"><td>Lowest-scoring of ${ideal.considered} profiles searched: ${esc(ideal.worst.description)}</td><td class="num">${pct(ideal.worst.meanSurvival, 1)}</td><td class="num">${pct(ideal.worst.minSurvival, 1)}–${pct(ideal.worst.maxSurvival, 1)}</td><td class="num">${ideal.worst.beats} of ${k}</td><td></td></tr></tbody>`;
  const tiedText = ideal.tied > 1
    ? `${ideal.tied} of ${ideal.considered} searched profiles have a model range that overlaps the top profile’s, so the models cannot tell them apart.`
    : `The top profile’s model range does not overlap any other of the ${ideal.considered} searched.`;
  const topsText = ideal.distinctTops === 1 ? `All ${k} models put the same profile first on their own.` : `On their own, the ${k} models put ${ideal.distinctTops} different profiles first.`;
  $('#idealNote').innerHTML = `<strong>No single ideal partner.</strong> ${tiedText} ${topsText} ${esc(ad.ageNote || '')}`;
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
      const views = expandLens(lensView(await (await fetch('models/' + encodeURIComponent(entry.file))).json()));
      return views.map((b) => ({ entry, bundle: b, summary: lensSummary(b, b.view_of ? {} : entry) }));
    } catch {
      return []; // a lens that fails to load is skipped, not fatal
    }
  }));
  return loaded.flat();
}

async function main() {
  const json = (f) => fetch(f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  [lenses, mortality, evidence, nchs, acs] = await Promise.all([loadLenses(), json('data/us_mortality_wpp2024.json'), json('data/literature_evidence.json'), json('data/nchs_disruption_tables.json'), json('data/acs_divorce_baselines.json')]);
  lensNameOf = (id) => shortName(lenses.find((l) => l.summary.id === id)?.summary.label || id, id);
  $('fieldset[data-who="a"]').insertAdjacentHTML('beforeend', personFields('a'));
  $('fieldset[data-who="b"]').insertAdjacentHTML('beforeend', personFields('b'));
  $('#coupleExtra').innerHTML = coupleFields();
  shareOod(lenses.map((l) => l.bundle));
  setStage('before');
  for (const r of document.querySelectorAll('input[name="stagePick"]')) r.addEventListener('change', () => { setStage(r.value); render(); });
  initScenarios({ lenses: () => lenses, capture: () => ({ fields: formFields(), lit: { ...litAnswers } }), load: loadScenario, rerender: () => render() });
  importScenariosFromHash(location.hash);
  const fromHash = decodeScenario(location.hash);
  readHashExtras(location.hash);
  litAnswers = decodeLiterature(location.hash);
  // Links made before the stage switch existed: a married-couple lens or years married > 0 open
  // the "Already married" view instead of being reset to a wedding-day projection.
  if (!fromHash.stage) {
    const hl = lenses.find((l) => l.summary.id === fromHash.lens);
    if ((hl && lensStage(hl.bundle) === 'married') || Number(fromHash.yearsMarried) > 0) fromHash.stage = 'married';
  }
  applyFields(fromHash);
  if (fromHash.lens && stageLenses().some((l) => l.summary.id === fromHash.lens)) $('#lensSel').value = fromHash.lens;
  $('#form').addEventListener('input', render);
  $('#form').addEventListener('change', render);
  $('#lensSel').addEventListener('change', render);
  document.querySelector('main').addEventListener('click', (ev) => {
    const id = ev.target.closest('[data-lens]')?.dataset.lens;
    if (id) {
      const l = lenses.find((z) => z.summary.id === id);
      if (l && lensStage(l.bundle) !== stage) setStage(lensStage(l.bundle));
      $('#lensSel').value = id;
      render();
      $('#lensSel').focus();
    }
  });
  $('#explainModel').addEventListener('change', renderExplain);
  $('#literature').addEventListener('change', (ev) => {
    if (!ev.target.matches('[data-lit]')) return;
    litAnswers = readLiteratureInputs($('#literature'));
    render();
  });
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
  window.addEventListener('hashchange', () => {
    importScenariosFromHash(location.hash);
    readHashExtras(location.hash);
    litAnswers = decodeLiterature(location.hash);
    syncConstraintControls();
    const h = decodeScenario(location.hash);
    applyFields(h);
    if (h.lens && stageLenses().some((l) => l.summary.id === h.lens)) $('#lensSel').value = h.lens;
    render();
  });
  render();
}

// The relationship and household questions the newer lenses use, grouped so the page stays
// usable on a phone; each group says which lenses read it.
function coupleFields() {
  return `
    <details class="qgroup"><summary>The relationship now</summary>${usedBy(['status', 'yearsTogether', 'howMet', 'childrenHome'])}
      ${sel('status', 'Relationship now', STATUS, 'Married, living together')}
      <label>Years together (since the relationship began) <input name="yearsTogether" type="number" min="0" max="80" step="0.5" value="3"></label>
      ${sel('howMet', 'How you met', HOW_MET, 'Through friends')}
      <label>Children under 18 living with you <input name="childrenHome" type="number" min="0" max="15" step="1" value="0"></label>
    </details>
    <details class="qgroup"><summary>Where you live</summary>${usedBy(['place', 'state'])}
      ${sel('place', 'Region', PLACE, 'U.S. — Midwest')}
      ${sel('state', 'U.S. state (sets the U.S. region)', STATES, '')}
    </details>
    <details class="qgroup"><summary>The wedding and money</summary>${usedBy(['expecting', 'cohabMonths', 'netWorth', 'debt', 'unsecuredDebt', 'homeOwner'])}
      ${sel('expecting', 'A baby expected at the wedding (born within 7 months after)', YESNO, 'No')}
      <label>Months lived together before the wedding <input name="cohabMonths" type="number" min="0" max="240" step="1" placeholder="if you did"></label>
      <label>Household net worth, $ <input name="netWorth" type="number" step="1000" placeholder="optional"></label>
      <label>Household debt, $ <input name="debt" type="number" min="0" step="1000" placeholder="optional"></label>
      <label>Of which unsecured (cards, personal loans), $ <input name="unsecuredDebt" type="number" min="0" step="500" placeholder="optional"></label>
      ${sel('homeOwner', 'Own your home (or buying it)', YESNO, 'No')}
    </details>`;
}

main();
