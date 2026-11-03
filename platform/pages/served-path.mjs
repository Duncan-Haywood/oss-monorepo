// The URL path Cloudflare serves a published HTML file at.
//
// wrangler.toml sets `html_handling = "auto-trailing-slash"`, which serves
// `tool/index.html` at `tool/` and `tool/page.html` at `tool/page`, and answers
// a request for either `.html` spelling with a 307 to that address. So a URL
// this site advertises (canonical, og:url, sitemap) must use the served form:
// on 2026-11-03, 2,075 of the 6,635 sitemap URLs ended in `.html`, each one a
// redirect, and each page's canonical named that redirecting URL, so search
// engines were told the canonical of `/tool/page` was a URL that redirects
// back to `/tool/page`.

/** `a/index.html` -> `a/`, `a/b.html` -> `a/b`, anything else unchanged. */
export function servedPath(relative) {
  const posix = relative.split('\\').join('/');
  if (posix === 'index.html') return '';
  if (posix.endsWith('/index.html')) return posix.slice(0, -'index.html'.length);
  if (posix.endsWith('.html')) return posix.slice(0, -'.html'.length);
  return posix;
}
