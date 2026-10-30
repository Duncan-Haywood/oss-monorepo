#!/usr/bin/env node
/**
 * Turn a built site into the redirect copy GitHub Pages serves after the move
 * to Cloudflare (2026-10-29, owner: "we are moving from ghp to cloudflare").
 *
 * GitHub Pages cannot send a real 301, so every HTML page in the artifact is
 * replaced by a stub that names the same path on the new origin three ways: a
 * `rel="canonical"` link (what a search engine consolidates on), a zero-second
 * `meta refresh` (which Google treats as a permanent redirect) and a
 * `location.replace` that keeps the query string and hash, which tools encode
 * their inputs in. Everything that is not HTML (feeds, sitemaps, JSON, images)
 * is copied unchanged, so a feed reader or an old embed keeps working; the
 * sitemaps it copies already name the new origin, because the site was built
 * for it.
 *
 * `404.html` gets a script-only redirect: GitHub serves it for every unknown
 * path, so it maps whatever path was asked for under the old base onto the
 * new base, rather than every stray link landing on the new front page.
 *
 *   node platform/pages/redirect-stubs.mjs <built-dir> <out-dir> \
 *     --from=https://duncan-haywood.github.io/oss-monorepo/ \
 *     --to=https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The new URL for a file at `rel` (posix, relative to the site root). */
export function targetUrl(rel, to) {
  const base = to.endsWith('/') ? to : `${to}/`;
  if (rel === 'index.html') return base;
  if (rel.endsWith('/index.html')) return base + rel.slice(0, -'index.html'.length);
  return base + rel;
}

export function stubPage(target) {
  const t = esc(target);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${t}">
<meta http-equiv="refresh" content="0; url=${t}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash);</script>
</head>
<body>
<p>This page has moved to <a href="${t}">${t}</a>.</p>
</body>
</html>
`;
}

export function notFoundPage(from, to) {
  const fromPath = new URL(from).pathname.replace(/\/?$/, '/');
  const base = to.endsWith('/') ? to : `${to}/`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<meta name="robots" content="noindex">
<script>
(function () {
  var from = ${JSON.stringify(fromPath)}, p = location.pathname;
  var rest = p.indexOf(from) === 0 ? p.slice(from.length) : p.replace(/^\\//, '');
  location.replace(${JSON.stringify(base)} + rest + location.search + location.hash);
})();
</script>
</head>
<body>
<p>This site has moved to <a href="${esc(base)}">${esc(base)}</a>.</p>
</body>
</html>
`;
}

async function* walk(dir, root = dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, root);
    else yield path.relative(root, full).split(path.sep).join('/');
  }
}

export async function writeStubs(srcDir, outDir, { from, to }) {
  let pages = 0;
  let copied = 0;
  for await (const rel of walk(srcDir)) {
    const dest = path.join(outDir, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (rel === '404.html') {
      await fs.writeFile(dest, notFoundPage(from, to));
    } else if (rel.endsWith('.html')) {
      await fs.writeFile(dest, stubPage(targetUrl(rel, to)));
      pages++;
    } else {
      await fs.copyFile(path.join(srcDir, rel), dest);
      copied++;
    }
  }
  return { pages, copied };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const [src, out] = args.filter((a) => !a.startsWith('--'));
  const from = opt('from');
  const to = opt('to');
  if (!src || !out || !from || !to) {
    console.error('usage: redirect-stubs.mjs <built-dir> <out-dir> --from=<old base URL> --to=<new base URL>');
    process.exit(2);
  }
  const { pages, copied } = await writeStubs(src, out, { from, to });
  console.log(`${pages} redirect page(s) to ${to}; ${copied} other file(s) copied unchanged.`);
}
