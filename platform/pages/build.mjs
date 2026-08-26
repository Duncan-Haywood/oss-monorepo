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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const EXCLUDED_FILES = new Set(['VENTURE.yaml', 'robots.txt', 'README.md', 'package-lock.json']);
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

const metaContent = (html, attr, value) => {
  const pattern = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`, 'i');
  const reversed = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`, 'i');
  const match = html.match(pattern) ?? html.match(reversed);
  return match ? decodeEntities(match[1]).trim() : '';
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
        Open source — every tool is a static page you can save and run offline.
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
  </script>
</body>
</html>
`;
}

export function renderRobots(baseUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}sitemap.xml\n`;
}

// ---------------------------------------------------------------------------
// Cross-links
// ---------------------------------------------------------------------------

// Marks a page as already carrying the footer, so a second pass over a tree
// (or a venture that somehow ships one of its own) cannot stack two of them.
const CROSSLINK_MARKER = 'data-portfolio-crosslinks';

/** How many sibling tools a page offers before falling back to the hub link. */
const MAX_SIBLINGS = 4;

/**
 * The tools to offer on `slug`'s pages: its own category first, in slug order
 * starting after itself so the set differs page to page rather than every tool
 * pointing at the same four, then other categories if the category is thin.
 *
 * A visitor who arrives from a search result lands on one calculator and, until
 * now, had no way to discover the other thirty-plus. Crawlers had the same
 * problem: every venture was an island reachable only from the hub.
 */
export function relatedSurfaces(surfaces, slug, limit = MAX_SIBLINGS) {
  const categoryId = categoryFor(slug).id;
  const sameCategory = surfaces.filter((s) => s.slug !== slug && categoryFor(s.slug).id === categoryId);

  // Rotate so each tool leads with a different neighbour.
  const start = sameCategory.findIndex((s) => s.slug > slug);
  const rotated = start === -1 ? sameCategory : [...sameCategory.slice(start), ...sameCategory.slice(0, start)];

  const picked = rotated.slice(0, limit);
  if (picked.length >= limit) return picked;

  const chosen = new Set(picked.map((s) => s.slug));
  for (const surface of surfaces) {
    if (picked.length >= limit) break;
    if (surface.slug === slug || chosen.has(surface.slug)) continue;
    picked.push(surface);
    chosen.add(surface.slug);
  }
  return picked;
}

/**
 * The footer markup. Links are relative to the file being written rather than
 * absolute, so the same output works on the Pages sub-path, on a custom domain,
 * and under `python3 -m http.server` in `dist` — none of which share a prefix.
 */
export function renderCrossLinks(related, prefix) {
  const items = related
    .map(
      (surface) =>
        `        <li><a href="${escapeHtml(prefix)}${escapeHtml(surface.slug)}/">${escapeHtml(surface.title)}</a></li>`,
    )
    .join('\n');

  return `
<nav ${CROSSLINK_MARKER} class="pf-crosslinks" aria-label="More free tools from this portfolio">
  <style>
    /* 48rem sits inside the 700–800px container most ventures use, so the
       footer lines up with the page copy instead of out-denting past it. */
    .pf-crosslinks { max-width: 48rem; margin: 56px auto 0; padding: 22px 1.2rem 34px;
      border-top: 1px solid rgba(128, 145, 165, .32); font-family: system-ui, -apple-system,
      "Segoe UI", Roboto, sans-serif; font-size: .93rem; line-height: 1.55; }
    .pf-crosslinks h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: .08em;
      margin: 0 0 10px; font-weight: 600; opacity: .72; }
    .pf-crosslinks ul { list-style: none; margin: 0; padding: 0; display: flex;
      flex-wrap: wrap; gap: 8px 10px; }
    .pf-crosslinks li { margin: 0; }
    .pf-crosslinks li a { display: inline-block; padding: 6px 11px; border-radius: 999px;
      border: 1px solid rgba(128, 145, 165, .38); text-decoration: none; }
    .pf-crosslinks li a:hover, .pf-crosslinks li a:focus-visible {
      border-color: currentColor; text-decoration: underline; }
    .pf-crosslinks .pf-all { margin: 14px 0 0; }
    @media (max-width: 34rem) { .pf-crosslinks ul { gap: 6px 8px; } }
  </style>
  <h2>More free tools</h2>
  <ul>
${items}
  </ul>
  <p class="pf-all"><a href="${escapeHtml(prefix) || './'}">See all free calculators &amp; checks &rarr;</a></p>
</nav>
`;
}

/**
 * Append the footer to every published HTML page of one venture — the SEO
 * landing pages included, since those are what a search result actually opens.
 */
export async function addCrossLinks({ publishedDir, outDir, surfaces, slug }) {
  const related = relatedSurfaces(surfaces, slug);
  if (related.length === 0) return [];

  const touched = [];
  for (const file of await listFiles(publishedDir)) {
    if (path.extname(file).toLowerCase() !== '.html') continue;

    const html = await fs.readFile(file, 'utf8');
    if (html.includes(CROSSLINK_MARKER)) continue;

    // `path.relative` yields '' for a file sitting directly in `outDir`; every
    // published page is at least one directory deep, but guard it anyway.
    const up = path.relative(path.dirname(file), outDir);
    const prefix = up === '' ? './' : `${up.split(path.sep).join('/')}/`;

    const block = renderCrossLinks(related, prefix);
    const close = html.toLowerCase().lastIndexOf('</body>');
    const next = close === -1 ? html + block : html.slice(0, close) + block + html.slice(close);

    await fs.writeFile(file, next);
    touched.push(file);
  }

  return touched;
}

/**
 * The sitemap `robots.txt` names. A `<sitemapindex>` cannot hold `<url>`
 * entries, so the hub itself and any venture without its own sitemap live in
 * `sitemap-hub.xml`, which this index also lists — otherwise a crawler
 * following robots.txt would reach the ventures and never the front page.
 */
export function renderSitemapIndex(surfaces, baseUrl) {
  const entries = [`  <sitemap><loc>${baseUrl}sitemap-hub.xml</loc></sitemap>`].concat(
    surfaces
      .filter((surface) => surface.hasSitemap)
      .map((surface) => `  <sitemap><loc>${baseUrl}${surface.slug}/sitemap.xml</loc></sitemap>`),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>
`;
}

export function renderHubSitemap(surfaces, baseUrl) {
  const urls = [`  <url><loc>${baseUrl}</loc></url>`].concat(
    surfaces
      .filter((surface) => !surface.hasSitemap)
      .map((surface) => `  <url><loc>${baseUrl}${surface.slug}/</loc></url>`),
  );
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
// Build
// ---------------------------------------------------------------------------

export async function buildSite({
  venturesDir = path.join(REPO_ROOT, 'ventures'),
  outDir = path.join(REPO_ROOT, 'platform', 'pages', 'dist'),
  baseUrl = DEFAULT_BASE_URL,
  log = () => {},
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

    surfaces.push({
      ...surface,
      title,
      description,
      pageCount: await countPages(surface.sourceDir),
      hasSitemap: await exists(path.join(destination, 'sitemap.xml')),
    });
    log(`  ${surface.slug}`);
  }

  // Second pass: the footer names sibling tools by title, so it can only be
  // written once every surface has been read.
  const crossLinked = [];
  for (const surface of surfaces) {
    crossLinked.push(
      ...(await addCrossLinks({
        publishedDir: path.join(outDir, surface.slug),
        outDir,
        surfaces,
        slug: surface.slug,
      })),
    );
  }

  await fs.writeFile(path.join(outDir, 'index.html'), renderHub(surfaces, base));
  await fs.writeFile(path.join(outDir, 'robots.txt'), renderRobots(base));
  await fs.writeFile(path.join(outDir, '404.html'), renderNotFound(base));

  await fs.writeFile(path.join(outDir, 'sitemap.xml'), renderSitemapIndex(surfaces, base));
  await fs.writeFile(path.join(outDir, 'sitemap-hub.xml'), renderHubSitemap(surfaces, base));

  // Tell Jekyll (which GitHub Pages runs by default) to leave the tree alone;
  // without this, any directory starting with `_` is silently dropped.
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');

  return { outDir, baseUrl: base, surfaces, repairs, crossLinked };
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
    log: console.log,
  });

  console.log(`\nBuilt ${result.surfaces.length} tools into ${result.outDir}`);
  console.log(`Base URL: ${result.baseUrl}`);
  if (result.repairs.length > 0) {
    console.log(`Repointed ${result.repairs.length} off-site link(s) at the repository source.`);
  }
  console.log(`Cross-linked ${result.crossLinked.length} page(s) back to the hub and their siblings.`);
}
