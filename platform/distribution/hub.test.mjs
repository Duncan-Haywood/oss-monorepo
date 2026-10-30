import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PLATFORMS, MODES, HUB_REFS, byId } from './hub/platforms.mjs';
import { TEMPLATES, templateOf, toolItem, postItem, variant, digest, glen, pickTemplate } from './hub/compose.mjs';
import { ADAPTERS } from './hub/adapters.mjs';
import { READERS, reading, scoreboard, arrivals, collect, MIN_POSTS } from './hub/metrics.mjs';
import { main, parseArgs, gatherItems, planAll, publish, writePack, toCsv, toMarkdown, EMAIL } from './hub.mjs';
import { REFS } from '../counter/counter.mjs';

const LONG = 'A very long description that keeps going. '.repeat(40);
const tool = toolItem('mileage-log', '2026-10-19', { title: 'Mileage Log — Free Tracker', description: `Track business miles for taxes. ${LONG}` });
const post = postItem({ slug: 'fleet-findings', date: '2026-10-20', title: 'What 35 experiments found', description: 'Cost per run and duplicate work.', tags: [] });

test('registry: valid modes, every api platform has an adapter, every tag is accepted by the counter', () => {
  const ids = new Set();
  for (const p of PLATFORMS) {
    assert.ok(MODES.includes(p.mode), p.id);
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.why.length > 20, `${p.id} needs a reason`);
    if (p.mode === 'api') {
      assert.ok(ADAPTERS[p.id], `${p.id} has no adapter`);
      assert.match(p.env, /^DISTRIBUTE_[A-Z]+$/);
    }
    if (p.mode === 'delegated') assert.ok(p.delegate, p.id);
  }
  for (const r of HUB_REFS) assert.ok(REFS.includes(r), `counter REFS lacks ${r}`);
  assert.equal(byId('x').mode, 'draft', 'X is paid-only for new developers: drafts, never automated');
  assert.equal(byId('substack').mode, 'draft');
});

test('templates: markers are unique, templateOf reads them back, and the pick is deterministic', () => {
  const markers = Object.values(TEMPLATES).flat().map((t) => t.marker);
  assert.equal(new Set(markers).size, markers.length);
  for (const t of Object.values(TEMPLATES).flat()) assert.equal(templateOf(t.head({ name: 'X' }) + '\nrest'), t.id);
  assert.equal(templateOf('something else'), null);
  assert.equal(pickTemplate(tool, 'threads').id, pickTemplate(tool, 'threads').id);
  // Across many items every tool template gets used, so the comparison has data.
  const used = new Set(Array.from({ length: 60 }, (_, i) => pickTemplate({ ...tool, id: `tool:t${i}` }, 'threads').id));
  assert.equal(used.size, TEMPLATES.tool.length);
});

test('every variant fits its platform, links back with its own tag, and only automated ones say so', () => {
  for (const p of PLATFORMS.filter((x) => x.mode !== 'discovery')) {
    for (const it of [tool, post]) {
      const v = variant(it, p);
      if (p.limits.text) assert.ok(glen(v.text) <= p.limits.text, `${p.id}: ${glen(v.text)} > ${p.limits.text}`);
      if (v.title && p.limits.title) assert.ok(glen(v.title) <= p.limits.title, `${p.id} title`);
      assert.equal(new URL(v.link).searchParams.get('ref'), p.ref);
      assert.equal(new URL(v.url).search, '', 'canonical url stays clean');
      const automated = p.mode === 'api' || p.mode === 'delegated';
      if (v.kind === 'short' || v.kind === 'caption') {
        assert.equal(/Automated post\./.test(v.text), automated, `${p.id} label`);
        assert.ok(v.text.trimStart().startsWith(TEMPLATES[it.type].find((t) => t.id === v.template).marker));
      }
      if (v.kind === 'short') assert.ok(v.text.includes(v.link), `${p.id} carries the tagged link`);
      if (it.type === 'tool' && v.kind !== 'link') assert.match(v.text + (v.script || ''), /open source/i);
    }
  }
  assert.ok(!variant(tool, byId('instagram')).text.includes('http'), 'instagram captions carry no dead links');
  assert.match(variant(tool, byId('tiktok')).script, /HOOK[\s\S]*CLOSE/);
  assert.match(variant(tool, byId('hackernews')).title, /^Show HN: Mileage Log/);
});

test('short posts never end on a fragment of a few words', () => {
  const v = variant({ ...tool, description: 'Word '.repeat(80) }, byId('x'));
  const lines = v.text.split('\n');
  if (lines[1] && lines[1] !== '') assert.ok(glen(lines[1]) >= 30);
});

test('planAll: caps social posts, caps drafts, leaves older tools to the email digest', () => {
  const old = toolItem('old-tool', '2026-10-14', { title: 'Old', description: 'Old tool.' });
  const many = Array.from({ length: 20 }, (_, i) => toolItem(`t${i}`, '2026-10-20', { title: `T${i}`, description: 'D.' }));
  const plan = planAll([...many, old], { today: '2026-10-20', max: 3, days: 3 });
  const get = (id) => plan.find((e) => e.platform.id === id);
  assert.equal(get('threads').variants.length, 3);
  assert.equal(get('x').variants.length, 10);
  assert.ok(!get('x').variants.some((v) => v.item === 'tool:old-tool'));
  assert.equal(get('email').variants.length, 1);
  assert.ok(get('email').variants[0].items.includes('tool:old-tool'));
  assert.equal(get('google').variants.length, 0);
  assert.equal(planAll(many, { only: ['x'], today: '2026-10-20' }).length, 1);
});

test('gatherItems: window, newest first, skips pages without metadata', async () => {
  const items = await gatherItems({
    today: '2026-10-20', days: 3, postDays: 7,
    launched: { a: '2026-10-20', b: '2026-10-18', c: '2026-10-01', d: '2026-10-20' },
    posts: [{ slug: 'p', date: '2026-10-19', title: 'P', description: 'Pd.' }, { slug: 'q', date: '2026-09-01', title: 'Q', description: 'Qd.' }],
    readPage: async (s) => (s === 'd' ? null : '<title>A — x</title><meta name="description" content="Desc.">'),
  });
  assert.deepEqual(items.map((i) => i.id), ['tool:a', 'post:p', 'tool:b']);
});

function mockFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body ? String(init.body) : '' });
    for (const [re, body] of routes) if (re.test(`${init.method || 'GET'} ${u}`)) {
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg' }), json: async () => (typeof body === 'function' ? body(u, init) : body) };
    }
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
  };
  f.calls = calls;
  return f;
}

test('publish: dry runs without the switch, and live Threads skips what the account already posted', async () => {
  const items = [tool, post];
  const plan = planAll(items, { only: ['threads', 'facebook'], today: '2026-10-20' });
  const dry = await publish(plan, { env: {}, fetchImpl: async () => { throw new Error('no network in a dry run'); }, log: () => {} });
  assert.deepEqual(dry.map((r) => r.dry), ['DISTRIBUTE_THREADS is not "true"', 'DISTRIBUTE_FACEBOOK is not "true"']);

  const f = mockFetch([
    [/GET .*\/me\/threads/, { data: [{ text: `old post ${tool.url}?ref=threads` }] }],
    [/POST .*\/threads$/, { id: 'c1' }],
    [/POST .*\/threads_publish$/, { id: 'p1' }],
  ]);
  const env = { DISTRIBUTE_THREADS: 'true', THREADS_TOKEN: 't', THREADS_USER_ID: '42' };
  const [r] = await publish(planAll(items, { only: ['threads'], today: '2026-10-20' }), { env, fetchImpl: f, log: () => {} });
  assert.equal(r.posted, 1);
  assert.deepEqual(r.skipped, [`${tool.id}: already posted`]);
  const create = f.calls.find((c) => c.method === 'POST' && c.url.endsWith('/42/threads'));
  assert.match(new URLSearchParams(create.body).get('text'), /fleet-findings\/\?ref=threads/);
  assert.equal(new URLSearchParams(f.calls.at(-1).body).get('creation_id'), 'c1');
});

test('publish: email goes out on Mondays only, as a draft, listing only items no earlier issue had', async () => {
  const env = { DISTRIBUTE_EMAIL: 'true', BUTTONDOWN_API_KEY: 'k' };
  const plan = planAll([tool, post], { only: ['email'], today: '2026-10-20' });
  const tuesday = new Date('2026-10-20T12:00:00Z');
  const [r1] = await publish(plan, { env, fetchImpl: async () => { throw new Error('none'); }, log: () => {}, now: tuesday });
  assert.match(r1.dry, /Mondays/);

  let sent;
  const f = mockFetch([
    [/GET .*\/emails/, { results: [{ body: `earlier issue ${tool.url}?ref=email` }] }],
    [/POST .*\/emails/, (u, init) => { sent = JSON.parse(init.body); return { id: 'e1' }; }],
  ]);
  const monday = new Date('2026-10-19T12:00:00Z');
  assert.equal(monday.getUTCDay(), EMAIL.weekday);
  const [r2] = await publish(plan, { env, fetchImpl: f, log: () => {}, now: monday });
  assert.equal(r2.posted, 1);
  assert.equal(sent.status, 'draft');
  assert.ok(sent.body.includes(post.url) && !sent.body.includes(tool.url));
  assert.ok(sent.body.includes('(2026-10-19)'), 'the issue is dated by the send day');
});

test('instagram skips an item with no JPEG rather than posting without an image', async () => {
  const env = { DISTRIBUTE_INSTAGRAM: 'true', INSTAGRAM_TOKEN: 't', INSTAGRAM_USER_ID: '9', INSTAGRAM_IMAGE_BASE: 'https://img.example/' };
  const f = mockFetch([[/GET .*\/9\/media/, { data: [] }]]);
  const [r] = await publish(planAll([tool], { only: ['instagram'], today: '2026-10-20' }), { env, fetchImpl: f, log: () => {} });
  assert.equal(r.posted, 0);
  assert.match(r.skipped[0], /no JPEG at https:\/\/img\.example\/mileage-log\.jpg/);
});

test('metrics: readings carry template and page; bluesky reader needs no login', async () => {
  const text = variant(tool, byId('bluesky')).text;
  const f = mockFetch([[/public\.api\.bsky\.app/, { feed: [
    { post: { uri: 'at://1', record: { text, createdAt: '2026-10-19T00:00:00Z' }, likeCount: 4, repostCount: 1, replyCount: 0, quoteCount: 0 } },
    { reason: { $type: 'repost' }, post: { uri: 'at://2', record: { text: 'someone else' } } },
  ] }]]);
  const { readings, status } = await collect({ env: { BSKY_HANDLE: 'tools.bsky.social' }, fetchImpl: f });
  assert.equal(readings.length, 1);
  assert.equal(readings[0].page, tool.url);
  assert.equal(readings[0].template, pickTemplate(tool, 'bluesky').id);
  assert.equal(readings[0].engagement, 5);
  assert.match(status.threads, /skipped/);
});

test('scoreboard: unmeasured arrivals are null, small samples are not ranked, shrinkage tames lucky posts', () => {
  const mk = (platform, n, eng, template = 'launch') => Array.from({ length: n }, (_, i) => ({ ...reading(platform, { id: `${platform}${i}`, text: `${TEMPLATES.tool.find((t) => t.id === template).marker}x`, metrics: { likes: eng } }) }));
  const readings = [...mk('threads', 2, 50), ...mk('bluesky', 20, 5, 'plain'), ...mk('mastodon', 10, 5, 'launch')];
  const none = scoreboard({ platforms: PLATFORMS, readings, days: {} });
  assert.equal(none.platforms.find((r) => r.platform === 'bluesky').arrivals, null);
  assert.ok(none.notes.some((n) => /unmeasured, not zero/.test(n)));

  const days = { '2026-10-19': { 'ref:threads': 6, 'ref:bluesky': 40, 'ref:mastodon': 10, 'src:google': 3, 'mileage-log': 99 } };
  const s = scoreboard({ platforms: PLATFORMS, readings, days });
  const row = (id) => s.platforms.find((r) => r.platform === id);
  assert.equal(row('threads').rankable, false, `fewer than ${MIN_POSTS} posts`);
  assert.equal(s.best, 'bluesky');
  assert.ok(row('threads').arrivalsPerPost > row('bluesky').arrivalsPerPost, 'raw rate favours the lucky platform');
  assert.equal(s.platforms[0].platform, 'bluesky', 'but ranking does not');
  assert.deepEqual(arrivals(days).src, { google: 3 });
  assert.equal(arrivals(days, '2026-10-20').ref.bluesky, undefined);
  // Template lift is relative to each platform's own mean: equal everywhere here.
  for (const t of s.templates) assert.ok(Math.abs(t.lift - 1) < 1e-9, t.template);
});

test('pack writes one file per platform, an index and a CSV that round-trips quotes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-'));
  const plan = planAll([{ ...tool, description: 'He said "free".' }], { today: '2026-10-20' });
  await writePack(plan, dir);
  const files = await fs.readdir(dir);
  for (const p of PLATFORMS) assert.ok(files.includes(`${p.id}.md`), p.id);
  assert.ok(files.includes('README.md') && files.includes('drafts.csv'));
  assert.match(toCsv(plan), /He said ""free""/);
});

test('parseArgs rejects unknown options and platforms', () => {
  assert.throws(() => parseArgs(['plan', '--bogus']), /unknown option/);
  assert.throws(() => parseArgs(['plan', '--only', 'myspace']), /unknown platform/);
  assert.deepEqual(parseArgs(['plan', '--only', 'x,threads']).only, ['x', 'threads']);
  assert.equal(digest([tool], byId('email'), { date: '2026-10-20' }).title, 'New: Mileage Log');
});

test('every reader declares what it needs', () => {
  for (const [id, r] of Object.entries(READERS)) assert.equal(typeof r.needs({}), 'string', id);
});

test('gatherItems: a page with metadata yields its title and description, not the raw html', async () => {
  const [item] = await gatherItems({
    today: '2026-10-20', days: 3, postDays: 7, launched: { a: '2026-10-20' }, posts: [],
    readPage: async () => '<title>A — x</title><meta name="description" content="Desc.">',
  });
  assert.equal(item.title, 'A — x');
  assert.equal(item.description, 'Desc.');
});

test('planAll: recent posts reach social platforms and the email digest starts at the newest item', () => {
  const t = toolItem('newest', '2026-10-20', { title: 'Newest', description: 'N.' });
  const plan = planAll([t, post], { today: '2026-10-20', days: 3 });
  const get = (id) => plan.find((e) => e.platform.id === id);
  assert.ok(get('x').variants.some((v) => v.item === 'post:fleet-findings'));
  assert.deepEqual(get('email').variants[0].items, ['tool:newest', 'post:fleet-findings']);
});

test('toCsv: the email digest row lists its items', () => {
  const plan = planAll([tool, post], { only: ['email'], today: '2026-10-20' });
  const csv = toCsv(plan);
  assert.ok(csv.includes('\n"email","api","tool:mileage-log post:fleet-findings"'), csv);
});

test('main: plan prints the post text and score --json is indented by two spaces', async () => {
  const out = [];
  const log = (s) => out.push(s);
  await main(['plan', '--only', 'tiktok', '--today', '2026-10-20'], { log });
  const items = await gatherItems({ today: '2026-10-20', days: 3, postDays: 7 });
  if (items.length) {
    const v = planAll(items, { only: ['tiktok'], today: '2026-10-20', days: 3 })[0].variants[0];
    assert.ok(out.join('\n').includes(v.text), 'prints the text, not only the script');
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-score-'));
  const file = path.join(dir, 'readings.json');
  await fs.writeFile(file, '[]');
  const json = [];
  await main(['score', '--readings', file, '--json'], { log: (s) => json.push(s) });
  assert.match(json[0], /^\{\n {2}"status"/);
});

test('planAll: a tool launched exactly `days` before today still gets its own post, one day older goes to the digest only', () => {
  const edge = toolItem('edge', '2026-10-17', { title: 'Edge', description: 'E.' });
  const older = toolItem('older', '2026-10-16', { title: 'Older', description: 'O.' });
  const plan = planAll([edge, older], { today: '2026-10-20', days: 3 });
  const x = plan.find((e) => e.platform.id === 'x').variants.map((v) => v.item);
  assert.deepEqual(x, ['tool:edge']);
});

test('main: publish with no switches set runs dry and reports it', async () => {
  const out = [];
  const results = await main(['publish', '--only', 'threads', '--today', '2026-10-20'], {
    env: {}, fetchImpl: async () => { throw new Error('no network in a dry run'); }, log: (s) => out.push(s),
  });
  assert.equal(results.length, 1);
  assert.match(out.join('\n'), /threads: DRY RUN \(DISTRIBUTE_THREADS is not "true"\)/);
});

test('gatherItems: a post dated today and one exactly postDays old are in, one day older and a future-dated post are out', async () => {
  const mk = (slug, date) => ({ slug, date, title: slug, description: 'd', tags: [] });
  const posts = [mk('today', '2026-10-30'), mk('edge', '2026-10-23'), mk('old', '2026-10-22'), mk('future', '2026-10-31')];
  const items = await gatherItems({ today: '2026-10-30', days: 7, postDays: 7, launched: {}, posts });
  assert.deepEqual(items.map((i) => i.id).sort(), ['post:edge', 'post:today']);
});

test('toMarkdown: "Nothing to post" only when there is a note and no variants', () => {
  const p = PLATFORMS[0];
  const [v] = planAll([tool], { today: '2026-10-20' }).find((x) => x.variants.length).variants;
  assert.match(toMarkdown({ platform: p, variants: [], note: 'x' }), /Nothing to post\./);
  assert.doesNotMatch(toMarkdown({ platform: p, variants: [v], note: 'x' }), /Nothing to post\./);
  assert.doesNotMatch(toMarkdown({ platform: p, variants: [], note: '' }), /Nothing to post\./);
});
