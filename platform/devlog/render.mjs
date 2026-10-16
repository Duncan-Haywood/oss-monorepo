// HTML for `dev/analyses/`. Static, no script, no off-origin request: every
// figure is baked in at build time from files on `main`.

import { esc, inline, REPO_BLOB, REPO_PULL, renderMarkdown } from './markdown.mjs';

const STYLE = `
  :root { --bg:#f6f8fb; --panel:#fff; --ink:#1d2530; --muted:#556275; --line:#d9e0e8; --accent:#2a5bd7;
          --ok:#1a7f4b; --warn:#9a6700; --bad:#b42318; --pend:#556275; }
  @media (prefers-color-scheme: dark) { :root { --bg:#10151c; --panel:#171e27; --ink:#e8eef5; --muted:#a2b0c0; --line:#2a3542;
          --accent:#7aa2ff; --ok:#5cc98f; --warn:#e3b341; --bad:#ff8a80; --pend:#a2b0c0; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:1040px; margin:0 auto; padding:24px 16px 64px; }
  a { color:var(--accent); }
  h1 { font-size:1.75rem; margin:.2em 0 .1em; } h2 { margin-top:2.2em; font-size:1.3rem; } h3 { font-size:1.08rem; }
  .crumbs { font-size:.85rem; color:var(--muted); } .crumbs a { color:inherit; }
  .lede, .muted, .meta { color:var(--muted); } .meta { font-size:.85rem; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:10px; margin:18px 0; }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; text-decoration:none; color:inherit; display:block; }
  a.tile:hover { border-color:var(--accent); }
  .tile .label { font-size:.8rem; color:var(--muted); } .tile .value { font-size:1.5rem; font-weight:600; } .tile .note { font-size:.75rem; color:var(--muted); }
  .scroll { overflow-x:auto; max-width:100%; }
  td code, li code, p code, dd code { overflow-wrap:anywhere; word-break:break-word; }
  article.doc td, article.doc th { min-width:7em; }
  table { border-collapse:collapse; width:100%; background:var(--panel); font-size:.9rem; border:1px solid var(--line); border-radius:8px; }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-weight:600; font-size:.82rem; color:var(--muted); }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .badge { display:inline-block; font-size:.75rem; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .v-helped, .s-done { color:var(--ok); } .v-worse, .s-dropped { color:var(--bad); }
  .v-too-few-runs, .v-no-change, .s-in_progress { color:var(--warn); } .v-pending, .v-reported, .s-open { color:var(--pend); }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:12px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
  .card h3 { margin:0 0 4px; font-size:1rem; } .card p { margin:.4em 0 0; font-size:.9rem; color:var(--muted); }
  .callout { background:var(--panel); border-left:4px solid var(--warn); padding:10px 14px; border-radius:6px; margin:14px 0; }
  details { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px 12px; margin:8px 0; }
  details summary { cursor:pointer; font-weight:600; }
  dl.fields dt { font-weight:600; margin-top:.6em; } dl.fields dd { margin:0 0 0 0; }
  article.doc { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px 22px 22px; overflow-wrap:anywhere; }
  pre { background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:10px; overflow-x:auto; font-size:.85rem; }
  code { font-size:.9em; } blockquote { margin:0; padding-left:14px; border-left:3px solid var(--line); color:var(--muted); }
  footer { margin-top:48px; font-size:.85rem; color:var(--muted); }
  @media (max-width:640px) { .hide-sm { display:none; } }
`;

function page({ title, description, toRoot, crumbs, body, generated }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<style>${STYLE}</style>
</head>
<body>
<main>
<nav class="crumbs"><a href="${toRoot}">Home</a> › <a href="${toRoot}dev/">How it is built</a>${crumbs.map((c) => ` › ${c}`).join('')}</nav>
${body}
<footer>Built from files on <code>main</code> at ${esc(generated)}. Every figure links to its source in the
<a href="https://github.com/Duncan-Haywood/oss-monorepo">repository</a>; nothing here is typed by hand.
Machine-readable: <a href="${toRoot}dev/analyses/analyses.json">analyses.json</a>.</footer>
</main>
</body>
</html>
`;
}

const slugClass = (s) => String(s ?? 'unknown').toLowerCase().replace(/[^a-z0-9_]+/g, '-');
const badge = (prefix, s) => `<span class="badge ${prefix}-${slugClass(s)}">${esc(s ?? 'unknown')}</span>`;
const src = (p, label = 'source') => `<a href="${REPO_BLOB}${esc(p)}">${esc(label)}</a>`;
const prLink = (pr) => {
  const m = /(\d{3,6})\s*$/.exec(String(pr ?? ''));
  return m ? `<a href="${REPO_PULL}${m[1]}">#${m[1]}</a>` : '';
};
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};
const tile = (label, value, note, href) =>
  `<${href ? `a href="${href}"` : 'div'} class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${
    note ? `<div class="note">${esc(note)}</div>` : ''
  }</${href ? 'a' : 'div'}>`;

/** One short, data-derived sentence per finding the owner should see first. */
export function headlines(a) {
  const out = [];
  const pending = a.experiment_verdicts.pending ?? 0;
  if (a.experiments.length && pending)
    out.push(
      `${pending} of ${a.experiments.length} logged experiments still read “(next review)”: no review has yet recorded whether a change helped.`,
    );
  const top = a.runs.friction[0];
  if (top && a.runs.records)
    out.push(
      `${top.file} is the most-reported source of friction: ${top.count} reports across ${a.runs.records} run records.`,
    );
  const open = (a.backlog_status.open ?? 0) + (a.backlog_status.in_progress ?? 0);
  const done = a.backlog_status.done ?? 0;
  const measured = a.backlog.filter((b) => b.status === 'done' && b.result && !/^too (early|few)/i.test(b.result)).length;
  if (a.backlog.length)
    out.push(`Process backlog: ${open} open or in progress, ${done} done; ${measured} of the done items have a measured result.`);
  return out;
}

function frictionTable(rows, limit, label) {
  if (!rows.length) return `<p class="muted">No ${esc(label)} recorded.</p>`;
  return `<div class="scroll"><table><thead><tr><th>File</th><th class="num">Reports</th><th class="num hide-sm">Latest</th><th>Most recent report</th></tr></thead><tbody>
${rows
  .slice(0, limit)
  .map((r) => {
    const ex = r.examples[0];
    const fileCell = r.file === '(unnamed)' ? esc(r.file) : src(r.file, r.file);
    return `<tr><td>${fileCell}</td><td class="num">${r.count}</td><td class="num hide-sm">${esc(r.latest ?? '—')}</td><td>${esc(clip(ex?.text, 220))} <span class="meta">(${src(ex.record, `${ex.track ?? 'run'} record`)})</span></td></tr>`;
  })
  .join('\n')}
</tbody></table></div>`;
}

function dayTable(byDay) {
  const days = Object.entries(byDay).slice(-14).reverse();
  if (!days.length) return '';
  const tracks = [...new Set(days.flatMap(([, d]) => Object.keys(d.tracks)))].sort();
  return `<div class="scroll"><table><thead><tr><th>Day</th><th class="num">Runs</th>${tracks
    .map((t) => `<th class="num hide-sm">${esc(t)}</th>`)
    .join('')}<th class="num">Friction reports / run</th></tr></thead><tbody>
${days
  .map(
    ([d, x]) =>
      `<tr><td>${esc(d)}</td><td class="num">${x.runs}</td>${tracks
        .map((t) => `<td class="num hide-sm">${x.tracks[t] ?? 0}</td>`)
        .join('')}<td class="num">${(x.friction / x.runs).toFixed(2)}</td></tr>`,
  )
  .join('\n')}
</tbody></table></div>`;
}

function docCards(docs, kind, limit = Infinity) {
  if (!docs.length) return '<p class="muted">None yet.</p>';
  return `<div class="cards">${docs
    .slice(0, limit)
    .map(
      (d) => `<div class="card"><h3><a href="${kind}/${esc(d.slug)}/">${esc(d.title)}</a></h3><div class="meta">${esc(d.date ?? 'undated')} · ${src(
        d.path,
        'source',
      )}</div>${d.summary ? `<p>${esc(d.summary)}</p>` : ''}</div>`,
    )
    .join('')}</div>`;
}

export function renderIndex(a) {
  const v = a.experiment_verdicts;
  const st = a.backlog_status;
  const frictionTotal = a.runs.friction.reduce((s, r) => s + r.count, 0);
  const body = `
<h1>Development analyses</h1>
<p class="lede">How this portfolio is being built, and what the agents building it have learned: every experiment on the
prompts and instructions, the process backlog, process and drift reports, data-backed studies, and the friction each run
reported. The numeric dashboard (merges, CI, cost) is one level up at <a href="../">How it is built</a>.</p>

${headlines(a).length ? `<div class="callout"><strong>Read first</strong><ul>${headlines(a).map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}

<div class="tiles">
${tile('Experiments logged', a.experiments.length, `${v.pending ?? 0} awaiting a verdict`, 'experiments/')}
${tile('Process backlog', a.backlog.length, `${(st.open ?? 0) + (st.in_progress ?? 0)} open · ${st.done ?? 0} done`, '#backlog')}
${tile('Process reports', a.reports.length, 'critiques of how work gets done', '#reports')}
${tile('Drift reports', a.drift.length, 'does the work match the owner’s words?', '#drift')}
${tile('Studies', a.studies.length, 'measured, with code', '#studies')}
${tile('Run records', a.runs.records, `${frictionTotal} friction reports`, '#friction')}
</div>

<h2 id="friction">What runs keep tripping on</h2>
<p class="muted">Each run record names the instructions that were wrong, stale or costly (<code>doc_friction</code>).
Files with the most reports are where an edit saves the most time. Source: <a href="${REPO_BLOB}prompts/runs">prompts/runs/</a>.</p>
${frictionTable(a.runs.friction, 15, 'friction')}

<h3>Runs and friction by day</h3>
${dayTable(a.runs.by_day)}

<h2 id="experiments">Experiments on the prompt system</h2>
<p class="muted">Every change the review track makes to prompts and instructions, the metric it should move, and its
verdict at the next review. Full text: <a href="experiments/">all experiments</a> · ${src('prompts/experiments.md')}.</p>
<div class="scroll"><table><thead><tr><th>Id</th><th>Experiment</th><th class="hide-sm">Change</th><th>Verdict</th></tr></thead><tbody>
${a.experiments
  .map(
    (e) =>
      `<tr><td><a href="experiments/#${e.id.toLowerCase()}">${e.id}</a></td><td>${esc(e.title)}</td><td class="hide-sm">${esc(clip(e.fields.Change, 170))}</td><td>${badge('v', e.verdict)}</td></tr>`,
  )
  .join('\n')}
</tbody></table></div>

<h2 id="backlog">Process backlog</h2>
<p class="muted">Problems in how work gets done, each with evidence, a metric and a baseline. ${src('prompts/process/backlog/README.md', 'How it works')}.</p>
<div class="scroll"><table><thead><tr><th>Id</th><th>Problem</th><th>Status</th><th class="num hide-sm">Effect / cost</th><th class="hide-sm">Metric</th><th>Result</th></tr></thead><tbody>
${a.backlog
  .map(
    (b) =>
      `<tr><td>${src(b.file, b.id ?? '?')}</td><td>${esc(b.title)} ${prLink(b.pr)}</td><td>${badge('s', b.status)}</td><td class="num hide-sm">${esc(b.effect ?? '—')} / ${esc(
        b.cost ?? '—',
      )}</td><td class="hide-sm">${esc(clip(b.metric, 90))}</td><td>${b.result ? esc(clip(b.result, 140)) : '<span class="muted">not measured yet</span>'}</td></tr>`,
  )
  .join('\n')}
</tbody></table></div>

<h2 id="reports">Process reports</h2>
${docCards(a.reports, 'reports')}

<h2 id="drift">Drift reports</h2>
<p class="muted">Whether recent work still matches what the owner asked for.</p>
${docCards(a.drift, 'drift')}

<h2 id="studies">Studies</h2>
<p class="muted">Write-ups that measure something about the portfolio or its market with real data and reproducible code
(<a href="${REPO_BLOB}portfolio/research">portfolio/research/</a>). The open research papers have their own home at
<a href="../../research/">Research</a>.</p>
${docCards(a.studies, 'studies')}

<h2 id="integrity">Integrity issues runs caught</h2>
<p class="muted">Problems a run found and fixed before merge (a fabricated figure, a missing licence, a red count on main).</p>
${
  a.runs.integrity.length
    ? `<ul>${a.runs.integrity
        .slice(0, 12)
        .map((x) => `<li><span class="meta">${esc(x.date ?? '')} · ${esc(x.track ?? '')}</span> ${esc(clip(x.text, 260))} (${src(x.record, 'record')})</li>`)
        .join('')}</ul>`
    : '<p class="muted">None recorded.</p>'
}

<h2 id="deviations">Instructions runs chose not to follow</h2>
<p class="muted">Recorded <code>deviations</code>, by the file whose instruction was set aside. A file that keeps appearing
here is asking to be rewritten.</p>
${frictionTable(a.runs.deviations, 10, 'deviations')}
`;
  return page({
    title: 'Development analyses | How it is built',
    description:
      'Experiments, process backlog, process and drift reports, studies, and run-record friction for an open portfolio built by AI agents.',
    toRoot: '../../',
    crumbs: ['Analyses'],
    body,
    generated: a.generated,
  });
}

export function renderExperiments(a) {
  const order = ['Change', 'Why', 'Measure', 'Result'];
  const body = `
<h1>Experiments on the prompt system</h1>
<p class="lede">Every change the review track has made to the prompts and instructions, newest first, exactly as logged in
${src('prompts/experiments.md')}.</p>
${a.experiments
  .map((e) => {
    const keys = [...order.filter((k) => k in e.fields), ...Object.keys(e.fields).filter((k) => !order.includes(k))];
    return `<details id="${e.id.toLowerCase()}" open><summary>${e.id}: ${esc(e.title)} ${badge('v', e.verdict)}</summary>
<dl class="fields">${keys.map((k) => `<dt>${esc(k)}</dt><dd>${inline(e.fields[k], 'prompts/experiments.md')}</dd>`).join('')}</dl></details>`;
  })
  .join('\n')}
`;
  return page({
    title: 'Experiments | Development analyses',
    description: 'Every change made to the agents’ prompts and instructions, why, the metric it should move, and its verdict.',
    toRoot: '../../../',
    crumbs: ['<a href="../">Analyses</a>', 'Experiments'],
    body,
    generated: a.generated,
  });
}

const KIND_LABEL = { reports: 'Process report', drift: 'Drift report', studies: 'Study' };

export function renderDoc(doc, kind, generated) {
  const body = `
<h1>${esc(doc.title)}</h1>
<p class="meta">${esc(KIND_LABEL[kind])} · ${esc(doc.date ?? 'undated')} · ${src(doc.path, doc.path)}</p>
<article class="doc">
${renderMarkdown(doc.markdown, { fromPath: doc.path, dropTitle: true })}
</article>
`;
  return page({
    title: `${doc.title} | Development analyses`,
    description: doc.summary || `${KIND_LABEL[kind]}: ${doc.title}`,
    toRoot: '../../../../',
    crumbs: ['<a href="../../">Analyses</a>', esc(KIND_LABEL[kind])],
    body,
    generated,
  });
}

/** The JSON twin of the page: everything but the document bodies. */
export function toJson(a) {
  const strip = (docs) => docs.map(({ markdown, ...rest }) => rest);
  return {
    ...a,
    reports: strip(a.reports),
    drift: strip(a.drift),
    studies: strip(a.studies),
  };
}
