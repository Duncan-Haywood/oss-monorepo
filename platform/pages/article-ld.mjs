// Fill the properties an Article's structured data is judged by, where the
// page left them out.
//
// Google's Article structured data lists `author`, `image`, `datePublished`
// and `dateModified` as the properties it reads; answer engines quote a page
// more readily when they can say who published it. Measured 2026-11-25 on
// the venture tree: 97 hand-written Article / TechArticle blocks (the
// pay-app guides among them, the front door to bet 1), none with `image`,
// `publisher` or `mainEntityOfPage`, 80 without `url` and 51 without
// `author`; and every blog post's BlogPosting lacked all five. The build
// already knows each page's canonical URL and share card, so it can say what
// the page forgot.
//
// Only missing properties are added. A venture's own value always wins, and
// a block that does not parse is left exactly as it was. The author and
// publisher named are the site's own organisation, the node the hub
// describes at `<base>#organization` (home.mjs, siteStructuredData): that is
// who publishes these pages, and it names no person.

/** Schema.org types Google treats as an Article. */
export const ARTICLE_TYPES = new Set(['Article', 'TechArticle', 'BlogPosting', 'NewsArticle', 'Report', 'ScholarlyArticle']);

const isArticle = (node) => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some((t) => ARTICLE_TYPES.has(t));
};

/** The site's organisation as an author or publisher: the hub's node, by id, with enough to stand alone. */
export function siteOrganization({ baseUrl, siteName }) {
  return { '@type': 'Organization', '@id': `${baseUrl}#organization`, name: siteName, url: baseUrl };
}

/**
 * Add what an Article node lacks, in place. Returns true when it changed.
 * `canonical` and `baseUrl` are absolute; `image` may be empty.
 */
export function completeArticleNode(node, { canonical, baseUrl, siteName, image }) {
  if (!isArticle(node)) return false;
  let changed = false;
  const fill = (key, value) => {
    if (value === undefined || value === null || value === '') return;
    if (node[key] !== undefined && node[key] !== null && node[key] !== '') return;
    node[key] = value;
    changed = true;
  };
  fill('url', canonical);
  fill('mainEntityOfPage', canonical ? { '@type': 'WebPage', '@id': canonical } : undefined);
  fill('image', image);
  if (baseUrl && siteName) {
    fill('publisher', siteOrganization({ baseUrl, siteName }));
    fill('author', siteOrganization({ baseUrl, siteName }));
  }
  return changed;
}

const LD_BLOCK = /(<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;

/**
 * Complete every Article-type node in a page's JSON-LD blocks (a top-level
 * node, an array of nodes, or an `@graph`). Blocks with no Article, or that do
 * not parse, come back byte for byte.
 */
export function completeArticleJsonLd(html, { canonical, baseUrl, siteName, image } = {}) {
  if (!canonical || !baseUrl) return html;
  return html.replace(LD_BLOCK, (whole, open, body, close) => {
    let doc;
    try {
      doc = JSON.parse(body);
    } catch {
      return whole;
    }
    const nodes = Array.isArray(doc) ? doc : Array.isArray(doc?.['@graph']) ? doc['@graph'] : [doc];
    let changed = false;
    for (const node of nodes) {
      if (completeArticleNode(node, { canonical, baseUrl, siteName, image })) changed = true;
    }
    if (!changed) return whole;
    // `<` escaped so no value can close the script element early.
    return `${open}${JSON.stringify(doc).replace(/</g, '\\u003c')}${close}`;
  });
}
