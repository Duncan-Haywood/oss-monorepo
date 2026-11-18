// The page's view of a synthetic control (synth-cli.mjs synthResult): the same numbers and warnings the CLI prints
// (synthText), as HTML with a chart of the treated series against its synthetic and the covariate balance table.
// Pure functions of the result, so page tests read them without a browser (synth-page.test.mjs).
import { esc, fmt } from './report.mjs';

const f = (v, d = 2) => Number(v).toFixed(d), g = (v) => Number(v).toPrecision(3);

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
  P.push(`<p class="summary"><strong>${esc(h.treated)} after ${esc(h.lastBefore)}:</strong> ${g(h.effectAverage)} on average against its synthetic control (${g(h.effectAtEnd)} at the last point), on the ${scale}. Placebo test: rank ${h.rank} of ${h.donors + 1}, p ${f(h.p, 3)}${h.p <= 0.05 ? ', a gap larger than almost every donor shows at the same date' : ''}.</p>`);
  if (h.anticipation) P.push(`<p class="note"><strong>Backdated ${h.anticipation} point${h.anticipation > 1 ? 's' : ''}:</strong> the synthetic control is fitted on the points up to ${esc(h.fitEnd)}, before people could react, so a change they saw coming is not fitted away; the gap and the test read from ${esc(h.fitEnd)} on. Mean gap from ${esc(h.firstAfter)} on: ${g(h.gapFromDate)}.</p>`);
  P.push(`<p class="note">Synthetic ${esc(h.treated)} = ${shown}${h.weights.length > 8 ? `, +${h.weights.length - 8} more` : ''} (weights at least zero, summing to one, matching every point from ${esc(h.from)} to ${esc(h.anticipation ? h.fitEnd : h.lastBefore)}).</p>`);
  P.push(`<p class="note">Fit before the date: RMSPE ${g(h.preRmspe)}; ${f(100 * h.preFitShare, 0)}% of the donors' own synthetic controls fit better.${h.fitWarning ? ` <strong>Fit warning:</strong> ${esc(h.treated)} is fitted worse than 80% of the placebos, so its gap after the date is hard to read (often it sits outside the donors' range).` : ''}</p>`);
  P.push(`<p class="note">Placebo test: each of the ${h.donors} donors is given the same date and its own synthetic control; the statistic is the after-gap over the before-gap, the before-gap floored at the median of all units. The smallest p ${h.donors + 1} units allow is ${f(h.minP, 3)}. The paper's plain ratio gives rank ${h.tests.ratio.rank}, p ${f(h.tests.ratio.p, 3)}.</p>`);
  if (h.balance) {
    const warned = h.balance.filter((c) => c.placeboWarning).map((c) => c.name);
    P.push('<h3>Covariate balance</h3><p class="note">A description of the fit, not a test: it changes no p. Std gap = (treated &minus; synthetic) / sd over all units; &ldquo;placebos matched better&rdquo; is the share of donors whose own synthetic control matches them more closely on that covariate.</p>');
    P.push(`<div class="scroll"><table id="synth-balance"><tr><th>Covariate</th><th class="n">${esc(h.treated)}</th><th class="n">Synthetic</th><th class="n">Donor mean</th><th class="n">Std gap</th><th class="n">Placebos matched better</th><th></th></tr>`
      + h.balance.map((c) => `<tr><td>${esc(c.name)}</td><td class="n">${g(c.treated)}</td><td class="n">${g(c.synthetic)}</td><td class="n">${g(c.donorMean)}</td><td class="n">${f(c.stdGap)}</td><td class="n">${f(100 * c.placeboShare, 0)}%</td><td>${c.placeboWarning ? '<strong>Warning</strong>' : ''}</td></tr>`).join('')
      + '</table></div>');
    P.push(warned.length
      ? `<p class="note" role="note"><strong>Warning on ${warned.map(esc).join(', ')}:</strong> ${esc(h.treated)} is matched worse on ${warned.length > 1 ? 'these' : 'this'} than at least 80% of the donors are by their own synthetic controls. If ${warned.length > 1 ? 'one of them' : 'it'} moved the outcome after the date, the gap and its p can be off in either direction. In simulation, panels with this warning reached p &le; 0.05 with no effect 13&ndash;21% of the time when the covariate mattered (0&ndash;0.6% without it), and the warning came up on about 1 panel in 5 when the covariate did nothing. The warned covariate need not be the one that moved the outcome, and correlated covariates share warnings. The same held when the covariate&rsquo;s shock was a slope from the date or a pulse that faded (8&ndash;19% of warned panels at p &le; 0.05 with no effect, 0&ndash;0.3% of the rest), so a significant gap that fades can be a short covariate shock.</p>`
      : '<p class="note" role="note">No placebo warning: on every covariate at least 20% of the donors are matched worse by their own synthetic controls than the treated unit is. A std gap past 0.25 on its own is no warning: an outcome-only fit passed it on 84% of simulated panels where the covariate did nothing.</p>');
  }
  if (!h.anticipation) P.push('<p class="note">If people could see the change coming (a law passed months before it took effect, an announced price rise), set &ldquo;Points people saw it coming&rdquo; to the points between the first moment they could react and the date: in simulation an effect that began 2 or 4 points early was found ANTICIP_STATED_H of the time at the stated date and ANTICIP_BACK_H when backdated by its lead.</p>');
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
