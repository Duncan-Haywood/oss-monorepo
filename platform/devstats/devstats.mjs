// The development-process dashboard: how work moves through this repository.
//
// Three sources, cheapest first, each optional past the first:
//   1. git history of the checkout (merges, lead time from first commit to
//      merge, reverts, ventures and research added),
//   2. the run records in prompts/runs/ (outcomes, CI failures before green,
//      models, measured cost from prompts/runcost.py),
//   3. the GitHub API, when a token is present (publish workflow): PR cycle
//      time, first-review latency and verdicts, CI pass rates on main and on
//      PRs, CI attempts before green, open PRs and branches by age, and
//      (fromCI) every completed workflow run of the last two weeks: passed,
//      failed and cancelled per day, by workflow and trigger, durations,
//      re-runs, what is red on main now and how long main took to recover.
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

// ---------------------------------------------------------------------------
// CI activity: every completed workflow run, whatever triggered it.
//
// Two reads, because this repository runs thousands of workflow runs a day
// (measured 2026-10-16: the newest 100 covered 15 minutes) and the runs API
// returns at most 1,000 of them for a filtered query:
//   - exact counts per day and outcome, from the API's `total_count` with
//     `per_page=1`. `total_count` itself stops at 2,500, so a slice that
//     reaches it is halved until it does not (down to an hour; a slice still
//     at the cap then is reported as a floor). Days a previous build already
//     counted are reused, so a refresh costs a few dozen tiny requests;
//   - a sample of the newest runs, and of the newest push runs on main, for
//     what a count cannot say: which workflows fail, how long runs take,
//     re-runs, what is red on main now and how long main took to recover.

export const CI_DAYS = 14;
export const COUNT_CAP = 2500;
const HOUR = 3_600_000;
const SAMPLE_PAGES = 10;
const MAIN_PAGES = 5;

// Conclusions folded into what a reader asks: did it pass, fail, or never
// decide? `timed_out` and `startup_failure` are failures a person has to look
// at; `cancelled` is mostly a newer push superseding an older run.
const OUTCOME = {
  success: 'passed',
  failure: 'failed', timed_out: 'failed', startup_failure: 'failed',
  cancelled: 'cancelled',
  skipped: 'skipped', neutral: 'skipped', stale: 'skipped', action_required: 'skipped',
};
export const outcomeOf = (conclusion) => OUTCOME[conclusion] ?? 'skipped';
const OUTCOMES = ['passed', 'failed', 'cancelled', 'skipped'];
// The conclusions counted exactly, as `status=` filters. The rare ones
// (neutral, stale, action_required) are left to the sample.
const COUNTED = [['success', 'passed'], ['failure', 'failed'], ['timed_out', 'failed'], ['startup_failure', 'failed'], ['cancelled', 'cancelled'], ['skipped', 'skipped']];
const tally = () => Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
const passShare = (t) => (t.passed + t.failed ? round(t.passed / (t.passed + t.failed), 3) : null);
const isoSec = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function ghJson(fetchImpl, token, url) {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url.replace(/\?.*/, '')}`);
  return res.json();
}

/** Exact runs with one conclusion created in [start, end), halving at the cap. */
async function countSlice(fetchImpl, token, api, status, start, end) {
  const url = `${api}/actions/runs?per_page=1&exclude_pull_requests=true&status=${status}&created=${isoSec(start)}..${isoSec(end - 1000)}`;
  const n = (await ghJson(fetchImpl, token, url)).total_count ?? 0;
  if (n < COUNT_CAP) return { n, capped: false };
  if (end - start <= HOUR) return { n, capped: true };
  // Split on an hour boundary where there is one, so slices stay readable.
  const half = Math.floor((end - start) / 2 / HOUR) * HOUR;
  const mid = start + (half || (end - start) / 2);
  const [x, y] = [await countSlice(fetchImpl, token, api, status, start, mid), await countSlice(fetchImpl, token, api, status, mid, end)];
  return { n: x.n + y.n, capped: x.capped || y.capped };
}

/**
 * Runs per day and outcome for the last `days` days. A day from `previous`
 * (an earlier stats.json's `github.ci`) is reused when that build ran a full
 * day after the day ended: its runs had all finished by then.
 */
export async function countRunsByDay(fetchImpl, token, api, { now = Date.now(), days = CI_DAYS, previous = null } = {}) {
  const prevAt = Date.parse(previous?.counted_at ?? '');
  const per_day = {};
  const capped_days = [];
  let reused = 0;
  for (const day of dayRange(now, days)) {
    const start = Date.parse(`${day}T00:00:00Z`);
    const end = Math.min(start + DAY, now);
    const old = previous?.per_day?.[day];
    if (old && Number.isFinite(prevAt) && prevAt >= start + 2 * DAY && !previous.coverage?.capped_days?.includes(day)) {
      per_day[day] = { ...tally(), ...old };
      reused += 1;
      continue;
    }
    const t = tally();
    let capped = false;
    for (const [status, outcome] of COUNTED) {
      const c = await countSlice(fetchImpl, token, api, status, start, end);
      t[outcome] += c.n;
      capped ||= c.capped;
    }
    per_day[day] = t;
    if (capped) capped_days.push(day);
  }
  return { per_day, capped_days, reused_days: reused };
}

export async function sampleRuns(fetchImpl, token, api) {
  return {
    sample: await ghPages(fetchImpl, token, `${api}/actions/runs?status=completed&exclude_pull_requests=true`, SAMPLE_PAGES),
    main: await ghPages(fetchImpl, token, `${api}/actions/runs?branch=main&event=push&status=completed&exclude_pull_requests=true`, MAIN_PAGES),
  };
}

const minutes = (r) => {
  const a = Date.parse(r.run_started_at ?? r.created_at);
  const b = Date.parse(r.updated_at);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 60_000 : null;
};
const span = (runs) => {
  const ts = runs.map((r) => r.created_at).filter(Boolean).sort();
  return ts.length ? { from: ts[0], to: ts[ts.length - 1], hours: round((Date.parse(ts[ts.length - 1]) - Date.parse(ts[0])) / HOUR) } : null;
};

/** Pure: exact counts (countRunsByDay) plus the newest runs (sampleRuns). */
export function ciActivity({ counts = { per_day: {}, capped_days: [] }, sample = [], main = [] } = {}, { now = Date.now() } = {}) {
  const totals = tally();
  for (const t of Object.values(counts.per_day)) for (const o of OUTCOMES) totals[o] += t[o] ?? 0;

  const byEvent = {};
  const byWorkflow = {};
  const durations = [];
  let reruns = 0;
  let wallMinutes = 0;
  for (const r of sample) {
    const o = outcomeOf(r.conclusion);
    const isMain = r.event === 'push' && r.head_branch === 'main';
    const ev = isMain ? 'push to main' : r.event === 'push' ? 'push to a branch' : (r.event ?? 'unknown');
    (byEvent[ev] ??= tally())[o] += 1;
    const w = (byWorkflow[r.name ?? 'unknown'] ??= { ...tally(), minutes: [] });
    w[o] += 1;
    const m = minutes(r);
    if (m != null && o !== 'skipped') {
      w.minutes.push(m);
      durations.push(m);
      wallMinutes += m;
    }
    if ((r.run_attempt ?? 1) > 1) reruns += 1;
  }
  const workflows = Object.entries(byWorkflow)
    .map(([name, w]) => ({
      name,
      runs: OUTCOMES.reduce((a, o) => a + w[o], 0),
      passed: w.passed, failed: w.failed, cancelled: w.cancelled, skipped: w.skipped,
      pass_share: passShare(w),
      minutes_p50: round(quantile(w.minutes, 0.5)),
      minutes_p90: round(quantile(w.minutes, 0.9)),
    }))
    .sort((a, b) => b.failed - a.failed || b.runs - a.runs);

  // Main's red spells, per workflow: from a failing push run on main to the
  // next passing one. A workflow whose newest decided run failed is red now.
  const mainRuns = main
    .filter((r) => ['passed', 'failed'].includes(outcomeOf(r.conclusion)))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const spells = [];
  const redSince = {};
  for (const r of mainRuns) {
    const name = r.name ?? 'unknown';
    if (outcomeOf(r.conclusion) === 'failed') redSince[name] ??= r.created_at;
    else if (redSince[name]) {
      spells.push((Date.parse(r.created_at) - Date.parse(redSince[name])) / HOUR);
      delete redSince[name];
    }
  }
  const redNow = Object.entries(redSince)
    .map(([name, since]) => ({ workflow: name, since, hours: round((now - Date.parse(since)) / HOUR) }))
    .sort((a, b) => b.hours - a.hours);

  const decided = totals.passed + totals.failed;
  const sampleSpan = span(sample);
  return {
    counted_at: new Date(now).toISOString(),
    window_days: Object.keys(counts.per_day).length,
    runs: OUTCOMES.reduce((a, o) => a + totals[o], 0),
    totals,
    pass_share: passShare(totals),
    failed_share_of_decided: decided ? round(totals.failed / decided, 3) : null,
    per_day: counts.per_day,
    coverage: {
      capped_days: counts.capped_days ?? [],
      reused_days: counts.reused_days ?? 0,
      note: counts.capped_days?.length ? `More than ${COUNT_CAP.toLocaleString('en-US')} runs of one outcome in a single hour on the days listed; their counts are a floor` : 'Exact counts from the runs API for every day in the window',
    },
    sample: { runs: sample.length, span: sampleSpan, workflows_seen: workflows.length },
    by_event: Object.fromEntries(Object.entries(byEvent).sort((a, b) => b[1].passed + b[1].failed - (a[1].passed + a[1].failed)).map(([k, t]) => [k, { ...t, pass_share: passShare(t) }])),
    workflows: workflows.slice(0, 20),
    duration_minutes: { n: durations.length, p50: round(quantile(durations, 0.5)), p90: round(quantile(durations, 0.9)), note: 'run start to last update: wall-clock, including time jobs waited for a runner' },
    ci_hours_per_hour: sampleSpan?.hours ? round(wallMinutes / 60 / sampleSpan.hours) : null,
    rerun_share: sample.length ? round(reruns / sample.length, 3) : null,
    main: { runs: main.length, span: span(main) },
    main_recovery_hours: { n: spells.length, p50: round(quantile(spells, 0.5)), p90: round(quantile(spells, 0.9)) },
    red_on_main_now: redNow,
  };
}

/** The CI section on its own: a failure here leaves the PR metrics standing. */
export async function fromCI({ token, repo, now = Date.now(), fetch: fetchImpl = globalThis.fetch, previous = null, days = CI_DAYS } = {}) {
  if (!token || !repo) return { available: false, reason: 'no GITHUB_TOKEN in this build (the publish workflow supplies one)' };
  const api = `https://api.github.com/repos/${repo}`;
  try {
    const counts = await countRunsByDay(fetchImpl, token, api, { now, days, previous });
    const { sample, main } = await sampleRuns(fetchImpl, token, api);
    return { available: true, ...ciActivity({ counts, sample, main }, { now }) };
  } catch (err) {
    return { available: false, reason: err.message };
  }
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
    const reviewStates = {};
    for (const p of sample) {
      const reviews = await ghPages(fetchImpl, token, `${api}/pulls/${p.number}/reviews`, 1);
      for (const r of reviews) if (r.state) reviewStates[r.state] = (reviewStates[r.state] ?? 0) + 1;
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
      prs_closed_unmerged_7d: closed.filter((p) => !p.merged_at && p.closed_at && Date.parse(p.closed_at) > now - 7 * DAY).length,
      first_review_hours: { sampled: sample.length, reviewed, p50: round(quantile(firstReview, 0.5)), p90: round(quantile(firstReview, 0.9)) },
      review_states: reviewStates,
      open_prs: { count: open.length, drafts: open.filter((p) => p.draft).length, older_than_7d: openAges.filter((d) => d > 7).length, oldest_days: round(Math.max(0, ...openAges)) },
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

export async function collect(repo, { now = Date.now(), token, ghRepo, fetch, previous = null } = {}) {
  return {
    generated_at: new Date(now).toISOString(),
    source_commit: (() => { try { return git(repo, ['rev-parse', 'HEAD']).trim(); } catch { return null; } })(),
    inventory: inventory(repo),
    git: fromGit(repo, { now }),
    runs: fromRuns(repo, { now }),
    github: await fromGitHub({ token, repo: ghRepo, now, fetch }),
    ci: await fromCI({ token, repo: ghRepo, now, fetch, previous: previous?.ci?.available ? previous.ci : null }),
  };
}
