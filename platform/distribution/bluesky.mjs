/**
 * Bluesky announcer: one post per newly launched tool, from a labelled bot
 * account. Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/bluesky.mjs            # dry run: prints the posts
 *   DISTRIBUTE_BLUESKY=true BSKY_HANDLE=... BSKY_APP_PASSWORD=... \
 *     node platform/distribution/bluesky.mjs          # posts for real
 *
 * Stateless de-duplication: before posting, the account's recent posts are
 * read back and any tool whose URL is already there is skipped, so a re-run
 * never posts twice and no commit is needed to remember what was sent. Only
 * tools launched within WINDOW_DAYS are announced, so enabling the channel
 * does not flood followers with the whole back catalogue, and at most
 * MAX_PER_RUN posts go out per run.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagUrl } from './attribution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const BASE_URL = 'https://duncan-haywood.github.io/monorepo-projects/';
export const WINDOW_DAYS = 3;
export const MAX_PER_RUN = 3;
export const MAX_GRAPHEMES = 300;
const PDS = 'https://bsky.social';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

/** { title, description } from a page's <title> and meta description, or null. */
export function readMeta(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  const desc = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1];
  if (!title || !desc) return null;
  return { title: decode(title).trim(), description: decode(desc).trim() };
}

const graphemes = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)];
function clip(s, max) {
  const g = graphemes(s);
  return g.length <= max ? s : g.slice(0, Math.max(0, max - 1)).map((x) => x.segment).join('').trimEnd() + '…';
}

/** Post text and link facet for one tool. The text always fits MAX_GRAPHEMES. */
export function composePost({ title, description }, url) {
  const head = `New free tool: ${title.split(/\s[—–|-]\s/)[0]}`;
  const tail = `\n\n${url}\n\nFree and open source (MIT). Automated post.`;
  const room = MAX_GRAPHEMES - graphemes(head).length - graphemes(tail).length - 2;
  const body = room > 20 ? `\n${clip(description.split(/(?<=\.)\s/)[0], room)}` : '';
  const text = clip(head, MAX_GRAPHEMES - graphemes(tail).length) + body + tail;
  const enc = new TextEncoder();
  const byteStart = enc.encode(text.slice(0, text.indexOf(url))).length;
  const facets = [{
    index: { byteStart, byteEnd: byteStart + enc.encode(url).length },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
  }];
  return { text, facets };
}

/** Slugs launched within `windowDays` of `today`, newest first. */
export function recentLaunches(launched, today, windowDays = WINDOW_DAYS) {
  const t = Date.parse(today);
  return Object.entries(launched)
    .filter(([, d]) => t - Date.parse(d) >= 0 && t - Date.parse(d) <= windowDays * 864e5)
    .sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0]))
    .map(([slug]) => slug);
}

export const toolUrl = (slug) => `${BASE_URL}${slug}/`;

/** Pure planning step: which posts would go out. `seenText` is the account's recent post text. */
export async function plan({ launched, today, seenText = '', readPage, max = MAX_PER_RUN }) {
  const out = [];
  for (const slug of recentLaunches(launched, today)) {
    const url = toolUrl(slug);
    if (seenText.includes(url)) continue;
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (!meta) continue;
    out.push({ slug, url, ...composePost(meta, tagUrl(url, 'bluesky')) });
    if (out.length >= max) break;
  }
  return out;
}

async function api(fetchImpl, method, pathname, { token, body, query } = {}) {
  const url = new URL(`${PDS}/xrpc/${pathname}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetchImpl(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status}`);
  return res.json();
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const launched = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform/pages/launched.json'), 'utf8')).launched;
  const readPage = (slug) => fs.readFile(path.join(REPO_ROOT, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
  const today = now.toISOString().slice(0, 10);
  const live = env.DISTRIBUTE_BLUESKY === 'true' && env.BSKY_HANDLE && env.BSKY_APP_PASSWORD;

  let session = null;
  let seenText = '';
  if (live) {
    session = await api(fetchImpl, 'POST', 'com.atproto.server.createSession', {
      body: { identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD },
    });
    const feed = await api(fetchImpl, 'GET', 'app.bsky.feed.getAuthorFeed', {
      token: session.accessJwt, query: { actor: session.did, limit: '100' },
    });
    seenText = feed.feed.map((f) => f.post.record?.text ?? '').join('\n');
  }
  const posts = await plan({ launched, today, seenText, readPage });
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_BLUESKY=true plus BSKY_HANDLE / BSKY_APP_PASSWORD to post). ${posts.length} post(s):`);
    for (const p of posts) log(`--- ${p.slug}\n${p.text}\n`);
    return { posted: 0, planned: posts.length };
  }
  for (const p of posts) {
    await api(fetchImpl, 'POST', 'com.atproto.repo.createRecord', {
      token: session.accessJwt,
      body: {
        repo: session.did, collection: 'app.bsky.feed.post',
        record: { $type: 'app.bsky.feed.post', text: p.text, facets: p.facets, langs: ['en'], createdAt: now.toISOString() },
      },
    });
    log(`posted ${p.slug}`);
  }
  return { posted: posts.length, planned: posts.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
