import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { AGENT_BLOG, autoSeoTitle, BLOG, buildWriting, PAGE_SIZE as WRITING_PAGE_SIZE, TOPICS, loadPosts, parseFrontMatter, postPageTitle, rankRelated, relatedPosts, renderFeed, renderIndex, renderPost, TITLE_BUDGET, WRITING_PATH } from './writing.mjs';

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
  assert.deepEqual(await buildWriting(out, BASE, { root }), ['hello', 'topic/tools', 'podcast']);
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
  // Posts written since the move to Cloudflare link the live origin instead.
  assert.equal(relinkSite('<a href="https://marisstella.app/writing/">w</a>', '../../'), '<a href="../../writing/">w</a>');
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

test('topics: fiction files under stories, though its shelf is a venture; a post about running a shelf does not', async () => {
  const { topicOf, TOPICS } = await import('./writing.mjs');
  const projects = { research: new Set(), ventures: new Set(['hearth-and-horizon', 'saints-by-candlelight']) };
  assert.ok(TOPICS.some((t) => t.id === 'stories'));
  assert.equal(topicOf(['fiction', 'hearth-and-horizon', 'science-fiction'], '', projects), 'stories');
  assert.equal(topicOf(['creative', 'saints-by-candlelight', 'podcast'], '', projects), 'stories');
  assert.equal(topicOf(['fiction', 'for-other-minds', 'ai-agents']), 'stories', 'a story for agents is still a story');
  assert.equal(topicOf(['process', 'hearth-and-horizon', 'automation'], '', projects), 'tools', 'unchanged: the venture rule, as before');
  assert.equal(topicOf(['hearth-and-horizon', 'audio', 'hosting', 'process'], '', projects), 'tools');
  assert.equal(topicOf(['process', 'hearth-and-horizon', 'fiction'], '', projects), 'tools', 'the story queue post is about the queue');
  assert.equal(topicOf(['opinion', 'fiction']), 'agents');
  assert.equal(topicOf(['polish', 'seo', 'stories']), 'site', 'a post about the Stories pages is not fiction');
});

test('topics: site craft and test campaigns leave Tools and projects; a tool-specific design or speed post stays', async () => {
  const { topicOf, TOPICS } = await import('./writing.mjs');
  const projects = { research: new Set(['marine-hull']), ventures: new Set(['dupehound', 'einvoice-preflight']) };
  assert.ok(TOPICS.some((t) => t.id === 'site') && TOPICS.some((t) => t.id === 'testing'));
  // Strong tags win over a named tool: a red-team pass on a tool is about the tests.
  assert.equal(topicOf(['redteam', 'einvoice-preflight', 'testing'], '', projects), 'testing');
  assert.equal(topicOf(['mutation-testing', 'ai-agents'], '', projects), 'testing');
  assert.equal(topicOf(['polish', 'dupehound', 'css'], '', projects), 'site');
  assert.equal(topicOf(['seo', 'tax'], '', projects), 'site');
  assert.equal(topicOf(['aeo', 'llms-txt'], '', projects), 'site');
  // Research and fiction still come first.
  assert.equal(topicOf(['polish', 'marine-hull'], '', projects), 'research');
  assert.equal(topicOf(['redteam', 'research'], '', projects), 'research');
  // Loose tags only when nothing else matched.
  assert.equal(topicOf(['accessibility', 'dupehound'], '', projects), 'tools', 'an accessibility feature of one tool');
  assert.equal(topicOf(['accessibility', 'contrast'], '', projects), 'site');
  assert.equal(topicOf(['testing', 'dupehound'], '', projects), 'tools');
  assert.equal(topicOf(['testing', 'node'], '', projects), 'testing');
  assert.equal(topicOf(['ci', 'ai-agents'], '', projects), 'agents', 'a CI post about the fleet stays with agents');
  assert.equal(topicOf(['ci', 'regex'], '', projects), 'infrastructure');
  assert.equal(topicOf(['performance', 'raw', 'photography'], '', projects), 'tools', 'making one tool faster is about the tool');
});

test('topics: a tag naming a research/ project files the post under research, a ventures/ one under tools', async () => {
  const { topicOf, projectSlugs } = await import('./writing.mjs');
  const projects = { research: new Set(['marine-hull']), ventures: new Set(['sales-agent']) };
  assert.equal(topicOf(['marine-hull', 'simulation']), 'tools', 'without the project list the old fallback stands');
  assert.equal(topicOf(['marine-hull', 'simulation'], '', projects), 'research');
  assert.equal(topicOf(['sales-agent', 'ai-agents'], '', projects), 'tools');
  assert.equal(topicOf(['ai-agents'], '', projects), 'agents');
  assert.equal(topicOf(['start-here', 'marine-hull'], '', projects), 'start');
  assert.equal(topicOf(['marine-hull'], 'agents', projects), 'agents');
  // loadPosts reads the folders of the repo it is given.
  const root = repoWith({ '2026-10-01-x.md': post('X', '2026-10-01').replace(/^tags:.*$/m, 'tags: [marine-hull]') });
  mkdirSync(path.join(root, 'research', 'marine-hull'), { recursive: true });
  writeFileSync(path.join(root, 'research', 'marine-hull', 'README.md'), '# m\n');
  assert.deepEqual([...projectSlugs(root).research], ['marine-hull']);
  assert.equal(loadPosts(root)[0].topic, 'research');
  // And on the real repository: every post that names a research project is a research finding unless it says otherwise.
  const real = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const slugs = projectSlugs(real);
  assert.ok(slugs.research.has('marine-hull') && slugs.ventures.has('ai-bookkeeper'));
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
  assert.match(older, /<a class="topic" href="\.\.\/topic\/research\/">Research findings<\/a>/);
  assert.match(older, /<a href="\.\.\/topic\/research\/">More in Research findings<\/a>/);
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
  assert.deepEqual(await buildWriting(out, BASE, { root }), ['hello', 'topic/tools', 'podcast', 'agents', 'agents/for-you']);
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

test('rankRelated ranks by rare shared tags and title words, not by recency', () => {
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
  assert.deepEqual(rankRelated(posts[3], posts, 3).map((p) => p.slug), ['hull-3', 'hull-1', 'filler-0']);
  // Two shared rare title words outrank one shared tag; equal scores go to the nearer date (hull-3 before hull-2).
  assert.deepEqual(rankRelated(posts[2], posts, 3).map((p) => p.slug), ['words', 'hull-3', 'hull-2']);
  // A tag on more than a fifth of the posts (research) says nothing: with nothing else shared, the
  // same topic nearest in date fills first, then the other topics, never the post itself.
  assert.deepEqual(rankRelated(posts[0], posts, 3).map((p) => p.slug), ['new-b', 'words', 'hull-2']);
  // The old rule gave every post in a topic the topic's newest posts; the series no longer points at them.
  for (const p of posts.slice(2, 5)) assert.ok(!rankRelated(p, posts, 3).some((r) => r.slug.startsWith('new-')), p.slug);
});

test('relatedPosts gives every post an inbound link, taken from the weakest slot of its best match', () => {
  const mk = (slug, date, topic, tags) => ({ slug, date, topic, tags, title: slug });
  const posts = [
    mk('a', '2026-10-01', 'x', ['pair']),
    mk('b', '2026-10-02', 'x', ['pair']),
    mk('c', '2026-10-20', 'x', ['pair']),
    ...Array.from({ length: 12 }, (_, i) => mk(`f${i}`, `2026-0${1 + (i % 9)}-1${i % 10}`, 'y', [`own-${i}`])),
  ];
  const inbound = (fn, n) => {
    const count = new Map(posts.map((p) => [p.slug, 0]));
    for (const p of posts) for (const r of fn(p, posts, n)) count.set(r.slug, count.get(r.slug) + 1);
    return count;
  };
  // Ranking alone: a and c both list b (nearest in date), so nobody lists c.
  assert.equal(inbound(rankRelated, 1).get('c'), 0);
  // Balanced: c's best match b cannot spare its slot (a would lose its only link), so a links c.
  assert.deepEqual(['a', 'b', 'c'].map((s) => relatedPosts(posts.find((p) => p.slug === s), posts, 1)[0].slug), ['c', 'a', 'b']);
  for (const n of [1, 2, 5]) {
    assert.ok([...inbound(relatedPosts, n).values()].every((k) => k > 0), `n=${n}: no orphan`);
    // Only the last slot ever changes, and a post never lists itself or the same post twice.
    for (const p of posts) {
      const got = relatedPosts(p, posts, n).map((r) => r.slug);
      assert.deepEqual(got.slice(0, -1), rankRelated(p, posts, n).map((r) => r.slug).slice(0, -1), p.slug);
      assert.ok(!got.includes(p.slug) && new Set(got).size === got.length, p.slug);
    }
  }
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

// The filter controls read as one designed row (polish 2026-11-13): the menus match the search box's
// height, sit two to a row so a phone never clips "Newest first", and Clear lives on the count line.
test('finder: menus share the search box height and Clear sits beside the count, not in the menu row', async () => {
  const root = repoWith({ '2026-10-01-one.md': post('One', '2026-10-01') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-finder-row-'));
  await buildWriting(out, BASE, { root });
  const html = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  const h = (sel) => html.match(new RegExp(sel.replace(/[.[\]]/g, '\\$&') + ' \\{[^}]*?height:(\\d+px)'))?.[1];
  assert.equal(h('.finder input[type=search]'), '42px');
  assert.equal(h('.finder select'), '42px');
  assert.match(html, /\.finder \.row \{ display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/);
  const row = html.match(/<div class="row">([\s\S]*?)<\/div>/)[1];
  assert.doesNotMatch(row, /id="clear"/);
  assert.match(html, /<div class="foot"><p id="count"[^>]*>[^<]*<\/p><button type="button" id="clear">Clear filters<\/button><\/div>/);
});

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

// Ten topic chips wrapped to six rows (275 px) on a 390 px phone, above the first post (polish 2026-11-15).
// Under 640 px they are one sideways row; the script fades whichever end has more chips and
// scrolls a topic chosen from the URL into view.
test('finder: topic chips are one sideways row on a phone, faded at the end that has more', async () => {
  const root = repoWith({ '2026-10-01-one.md': post('One', '2026-10-01') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-finder-chips-'));
  await buildWriting(out, BASE, { root });
  const html = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  const phone = html.match(/@media \(max-width:639px\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(phone, /\.chips \{ flex-wrap:nowrap; overflow-x:auto;/);
  assert.match(phone, /\.chips > \* \{ flex:none; white-space:nowrap;/, 'every chip, buttons and the podcast index\'s links alike, keeps its width in the row');
  assert.match(phone, /\.chips > a \{ display:inline-flex;/);
  for (const end of ['start', 'end', 'both']) assert.match(phone, new RegExp(`\\.chips\\[data-fade=${end}\\] \\{[^}]*mask-image`));

  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("getElementById('posts')"));
  const handlers = {};
  const row = { scrollWidth: 1600, clientWidth: 356, scrollLeft: 0, offsetLeft: 0, dataset: {}, removeAttribute(k) { if (k === 'data-fade') delete this.dataset.fade; }, addEventListener(t, f) { handlers[t] = f; } };
  const chip = (id, offsetLeft) => ({ dataset: { topicChip: id }, parentElement: row, offsetLeft, offsetWidth: 100, addEventListener() {}, setAttribute() {} });
  const chips = [chip('', 16), chip('agents', 400), chip('infrastructure', 1480)];
  const el = () => ({ value: '', hidden: true, textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, focus() {} });
  const run = (search) => {
    const els = { posts: { children: [], appendChild() {} }, q: el(), tag: { ...el(), selectedIndex: 0 }, sort: el(), count: el(), none: el(), clear: el(), finder: el() };
    vm.runInNewContext(script, {
      document: { getElementById: (id) => els[id], querySelectorAll: (s) => (s === '[data-topic-chip]' ? chips : []) },
      location: { search, pathname: '/writing/' }, history: { replaceState() {} }, addEventListener() {},
      fetch: () => Promise.resolve({ ok: false }), URLSearchParams, Array, String,
    });
  };
  run('');
  assert.equal(row.scrollLeft, 0);
  assert.equal(row.dataset.fade, 'end');
  row.scrollLeft = 500; handlers.scroll();
  assert.equal(row.dataset.fade, 'both');
  row.scrollLeft = 0;
  run('?topic=infrastructure');
  assert.equal(row.scrollLeft, 1480 - (356 - 100) / 2);
  row.scrollLeft = 1244; handlers.scroll();
  assert.equal(row.dataset.fade, 'start');
  row.scrollWidth = 356; row.scrollLeft = 0; handlers.scroll();
  assert.equal(row.dataset.fade, undefined, 'no fade when every chip fits');
});

test('each topic has its own crawlable page: title, description, list, pager, sitemap slug, links in', async () => {
  const files = { '2026-10-01-a-finding.md': post('A finding', '2026-10-01', 'topic: research\n') };
  // One more agents post than a page holds, so the agents topic has a page 2.
  for (let i = 0; i <= WRITING_PAGE_SIZE; i++) {
    const d = `2026-09-${String((i % 28) + 1).padStart(2, '0')}`;
    files[`${d}-note-${i}.md`] = post(`Note ${i}`, d, 'topic: agents\n');
  }
  const root = repoWith(files);
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-topic-'));
  const slugs = await buildWriting(out, BASE, { root });
  const w = path.join(out, WRITING_PATH);
  // In the sitemap: each topic with a post, page 1 only; no page for an empty topic.
  assert.ok(slugs.includes('topic/research') && slugs.includes('topic/agents'));
  assert.ok(!slugs.includes('topic/stories') && !slugs.some((s) => s.startsWith('topic/agents/page')));
  await assert.rejects(fs.access(path.join(w, 'topic/stories')));
  const research = await fs.readFile(path.join(w, 'topic/research/index.html'), 'utf8');
  const seo = TOPICS.find((t) => t.id === 'research').seo;
  assert.match(research, new RegExp(`<title>${seo}`));
  assert.match(research, /<h1>Research findings<\/h1>/);
  assert.match(research, /<link rel="canonical" href="https:\/\/example\.test\/site\/writing\/topic\/research\/">/);
  assert.match(research, /"@type":"CollectionPage"/);
  assert.match(research, /"@type":"BreadcrumbList"/);
  assert.match(research, /<a href="\.\.\/\.\.\/a-finding\/">A finding<\/a>/);
  assert.doesNotMatch(research, /note-0/, 'only the topic\'s own posts');
  assert.doesNotMatch(research, /<span class="topic">/, 'no topic pill repeated on every card');
  assert.doesNotMatch(research, /noindex/);
  assert.match(research, /<span aria-current="page">Research findings <span class="n">1<\/span><\/span>/);
  assert.match(research, /<a href="\.\.\/\.\.\/topic\/agents\/">Building with AI agents <span class="n">51<\/span><\/a>/);
  // Page 2 of a long topic: noindex, its own canonical, links back up.
  const agents2 = await fs.readFile(path.join(w, 'topic/agents/page/2/index.html'), 'utf8');
  assert.match(agents2, /<meta name="robots" content="noindex">/);
  assert.match(agents2, /href="https:\/\/example\.test\/site\/writing\/topic\/agents\/page\/2\/"/);
  assert.match(agents2, /<a href="\.\.\/\.\.\/\.\.\/\.\.\/note-\d+\/">/);
  // The blog index links every topic page, outside the script-only finder.
  const index = await fs.readFile(path.join(w, 'index.html'), 'utf8');
  assert.match(index, /<nav class="topic-nav"[^>]*><h2 id="topic-nav-h">Browse by topic<\/h2><ul><li><a href="topic\/agents\/">/);
});

test('every topic page title fits a search result and every description a snippet', () => {
  for (const t of TOPICS) {
    assert.ok(t.seo && t.seo.length <= TITLE_BUDGET, `${t.id}: seo title "${t.seo}" over ${TITLE_BUDGET}`);
    assert.ok(t.blurb.length <= 160, `${t.id}: blurb over 160 characters`);
  }
});

test('a post may not take the slug "topic", which holds the topic pages', () => {
  const root = repoWith({ '2026-10-01-topic.md': post('Topic', '2026-10-01') });
  assert.throws(() => loadPosts(root), /topic/);
});

import { pagerWindow, renderPager } from './writing.mjs';

test('the pager window shows first, last and two either side, with a gap only where pages are hidden', () => {
  assert.deepEqual(pagerWindow(1, 98), [1, 2, 3, null, 98]);
  assert.deepEqual(pagerWindow(50, 98), [1, null, 48, 49, 50, 51, 52, null, 98]);
  assert.deepEqual(pagerWindow(98, 98), [1, null, 96, 97, 98]);
  // A gap of one page shows the page itself, not an ellipsis standing for one number.
  assert.deepEqual(pagerWindow(4, 98), [1, 2, 3, 4, 5, 6, null, 98]);
  assert.deepEqual(pagerWindow(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pagerWindow(1, 2), [1, 2]);
});

test('a long pager shows a short row and keeps every page one click away in a closed details', () => {
  const html = renderPager(50, 98, '../../');
  const row = html.match(/<\/p><p class="nums">(.*?)<\/p>/)[1];
  assert.equal([...row.matchAll(/<a /g)].length, 6);
  assert.match(row, /<span aria-current="page">50<\/span>/);
  assert.equal([...html.matchAll(/aria-current/g)].length, 1);
  assert.match(html, /<details class="all"><summary>All 98 pages<\/summary>/);
  const all = html.match(/<details class="all">.*<\/details>/)[0];
  assert.equal([...all.matchAll(/<a href/g)].length, 97);
  assert.match(all, /href="\.\.\/\.\.\/"/);
  assert.match(all, /href="\.\.\/\.\.\/page\/98\/"/);
  // Short pagers have nothing hidden, so no details.
  assert.doesNotMatch(renderPager(2, 5, ''), /<details/);
  assert.equal(renderPager(1, 1, ''), '');
});

test('Tools and projects: a project with three posts gets its own page, linked from the topic page, its posts and the sitemap', async () => {
  const { projectName, projectOf } = await import('./writing.mjs');
  const tagged = (slug, date, tags) => [`${date}-${slug}.md`, post(slug, date).replace(/^tags:.*$/m, `tags: [${tags}]`)];
  const root = repoWith(Object.fromEntries([
    tagged('a1', '2026-10-01', 'framer'),
    tagged('a2', '2026-10-02', 'framer, notes'),
    tagged('a3', '2026-10-03', 'framer'),
    tagged('b1', '2026-10-04', 'small'),
    tagged('c1', '2026-10-05', 'tools'),
  ]));
  for (const [slug, readme] of [['framer', '# Framer Pro: stud layout for a house\n'], ['small', '']]) {
    mkdirSync(path.join(root, 'ventures', slug), { recursive: true });
    writeFileSync(path.join(root, 'ventures', slug, 'README.md'), readme);
  }
  assert.equal(projectName('framer', root), 'Framer Pro');
  assert.equal(projectName('small', root), 'small', 'no heading: the slug');
  assert.equal(projectOf(['framer'], 'research', { research: new Set(), ventures: new Set(['framer']) }), undefined, 'only Tools and projects posts group by project');
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-out-'));
  const pages = await buildWriting(out, BASE, { root, published: new Set(['framer']) });
  assert.ok(pages.includes('topic/tools/framer'), 'the project page is in the sitemap');
  assert.ok(!pages.some((p) => p.includes('topic/tools/small')), 'one post is not enough for a page');
  const topic = await fs.readFile(path.join(out, 'writing/topic/tools/index.html'), 'utf8');
  assert.match(topic, /<nav class="topic-nav project-nav lead"[^>]*><h2 id="project-nav-h">By project<\/h2><ul><li><a href="framer\/">Framer Pro <span class="n">3<\/span><\/a><\/li><\/ul>/);
  assert.match(topic, /3 of 5 posts are about these 1 projects; all 5 are listed below/);
  assert.ok(topic.indexOf('project-nav') < topic.indexOf('id="posts"'), 'the project links come before the date list');
  const page = await fs.readFile(path.join(out, 'writing/topic/tools/framer/index.html'), 'utf8');
  assert.equal((page.match(/<h1/g) || []).length, 1);
  assert.match(page, /<title>Framer Pro: how it was built, post by post/);
  assert.match(page, /<link rel="canonical" href="https:\/\/example\.test\/site\/writing\/topic\/tools\/framer\/">/);
  assert.match(page, /href="\.\.\/\.\.\/\.\.\/\.\.\/framer\/">Open Framer Pro<\/a>/, 'the tool is linked from the site root');
  for (const slug of ['a1', 'a2', 'a3']) assert.ok(page.includes(`href="../../../${slug}/"`), `${slug} is listed`);
  assert.ok(!page.includes('href="../../../c1/"'), 'a post about no project is not');
  assert.match(page, /"@type":"CollectionPage"/);
  assert.match(page, /"name":"Framer Pro","item":"https:\/\/example\.test\/site\/writing\/topic\/tools\/framer\/"/);
  const a1 = await fs.readFile(path.join(out, 'writing/a1/index.html'), 'utf8');
  assert.match(a1, /<a href="\.\.\/topic\/tools\/framer\/">More on Framer Pro<\/a>/);
  const b1 = await fs.readFile(path.join(out, 'writing/b1/index.html'), 'utf8');
  assert.ok(!b1.includes('More on'), 'no link to a page that does not exist');
});

test('the phone keeps the "By project" chips to one sideways row', async () => {
  const { renderTopicPage } = await import('./writing.mjs');
  const html = renderTopicPage([], 'tools', { projects: [{ slug: 'x', name: 'X', count: 3 }] });
  assert.match(html, /@media \(max-width:639px\) \{\s*\.topic-nav\.lead ul \{ flex-wrap:nowrap; overflow-x:auto;/);
});

test('Research findings: a programme with three posts gets a page that leads with its question and links the programme', async () => {
  const { projectOf } = await import('./writing.mjs');
  const tagged = (slug, date, tags) => [`${date}-${slug}.md`, post(slug, date).replace(/^tags:.*$/m, `tags: [${tags}]`)];
  const root = repoWith(Object.fromEntries([
    tagged('r1', '2026-10-01', 'hull-study, research'),
    tagged('r2', '2026-10-02', 'hull-study'),
    tagged('r3', '2026-10-03', 'hull-study, negative-result'),
    tagged('r4', '2026-10-04', 'research'),
    tagged('t1', '2026-10-05', 'framer'),
    tagged('t2', '2026-10-06', 'framer'),
    tagged('t3', '2026-10-07', 'framer'),
  ]));
  mkdirSync(path.join(root, 'research', 'hull-study'), { recursive: true });
  writeFileSync(path.join(root, 'research', 'hull-study', 'README.md'), '# hull-study: which hull?\n');
  mkdirSync(path.join(root, 'research', '_homepage'), { recursive: true });
  writeFileSync(path.join(root, 'research', '_homepage', 'projects.json'), JSON.stringify({ themes: [{ id: 'm', projects: [{ slug: 'hull-study', title: 'Which hull goes <em>furthest</em> per kWh?' }] }] }));
  mkdirSync(path.join(root, 'ventures', 'framer'), { recursive: true });
  writeFileSync(path.join(root, 'ventures', 'framer', 'README.md'), '# Framer Pro\n');
  const sets = { research: new Set(['hull-study']), ventures: new Set(['framer']) };
  assert.equal(projectOf(['hull-study'], 'research', sets), 'hull-study');
  assert.equal(projectOf(['hull-study'], 'tools', sets), undefined, 'a research slug does not group a tools post');
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-out-'));
  const pages = await buildWriting(out, BASE, { root, published: new Set(['framer']) });
  assert.ok(pages.includes('topic/research/hull-study'), 'the programme page is in the sitemap');
  assert.ok(pages.includes('topic/tools/framer'), 'tool projects keep their pages');
  const topic = await fs.readFile(path.join(out, 'writing/topic/research/index.html'), 'utf8');
  assert.match(topic, /<h2 id="project-nav-h">By programme<\/h2><ul><li><a href="hull-study\/" title="Which hull goes furthest per kWh\?">hull-study <span class="n">3<\/span><\/a><\/li><\/ul>/);
  assert.match(topic, /3 of 4 posts are about these 1 programmes/);
  assert.ok(!topic.includes('framer/'), 'tool projects stay off the research topic page');
  const tools = await fs.readFile(path.join(out, 'writing/topic/tools/index.html'), 'utf8');
  assert.ok(!tools.includes('hull-study'), 'and research programmes off the tools page');
  const page = await fs.readFile(path.join(out, 'writing/topic/research/hull-study/index.html'), 'utf8');
  assert.equal((page.match(/<h1/g) || []).length, 1);
  assert.match(page, /<h1>Which hull goes furthest per kWh\?<\/h1>/, 'the question, tags stripped, is the heading');
  assert.match(page, /<title>hull-study findings: Which hull goes furthest per kWh\?/);
  const { clipTitle } = await import('./writing.mjs');
  assert.equal(clipTitle('short'), 'short');
  assert.equal(clipTitle(`x findings: Which one? ${'word '.repeat(20)}`), 'x findings: Which one?');
  const clipped = clipTitle(`x findings: ${'word '.repeat(30)}`);
  assert.ok(clipped.length <= 70 && clipped.endsWith('word…'), clipped);
  assert.match(page, /href="\.\.\/\.\.\/\.\.\/\.\.\/research\/hull-study\/">Read the hull-study programme<\/a>/);
  assert.match(page, /"about":\{"@type":"ResearchProject"/);
  assert.match(page, /<h2 id="project-nav-h">Other programmes<\/h2>/);
  for (const slug of ['r1', 'r2', 'r3']) assert.ok(page.includes(`href="../../../${slug}/"`), `${slug} is listed`);
  assert.ok(!page.includes('href="../../../r4/"'));
  const r1 = await fs.readFile(path.join(out, 'writing/r1/index.html'), 'utf8');
  assert.match(r1, /<a href="\.\.\/topic\/research\/hull-study\/">More on hull-study<\/a>/);
  const t1 = await fs.readFile(path.join(out, 'writing/t1/index.html'), 'utf8');
  assert.match(t1, /<a href="\.\.\/topic\/tools\/framer\/">More on Framer Pro<\/a>/);
});

test('researchLede: whole sentences from the registry summary, boilerplate opener skipped', async () => {
  const { researchLede } = await import('./writing.mjs');
  assert.equal(
    researchLede('An open research programme rather than a finished project. A twin is biased; real trials are scarce. More.', 40),
    'A twin is biased; real trials are scarce.',
  );
  assert.equal(researchLede('Speed falls as n<sup>1.5</sup>, at 200&nbsp;kg (Smith et al. 2022). Next.', 200), 'Speed falls as n^1.5, at 200 kg (Smith et al. 2022). Next.', 'tags out, entities decoded, "et al." is no stop');
  assert.equal(researchLede('One sentence of forty-two characters here.', 30), 'One sentence of forty-two characters here.', 'kept whole up to 1.5 times the budget');
  assert.equal(researchLede('One sentence of forty-two characters here.', 30, { stretch: 1 }), 'One sentence of forty-two…', 'a meta description clips at the budget');
  assert.equal(researchLede('A very long first sentence that runs well past the budget given.', 20), 'A very long first…');
  assert.equal(researchLede('', 160), '');
  assert.equal(researchLede('An open research programme. Only this.', 160), 'Only this.');
});

test('Research findings: a programme with a registry summary gets it as the dek and meta description', async () => {
  const tagged = (slug, date) => [`${date}-${slug}.md`, post(slug, date).replace(/^tags:.*$/m, 'tags: [hull-study]')];
  const root = repoWith(Object.fromEntries([tagged('r1', '2026-10-01'), tagged('r2', '2026-10-02'), tagged('r3', '2026-10-03')]));
  mkdirSync(path.join(root, 'research', 'hull-study'), { recursive: true });
  writeFileSync(path.join(root, 'research', 'hull-study', 'README.md'), '# hull-study\n');
  mkdirSync(path.join(root, 'research', '_homepage'), { recursive: true });
  const summary = 'An open research programme. A catamaran carries 200&nbsp;kg <em>furthest</em> per kWh at 2 m/s. Milestone 2 adds drag uncertainty.';
  writeFileSync(path.join(root, 'research', '_homepage', 'projects.json'), JSON.stringify({ themes: [{ id: 'm', projects: [{ slug: 'hull-study', title: 'Which hull?', summary }] }] }));
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-out-'));
  await buildWriting(out, BASE, { root });
  const page = await fs.readFile(path.join(out, 'writing/topic/research/hull-study/index.html'), 'utf8');
  assert.match(page, /<p class="dek">A catamaran carries 200 kg furthest per kWh at 2 m\/s\. Milestone 2 adds drag uncertainty\.<\/p>\n<p class="meta">3 posts, newest first\./);
  assert.ok(!page.includes('class="dek">Every blog post'), 'the generic line gives way');
  assert.match(page, /<meta name="description" content="A catamaran carries 200 kg furthest per kWh at 2 m\/s\. Milestone 2 adds drag uncertainty\.">/);
  assert.match(page, /"@type":"CollectionPage","name":"[^"]*","description":"A catamaran carries/);
});

test('ventureLede: a tool project page leads with its llms.txt summary', async () => {
  const { ventureLede, projectGroups } = await import('./writing.mjs');
  const root = mkdtempSync(path.join(os.tmpdir(), 'venture-lede-'));
  mkdirSync(path.join(root, 'ventures', 'demo'), { recursive: true });
  writeFileSync(path.join(root, 'ventures', 'demo', 'llms.txt'), '# Demo\n\n> Free [checker](https://x.test/) for `a<b` files.\n> It names the rule. More text follows here.\n\n## Docs\n');
  assert.equal(ventureLede('demo', root, 50), 'Free checker for a<b files. It names the rule.', 'links keep text, backticks go, quote lines join, whole sentences to the budget');
  assert.equal(ventureLede('missing', root), '', 'no llms.txt, no lede');
  const posts = [1, 2, 3].map(() => ({ project: 'demo' }));
  const [group] = projectGroups(posts, { root, names: () => 'Demo' });
  assert.equal(group.lede, 'Free checker for a<b files. It names the rule. More text follows here.');
  const [plain] = projectGroups(posts, { root, names: () => 'Demo', ledes: () => '' });
  assert.equal('lede' in plain, false, 'an empty lede leaves the generic dek');
});

// Red team 2026-11-21: six mutants of this file escaped the suite. These pin the behaviour they broke.
test('projectGroups: most posts first, ties alphabetical by slug', async () => {
  const { projectGroups } = await import('./writing.mjs');
  const posts = [
    ...['zeta', 'zeta', 'zeta', 'zeta'],
    ...['beta', 'beta', 'beta'],
    ...['alpha', 'alpha', 'alpha'],
    ...['omega', 'omega', 'omega', 'omega', 'omega'],
  ].map((project) => ({ project }));
  const slugs = projectGroups(posts, { names: (s) => s, ledes: () => '' }).map((g) => g.slug);
  assert.deepEqual(slugs, ['omega', 'zeta', 'alpha', 'beta']);
});

test('a tool project page keeps the "N posts, newest first." description at exactly 160 characters', async () => {
  const { renderProjectPage } = await import('./writing.mjs');
  const mk = (i) => ({ slug: `p${i}`, title: `P${i}`, description: 'D.', date: `2026-10-0${i + 1}`, minutes: 1, tags: ['x'], topic: 'tools', project: 'demo' });
  const posts = [0, 1, 2].map(mk);
  const line = (name) => `Every blog post about ${name}: what was built, what was measured and what changed. 3 posts, newest first.`;
  const name = 'N'.repeat(160 - line('').length);
  assert.equal(line(name).length, 160);
  const html = renderProjectPage(posts, { slug: 'demo', name, count: 3, topic: 'tools' });
  assert.ok(html.includes(`<meta name="description" content="${line(name)}">`), 'a 160-character description fits the snippet budget');
});

test('relatedPosts with n = 0 returns no links and does not throw', () => {
  const mk = (slug, date) => ({ slug, date, topic: 'x', tags: ['t'], title: slug });
  const posts = [mk('a', '2026-10-01'), mk('b', '2026-10-02'), mk('c', '2026-10-03')];
  for (const p of posts) assert.deepEqual(relatedPosts(p, posts, 0), []);
});

test('finder: a search over posts.json renders each card with its date and reading time', async () => {
  const root = repoWith({ '2026-10-16-hello.md': post('Hello', '2026-10-16') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-finder-cards-'));
  await buildWriting(out, BASE, { root });
  const index = await fs.readFile(path.join(out, WRITING_PATH, 'index.html'), 'utf8');
  const script = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("getElementById('posts')"));
  const rows = JSON.parse(renderPostRows([{ slug: 'deep', title: 'Deep', description: 'D', date: '2026-03-05', minutes: 7, topic: 'agents', tags: ['a'] }]));
  const node = (tag) => ({ tag, dataset: {}, children: [], textContent: '', hidden: false, appendChild(c) { this.children.push(c); } });
  const text = (n) => (n.tag === '#text' ? n.textContent : n.textContent + n.children.map(text).join(''));
  const el = () => ({ value: '', hidden: true, textContent: '', dataset: {}, addEventListener() {}, setAttribute() {}, focus() {} });
  let shown = [];
  const list = { dataset: { all: 'posts.json', total: '1' }, children: [], appendChild() {}, replaceChildren(...xs) { shown = xs; } };
  const els = { posts: list, q: el(), tag: { ...el(), selectedIndex: 0 }, sort: el(), count: el(), none: el(), clear: el(), finder: el(), pager: el() };
  vm.runInNewContext(script, {
    document: {
      getElementById: (id) => els[id], querySelectorAll: () => [],
      createElement: node, createTextNode: (t) => ({ tag: '#text', textContent: t }),
    },
    location: { search: '?q=deep', pathname: '/writing/' }, history: { replaceState() {} },
    fetch: (url) => Promise.resolve({ ok: true, json: () => (url === 'posts.json' ? rows : {}) }),
    URLSearchParams, Array, String, Number, Date, Boolean,
  });
  for (let i = 0; i < 10 && !shown.length; i++) await new Promise((r) => setImmediate(r));
  assert.equal(shown.length, 1, 'the fetched row became a card');
  const card = shown[0];
  assert.equal(card.dataset.mins, '7');
  assert.equal(card.dataset.topic, 'agents');
  const meta = text(card.children[2]);
  assert.match(meta, /5 March 2026 · 7 min read/);
});
