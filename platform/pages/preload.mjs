// Module preload: flatten the ES-module import waterfall on tool pages.
//
// A tool page loads its engine as native ES modules, and a browser only learns
// of a module's imports after that module has arrived. Measured on
// 2026-11-07 (docs/reports/2026-11-07-live-site-measurements.md), the
// wall-framing-takeoff page imports 34 modules four levels deep, so a visit
// paid four round trips in a row before the page could run, and a warm visit
// paid them again: every file is served `max-age=0, must-revalidate`, so each
// level is a revalidation the next level waits on. On a phone's 150 ms round
// trip that chain alone is most of a second.
//
// `<link rel="modulepreload">` for every module in the page's static import
// graph lets the browser fetch them all at once, in parallel, as soon as it
// reads the <head>. Nothing else changes: the same files are fetched, and the
// browser still evaluates them in import order. Only static imports of files
// that exist in the build are listed, so a dynamic `import()` (loaded on
// demand, on purpose) stays on demand, and a specifier inside a comment that
// names no real file is dropped.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { mapLimit } from './share.mjs';

/** Pages with at most this many levels gain nothing worth a tag per module:
 *  a page whose modules import nothing further already fetches in parallel. */
export const MIN_DEPTH = 2;
/** A ceiling, so a page with a huge graph does not grow a huge <head>. */
export const MAX_PRELOADS = 80;

// `import x from '...'`, `import {a} from "..."`, `import '...'`,
// `export {a} from '...'`, `export * from '...'`. Not `import('...')`.
const IMPORT_RE = /(?:^|[\s;}])(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?(['"])([^'"\n]+)\1/g;
const MODULE_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** Static import specifiers in module source, in order, de-duplicated. */
export function staticImports(source) {
  const out = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    if (!out.includes(m[2])) out.push(m[2]);
  }
  return out;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** The module entry points of a page: `src` of external module scripts and
 *  the static imports of inline ones. */
export function pageEntries(html) {
  const entries = [];
  for (const m of html.matchAll(MODULE_SCRIPT_RE)) {
    const attrs = m[1];
    if ((attr(attrs, 'type') || '').toLowerCase() !== 'module') continue;
    const src = attr(attrs, 'src');
    if (src) entries.push(src);
    else entries.push(...staticImports(m[2]));
  }
  return [...new Set(entries)];
}

/** Resolve a specifier to a file under outDir, or null for bare, absolute-URL
 *  or escaping specifiers. */
export function resolveSpecifier(spec, fromDir, outDir) {
  const clean = spec.split(/[?#]/)[0];
  let file;
  if (clean.startsWith('./') || clean.startsWith('../')) file = path.resolve(fromDir, clean);
  else if (clean.startsWith('/') && !clean.startsWith('//')) file = path.join(outDir, clean);
  else return null;
  const rel = path.relative(outDir, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return file;
}

/**
 * The static module graph of one page: every module file reachable by
 * static import, and the length of the longest import chain (1 when the
 * entries import nothing). `readModule(file)` returns its source or null;
 * results are cached in `cache` across pages, since tool pages share chrome
 * modules.
 */
export async function moduleGraph(html, pageFile, outDir, readModule, cache = new Map()) {
  const pageDir = path.dirname(pageFile);
  const files = [];
  const seen = new Set();
  const depthOf = new Map();

  async function importsOf(file) {
    if (!cache.has(file)) {
      const src = await readModule(file);
      cache.set(file, src == null ? null : staticImports(src)
        .map((s) => resolveSpecifier(s, path.dirname(file), outDir))
        .filter(Boolean));
    }
    return cache.get(file);
  }

  // Depth by longest chain, with a guard against import cycles.
  async function visit(file, stack) {
    if (stack.has(file)) return 0;
    if (depthOf.has(file)) return depthOf.get(file);
    const deps = await importsOf(file);
    if (deps == null) return 0; // not a file in the build
    if (!seen.has(file)) { seen.add(file); files.push(file); }
    stack.add(file);
    let d = 0;
    for (const dep of deps) d = Math.max(d, await visit(dep, stack));
    stack.delete(file);
    depthOf.set(file, d + 1);
    return d + 1;
  }

  let depth = 0;
  for (const spec of pageEntries(html)) {
    const file = resolveSpecifier(spec, pageDir, outDir);
    if (file) depth = Math.max(depth, await visit(file, new Set()));
  }
  return { files, depth };
}

/** Insert modulepreload links before </head>. Returns the html unchanged when
 *  there is no </head> or the page already declares its own preloads. */
export function injectPreloads(html, hrefs) {
  if (!hrefs.length || /rel=["']?modulepreload/i.test(html)) return html;
  const i = html.search(/<\/head>/i);
  if (i < 0) return html;
  const tags = hrefs.map((h) => `<link rel="modulepreload" href="${h}">`).join('\n');
  return `${html.slice(0, i)}${tags}\n${html.slice(i)}`;
}

function hrefFor(file, pageFile) {
  const rel = path.relative(path.dirname(pageFile), file).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Add modulepreload links to every HTML page under outDir whose module graph
 * is at least MIN_DEPTH deep. Run after every pass that rewrites HTML or adds
 * module scripts, and before the offline layer, which hashes the finished
 * pages.
 */
export async function addModulePreloads(outDir, { listFiles, minDepth = MIN_DEPTH, max = MAX_PRELOADS } = {}) {
  const cache = new Map();
  const readModule = async (file) => {
    if (!/\.m?js$/.test(file)) return null;
    try { return await fs.readFile(file, 'utf8'); } catch { return null; }
  };
  // Pages are read and rewritten 32 at a time. Each task reads and writes only
  // its own page, and reads only .js/.mjs files, which no task writes, so the
  // finishing order cannot change any file. The shared `cache` may read one
  // module twice when two pages ask for it at once; both reads give the same
  // imports. The totals are sums and a max, so order-free too.
  const html = (await listFiles(outDir)).filter((f) => f.endsWith('.html'));
  const done = await mapLimit(html, 32, async (file) => {
    const page = await fs.readFile(file, 'utf8');
    if (!/type=["']?module/i.test(page)) return null;
    const { files, depth } = await moduleGraph(page, file, outDir, readModule, cache);
    if (depth < minDepth) return null;
    const hrefs = files.slice(0, max).map((f) => hrefFor(f, file));
    const out = injectPreloads(page, hrefs);
    if (out === page) return null;
    await fs.writeFile(file, out);
    return { links: hrefs.length, depth };
  });
  let pages = 0;
  let links = 0;
  let deepest = 0;
  for (const d of done) {
    if (!d) continue;
    pages += 1;
    links += d.links;
    deepest = Math.max(deepest, d.depth);
  }
  return { pages, links, deepest };
}
