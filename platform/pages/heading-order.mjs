// Heading-order skips: a heading more than one level deeper than the one
// before it (h1 then h3). Lighthouse's accessibility score counts it
// (axe `heading-order`), and a screen-reader user moving by heading hears a
// section that seems to be missing its parent.
//
//   node platform/pages/heading-order.mjs              # scan platform/pages/dist
//   node platform/pages/heading-order.mjs --dist=DIR   # another build
//   node platform/pages/heading-order.mjs --list       # every page, not just counts
//
// Exit 1 when a page the site build writes itself (SITE_OWN_DIRS: the blog,
// /compare/, /c/ ...) has a skip, since one fix in a renderer clears all of
// them. Venture pages are hand-written per product; they are listed, and fail
// nothing, so a product's own heading choice does not block the site.
//
// Why: the first Lighthouse sample beyond the 16 front pages (2026-11-11,
// docs/reports/polish-2026-11-11-heading-order.md) found the skip on 414
// pages the site build writes (352 blog, 45 compare, 17 category). Every blog post went h1 -> h3,
// because platform/devlog/markdown.mjs moved each `##` down a level, and the
// compare and flat category pages put h3 card titles straight under the h1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every heading in document order, without the parts a browser does not render as headings. */
export function headings(html) {
  const body = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1>/gi, '');
  const out = [];
  for (const m of body.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)) {
    if (/\bhidden\b|aria-hidden="true"/.test(m[2])) continue;
    out.push({ level: Number(m[1]), text: m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) });
  }
  return out;
}

/** Each place the level jumps by more than one: { from, to, text }. A page's first heading may be any level. */
export function headingSkips(html) {
  const hs = headings(html);
  const skips = [];
  for (let i = 1; i < hs.length; i++) {
    if (hs[i].level > hs[i - 1].level + 1) skips.push({ from: hs[i - 1].level, to: hs[i].level, text: hs[i].text });
  }
  return skips;
}

function* pages(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* pages(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const { SITE_OWN_DIRS } = await import('./check.mjs');
  const flag = process.argv.find((a) => a.startsWith('--dist='))?.slice('--dist='.length);
  const dist = path.resolve(flag ?? fileURLToPath(new URL('./dist', import.meta.url)));
  const list = process.argv.includes('--list');
  const byDir = new Map();
  let scanned = 0;
  const own = [];
  for (const file of pages(dist)) {
    scanned++;
    const skips = headingSkips(fs.readFileSync(file, 'utf8'));
    if (!skips.length) continue;
    const rel = path.relative(dist, file);
    const top = rel.includes(path.sep) ? rel.split(path.sep)[0] : '(root)';
    byDir.set(top, (byDir.get(top) ?? 0) + 1);
    const siteOwn = SITE_OWN_DIRS.has(top) || top === '(root)';
    if (siteOwn) own.push(rel);
    if (list || siteOwn) console.log(`${siteOwn ? 'site' : 'venture'}  ${rel}: h${skips[0].from} -> h${skips[0].to} "${skips[0].text}"`);
  }
  const total = [...byDir.values()].reduce((a, b) => a + b, 0);
  console.log(`${scanned} pages scanned, ${total} with a heading skip (${own.length} written by the site build).`);
  const top = [...byDir].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length) console.log(`by directory: ${top.map(([d, n]) => `${d} ${n}`).join(', ')}`);
  process.exit(own.length ? 1 : 0);
}
