// `--known-date <label> --donors <a,b,...|all>` in the CLI: a synthetic control for one treated column against donor
// columns in the same wide CSV (synth-control.mjs, the shipped defaults: outcome-only fit, the floored placebo ratio,
// README "A floored ratio"), and with `--covariates file.csv` the covariate balance of that fit with the placebo
// warning (README "Covariate balance" and "Which imbalance biases the gap"). The balance table changes no p.
import { parseColumns } from './multivariate.mjs';
import { synthControlTest, synthLeadRange, covariateBalance, gapStraight } from './synth-control.mjs';
import { splitLine, numCell } from './engine.mjs';
import { LEAD_RANGE_NOTE, fewDonorsNote, aboveNote } from './synth-view.mjs';

// Covariates file: one row per unit, the unit's column name first, then one number per covariate; a header row names
// them (`unit,ln income,price`). Units the fit does not use are ignored. Read like the data CSV (engine.mjs splitLine
// and numCell): quoted cells keep their commas, and a semicolon-separated file reads 3,5 as 3.5 (Excel in a
// comma-decimal locale), where before 2026-11-17 it split into two covariates 3 and 5 under one header name.
export function parseCovariates(csv) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('--covariates: the file is empty');
  const semi = lines.some((l) => l.replace(/"[^"]*"/g, '').includes(';'));
  const cells = lines.map((l) => splitLine(l, semi));
  const isNum = (c) => Number.isFinite(numCell(c, semi));
  const header = cells[0].slice(1).some((c) => !isNum(c)) ? cells[0] : null;
  const body = header ? cells.slice(1) : cells;
  const C = header ? header.length - 1 : Math.max(...body.map((r) => r.length)) - 1;
  if (C < 1 || !body.length) throw new Error('--covariates needs a unit name and at least one number on each row');
  const units = {};
  for (const r of body) {
    const key = r[0].toLowerCase();
    if (r.length - 1 !== C || r.slice(1).some((c) => !isNum(c))) throw new Error(`--covariates: the row for ${r[0]} needs ${C} number${C > 1 ? 's' : ''}${header ? ` (${header.slice(1).join(', ')})` : ''}, got ${r.length - 1}${!semi && r.length - 1 > C ? ': a decimal comma (3,5) needs a semicolon-separated file' : ''}`);
    if (key in units) throw new Error(`--covariates: two rows for ${r[0]}; keep one`);
    units[key] = r.slice(1).map((c) => numCell(c, semi));
  }
  const names = header ? header.slice(1) : Array.from({ length: C }, (_, m) => `covariate ${m + 1}`);
  return { names, units };
}

export function synthResult({ csv, column, labelColumn = null, date, donors = [], window = null, log = false, covariatesCsv = null, anticipation = 0, shapeWord = 'plain' }) {
  if (shapeWord !== 'plain' && shapeWord !== 'panel') throw new Error(`--shape-word ${shapeWord}: give plain or panel`);
  if (column == null) throw new Error('a synthetic control (--donors) needs --column, the treated series');
  const all = parseColumns(csv, null, labelColumn);
  const find = (ref) => {
    const i = /^\d+$/.test(String(ref)) && !all.names.includes(String(ref)) ? Number(ref) - 1 : all.names.findIndex((s) => s.toLowerCase() === String(ref).trim().toLowerCase());
    if (i < 0 || i >= all.names.length) throw new Error(`No numeric column named "${ref}" (columns: ${all.names.join(', ')})`);
    return i;
  };
  const ti = find(column);
  const di = (donors.length === 1 && donors[0] === 'all') || !donors.length ? all.names.map((_, i) => i).filter((i) => i !== ti) : [...new Set(donors.map(find))];
  if (di.includes(ti)) throw new Error(`${all.names[ti]} is the treated column; take it out of --donors`);
  let lo = 0, hi = all.labels.length;
  if (window) {
    const [a, b] = String(window).split(':');
    if (a) { lo = all.labels.indexOf(a); if (lo < 0) throw new Error(`--window: no row has the label ${a}`); }
    if (b) { hi = all.labels.indexOf(b) + 1; if (hi <= 0) throw new Error(`--window: no row has the label ${b}`); }
    if (hi <= lo) throw new Error('--window: the end comes before the start');
  }
  const labels = all.labels.slice(lo, hi);
  const k = labels.indexOf(String(date));
  if (k < 0) throw new Error(`--known-date ${date}: no row in the window has that label (it runs ${labels[0]} to ${labels[labels.length - 1]}; the date is the first point after the change)`);
  // parseColumns carries a blank forward; a synthetic control needs every series complete, so a blank is refused.
  for (const i of [ti, ...di]) {
    const gap = all.missing[i].find((r) => r >= lo && r < hi);
    if (gap != null) throw new Error(`${all.names[i]} is blank at ${all.labels[gap]}: a synthetic control needs every series complete over the window (drop the column from --donors or narrow --window)`);
  }
  const cut = (i) => { const a = all.cols[i].slice(lo, hi); if (log && a.some((v) => !(v > 0))) throw new Error(`--log needs every value above zero (${all.names[i]})`); return log ? a.map(Math.log) : a; };
  const y = cut(ti);
  const donorSeries = Object.fromEntries(di.map((i) => [all.names[i], cut(i)]));
  // --anticipation N (eval/synth-anticip-prereg-2026-11-18.md, README "A shock before the date"): the fit ends N points
  // before the named date, so a change people saw coming is not absorbed into the synthetic control; the gap and the
  // placebo test read from the fit's end, and gapFromDate is the mean gap from the named date on.
  // A range a-b (eval/synth-lead-range-prereg-2026-11-18.md, README "An uncertain lead"): the lead is not known
  // exactly, so the fit is run at every backdate a..b and one range p (synthLeadRange's max-scaled statistic) is read;
  // the main fit shown is the shortest backdate, a.
  const range = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(anticipation ?? 0));
  if (range && !(Number(range[1]) < Number(range[2]))) throw new Error(`--anticipation ${anticipation}: a range needs the smaller lead first (for example 0-4)`);
  if (range && Number(range[2]) - Number(range[1]) > 12) throw new Error(`--anticipation ${anticipation}: a range of at most 13 leads (each is a full placebo run)`);
  const lead = range ? Number(range[1]) : Number(anticipation ?? 0);
  if (!Number.isInteger(lead) || lead < 0) throw new Error(`--anticipation ${anticipation}: give a whole number of points (0 or more), or a range such as 0-4`);
  const deepest = range ? Number(range[2]) : lead;
  if (k - deepest < 5) throw new Error(`--anticipation ${deepest}: that leaves ${Math.max(k - deepest, 0)} points before the fit's end; a synthetic control needs at least 5 (widen --window or lower --anticipation)`);
  const kFit = k - lead;
  const lr = range ? synthLeadRange(y, donorSeries, k, Array.from({ length: deepest - lead + 1 }, (_, i) => lead + i)) : null;
  const r = lr ? lr.fits[0] : synthControlTest(y, donorSeries, kFit);
  const tail = r.gap.slice(k);
  const out = {
    treated: all.names[ti], date: String(date), anticipation: lead, fitEnd: labels[kFit - 1], gapFromDate: tail.reduce((a, b) => a + b, 0) / tail.length, lastBefore: labels[k - 1], firstAfter: labels[k], from: labels[0], to: labels[labels.length - 1], scale: log ? 'log' : 'level',
    donors: r.donors, weights: r.weights, preRmspe: r.preRmspe, postRmspe: r.postRmspe, effectAverage: r.effectAverage, effectAtEnd: r.effectAtEnd,
    statistic: r.statistic, rank: r.rank, p: r.p, minP: r.minP, tests: r.tests, preFitShare: r.preFitShare, fitWarning: r.fitWarning,
    labels, treatedSeries: y, synthetic: r.synth, gap: r.gap,
    // Placebos whose statistic is at least the treated unit's, largest first (README "Few donors"): describes the rank.
    above: placebosAbove(r, shapeWord),
    // How many of all the placebos' own gaps faded, grew or held (gapShape, README "A donor's own event that is not a
    // step"): when most share a word, as on long compounding series, the word on a listed unit says little.
    placeboShapes: r.placebos.reduce((c, q) => { const w = wordOf(q, shapeWord); if (w) c[w] += 1; return c; }, { faded: 0, grew: 0, held: 0 }),
  };
  // --shape-word panel (opt-in, README "The shape word against the panel's own trend" and "The panel word as an
  // option"): every word above is read against the median unit's gap growth (panelShapes) once that median would
  // itself be called 'grew'. Not the default: pre-registered bar 1 failed by 0.4 points, and the re-test scored where
  // it switches on (eval/synth-shape-switch-prereg-2026-11-18.md) found it hides a donor's own slope (bars 3 and 4).
  if (shapeWord === 'panel') Object.assign(out, { shapeWord, shapeCentre: r.shapeCentre, shapeRelative: r.shapeRelative });
  if (lr) {
    out.leadRange = {
      from: lead, to: deepest, p: lr.pMaxScaled, pMean: lr.pMean, naiveMinP: lr.naiveMinP, bestLead: lr.bestLead, minP: lr.minP,
      leads: lr.leads.map((e) => ({ lead: e.lead, fitEnd: labels[e.kFit - 1], p: e.p, rank: e.rank, gapFromDate: e.gapFromDate, preRmspe: e.preRmspe })),
    };
  }
  if (covariatesCsv != null) {
    const cv = parseCovariates(covariatesCsv);
    const get = (s) => { const v = cv.units[s.toLowerCase()]; if (!v) throw new Error(`--covariates has no row for ${s} (it needs the treated unit and every donor)`); return v; };
    const names = Object.keys(donorSeries);
    out.balance = covariateBalance(r, { treated: get(out.treated), donors: Object.fromEntries(names.map((s) => [s, get(s)])) }, { names: cv.names });
  }
  return out;
}

// The placebos counted in the rank (statistic at least the treated unit's, with synthControlTest's tolerance).
const wordOf = (q, shapeWord) => (q.gapShape ? (shapeWord === 'panel' ? q.gapShape.relShape : q.gapShape.shape) ?? null : null);
export function placebosAbove(r, shapeWord = 'plain') {
  const val = (q) => (r.statistic === 'post' ? q.postRmspe : q[r.statistic]), own = r.tests[r.statistic].value;
  return r.placebos.filter((q) => val(q) >= own - 1e-12 * Math.abs(own)).sort((a, b) => val(b) - val(a))
    .map((q) => ({ name: q.name, statistic: val(q), preRmspe: q.preRmspe, postRmspe: q.postRmspe, weight: r.donorWeights?.[q.name] ?? 0, gapShape: wordOf(q, shapeWord),
      // under --shape-word panel each listed unit also carries its plain word (README "The panel word scored where it
      // switches on": the panel word called a donor's own big slope 'held' 90% of the time, the plain word 'grew' 92%)
      // and its gap's bend and whether it grew along a straight line (README "A curvature word": a donor's own slope was
      // read straight 73% of the time on compounding panels, units with no event 37%)
      ...(shapeWord === 'panel' ? { plainShape: wordOf(q, 'plain'), bend: q.gapShape?.bend ?? null, straight: gapStraight(q.gapShape) } : {}) }));
}

const f = (v, d = 2) => Number(v).toFixed(d), g = (v) => Number(v).toPrecision(3);
export function synthText(h) {
  const L = [`A synthetic control for ${h.treated} at a date you named (${h.lastBefore} -> ${h.firstAfter}), ${h.from} to ${h.to}, ${h.donors} donor series, on the ${h.scale === 'log' ? 'logs' : 'levels'}:`];
  if (h.anticipation) L.push(`  Backdated (--anticipation ${h.anticipation}): fitted on the points up to ${h.fitEnd}, ${h.anticipation} before the date you named, so a change people saw coming is not fitted away; the gap and the test below read from ${h.fitEnd} on. Mean gap from ${h.firstAfter} on: ${g(h.gapFromDate)}`);
  if (h.leadRange) {
    const R = h.leadRange;
    L.push(`  An uncertain lead (--anticipation ${R.from}-${R.to}): the fit run at every backdate from ${R.from} to ${R.to} points before the date you named, every lead read together:`);
    L.push('    lead  fit ends  mean gap from the date  placebo p');
    for (const e of R.leads) L.push(`    ${String(e.lead).padStart(4)}  ${String(e.fitEnd).padStart(8)}  ${g(e.gapFromDate).padStart(22)}  ${f(e.p, 3).padStart(9)}`);
    L.push(`    Range test (each unit's largest statistic over the leads, each lead's scaled by its median over all units, ranked among the ${h.donors + 1} units): p ${f(R.p, 3)}. Read this p, not the smallest in the table (${f(R.naiveMinP, 3)} at lead ${R.bestLead}): keeping the smallest of several leads is not a test. ${LEAD_RANGE_NOTE}`);
  }
  const shown = h.weights.slice(0, 8).map((w) => `${w.name} ${f(w.weight, 3)}`).join(', ');
  L.push(`  Synthetic ${h.treated}: ${shown}${h.weights.length > 8 ? `, +${h.weights.length - 8} more` : ''} (weights matching every point before the date)`);
  L.push(`  Fit before the date: RMSPE ${g(h.preRmspe)}; ${f(100 * h.preFitShare, 0)}% of the donors' own synthetic controls fit better${h.fitWarning ? '. FIT WARNING: the treated series is fitted worse than 80% of the placebos, so its gap after the date is hard to read (often it sits outside the donors\' range)' : ''}`);
  L.push(`  Gap after the date (${h.treated} minus synthetic): ${g(h.effectAverage)} on average, ${g(h.effectAtEnd)} at the last point`);
  L.push(`  Placebo test (each donor given the same date; the after-gap over the before-gap, floored at the median before-gap): rank ${h.rank} of ${h.donors + 1}, p ${f(h.p, 3)} (the smallest p ${h.donors + 1} units allow is ${f(h.minP, 3)}); the paper's plain ratio gives rank ${h.tests.ratio.rank}, p ${f(h.tests.ratio.p, 3)}`);
  const few = fewDonorsNote(h), above = aboveNote(h);
  if (few) L.push(`  FEW DONORS: ${few}`);
  if (above) L.push(`  ${above}`);
  if (h.balance) {
    L.push('  Covariate balance (a description of the fit, not a test; it changes no p):');
    const w = Math.max(9, ...h.balance.map((c) => c.name.length));
    L.push(`    ${'covariate'.padEnd(w)}  ${'treated'.padStart(10)}  ${'synthetic'.padStart(10)}  ${'donor mean'.padStart(10)}  std gap  placebos matched better`);
    for (const c of h.balance) L.push(`    ${c.name.padEnd(w)}  ${g(c.treated).padStart(10)}  ${g(c.synthetic).padStart(10)}  ${g(c.donorMean).padStart(10)}  ${f(c.stdGap).padStart(7)}  ${`${f(100 * c.placeboShare, 0)}%`.padStart(4)}${c.placeboWarning ? '  WARNING' : ''}`);
    const warned = h.balance.filter((c) => c.placeboWarning).map((c) => c.name);
    L.push(warned.length
      ? `    WARNING on ${warned.join(', ')}: ${h.treated} is matched worse on ${warned.length > 1 ? 'these' : 'this'} than at least 80% of the donors are by their own synthetic controls. If ${warned.length > 1 ? 'one of them' : 'it'} moved the outcome after the date, the gap and its p can be off in either direction. In simulation (eval/synth-bias-confirm.out.txt) panels with this warning reached p <= 0.05 with no effect 13-21% of the time when the covariate mattered (0-0.6% without it), and it came up on about 1 panel in 5 when the covariate did nothing. The warned covariate need not be the one that moved the outcome: with two covariates, one that mattered and one that did not, panels warned on the harmless one alone were 1.2-1.3x as biased as unwarned panels, though none of 170 reached p <= 0.05 (eval/synth-two-cov-confirm.out.txt); correlated covariates also share warnings. The same held when the covariate's shock was a slope from the date or a pulse that faded after four points (8-19% of warned panels at p <= 0.05 with no effect, 0-0.3% of the rest; eval/synth-shape-confirm.out.txt): a significant gap that fades can be a short covariate shock. These figures are for covariate shocks that start at the date: one that started 4 points before it was still 2.4x as biased in warned panels, but the warning held only 4 of its 8 false p <= 0.05; fitted with --anticipation 4 it held 8 of 8 (eval/synth-anticip-confirm.out.txt).`
      : '    No placebo warning: on every covariate at least 20% of the donors are matched worse by their own synthetic controls than the treated unit is.');
    L.push('    (std gap = (treated - synthetic) / sd over all units. A gap past 0.25 sd is common and on its own is no warning: an outcome-only fit was past it on 84% of simulated panels where the covariate did nothing.)');
  }
  if (!h.anticipation && !h.leadRange) L.push('  If people could see the change coming (a law passed months before it took effect, an announced price rise), rerun with --anticipation N, N the points between the first moment they could react and the date: in simulation an effect that began 2 or 4 points early was found 40% and 25% of the time at the stated date (62% when it began on the date) and 55% and 54% when backdated by its lead; backdating with nothing anticipated cost 10-18 points (eval/synth-anticip-confirm.out.txt).');
  L.push(`  (Abadie, Diamond and Hainmueller 2010, outcome-only fit. At p 0.05 it flagged 2.3-5.3% of simulated no-effect panels (README "A floored ratio"). It has little power on short or loosely fitted series: of four real state tobacco-tax rises it ranks California 1st of 39 (p 0.026) but Massachusetts, Arizona and Oregon only 6th to 13th, so a large p is not evidence of no effect. A small p says the treated series left its synthetic control more than the donors left theirs; it does not say what caused it.)`);
  return L.join('\n');
}
