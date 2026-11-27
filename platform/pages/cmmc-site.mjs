/**
 * CMMC Workspace's marketing site (paid bet #4) at /cmmc/.
 *
 * Unlike PayApps' site (payapps-site.mjs, a TypeScript build this build cannot run), cmmc-site is
 * zero-dependency ESM (ventures/cmmc/apps/cmmc-site/src/build.mjs), so this build runs it directly:
 * no committed export to drift. It builds the state src/launch.mjs names (open since 2026-11-27:
 * sign-up links into https://cmmc.marisstella.app, no early-access form, the SPRS calculator
 * scored in the browser by sprs-page.js), then copies the files in without the catalogue chrome:
 * it is a product's own site with its own header and footer, not a free tool.
 *
 * Its links are site-absolute under /cmmc/ (the site's BASE_PATH); check.mjs refuses root-relative
 * links because the catalogue may be served under a path, so they become relative. Every page the
 * open build writes sits in one directory, so `./` is always right.
 */
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CMMC_SITE_DIR = 'cmmc';
export const CMMC_SITE_APP = path.join(ROOT, 'ventures', 'cmmc', 'apps', 'cmmc-site');
const PRODUCTION = 'https://marisstella.app/';

/** `href|src|action="/cmmc/x"` -> `"./x"`; other links untouched. */
export function relativise(html) {
  return html.replace(/\b(href|src|action)="\/cmmc\//g, '$1="./');
}

/**
 * Builds cmmc-site into `<outDir>/cmmc/`. Returns the files written (relative to outDir), or []
 * when the app is missing (a sparse checkout without the venture).
 */
export async function buildCmmcSite(outDir, { baseUrl = PRODUCTION, app = CMMC_SITE_APP } = {}) {
  const entry = path.join(app, 'src', 'build.mjs');
  if (!existsSync(entry)) return [];
  const dest = path.join(outDir, CMMC_SITE_DIR);
  if (existsSync(path.join(dest, 'index.html'))) {
    throw new Error(`${CMMC_SITE_DIR}/ is already written by another part of the build`);
  }
  const { build } = await import(pathToFileURL(entry).href);
  const { launchState } = await import(pathToFileURL(path.join(app, 'src', 'launch.mjs')).href);
  const launch = launchState();
  if (!launch.open) {
    // The early-access copy needs the site's own Worker (its form posts to /cmmc/api/early-access).
    throw new Error('cmmc-site is in early-access mode; the catalogue serves only the open copy');
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cmmc-site-'));
  try {
    const files = build({
      siteUrl: `${baseUrl.replace(/\/+$/, '')}/${CMMC_SITE_DIR}`,
      basePath: `/${CMMC_SITE_DIR}`,
      outDir: path.join(tmp, 'dist'),
      launch,
    });
    const written = [];
    for (const [name, content] of Object.entries(files)) {
      if (name.includes('/')) throw new Error(`cmmc-site wrote a nested file (${name}); relative links assume one directory`);
      const target = path.join(dest, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, name.endsWith('.html') ? relativise(content) : content);
      written.push(`${CMMC_SITE_DIR}/${name}`);
    }
    return written.sort();
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
