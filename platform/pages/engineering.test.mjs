import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  areaOf,
  buildEngineeringPage,
  describeRun,
  esc,
  prKey,
  prState,
  renderEngineeringPage,
  subjectsOf,
  summarise,
  trackOf,
} from './engineering.mjs';

const TODAY = '2026-10-16';

function data(overrides = {}) {
  return {
    head: 'abcdef1234567890',
    shallow: false,
    runs: [],
    github: {},
    merges: [],
    decisions: [],
    backlog: [],
    launched: {},
    ventures: { total: 0, stages: {} },
    research: { themes: [], logs: [] },
    ...overrides,
  };
}

const run = (date, extra = {}) => ({ date, track: 'ventures', outcome: 'success', task: 't', ...extra });

test('areas and subjects are read from the paths a commit changed', () => {
  assert.equal(areaOf('ventures/foo/index.html'), 'ventures');
  assert.equal(areaOf('.github/workflows/x.yml'), 'ci');
  assert.equal(areaOf('README.md'), 'root');
  assert.equal(areaOf('infra/main.tf'), 'other');
  assert.deepEqual(
    subjectsOf(['ventures/foo/a', 'ventures/foo/b', 'research/bar/x.py', 'research/_homepage/build.py']).sort(),
    ['research/bar', 'ventures/foo'],
  );
});

test('a PR URL keys github.json the way derive.py does, lower-cased', () => {
  const url = 'https://github.com/Duncan-Haywood/oss-monorepo/pull/7245';
  assert.equal(prKey(url).key, 'duncan-haywood/oss-monorepo#7245');
  assert.equal(prKey(url).url, url);
  assert.equal(prKey(null), null);
  const github = { 'duncan-haywood/oss-monorepo#7245': { merged: true, state: 'closed' } };
  assert.equal(prState(github, url), 'merged');
  assert.equal(prState({ 'duncan-haywood/oss-monorepo#7245': { merged: false, state: 'closed' } }, url), 'closed');
  assert.equal(prState({}, url), null);
});

test('an unknown track is filed under other rather than dropped', () => {
  assert.equal(trackOf({ track: 'something-new' }), 'other');
  assert.equal(trackOf({ track: 'research' }), 'research');
});

test('a record with no task is described by its PR title on main, then its projects', () => {
  const pr = 'https://github.com/Duncan-Haywood/oss-monorepo/pull/12';
  assert.equal(describeRun({ task: 'do it', pr }), 'do it');
  assert.equal(describeRun({ pr }, new Map([[12, 'ventures/x: add y']])), 'ventures/x: add y');
  assert.equal(describeRun({ projects: ['churn-radar'] }), 'Worked on churn-radar');
  assert.equal(describeRun({}), '');
});

test('weekly figures count the last seven days, and compare only when records cover both weeks', () => {
  const runs = [run('2026-10-16'), run('2026-10-10'), run('2026-10-09'), run('2026-10-02')];
  const m = summarise(data({ runs }), TODAY);
  assert.equal(m.kpis.runsWeek, 2);
  assert.equal(m.kpis.runsPrior, 1);

  // Records that began three days ago: last week was not quiet, it was unrecorded.
  const young = summarise(data({ runs: [run('2026-10-14'), run('2026-10-16')] }), TODAY);
  assert.equal(young.kpis.runsPrior, null);
  assert.equal(young.firstRun, '2026-10-14');
  assert.equal(young.daily.length, 7);
});

test('spend sums only what sessions measured, and says how many measured', () => {
  const runs = [
    run('2026-10-16', { usage: { totals: { api_equivalent_usd: 2.5 } } }),
    run('2026-10-15', { cost_usd: 1 }),
    run('2026-10-15'),
  ];
  const m = summarise(data({ runs }), TODAY);
  assert.equal(m.kpis.spendWeek, 3.5);
  assert.equal(m.kpis.spendMeasuredWeek, 2);
});

test('a shallow history makes the merge count a floor, and no history makes it unavailable', () => {
  const merges = [
    { sha: 'a', date: '2026-10-16', pr: 2, title: 'two', files: ['ventures/a/x'] },
    { sha: 'b', date: '2026-10-15', pr: 1, title: 'one', files: ['platform/p/x', 'ventures/a/y'] },
  ];
  const shallow = summarise(data({ merges, shallow: true }), TODAY);
  assert.equal(shallow.kpis.mergedWeek, 2);
  assert.equal(shallow.kpis.mergedWeekIsFloor, true);
  assert.equal(shallow.kpis.mergedPrior, null);
  assert.deepEqual(Object.fromEntries(shallow.byArea), { ventures: 2, platform: 1 });
  assert.deepEqual(shallow.hotSubjects, [['ventures/a', 2]]);

  const full = summarise(data({ merges }), TODAY);
  assert.equal(full.kpis.mergedWeekIsFloor, false);
  assert.equal(full.kpis.mergedPrior, 0);

  const none = summarise(data({ merges: null }), TODAY);
  assert.equal(none.kpis.mergedWeek, null);
  assert.match(renderEngineeringPage(none), /not available in this build/);
});

test('the page escapes what run records say and carries noindex and the disclaimer', () => {
  const runs = [run('2026-10-16', { task: '<script>alert(1)</script> fix `x`' })];
  const html = renderEngineeringPage(summarise(data({ runs }), TODAY), { baseUrl: 'https://example.invalid/site/' });
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; fix <code>x<\/code>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /no warranty/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/site\/engineering\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example\.invalid\/site\/social-card\.png">/);
  assert.equal(esc('"&'), '&quot;&amp;');
});

test('decisions carry their age, and the backlog lists open items best effect-for-cost first', () => {
  const m = summarise(
    data({
      decisions: [{ id: 'payout-rail', opened: '2026-08-19', gates: 'revenue', action: 'Decide.' }],
      backlog: [
        { id: 'P1', title: 'cheap', effect: 2, cost: 1, status: 'open' },
        { id: 'P2', title: 'dear', effect: 2, cost: 4, status: 'open' },
        { id: 'P3', title: 'gone', effect: 9, cost: 1, status: 'done' },
      ],
    }),
    TODAY,
  );
  assert.equal(m.decisions[0].age, 58);
  assert.equal(m.kpis.oldestDecision, 58);
  assert.deepEqual(m.backlog.map((b) => b.id), ['P1', 'P2']);
});

test('the real repository builds a page', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'engineering-'));
  const model = await buildEngineeringPage(out, '', { today: TODAY });
  const html = await fs.readFile(path.join(out, 'engineering', 'index.html'), 'utf8');
  assert.match(html, /<h1>Engineering status<\/h1>/);
  assert.ok(model.ventures.total > 0);
  assert.ok(model.recentRuns.length > 0);
});
