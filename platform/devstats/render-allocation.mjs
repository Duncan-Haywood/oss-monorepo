// HTML for the dashboard's "Where the runs go" and "Where the next runs go"
// sections (allocation.mjs computes them). Static, no script.

import { CHART_TRACKS } from './allocation.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v);
const na = '<span class="na">not measured</span>';
const pct = (v) => (v == null ? na : `${Math.round(v * 100)}%`);
const signed = (v) => (v == null ? na : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v * 100))} pts`);

const PORTFOLIOS = [['products', 'Products (ventures/)'], ['research', 'Research (research/)'], ['platform', 'Platform, process and site'], ['unattributed', 'Unattributed']];
const SERIES = [...CHART_TRACKS, 'other'];

/** CSS for the track series; categorical slots 1-5 in fixed order, "other" neutral. */
export const ALLOCATION_STYLE = `
  :root { --t-ventures:#2a78d6; --t-research:#eb6834; --t-creative:#1baf7a; --t-process:#eda100; --t-redteam:#e87ba4; --t-other:#8a94a3; }
  @media (prefers-color-scheme: dark) { :root { --t-ventures:#3987e5; --t-research:#d95926; --t-creative:#199e70; --t-process:#c98500; --t-redteam:#d55181; --t-other:#6d7886; } }
  ${SERIES.map((t) => `.chart .t-${t}, .legend .t-${t} { fill:var(--t-${t}); background:var(--t-${t}); }`).join('\n  ')}
  .chart.tracks rect { stroke:var(--panel); stroke-width:1; }
  .share { display:inline-block; height:8px; border-radius:2px; background:var(--accent); vertical-align:middle; margin-left:6px; opacity:.7; }
  .gap-over { color:var(--fail); } .gap-under { color:var(--accent); }
  .lane td:first-child { white-space:nowrap; }`;

/** Agent runs per day stacked by track, last 30 days. */
export function trackChart(perDay, { width = 720, height = 180 } = {}) {
  const days = Object.keys(perDay);
  const sums = days.map((d) => SERIES.reduce((a, k) => a + (perDay[d][k] ?? 0), 0));
  const max = Math.max(1, ...sums);
  const gap = 3;
  const bw = Math.max(2, (width - gap * (days.length - 1)) / days.length);
  const scale = (height - 20) / max;
  const bars = days.map((d, i) => {
    const x = Math.round(i * (bw + gap));
    let y = height;
    return SERIES.map((k) => {
      const n = perDay[d][k] ?? 0;
      if (!n) return '';
      const h = Math.max(1, n * scale);
      y -= h;
      return `<rect class="t-${k}" x="${x}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(d)}: ${n} ${k} runs of ${sums[i]}</title></rect>`;
    }).join('');
  }).join('');
  const totals = SERIES.map((k) => `${k} ${days.reduce((a, d) => a + (perDay[d][k] ?? 0), 0)}`).join(', ');
  return `<svg class="chart tracks" viewBox="0 0 ${width} ${height}" role="img" aria-label="Agent runs per day by track, last ${days.length} days: ${esc(totals)}">
  <line x1="0" y1="${height}" x2="${width}" y2="${height}" class="axis"/>${bars}
  <text x="0" y="12" class="tick">${max}</text></svg>
  <p class="legend">${SERIES.map((k) => `<span><i class="t-${k}"></i>${k}</span>`).join('')}</p>
  <details><summary>Table</summary><div class="scroll"><table><thead><tr><th>Day</th>${SERIES.map((k) => `<th class="num">${k}</th>`).join('')}<th class="num">All</th></tr></thead><tbody>
${days.map((d, i) => `<tr><td>${d}</td>${SERIES.map((k) => `<td class="num">${perDay[d][k] ?? 0}</td>`).join('')}<td class="num">${sums[i]}</td></tr>`).join('\n')}
</tbody></table></div></details>`;
}

function cell(g) {
  if (!g) return '<td class="num">0</td>';
  return `<td class="num">${num(Math.round(g.runs))} <span class="note">(${Math.round((g.share ?? 0) * 100)}%)</span></td>`;
}

/** Rows × periods: count and share of runs per period. */
function periodTable(periods, field, keyLabel, rows) {
  return `<table><thead><tr><th>${esc(keyLabel)}</th>${periods.map((p) => `<th class="num">${esc(p.label)}</th>`).join('')}</tr></thead><tbody>
${rows.map(([k, label]) => `<tr><td>${label}</td>${periods.map((p) => cell(p[field][k])).join('')}</tr>`).join('\n')}
<tr><th>All runs</th>${periods.map((p) => `<td class="num"><strong>${num(p.runs)}</strong></td>`).join('')}</tr>
</tbody></table>`;
}

const projectLink = (area) => {
  if (!area) return '<span class="na">no directory</span>';
  const label = esc(area);
  return /^(ventures|research)\//.test(area) ? `<a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/${label}"><code>${label}</code></a>` : `<code>${label}</code>`;
};

export function allocationSection(a) {
  const ps = a.periods;
  const week = ps.find((p) => p.key === '7d');
  const tracks = [...new Set(ps.flatMap((p) => Object.keys(p.by_track)))].sort((x, y) => (ps[ps.length - 1].by_track[y]?.runs ?? 0) - (ps[ps.length - 1].by_track[x]?.runs ?? 0));
  const projects = Object.keys(week.by_project).slice(0, 20);
  const cov = ps.map((p) => `${esc(p.key === 'today' ? 'today' : p.label.toLowerCase())} ${p.runs ? Math.round((p.attributed / p.runs) * 100) : 0}%`).join(', ');
  const via = ps[ps.length - 1].attributed_via;
  return `<p class="note">Every agent run leaves a record in <code>prompts/runs/</code>; these tables count them by the period they ran in. Records start ${esc(a.first_record)}. "Today" is the UTC day so far.</p>
  <h3>By portfolio</h3>
  <div class="scroll">${periodTable(ps, 'by_portfolio', 'Portfolio', PORTFOLIOS)}</div>
  <p class="note">Runs attributed to a project: ${cov}. Over all records, ${num(via.record)} from the record's own <code>projects</code>, ${num(via.merge)} from its PR's merge title, ${num(via.mention)} from a directory its text names. ${esc(a.attribution_note)}</p>
  <h3>By track, per day</h3>
  ${trackChart(a.daily_by_track)}
  <div class="scroll">${periodTable(ps, 'by_track', 'Track', tracks.map((t) => [t, esc(t)]))}</div>
  <h3>By project: the ${projects.length} with the most runs in the last 7 days</h3>
  <div class="scroll"><table><thead><tr><th>Project</th>${ps.map((p) => `<th class="num">${esc(p.label)}</th>`).join('')}</tr></thead><tbody>
${projects.map((k) => `<tr><td>${projectLink(k)}</td>${ps.map((p) => cell(p.by_project[k])).join('')}</tr>`).join('\n')}
</tbody></table></div>
  <p class="note">Every project's counts are in <a href="stats.json">stats.json</a> (<code>allocation.periods[].by_project</code>).</p>`;
}

function laneTable(items) {
  return `<table class="lane"><thead><tr><th>#</th><th>Lane</th><th>Project</th><th>Next milestone</th><th class="num">Runs, 7 days</th><th class="num">Runs, 30 days</th></tr></thead><tbody>
${items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.lane)}</td><td>${projectLink(it.area)}${it.area ? '' : `<br>${esc(it.title)}`}</td><td>${esc(it.next ?? '')}</td><td class="num">${it.runs_7d == null ? na : num(Math.round(it.runs_7d))}</td><td class="num">${it.runs_30d == null ? na : num(Math.round(it.runs_30d))}</td></tr>`).join('\n')}
</tbody></table>`;
}

export function nextSection(n) {
  if (!n?.available) return `<p class="na">Not measured in this build: ${esc(n?.reason ?? 'no routing')}.</p>`;
  const r = n.review;
  const idleProgrammes = (n.lanes.research ?? []).filter((p) => !p.runs_7d).map((p) => p.title);
  const idleFlagships = (n.lanes.product ?? []).filter((p) => p.lane.startsWith('Flagship') && !p.runs_7d).map((p) => p.title);
  return `<p class="note">At the recent rate of about <strong>${num(n.runs_per_day)} runs a day</strong> (${esc(n.rate_note)}), <code>prompts/routing.json</code> sends the next runs to these tracks. "Got" is each track's share of the routed runs in the last 7 days; runs a person starts with a request choose their own track, so the two drift apart.${r.every ? ` Review runs are drawn when due, not by weight: ${num(r.runs_since_last)} runs since the last review (${esc(r.last ?? 'none')}), due every ${r.every}${r.due ? ', so one is due now' : ''}.` : ''}${n.expiring.length ? ` Time-limited shares: ${n.expiring.map((e) => `${esc(e.track)} until ${esc(e.until)}`).join(', ')}.` : ''}</p>
  <div class="scroll"><table><thead><tr><th>Track</th><th class="num">Planned share</th><th class="num">Got, 7 days</th><th class="num">Gap</th><th class="num">Expected next 24 h</th><th class="num">Expected next 7 days</th></tr></thead><tbody>
${n.tracks.map((t) => `<tr><td>${esc(t.track)}</td><td class="num">${pct(t.planned_share)}<span class="share" style="width:${Math.round((t.planned_share ?? 0) * 120)}px"></span></td><td class="num">${pct(t.actual_share_7d)}</td><td class="num ${t.gap > 0.03 ? 'gap-over' : t.gap < -0.03 ? 'gap-under' : ''}">${signed(t.gap)}</td><td class="num">${num(t.expected_next_24h)}</td><td class="num">${num(t.expected_next_7d)}</td></tr>`).join('\n')}
</tbody></table></div>
  <h3>Product runs: what they pick up, in order</h3>
  ${n.lanes.product ? `<div class="scroll">${laneTable(n.lanes.product)}</div>` : '<p class="na">The request queue and flagship list could not be read in this build.</p>'}
  ${idleFlagships.length ? `<p class="note">Flagships with no run in the last 7 days: ${idleFlagships.map(esc).join(', ')}.</p>` : ''}
  <h3>Research runs: open programmes</h3>
  ${n.lanes.research ? `<div class="scroll">${laneTable(n.lanes.research)}</div>` : '<p class="na">research/PROGRAMMES.md could not be read in this build.</p>'}
  ${idleProgrammes.length ? `<p class="note">Programmes with no run in the last 7 days: ${idleProgrammes.map(esc).join(', ')}.</p>` : ''}
  <p class="note">${esc(n.lanes.note)} The full queue, with owner ideas and what waits on the owner, is on the <a href="../queue/">queue page</a>.</p>`;
}
