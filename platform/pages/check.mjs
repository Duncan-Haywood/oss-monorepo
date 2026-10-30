#!/usr/bin/env node
// Check a built Pages artifact before it is allowed to publish.
//
// `build.mjs` can succeed and still produce a site that is broken for a reader
// or invisible to a crawler: a footer linking a file that did not ship, a
// canonical tag still naming `example.invalid`, a sitemap advertising a path
// this site does not serve. None of that shows up in a test over the sources,
// because the defect is created by the copy, not by the input.
//
// So this runs over the real output directory. It is the guard that would have
// caught the two sitemap defects fixed alongside it: 70 pages listed in no
// sitemap, and 11 sitemap URLs pointing at `/ventures/<slug>/`, a path the
// site does not serve.
//
//   node platform/pages/check.mjs dist
//
// Adapted from the `check_site.py` written for PR #1723, which proposed a
// second, competing Pages builder. That builder is not needed — this repo
// already has one on `main` — but its artifact check was the better idea and
// `main` had no equivalent, so it is carried over here.
//
// Extended 2026-08-26 by merging a concurrent checker written against the same
// gap (#1744). Two sessions reached the same conclusion from #1723 within the
// hour and each caught things the other missed, so both sets are kept: the
// sitemap-coverage and base-path logic here, plus reachability (the hub and the
// artifact agreeing in *both* directions), the disclaimer requirement, leaked
// bookkeeping, a product-count floor, and single-quoted / dynamic `import()`
// specifiers. `journey.mjs` is the browser half of that merge — this file can
// prove a page shipped and its links resolve, but not that the calculator
// computes.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { checkPageIdentity, loadPages } from './page-identity.mjs';

const execFileAsync = promisify(execFile);

// Anchored to this file, not to cwd: the build pod runs `node
// platform/pages/check.mjs` from the repo root, but the test suite and a
// laptop run it from elsewhere. Same idiom as build.mjs.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const PLACEHOLDER_ORIGIN = 'https://example.invalid';

const REQUIRED_ROOT_FILES = [
  'index.html',
  'sitemap.xml',
  'sitemap-hub.xml',
  'robots.txt',
  '404.html',
  '.nojekyll',
  // The AI-discovery entry point. It ships from the same catalogue as the hub,
  // so a build that drops it drops the site's machine-readable front door
  // without any page 404ing to show it.
  'llms.txt',
  'llms-full.txt',
  // The "what's new" door. Unlike the pages, nothing 404s when this is
  // missing -- a subscriber's reader just quietly stops seeing new tools, and
  // nothing on the site says so. That silence is why it is a required file
  // rather than a nice-to-have.
  'feed.xml',
  // Browsers request /favicon.ico on their own for every page, so if it is
  // missing every page load logs a 404 and opens an anonymous blank tab.
  'favicon.ico',
];

// Files whose contents are worth reading for links and stale origins.
const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.mjs', '.js', '.css', '.json']);
// Files whose links are worth resolving. A `.css` url() is not checked.
const LINKED_EXTENSIONS = new Set(['.html', '.mjs', '.js']);

const REFERENCE_RE = /(?:href|src)\s*=\s*"([^"]+)"/g;
// `href`/`src` are markup, so REFERENCE_RE must not see script or style bodies.
// `tender-radar` builds its result rows at runtime with
// `` `<a href="${escapeHtml(href)}">` ``; scanning the whole file read that
// template placeholder as a dead link and failed the Pages build over a page
// that is correct. The hub check below already strips scripts for this reason;
// this applies the same rule to the per-page scan.
const SCRIPT_OR_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// Both quote styles, and `import(...)` as well as `from ...`. Every calculator
// here loads its `calc.mjs` from an inline module script, and a specifier this
// pattern misses is a tool that renders its form and then does nothing. These
// two deliberately scan the *unstripped* text: an import specifier only ever
// appears inside a script, which is exactly what REFERENCE_RE must skip.
const IMPORT_RE = /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const LOC_RE = /<loc>([^<]+)<\/loc>/g;

// Directories at the artifact root that are this build's own pages, not a
// published venture. Every other root directory is a product, and the checks
// below hold it to a product's contract: an `index.html`, a hub link, a row in
// `llms.txt`, a disclaimer. `c/` holds the category landing pages, which are
// none of those things — they have their own checks further down, because the
// ways they fail are different (a category with no page, a page listing a tool
// that did not ship).
//
// Kept as a set rather than a prefix test so a venture named `c-something` is
// still checked as a product.
export const CATEGORY_DIR = 'c';
export const ABOUT_DIR = 'about';
// The comparison index — every `vs-<product>.html` page in the catalogue,
// grouped by product. Same shape as `about`: a page the build writes about the
// site, not a venture, so it has no launch date and no card on the hub.
export const COMPARE_DIR = 'compare';
// The guides index — every page a venture ships beside its calculator, grouped
// by trade and by tool. Same shape as `about` and `compare`: a page the build
// writes about the site, not a venture.
export const GUIDES_DIR = 'guides';
// The research portfolio's homepage (`research/_homepage/build.py`). Same
// shape again: a page about the repository, not a venture.
export const RESEARCH_DIR = 'research';
// The engineering status page (`engineering.mjs`): about how the repository is
// worked on, not a tool. `noindex`, so it is exempt from the sitemap checks.
export const ENGINEERING_DIR = 'engineering';
// Essays from `docs/posts/` (`writing.mjs`): indexed pages about the repository.
export const WRITING_DIR = 'writing';
// The open book (`updates.mjs`): indexed pages about what the repository ships.
export const UPDATES_DIR = 'updates';
export const CHANGELOG_DIR = 'changelog';
export const ASK_DIR = 'ask';
// The lab (`lab.mjs`): `noindex` experiments in what the site can be.
export const LAB_DIR = 'lab';
// The fiction section (`stories.mjs`): an indexed page linking the story ventures.
export const STORIES_DIR = 'stories';

// Directories the site builds for itself. They are not products, so the
// reachability check below must not demand a `data-tool` card on the hub for
// them — the hub links these from its footer, which is the right weight for a
// page about the site rather than a tool.
// The self-deploy page (`platform/deploy/build.mjs`). publish-branch.sh writes
// it after this check runs, because its ~1,200 data files would read as
// orphans, so the hub's footer link to it cannot resolve here.
export const DEPLOY_DIR = 'deploy';
// The development dashboard (`platform/devstats/build.mjs`), written after this
// check on the same terms as the deploy page.
export const DEV_DIR = 'dev';

// The hub's stills and screen recording of real tools (showcase.mjs): media,
// not a product, so it carries no index.html of its own.
export const SHOWCASE_DIR = 'showcase';

// The feedback page (`renderFeedbackPage` in build.mjs): a `noindex` page about
// the site, linked from the footer, not a tool.
export const FEEDBACK_DIR = 'feedback';

export const SITE_OWN_DIRS = new Set([CATEGORY_DIR, ABOUT_DIR, COMPARE_DIR, GUIDES_DIR, RESEARCH_DIR, ENGINEERING_DIR, WRITING_DIR, UPDATES_DIR, CHANGELOG_DIR, LAB_DIR, SHOWCASE_DIR, FEEDBACK_DIR, ASK_DIR, STORIES_DIR]);

// Every user-facing surface here carries a liability disclaimer
// (PRODUCT_PLAYBOOK.md §5b). This is the marker phrase they share. A product
// page missing it ships calculated money figures with no limitation of
// liability — the one defect in this file with legal weight rather than just
// broken-link weight.
const DISCLAIMER_MARKER = /no warranty/i;

// A page that asked to stay out of search. Two checks below exempt such a page
// for the same reason -- the sitemap-coverage check and the hub-reachability
// walk -- so this is one constant rather than the same literal written twice.
// A page declaring it and then being listed, or linked as a destination, is the
// contradiction worth reporting; one declaring it and staying out is correct.
const NOINDEX_RE = /<meta name="robots" content="noindex">/i;

// The budget a published description has to fit, restated rather than imported.
// This file checks the artifact `build.mjs` produced and is deliberately not
// built out of it, so importing the builder to learn its own limit would let a
// mistake in `snippetize` mark its own homework. `build.test.mjs` asserts the
// two numbers agree, which is the part worth automating.
export const SNIPPET_MAX = 160;

// Every `<script>` on a page, with its attributes and its inline body. Used to
// parse-check the bodies; `SCRIPT_OR_STYLE_RE` above strips them instead.
const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const TYPE_ATTR_RE = /\btype\s*=\s*["']([^"']+)["']/i;

// Script types the browser executes as JavaScript. A bare `<script>` with no
// type is a classic script; `module` is ESM. Anything else on this page is
// data (`application/ld+json`) or a template, and is not parsed as JS.
const JS_SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'module-shim']);

// Bookkeeping and test payload that exists for the repo, not for a visitor.
// Finding any of it here means the copy filter in build.mjs regressed.
const LEAKED_FILE_RE = /(?:^|\/)(?:[^/]+\.test\.(?:mjs|js|cjs|py)|VENTURE\.yaml|README\.md|package-lock\.json)$/;
const LEAKED_DIRS = new Set(['node_modules', '__pycache__', 'coverage', '.git']);

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', 'data:', 'javascript:', '//', '#'];
const isExternal = (target) => EXTERNAL_PREFIXES.some((prefix) => target.startsWith(prefix));

const exists = (target) => fs.access(target).then(() => true, () => false);

async function walk(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walk(path.join(dir, entry.name), relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

/**
 * Where this site is rooted, read from the artifact rather than assumed.
 *
 * `robots.txt` names its sitemap by absolute URL, so that URL's directory is
 * the origin path every other absolute URL in the artifact should share. A
 * hard-coded guess here would pass on a site published at the wrong prefix.
 */
async function readBasePath(site) {
  // A missing robots.txt is already reported as a missing root file; crashing
  // here would hide every other problem behind a stack trace.
  const robots = await fs.readFile(path.join(site, 'robots.txt'), 'utf8').catch(() => null);
  const match = robots?.match(/^Sitemap:\s*(\S+)/m);
  if (!match) return null;
  try {
    return new URL(match[1]).pathname.replace(/sitemap\.xml$/, '');
  } catch {
    return null;
  }
}

/** Every `<loc>` in the sitemap tree, following the index into each sitemap. */
async function collectSitemapUrls(site, basePath, relative, seen, out, problems) {
  if (seen.has(relative)) return;
  seen.add(relative);

  const file = path.join(site, relative);
  if (!(await exists(file))) {
    problems.push(`sitemap.xml: names a sitemap that did not ship -> ${relative}`);
    return;
  }

  for (const [, loc] of (await fs.readFile(file, 'utf8')).matchAll(LOC_RE)) {
    let urlPath;
    try {
      urlPath = new URL(loc).pathname;
    } catch {
      problems.push(`${relative}: <loc> is not a URL -> ${loc}`);
      continue;
    }
    if (!urlPath.startsWith(basePath)) {
      problems.push(`${relative}: <loc> outside the site root -> ${loc}`);
      continue;
    }
    const inSite = urlPath.slice(basePath.length);
    if (inSite.endsWith('sitemap.xml') || inSite.endsWith('sitemap-hub.xml')) {
      await collectSitemapUrls(site, basePath, inSite, seen, out, problems);
    } else {
      out.set(inSite, relative);
    }
  }
}

/**
 * @param site  the built artifact directory
 * @param minProducts  floor on the number of published products. Defaults to 1
 *   so a small synthetic fixture is valid; the CLI passes the real floor,
 *   because the failure worth catching is a *discovery collapse* — build.mjs
 *   finding almost nothing, emitting a hub that looks fine with three tools on
 *   it, and every check below passing.
 */
/**
 * Parse-check every inline `<script>` on the pages that shipped.
 *
 * This exists because of `3pl-quote-normalizer`, which published with two
 * missing semicolons — `...})document.querySelector(...)` twice, where ASI
 * cannot help because the `)` and the `document` are on the same line. The
 * module therefore failed to *parse*, so the browser ran none of it: no submit
 * handler, no live recalculation, no local saving, no usage events. The page
 * rendered its full form and its results panel stayed empty forever.
 *
 * Nothing else here would have caught it. Every link resolved, the disclaimer
 * was present, the canonical was right, the sitemaps agreed — a dead product
 * passes all of it, because every existing check reads the page as a document
 * and this defect is in the page as a program. The venture's own suite tested
 * `calc.mjs`, which was fine; the breakage was in the wiring that calls it.
 *
 * A parse error is the one class of JavaScript defect that can be caught
 * statically with certainty and no false positives: the file either is
 * grammatical or it is not. So the gate is narrow on purpose — it says nothing
 * about whether the calculator computes the right number (that is
 * `journey.mjs`), only that the browser will get as far as trying.
 *
 * `node --check` is the same parser the site's own modules are written for, and
 * unlike importing the source it never executes it. Extension decides the goal:
 * `.mjs` parses as ESM, `.js` as a classic script, matching what the `type`
 * attribute tells the browser.
 */
async function checkInlineScripts(site, servedPages, problems) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-parse-'));
  const jobs = [];

  for (const relative of servedPages) {
    const html = await fs.readFile(path.join(site, relative), 'utf8');
    let index = 0;
    for (const match of html.matchAll(SCRIPT_BLOCK_RE)) {
      const [, attrs, body] = match;
      if (!body.trim()) continue; // external script; its file is checked as a file
      const type = (TYPE_ATTR_RE.exec(attrs)?.[1] ?? '').trim().toLowerCase();
      index += 1;

      // JSON-LD is what search engines and assistants read for a rich result.
      // It is data rather than code, so `node --check` is the wrong parser, but
      // a broken block is the same silent failure: consumers skip it and the
      // page still looks fine to everyone else.
      if (type === 'application/ld+json') {
        try {
          JSON.parse(body);
        } catch (error) {
          problems.push(`${relative}: inline JSON-LD block ${index} is not valid JSON -> ${error.message}`);
        }
        continue;
      }
      if (!JS_SCRIPT_TYPES.has(type)) continue;

      const extension = type === 'module' || type === 'module-shim' ? 'mjs' : 'js';
      const scratchFile = path.join(scratch, `${relative.replace(/[^\w.-]/g, '_')}.${index}.${extension}`);
      await fs.writeFile(scratchFile, body);
      jobs.push({ relative, index, scratchFile });
    }
  }

  // Bounded concurrency: one `node --check` per inline script, a few hundred on
  // a full artifact, and spawning them all at once is what makes a check that
  // should take seconds take minutes.
  const LIMIT = 8;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        await execFileAsync(process.execPath, ['--check', job.scratchFile]);
      } catch (error) {
        const detail = String(error.stderr || error.message)
          .split('\n')
          .find((line) => /^\w*(Syntax)?Error\b/.test(line.trim())) ?? 'failed to parse';
        problems.push(
          `${job.relative}: inline <script> block ${job.index} does not parse, so the browser runs none of it -> ${detail.trim()}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LIMIT, jobs.length) }, worker));
  await fs.rm(scratch, { recursive: true, force: true });
}

/**
 * An element the script toggles with `hidden`, that CSS keeps on the page.
 *
 * Why this exists
 * ---------------
 * `hidden` is not a style, it is a hint: the user agent stylesheet says
 * `[hidden]{display:none}`, and *any* author rule setting `display` on the same
 * element outranks it — no `!important`, no specificity contest, author beats
 * user agent. So a bar written the obvious way,
 *
 *   .pf-jobs-revision{display:flex}          <p class="pf-jobs-revision" hidden>
 *
 * is on the page from the moment it loads, empty, with its buttons behind it.
 * The script that "reveals" it is toggling an attribute with no effect.
 *
 * Nothing in this repo could see that. `build.test.mjs` asserts the element
 * ships with `hidden` and it does; the script sets `.hidden` and it does; the
 * stylesheet declares `display:flex` and that is correct in isolation. The
 * defect only exists in the resolved cascade, which is to say only in a
 * browser — and `journey.mjs` and `contrast.mjs`, the two things here that run
 * one, both need Playwright and neither is in CI.
 *
 * It has already shipped twice. `.pf-jobs-list` (display:grid) and
 * `.pf-rates-list` (display:flex) are both toggled with `hidden` and were both
 * live on 342 built pages: a contractor with nothing saved got an empty list
 * element in the panel, holding its own margin and announced by a screen reader
 * as a list of nothing. A third, `.pf-jobs-revision`, was caught the day it was
 * written by driving a browser over it, which is what prompted this check.
 *
 * What it matches, and what it deliberately does not
 * --------------------------------------------------
 * Only the shape the defect actually takes here: a rule whose selector is one
 * bare class or id, setting `display` to anything but `none`, on an element the
 * markup ships carrying `hidden`. A guard — `.thing[hidden]{display:none}` —
 * clears it.
 *
 * Selectors with combinators, pseudo-classes or attribute matches are skipped
 * rather than approximated. This is a gate on a publish, so a false positive
 * costs more than a missed case: `.pf-jobs-list li` styles the children of a
 * hidden list and is not a defect, and a checker that cannot tell the two apart
 * is one nobody leaves switched on. Every occurrence so far has been the bare
 * form, because that is how these stylesheets are written.
 */
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const CSS_RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
const BARE_SELECTOR_RE = /^([.#][\w-]+)$/;
const GUARD_SELECTOR_RE = /^([.#][\w-]+)\[hidden\]$/;
const DISPLAY_RE = /(?:^|;)\s*display\s*:\s*([^;!]+)/i;
const TAG_RE = /<(\w+)\b([^>]*)>/g;
// `\bhidden` is wrong here and the mistake is worth naming: `\b` matches after
// the hyphen in `aria-hidden`, so the first version of this check reported 20
// venture calculators whose itemised template row is `aria-hidden="true"` —
// which is a label for assistive technology and has nothing to do with
// `display`. The hyphen has to be excluded on both sides, and quoted values
// stripped first so `class="hidden"` is not read as the attribute either.
const HIDDEN_ATTR_RE = /(?<![\w-])hidden(?![\w-])/i;
const UNTIL_FOUND_RE = /(?<![\w-])hidden\s*=\s*["']?until-found/i;
const ATTR_VALUE_RE = /=\s*("[^"]*"|'[^']*')/g;

export function checkHiddenDisplay(html, css) {
  // Which selectors the markup actually toggles. Read off the tags carrying
  // `hidden` rather than off the stylesheet, so a rule about an element that is
  // never hidden is never reported.
  const hiddenSelectors = new Set();
  for (const [, , attrs] of html.matchAll(TAG_RE)) {
    if (!HIDDEN_ATTR_RE.test(attrs.replace(ATTR_VALUE_RE, '=""'))) continue;
    // `hidden="until-found"` is a different feature — the element is findable
    // and is revealed by the browser itself — and it is not display:none, so a
    // display rule on it is not this defect.
    if (UNTIL_FOUND_RE.test(attrs)) continue;
    const id = /\bid\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    if (id) hiddenSelectors.add(`#${id}`);
    for (const cls of (/\bclass\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '').split(/\s+/)) {
      if (cls) hiddenSelectors.add(`.${cls}`);
    }
  }
  if (hiddenSelectors.size === 0) return [];

  const body = css.replace(CSS_COMMENT_RE, '');
  const guarded = new Set();
  const offenders = new Map();

  for (const [, selectorList, declarations] of body.matchAll(CSS_RULE_RE)) {
    const display = DISPLAY_RE.exec(declarations)?.[1]?.trim().toLowerCase();
    if (!display) continue;
    for (const raw of selectorList.split(',')) {
      const selector = raw.trim();
      const guard = GUARD_SELECTOR_RE.exec(selector);
      if (guard) {
        if (display === 'none') guarded.add(guard[1]);
        continue;
      }
      const bare = BARE_SELECTOR_RE.exec(selector)?.[1];
      if (!bare || display === 'none') continue;
      if (!hiddenSelectors.has(bare)) continue;
      if (!offenders.has(bare)) offenders.set(bare, display);
    }
  }

  const problems = [];
  for (const [selector, display] of offenders) {
    if (guarded.has(selector)) continue;
    problems.push(
      `${selector} sets display:${display}, which outranks the user agent's ` +
      `[hidden]{display:none} — the element ships with hidden and renders anyway. ` +
      `Add ${selector}[hidden]{display:none}`,
    );
  }
  return problems;
}

/** Every stylesheet a page links, from the artifact, concatenated. */
async function linkedStylesheets(site, relative, html, cache) {
  const sheets = [];
  for (const [, href] of html.matchAll(/<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*\bhref\s*=\s*"([^"]+)"/gi)) {
    if (isExternal(href)) continue;
    const target = path.resolve(site, path.dirname(relative), decodeURIComponent(href.split('?')[0]));
    if (path.relative(path.resolve(site), target).startsWith('..')) continue;
    if (!cache.has(target)) cache.set(target, await fs.readFile(target, 'utf8').catch(() => ''));
    sheets.push(cache.get(target));
  }
  // Inline blocks count too: most ventures style their own page from a <style>
  // in the head, and the bars are not the only things these pages hide.
  for (const [, block] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) sheets.push(block);
  return sheets.join('\n');
}

// ---- What nginx will call each file when the pod serves it -----------------
//
// The public site is served by `nginx-unprivileged` in
// `gitops/prod/portfolio-site.yaml`, and nginx types a response purely by file
// extension. An extension its `mime.types` does not list falls through to
// `default_type application/octet-stream`, and the site sets
// `X-Content-Type-Options: nosniff`, so the browser is forbidden from guessing
// its way out. For a `<script type="module">` that is fatal: the module is
// refused and the page renders but does nothing.
//
// That has already happened twice. `.mjs` is not in nginx's mime.types (still
// true as of 1.27), and neither is `.webmanifest`; both needed an explicit
// `location` block. Neither showed up on GitHub Pages, which types them
// correctly -- so the bug was invisible until the moment the site moved to
// nginx, which is exactly when nobody is watching.
//
// This map is the third fix: rather than wait for the next extension to break,
// every extension the build emits has to be listed here with how it gets
// typed. A venture that ships a new asset kind fails the build with
// instructions instead of silently serving octet-stream in production.
//
//   'stock' -- nginx's own conf/mime.types covers it. Verified against
//              nginx 1.27.0's conf/mime.types, which is the tag the
//              `nginxinc/nginx-unprivileged:1.27-alpine` image builds from.
//   'conf'  -- nginx does NOT cover it; portfolio-site.yaml carries an
//              explicit `location ~ \.EXT$` block. Cross-checked below
//              against the manifest itself, so deleting the block fails here.
export const SERVED_EXTENSIONS = new Map([
  ['.html', 'stock'],
  ['.css', 'stock'],
  ['.js', 'stock'],
  ['.json', 'stock'],
  ['.xml', 'stock'],
  ['.txt', 'stock'],
  ['.png', 'stock'],
  ['.svg', 'stock'],
  ['.ico', 'stock'],
  ['.pdf', 'stock'],
  ['.webp', 'stock'],
  // shed-designer's share picture (renders/og-*-share.jpg): JPEG because not every link
  // scraper reads WebP; mime.types lists image/jpeg jpeg jpg.
  ['.jpg', 'stock'],
  ['.mp4', 'stock'],
  ['.webm', 'stock'],
  // Podcast audio (hearth-and-horizon, podcast.mjs); nginx's mime.types maps mp3 to audio/mpeg.
  ['.mp3', 'stock'],
  // The research pages' self-hosted fonts; mime.types lists font/woff2 woff2.
  ['.woff2', 'stock'],
  ['.mjs', 'conf'],
  ['.webmanifest', 'conf'],
  ['.csv', 'conf'],
  ['.ofx', 'conf'],
  ['.qif', 'conf'],
  ['.mt940', 'conf'],
  // ai-bookkeeper's spreadsheet fixtures; mime.types lists xls and xlsx (1.27.0) but not tsv.
  ['.xls', 'stock'],
  ['.xlsx', 'stock'],
  ['.tsv', 'conf'],
  ['.py', 'conf'],
  ['.gz', 'conf'],
  ['.whl', 'conf'],
  // sales-agent's bounce-corpus fixtures (eval/bounce-corpus-mail/*.eml), plain RFC 822 text.
  // The nginx origin is retired (GitHub Pages types by extension); no location block added.
  ['.eml', 'stock'],
  // wall-framing-takeoff's IFC fixtures (STEP text); same note: no location block on the retired origin.
  ['.ifc', 'stock'],
  // dupehound's browser build (WebAssembly); mime.types lists application/wasm wasm (nginx 1.21+),
  // and GitHub Pages serves it as application/wasm.
  ['.wasm', 'stock'],
]);

// Where the served config lives, relative to the repo root. The build pod
// clones the whole repository and runs this script from that checkout, so the
// manifest is on disk next to the site being checked.
const NGINX_MANIFEST = 'gitops/prod/portfolio-site.yaml';

/**
 * Every extension in `site` must be one this site knows how to serve.
 *
 * `conf`-typed extensions are additionally checked against the manifest, so
 * the two cannot drift apart: dropping a `location` block from
 * portfolio-site.yaml fails the build that would have shipped past it.
 *
 * `nginxConf` is the manifest text, or null when the check runs outside a
 * repository checkout (a bare `check.mjs --dist=...` against a downloaded
 * artifact). The extension allowlist still applies; only the cross-check is
 * skipped, since there is nothing to cross-check against.
 */
export function checkServedExtensions(files, nginxConf) {
  const problems = [];
  const seen = new Map();

  for (const relative of files) {
    // A file that should not have shipped at all is already a problem, and the
    // leak check owns it. Reporting `VENTURE.yaml` a second time under "nginx
    // cannot type .yaml" buries the actual fix (delete it) under a mime-type
    // question nobody needs to answer.
    if (LEAKED_FILE_RE.test(relative)) continue;
    if (relative.split('/').some((segment) => LEAKED_DIRS.has(segment))) continue;
    // Node reports no extension for a dotfile like `.nojekyll`, which is what
    // we want: it is never linked, and nginx's default_type is correct for it.
    const ext = path.extname(relative).toLowerCase();
    if (!ext) continue;
    if (!seen.has(ext)) seen.set(ext, relative);
  }

  for (const [ext, example] of [...seen].sort()) {
    const how = SERVED_EXTENSIONS.get(ext);
    if (!how) {
      problems.push(
        `${example}: nothing says how nginx should type "${ext}". Add it to ` +
          `SERVED_EXTENSIONS in platform/pages/check.mjs -- 'stock' if nginx's ` +
          `mime.types already lists it, otherwise add a location block to ` +
          `${NGINX_MANIFEST} and mark it 'conf'. Left alone it is served as ` +
          `application/octet-stream, which nosniff makes unrecoverable.`,
      );
      continue;
    }
    if (how === 'conf' && nginxConf !== null) {
      // Matches the manifest's own idiom: an empty `types { }` (which extends
      // the inherited map rather than replacing it) immediately before the
      // default_type. Looking for the escaped extension alone would pass on a
      // block that had lost its types/default_type pair.
      const block = new RegExp(
        `location\\s+~\\s+\\\\${ext.replace('.', '\\.')}\\$\\s*\\{\\s*\\n\\s*types\\s*\\{\\s*\\}\\s*\\n\\s*default_type\\s+\\S+;`,
      );
      if (!block.test(nginxConf)) {
        problems.push(
          `${example}: "${ext}" is marked 'conf' but ${NGINX_MANIFEST} has no ` +
            `\`location ~ \\${ext}$\` block typing it. nginx's mime.types does ` +
            `not cover it, so it would serve as application/octet-stream.`,
        );
      }
    }
  }

  return problems;
}

const LLMS_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

/**
 * Products whose `llms.txt` text carries no ISO date, given a Map of slug to
 * text. Empty when no file is dated at all: that is a build without git
 * history, not a defect in the files.
 */
export function llmsTxtMissingDate(texts) {
  const undated = [...texts].filter(([, t]) => !LLMS_DATE.test(t)).map(([slug]) => slug);
  return undated.length === texts.size ? [] : undated;
}

export async function checkSite(site, { minProducts = 1 } = {}) {
  const problems = [];

  if (!(await exists(site))) return [`${site} is not a directory`];

  for (const required of REQUIRED_ROOT_FILES) {
    if (!(await exists(path.join(site, required)))) problems.push(`missing required file: ${required}`);
  }

  const entries = await fs.readdir(site, { withFileTypes: true });
  const productDirs = entries
    .filter((e) => e.isDirectory() && !SITE_OWN_DIRS.has(e.name))
    .map((e) => e.name);
  if (productDirs.length === 0) problems.push('no product directories in the artifact');
  else if (productDirs.length < minProducts) {
    problems.push(`only ${productDirs.length} product(s) published, expected at least ${minProducts} — discovery may have regressed`);
  }
  for (const product of productDirs) {
    if (!(await exists(path.join(site, product, 'index.html')))) {
      problems.push(`${product}/ has no index.html`);
    }
  }

  // ---- Reachability: the hub and the artifact must agree, both ways --------
  //
  // Checked in both directions because the two failures are different. A hub
  // link with nothing behind it is a 404 a visitor sees. A product with no hub
  // link is worse and quieter: it built, deployed, passed every other check,
  // and no visitor can reach it.
  //
  // The hub is a front door now, not the whole catalogue: it links a few tools
  // directly and every category page, and each category page links all of its
  // tools. So "the hub links it" means "the hub, or a category page the hub
  // links, links it" — two clicks at most, which is the promise this check
  // keeps. A product reachable by neither is still the defect it always was.
  let hubCategoryLinks = new Set();
  const hubHtml = await fs.readFile(path.join(site, 'index.html'), 'utf8').catch(() => null);
  if (hubHtml !== null) {
    // Scripts first, because a hub link is markup and script is not. The
    // offline widget builds hub markup by concatenation, so its source contains
    // the literal `data-tool="' + slug + '"` — scraped raw, that reads as a link
    // to a product called `' + slug + '` and fails the check on a healthy site.
    const markupOnly = hubHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const linked = new Set([...markupOnly.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));
    hubCategoryLinks = new Set([...markupOnly.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]));
    for (const slug of linked) {
      if (!productDirs.includes(slug)) problems.push(`index.html: hub links "${slug}" but no such product shipped`);
    }
    const reachable = new Set(linked);
    for (const id of hubCategoryLinks) {
      const page = await fs.readFile(path.join(site, CATEGORY_DIR, id, 'index.html'), 'utf8').catch(() => '');
      const markup = page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      for (const m of markup.matchAll(/data-tool="([^"]+)"/g)) reachable.add(m[1]);
    }
    if (reachable.size > 0) {
      for (const product of productDirs) {
        if (!reachable.has(product)) {
          problems.push(`${product}/: shipped but the hub does not link it, directly or through a category page it links, so nobody can reach it`);
        }
      }
    }
    if (!DISCLAIMER_MARKER.test(hubHtml)) problems.push('index.html: carries no disclaimer');
  }

  // ---- Category landing pages ---------------------------------------------
  //
  // Same reachability argument as the products, one level up. These pages exist
  // to be the entry point organic search sends a visitor to, so the failure
  // that matters is a page that shipped and nothing links, or a link with no
  // page behind it — and neither shows up anywhere else: the hub still renders,
  // every product still resolves.
  {
    const categoryRoot = path.join(site, CATEGORY_DIR);
    const shipped = (await fs.readdir(categoryRoot, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const id of hubCategoryLinks) {
      if (!shipped.includes(id)) {
        problems.push(`index.html: links category "${id}" but ${CATEGORY_DIR}/${id}/ did not ship`);
      }
    }
    for (const id of shipped) {
      // No "only if the hub linked something" escape hatch, unlike the product
      // check above. That guard exists there so a stub hub does not report all
      // 164 products at once; here the directory only exists because this build
      // wrote it, so a category page with no hub link is always the defect.
      if (!hubCategoryLinks.has(id)) {
        problems.push(`${CATEGORY_DIR}/${id}/: shipped but the hub does not link it, so nobody can reach it`);
      }
      const relative = path.join(CATEGORY_DIR, id, 'index.html');
      const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
      if (html === null) {
        problems.push(`${CATEGORY_DIR}/${id}/: has no index.html`);
        continue;
      }
      if (!DISCLAIMER_MARKER.test(html)) {
        problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      }
      // A category page that lists a tool the build did not publish is a 404
      // handed to the one visitor who was closest to using it.
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
      const tools = new Set([...markup.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));
      if (tools.size === 0) problems.push(`${relative}: lists no tools`);
      for (const slug of tools) {
        if (!productDirs.includes(slug)) {
          problems.push(`${relative}: links "${slug}" but no such product shipped`);
        }
      }
    }
  }

  {
    // Optional: a fixture build has no posts directory. Every page under it
    // (the index and each post) carries the disclaimer, and the hub links it.
    const dir = path.join(site, WRITING_DIR);
    const pages = await fs
      .readdir(dir, { recursive: true })
      .then((names) => names.filter((n) => n.endsWith('index.html')))
      .catch(() => null);
    if (pages !== null) {
      for (const name of pages) {
        const html = await fs.readFile(path.join(dir, name), 'utf8');
        if (!DISCLAIMER_MARKER.test(html)) {
          problems.push(`${path.join(WRITING_DIR, name)}: carries no disclaimer, so it must not ship`);
        }
      }
      if (hubHtml !== null && !/href="writing\/"/.test(hubHtml)) {
        problems.push(`${WRITING_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
    }
  }

  for (const dir of [UPDATES_DIR, CHANGELOG_DIR, STORIES_DIR]) {
    // Optional, like the writing pages: a fixture build may write neither.
    const relative = path.join(dir, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    if (html === null) continue;
    if (!DISCLAIMER_MARKER.test(html)) problems.push(`${relative}: carries no disclaimer, so it must not ship`);
    if (hubHtml !== null && !new RegExp(`href="${dir}/"`).test(hubHtml)) {
      problems.push(`${dir}/: shipped but the hub does not link it, so nobody can reach it`);
    }
  }

  // ---- About page ----------------------------------------------------------
  //
  {
    const relative = path.join(RESEARCH_DIR, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    // Optional: a fixture or a build without the research tree has none.
    if (html !== null) {
      if (!DISCLAIMER_MARKER.test(html)) {
        problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      }
      if (hubHtml !== null && !/href="research\/"/.test(hubHtml)) {
        problems.push(`${RESEARCH_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
    }
  }

  {
    const relative = path.join(ENGINEERING_DIR, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    // Optional, like research: a fixture build has none.
    if (html !== null) {
      if (!DISCLAIMER_MARKER.test(html)) {
        problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      }
      if (!NOINDEX_RE.test(html)) {
        problems.push(`${relative}: must be noindex -- it is a status page, not a search landing`);
      }
      if (hubHtml !== null && !/href="engineering\/"/.test(hubHtml)) {
        problems.push(`${ENGINEERING_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
    }
  }

  // Exempted from the product sweep above (it is not a tool), so it needs its
  // own reachability check or it has none at all. It is the page that answers
  // "is this thing going to email my numbers to someone" and the one a linker
  // is pointed at for boilerplate — a build that silently stopped emitting it,
  // or emitted it with nothing linking it, would look completely healthy
  // everywhere else in this file.
  {
    const relative = path.join(ABOUT_DIR, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    if (html === null) {
      problems.push(`${ABOUT_DIR}/: did not ship, so the site has no privacy or press page`);
    } else {
      if (!DISCLAIMER_MARKER.test(html)) {
        problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      }
      if (hubHtml !== null && !/href="about\/"/.test(hubHtml)) {
        problems.push(`${ABOUT_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
    }
  }

  // The assistant's page and the files every page lazy-loads it from. A
  // missing pf-assistant.js would leave a header link on every page that
  // silently does nothing when clicked.
  {
    const relative = path.join(ASK_DIR, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    if (html === null) {
      problems.push(`${ASK_DIR}/: did not ship, so the header's Ask link is a 404`);
    } else {
      if (!DISCLAIMER_MARKER.test(html)) problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      if (hubHtml !== null && !/href="ask\/"/.test(hubHtml)) {
        problems.push(`${ASK_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
    }
    for (const file of ['pf-assistant.js', 'pf-fill.js', 'pf-search.js', 'pf-ai-worker.js', 'pf-byok.js']) {
      if (!(await exists(path.join(site, file)))) problems.push(`missing assistant file: ${file}`);
    }
  }

  // The comparison index, on the same terms as the About page and for the same
  // reason: it is the only cross-venture route between the `vs-<product>`
  // pages, each of which is otherwise linked from exactly one place — its own
  // tool's entry page. A build that stopped emitting it, or emitted it with
  // nothing linking it, would look completely healthy everywhere else here,
  // and the whole point of the page is being reachable.
  //
  // It must also actually list something. An empty index is the failure mode
  // this page has that About does not: `discoverComparisons` reads the venture
  // tree, so a change to the filename convention or to `sourceDir` resolution
  // would render a page with a headline, a disclaimer, and no comparisons —
  // valid HTML, no dead links, and worthless.
  {
    const relative = path.join(COMPARE_DIR, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    if (html === null) {
      problems.push(`${COMPARE_DIR}/: did not ship, so the comparison pages have no cross-venture index`);
    } else {
      if (!DISCLAIMER_MARKER.test(html)) {
        problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      }
      if (hubHtml !== null && !/href="compare\/"/.test(hubHtml)) {
        problems.push(`${COMPARE_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
      const linked = new Set(
        [...html.matchAll(/href="\.\.\/([a-z0-9][a-z0-9-]*)\/vs-[^"]+"/g)].map((m) => m[1]),
      );
      if (linked.size === 0) {
        problems.push(`${relative}: lists no comparison pages, so it is an empty index`);
      }
      for (const slug of linked) {
        if (!productDirs.includes(slug)) {
          problems.push(`${relative}: links "${slug}" but no such product shipped`);
        }
      }
    }
  }

  // The guides index, on exactly the same terms as the comparison index above
  // and for the same reason. It is the only cross-venture route to the 342
  // "how much should I charge for X" pages the ventures wrote, and measured on
  // 2026-09-07, 64 of those had one inbound link in the whole artifact — their
  // own tool's entry page — so a build that stopped emitting this index, or
  // emitted it with nothing linking it, would put the site's largest body of
  // content back behind a sitemap-only discovery path and look healthy
  // everywhere else in this file.
  //
  // The empty-index check matters more here than it does for comparisons:
  // `discoverGuides` reads the *built* tree, so a change to `isGuidePage` or to
  // the output layout would render a page with a headline, a disclaimer and no
  // guides — valid HTML, no dead links, and worthless.
  {
    const relative = path.join(GUIDES_DIR, 'index.html');
    const html = await fs.readFile(path.join(site, relative), 'utf8').catch(() => null);
    if (html === null) {
      problems.push(`${GUIDES_DIR}/: did not ship, so the guide pages have no cross-venture index`);
    } else {
      if (!DISCLAIMER_MARKER.test(html)) {
        problems.push(`${relative}: carries no disclaimer, so it must not ship`);
      }
      if (hubHtml !== null && !/href="guides\/"/.test(hubHtml)) {
        problems.push(`${GUIDES_DIR}/: shipped but the hub does not link it, so nobody can reach it`);
      }
      const linked = new Set(
        [...html.matchAll(/href="\.\.\/([a-z0-9][a-z0-9-]*)\/[^"]+\.html"/g)].map((m) => m[1]),
      );
      if (linked.size === 0) {
        problems.push(`${relative}: lists no guide pages, so it is an empty index`);
      }
      for (const slug of linked) {
        if (!productDirs.includes(slug)) {
          problems.push(`${relative}: links "${slug}" but no such product shipped`);
        }
      }
    }
  }

  // Same reachability argument as the hub, for the machine-readable door. A
  // tool missing from llms.txt is invisible to an assistant recommending one,
  // and nothing else in the artifact would show it: every page still resolves.
  // `llms-full.txt` is the complete list; `llms.txt` is a short index.
  const llms = await fs.readFile(path.join(site, 'llms-full.txt'), 'utf8').catch(() => null);
  if (llms !== null) {
    // The parent segment is captured as well as the leaf, because a leaf alone
    // cannot tell a product from a page filed *under* a site-own directory.
    // `/compare/jobber/` is one of the comparison index's per-product pages,
    // and reading its leaf in isolation says a product called `jobber` shipped
    // — which is both false and, worse, the reading that would make a real
    // missing product look fine. Only URLs whose parent is the site root are
    // product claims.
    const listed = new Set(
      [...llms.matchAll(/\]\((?:[^)]*?)\/([^/)]+)\/([^/)]+)\/\)/g)]
        // A research topic (`research/topics/<id>/`) is a page about research,
        // not a product claim.
        .filter((m) => !m[0].includes('/research/'))
        .filter((m) => !SITE_OWN_DIRS.has(m[1]))
        .map((m) => m[2]),
    );
    for (const product of productDirs) {
      if (!listed.has(product)) {
        problems.push(`${product}/: shipped but llms-full.txt does not list it, so AI discovery misses it`);
      }
    }
    for (const slug of listed) {
      // `SITE_OWN_DIRS` are legitimately listed here — llms.txt names the About
      // page and the category pages under "Optional" so an assistant can cite
      // the page about the site, or about a trade, instead of a tool. They are
      // not products, so the "no such product shipped" reading is wrong for
      // them; that they shipped is checked in their own blocks above.
      if (!productDirs.includes(slug) && !SITE_OWN_DIRS.has(slug)) {
        problems.push(`llms-full.txt: lists "${slug}" but no such product shipped`);
      }
    }
  }

  // Every built `/<product>/llms.txt` should say when it was last true, so an
  // assistant quoting it can say "as of". The build stamps the git date; a
  // build with no git history stamps none, so the check only bites when at
  // least one file is dated (the dates are available) and another is not.
  {
    const texts = new Map();
    for (const product of productDirs) {
      const text = await fs.readFile(path.join(site, product, 'llms.txt'), 'utf8').catch(() => null);
      if (text !== null) texts.set(product, text);
    }
    for (const product of llmsTxtMissingDate(texts)) {
      problems.push(`${product}/llms.txt: states no date, so an assistant cannot say how current it is`);
    }
  }

  // The feed is the only surface built from a *committed* data file
  // (`launched.mjs`) rather than derived from the tree, so it is the only one
  // that can silently fall behind: a tool lands, nobody re-runs the refresh,
  // and it never appears in the feed. Nothing else in the artifact shows that
  // — the tool's own pages, sitemap entry and llms.txt line are all fine.
  //
  // The dates are read back out of `catalog.json` rather than from the repo,
  // so this check is a statement about the artifact and holds when the check
  // runs against a downloaded one. `catalog.json` carries every tool's date;
  // the feed carries only the newest few dozen by design, so an older tool
  // being absent from the feed is correct and cannot be the test.
  const catalog = await fs
    .readFile(path.join(site, 'catalog.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (catalog !== null) {
    const dated = new Map((catalog.tools ?? []).map((t) => [t.slug, t.launched]));
    for (const product of productDirs) {
      const date = dated.get(product);
      if (!date) {
        problems.push(
          `${product}/: shipped with no launch date, so it can never enter the feed — run \`node platform/pages/launched.mjs --write\``,
        );
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        problems.push(`${product}/: launch date "${date}" is not YYYY-MM-DD`);
      }
    }
  }

  const feed = await fs.readFile(path.join(site, 'feed.xml'), 'utf8').catch(() => null);
  if (feed !== null) {
    for (const slug of new Set(
      [...feed.matchAll(/<id>tag:[^<]*?:tool\/([^<]+)<\/id>/g)].map((m) => m[1]),
    )) {
      if (!productDirs.includes(slug)) {
        problems.push(`feed.xml: lists "${slug}" but no such product shipped`);
      }
    }
    // A reader that cannot parse the document sees no entries at all, and the
    // likeliest cause is an unescaped `&` or `<` from a tool's own description
    // reaching the XML. One raw ampersand takes the whole feed down for every
    // subscriber at once, which is why this is a check and not a test.
    if (/&(?!amp;|lt;|gt;|quot;|#39;|apos;)/.test(feed)) {
      problems.push('feed.xml: contains a raw `&`, which makes the whole feed unparseable');
    }
  }

  const files = await walk(site);
  const servedPages = files.filter((f) => f.endsWith('.html'));

  // The pod runs this from its own clone, so the manifest that will serve
  // these files is on disk. Absent (a bare run against a downloaded artifact)
  // only skips the cross-check, not the allowlist.
  const nginxConf = await fs
    .readFile(path.join(REPO_ROOT, NGINX_MANIFEST), 'utf8')
    .catch(() => null);
  problems.push(...checkServedExtensions(files, nginxConf));

  await checkInlineScripts(site, servedPages, problems);

  // ---- Elements hidden in markup that CSS puts back on the page -----------
  //
  // Reported once per selector rather than once per page: these bars are shared
  // across the whole artifact, so a single missing guard is 342 identical lines
  // and the one that matters is the first.
  {
    const sheetCache = new Map();
    const seen = new Set();
    for (const relative of servedPages) {
      const html = await fs.readFile(path.join(site, relative), 'utf8');
      if (!HIDDEN_ATTR_RE.test(html)) continue;
      const css = await linkedStylesheets(site, relative, html, sheetCache);
      if (!css) continue;
      for (const problem of checkHiddenDisplay(html, css)) {
        if (seen.has(problem)) continue;
        seen.add(problem);
        problems.push(`${relative}: ${problem}`);
      }
    }
  }

  // ---- Disclaimers and leaked payload -------------------------------------
  for (const product of productDirs) {
    const index = path.join(site, product, 'index.html');
    const html = await fs.readFile(index, 'utf8').catch(() => null);
    if (html !== null && !DISCLAIMER_MARKER.test(html)) {
      problems.push(`${product}/index.html: carries no disclaimer, so it must not ship`);
    }
  }

  // ---- Two buttons that copy two different links --------------------------
  //
  // `link.mjs` skips a page that already has its own share control, and states
  // why: "a second button beside `copyShare`, writing a second hash format, is
  // worse than the drift it fixes." That gate matches three spellings, and
  // `mobile-detailing-bid-calculator` used a fourth — `id="copyLink"`, no
  // `share.mjs`, label "Copy shareable link" — so it shipped with both.
  //
  // Which of the two the contractor clicked decided whether the customer's
  // deposit travelled: the injected control reads every field off the form, the
  // inline one serialized `readInput()` and left the proposal terms behind. A
  // page cannot be correct with two answers to "what does this link carry",
  // whichever one is better, so this refuses to publish one.
  const OWN_COPY_CONTROL =
    /<button[^>]*\bid="(copyShare|copyLink|shareLink|share)"/g;
  for (const product of productDirs) {
    const index = path.join(site, product, 'index.html');
    const html = await fs.readFile(index, 'utf8').catch(() => null);
    if (html === null || !html.includes('id="pf-link-copy"')) continue;
    OWN_COPY_CONTROL.lastIndex = 0;
    const own = [...html.matchAll(OWN_COPY_CONTROL)].map((match) => match[1]);
    if (own.length > 0) {
      problems.push(
        `${product}/index.html: ships the injected bid link *and* its own #${own.join(', #')} — `
        + 'two buttons writing two hash formats, so what a shared link carries depends on '
        + 'which one was clicked. Drop the redundant control, or teach pageHasOwnShareLink '
        + 'to recognise it so the injected one is not added.');
    }
  }

  for (const relative of files) {
    if (LEAKED_FILE_RE.test(relative)) problems.push(`${relative}: repo bookkeeping or test payload was published`);
    else if (relative.split('/').some((segment) => LEAKED_DIRS.has(segment))) {
      problems.push(`${relative}: published from a directory that should never ship`);
    }
  }

  // A canonical tag must name a URL under this site's own base, and the hub's
  // canonical is what that base is. Anything else tells crawlers the real page
  // lives somewhere other than where it just shipped.
  //
  // The case this exists for is not a placeholder but a *stale real origin*:
  // three ventures wrote `duncan-haywood.github.io/...` into their canonicals
  // as a literal instead of using the placeholder. That is invisible today,
  // because it happens to match where the site is served. The day
  // `PAGES_BASE_URL` points at a custom domain, every one of those pages hands
  // the new domain a duplicate and keeps the old address as canonical. The
  // build now rewrites them; this is the check that says so.
  let siteBase = null;
  if (files.includes('index.html')) {
    const hub = await fs.readFile(path.join(site, 'index.html'), 'utf8');
    const canonical = /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i.exec(hub);
    if (canonical) {
      try {
        siteBase = new URL(canonical[1]);
      } catch {
        problems.push(`index.html: canonical href is not a valid URL -> ${canonical[1]}`);
      }
    }
  }

  if (siteBase) {
    const prefix = `${siteBase.origin}${siteBase.pathname}`;
    for (const relative of servedPages) {
      const html = await fs.readFile(path.join(site, relative), 'utf8');
      const canonical = /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i.exec(html);
      if (!canonical) continue;
      if (/^https?:/i.test(canonical[1]) && !canonical[1].startsWith(prefix)) {
        problems.push(`${relative}: canonical points outside this site -> ${canonical[1]}`);
        continue;
      }

      // The check above only ever saw an *absolute* canonical, and the defect
      // this catches was relative. Fifteen tools shipped `href="./index.html"`
      // — legal HTML, self-resolving, and therefore invisible to a validator —
      // while the hub, the sitemaps, and every internal link addressed the same
      // page as `/<slug>/`. That names a second URL for one page and points the
      // canonical at the one nothing links to, so the address the site actually
      // advertises is the one consolidated away.
      //
      // Resolving both sides and comparing is what makes the relative form
      // checkable at all: a canonical is right when it resolves to the URL the
      // page is served at, whatever spelling it uses to get there.
      const pageUrl = new URL(relative.replace(/(^|\/)index\.html$/, '$1'), siteBase).href;
      let resolved;
      try {
        resolved = new URL(canonical[1], pageUrl).href;
      } catch {
        problems.push(`${relative}: canonical href is not a valid URL -> ${canonical[1]}`);
        continue;
      }
      if (resolved !== pageUrl) {
        problems.push(
          `${relative}: canonical resolves to ${resolved}, but the page is served at ${pageUrl}`,
        );
        continue;
      }

      // A link pasted into a trade group renders from these. `og:url` keys the
      // card to the tool rather than to whatever query string was shared, and
      // `og:image` is the difference between a card with a picture and a bare
      // line of grey text.
      for (const [attr, value] of [
        ['property', 'og:url'],
        ['property', 'og:image'],
        ['name', 'twitter:card'],
      ]) {
        const has = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value}["']`, 'i').test(html);
        if (!has) problems.push(`${relative}: no ${value}, so a shared link previews without it`);
      }

      // A description longer than a result or a card will show.
      //
      // These grow on their own: a session adds a feature to a tool and adds a
      // clause to its description saying so, and nothing ever takes one out.
      // 138 of 168 pages had drifted past the budget and one had reached 1,862
      // characters — a snippet that read "...whether a" and stopped. `build.mjs`
      // cuts them (`snippetize`), so reaching here over the budget means either
      // that pass did not run on this page or something after it wrote a longer
      // one back. Both ship copy no reader sees the end of, on the two surfaces
      // this site is actually found through.
      for (const [attr, value] of [
        ['name', 'description'],
        ['property', 'og:description'],
        ['name', 'twitter:description'],
      ]) {
        // Whole-tag matcher: a description may contain a bare `>`, and a
        // `[^>]*` scan would stop at it and miss the longest ones of all.
        const tag = [...html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
          .find((m) => new RegExp(`\\b${attr}=["']${value}["']`, 'i').test(m[0]));
        if (!tag) continue;
        const content = /\bcontent=(["'])([\s\S]*?)\1/i.exec(tag[0])?.[2] ?? '';
        // Entities are one character to a reader and to the count that matters.
        const length = content.replace(/&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/gi, ' ').length;
        if (length > SNIPPET_MAX) {
          problems.push(
            `${relative}: ${value} is ${length} characters, over the ${SNIPPET_MAX}-character ` +
              'budget a search result and a share card show',
          );
        }
      }
    }
  }

  // Resolved (site-relative, filesystem-absolute) targets of every internal
  // `href`/`src` seen anywhere in the artifact's markup. Built alongside the
  // dead-link scan below — same targets, same resolution — and consulted
  // afterward by the orphan-page check: a target only ever lands here when a
  // real page actually points at it.
  const inboundLinks = new Set();

  // The same edges as `inboundLinks`, kept with their source so they form a
  // graph rather than a set of destinations. The reachability walk below needs
  // to know *which page* linked somewhere; the orphan check only needs to know
  // that something did. Markup edges between HTML pages only -- see `navigable`.
  const outboundPages = new Map();

  for (const relative of files) {
    const extension = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    const text = await fs.readFile(path.join(site, relative), 'utf8');
    if (text.includes(PLACEHOLDER_ORIGIN)) {
      problems.push(`${relative}: still contains ${PLACEHOLDER_ORIGIN}`);
    }
    if (!LINKED_EXTENSIONS.has(extension)) continue;

    // REFERENCE_RE only makes sense against real markup: an `.html` file with
    // its <script>/<style> bodies stripped. A `.mjs`/`.js` file has no such
    // wrapper to strip -- its entire content is script, the same content
    // SCRIPT_OR_STYLE_RE exists to exclude -- so scanning it for href/src finds
    // whatever `href="${...}"` template-literal markup the module builds at
    // runtime and misreads the unevaluated placeholder as a dead link. Several
    // ventures build result rows this way (epk-generator's generator.mjs among
    // them); IMPORT_RE/DYNAMIC_IMPORT_RE below are what actually matter for a
    // script file, and they already scan the unstripped text on every
    // extension in LINKED_EXTENSIONS.
    const markupOnly = extension === '.html' ? text.replace(SCRIPT_OR_STYLE_RE, '') : '';
    // Split rather than concatenated, because the reachability walk below may
    // only follow the first kind. A crawler navigates *markup* on a page it
    // rendered; an `import` specifier is a module the browser fetches, not a
    // document anyone can land on, and counting one as a hop would report a
    // page as reachable by a route no visitor or crawler can take.
    const markupTargets = [...markupOnly.matchAll(REFERENCE_RE)].map((m) => m[1]);
    const targets = [
      ...markupTargets,
      ...[...text.matchAll(IMPORT_RE)].map((m) => m[1]),
      ...[...text.matchAll(DYNAMIC_IMPORT_RE)].map((m) => m[1]),
    ];
    const navigable = new Set(markupTargets);
    for (const target of targets) {
      // SCRIPT_OR_STYLE_RE only strips `<script>` wrappers inside HTML; a
      // `.mjs`/`.js` file has no such wrapper, so its raw source is scanned
      // as-is. A generator that builds a document client-side from
      // user-supplied data -- `` `<a href="${escapeHtml(url)}">` `` in
      // epk-generator/generator.mjs, same shape as the tender-radar case
      // above -- has a literal `${...}` between the quotes, which can never
      // be a real static path: it is JS source, not the rendered page.
      if (target.includes('${')) continue;
      if (isExternal(target)) continue;
      const cleaned = decodeURIComponent(target.split('#')[0].split('?')[0]);
      if (!cleaned) continue;

      const from = path.resolve(site, path.dirname(relative));
      let resolved = path.resolve(from, cleaned);
      if (path.relative(path.resolve(site), resolved).startsWith('..')) {
        problems.push(`${relative}: link escapes the site root -> ${target}`);
        continue;
      }
      if (cleaned.endsWith('/')) resolved = path.join(resolved, 'index.html');
      else if (!path.extname(resolved)) {
        // A extension-less link is served as a directory if one is there.
        if (await exists(path.join(resolved, 'index.html'))) resolved = path.join(resolved, 'index.html');
        else if (extension !== '.html') {
          // A bundler-style import ('./App', './src/store') names a module
          // without its extension (React Native sources shipped as files).
          for (const ext of ['.js', '.jsx', '.mjs', '.ts', '.tsx']) {
            if (await exists(resolved + ext)) { resolved += ext; break; }
          }
        }
      }
      // Every tool page footer links `deploy/?app=<slug>` (the "Run your own copy" link), and the page is
      // written after this check runs.
      if (resolved === path.resolve(site, DEPLOY_DIR, 'index.html')) continue;
      // Everything under dev/ (the dashboard, its stats.json and dev/analyses/)
      // is written by publish-branch.sh after this check, on the same terms.
      if (resolved.startsWith(path.resolve(site, DEV_DIR) + path.sep)) continue;
      if (!(await exists(resolved))) problems.push(`${relative}: dead link -> ${target}`);
      else {
        inboundLinks.add(resolved);
        if (extension === '.html' && navigable.has(target) && resolved.endsWith('.html')) {
          let edges = outboundPages.get(relative);
          if (!edges) outboundPages.set(relative, (edges = new Set()));
          edges.add(path.relative(site, resolved));
        }
      }
    }
  }

  // ---- Orphaned pages: a link resolving is not the same as a link existing -
  //
  // The dead-link scan above proves every link's *target* exists. It says
  // nothing about the reverse: a page can ship correct, dead-link-free, listed
  // in the sitemap, disclaimered — and still have no `href` anywhere on the
  // site pointing at it, reachable only by a crawler reading the sitemap
  // directly, not by a visitor clicking anything. #2664 shipped exactly that
  // (a comparison page with zero inbound hrefs, fixed forward in #2667), and
  // nothing in this file caught it: sitemap coverage was fine, dead-link
  // scanning was fine, the disclaimer was there. An internal link is what
  // carries ranking signal between pages and is how a visitor already on the
  // tool finds the deeper page — sitemap-only discovery is the weak half.
  //
  // Scoped to non-index pages inside a product directory: `index.html` has its
  // own reachability check above (the hub), and so do the category and about
  // pages. This is the class those checks do not reach — the comparison
  // pages, the "how much to charge for X" articles, the decision pages a
  // venture adds under its own slug.
  for (const product of productDirs) {
    const dir = path.join(site, product);
    const subEntries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of subEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.html') || entry.name === 'index.html') continue;
      const subpage = path.join(dir, entry.name);
      if (!inboundLinks.has(subpage)) {
        problems.push(
          `${path.relative(site, subpage)}: no page on the site links to it — only a crawler ` +
            'reading the sitemap directly can find it, not a visitor or a search result',
        );
      }
    }
  }

  // ---- Reachable from the hub: an inbound link is not the same as a route ---
  //
  // The orphan check above proves every product subpage has *an* inbound link.
  // It cannot prove anyone can get there, because a link from a page that is
  // itself unreachable still counts: a cluster of pages linking only to each
  // other passes it while nothing on the site leads in. What decides whether a
  // page is found is a path from the hub, and nothing here asserted one.
  //
  // That gap is load-bearing on this origin specifically. The catalogue serves
  // from a project-Pages *subpath*, so the `robots.txt` this build publishes is
  // not the file a crawler reads -- that one belongs to the owner's user-level
  // Pages site -- and the `Sitemap:` line in it has never been seen. Crawling
  // is allowed; *enumeration* is not. `pages_state.py`'s `indexing` row is the
  // live reading, and while it says `subpath-robots` the link graph is the only
  // route into all 984 indexable pages. A page reachable only from the sitemap
  // is, on this origin, reachable from nothing.
  //
  // Measured when this was added: 984 of 986 reachable, maximum depth 2, the
  // two exceptions being `404.html` and the `noindex` offline shell. So this
  // ships green and exists to catch the regression -- a hub that stops emitting
  // cards, a category page that drops its list -- which would otherwise be
  // invisible in every other check here and would cost the whole catalogue.
  {
    const reachable = new Set(['index.html']);
    let frontier = ['index.html'];
    while (frontier.length) {
      const next = [];
      for (const page of frontier) {
        for (const target of outboundPages.get(page) ?? []) {
          if (reachable.has(target)) continue;
          reachable.add(target);
          next.push(target);
        }
      }
      frontier = next;
    }
    for (const page of servedPages) {
      if (page === '404.html' || reachable.has(page)) continue;
      // A page that asked not to be indexed is allowed to be unreachable --
      // the offline fallback is a shell, and a route to it would be a search
      // result for a calculator that does not compute. Same exemption, and the
      // same reasoning, as the sitemap-coverage check below.
      const html = await fs.readFile(path.join(site, page), 'utf8').catch(() => '');
      if (NOINDEX_RE.test(html)) continue;
      problems.push(
        `${page}: no path of links from index.html reaches it — with sitemap ` +
          'enumeration unavailable on this origin, nothing can discover it',
      );
    }
  }

  // ---- Sitemaps: the two ways organic discovery quietly fails --------------

  const basePath = await readBasePath(site);
  if (basePath === null) {
    problems.push('robots.txt: no Sitemap line, so crawlers get no entry point');
    return problems;
  }

  const listed = new Map();
  await collectSitemapUrls(site, basePath, 'sitemap.xml', new Set(), listed, problems);

  // A URL that 404s is worse than no sitemap at all: it teaches a crawler the
  // site is broken.
  for (const [urlPath, source] of listed) {
    const target = urlPath === '' || urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath;
    if (!(await exists(path.join(site, target)))) {
      problems.push(`${source}: lists a URL that did not ship -> /${urlPath}`);
    }
  }

  // A page in no sitemap is built, deployed, and never found.
  for (const page of servedPages) {
    if (page === '404.html') continue;
    // ...unless it asked not to be found. The offline fallback is a shell, and
    // indexed it would be the search result for a calculator. A page that
    // declares noindex and is then listed in a sitemap is the contradiction;
    // one that declares it and stays out is correct.
    if (NOINDEX_RE.test(await fs.readFile(path.join(site, page), 'utf8'))) {
      continue;
    }
    const candidates = [page];
    if (page.endsWith('/index.html')) candidates.push(page.slice(0, -'index.html'.length));
    if (page === 'index.html') candidates.push('');
    if (!candidates.some((c) => listed.has(c))) {
      problems.push(`${page}: served but absent from every sitemap`);
    }
  }

  return problems;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const flag = process.argv.find((a) => a.startsWith('--dist='))?.slice('--dist='.length);
  const site = path.resolve(flag ?? positional ?? fileURLToPath(new URL('./dist', import.meta.url)));

  // Deliberately well below the ~38 products on `main`, so a venture landing
  // does not require touching this number, while a collapse still fails.
  // Real-site search hygiene (unique titles, one h1). Kept out of checkSite
  // so the minimal fixtures in check.test.mjs need no <title>/<h1>.
  const problems = [
    ...(await checkSite(site, { minProducts: 20 })),
    ...(await exists(site) ? checkPageIdentity(await loadPages(site)) : []),
  ];

  if (problems.length > 0) {
    console.error(`${problems.length} problem(s) in ${site}:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  const files = await walk(site);
  const pages = files.filter((f) => f.endsWith('.html')).length;
  // Same exclusion `checkSite` applies: `c/` holds this build's own category
  // pages, and counting it as a product overstates the catalogue by one.
  const rootDirs = (await fs.readdir(site, { withFileTypes: true })).filter((e) => e.isDirectory());
  const products = rootDirs.filter((e) => !SITE_OWN_DIRS.has(e.name)).length;
  const categories = rootDirs.some((e) => e.name === CATEGORY_DIR)
    ? (await fs.readdir(path.join(site, CATEGORY_DIR), { withFileTypes: true })).filter((e) => e.isDirectory()).length
    : 0;
  console.log(
    `${site} looks publishable: ${products} products, ${categories} category pages, ${pages} pages, no dead links.`,
  );
}
