/**
 * PayApps' marketing site (paid bet #1) at /payapps/.
 *
 * The site is built by ventures/payapps/apps/payapps-site (TypeScript, its own pnpm install), which
 * this build cannot run, so that app commits a static copy, `catalogue-export/`, and its unit test
 * fails when the copy drifts from its pages (src/site/catalogue.ts there). This copies it in as it
 * is: no catalogue chrome, because it is a product's own site with its own header and footer, not a
 * free tool, and the hub does not list it. The copy has no forms or scripts.
 *
 * Absolute links to the production origin are rewritten to the origin this build names, as the
 * builder does for every venture's sitemap.
 */
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAYAPPS_SITE_DIR = 'payapps';
export const PAYAPPS_EXPORT = path.join(ROOT, 'ventures', 'payapps', 'apps', 'payapps-site', 'catalogue-export');
const PRODUCTION = 'https://marisstella.app/';
const TEXT = new Set(['.html', '.xml', '.txt', '.css', '.svg']);

/** Rewrites `https://marisstella.app/payapps...` to `<baseUrl>payapps...`; other hosts untouched. */
export function rebase(text, baseUrl) {
  if (!baseUrl || baseUrl === PRODUCTION) return text;
  return text.split(`${PRODUCTION}${PAYAPPS_SITE_DIR}`).join(`${baseUrl}${PAYAPPS_SITE_DIR}`);
}

/**
 * Copies the export into `<outDir>/payapps/`. Returns the files written (relative to outDir), or []
 * when the export is missing (a sparse checkout without the venture).
 */
export async function buildPayappsSite(outDir, { baseUrl = PRODUCTION, from = PAYAPPS_EXPORT } = {}) {
  if (!existsSync(from)) return [];
  const dest = path.join(outDir, PAYAPPS_SITE_DIR);
  if (existsSync(path.join(dest, 'index.html'))) {
    throw new Error(`${PAYAPPS_SITE_DIR}/ is already written by another part of the build`);
  }
  const written = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const src = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(src); continue; }
      const rel = path.relative(from, src);
      const target = path.join(dest, rel);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (TEXT.has(path.extname(entry.name))) {
        await fs.writeFile(target, rebase(await fs.readFile(src, 'utf8'), baseUrl));
      } else {
        await fs.copyFile(src, target);
      }
      written.push(path.join(PAYAPPS_SITE_DIR, rel).split(path.sep).join('/'));
    }
  };
  await walk(from);
  return written.sort();
}
