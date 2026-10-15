/**
 * Mastodon announcer: one post per newly launched tool, from an account
 * flagged as a bot. Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/mastodon.mjs            # dry run: prints the posts
 *   DISTRIBUTE_MASTODON=true MASTODON_INSTANCE=https://example.social \
 *     MASTODON_TOKEN=... node platform/distribution/mastodon.mjs   # posts for real
 *
 * Same shape as bluesky.mjs: only tools launched within WINDOW_DAYS, at most
 * MAX_PER_RUN per run, stateless de-duplication by reading the account's own
 * recent statuses. Posts are "unlisted" by default (bot etiquette on most
 * instances: visible on the profile, not in the public timelines); set
 * MASTODON_VISIBILITY=public only if the instance's rules allow bots to.
 * Each post carries an Idempotency-Key so a retried request cannot double-post.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, recentLaunches, toolUrl, WINDOW_DAYS, MAX_PER_RUN } from './bluesky.mjs';

export { readMeta, recentLaunches, toolUrl, WINDOW_DAYS, MAX_PER_RUN };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
/** Mastodon's default limit; every URL counts as 23 characters whatever its length. */
export const MAX_CHARS = 500;
const URL_COST = 23;
const VISIBILITIES = ['public', 'unlisted', 'private'];

const chars = (s) => [...s];
function clip(s, max) {
  const c = chars(s);
  return c.length <= max ? s : c.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
}

/** Status text for one tool. Its Mastodon-counted length is always <= MAX_CHARS. */
export function composePost({ title, description }, url) {
  const head = `New free tool: ${title.split(/\s[—–|-]\s/)[0]}`;
  const tail = `\n\n${url}\n\nFree and open source (MIT). Automated post.`;
  const tailCost = chars(tail).length - chars(url).length + URL_COST;
  const room = MAX_CHARS - chars(head).length - tailCost - 2;
  const body = room > 20 ? `\n${clip(description.split(/(?<=\.)\s/)[0], room)}` : '';
  return { text: clip(head, MAX_CHARS - tailCost) + body + tail };
}

/** Pure planning step: which posts would go out. `seenText` is the account's recent status text. */
export async function plan({ launched, today, seenText = '', readPage, max = MAX_PER_RUN }) {
  const out = [];
  for (const slug of recentLaunches(launched, today)) {
    const url = toolUrl(slug);
    if (seenText.includes(url)) continue;
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (!meta) continue;
    out.push({ slug, url, ...composePost(meta, url) });
    if (out.length >= max) break;
  }
  return out;
}

const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&');

async function api(fetchImpl, base, method, pathname, { token, body, headers } = {}) {
  const res = await fetchImpl(new URL(pathname, base), {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status}`);
  return res.json();
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const launched = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform/pages/launched.json'), 'utf8')).launched;
  const readPage = (slug) => fs.readFile(path.join(REPO_ROOT, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
  const today = now.toISOString().slice(0, 10);
  const live = env.DISTRIBUTE_MASTODON === 'true' && env.MASTODON_INSTANCE && env.MASTODON_TOKEN;
  const visibility = VISIBILITIES.includes(env.MASTODON_VISIBILITY) ? env.MASTODON_VISIBILITY : 'unlisted';
  if (live && !/^https:\/\//.test(env.MASTODON_INSTANCE)) throw new Error('MASTODON_INSTANCE must be an https:// URL');

  let seenText = '';
  if (live) {
    const me = await api(fetchImpl, env.MASTODON_INSTANCE, 'GET', '/api/v1/accounts/verify_credentials', { token: env.MASTODON_TOKEN });
    if (!me.bot) throw new Error('refusing to post: the account is not flagged as a bot (Preferences > Profile > "This is a bot account")');
    const statuses = await api(fetchImpl, env.MASTODON_INSTANCE, 'GET', `/api/v1/accounts/${me.id}/statuses?limit=40&exclude_replies=true`, { token: env.MASTODON_TOKEN });
    seenText = statuses.map((s) => stripTags(s.content ?? '') + ' ' + (s.card?.url ?? '')).join('\n');
  }
  const posts = await plan({ launched, today, seenText, readPage });
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_MASTODON=true plus MASTODON_INSTANCE / MASTODON_TOKEN to post). ${posts.length} post(s):`);
    for (const p of posts) log(`--- ${p.slug}\n${p.text}\n`);
    return { posted: 0, planned: posts.length };
  }
  for (const p of posts) {
    await api(fetchImpl, env.MASTODON_INSTANCE, 'POST', '/api/v1/statuses', {
      token: env.MASTODON_TOKEN,
      headers: { 'idempotency-key': `launch-${p.slug}-${today}` },
      body: { status: p.text, visibility, language: 'en' },
    });
    log(`posted ${p.slug}`);
  }
  return { posted: posts.length, planned: posts.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
