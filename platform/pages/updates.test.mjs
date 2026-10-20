import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeResearch,
  CHANGELOG_PATH,
  UPDATES_PATH,
  byDay,
  changelogEntries,
  isListable,
  kindOf,
  parseDirection,
  parseMission,
  renderChangelog,
  renderChangelogFeed,
  renderUpdates,
  summarise,
} from './updates.mjs';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const BASE = 'https://example.test/site/';

const merge = (date, title, files, pr = null) => ({ sha: `${date}${title}`.replace(/\W/g, '').padEnd(40, '0'), date, pr, title, files });

const MERGES = [
  merge('2026-10-19', 'roofing: add pitch table', ['ventures/roofing-calc/index.html', 'platform/pages/build.mjs'], 12),
  merge('2026-10-19', 'research/kws: a result', ['research/kws/README.md'], 11),
  merge('2026-10-18', "Merge branch 'main' into x", ['ventures/roofing-calc/a.js']),
  merge('2026-10-18', 'site: better titles', ['platform/pages/site-nav.mjs'], 10),
  merge('2026-10-17', 'prompts: tighten the router <b>', ['prompts/promptctl.py'], 9),
  merge('2026-09-01', 'too old to list', ['ventures/roofing-calc/x'], 1),
];

const data = (over = {}) => {
  const published = new Set(['roofing-calc']);
  const researchSlugs = new Set(['kws']);
  const titles = new Map([['roofing-calc', 'Roofing Calculator']]);
  return {
    now: NOW,
    shallow: false,
    entries: changelogEntries(MERGES, { published, researchSlugs, titles, now: NOW }),
    researchLog: [{ slug: 'kws', date: '2026-10-18', title: 'Baseline <script> run' }],
    researchSlugs,
    launched: { 'roofing-calc': '2026-10-15', 'not-published': '2026-10-16' },
    published,
    titles,
    runs: [{ date: '2026-10-18', cost_usd: 1.5 }, { date: '2026-10-17', cost_usd: null }],
    direction: [{ kind: 'Direction', title: 'local models', set: '', summary: 'Every AI feature takes a local model.', leads: [] }],
    backlog: [{ id: 'P001', file: 'P001-x.json', title: 'Make runs cheaper', status: 'open' }, { id: 'P002', file: 'P002-y.json', status: 'done' }],
    decisions: [{ id: 'payout-rail', gates: 'revenue' }],
    ...over,
  };
};

test('a merge is filed under the area a visitor cares about most', () => {
  assert.equal(kindOf(['platform/pages/build.mjs', 'ventures/a/index.html']), 'tools');
  assert.equal(kindOf(['research/kws/README.md', 'prompts/x.md']), 'research');
  assert.equal(kindOf(['research/_homepage/build.py']), 'site');
  assert.equal(kindOf(['docs/posts/2026-10-16-x.md']), 'site');
  assert.equal(kindOf(['prompts/runs/x.json', '.github/workflows/a.yml']), 'platform');
  assert.equal(kindOf([]), 'platform');
});

test('main merged into a branch is not a change worth listing', () => {
  assert.equal(isListable({ title: "Merge branch 'main' into feature" }), false);
  assert.equal(isListable({ title: 'Merge remote-tracking branch origin/main' }), false);
  assert.equal(isListable({ title: 'roofing: add pitch table' }), true);
});

test('changelog entries: windowed, filed, and linked to the pages they changed', () => {
  const entries = data().entries;
  assert.deepEqual(entries.map((e) => e.pr), [12, 11, 10, 9]);
  assert.deepEqual(entries.map((e) => e.kind), ['tools', 'research', 'site', 'platform']);
  assert.deepEqual(entries[0].pages, [{ href: 'roofing-calc/', label: 'Roofing Calculator', kind: 'tool' }]);
  assert.deepEqual(entries[1].pages, [{ href: 'research/kws/', label: 'kws', kind: 'research' }]);
  assert.deepEqual(entries[1].projects, ['kws']);
  // An unpublished venture gets no link: it would be a 404.
  const unpublished = changelogEntries(MERGES, { now: NOW });
  assert.deepEqual(unpublished[0].pages, []);
  assert.equal(changelogEntries(null), null);
});

test('byDay keeps newest first', () => {
  assert.deepEqual(byDay(data().entries).map(([d, items]) => [d, items.length]), [['2026-10-19', 2], ['2026-10-18', 1], ['2026-10-17', 1]]);
});

test('summary counts only what was published, and says when cost is unmeasured', () => {
  const s = summarise(data());
  assert.equal(s.merges, 4);
  assert.deepEqual(s.launchedWeek, [['roofing-calc', '2026-10-15']]);
  assert.equal(s.runsWeek, 2);
  assert.equal(s.costed, 1);
  assert.equal(s.researchWeek, 1);
  assert.equal(s.spend, 1.5);
  assert.equal(summarise(data({ entries: null })).merges, null);
});

test('a shallow history that ends inside the window says so', () => {
  assert.equal(summarise(data()).truncated, false);
  assert.equal(summarise(data({ shallow: true })).truncated, true);
  assert.match(renderChangelog(data({ shallow: true })), /could read history back to/);
});

test('the changelog page: escaped, filterable, linked, disclaimed, canonical', () => {
  const html = renderChangelog(data(), { baseUrl: BASE });
  assert.ok(html.includes(`<link rel="canonical" href="${BASE}${CHANGELOG_PATH}">`));
  assert.ok(html.includes('data-pfs-head'), 'carries the site header');
  assert.match(html, /aria-current="page">Updates</);
  assert.ok(html.includes('tighten the router &lt;b&gt;'), 'a merge title cannot inject markup');
  assert.ok(!html.includes('router <b>'));
  assert.ok(html.includes('href="../roofing-calc/"'));
  assert.ok(html.includes('https://github.com/Duncan-Haywood/oss-monorepo/pull/12'));
  assert.ok(html.includes('data-filter="research"'));
  assert.match(html, /no warranty/i);
  assert.ok(!html.includes('too old to list'));
  assert.ok(!html.includes('Merge branch'));
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(ld['@type'], 'CollectionPage');
  assert.equal(ld.dateModified, '2026-10-19');
});

test('without history, the changelog says so rather than showing an empty month', () => {
  const html = renderChangelog(data({ entries: null }));
  assert.match(html, /Merge history is not available in this build/);
});

test('the feed links product changes to the live page and everything else to its PR', () => {
  const xml = renderChangelogFeed(data(), { baseUrl: BASE });
  assert.ok(xml.includes(`<link href="${BASE}roofing-calc/"/>`));
  assert.ok(xml.includes('<id>https://github.com/Duncan-Haywood/oss-monorepo/pull/12</id>'));
  assert.ok(xml.includes('<link href="https://github.com/Duncan-Haywood/oss-monorepo/pull/9"/>'));
  assert.ok(xml.includes('&lt;b&gt;'));
  assert.equal((xml.match(/<entry>/g) || []).length, 4);
});

test('the updates page: every section, no third-party request, escaped research log', () => {
  const html = renderUpdates(data(), { baseUrl: BASE });
  assert.ok(html.includes(`<link rel="canonical" href="${BASE}${UPDATES_PATH}">`));
  for (const id of ['week', 'shipped', 'research-log', 'in-progress', 'direction', 'process']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('Baseline &lt;script&gt; run'));
  assert.ok(html.includes('Make runs cheaper'));
  assert.ok(html.includes('payout-rail'));
  assert.ok(html.includes('Every AI feature takes a local model.'));
  assert.ok(html.includes('href="../changelog/"'));
  assert.ok(html.includes('data-src="../dev/stats.json"'), 'open PRs come from this site');
  // The only fetch on the page is same-origin.
  const fetches = [...html.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['box.dataset.src']);
  assert.match(html, /\$1\.50/);
  assert.match(html, /no warranty/i);
});

test('parseDirection summarises goals.md and skips verbatim quotes', () => {
  const src = `# Goals

## Mission

Not a goal section.

## Long-term goal: a public face for everything

Set by the owner on 2026-10-15. Most things should have a page.

**Quality, not just coverage** (the owner, 2026-10-16): "i want it good."

## Direction: local models as an option beside API keys

Set by the owner on 2026-10-18: "for the majority of applications, local."

Every AI feature that takes a key also takes a local model.

## Judgment over rules

Ignored.
`;
  const d = parseDirection(src);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], {
    kind: 'Long-term goal',
    title: 'a public face for everything',
    set: '2026-10-15',
    summary: 'Most things should have a page.',
    leads: [{ text: 'Quality, not just coverage', date: '2026-10-16' }],
  });
  assert.equal(d[1].set, '2026-10-18');
  assert.equal(d[1].summary, 'Every AI feature that takes a key also takes a local model.');
  assert.equal(parseDirection(null), null);
});

test('parseMission takes each pillar and its first sentence', () => {
  const src = `## Mission

One repository:

- **Ventures** (\`ventures/\`): free products. More detail here.

  **The business model**: an indented aside.
- **Research**: open studies.

## Next
`;
  assert.deepEqual(parseMission(src), [
    { name: 'Ventures', where: '`ventures/`', text: 'free products.' },
    { name: 'Research', where: '', text: 'open studies.' },
  ]);
  assert.deepEqual(parseMission(''), []);
});

test('active research: one row per project, newest change first, counted', () => {
  const rows = activeResearch([
    { date: '2026-10-19', title: 'kws: newest', projects: ['kws'] },
    { date: '2026-10-18', title: 'two at once', projects: ['kws', 'gyro'] },
    { date: '2026-10-17', title: 'site', projects: [] },
  ]);
  assert.deepEqual(rows.map((r) => [r.slug, r.changes, r.latest.title]), [['kws', 2, 'kws: newest'], ['gyro', 1, 'two at once']]);
  assert.deepEqual(activeResearch(null), []);
});

test('the week window: launches count from the day after weekAgo through today, no later', () => {
  const launched = {
    'roofing-calc': '2026-10-19',
    a: '2026-10-13',
    b: '2026-10-12',
    c: '2026-10-20',
  };
  const published = new Set(['roofing-calc', 'a', 'b', 'c']);
  const s = summarise(data({ launched, published }));
  assert.equal(s.weekAgo, '2026-10-12');
  assert.deepEqual(s.launchedWeek.map(([slug]) => slug), ['roofing-calc', 'a']);
});

test('the updates page lists at most six owner decisions and the live PR meta joins by string', () => {
  const decisions = Array.from({ length: 7 }, (_, i) => ({ id: `decision-${i}`, gates: '' }));
  const html = renderUpdates(data({ decisions }), { baseUrl: BASE });
  assert.ok(html.includes('decision-5'));
  assert.ok(!html.includes('decision-6'), 'the seventh decision is cut');
  assert.ok(html.includes("' · #' + Number(pr.number) + (pr.draft"), 'PR number is concatenated, not subtracted');
});
