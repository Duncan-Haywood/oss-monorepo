// The page's view of `--model drift` (drift-cli.mjs driftResult): jumps on a level that wanders as a
// random walk between them. Pure functions (strings in, strings out) so Node tests can pin exactly
// what the page shows. The CLI text stays in drift-cli.mjs; this file only words it for the page.
import { esc, fmt } from './report.mjs';
import { tailLines, DRIFT_TCPD } from './drift-cli.mjs';

/** Penalty boxes on the page -> driftResult's penalty. The drift model has a BIC (2 log n) and takes a number; AIC and Hannan-Quinn are not defined for it here. */
export function driftPagePenalty(choice, value) {
  if (choice === 'bic' || choice == null || choice === '') return 'bic';
  if (choice === 'custom') return Number(value);
  throw new Error('The wandering-level model takes the BIC penalty or a custom number; AIC and Hannan-Quinn are not defined for it.');
}

/** Options on the page that the drift model ignores, by their page names, so the page can say so instead of silently dropping them. */
export function driftIgnored(o) {
  const out = [];
  if (o.log) out.push('take logs first');
  if (o.period) out.push('seasonal period');
  if (o.trend) out.push('trend under the steps');
  if (o.ar1) out.push('autocorrelated noise');
  if (o.noiseFloor) out.push('noise floor');
  if (o.slopeBreaks) out.push('growth-rate test');
  if (o.robust) out.push('heavy-tailed noise');
  return out;
}

const s = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** One plain-language paragraph: what was found, how big the noise and the wander are. */
export function driftSummary(r) {
  const head = r.changes.length
    ? `${s(r.changes.length, 'jump', 'jumps')} too big for the drift: ${r.changes.slice(0, 6).map((c) => `${c.label} (${c.jump >= 0 ? '+' : ''}${fmt(c.jump)}, ${c.jumpSd >= 0 ? '+' : ''}${c.jumpSd.toFixed(1)} noise sd)`).join(', ')}${r.changes.length > 6 ? `, and ${r.changes.length - 6} more` : ''}.`
    : 'No jump stands out from the drift.';
  const wander = `Between jumps the level wanders by about ${fmt(r.omega)} a step (sd) and the points scatter around it with sd ${fmt(r.sigma)}${r.slope ? `, after a steady growth of ${fmt(r.slope)} a step was taken out` : ''}; slow wander is not counted as a change.`;
  return `${r.column}, ${r.n} values. ${head} ${wander}`;
}

/** The notes under the summary: the heavy-tail check (when it fires) and what the model was scored at. */
export function driftNotes(r) {
  const notes = tailLines(r).map((t) => t.replace('try --model meanvar on its differences', 'try the "Level and volatility" model on its differences (the first differences of the series)'));
  const t = DRIFT_TCPD;
  const k = r.noise === 'ml' ? 'ml' : 'lags';
  notes.push(`On the 38 labelled series of the Turing Change Point Dataset this model scored F1 ${t.shipped[k].toFixed(3)} (31 series) and ${t.heldout[k].toFixed(3)} (7 held out), against ${t.shipped.level} and ${t.heldout.level.toFixed(3)} for the plain level model and ${t.shipped.zero} and ${t.heldout.zero} for reporting no change at all. It tames smooth and wandering series; on heavy-tailed or bursty ones (stock prices, counts) it still finds too many jumps.`);
  return notes;
}

/** Series, the fitted (smoothed) level and a dashed line at each jump, in the page chart's frame. */
export function driftChartSvg(r) {
  const W = 900, H = 280, P = 44, n = r.n;
  const vals = r.values, lvl = r.level.length === r.n ? r.level : [];
  const all = vals.concat(lvl.filter(Number.isFinite));
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.06 || 1;
  const X = (i) => P + (i / Math.max(1, n - 1)) * (W - P - 10);
  const Y = (v) => 10 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - 30);
  const parts = [`<line x1="${P}" y1="${H - 20}" x2="${W - 10}" y2="${H - 20}" stroke="#ccd5dd"/>`];
  for (const t of [lo, (lo + hi) / 2, hi]) parts.push(`<text x="${P - 6}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="#4c5a68">${fmt(t)}</text>`);
  const tickEvery = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += tickEvery) parts.push(`<text x="${X(i)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="#4c5a68">${esc(r.labels[i]).slice(0, 10)}</text>`);
  parts.push(`<path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')}" fill="none" stroke="#8aa1b1" stroke-width="1.2"/>`);
  if (n <= 600) for (let i = 0; i < n; i++) parts.push(`<circle cx="${X(i).toFixed(1)}" cy="${Y(vals[i]).toFixed(1)}" r="2" fill="#4c6a7d"/>`);
  // The level is drawn per segment, so a jump shows as a break in the line, not a steep stretch.
  const cuts = [0, ...r.changes.map((c) => c.index), n];
  for (let k = 0; lvl.length && k + 1 < cuts.length; k++) {
    let d = '';
    for (let i = cuts[k]; i < cuts[k + 1]; i++) d += `${i === cuts[k] ? 'M' : 'L'}${X(i).toFixed(1)},${Y(lvl[i]).toFixed(1)}`;
    if (d) parts.push(`<path d="${d}" fill="none" stroke="#c0392b" stroke-width="2.5"/>`);
  }
  for (const c of r.changes) parts.push(`<line x1="${X(c.index - 0.5)}" x2="${X(c.index - 0.5)}" y1="10" y2="${H - 20}" stroke="#c0392b" stroke-dasharray="4 4"><title>${esc(c.label)}</title></line>`);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/** The jumps table (rows of the page's #changes table). */
export function driftTableHtml(r) {
  if (!r.changes.length) return '<tr><td>No jump stands out from the drift at this penalty.</td></tr>';
  return '<tr><th>Jump at</th><th class="n">Level before</th><th class="n">Level after</th><th class="n">Jump</th><th class="n">Jump (noise sd)</th></tr>' +
    r.changes.map((c) => `<tr><td>${esc(c.label)}</td><td class="n">${fmt(c.before)}</td><td class="n">${fmt(c.after)}</td><td class="n">${fmt(c.jump)}</td><td class="n">${fmt(c.jumpSd)}</td></tr>`).join('');
}

/** The stretches between jumps (rows of the page's #segments table). */
export function driftSegmentsHtml(r) {
  const cuts = [0, ...r.changes.map((c) => c.index), r.n];
  const rows = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const a = cuts[k], b = cuts[k + 1] - 1;
    rows.push(`<tr><td>${esc(r.labels[a])}</td><td>${esc(r.labels[b])}</td><td class="n">${b - a + 1}</td><td class="n">${fmt(r.level[a] ?? NaN)}</td><td class="n">${fmt(r.level[b] ?? NaN)}</td></tr>`);
  }
  return '<tr><th>From</th><th>To</th><th class="n">Points</th><th class="n">Level at start</th><th class="n">Level at end</th></tr>' + rows.join('');
}

/** Per-point CSV: label, value, stretch number, fitted level. */
export function driftCsv(r) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const cuts = new Set(r.changes.map((c) => c.index));
  let seg = 1;
  const rows = ['label,value,stretch,fitted_level'];
  for (let i = 0; i < r.n; i++) {
    if (cuts.has(i)) seg++;
    rows.push([q(r.labels[i]), r.values[i], seg, r.level[i] ?? ''].join(','));
  }
  return rows.join('\n');
}
