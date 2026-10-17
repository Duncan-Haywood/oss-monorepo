/**
 * The engineering status page: the monorepo as an engineering manager reads
 * it. What shipped this week, what each session is working on, where the
 * effort and the compute go, what is blocked on the owner, and what the runs
 * themselves say is slowing them down.
 *
 *   node platform/pages/engineering.mjs --out=dist        # writes dist/engineering/index.html
 *   node platform/pages/engineering.mjs --out=dist --today=2026-10-16
 *
 * `build.mjs` calls `buildEngineeringPage` on every site build, so the page is
 * exactly as current as the published snapshot: every `publish-branch.sh` run
 * (by hand, or by `publish-pages-branch.yml` once the owner turns it on)
 * rebuilds it from `main`.
 *
 * Every number is read from something committed, never typed:
 *
 *   prompts/runs/*.json           one record per agent session (task, track, PR, cost)
 *   prompts/derived/github.json   each recorded PR's merged/closed state and head CI
 *   git log --first-parent        merges to main, and which areas each one touched
 *   portfolio/ledger/decision_queue.py --json   what is waiting on the owner
 *   prompts/process/backlog/*.json             open process improvements
 *   platform/pages/launched.json, ventures/*\/VENTURE.yaml   product inventory
 *   research/_homepage/projects.json, research/*\/LOG.md      research inventory
 *
 * A source that cannot be read (a depth-1 checkout has no merge history; a
 * machine without python3 has no decision queue) renders as "not available
 * in this build" rather than as zero. Absent is not the same as none.
 *
 * Not indexed (`noindex`, in no sitemap): it is a page about how the
 * repository is run, linked from the hub's footer for anyone who wants it,
 * and it is not something a search for a calculator should land on.
 */
import { promises as fs, existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_URL, withSiteHeader } from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const ENGINEERING_PATH = 'engineering/';
export { REPO_URL };

// Fixed order so a track keeps its colour from build to build. Anything a
// future run record calls itself lands in "other" rather than breaking the key.
export const TRACKS = ['ventures', 'research', 'process', 'review', 'redteam', 'explore', 'other'];

const DAY = 86400000;

// ---------------------------------------------------------------- loading --

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function loadRuns(root) {
  const dir = path.join(root, 'prompts', 'runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, ...(readJson(path.join(dir, f)) ?? {}) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)));
}

/**
 * What landed on main, newest first: every first-parent commit (merge commits
 * and squash merges alike), with the top-level areas each one touched.
 * `-m --first-parent` diffs a merge against the main side, which is what the
 * PR brought in. Returns `null` (not `[]`) when there is no history to
 * read, so the page can say so.
 */
export const MERGE_LIMIT = 600;

export function loadMerges(root, limit = MERGE_LIMIT) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['log', '--first-parent', '-m', `-n${limit}`, '--name-only', '--format=%x1e%H%x1f%cI%x1f%s%x1f%b%x1f'],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return null;
  }
  const merges = [];
  for (const chunk of out.split('\x1e')) {
    if (!chunk.trim()) continue;
    const [sha, date, subject, body, files = ''] = chunk.split('\x1f');
    // A merge commit names its PR in the subject and carries the title in
    // the body; a squash merge is the title with ` (#N)` on the end.
    const merge = /^Merge pull request #(\d+)/.exec(subject);
    const squash = /\s\(#(\d+)\)$/.exec(subject);
    const names = files.split('\n').map((s) => s.trim()).filter(Boolean);
    merges.push({
      sha,
      date: date.slice(0, 10),
      pr: merge ? Number(merge[1]) : squash ? Number(squash[1]) : null,
      title: merge ? (body.trim().split('\n')[0] || subject).trim() : squash ? subject.slice(0, squash.index).trim() : subject.trim(),
      // A merge at a shallow clone's boundary diffs against nothing and
      // "touches" the whole tree; that says nothing about the PR.
      files: names.length > 5000 ? [] : names,
    });
  }
  return merges;
}

export function areaOf(file) {
  const [top, second] = file.split('/');
  if (!second) return 'root';
  if (top === '.github') return 'ci';
  if (top === 'ventures' || top === 'research') return top;
  if (['platform', 'portfolio', 'prompts', 'gitops', 'docs'].includes(top)) return top;
  return 'other';
}

/** The ventures or research projects a merge touched, by slug. */
export function subjectsOf(files) {
  const out = new Set();
  for (const f of files) {
    const m = /^(ventures|research)\/([^/_.][^/]*)\//.exec(f);
    if (m) out.add(`${m[1]}/${m[2]}`);
  }
  return [...out];
}

function loadDecisions(root) {
  try {
    const out = execFileSync('python3', [path.join(root, 'portfolio', 'ledger', 'decision_queue.py'), '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const rows = JSON.parse(out);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function loadBacklog(root) {
  const dir = path.join(root, 'prompts', 'process', 'backlog');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^P\d+.*\.json$/.test(f))
    .map((f) => readJson(path.join(dir, f)))
    .filter(Boolean);
}

function loadVentures(root) {
  const dir = path.join(root, 'ventures');
  const stages = {};
  let total = 0;
  if (!existsSync(dir)) return { total, stages };
  for (const slug of readdirSync(dir)) {
    const file = path.join(dir, slug, 'VENTURE.yaml');
    if (!existsSync(file)) continue;
    total += 1;
    const stage = /^stage:\s*([\w-]+)/m.exec(readFileSync(file, 'utf8'))?.[1] ?? 'unknown';
    stages[stage] = (stages[stage] ?? 0) + 1;
  }
  return { total, stages };
}

function loadResearch(root) {
  const data = readJson(path.join(root, 'research', '_homepage', 'projects.json'));
  const themes = (data?.themes ?? []).map((t) => ({ name: t.name, count: (t.projects ?? []).length }));
  const logs = [];
  const dir = path.join(root, 'research');
  if (existsSync(dir)) {
    for (const slug of readdirSync(dir)) {
      const file = path.join(dir, slug, 'LOG.md');
      if (!existsSync(file)) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/^## (\d{4}-\d{2}-\d{2})\s*[·\-–—]\s*(.+)$/gm)) {
        logs.push({ slug, date: m[1], title: m[2].trim() });
      }
    }
  }
  return { themes, logs };
}

export function loadAll(root = DEFAULT_ROOT) {
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  return {
    head: git('rev-parse', 'HEAD'),
    shallow: git('rev-parse', '--is-shallow-repository') !== 'false',
    runs: loadRuns(root),
    github: readJson(path.join(root, 'prompts', 'derived', 'github.json')) ?? {},
    merges: loadMerges(root),
    decisions: loadDecisions(root),
    backlog: loadBacklog(root),
    launched: readJson(path.join(root, 'platform', 'pages', 'launched.json'))?.launched ?? {},
    ventures: loadVentures(root),
    research: loadResearch(root),
  };
}

// ------------------------------------------------------------ summarising --

const isoDay = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function trackOf(run) {
  return TRACKS.includes(run.track) ? run.track : 'other';
}

export function runSpend(run) {
  const v = run.usage?.totals?.api_equivalent_usd ?? run.cost_usd;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** `owner/repo#N` for a run's PR URL, lower-cased the way github.json keys it. */
export function prKey(url) {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(String(url ?? ''));
  return m ? { key: `${m[1]}/${m[2]}#${m[3]}`.toLowerCase(), repo: `${m[1]}/${m[2]}`, number: Number(m[3]), url: `https://${m[0]}` } : null;
}

export function describeRun(run, landedTitles = new Map()) {
  if (run.task) return run.task;
  const pr = prKey(run.pr);
  const own = pr && pr.repo.toLowerCase() === 'duncan-haywood/oss-monorepo';
  if (own && landedTitles.has(pr.number)) return landedTitles.get(pr.number);
  if (run.projects?.length) return `Worked on ${run.projects.join(', ')}`;
  return '';
}

export function prState(github, url) {
  const ref = prKey(url);
  const row = ref && github[ref.key];
  if (!row) return null;
  if (row.merged) return 'merged';
  return row.state === 'closed' ? 'closed' : 'open';
}

/**
 * Everything the page shows, as plain data. Kept separate from rendering so
 * the tests can assert numbers without parsing HTML.
 */
export function summarise(data, today) {
  const end = today;
  const inWindow = (date, days) => {
    const age = daysBetween(date, end);
    return age >= 0 && age < days;
  };
  const inPrior = (date, days) => {
    const age = daysBetween(date, end);
    return age >= days && age < 2 * days;
  };
  const runs = [...data.runs].sort((a, b) =>
    String(b.ended ?? b.date).localeCompare(String(a.ended ?? a.date)));

  // Run records only exist from the day the prompt system started writing
  // them; a window reaching before that is empty, not quiet.
  const firstRun = runs.length ? runs.reduce((min, r) => (r.date < min ? r.date : min), runs[0].date) : null;
  const recordedFor = firstRun ? daysBetween(firstRun, end) + 1 : 0;

  // Sessions per day per track, oldest first: 30 days, or since the first
  // record (at least a week) when that is shorter.
  const chartDays = Math.min(30, Math.max(7, recordedFor));
  const daily = [];
  for (let i = chartDays - 1; i >= 0; i--) {
    const date = isoDay(new Date(Date.parse(end) - i * DAY));
    const counts = Object.fromEntries(TRACKS.map((t) => [t, 0]));
    let spend = 0;
    for (const r of runs) {
      if (r.date !== date) continue;
      counts[trackOf(r)] += 1;
      spend += runSpend(r) ?? 0;
    }
    daily.push({ date, counts, total: TRACKS.reduce((s, t) => s + counts[t], 0), spend });
  }

  const week = runs.filter((r) => inWindow(r.date, 7));
  const priorWeek = runs.filter((r) => inPrior(r.date, 7));
  const month = runs.filter((r) => inWindow(r.date, 30));
  const spendOf = (rs) => rs.reduce((s, r) => s + (runSpend(r) ?? 0), 0);
  const measured = (rs) => rs.filter((r) => runSpend(r) !== null).length;

  const merges = data.merges;
  // The window the history actually covers: in a shallow clone the oldest
  // commit read is the honest bound on any "last N days" claim, and a count
  // over a window reaching past it is a floor, not a figure.
  const historyFrom = merges && merges.length ? merges[merges.length - 1].date : null;
  const complete = merges !== null && !data.shallow && merges.length < MERGE_LIMIT;
  const covers = (days) => merges !== null && (complete || (historyFrom !== null && daysBetween(historyFrom, end) >= days));
  const mergedWeek = merges ? merges.filter((m) => inWindow(m.date, 7)) : null;
  const mergedPrior = merges && covers(14) ? merges.filter((m) => inPrior(m.date, 7)) : null;

  // Where the effort goes: per track (sessions, spend) and per area (merges).
  const byTrack = TRACKS.map((t) => {
    const rs = month.filter((r) => trackOf(r) === t);
    return { track: t, runs: rs.length, spend: spendOf(rs), measured: measured(rs), partial: rs.filter((r) => r.outcome !== 'success').length };
  }).filter((row) => row.runs);

  const byArea = {};
  const subjects = {};
  for (const m of merges ? merges.filter((x) => inWindow(x.date, 14)) : []) {
    for (const a of new Set(m.files.map(areaOf))) byArea[a] = (byArea[a] ?? 0) + 1;
    for (const s of subjectsOf(m.files)) subjects[s] = (subjects[s] ?? 0) + 1;
  }

  // Outcome and CI health of the PRs that runs recorded.
  const recordedPrs = month.map((r) => prKey(r.pr)).filter(Boolean);
  const ghRows = recordedPrs.map((p) => data.github[p.key]).filter(Boolean);
  const merged = ghRows.filter((g) => g.merged);
  const redAtMerge = merged.filter((g) => g.ci?.head === 'red').length;

  // Friction the runs themselves wrote down, grouped by the file they blamed.
  const friction = {};
  for (const r of month) {
    for (const f of r.doc_friction ?? []) {
      if (!f?.file) continue;
      const row = (friction[f.file] ??= { file: f.file, count: 0, latest: null, date: '' });
      row.count += 1;
      if (String(r.date) >= row.date) {
        row.date = String(r.date);
        row.latest = f.issue ?? '';
      }
    }
  }

  const launches = Object.entries(data.launched)
    .filter(([, d]) => typeof d === 'string')
    .map(([slug, date]) => ({ slug, date }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  const launchWeeks = [];
  for (let w = 7; w >= 0; w--) {
    const from = isoDay(new Date(Date.parse(end) - (w * 7 + 6) * DAY));
    const to = isoDay(new Date(Date.parse(end) - w * 7 * DAY));
    launchWeeks.push({ from, to, count: launches.filter((l) => l.date >= from && l.date <= to).length });
  }

  // A record without a `task` (older runs, routed by "follow prompt.md")
  // still names its PR, and the PR's title on main says what it did.
  const landedTitles = new Map((merges ?? []).filter((m) => m.pr).map((m) => [m.pr, m.title]));

  const decisions = data.decisions
    ? data.decisions.map((d) => ({ ...d, age: d.opened ? daysBetween(d.opened, end) : null }))
    : null;

  return {
    today: end,
    head: data.head,
    kpis: {
      runsWeek: week.length,
      runsPrior: recordedFor >= 14 ? priorWeek.length : null,
      spendWeek: spendOf(week),
      spendMeasuredWeek: measured(week),
      mergedWeek: mergedWeek ? mergedWeek.length : null,
      mergedWeekIsFloor: mergedWeek !== null && !covers(7),
      mergedPrior: mergedPrior ? mergedPrior.length : null,
      partialWeek: week.filter((r) => r.outcome !== 'success').length,
      decisions: decisions ? decisions.length : null,
      oldestDecision: decisions ? Math.max(0, ...decisions.map((d) => d.age ?? 0)) : null,
    },
    daily,
    firstRun,
    recentRuns: runs.slice(0, 30).map((r) => ({
      date: r.date,
      track: trackOf(r),
      task: describeRun(r, landedTitles),
      outcome: r.outcome ?? 'unknown',
      pr: prKey(r.pr),
      prState: prState(data.github, r.pr),
      spend: runSpend(r),
      minutes: r.usage?.time?.active_minutes ?? r.wall_minutes ?? null,
      projects: r.projects ?? [],
    })),
    recentMerges: merges ? merges.slice(0, 40).map((m) => ({ ...m, areas: [...new Set(m.files.map(areaOf))], subjects: subjectsOf(m.files) })) : null,
    historyFrom,
    byTrack,
    monthRuns: month.length,
    monthSpend: spendOf(month),
    monthMeasured: measured(month),
    byArea: Object.entries(byArea).sort((a, b) => b[1] - a[1]),
    hotSubjects: Object.entries(subjects).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12),
    ci: { recorded: recordedPrs.length, known: ghRows.length, merged: merged.length, redAtMerge },
    friction: Object.values(friction).sort((a, b) => b.count - a.count || b.date.localeCompare(a.date)).slice(0, 8),
    decisions,
    backlog: data.backlog
      .filter((b) => b.status !== 'done' && b.status !== 'dropped')
      .sort((a, b) => (b.effect ?? 0) / (b.cost || 1) - (a.effect ?? 0) / (a.cost || 1) || String(a.id).localeCompare(String(b.id))),
    ventures: data.ventures,
    launchesTotal: launches.length,
    launchesRecent: launches.slice(0, 10),
    launchWeeks,
    research: {
      projects: data.research.themes.reduce((s, t) => s + t.count, 0),
      themes: [...data.research.themes].sort((a, b) => b.count - a.count),
      logs: [...data.research.logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    },
  };
}

// -------------------------------------------------------------- rendering --

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const money = (v) => (v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`);

function clip(text, n) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Inline code spans only: run tasks and friction notes are written in Markdown. */
function inlineCode(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function delta(now, before) {
  if (now === null || before === null) return '';
  const d = now - before;
  if (d === 0) return '<span class="delta">same as the week before</span>';
  return `<span class="delta">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} vs the week before</span>`;
}

function tile(label, value, note = '') {
  return `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div>${note ? `<div class="tile-note">${note}</div>` : ''}</div>`;
}

const NOT_AVAILABLE = '<span class="na">not available in this build</span>';

function prLink(pr, state) {
  if (!pr) return '<span class="faint">—</span>';
  const label = pr.repo.toLowerCase() === 'duncan-haywood/oss-monorepo' ? `#${pr.number}` : `${pr.repo.split('/')[1]}#${pr.number}`;
  return `<a href="${esc(pr.url)}">${esc(label)}</a>${state ? ` <span class="pill pill-${state}">${state}</span>` : ''}`;
}

function trackPill(track) {
  return `<span class="track"><i style="background:var(--t-${track})"></i>${esc(track)}</span>`;
}

/** Stacked columns: sessions per day by track. Inline SVG, no script. */
export function activityChart(daily) {
  const W = 720;
  const H = 180;
  const pad = { l: 28, r: 4, t: 8, b: 22 };
  const max = Math.max(1, ...daily.map((d) => d.total));
  const step = (W - pad.l - pad.r) / daily.length;
  const bw = Math.max(2, step - 3);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.ceil(max / 2), max];
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="activity-title"><title id="activity-title">Agent sessions per day by track, last ${daily.length} days</title>`;
  for (const t of ticks) {
    svg += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="axis" x="${pad.l - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t}</text>`;
  }
  daily.forEach((d, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    let acc = 0;
    for (const track of TRACKS) {
      const n = d.counts[track];
      if (!n) continue;
      const top = y(acc + n);
      const h = y(acc) - top;
      svg += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h - 1).toFixed(1)}" rx="1.5" fill="var(--t-${track})"><title>${d.date} · ${track}: ${n}</title></rect>`;
      acc += n;
    }
    if (i % 7 === daily.length % 7 || i === daily.length - 1) {
      svg += `<text class="axis" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d.date.slice(5)}</text>`;
    }
  });
  return `${svg}</svg>`;
}

function launchChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return `<div class="hbars">${weeks
    .map((w) => `<div class="hbar"><span class="hbar-label">${w.from.slice(5)}–${w.to.slice(5)}</span><span class="hbar-track"><i style="width:${((w.count / max) * 100).toFixed(1)}%"></i></span><span class="hbar-n">${w.count}</span></div>`)
    .join('')}</div>`;
}

function barList(rows, { total } = {}) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return `<div class="hbars">${rows
    .map(([label, n]) => `<div class="hbar"><span class="hbar-label">${esc(label)}</span><span class="hbar-track"><i style="width:${((n / max) * 100).toFixed(1)}%"></i></span><span class="hbar-n">${n}${total ? `<span class="faint"> / ${total}</span>` : ''}</span></div>`)
    .join('')}</div>`;
}

export function renderEngineeringPage(model, { baseUrl = '' } = {}) {
  const k = model.kpis;
  // The social tags `check.mjs` asks of every page with a canonical; the
  // card is the site-wide one `build.mjs` writes at the root.
  const canonical = baseUrl
    ? `<link rel="canonical" href="${esc(baseUrl)}${ENGINEERING_PATH}">
<meta property="og:title" content="Engineering status — oss-monorepo">
<meta property="og:url" content="${esc(baseUrl)}${ENGINEERING_PATH}">
<meta property="og:image" content="${esc(baseUrl)}social-card.png">
<meta name="twitter:card" content="summary_large_image">\n`
    : '';
  const head = model.head ? `<a href="${REPO_URL}/commit/${esc(model.head)}"><code>${esc(model.head.slice(0, 10))}</code></a>` : 'an unknown commit';

  const tiles = [
    tile(
      'Agent sessions, 7 days',
      String(k.runsWeek),
      k.runsPrior === null && model.firstRun ? `run records start ${esc(model.firstRun)}` : delta(k.runsWeek, k.runsPrior),
    ),
    tile(
      'Landed on main, 7 days',
      k.mergedWeek === null ? NOT_AVAILABLE : `${k.mergedWeekIsFloor ? '≥ ' : ''}${k.mergedWeek}`,
      k.mergedWeekIsFloor ? `this build's history starts ${esc(model.historyFrom)}` : delta(k.mergedWeek, k.mergedPrior),
    ),
    tile(
      'Compute, 7 days',
      k.spendMeasuredWeek ? money(k.spendWeek) : '<span class="na">unmeasured</span>',
      `API-equivalent, measured on ${k.spendMeasuredWeek} of ${k.runsWeek} sessions`,
    ),
    tile('Sessions ending partial, 7 days', String(k.partialWeek), `of ${k.runsWeek}; the rest recorded success`),
    tile(
      'Waiting on the owner',
      k.decisions === null ? NOT_AVAILABLE : String(k.decisions),
      k.decisions ? `oldest ${k.oldestDecision} days` : '',
    ),
  ].join('');

  const legend = TRACKS.filter((t) => model.daily.some((d) => d.counts[t]))
    .map((t) => trackPill(t))
    .join(' ');

  const runRows = model.recentRuns
    .map((r) => `<tr>
  <td class="nowrap">${esc(r.date)}</td>
  <td>${trackPill(r.track)}</td>
  <td>${inlineCode(clip(r.task || '(no task recorded)', 220))}${r.outcome !== 'success' ? ` <span class="pill pill-partial">${esc(r.outcome)}</span>` : ''}</td>
  <td class="nowrap">${prLink(r.pr, r.prState)}</td>
  <td class="num">${r.spend === null ? '<span class="faint">—</span>' : money(r.spend)}</td>
  <td class="num">${r.minutes === null ? '<span class="faint">—</span>' : Math.round(r.minutes)}</td>
</tr>`)
    .join('\n');

  const mergeRows = model.recentMerges
    ? model.recentMerges
      .map((m) => `<tr>
  <td class="nowrap">${esc(m.date)}</td>
  <td class="nowrap">${m.pr ? `<a href="${REPO_URL}/pull/${m.pr}">#${m.pr}</a>` : `<code>${esc(m.sha.slice(0, 8))}</code>`}</td>
  <td>${inlineCode(clip(m.title, 160))}</td>
  <td>${m.areas.map((a) => `<span class="tag">${esc(a)}</span>`).join(' ')}</td>
</tr>`)
      .join('\n')
    : '';

  const trackRows = model.byTrack
    .map((t) => `<tr><td>${trackPill(t.track)}</td><td class="num">${t.runs}</td><td class="num">${((t.runs / Math.max(1, model.monthRuns)) * 100).toFixed(0)}%</td><td class="num">${t.measured ? money(t.spend) : '<span class="faint">—</span>'}<span class="faint"> (${t.measured}/${t.runs})</span></td><td class="num">${t.partial}</td></tr>`)
    .join('');

  const decisionRows = (model.decisions ?? [])
    .map((d) => `<li class="decision">
  <div class="decision-head"><code>${esc(d.id)}</code> <span class="pill pill-gate">${esc(d.gates ?? '')}</span>${d.blocked_by?.length ? ' <span class="pill pill-closed">blocked</span>' : ''} <span class="faint">${d.age === null ? '' : `waiting ${d.age} days`}</span></div>
  <div>${inlineCode(clip(d.action ?? '', 320))}</div>
</li>`)
    .join('\n');

  const backlogRows = model.backlog
    .map((b) => `<tr><td><code>${esc(b.id)}</code></td><td>${inlineCode(b.title ?? '')}</td><td class="num">${esc(b.effect ?? '')}</td><td class="num">${esc(b.cost ?? '')}</td><td>${esc(b.owner ?? '')}</td></tr>`)
    .join('');

  const frictionRows = model.friction
    .map((f) => `<tr><td><code>${esc(f.file)}</code></td><td class="num">${f.count}</td><td>${inlineCode(clip(f.latest, 240))} <span class="faint">(${esc(f.date)})</span></td></tr>`)
    .join('');

  const stageText = Object.entries(model.ventures.stages)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${n.toLocaleString('en-US')} ${esc(s)}`)
    .join(' · ');

  const ci = model.ci;
  const historyNote = model.recentMerges
    ? `The ${model.recentMerges.length} most recent commits on <code>main</code>'s first-parent line (merge commits and squash merges)${model.historyFrom ? `; this build's history reaches back to ${esc(model.historyFrom)}` : ''}.`
    : 'This build had no merge history to read (a depth-1 checkout), so merges are not shown rather than shown as zero.';

  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Engineering status — oss-monorepo</title>
<meta name="description" content="What the agent fleet working on the oss-monorepo shipped, is working on, spent, and is blocked on, rebuilt from the repository on every publish.">
<meta name="robots" content="noindex">
${canonical}<style>
:root{
  --bg:#f7f7f4;--surface:#fff;--text:#1d1d22;--muted:#5c5b66;--faint:#8a8994;--border:#e3e1da;--accent:#3949ab;--code:#efede7;
  --ok:#2b8a3e;--warn:#b35c00;--bad:#c92a2a;
  --t-ventures:#1c7ed6;--t-research:#7048e8;--t-process:#e8590c;--t-review:#2b8a3e;--t-redteam:#c2255c;--t-explore:#0b7285;--t-other:#868e96;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#111114;--surface:#19191e;--text:#ececf1;--muted:#a3a2ad;--faint:#75747f;--border:#2c2c34;--accent:#9fa8ff;--code:#25252d;
  --ok:#69db7c;--warn:#ffa94d;--bad:#ff8787;
  --t-ventures:#4dabf7;--t-research:#9775fa;--t-process:#ff922b;--t-review:#51cf66;--t-redteam:#f06595;--t-explore:#3bc9db;--t-other:#adb5bd;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
code{font:.86em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:.05em .3em;border-radius:4px}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
header{padding:32px 0 8px}
h1{font-size:clamp(1.6rem,4vw,2.3rem);margin:.2rem 0 .4rem;letter-spacing:-.01em}
h2{font-size:1.2rem;margin:0 0 .3rem}
.lede{color:var(--muted);max-width:75ch;margin:0}
.crumbs{font-size:14px;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:24px 0}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.tile-label{font-size:13px;color:var(--muted)}
.tile-value{font-size:1.9rem;font-weight:650;margin:.1rem 0}
.tile-note,.delta{font-size:12.5px;color:var(--faint)}
section{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 18px 14px;margin:0 0 16px}
.sub{color:var(--muted);font-size:13.5px;margin:0 0 12px;max-width:85ch}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin:0 0 16px}
.grid2>section{margin:0;min-width:0}
@media (max-width:820px){.grid2{grid-template-columns:minmax(0,1fr)}}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
th{text-align:left;font-weight:600;color:var(--muted);font-size:12.5px;border-bottom:1px solid var(--border);padding:6px 8px}
td{border-bottom:1px solid var(--border);padding:7px 8px;vertical-align:top}
tr:last-child td{border-bottom:0}
.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.nowrap{white-space:nowrap}
.faint{color:var(--faint)}
.na{font-size:.9rem;font-weight:500;color:var(--faint)}
.track{display:inline-flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap}
.track i{width:9px;height:9px;border-radius:2px;display:inline-block}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin:4px 0 8px}
.pill{display:inline-block;font-size:11.5px;padding:0 7px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.pill-merged{color:var(--ok)}.pill-open{color:var(--accent)}.pill-closed{color:var(--faint)}.pill-partial{color:var(--warn)}.pill-gate{color:var(--bad)}
.tag{display:inline-block;font-size:12px;background:var(--code);border-radius:4px;padding:0 6px;margin:1px 0}
.chart{width:100%;height:auto;display:block}
.chart .grid{stroke:var(--border);stroke-width:1}
.chart .axis{fill:var(--faint);font-size:10px}
.hbars{display:grid;gap:6px}
.hbar{display:grid;grid-template-columns:minmax(90px,38%) 1fr auto;gap:10px;align-items:center;font-size:13.5px}
.hbar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hbar-track{height:8px;background:var(--code);border-radius:4px;overflow:hidden}
.hbar-track i{display:block;height:100%;background:var(--accent);border-radius:4px}
.hbar-n{font-variant-numeric:tabular-nums;text-align:right;min-width:2.5em}
ul.plain{list-style:none;margin:0;padding:0}
.decision{padding:9px 0;border-bottom:1px solid var(--border);font-size:14px}
.decision:last-child{border-bottom:0}
.decision-head{margin-bottom:2px}
footer{color:var(--muted);font-size:13px;padding:8px 0 40px}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="crumbs"><a href="${REPO_URL}">Repository</a> · <a href="../dev/">Development dashboard</a></div>
  <h1>Engineering status</h1>
  <p class="lede">The monorepo as an engineering manager would read it: what shipped, what each agent session worked on, where the effort and compute went, and what is blocked on the owner. Rebuilt from <code>main</code> at ${head} on ${esc(model.today)} every time the site is published.</p>
</header>

<div class="tiles">${tiles}</div>

<section>
  <h2>Activity, last ${model.daily.length} days</h2>
  <p class="sub">Agent sessions per day, by the track <code>prompt.md</code> routed them to. One session is one run record in <code>prompts/runs/</code>${model.firstRun ? `; the first record is dated ${esc(model.firstRun)}` : ''}.</p>
  <div class="legend">${legend}</div>
  ${activityChart(model.daily)}
</section>

<section>
  <h2>What sessions are working on</h2>
  <p class="sub">The 30 most recent run records: the task each session took, its pull request and that PR's state when <code>prompts/derived/github.json</code> was last refreshed, and what the session cost (API-equivalent) and took (active minutes) where it measured them.</p>
  <div class="scroll"><table>
    <thead><tr><th>Date</th><th>Track</th><th>Task</th><th>PR</th><th class="num">Cost</th><th class="num">Min</th></tr></thead>
    <tbody>
${runRows || '<tr><td colspan="6" class="faint">No run records.</td></tr>'}
    </tbody>
  </table></div>
</section>

<section>
  <h2>Recently landed on main</h2>
  <p class="sub">${historyNote} The areas column is every top-level part of the tree the merge changed.</p>
  ${model.recentMerges ? `<div class="scroll"><table>
    <thead><tr><th>Date</th><th>PR</th><th>Title</th><th>Areas</th></tr></thead>
    <tbody>
${mergeRows}
    </tbody>
  </table></div>` : ''}
</section>

<div class="grid2">
<section>
  <h2>Where the effort goes</h2>
  <p class="sub">Sessions and compute by track over 30 days (${model.monthRuns} sessions${model.monthMeasured ? `, ${money(model.monthSpend)} measured on ${model.monthMeasured}` : ''}).</p>
  <div class="scroll"><table>
    <thead><tr><th>Track</th><th class="num">Sessions</th><th class="num">Share</th><th class="num">Compute (measured)</th><th class="num">Partial</th></tr></thead>
    <tbody>${trackRows || '<tr><td colspan="5" class="faint">No sessions in the window.</td></tr>'}</tbody>
  </table></div>
</section>
<section>
  <h2>What landed where, 14 days</h2>
  <p class="sub">Commits on <code>main</code> per area of the tree${model.historyFrom ? ` (history from ${esc(model.historyFrom)})` : ''}. One counts once in each area it changed.</p>
  ${model.recentMerges ? (model.byArea.length ? barList(model.byArea) : '<p class="faint">No merges in the window.</p>') : `<p>${NOT_AVAILABLE}</p>`}
  ${model.hotSubjects.length ? `<h2 style="margin-top:16px">Most-touched projects, 14 days</h2>${barList(model.hotSubjects)}` : ''}
</section>
</div>

<div class="grid2">
<section>
  <h2>Delivery health</h2>
  <p class="sub">Of the ${ci.recorded} pull requests that the last 30 days of run records name, ${ci.known} have a derived GitHub row.</p>
  <div class="hbars">
    <div class="hbar"><span class="hbar-label">Merged</span><span class="hbar-track"><i style="width:${ci.known ? ((ci.merged / ci.known) * 100).toFixed(1) : 0}%;background:var(--ok)"></i></span><span class="hbar-n">${ci.merged}</span></div>
    <div class="hbar"><span class="hbar-label">Merged with red CI on the head</span><span class="hbar-track"><i style="width:${ci.merged ? ((ci.redAtMerge / ci.merged) * 100).toFixed(1) : 0}%;background:var(--bad)"></i></span><span class="hbar-n">${ci.redAtMerge}</span></div>
  </div>
  <p class="sub" style="margin-top:10px">Red at merge is often the base branch's own failure rather than the PR's (process backlog P012); it is shown so it stays visible, not as a verdict on each PR.</p>
</section>
<section>
  <h2>Waiting on the owner</h2>
  <p class="sub">From <code>portfolio/ledger/decision_queue.py</code>, ordered by leverage. Only the owner can clear these.</p>
  ${model.decisions === null ? `<p>${NOT_AVAILABLE}</p>` : `<ul class="plain">${decisionRows || '<li class="faint">Nothing is waiting.</li>'}</ul>`}
</section>
</div>

<section>
  <h2>Friction the sessions reported</h2>
  <p class="sub">Files run records blamed for slowing a session down in the last 30 days (<code>doc_friction</code>), with the most recent complaint. The review track works from this list.</p>
  <div class="scroll"><table>
    <thead><tr><th>File</th><th class="num">Reports</th><th>Latest</th></tr></thead>
    <tbody>${frictionRows || '<tr><td colspan="3" class="faint">None reported.</td></tr>'}</tbody>
  </table></div>
</section>

<section>
  <h2>Process backlog</h2>
  <p class="sub">Open items in <code>prompts/process/backlog/</code>, best effect-for-cost first.</p>
  <div class="scroll"><table>
    <thead><tr><th>Id</th><th>Title</th><th class="num">Effect</th><th class="num">Cost</th><th>Owner</th></tr></thead>
    <tbody>${backlogRows || '<tr><td colspan="5" class="faint">Empty.</td></tr>'}</tbody>
  </table></div>
</section>

<div class="grid2">
<section>
  <h2>Products</h2>
  <p class="sub">${model.ventures.total.toLocaleString('en-US')} ventures (${stageText || 'no stages recorded'}); ${model.launchesTotal.toLocaleString('en-US')} have a launch date in <code>launched.json</code>. Launches per week:</p>
  ${launchChart(model.launchWeeks)}
  <h2 style="margin-top:16px">Latest launches</h2>
  <ul class="plain">${model.launchesRecent.map((l) => `<li><span class="faint">${esc(l.date)}</span> <a href="../${esc(l.slug)}/">${esc(l.slug)}</a></li>`).join('')}</ul>
</section>
<section>
  <h2>Research</h2>
  <p class="sub">${model.research.projects} projects in ${model.research.themes.length} themes, from <code>research/_homepage/projects.json</code>.</p>
  ${barList(model.research.themes.map((t) => [t.name, t.count]))}
  ${model.research.logs.length ? `<h2 style="margin-top:16px">Latest research log entries</h2><ul class="plain">${model.research.logs.map((l) => `<li><span class="faint">${esc(l.date)}</span> <a href="../research/${esc(l.slug)}/">${esc(l.slug)}</a>: ${inlineCode(l.title)}</li>`).join('')}</ul>` : ''}
</section>
</div>

<footer>
  <p>Built by <a href="${REPO_URL}/blob/main/platform/pages/engineering.mjs"><code>platform/pages/engineering.mjs</code></a> from files committed to the repository; nothing here is typed by hand. Compute figures are API-list-price equivalents that the sessions measured from their own transcripts (<code>prompts/runcost.py</code>), not charges. A figure a source could not supply is marked as such rather than shown as zero.</p>
  <p>Provided as-is, with no warranty of accuracy or completeness; it describes how the repository is being worked on and is not advice of any kind.</p>
</footer>
</div>
</body>
</html>
`, { toRoot: '../', crumbs: [{ label: 'Engineering status' }] });
}

export async function buildEngineeringPage(outDir, baseUrl = '', { root = DEFAULT_ROOT, today } = {}) {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const model = summarise(loadAll(root), day);
  const dir = path.join(outDir, ENGINEERING_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderEngineeringPage(model, { baseUrl }));
  return model;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(HERE, 'dist');
  const model = await buildEngineeringPage(out, arg('base-url') ?? '', { today: arg('today') });
  console.log(
    `engineering: wrote ${path.join(out, ENGINEERING_PATH, 'index.html')} ` +
      `(${model.kpis.runsWeek} sessions this week, ${model.recentMerges ? model.recentMerges.length : 'no'} merges read)`,
  );
}
