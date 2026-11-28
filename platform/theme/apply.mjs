// The universal light/dark pass over a built site (theme.mjs says what it
// adds and why). Usage: node platform/theme/apply.mjs <dist-dir>
//
// Idempotent: a page that already carries the boot script is left as it is,
// and rewriteSchemeCss skips blocks it has already rewritten, so the deploy
// can run it again over pages written after the main build.

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BOOT_MARKER,
  FALLBACK_ATTR,
  NATIVE_ATTR,
  THEME_SCRIPT_FILE,
  THEME_UI_JS,
  bootTag,
  hasDarkStyles,
  rewriteSchemeCss,
} from './theme.mjs';

// The site stylesheet carries the site chrome's own dark tokens; it says
// nothing about whether the page under the chrome has a dark mode.
const CHROME_STYLESHEETS = new Set(['pf-site.css', 'pf-chrome.css', 'pf-embed.css']);

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const STYLE_BLOCK = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
const STYLESHEET_LINK = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;

/** Rewrite every inline <style> in a page. */
export function rewriteInlineStyles(html) {
  return html.replace(STYLE_BLOCK, (all, open, css, close) =>
    open.includes(BOOT_MARKER) ? all : `${open}${rewriteSchemeCss(css)}${close}`,
  );
}

/** Local stylesheet paths a page links, resolved against its directory (no remote, no chrome). */
export function linkedStylesheets(html, pageFile, root) {
  const out = [];
  for (const tag of html.match(STYLESHEET_LINK) ?? []) {
    const href = /\bhref=["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (!href || /^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith('data:')) continue;
    const clean = decodeURI(href.split(/[?#]/)[0]);
    const file = clean.startsWith('/') ? path.join(root, clean) : path.resolve(path.dirname(pageFile), clean);
    if (CHROME_STYLESHEETS.has(path.basename(file))) continue;
    out.push(file);
  }
  return out;
}

/** True when a page styles its own dark scheme (inline or in a linked local stylesheet). */
export function pageIsNative(html, cssOf) {
  for (const m of html.matchAll(STYLE_BLOCK)) {
    if (m[1].includes(BOOT_MARKER)) continue;
    if (hasDarkStyles(m[2])) return true;
  }
  return cssOf.some((css) => hasDarkStyles(css));
}

/**
 * The page with the boot first in <head>, its mode on <html>, and the
 * control's script before </body>. Returns the input for anything that is
 * not a full document or is already done.
 */
export function themePage(html, { native, scriptSrc }) {
  if (html.includes(BOOT_MARKER)) return html;
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  const headTag = /<head\b[^>]*>/i.exec(html);
  if (!htmlTag || !headTag) return html;
  const attr = native ? NATIVE_ATTR : FALLBACK_ATTR;
  let out = html.slice(0, htmlTag.index) + htmlTag[0].replace(/^<html\b/i, `<html ${attr}`) + html.slice(htmlTag.index + htmlTag[0].length);
  const head = /<head\b[^>]*>/i.exec(out);
  // After <meta charset> when it opens the head, so the charset stays in the first 1,024 bytes.
  const afterHead = out.slice(head.index + head[0].length);
  const charset = /^\s*<meta\s+charset=[^>]*>/i.exec(afterHead);
  const at = head.index + head[0].length + (charset ? charset[0].length : 0);
  out = `${out.slice(0, at)}${bootTag()}${out.slice(at)}`;
  const tag = `<script defer src="${scriptSrc}"></script>`;
  const end = out.toLowerCase().lastIndexOf('</body>');
  out = end === -1 ? `${out}${tag}` : `${out.slice(0, end)}${tag}${out.slice(end)}`;
  return out;
}

export async function applyDir(root) {
  root = path.resolve(root);
  const files = [];
  for await (const f of walk(root)) files.push(f);
  const cssCache = new Map();
  let cssChanged = 0;
  // Stylesheets first: a page's native check reads them, rewritten or not.
  for (const f of files) {
    if (!f.endsWith('.css')) continue;
    const css = await fs.readFile(f, 'utf8');
    cssCache.set(f, css);
    const next = rewriteSchemeCss(css);
    if (next !== css) {
      await fs.writeFile(f, next);
      cssChanged += 1;
    }
  }
  await fs.writeFile(path.join(root, THEME_SCRIPT_FILE), `${THEME_UI_JS}\n`);
  let pages = 0;
  let native = 0;
  let fallback = 0;
  for (const f of files) {
    if (!f.endsWith('.html')) continue;
    const html = await fs.readFile(f, 'utf8');
    if (html.includes(BOOT_MARKER) || !/<head\b/i.test(html)) continue;
    // Redirect stubs and fragments get nothing.
    if (/<meta\s+http-equiv=["']?refresh/i.test(html) && html.length < 4000) continue;
    const linked = linkedStylesheets(html, f, root).map((p) => cssCache.get(p) ?? '');
    const isNative = pageIsNative(html, linked);
    const rel = path.relative(path.dirname(f), path.join(root, THEME_SCRIPT_FILE)).split(path.sep).join('/');
    const next = themePage(rewriteInlineStyles(html), { native: isNative, scriptSrc: rel });
    if (next === html) continue;
    await fs.writeFile(f, next);
    pages += 1;
    if (isNative) native += 1;
    else fallback += 1;
  }
  return { pages, native, fallback, cssChanged };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node platform/theme/apply.mjs <dist-dir>');
    process.exit(2);
  }
  const r = await applyDir(dir);
  console.log(`theme: ${r.pages} page(s) (${r.native} with their own dark styles, ${r.fallback} on the fallback), ${r.cssChanged} stylesheet(s) rewritten`);
}
