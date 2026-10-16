/**
 * Mastodon announcer: one status per newly launched tool, from an account
 * flagged as a bot. Off by default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/mastodon.mjs            # dry run: prints the statuses
 *   DISTRIBUTE_MASTODON=true MASTODON_INSTANCE=https://example.social \
 *     MASTODON_TOKEN=... node platform/distribution/mastodon.mjs   # posts for real
 *
 * Same shape as bluesky.mjs and it reuses its launch window, page metadata
 * and URL helpers. De-duplication is stateless: the account's recent statuses
 * are read back and any tool whose URL is already there is skipped; each post
 * also carries an Idempotency-Key so a retried request cannot double-post.
 * Statuses are public ("unlisted" would hide them from the tag feeds people
 * browse), carry no hashtags beyond the plain label, and mention nobody.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, recentLaunches, toolUrl, MAX_PER_RUN } from './bluesky.mjs';
import { tagUrl } from './attribution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_CHARS = 500; // Mastodon's default; instances may raise it, never lower it below this
const URL_WEIGHT = 23; // the server counts every link as 23 characters

const chars = (s) => [...s].length;
function clip(s, max) {
  const c = [...s];
  return c.length <= max ? s : c.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
}

/** Status text for one tool. Counted the way Mastodon counts: links weigh 23. */
export function composeStatus({ title, description }, url) {
  const head = `New free tool: ${title.split(/\s[—–|-]\s/)[0]}`;
  const tail = `\n\n${url}\n\nFree and open source (MIT). Automated post.`;
  const tailLen = chars(tail) - chars(url) + URL_WEIGHT;
  const room = MAX_CHARS - chars(head) - tailLen - 2;
  const body = room > 20 ? `\n${clip(description.split(/(?<=\.)\s/)[0], room)}` : '';
  return clip(head, MAX_CHARS - tailLen) + body + tail;
}

/** Which statuses would go out. `seenText` is the account's recent status text. */
export async function plan({ launched, today, seenText = '', readPage, max = MAX_PER_RUN }) {
  const out = [];
  for (const slug of recentLaunches(launched, today)) {
    const url = toolUrl(slug);
    if (seenText.includes(url)) continue;
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (!meta) continue;
    out.push({ slug, url, text: composeStatus(meta, tagUrl(url, 'mastodon')) });
    if (out.length >= max) break;
  }
  return out;
}

const stripTags = (h) => h.replace(/<[^>]*>/g, ' ');

async function api(fetchImpl, base, method, pathname, { token, body, key } = {}) {
  const res = await fetchImpl(new URL(pathname, base), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {}),
    },
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
  if (live && !/^https:\/\//.test(env.MASTODON_INSTANCE)) throw new Error('MASTODON_INSTANCE must be an https:// URL');

  let seenText = '';
  if (live) {
    const me = await api(fetchImpl, env.MASTODON_INSTANCE, 'GET', '/api/v1/accounts/verify_credentials', { token: env.MASTODON_TOKEN });
    if (!me.bot) throw new Error('refusing to post: the account is not flagged as a bot (Settings > Profile > "This is a bot account")');
    const recent = await api(fetchImpl, env.MASTODON_INSTANCE, 'GET', `/api/v1/accounts/${me.id}/statuses?limit=40&exclude_replies=true`, { token: env.MASTODON_TOKEN });
    seenText = recent.map((s) => stripTags(s.content ?? '') + ' ' + (s.card?.url ?? '') + ' ' + (s.content ?? '')).join('\n');
  }
  const posts = await plan({ launched, today, seenText, readPage });
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_MASTODON=true plus MASTODON_INSTANCE / MASTODON_TOKEN to post). ${posts.length} status(es):`);
    for (const p of posts) log(`--- ${p.slug}\n${p.text}\n`);
    return { posted: 0, planned: posts.length };
  }
  for (const p of posts) {
    await api(fetchImpl, env.MASTODON_INSTANCE, 'POST', '/api/v1/statuses', {
      token: env.MASTODON_TOKEN, key: `launch-${p.slug}`,
      body: { status: p.text, visibility: 'public', language: 'en' },
    });
    log(`posted ${p.slug}`);
  }
  return { posted: posts.length, planned: posts.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
