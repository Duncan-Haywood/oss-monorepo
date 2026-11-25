// Cloudflare Web Analytics for the published site: the beacon tag, and the
// pass that puts it on every built page (owner, 2026-11-25: "let's set up
// real analytics and standard privacy policies"). Cookieless and on the
// account the site is already hosted on, so no new vendor account and no
// consent banner (docs/legal/privacy-baseline.md, "cookieless analytics
// vendor"). What it collects is stated in the Privacy Policy that
// platform/pages/legal.mjs renders; keep the two in step.

import fs from 'node:fs/promises';
import path from 'node:path';

export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
export const BEACON_HOSTS = Object.freeze(['static.cloudflareinsights.com', 'cloudflareinsights.com']);

// A site token is 32 hex characters. Anything else is refused rather than
// spliced into thousands of pages' markup.
const TOKEN = /^[0-9a-f]{32}$/i;

export function normaliseToken(token) {
  const t = String(token ?? '').trim();
  if (t === '') return '';
  if (!TOKEN.test(t)) throw new Error(`web analytics token must be 32 hex characters, got ${JSON.stringify(t.slice(0, 40))}`);
  return t.toLowerCase();
}

export function beaconTag(token) {
  const t = normaliseToken(token);
  if (!t) return '';
  return `<script defer src="${BEACON_SRC}" data-cf-beacon='{"token": "${t}"}'></script>`;
}

/** Adds the beacon before the document's last `</body>` (or at the end when
 *  there is none). Idempotent: a page that already has the beacon is returned
 *  unchanged. Only full HTML documents are touched. */
export function injectBeacon(html, token) {
  const tag = beaconTag(token);
  if (!tag || html.includes(BEACON_SRC)) return html;
  if (!/<html[\s>]/i.test(html) && !/<!doctype html/i.test(html)) return html;
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at === -1 ? `${html}\n${tag}\n` : `${html.slice(0, at)}${tag}\n${html.slice(at)}`;
}

async function* htmlFiles(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) yield full;
  }
}

export async function injectDir(dir, token) {
  let changed = 0;
  let seen = 0;
  if (!normaliseToken(token)) return { changed, seen };
  for await (const file of htmlFiles(dir)) {
    seen += 1;
    const html = await fs.readFile(file, 'utf8');
    const next = injectBeacon(html, token);
    if (next !== html) {
      await fs.writeFile(file, next);
      changed += 1;
    }
  }
  return { changed, seen };
}

/** The token the build and the deploy use: an explicit value (the deploy's
 *  provisioning step), else the committed one in site.json. */
export async function resolveToken({ explicit, siteFile } = {}) {
  if (explicit != null && String(explicit).trim() !== '') return normaliseToken(explicit);
  try {
    const site = JSON.parse(await fs.readFile(siteFile ?? new URL('./site.json', import.meta.url), 'utf8'));
    return normaliseToken(site.token);
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

// CLI: node platform/analytics/web-analytics.mjs <dist-dir>
// Token from PAGES_WEB_ANALYTICS_TOKEN, else site.json. No token: no-op.
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: web-analytics.mjs <dist-dir>');
    process.exit(2);
  }
  const token = await resolveToken({ explicit: process.env.PAGES_WEB_ANALYTICS_TOKEN });
  if (!token) {
    console.log('web analytics: no token (site.json empty and PAGES_WEB_ANALYTICS_TOKEN unset); pages left without the beacon.');
  } else {
    const { changed, seen } = await injectDir(dir, token);
    console.log(`web analytics: beacon added to ${changed} of ${seen} HTML page(s).`);
  }
}
