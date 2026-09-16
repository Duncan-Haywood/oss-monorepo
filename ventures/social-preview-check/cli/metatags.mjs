// Extracts Open Graph, Twitter Card and canonical-link metadata from a page's
// raw HTML. Pure string parsing, no I/O -- this is the module both the CLI
// (probe.mjs, which fetches the HTML for real) and any future caller that
// already has HTML in hand can import, so the extraction logic exists
// exactly once.
//
// Deliberately not a full HTML parser (no dependency to keep the CLI
// zero-install). It reads every <meta ...> and <link ...> tag with a regex
// scan and pulls property/name/content/href/rel off each one, which is
// enough for the flat, non-nested tags every real-world OG/Twitter
// implementation actually emits -- the same tradeoff structured-data-drift-
// check's own tag scanner makes for the same reason.
//
// Duplicate tags are recorded, not silently overwritten: **first tag in
// document order wins** for the value used everywhere else in this venture,
// matching how most crawlers resolve a duplicate og:* property, but a
// duplicate is itself a notice-worthy finding (a common bug: a CMS plugin
// and a hand-written tag both emit og:title), so `duplicates` counts every
// key seen more than once.

const NAMED_ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(lt|gt|quot|apos);/g, (_, name) => NAMED_ENTITIES[name])
    .replace(/&amp;/g, '&');
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

function parseAttrs(tagSource) {
  const attrs = {};
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(tagSource)) !== null) {
    const name = match[1].toLowerCase();
    const raw = match[3] !== undefined ? match[3] : match[4];
    attrs[name] = decodeEntities(raw);
  }
  return attrs;
}

/**
 * @param {string} html
 * @returns {{
 *   title: string|null,
 *   canonical: string|null,
 *   og: Record<string,string>,
 *   twitter: Record<string,string>,
 *   duplicates: Record<string,number>,
 * }}
 */
export function parseMetaTags(html) {
  const result = { title: null, canonical: null, og: {}, twitter: {}, duplicates: {} };
  if (typeof html !== 'string' || html === '') return result;

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) result.title = decodeEntities(titleMatch[1]).trim() || null;

  const seenCounts = new Map();
  const tagRe = /<(meta|link)\b[^>]*>/gi;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrs = parseAttrs(match[0]);

    if (tagName === 'link') {
      if ((attrs.rel || '').toLowerCase() === 'canonical' && attrs.href && result.canonical === null) {
        result.canonical = attrs.href;
      }
      continue;
    }

    const key = (attrs.property || attrs.name || '').toLowerCase();
    const content = attrs.content;
    if (!key || content === undefined) continue;

    let bucket = null;
    let shortKey = null;
    if (key.startsWith('og:')) {
      bucket = result.og;
      shortKey = key.slice(3);
    } else if (key.startsWith('twitter:')) {
      bucket = result.twitter;
      shortKey = key.slice('twitter:'.length);
    } else {
      continue;
    }

    seenCounts.set(key, (seenCounts.get(key) || 0) + 1);
    if (!(shortKey in bucket)) bucket[shortKey] = content;
  }

  for (const [key, count] of seenCounts) {
    if (count > 1) result.duplicates[key] = count;
  }

  return result;
}

/** Resolves a possibly-relative URL string against a base URL. Returns null
 * (never throws) for an empty value or one that fails to resolve. */
export function resolveUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

/** True when `value` is already an absolute http(s) URL, as the Open Graph
 * protocol requires og:image (and og:url) to be. */
export function isAbsoluteHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
