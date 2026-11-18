// The page's view of a synthetic control (synth-cli.mjs synthResult): the same numbers and warnings the CLI prints
// (synthText), as HTML with a chart of the treated series against its synthetic and the covariate balance table.
// Pure functions of the result, so page tests read them without a browser (synth-page.test.mjs).
import { esc, fmt } from './report.mjs';
// What the range test (--anticipation a-b) measured (eval/synth-lead-range-confirm.out.txt), shared with the CLI.
export const LEAD_RANGE_NOTE = 'In simulation (39 units; eval/synth-lead-range-confirm.out.txt, pre-registered) with leads 0-4: no effect, it reached p <= 0.05 on 3.8% of panels (3.3% with a covariate shock 4 points early), against 5.3% and 7.8% for the smallest p of the five; an effect that began 2 or 4 points early was found 55% and 56% of the time, against 35% and 28% at the stated date and 57% and 59% backdated by the true lead; one that began on the date, 54% against 59%. Give the range from what is known (when the law passed, when the rise was announced), not from trying several.';

const f = (v, d = 2) => Number(v).toFixed(d), g = (v) => Number(v).toPrecision(3);

// Few donors (eval/synth-few-donors-prereg-2026-11-18.md, README "Few donors: the Basque Country and West Germany"):
// with J donors the placebo p cannot go below 1 / (J + 1), so under 19 donors p <= 0.05 is out of reach whatever
// happened. Arithmetic on the permutation test, shared by the CLI and the page; null when 0.05 is reachable.
// FEW_POWER: what the test reached in simulation (eval/synth-few-power-confirm.out.txt, pre-registered
// eval/synth-few-power-prereg-2026-11-18.md, all six bars passed): rank-1 shares at 11, 16 and 21 units with a step of
// two noise sd and clean donors (clean), with one donor shocked by the same amount after the date (oneShocked), and
// with that donor left out of the pool beforehand (excluded, the PD cell's).
export const FEW_POWER = [
  { units: 11, clean: 53.5, oneShocked: 38.0, twiceShocked: 12.8, excluded: 58.3 },
  { units: 16, clean: 60.0, oneShocked: 40.3, twiceShocked: 9.0, excluded: 56.0 },
  { units: 21, clean: 58.8, oneShocked: 34.8, twiceShocked: 6.0, excluded: 57.5 },
];
export function fewPowerRow(units) {
  return FEW_POWER.reduce((best, r) => (Math.abs(r.units - units) < Math.abs(best.units - units) ? r : best));
}
// TWO_SHOCK: the same step with two donors each shocked by the step's size after the date (eval/synth-two-shock-confirm.out.txt,
// pre-registered eval/synth-two-shock-prereg-2026-11-18.md, all eight bars passed): rank-1 shares at 11 and 16 units
// with both in the pool (twoShocked), with only one of them left out beforehand (oneLeftOut), and with both left out
// (bothLeftOut, the PDD cells' exclAll). bestMatchErr: the mean absolute error of the gap when the shocked donor is the
// treated fit's heaviest, against clean donors (cleanErr), and with that donor left out beforehand (bestLeftOutErr).
export const TWO_SHOCK = [
  { units: 11, twoShocked: 28.0, oneLeftOut: 35.0, bothLeftOut: 52.5, cleanErr: 0.507, bestMatchErr: 0.673, bestLeftOutErr: 0.689 },
  { units: 16, twoShocked: 27.3, oneLeftOut: 35.8, bothLeftOut: 55.5, cleanErr: 0.417, bestMatchErr: 0.657, bestLeftOutErr: 0.568 },
];
export function twoShockRow(units) {
  return TWO_SHOCK.reduce((best, r) => (Math.abs(r.units - units) < Math.abs(best.units - units) ? r : best));
}
// DONOR_SHAPE: one donor's own event a slope from the date (slope) or a pulse that fades after four points (pulse), each
// averaging the step's size over the after-period, and that donor left out beforehand (pulseLeftOut, slopeLeftOut)
// (eval/synth-donor-shape-confirm.out.txt, pre-registered eval/synth-donor-shape-prereg-2026-11-18.md, all bars passed).
// SHAPE_RATES: how often gapShape named a shocked donor's own gap right when it was listed above the treated unit
// (pooled over 11 and 16 units), and how often a unit with no event of its own listed above got a shape anyway.
export const DONOR_SHAPE = [
  { units: 11, step: 40.3, slope: 34.8, pulse: 12.3, slopeLeftOut: 58.8, pulseLeftOut: 51.5 },
  { units: 16, step: 37.3, slope: 29.3, pulse: 14.3, slopeLeftOut: 55.5, pulseLeftOut: 55.3 },
];
export const SHAPE_RATES = { pulseFaded: 90.4, stepHeld: 91.9, slopeGrew: 41.8, bigSlopeGrew: 75.0, cleanShaped: 20.2 };
export function donorShapeRow(units) {
  return DONOR_SHAPE.reduce((best, r) => (Math.abs(r.units - units) < Math.abs(best.units - units) ? r : best));
}
// A donor listed above the treated unit that also carries this much of its synthetic control's weight moves the
// estimated gap as well as the rank (README "Two shocked donors, and a shocked best match").
export const HEAVY_WEIGHT = 0.2;
export function fewDonorsNote(h) {
  if (!(h.minP > 0.05)) return null;
  const pw = fewPowerRow(h.donors + 1), tw = twoShockRow(h.donors + 1), ds = donorShapeRow(h.donors + 1), pc = (v) => `${Math.round(v)}%`;
  return `With ${h.donors + 1} units the placebo p cannot go below ${f(h.minP, 3)}: p <= 0.05 is out of reach whatever happened, so rank 1 (p ${f(h.minP, 3)}) is the strongest result this test can give, not a near-miss. In simulation with ${pw.units} units (eval/synth-few-power-confirm.out.txt, pre-registered), a real step of two noise sd reached rank 1 ${pc(pw.clean)} of the time; when one donor had its own shock of the same size after the date, ${pc(pw.oneShocked)}; twice the size, ${pc(pw.twiceShocked)}; with that donor left out of the pool before the fit, ${pc(pw.excluded)}. With two donors shocked (eval/synth-two-shock-confirm.out.txt, ${tw.units} units), ${pc(tw.twoShocked)}; leaving out only one of the two, ${pc(tw.oneLeftOut)}; both, ${pc(tw.bothLeftOut)}: leaving out the one event you know of is not enough when another donor had one too. When the one donor's own event was not a step but of the same average size (eval/synth-donor-shape-confirm.out.txt, ${ds.units} units), a slope from the date left ${pc(ds.slope)} and a pulse that wore off after four points ${pc(ds.pulse)} (a step, ${pc(ds.step)}); with that donor left out beforehand, ${pc(ds.slopeLeftOut)} and ${pc(ds.pulseLeftOut)}: a short burst in one donor (a promotion, a strike) takes the rank more often than a lasting step of the same average size. So leave out of --donors, before fitting, any unit whose own event after the date you already know of, and say so; dropping one after seeing the ranks is not a test. On two real 17-unit panels (West Germany 1990, the Basque Country 1970) a donor or two with large gaps of their own put the treated unit 3rd and 4th; read the units ranked above it.`;
}

// The placebos whose statistic is at least the treated unit's (synthResult's h.above), largest first: a description,
// it changes no p. A donor with a change of its own after the date (an oil boom, a mine closing) counts against the
// treated unit; naming them lets a reader check, which is not a licence to drop them after seeing the result.
export function aboveNote(h, max = 5) {
  if (!h.above?.length) return null;
  const shapeWord = { faded: '; its own gap faded after the first points', grew: '; its own gap grew towards the end' };
  // under --shape-word panel, a unit whose plain word differs gets both (README "The panel word scored where it switches on")
  // and, where its own gap grew, whether it grew along a straight line (README "A curvature word")
  const line = (q) => (h.shapeWord === 'panel' && h.shapeRelative && q.plainShape === 'grew'
    ? (q.straight ? ', along a straight line from the date (the shape of a slope of its own)' : ", bending like the panel's compounding gaps rather than along a straight line")
    : '');
  const both = (q) => (h.shapeWord === 'panel' && h.shapeRelative && q.plainShape && q.plainShape !== q.gapShape
    ? `; its own gap ${q.gapShape} against the panel's growth, but ${q.plainShape === 'grew' ? 'grew towards the end' : q.plainShape === 'faded' ? 'faded after the first points' : 'held'} on its own reading`
    : shapeWord[q.gapShape] ?? '') + line(q);
  const shown = h.above.slice(0, max).map((q) => `${q.name} ${f(q.statistic, 1)} (before-gap ${g(q.preRmspe)}, after ${g(q.postRmspe)}${both(q)})`).join(', ');
  return `Ranked at or above ${h.treated} (statistic ${f(h.tests[h.statistic].value, 1)}; before-gap ${g(h.preRmspe)}, after ${g(h.postRmspe)}): ${shown}${h.above.length > max ? `, +${h.above.length - max} more` : ''}. If one of these had a change of its own after the date, the test counts it against ${h.treated}; that is a reason to look into it and say so, not to drop it from the pool after seeing the result (a pool chosen after the result is not a test).${h.shapeWord === 'panel' ? panelShapeNote(h, h.above.slice(0, max)) : shapeNote(h.above.slice(0, max), h.placeboShapes)}${heavyNote(h, h.above)}`;
}
// What the shape words mean and how far to trust them (README "A donor's own event that is not a step").
// PANEL_SHAPE: the panel word's rates on the panels where it is in force, from the re-test scored only there
// (eval/synth-shape-switch-confirm.out.txt, "growing-all | switched", pre-registered
// eval/synth-shape-switch-prereg-2026-11-18.md; bars 3 and 4 failed, so it stays an option). The earlier rates
// (eval/synth-shape-trend-confirm.out.txt) were pooled over growing panels where the rule mostly stayed off, but this
// note prints them only where it is on. clean*: listed units with no event of their own given a word; pulse*: a pulse
// that wore off called 'faded'; bigSlopeHeld*: a donor's own big slope called 'held'; slopeWordedPanel / cleanAllPanel:
// slope donors and units with no event given any word, over all placebos.
// CURVE: the straight-line reading (gapStraight, synth-control.mjs) on the same switched growing panels
// (eval/synth-shape-curve-confirm.out.txt, "growing-all | switched", pre-registered
// eval/synth-shape-curve-prereg-2026-11-18.md, all six bars held): a donor's own slope (shock 1 and 2) and a big one
// read straight, and grew on the plain word; units with no event of their own, all and listed above; precision: the
// share of flagged units that were the slope donor, in panels that had one.
export const CURVE = { slopeStraight: 73.3, slopeGrew: 86.0, bigSlopeStraight: 82.6, cleanStraight: 36.7, cleanGrew: 64.6, cleanAboveStraight: 51.7, cleanAboveGrew: 78.6, precisionStraight: 14.1, precisionGrew: 10.1 };
export const PANEL_SHAPE = { cleanPanel: 22.6, cleanPlain: 80.1, pulsePanel: 92.6, pulsePlain: 71.5, bigSlopeHeldPanel: 89.6, bigSlopeHeldPlain: 7.2, slopeWordedPanel: 14.2, cleanAllPanel: 28.9 };
function panelShapeNote(h, list) {
  const r = PANEL_SHAPE, pc = (v) => `${Math.round(v)}%`, c = h.placeboShapes, n = c.faded + c.grew + c.held;
  if (h.shapeCentre == null) return '';
  const centre = Number(h.shapeCentre).toPrecision(3);
  if (!h.shapeRelative) return ` Words read against the panel (--shape-word panel): the median unit's gap grew ${centre} times in mean square from the first third of the after-points to the last, under 6, so each word is the plain one.${shapeNote(list, c)}`;
  return ` Words read against the panel (--shape-word panel): the median unit's gap grew ${centre} times in mean square from the first third of the after-points to the last, so gaps that grow are this panel's rule, and each unit is worded by how far it stands from that: "grew" means its gap's growth (last third over first, in mean square) was at least 6 times the median's, "faded" at most a sixth of it, "held" in between. Of all ${n} donors' own gaps, ${c.faded} faded, ${c.grew} grew and ${c.held} held on this reading. In simulation on compounding panels where this reading was in force (eval/synth-shape-switch-confirm.out.txt, pre-registered), ${pc(r.cleanPanel)} of listed units with no event of their own got a word, against ${pc(r.cleanPlain)} for the plain word, and a pulse that wore off was called faded ${pc(r.pulsePanel)} of the time (plain ${pc(r.pulsePlain)}). But it hides a donor's own slope from the date: a big one was called held ${pc(r.bigSlopeHeldPanel)} of the time (plain ${pc(r.bigSlopeHeldPlain)}), and slope donors got any word ${pc(r.slopeWordedPanel)} of the time, less often than units with no event of their own (${pc(r.cleanAllPanel)}). A linear slope grows more slowly than a compounding gap, so against this panel it looks ordinary. So "held" here does not clear a unit of a slope of its own; where the plain word differs it is given beside the panel word, and a unit held against the panel that grew on its own reading is the one to look into for a slope. That is why this is an option, not the default.${curveNote()}`;
}
function curveNote() {
  const r = CURVE, pc = (v) => `${Math.round(v)}%`;
  return ` Each unit whose own gap grew is also read for its line: the middle third of its after-gap against the straight line through the first and last thirds. A slope of a unit's own runs straight from the date; a compounding gap is a smooth path that bends either way. In simulation on these panels (eval/synth-shape-curve-confirm.out.txt, pre-registered), a donor's own slope was read as grown along a straight line ${pc(r.slopeStraight)} of the time (twice the effect, ${pc(r.bigSlopeStraight)}), against ${pc(r.cleanStraight)} of units with no event of their own (${pc(r.cleanAboveStraight)} of those listed above the treated unit); "grew" alone flags ${pc(r.slopeGrew)} and ${pc(r.cleanGrew)} (${pc(r.cleanAboveGrew)}). So a straight line points at a slope more sharply than "grew", but it is a pointer, not a finding: in panels with a slope donor, ${pc(r.precisionStraight)} of the units so read were that donor (${pc(r.precisionGrew)} for "grew").`;
}
function shapeNote(list, counts) {
  if (!list.some((q) => q.gapShape === 'faded' || q.gapShape === 'grew')) return '';
  const r = SHAPE_RATES, pc = (v) => `${Math.round(v)}%`;
  const n = counts ? counts.faded + counts.grew + counts.held : 0;
  const base = n ? ` Of all ${n} donors' own gaps, ${counts.faded} faded, ${counts.grew} grew and ${counts.held} held${['faded', 'grew'].some((k) => counts[k] > n / 2) ? `: most share the word, so it singles out no one here (on long series that compound, such as GDP, gaps that grow are the rule; --shape-word panel words each unit against the panel instead)` : ''}.` : '';
  return `${base} "Faded" and "grew" describe a unit's own gap after the date (its first third against its last), a hint of what kind of event to look for, not evidence that it had one: in simulation (eval/synth-donor-shape-confirm.out.txt) a donor's own pulse that wore off was called faded ${pc(r.pulseFaded)} of the time when it was listed here and a step was left unlabelled ${pc(r.stepHeld)}; a slope of the effect's size was called grew only ${pc(r.slopeGrew)} (twice the size, ${pc(r.bigSlopeGrew)}), and ${pc(r.cleanShaped)} of listed units with no event of their own got a word anyway (often from a shocked donor in their own synthetic control).`;
}
function heavyNote(h, list) {
  const heavy = list.filter((q) => q.weight >= HEAVY_WEIGHT);
  if (!heavy.length) return '';
  const t = twoShockRow(h.donors + 1), x = (v) => `${f(v / t.cleanErr, 1)}x`;
  return ` ${heavy.map((q) => `${q.name} (weight ${f(q.weight, 2)})`).join(' and ')} ${heavy.length > 1 ? 'are' : 'is'} also part of ${h.treated}'s synthetic control, so an event of ${heavy.length > 1 ? 'their' : 'its'} own after the date moves the estimated gap too (by about the weight times that event's size), not only the rank. In simulation (eval/synth-two-shock-confirm.out.txt, ${t.units} units) a shock on the heaviest donor raised the gap's error to ${x(t.bestMatchErr)} the clean-donor error, and leaving that donor out beforehand left it at ${x(t.bestLeftOutErr)} (the fit is worse without it): report the gap both with and without it.`;
}

// Treated series (dark) and its synthetic (dashed red) on one axis, the date as a vertical rule.
export function synthChartSvg(h, { width = 720, height = 240 } = {}) {
  const y = h.treatedSeries, s = h.synthetic, n = y.length;
  if (!n) return '';
  const all = [...y, ...s].filter(Number.isFinite);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const pad = { l: 48, r: 10, t: 10, b: 24 }, W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const X = (i) => pad.l + (n > 1 ? (i * W) / (n - 1) : W / 2), Y = (v) => pad.t + H - ((v - lo) / (hi - lo)) * H;
  const path = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const k = h.labels.indexOf(h.firstAfter), xd = k > 0 ? (X(k - 1) + X(k)) / 2 : X(0);
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${pad.l - 4}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor">${esc(fmt(v))}</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(h.treated)} and its synthetic control, ${esc(h.from)} to ${esc(h.to)}">`
    + `<line x1="${xd.toFixed(1)}" x2="${xd.toFixed(1)}" y1="${pad.t}" y2="${pad.t + H}" stroke="#888" stroke-dasharray="2 3"/>`
    + `<path d="${path(s)}" fill="none" stroke="#c0392b" stroke-width="2" stroke-dasharray="6 4"/>`
    + `<path d="${path(y)}" fill="none" stroke="currentColor" stroke-width="2"/>${ticks}`
    + `<text x="${pad.l}" y="${height - 6}" font-size="11" fill="currentColor">${esc(h.from)}</text>`
    + `<text x="${xd.toFixed(1)}" y="${height - 6}" font-size="11" text-anchor="middle" fill="currentColor">${esc(h.firstAfter)}</text>`
    + `<text x="${pad.l + W}" y="${height - 6}" font-size="11" text-anchor="end" fill="currentColor">${esc(h.to)}</text></svg>`;
}

export function synthHtml(h) {
  const scale = h.scale === 'log' ? 'logs (a gap of -0.1 is about 10% below)' : 'levels';
  const shown = h.weights.slice(0, 8).map((w) => `${esc(w.name)} ${f(w.weight, 3)}`).join(', ');
  const P = [];
  P.push(`<p class="summary"><strong>${esc(h.treated)} after ${esc(h.lastBefore)}:</strong> ${g(h.effectAverage)} on average against its synthetic control (${g(h.effectAtEnd)} at the last point), on the ${scale}. Placebo test: rank ${h.rank} of ${h.donors + 1}, p ${f(h.p, 3)}${h.p <= 0.05 ? ', a gap larger than almost every donor shows at the same date' : h.rank === 1 && h.minP > 0.05 ? `, the largest of all ${h.donors + 1} units (the smallest p this many units allow)` : ''}.</p>`);
  if (h.anticipation) P.push(`<p class="note"><strong>Backdated ${h.anticipation} point${h.anticipation > 1 ? 's' : ''}:</strong> the synthetic control is fitted on the points up to ${esc(h.fitEnd)}, before people could react, so a change they saw coming is not fitted away; the gap and the test read from ${esc(h.fitEnd)} on. Mean gap from ${esc(h.firstAfter)} on: ${g(h.gapFromDate)}.</p>`);
  if (h.leadRange) {
    const R = h.leadRange;
    P.push(`<h3>An uncertain lead: backdated ${R.from} to ${R.to} points</h3><div class="scroll"><table id="synth-leads"><tr><th class="n">Lead</th><th>Fit ends</th><th class="n">Mean gap from ${esc(h.firstAfter)}</th><th class="n">Placebo p</th></tr>`
      + R.leads.map((e) => `<tr><td class="n">${e.lead}</td><td>${esc(e.fitEnd)}</td><td class="n">${g(e.gapFromDate)}</td><td class="n">${f(e.p, 3)}</td></tr>`).join('')
      + '</table></div>');
    P.push(`<p class="note" role="note"><strong>Range test: p ${f(R.p, 3)}.</strong> Each unit's largest statistic over the leads, each lead's scaled by its median over all units, ranked among the ${h.donors + 1} units. Read this p, not the smallest in the table (${f(R.naiveMinP, 3)} at lead ${R.bestLead}): keeping the smallest of several leads is not a test. ${esc(LEAD_RANGE_NOTE)}</p>`);
  }
  P.push(`<p class="note">Synthetic ${esc(h.treated)} = ${shown}${h.weights.length > 8 ? `, +${h.weights.length - 8} more` : ''} (weights at least zero, summing to one, matching every point from ${esc(h.from)} to ${esc(h.anticipation ? h.fitEnd : h.lastBefore)}).</p>`);
  P.push(`<p class="note">Fit before the date: RMSPE ${g(h.preRmspe)}; ${f(100 * h.preFitShare, 0)}% of the donors' own synthetic controls fit better.${h.fitWarning ? ` <strong>Fit warning:</strong> ${esc(h.treated)} is fitted worse than 80% of the placebos, so its gap after the date is hard to read (often it sits outside the donors' range).` : ''}</p>`);
  P.push(`<p class="note">Placebo test: each of the ${h.donors} donors is given the same date and its own synthetic control; the statistic is the after-gap over the before-gap, the before-gap floored at the median of all units. The smallest p ${h.donors + 1} units allow is ${f(h.minP, 3)}. The paper's plain ratio gives rank ${h.tests.ratio.rank}, p ${f(h.tests.ratio.p, 3)}.</p>`);
  const few = fewDonorsNote(h), above = aboveNote(h);
  if (few) P.push(`<p class="note" role="note" id="synth-few-donors"><strong>Few donors.</strong> ${esc(few)}</p>`);
  if (above) P.push(`<p class="note" id="synth-above">${esc(above)}</p>`);
  if (h.balance) {
    const warned = h.balance.filter((c) => c.placeboWarning).map((c) => c.name);
    P.push('<h3>Covariate balance</h3><p class="note">A description of the fit, not a test: it changes no p. Std gap = (treated &minus; synthetic) / sd over all units; &ldquo;placebos matched better&rdquo; is the share of donors whose own synthetic control matches them more closely on that covariate.</p>');
    P.push(`<div class="scroll"><table id="synth-balance"><tr><th>Covariate</th><th class="n">${esc(h.treated)}</th><th class="n">Synthetic</th><th class="n">Donor mean</th><th class="n">Std gap</th><th class="n">Placebos matched better</th><th></th></tr>`
      + h.balance.map((c) => `<tr><td>${esc(c.name)}</td><td class="n">${g(c.treated)}</td><td class="n">${g(c.synthetic)}</td><td class="n">${g(c.donorMean)}</td><td class="n">${f(c.stdGap)}</td><td class="n">${f(100 * c.placeboShare, 0)}%</td><td>${c.placeboWarning ? '<strong>Warning</strong>' : ''}</td></tr>`).join('')
      + '</table></div>');
    P.push(warned.length
      ? `<p class="note" role="note"><strong>Warning on ${warned.map(esc).join(', ')}:</strong> ${esc(h.treated)} is matched worse on ${warned.length > 1 ? 'these' : 'this'} than at least 80% of the donors are by their own synthetic controls. If ${warned.length > 1 ? 'one of them' : 'it'} moved the outcome after the date, the gap and its p can be off in either direction. In simulation, panels with this warning reached p &le; 0.05 with no effect 13&ndash;21% of the time when the covariate mattered (0&ndash;0.6% without it), and the warning came up on about 1 panel in 5 when the covariate did nothing. The warned covariate need not be the one that moved the outcome, and correlated covariates share warnings. The same held when the covariate&rsquo;s shock was a slope from the date or a pulse that faded (8&ndash;19% of warned panels at p &le; 0.05 with no effect, 0&ndash;0.3% of the rest), so a significant gap that fades can be a short covariate shock. These figures are for covariate shocks that start at the date: for one that started 4 points before it, warned panels were still 2.4&times; as biased but the warning held only 4 of 8 false finds; backdated by those 4 points it held 8 of 8.</p>`
      : '<p class="note" role="note">No placebo warning: on every covariate at least 20% of the donors are matched worse by their own synthetic controls than the treated unit is. A std gap past 0.25 on its own is no warning: an outcome-only fit passed it on 84% of simulated panels where the covariate did nothing.</p>');
  }
  if (!h.anticipation && !h.leadRange) P.push('<p class="note">If people could see the change coming (a law passed months before it took effect, an announced price rise), set &ldquo;Points people saw it coming&rdquo; to the points between the first moment they could react and the date: in simulation an effect that began 2 or 4 points early was found 40% and 25% of the time at the stated date (62% when it began on the date) and 55% and 54% when backdated by its lead. Backdating when nothing was anticipated cost 10&ndash;18 points.</p>');
  P.push(`<p class="note">Abadie, Diamond and Hainmueller (2010), outcome-only fit. At p 0.05 it flagged 2.3&ndash;5.3% of simulated no-effect panels. It has little power on short or loosely fitted series: of four real state tobacco-tax rises it ranks California 1st of 39 (p 0.026) but Massachusetts, Arizona and Oregon only 6th to 13th, so a large p is not evidence of no effect. A small p says the treated series left its synthetic control more than the donors left theirs; it does not say what caused it.</p>`);
  return P.join('');
}

// Per-point CSV: label, treated, synthetic, gap. A label that starts like a spreadsheet formula (=, +, -, @, tab or CR)
// gets an apostrophe (formula-injection guard), unless it is a plain number such as -5.
export function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function synthCsv(h) {
  return ['label,treated,synthetic,gap', ...h.labels.map((l, i) => `${csvCell(l)},${h.treatedSeries[i]},${h.synthetic[i]},${h.gap[i]}`)].join('\n');
}
