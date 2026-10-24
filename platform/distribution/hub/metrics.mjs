// What does best: read each platform's own numbers back where it lets us,
// join them with the site's own arrivals per `?ref=` tag, and rank.
//
// Two kinds of evidence, kept apart because they measure different things:
//
//   engagement  what a platform reports about a post (likes, replies,
//               reposts, views). Read per post, so it can compare copy
//               templates (`compose.mjs` TEMPLATES) as well as platforms.
//   arrivals    page loads on our site that came through a platform's tagged
//               link (`ref:<tag>` in portfolio/usage/site-visits.json) or
//               from its domain (`src:<class>`). The only number that says
//               a post sent someone to a tool. Counted per platform and day,
//               never per person (platform/counter/counter.mjs).
//
// Ranking uses shrinkage: a platform's per-post rate is pulled toward the
// all-platform mean by PRIOR_POSTS pseudo-posts, so two lucky posts do not
// beat fifty steady ones. Anything with fewer than MIN_POSTS posts is
// reported as "too few posts to rank" rather than ranked.

import { templateOf } from './compose.mjs';
import { THREADS, GRAPH } from './adapters.mjs';

export const PRIOR_POSTS = 5;
export const MIN_POSTS = 5;

const URL_RE = /https?:\/\/duncan-haywood\.github\.io\/oss-monorepo\/[^\s)"']*/;
const sum = (o) => Object.values(o).reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0);

/** A normalised post reading. `metrics.views` is kept out of `engagement` because not every platform reports it. */
export function reading(platform, { id, text, date, metrics }) {
  const { views, ...interactions } = metrics;
  const page = (String(text || '').match(URL_RE)?.[0] || '').replace(/[?#].*$/, '') || null;
  return { platform, id: String(id), date: date ? String(date).slice(0, 10) : null, page, template: templateOf(text), views: Number.isFinite(views) ? views : null, metrics: interactions, engagement: sum(interactions) };
}

async function getJson(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`GET ${String(url).split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

/** Readers: env -> null when it cannot run, else async ({ env, fetchImpl }) -> readings. */
export const READERS = {
  bluesky: {
    needs: (env) => (env.BSKY_HANDLE ? null : 'BSKY_HANDLE unset'),
    async read({ env, fetchImpl }) {
      const u = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
      u.search = new URLSearchParams({ actor: env.BSKY_HANDLE, limit: '100', filter: 'posts_no_replies' });
      const r = await getJson(fetchImpl, u);
      return (r.feed || []).filter((f) => !f.reason).map(({ post: p }) => reading('bluesky', {
        id: p.uri, text: p.record?.text, date: p.record?.createdAt,
        metrics: { likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0, replies: p.replyCount ?? 0, quotes: p.quoteCount ?? 0 },
      }));
    },
  },
  mastodon: {
    needs: (env) => (env.MASTODON_INSTANCE && env.MASTODON_ACCT ? null : 'MASTODON_INSTANCE or MASTODON_ACCT unset'),
    async read({ env, fetchImpl }) {
      const base = env.MASTODON_INSTANCE.replace(/\/$/, '');
      const acct = await getJson(fetchImpl, `${base}/api/v1/accounts/lookup?acct=${encodeURIComponent(env.MASTODON_ACCT)}`);
      const list = await getJson(fetchImpl, `${base}/api/v1/accounts/${acct.id}/statuses?limit=40&exclude_replies=true&exclude_reblogs=true`);
      const strip = (h) => String(h || '').replace(/<a [^>]*href="([^"]+)"[^>]*>.*?<\/a>/g, '$1').replace(/<br\s*\/?>/g, '\n').replace(/<\/p><p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
      return list.map((s) => reading('mastodon', {
        id: s.id, text: strip(s.content), date: s.created_at,
        metrics: { likes: s.favourites_count ?? 0, reposts: s.reblogs_count ?? 0, replies: s.replies_count ?? 0 },
      }));
    },
  },
  threads: {
    needs: (env) => (env.THREADS_TOKEN ? null : 'THREADS_TOKEN unset'),
    async read({ env, fetchImpl }) {
      const u = new URL(`${THREADS}/me/threads`);
      u.search = new URLSearchParams({ fields: 'id,text,timestamp', limit: '50', access_token: env.THREADS_TOKEN });
      const posts = (await getJson(fetchImpl, u)).data || [];
      const out = [];
      for (const p of posts) {
        const q = new URL(`${THREADS}/${p.id}/insights`);
        q.search = new URLSearchParams({ metric: 'views,likes,replies,reposts,quotes', access_token: env.THREADS_TOKEN });
        const m = {};
        for (const d of (await getJson(fetchImpl, q)).data || []) m[d.name] = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
        out.push(reading('threads', { id: p.id, text: p.text, date: p.timestamp, metrics: m }));
      }
      return out;
    },
  },
  facebook: {
    needs: (env) => (env.FACEBOOK_PAGE_TOKEN && env.FACEBOOK_PAGE_ID ? null : 'FACEBOOK_PAGE_TOKEN or FACEBOOK_PAGE_ID unset'),
    async read({ env, fetchImpl }) {
      const u = new URL(`${GRAPH}/${env.FACEBOOK_PAGE_ID}/posts`);
      u.search = new URLSearchParams({
        fields: 'id,message,created_time,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
        limit: '50', access_token: env.FACEBOOK_PAGE_TOKEN,
      });
      return ((await getJson(fetchImpl, u)).data || []).map((p) => reading('facebook', {
        id: p.id, text: p.message, date: p.created_time,
        metrics: { likes: p.reactions?.summary?.total_count ?? 0, replies: p.comments?.summary?.total_count ?? 0, reposts: p.shares?.count ?? 0 },
      }));
    },
  },
  instagram: {
    needs: (env) => (env.INSTAGRAM_TOKEN && env.INSTAGRAM_USER_ID ? null : 'INSTAGRAM_TOKEN or INSTAGRAM_USER_ID unset'),
    async read({ env, fetchImpl }) {
      const u = new URL(`${GRAPH}/${env.INSTAGRAM_USER_ID}/media`);
      u.search = new URLSearchParams({ fields: 'id,caption,timestamp,like_count,comments_count', limit: '50', access_token: env.INSTAGRAM_TOKEN });
      return ((await getJson(fetchImpl, u)).data || []).map((p) => reading('instagram', {
        id: p.id, text: p.caption, date: p.timestamp, metrics: { likes: p.like_count ?? 0, replies: p.comments_count ?? 0 },
      }));
    },
  },
  devto: {
    needs: (env) => (env.DEVTO_API_KEY ? null : 'DEVTO_API_KEY unset'),
    async read({ env, fetchImpl }) {
      const list = await getJson(fetchImpl, 'https://dev.to/api/articles/me/all?per_page=100', { 'api-key': env.DEVTO_API_KEY });
      return list.filter((a) => a.published).map((a) => ({
        ...reading('devto', { id: a.id, text: a.canonical_url || '', date: a.published_at, metrics: { views: a.page_views_count, likes: a.public_reactions_count ?? 0, replies: a.comments_count ?? 0 } }),
        template: null,
      }));
    },
  },
};

/** Run every reader that is configured; a failing reader is reported, not fatal. */
export async function collect({ env = process.env, fetchImpl = fetch } = {}) {
  const readings = [];
  const status = {};
  for (const [id, r] of Object.entries(READERS)) {
    const why = r.needs(env);
    if (why) { status[id] = `skipped: ${why}`; continue; }
    try {
      const got = await r.read({ env, fetchImpl });
      readings.push(...got);
      status[id] = `${got.length} post(s)`;
    } catch (e) {
      status[id] = `error: ${e.message}`;
    }
  }
  return { readings, status };
}

/** Per-tag and per-source arrivals from the counter's day map, optionally from `since` (YYYY-MM-DD). */
export function arrivals(days = {}, since = '') {
  const ref = {};
  const src = {};
  for (const [day, counts] of Object.entries(days)) {
    if (since && day < since) continue;
    for (const [k, n] of Object.entries(counts || {})) {
      if (!Number.isInteger(n) || n < 0) continue;
      if (k.startsWith('ref:')) ref[k.slice(4)] = (ref[k.slice(4)] || 0) + n;
      else if (k.startsWith('src:')) src[k.slice(4)] = (src[k.slice(4)] || 0) + n;
    }
  }
  return { ref, src };
}

const shrink = (total, n, prior) => (total + PRIOR_POSTS * prior) / (n + PRIOR_POSTS);

/**
 * The scoreboard. `platforms` is the registry (for ref tags), `readings` from `collect`,
 * `days` from site-visits.json. Returns { platforms: [...], templates: [...], best, notes }.
 */
export function scoreboard({ platforms, readings, days = {}, since = '' }) {
  const { ref } = arrivals(days, since);
  const measured = Object.keys(days).length > 0; // no file means unmeasured, never zero
  const posts = {};
  for (const r of readings) (posts[r.platform] ||= []).push(r);

  const rows = platforms.filter((p) => p.ref || posts[p.id]).map((p) => {
    const list = posts[p.id] || [];
    const eng = list.reduce((a, r) => a + r.engagement, 0);
    const views = list.some((r) => r.views !== null) ? list.reduce((a, r) => a + (r.views || 0), 0) : null;
    return { platform: p.id, name: p.name, mode: p.mode, posts: list.length, engagement: eng, views, arrivals: p.ref && measured ? ref[p.ref] || 0 : null };
  });

  const counted = rows.filter((r) => r.posts > 0);
  const totalPosts = counted.reduce((a, r) => a + r.posts, 0);
  const meanEng = totalPosts ? counted.reduce((a, r) => a + r.engagement, 0) / totalPosts : 0;
  const meanArr = totalPosts ? counted.reduce((a, r) => a + (r.arrivals || 0), 0) / totalPosts : 0;
  for (const r of rows) {
    r.engagementPerPost = r.posts ? +(r.engagement / r.posts).toFixed(2) : null;
    r.arrivalsPerPost = r.posts && r.arrivals !== null ? +(r.arrivals / r.posts).toFixed(2) : null;
    r.score = r.posts ? +shrink(r.arrivals || 0, r.posts, meanArr).toFixed(3) : null;
    r.engagementScore = r.posts ? +shrink(r.engagement, r.posts, meanEng).toFixed(3) : null;
    r.rankable = r.posts >= MIN_POSTS;
  }
  rows.sort((a, b) => (b.rankable - a.rankable) || ((b.score ?? -1) - (a.score ?? -1)) || ((b.engagementScore ?? -1) - (a.engagementScore ?? -1)) || ((b.arrivals ?? -1) - (a.arrivals ?? -1)));

  // Templates: engagement relative to the same platform's mean, so a big platform does not make its templates look good.
  const platMean = Object.fromEntries(Object.entries(posts).map(([id, l]) => [id, l.reduce((a, r) => a + r.engagement, 0) / l.length || 0]));
  const tpl = {};
  for (const r of readings) {
    if (!r.template) continue;
    const t = (tpl[r.template] ||= { template: r.template, posts: 0, lift: 0, platforms: new Set() });
    t.posts += 1;
    t.platforms.add(r.platform);
    t.lift += platMean[r.platform] > 0 ? r.engagement / platMean[r.platform] : 1;
  }
  const templates = Object.values(tpl).map((t) => ({
    template: t.template, posts: t.posts, platforms: [...t.platforms].sort(),
    lift: +shrink(t.lift, t.posts, 1).toFixed(3), rankable: t.posts >= MIN_POSTS,
  })).sort((a, b) => (b.rankable - a.rankable) || b.lift - a.lift);

  const notes = [];
  if (!readings.length) notes.push('No post readings yet: no platform reader is configured, or nothing has been posted.');
  if (!Object.keys(days).length) notes.push('No arrivals on file: the site counter is off (platform/counter/site.json), so arrivals are unmeasured, not zero.');
  const best = rows.find((r) => r.rankable) || null;
  return { platforms: rows, templates, best: best && best.platform, notes };
}

export function formatScoreboard(s) {
  const out = ['Platforms (score = arrivals per post, shrunk toward the mean; needs ' + MIN_POSTS + '+ posts to rank):'];
  out.push('  platform        mode       posts  engagement/post  views  arrivals  score');
  for (const r of s.platforms) {
    out.push(`  ${r.platform.padEnd(15)} ${r.mode.padEnd(10)} ${String(r.posts).padStart(5)}  ${String(r.engagementPerPost ?? '-').padStart(15)}  ${String(r.views ?? '-').padStart(5)}  ${String(r.arrivals ?? '-').padStart(8)}  ${r.rankable ? r.score : 'too few posts to rank'}`);
  }
  out.push('', 'Copy templates (lift = engagement relative to the same platform\'s average; 1.0 = average):');
  if (!s.templates.length) out.push('  no posts with a recognised template yet');
  for (const t of s.templates) out.push(`  ${t.template.padEnd(12)} posts ${String(t.posts).padStart(4)}  lift ${t.rankable ? t.lift : 'too few posts'}  (${t.platforms.join(', ')})`);
  if (s.best) out.push('', `Best so far: ${s.best}.`);
  for (const n of s.notes) out.push(`Note: ${n}`);
  return out.join('\n');
}
