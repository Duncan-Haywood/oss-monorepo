import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { quantile, dayRange, fromGit, fromRuns, fromGitHub, inventory, collect, ciActivity, outcomeOf, countRunsByDay, fromCI, COUNT_CAP } from './devstats.mjs';
import { renderDashboard, barChart, stackedChart } from './render.mjs';

const NOW = Date.parse('2026-10-16T12:00:00Z');

function repoFixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'devstats-'));
  const g = (args, date) => execFileSync('git', ['-C', dir, ...args], {
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  g(['init', '-q', '-b', 'main'], '2026-10-15T00:00:00Z');
  mkdirSync(path.join(dir, 'ventures', 'a'), { recursive: true });
  writeFileSync(path.join(dir, 'ventures', 'a', 'VENTURE.yaml'), 'name: a\n');
  g(['add', '.'], '2026-10-15T00:00:00Z');
  g(['commit', '-qm', 'base'], '2026-10-15T00:00:00Z');
  g(['checkout', '-qb', 'feature'], '2026-10-16T08:00:00Z');
  writeFileSync(path.join(dir, 'x.txt'), 'x');
  g(['add', '.'], '2026-10-16T08:00:00Z');
  g(['commit', '-qm', 'work'], '2026-10-16T08:00:00Z');
  g(['checkout', '-q', 'main'], '2026-10-16T10:00:00Z');
  g(['merge', '-q', '--no-ff', 'feature', '-m', 'Merge pull request #1 from o/feature'], '2026-10-16T10:00:00Z');
  g(['commit', '-q', '--allow-empty', '-m', 'Revert "something" (#2)'], '2026-10-16T11:00:00Z');
  mkdirSync(path.join(dir, 'prompts', 'runs'), { recursive: true });
  const rec = (name, r) => writeFileSync(path.join(dir, 'prompts', 'runs', name), JSON.stringify(r));
  rec('a.json', { date: '2026-10-16', track: 'ventures', prompt_version: 1, model: 'm1', outcome: 'success', merged: true, ci_failures_before_green: 1,
    doc_friction: [{ file: 'CLAUDE.md', issue: 'x' }], integrity_issues: [],
    usage: { measured_by: 'prompts/runcost.py v1', primary_model: 'm1', totals: { api_equivalent_usd: 3 }, time: { active_minutes: 20 }, leverage: 50 } });
  rec('b.json', { date: '2026-10-16', track: 'ventures', prompt_version: 1, model: 'm1', outcome: 'failed', integrity_issues: ['y'] });
  rec('old.json', { date: '2026-01-01', track: 'ventures', outcome: 'success' });
  rec('bad.json', 'not an object');
  writeFileSync(path.join(dir, 'prompts', 'runs', 'broken.json'), '{');
  return dir;
}

test('quantile and dayRange', () => {
  assert.equal(quantile([3, 1, 2], 0.5), 2);
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([0, 10], 0.9), 9);
  assert.deepEqual(dayRange(NOW, 3), ['2026-10-14', '2026-10-15', '2026-10-16']);
});

test('git: merges per day, lead time from the oldest branch commit, reverts', () => {
  const repo = repoFixture();
  const g = fromGit(repo, { now: NOW, days: 3 });
  assert.equal(g.available, true);
  assert.equal(g.merges_per_day['2026-10-16'], 2);
  assert.equal(g.merges_last_24h, 2);
  assert.equal(g.lead_time_hours.n, 1);
  assert.equal(g.lead_time_hours.p50, 2);
  assert.equal(g.reverts, 1);
  assert.deepEqual(inventory(repo), { ventures: 1, research_projects: 0 });
});

test('runs: window, grouping, measured cost only from runcost blocks, bad files skipped', () => {
  const r = fromRuns(repoFixture(), { now: NOW, days: 30 });
  assert.equal(r.runs, 2);
  assert.equal(r.integrity_issues, 1);
  const v = r.by_track.ventures;
  assert.deepEqual([v.runs, v.success_rate, v.measured, v.api_usd_median, v.leverage_median], [2, 0.5, 1, 3, 50]);
  assert.deepEqual(r.doc_friction_top, [['CLAUDE.md', 1]]);
});

test('github: without a token every metric says why it is missing', async () => {
  const gh = await fromGitHub({});
  assert.equal(gh.available, false);
  assert.match(gh.reason, /GITHUB_TOKEN/);
});

test('github: cycle time, reviews, CI pass rates and iterations before green', async () => {
  const iso = (h) => new Date(NOW - h * 3_600_000).toISOString();
  const routes = [
    [/\/pulls\?state=closed/, [{ number: 1, created_at: iso(10), merged_at: iso(8) }, { number: 2, created_at: iso(6), merged_at: iso(2) }, { number: 3, created_at: iso(5), merged_at: null }]],
    [/\/pulls\?state=open/, [
      { number: 7, title: 'Old work', created_at: iso(24 * 9), head: { repo: { full_name: 'o/r' } } },
      { number: 8, title: 'A fork says hi', created_at: iso(1), head: { repo: { full_name: 'stranger/r' } } },
    ]],
    [/\/pulls\/1\/reviews/, [{ submitted_at: iso(9) }]],
    [/\/pulls\/2\/reviews/, []],
    [/event=push/, { workflow_runs: [{ name: 'A', conclusion: 'success' }, { name: 'B', conclusion: 'failure' }, { name: 'A', conclusion: 'cancelled' }] }],
    [/event=pull_request/, { workflow_runs: [
      { head_branch: 'x', head_sha: 's1', created_at: iso(5), conclusion: 'failure' },
      { head_branch: 'x', head_sha: 's2', created_at: iso(4), conclusion: 'success' },
      { head_branch: 'y', head_sha: 't1', created_at: iso(3), conclusion: 'success' },
    ] }],
    [/\/branches/, [{ name: 'main' }, { name: 'b' }]],
  ];
  const fetch = async (url) => {
    const hit = routes.find(([re]) => re.test(url));
    assert.ok(hit, `unexpected ${url}`);
    return { ok: true, json: async () => hit[1] };
  };
  const gh = await fromGitHub({ token: 't', repo: 'o/r', now: NOW, fetch });
  assert.equal(gh.available, true);
  assert.equal(gh.prs_merged_7d, 2);
  assert.equal(gh.pr_cycle_hours.p50, 3);
  assert.deepEqual([gh.first_review_hours.reviewed, gh.first_review_hours.p50], [1, 1]);
  assert.deepEqual([gh.open_prs.count, gh.open_prs.older_than_7d], [2, 1]);
  // Only this repository's branches are listed by title: a fork's title is anyone's text.
  assert.deepEqual(gh.open_prs.recent, [{ number: 7, title: 'Old work', draft: false, created_at: iso(24 * 9) }]);
  assert.equal(gh.ci_main.green_share, 0.5);
  assert.deepEqual(gh.ci_main.failing_workflows, [['B', 1]]);
  assert.equal(gh.ci_pr.first_try_green_share, 0.5);
  assert.equal(gh.ci_pr.iterations_before_green_mean, 0.5);
  assert.equal(gh.branches.count, 2);
  assert.equal(gh.prs_closed_unmerged_7d, 0);
});

test('ciActivity: exact daily counts, plus workflows, triggers, red spells and re-runs from the sample', () => {
  const at = (h) => new Date(NOW - h * 3_600_000).toISOString();
  const run = (name, conclusion, h, extra = {}) => ({ name, conclusion, event: 'push', head_branch: 'main', created_at: at(h), run_started_at: at(h), updated_at: at(h - 0.1), ...extra });
  const main = [
    run('Tests', 'failure', 30),
    run('Tests', 'success', 26), // red for 4 h
    run('Tests', 'timed_out', 5), // red since
    run('Lint', 'success', 4),
    run('Lint', 'cancelled', 3),
  ];
  const sample = [...main, run('Tests', 'success', 2, { event: 'pull_request', head_branch: 'feature', run_attempt: 2 }), run('Docs', 'skipped', 1)];
  const counts = { per_day: { '2026-10-15': { passed: 90, failed: 10, cancelled: 5, skipped: 1 }, '2026-10-16': { passed: 0, failed: 0, cancelled: 0, skipped: 0 } }, capped_days: ['2026-10-15'], reused_days: 1 };
  const ci = ciActivity({ counts, sample, main }, { now: NOW });
  assert.deepEqual(ci.totals, { passed: 90, failed: 10, cancelled: 5, skipped: 1 });
  assert.equal(ci.runs, 106);
  assert.equal(ci.pass_share, 0.9);
  assert.equal(ci.window_days, 2);
  assert.match(ci.coverage.note, /floor/);
  assert.equal(ci.workflows[0].name, 'Tests');
  assert.deepEqual([ci.workflows[0].failed, ci.workflows[0].passed, ci.workflows[0].minutes_p50], [2, 2, 6]);
  assert.equal(ci.by_event['push to main'].failed, 2);
  assert.equal(ci.by_event.pull_request.pass_share, 1);
  assert.deepEqual([ci.main_recovery_hours.n, ci.main_recovery_hours.p50], [1, 4]);
  assert.deepEqual(ci.red_on_main_now.map((r) => [r.workflow, r.hours]), [['Tests', 5]]);
  assert.equal(ci.rerun_share, round3(1 / 7));
  assert.equal(ci.sample.span.hours, 29);
  assert.equal(outcomeOf('startup_failure'), 'failed');
  assert.equal(outcomeOf('something new'), 'skipped');
  const svg = stackedChart(ci.per_day);
  assert.match(svg, /<title>2026-10-15: 10 failed<\/title>/);
  assert.match(svg, /Passed 90, Failed 10, Cancelled 5, Skipped 1/);
  assert.match(stackedChart({ d: { passed: 22712, failed: 0, cancelled: 0, skipped: 0 } }), /Passed 22,712/);
});

// A fake runs API that knows each run's creation time, so `total_count` can
// be computed for any slice and capped the way GitHub caps it.
function countingApi(perHour) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    const [from, to] = q.get('created').split('..').map(Date.parse);
    const hours = Math.round((to + 1000 - from) / 3_600_000);
    const n = (perHour[q.get('status')] ?? 0) * hours;
    return { ok: true, json: async () => ({ total_count: Math.min(n, COUNT_CAP), workflow_runs: [] }) };
  };
  return { fetch, calls };
}

test('countRunsByDay: halves a slice that hits the 2,500 cap until it does not', async () => {
  const { fetch, calls } = countingApi({ success: 250, failure: 10, cancelled: 3 }); // 6,000 passes a day
  const end = Date.parse('2026-10-16T00:00:00Z');
  const c = await countRunsByDay(fetch, 't', 'https://api.github.com/repos/o/r', { now: end, days: 2 });
  assert.deepEqual(c.per_day['2026-10-15'], { passed: 6000, failed: 240, cancelled: 72, skipped: 0 });
  assert.deepEqual(c.capped_days, []);
  assert.ok(calls.length < 40, `${calls.length} requests`);
  assert.ok(calls.every((u) => u.includes('per_page=1')));
});

test('countRunsByDay: a slice still at the cap within an hour is a floor, and says so', async () => {
  const { fetch } = countingApi({ success: 3000 });
  const c = await countRunsByDay(fetch, 't', 'https://api.github.com/repos/o/r', { now: Date.parse('2026-10-16T02:00:00Z'), days: 1 });
  assert.equal(c.per_day['2026-10-16'].passed, 2 * COUNT_CAP);
  assert.deepEqual(c.capped_days, ['2026-10-16']);
});

test('countRunsByDay: reuses days an earlier build counted after they ended, recounts the rest', async () => {
  const { fetch, calls } = countingApi({ failure: 1 });
  const previous = { counted_at: '2026-10-16T06:00:00Z', per_day: { '2026-10-13': { passed: 7, failed: 1 }, '2026-10-14': { passed: 9 }, '2026-10-15': { passed: 3 } }, coverage: { capped_days: ['2026-10-13'] } };
  const c = await countRunsByDay(fetch, 't', 'https://api.github.com/repos/o/r', { now: NOW, days: 4, previous });
  assert.equal(c.reused_days, 1); // 14th only: the 13th was capped, the 15th ended too recently
  assert.deepEqual(c.per_day['2026-10-14'], { passed: 9, failed: 0, cancelled: 0, skipped: 0 });
  assert.equal(c.per_day['2026-10-15'].failed, 24);
  assert.equal(c.per_day['2026-10-16'].failed, 12);
  assert.ok(calls.every((u) => !u.includes('2026-10-14T')));
});

test('fromCI: no token, or an API error, is reported rather than shown as zero', async () => {
  assert.match((await fromCI({})).reason, /GITHUB_TOKEN/);
  const ci = await fromCI({ token: 't', repo: 'o/r', now: NOW, fetch: async () => ({ ok: false, status: 403 }) });
  assert.equal(ci.available, false);
  assert.match(ci.reason, /403/);
});

const round3 = (v) => Math.round(v * 1000) / 1000;

test('github: an API error is reported, not shown as zero', async () => {
  const gh = await fromGitHub({ token: 't', repo: 'o/r', fetch: async () => ({ ok: false, status: 403 }) });
  assert.equal(gh.available, false);
  assert.match(gh.reason, /403/);
});

test('the page renders every section, marks missing data, and escapes', async () => {
  const stats = await collect(repoFixture(), { now: NOW });
  stats.runs.by_track['<script>'] = stats.runs.by_track.ventures;
  const html = renderDashboard(stats);
  for (const h of ['Merges to main per day', 'Pull requests, reviews and CI', 'Agent runs by model', 'stats.json']) assert.ok(html.includes(h), h);
  assert.match(html, /not measured/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!/https?:\/\/(?!www\.w3)/.test(html.replace(/<a [^>]*>/g, '')), 'no off-origin requests');
  assert.match(barChart({ '2026-10-16': 3 }), /<title>2026-10-16: 3 merges<\/title>/);
  assert.ok(html.includes('CI runs: passed, failed, cancelled'));
  // The site's shared header, so this page is not a dead end.
  assert.match(html, /<nav class="pfs-head" aria-label="Site" data-pfs-head>/);
  assert.match(html, /class="pfs-brand" href="\.\.\/" data-pf-to="hub"/);
  assert.match(html, /<link rel="stylesheet" href="\.\.\/pf-site\.css">/);
});
