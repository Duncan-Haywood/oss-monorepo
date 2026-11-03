import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  areaOf, attribute, dailyByTrack, forecast, fromAllocation, mentioned, periods, portfolioOf, prNumber, subjectPrefix, tally,
} from './allocation.mjs';
import { allocationSection, nextSection } from './render-allocation.mjs';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const known = { ventures: new Set(['chant-forge', 'wall-framing-takeoff']), research: new Set(['civ-levers']) };

test('prNumber reads numbers, #N and pull URLs', () => {
  assert.equal(prNumber(12884), 12884);
  assert.equal(prNumber('#12'), 12);
  assert.equal(prNumber('https://github.com/o/r/pull/8569'), 8569);
  assert.equal(prNumber(''), null);
  assert.equal(prNumber(null), null);
  assert.equal(prNumber('https://github.com/o/r/pull/12/files'), null);
});

test('subjectPrefix takes the project before the colon', () => {
  assert.equal(subjectPrefix('chant-forge: --lrc timed lyrics, with post (#12884)'), 'chant-forge');
  assert.equal(subjectPrefix('research/civ-levers: Axelrod culture (#12883)'), 'research/civ-levers');
  assert.equal(subjectPrefix('Adopt stranded branch x: y'), null);
  assert.equal(subjectPrefix('perf(ci): faster'), 'perf');
});

test('areaOf resolves bare slugs only when the directory exists', () => {
  assert.equal(areaOf('chant-forge', known), 'ventures/chant-forge');
  assert.equal(areaOf('civ-levers', known), 'research/civ-levers');
  assert.equal(areaOf('ventures/anything/sub', known), 'ventures/anything');
  assert.equal(areaOf('platform/pages', known), 'platform/pages');
  assert.equal(areaOf('Adopt stranded branch', known), null);
  assert.equal(portfolioOf('ventures/x'), 'products');
  assert.equal(portfolioOf('research/x'), 'research');
  assert.equal(portfolioOf('polish'), 'platform');
  assert.equal(portfolioOf(null), 'unattributed');
});

test('mentioned picks the most named existing project directory', () => {
  assert.equal(mentioned({ task: 'see ventures/chant-forge and research/civ-levers', notes: 'research/civ-levers again' }, known), 'research/civ-levers');
  assert.equal(mentioned({ notes: 'ventures/not-a-dir' }, known), null);
});

test('attribute prefers the record, then the merge subject, then a mention', () => {
  const byPr = new Map([[5, 'wall-framing-takeoff: braces (#5)']]);
  const rows = attribute([
    { date: '2026-11-03', track: 'ventures', projects: ['chant-forge'], pr: 5 },
    { date: '2026-11-03', track: 'ventures', projects: [], pr: 'https://x/pull/5' },
    { date: '2026-11-02', track: 'research', pr: 99, goal: 'research/civ-levers lattice' },
    { date: '2026-11-01', track: 'process', pr: null },
  ], { byPr, known });
  assert.deepEqual(rows.map((r) => [r.areas, r.via]), [
    [['ventures/chant-forge'], 'record'],
    [['ventures/wall-framing-takeoff'], 'merge'],
    [['research/civ-levers'], 'mention'],
    [[], null],
  ]);
});

test('tally splits a two-project run and counts the unattributed apart', () => {
  const rows = [
    { date: '2026-11-03', track: 'ventures', areas: ['ventures/a', 'research/b'], via: 'record' },
    { date: '2026-11-03', track: 'process', areas: [], via: null },
    { date: '2026-10-01', track: 'ventures', areas: ['ventures/a'], via: 'merge' },
  ];
  const today = tally(rows, '2026-11-03');
  assert.equal(today.runs, 2);
  assert.equal(today.attributed, 1);
  assert.deepEqual(today.by_project['ventures/a'], { runs: 0.5, share: 0.25 });
  assert.equal(today.by_portfolio.unattributed.runs, 1);
  assert.equal(tally(rows, null).by_track.ventures.runs, 2);
  const ps = periods(NOW);
  assert.deepEqual(ps.map((p) => p.from), ['2026-11-03', '2026-10-28', '2026-10-05', null]);
});

test('dailyByTrack folds minor tracks into other', () => {
  const d = dailyByTrack([{ date: '2026-11-03', track: 'perf' }, { date: '2026-11-03', track: 'ventures' }, { date: '2026-01-01', track: 'ventures' }], NOW, 3);
  assert.deepEqual(Object.keys(d), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.equal(d['2026-11-03'].other, 1);
  assert.equal(d['2026-11-03'].ventures, 1);
});

test('forecast uses live weights, drops expired tracks and review, compares with the last 7 days', () => {
  const rows = [];
  for (let i = 1; i <= 7; i += 1) {
    const date = new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
    for (let k = 0; k < 7; k += 1) rows.push({ date, track: 'ventures', areas: [] });
    for (let k = 0; k < 3; k += 1) rows.push({ date, track: 'research', areas: [] });
  }
  rows.push({ date: '2026-10-20', track: 'review', areas: [] });
  const routing = { review_every: 40, tracks: {
    ventures: { weight: 0.5 }, research: { weight: 0.5 }, polish: { weight: 0.2, until: '2026-11-01' }, review: { weight: 0 },
  } };
  const f = forecast({ routing, rows, now: NOW, lanes: null });
  assert.equal(f.runs_per_day, 10);
  const v = f.tracks.find((t) => t.track === 'ventures');
  assert.equal(v.planned_share, 0.5);
  assert.equal(v.expected_next_24h, 5);
  assert.equal(v.gap, 0.2);
  assert.ok(!f.tracks.some((t) => t.track === 'polish' || t.track === 'review'));
  assert.equal(f.review.due, true);
  assert.equal(forecast({ routing: null, rows, now: NOW }).available, false);
});

test('fromAllocation reads a repo end to end and the sections render', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'alloc-'));
  for (const d of ['prompts/runs', 'ventures/chant-forge', 'research/civ-levers', 'portfolio/requests']) mkdirSync(path.join(root, d), { recursive: true });
  writeFileSync(path.join(root, 'prompts/routing.json'), JSON.stringify({ review_every: 40, tracks: { ventures: { weight: 0.6 }, research: { weight: 0.4 } } }));
  writeFileSync(path.join(root, 'prompts/runs/a.json'), JSON.stringify({ date: '2026-11-02', track: 'ventures', projects: ['chant-forge'] }));
  writeFileSync(path.join(root, 'prompts/runs/b.json'), JSON.stringify({ date: '2026-11-03', track: 'research', notes: 'research/civ-levers L=80' }));
  writeFileSync(path.join(root, 'prompts/runs/m.json'), JSON.stringify({ date: '2026-11-03', track: 'research', source: 'upstream' }));
  writeFileSync(path.join(root, 'prompts/runs/future.json'), JSON.stringify({ date: '2026-11-09', track: 'ventures' }));
  writeFileSync(path.join(root, 'portfolio/requests/requests.json'), JSON.stringify({ requests: [{ id: 'R-1', title: 'Chants', status: 'building', project: 'ventures/chant-forge', next: 'More modes', received: '2026-11-01' }] }));
  writeFileSync(path.join(root, 'portfolio/flagships.yaml'), 'flagships:\n  - venture: chant-forge\n    why: x\n    next: >-\n      Lyrics\n');
  writeFileSync(path.join(root, 'research/PROGRAMMES.md'), '## Open programmes\n\n| P | Q | B | V |\n|---|---|---|---|\n| [`civ-levers`](civ-levers/PROPOSAL.md) | Culture? | x | PRE |\n');
  const a = fromAllocation(root, { now: NOW });
  assert.equal(a.available, true);
  const all = a.periods.find((p) => p.key === 'all');
  assert.equal(all.runs, 2, 'mirrored and future-dated records are left out');
  assert.equal(all.attributed, 2);
  assert.deepEqual(a.next.lanes.product.map((x) => x.lane), ['Request R-1 (building)', 'Flagship 1']);
  assert.equal(a.next.lanes.research[0].runs_7d, 1);
  const html = allocationSection(a) + nextSection(a.next);
  assert.match(html, /ventures\/chant-forge/);
  assert.match(html, /Flagship 1/);
  assert.doesNotMatch(html, /undefined|NaN/);
});
