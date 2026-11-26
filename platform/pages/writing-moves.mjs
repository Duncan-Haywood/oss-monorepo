/**
 * Where an old `writing/...` URL lives now.
 *
 * Until 2026-11-26 every post was at `writing/<slug>/`. The owner split the
 * blog that day ("i think the move is to split the blogs for sure"): customer
 * posts moved to the marketing blog at `blog/`, every other post to the
 * engineering blog at `engineering/` (writing.mjs, `blogOf`). Two things stay
 * at their old address because something outside the site holds the URL:
 *
 *   writing/feed.xml   the Atom feed readers subscribed to; it now lists every
 *                      post from both blogs, at their new URLs
 *   writing/podcast/   the podcast page and its RSS feeds, which podcast
 *                      apps poll by URL
 *
 * Everything else under `writing/` answers with a real 301 from the site
 * Worker (cloudflare/router.mjs), not a redirect page per post: 7,386 stub
 * pages would have pushed the shard Worker past Cloudflare's 20,000-file limit
 * (it held about 13,070 files on 2026-11-26), and a 301 is the stronger
 * signal to a search engine anyway. The build uses the same function to
 * rewrite links inside posts that still name a `writing/` URL.
 *
 * No Node imports: the router bundles this file into the Worker.
 */

export const LEGACY_PATH = 'writing/';
export const MARKETING_PATH = 'blog/';
export const ENGINEERING_BLOG_PATH = 'engineering/';

/** Folders under `writing/` that were not posts. `topic` and `agents` keep their shape under `engineering/`. */
const SECTION_DIRS = new Set(['topic', 'agents', 'page', 'podcast']);
const ENGINEERING_FILES = new Set(['search.json', 'posts.json']);

/**
 * The new home of `writing/<rest>` (`rest` without a leading slash), as a path
 * from the site root:
 *
 *   null                       still served where it is (the feed, the podcast)
 *   { path }                   moved there
 *   { slug, rest }             a post: `<blog>/<rest>` once the caller knows which
 *                              blog `slug` is on (`resolveMove`)
 */
export function legacyTarget(rest) {
  const r = String(rest ?? '').replace(/^\/+/, '');
  if (r === 'feed.xml' || r === 'podcast' || r.startsWith('podcast/')) return null;
  if (r === '' || r === 'index.html') return { path: MARKETING_PATH };
  const [head, second = ''] = r.split('/');
  // The customer topic's page became the marketing blog itself.
  if (head === 'topic' && second === 'business') return { path: MARKETING_PATH };
  // Numbered index pages renumbered when 632 posts left: send them to the index, not a page that may not exist.
  if (head === 'page') return { path: ENGINEERING_BLOG_PATH };
  if (SECTION_DIRS.has(head) || ENGINEERING_FILES.has(r)) return { path: `${ENGINEERING_BLOG_PATH}${r}` };
  return { slug: head, rest: r };
}

/**
 * `legacyTarget` resolved: `blogOfSlug(slug)` names a post's blog ('blog' or
 * 'engineering'); an unknown slug goes to the engineering blog, which held
 * nine posts in ten, so a typo lands on that blog's 404 rather than a loop.
 * Returns the path from the site root, or null when the URL is still served.
 */
export function resolveMove(rest, blogOfSlug) {
  const t = legacyTarget(rest);
  if (!t) return null;
  if (t.path) return t.path;
  const blog = blogOfSlug(t.slug) === 'blog' ? MARKETING_PATH : ENGINEERING_BLOG_PATH;
  return `${blog}${t.rest}`;
}

/**
 * Rewrite `href="<toRoot>writing/..."` links in a page to their new homes.
 * `bySlug` maps a post slug to its blog ('blog' or 'engineering'). Links to
 * the feed and the podcast are left as they are.
 */
export function rewriteLegacyLinks(html, toRoot, bySlug) {
  const lead = `href="${toRoot}${LEGACY_PATH}`;
  if (!html.includes(lead)) return html;
  const escaped = lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`${escaped}([^"#?]*)([#?][^"]*)?"`, 'g'), (m, rest, tail = '') => {
    const to = resolveMove(rest, (slug) => bySlug.get(slug));
    return to === null ? m : `href="${toRoot}${to}${tail}"`;
  });
}
