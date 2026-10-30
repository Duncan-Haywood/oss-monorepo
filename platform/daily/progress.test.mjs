import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { frontMatter, previousEdition, progressFacts, readFlagships, renderFacts, windowOf } from './progress.mjs';

const merge = (day, hour, title, area, extra = {}) => ({
  sha: `${day}${hour}`.replace(/\D/g, '').padEnd(12, '0'),
  at: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`),
  title,
  pr: extra.pr ?? null,
  detail: null,
  agent: 'Claude Sonnet 5.5',
  area,
  lines_added: extra.add ?? 10,
  lines_removed: 0,
  added_files: extra.added ?? [],
  revert: /^Revert/.test(title),
  fix_forward: false,
});

test('windows end on the given day and span the cadence', () => {
  assert.deepEqual(windowOf('daily', '2026-10-27'), { days: 1, tag: 'daily-progress', label: 'Daily', cadence: 'daily', first: '2026-10-27', last: '2026-10-27' });
  assert.equal(windowOf('3day', '2026-10-27').first, '2026-10-25');
  assert.equal(windowOf('weekly', '2026-11-02').first, '2026-10-27');
  assert.throws(() => windowOf('monthly', '2026-10-27'), /unknown cadence/);
});

test('flagships are read in file order', () => {
  assert.deepEqual(readFlagships('flagships:\n  # note\n  - venture: ai-bookkeeper\n    why: x\n  - venture: wall-framing-takeoff\n'), ['ai-bookkeeper', 'wall-framing-takeoff']);
});

test('front matter tags parse from a list', () => {
  const fm = frontMatter('---\ntitle: "A post"\ndate: 2026-10-27\ntags: [progress-report, daily-progress]\n---\n\nbody');
  assert.equal(fm.title, 'A post');
  assert.deepEqual(fm.tags, ['progress-report', 'daily-progress']);
});

test('the previous edition is the newest post with the cadence tag', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'progress-'));
  const posts = path.join(dir, 'posts');
  mkdirSync(posts);
  writeFileSync(path.join(posts, '2026-10-25-a.md'), '---\ntitle: A\ndate: 2026-10-25\ntags: [daily-progress]\n---\n');
  writeFileSync(path.join(posts, '2026-10-26-b.md'), '---\ntitle: B\ndate: 2026-10-26\ntags: [weekly-progress]\n---\n');
  writeFileSync(path.join(posts, '2026-10-27-c.md'), '---\ntitle: C\ndate: 2026-10-27\ntags: [fiction]\n---\n');
  assert.equal(previousEdition(posts, 'daily-progress').title, 'A');
  assert.equal(previousEdition(posts, 'weekly-progress').date, '2026-10-26');
  assert.equal(previousEdition(posts, 'three-day-progress'), null);
});

test('facts count only the window and rank areas and flagships', () => {
  const product = (name) => ({ kind: 'product', name });
  const merges = [
    merge('2026-10-24', 23, 'too early', product('ai-bookkeeper')),
    merge('2026-10-25', 1, 'ai-bookkeeper: small', product('ai-bookkeeper'), { pr: 1, add: 5 }),
    merge('2026-10-26', 2, 'ai-bookkeeper: big', product('ai-bookkeeper'), { pr: 2, add: 500 }),
    merge('2026-10-27', 3, 'research/x: open', { kind: 'research', name: 'x' }, { pr: 3, added: ['research/x/README.md', 'docs/posts/2026-10-27-x.md'] }),
    merge('2026-10-27', 4, 'Revert "ai-bookkeeper: big"', product('ai-bookkeeper'), { pr: 4 }),
  ];
  const runs = new Map([['2026-10-26', [{ track: 'venture', outcome: 'shipped' }]], ['2026-10-20', [{ track: 'venture', outcome: 'shipped' }]]]);
  const f = progressFacts(windowOf('3day', '2026-10-27'), merges, runs, {
    flagships: ['ai-bookkeeper', 'photo-editing'],
    posts: [{ slug: '2026-10-27-x', tags: ['research'] }],
  });
  assert.equal(f.merges, 4);
  assert.deepEqual(f.merges_per_day, { '2026-10-25': 1, '2026-10-26': 1, '2026-10-27': 2 });
  assert.equal(f.areas[0].name, 'ai-bookkeeper');
  assert.equal(f.areas[0].flagship_rank, 1);
  assert.equal(f.areas[0].top[0].ref, '#2', 'biggest merge first');
  assert.deepEqual(f.flagships.map((x) => [x.name, x.merges]), [['ai-bookkeeper', 3], ['photo-editing', 0]]);
  assert.deepEqual(f.new_research, ['x']);
  assert.equal(f.new_posts, 1);
  assert.deepEqual(f.new_post_tags, [['research', 1]]);
  assert.deepEqual(f.reverts.map((r) => r.ref), ['#4']);
  assert.equal(f.runs.runs, 1);
  assert.equal(f.runs.api_usd, null, 'unmeasured cost stays unmeasured');

  const md = renderFacts(f);
  assert.match(md, /^# Three-day progress facts, 2026-10-25 to 2026-10-27 \(UTC\)/);
  assert.match(md, /`three-day-progress`/);
  assert.match(md, /API-equivalent cost: not recorded from 0 of 1 records/);
  assert.match(md, /2\. \*\*photo-editing\*\*: 0 merges/);
});
