// Marital satisfaction by years married (data/satisfaction_by_duration.json, built by
// reproducibility/satisfaction_by_duration/scripts/build.py). Pure helpers plus one renderer
// that draws an accessible SVG line chart with interval bands, using the page's colour tokens so
// light and dark themes follow. Cross-sectional series and the within-couple trajectory are kept
// apart and labelled; nothing here is a prediction for one couple.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (x) => (Number.isFinite(x) ? Math.round(100 * x) + '%' : '—');

// The series for a source and group, or null.
export function seriesFor(data, source, group = 'All') {
  return (data?.series || []).find((s) => s.source === source && s.group === group) || null;
}
// Groups available for a source (e.g. 'Sex: Women').
export function groupsFor(data, source) {
  return (data?.series || []).filter((s) => s.source === source).map((s) => s.group);
}
// The duration band a number of years married falls in, for a series ('0-2', '3-5', ...).
export function bandFor(series, years) {
  if (!series || !Number.isFinite(years)) return null;
  for (const p of series.points) {
    const [lo, hi] = p.level.endsWith('+') ? [Number(p.level.slice(0, -1)), Infinity] : p.level.split('-').map(Number);
    if (years >= lo && years <= hi + 0.999) return p;
  }
  return null;
}
// Largest drop from the first band to the lowest later band, with intervals: the headline.
export function dip(series) {
  if (!series || series.points.length < 2) return null;
  const first = series.points[0];
  const low = series.points.slice(1).reduce((m, p) => (p.very_happy < m.very_happy ? p : m));
  const last = series.points[series.points.length - 1];
  return { first, low, last, drop: first.very_happy - low.very_happy };
}

const COLORS = ['var(--series-1)', 'var(--sat-2)', 'var(--sat-3)'];

// Line chart: x = years married (band middles), y = share giving the top answer, with 95% bands.
export function chartSvg(lines, { W = 720, H = 300, yLabel = 'share giving the top answer' } = {}) {
  const L = 46, R = 14, T = 12, Bm = 38;
  const pts = lines.flatMap((l) => l.points);
  const xmax = Math.max(...pts.map((p) => p.mid_years)) + 2;
  const ylo = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.very_happy_lo ?? p.very_happy)) - 0.05) * 10) / 10);
  const yhi = Math.min(1, Math.ceil((Math.max(...pts.map((p) => p.very_happy_hi ?? p.very_happy)) + 0.05) * 10) / 10);
  const xs = (t) => L + (t / xmax) * (W - L - R);
  const ys = (v) => T + (1 - (v - ylo) / (yhi - ylo)) * (H - T - Bm);
  let grid = '';
  for (let v = ylo; v <= yhi + 1e-9; v += 0.1) grid += `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--grid)"/><text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${pct(v)}</text>`;
  for (let t = 0; t <= xmax; t += 10) grid += `<text x="${xs(t)}" y="${H - 18}" text-anchor="middle">${t}</text>`;
  grid += `<text x="${(W + L) / 2}" y="${H - 2}" text-anchor="middle">years married</text>`;
  const body = lines.map((l, i) => {
    const c = COLORS[i % COLORS.length];
    const ps = l.points;
    const band = ps.every((p) => Number.isFinite(p.very_happy_lo))
      ? `<path d="${ps.map((p, j) => `${j ? 'L' : 'M'}${xs(p.mid_years).toFixed(1)},${ys(p.very_happy_hi).toFixed(1)}`).join('')}${ps.slice().reverse().map((p) => `L${xs(p.mid_years).toFixed(1)},${ys(p.very_happy_lo).toFixed(1)}`).join('')}Z" fill="${c}" opacity="0.14"/>` : '';
    const line = `<path d="${ps.map((p, j) => `${j ? 'L' : 'M'}${xs(p.mid_years).toFixed(1)},${ys(p.very_happy).toFixed(1)}`).join('')}" fill="none" stroke="${c}" stroke-width="2.5"${l.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    const dots = ps.map((p) => `<circle cx="${xs(p.mid_years).toFixed(1)}" cy="${ys(p.very_happy).toFixed(1)}" r="3.5" fill="${c}" stroke="var(--surface-1)" stroke-width="1.5"><title>${esc(l.name)}, ${esc(p.level)} years: ${pct(p.very_happy)}${Number.isFinite(p.very_happy_lo) ? ` (95% CI ${pct(p.very_happy_lo)}–${pct(p.very_happy_hi)})` : ''}, ${p.n} people</title></circle>`).join('');
    return band + line + dots;
  }).join('');
  const desc = lines.map((l) => `${l.name}: ${l.points.map((p) => `${p.level} years ${pct(p.very_happy)}`).join(', ')}`).join('. ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Share giving the top answer by years married. ${desc}`)}">${grid}${body}</svg>`;
}

export function legend(lines) {
  return `<div class="legend">${lines.map((l, i) => `<span><i style="background:${COLORS[i % COLORS.length]}${l.dashed ? ';opacity:0.6' : ''}"></i>${esc(l.name)}</span>`).join('')}</div>`;
}

// The whole panel: chart, table, trajectory and survivor-bias note. `yearsMarried` marks the
// band of the couple in the form.
export function renderSatisfaction(el, data, { group = 'All', yearsMarried = null } = {}) {
  if (!data) { el.innerHTML = '<p class="note">The satisfaction data did not load.</p>'; return; }
  const gss = seriesFor(data, 'GSS 1973-1994', group) || seriesFor(data, 'GSS 1973-1994');
  const adj = seriesFor(data, 'GSS 1973-1994', 'Adjusted for survey year, sex and age at marriage');
  const hc = seriesFor(data, 'HCMST 2009', group.startsWith('Sex') ? group : 'All') || seriesFor(data, 'HCMST 2009');
  const lines = [
    gss && { name: `GSS, “very happy” with the marriage (${gss.group === 'All' ? 'all' : gss.group.toLowerCase()})`, points: gss.points },
    hc && { name: `HCMST 2009, relationship “excellent” (${hc.group === 'All' ? 'all' : hc.group.toLowerCase()})`, points: hc.points },
    group === 'All' && adj && { name: 'GSS, adjusted for survey year, sex and age at marriage', points: adj.points, dashed: true },
  ].filter(Boolean);
  const d = dip(gss);
  const t = data.trajectory;
  const tAll = t?.rows.find((r) => r.level === 'All');
  const tBands = (t?.rows || []).filter((r) => r.level !== 'All');
  const sb = data.survivor_bias?.rows || [];
  const stay = sb.find((r) => /together/i.test(r.level));
  const left = sb.find((r) => /broke/i.test(r.level));
  const mine = Number.isFinite(yearsMarried) ? bandFor(gss, yearsMarried) : null;
  const opts = groupsFor(data, 'GSS 1973-1994').filter((g) => !/^Adjusted/.test(g));
  const f2 = (x) => (Number.isFinite(x) ? (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) : '—');
  el.innerHTML = `
    <label class="inline">Group <select id="satGroup">${opts.map((g) => `<option${g === group ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
    ${d ? `<p class="rep-stand"><strong>Cross-sectional (different couples at each length):</strong> ${pct(d.first.very_happy)} of first-marriage spouses married 0–2 years called their marriage “very happy” (95% CI ${pct(d.first.very_happy_lo)}–${pct(d.first.very_happy_hi)}), against ${pct(d.low.very_happy)} at ${esc(d.low.level)} years (${pct(d.low.very_happy_lo)}–${pct(d.low.very_happy_hi)}) and ${pct(d.last.very_happy)} at ${esc(d.last.level)} years. The later rise is at least partly survivor bias: unhappy marriages end and leave the sample.${mine ? ` <small>Your marriage (${yearsMarried} years) is in the ${esc(mine.level)}-year band: ${pct(mine.very_happy)} very happy among surveyed spouses.</small>` : ''}</p>` : ''}
    <figure class="chart-card sat-chart"><figcaption><strong>Share giving the top answer about their marriage, by years married</strong></figcaption>${legend(lines)}${chartSvg(lines)}
      <figcaption class="small">Shaded: 95% bootstrap intervals. The GSS and HCMST questions differ (three answers against five), so compare shapes, not levels. Hover a point for its numbers.</figcaption></figure>
    ${tAll ? `<h4>Within the same couples: HCMST 2009 → 2013</h4>
    <p class="rep-stand">The same ${tAll.n.toLocaleString('en-US')} married people re-rated the same relationship about four years later (still together): the mean rating moved ${f2(tAll.mean_change)} points on a 1–5 scale (95% CI ${f2(tAll.mean_change_lo)} to ${f2(tAll.mean_change_hi)}); ${pct(tAll.share_fell)} rated it lower and ${pct(tAll.share_rose)} higher.</p>
    <div class="table-wrap"><table class="rep-table"><thead><tr><th scope="col">Years married in 2009</th><th class="num" scope="col">People</th><th class="num" scope="col">2009 mean</th><th class="num" scope="col">2013 mean</th><th class="num" scope="col">Change (95% CI)</th><th class="num" scope="col">Rated it lower</th></tr></thead><tbody>
    ${tBands.map((r) => `<tr><th scope="row">${esc(r.level)}</th><td class="num">${r.n}</td><td class="num">${r.mean_w1.toFixed(2)}</td><td class="num">${r.mean_w4.toFixed(2)}</td><td class="num">${f2(r.mean_change)} <small>${f2(r.mean_change_lo)} to ${f2(r.mean_change_hi)}</small></td><td class="num">${pct(r.share_fell)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${stay && left ? `<p class="small"><strong>Survivor bias, measured:</strong> in 2009, ${pct(stay.excellent)} of married HCMST respondents who were still together at the last follow-up called the relationship excellent, against ${pct(left.excellent)} of the ${left.n} who broke up by 2015 (95% CI ${pct(left.excellent_lo)}–${pct(left.excellent_hi)}). Cross-sectional curves at long durations leave the second group out.</p>` : ''}
    <p class="small">Sources: General Social Survey 1973–1994 (NORC; first marriages, never divorced, ${data.audit?.gss?.analysed?.toLocaleString('en-US') || ''} respondents) and HCMST 2009 waves 1 and 4 (Stanford). Method and caveats: <a href="https://github.com/duncan-haywood/oss-monorepo/blob/main/research/marriage-divorce-evidence/reproducibility/satisfaction_by_duration/README.md">satisfaction_by_duration/README.md</a>.</p>`;
}
