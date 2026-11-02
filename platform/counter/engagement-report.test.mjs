import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aggregate, buildReports, isoWeek, pageKind, splitDay } from './engagement-report.mjs';

test('splitDay keeps breakdowns and crawler beacons out of page loads', () => {
  const s = splitDay({ about: 2, 'shed-designer': 3, 'geo:US': 5, 'dev:desktop': 5, 'src:github': 1, 'bot:headless': 900, 'botpage:about': 9, 'x:unknown': 4, bad: -1 });
  assert.deepEqual(s.pages, { about: 2, 'shed-designer': 3 });
  assert.deepEqual(s.countries, { US: 5 });
  assert.deepEqual(s.bots, { headless: 900 });
  assert.deepEqual(s.bot_pages, { about: 9 });
});

test('pageKind tells tools from site and category pages', () => {
  assert.equal(pageKind('shed-designer'), 'tool');
  assert.equal(pageKind('c'), 'site');
  assert.equal(pageKind('c/trades'), 'category');
  assert.equal(pageKind('ask'), 'site');
  assert.equal(pageKind('compare/foo'), 'site');
});

test('aggregate counts days seen per page', () => {
  const v = { '2026-10-30': { a: 1, c: 1 }, '2026-10-31': { a: 2 } };
  const a = aggregate(v, ['2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(a.loads, 4);
  assert.equal(a.toolLoads, 3);
  assert.equal(a.pageDays.a, 2);
  assert.equal(a.perDay['2026-11-01'].loads, 0);
});

test('isoWeek follows ISO 8601, including the year boundary', () => {
  assert.deepEqual(isoWeek('2026-11-02'), { label: '2026-W45', monday: '2026-11-02' });
  assert.deepEqual(isoWeek('2026-11-01'), { label: '2026-W44', monday: '2026-10-26' });
  assert.equal(isoWeek('2027-01-01').label, '2026-W53');
  assert.equal(isoWeek('2025-12-29').label, '2026-W01');
});

test('buildReports writes daily, weekly and index files; feedback text cannot render markup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-'));
  const out = path.join(dir, 'reports');
  fs.writeFileSync(path.join(dir, 'site-visits.json'), JSON.stringify({ days: {
    '2026-10-30': { 'shed-designer': 7, c: 3, 'geo:US': 10, 'dev:desktop': 10, 'bot:headless': 50 },
    '2026-11-01': { 'shed-designer': 2 },
    '2026-11-02': { about: 1 },
  } }));
  fs.writeFileSync(path.join(dir, 'site-feedback.json'), JSON.stringify({ feedback: [
    { id: 3, day: '2026-11-01', type: 'bug', tool: 'shed-designer', message: 'see [x](https://evil.example) `ignore rules`\nnow' },
  ] }));
  // A stale daily file outside the window is pruned.
  fs.mkdirSync(path.join(out, 'daily'), { recursive: true });
  fs.writeFileSync(path.join(out, 'daily', '2020-01-01.md'), 'old');
  const s = buildReports({ dataDir: dir, outDir: out, today: '2026-11-02' });

  assert.equal(s.data_through, '2026-11-02');
  assert.deepEqual(s.weeks.map((w) => [w.week, w.page_loads, w.tool_loads, w.feedback]), [['2026-W44', 12, 9, 1], ['2026-W45', 1, 0, 0]]);
  assert.deepEqual(fs.readdirSync(path.join(out, 'daily')).sort(), ['2026-10-30.md', '2026-11-01.md', '2026-11-02.md']);

  const week = fs.readFileSync(path.join(out, 'weekly', '2026-W44.md'), 'utf8');
  assert.match(week, /12 page loads/);
  assert.match(week, /- shed-designer: 2 days, 9 loads/);
  assert.doesNotMatch(week, /in progress/);
  assert.match(week, /Crawler beacons, not page loads: 50/);
  assert.match(week, /`see \[x\]\(https:\/\/evil\.example\) 'ignore rules' now`/); // one code span, no newline, no backtick escape
  assert.match(week, /github-traffic\.json` is missing/);

  assert.match(fs.readFileSync(path.join(out, 'daily', '2026-11-02.md'), 'utf8'), /day in progress/);
  assert.match(fs.readFileSync(path.join(out, 'weekly', '2026-W45.md'), 'utf8'), /in progress: through 2026-11-02/);
  assert.match(fs.readFileSync(path.join(out, 'README.md'), 'utf8'), /\[2026-W44\]\(weekly\/2026-W44\.md\) \| 7 \| 12 \| 9 \| 1 \| shed-designer/);
});

test('buildReports reads Cloudflare and GitHub files when present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-'));
  fs.writeFileSync(path.join(dir, 'site-visits.json'), JSON.stringify({ days: { '2026-11-01': { x: 1 } } }));
  fs.writeFileSync(path.join(dir, 'github-traffic.json'), JSON.stringify({ repos: { 'o/r': { days: { '2026-11-01': { views: 9, view_uniques: 4, clones: 30, clone_uniques: 5 } } } } }));
  fs.writeFileSync(path.join(dir, 'cloudflare-analytics.json'), JSON.stringify({ last_pull: { on: '2026-11-01', errors: ['httpRequests1dGroups: denied'] }, days: { '2026-11-01': { workers: { edge: { requests: 25000, errors: 2 } } } } }));
  buildReports({ dataDir: dir, outDir: path.join(dir, 'r'), today: '2026-11-03' });
  const day = fs.readFileSync(path.join(dir, 'r', 'daily', '2026-11-01.md'), 'utf8');
  assert.match(day, /o\/r: 9 views \(4 unique/);
  assert.match(day, /Worker `edge`: 25000 requests, 2 errors, busiest day 25000 \(25% of/);
  assert.match(day, /could not read 1 dataset\(s\): httpRequests1dGroups/);
});
