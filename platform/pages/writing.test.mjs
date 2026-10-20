import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildWriting, loadPosts, parseFrontMatter, renderFeed, WRITING_PATH } from './writing.mjs';

const BASE = 'https://example.test/site/';

function repoWith(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'writing-'));
  mkdirSync(path.join(root, 'docs/posts'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, 'docs/posts', name), text);
  return root;
}

const post = (title, date, extra = '') =>
  `---\ntitle: "${title}"\ndate: ${date}\ndescription: "About ${title}."\ntags: [agents, notes]\n${extra}---\n\n# ${title}\n\nBody text with \`code\` and a [link](../../README.md).\n`;

test('front matter: strings, quoted strings and lists', () => {
  const { meta, body } = parseFrontMatter('---\ntitle: "A: b"\ndate: 2026-10-16\ntags: [x, "y"]\n---\n# T\n');
  assert.deepEqual(meta, { title: 'A: b', date: '2026-10-16', tags: ['x', 'y'] });
  assert.equal(body, '# T\n');
});

test('posts are newest first, slug drops the date, reading time is computed', () => {
  const root = repoWith({
    '2026-10-01-older.md': post('Older', '2026-10-01'),
    '2026-10-16-newer.md': post('Newer', '2026-10-16'),
  });
  const posts = loadPosts(root);
  assert.deepEqual(posts.map((p) => p.slug), ['newer', 'older']);
  assert.equal(posts[0].minutes, 1);
  assert.deepEqual(posts[0].tags, ['agents', 'notes']);
});

test('a malformed post fails the build instead of shipping', () => {
  assert.throws(() => loadPosts(repoWith({ 'no-date.md': post('X', '2026-10-01') })), /name must be/);
  assert.throws(() => loadPosts(repoWith({ '2026-10-01-x.md': '---\ntitle: "X"\n---\nbody\n' })), /needs "description"/);
  assert.throws(() => loadPosts(repoWith({ '2026-10-01-x.md': post('X', '2026-10-02') })), /does not match/);
  const long = post('X', '2026-10-01').replace('About X.', 'x'.repeat(161));
  assert.throws(() => loadPosts(repoWith({ '2026-10-01-x.md': long })), /keep it to 160/);
});

test('no posts directory means no posts, not an error', () => {
  assert.deepEqual(loadPosts(mkdtempSync(path.join(os.tmpdir(), 'writing-empty-'))), []);
});

test('build writes an index, one page per post and a feed, each with a disclaimer', async () => {
  const root = repoWith({ '2026-10-16-hello.md': post('Hello <world>', '2026-10-16') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-out-'));
  const posts = await buildWriting(out, BASE, { root });
  assert.equal(posts.length, 1);
  const index = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  const page = await fs.readFile(path.join(out, WRITING_PATH, 'hello/index.html'), 'utf8');
  const feed = await fs.readFile(path.join(out, WRITING_PATH, 'feed.xml'), 'utf8');
  for (const html of [index, page]) {
    assert.match(html, /no warranty/i);
    assert.match(html, /<meta name="viewport"/);
  }
  assert.match(index, /href="hello\/"/);
  // Escaped, never injected; the title is the page's only <h1>.
  assert.ok(page.includes('Hello &lt;world&gt;'));
  assert.ok(!page.includes('<world>'));
  assert.equal(page.match(/<h1>/g).length, 1);
  assert.match(page, new RegExp(`<link rel="canonical" href="${BASE}writing/hello/">`));
  assert.match(page, /"@type":"BlogPosting"/);
  // Repository-relative links become GitHub links.
  assert.match(page, /href="https:\/\/github\.com\/Duncan-Haywood\/oss-monorepo\/blob\/main\/README\.md"/);
  assert.match(feed, new RegExp(`<id>${BASE}writing/hello/</id>`));
});

test('a link to a sibling post file becomes a link to its page', async () => {
  const root = repoWith({
    '2026-10-01-first.md': post('First', '2026-10-01'),
    '2026-10-02-second.md': post('Second', '2026-10-02', '').replace('Body text', 'See [the first](2026-10-01-first.md). Body text'),
  });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-sib-'));
  await buildWriting(out, BASE, { root });
  const page = await fs.readFile(path.join(out, WRITING_PATH, 'second/index.html'), 'utf8');
  assert.match(page, /<a href="\.\.\/first\/">the first<\/a>/);
  assert.match(page, /data-pf-to="hub"/);
});

test('feed is valid-shaped with no posts', () => {
  assert.match(renderFeed([], { baseUrl: BASE }), /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
});

test('every committed post parses', () => {
  const posts = loadPosts();
  assert.ok(posts.length >= 1);
  for (const p of posts) assert.ok(p.title && p.description && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
});
