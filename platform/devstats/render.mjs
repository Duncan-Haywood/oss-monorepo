// HTML for the development-process dashboard. Static, no script required,
// no off-origin request: the numbers are baked in at build time.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);
const show = (v, unit = '') => (v == null ? '<span class="na">not measured</span>' : `${esc(num(v))}${unit}`);
const pct = (v) => (v == null ? null : `${Math.round(v * 100)}%`);

function tile(label, value, note) {
  return `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${value}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
}

/** One series, one hue: merges per day as bars with a native tooltip each. */
export function barChart(perDay, { width = 720, height = 160 } = {}) {
  const days = Object.keys(perDay);
  const values = Object.values(perDay);
  const max = Math.max(1, ...values);
  const gap = 2;
  const bw = Math.max(2, (width - gap * (days.length - 1)) / days.length);
  const bars = days
    .map((d, i) => {
      const h = Math.round((values[i] / max) * (height - 20));
      const x = Math.round(i * (bw + gap));
      return `<rect x="${x}" y="${height - h}" width="${bw.toFixed(1)}" height="${h}" rx="2"><title>${esc(d)}: ${values[i]} merges</title></rect>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Merges to main per day, last ${days.length} days; peak ${max}">
  <line x1="0" y1="${height}" x2="${width}" y2="${height}" class="axis"/>${bars}
  <text x="0" y="12" class="tick">${max}</text></svg>`;
}

const SERIES = [['passed', 'Passed'], ['failed', 'Failed'], ['cancelled', 'Cancelled'], ['skipped', 'Skipped']];

/** CI runs per day, stacked by outcome; a legend and a table carry the same numbers. */
export function stackedChart(perDay, { width = 720, height = 180 } = {}) {
  const days = Object.keys(perDay);
  const sums = days.map((d) => SERIES.reduce((a, [k]) => a + (perDay[d][k] ?? 0), 0));
  const max = Math.max(1, ...sums);
  const gap = 3;
  const bw = Math.max(2, (width - gap * (days.length - 1)) / days.length);
  const scale = (height - 20) / max;
  const bars = days
    .map((d, i) => {
      const x = Math.round(i * (bw + gap));
      let y = height;
      const parts = SERIES.map(([k, label]) => {
        const n = perDay[d][k] ?? 0;
        if (!n) return '';
        const h = Math.max(1, n * scale);
        y -= h;
        return `<rect class="s-${k}" x="${x}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(d)}: ${n} ${label.toLowerCase()}</title></rect>`;
      }).join('');
      return parts;
    })
    .join('');
  const totals = SERIES.map(([k, label]) => `${label} ${days.reduce((a, d) => a + (perDay[d][k] ?? 0), 0).toLocaleString('en-US')}`).join(', ');
  return `<svg class="chart stacked" viewBox="0 0 ${width} ${height}" role="img" aria-label="Workflow runs per day by outcome, last ${days.length} days: ${esc(totals)}">
  <line x1="0" y1="${height}" x2="${width}" y2="${height}" class="axis"/>${bars}
  <text x="0" y="12" class="tick">${max}</text></svg>
  <p class="legend">${SERIES.map(([k, label]) => `<span><i class="s-${k}"></i>${label}</span>`).join('')}</p>`;
}

function outcomeCells(t) {
  return `<td class="num">${num(t.passed)}</td><td class="num">${num(t.failed)}</td><td class="num">${num(t.cancelled)}</td><td class="num">${num(t.skipped)}</td><td class="num">${show(pct(t.pass_share))}</td>`;
}

function ciSection(ci) {
  const sp = ci.sample.span;
  const window = (x) => (x ? `${esc(x.from.slice(0, 16).replace('T', ' '))} to ${esc(x.to.slice(11, 16))} UTC, ${x.hours} h` : 'no runs');
  const sampleNote = `<p class="note">The tables below read the newest ${ci.sample.runs} runs (${window(sp)}), across ${ci.sample.workflows_seen} workflows. In them ${show(pct(ci.rerun_share))} were re-runs; a run took p50 ${show(ci.duration_minutes.p50)} min, p90 ${show(ci.duration_minutes.p90)} min (${esc(ci.duration_minutes.note)}), and CI used ${show(ci.ci_hours_per_hour)} hours of run time per hour of clock.</p>`;
  const ago = (h) => (h >= 48 ? `${Math.round(h / 24)} days` : `${h} h`);
  const red = ci.red_on_main_now.length
    ? `<ul>${ci.red_on_main_now.map((r) => `<li><strong>${esc(r.workflow)}</strong>: red for ${esc(ago(r.hours))} (first failing run ${esc(r.since.slice(0, 16).replace('T', ' '))} UTC)</li>`).join('')}</ul>`
    : '<p>Every workflow that ran on main passed on its latest run.</p>';
  return `${stackedChart(ci.per_day)}
  <details><summary>Table</summary><div class="scroll"><table><thead><tr><th>Day</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Cancelled</th><th class="num">Skipped</th></tr></thead><tbody>${Object.entries(ci.per_day).map(([d, t]) => `<tr><td>${d}</td><td class="num">${num(t.passed)}</td><td class="num">${num(t.failed)}</td><td class="num">${num(t.cancelled)}</td><td class="num">${num(t.skipped)}</td></tr>`).join('')}</tbody></table></div></details>
  <p class="note">${num(ci.runs)} completed workflow runs in the last ${ci.window_days} days: ${num(ci.totals.passed)} passed, ${num(ci.totals.failed)} failed (failure, timeout or startup failure), ${num(ci.totals.cancelled)} cancelled, ${num(ci.totals.skipped)} skipped. ${show(pct(ci.pass_share))} of runs that reached a verdict passed. ${esc(ci.coverage.note)}${ci.coverage.capped_days.length ? `: ${ci.coverage.capped_days.map(esc).join(', ')}` : ''}.</p>
  ${sampleNote}

  <h3>Red on main right now</h3>
  ${red}
  <p class="note">From the newest ${ci.main.runs} push runs on main (${window(ci.main.span)}). Time for a workflow to pass again on main after it failed there: p50 ${show(ci.main_recovery_hours.p50)} h, p90 ${show(ci.main_recovery_hours.p90)} h over ${ci.main_recovery_hours.n} red spells.</p>

  <h3>By trigger</h3>
  <div class="scroll"><table><thead><tr><th>Trigger</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Cancelled</th><th class="num">Skipped</th><th class="num">Pass rate</th></tr></thead><tbody>
${Object.entries(ci.by_event).map(([k, t]) => `<tr><td>${esc(k)}</td>${outcomeCells(t)}</tr>`).join('\n')}
</tbody></table></div>

  <h3>Workflows that fail most</h3>
  <div class="scroll"><table><thead><tr><th>Workflow</th><th class="num">Runs</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Cancelled</th><th class="num">Skipped</th><th class="num">Pass rate</th><th class="num">Minutes p50 / p90</th></tr></thead><tbody>
${ci.workflows.map((w) => `<tr><td>${esc(w.name)}</td><td class="num">${w.runs}</td>${outcomeCells(w)}<td class="num">${show(w.minutes_p50)} / ${show(w.minutes_p90)}</td></tr>`).join('\n')}
</tbody></table></div>
  <p class="note">The ${ci.workflows.length} workflows with the most failed runs in the sample${ci.sample.workflows_seen > ci.workflows.length ? `, of ${ci.sample.workflows_seen}` : ''}. The same numbers are in <a href="stats.json">stats.json</a>.</p>`;
}

function groupTable(groups, keyLabel) {
  const rows = Object.entries(groups ?? {});
  if (!rows.length) return '<p class="na">No run records in this window.</p>';
  return `<table><thead><tr><th>${esc(keyLabel)}</th><th>Runs</th><th>Success</th><th>CI fails / run</th><th>Measured</th><th>API $ (median)</th><th>Active min (median)</th><th>Leverage (median)</th></tr></thead><tbody>
${rows
  .map(([k, g]) => `<tr><td>${esc(k)}</td><td>${g.runs}</td><td>${show(pct(g.success_rate))}</td><td>${show(g.ci_failures_mean)}</td><td>${g.measured}</td><td>${show(g.api_usd_median)}</td><td>${show(g.active_minutes_median)}</td><td>${show(g.leverage_median, '×')}</td></tr>`)
  .join('\n')}
</tbody></table>`;
}

export function renderDashboard(stats, { title = 'How this is built' } = {}) {
  const { git, runs, github: gh, inventory: inv } = stats;
  const ci = stats.ci?.available ? stats.ci : null;
  const unavailable = (src) => `<p class="na">Not measured in this build: ${esc(src.reason)}.</p>`;

  const tiles = [
    tile('Ventures', show(inv.ventures)),
    tile('Research projects', show(inv.research_projects)),
    tile('Merges, last 24h', show(git.available ? git.merges_last_24h : null)),
    tile('Branch to merge (p50)', show(git.available ? git.lead_time_hours.p50 : null, ' h'), 'oldest commit to merge, last 7 days'),
    tile('PR open to merge (p50)', show(gh.available ? gh.pr_cycle_hours.p50 : null, ' h')),
    tile('CI green on main', show(gh.available ? pct(gh.ci_main.green_share) : null), 'completed push runs'),
    tile('PRs green first try', show(gh.available ? pct(gh.ci_pr.first_try_green_share) : null)),
    tile('Open branches', show(gh.available ? gh.branches.count : null)),
    tile(`CI runs passed, ${ci?.window_days ?? 14} days`, show(ci ? ci.totals.passed : null)),
    tile(`CI runs failed, ${ci?.window_days ?? 14} days`, show(ci ? ci.totals.failed : null), 'failure, timeout or startup failure'),
    tile('CI pass rate', show(ci ? pct(ci.pass_share) : null), 'of runs that reached a verdict'),
    tile('Workflows red on main', show(ci ? ci.red_on_main_now.length : null), 'latest run on main failed'),
  ].join('\n');

  const ghSection = gh.available
    ? `<table><tbody>
<tr><th>PRs merged, 7 days</th><td>${gh.prs_merged_7d}</td></tr>
<tr><th>PR open to merge, hours</th><td>p50 ${show(gh.pr_cycle_hours.p50)} · p90 ${show(gh.pr_cycle_hours.p90)} (n=${gh.pr_cycle_hours.n})</td></tr>
<tr><th>PRs closed unmerged, 7 days</th><td>${show(gh.prs_closed_unmerged_7d)}</td></tr>
<tr><th>First review, hours</th><td>p50 ${show(gh.first_review_hours.p50)} · p90 ${show(gh.first_review_hours.p90)}; ${gh.first_review_hours.reviewed} of ${gh.first_review_hours.sampled} sampled PRs had any review</td></tr>
<tr><th>Review verdicts (sampled PRs)</th><td>${Object.keys(gh.review_states ?? {}).length ? Object.entries(gh.review_states).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k.toLowerCase().replace(/_/g, ' '))} ${n}`).join(' · ') : '<span class="na">none</span>'}</td></tr>
<tr><th>Open PRs</th><td>${gh.open_prs.count} (${show(gh.open_prs.drafts)} drafts); ${gh.open_prs.older_than_7d} older than 7 days; oldest ${show(gh.open_prs.oldest_days)} days</td></tr>
<tr><th>CI on main</th><td>${show(pct(gh.ci_main.green_share))} green over ${gh.ci_main.runs} runs${gh.ci_main.failing_workflows.length ? `; failing most: ${gh.ci_main.failing_workflows.map(([n, c]) => `${esc(n)} (${c})`).join(', ')}` : ''}</td></tr>
<tr><th>CI on PRs</th><td>${show(pct(gh.ci_pr.run_pass_share))} of runs pass; ${show(pct(gh.ci_pr.first_try_green_share))} of branches green on their first commit; mean ${show(gh.ci_pr.iterations_before_green_mean)} red commits before green (${gh.ci_pr.branches_seen} branches)</td></tr>
<tr><th>Branches</th><td>${gh.branches.count}${gh.branches.capped ? '+' : ''}</td></tr>
</tbody></table>`
    : unavailable(gh);

  const friction = runs.available && runs.doc_friction_top.length
    ? `<ul>${runs.doc_friction_top.map(([f, n]) => `<li><code>${esc(f)}</code>: ${n}</li>`).join('')}</ul>`
    : '<p class="na">None reported in this window.</p>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Development dashboard</title>
<meta name="description" content="How work moves through this open-source repository: merges, lead time, CI runs passed and failed per day and per workflow, what is red on main, reviews, branches, and what each automated run cost.">
<style>
  :root { --bg:#f6f8fb; --panel:#fff; --ink:#1d2530; --muted:#556275; --line:#d9e0e8; --accent:#2a5bd7; --pass:#1a7f4b; --fail:#c4321f; --cancel:#8a94a3; }
  @media (prefers-color-scheme: dark) { :root { --bg:#10151c; --panel:#171e27; --ink:#e8eef5; --muted:#a2b0c0; --line:#2a3542; --accent:#7aa2ff; --pass:#4cbf82; --fail:#ff7a6b; --cancel:#6d7886; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
  .wrap { max-width:1040px; margin:0 auto; padding:24px 16px 48px; }
  a { color:var(--accent); }
  h1 { margin:.2em 0; } h2 { margin-top:2em; font-size:1.2rem; }
  .lede, .note, .na, .meta { color:var(--muted); }
  .na { font-style:italic; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin:20px 0; }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .tile .label { font-size:.82rem; color:var(--muted); } .tile .value { font-size:1.5rem; font-weight:600; } .tile .note { font-size:.75rem; }
  .chart { width:100%; height:auto; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px; box-sizing:border-box; }
  .chart .s-passed, .legend .s-passed { fill:var(--pass); background:var(--pass); } .chart .s-failed, .legend .s-failed { fill:var(--fail); background:var(--fail); }
  .chart .s-cancelled, .legend .s-cancelled { fill:var(--cancel); background:var(--cancel); } .chart .s-skipped, .legend .s-skipped { fill:var(--line); background:var(--line); }
  .legend { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:.85rem; color:var(--muted); margin:6px 0; }
  .legend i { display:inline-block; width:11px; height:11px; border-radius:2px; margin-right:6px; vertical-align:-1px; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  h3 { font-size:1rem; margin-top:1.4em; }
  .chart rect { fill:var(--accent); } .chart rect:hover { opacity:.75; } .chart .axis { stroke:var(--line); } .chart .tick { fill:var(--muted); font-size:11px; }
  .scroll { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; background:var(--panel); font-size:.9rem; }
  th, td { text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  code { font-size:.85em; }
</style>
</head>
<body>
<div class="wrap">
  <p class="meta"><a href="../">← Home</a></p>
  <h1>${esc(title)}</h1>
  <p class="lede">This repository is built mostly by automated agent runs, merged without human review once CI passes. These are the numbers we steer by: how fast work lands, how often CI catches it, what each run costs, and what is left lying around. Built ${esc(stats.generated_at.slice(0, 16).replace('T', ' '))} UTC from <code>${esc((stats.source_commit ?? '').slice(0, 10))}</code>.</p>

  <div class="tiles">
${tiles}
  </div>

  <h2>Merges to main per day</h2>
  ${git.available ? barChart(git.merges_per_day) : unavailable(git)}
  ${git.available ? `<details><summary>Table</summary><div class="scroll"><table><thead><tr><th>Day</th><th>Merges</th></tr></thead><tbody>${Object.entries(git.merges_per_day).map(([d, n]) => `<tr><td>${d}</td><td>${n}</td></tr>`).join('')}</tbody></table></div></details>
  <p class="note">Last ${git.window_days} days: ${git.merges_total} merges, ${git.reverts} reverts, ${git.fix_forward_merges} fix-forwards of a red main, ${show(git.ventures_added)} ventures added. Branch-to-merge time: p50 ${show(git.lead_time_hours.p50)} h, p90 ${show(git.lead_time_hours.p90)} h over ${git.lead_time_hours.n} merge commits (${esc(git.lead_time_hours.note)}).</p>` : ''}

  <h2>Pull requests, reviews and CI</h2>
  <div class="scroll">${ghSection}</div>

  <h2>CI runs: passed, failed, cancelled</h2>
  ${ci ? ciSection(ci) : unavailable(stats.ci ?? { reason: 'not collected' })}

  <h2>Agent runs by track</h2>
  ${runs.available ? `<p class="note">${runs.runs} run records in the last ${runs.window_days} days; ${runs.integrity_issues} integrity issues. Cost, time and leverage come from <code>prompts/runcost.py</code> and exist only for runs it measured; leverage is the agent's own estimate of a human's cost over the API-equivalent cost, so treat it as low-certainty.</p><div class="scroll">${groupTable(runs.by_track, 'Track')}</div>` : unavailable(runs)}

  <h2>Agent runs by model</h2>
  ${runs.available ? `<div class="scroll">${groupTable(runs.by_model, 'Model')}</div>` : ''}

  <h2>Agent runs by prompt version</h2>
  ${runs.available ? `<div class="scroll">${groupTable(runs.by_prompt, 'Track/version')}</div>` : ''}

  <h2>Documentation that cost runs time</h2>
  ${friction}

  <p class="meta">Machine-readable: <a href="stats.json">stats.json</a>. Metrics marked "not measured" had no source in this build; none is shown as zero.</p>
</div>
</body>
</html>
`;
}
