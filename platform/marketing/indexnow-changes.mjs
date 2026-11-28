/**
 * Which URLs changed since the last deploy, so IndexNow hears about those and
 * not about the whole site again.
 *
 * ## Why this exists
 *
 * Until 2026-11-28 every finished deploy of marisstella.app submitted every
 * URL the sitemaps list: 13,349 of them in two requests on run 46086136040,
 * and main deploys many times a day. The protocol asks for the opposite. The
 * IndexNow FAQ (https://www.indexnow.org/faq, read through a search on
 * 2026-11-28) says to submit URLs when content is added, updated or deleted,
 * to submit only content that has actually changed, and to submit every URL
 * only after a migration or redesign. Bing's getting-started page
 * (https://www.bing.com/indexnow/getstarted) says the same: publish the URLs
 * that changed. The documentation lists 429 as "Too Many Requests (potential
 * Spam)". Resending 13,000 unchanged URLs dozens of times a day looks like
 * that, and four weeks after the domain went live no search sampled from a
 * session finds a single page of it (platform/seo/STATUS.md).
 *
 * ## How
 *
 * The deploy writes `indexnow-manifest.json` at the site root: for each URL
 * it announces, a short hash of the file that serves it. Before the next
 * deploy replaces the site, the workflow downloads the live manifest; after
 * the deploy, `indexnow.mjs --previous <that file>` submits only the URLs
 * whose hash differs, the new ones, and the removed ones (the FAQ asks for
 * 404s too, so engines drop them). With no readable previous manifest (the
 * first deploy, or a fetch that failed) it submits everything, as before.
 *
 * Pure functions apart from the reads `readFile` does; no network.
 */

import { createHash } from 'node:crypto';

export const MANIFEST_FILE = 'indexnow-manifest.json';
export const MANIFEST_VERSION = 1;

/** A short content hash: 16 hex characters of SHA-256, plenty for change detection. */
export function pageHash(text) {
  return createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

/**
 * The files that might serve a URL, most likely first, as paths relative to
 * the site root. `/x/` is `x/index.html`; an extensionless `/x/page` is
 * `x/page.html` (the Workers static-asset pretty URL) or `x/page/index.html`;
 * anything with an extension is itself. Null for a URL outside `baseUrl`.
 */
export function candidateFiles(url, baseUrl) {
  if (!url.startsWith(baseUrl)) return null;
  let rel = url.slice(baseUrl.length).split('#')[0].split('?')[0];
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (rel.split('/').includes('..')) return null;
  if (rel === '' || rel.endsWith('/')) return [`${rel}index.html`];
  const last = rel.slice(rel.lastIndexOf('/') + 1);
  if (last.includes('.')) return [rel];
  return [`${rel}.html`, `${rel}/index.html`, rel];
}

/**
 * The manifest for these URLs: `{ version, pages: { url: hash } }`. A URL
 * whose file cannot be read is left out, so it counts as new next time
 * rather than as unchanged.
 */
export async function buildManifest(readFile, urls, baseUrl) {
  const pages = {};
  for (const url of urls) {
    const files = candidateFiles(url, baseUrl);
    if (!files) continue;
    for (const file of files) {
      let text;
      try {
        text = await readFile(file);
      } catch {
        continue;
      }
      pages[url] = pageHash(text);
      break;
    }
  }
  return { version: MANIFEST_VERSION, pages };
}

/**
 * A previous manifest from its JSON text, or null when it is missing, not
 * JSON, another version, or the wrong shape. Null means "submit everything".
 */
export function parseManifest(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || data.version !== MANIFEST_VERSION) return null;
  const { pages } = data;
  if (!pages || typeof pages !== 'object' || Array.isArray(pages)) return null;
  for (const value of Object.values(pages)) if (typeof value !== 'string') return null;
  return data;
}

/**
 * What to announce, comparing the previous manifest with the current one:
 * `added` (no previous hash), `changed` (a different hash), `removed` (in the
 * previous manifest, gone now), and `unchanged`, a count. `urls` is the three
 * lists together, sorted, which is what gets submitted.
 */
export function diffManifests(previous, current) {
  const before = previous.pages;
  const after = current.pages;
  const added = [];
  const changed = [];
  const removed = [];
  let unchanged = 0;
  for (const [url, hash] of Object.entries(after)) {
    if (!Object.hasOwn(before, url)) added.push(url);
    else if (before[url] !== hash) changed.push(url);
    else unchanged += 1;
  }
  for (const url of Object.keys(before)) if (!Object.hasOwn(after, url)) removed.push(url);
  const urls = [...added, ...changed, ...removed].sort();
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort(), unchanged, urls };
}
