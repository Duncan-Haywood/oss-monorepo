// Two things a search engine reads first and a copy-paste build can get wrong:
// every page needs its own, reasonably short <title>, and a page needs exactly one <h1> in its
// markup. Scripts and templates are stripped before counting, because a tool
// that builds an <h1> inside a template string is not a second heading.
//   used by check.mjs; node platform/pages/page-identity.mjs <dist> to run alone
import { promises as fs } from 'node:fs';
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

export async function loadPages(site) {
  const pages = new Map();
  async function go(dir, prefix) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await go(path.join(dir, e.name), rel);
      else if (e.name.endsWith('.html')) pages.set(rel, await fs.readFile(path.join(dir, e.name), 'utf8'));
    }
  }
  await go(site, '');
  return pages;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const problems = checkPageIdentity(await loadPages(path.resolve(process.argv[2] ?? fileURLToPath(new URL('./dist', import.meta.url)))));
  for (const p of problems) console.error(p);
  console.log(problems.length ? `${problems.length} problem(s)` : 'every page has a unique title and one h1');
  process.exit(problems.length ? 1 : 0);
}
