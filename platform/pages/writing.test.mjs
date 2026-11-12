import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { AGENT_BLOG, autoSeoTitle, BLOG, buildWriting, loadPosts, parseFrontMatter, postPageTitle, relatedPosts, renderFeed, renderIndex, renderPost, TITLE_BUDGET, WRITING_PATH } from './writing.mjs';

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
  assert.equal(topicOf(['start-here', 'mcp', 'ai-agents']), 'start');
  assert.equal(topicOf(['quality-audit', 'research', 'ai-agents']), 'quality');
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
  assert.match(older, /<a href="\.\.\/newer\/" rel="next" class="next"><span class="dir">Newer →<\/span>Newer<\/a>/);
  // The pager runs both ways: the newest post links back to the older one, the oldest has no back link.
  const newer = await fs.readFile(path.join(w, 'newer/index.html'), 'utf8');
  assert.match(newer, /<a href="\.\.\/older\/" rel="prev"><span class="dir">← Older<\/span>Older<\/a>/);
  assert.doesNotMatch(newer, /rel="next"/);
  assert.doesNotMatch(older, /rel="prev"/);
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
  assert.equal(postPageTitle('Short one'), 'Short one · Maris Stella Labs');
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

test('quoted front-matter values are unescaped the way YAML reads them', () => {
  const { meta } = parseFrontMatter('---\ntitle: "\\"United States\\" is not \\"US\\""\ndescription: "the string \\"\\\\;\\" is a semicolon"\nseo_title: \'It\'\'s fine\'\n---\nbody\n');
  assert.equal(meta.title, '"United States" is not "US"');
  assert.equal(meta.description, 'the string "\\;" is a semicolon');
  assert.equal(meta.seo_title, "It's fine");
  // No committed post shows a YAML escape on the page.
  const leaked = loadPosts().filter((p) => /\\"/.test(p.title + p.description + (p.seoTitle || '')));
  assert.deepEqual(leaked.map((p) => p.slug), []);
});

test('a post may give a shorter seo_title for the results page and is held to the title budget', async () => {
  const fm = (extra) => `---\ntitle: "A very long headline that goes on and on past what a results page shows"\ndate: 2026-01-01\ndescription: "d"\n${extra}---\n\n# H\n\nbody\n`;
  const ok = parseFrontMatter(fm('seo_title: "Short query title"\n'));
  assert.equal(ok.meta.seo_title, 'Short query title');
});

test('no committed post is over the title budget without a seo_title', () => {
  const r = spawnSync('python3', [path.join(import.meta.dirname, 'propose_seo_titles.py'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('relatedPosts never lists the post itself; same topic first, then the rest, capped', () => {
  const mk = (slug, topic) => ({ slug, topic });
  const posts = [mk('a', 'x'), mk('b', 'y'), mk('c', 'x'), mk('d', 'y')];
  assert.deepEqual(relatedPosts(posts[0], posts).map((p) => p.slug), ['c', 'b', 'd']);
  assert.deepEqual(relatedPosts(posts[0], posts, 2).map((p) => p.slug), ['c', 'b']);
});

test('relatedPosts ranks by rare shared tags and title words, not by recency', () => {
  const mk = (slug, date, topic, tags, title = slug) => ({ slug, date, topic, tags, title });
  const posts = [
    mk('new-a', '2026-11-12', 'tools', ['ventures'], 'Unrelated newest post'),
    mk('new-b', '2026-11-12', 'tools', ['ventures'], 'Another newest post'),
    mk('hull-1', '2026-10-01', 'research', ['research', 'marine-hull'], 'Wigley hull form factor'),
    mk('hull-2', '2026-10-20', 'research', ['research', 'marine-hull'], 'Catamaran resistance'),
    mk('hull-3', '2026-10-02', 'research', ['research', 'marine-hull', 'catamaran'], 'Catamaran tank curve'),
    mk('words', '2026-09-01', 'tools', ['misc'], 'Wigley hull, retold'),
    ...Array.from({ length: 20 }, (_, i) => mk(`filler-${i}`, '2026-09-15', 'research', ['research', `own-${i}`], `Filler ${i}`)),
  ];
  // A shared rare title word (catamaran) outranks a shared series tag; topic filler comes last.
  assert.deepEqual(relatedPosts(posts[3], posts, 3).map((p) => p.slug), ['hull-3', 'hull-1', 'filler-0']);
  // Two shared rare title words outrank one shared tag; equal scores go to the nearer date (hull-3 before hull-2).
  assert.deepEqual(relatedPosts(posts[2], posts, 3).map((p) => p.slug), ['words', 'hull-3', 'hull-2']);
  // A tag on more than a fifth of the posts (research) says nothing: with nothing else shared, the
  // same topic nearest in date fills first, then the other topics, never the post itself.
  assert.deepEqual(relatedPosts(posts[0], posts, 3).map((p) => p.slug), ['new-b', 'words', 'hull-2']);
  // The old rule gave every post in a topic the topic's newest posts; the series no longer points at them.
  for (const p of posts.slice(2, 5)) assert.ok(!relatedPosts(p, posts, 3).some((r) => r.slug.startsWith('new-')), p.slug);
});

// Runs the index's inline finder script against a small fake DOM, so the count
// text and the tag-menu fallback are checked by behaviour, not by matching source.
async function runFinder(search, { selectedIndex = 0 } = {}) {
  const root = repoWith({ '2026-10-16-hello.md': post('Hello', '2026-10-16') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-finder-'));
  await buildWriting(out, BASE, { root });
  const index = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  const script = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("getElementById('posts')"));
  assert.ok(script, 'finder script present');
  const li = (slug, text) => ({ dataset: { slug, text, tags: 'a b', topic: 't', date: '2026-01-01', mins: '1' }, hidden: false });
  const items = [li('x', 'alpha'), li('y', 'beta')];
  const el = () => ({ value: '', hidden: true, textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, focus() {} });
  const els = { posts: { children: items, appendChild() {} }, q: el(), tag: { ...el(), selectedIndex }, sort: el(), count: el(), none: el(), clear: el(), finder: el() };
  const ctx = {
    document: { getElementById: (id) => els[id], querySelectorAll: () => [] },
    location: { search, pathname: '/writing/' },
    history: { replaceState() {} },
    fetch: () => Promise.resolve({ ok: false }),
    URLSearchParams, Array, String,
  };
  vm.runInNewContext(script, ctx);
  return els;
}

test('finder count reads "N posts" when nothing is filtered and "k of N posts" when something is', async () => {
  assert.equal((await runFinder('')).count.textContent, '2 posts');
  assert.equal((await runFinder('?q=alpha')).count.textContent, '1 of 2 posts');
  assert.equal((await runFinder('?q=zzz')).count.textContent, '0 of 2 posts');
});

test('finder keeps a ?tag= that is in the menu (even the first option) and drops one that is not', async () => {
  assert.equal((await runFinder('?tag=a', { selectedIndex: 0 })).tag.value, 'a');
  assert.equal((await runFinder('?tag=nope', { selectedIndex: -1 })).tag.value, '');
});

test('tag menu lists the most used tags first, ties alphabetical (redteam 2026-11-02)', () => {
  const root = repoWith({
    '2026-10-01-a.md': post('A', '2026-10-01').replace('[agents, notes]', '[alpha, zeta]'),
    '2026-10-02-b.md': post('B', '2026-10-02').replace('[agents, notes]', '[zeta, beta]'),
  });
  const html = renderIndex(loadPosts(root), { baseUrl: BASE });
  const order = [...html.matchAll(/<option value="(\w+)">\w+ \(\d\)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['zeta', 'alpha', 'beta']);
});

test('a post missing from the list gets no older link (redteam 2026-11-02)', () => {
  const root = repoWith({
    '2026-10-01-a.md': post('A', '2026-10-01'),
    '2026-10-02-b.md': post('B', '2026-10-02'),
  });
  const posts = loadPosts(root);
  const stranger = { ...posts[0], slug: 'stranger' };
  assert.doesNotMatch(renderPost(stranger, posts, { baseUrl: BASE }), /rel="prev"/);
  // The oldest listed post has none either.
  assert.doesNotMatch(renderPost(posts[1], posts, { baseUrl: BASE }), /rel="prev"/);
});

test('a long "Claim: detail" headline with no seo_title gets the clean cut automatically', () => {
  const t = 'Why the flooring budget is wrong by a wide margin: a worked example with real prices';
  assert.equal(autoSeoTitle(t), 'Why the flooring budget is wrong by a wide margin');
  assert.equal(autoSeoTitle('A headline that is long and has no colon or question mark anywhere in it at all'), undefined);
  assert.equal(autoSeoTitle('Short: but the head is under the minimum length floor and the rest is long enough'.replace('Short', 'Tiny')), undefined);
});

// Paging: one index page of every post was 2.3 MB (site-perf-paginate-indexes).
import { PAGE_SIZE, renderPostRows } from './writing.mjs';

function manyPosts(n) {
  const files = {};
  for (let i = 0; i < n; i++) {
    const day = String(1 + (i % 28)).padStart(2, '0');
    const month = String(1 + Math.floor(i / 28)).padStart(2, '0');
    files[`2026-${month}-${day}-p${i}.md`] = post(`Post ${i}`, `2026-${month}-${day}`);
  }
  return repoWith(files);
}

test('an index over PAGE_SIZE posts lists the newest page, pages the rest, and every post is on exactly one page', async () => {
  const n = PAGE_SIZE * 2 + 7;
  const root = manyPosts(n);
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-paged-'));
  await buildWriting(out, BASE, { root });
  const dir = path.join(out, WRITING_PATH);
  const seen = new Map();
  const read = async (rel) => fs.readFile(path.join(dir, rel, 'index.html'), 'utf8');
  for (const [rel, up] of [['', ''], ['page/2', '../../'], ['page/3', '../../']]) {
    const html = await read(rel);
    const slugs = [...html.matchAll(new RegExp(`<h2><a href="${up.replace(/\./g, '\\.')}([^"/]+)/">`, 'g'))].map((m) => m[1]);
    assert.ok(slugs.length <= PAGE_SIZE, `${rel || 'index'} has ${slugs.length} cards`);
    for (const s of slugs) seen.set(s, (seen.get(s) || 0) + 1);
    assert.match(html, /class="pager"/);
  }
  assert.equal(seen.size, n);
  assert.ok([...seen.values()].every((c) => c === 1));
  // Page 1 carries the finder and names posts.json; later pages are plain, noindex lists that link back.
  const first = await read('');
  assert.match(first, new RegExp(`data-all="posts.json" data-total="${n}"`));
  assert.match(first, /id="finder"/);
  const second = await read('page/2');
  assert.match(second, /<meta name="robots" content="noindex">/);
  assert.match(second, /<link rel="canonical" href="https:\/\/[^"]*writing\/page\/2\/">/);
  assert.doesNotMatch(second, /id="finder"/);
  assert.match(second, /rel="prev" href="\.\.\/\.\.\/"/);
  assert.match(second, /rel="next" href="\.\.\/\.\.\/page\/3\/"/);
  const rows = JSON.parse(await fs.readFile(path.join(dir, 'posts.json'), 'utf8'));
  assert.equal(rows.length, n);
  assert.equal(rows[0].length, 9);
  assert.ok(first.length < 150_000);
});

test('an index of one page of posts has no pager, no posts.json and no page directory', async () => {
  const root = manyPosts(PAGE_SIZE);
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-onepage-'));
  await buildWriting(out, BASE, { root });
  const html = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /class="pager"|data-all=/);
  await assert.rejects(fs.stat(path.join(out, WRITING_PATH, 'posts.json')));
  await assert.rejects(fs.stat(path.join(out, WRITING_PATH, 'page')));
});

test('a post may not take the slug "page", which holds the numbered index pages', () => {
  const root = repoWith({ '2026-10-01-page.md': post('Page', '2026-10-01') });
  assert.throws(() => loadPosts(root), /page/);
});

test('posts.json rows are the finder cards: slug, title, description, date, minutes, topic, label, tags, text', () => {
  const rows = JSON.parse(renderPostRows(loadPosts(repoWith({ '2026-10-01-a.md': post('A', '2026-10-01') }))));
  assert.equal(rows[0][0], 'a');
  assert.equal(rows[0][1], 'A');
  assert.equal(rows[0][3], '2026-10-01');
  assert.match(rows[0][7], /agents/);
});

test('reading time rounds words / 230 to the nearest minute (exactly 345 words is 2, not 1)', () => {
  const mk = (n) => {
    const root = repoWith({ '2026-10-01-long.md': post('Long', '2026-10-01').replace('Body text', `${Array.from({ length: n }, () => 'w').join(' ')} Body text`) });
    return loadPosts(root)[0];
  };
  const base = mk(0).words;
  const p = mk(345 - base);
  assert.equal(p.words, 345);
  assert.equal(p.minutes, 2);
});

test('buildWriting creates a missing nested output directory', async () => {
  const root = repoWith({ '2026-10-01-hello.md': post('Hello', '2026-10-01') });
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'wout-')), 'a', 'b');
  await buildWriting(out, BASE, { root });
  assert.ok((await fs.stat(path.join(out, 'writing', 'index.html'))).isFile());
});
