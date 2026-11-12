// Two things a search engine reads first and a copy-paste build can get wrong:
// every page needs its own, reasonably short <title>, and a page needs exactly one <h1> in its
// markup. Scripts and templates are stripped before counting, because a tool
// that builds an <h1> inside a template string is not a second heading.
//   used by check.mjs; node platform/pages/page-identity.mjs <dist> to run alone
import { promises as fs, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pages that are not search landing pages (error and offline shells).
const SKIP = new Set(['404.html', 'offline.html']);

// A results page shows about 60 characters of a title and a search engine
// weighs roughly the first dozen words. Research projects were titled with a
// whole question, up to 246 characters; the ceiling stops that coming back.
export const MAX_TITLE_LENGTH = 130;

export function stripNonMarkup(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

export function titleOf(html) {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

export function h1Count(html) {
  return (stripNonMarkup(html).match(/<h1[\s>]/gi) ?? []).length;
}

// pages: Map of relative path -> html. Returns problem strings.
export function checkPageIdentity(pages) {
  const problems = [];
  const byTitle = new Map();
  for (const [rel, html] of pages) {
    if (SKIP.has(rel)) continue;
    const title = titleOf(html);
    if (!title) problems.push(`${rel}: has no <title>`);
    else {
      byTitle.set(title, [...(byTitle.get(title) ?? []), rel]);
      const shown = title.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, '.');
      if (shown.length > MAX_TITLE_LENGTH) problems.push(`${rel}: <title> is ${shown.length} characters, over ${MAX_TITLE_LENGTH}; clip it for the results page`);
    }
    const n = h1Count(html);
    if (n !== 1) problems.push(`${rel}: has ${n} <h1> elements, expected exactly 1`);
  }
  for (const [title, rels] of byTitle) {
    if (rels.length > 1) {
      problems.push(`duplicate <title> "${title}" on ${rels.length} pages: ${rels.slice(0, 3).join(', ')}`);
    }
  }
  return problems;
}

function h1TextOf(html) {
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(stripNonMarkup(html));
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * A blog post whose `seo_title` repeats a tool page's title (2026-11-03: the
 * cold email checker post copied its page's title) failed check.mjs, and that
 * failure stopped every deploy until someone noticed. The tool page owns its
 * title; the post is the one renamed, to its own headline (the h1, already
 * escaped HTML), or with " · Blog" added when the headline clashes too.
 * pages: Map of relative path -> html. Returns [{ rel, from, to, html }].
 */
export function resolvePostTitleClashes(pages, { prefix = 'writing/' } = {}) {
  const taken = new Set();
  for (const [rel, html] of pages) {
    if (SKIP.has(rel) || rel.startsWith(prefix)) continue;
    const t = titleOf(html);
    if (t) taken.add(t);
  }
  const changes = [];
  for (const [rel, html] of pages) {
    if (!rel.startsWith(prefix)) continue;
    const from = titleOf(html);
    if (!from || !taken.has(from)) continue;
    const headline = h1TextOf(html);
    let to = headline && !taken.has(headline) ? headline : `${from} · Blog`;
    for (let n = 2; taken.has(to); n++) to = `${from} · Blog ${n}`;
    taken.add(to);
    const quoted = (s) => `content="${s}"`;
    const next = html
      .replace(/<title>[\s\S]*?<\/title>/i, `<title>${to}</title>`)
      .split(quoted(from)).join(quoted(to));
    changes.push({ rel, from, to, html: next });
  }
  return changes;
}

export async function fixPostTitleClashes(site, { log = () => {} } = {}) {
  const changes = resolvePostTitleClashes(await loadPages(site));
  for (const { rel, from, to, html } of changes) {
    await fs.writeFile(path.join(site, rel), html);
    log(`warning: ${rel} reused the title "${from}" of another page; retitled "${to}". Give the post its own seo_title.`);
  }
  return changes;
}

/** Every .html page under `site`, as a Map of relative path to text, in
 *  directory-walk order. The walk lists paths first; the reads then run 32 at
 *  a time (a built site is ~8,500 pages, 1.1 GB), and the Map is filled in
 *  walk order, so callers see the same keys in the same order as a serial
 *  read (docs/history/pages-build-perf-2026-11-11-identity-preload-reads.md). */
export async function loadPages(site) {
  const pages = new Map();
  // Sync reads, one after another: faster than 32 promise reads in flight on
  // ~8,800 mostly small pages, and nothing runs beside this pass
  // (docs/history/pages-build-perf-2026-11-12-share-identity-preload-sync.md).
  // Still async to its callers.
  function go(dir, prefix) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) go(path.join(dir, e.name), rel);
      else if (e.name.endsWith('.html')) pages.set(rel, readFileSync(path.join(site, rel), 'utf8'));
    }
  }
  go(site, '');
  return pages;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const problems = checkPageIdentity(await loadPages(path.resolve(process.argv[2] ?? fileURLToPath(new URL('./dist', import.meta.url)))));
  for (const p of problems) console.error(p);
  console.log(problems.length ? `${problems.length} problem(s)` : 'every page has a unique title and one h1');
  process.exit(problems.length ? 1 : 0);
}
