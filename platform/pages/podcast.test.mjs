import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clock, loadEpisodes, renderPodcastFeed } from './podcast.mjs';
import { buildWriting, loadPosts, WRITING_PATH } from './writing.mjs';

const BASE = 'https://example.test/site/';

const post = (title, date) => `---\ntitle: "${title}"\ndate: ${date}\ndescription: "About ${title}."\n---\n\n# ${title}\n\nBody.\n`;
const script = (title, date, postSlug, body = 'This is the Maris Stella Labs podcast.\n\nSecond paragraph.') =>
  `---\ntitle: "${title}"\ndate: ${date}\ndescription: "Episode ${title}."\npost: ${postSlug}\n---\n\n${body}\n`;

function repo({ posts = {}, scripts = {}, audio = {} }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'podcast-'));
  mkdirSync(path.join(root, 'docs/posts'), { recursive: true });
  mkdirSync(path.join(root, 'docs/podcast/audio'), { recursive: true });
  for (const [n, t] of Object.entries(posts)) writeFileSync(path.join(root, 'docs/posts', n), t);
  for (const [n, t] of Object.entries(scripts)) writeFileSync(path.join(root, 'docs/podcast', n), t);
  const manifest = {};
  for (const [stem, seconds] of Object.entries(audio)) {
    writeFileSync(path.join(root, 'docs/podcast/audio', `${stem}.mp3`), 'ID3fake');
    manifest[stem] = { bytes: 7, seconds, sha256: 'x', script_sha256: 'y', voice: 'kokoro-82m-af_heart' };
  }
  writeFileSync(path.join(root, 'docs/podcast/audio/manifest.json'), JSON.stringify(manifest));
  return root;
}

test('an episode publishes only once its audio is committed', () => {
  const root = repo({
    scripts: { '2026-10-20-a.md': script('A', '2026-10-20', 'a'), '2026-10-20-b.md': script('B', '2026-10-20', 'b') },
    audio: { '2026-10-20-a': 61.4 },
  });
  const eps = loadEpisodes(root);
  assert.deepEqual(eps.map((e) => e.slug), ['a']);
  assert.equal(eps[0].seconds, 61.4);
  assert.equal(eps[0].audioFile, '2026-10-20-a.mp3');
});

test('a script with markup a voice would read out fails the build', () => {
  for (const bad of ['A [link](x).', 'See https://example.com now.', '## Heading', 'Use `code`.', 'a | table']) {
    const root = repo({ scripts: { '2026-10-20-a.md': script('A', '2026-10-20', 'a', bad) } });
    assert.throws(() => loadEpisodes(root), /would read out/, bad);
  }
});

test('a script with no front matter is hand-written and left out, not a build failure', () => {
  const root = repo({ scripts: { '2026-10-20-two-hosts.md': '# Episode 1\n\n**ADA:** Hello.\n' } });
  assert.deepEqual(loadEpisodes(root), []);
});

test('a script must name a post that exists', () => {
  const root = repo({ scripts: { '2026-10-20-a.md': script('A', '2026-10-20', 'missing') } });
  assert.throws(() => loadEpisodes(root, new Set(['a'])), /not in docs\/posts/);
});

test('the build puts a player on the post, a podcast page and an RSS feed with enclosures', async () => {
  const root = repo({
    posts: { '2026-10-20-a.md': post('A', '2026-10-20'), '2026-10-19-b.md': post('B', '2026-10-19') },
    scripts: { '2026-10-20-a.md': script('Episode <A>', '2026-10-20', 'a') },
    audio: { '2026-10-20-a': 125 },
  });
  const out = mkdtempSync(path.join(os.tmpdir(), 'podcast-out-'));
  const pages = await buildWriting(out, BASE, { root });
  assert.deepEqual(pages, ['a', 'b', 'podcast']);
  const w = path.join(out, WRITING_PATH);
  const postA = await fs.readFile(path.join(w, 'a/index.html'), 'utf8');
  const postB = await fs.readFile(path.join(w, 'b/index.html'), 'utf8');
  const pod = await fs.readFile(path.join(w, 'podcast/index.html'), 'utf8');
  const feed = await fs.readFile(path.join(w, 'podcast/feed.xml'), 'utf8');
  const index = await fs.readFile(path.join(w, 'index.html'), 'utf8');
  assert.match(postA, /<audio controls preload="none" src="\.\.\/podcast\/audio\/2026-10-20-a\.mp3">/);
  assert.match(postA, /"@type":"AudioObject"/);
  assert.doesNotMatch(postB, /<audio/);
  assert.match(pod, /no warranty/i);
  assert.match(pod, /synthetic/i);
  assert.match(pod, /Episode &lt;A&gt;/);
  assert.match(pod, /<details><summary>Transcript<\/summary>/);
  assert.match(pod, /"@type":"PodcastSeries"/);
  assert.match(index, /href="podcast\/"/);
  assert.match(feed, /xmlns:itunes=/);
  assert.match(feed, new RegExp(`<enclosure url="${BASE}writing/podcast/audio/2026-10-20-a.mp3" length="7" type="audio/mpeg"/>`));
  assert.match(feed, /<itunes:duration>125<\/itunes:duration>/);
  // Grouped by the post's topic, with a feed per topic.
  assert.match(pod, /<section id="topic-tools"/);
  assert.match(pod, /href="tools\/feed\.xml">RSS for this topic only</);
  const topicFeed = await fs.readFile(path.join(w, 'podcast/tools/feed.xml'), 'utf8');
  assert.match(topicFeed, /<title>[^<]*: Tools and projects<\/title>/);
  assert.match(topicFeed, new RegExp(`<enclosure url="${BASE}writing/podcast/audio/2026-10-20-a.mp3"`));
  await assert.rejects(fs.access(path.join(w, 'podcast/research/feed.xml')));
  await fs.access(path.join(w, 'podcast/audio/2026-10-20-a.mp3'));
});

test('no episodes: the podcast page still exists (it is in the top nav), with no feed', async () => {
  const root = repo({ posts: { '2026-10-20-a.md': post('A', '2026-10-20') } });
  const out = mkdtempSync(path.join(os.tmpdir(), 'podcast-none-'));
  assert.deepEqual(await buildWriting(out, BASE, { root }), ['a', 'podcast']);
  const page = await fs.readFile(path.join(out, WRITING_PATH, 'podcast/index.html'), 'utf8');
  assert.match(page, /No episodes yet/);
  assert.match(page, /data-pfs-nav="podcast" href="[^"]*" aria-current="page"/);
  await assert.rejects(fs.access(path.join(out, WRITING_PATH, 'podcast/feed.xml')));
});

test('clock and an empty feed', () => {
  assert.equal(clock(65), '1:05');
  assert.equal(clock(3725), '1:02:05');
  assert.match(renderPodcastFeed([], { baseUrl: BASE }), /<rss version="2.0"/);
});

test('every committed episode parses and names a committed post', () => {
  loadEpisodes(undefined, new Set(loadPosts().map((p) => p.slug)));
});

test('writing.mjs loads on its own (no import cycle through podcast.mjs)', async () => {
  const { execFileSync } = await import('node:child_process');
  const here = path.dirname(new URL(import.meta.url).pathname);
  const out = execFileSync(process.execPath, ['-e', `import(${JSON.stringify(path.join(here, 'writing.mjs'))}).then((m) => console.log(typeof m.buildWriting))`]);
  assert.equal(String(out).trim(), 'function');
});
