import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildQueue, clip, loadQueue, orderRequests, parseFlagships, parseIdeas, parseProgrammes, progressFor, PROGRESS_DAYS, QUEUE_PATH, renderQueue, requestDir } from './queue.mjs';

const IDEAS = `# Ideas inbox

Intro text.

## New

<!-- Write below this line. -->

- a tool for
  roofers

1. second idea

## Picked up

- 2026-10-01: old idea (pr)
`;

const FLAGSHIPS = `# comment
flagships:
  # a comment inside
  - venture: alpha-tool
    why: >-
      First reason,
      continued.
    next: >-
      Do the
      next thing.
  - venture: beta-tool
    why: short
    next: >-
      Beta milestone.
`;

const PROGRAMMES = `# Programmes

## Open programmes

| Programme | Question | Builds on | Target venue |
|---|---|---|---|
| [\`sim-a\`](sim-a/PROPOSAL.md) | How few trials? | the twins | CoRL |
| [\`sim-b\`](sim-b/PROPOSAL.md) | Which hull? | track 23 | OCEANS |

## Closed

| [\`old\`](old/PROPOSAL.md) | done | x | y |
`;

const REQUESTS = [
  { id: 'R-0001', title: 'Owner project', source: 'owner', status: 'building', received: '2026-10-21' },
  { id: 'R-0002', title: 'Newer received', source: 'form', status: 'received', received: '2026-10-30' },
  { id: 'R-0003', title: 'Older received', source: 'issue', status: 'received', received: '2026-10-25' },
  { id: 'R-0004', title: 'Accepted one', source: 'issue', status: 'accepted', received: '2026-10-29' },
  { id: 'R-0005', title: 'Being built', source: 'form', status: 'building', received: '2026-10-31', next: 'Prove it on real data.' },
  { id: 'R-0006', title: 'Done', source: 'form', status: 'shipped' },
  { id: 'R-0007', title: 'No', source: 'form', status: 'declined' },
];

test('parseIdeas reads only the New section, joining wrapped lines and dropping markers and comments', () => {
  assert.deepEqual(parseIdeas(IDEAS), ['a tool for roofers', 'second idea']);
  assert.equal(parseIdeas(null), null);
  assert.equal(parseIdeas('no sections'), null);
});

test('orderRequests follows prompts/ideas.py: building, accepted, received, oldest first; owner entries apart', () => {
  const r = orderRequests(REQUESTS);
  assert.deepEqual(r.outside.map((x) => x.id), ['R-0005', 'R-0004', 'R-0003', 'R-0002']);
  assert.deepEqual(r.owner.map((x) => x.id), ['R-0001']);
  assert.equal(r.shipped, 1);
  assert.equal(r.declined, 1);
  assert.equal(orderRequests(null), null);
});

test('parseFlagships keeps file order and unfolds >- scalars', () => {
  assert.deepEqual(parseFlagships(FLAGSHIPS), [
    { venture: 'alpha-tool', why: 'First reason, continued.', next: 'Do the next thing.' },
    { venture: 'beta-tool', why: 'short', next: 'Beta milestone.' },
  ]);
});

test('parseProgrammes reads only the Open programmes table', () => {
  assert.deepEqual(parseProgrammes(PROGRAMMES), [
    { slug: 'sim-a', question: 'How few trials?', venue: 'CoRL' },
    { slug: 'sim-b', question: 'Which hull?', venue: 'OCEANS' },
  ]);
  assert.equal(parseProgrammes('# nothing'), null);
});

test('clip cuts on a word boundary', () => {
  assert.equal(clip('short'), 'short');
  const out = clip('word '.repeat(100), 50);
  assert.ok(out.length <= 51 && out.endsWith('…'));
});

const DATA = {
  now: Date.parse('2026-11-02T12:00:00Z'),
  published: new Set(['alpha-tool']),
  ideas: ['a tool for roofers'],
  requests: orderRequests(REQUESTS),
  flagships: parseFlagships(FLAGSHIPS),
  programmes: parseProgrammes(PROGRAMMES),
  decisions: [{ id: 'payout-rail', gates: 'revenue' }],
  backlog: [{ id: 'P001', title: 'Open item', status: 'open', file: 'P001-x.json' }, { id: 'P002', status: 'done', file: 'P002.json' }],
};

test('renderQueue shows the lanes in prompt.md order, read-only', () => {
  const html = renderQueue(DATA, { baseUrl: 'https://example.test/' });
  const at = (id) => html.indexOf(`id="${id}"`);
  for (const id of ['security', 'ideas', 'requests', 'flagships', 'research', 'alongside']) assert.ok(at(id) > 0, id);
  assert.ok(at('security') < at('ideas') && at('ideas') < at('requests') && at('requests') < at('flagships') && at('flagships') < at('research') && at('research') < at('alongside'));
  // Requests appear in queue order.
  assert.ok(html.indexOf('Being built') < html.indexOf('Accepted one'));
  assert.ok(html.indexOf('Accepted one') < html.indexOf('Older received'));
  assert.ok(html.indexOf('Older received') < html.indexOf('Newer received'));
  assert.match(html, /href="\.\.\/custom-development\/R-0005\/"/);
  // A published flagship links its page; an unpublished one does not.
  assert.match(html, /href="\.\.\/alpha-tool\/"/);
  assert.doesNotMatch(html, /href="\.\.\/beta-tool\/"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/queue\/">/);
  assert.match(html, /payout-rail/);
  assert.match(html, /Open item/);
  // Read-only: the page's own content has no inputs (the shared header's search box is not ours).
  const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  assert.doesNotMatch(main, /<form|<textarea|<input|contenteditable/);
});

test('a missing source says so instead of rendering an empty queue', () => {
  const html = renderQueue({ ...DATA, ideas: null, requests: null, flagships: null, programmes: null, decisions: null, backlog: null });
  for (const what of ['The ideas inbox', 'The request queue', 'The flagship list', 'The research programme list', 'The decision queue', 'The process backlog']) {
    assert.match(html, new RegExp(`${what} is not available in this build`));
  }
});

test('with no outside requests, the owner projects are shown open', () => {
  const html = renderQueue({ ...DATA, requests: orderRequests(REQUESTS.filter((r) => r.source === 'owner')) });
  assert.match(html, /<details open><summary>1 long-running project the owner asked for/);
  assert.match(html, /No outside requests are open right now/);
});

test('buildQueue writes queue/index.html from a repository tree', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-root-'));
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-out-'));
  await fs.mkdir(path.join(root, 'portfolio', 'requests'), { recursive: true });
  await fs.mkdir(path.join(root, 'research'), { recursive: true });
  await fs.writeFile(path.join(root, 'IDEAS.md'), IDEAS);
  await fs.writeFile(path.join(root, 'portfolio', 'flagships.yaml'), FLAGSHIPS);
  await fs.writeFile(path.join(root, 'portfolio', 'requests', 'requests.json'), JSON.stringify({ requests: REQUESTS }));
  await fs.writeFile(path.join(root, 'research', 'PROGRAMMES.md'), PROGRAMMES);
  const data = await buildQueue(out, '', { root, merges: null });
  assert.equal(data.flagships.length, 2);
  assert.equal(data.decisions, null); // no decision_queue.py in the fixture tree
  const html = await fs.readFile(path.join(out, QUEUE_PATH, 'index.html'), 'utf8');
  assert.match(html, /a tool for roofers/);
});

test('the real repository files parse', () => {
  const d = loadQueue();
  assert.ok(Array.isArray(d.ideas));
  assert.ok(d.flagships.length > 0 && d.flagships.every((f) => f.venture && f.next));
  assert.ok(d.programmes.length > 0);
  assert.ok(d.requests);
});

const MERGES = [
  { sha: 'a1', date: '2026-11-02', pr: 30, title: 'alpha: third slice', files: ['ventures/alpha-tool/src/x.mjs'] },
  { sha: 'a2', date: '2026-11-02', pr: 29, title: 'sim-a: first run', files: ['research/sim-a/LOG.md'] },
  { sha: 'a3', date: '2026-10-31', pr: 28, title: 'alpha: second slice', files: ['ventures/alpha-tool/README.md', 'docs/posts/x.md'] },
  { sha: 'a4', date: '2026-10-30', pr: null, title: "Merge branch 'main' into x", files: ['ventures/alpha-tool/a'] },
  { sha: 'a5', date: '2026-10-01', pr: 20, title: 'alpha: first slice', files: ['ventures/alpha-tool/a'] },
  { sha: 'a6', date: '2026-09-20', pr: 10, title: 'alpha-tools-other: not alpha', files: ['ventures/alpha-tool-other/a'] },
];

test('progressFor counts merges under the folder in the window, by day', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const p = progressFor(MERGES, 'ventures/alpha-tool', { now });
  assert.equal(p.inWindow, 2); // the branch merge and the 2026-10-01 one are out
  assert.equal(p.daily.length, PROGRESS_DAYS);
  assert.equal(p.daily.at(-1), 1);
  assert.equal(p.daily.at(-3), 1);
  assert.equal(p.lastDate, '2026-11-02');
  assert.deepEqual(p.recent.map((m) => m.pr), [30, 28, 20]);
  assert.equal(p.historyFrom, '2026-09-20');
  // A sibling folder that shares the prefix is not counted.
  assert.equal(progressFor(MERGES, 'ventures/alpha-tool-other', { now }).inWindow, 0);
  assert.equal(progressFor(MERGES, 'ventures/beta-tool', { now }).lastDate, null);
  assert.equal(progressFor(null, 'ventures/alpha-tool'), null);
});

test('requestDir reads the project folder a request names', () => {
  assert.equal(requestDir({ project: 'ventures/alpha-tool/' }), 'ventures/alpha-tool');
  assert.equal(requestDir({ project: 'research/sim-a' }), 'research/sim-a');
  assert.equal(requestDir({ project: 'platform/pages' }), null);
  assert.equal(requestDir({}), null);
});

test('renderQueue shows progress per roadmap project and a glance table', () => {
  const reqs = REQUESTS.map((r) => (r.id === 'R-0005' ? { ...r, project: 'ventures/alpha-tool' } : r));
  const html = renderQueue({ ...DATA, requests: orderRequests(reqs), merges: MERGES });
  assert.match(html, /id="glance"/);
  assert.ok(html.indexOf('id="glance"') < html.indexOf('id="security"'));
  // Rows: the request with a project, two flagships, two programmes.
  const table = html.slice(html.indexOf('<table class="glance">'), html.indexOf('</table>'));
  assert.equal((table.match(/<tr>/g) ?? []).length, 6);
  assert.match(table, /alpha-tool<\/a><\/td><td><a href="#flagships">Flagship/);
  assert.match(html, /Progress, last 14 days:/);
  assert.match(html, /2 merges<\/span> <span class="meta">· last change 2026-11-02/);
  assert.match(html, /href="https:\/\/github\.com\/[^"]+\/pull\/30"/);
  assert.match(html, /no merges<\/span>/); // beta-tool
});

test('without merge history the progress says so, never zero', () => {
  const html = renderQueue({ ...DATA, merges: null });
  assert.match(html, /Merge history is not available in this build/);
  assert.match(html, /Progress is not available in this build/);
  assert.doesNotMatch(html, /0 merges/);
  // Old callers that pass no merges get the page as before.
  assert.doesNotMatch(renderQueue(DATA), /id="glance"|Progress, last/);
});
