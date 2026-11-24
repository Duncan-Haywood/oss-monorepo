// The page's view of `--turns` (turns-cli.mjs): a chart of the dated series with contractions shaded,
// a table of peaks and troughs, a table of phases, and a CSV. No DOM access, so it is tested in Node.
import { esc } from './report.mjs';

const pct = (v) => `${v >= 0 ? '+' : ''}${(100 * (Math.exp(v) - 1)).toFixed(1)}%`;
const unit = (r) => (r.frequency === 'monthly' ? 'months' : 'quarters');

// Line of the series on a log scale (the rule dates the logged series), grey bands from each peak to the
// next trough, a red triangle at each peak and a blue one at each trough.
export function turnsChartSvg(r, { width = 760, height = 260 } = {}) {
  if (!r.series || r.series.values.length < 2) return '';
  const { labels, values } = r.series;
  const n = values.length, L = 52, R = 12, T = 12, B = 30;
  const ys = values.map((v) => Math.log(v));
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { lo -= 0.01; hi += 0.01; }
  const pad = 0.05 * (hi - lo); lo -= pad; hi += pad;
  const X = (i) => L + ((width - L - R) * i) / (n - 1);
  const Y = (y) => T + ((height - T - B) * (hi - y)) / (hi - lo);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(`The series with ${r.turns.length} dated peaks and troughs; contractions shaded`)}">`];
  for (let j = 0; j < r.turns.length; j++) {
    const t = r.turns[j];
    if (t.kind !== 'peak') continue;
    const end = r.turns[j + 1] ? r.turns[j + 1].index : n - 1;
    parts.push(`<rect x="${X(t.index).toFixed(1)}" y="${T}" width="${Math.max(1, X(end) - X(t.index)).toFixed(1)}" height="${height - T - B}" fill="#8884" />`);
  }
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(ys[i]).toFixed(1)}`;
  parts.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" />`);
  for (const t of r.turns) {
    const x = X(t.index), y = Y(ys[t.index]);
    parts.push(t.kind === 'peak'
      ? `<path d="M${(x - 5).toFixed(1)},${(y - 4).toFixed(1)}L${(x + 5).toFixed(1)},${(y - 4).toFixed(1)}L${x.toFixed(1)},${(y - 12).toFixed(1)}Z" fill="#c0392b"><title>${esc(`Peak ${t.label}`)}</title></path>`
      : `<path d="M${(x - 5).toFixed(1)},${(y + 4).toFixed(1)}L${(x + 5).toFixed(1)},${(y + 4).toFixed(1)}L${x.toFixed(1)},${(y + 12).toFixed(1)}Z" fill="#1f5f86"><title>${esc(`Trough ${t.label}`)}</title></path>`);
  }
  const ticks = 6;
  for (let k = 0; k < ticks; k++) {
    const i = Math.round(((n - 1) * k) / (ticks - 1));
    parts.push(`<text x="${X(i).toFixed(1)}" y="${height - 10}" font-size="11" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}" fill="currentColor">${esc(labels[i])}</text>`);
  }
  for (const y of [lo + pad, hi - pad]) {
    parts.push(`<text x="${L - 6}" y="${(Y(y) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="currentColor">${esc(Number(Math.exp(y).toPrecision(3)))}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

export function turnsSummary(r) {
  const peaks = r.turns.filter((t) => t.kind === 'peak').length, troughs = r.turns.length - peaks;
  const on = r.composite ? `a composite index of ${r.composite.columns.join(', ')}` : 'the series';
  if (!r.turns.length) return `No peak or trough on ${on} (${r.n} points, ${r.first} to ${r.last}): it never rose and fell far enough apart under ${r.frequency} durations.`;
  const last = r.turns[r.turns.length - 1];
  return `${peaks} ${peaks === 1 ? 'peak' : 'peaks'} and ${troughs} ${troughs === 1 ? 'trough' : 'troughs'} on ${on}, ${r.first} to ${r.last}. The latest is a ${last.kind} in ${last.label}: ${last.kind === 'peak' ? 'contracting' : 'expanding'} since, as far as the rule can tell (a newer turn needs months of data after it to be confirmed).`;
}

export function turnsHtml(r) {
  const out = [];
  if (r.composite) {
    out.push(`<p class="note">Composite index (the Conference Board's method: each column's monthly percent change, weighted by one over its volatility, then cumulated). Weights: ${r.composite.columns.map((c, i) => `${esc(c)} ${r.composite.weights[i].toFixed(3)}`).join(', ')}${r.composite.sdUntil ? `, volatility measured up to ${esc(r.composite.sdUntil)}` : ''}.${r.composite.rowsDropped ? ` ${r.composite.rowsDropped} rows without every column were left out.` : ''}</p>`);
  }
  if (r.turns.length) {
    out.push(`<h3>Peaks and troughs</h3><div class="scroll"><table><thead><tr><th>Turn</th><th>At</th><th>Value</th></tr></thead><tbody>${r.turns.map((t) => `<tr><td>${t.kind === 'peak' ? 'Peak' : 'Trough'}</td><td>${esc(t.label)}</td><td>${esc(t.value)}</td></tr>`).join('')}</tbody></table></div>`);
  }
  if (r.phases.length) {
    out.push(`<h3>Phases</h3><div class="scroll"><table><thead><tr><th>Phase</th><th>From</th><th>To</th><th>Length (${unit(r)})</th><th>Change</th></tr></thead><tbody>${r.phases.map((p) => `<tr><td>${p.kind === 'contraction' ? 'Contraction' : 'Expansion'}</td><td>${esc(p.from)}</td><td>${esc(p.to)}</td><td>${p.length}</td><td>${pct(p.change)}</td></tr>`).join('')}</tbody></table></div>`);
  }
  return out.join('');
}

// One row per point: label, value (the composite index for several columns), and the turn on that row.
export function turnsCsv(r) {
  const at = new Map(r.turns.map((t) => [t.index, t.kind]));
  const head = r.composite ? 'label,composite_index,turn' : 'label,value,turn';
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  return [head, ...r.series.labels.map((l, i) => `${q(l)},${r.series.values[i]},${at.get(i) ?? ''}`)].join('\n') + '\n';
}
