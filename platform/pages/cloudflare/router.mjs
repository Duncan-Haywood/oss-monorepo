// The site Worker. Cloudflare's free plan deploys at most 20,000 static files
// per Worker and the site is past that, so it is split in two: this Worker
// serves most of it from its own assets, and the directories below live in
// a second Worker (shard/) reached by a service binding. Static files served
// straight from assets are free and unmetered; only requests under these
// directories run code, which counts toward the free plan's 100,000 a day.

/** Top-level directories served by the shard. wrangler.toml's
 *  run_worker_first must list the same ones (split.test.mjs checks). */
export const SHARD_DIRS = ['research', 'writing', 'dev'];

/** The site's own domain, and the Worker's first address, which now sends
 *  every visitor there (owner, 2026-10-31: "this should also redirect").
 *  Static files on that address get a Refresh header from split.mjs's
 *  _headers rule, because they never run this code; requests that do run it
 *  get a real 301. */
export const SITE_ORIGIN = 'https://marisstella.app';
export const WORKERS_DEV_HOST = 'monorepo-projects-site.duncan-andrew-haywood.workers.dev';

export function inShard(pathname) {
  return SHARD_DIRS.some((d) => pathname === `/${d}` || pathname.startsWith(`/${d}/`));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === WORKERS_DEV_HOST) {
      return Response.redirect(`${SITE_ORIGIN}${url.pathname}${url.search}`, 301);
    }
    if (inShard(url.pathname)) return env.SHARD.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
