import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  FEED_MAX_ENTRIES,
  feedUpdatedAt,
  firstCommitDate,
  isIsoDate,
  loadLaunchDates,
  orderForFeed,
  refreshLaunchDates,
} from './launched.mjs';
import { FEED_FILE, discoverSurfaces, renderFeed } from './build.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const surface = (slug, over = {}) => ({
  slug,
  title: `${slug} title`,
  description: `${slug} description`,
  fullDescription: `${slug} full description`,
  ...over,
});

// ---------------------------------------------------------------------------
// The committed data file
// ---------------------------------------------------------------------------

test('every published surface has a launch date committed', async () => {
  // The one invariant that keeps a new tool from silently missing the feed.
  // check.mjs enforces it against a built artifact; this enforces it against
  // the tree, so the failure surfaces in a unit run rather than only after a
  // 23-second build.
  const surfaces = await discoverSurfaces(path.join(REPO_ROOT, 'ventures'));
  const launched = await loadLaunchDates();
  const missing = surfaces.map((s) => s.slug).filter((slug) => !launched[slug]);
  assert.deepEqual(
    missing,
    [],
    `run \`node platform/pages/launched.mjs --write\` — missing: ${missing.join(', ')}`,
  );
});

test('committed dates are all well-formed and none are in the future', async () => {
  const launched = await loadLaunchDates();
  assert.ok(Object.keys(launched).length > 100, 'expected the real file, not an empty fallback');
  // `loadLaunchDates` drops malformed values rather than publishing a broken
  // `<updated>`, so read the raw file to prove none were dropped.
  const raw = JSON.parse(await fs.readFile(path.join(import.meta.dirname, 'launched.json'), 'utf8'));
  for (const [slug, date] of Object.entries(raw.launched)) {
    assert.ok(isIsoDate(date), `${slug}: ${date} is not YYYY-MM-DD`);
  }
  assert.equal(Object.keys(raw.launched).length, Object.keys(launched).length);
});

test('loadLaunchDates tolerates a missing or malformed file rather than failing the build', async () => {
  assert.deepEqual(await loadLaunchDates(path.join(os.tmpdir(), 'no-such-launched.json')), {});

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'launched-'));
  const file = path.join(dir, 'launched.json');
  await fs.writeFile(file, '{ not json');
  assert.deepEqual(await loadLaunchDates(file), {});

  // A hand-edited date is dropped, not published. One bad `<updated>` makes
  // the whole document unparseable for every reader at once, so the safe
  // direction is to lose the entry and let check.mjs refuse the build.
  await fs.writeFile(file, JSON.stringify({ launched: { good: '2026-08-01', bad: 'last tuesday', worse: '2026-13-45' } }));
  assert.deepEqual(await loadLaunchDates(file), { good: '2026-08-01' });
});

// ---------------------------------------------------------------------------
// Deriving the dates
// ---------------------------------------------------------------------------

test('firstCommitDate reads the add of a venture, not its latest edit', async () => {
  const slug = 'where-to-sell-calculator';
  const derived = await firstCommitDate(slug, { cwd: REPO_ROOT });
  assert.ok(isIsoDate(derived), `expected an ISO date, got ${derived}`);

  const { stdout } = await execFileAsync(
    'git',
    ['log', '-1', '--format=%aI', '--', `ventures/${slug}`],
    { cwd: REPO_ROOT },
  );
  const latest = new Date(stdout.trim()).toISOString().slice(0, 10);
  assert.ok(derived <= latest, `${derived} should not be after the latest edit ${latest}`);
});

test('firstCommitDate returns null rather than throwing outside a repository', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'not-a-repo-'));
  assert.equal(await firstCommitDate('anything', { cwd: dir }), null);
});

test('refresh only adds — an existing date is never rewritten', async () => {
  // This is what keeps the feed quiet. A rename, a squash, or a directory
  // moved between ventures changes what history says; if the refresh followed
  // that, every subscriber would be re-notified about tools they have seen.
  const existing = { alpha: '2020-01-01' };
  const { launched, added } = await refreshLaunchDates(['alpha', 'beta'], {
    existing,
    cwd: REPO_ROOT,
    today: '2026-09-09',
  });
  assert.equal(launched.alpha, '2020-01-01', 'alpha kept its committed date');
  assert.equal(launched.beta, '2026-09-09', 'beta has no history, so it launches today');
  assert.deepEqual(added, ['beta']);
  assert.deepEqual(existing, { alpha: '2020-01-01' }, 'the input map is not mutated');
});

test('refresh output is key-sorted so a re-run produces no diff churn', async () => {
  const { launched } = await refreshLaunchDates(['zulu', 'alpha', 'mike'], {
    cwd: REPO_ROOT,
    today: '2026-09-09',
  });
  assert.deepEqual(Object.keys(launched), ['alpha', 'mike', 'zulu']);
});

test('the committed file is exactly what a refresh would produce, byte for byte', async () => {
  // Guards the file against a hand edit that reorders or reformats it, which
  // would make every future `--write` produce a large spurious diff.
  const file = path.join(import.meta.dirname, 'launched.json');
  const onDisk = await fs.readFile(file, 'utf8');
  const surfaces = await discoverSurfaces(path.join(REPO_ROOT, 'ventures'));
  const { launched } = await refreshLaunchDates(
    surfaces.map((s) => s.slug),
    { existing: await loadLaunchDates(), cwd: REPO_ROOT },
  );
  assert.equal(onDisk, `${JSON.stringify({ launched }, null, 2)}\n`);
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test('newest first, ties broken by slug so a rebuild is byte-identical', () => {
  const surfaces = [surface('c'), surface('a'), surface('b'), surface('old')];
  const launched = { a: '2026-08-26', b: '2026-08-26', c: '2026-08-26', old: '2026-01-01' };
  assert.deepEqual(
    orderForFeed(surfaces, launched).map((s) => s.slug),
    ['a', 'b', 'c', 'old'],
  );
});

test('an undated surface sorts last rather than being dropped from the ordering', () => {
  // Dropping it here would hide it from check.mjs, which is the thing that
  // refuses to publish a site with an undated tool.
  const surfaces = [surface('undated'), surface('dated')];
  assert.deepEqual(
    orderForFeed(surfaces, { dated: '2026-08-01' }).map((s) => s.slug),
    ['dated', 'undated'],
  );
});

test('feedUpdatedAt is the newest entry date, not the build time', () => {
  const surfaces = [surface('a'), surface('b')];
  assert.equal(feedUpdatedAt(surfaces, { a: '2026-08-01', b: '2026-08-28' }), '2026-08-28T00:00:00Z');
  assert.equal(feedUpdatedAt(surfaces, {}), null);
});

// ---------------------------------------------------------------------------
// The rendered feed
// ---------------------------------------------------------------------------

const BASE = 'https://tools.marisstella.dev/';

test('renderFeed produces parseable Atom with the required feed-level elements', () => {
  const xml = renderFeed([surface('alpha-calculator')], BASE, { 'alpha-calculator': '2026-08-01' });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  for (const tag of ['title', 'subtitle', 'id', 'updated', 'rights']) {
    assert.match(xml, new RegExp(`<${tag}>`), `missing feed-level <${tag}>`);
  }
  assert.match(xml, /<link rel="self" type="application\/atom\+xml" href="https:\/\/tools\.marisstella\.dev\/feed\.xml"\/>/);
  assert.match(xml, /<link rel="alternate" type="text\/html" href="https:\/\/tools\.marisstella\.dev\/"\/>/);
});

test('entry ids are tag URIs keyed on the slug, so moving host does not re-notify subscribers', () => {
  const launched = { 'alpha-calculator': '2026-08-01' };
  const onPages = renderFeed([surface('alpha-calculator')], 'https://example.github.io/repo/', launched);
  const onHetzner = renderFeed([surface('alpha-calculator')], BASE, launched);
  const idOf = (xml) => xml.match(/<id>(tag:[^<]*tool[^<]*)<\/id>/)[1];
  assert.equal(idOf(onPages), 'tag:marisstella.dev,2026:tool/alpha-calculator');
  assert.equal(idOf(onPages), idOf(onHetzner));
  // The link, unlike the id, does follow the base URL.
  assert.match(onHetzner, /href="https:\/\/tools\.marisstella\.dev\/alpha-calculator\/"/);
});

test('published and updated are equal, so an edit does not republish the entry', () => {
  const xml = renderFeed([surface('alpha-calculator')], BASE, { 'alpha-calculator': '2026-08-01' });
  assert.match(xml, /<published>2026-08-01T00:00:00Z<\/published>\s*\n\s*<updated>2026-08-01T00:00:00Z<\/updated>/);
});

test('the feed is capped, and carries the newest entries rather than an arbitrary slice', () => {
  const many = Array.from({ length: FEED_MAX_ENTRIES + 5 }, (_, i) =>
    surface(`tool-${String(i).padStart(3, '0')}`),
  );
  // tool-000 is the oldest, tool-044 the newest.
  const launched = Object.fromEntries(
    many.map((s, i) => [s.slug, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`]),
  );
  const xml = renderFeed(many, BASE, launched);
  assert.equal((xml.match(/<entry>/g) ?? []).length, FEED_MAX_ENTRIES);

  const dates = [...xml.matchAll(/<published>(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'entries are not newest-first');
  assert.equal(dates[0], [...Object.values(launched)].sort().reverse()[0]);
});

test('an undated surface is not published as an entry with an empty date', () => {
  const xml = renderFeed([surface('dated'), surface('undated')], BASE, { dated: '2026-08-01' });
  assert.equal((xml.match(/<entry>/g) ?? []).length, 1);
  assert.ok(!xml.includes('undated'));
  assert.ok(!xml.includes('<published>T00:00:00Z'));
});

test('a feed with nothing dated is still valid Atom rather than a document with an empty updated', () => {
  const xml = renderFeed([surface('undated')], BASE, {});
  assert.equal((xml.match(/<entry>/g) ?? []).length, 0);
  assert.match(xml, /<updated>\d{4}-\d{2}-\d{2}T[\d:]+Z<\/updated>/);
});

test('XML special characters in a tool title or description are escaped', () => {
  // A real risk: descriptions here routinely contain `&` and quotes, and one
  // raw ampersand makes the whole feed unparseable for every reader at once.
  const nasty = surface('nasty', {
    title: 'Fees & "margins" <b>',
    fullDescription: "Compare A & B when margin < 5% and it's 'tight'",
  });
  const xml = renderFeed([nasty], BASE, { nasty: '2026-08-01' });
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;|apos;)/.test(xml), 'unescaped ampersand in the feed');
  assert.match(xml, /<title>Fees &amp; &quot;margins&quot; &lt;b&gt;<\/title>/);
  assert.match(xml, /Compare A &amp; B when margin &lt; 5%/);
});

test('the summary is one line — a newline would end the element early in some readers', () => {
  const wrapped = surface('wrapped', { fullDescription: 'First line.\n\nSecond   line.' });
  const xml = renderFeed([wrapped], BASE, { wrapped: '2026-08-01' });
  assert.match(xml, /<summary type="text">First line\. Second line\.<\/summary>/);
});

test('FEED_FILE is the path the renderer advertises for itself', () => {
  assert.equal(FEED_FILE, 'feed.xml');
  const xml = renderFeed([surface('a')], BASE, { a: '2026-08-01' });
  assert.ok(xml.includes(`${BASE}${FEED_FILE}`));
});

test('the same input renders byte-identically, so a rebuild is not a feed update', () => {
  const surfaces = [surface('b'), surface('a')];
  const launched = { a: '2026-08-01', b: '2026-08-01' };
  assert.equal(renderFeed(surfaces, BASE, launched), renderFeed(surfaces, BASE, launched));
});
