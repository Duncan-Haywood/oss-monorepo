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
import { formatCount } from './count.mjs';
import { SITE_NAME, TITLE_BUDGET, siteTitle, sponsorsNote, withSiteHeader } from './site-nav.mjs';
import { loadEpisodes, renderPlayer, renderPodcastBody, renderPodcastHero, writePodcastAssets, PODCAST_PATH, SHOW_DESCRIPTION, SHOW_TITLE } from './podcast.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const WRITING_PATH = 'writing/';
export const POSTS_DIR = 'docs/posts';
export const AGENT_POSTS_DIR = 'docs/agent-posts';
export const AGENTS_PATH = `${WRITING_PATH}agents/`;
// Directories inside `writing/` that are not posts: a post with one of these slugs would overwrite them.
const RESERVED_SLUGS = new Set(['agents', 'podcast', 'page']);

/** Posts per index page. A page of 50 cards is about 50 kB of HTML; one page of every post was 2.3 MB. */
export const PAGE_SIZE = 50;

/**
 * The blog's topics, in the order the filters list them. Every post has
 * exactly one: its `topic:` front matter, else the first rule its tags match.
 */
export const TOPICS = Object.freeze([
  { id: 'start', label: 'Start here', blurb: 'Who each project is for, what you get from it, and your first ten minutes with it.' },
  { id: 'quality', label: 'Quality audits', blurb: 'Is the work finished, correct and at a senior professional level? Seeded random samples graded on a fixed rubric, with the evidence (portfolio/quality/).' },
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
 * are the newcomer's way in, so they group together whatever else they name; quality audits
 * (`quality-audit`, portfolio/quality/) grade work from every track, so they group apart; opinion pieces are about
 * steering the fleet; then research; then a named tool or channel; then
 * hosting and CI plumbing; then anything about agents; everything else is a tool or project.
 * A post the rules file wrongly says so with `topic:` in its front matter.
 */
export function topicOf(tags = [], explicit = '') {
  if (explicit) return explicit;
  const has = (list) => tags.some((t) => list.includes(t));
  if (tags.includes('start-here')) return 'start';
  if (tags.includes('quality-audit')) return 'quality';
  if (tags.includes('opinion')) return 'agents';
  if (tags.includes('research')) return 'research';
  if (has(TOOL_TAGS)) return 'tools';
  if (has(INFRA_TAGS)) return 'infrastructure';
  if (has(AGENT_TAGS)) return 'agents';
  return 'tools';
}
export const topicLabel = (id) => TOPICS.find((t) => t.id === id)?.label ?? id;
const REPO_BLOB = 'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/';
// The site's old project Pages address (build.mjs's GITHUB_PAGES_BASE_URL; not
// imported, to keep this module free of an import cycle). Older posts link live
// tools by it; those links follow the base URL the site is built with.
const DEFAULT_SITE_ORIGIN = 'https://duncan-haywood.github.io/oss-monorepo/';
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;
// Posts link live tools by their full Pages URL so the Markdown reads right on
// GitHub. On the site those links become root-relative, so a build under a
// custom domain does not point readers (or canonical signals) at the old origin.
// Both the old Pages address and the live origin (build.mjs's DEFAULT_BASE_URL):
// posts written since the move to Cloudflare link https://marisstella.app/.
const PUBLISHED_ORIGINS = ['https://duncan-haywood.github.io/oss-monorepo/', 'https://marisstella.app/'];
export const relinkSite = (html, toRoot) =>
  PUBLISHED_ORIGINS.reduce((h, origin) => h.split(`href="${origin}`).join(`href="${toRoot}`), html);

/** Parse the `---` front-matter block. Returns { meta, body }. Only the subset posts use. */
// YAML's quoted scalars: "..." takes backslash escapes (\" and \\ are the ones posts use) and
// '...' doubles a quote. Until 2026-11-12 the quotes were stripped and the escapes kept, so 24
// post titles showed \"United States\" with the backslashes on the page, in <title> and in feeds.
const YAML_ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', 0: '\0' };
export function unquoteYamlScalar(value) {
  const dq = /^"(.*)"$/.exec(value);
  if (dq) return dq[1].replace(/\\(.)/g, (m, c) => YAML_ESCAPES[c] ?? m);
  const sq = /^'(.*)'$/.exec(value);
  return sq ? sq[1].replace(/''/g, "'") : value;
}

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
      value = unquoteYamlScalar(value);
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

/**
 * The shorter title a long "Claim: detail" or "Question? detail" headline
 * gives a results page when the post sets no seo_title. Mirrors `cut()` in
 * propose_seo_titles.py; undefined when there is no clean cut.
 */
export function autoSeoTitle(title) {
  for (const sep of [': ', '? ']) {
    const i = title.indexOf(sep);
    if (i < 0) continue;
    const head = title.slice(0, i + (sep === '? ' ? 1 : 0));
    if (head.length >= 25 && head.length <= TITLE_BUDGET) return head;
  }
  return undefined;
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
    throw new Error(`${POSTS_DIR}/${name}: seo_title is ${String(meta.seo_title).length} characters; keep it to ${TITLE_BUDGET} (python3 platform/pages/propose_seo_titles.py lists posts needing a shorter one)`);
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
    seoTitle: meta.seo_title ? String(meta.seo_title) : (String(meta.title).length > TITLE_BUDGET ? autoSeoTitle(String(meta.title)) : undefined),
    description: meta.description,
    tags,
    topic: topicOf(tags, meta.topic),
    source: `${POSTS_DIR}/${name}`,
    body,
    words,
    minutes: Math.max(1, Math.round(words / 230)),
  };
}

// Memoised per date string: `toLocaleDateString` builds an Intl formatter on
// every call, and the blog index and every post's related list format the same
// few hundred dates thousands of times (about 2 s of a warm build, 2026-11-12).
const LONG_DATES = new Map();
const longDate = (iso) => {
  let s = LONG_DATES.get(iso);
  if (s === undefined) {
    s = new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    LONG_DATES.set(iso, s);
  }
  return s;
};

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
  .tag { display:inline-block; font-size:.75rem; border:1px solid var(--line); border-radius:999px; padding:2px 8px; margin:0 4px 4px 0; color:var(--muted); }
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
  .pager { margin:1.4rem 0; color:var(--muted); font-size:.95rem; } .pager .nums { display:flex; flex-wrap:wrap; gap:4px 6px; } .pager .nums > * { min-width:24px; min-height:24px; display:inline-flex; align-items:center; justify-content:center; } .pager [aria-current] { font-weight:700; color:var(--text, inherit); }
  .posts p { margin:.3em 0; color:var(--muted); font-size:.95rem; }
  .posts .meta { display:flex; flex-wrap:wrap; gap:6px; margin:.7em 0 0; }
  .posts .date, .posts .mins { display:inline-block; font-size:.78rem; font-weight:600; padding:2px 9px; border-radius:999px;
    border:1px solid var(--line); background:var(--bg); color:var(--muted); }
  .pf-hero .crumbs { margin:0 0 18px; } .pf-hero .meta { margin:0; } .pf-hero .tag { color:var(--muted); border-color:var(--line); }
  .pf-hero h1 { font-size:clamp(1.9rem,4.4vw,2.6rem); }
  .more { margin-top:3em; padding-top:1.4em; border-top:1px solid var(--line); font-size:.95rem; }
  .more h2 { font-size:1.15rem; margin:0 0 .7em; }
  .related { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
  .related li { position:relative; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px; line-height:1.4; transition:border-color .18s, box-shadow .18s; }
  .related li:hover { border-color:var(--accent); box-shadow:0 6px 18px rgba(20,30,60,.08); }
  .related a { color:var(--ink); font-weight:600; text-decoration:none; }
  .related a::after { content:""; position:absolute; inset:0; border-radius:12px; }
  .related a:hover, .related a:focus-visible { color:var(--accent); }
  .related a:focus-visible { outline:none; } .related li:focus-within { outline:2px solid var(--accent); outline-offset:2px; }
  .related .when { display:block; margin-top:4px; font-size:.8rem; color:var(--muted); }
  .pager.steps { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap:10px; margin:1.6em 0 0; font-size:.9rem; }
  .pager.steps a { display:block; padding:12px 16px; border:1px solid var(--line); border-radius:12px; color:var(--ink); text-decoration:none; line-height:1.4; }
  .pager.steps a:hover, .pager.steps a:focus-visible { border-color:var(--accent); color:var(--accent); }
  @media (min-width:600px) { .pager.steps a.next { text-align:right; } }
  .pager.steps .dir { display:block; font-size:.75rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin-bottom:3px; }
  .more .all { margin:1.4em 0 0; font-size:.9rem; }
  @media (prefers-reduced-motion: reduce) { .related li { transition:none; } }
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
  .chips button[aria-pressed=true] { background:var(--accent); border-color:var(--accent); color:var(--bg); }
  .chips button span { margin-left:4px; font-variant-numeric:tabular-nums; }
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

function shell({ title, description, canonical, toRoot, crumbs, hero = '', body, jsonLd, breadcrumb, feedHref, socialCard, podcastFeedHref, current = 'writing', robots = '' }) {
  // The site's shared header (site-nav.mjs) above this section's own breadcrumb.
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots ? `<meta name="robots" content="${esc(robots)}">\n` : ''}${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)}: writing" href="${esc(feedHref)}">
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
  // A long list is paged: the HTML holds the newest cards and data-all names posts.json,
  // fetched only when someone filters, sorts or searches, so the filters cover every post.
  const allUrl = list.dataset && list.dataset.all;
  const total = list.dataset && list.dataset.total ? Number(list.dataset.total) : 0;
  const pageItems = Array.from(list.children);
  let items = pageItems;
  let allItems = null, allLoading = null;
  const pager = document.getElementById('pager');
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
  function card(r) {
    const li = document.createElement('li');
    li.dataset.slug = r[0]; li.dataset.date = r[3]; li.dataset.mins = String(r[4]); li.dataset.topic = r[5];
    li.dataset.tags = r[7]; li.dataset.text = r[8];
    const h = document.createElement('h2'), a = document.createElement('a');
    a.href = r[0] + '/'; a.textContent = r[1]; h.appendChild(a);
    const d = document.createElement('p'); d.textContent = r[2];
    const m = document.createElement('p'); m.className = 'meta';
    m.textContent = r[6] + ' · ' + r[3] + ' · ' + r[4] + ' min read';
    li.appendChild(h); li.appendChild(d); li.appendChild(m);
    return li;
  }
  function loadAll() {
    if (!allLoading) allLoading = fetch(allUrl).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((rows) => { allItems = rows.map(card); apply(); });
  }
  function apply() {
    const filtering = Boolean(q.value.trim() || topic || tag.value || sort.value !== 'new');
    if (allUrl) {
      if (filtering && !allItems) loadAll();
      const want = filtering && allItems ? allItems : pageItems;
      if (want !== items) { items = want; list.replaceChildren(...items); }
      if (pager) pager.hidden = filtering;
    }
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
    const of = allUrl && !filtering ? total : allUrl && !allItems ? total : items.length;
    const num = (n) => Number(n).toLocaleString('en-US');
    count.textContent = !filtering ? num(of) + ' posts' : (allUrl && !allItems ? 'Searching ' + num(of) + ' posts...' : num(shown) + ' of ' + num(of) + ' posts');
    none.hidden = shown > 0 || Boolean(allUrl && filtering && !allItems);
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
  const chips = [`<button type="button" data-topic-chip="" aria-pressed="true">All<span>${formatCount(posts.length)}</span></button>`]
    .concat(TOPICS.filter((t) => topicCounts.get(t.id)).map((t) => `<button type="button" data-topic-chip="${esc(t.id)}" aria-pressed="false" title="${esc(t.blurb)}">${esc(t.label)}<span>${formatCount(topicCounts.get(t.id))}</span></button>`))
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
<p id="count" aria-live="polite">${formatCount(posts.length)} posts</p>
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

/** The rows `posts.json` holds for the finder: slug, title, description, date, minutes, topic id, topic label, tags, search text. */
export function renderPostRows(posts) {
  return JSON.stringify(posts.map((p) => [p.slug, p.title, p.description, p.date, p.minutes, p.topic, topicLabel(p.topic), p.tags.join(' '), cardText(p)]));
}

const pageCount = (posts) => Math.max(1, Math.ceil(posts.length / PAGE_SIZE));

/** The newer/older links and every page number, so any post is at most two clicks from the index. */
function renderPager(n, count, prefix) {
  if (count <= 1) return '';
  const href = (i) => (i === 1 ? `${prefix}` || './' : `${prefix}page/${i}/`);
  const numbers = Array.from({ length: count }, (_, k) => k + 1)
    .map((i) => (i === n ? `<span aria-current="page">${i}</span>` : `<a href="${href(i)}">${i}</a>`))
    .join(' ');
  return `<nav class="pager" id="pager" aria-label="Pages of posts"><p>Page ${n} of ${count}: ${n > 1 ? `<a rel="prev" href="${href(n - 1)}">newer</a>` : 'newer'} · ${n < count ? `<a rel="next" href="${href(n + 1)}">older</a>` : 'older'}</p><p class="nums">${numbers}</p></nav>`;
}

/**
 * One blog index. Page 1 (`page` omitted) is `<section>/index.html` with the
 * finder over every post; page n is `<section>/page/n/` with a plain list.
 */
export function renderIndex(allPosts, { baseUrl = '', socialCard = '', episodes = [], section = BLOG, agentPosts = 0, page = 1 } = {}) {
  const count = pageCount(allPosts);
  const paged = count > 1;
  const sub = page > 1;
  const canonical = baseUrl ? `${baseUrl}${section.path}${sub ? `page/${page}/` : ''}` : '';
  const toRoot = '../'.repeat(section.depth + (sub ? 2 : 0));
  const up = sub ? '../../' : '';
  const posts = allPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const items = posts
    .map(
      (p) => `<li data-slug="${esc(p.slug)}" data-topic="${esc(p.topic)}" data-tags="${esc(p.tags.join(' '))}" data-date="${p.date}" data-mins="${p.minutes}" data-text="${esc(cardText(p))}">
  <h2><a href="${up}${esc(p.slug)}/">${esc(p.title)}</a></h2>
  <p>${esc(p.description)}</p>
  <p class="meta"><span class="topic">${esc(topicLabel(p.topic))}</span> <time class="date" datetime="${p.date}">${longDate(p.date)}</time> <span class="mins">${p.minutes} min read</span></p>
</li>`,
    )
    .join('\n');
  const isAgents = section.id === 'agents';
  const dek = sub
    ? `<p class="dek">Older posts, ${(page - 1) * PAGE_SIZE + 1} to ${(page - 1) * PAGE_SIZE + posts.length} of ${formatCount(allPosts.length)}. <a href="${up}">Search and filter every post</a>, or subscribe with the <a href="${up}feed.xml">Atom feed</a>.</p>`
    : isAgents
    ? `<p class="dek">Written by AI agents, for AI agents. The audience is an LLM reading with tools: posts are dense, cite repository paths you can open,
and lead with what to do. People are welcome to read along. For a model, the plain-text entry points are
<a href="llms.txt">llms.txt</a> (the index), <a href="llms-full.txt">llms-full.txt</a> (every post in one file) and each post's
raw Markdown (<code>&lt;slug&gt;.txt</code>). New posts: the <a href="feed.xml">Atom feed</a>. The blog for people is <a href="../">here</a>.</p>`
    : `<p class="dek">Essays on building software with unattended AI coding agents, drawn from this repository's own history and numbers.
Subscribe with the <a href="feed.xml">Atom feed</a>.${episodes.length ? ` Or listen: <a href="podcast/">the podcast</a> has spoken versions of ${episodes.length} of these posts, by topic.` : ''}${agentPosts ? ` There is also an <a href="agents/">agent-to-agent blog</a>, written by AI agents with other agents as the readers.` : ''}</p>`;
  const title = `${isAgents ? 'Agent-to-agent blog' : 'Blog'}${sub ? `, page ${page}` : ''} · ${SITE_NAME}`;
  const pager = renderPager(page, count, up ? '../../' : '');
  return shell({
    title,
    description: sub ? `Older posts, page ${page} of ${count}. ${section.description}`.slice(0, 160) : section.description,
    canonical,
    socialCard,
    toRoot,
    robots: sub ? 'noindex' : '',
    crumbs: sub ? `<a href="../../">Blog</a> › Page ${page}` : isAgents ? '<a href="../">Blog</a> › Agent to agent' : 'Blog',
    feedHref: `${up}feed.xml`,
    podcastFeedHref: episodes.length ? `${up}podcast/feed.xml` : '',
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: section.feedTitle, url: canonical || undefined },
    hero: `<p class="eyebrow">${isAgents ? 'Agent to agent' : 'Blog'}</p>
<h1>${isAgents ? 'Agent-to-agent blog' : 'Blog'}${sub ? `, page ${page}` : ''}</h1>
${dek}`,
    body: !posts.length
      ? '<p>No posts yet.</p>'
      : sub
        ? `<ul class="posts" id="posts">
${items}
</ul>
${pager}`
        : `${renderFinder(allPosts)}
<ul class="posts" id="posts"${paged ? ` data-all="posts.json" data-total="${allPosts.length}"` : ''}>
${items}
</ul>
${pager}
<p id="none" hidden>No post matches. <button type="button" onclick="document.getElementById('clear').click()">Clear the filters</button></p>
<script>${FINDER_SCRIPT}</script>`,
  });
}

/** A link to another post's source file becomes a link to that post's page on this site. */
export function linkSiblings(html, posts) {
  // One pass over the page's hrefs, not one scan of the page per post. The
  // replacement never contains REPO_BLOB, so the old chain of replaces and this
  // lookup agree; the first post with a given source wins, as before.
  const to = siblingTargets(posts);
  return html.replace(/href="([^"]*)"/g, (m, v) => to.get(v) ?? m);
}

// The source -> page map for one posts array, built once and reused for every
// post page (as `relatedIndex` is). Rebuilding it per page was 3,700 posts x
// 3,700 pages x two `esc` calls, about 8 s of a warm build (2026-11-12). The
// length check rebuilds it if a caller grows the array between pages.
const SIBLING_TARGETS = new WeakMap();
function siblingTargets(posts) {
  const cached = SIBLING_TARGETS.get(posts);
  if (cached && cached.n === posts.length) return cached.to;
  const to = new Map();
  for (const p of posts) {
    const from = esc(REPO_BLOB + p.source);
    if (!to.has(from)) to.set(from, `href="../${esc(p.slug)}/"`);
  }
  SIBLING_TARGETS.set(posts, { n: posts.length, to });
  return to;
}

export function renderPost(post, posts, opts = {}) {
  const html = renderPostPage(post, posts, opts);
  const { baseUrl = '' } = opts;
  return baseUrl && baseUrl !== DEFAULT_SITE_ORIGIN ? html.split(DEFAULT_SITE_ORIGIN).join(baseUrl) : html;
}

// Title words too common to say two posts are about the same thing.
const RELATED_STOPWORDS = new Set(
  ('about after again against also although among another because been before being between both cannot could does doing ' +
    'down during each every first from have having here into itself just last made make more most much must never none ' +
    'only other over same should since some still such than that their them then there these they this those three ' +
    'through under until very were what when where which while whose will with without would your')
    .split(' '),
);
const titleWords = (title = '') =>
  new Set(String(title).toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g)?.filter((w) => !RELATED_STOPWORDS.has(w)) ?? []);

// The scoring index for one posts array, built once and reused for every post page.
const RELATED_INDEX = new WeakMap();
function relatedIndex(posts) {
  let index = RELATED_INDEX.get(posts);
  if (index) return index;
  const byTag = new Map();
  const byWord = new Map();
  const words = new Map();
  posts.forEach((p, i) => {
    for (const t of new Set(p.tags ?? [])) (byTag.get(t) ?? byTag.set(t, []).get(t)).push(i);
    const w = titleWords(p.title);
    words.set(p, w);
    for (const x of w) (byWord.get(x) ?? byWord.set(x, []).get(x)).push(i);
  });
  // A tag or word shared by more than a fifth of the posts says little; leaving it out
  // of the candidate lists also keeps the build linear-ish (3,700 posts, 2026-11-12).
  const cap = Math.max(2, Math.floor(posts.length / 5));
  const idf = (list) => (list && list.length > 1 && list.length <= cap ? Math.log(posts.length / list.length) : 0);
  // Each post's date as a day number, by index: the nearest-in-date sorts
  // below compare thousands of pairs per post page, and parsing the date in
  // every comparison was about 2 s of a warm build (2026-11-12).
  const days = posts.map((p) => dayNumber(p.date));
  index = { byTag, byWord, words, idf, days };
  RELATED_INDEX.set(posts, index);
  return index;
}

const dayNumber = (iso) => (iso ? Date.parse(`${iso}T00:00:00Z`) / 86400000 : 0);

/**
 * Up to `n` other posts ranked by how related they are to `post` (the list
 * before `relatedPosts` balances it).
 *
 * Until 2026-11-12 this was "same topic, newest first", so every post in a topic
 * linked to the same five posts (the newest ones, alphabetical within a day):
 * 36 of 3,717 posts received every related link and 3,681 received none. Now
 * the score is the shared tags plus half the shared title words, each weighted
 * by how rare it is (log N / df), ties going to the post nearest in date. When
 * fewer than `n` posts share anything, the rest are the same topic's posts
 * nearest in date, then the other topics' in the same order. A post never
 * lists itself.
 */
export function rankRelated(post, posts, n = 5) {
  const { byTag, byWord, words, idf, days } = relatedIndex(posts);
  const score = new Map();
  const add = (list, weight) => {
    if (!weight) return;
    for (const i of list) score.set(i, (score.get(i) ?? 0) + weight);
  };
  for (const t of new Set(post.tags ?? [])) add(byTag.get(t) ?? [], idf(byTag.get(t)));
  for (const w of words.get(post) ?? titleWords(post.title)) add(byWord.get(w) ?? [], idf(byWord.get(w)) / 2);
  // Entries are { p: post, i: its index in `posts`, s: score }.
  const day = dayNumber(post.date);
  const gap = (x) => Math.abs((days[x.i] ?? dayNumber(x.p.date)) - day);
  const nearest = (a, b) => gap(a) - gap(b) || a.i - b.i;
  const ranked = [...score]
    .map(([i, s]) => ({ p: posts[i], i, s }))
    .filter((x) => x.s > 0 && x.p.slug !== post.slug)
    .sort((a, b) => b.s - a.s || nearest(a, b))
    .slice(0, n)
    .map((x) => x.p);
  if (ranked.length >= n) return ranked;
  const taken = new Set(ranked.map((p) => p.slug).concat(post.slug));
  const rest = posts.map((p, i) => ({ p, i })).filter((x) => !taken.has(x.p.slug));
  const fill = (xs) => xs.sort(nearest).map((x) => x.p);
  return ranked
    .concat(fill(rest.filter((x) => x.p.topic === post.topic)), fill(rest.filter((x) => x.p.topic !== post.topic)))
    .slice(0, n);
}

// The balanced lists for one posts array and list length, built once.
const RELATED_TABLES = new WeakMap();
// How far down an orphan's own ranking to look for a post that can link back.
const ORPHAN_REACH = 20;

/**
 * Up to `n` other posts a reader of `post` would most likely want next: the
 * `rankRelated` list, balanced so every post is linked from at least one other.
 *
 * Ranking alone left 204 of 3,936 posts with no inbound related link (2026-11-12):
 * a post whose best matches each had five closer matches of their own. For each
 * such orphan, in posts order, this walks the orphan's own ranking (its best
 * matches first) and gives the first post that can spare a slot a link back,
 * in that post's last (weakest) slot. A post spares a slot when it does not
 * already list the orphan, has not given a slot yet, and the post in its last
 * slot is linked from somewhere else too, so no fix makes a new orphan. The
 * score is symmetric, so the link back is as strong as the orphan's own link.
 */
export function relatedPosts(post, posts, n = 5) {
  // Rebuilt if a caller grows the array between pages, as `siblingTargets` is.
  let cached = RELATED_TABLES.get(posts);
  if (!cached || cached.length !== posts.length) RELATED_TABLES.set(posts, (cached = { length: posts.length, byN: new Map() }));
  let table = cached.byN.get(n);
  if (!table) cached.byN.set(n, (table = balancedRelated(posts, n)));
  // A post not in the array (a preview) gets the plain ranking.
  return table.get(post.slug) ?? rankRelated(post, posts, n);
}

function balancedRelated(posts, n) {
  const lists = new Map(posts.map((p) => [p.slug, rankRelated(p, posts, n)]));
  if (n < 1 || posts.length < 3) return lists;
  const inbound = new Map(posts.map((p) => [p.slug, 0]));
  for (const list of lists.values()) for (const r of list) inbound.set(r.slug, inbound.get(r.slug) + 1);
  const gave = new Set();
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  for (const orphan of posts) {
    if (inbound.get(orphan.slug) > 0) continue;
    for (const c of rankRelated(orphan, posts, ORPHAN_REACH)) {
      const list = lists.get(c.slug);
      if (gave.has(c.slug) || list.length < n || list.some((r) => r.slug === orphan.slug)) continue;
      const dropped = list[n - 1];
      if (inbound.get(dropped.slug) < 2) continue;
      lists.set(c.slug, list.slice(0, n - 1).concat(bySlug.get(orphan.slug)));
      inbound.set(dropped.slug, inbound.get(dropped.slug) - 1);
      inbound.set(orphan.slug, 1);
      gave.add(c.slug);
      break;
    }
  }
  return lists;
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
<section class="more" aria-labelledby="related-h">
${related.length ? `<h2 id="related-h">Related posts</h2>
<ul class="related">${related.map((p) => `<li><a href="../${esc(p.slug)}/">${esc(p.title)}</a><span class="when"><time datetime="${p.date}">${longDate(p.date)}</time> · ${esc(topicLabel(p.topic))}</span></li>`).join('')}</ul>` : ''}
${newer || older ? `<nav class="pager steps" aria-label="Older and newer posts">${older ? `<a href="../${esc(older.slug)}/" rel="prev"><span class="dir">← Older</span>${esc(older.title)}</a>` : '<span></span>'}${newer ? `<a href="../${esc(newer.slug)}/" rel="next" class="next"><span class="dir">Newer →</span>${esc(newer.title)}</a>` : ''}</nav>` : ''}
<p class="all"><a href="../">All ${isAgents ? 'agent-to-agent posts' : 'writing'}</a> · <a href="../?topic=${esc(post.topic)}">More in ${esc(topicLabel(post.topic))}</a> · <a href="${toRoot}">All tools and research</a></p>
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
  // Past one page the index lists the newest posts; the rest are numbered pages, and the finder reads posts.json.
  const pages = pageCount(posts);
  if (pages > 1) {
    await fs.writeFile(path.join(dir, 'posts.json'), rebase(renderPostRows(posts)));
    for (let n = 2; n <= pages; n++) {
      await fs.mkdir(path.join(dir, 'page', String(n)), { recursive: true });
      await fs.writeFile(path.join(dir, 'page', String(n), 'index.html'), rebase(renderIndex(posts, { baseUrl, socialCard, episodes, section, agentPosts, page: n })));
    }
  }
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
