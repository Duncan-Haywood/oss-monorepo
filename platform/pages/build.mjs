#!/usr/bin/env node
// Assembles every static, browser-runnable venture surface in this monorepo
// into ONE GitHub Pages site.
//
// Why this exists
// ---------------
// GitHub serves exactly one Pages site per repository. Before this script the
// only workflow that could publish one built `retail-pilot-intel`'s
// passcode-gated docs app — so the owner's single `GITHUB_PAGES_ENABLED` flip
// would have put an internal docs site live and left ~30 finished, tested,
// free calculators with no public URL at all. Deploy-first (portfolio/DIRECTION.md)
// means the flip has to publish the products, so the site the flip publishes
// has to *be* the products.
//
// Discovery is automatic on purpose. A calculator lands on `main` here most
// days; a hand-maintained manifest would be stale within a week and the new
// tool would silently never be reachable. Anything that grows a browser entry
// point is published on the next push, and `EXCLUDED_SLUGS` is the deliberate
// opt-out.

import { promises as fs, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import {
  ICONS,
  OFFLINE_WIDGET_HTML,
  OFFLINE_WIDGET_SCRIPT,
  THEME_COLOR,
  injectOfflineSupport,
  renderIcon,
  renderKillSwitchWorker,
  renderManifest,
  renderOfflinePage,
  renderServiceWorker,
} from './offline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

// Owner-overridable at build time; this default is where GitHub serves a
// project Pages site for this repository.
export const DEFAULT_BASE_URL = 'https://duncan-haywood.github.io/monorepo-projects/';

// The placeholder origin every venture's sitemap.xml and canonical tags were
// written against, back when no real origin existed. Rewriting it is what
// turns already-written SEO into SEO that points at a reachable page.
const PLACEHOLDER_ORIGIN = 'https://example.invalid/';

// Where a venture's public entry point may live, in preference order.
const ENTRY_CANDIDATES = ['index.html', path.join('site', 'index.html')];

// Ventures whose public surface is not at one of the standard paths.
const ENTRY_OVERRIDES = {
  // Five electronics calculators behind their own hub page.
  'ai-engineering-academy': 'tools',
};

// Not products a stranger should land on.
const EXCLUDED_SLUGS = new Set([
  // Passcode-gated internal docs that need a pnpm build of its own; it keeps
  // its own workflow and its own (now separately gated) deploy.
  'retail-pilot-intel',
  // Infrastructure for the agent fleet, explicitly kept off the public path
  // by portfolio/hosting/README.md.
  'ubuntu-agent-server',
]);

// Never shipped to a visitor: test payload they would download for no benefit,
// repo bookkeeping, or a per-venture robots.txt that crawlers never read
// (only the one at the origin root counts).
// `package.json` is on the list for the same reason its lockfile already was:
// two ventures ship one, a visitor downloads none of it, and publishing it puts
// internal script names and dependency versions on a public URL for no benefit.
// The rule below this one is by extension, so `.json` alone does not catch it —
// and `.json` has to stay publishable for JSON-LD payloads and web manifests.
const EXCLUDED_FILES = new Set([
  'VENTURE.yaml', 'robots.txt', 'README.md', 'package.json', 'package-lock.json',
]);
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.cache', 'tests', '__pycache__']);
const isTestFile = (name) => /\.test\.(mjs|js|cjs|py)$/.test(name);

// Several ventures ship a browser tool *and* a CLI from the same directory
// (einvoice-preflight is both a Python package and a static page). A visitor
// downloads none of the CLI, so it is not part of the Pages payload. The rule
// is by extension rather than by directory name, because a venture is free to
// keep browser modules in `src/` too.
const NON_WEB_EXTENSIONS = new Set([
  '.py', '.toml', '.cfg', '.ini', '.lock', '.yaml', '.yml', '.sh', '.ts', '.tsx', '.md',
]);

// Files whose contents get the placeholder origin swapped for the real one.
const REWRITABLE = new Set(['.html', '.xml', '.txt', '.json', '.mjs', '.js', '.webmanifest']);

// Ordered: the first rule whose test matches wins.
const CATEGORY_RULES = [
  {
    id: 'marketplace',
    title: 'Marketplace seller tools',
    blurb: 'Price a listing, a fee change, or a program before you opt in — with your own cost of goods in the arithmetic.',
    test: (slug) => /^(amazon|ebay|etsy|shopify-fee|faire|reverb|walmart|where-to-sell)/.test(slug),
  },
  {
    id: 'trades',
    title: 'Trade & contractor bids',
    blurb: 'Bid a job the way the trade does: materials, crew hours, burden, overhead, and what the extras really cost.',
    test: (slug) => /bid-calculator$/.test(slug) || /^(janitorial|retainage|quote-margin|no-show-fee|freelance-retainer)/.test(slug),
  },
  {
    id: 'logistics',
    title: 'Logistics, freight & cloud cost',
    blurb: 'Normalise a quote, audit a bill, or size a transfer window before you sign for it.',
    test: (slug) => /^(3pl|freight|cut-list|cloud-egress|egress-window)/.test(slug),
  },
  {
    id: 'evidence',
    title: 'Compliance checks & evidence records',
    blurb: 'Produce a dated record of what you checked. Observations you act on — never a determination made on your behalf.',
    test: (slug) => /(evidence|preflight|drift|tracker)$/.test(slug) || /^(einvoice|backup|dns|grant|shopify-a11y|shopify-permission)/.test(slug),
  },
];

const FALLBACK_CATEGORY = {
  id: 'more',
  title: 'More free tools',
  blurb: 'Everything else that runs entirely in your browser.',
};

export function categoryFor(slug) {
  return CATEGORY_RULES.find((rule) => rule.test(slug)) ?? FALLBACK_CATEGORY;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

async function exists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Every file under `dir`, recursively. */
export async function listFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Every venture that ships a browser entry point, as
 * `{ slug, sourceDir, entryFile }` sorted by slug.
 */
export async function discoverSurfaces(venturesDir) {
  const entries = await fs.readdir(venturesDir, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || EXCLUDED_SLUGS.has(entry.name)) continue;

    const override = ENTRY_OVERRIDES[entry.name];
    const candidates = override ? [path.join(override, 'index.html')] : ENTRY_CANDIDATES;

    for (const candidate of candidates) {
      const entryPath = path.join(venturesDir, entry.name, candidate);
      if (!(await exists(entryPath))) continue;
      found.push({
        slug: entry.name,
        sourceDir: path.dirname(entryPath),
        entryFile: entryPath,
      });
      break;
    }
  }

  return found.sort((a, b) => a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const decodeEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");

// The content value is read up to the *same* quote that opened it, via a
// backreference. Accepting any quote instead (`[^"']*`) silently stops at the
// first apostrophe inside a double-quoted attribute, so "last night's archive
// shrank" reached the hub and its JSON-LD as "last night" — a card and a
// crawler description cut mid-sentence.
const metaContent = (html, attr, value) => {
  const pattern = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*content=(["'])(.*?)\\1`, 'i');
  const reversed = new RegExp(`<meta[^>]*content=(["'])(.*?)\\1[^>]*${attr}=["']${value}["']`, 'i');
  const match = html.match(pattern) ?? html.match(reversed);
  return match ? decodeEntities(match[2]).trim() : '';
};

const titleize = (slug) => slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** Trim to a whole word at or under `limit` characters. */
export function truncate(text, limit = 180) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : limit).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * The card copy for one surface. Prefers the venture's own og:title, because a
 * `<title>` is written for a search result page ("Janitorial Bid Calculator |
 * Commercial Cleaning Price Per Month") and reads badly in a card grid.
 */
export function readMeta(html, slug) {
  const rawTitle = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const ogTitle = metaContent(html, 'property', 'og:title');
  const title =
    ogTitle || (rawTitle ? decodeEntities(rawTitle.split('|')[0]).trim() : '') || titleize(slug);

  const description =
    metaContent(html, 'name', 'description') || metaContent(html, 'property', 'og:description') || '';

  return { title, description: truncate(description) };
}

async function countPages(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.html')).length;
}

/**
 * Every `.html` file published under `dir`, as paths relative to it.
 *
 * This reads the built output rather than the sources, so it sees exactly what
 * a visitor can reach — after exclusions, after nested directories, after any
 * page a venture added without telling anyone.
 */
export async function publishedPages(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      pages.push(...(await publishedPages(path.join(dir, entry.name), relative)));
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== '404.html') {
      pages.push(relative);
    }
  }

  return pages.sort();
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function rewriteOrigin(contents, baseUrl) {
  return contents.split(PLACEHOLDER_ORIGIN).join(baseUrl);
}

export function isPublishable(name) {
  if (EXCLUDED_FILES.has(name) || isTestFile(name)) return false;
  return !NON_WEB_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Recursively copy `from` into `to`, dropping test payload and repo bookkeeping. */
export async function copyTree(from, to, baseUrl) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  const copied = [];

  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const nested = await copyTree(src, dest, baseUrl);
      // A directory that held only CLI source leaves an empty shell behind.
      if (nested.length === 0) await fs.rm(dest, { recursive: true, force: true });
      copied.push(...nested);
      continue;
    }
    if (!entry.isFile() || !isPublishable(entry.name)) continue;

    if (REWRITABLE.has(path.extname(entry.name))) {
      const contents = await fs.readFile(src, 'utf8');
      await fs.writeFile(dest, rewriteOrigin(contents, baseUrl));
    } else {
      await fs.copyFile(src, dest);
    }
    copied.push(dest);
  }

  return copied;
}

// ---------------------------------------------------------------------------
// Link repair
// ---------------------------------------------------------------------------

export const SOURCE_URL_PREFIX = 'https://github.com/Duncan-Haywood/monorepo-projects/blob/main/';

/**
 * Every venture page was written assuming its own directory was the site root,
 * so several link out to files that sit beside the venture rather than inside
 * it (`../README.md`, `../LICENSE`) or to files this build deliberately does
 * not publish (CLI source). Under one shared origin those become 404s.
 *
 * Rather than edit another venture's product code, point each such link at the
 * file in the public repository, where it still renders and still answers the
 * question the link was there to answer. Links that resolve inside the site are
 * left exactly as written.
 */
export async function repairLinks({ publishedDir, sourceDir, repoRoot, outDir }) {
  const htmlFiles = (await listFiles(publishedDir)).filter((f) => f.endsWith('.html'));
  const repaired = [];

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, 'utf8');
    // The published file mirrors the source tree, so the same relative path
    // from `sourceDir` locates the original the link was written against.
    const sourceOfFile = path.join(sourceDir, path.relative(publishedDir, file));
    let changed = false;

    const next = html.replace(/((?:href|src)=")([^"]+)(")/g, (whole, open, ref, close) => {
      if (/^(https?:|mailto:|data:|#|\/\/)/.test(ref) || ref === '') return whole;

      const [pathPart] = ref.split(/[#?]/);
      if (!pathPart) return whole;

      const resolvedInSite = path.resolve(path.dirname(file), pathPart);
      const target = pathPart.endsWith('/') ? path.join(resolvedInSite, 'index.html') : resolvedInSite;
      const insideSite = target === outDir || target.startsWith(`${outDir}${path.sep}`);
      if (insideSite && existsSync(target)) return whole;

      const inRepo = path.resolve(path.dirname(sourceOfFile), pathPart);
      if (!inRepo.startsWith(`${repoRoot}${path.sep}`) || !existsSync(inRepo)) return whole;

      changed = true;
      repaired.push({ file: path.relative(outDir, file), from: ref });
      return `${open}${SOURCE_URL_PREFIX}${path.relative(repoRoot, inRepo).split(path.sep).join('/')}${close}`;
    });

    if (changed) await fs.writeFile(file, next);
  }

  return repaired;
}

// ---------------------------------------------------------------------------
// Hub page
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// A `<script>` element's contents are not HTML-escaped by the parser, so a
// venture whose title happened to contain `</script>` would close the block
// early and the remainder would land in the document as markup. Escaping the
// angle brackets as JSON unicode escapes keeps the value identical to a parser
// while making that impossible.
const jsonLd = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const DISCLAIMER_HTML = `
      <h2>No warranty</h2>
      <p>
        These tools are provided free and as-is, without warranty of any kind,
        express or implied. They are not legal, tax, financial, or engineering
        advice, and they do not replace a qualified professional.
        <strong>You are responsible for reviewing and verifying any output
        before relying on it</strong>, and for meeting any obligation it helps
        you prepare for. To the maximum extent permitted by law, the authors
        accept no liability for any loss or damage arising from their use.
      </p>
      <h2>Best-effort hosting, no SLA</h2>
      <p>
        These tools are free and experimental, and may be slow, broken, moved,
        or taken offline without notice. We do not promise uptime, backups of
        anything you type, or that a URL will keep working. Do not use them as
        a system of record. If a tool needs to survive, export your inputs —
        every one of them is open source and runs from a local file.
      </p>
      <h2>Privacy</h2>
      <p>
        Everything runs in your browser. What you type is never uploaded: there
        is no account system, no tracking cookie, no analytics vendor, and no
        server that could receive it. We count anonymous, aggregate events —
        which tools get opened, never anything about who opened them — and that
        count stays in your own browser's local storage. Browsers sending
        <em>Do&nbsp;Not&nbsp;Track</em> or <em>Global Privacy Control</em> are
        not counted at all.
      </p>`;

export function renderHub(surfaces, baseUrl) {
  const groups = [...CATEGORY_RULES, FALLBACK_CATEGORY]
    .map((category) => ({
      category,
      items: surfaces.filter((s) => categoryFor(s.slug).id === category.id),
    }))
    .filter((group) => group.items.length > 0);

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Free calculators and checks for people who run a small business',
    url: baseUrl,
    description:
      'Free, private, browser-only calculators for marketplace sellers, trade contractors, logistics buyers, and small teams preparing compliance evidence.',
    isPartOf: { '@type': 'WebSite', name: 'Free small-business calculators', url: baseUrl },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: surfaces.length,
      itemListElement: surfaces.map((surface, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: surface.title,
        description: surface.description,
        url: `${baseUrl}${surface.slug}/`,
      })),
    },
  };

  const sections = groups
    .map(
      ({ category, items }) => `
      <section class="group" data-group="${category.id}">
        <h2>${escapeHtml(category.title)}</h2>
        <p class="group-blurb">${escapeHtml(category.blurb)}</p>
        <ul class="cards">
${items
  .map(
    (surface) => `          <li class="card" data-search="${escapeHtml(
      `${surface.title} ${surface.description} ${surface.slug}`.toLowerCase(),
    )}">
            <a href="${escapeHtml(surface.slug)}/" data-tool="${escapeHtml(surface.slug)}">
              <h3>${escapeHtml(surface.title)}</h3>
            </a>
            <p>${escapeHtml(surface.description)}</p>
            ${
              surface.pageCount > 1
                ? `<p class="meta">${surface.pageCount} question${surface.pageCount === 1 ? '' : 's'} answered</p>`
                : ''
            }
          </li>`,
  )
  .join('\n')}
        </ul>
      </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Free Small-Business Calculators | Marketplace Fees, Trade Bids, Freight &amp; Compliance</title>
  <meta name="description" content="${escapeHtml(
    `${surfaces.length} free, private calculators for marketplace sellers, trade contractors, logistics buyers, and small teams. Everything runs in your browser — nothing you type is uploaded.`,
  )}">
  <link rel="canonical" href="${escapeHtml(baseUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Free small-business calculators">
  <meta property="og:description" content="Price a listing, bid a job, audit a freight bill, or produce a compliance record — free, and entirely in your browser.">
  <meta property="og:url" content="${escapeHtml(baseUrl)}">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #eef2f7; --panel: #ffffff; --ink: #1d2530; --muted: #4a5666;
      --line: #d3dce6; --accent: #12594a; --accent-ink: #f2f8f5;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #10151c; --panel: #171e27; --ink: #e8eef5; --muted: #a2b0c0;
              --line: #2a343f; --accent: #7fd8c0; --accent-ink: #0d1319; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 34px 18px 60px; }
    header { max-width: 720px; margin-bottom: 26px; }
    .eyebrow { font-size: .78rem; font-weight: 700; letter-spacing: .09em;
               text-transform: uppercase; color: var(--accent); margin: 0 0 8px; }
    h1 { font-size: clamp(2rem, 6vw, 3.3rem); line-height: 1.02; letter-spacing: -.045em; margin: 0 0 14px; }
    .lede { font-size: 1.06rem; line-height: 1.55; color: var(--muted); margin: 0 0 6px; }
    .search { margin: 26px 0 8px; }
    .search label { display: block; font-size: .87rem; font-weight: 650; margin-bottom: 6px; }
    .search input { width: 100%; max-width: 520px; padding: 12px 14px; font: inherit;
                    border: 1px solid var(--line); border-radius: 9px;
                    background: var(--panel); color: var(--ink); }
    .count { font-size: .85rem; color: var(--muted); margin: 8px 0 0; }
    .group { margin-top: 38px; }
    .group h2 { font-size: 1.3rem; margin: 0 0 4px; letter-spacing: -.02em; }
    .group-blurb { color: var(--muted); margin: 0 0 16px; font-size: .95rem; line-height: 1.5; }
    .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px;
             grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
            padding: 17px 18px; }
    .card h3 { margin: 0 0 7px; font-size: 1.03rem; line-height: 1.25; }
    .card a { color: inherit; text-decoration: none; }
    .card a:hover h3, .card a:focus-visible h3 { color: var(--accent); text-decoration: underline; }
    .card p { margin: 0; font-size: .89rem; line-height: 1.5; color: var(--muted); }
    .card .meta { margin-top: 9px; font-size: .78rem; font-weight: 650; color: var(--accent); }
    .empty { display: none; color: var(--muted); font-style: italic; margin-top: 30px; }
    footer { margin-top: 52px; border-top: 1px solid var(--line); padding-top: 24px;
             font-size: .87rem; line-height: 1.6; color: var(--muted); }
    footer h2 { font-size: .95rem; color: var(--ink); margin: 20px 0 6px; }
    footer a { color: var(--accent); }
    .support { background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
               padding: 15px 18px; margin-top: 26px; }
    .optout { margin-top: 18px; font-size: .84rem; }
    .offline p { margin: 8px 0 12px; font-size: .9rem; line-height: 1.5; color: var(--muted); }
    .offline button { font: inherit; font-weight: 650; padding: 10px 16px; border-radius: 9px;
                      border: 1px solid var(--accent); background: var(--accent);
                      color: var(--accent-ink); cursor: pointer; }
    .offline button[disabled] { opacity: .6; cursor: progress; }
    .offline #offline-status:empty { display: none; }
    .offline #offline-status { margin: 10px 0 0; font-size: .85rem; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <p class="eyebrow">Free &amp; private</p>
      <h1>Calculators for the decisions that cost real money</h1>
      <p class="lede">
        ${surfaces.length} free tools for marketplace sellers, trade contractors,
        logistics buyers, and small teams. Each one answers a specific question
        with your own numbers — the fee, the bid, the bill, the record.
      </p>
      <p class="lede">
        Everything runs in your browser. Nothing you type is uploaded, and there
        is no signup, no trial, and no paid tier.
      </p>
    </header>

    <div class="search">
      <label for="q">Search these tools</label>
      <input id="q" type="search" placeholder="eBay fees, tile backsplash, freight, VAT…"
             autocomplete="off" spellcheck="false">
      <p class="count" id="count"></p>
    </div>

${sections}

    <p class="empty" id="empty">No tool matches that. Try a marketplace, a trade, or the thing you are pricing.</p>

${OFFLINE_WIDGET_HTML}

    <div class="support">
      <strong>Free, and staying free.</strong> If one of these saved you money,
      <a href="https://github.com/sponsors/Duncan-Haywood">sponsoring on GitHub</a>
      is welcome and entirely optional — nothing here is gated behind it, and
      declining changes nothing about what the tools do.
    </div>

    <footer>
${DISCLAIMER_HTML}
      <p class="optout">
        <label><input type="checkbox" id="optout"> Don't count my visit</label>
      </p>
      <p>
        Open source — every tool is a static page, and one you have opened keeps
        working with no connection.
      </p>
    </footer>
  </div>

  <script type="module">
    // Search filters the already-rendered list, so the page is fully usable
    // with JavaScript off: without it every tool is simply visible.
    const q = document.getElementById('q');
    const count = document.getElementById('count');
    const empty = document.getElementById('empty');
    const cards = [...document.querySelectorAll('.card')];
    const groups = [...document.querySelectorAll('.group')];
    const total = cards.length;

    function filter() {
      const needle = q.value.trim().toLowerCase();
      let shown = 0;
      for (const card of cards) {
        const hit = !needle || card.dataset.search.includes(needle);
        card.hidden = !hit;
        if (hit) shown += 1;
      }
      for (const group of groups) {
        group.hidden = ![...group.querySelectorAll('.card')].some((c) => !c.hidden);
      }
      empty.style.display = shown === 0 ? 'block' : 'none';
      count.textContent = needle ? shown + ' of ' + total + ' tools' : total + ' tools';
    }
    q.addEventListener('input', filter);
    filter();

    // Anonymous, aggregate, local-only counting — same convention every tool
    // in this portfolio uses. It records that a hub visit happened and which
    // tool slugs were opened. It never records who, and it never leaves the
    // device.
    const KEY = 'portfolio-hub-usage';
    const OPT_OUT = 'portfolio-hub-optout';
    const optout = document.getElementById('optout');

    function honorsBrowserSignal() {
      try {
        return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
      } catch { return false; }
    }
    function optedOut() {
      try { return localStorage.getItem(OPT_OUT) === '1'; } catch { return true; }
    }
    function record(event) {
      if (optedOut() || honorsBrowserSignal()) return;
      try {
        const current = JSON.parse(localStorage.getItem(KEY) || '{}');
        current[event] = (current[event] || 0) + 1;
        current.last_day = new Date().toISOString().slice(0, 10);
        localStorage.setItem(KEY, JSON.stringify(current));
      } catch { /* private mode, storage disabled — counting is not worth an error */ }
    }

    try { optout.checked = optedOut(); } catch { /* ignore */ }
    optout.addEventListener('change', () => {
      try { localStorage.setItem(OPT_OUT, optout.checked ? '1' : '0'); } catch { /* ignore */ }
    });

    record('hub_visited');
    for (const link of document.querySelectorAll('[data-tool]')) {
      link.addEventListener('click', () => record('tool_opened:' + link.dataset.tool));
    }
${OFFLINE_WIDGET_SCRIPT}
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Site chrome
// ---------------------------------------------------------------------------

// Every venture page was written as a standalone site, so none of them links to
// any other. Under one origin that makes 33 tools into 33 dead ends: a visitor
// who arrives from a search result at `does-subscribe-and-save-still-pay.html`
// can see one calculator and has no route to the other 32 — not to the hub, not
// to the sibling tool that answers their next question. The hub links down; up
// to now nothing linked back or across.
//
// The chrome is injected at build time rather than written into each venture,
// for two reasons. A calculator lands on `main` most days and the injection
// covers each new one for free. And venture pages are edited concurrently by
// other sessions, so a nav bar committed into 150 product files would conflict
// with nearly every open branch.
const CHROME_MARKER = 'pf-chrome';

/**
 * How a page says it carries no availability promise, in any of the wordings
 * the ventures actually use. Deliberately loose: several write the clause in
 * their own voice ("Hosted URLs, when they exist, carry no availability SLA"),
 * and a page that already says it must not be given a second notice.
 */
export const NO_SLA_PATTERN =
  /best-effort hosting|no (availability )?sla|carry no availability|taken offline without notice/i;

/**
 * The availability clause, injected into any published page that lacks one.
 *
 * PRODUCT_PLAYBOOK.md 5b requires it on every hosted surface, and a test has
 * enforced that since #1731 — but it can only fail *after* the venture is on
 * `main`, and three ventures shipped without the clause and turned `main` red
 * in a single day (#1747 for two, and sewer-line-replace after them). That is
 * not carelessness: a calculator is written as a standalone page, months
 * before anyone decides it will be hosted, so nothing in front of its author
 * says an availability promise is now implied.
 *
 * Injecting it where it is missing makes the requirement hold by construction
 * for every tool including the one that lands tomorrow, the same way the
 * canonical below is injected only where absent.
 *
 * Only the *hosting* clause is injected, never the no-warranty one. This build
 * decides how these pages are hosted, so the availability promise is its
 * statement to make; what a tool is not advice *about* is the venture's own
 * ("not landscaping, construction, legal, tax, or financial advice"), and
 * generic prose there would be worse than what each venture already writes.
 */
const NO_SLA_CLAUSE =
  '<p class="pf-sla"><strong>Best-effort hosting, no SLA.</strong> These tools are free and ' +
  'experimental, and may be slow, broken, moved, or taken offline without notice. We do not ' +
  'promise uptime, or that a URL will keep working. Do not use this as a system of record.</p>';

// Scoped under `.pf-chrome` so it cannot restyle a venture's own page, and
// declared with fallbacks rather than inherited variables because each venture
// names its theme variables differently.
// The chrome takes its colours from the host page, not from the operating
// system, and that is the one non-obvious thing about this block.
//
// It used to paint an opaque band from its own palette behind
// `prefers-color-scheme`. Internally that is perfectly legible — the band sets
// both its background and its text, so the contrast within it is fine. The
// problem is what it sits on. Most ventures in this portfolio are deliberately
// light-only: they carry no `prefers-color-scheme` rule at all, so their page
// stays cream whatever the OS says. A visitor with a dark OS therefore got a
// near-black slab bolted to the bottom of a light page — readable, and
// unmistakably broken-looking. On a phone at night, which is a lot of this
// audience, that slab was the last thing they saw before deciding whether the
// site was worth trusting with a bid.
//
// So: `color:inherit` for text, and a neutral mid-grey at low alpha for lines
// and fills, which reads as a subtle tint over a light or a dark background
// without the chrome needing to know which one it is. Links are underlined
// rather than tinted, because no single accent is legible on all 42 pages.
// A venture with its own dark mode still gets dark chrome — it inherits it,
// which is the point.
//
// (`favicon.ico` is the deliberate exception elsewhere in this file: the
// browser draws it onto its own furniture, so there is no host page for it to
// inherit from.)
const CHROME_STYLE = `<style id="pf-chrome-style">
.pf-chrome{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.9rem;line-height:1.5;
  color:inherit;--pf-line:rgba(128,128,128,.34);--pf-fill:rgba(128,128,128,.07)}
.pf-chrome a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.pf-chrome-top{border-bottom:1px solid var(--pf-line);background:var(--pf-fill);padding:9px 16px}
.pf-chrome-top a{font-weight:650;text-decoration:none}
.pf-chrome-top a:hover,.pf-chrome-top a:focus-visible{text-decoration:underline}
.pf-chrome-foot{border-top:1px solid var(--pf-line);background:var(--pf-fill);margin-top:40px;padding:22px 16px 26px}
.pf-chrome-foot .pf-inner{max-width:1080px;margin:0 auto}
.pf-chrome-foot h2{font-size:1rem;margin:0 0 4px;color:inherit}
.pf-chrome-foot p{margin:0 0 12px;opacity:.78}
.pf-chrome-foot ul{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px 18px;
  grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pf-chrome-foot li{margin:0}
.pf-chrome :focus-visible{outline:2px solid currentColor;outline-offset:2px}
</style>`;

// The same anonymous, local-only convention the hub uses: which tool slugs were
// opened, never who opened them, never leaving the device, and silent for a
// browser asking not to be counted. Until this shipped the only page that
// counted anything was the hub, so a visitor arriving from search at a deep SEO
// page was invisible — which is most of the traffic these pages are written for.
const CHROME_SCRIPT = (slug) => `<script>
(function(){
  try{
    if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
    if(localStorage.getItem('portfolio-hub-optout')==='1')return;
    var k='portfolio-hub-usage';
    var bump=function(event){
      try{
        var c=JSON.parse(localStorage.getItem(k)||'{}');
        c[event]=(c[event]||0)+1;
        c.last_day=new Date().toISOString().slice(0,10);
        localStorage.setItem(k,JSON.stringify(c));
      }catch(e){}
    };
    bump('tool_viewed:${slug}');
    document.addEventListener('click',function(e){
      var a=e.target&&e.target.closest&&e.target.closest('[data-pf-to]');
      if(a)bump('cross_tool_click:'+a.getAttribute('data-pf-to'));
    });
  }catch(e){}
})();
</script>`;

/** How many `../` segments reach the site root from a published file. */
export function upToRoot(relativePath) {
  const depth = relativePath.split(/[\\/]/).length - 1;
  return depth === 0 ? './' : '../'.repeat(depth);
}

/**
 * Up to `limit` other tools to offer at the foot of `slug`'s pages: same
 * category first, then the rest of the site. Rotating the list by the tool's
 * own position means neighbouring tools do not all advertise the same four,
 * while keeping the choice deterministic — the build has to be reproducible.
 */
export function relatedTools(surfaces, slug, limit = 4) {
  const others = surfaces.filter((surface) => surface.slug !== slug);
  if (others.length === 0) return [];

  const category = categoryFor(slug).id;
  const sameCategory = others.filter((surface) => categoryFor(surface.slug).id === category);
  const rest = others.filter((surface) => categoryFor(surface.slug).id !== category);

  const rotate = (list) => {
    if (list.length === 0) return list;
    const offset = surfaces.findIndex((surface) => surface.slug === slug) % list.length;
    return [...list.slice(offset), ...list.slice(0, offset)];
  };

  return [...rotate(sameCategory), ...rotate(rest)].slice(0, limit);
}

/**
 * Wrap one already-published page in the site's navigation. Returns the html
 * unchanged when there is no `<body>` to attach to, or when the page has been
 * wrapped already — the pass has to be safe to run twice.
 */
export function injectChrome(html, { slug, toRoot, total, related = [], canonical, isEntry, title }) {
  if (html.includes(CHROME_MARKER)) return html;
  const bodyOpen = html.match(/<body[^>]*>/i);
  if (!bodyOpen || !/<\/body>/i.test(html)) return html;

  // Two head tags that only became possible once these pages shared an origin.
  // Both are added only where the venture does not already provide its own — a
  // second canonical is worse than none, because the crawler then picks one
  // arbitrarily.
  let headExtras = '';
  if (canonical && !/<link[^>]+rel=["']canonical["']/i.test(html)) {
    // Under one origin every page is reachable at both `/tool/page.html` and,
    // for an index, `/tool/` — which splits the ranking of a page already
    // competing for one narrow search term. Ventures written as standalone
    // sites had no origin to point a canonical at, so many carry none.
    headExtras += `\n<link rel="canonical" href="${escapeHtml(canonical)}">`;
  }
  if (isEntry && canonical && !html.includes('"BreadcrumbList"')) {
    // Lets a result render as "Free small-business calculators › eBay Fee
    // Calculator" rather than a bare URL, and tells an answer engine these are
    // one collection rather than 42 unrelated pages. Entry pages only: a deep
    // SEO page inside a tool is not a third level of the site, and saying it is
    // would describe a hierarchy that does not exist.
    headExtras += `\n<script type="application/ld+json">${jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Free small-business calculators',
          item: canonical.slice(0, canonical.length - `${slug}/`.length),
        },
        { '@type': 'ListItem', position: 2, name: title || slug, item: canonical },
      ],
    })}</script>`;
  }
  if (headExtras) {
    html = /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, `${headExtras}\n</head>`)
      : html.replace(bodyOpen[0], `${headExtras}\n${bodyOpen[0]}`);
  }

  const hub = `${toRoot}`;
  const topBar = `<nav class="pf-chrome pf-chrome-top" aria-label="Site">
  <a href="${escapeHtml(hub)}" data-pf-to="hub">← All ${total} free tools</a>
</nav>`;

  const links = related
    .map(
      (surface) =>
        `      <li><a href="${escapeHtml(`${toRoot}${surface.slug}/`)}" data-pf-to="${escapeHtml(
          surface.slug,
        )}">${escapeHtml(surface.title)}</a></li>`,
    )
    .join('\n');

  // Tested against the venture's own markup, before any chrome is added.
  const noSla = NO_SLA_PATTERN.test(html) ? '' : `    ${NO_SLA_CLAUSE}\n`;

  const footer = `<aside class="pf-chrome pf-chrome-foot" aria-label="More free tools">
  <div class="pf-inner">
    <h2>More free tools</h2>
    <p>Free and private, like this one — everything runs in your browser, and nothing you type is uploaded.</p>
${noSla}${links ? `    <ul>\n${links}\n    </ul>\n` : ''}    <p>
      <a href="${escapeHtml(hub)}" data-pf-to="hub">Browse all ${total} free tools →</a>
      &nbsp;·&nbsp;
      <a href="https://github.com/sponsors/Duncan-Haywood">Sponsoring on GitHub</a>
      is optional and changes nothing about what these tools do.
    </p>
  </div>
</aside>
${CHROME_SCRIPT(slug)}`;

  const withStyle = html.replace(/<\/head>/i, `${CHROME_STYLE}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === html ? `${CHROME_STYLE}\n` : '';

  return withStyle
    .replace(bodyOpen[0], `${bodyOpen[0]}\n${stylePrefix}${topBar}`)
    .replace(/<\/body>/i, `${footer}\n</body>`);
}

/**
 * Adds the navigation to every published venture page. Runs after the hub is
 * written, because `repairLinks` treats a link to a file that does not exist yet
 * as one that escapes the site and repoints it at GitHub — which is exactly what
 * would happen to a `../` hub link injected any earlier.
 */
export async function addSiteChrome({ outDir, surfaces, baseUrl = DEFAULT_BASE_URL }) {
  const wrapped = [];

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    if (!(await exists(dir))) continue;
    const related = relatedTools(surfaces, surface.slug);

    for (const file of (await listFiles(dir)).filter((f) => f.endsWith('.html'))) {
      const relative = path.relative(outDir, file);
      const url = relative.split(path.sep).join('/');
      const html = await fs.readFile(file, 'utf8');
      const next = injectChrome(html, {
        slug: surface.slug,
        toRoot: upToRoot(relative),
        total: surfaces.length,
        related,
        title: surface.title,
        // `/tool/index.html` and `/tool/` are the same page; the directory form
        // is the one to declare.
        canonical: `${baseUrl}${url.replace(/(^|\/)index\.html$/, '$1')}`,
        isEntry: url === `${surface.slug}/index.html`,
      });
      if (next === html) continue;
      await fs.writeFile(file, next);
      wrapped.push(relative);
    }
  }

  return wrapped;
}

export function renderRobots(baseUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}sitemap.xml\n`;
}

/**
 * The sitemap `robots.txt` names. A `<sitemapindex>` cannot hold `<url>`
 * entries, so the hub page itself lives in `sitemap-hub.xml`, which this index
 * also lists — otherwise a crawler following robots.txt would reach the
 * ventures and never the front page.
 *
 * Every published venture gets a generated sitemap (see `renderVentureSitemap`),
 * so there is no venture the index can leave out.
 */
export function renderSitemapIndex(surfaces, baseUrl) {
  const entries = [`  <sitemap><loc>${baseUrl}sitemap-hub.xml</loc></sitemap>`].concat(
    surfaces.map(
      (surface) => `  <sitemap><loc>${baseUrl}${surface.slug}/sitemap.xml</loc></sitemap>`,
    ),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>
`;
}

export function renderHubSitemap(baseUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}</loc></url>
</urlset>
`;
}

/**
 * The URL a published page is served at, relative to the site root.
 * `index.html` is served as its directory, so it is listed that way.
 */
export function pageUrlPath(slug, relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  if (posix === 'index.html') return `${slug}/`;
  if (posix.endsWith('/index.html')) return `${slug}/${posix.slice(0, -'index.html'.length)}`;
  return `${slug}/${posix}`;
}

/**
 * A venture's sitemap, generated from the pages the build actually published.
 *
 * The ventures ship their own hand-written `sitemap.xml` files, and copying
 * those verbatim published two defects at once. They go stale — a venture
 * grows a landing page and nobody edits the sitemap, so 70 of the 186 pages
 * on this site were in no sitemap at all. And several were written against
 * `…/monorepo-projects/ventures/<slug>/`, a path this site does not serve
 * (products are mounted at `/<slug>/`), so every URL they advertised was a
 * 404 — the worst possible thing to hand a crawler, since organic search is
 * how these tools are meant to be found.
 *
 * Generating from the output makes both impossible by construction: a page is
 * listed because it shipped, at the URL it actually shipped to.
 */
export function renderVentureSitemap(slug, relativePages, baseUrl) {
  const urls = relativePages
    .map((relative) => `${baseUrl}${pageUrlPath(slug, relative)}`)
    .sort()
    .map((url) => `  <url><loc>${url}</loc></url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

export function renderNotFound(baseUrl) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Not found</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 12vh auto;
           padding: 0 1.2rem; line-height: 1.6; color: #1d2530; background: #eef2f7; }
    a { color: #12594a; }
    @media (prefers-color-scheme: dark) {
      body { color: #e8eef5; background: #10151c; } a { color: #7fd8c0; }
    }
  </style>
</head>
<body>
  <h1>That page isn't here</h1>
  <p>The tool may have moved, or the link may be mistyped.</p>
  <p><a href="${escapeHtml(baseUrl)}">See every free calculator →</a></p>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Offline support
// ---------------------------------------------------------------------------

/** Files a visitor asking to "save all tools" needs: each tool's entry page and
 *  the modules and styles that page loads. Not the whole tree — the SEO
 *  articles and sitemaps are not what someone with no signal is reaching for,
 *  and this runs on a phone's data. */
const BUNDLE_EXTENSIONS = new Set(['.mjs', '.js', '.css']);

export async function collectOfflineBundle(outDir, surfaces) {
  const assets = new Set(['./', 'index.html', 'offline.html', 'manifest.webmanifest']);

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    // copyTree publishes the directory holding the entry point as `slug/`, so
    // the tool's front page is always exactly here.
    const entry = path.join(dir, 'index.html');
    const rel = (file) => path.relative(outDir, file).split(path.sep).join('/');
    if (existsSync(entry)) {
      assets.add(rel(entry));
      // A visitor can arrive at either form; a cache entry under one does not
      // answer a request for the other.
      assets.add(`${surface.slug}/`);
    }

    for (const file of await listFiles(dir)) {
      if (BUNDLE_EXTENSIONS.has(path.extname(file))) assets.add(rel(file));
    }
  }

  return [...assets].sort();
}

/**
 * Emits the worker, the manifest, the icons and the offline fallback, then
 * wires every published page to them.
 *
 * The cache name carries a hash of what was built, which is what makes the
 * worker's cache-first strategy safe: a deploy lands in a new cache and the old
 * one is deleted on activation, so a visitor is never served a mix of two
 * builds and is at most one navigation behind.
 */
export async function addOfflineSupport({
  outDir,
  base,
  surfaces,
  disableWorker = false,
  // The worker, the head injection and the offline page are all produced from
  // this module, and none of them are on disk when the hash is taken. Without
  // this, changing the worker's own logic would leave the cache name identical,
  // old caches undeleted, and visitors served the previous behaviour from cache
  // forever. Hashing the generator closes that.
  codeVersion,
} = {}) {
  const bundle = await collectOfflineBundle(outDir, surfaces);

  const hash = crypto.createHash('sha256');
  hash.update(codeVersion ?? (await fs.readFile(path.join(HERE, 'offline.mjs'))));
  for (const file of (await listFiles(outDir)).sort()) {
    hash.update(path.relative(outDir, file));
    hash.update(await fs.readFile(file));
  }
  const cacheName = `portfolio-${hash.digest('hex').slice(0, 12)}`;

  await fs.writeFile(path.join(outDir, 'offline.html'), renderOfflinePage(base));
  await fs.writeFile(path.join(outDir, 'manifest.webmanifest'), renderManifest(base, surfaces.length));
  for (const icon of ICONS) {
    await fs.writeFile(
      path.join(outDir, icon.file),
      renderIcon({ size: icon.size, maskable: Boolean(icon.maskable) }),
    );
  }
  await fs.writeFile(
    path.join(outDir, 'sw.js'),
    disableWorker
      ? renderKillSwitchWorker()
      : renderServiceWorker({
        cacheName,
        // Enough for the front door to open with no signal on a device that has
        // been here once. Everything else is cached as it is visited.
        shell: ['./', 'index.html', 'offline.html', 'manifest.webmanifest', 'icon-192.png'],
        bundle,
      }),
  );

  let injected = 0;
  for (const file of await listFiles(outDir)) {
    if (!file.endsWith('.html')) continue;
    const depth = path.relative(outDir, file).split(path.sep).length - 1;
    const result = injectOfflineSupport(await fs.readFile(file, 'utf8'), '../'.repeat(depth));
    if (!result.injected) continue;
    await fs.writeFile(file, result.html);
    injected += 1;
  }

  return { cacheName, bundle, injected };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildSite({
  venturesDir = path.join(REPO_ROOT, 'ventures'),
  outDir = path.join(REPO_ROOT, 'platform', 'pages', 'dist'),
  baseUrl = DEFAULT_BASE_URL,
  log = () => {},
  // The rollback lever for a worker already on visitors' devices; see
  // renderKillSwitchWorker.
  disableWorker = false,
} = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const discovered = await discoverSurfaces(venturesDir);
  const surfaces = [];
  const repairs = [];

  for (const surface of discovered) {
    const html = await fs.readFile(surface.entryFile, 'utf8');
    const { title, description } = readMeta(html, surface.slug);
    const destination = path.join(outDir, surface.slug);

    await copyTree(surface.sourceDir, destination, base);
    repairs.push(
      ...(await repairLinks({
        publishedDir: destination,
        sourceDir: surface.sourceDir,
        repoRoot: REPO_ROOT,
        outDir,
      })),
    );

    // Overwrite whatever sitemap the venture shipped with one generated from
    // what actually published. See `renderVentureSitemap` for why.
    const pages = await publishedPages(destination);
    await fs.writeFile(
      path.join(destination, 'sitemap.xml'),
      renderVentureSitemap(surface.slug, pages, base),
    );

    surfaces.push({
      ...surface,
      title,
      description,
      pageCount: await countPages(surface.sourceDir),
      publishedPageCount: pages.length,
    });
    log(`  ${surface.slug}`);
  }

  await fs.writeFile(path.join(outDir, 'index.html'), renderHub(surfaces, base));
  await fs.writeFile(path.join(outDir, 'robots.txt'), renderRobots(base));
  await fs.writeFile(path.join(outDir, '404.html'), renderNotFound(base));

  await fs.writeFile(path.join(outDir, 'sitemap.xml'), renderSitemapIndex(surfaces, base));
  await fs.writeFile(path.join(outDir, 'sitemap-hub.xml'), renderHubSitemap(base));

  await fs.writeFile(path.join(outDir, 'favicon.ico'), renderFavicon());

  // Tell Jekyll (which GitHub Pages runs by default) to leave the tree alone;
  // without this, any directory starting with `_` is silently dropped.
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');

  const wrapped = await addSiteChrome({ outDir, surfaces, baseUrl: base });

  // After the chrome pass, not before: the offline layer hashes the finished
  // site to name its cache, and injects into pages the chrome has already
  // rewritten. Reversed, every deploy would cache a page missing its nav.
  const offline = await addOfflineSupport({ outDir, base, surfaces, disableWorker });

  return { outDir, baseUrl: base, surfaces, repairs, wrapped, offline };
}

// ---------------------------------------------------------------------------
// Favicon
// ---------------------------------------------------------------------------

/**
 * Every browser requests `/favicon.ico` on its own, for every page, whether or
 * not the markup asks for one -- so without this file all 183 published pages
 * log a 404 on load and open as an anonymous blank tab. The ventures' own
 * pages cannot be asked to link an icon (there are 183 of them and they are
 * the ventures' files, not this build's), and only `.ico` at the origin root
 * is fetched automatically, so the icon has to be generated here.
 *
 * Built rather than committed so the tree stays reviewable text: a 16x16 PNG
 * assembled by hand and wrapped in a single-image ICO container. Deterministic
 * -- same bytes on every run.
 */
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

let CRC_TABLE = null;
function crc32(buffer) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

export function renderFavicon() {
  const size = 16;
  const ink = [36, 61, 53]; // the hub's accent green, so the tab matches the site
  const mark = [197, 237, 181];

  // Three rising bars on a rounded square. Chosen after looking at it at
  // actual size: anything with a diagonal turns to mush at 16px, while flat
  // bars stay crisp and read as "numbers" rather than as a generic glyph.
  const BARS = [
    { x0: 3, x1: 4, top: 9 },
    { x0: 7, x1: 8, top: 6 },
    { x0: 11, x1: 12, top: 3 },
  ];
  const raw = [];
  for (let y = 0; y < size; y += 1) {
    raw.push(0); // PNG filter byte: none
    for (let x = 0; x < size; x += 1) {
      const corner = (x < 2 || x > 13) && (y < 2 || y > 13);
      const inBar = BARS.some((b) => x >= b.x0 && x <= b.x1 && y >= b.top && y <= 12);
      if (corner) raw.push(0, 0, 0, 0);
      else if (inBar) raw.push(...mark, 255);
      else raw.push(...ink, 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from(raw), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  // ICO container: 6-byte header, one 16-byte directory entry, then the PNG.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = size;
  entry[1] = size;
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argBase = process.argv.find((a) => a.startsWith('--base='))?.slice('--base='.length);
  const argOut = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);

  const result = await buildSite({
    baseUrl: argBase || process.env.PAGES_BASE_URL || DEFAULT_BASE_URL,
    outDir: argOut ? path.resolve(argOut) : undefined,
    disableWorker: process.env.PAGES_DISABLE_SW === '1',
    log: console.log,
  });

  console.log(`\nBuilt ${result.surfaces.length} tools into ${result.outDir}`);
  console.log(`Base URL: ${result.baseUrl}`);
  if (result.repairs.length > 0) {
    console.log(`Repointed ${result.repairs.length} off-site link(s) at the repository source.`);
  }
  console.log(`Added site navigation to ${result.wrapped.length} page(s).`);
}
