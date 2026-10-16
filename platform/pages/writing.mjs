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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const WRITING_PATH = 'writing/';
export const POSTS_DIR = 'docs/posts';
const REPO_BLOB = 'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/';
const SITE_NAME = 'Open Tools and Research';
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;

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

/** Every post in `docs/posts/`, newest first. Throws on a malformed post so a bad file fails the build. */
export function loadPosts(root = DEFAULT_ROOT) {
  const dir = path.join(root, POSTS_DIR);
  if (!existsSync(dir)) return [];
  const posts = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
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
    const date = String(meta.date || fm[1]);
    if (date !== fm[1]) throw new Error(`${POSTS_DIR}/${name}: date ${date} does not match the file name`);
    const words = body.split(/\s+/).filter(Boolean).length;
    posts.push({
      slug: fm[2],
      date,
      title: meta.title,
      description: meta.description,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      source: `${POSTS_DIR}/${name}`,
      body,
      words,
      minutes: Math.max(1, Math.round(words / 230)),
    });
  }
  // Seen twice means two files would write the same URL.
  const seen = new Set();
  for (const p of posts) {
    if (seen.has(p.slug)) throw new Error(`${POSTS_DIR}: two posts share the slug "${p.slug}"`);
    seen.add(p.slug);
  }
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}

const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const STYLE = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#1b2129; --muted:#5a6676; --line:#dde3ea; --accent:#2a5bd7; --code:#eef1f5; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542; --accent:#86a8ff; --code:#1d2631; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:17px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 72px; }
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
  .posts li { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin:0 0 14px; }
  .posts h2 { font-size:1.2rem; margin:0 0 .3em; line-height:1.3; } .posts h2 a { color:inherit; text-decoration:none; }
  .posts h2 a:hover { color:var(--accent); }
  .posts p { margin:.3em 0; color:var(--muted); font-size:.95rem; }
  .more { margin-top:3em; padding-top:1.4em; border-top:1px solid var(--line); font-size:.95rem; }
  footer { margin-top:3em; font-size:.8rem; color:var(--muted); }
`;

function shell({ title, description, canonical, toRoot, crumbs, body, jsonLd, feedHref, socialCard }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)}: writing" href="${esc(feedHref)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${jsonLd['@type'] === 'BlogPosting' ? 'article' : 'website'}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}${socialCard ? `<meta property="og:image" content="${esc(socialCard)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="${socialCard ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="${toRoot}">${esc(SITE_NAME)}</a> › ${crumbs}</nav>
<main>
${body}
</main>
<footer>
  <p>Written with AI assistance and checked against the repository; every figure links to, or names, its source in the
  <a href="https://github.com/Duncan-Haywood/oss-monorepo">repository</a>. Provided as-is, with no warranty of accuracy or
  completeness, and not advice of any kind. MIT-licensed, like everything here.</p>
</footer>
</div>
</body>
</html>
`;
}

export function renderIndex(posts, { baseUrl = '', socialCard = '' } = {}) {
  const canonical = baseUrl ? `${baseUrl}${WRITING_PATH}` : '';
  const items = posts
    .map(
      (p) => `<li>
  <h2><a href="${esc(p.slug)}/">${esc(p.title)}</a></h2>
  <p>${esc(p.description)}</p>
  <p class="meta"><time datetime="${p.date}">${longDate(p.date)}</time> · ${p.minutes} min read</p>
</li>`,
    )
    .join('\n');
  return shell({
    title: `Writing · ${SITE_NAME}`,
    description: 'Essays on building software with unattended AI coding agents, from this repository\'s own history and numbers.',
    canonical,
    socialCard,
    toRoot: '../',
    crumbs: 'Writing',
    feedHref: 'feed.xml',
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: `${SITE_NAME}: writing`, url: canonical || undefined },
    body: `<h1>Writing</h1>
<p class="dek">Essays on building software with unattended AI coding agents, drawn from this repository's own history and numbers.
Subscribe with the <a href="feed.xml">Atom feed</a>.</p>
${posts.length ? `<ul class="posts">\n${items}\n</ul>` : '<p>No posts yet.</p>'}`,
  });
}

export function renderPost(post, posts, { baseUrl = '', socialCard = '' } = {}) {
  const canonical = baseUrl ? `${baseUrl}${WRITING_PATH}${post.slug}/` : '';
  const others = posts.filter((p) => p.slug !== post.slug).slice(0, 5);
  const tags = post.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  return shell({
    title: `${post.title} · ${SITE_NAME}`,
    description: post.description,
    canonical,
    socialCard,
    toRoot: '../../',
    crumbs: `<a href="../">Writing</a>`,
    feedHref: '../feed.xml',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      url: canonical || undefined,
      keywords: post.tags.join(', ') || undefined,
      wordCount: post.words,
    },
    body: `<article>
<h1>${esc(post.title)}</h1>
<p class="dek">${esc(post.description)}</p>
<p class="meta"><time datetime="${post.date}">${longDate(post.date)}</time> · ${post.minutes} min read ·
<a href="${REPO_BLOB}${esc(post.source)}">Source</a>${tags ? `<br>${tags}` : ''}</p>
${renderMarkdown(post.body, { fromPath: post.source, dropTitle: true })}
</article>
<section class="more" aria-label="More writing">
<p><strong>More writing</strong></p>
${others.length ? `<ul>${others.map((p) => `<li><a href="../${esc(p.slug)}/">${esc(p.title)}</a></li>`).join('')}</ul>` : ''}
<p><a href="../">All writing</a> · <a href="../../">All tools and research</a></p>
</section>`,
  });
}

/** Atom feed. Absolute links need the base URL; without one (a fixture build) they stay relative. */
export function renderFeed(posts, { baseUrl = '' } = {}) {
  const root = `${baseUrl}${WRITING_PATH}`;
  const updated = posts[0] ? `${posts[0].date}T00:00:00Z` : '1970-01-01T00:00:00Z';
  const entries = posts
    .map(
      (p) => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(`${root}${p.slug}/`)}"/>
    <id>${esc(`${root}${p.slug}/`)}</id>
    <updated>${p.date}T00:00:00Z</updated>
    <summary>${esc(p.description)}</summary>
  </entry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(SITE_NAME)}: writing</title>
  <link href="${esc(root)}"/>
  <id>${esc(root)}</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}

/** Write `writing/` into outDir. Returns the posts, so the caller can list them in the sitemap. */
export async function buildWriting(outDir, baseUrl = '', { root = DEFAULT_ROOT, socialCard = '' } = {}) {
  const posts = loadPosts(root);
  const dir = path.join(outDir, WRITING_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderIndex(posts, { baseUrl, socialCard }));
  await fs.writeFile(path.join(dir, 'feed.xml'), renderFeed(posts, { baseUrl }));
  for (const post of posts) {
    await fs.mkdir(path.join(dir, post.slug), { recursive: true });
    await fs.writeFile(path.join(dir, post.slug, 'index.html'), renderPost(post, posts, { baseUrl, socialCard }));
  }
  return posts;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(HERE, 'dist');
  const posts = await buildWriting(out, arg('base-url') ?? '');
  console.log(`writing: wrote ${path.join(out, WRITING_PATH)} (${posts.length} posts)`);
}
