import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { quantile, dayRange, fromGit, fromRuns, fromGitHub, inventory, collect } from './devstats.mjs';
import { renderDashboard, barChart } from './render.mjs';

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
    [/\/pulls\?state=open/, [{ created_at: iso(24 * 9) }, { created_at: iso(1) }]],
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
  assert.equal(gh.ci_main.green_share, 0.5);
  assert.deepEqual(gh.ci_main.failing_workflows, [['B', 1]]);
  assert.equal(gh.ci_pr.first_try_green_share, 0.5);
  assert.equal(gh.ci_pr.iterations_before_green_mean, 0.5);
  assert.equal(gh.branches.count, 2);
});

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
});
