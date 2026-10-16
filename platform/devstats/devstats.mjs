// The development-process dashboard: how work moves through this repository.
//
// Three sources, cheapest first, each optional past the first:
//   1. git history of the checkout (merges, lead time from first commit to
//      merge, reverts, ventures and research added),
//   2. the run records in prompts/runs/ (outcomes, CI failures before green,
//      models, measured cost from prompts/runcost.py),
//   3. the GitHub API, when a token is present (publish workflow): PR cycle
//      time, first-review latency, CI pass rates on main and on PRs, CI
//      attempts before green, open PRs and branches by age.
// A metric whose source was unavailable is reported as `null` with the reason,
// never as zero.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DAY = 86_400_000;

export function quantile(values, q) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Days from `end` back `days`, oldest first, as YYYY-MM-DD. */
export function dayRange(endMs, days) {
  return Array.from({ length: days }, (_, i) => dayOf(endMs - (days - 1 - i) * DAY));
}

// ---------------------------------------------------------------------------
// 1. git

export function fromGit(repo, { days = 30, now = Date.now(), ref = 'HEAD' } = {}) {
  const since = new Date(now - days * DAY).toISOString();
  let log;
  try {
    log = git(repo, ['log', ref, '--first-parent', `--since=${since}`, '--format=%H%x09%ct%x09%P%x09%s']);
  } catch (err) {
    return { available: false, reason: `git log failed: ${err.message.split('\n')[0]}` };
  }
  const merges = log.split('\n').filter(Boolean).map((line) => {
    const [sha, ct, parents, subject] = line.split('\t');
    return { sha, at: Number(ct) * 1000, parents: parents.split(' '), subject };
  });
  const perDay = Object.fromEntries(dayRange(now, days).map((d) => [d, 0]));
  for (const m of merges) if (dayOf(m.at) in perDay) perDay[dayOf(m.at)] += 1;

  // Lead time for true merge commits: the oldest commit the merge brought in.
  const lead = [];
  for (const m of merges.filter((x) => x.parents.length === 2 && x.at > now - 7 * DAY).slice(0, 400)) {
    try {
      const times = git(repo, ['log', '--format=%at', `${m.parents[0]}..${m.parents[1]}`]).split('\n').filter(Boolean);
      if (times.length) lead.push((m.at - Number(times[times.length - 1]) * 1000) / 3_600_000);
    } catch {
      // A shallow clone cannot see the branch side; skip that merge.
    }
  }
  const reverts = merges.filter((m) => /^Revert\b|\brevert(s|ed)?\b.*#\d+/i.test(m.subject)).length;
  const fixForward = merges.filter((m) => /\b(fix(es)?|repair|unbreak)\b.*\bmain\b|main (is )?red/i.test(m.subject)).length;

  const added = (glob) => {
    try {
      return git(repo, ['log', ref, `--since=${since}`, '--diff-filter=A', '--format=', '--name-only', '--', glob])
        .split('\n')
        .filter(Boolean).length;
    } catch {
      return null;
    }
  };
  return {
    available: true,
    window_days: days,
    merges_total: merges.length,
    merges_per_day: perDay,
    merges_last_24h: merges.filter((m) => m.at > now - DAY).length,
    lead_time_hours: { n: lead.length, p50: round(quantile(lead, 0.5)), p90: round(quantile(lead, 0.9)), note: 'merge commits of the last 7 days: oldest commit on the branch to the merge; squash merges are not visible here' },
    reverts,
    fix_forward_merges: fixForward,
    ventures_added: added('ventures/*/VENTURE.yaml'),
  };
}

export function inventory(repo) {
  const count = (dir, test) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && test(e.name)).length : 0);
  return {
    ventures: count(path.join(repo, 'ventures'), (n) => existsSync(path.join(repo, 'ventures', n, 'VENTURE.yaml'))),
    research_projects: count(path.join(repo, 'research'), (n) => !n.startsWith('_') && !n.startsWith('.') && existsSync(path.join(repo, 'research', n, 'README.md'))),
  };
}

// ---------------------------------------------------------------------------
// 2. run records

export function fromRuns(repo, { days = 30, now = Date.now() } = {}) {
  const dir = path.join(repo, 'prompts', 'runs');
  if (!existsSync(dir)) return { available: false, reason: 'no prompts/runs' };
  const cutoff = dayOf(now - days * DAY);
  const recs = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const r = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
      if (r && typeof r === 'object' && typeof r.date === 'string' && r.date >= cutoff) recs.push(r);
    } catch {
      // A malformed record is promptctl validate's to report, not this page's.
    }
  }
  const group = (key) => {
    const out = {};
    for (const r of recs) {
      const k = key(r) ?? 'unknown';
      const g = (out[k] ??= { runs: 0, success: 0, ci_failures: [], cost: [], active: [], leverage: [] });
      g.runs += 1;
      if (r.outcome === 'success' && r.merged !== false) g.success += 1;
      if (Number.isFinite(r.ci_failures_before_green)) g.ci_failures.push(r.ci_failures_before_green);
      const u = r.usage?.measured_by ? r.usage : null;
      if (u && Number.isFinite(u.totals?.api_equivalent_usd)) g.cost.push(u.totals.api_equivalent_usd);
      if (u && Number.isFinite(u.time?.active_minutes)) g.active.push(u.time.active_minutes);
      if (u && Number.isFinite(u.leverage)) g.leverage.push(u.leverage);
    }
    return Object.fromEntries(
      Object.entries(out)
        .sort((a, b) => b[1].runs - a[1].runs)
        .map(([k, g]) => [k, {
          runs: g.runs,
          success_rate: round(g.success / g.runs, 2),
          ci_failures_mean: g.ci_failures.length ? round(g.ci_failures.reduce((a, b) => a + b, 0) / g.ci_failures.length, 2) : null,
          measured: g.cost.length,
          api_usd_median: round(quantile(g.cost, 0.5), 2),
          active_minutes_median: round(quantile(g.active, 0.5)),
          leverage_median: round(quantile(g.leverage, 0.5)),
        }]),
    );
  };
  const friction = {};
  for (const r of recs) for (const f of r.doc_friction ?? []) if (f?.file) friction[f.file] = (friction[f.file] ?? 0) + 1;
  return {
    available: true,
    window_days: days,
    runs: recs.length,
    integrity_issues: recs.reduce((a, r) => a + (r.integrity_issues?.length ?? 0), 0),
    by_track: group((r) => r.track),
    by_model: group((r) => r.usage?.primary_model ?? r.model),
    by_prompt: group((r) => `${r.track}/${r.prompt_version}`),
    doc_friction_top: Object.entries(friction).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// 3. GitHub API (optional)

async function ghPages(fetchImpl, token, url, pages) {
  const out = [];
  for (let page = 1; page <= pages; page += 1) {
    const res = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url.replace(/\?.*/, '')}`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : body.workflow_runs ?? [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

export async function fromGitHub({ token, repo, now = Date.now(), fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!token || !repo) return { available: false, reason: 'no GITHUB_TOKEN in this build (the publish workflow supplies one)' };
  const api = `https://api.github.com/repos/${repo}`;
  try {
    const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / 3_600_000;
    const closed = await ghPages(fetchImpl, token, `${api}/pulls?state=closed&sort=updated&direction=desc`, 3);
    const merged = closed.filter((p) => p.merged_at && Date.parse(p.merged_at) > now - 7 * DAY);
    const open = await ghPages(fetchImpl, token, `${api}/pulls?state=open`, 3);
    const cycle = merged.map((p) => hours(p.created_at, p.merged_at));

    // First-review latency on a sample: one request per PR, so bounded.
    const sample = merged.slice(0, 40);
    let reviewed = 0;
    const firstReview = [];
    for (const p of sample) {
      const reviews = await ghPages(fetchImpl, token, `${api}/pulls/${p.number}/reviews`, 1);
      const times = reviews.map((r) => r.submitted_at).filter(Boolean).sort();
      if (times.length) {
        reviewed += 1;
        firstReview.push(hours(p.created_at, times[0]));
      }
    }

    const mainRuns = await ghPages(fetchImpl, token, `${api}/actions/runs?branch=main&event=push&status=completed`, 2);
    const prRuns = await ghPages(fetchImpl, token, `${api}/actions/runs?event=pull_request&status=completed`, 3);
    const share = (runs, ok) => (runs.length ? round(runs.filter(ok).length / runs.length, 3) : null);
    const decided = (r) => ['success', 'failure', 'timed_out'].includes(r.conclusion);

    // Per PR head branch: how many distinct commits saw a failing run before
    // the first commit whose runs all passed. A proxy for CI iterations.
    const byBranch = {};
    for (const r of prRuns.filter(decided)) {
      const b = (byBranch[r.head_branch] ??= {});
      const c = (b[r.head_sha] ??= { at: r.created_at, failed: false });
      if (r.conclusion !== 'success') c.failed = true;
      if (r.created_at < c.at) c.at = r.created_at;
    }
    const iterations = [];
    let firstTry = 0;
    let branchesWithGreen = 0;
    for (const commits of Object.values(byBranch)) {
      const ordered = Object.values(commits).sort((a, b) => a.at.localeCompare(b.at));
      const green = ordered.findIndex((c) => !c.failed);
      if (green === -1) continue;
      branchesWithGreen += 1;
      iterations.push(green);
      if (green === 0) firstTry += 1;
    }

    const failingWorkflows = {};
    for (const r of mainRuns.filter((x) => x.conclusion === 'failure')) failingWorkflows[r.name] = (failingWorkflows[r.name] ?? 0) + 1;

    const branches = await ghPages(fetchImpl, token, `${api}/branches`, 30);
    const openAges = open.map((p) => hours(p.created_at, new Date(now).toISOString()) / 24);
    return {
      available: true,
      prs_merged_7d: merged.length,
      pr_cycle_hours: { n: cycle.length, p50: round(quantile(cycle, 0.5)), p90: round(quantile(cycle, 0.9)) },
      first_review_hours: { sampled: sample.length, reviewed, p50: round(quantile(firstReview, 0.5)), p90: round(quantile(firstReview, 0.9)) },
      open_prs: { count: open.length, older_than_7d: openAges.filter((d) => d > 7).length, oldest_days: round(Math.max(0, ...openAges)) },
      ci_main: { runs: mainRuns.length, green_share: share(mainRuns.filter(decided), (r) => r.conclusion === 'success'), failing_workflows: Object.entries(failingWorkflows).sort((a, b) => b[1] - a[1]).slice(0, 8) },
      ci_pr: {
        runs: prRuns.length,
        run_pass_share: share(prRuns.filter(decided), (r) => r.conclusion === 'success'),
        first_try_green_share: branchesWithGreen ? round(firstTry / branchesWithGreen, 3) : null,
        iterations_before_green_mean: iterations.length ? round(iterations.reduce((a, b) => a + b, 0) / iterations.length, 2) : null,
        branches_seen: Object.keys(byBranch).length,
      },
      branches: { count: branches.length, capped: branches.length >= 3000 },
    };
  } catch (err) {
    return { available: false, reason: err.message };
  }
}

export async function collect(repo, { now = Date.now(), token, ghRepo, fetch } = {}) {
  return {
    generated_at: new Date(now).toISOString(),
    source_commit: (() => { try { return git(repo, ['rev-parse', 'HEAD']).trim(); } catch { return null; } })(),
    inventory: inventory(repo),
    git: fromGit(repo, { now }),
    runs: fromRuns(repo, { now }),
    github: await fromGitHub({ token, repo: ghRepo, now, fetch }),
  };
}
