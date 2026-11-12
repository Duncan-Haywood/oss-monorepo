// How the site writes a count a reader sees: "1,073 projects", never
// "1073 projects".
//
// Why (2026-11-11, docs/reports/polish-2026-11-11-count-format.md): the
// research index's stat row read "1073 research projects" beside "8,985 unit
// tests", the hub said "Search 1338 tools and 1073 research projects", and the
// blog's filter chip said "All 3591". The research tests count went through
// Python's `:,` and nothing else did, so the same page used two styles. One
// helper for every template means a new count is formatted the way the others
// are without anyone remembering to.
//
// en-US grouping, not the reader's locale: the page is built once and served
// to everyone, its copy is in English, and a build machine's locale would
// otherwise decide what every visitor sees.
const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * `1073` → `"1,073"`; `9` → `"9"`. Anything that is not a finite number (a
 * placeholder such as "—", `null`) comes back as its own text, so a template
 * can pass through a missing figure without a guard.
 */
export function formatCount(value) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return value == null ? '' : String(value);
  return GROUPED.format(n);
}

/**
 * A count of four or more digits written without grouping, followed by the
 * kind of word the site counts ("1338 tools", "All 3591"). Used by
 * `count-format-check.mjs` over the built pages. Years ("2026 calculator"),
 * form numbers ("Form 1099") and codes are not counts, so the pattern only
 * fires on the nouns the site's own templates count.
 */
export const UNGROUPED_COUNT =
  /(?<![\d,.$£€#\/:\-])(?!(?:19|20)\d\d\b)\d{4,}(?![\d,.%:\-])\s*(?:free |reproducible |research |open-source |plain-English )?(?:tools?|projects?|posts?|pages?|sessions?|stories|calculators?|tests?)\b|\bAll \d{4,}\b/g;

/**
 * The ungrouped counts in a page's visible text and its title and meta
 * description, e.g. `['1338 tools', 'All 3591']`. Scripts and styles are
 * dropped first: a count inside client code is not something a reader sees
 * until the code writes it, and that code formats it itself.
 */
export function ungroupedCounts(html) {
  const head = [
    ...String(html).matchAll(/<title[^>]*>([\s\S]*?)<\/title>|<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/gi),
  ].map((m) => m[1] ?? m[2] ?? '');
  const body = String(html)
    .replace(/<(script|style|template|title)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const text = [...head, body].join(' ').replace(/\s+/g, ' ');
  return [...text.matchAll(UNGROUPED_COUNT)].map((m) => m[0].trim());
}

/**
 * The pages the site's own templates write counts on. Tool pages are not
 * here: their numbers are prices, form numbers and codes ("Form 1099",
 * "CPT 97110") that a count rule would misread, and their authors own them.
 */
export const SITE_COUNT_PAGES = Object.freeze([
  'index.html',
  'research/index.html',
  'writing/index.html',
  'guides/index.html',
  'about/index.html',
  'engineering/index.html',
  'c/index.html',
]);
