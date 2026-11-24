// `--turns` in the CLI: peaks and troughs dated by Bry-Boschan's rule (BBQ, turning-points.mjs) on one column, or
// on a composite index of several columns (`--columns a,b,c`, composite-index.mjs: the Conference Board's method).
//
// Shipped by the pre-registered round in README "A composite of NBER's monthly indicators dates every turn"
// (eval/turns-composite.mjs): on PAYEMS, W875RX1, INDPRO and CMRMTSPL, 1967-2026, the composite's BBQ turns
// matched all 16 of NBER's monthly peaks and troughs within 3 months, with no false turn. A single series did
// not: GDP 19 of 24, payrolls 17 of 26 (README "BBQ on FRED GDPC1", "BBQ on monthly payrolls").
//
// Defaults: monthly durations (window 5, phases 6, cycles 15) with bigMove 0.05, the setting the round passed
// with; quarterly is BBQ's own (window 2, phases 2, cycles 5) and keeps no short phase. The series is logged.
import { parseSeries, DEFAULTS } from './engine.mjs';
import { turningPoints } from './turning-points.mjs';
import { compositeIndex } from './composite-index.mjs';
import { heavyLate } from './heavy-late.mjs';

export const TURNS_DEFAULTS = { monthly: { bigMove: 0.05 }, quarterly: {} };

function alignColumns(csv, columns, labelColumn) {
  const parsed = columns.map((c) => ({ c, ...parseSeries(csv, c, labelColumn) }));
  const maps = parsed.map((p) => new Map(p.labels.map((l, i) => [l, p.values[i]])));
  const labels = parsed[0].labels.filter((l) => maps.every((m) => m.has(l)));
  const dropped = parsed[0].labels.length - labels.length;
  return { labels, series: maps.map((m) => labels.map((l) => m.get(l))), names: parsed.map((p) => p.column), dropped };
}

export function turnsResult({ csv, column = null, columns = null, labelColumn = null, frequency = 'monthly', bigMove = null, sdUntil = null, withSeries = false }) {
  if (frequency !== 'monthly' && frequency !== 'quarterly') throw new Error('--frequency takes monthly or quarterly.');
  const src = csv ?? DEFAULTS.csv;
  const rule = { ...TURNS_DEFAULTS[frequency], ...(bigMove != null ? { bigMove: bigMove === 'off' ? Infinity : Number(bigMove) } : {}) };
  if (!(rule.bigMove === undefined || rule.bigMove === Infinity || rule.bigMove > 0)) throw new Error('--big-move takes a positive number (a log move, 0.05 is about 5%) or off.');
  let labels, x, composite = null;
  if (columns && columns.length) {
    if (columns.length < 2) throw new Error('--turns --columns needs two or more columns for a composite (or use --column for one).');
    const a = alignColumns(src, columns, labelColumn);
    if (a.series.some((s) => s.some((v) => !(v > 0)))) throw new Error('--turns needs every value above zero (the composite is built from percent changes).');
    let sdWindow;
    if (sdUntil != null) {
      const k = a.labels.indexOf(String(sdUntil));
      if (k < 2) throw new Error(`--sd-until ${sdUntil}: no row has that label, or it is too early (labels run ${a.labels[0]} to ${a.labels[a.labels.length - 1]}).`);
      sdWindow = [1, k + 1];
    }
    const c = compositeIndex(a.series, { sdWindow });
    labels = a.labels; x = c.index;
    composite = { columns: a.names, weights: c.weights.map((w) => Number(w.toFixed(4))), rowsDropped: a.dropped, sdUntil: sdUntil ?? null, heavyLate: null };
    // Heaviest-is-latest (README "A heaviest-is-latest warning", eval/turns-heavy-late.mjs): monthly composites only,
    // the setting the round passed with. The main dates stay the full composite's; the warning adds the dates
    // without the heavy column, for the user to compare.
    if (frequency === 'monthly') {
      const w = heavyLate(a.series, c.weights, { rule: { frequency, ...rule } });
      if (w.fires) {
        const rest = w.without.map((i) => a.series[i]);
        const y = rest.length >= 2 ? compositeIndex(rest, { sdWindow }).index : rest[0];
        composite.heavyLate = {
          column: a.names[w.column], weight: Number(w.weight.toFixed(4)), lag: w.lag,
          lags: Object.fromEntries(a.names.map((nm, i) => [nm, w.lags[i]])),
          without: w.without.map((i) => a.names[i]),
          turns: turningPoints(y, { frequency, ...rule }).turns.map((t) => ({ kind: t.kind, label: a.labels[t.i], index: t.i })),
        };
      }
    }
  } else {
    if (sdUntil != null) throw new Error('--sd-until goes with --turns --columns (a composite).');
    const p = parseSeries(src, column, labelColumn);
    labels = p.labels; x = p.values;
    if (x.some((v) => !(v > 0))) throw new Error('--turns needs every value above zero (the series is logged).');
  }
  const tp = turningPoints(x, { frequency, ...rule });
  const turns = tp.turns.map((t) => ({ kind: t.kind, label: labels[t.i], index: t.i, value: Number(x[t.i].toPrecision(6)) }));
  const phases = [];
  for (let j = 0; j + 1 < turns.length; j++) {
    const a = turns[j], b = turns[j + 1];
    phases.push({ from: a.label, to: b.label, kind: a.kind === 'peak' ? 'contraction' : 'expansion', length: b.index - a.index, change: Number((Math.log(b.value / a.value)).toFixed(4)) });
  }
  const out = { method: 'bbq', frequency, bigMove: rule.bigMove === undefined || rule.bigMove === Infinity ? null : rule.bigMove, n: x.length, first: labels[0], last: labels[labels.length - 1], composite, turns, phases };
  // The page draws the dated series (the composite index when there are several columns).
  if (withSeries) out.series = { labels, values: x.map((v) => Number(v.toPrecision(6))) };
  return out;
}

const pct = (v) => `${v >= 0 ? '+' : ''}${(100 * (Math.exp(v) - 1)).toFixed(1)}%`;
export function turnsText(r) {
  const lines = [`Peaks and troughs by Bry-Boschan's rule (${r.frequency} durations${r.bigMove ? `, a short phase kept when it moves ${(100 * r.bigMove).toFixed(0)}% or more` : ''}), ${r.n} points, ${r.first} to ${r.last}:`];
  if (r.composite) {
    lines.push(`  On a composite index of ${r.composite.columns.join(', ')} (Conference Board method: weights ${r.composite.columns.map((c, i) => `${c} ${r.composite.weights[i].toFixed(3)}`).join(', ')}${r.composite.sdUntil ? `, volatility measured to ${r.composite.sdUntil}` : ''})${r.composite.rowsDropped ? `; ${r.composite.rowsDropped} rows without every column left out` : ''}.`);
  }
  const hl = r.composite && r.composite.heavyLate;
  if (hl) {
    lines.push(`  Warning: ${hl.column} carries ${(100 * hl.weight).toFixed(0)}% of the weight and is also the latest column (its turns come a median ${hl.lag} ${r.frequency === 'monthly' ? 'months' : 'rows'} after the other columns'), so it can delay the composite's dates. Dated without it (${hl.without.join(', ')}): ${hl.turns.length ? hl.turns.map((t) => `${t.kind} ${t.label}`).join(', ') : 'no turn'}. In simulations of four business makes this warning's alternative dated turns better when it fired (README "A heaviest-is-latest warning"); compare both with what you know happened.`);
  }
  if (!r.turns.length) { lines.push('  No turning point: the series has no peak and trough far enough apart under these durations.'); return lines.join('\n'); }
  for (const t of r.turns) lines.push(`  ${t.kind === 'peak' ? 'Peak  ' : 'Trough'} ${t.label}`);
  if (r.phases.length) {
    lines.push('', '  Phases:');
    for (const p of r.phases) lines.push(`    ${p.kind.padEnd(11)} ${p.from} to ${p.to}: ${p.length} ${r.frequency === 'monthly' ? 'months' : 'quarters'}, ${pct(p.change)}`);
  }
  lines.push('', '  How far to trust it: on FRED\'s payrolls, real income less transfers, industrial production and real sales, 1967-2026, the composite dated all 16 NBER peaks and troughs within 3 months with no false turn; one series alone missed 2 to 7 (README "A composite of NBER\'s monthly indicators"). The last turn can move as new data arrive: a peak needs months of decline after it to be confirmed.');
  return lines.join('\n');
}
