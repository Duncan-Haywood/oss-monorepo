/**
 * dev.to cross-poster: one article per newly launched tool, with
 * canonical_url pointing at the tool page. Off by default.
 * See portfolio/distribution/README.md.
 *
 *   node platform/distribution/devto.mjs            # dry run: prints the articles
 *   DISTRIBUTE_DEVTO=true DEVTO_API_KEY=... node platform/distribution/devto.mjs
 *
 * Articles are created as DRAFTS unless DEVTO_PUBLISH=true, so the owner can
 * read the first few before anything goes public. At most MAX_PER_RUN per
 * run. De-duplication is stateless: the account's own articles are read back
 * and any tool whose URL is already a canonical_url is skipped.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, recentLaunches, toolUrl } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_PER_RUN = 2;
export const API = 'https://dev.to/api/';
const TAGS = ['opensource', 'tools', 'webdev', 'productivity'];

const shortTitle = (t) => t.split(/\s[—–|-]\s/)[0].trim();

/** Article payload for one tool; the body says what it is, links to the canonical page, and states the limits. */
export function composeArticle({ title, description }, url, ref = 'devto') {
  const name = shortTitle(title);
  // Links readers follow carry the channel tag; `canonical_url` stays clean so search credits the page.
  const visit = tagUrl(url, ref);
  const body = [
    `${description}`,
    '',
    `**[Open ${name}](${visit})** — it runs in your browser, needs no account, and is free and open source (MIT).`,
    '',
    '## Good to know',
    '',
    '- The tool page states what it does with your input; read its privacy line before entering anything sensitive.',
    '- It is a calculator/checker, not legal, tax or professional advice. You make the final call.',
    '- You can self-host your own copy: the source is in the public repository linked from the tool page.',
    '',
    `_Originally published at [${url.replace(/^https:\/\//, '')}](${visit}). Posted automatically from the portfolio's launch feed._`,
  ].join('\n');
  return {
    title: name.length > 120 ? name.slice(0, 119) + '…' : name,
    body_markdown: body,
    canonical_url: url,
    description: description.slice(0, 250),
    tags: TAGS,
  };
}

/** Which articles would go out. `seenUrls` is the set of canonical URLs already on the account. */
export async function plan({ launched, today, seenUrls = new Set(), readPage, max = MAX_PER_RUN }) {
  const out = [];
  for (const slug of recentLaunches(launched, today)) {
    const url = toolUrl(slug);
    if (seenUrls.has(url)) continue;
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (!meta) continue;
    out.push({ slug, url, article: composeArticle(meta, url) });
    if (out.length >= max) break;
  }
  return out;
}

async function api(fetchImpl, method, pathname, { key, body } = {}) {
  const res = await fetchImpl(new URL(pathname, API), {
    method,
    headers: { 'api-key': key, accept: 'application/vnd.forem.api-v1+json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status}`);
  return res.json();
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const launched = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform/pages/launched.json'), 'utf8')).launched;
  const readPage = (slug) => fs.readFile(path.join(REPO_ROOT, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
  const today = now.toISOString().slice(0, 10);
  const live = env.DISTRIBUTE_DEVTO === 'true' && !!env.DEVTO_API_KEY;
  const published = env.DEVTO_PUBLISH === 'true';

  let seenUrls = new Set();
  if (live) {
    const mine = await api(fetchImpl, 'GET', 'articles/me/all?per_page=1000', { key: env.DEVTO_API_KEY });
    seenUrls = new Set(mine.map((a) => a.canonical_url).filter(Boolean));
  }
  const posts = await plan({ launched, today, seenUrls, readPage });
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_DEVTO=true and DEVTO_API_KEY to create ${published ? 'public articles' : 'drafts'}). ${posts.length} article(s):`);
    for (const p of posts) log(`--- ${p.slug}\n${p.article.title}\n${p.article.body_markdown}\n`);
    return { posted: 0, planned: posts.length };
  }
  for (const p of posts) {
    await api(fetchImpl, 'POST', 'articles', { key: env.DEVTO_API_KEY, body: { article: { ...p.article, published } } });
    log(`${published ? 'published' : 'drafted'} ${p.slug}`);
  }
  return { posted: posts.length, planned: posts.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
