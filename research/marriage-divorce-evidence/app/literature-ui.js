// Couple-view glue for the published-evidence layer (literature.js) and the CDC/NCHS
// population baselines (data/nchs_disruption_tables.json).
//
// The pure helpers at the top (fragment encode/decode, which questions to ask, the answers
// handed to adjust(), NCHS row matching) are tested in tests/literature_ui.test.mjs. The
// render functions below them touch the DOM and are only called from app.js.
import { FACTORS, questionsFor, unusable, adjust } from './literature.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x, d = 0) => (Number.isFinite(x) ? (100 * x).toFixed(d) + '%' : '—');

// ---- Answers in the URL fragment -----------------------------------------------------------
// Allowed values per question kind. Anything else is dropped on decode.
export const LIT_CHOICES = {
  scale: ['1', '1.5', '2', '2.5', '3', '3.5', '4'],
  z: ['-2', '-1.5', '-1', '-0.5', '0', '0.5', '1', '1.5', '2'],
  yesno: ['yes', 'no'],
  count: ['0', '1', '2'],
};
// Factors answered from the profiles above rather than asked again.
export const FROM_PROFILE = { parental_divorce_wife: 'Woman', parental_divorce_husband: 'Man' };
const PREFIX = 'lit.';
// Answers about mental health, drinking, conflict and personality: kept in the page (and in a
// JSON file only when the user ticks "include sensitive answers"), never written to a link,
// browser storage or a CSV, and never read from a link.
export const LIT_SENSITIVE = new Set(['depression', 'alcohol_problem', 'destructive_conflict_wife', 'destructive_conflict_husband', 'neuroticism_wife', 'neuroticism_husband']);

function cleanAnswer(key, v) {
  const f = FACTORS[key];
  if (!f || key in FROM_PROFILE) return undefined;
  const allowed = LIT_CHOICES[f.kind];
  if (!allowed) return undefined;
  const s = String(v ?? '');
  if (allowed.includes(s)) return s;
  // Accept numerically equal spellings ("2.50", "+1") but store the canonical one.
  if (f.kind !== 'yesno' && s.trim() !== '' && Number.isFinite(Number(s))) return allowed.find((x) => Number(x) === Number(s));
  return undefined;
}

// { prior_cohabitations_other_partners: '1' } -> 'lit.prior_cohabitations_other_partners=1'
// (FACTORS order; unknown keys, profile-derived factors and invalid values are left out, and so
// are the LIT_SENSITIVE answers unless includeSensitive is set, which only in-page cleaning and
// the opt-in JSON file do).
export function encodeLiterature(answers, { includeSensitive = false } = {}) {
  const q = new URLSearchParams();
  for (const key of Object.keys(FACTORS)) {
    if (!includeSensitive && LIT_SENSITIVE.has(key)) continue;
    const c = cleanAnswer(key, answers?.[key]);
    if (c !== undefined) q.set(PREFIX + key, c);
  }
  return q.toString();
}

export function decodeLiterature(hash, { includeSensitive = false } = {}) {
  const out = {};
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  for (const [k, v] of q) {
    if (!k.startsWith(PREFIX)) continue;
    const key = k.slice(PREFIX.length);
    if (!Object.prototype.hasOwnProperty.call(FACTORS, key)) continue;
    if (!includeSensitive && LIT_SENSITIVE.has(key)) continue;
    const c = cleanAnswer(key, v);
    if (c !== undefined) out[key] = c;
  }
  return out;
}

// ---- Which questions to show ---------------------------------------------------------------
// ask: questions with an input; profile: answered from the form above; notAsked: listed with
// the reason (already in this lens, withheld record, no verified number, unknown lens).
export function literatureQuestions(lens, evidence) {
  const ask = []; const profile = []; const notAsked = [];
  for (const q of questionsFor(lens)) {
    const f = FACTORS[q.key];
    if (!q.available) {
      notAsked.push({ ...q, status: q.reason === 'already modelled by this lens' ? 'modelled' : 'refused', reason: q.reason === 'already modelled by this lens' ? 'already in this lens' : q.reason });
      continue;
    }
    const ids = f.record ? [f.record] : Object.values(f.records || {});
    const bad = evidence ? ids.map((id) => unusable((evidence.records || []).find((r) => r.id === id))).find(Boolean) : null;
    if (bad) { notAsked.push({ ...q, status: 'withheld', reason: bad }); continue; }
    if (q.key in FROM_PROFILE) profile.push(q);
    else ask.push({ ...q, choices: LIT_CHOICES[q.kind] || [] });
  }
  return { ask, profile, notAsked };
}

// The answers handed to adjust(): asked answers that are set, plus the profile-derived ones.
// Factors the lens already models are never included (adjust() would refuse them anyway).
export function answersFor(lens, evidence, litAnswers, a, b) {
  const { ask, profile } = literatureQuestions(lens, evidence);
  const out = {};
  for (const q of ask) {
    const v = cleanAnswer(q.key, litAnswers?.[q.key]);
    if (v === undefined) continue;
    out[q.key] = q.kind === 'yesno' ? v : Number(v);
  }
  for (const q of profile) {
    const sex = FROM_PROFILE[q.key];
    const p = [a, b].find((x) => x && x.sex === sex);
    if (!p) continue;
    if (p.intactFamily === 'Yes') out[q.key] = 'yes';
    else if (p.intactFamily === 'No') out[q.key] = 'no';
  }
  return out;
}

// The lens's projection (from couple.js project()) as the cumulative divorce curve adjust()
// expects, year 1 = the first projected year.
export const baseFromYears = (years) => ({ cumulative: years.map((y) => Math.min(1 - 1e-12, Math.max(0, 1 - y.meanSurvival))) });

// ---- CDC/NCHS population baselines -----------------------------------------------------------
const HORIZONS = ['5y', '10y', '15y', '20y'];
const SURVEY_YEARS = { bramlett_mosher_2002: 'NSFG 1995', copen_2012: 'NSFG 2006–2010' };

function wifeAndHusband(a, b) {
  if (!a || !b || a.sex === b.sex) return null;
  return a.sex === 'Woman' ? { wife: a, husband: b } : { wife: b, husband: a };
}

const RACE = {
  bramlett: { Hispanic: 'Hispanic', White: 'Non-Hispanic white', Black: 'Non-Hispanic black' },
  copenW: { Hispanic: 'Hispanic or Latina', White: 'White, single race', Black: 'Black or African American, single race' },
  copenM: { Hispanic: 'Hispanic or Latino', White: 'White, single race', Black: 'Black or African American, single race' },
};
const eduBramlett = (d) => (d === 'Less than high school' ? 'Less than HS' : d === 'High school' ? 'HS' : d ? 'More than HS' : null);
const eduCopen = (d) => ({ 'Less than high school': 'No high school diploma or GED', 'High school': 'High school diploma or GED', 'Some college': 'Some college, no bachelor’s degree', Associate: 'Some college, no bachelor’s degree', Bachelor: 'Bachelor’s degree', Master: 'Master’s degree or higher', PhD: 'Master’s degree or higher', Professional: 'Master’s degree or higher' })[d] || null;

// One row's 5/10/15/20-year disruption probabilities with SEs. Copen et al. print survival;
// disruption = 1 - survival with the same SE. "*" cells (below NCHS reliability) stay null.
// A horizon the table does not print is null; a printed "*" cell is { unreliable: true }.
export function disruption(table, row) {
  const out = {};
  const printed = new Set(table.durations || []);
  for (const h of HORIZONS) {
    if (!printed.has(h)) { out[h] = null; continue; }
    const c = (row.p_disrupt || row.survival || {})[h];
    if (row.p_disrupt && c && Number.isFinite(c.p)) out[h] = { p: c.p, se: c.se };
    else if (row.survival && c && Number.isFinite(c.survival)) out[h] = { p: Math.round((1 - c.survival) * 1000) / 1000, se: c.se };
    else out[h] = { p: null, se: null, unreliable: true };
  }
  return out;
}

// Rows of the official tables that match the couple. Each match says which entry selected it.
// Returns { matches: [...], notes: [...] }.
export function nchsMatches(doc, a, b, couple) {
  const out = { matches: [], notes: [] };
  if (!doc || !Array.isArray(doc.tables)) { out.notes.push('The NCHS tables did not load.'); return out; }
  const wh = wifeAndHusband(a, b);
  if (!wh) { out.notes.push('The NCHS tables cover opposite-sex marriages, by the wife’s or the husband’s characteristics; choose both partners’ sex.'); return out; }
  const { wife, husband } = wh;
  const ym = Number(couple?.yearsMarried) || 0;
  const wifeAge = Number(wife.age) - ym;
  const husbandAge = Number(husband.age) - ym;
  const tbl = (source, name) => doc.tables.find((t) => t.source === source && t.table === name);
  const add = (t, pred, why) => {
    if (!t) return;
    for (const row of t.rows) {
      if (!pred(row)) continue;
      out.matches.push({ source: t.source, table: t.table, survey: SURVEY_YEARS[t.source] || '', population: t.population, sex: row.sex || 'Women', section: row.section, label: row.label, parent: row.parent_row, why, cells: disruption(t, row) });
    }
  };
  const is = (section, label) => (r) => r.section === section && r.label === label;
  const ageGap = husbandAge - wifeAge;
  const gapLabel = ageGap >= 5 ? 'He is 5 or more years older' : ageGap >= 0 ? 'He is 0–4 years older' : 'She is older';
  const bothRace = wife.raceEth && husband.raceEth ? (wife.raceEth === husband.raceEth ? 'Same race' : 'Different race') : null;
  const cohab = couple?.cohabitedFirst === 'Yes' ? 'Yes' : couple?.cohabitedFirst === 'No' ? 'No' : null;

  if (wife.priorMarriage) {
    // Not her first marriage: Bramlett & Mosher's second-marriage table.
    const t = tbl('bramlett_mosher_2002', 'Table 41');
    out.notes.push('The wife was married before, so her first-marriage rows (Copen et al. 2012, Bramlett & Mosher Table 21) do not describe this marriage; the second-marriage table is shown instead (it does not distinguish second from later marriages).');
    add(t, is('Total', 'Total'), 'all second marriages');
    if (Number.isFinite(wifeAge)) add(t, is('Age at remarriage', wifeAge < 25 ? 'Less than 25' : '25 and over'), `wife’s age at this marriage: ${Math.round(wifeAge)}`);
    if (RACE.bramlett[wife.raceEth]) add(t, is('Race/ethnicity', RACE.bramlett[wife.raceEth]), `wife’s race-ethnicity: ${wife.raceEth}`);
    if (eduBramlett(wife.degree)) add(t, is('Education', eduBramlett(wife.degree)), `wife’s degree today: ${wife.degree}`);
    if (wife.intactFamily === 'Yes' || wife.intactFamily === 'No') add(t, is('Intact family of origin status', wife.intactFamily === 'Yes' ? 'Intact two-parent' : 'Otherwise'), `wife lived with both parents to 18: ${wife.intactFamily}`);
    if (cohab) add(t, is('Cohabited before marriage', cohab === 'Yes' ? 'Did' : 'Did not'), `lived together first: ${cohab}`);
    if (Number.isFinite(ageGap)) add(t, is('Age difference', gapLabel), `age gap: husband ${ageGap >= 0 ? ageGap + ' older' : -ageGap + ' younger'}`);
    if (bothRace) add(t, is('Race difference', bothRace), 'race-ethnicity entered for both');
  } else {
    // Wife's first marriage: Bramlett & Mosher (1995) Table 21 and Copen et al. (2006–2010) Tables 5 and 7.
    const t21 = tbl('bramlett_mosher_2002', 'Table 21');
    const t5 = tbl('copen_2012', 'Table 5');
    const t7 = tbl('copen_2012', 'Table 7');
    add(t21, is('Total', 'Total'), 'all first marriages');
    add(t5, (r) => r.section === 'All women' && r.label === '2006–2010', 'all women’s first marriages');
    if (Number.isFinite(wifeAge)) {
      add(t21, is('Age at marriage', wifeAge < 18 ? 'Less than 18' : wifeAge < 20 ? '18–19' : wifeAge < 25 ? '20–24' : '25 and over'), `wife’s age at marriage: ${Math.round(wifeAge)}`);
      add(t5, is('Age at first marriage', wifeAge < 20 ? 'Under 20 years' : wifeAge < 25 ? '20–24 years' : '25 years and over'), `wife’s age at marriage: ${Math.round(wifeAge)}`);
    }
    if (RACE.bramlett[wife.raceEth]) {
      add(t21, is('Race/ethnicity', RACE.bramlett[wife.raceEth]), `wife’s race-ethnicity: ${wife.raceEth}`);
      add(t5, is('Hispanic origin and race', RACE.copenW[wife.raceEth]), `wife’s race-ethnicity: ${wife.raceEth}`);
    }
    if (eduCopen(wife.degree)) {
      add(t21, is('Education', eduBramlett(wife.degree)), `wife’s degree today: ${wife.degree}`);
      add(t5, is('Education', eduCopen(wife.degree)), `wife’s degree today: ${wife.degree}`);
    }
    if (wife.intactFamily === 'Yes' || wife.intactFamily === 'No') {
      add(t21, is('Intact family of origin status', wife.intactFamily === 'Yes' ? 'Intact two-parent' : 'Otherwise'), `wife lived with both parents to 18: ${wife.intactFamily}`);
      add(t5, is('Parental living arrangements at age 14 years', wife.intactFamily === 'Yes' ? 'Both biological or adoptive parents' : 'Other'), `wife lived with both parents to 18: ${wife.intactFamily} (the table asks about age 14)`);
    }
    if (cohab) {
      add(t21, is('Cohabited before marriage', cohab === 'Yes' ? 'Did' : 'Did not'), `lived together first: ${cohab}`);
      add(t7, (r) => r.sex === 'Women' && r.section === 'Cohabited with and engaged to first husband before marriage' && (cohab === 'Yes' ? r.label.startsWith('Yes') : r.label.startsWith('No')), `lived together first: ${cohab}`);
    }
    if (Number.isFinite(ageGap)) add(t21, is('Age difference', gapLabel), `age gap: husband ${ageGap >= 0 ? ageGap + ' years older' : -ageGap + ' years younger'}`);
    if (bothRace) add(t21, is('Race difference', bothRace), 'race-ethnicity entered for both');
    add(t7, (r) => r.sex === 'Women' && r.section === 'First husband ever married before this marriage' && r.label === (husband.priorMarriage ? 'Yes' : 'No'), `husband married before: ${husband.priorMarriage ? 'Yes' : 'No'}`);
    if (husband.priorChildren === 'Yes' || husband.priorChildren === 'No') add(t7, (r) => r.sex === 'Women' && r.section === 'First husband had any children from previous relationships when they married' && r.label === husband.priorChildren, `husband’s children from before: ${husband.priorChildren}`);
  }

  if (!husband.priorMarriage) {
    // Husband's first marriage: Copen et al. Table 6 (men) and Table 7's men's rows.
    const t6 = tbl('copen_2012', 'Table 6');
    const t7 = tbl('copen_2012', 'Table 7');
    add(t6, (r) => r.section === 'All men' && r.label === '2006–2010', 'all men’s first marriages');
    if (Number.isFinite(husbandAge)) add(t6, is('Age at first marriage', husbandAge < 20 ? 'Under 20 years' : husbandAge < 25 ? '20–24 years' : '25 years and over'), `husband’s age at marriage: ${Math.round(husbandAge)}`);
    if (RACE.copenM[husband.raceEth]) add(t6, is('Hispanic origin and race', RACE.copenM[husband.raceEth]), `husband’s race-ethnicity: ${husband.raceEth}`);
    if (eduCopen(husband.degree)) add(t6, is('Education', eduCopen(husband.degree)), `husband’s degree today: ${husband.degree}`);
    if (husband.intactFamily === 'Yes' || husband.intactFamily === 'No') add(t6, is('Parental living arrangements at age 14', husband.intactFamily === 'Yes' ? 'Both biological or adoptive parents' : 'Other'), `husband lived with both parents to 18: ${husband.intactFamily} (the table asks about age 14)`);
    if (cohab) add(t7, (r) => r.sex === 'Men' && r.section === 'Cohabited with and engaged to first wife before marriage' && (cohab === 'Yes' ? r.label.startsWith('Yes') : r.label.startsWith('No')), `lived together first: ${cohab}`);
    add(t7, (r) => r.sex === 'Men' && r.section === 'First wife ever married before this marriage' && r.label === (wife.priorMarriage ? 'Yes' : 'No'), `wife married before: ${wife.priorMarriage ? 'Yes' : 'No'}`);
    if (wife.priorChildren === 'Yes' || wife.priorChildren === 'No') add(t7, (r) => r.sex === 'Men' && r.section === 'First wife had any children from previous relationships when they married' && r.label === wife.priorChildren, `wife’s children from before: ${wife.priorChildren}`);
  } else {
    out.notes.push('The husband was married before, so the men’s first-marriage table (Copen et al. Table 6) does not describe this marriage and is not shown.');
  }
  if (wife.raceEth === 'Other' || husband.raceEth === 'Other') out.notes.push('The tables print rows for Hispanic, non-Hispanic White and non-Hispanic Black (and, in 1995, Asian) people only, so “Other” race-ethnicity has no row.');
  return out;
}

// ---- Rendering (DOM) ---------------------------------------------------------------------
const CHOICE_TEXT = {
  scale: { 1: '1 — not at all true', 2.5: '2.5', 4: '4 — very true' },
  count: { 0: 'None', 1: 'One', 2: 'Two or more' },
  yesno: { yes: 'Yes', no: 'No' },
};
const choiceLabel = (kind, v) => CHOICE_TEXT[kind]?.[v] ?? (kind === 'z' && Number(v) > 0 ? '+' + v + ' SD' : kind === 'z' ? v + ' SD' : v);

let renderedKey = null;

// Questions: rebuilt only when the lens changes, so typing never loses focus.
export function renderLiteratureQuestions(root, lens, evidence, litAnswers) {
  const key = (lens || '') + '|' + (evidence ? 'e' : 'x');
  if (renderedKey === key && root.querySelector('#litQuestions')) { syncLiteratureInputs(root, litAnswers); return; }
  renderedKey = key;
  if (!evidence) {
    root.querySelector('#litQuestions').innerHTML = '<p class="note">The published-evidence file did not load, so no literature questions are shown.</p>';
    root.querySelector('#litNotAsked').innerHTML = '';
    return;
  }
  const { ask, profile, notAsked } = literatureQuestions(lens, evidence);
  root.querySelector('#litQuestions').innerHTML = ask.length
    ? `<div class="lit-grid">${ask.map((q) => `<label>${esc(FACTORS[q.key].label)} <select name="lit.${esc(q.key)}" data-lit="${esc(q.key)}"><option value="">Prefer not to say</option>${q.choices.map((c) => `<option value="${esc(c)}">${esc(choiceLabel(q.kind, c))}</option>`).join('')}</select><small>${esc(q.question)}</small></label>`).join('')}</div>`
    : '<p class="note">This lens already models every factor the verified literature covers, so there is nothing to add.</p>';
  root.querySelector('#litNotAsked').innerHTML = `<ul class="lit-list">${profile.map((q) => `<li><strong>${esc(q.label)}</strong>: taken from “Lived with both parents from birth to 18” in the profiles above.</li>`).join('')}${notAsked.map((q) => `<li><strong>${esc(q.label)}</strong>: ${q.status === 'modelled' ? '<span class="tag">already in this lens</span> not asked, so it is not counted twice.' : 'not asked. ' + esc(q.reason)}</li>`).join('')}</ul>`;
  syncLiteratureInputs(root, litAnswers);
}

export function syncLiteratureInputs(root, litAnswers) {
  for (const el of root.querySelectorAll('[data-lit]')) el.value = litAnswers[el.dataset.lit] ?? '';
}

export function readLiteratureInputs(root) {
  const out = {};
  for (const el of root.querySelectorAll('[data-lit]')) if (el.value !== '') out[el.dataset.lit] = el.value;
  return decodeLiterature('#' + encodeLiterature(out, { includeSensitive: true }), { includeSensitive: true });
}

const noDiv = (c) => (Number.isFinite(c) ? 1 - c : NaN);

export function renderLiteratureResult(el, { lens, evidence, litAnswers, a, b, years, yearsMarried }) {
  if (!evidence) { el.innerHTML = ''; return; }
  const answers = answersFor(lens, evidence, litAnswers, a, b);
  const asked = Object.keys(litAnswers || {}).length;
  const out = adjust({ base: baseFromYears(years), lens, answers, horizons: [5, 10, 20], draws: 4000, seed: 1 }, evidence);
  if (!asked && !out.applied.length) {
    el.innerHTML = '<p class="note">Answer any of the questions above to see a literature-based adjustment. Unanswered questions change nothing.</p>';
    return;
  }
  const tiles = [5, 10, 20].map((h) => {
    const z = out.horizons[h];
    if (!z || !z.adjusted) return `<div class="tile out"><div class="k">Through year ${yearsMarried + h}</div><div class="v">—</div><div class="r">${esc(z?.note || 'not available')}</div></div>`;
    return `<div class="tile lit"><div class="k">Through year ${yearsMarried + h}</div>
      <div class="r">This lens: <b>${pct(noDiv(z.base))}</b></div>
      <div class="v">${pct(noDiv(z.adjusted.median))}</div>
      <div class="r">literature-based, 95% interval ${pct(noDiv(z.adjusted.hi))}–${pct(noDiv(z.adjusted.lo))}</div></div>`;
  }).join('');
  const applied = out.applied.map((x) => `<li><strong>${esc(x.label)}</strong> (${esc(x.answer)}): hazard multiplied by ${x.applied_hr.median.toFixed(2)} <small>(95% ${x.applied_hr.lo.toFixed(2)}–${x.applied_hr.hi.toFixed(2)}, after the overlap shrinkage below)</small>
      <div class="cite">${esc(x.citation)} ${x.doi ? `<a href="https://doi.org/${esc(x.doi)}" rel="noopener">doi:${esc(x.doi)}</a>` : ''} · <a href="${esc(x.url)}" rel="noopener">source</a>${x.locator ? `<small>${esc(x.locator)}</small>` : ''}
      <blockquote>${esc(x.quote)}</blockquote>
      <small>Published: ${esc(x.published.measure)} ${esc(x.published.estimate)}${x.published.ci_low !== null ? ` (95% CI ${esc(x.published.ci_low)}–${esc(x.published.ci_high)})` : ''}. Uncertainty: ${esc(x.uncertainty)}.${x.caveats ? ' Caveats: ' + esc(x.caveats) : ''}${x.note ? ' ' + esc(x.note) : ''}</small></div></li>`).join('');
  const refused = out.refused.concat(out.skipped).map((x) => `<li><strong>${esc(x.label || FACTORS[x.factor]?.label || x.factor)}</strong>: ${esc(x.reason)}</li>`).join('');
  el.innerHTML = `<p class="lit-label"><span class="tag">Literature-based</span> ${esc(out.label)}. Chance of no divorce, this lens next to the adjusted value.</p>
    <div class="tiles three">${tiles}</div>
    <p class="small">${out.applied.length ? `${out.applied.length} adjustment${out.applied.length > 1 ? 's' : ''} applied${out.applied.length > 1 ? `, each shrunk for overlap (median factor ${out.shrinkage.factor_median.toFixed(2)})` : ''}. ` : 'No adjustment applied, so the values equal the lens. '}Confidence is ${esc(out.confidence)}. ${out.notes.map(esc).join(' ')}</p>
    <details${out.applied.length ? '' : ' hidden'}><summary>Applied adjustments, with citations (${out.applied.length})</summary><ol class="lit-applied">${applied}</ol></details>
    ${refused ? `<details><summary>Refused or skipped (${out.refused.length + out.skipped.length})</summary><ul class="lit-list">${refused}</ul></details>` : ''}`;
}

export function renderNchs(el, doc, { a, b, couple, years, lensLabel }) {
  const m = nchsMatches(doc, a, b, couple);
  if (!m.matches.length) { el.innerHTML = `<p class="note">${m.notes.map(esc).join(' ') || 'No matching rows.'}</p>`; return; }
  const cell = (c) => (!c ? '<td class="num">—</td>' : c.unreliable ? '<td class="num">*</td>' : `<td class="num">${pct(c.p)} <small>SE ${(100 * c.se).toFixed(1)}</small></td>`);
  const head = `<tr><th scope="col">Official table row</th><th scope="col">Matched on</th>${HORIZONS.map((h) => `<th class="num" scope="col">Disrupted by ${parseInt(h, 10)} years</th>`).join('')}</tr>`;
  const ym = Number(couple?.yearsMarried) || 0;
  const lensRow = ym === 0 && years && years.length >= 20
    ? `<tr class="ref"><td>This lens, this couple (${esc(lensLabel)})</td><td>model average, from the wedding</td>${HORIZONS.map((h) => `<td class="num">${pct(1 - years[parseInt(h, 10) - 1].meanSurvival)}</td>`).join('')}</tr>` : '';
  let lastGroup = '';
  const order = ['Table 21', 'Table 41', 'Table 5', 'Table 6', 'Table 7'];
  const sorted = m.matches.map((r, i) => ({ r, i })).sort((x, y) => (order.indexOf(x.r.table) - order.indexOf(y.r.table)) || ((x.r.sex === 'Men') - (y.r.sex === 'Men')) || (x.i - y.i)).map((x) => x.r);
  const rows = sorted.map((r) => {
    const group = `${r.table} · ${r.survey}${r.sex === 'Men' ? ' · men' : ' · women'}`;
    const hdr = group !== lastGroup ? `<tr><th colspan="6" scope="rowgroup" class="grp">${esc(r.source === 'copen_2012' ? 'Copen et al. (2012)' : 'Bramlett & Mosher (2002)')} ${esc(group)}</th></tr>` : '';
    lastGroup = group;
    return `${hdr}<tr><td>${esc(r.section)}: ${esc(r.parent ? r.parent + ', ' : '')}${esc(r.label)}</td><td><small>${esc(r.why)}</small></td>${HORIZONS.map((h) => cell(r.cells[h])).join('')}</tr>`;
  }).join('');
  el.innerHTML = `<div class="table-wrap"><table><thead>${head}</thead><tbody>${lensRow}${rows}</tbody></table></div>
    <p class="small">Life-table probability that a first marriage (second, where marked) had been disrupted by separation or divorce, with the standard error in percentage points, exactly as printed. Bramlett &amp; Mosher (2002) report women 15–44 in the 1995 NSFG and print disruption up to 15 years; Copen et al. (2012) report women and men 15–44 in the 2006–2010 NSFG and print survival, shown here as 1 − survival. “*” = below NCHS reliability standards. These are unadjusted one-way tables: the rows overlap and are confounded with each other, so do not multiply them together. Disruption includes separation, so it runs higher than legal divorce.${ym > 0 ? ' Your marriage is already under way, so these from-the-wedding figures are not directly comparable with the tiles above, which count from today.' : ''}</p>
    ${m.notes.length ? `<p class="small">${m.notes.map(esc).join(' ')}</p>` : ''}`;
}
