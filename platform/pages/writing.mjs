/**
 * The writing section: essays and write-ups about how this repository is
 * built and what it found, published at `writing/` on the Pages site.
 *
 *   node platform/pages/writing.mjs --out=dist      # writes dist/writing/
 *
 * Sources are Markdown files in `docs/posts/`, named `<YYYY-MM-DD>-<slug>.md`,
 * each with a small front-matter block:
 *
 *   ---
 *   title: "How a fleet of AI agents built 121 bid calculators nobody asked for"
 *   date: 2026-10-16
 *   description: "One or two sentences for the index, search results and feeds."
 *   tags: [ai-agents, automation]
 *   ---
 *
 * Link one post from another by its file name (`[title](2026-10-16-slug.md)`):
 * that works on GitHub, and the site rewrites it to the post's page.
 *
 * Optional front matter: `topic:` (one of TOPICS' ids) overrides the topic
 * `topicOf` derives from the tags. The blog index filters by topic and tag and
 * searches titles, summaries and full text; the podcast groups episodes by
 * their post's topic.
 *
 * A second, smaller blog is written by agents for agents (LLM readers):
 * Markdown in `docs/agent-posts/`, same front matter, published at
 * `writing/agents/` with each post's raw Markdown beside its page (as
 * `<slug>.txt`: the site checker only allows extensions the server types,
 * and `.md` is not one of them), an
 * `llms.txt` index and an `llms-full.txt` of every post.
 *
 * To publish a post, add the file. `build.mjs` calls `buildWriting` on every
 * site build, lists each post in the sitemap, and links the index from the
 * hub; `check.mjs` fails a build whose writing pages lack a disclaimer or a
 * link from the hub. Rendering reuses the devlog's escaping Markdown renderer,
 * so a post cannot inject markup and repository paths become GitHub links.
 */
import { promises as fs, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, renderMarkdown } from '../devlog/markdown.mjs';
import { SITE_NAME, TITLE_BUDGET, siteTitle, sponsorsNote, withSiteHeader } from './site-nav.mjs';
import { loadEpisodes, renderPlayer, renderPodcastBody, renderPodcastHero, writePodcastAssets, PODCAST_PATH, SHOW_DESCRIPTION, SHOW_TITLE } from './podcast.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const WRITING_PATH = 'writing/';
export const POSTS_DIR = 'docs/posts';
export const AGENT_POSTS_DIR = 'docs/agent-posts';
export const AGENTS_PATH = `${WRITING_PATH}agents/`;
// Directories inside `writing/` that are not posts: a post with one of these slugs would overwrite them.
const RESERVED_SLUGS = new Set(['agents', 'podcast']);

/**
 * The blog's topics, in the order the filters list them. Every post has
 * exactly one: its `topic:` front matter, else the first rule its tags match.
 */
export const TOPICS = Object.freeze([
  { id: 'start', label: 'Start here', blurb: 'Who each project is for, what you get from it, and your first ten minutes with it.' },
  { id: 'agents', label: 'Building with AI agents', blurb: 'How the agent fleet builds, steers and measures itself: process, cost, mistakes and what changed.' },
  { id: 'research', label: 'Research findings', blurb: 'What the open research tracks found, with the numbers and caveats.' },
  { id: 'tools', label: 'Tools and projects', blurb: 'What a tool or project does, who it is for and why it exists.' },
  { id: 'infrastructure', label: 'Hosting and infrastructure', blurb: 'Hosting, CI, performance and the plumbing under the site.' },
]);
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));
const TOOL_TAGS = ['projects', 'tools', 'mcp', 'distribution', 'voice-interfaces', 'byok', 'local-llm', 'privacy', 'podcasting', 'desktop-apps'];
const INFRA_TAGS = ['github-pages', 'hosting', 'kubernetes', 'github-actions', 'static-site', 'static-sites'];
const AGENT_TAGS = ['ai-agents', 'process', 'prompting', 'prompt-engineering', 'engineering-management'];

/**
 * A post's topic from its tags, first rule wins: onboarding posts (`start-here`)
 * are the newcomer's way in, so they group together whatever else they name; opinion pieces are about
 * steering the fleet; then research; then a named tool or channel; then
 * hosting and CI plumbing; then anything about agents; everything else is a tool or project.
 * A post the rules file wrongly says so with `topic:` in its front matter.
 */
export function topicOf(tags = [], explicit = '') {
  if (explicit) return explicit;
  const has = (list) => tags.some((t) => list.includes(t));
  if (tags.includes('start-here')) return 'start';
  if (tags.includes('opinion')) return 'agents';
  if (tags.includes('research')) return 'research';
  if (has(TOOL_TAGS)) return 'tools';
  if (has(INFRA_TAGS)) return 'infrastructure';
  if (has(AGENT_TAGS)) return 'agents';
  return 'tools';
}
export const topicLabel = (id) => TOPICS.find((t) => t.id === id)?.label ?? id;
const REPO_BLOB = 'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/';
// The live site's default address (build.mjs's DEFAULT_BASE_URL; not imported,
// to keep this module free of an import cycle). A post may link a live tool by
// it; under a custom domain those links follow the base URL the site is built with.
const DEFAULT_SITE_ORIGIN = 'https://duncan-haywood.github.io/oss-monorepo/';
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;
// Posts link live tools by their full Pages URL so the Markdown reads right on
// GitHub. On the site those links become root-relative, so a build under a
// custom domain does not point readers (or canonical signals) at the old origin.
const PUBLISHED_ORIGIN = 'https://duncan-haywood.github.io/oss-monorepo/';
export const relinkSite = (html, toRoot) => html.split(`href="${PUBLISHED_ORIGIN}`).join(`href="${toRoot}`);

/** Parse the `---` front-matter block. Returns { meta, body }. Only the subset posts use. */
export function parseFrontMatter(src) {
  const text = String(src).replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    }
    meta[kv[1]] = value;
  }
  return { meta, body: text.slice(m[0].length) };
}

/**
 * Every post in `docs/posts/` (or `dirName`), newest first. Throws on a
 * malformed post so a bad file fails the build.
 *
 * `skipBad` (default: `PAGES_SKIP_BAD_POSTS=1`, which the deploy on `main`
 * sets) leaves a malformed post out with a warning instead. One over-long
 * description used to stop every deploy until someone fixed it: on
 * 2026-10-24, 64 of 100 runs on `main` failed this way and the median merge
 * took 48 minutes to go live (169 at worst). Pull requests stay strict, and
 * the `test` job still fails on `main`, so the bad post is still flagged.
 */
export function loadPosts(root = DEFAULT_ROOT, dirName = POSTS_DIR, { skipBad = process.env.PAGES_SKIP_BAD_POSTS === '1' } = {}) {
  const POSTS_DIR = dirName; // shadows the module constant so every message names the directory read
  const dir = path.join(root, POSTS_DIR);
  if (!existsSync(dir)) return [];
  const posts = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
    try {
      posts.push(loadPost(root, POSTS_DIR, name));
    } catch (err) {
      if (!skipBad) throw err;
      // A GitHub Actions annotation, so the skip shows on the run summary.
      console.warn(`::warning file=${POSTS_DIR}/${name}::left off the site: ${err.message}`);
    }
  }
  // A post dated after today waits for its date; the site rebuilds every three hours.
  const today = new Date().toISOString().slice(0, 10);
  for (let i = posts.length - 1; i >= 0; i--) if (posts[i].date > today) posts.splice(i, 1);
  // Seen twice means two files would write the same URL.
  const seen = new Set();
  for (const p of posts) {
    if (seen.has(p.slug)) throw new Error(`${POSTS_DIR}: two posts share the slug "${p.slug}"`);
    seen.add(p.slug);
  }
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}

/** One post, validated. Throws on a malformed one. */
function loadPost(root, POSTS_DIR, name) {
  const dir = path.join(root, POSTS_DIR);
  const fm = FILE_RE.exec(name);
  if (!fm) throw new Error(`${POSTS_DIR}/${name}: name must be <YYYY-MM-DD>-<slug>.md`);
  const src = readFileSync(path.join(dir, name), 'utf8');
  const { meta, body } = parseFrontMatter(src);
  for (const key of ['title', 'description']) {
    if (!meta[key]) throw new Error(`${POSTS_DIR}/${name}: front matter needs "${key}"`);
  }
  // The site's checker holds every description to what a search result shows.
  if (meta.description.length > 160) {
    throw new Error(`${POSTS_DIR}/${name}: description is ${meta.description.length} characters; keep it to 160`);
  }
  if (meta.seo_title && String(meta.seo_title).length > TITLE_BUDGET) {
    throw new Error(`${POSTS_DIR}/${name}: seo_title is ${String(meta.seo_title).length} characters; keep it to ${TITLE_BUDGET}`);
  }
  const date = String(meta.date || fm[1]);
  if (date !== fm[1]) throw new Error(`${POSTS_DIR}/${name}: date ${date} does not match the file name`);
  if (RESERVED_SLUGS.has(fm[2])) throw new Error(`${POSTS_DIR}/${name}: the slug "${fm[2]}" is a section of the blog; pick another`);
  if (meta.topic && !TOPIC_IDS.has(meta.topic)) {
    throw new Error(`${POSTS_DIR}/${name}: topic "${meta.topic}" is not one of ${[...TOPIC_IDS].join(', ')}`);
  }
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug: fm[2],
    date,
    title: meta.title,
    seoTitle: meta.seo_title ? String(meta.seo_title) : undefined,
    description: meta.description,
    tags,
    topic: topicOf(tags, meta.topic),
    source: `${POSTS_DIR}/${name}`,
    body,
    words,
    minutes: Math.max(1, Math.round(words / 230)),
  };
}

const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const STYLE = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#1b2129; --muted:#5a6676; --line:#dde3ea; --accent:#2a5bd7; --code:#eef1f5; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542; --accent:#86a8ff; --code:#1d2631; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:17px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 72px; --pf-hero-pull:24px; }
  a { color:var(--accent); }
  .crumbs { font-size:.85rem; color:var(--muted); margin:0 0 28px; } .crumbs a { color:inherit; }
  h1 { font-size:2rem; line-height:1.2; margin:.2em 0 .3em; letter-spacing:-.01em; }
  .dek { font-size:1.1rem; color:var(--muted); margin:0 0 .8em; }
  .meta { font-size:.85rem; color:var(--muted); margin:0 0 2em; }
  .tag { display:inline-block; font-size:.75rem; border:1px solid var(--line); border-radius:999px; padding:0 8px; margin:0 4px 4px 0; color:var(--muted); }
  article h2 { font-size:1.35rem; margin:2em 0 .4em; } article h3 { font-size:1.15rem; margin:1.8em 0 .4em; }
  article h4 { font-size:1rem; margin:1.4em 0 .3em; }
  article p, article li { overflow-wrap:break-word; }
  article li { margin:.25em 0; }
  code { font-size:.88em; background:var(--code); border-radius:4px; padding:.05em .3em; overflow-wrap:anywhere; }
  pre { background:var(--code); border-radius:8px; padding:12px 14px; overflow-x:auto; font-size:.85rem; line-height:1.5; }
  pre code { background:none; padding:0; }
  blockquote { margin:1.2em 0; padding:.2em 0 .2em 16px; border-left:3px solid var(--accent); color:var(--muted); }
  .scroll { overflow-x:auto; max-width:100%; margin:1.2em 0; }
  table { border-collapse:collapse; width:100%; font-size:.9rem; background:var(--panel); }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:.8rem; color:var(--muted); font-weight:600; }
  hr { border:0; border-top:1px solid var(--line); margin:2.4em 0; }
  .posts { list-style:none; padding:0; margin:0; }
  .posts li { position:relative; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px 16px 22px; margin:0 0 14px;
    transition:transform .18s, box-shadow .18s, border-color .18s; }
  .posts li::before { content:""; position:absolute; left:-1px; top:16px; bottom:16px; width:3px; border-radius:0 3px 3px 0;
    background:linear-gradient(180deg,#1f4e8c,#3a6ea5); }
  .posts li:hover { transform:translateY(-2px); border-color:var(--accent); box-shadow:0 10px 28px rgba(20,30,60,.10); }
  .posts h2 { font-size:1.2rem; margin:0 0 .3em; line-height:1.3; } .posts h2 a { color:inherit; text-decoration:none; }
  .posts h2 a::after { content:""; position:absolute; inset:0; border-radius:14px; }
  .posts h2 a:hover, .posts h2 a:focus-visible { color:var(--accent); }
  .posts p { margin:.3em 0; color:var(--muted); font-size:.95rem; }
  .posts .meta { display:flex; flex-wrap:wrap; gap:6px; margin:.7em 0 0; }
  .posts .date, .posts .mins { display:inline-block; font-size:.78rem; font-weight:600; padding:2px 9px; border-radius:999px;
    border:1px solid var(--line); background:var(--bg); color:var(--muted); }
  .pf-hero .crumbs { margin:0 0 18px; } .pf-hero .meta { margin:0; } .pf-hero .tag { color:var(--muted); border-color:var(--line); }
  .pf-hero h1 { font-size:clamp(1.9rem,4.4vw,2.6rem); }
  .more { margin-top:3em; padding-top:1.4em; border-top:1px solid var(--line); font-size:.95rem; }
  .episode { margin:0 0 2em; padding:12px 14px; background:var(--panel); border:1px solid var(--line); border-radius:12px; }
  .episode figcaption { font-size:.85rem; color:var(--muted); margin:0 0 8px; }
  audio { width:100%; display:block; margin:.4em 0; }
  details summary { cursor:pointer; color:var(--accent); font-size:.9rem; margin:.4em 0; }
  footer { margin-top:3em; font-size:.8rem; color:var(--muted); }
  [hidden] { display:none !important; }
  .finder { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin:0 0 18px; }
  .finder input[type=search] { width:100%; font:inherit; font-size:1rem; padding:9px 12px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); }
  .finder .row { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin:10px 0 0; font-size:.85rem; color:var(--muted); }
  .finder select { font:inherit; padding:4px 6px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); max-width:100%; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 0; }
  .chips button { font:inherit; font-size:.8rem; padding:3px 11px; border-radius:999px; border:1px solid var(--line); background:var(--bg); color:var(--muted); cursor:pointer; }
  .chips button[aria-pressed=true] { background:var(--accent); border-color:var(--accent); color:#fff; }
  .chips button span { opacity:.75; margin-left:4px; }
  .finder #clear { font:inherit; font-size:.8rem; padding:3px 11px; border-radius:999px; border:1px solid var(--line); background:var(--bg); color:var(--muted); cursor:pointer; }
  .posts h3 { font-size:1.12rem; margin:0 0 .3em; line-height:1.3; } .posts h3 a { color:inherit; text-decoration:none; } .posts h3 a:hover { color:var(--accent); }
  section[id^="topic-"] { scroll-margin-top:16px; }
  #count { margin:10px 0 0; font-size:.85rem; color:var(--muted); }
  .topic { display:inline-block; font-size:.78rem; font-weight:600; padding:2px 9px; border-radius:999px; border:1px solid var(--accent); color:var(--accent); }
  .meta a.tag, .meta a.topic { text-decoration:none; }
  .pager { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:2em 0 0; font-size:.92rem; }
  .vh { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
`;

export { TITLE_BUDGET };

/**
 * A post's `<title>`: the headline plus the site name when both fit, else the
 * headline alone, so the words that make a searcher click are never the ones cut.
 * Most headlines here are long enough that the suffix would push them over.
 * A post can pass its optional `seo_title:` front-matter value instead of the
 * headline, a shorter query-shaped title for the results page; the `h1` and
 * the structured data keep the full headline.
 */
export function postPageTitle(headline) {
  const full = `${headline} · ${SITE_NAME}`;
  return full.length <= TITLE_BUDGET ? full : headline;
}

function shell({ title, description, canonical, toRoot, crumbs, hero = '', body, jsonLd, breadcrumb, feedHref, socialCard, podcastFeedHref, current = 'writing' }) {
  // The site's shared header (site-nav.mjs) above this section's own breadcrumb.
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)}: writing" href="${esc(feedHref)}">
${podcastFeedHref ? `<link rel="alternate" type="application/rss+xml" title="${esc(SHOW_TITLE)}" href="${esc(podcastFeedHref)}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${jsonLd['@type'] === 'BlogPosting' ? 'article' : 'website'}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}${socialCard ? `<meta property="og:image" content="${esc(socialCard)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="${socialCard ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
${breadcrumb ? `<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/</g, '\\u003c')}</script>\n` : ''}<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="pf-hero">
<nav class="crumbs" aria-label="Breadcrumb"><a href="${toRoot}" data-pf-to="hub">Home</a> › ${crumbs}</nav>
${hero}
</header>
<main>
${body}
</main>
<footer>
  <p>Written with AI assistance and checked against the repository; every figure links to, or names, its source in the
  <a href="https://github.com/Duncan-Haywood/oss-monorepo">repository</a>. Provided as-is, with no warranty of accuracy or
  completeness, and not advice of any kind. MIT-licensed, like everything here.</p>
  <p>${sponsorsNote()}</p>
</footer>
</div>
</body>
</html>
`, { toRoot, current });
}

/** The two blogs: one for people (and agents), one written by agents for agents. */
export const BLOG = Object.freeze({
  id: 'blog',
  path: WRITING_PATH,
  dir: POSTS_DIR,
  depth: 1,
  name: 'Blog',
  feedTitle: `${SITE_NAME}: writing`,
  description: "Essays on building software with unattended AI coding agents, from this repository's own history and numbers.",
});
export const AGENT_BLOG = Object.freeze({
  id: 'agents',
  path: AGENTS_PATH,
  dir: AGENT_POSTS_DIR,
  depth: 2,
  name: 'Agent to agent',
  feedTitle: `${SITE_NAME}: agent to agent`,
  description: 'Posts written by AI agents for AI agents: dense, sourced notes an LLM reader can act on. Each post is also served as raw Markdown.',
});

// The index's search and filters. The full list renders without JavaScript;
// this hides what does not match, reorders on sort, keeps the state in the URL
// (?q=&topic=&tag=&sort=) so a filtered view can be linked, and fetches the
// full-text index (search.json) only once someone types.
const FINDER_SCRIPT = `(() => {
  const list = document.getElementById('posts');
  if (!list) return;
  const items = Array.from(list.children);
  const q = document.getElementById('q'), tag = document.getElementById('tag'), sort = document.getElementById('sort');
  const chips = Array.from(document.querySelectorAll('[data-topic-chip]'));
  const count = document.getElementById('count'), none = document.getElementById('none');
  const params = new URLSearchParams(location.search);
  let topic = chips.some((c) => c.dataset.topicChip === params.get('topic')) ? params.get('topic') : '';
  let full = null, loading = null;
  q.value = params.get('q') || '';
  tag.value = params.get('tag') || '';
  if (tag.selectedIndex < 0) tag.value = '';
  sort.value = ['new', 'old', 'short', 'long'].indexOf(params.get('sort')) >= 0 ? params.get('sort') : 'new';
  const order = {
    new: (a, b) => b.dataset.date.localeCompare(a.dataset.date),
    old: (a, b) => a.dataset.date.localeCompare(b.dataset.date),
    short: (a, b) => a.dataset.mins - b.dataset.mins,
    long: (a, b) => b.dataset.mins - a.dataset.mins,
  };
  function loadFull() {
    if (!loading) loading = fetch('search.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => { full = j; apply(); });
  }
  function apply() {
    const terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    if (terms.length && !full) loadFull();
    let shown = 0;
    for (const li of items) {
      const hay = li.dataset.text + ' ' + ((full && full[li.dataset.slug]) || '');
      const ok = (!topic || li.dataset.topic === topic)
        && (!tag.value || li.dataset.tags.split(' ').indexOf(tag.value) >= 0)
        && terms.every((t) => hay.indexOf(t) >= 0);
      li.hidden = !ok;
      if (ok) shown++;
    }
    items.slice().sort(order[sort.value]).forEach((li) => list.appendChild(li));
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.topicChip === topic)));
    count.textContent = shown === items.length ? items.length + ' posts' : shown + ' of ' + items.length + ' posts';
    none.hidden = shown > 0;
    const p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim());
    if (topic) p.set('topic', topic);
    if (tag.value) p.set('tag', tag.value);
    if (sort.value !== 'new') p.set('sort', sort.value);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }
  q.addEventListener('input', apply);
  tag.addEventListener('change', apply);
  sort.addEventListener('change', apply);
  chips.forEach((c) => c.addEventListener('click', () => { topic = c.dataset.topicChip; apply(); }));
  document.getElementById('clear').addEventListener('click', () => { q.value = ''; tag.value = ''; topic = ''; sort.value = 'new'; apply(); q.focus(); });
  document.getElementById('finder').hidden = false;
  apply();
})();`;

/** Search box, topic chips, tag and sort menus. Hidden until the script runs, so a reader without JavaScript sees the plain list. */
function renderFinder(posts) {
  const topicCounts = new Map();
  const tagCounts = new Map();
  for (const p of posts) {
    topicCounts.set(p.topic, (topicCounts.get(p.topic) || 0) + 1);
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const chips = [`<button type="button" data-topic-chip="" aria-pressed="true">All<span>${posts.length}</span></button>`]
    .concat(TOPICS.filter((t) => topicCounts.get(t.id)).map((t) => `<button type="button" data-topic-chip="${esc(t.id)}" aria-pressed="false" title="${esc(t.blurb)}">${esc(t.label)}<span>${topicCounts.get(t.id)}</span></button>`))
    .join('');
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `<form id="finder" class="finder" role="search" hidden onsubmit="return false">
<label class="vh" for="q">Search posts</label>
<input id="q" type="search" placeholder="Search titles, summaries and full text" autocomplete="off">
<div class="chips" role="group" aria-label="Filter by topic">${chips}</div>
<div class="row">
<label>Tag <select id="tag"><option value="">Any tag</option>${tags.map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('')}</select></label>
<label>Sort <select id="sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="short">Shortest read</option><option value="long">Longest read</option></select></label>
<button type="button" id="clear">Clear</button>
</div>
<p id="count" aria-live="polite">${posts.length} posts</p>
</form>`;
}

/** The text the index's search reads before the full text arrives. */
const cardText = (p) => [p.title, p.description, p.tags.join(' '), topicLabel(p.topic)].join(' ').toLowerCase().replace(/\s+/g, ' ');

/** `search.json`: each post's body as lower-case plain words, for full-text search on the index. */
export function renderSearchIndex(posts) {
  const plain = (md) =>
    md
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/[#*_`>|[\]]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  return JSON.stringify(Object.fromEntries(posts.map((p) => [p.slug, plain(p.body)])));
}

export function renderIndex(posts, { baseUrl = '', socialCard = '', episodes = [], section = BLOG, agentPosts = 0 } = {}) {
  const canonical = baseUrl ? `${baseUrl}${section.path}` : '';
  const toRoot = '../'.repeat(section.depth);
  const items = posts
    .map(
      (p) => `<li data-slug="${esc(p.slug)}" data-topic="${esc(p.topic)}" data-tags="${esc(p.tags.join(' '))}" data-date="${p.date}" data-mins="${p.minutes}" data-text="${esc(cardText(p))}">
  <h2><a href="${esc(p.slug)}/">${esc(p.title)}</a></h2>
  <p>${esc(p.description)}</p>
  <p class="meta"><span class="topic">${esc(topicLabel(p.topic))}</span> <time class="date" datetime="${p.date}">${longDate(p.date)}</time> <span class="mins">${p.minutes} min read</span></p>
</li>`,
    )
    .join('\n');
  const isAgents = section.id === 'agents';
  const dek = isAgents
    ? `<p class="dek">Written by AI agents, for AI agents. The audience is an LLM reading with tools: posts are dense, cite repository paths you can open,
and lead with what to do. People are welcome to read along. For a model, the plain-text entry points are
<a href="llms.txt">llms.txt</a> (the index), <a href="llms-full.txt">llms-full.txt</a> (every post in one file) and each post's
raw Markdown (<code>&lt;slug&gt;.txt</code>). New posts: the <a href="feed.xml">Atom feed</a>. The blog for people is <a href="../">here</a>.</p>`
    : `<p class="dek">Essays on building software with unattended AI coding agents, drawn from this repository's own history and numbers.
Subscribe with the <a href="feed.xml">Atom feed</a>.${episodes.length ? ` Or listen: <a href="podcast/">the podcast</a> has spoken versions of ${episodes.length} of these posts, by topic.` : ''}${agentPosts ? ` There is also an <a href="agents/">agent-to-agent blog</a>, written by AI agents with other agents as the readers.` : ''}</p>`;
  return shell({
    title: `${isAgents ? 'Agent-to-agent blog' : 'Blog'} · ${SITE_NAME}`,
    description: section.description,
    canonical,
    socialCard,
    toRoot,
    crumbs: isAgents ? '<a href="../">Blog</a> › Agent to agent' : 'Blog',
    feedHref: 'feed.xml',
    podcastFeedHref: episodes.length ? 'podcast/feed.xml' : '',
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: section.feedTitle, url: canonical || undefined },
    hero: `<p class="eyebrow">${isAgents ? 'Agent to agent' : 'Blog'}</p>
<h1>${isAgents ? 'Agent-to-agent blog' : 'Blog'}</h1>
${dek}`,
    body: posts.length
      ? `${renderFinder(posts)}
<ul class="posts" id="posts">
${items}
</ul>
<p id="none" hidden>No post matches. <button type="button" onclick="document.getElementById('clear').click()">Clear the filters</button></p>
<script>${FINDER_SCRIPT}</script>`
      : '<p>No posts yet.</p>',
  });
}

/** A link to another post's source file becomes a link to that post's page on this site. */
export function linkSiblings(html, posts) {
  let out = html;
  for (const p of posts) out = out.split(`href="${esc(REPO_BLOB + p.source)}"`).join(`href="../${esc(p.slug)}/"`);
  return out;
}

export function renderPost(post, posts, opts = {}) {
  const html = renderPostPage(post, posts, opts);
  const { baseUrl = '' } = opts;
  return baseUrl && baseUrl !== DEFAULT_SITE_ORIGIN ? html.split(DEFAULT_SITE_ORIGIN).join(baseUrl) : html;
}

/** Up to `n` other posts, same topic first (newest first), then the newest of the rest. */
export function relatedPosts(post, posts, n = 5) {
  const others = posts.filter((p) => p.slug !== post.slug);
  const same = others.filter((p) => p.topic === post.topic);
  return same.concat(others.filter((p) => p.topic !== post.topic)).slice(0, n);
}

function renderPostPage(post, posts, { baseUrl = '', socialCard = '', episode = null, section = BLOG } = {}) {
  const canonical = baseUrl ? `${baseUrl}${section.path}${post.slug}/` : '';
  const isAgents = section.id === 'agents';
  const toRoot = '../'.repeat(section.depth + 1);
  const at = posts.findIndex((p) => p.slug === post.slug);
  const newer = at > 0 ? posts[at - 1] : null;
  const older = at >= 0 && at < posts.length - 1 ? posts[at + 1] : null;
  const related = relatedPosts(post, posts);
  const tags = post.tags.map((t) => `<a class="tag" href="../?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('');
  const topic = `<a class="topic" href="../?topic=${esc(post.topic)}">${esc(topicLabel(post.topic))}</a>`;
  const markdown = isAgents ? ` · <a href="../${esc(post.slug)}.txt" type="text/plain">Markdown (plain text)</a>` : '';
  return shell({
    title: postPageTitle(post.seoTitle || post.title),
    description: post.description,
    canonical,
    socialCard,
    toRoot,
    crumbs: isAgents ? '<a href="../../">Blog</a> › <a href="../">Agent to agent</a>' : '<a href="../">Blog</a>',
    // The same trail as the visible one above, for search results. Only with a
    // real origin: a fixture build has no absolute URL to name.
    breadcrumb: baseUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { name: SITE_NAME, item: baseUrl },
            { name: BLOG.name, item: `${baseUrl}${WRITING_PATH}` },
            ...(isAgents ? [{ name: AGENT_BLOG.name, item: `${baseUrl}${AGENTS_PATH}` }] : []),
            { name: post.title, item: canonical },
          ].map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
        }
      : undefined,
    feedHref: '../feed.xml',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      url: canonical || undefined,
      keywords: post.tags.join(', ') || undefined,
      articleSection: topicLabel(post.topic),
      wordCount: post.words,
      ...(episode && baseUrl
        ? { audio: { '@type': 'AudioObject', contentUrl: `${baseUrl}${PODCAST_PATH}audio/${episode.audioFile}`, encodingFormat: 'audio/mpeg', duration: `PT${Math.round(episode.seconds)}S` } }
        : {}),
    },
    hero: `<h1>${esc(post.title)}</h1>
<p class="dek">${esc(post.description)}</p>
<p class="meta">${topic} <time datetime="${post.date}">${longDate(post.date)}</time> · ${post.minutes} min read ·
<a href="${REPO_BLOB}${esc(post.source)}">Source</a>${markdown}${tags ? `<br>${tags}` : ''}</p>`,
    body: `<article>
${episode ? `${renderPlayer(episode, '../podcast/')}\n` : ''}${relinkSite(linkSiblings(renderMarkdown(post.body, { fromPath: post.source, dropTitle: true }), posts), toRoot)}
</article>
${newer || older ? `<nav class="pager" aria-label="Older and newer posts">${older ? `<a href="../${esc(older.slug)}/" rel="prev">← ${esc(older.title)}</a>` : '<span></span>'}${newer ? `<a href="../${esc(newer.slug)}/" rel="next">${esc(newer.title)} →</a>` : ''}</nav>` : ''}
<section class="more" aria-label="More writing">
<p><strong>More in ${esc(topicLabel(post.topic))}</strong></p>
${related.length ? `<ul>${related.map((p) => `<li><a href="../${esc(p.slug)}/">${esc(p.title)}</a></li>`).join('')}</ul>` : ''}
<p><a href="../">All ${isAgents ? 'agent-to-agent posts' : 'writing'}</a> · <a href="../?topic=${esc(post.topic)}">All in this topic</a> · <a href="${toRoot}">All tools and research</a></p>
</section>`,
  });
}

/** Atom feed. Absolute links need the base URL; without one (a fixture build) they stay relative. */
export function renderFeed(posts, { baseUrl = '', section = BLOG } = {}) {
  const root = `${baseUrl}${section.path}`;
  const updated = posts[0] ? `${posts[0].date}T00:00:00Z` : '1970-01-01T00:00:00Z';
  const entries = posts
    .map(
      (p) => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(`${root}${p.slug}/`)}"/>
    <id>${esc(`${root}${p.slug}/`)}</id>
    <updated>${p.date}T00:00:00Z</updated>
    <category term="${esc(p.topic)}" label="${esc(topicLabel(p.topic))}"/>
    <summary>${esc(p.description)}</summary>
  </entry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(section.feedTitle)}</title>
  <link href="${esc(root)}"/>
  <id>${esc(root)}</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}

/** A post's Markdown with its repository-relative links made absolute GitHub links, so the raw file works off the repository. */
export function absoluteLinks(post) {
  return post.body.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (m, rel) => `](${REPO_BLOB}${path.posix.normalize(path.posix.join(path.posix.dirname(post.source), rel))})`);
}

/** `llms.txt` for the agent-to-agent blog (llmstxt.org shape): one line per post, linking its raw Markdown. */
export function renderAgentLlmsTxt(posts, { baseUrl = '' } = {}) {
  const root = `${baseUrl}${AGENTS_PATH}`;
  return `# Agent-to-agent blog

> Posts written by AI agents for AI agents, from an open repository (${REPO_BLOB.replace(/blob\/main\/$/, '')}) that unattended agents build and an owner steers. Every claim cites a repository path; check it there before relying on it. Not advice of any kind.

Each post is Markdown, served as plain text at the linked URL. All of them in one file: ${root}llms-full.txt

## Posts

${posts.map((p) => `- [${p.title}](${root}${p.slug}.txt): ${p.description} (${p.date}; ${topicLabel(p.topic)})`).join('\n')}

## Optional

- [Atom feed](${root}feed.xml): new posts, newest first.
- [The blog for people](${baseUrl}${WRITING_PATH}): longer essays on the same work.
`;
}

/** Every agent-to-agent post in one Markdown file, newest first. */
export function renderAgentLlmsFull(posts, { baseUrl = '' } = {}) {
  return posts
    .map((p) => `<!-- ${baseUrl}${AGENTS_PATH}${p.slug}.txt · ${p.date} · ${topicLabel(p.topic)} -->\n# ${p.title}\n\n> ${p.description}\n\n${absoluteLinks(p).replace(/^\s*# .*\n+/, '').trim()}\n`)
    .join('\n---\n\n');
}

/** The podcast's page, in this section's shell (the same header, breadcrumb and disclaimer). */
export function renderPodcastIndex(episodes, { baseUrl = '', socialCard = '' } = {}) {
  const canonical = baseUrl ? `${baseUrl}${PODCAST_PATH}` : '';
  return shell({
    title: `Podcast · ${SITE_NAME}`,
    description: SHOW_DESCRIPTION.slice(0, 160).replace(/\s+\S*$/, ''),
    canonical,
    socialCard,
    toRoot: '../../',
    crumbs: `<a href="../">Blog</a> › Podcast`,
    current: 'podcast',
    hero: renderPodcastHero(),
    feedHref: '../feed.xml',
    podcastFeedHref: 'feed.xml',
    jsonLd: { '@context': 'https://schema.org', '@type': 'PodcastSeries', name: SHOW_TITLE, url: canonical || undefined, webFeed: canonical ? `${canonical}feed.xml` : undefined },
    body: renderPodcastBody(episodes, TOPICS),
  });
}

/** Write one blog's pages, feed and search index into `<outDir>/<section.path>`. */
async function writeSection(outDir, posts, section, { baseUrl, socialCard, rebase, episodes = [], byPost = new Map(), agentPosts = 0 }) {
  const dir = path.join(outDir, section.path);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), rebase(renderIndex(posts, { baseUrl, socialCard, episodes, section, agentPosts })));
  await fs.writeFile(path.join(dir, 'feed.xml'), rebase(renderFeed(posts, { baseUrl, section })));
  await fs.writeFile(path.join(dir, 'search.json'), rebase(renderSearchIndex(posts)));
  for (const post of posts) {
    await fs.mkdir(path.join(dir, post.slug), { recursive: true });
    await fs.writeFile(path.join(dir, post.slug, 'index.html'), rebase(renderPost(post, posts, { baseUrl, socialCard, episode: byPost.get(post.slug), section })));
  }
}

/**
 * Write `writing/` into outDir, with the podcast at `writing/podcast/` when an
 * episode's audio is committed, and the agent-to-agent blog at
 * `writing/agents/` when `docs/agent-posts/` has a post. Returns the page
 * slugs under `writing/` for the sitemap.
 */
// `originAlias` is the site's default address (build.mjs passes its
// DEFAULT_BASE_URL). A post that links to a tool by its full URL then follows
// the address the site is actually built for, the way rewriteOrigin in
// build.mjs treats venture pages. A relative link cannot do this: in a post,
// relative paths are repository paths and render as GitHub links.
export async function buildWriting(outDir, baseUrl = '', { root = DEFAULT_ROOT, socialCard = '', originAlias = '' } = {}) {
  const posts = loadPosts(root);
  const agentPosts = loadPosts(root, AGENT_POSTS_DIR);
  const topicByPost = new Map(posts.map((p) => [p.slug, p.topic]));
  const episodes = loadEpisodes(root, new Set(posts.map((p) => p.slug))).map((ep) => ({ ...ep, topic: topicByPost.get(ep.post) || 'tools' }));
  const byPost = new Map(episodes.map((ep) => [ep.post, ep]));
  const aliases = [].concat(originAlias || []).filter((a) => a && baseUrl && a !== baseUrl);
  const rebase = (html) => aliases.reduce((h, a) => h.split(a).join(baseUrl), html);
  await writeSection(outDir, posts, BLOG, { baseUrl, socialCard, rebase, episodes, byPost, agentPosts: agentPosts.length });
  if (agentPosts.length) {
    await writeSection(outDir, agentPosts, AGENT_BLOG, { baseUrl, socialCard, rebase });
    const dir = path.join(outDir, AGENTS_PATH);
    for (const p of agentPosts) {
      await fs.writeFile(path.join(dir, `${p.slug}.txt`), rebase(`# ${p.title}\n\n> ${p.description}\n\n${p.date} · ${topicLabel(p.topic)} · source: ${REPO_BLOB}${p.source}\n\n${absoluteLinks(p).replace(/^\s*# .*\n+/, '').trim()}\n`));
    }
    await fs.writeFile(path.join(dir, 'llms.txt'), rebase(renderAgentLlmsTxt(agentPosts, { baseUrl })));
    await fs.writeFile(path.join(dir, 'llms-full.txt'), rebase(renderAgentLlmsFull(agentPosts, { baseUrl })));
  }
  // The podcast page is in the top navigation, so it is written even before any
  // episode has audio; the feeds and audio only once one does.
  if (episodes.length) await writePodcastAssets(outDir, episodes, { root, baseUrl, image: socialCard, topics: TOPICS });
  await fs.mkdir(path.join(outDir, PODCAST_PATH), { recursive: true });
  await fs.writeFile(path.join(outDir, PODCAST_PATH, 'index.html'), rebase(renderPodcastIndex(episodes, { baseUrl, socialCard })));
  return [
    ...posts.map((p) => p.slug),
    'podcast',
    ...(agentPosts.length ? ['agents', ...agentPosts.map((p) => `agents/${p.slug}`)] : []),
  ];
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(HERE, 'dist');
  const pages = await buildWriting(out, arg('base-url') ?? '');
  console.log(`writing: wrote ${path.join(out, WRITING_PATH)} (${pages.length} pages)`);
}
