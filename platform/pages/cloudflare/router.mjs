// The site Worker. Cloudflare's free plan deploys at most 20,000 static files
// per Worker and the site is past that, so it is split in two: this Worker
// serves most of it from its own assets, and the directories below live in
// a second Worker (shard/) reached by a service binding. Static files served
// straight from assets are free and unmetered; only requests under these
// directories run code, which counts toward the free plan's 100,000 a day.

import { ENGINEERING_BLOG_PATH, MARKETING_PATH, legacyTarget } from '../writing-moves.mjs';

/** Top-level directories served by the shard. wrangler.toml's
 *  run_worker_first must list the same ones (split.test.mjs checks). */
// changepoint-detector and hearth-and-horizon moved here on 2026-11-20: the
// site Worker reached 20,071 files and every deploy failed for five hours.
// The five after them moved on 2026-11-25 at 20,026 (deploys failing since
// 11:29 UTC): MIT-commons and story directories, none a for-profit product's
// page (portfolio/monetization/transition.py), so no paid page runs code.
// blog and engineering joined on 2026-11-26, when the single blog at writing/
// split in two (writing.mjs): the 7,386 posts moved there out of writing/,
// which keeps only its feed and the podcast, so the shard's count barely moved.
// Both blogs are reading pages, not a paid product's checkout or app.
export const SHARD_DIRS = [
  'research', 'writing', 'dev', 'changepoint-detector', 'hearth-and-horizon',
  'open-tennis-robots', 'chant-forge', 'saints-by-candlelight', 'open-house-plans', 'open-floor-robots',
  'blog', 'engineering',
];

/** The site's own domain, and the Worker's first address, which now sends
 *  every visitor there (owner, 2026-10-31: "this should also redirect").
 *  Static files on that address get a Refresh header from split.mjs's
 *  _headers rule, because they never run this code; requests that do run it
 *  get a real 301. */
export const SITE_ORIGIN = 'https://marisstella.app';
export const WORKERS_DEV_HOST = 'monorepo-projects-site.duncan-andrew-haywood.workers.dev';

/** Top-level directories served by another Worker on this account, by
 *  service binding name. Grant Autopilot lives at /grants/ (owner,
 *  2026-11-24: "move to the path and do redirect"); the request goes on
 *  unchanged, so the app sees /grants/... and serves its own prefix. Its old
 *  host, grants.marisstella.app, 301s here from that Worker. wrangler.toml's
 *  run_worker_first lists these too (split.test.mjs checks). */
export const APP_DIRS = Object.freeze({ grants: 'GRANTS' });

/** The service binding for a path under one of APP_DIRS, or null. */
export function appBinding(pathname) {
  for (const [d, binding] of Object.entries(APP_DIRS)) {
    if (pathname === `/${d}` || pathname.startsWith(`/${d}/`)) return binding;
  }
  return null;
}

/**
 * Where a request for an old `/writing/...` URL goes now, as a path from the
 * site root, or null when it is still served (the feed, the podcast). A post's
 * blog is found by asking the shard whether `/blog/<slug>/` exists: no list of
 * slugs to ship with the Worker, and one subrequest only for an old post URL.
 */
export async function writingRedirect(pathname, probe) {
  if (pathname !== '/writing' && !pathname.startsWith('/writing/')) return null;
  const rest = pathname.slice('/writing/'.length);
  const t = legacyTarget(rest);
  if (!t) return null;
  if (t.path) return `/${t.path}`;
  return `/${(await probe(`/${MARKETING_PATH}${t.slug}/`)) ? MARKETING_PATH : ENGINEERING_BLOG_PATH}${t.rest}`;
}

export function inShard(pathname) {
  return SHARD_DIRS.some((d) => pathname === `/${d}` || pathname.startsWith(`/${d}/`));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === WORKERS_DEV_HOST) {
      return Response.redirect(`${SITE_ORIGIN}${url.pathname}${url.search}`, 301);
    }
    const app = appBinding(url.pathname);
    if (app && env[app]) return env[app].fetch(request);
    // The single blog's old URLs: a real 301 to the post's new blog (writing-moves.mjs).
    const moved = await writingRedirect(url.pathname, async (p) => {
      const r = await env.SHARD.fetch(new Request(`${url.origin}${p}`, { method: 'HEAD' }));
      return r.status === 200;
    });
    if (moved) return Response.redirect(`${url.origin}${moved}${url.search}`, 301);
    if (inShard(url.pathname)) return env.SHARD.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
