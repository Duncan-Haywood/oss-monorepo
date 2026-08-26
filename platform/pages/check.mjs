#!/usr/bin/env node
// Verifies a site that `build.mjs` already produced, and fails if it is not fit
// to publish.
//
// Why this exists
// ---------------
// `build.test.mjs` tests the builder's functions. Nothing tested the thing the
// builder actually emits. That gap matters here more than it usually would,
// because of how publishing works: the artifact is uploaded on every push to
// `main`, and the owner's `GITHUB_PAGES_ENABLED` flip publishes whatever the
// last build produced. So a regression does not fail loudly at deploy time —
// it goes live, silently, to the one public origin the portfolio has.
//
// The failure modes this catches are all ones a unit test on the builder can
// miss, because they arrive from *outside* the builder — a venture lands on
// `main` with a relative link to a file the build does not publish, or without
// the disclaimer every user-facing surface is required to carry, or with a
// canonical tag still pointing at the placeholder origin. Discovery is
// automatic (that is deliberate; see build.mjs), which means new ventures reach
// the public site with nobody having looked at them. This is the thing that
// looks at them.
//
//   node platform/pages/check.mjs --dist=platform/pages/dist
//
// Exits non-zero with a grouped report of every problem found. It reads the
// built tree only — no network, no browser. `journey.mjs` is the companion
// browser pass for the interactive half.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BASE_URL } from './build.mjs';

// The placeholder origin ventures wrote their SEO against. build.mjs rewrites
// it; if any survives into the artifact, canonical tags and sitemaps in the
// published site point at a domain that does not resolve.
const PLACEHOLDER_ORIGIN = 'example.invalid';

// Every user-facing surface in this repo carries a liability disclaimer
// (PRODUCT_PLAYBOOK.md). This is the shared marker phrase they all use; a page
// missing it is a page shipping calculated money figures with no limitation of
// liability, which is the one defect here with legal weight rather than just
// cosmetic.
const DISCLAIMER_MARKER = /no warranty/i;

// Files that exist for the repo, not for a visitor. Their presence means the
// copy filter regressed and visitors can download test payload or bookkeeping.
const LEAKED_FILE = /(\.test\.(mjs|js|cjs|py)|^VENTURE\.yaml$|^README\.md$|^package-lock\.json$|\.pyc$)/;
const LEAKED_DIR = new Set(['node_modules', '__pycache__', 'coverage', '.git']);

// A discovery regression is the quiet catastrophe: build.mjs finds nothing,
// emits a valid-looking hub with two tools on it, and CI stays green. This
// floor is deliberately well below the current count (34) so it does not need
// touching every time a venture lands, while still catching a collapse.
const MIN_TOOLS = 20;

const ROOT_FILES = ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'sitemap-hub.xml'];

// ---------------------------------------------------------------------------
// Reference extraction
// ---------------------------------------------------------------------------

// Inline `data:` URIs (favicons, mostly) contain quotes and spaces that make
// naive attribute matching produce dozens of phantom references. Drop them
// before looking at anything else.
const stripDataUris = (html) => html.replace(/(?:src|href)\s*=\s*"data:[^"]*"/gi, '');

const isExternal = (ref) =>
  /^(?:https?:)?\/\//i.test(ref) || /^(?:mailto|tel|data|javascript|blob):/i.test(ref) || ref.startsWith('#');

/**
 * Local references a browser would actually fetch: markup attributes plus the
 * ES-module specifiers in inline `<script type="module">`, which is how every
 * calculator here loads its `calc.mjs`. Missing one of those is a tool that
 * renders its form and then does nothing when the user types.
 */
export function localReferences(html) {
  const cleaned = stripDataUris(html);
  const found = new Set();

  for (const m of cleaned.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/gi)) found.add(m[1]);
  for (const m of cleaned.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) found.add(m[1]);
  for (const m of cleaned.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.add(m[1]);

  return [...found]
    .filter((ref) => ref && !isExternal(ref))
    .map((ref) => ref.split('#')[0].split('?')[0])
    .filter(Boolean);
}

/** Resolve a reference found in `pageFile` to the path on disk it needs. */
export function resolveReference(ref, pageFile, distDir, basePath) {
  let target;
  if (ref.startsWith('/')) {
    // Root-relative links are written against the *deployed* base path
    // (`/monorepo-projects/...` on a project Pages site), not the dist root.
    const trimmed = basePath && ref.startsWith(basePath) ? ref.slice(basePath.length) : ref.slice(1);
    target = path.join(distDir, trimmed);
  } else {
    target = path.resolve(path.dirname(pageFile), ref);
  }
  return ref.endsWith('/') ? path.join(target, 'index.html') : target;
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

async function walk(dir, onFile, relative = '') {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (LEAKED_DIR.has(entry.name)) {
        onFile({ rel, name: entry.name, abs, leakedDir: true });
        continue;
      }
      await walk(abs, onFile, rel);
    } else if (entry.isFile()) {
      onFile({ rel, name: entry.name, abs });
    }
  }
}

const exists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Verify a built site. Returns `{ problems, stats }` rather than throwing, so
 * the CLI can group the report and the tests can assert on it.
 */
export async function checkSite({ distDir, baseUrl = DEFAULT_BASE_URL, minTools = MIN_TOOLS } = {}) {
  const problems = [];
  const fail = (group, detail) => problems.push({ group, detail });

  if (!(await exists(distDir))) {
    return { problems: [{ group: 'structure', detail: `no built site at ${distDir} — run build.mjs first` }], stats: {} };
  }

  // buildSite() normalises the trailing slash before it writes any URL, so the
  // checker has to normalise identically. Otherwise an owner who sets
  // PAGES_BASE_URL without a trailing slash gets a site that built correctly
  // and a check that rejects every sitemap entry — a self-inflicted deploy block.
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const basePath = (() => {
    try {
      return new URL(base).pathname;
    } catch {
      return '/';
    }
  })();

  // --- root files -----------------------------------------------------------
  for (const name of ROOT_FILES) {
    if (!(await exists(path.join(distDir, name)))) fail('structure', `missing root file: ${name}`);
  }

  // --- tool directories ----------------------------------------------------
  const entries = await fs.readdir(distDir, { withFileTypes: true });
  const toolDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  for (const slug of toolDirs) {
    if (!(await exists(path.join(distDir, slug, 'index.html')))) {
      fail('structure', `${slug}/ has no index.html — it is linked but unreachable`);
    }
  }

  if (toolDirs.length < minTools) {
    fail('discovery', `only ${toolDirs.length} tool(s) published, expected at least ${minTools} — discovery may have regressed`);
  }

  // --- hub agrees with what is on disk -------------------------------------
  const hubPath = path.join(distDir, 'index.html');
  let hubHtml = '';
  if (await exists(hubPath)) {
    hubHtml = await fs.readFile(hubPath, 'utf8');
    const linked = new Set([...hubHtml.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));

    for (const slug of linked) {
      if (!toolDirs.includes(slug)) fail('hub', `hub links "${slug}" but no such directory was published`);
    }
    for (const slug of toolDirs) {
      if (!linked.has(slug)) fail('hub', `${slug}/ was published but the hub does not link it — visitors cannot find it`);
    }
    if (!DISCLAIMER_MARKER.test(hubHtml)) fail('disclaimer', 'the hub page carries no disclaimer');
  }

  // --- per-file sweep -------------------------------------------------------
  const htmlFiles = [];
  const collected = [];
  await walk(distDir, (file) => collected.push(file));

  for (const file of collected) {
    if (file.leakedDir) {
      fail('leaked', `${file.rel}/ was copied into the site`);
      continue;
    }
    if (LEAKED_FILE.test(file.name)) fail('leaked', `${file.rel} was copied into the site`);
    if (file.name.endsWith('.html')) htmlFiles.push(file);
  }

  // --- placeholder origin ---------------------------------------------------
  const textLike = new Set(['.html', '.xml', '.txt', '.mjs', '.js', '.json', '.css']);
  for (const file of collected) {
    if (file.leakedDir || !textLike.has(path.extname(file.name).toLowerCase())) continue;
    const contents = await fs.readFile(file.abs, 'utf8');
    if (contents.includes(PLACEHOLDER_ORIGIN)) {
      fail('origin', `${file.rel} still points at ${PLACEHOLDER_ORIGIN} — its canonical/SEO URLs will not resolve`);
    }
  }

  // --- broken local references ---------------------------------------------
  for (const file of htmlFiles) {
    const html = await fs.readFile(file.abs, 'utf8');
    for (const ref of localReferences(html)) {
      const target = resolveReference(ref, file.abs, distDir, basePath);
      // Never let a reference escape the published tree.
      if (!path.resolve(target).startsWith(path.resolve(distDir))) {
        fail('links', `${file.rel} -> ${ref} escapes the site root`);
        continue;
      }
      if (!(await exists(target))) fail('links', `${file.rel} -> ${ref} (not published)`);
    }
  }

  // --- disclaimers on every tool -------------------------------------------
  for (const slug of toolDirs) {
    const index = path.join(distDir, slug, 'index.html');
    if (!(await exists(index))) continue;
    const html = await fs.readFile(index, 'utf8');
    if (!DISCLAIMER_MARKER.test(html)) {
      fail('disclaimer', `${slug}/index.html carries no disclaimer — it must not ship without one`);
    }
  }

  // --- sitemaps point somewhere real ---------------------------------------
  const sitemapIndex = path.join(distDir, 'sitemap.xml');
  if (await exists(sitemapIndex)) {
    const xml = await fs.readFile(sitemapIndex, 'utf8');
    if (!xml.includes(base)) fail('origin', `sitemap.xml does not mention the base URL ${base}`);
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1];
      if (!loc.startsWith(base)) continue;
      const rel = loc.slice(base.length);
      if (!rel) continue;
      const target = rel.endsWith('/') ? path.join(distDir, rel, 'index.html') : path.join(distDir, rel);
      if (!(await exists(target))) fail('sitemap', `sitemap.xml lists ${loc} but ${rel} was not published`);
    }
  }

  return {
    problems,
    stats: { tools: toolDirs.length, htmlPages: htmlFiles.length, files: collected.length },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) =>
    process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

  const distDir = path.resolve(arg('dist', path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')));
  const baseUrl = arg('base', process.env.PAGES_BASE_URL || DEFAULT_BASE_URL);

  const { problems, stats } = await checkSite({ distDir, baseUrl });

  if (problems.length === 0) {
    console.log(
      `Site OK — ${stats.tools} tools, ${stats.htmlPages} HTML pages, ${stats.files} files.\n` +
        `Base URL: ${baseUrl}`,
    );
    process.exit(0);
  }

  const byGroup = new Map();
  for (const { group, detail } of problems) {
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(detail);
  }

  console.error(`Site NOT fit to publish — ${problems.length} problem(s) in ${distDir}\n`);
  for (const [group, details] of byGroup) {
    console.error(`${group} (${details.length}):`);
    for (const detail of details) console.error(`  - ${detail}`);
    console.error('');
  }
  process.exit(1);
}
