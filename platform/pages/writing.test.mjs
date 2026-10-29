import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AGENT_BLOG, BLOG, buildWriting, loadPosts, parseFrontMatter, postPageTitle, renderFeed, TITLE_BUDGET, WRITING_PATH } from './writing.mjs';

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

test('the deploy leaves a malformed post out rather than the whole site', () => {
  const long = post('X', '2026-10-01').replace('About X.', 'x'.repeat(161));
  const root = repoWith({ '2026-10-01-x.md': long, '2026-10-02-good.md': post('Good', '2026-10-02') });
  const warn = console.warn;
  const warned = [];
  console.warn = (msg) => warned.push(msg);
  try {
    assert.deepEqual(loadPosts(root, undefined, { skipBad: true }).map((p) => p.slug), ['good']);
  } finally {
    console.warn = warn;
  }
  assert.match(warned.join('\n'), /::warning file=docs\/posts\/2026-10-01-x\.md::.*keep it to 160/);
  assert.throws(() => loadPosts(root, undefined, { skipBad: false }), /keep it to 160/);
});

test('no posts directory means no posts, not an error', () => {
  assert.deepEqual(loadPosts(mkdtempSync(path.join(os.tmpdir(), 'writing-empty-'))), []);
});

test('build writes an index, one page per post and a feed, each with a disclaimer', async () => {
  const root = repoWith({ '2026-10-16-hello.md': post('Hello <world>', '2026-10-16') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-out-'));
  assert.deepEqual(await buildWriting(out, BASE, { root }), ['hello', 'podcast']);
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
  // The visible "Home › Blog" trail, declared for search results too.
  const crumb = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((b) => b['@type'] === 'BreadcrumbList');
  assert.deepEqual(crumb.itemListElement.map((i) => i.item), [BASE, `${BASE}writing/`, `${BASE}writing/hello/`]);
  assert.equal(crumb.itemListElement.at(-1).name, 'Hello <world>');
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

test('a full link to the default origin follows the address the site is built for', async () => {
  const alias = 'https://default.test/site/';
  const root = repoWith({
    '2026-10-01-first.md': post('First', '2026-10-01').replace('Body text', `Try [the tool](${alias}some-tool/). Body text`),
  });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-origin-'));
  await buildWriting(out, BASE, { root, originAlias: alias });
  const page = await fs.readFile(path.join(out, WRITING_PATH, 'first/index.html'), 'utf8');
  assert.match(page, new RegExp(`<a href="${BASE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}some-tool/">the tool</a>`));
  assert.ok(!page.includes(alias), 'the default origin must not survive a build under another address');

  const same = mkdtempSync(path.join(os.tmpdir(), 'writing-origin-same-'));
  await buildWriting(same, alias, { root, originAlias: alias });
  assert.match(await fs.readFile(path.join(same, WRITING_PATH, 'first/index.html'), 'utf8'), /default\.test\/site\/some-tool\//);
});

test('feed is valid-shaped with no posts', () => {
  assert.match(renderFeed([], { baseUrl: BASE }), /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
});

test('every committed post parses', () => {
  const posts = loadPosts();
  assert.ok(posts.length >= 1);
  for (const p of posts) assert.ok(p.title && p.description && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
});

test('links to the published catalogue become root-relative on the site', async () => {
  const { relinkSite } = await import('./writing.mjs');
  const html = '<a href="https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/">x</a> <a href="https://example.com/">y</a>';
  assert.equal(relinkSite(html, '../../'), '<a href="../../changepoint-detector/">x</a> <a href="https://example.com/">y</a>');
});

test('topics: front matter wins, else the first rule the tags match; a bad topic or a reserved slug fails', async () => {
  const { topicOf } = await import('./writing.mjs');
  assert.equal(topicOf(['opinion', 'research']), 'agents');
  assert.equal(topicOf(['research', 'chip-design']), 'research');
  assert.equal(topicOf(['mcp', 'ai-agents']), 'tools');
  assert.equal(topicOf(['github-pages', 'ai-agents']), 'infrastructure');
  assert.equal(topicOf(['ai-agents', 'git']), 'agents');
  assert.equal(topicOf(['statistics']), 'tools');
  assert.equal(topicOf(['ai-agents'], 'infrastructure'), 'infrastructure');
  assert.equal(loadPosts(repoWith({ '2026-10-01-x.md': post('X', '2026-10-01', 'topic: research\n') }))[0].topic, 'research');
  assert.throws(() => loadPosts(repoWith({ '2026-10-01-x.md': post('X', '2026-10-01', 'topic: cooking\n') })), /is not one of/);
  assert.throws(() => loadPosts(repoWith({ '2026-10-01-podcast.md': post('X', '2026-10-01') })), /section of the blog/);
});

test('the index can be searched and filtered: finder, card data, full-text index, topic and tag links on posts', async () => {
  const root = repoWith({
    '2026-10-01-older.md': post('Older', '2026-10-01', 'topic: research\n').replace('Body text', 'Zlib level nine. Body text'),
    '2026-10-16-newer.md': post('Newer', '2026-10-16'),
  });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-find-'));
  await buildWriting(out, BASE, { root });
  const w = path.join(out, WRITING_PATH);
  const index = await fs.readFile(path.join(w, 'index.html'), 'utf8');
  assert.match(index, /<form id="finder" class="finder" role="search" hidden/);
  assert.match(index, /data-topic-chip="research"/);
  assert.match(index, /<option value="agents">agents \(2\)<\/option>/);
  assert.match(index, /<li data-slug="older" data-topic="research" data-tags="agents notes" data-date="2026-10-01"/);
  // The pressed state of a topic chip follows the active topic, not its opposite.
  assert.match(index, /setAttribute\('aria-pressed', String\(c\.dataset\.topicChip === topic\)\)/);
  const search = JSON.parse(await fs.readFile(path.join(w, 'search.json'), 'utf8'));
  assert.match(search.older, /zlib level nine/);
  const older = await fs.readFile(path.join(w, 'older/index.html'), 'utf8');
  assert.match(older, /<a class="topic" href="\.\.\/\?topic=research">Research findings<\/a>/);
  assert.match(older, /<a class="tag" href="\.\.\/\?tag=agents">agents<\/a>/);
  assert.match(older, /<a href="\.\.\/newer\/" rel="next">Newer →<\/a>/);
  assert.match(await fs.readFile(path.join(w, 'feed.xml'), 'utf8'), /<category term="research" label="Research findings"\/>/);
  // No agent posts: no agents section and no link to one.
  assert.doesNotMatch(index, /agent-to-agent blog/);
  await assert.rejects(fs.access(path.join(w, 'agents')));
});

test('the agent-to-agent blog publishes pages, raw Markdown with absolute links, llms.txt and llms-full.txt', async () => {
  const root = repoWith({ '2026-10-16-hello.md': post('Hello', '2026-10-16') });
  mkdirSync(path.join(root, 'docs/agent-posts'), { recursive: true });
  writeFileSync(path.join(root, 'docs/agent-posts/2026-10-21-for-you.md'), post('For you, agent', '2026-10-21').replace('[link](../../README.md)', '[link](../reports/x.md)'));
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-agents-'));
  assert.deepEqual(await buildWriting(out, BASE, { root }), ['hello', 'podcast', 'agents', 'agents/for-you']);
  const a = path.join(out, WRITING_PATH, 'agents');
  const index = await fs.readFile(path.join(a, 'index.html'), 'utf8');
  const page = await fs.readFile(path.join(a, 'for-you/index.html'), 'utf8');
  const md = await fs.readFile(path.join(a, 'for-you.txt'), 'utf8');
  const llms = await fs.readFile(path.join(a, 'llms.txt'), 'utf8');
  const full = await fs.readFile(path.join(a, 'llms-full.txt'), 'utf8');
  for (const html of [index, page]) assert.match(html, /no warranty/i);
  assert.match(index, /href="llms\.txt"/);
  assert.match(page, new RegExp(`<link rel="canonical" href="${BASE}writing/agents/for-you/">`));
  assert.match(page, /href="\.\.\/for-you\.txt" type="text\/plain">Markdown \(plain text\)</);
  assert.match(page, /data-pf-to="hub"/);
  assert.match(md, /\]\(https:\/\/github\.com\/Duncan-Haywood\/oss-monorepo\/blob\/main\/docs\/reports\/x\.md\)/);
  assert.match(llms, new RegExp(`- \\[For you, agent\\]\\(${BASE}writing/agents/for-you\\.txt\\): About For you, agent\\.`));
  assert.match(full, /# For you, agent/);
  assert.match(await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8'), /href="agents\/">agent-to-agent blog</);
});

test('post page titles keep the site name only when the whole title fits a search result', () => {
  assert.equal(postPageTitle('Short one'), 'Short one · Open Tools and Research');
  const long = 'Why our AI agents stopped blogging, and the one sentence that did it';
  assert.equal(postPageTitle(long), long);
  for (const h of ['a', 'x'.repeat(40), 'y'.repeat(80)]) assert.ok(postPageTitle(h).length <= Math.max(TITLE_BUDGET, h.length));
});

test('a post dated after today waits for its date', () => {
  const root = repoWith({
    '2026-10-01-now.md': post('Now', '2026-10-01'),
    '2999-01-01-later.md': post('Later', '2999-01-01'),
  });
  assert.deepEqual(loadPosts(root).map((p) => p.slug), ['now']);
});

test('a lone post dated after today is left off too', () => {
  const root = repoWith({ '2999-01-01-later.md': post('Later', '2999-01-01') });
  assert.deepEqual(loadPosts(root), []);
});

test('each section depth is its path segment count, or root-relative links climb the wrong number of levels', () => {
  for (const section of [BLOG, AGENT_BLOG]) assert.equal(section.depth, section.path.split('/').filter(Boolean).length, section.id);
});

test('the index tag filter keeps a post whose tag is the first in its list', async () => {
  const root = repoWith({ '2026-10-16-hello.md': post('Hello', '2026-10-16') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-tagfilter-'));
  await buildWriting(out, BASE, { root });
  const index = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  // indexOf() is 0 for the first tag: ">= 1" would hide every post filtered by its first tag.
  assert.match(index, /data-tags="[^"]*"/);
  assert.match(index, /split\(' '\)\.indexOf\(tag\.value\) >= 0/);
});

test('every committed post loads, so a 161-character description fails here and not in the site build', () => {
  assert.ok(loadPosts(undefined, undefined, { skipBad: false }).length > 0);
});
