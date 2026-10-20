// The facts a daily brief is written from, for one UTC day at a time.
//
// Sources, all optional past the first:
//   1. git history of main (first-parent): every merge that day, its title,
//      PR number, the files and lines it changed, what it added, which model
//      co-authored it and which prompt track it ran under,
//   2. the run records in prompts/runs/ dated that day (outcomes, cost,
//      doc friction, the runs' own notes),
//   3. the owner's decision queue (`decision_queue.py --json`),
//   4. the development dashboard's stats.json (CI and PR state, a snapshot of
//      the moment it was built, so only the newest edition uses it).
// Nothing here is invented or estimated: a fact with no source is `null`.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DAY = 86_400_000;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const startOf = (day) => Date.parse(`${day}T00:00:00Z`);

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

/** The last `days` complete UTC days before `now`, newest first. */
export function editionDays(now, days = 7) {
  const today = startOf(dayOf(now));
  return Array.from({ length: days }, (_, i) => dayOf(today - (i + 1) * DAY));
}

/** Where a changed file belongs: a product, a research project, or a part of the plumbing. */
export function areaOf(file) {
  const parts = file.split('/');
  if (parts[0] === 'ventures' && parts.length > 2) return { kind: 'product', name: parts[1] };
  if (parts[0] === 'research' && parts.length > 2 && !/^[_.]/.test(parts[1])) return { kind: 'research', name: parts[1] };
  if (parts[0] === 'docs' && parts[1] === 'posts') return { kind: 'writing', name: 'posts' };
  if (parts[0] === '.github') return { kind: 'ci', name: 'CI and automation' };
  if (parts[0] === 'platform') return { kind: 'platform', name: parts[1] ?? 'platform' };
  return { kind: 'process', name: parts.length > 1 ? parts[0] : 'repository root' };
}

const RANK = { product: 0, research: 1, writing: 2, platform: 3, ci: 4, process: 5 };
// Run records and regenerated mirrors ride along with nearly every merge and
// say nothing about what the merge was for.
const NOISE = /^prompts\/runs\/|^platform\/marketing\/front-door\/|^portfolio\/ledger\/(ledger|entries)/;

/** The one area a merge is mostly about, by files touched (noise excluded unless it is all there is). */
export function primaryArea(files) {
  const real = files.filter((f) => !NOISE.test(f.path));
  const counts = new Map();
  for (const f of real.length ? real : files) {
    const a = areaOf(f.path);
    const key = `${a.kind}\t${a.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // One change applied across many products (an SEO sweep, a shared fix) is
  // about the catalogue, not whichever product happened to sort first.
  const products = new Set([...counts.keys()].filter((k) => k.startsWith('product\t')));
  if (products.size >= 4) return { kind: 'product', name: 'several products at once' };
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || RANK[a[0].split('\t')[0]] - RANK[b[0].split('\t')[0]])[0];
  if (!best) return { kind: 'process', name: 'repository root' };
  const [kind, name] = best[0].split('\t');
  return { kind, name };
}

const BULLET_NOISE = /^(prompts\/runs|process: run record|run record|record\b|merge (branch )?'?main|merge remote|front-door: regenerate)/i;

/** Title, PR number, model, track and a one-sentence detail from a commit message. */
export function parseMessage(subject, body = '') {
  let title = subject.trim();
  let pr = null;
  const squash = /\s*\(#(\d+)\)\s*$/.exec(title);
  const merge = /^Merge pull request #(\d+) from \S+/.exec(title);
  const lines = body.split('\n');
  if (squash) {
    pr = Number(squash[1]);
    title = title.slice(0, squash.index).trim();
  } else if (merge) {
    pr = Number(merge[1]);
    title = (lines.find((l) => l.trim()) ?? title).trim();
  }
  const models = [...new Set([...body.matchAll(/^Co-Authored-By:\s*(Claude [A-Za-z]+ [\d.]+)/gim)].map((m) => m[1]))];
  let agent = models[0] ?? null;
  if (!agent && /cursor/i.test(body)) agent = 'Cursor';
  if (!agent && /kilo/i.test(body)) agent = 'Kilo';
  if (!agent && /codex/i.test(body)) agent = 'Codex';
  if (!agent && /noreply@anthropic\.com/i.test(body)) agent = 'Claude';
  const track = /^Prompt-Version:\s*([a-z-]+)/im.exec(body)?.[1] ?? null;

  // The squash body lists each branch commit as "* subject" followed by its
  // paragraph. The first paragraph of real prose is the merge's own summary.
  const bullets = lines.filter((l) => /^\* /.test(l)).map((l) => l.slice(2).trim()).filter((b) => b && !BULLET_NOISE.test(b));
  let detail = null;
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paras) {
    if (/^\* |^[A-Z][\w-]+:\s|^-{3,}|^Co-authored-by/i.test(p) || p.split('\n').every((l) => /^[-*] /.test(l))) continue;
    const prose = [];
    for (const line of p.split('\n')) {
      if (/^\s*([-*]|\d+\.)\s/.test(line)) break;
      prose.push(line.trim());
    }
    detail = firstSentence(prose.join(' '));
    // "...wires it into the view:" introduces a list the brief does not read out.
    if (/:$/.test(detail)) detail = null;
    break;
  }
  return { title, pr, agent, models, track, bullets: bullets.slice(0, 6), detail };
}

/** The first sentence of a paragraph, capped so a run-on stays readable aloud. */
export function firstSentence(text, cap = 260) {
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  let s = (m ? m[1] : text).trim();
  if (s.length > cap) s = `${s.slice(0, cap).replace(/\s+\S*$/, '')}…`;
  return s;
}

/** Every first-parent commit on `ref` in [since, until), oldest first, with files and lines. */
export function readMerges(repo, { since, until, ref = 'HEAD' }) {
  const window = [`--since=${new Date(since).toISOString()}`, `--until=${new Date(until).toISOString()}`];
  let raw;
  let added;
  try {
    raw = git(repo, ['log', ref, '--first-parent', '--diff-merges=first-parent', '--numstat', ...window, '--format=%x1e%H%x1f%ct%x1f%s%x1f%b%x1d']);
    added = git(repo, ['log', ref, '--first-parent', '--diff-merges=first-parent', '--diff-filter=A', '--name-only', ...window, '--format=%x1e%H']);
  } catch (err) {
    return { available: false, reason: `git log failed: ${err.message.split('\n')[0]}`, merges: [] };
  }
  // A shallow clone's boundary commits have no visible parent, so git diffs
  // them against nothing and every file in the repository looks added.
  let shallow = new Set();
  try {
    const file = git(repo, ['rev-parse', '--git-path', 'shallow']).trim();
    const abs = path.isAbsolute(file) ? file : path.join(repo, file);
    if (existsSync(abs)) shallow = new Set(readFileSync(abs, 'utf8').split('\n').filter(Boolean));
  } catch {
    // No shallow file: a full clone.
  }
  const addedBy = new Map();
  for (const rec of added.split('\x1e').filter((r) => r.trim())) {
    const [sha, ...files] = rec.split('\n').map((l) => l.trim()).filter(Boolean);
    addedBy.set(sha, files);
  }
  const merges = [];
  for (const rec of raw.split('\x1e').filter((r) => r.trim())) {
    const [head, stat = ''] = rec.split('\x1d');
    const [sha, ct, subject, body] = head.split('\x1f');
    const files = shallow.has(sha) ? [] : stat.split('\n').map((l) => l.split('\t')).filter((p) => p.length === 3).map(([a, d, p]) => ({
      path: p.includes('=>') ? p.replace(/\{[^}]*=> ([^}]*)\}/, '$1').replace(/^.* => /, '') : p,
      add: a === '-' ? 0 : Number(a),
      del: d === '-' ? 0 : Number(d),
    }));
    const msg = parseMessage(subject, body);
    merges.push({
      sha,
      at: Number(ct) * 1000,
      ...msg,
      area: primaryArea(files),
      files: files.length,
      lines_added: files.reduce((s, f) => s + f.add, 0),
      lines_removed: files.reduce((s, f) => s + f.del, 0),
      added_files: shallow.has(sha) ? [] : addedBy.get(sha) ?? [],
      ...(shallow.has(sha) ? { stats_unknown: 'shallow-clone boundary: its parent is not in this checkout' } : {}),
      revert: /^Revert\b/i.test(subject),
      fix_forward: /\b(fix(es)?|repair|unbreak)\b.*\bmain\b|main (is |went )?red/i.test(`${subject}\n${body.split('\n\n')[0]}`),
    });
  }
  return { available: true, merges: merges.sort((a, b) => a.at - b.at) };
}

/** Run records for each date, grouped. */
export function readRuns(repo) {
  const dir = path.join(repo, 'prompts', 'runs');
  const byDate = new Map();
  if (!existsSync(dir)) return byDate;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const r = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
      if (r && typeof r.date === 'string') (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)).push(r);
    } catch {
      // promptctl validate reports malformed records; a brief just skips them.
    }
  }
  return byDate;
}

export function summariseRuns(recs = []) {
  const count = (key) => {
    const out = {};
    for (const r of recs) {
      const k = key(r) ?? 'unrecorded';
      out[k] = (out[k] ?? 0) + 1;
    }
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  };
  const measured = recs.filter((r) => Number.isFinite(r.usage?.totals?.api_equivalent_usd));
  const friction = {};
  for (const r of recs) for (const f of r.doc_friction ?? []) if (f?.file) (friction[f.file] ??= []).push(String(f.issue ?? '').trim());
  return {
    runs: recs.length,
    by_track: count((r) => r.track),
    by_outcome: count((r) => r.outcome),
    by_model: count((r) => r.usage?.primary_model ?? r.model),
    measured: measured.length,
    api_usd: measured.length ? Math.round(measured.reduce((s, r) => s + r.usage.totals.api_equivalent_usd, 0) * 100) / 100 : null,
    active_minutes: measured.length ? Math.round(measured.reduce((s, r) => s + (r.usage.time?.active_minutes ?? 0), 0)) : null,
    errors: recs.flatMap((r) => (r.errors ?? []).map((e) => (typeof e === 'string' ? e : e?.error ?? e?.message ?? JSON.stringify(e)))).filter(Boolean),
    friction: Object.entries(friction).sort((a, b) => b[1].length - a[1].length).map(([file, issues]) => ({ file, n: issues.length, issue: issues.find(Boolean) ?? '' })),
    notes: recs.map((r) => (typeof r.notes === 'string' ? r.notes.trim() : '')).filter((n) => n.length >= 60),
  };
}

/** One day's facts. `baseline` is the mean merges per day over the seven days before it. */
export function dayFacts(day, merges, runs, { baselineMerges = [] } = {}) {
  const inDay = merges.filter((m) => dayOf(m.at) === day);
  const byArea = (kind) => {
    const groups = new Map();
    for (const m of inDay.filter((x) => x.area.kind === kind)) (groups.get(m.area.name) ?? groups.set(m.area.name, []).get(m.area.name)).push(m);
    return [...groups.entries()].map(([name, ms]) => ({ name, merges: ms })).sort((a, b) => b.merges.length - a.merges.length || a.name.localeCompare(b.name));
  };
  const hours = Array(24).fill(0);
  for (const m of inDay) hours[new Date(m.at).getUTCHours()] += 1;
  const busiest = hours.indexOf(Math.max(...hours));
  const agents = {};
  for (const m of inDay) agents[m.agent ?? 'unattributed'] = (agents[m.agent ?? 'unattributed'] ?? 0) + 1;
  const addedMatching = (re) => [...new Set(inDay.flatMap((m) => m.added_files.filter((f) => re.test(f)).map((f) => f.match(re)[1])))];
  const prior = baselineMerges.length ? baselineMerges.reduce((a, b) => a + b, 0) / baselineMerges.length : null;
  return {
    day,
    merges: inDay.length,
    baseline_merges_per_day: prior == null ? null : Math.round(prior * 10) / 10,
    lines_added: inDay.reduce((s, m) => s + m.lines_added, 0),
    lines_removed: inDay.reduce((s, m) => s + m.lines_removed, 0),
    files_changed: inDay.reduce((s, m) => s + m.files, 0),
    busiest_hour: inDay.length ? { hour: busiest, merges: hours[busiest] } : null,
    hours,
    agents: Object.entries(agents).sort((a, b) => b[1] - a[1]),
    products: byArea('product'),
    research: byArea('research'),
    writing: inDay.filter((m) => m.area.kind === 'writing'),
    platform: byArea('platform'),
    ci: inDay.filter((m) => m.area.kind === 'ci'),
    process: inDay.filter((m) => m.area.kind === 'process'),
    new_ventures: addedMatching(/^ventures\/([^/]+)\/VENTURE\.yaml$/),
    new_research: addedMatching(/^research\/([^_./][^/]*)\/README\.md$/),
    new_posts: addedMatching(/^docs\/posts\/([^/]+)\.md$/),
    reverts: inDay.filter((m) => m.revert),
    fix_forwards: inDay.filter((m) => m.fix_forward && !m.revert),
    biggest: [...inDay].sort((a, b) => b.lines_added + b.lines_removed - (a.lines_added + a.lines_removed))[0] ?? null,
    runs: summariseRuns(runs),
  };
}

/**
 * Owner decisions from `decision_queue.py --json`, in the tool's own order
 * (by leverage), with their age on `day`. Rows the queue itself marks granted are
 * history, not decisions.
 */
export function asksOn(asks, day) {
  if (!Array.isArray(asks)) return null;
  return asks
    .filter((a) => a && a.id && a.action && (!a.opened || a.opened <= day) && !/^\W*GRANTED\b/.test(String(a.action)))
    .map((a) => ({
      id: a.id,
      action: firstSentence(String(a.action).replace(/\*\*/g, '').replace(/`/g, ''), 220),
      gates: a.gates ?? null,
      blocked: Array.isArray(a.blocked_by) && a.blocked_by.length > 0,
      age_days: a.opened ? Math.round((startOf(day) - startOf(a.opened)) / DAY) : null,
    }));
}

/** The CI and PR snapshot from the dashboard's stats.json, or null. */
export function snapshotOf(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const ci = stats.ci?.available ? stats.ci : null;
  const gh = stats.github?.available ? stats.github : null;
  if (!ci && !gh) return null;
  return {
    at: stats.generated_at ?? null,
    red_on_main: ci ? ci.red_on_main_now ?? [] : null,
    ci_pass_share: ci?.pass_share ?? null,
    ci_failed_14d: ci?.totals?.failed ?? null,
    worst_workflows: ci ? (ci.workflows ?? []).filter((w) => w.failed > 0).slice(0, 3) : null,
    main_recovery_p50: ci?.main_recovery_hours?.p50 ?? null,
    open_prs: gh?.open_prs ?? null,
    pr_cycle_p50: gh?.pr_cycle_hours?.p50 ?? null,
    first_try_green: gh?.ci_pr?.first_try_green_share ?? null,
    branches: gh?.branches?.count ?? null,
  };
}

/** Facts for the last `days` complete UTC days, newest first. */
export function collectEditions(repo, { now = Date.now(), days = 7, asks = null, stats = null, ref = 'HEAD' } = {}) {
  const editions = editionDays(now, days);
  const oldest = editions[editions.length - 1];
  const read = readMerges(repo, { since: startOf(oldest) - 7 * DAY, until: startOf(editions[0]) + DAY, ref });
  const runs = readRuns(repo);
  const perDay = {};
  for (const m of read.merges) perDay[dayOf(m.at)] = (perDay[dayOf(m.at)] ?? 0) + 1;
  const snapshot = snapshotOf(stats);
  return {
    generated_at: new Date(now).toISOString(),
    git: read.available ? { available: true } : { available: false, reason: read.reason },
    editions: editions.map((day, i) => {
      const before = Array.from({ length: 7 }, (_, k) => perDay[dayOf(startOf(day) - (k + 1) * DAY)] ?? 0);
      return {
        ...dayFacts(day, read.merges, runs.get(day), { baselineMerges: before }),
        asks: asksOn(asks, day),
        // The snapshot describes the build moment, which only the newest edition can claim.
        snapshot: i === 0 ? snapshot : null,
      };
    }),
  };
}
