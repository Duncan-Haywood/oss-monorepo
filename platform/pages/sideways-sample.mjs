// Which pages `sideways.mjs SAMPLE=N` probes.
//
// An even spread over ~5,900 pages lands almost entirely on venture tools and
// writing posts, so the twenty or so section index pages a visitor meets first
// (the hub, /research/, /writing/, /compare/, /guides/, /about/, /engineering/,
// /stories/ ...) were rarely in the sample. /research/ was 428 px wide in a
// 360 px window for days before a hand screenshot found it (polish note
// 2026-11-10, "site-owned pages had no reflow guard"). So a sample always
// carries every site-owned index page at the top two levels, then spreads the
// rest of its budget evenly over everything else. Read the whole file when
// deciding "site-owned": /guides/ links pf-site.css 328 KB in, after its
// inline styles.

/** `index.html` or `<section>/index.html`: the pages one click from the hub. */
export function isSectionIndex(rel) {
  return /^([^/]+\/)?index\.html$/.test(rel);
}

/**
 * @param {string[]} pages   every candidate page, relative to the dist root
 * @param {number} n         the sample budget (0 or >= pages.length: all)
 * @param {(rel: string) => boolean} isSiteOwned  true when the page links pf-site.css
 * @returns {string[]} the pinned index pages first, then the even spread
 */
export function samplePages(pages, n, isSiteOwned) {
  if (!(n > 0) || pages.length <= n) return pages;
  const pinned = pages.filter((rel) => isSectionIndex(rel) && isSiteOwned(rel));
  const pinnedSet = new Set(pinned);
  const rest = pages.filter((rel) => !pinnedSet.has(rel));
  const budget = Math.max(0, n - pinned.length);
  const step = rest.length / budget;
  const spread = budget ? Array.from({ length: budget }, (_, i) => rest[Math.floor(i * step)]) : [];
  return [...pinned, ...spread];
}
