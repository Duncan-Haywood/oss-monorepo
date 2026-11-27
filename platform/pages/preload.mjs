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

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';


/** Pages with at most this many levels gain nothing worth a tag per module:
 *  a page whose modules import nothing further already fetches in parallel. */
export const MIN_DEPTH = 2;
/** A ceiling, so a page with a huge graph does not grow a huge <head>. */
export const MAX_PRELOADS = 80;

// `import x from '...'`, `import {a} from "..."`, `import '...'`,
// `export {a} from '...'`, `export * from '...'`. Not `import('...')`.
const IMPORT_RE = /(?:^|[\s;}])(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?(['"])([^'"\n]+)\1/g;
const MODULE_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;

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
  const readModule = (file) => {
    if (!/\.m?js$/.test(file)) return null;
    try { return readFileSync(file, 'utf8'); } catch { return null; }
  };
  // Pages are read and rewritten one after another with sync calls: on a full
  // build that is faster than 32 promise reads in flight, since most pages are
  // small and most have no module script
  // (docs/history/pages-build-perf-2026-11-12-share-identity-preload-sync.md).
  // Each page reads and writes only itself and reads only .js/.mjs files,
  // which nothing here writes, so the output is the same in any order.
  const html = (await listFiles(outDir)).filter((f) => f.endsWith('.html'));
  const done = [];
  for (const file of html) {
    const page = readFileSync(file, 'utf8');
    if (!/type=["']?module/i.test(page)) continue;
    const { files, depth } = await moduleGraph(page, file, outDir, readModule, cache);
    if (depth < minDepth) continue;
    const hrefs = files.slice(0, max).map((f) => hrefFor(f, file));
    const out = injectPreloads(page, hrefs);
    if (out === page) continue;
    writeFileSync(file, out);
    done.push({ links: hrefs.length, depth });
  }
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

// Module workers: the same waterfall, which modulepreload cannot reach.
//
// A Web Worker has its own module map, so the page's modulepreload links do
// nothing for it: `new Worker("./x-worker.mjs", { type: "module" })` fetches
// x-worker.mjs, parses it, fetches its imports, parses those, and so on, one
// round trip per import level, each a revalidation on the live site
// (`max-age=0, must-revalidate`). league-schedule-generator's bowling worker is
// six levels deep: about 0.9 s of round trips on a 150 ms phone link before the
// worker can run (docs/history/worker-graph-perf-2026-11-27.md).
//
// So the built copy of each module-worker entry gets one side-effect import
// per module of its static graph that it does not import already, appended
// after its own imports. A browser requests all of a module's imports at once,
// so the whole graph arrives in two rounds. Evaluation order is unchanged:
// imports evaluate depth-first in the order they are written, the entry's own
// imports come first and already reach every module listed, so by the time
// the appended lines are reached each module has been evaluated and they do
// nothing. Only the copy in the built site changes, never the source.

/** Workers whose graph is at most this deep (the entry is level 1) already
 *  fetch everything below the entry in one round. */
export const WORKER_MIN_DEPTH = 3;
export const WORKER_FLAT_MARKER = '// Pages build (preload.mjs, flattenWorkerGraphs): the worker graph at depth 1, one fetch round.';

// `new Worker("./w.mjs", ...)`, `new Worker(new URL("w.mjs", import.meta.url), ...)`,
// `new SharedWorker(...)`; the options are checked for type "module" separately.
const WORKER_RE = /new\s+(?:Shared)?Worker\s*\(\s*(?:new\s+URL\s*\(\s*)?(['"])([^'"\n]+?\.m?js)\1([^;]{0,240})/g;

/**
 * Static import specifiers, read strictly: comments removed and only
 * statements that start a line or follow a `;`. The appended imports evaluate
 * a module, so a specifier the browser would not load (one in a comment, or a
 * string that merely looks like an import) must not be listed; missing one
 * only leaves a level of the waterfall in place.
 */
export function strictStaticImports(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');
  const re = /(?:^|;)[ \t]*(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?(['"])([^'"\n]+)\1/gm;
  const out = [];
  for (const m of code.matchAll(re)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

/** Module-worker entry files a page or module names, resolved under outDir. */
export function workerEntries(source, fromFile, outDir) {
  const out = [];
  for (const m of source.matchAll(WORKER_RE)) {
    if (!/type\s*:\s*['"]module['"]/.test(m[3])) continue;
    let spec = m[2];
    if (!/^(?:\.{1,2}\/|\/)/.test(spec)) {
      if (/^[a-z][\w+.-]*:/i.test(spec)) continue; // https:, data:, blob:
      spec = `./${spec}`;
    }
    const file = resolveSpecifier(spec, path.dirname(fromFile), outDir);
    if (file && !out.includes(file)) out.push(file);
  }
  return out;
}

/**
 * The static graph below one module, in first-visit order, and its depth
 * (the entry alone is 1). `readModule(file)` returns source or null.
 */
export function workerGraph(entry, outDir, readModule, cache = new Map()) {
  const importsOf = (file) => {
    if (!cache.has(file)) {
      const src = readModule(file);
      cache.set(file, src == null ? null : strictStaticImports(src)
        .map((s) => resolveSpecifier(s, path.dirname(file), outDir))
        .filter(Boolean));
    }
    return cache.get(file);
  };
  const files = [];
  const depthOf = new Map();
  const visit = (file, stack) => {
    if (stack.has(file)) return 0;
    if (depthOf.has(file)) return depthOf.get(file);
    const deps = importsOf(file);
    if (deps == null) return 0;
    if (file !== entry && !files.includes(file)) files.push(file);
    stack.add(file);
    let d = 0;
    for (const dep of deps) d = Math.max(d, visit(dep, stack));
    stack.delete(file);
    depthOf.set(file, d + 1);
    return d + 1;
  };
  const depth = visit(entry, new Set());
  return { files, direct: importsOf(entry) || [], depth };
}

/** The entry's source with the graph's missing imports appended, or null when there is nothing to add. */
export function flattenWorkerSource(source, entry, graph) {
  if (source.includes(WORKER_FLAT_MARKER)) return null;
  const add = graph.files.filter((f) => !graph.direct.includes(f));
  if (!add.length) return null;
  const lines = add.map((f) => `import ${JSON.stringify(hrefFor(f, entry))};`);
  return `${source.replace(/\s*$/, '')}\n\n${WORKER_FLAT_MARKER}\n${lines.join('\n')}\n`;
}

/**
 * Flatten every module-worker entry named by a page or module under outDir
 * whose graph is at least WORKER_MIN_DEPTH deep. Run after addModulePreloads
 * (so the pages' preload lists are computed from the unchanged modules) and
 * before the offline layer, which hashes the finished files.
 */
export async function flattenWorkerGraphs(outDir, { listFiles, minDepth = WORKER_MIN_DEPTH } = {}) {
  const files = (await listFiles(outDir)).filter((f) => /\.(?:html|m?js)$/.test(f));
  const readModule = (file) => {
    if (!/\.m?js$/.test(file)) return null;
    try { return readFileSync(file, 'utf8'); } catch { return null; }
  };
  const entries = new Set();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    if (!/new\s+(?:Shared)?Worker\b/.test(src)) continue;
    for (const e of workerEntries(src, file, outDir)) entries.add(e);
  }
  const cache = new Map();
  let workers = 0;
  let imports = 0;
  let deepest = 0;
  for (const entry of [...entries].sort()) {
    const src = readModule(entry);
    if (src == null) continue;
    const graph = workerGraph(entry, outDir, readModule, cache);
    if (graph.depth < minDepth) continue;
    const out = flattenWorkerSource(src, entry, graph);
    if (out == null) continue;
    writeFileSync(entry, out);
    workers += 1;
    imports += graph.files.filter((f) => !graph.direct.includes(f)).length;
    deepest = Math.max(deepest, graph.depth);
  }
  return { workers, imports, deepest };
}
