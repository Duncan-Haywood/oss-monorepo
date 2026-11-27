/**
 * Seller Books' marketing site (paid bet #5) at /seller-books/.
 *
 * The site lives in ventures/seller-books/apps/seller-books-site. Unlike PayApps' site
 * (payapps-site.mjs, TypeScript with its own install, so it commits a static export), its builder
 * is plain Node ESM with no dependencies, so this build runs it into a scratch directory and copies
 * the pages in: nothing committed can drift from the copy. Like PayApps' site it keeps its own
 * header and footer (no catalogue chrome), the hub does not list it, and it ships no JavaScript
 * and, once launched, no forms (the early-access list API needs the site's own Worker, which is
 * not deployed; the open site links sign-up to the app instead).
 *
 * Absolute links to the production origin are rewritten to the origin this build names, and the
 * site's root-relative links (`/seller-books/pricing`) become relative, as check.mjs requires.
 * Pages sit one level deep too (`platforms/ebay`), so the prefix depends on the page's depth.
 */
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SELLER_BOOKS_SITE_DIR = 'seller-books';
export const SELLER_BOOKS_SITE_APP = path.join(ROOT, 'ventures', 'seller-books', 'apps', 'seller-books-site');
const PRODUCTION = 'https://marisstella.app/';
const TEXT = new Set(['.html', '.xml', '.txt', '.css', '.svg']);
// The site's own build also writes these; the catalogue serves its own headers and 404.
const SKIP = new Set(['404.html']);

/** Rewrites `https://marisstella.app/seller-books...` to `<baseUrl>seller-books...`. */
export function rebase(text, baseUrl) {
  if (!baseUrl || baseUrl === PRODUCTION) return text;
  return text.split(`${PRODUCTION}${SELLER_BOOKS_SITE_DIR}`).join(`${baseUrl}${SELLER_BOOKS_SITE_DIR}`);
}

/**
 * `href="/seller-books/x"` → `href="./x"` on a top-level page, `href="../x"` on `platforms/ebay`.
 * `rel` is the page's path inside the site directory.
 */
export function relativise(html, rel) {
  const depth = rel.split('/').length - 1;
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  return html.replace(/(href|src|action)="\/seller-books\//g, `$1="${prefix}`);
}

/**
 * Builds the site and copies it into `<outDir>/seller-books/`. Returns the files written (relative
 * to outDir), or [] when the venture is missing (a sparse checkout).
 */
export async function buildSellerBooksSite(outDir, { baseUrl = PRODUCTION, app = SELLER_BOOKS_SITE_APP } = {}) {
  const builder = path.join(app, 'build.mjs');
  if (!existsSync(builder)) return [];
  const dest = path.join(outDir, SELLER_BOOKS_SITE_DIR);
  if (existsSync(path.join(dest, 'index.html'))) {
    throw new Error(`${SELLER_BOOKS_SITE_DIR}/ is already written by another part of the build`);
  }
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'seller-books-site-'));
  try {
    const { build } = await import(pathToFileURL(builder).href);
    build(scratch);
    const from = path.join(scratch, SELLER_BOOKS_SITE_DIR);
    if (!existsSync(path.join(from, 'index.html'))) {
      throw new Error(`seller-books-site build wrote no ${SELLER_BOOKS_SITE_DIR}/index.html`);
    }
    const written = [];
    const walk = async (dir) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const src = path.join(dir, entry.name);
        if (entry.isDirectory()) { await walk(src); continue; }
        const rel = path.relative(from, src).split(path.sep).join('/');
        if (SKIP.has(rel)) continue;
        const target = path.join(dest, rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        if (TEXT.has(path.extname(entry.name))) {
          const text = rebase(await fs.readFile(src, 'utf8'), baseUrl);
          await fs.writeFile(target, entry.name.endsWith('.html') ? relativise(text, rel) : text);
        } else {
          await fs.copyFile(src, target);
        }
        written.push(`${SELLER_BOOKS_SITE_DIR}/${rel}`);
      }
    };
    await walk(from);
    return written.sort();
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
