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

  // `description` is card copy and is trimmed to fit one. `fullDescription` is
  // what the hub's search actually indexes: 24 of 34 tools say more about
  // themselves than a card can hold, and the eBay tool says 1862 characters'
  // worth. Indexing the trimmed copy made ~90% of that tool unfindable.
  return { title, description: truncate(description), fullDescription: description };
}

/** Words too common across these tools to narrow a search. */
const SEARCH_STOPWORDS = new Set(
  ('a an and are as at be but by for from get how if in into is it its of on or so that the then ' +
   'there these they this to too was what when where which who why will with you your' ).split(' '),
);

/**
 * The searchable token set for one card.
 *
 * Kept as deduplicated tokens rather than raw prose for two reasons: the page
 * carries the whole index inline, so repeating "calculator" 34 times costs
 * bytes for nothing; and matching per token is what makes a two-word query
 * ("ebay return") work, which a substring match over prose cannot do.
 */
export function searchTokens(parts) {
  const seen = new Set();
  for (const part of parts) {
    for (const token of String(part ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (token.length < 2 || SEARCH_STOPWORDS.has(token)) continue;
      seen.add(token);
    }
  }
  return [...seen].sort().join(' ');
}

/**
 * The `<title>`/`<h1>` of every other page in a venture.
 *
 * These are the venture's SEO articles, and they are phrased as the question a
 * visitor actually types ("should I use Amazon AWD", "how much to charge to
 * install crown molding"). None of that wording appears in the tool's own meta
 * description, so without this the hub cannot answer the search that brought
 * the visitor to the portfolio in the first place.
 */
export async function collectPageTitles(sourceDir, entryFile) {
  const files = (await listFiles(sourceDir)).filter(
    (file) => file.endsWith('.html') && file !== entryFile,
  );
  const titles = [];
  for (const file of files.slice(0, 40)) {
    const html = await fs.readFile(file, 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
    const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
    titles.push(decodeEntities(title), decodeEntities(heading.replace(/<[^>]*>/g, ' ')));
  }
  return titles;
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
/**
 * Where `favicon.ico` sits relative to the origin, e.g. `/monorepo-projects/`
 * for a project site. Root-absolute rather than relative because the same href
 * is injected into pages at several depths.
 */
export function faviconHref(baseUrl) {
  return `${new URL(baseUrl).pathname.replace(/\/*$/, '/')}favicon.ico`;
}

/**
 * Point a copied page at the site's favicon.
 *
 * A browser asks the *origin* root for `/favicon.ico`, and on a project site
 * that is `github.io/favicon.ico` — outside this tree, and not ours to serve.
 * So every tool page needs the link written in. This rewrites the published
 * copy, in the same pass that already rewrites the placeholder origin; the
 * venture's own source is not touched, and a venture that declares its own icon
 * keeps it.
 */
export function injectFavicon(html, baseUrl) {
  if (/<link[^>]+rel=["'][^"']*icon/i.test(html)) return html;
  return html.replace(
    /<head(\s[^>]*)?>/i,
    (head) => `${head}\n  <link rel="icon" href="${faviconHref(baseUrl)}" sizes="32x32">`,
  );
}

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
      const rewritten = rewriteOrigin(contents, baseUrl);
      await fs.writeFile(
        dest,
        path.extname(entry.name) === '.html' ? injectFavicon(rewritten, baseUrl) : rewritten,
      );
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
      surface.searchIndex ??
        searchTokens([surface.title, surface.fullDescription ?? surface.description, surface.slug]),
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
  <link rel="icon" href="${escapeHtml(faviconHref(baseUrl))}" sizes="32x32">
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

    // Every query word must hit, so "ebay return" narrows to the eBay tool
    // instead of finding nothing because those two words are never adjacent.
    // A word matches at a token boundary, which is what makes a half-typed
    // "backspl" still find the backsplash calculator.
    const matches = (index, words, boundary) =>
      words.every((word) => (boundary ? (' ' + index).includes(' ' + word) : index.includes(word)));

    // The query is normalised exactly as the index was. It has to be: a word
    // the index never stores can never match, so keeping it would force every
    // query containing it down to zero hits — typing "2/10 net 30" would find
    // nothing because "2" was dropped at build time but not from the query.
    const STOPWORDS = new Set(${JSON.stringify([...SEARCH_STOPWORDS])});
    const normalise = (text) =>
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 2 && !STOPWORDS.has(word));

    function filter() {
      const words = normalise(q.value.trim());
      // Token-prefix first; fall back to a loose substring pass so a query that
      // would have matched before this became token-aware still matches.
      let boundary = true;
      if (words.length && !cards.some((c) => matches(c.dataset.search, words, true))) {
        boundary = false;
      }
      let shown = 0;
      for (const card of cards) {
        const hit = !words.length || matches(card.dataset.search, words, boundary);
        card.hidden = !hit;
        if (hit) shown += 1;
      }
      for (const group of groups) {
        group.hidden = ![...group.querySelectorAll('.card')].some((c) => !c.hidden);
      }
      empty.style.display = shown === 0 ? 'block' : 'none';
      count.textContent = words.length ? shown + ' of ' + total + ' tools' : total + ' tools';
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

/**
 * A 32×32 icon written straight into the ICO container as an uncompressed
 * 32-bit bitmap.
 *
 * Every browser requests `/favicon.ico` from the origin root whether or not a
 * page links one, so without this file every page on the site — the hub and all
 * 34 tools — serves a 404 and logs a console error on first paint. Emitting it
 * at the root fixes all of them at once, which matters because the tools are
 * other ventures' code and the build deliberately does not edit their markup.
 *
 * Hand-encoded rather than checked in as a binary so it stays reviewable in a
 * diff and needs no asset pipeline. The mark is a calculator: a dark rounded
 * field with a light display band and four keys.
 */
export function renderFavicon() {
  const SIZE = 32;
  const ink = [0x1c, 0x1f, 0x26]; // BGR — body
  const lit = [0xe8, 0xf0, 0xf4]; // BGR — display and keys
  const pixels = Buffer.alloc(SIZE * SIZE * 4); // BGRA, bottom-up

  const inDisplay = (x, y) => y >= 5 && y <= 11 && x >= 6 && x <= 25;
  const inKey = (x, y) => {
    const col = Math.floor((x - 6) / 5);
    const rowY = Math.floor((y - 15) / 5);
    return x >= 6 && x <= 25 && y >= 15 && y <= 26 && (x - 6) % 5 < 4 && (y - 15) % 5 < 4 && col < 4 && rowY < 3;
  };

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      // Rounded corners: drop the four 3px corner nubs so the mark reads as a
      // device rather than a square at 16px.
      const corner = (x < 3 || x > SIZE - 4) && (y < 3 || y > SIZE - 4);
      const inside = x >= 2 && x <= SIZE - 3 && y >= 2 && y <= SIZE - 3 && !corner;
      const offset = ((SIZE - 1 - y) * SIZE + x) * 4;
      if (!inside) continue; // left transparent
      const colour = inDisplay(x, y) || inKey(x, y) ? lit : ink;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 0xff;
    }
  }

  // The AND mask is required by the format even when alpha carries the
  // transparency: one bit per pixel, each row padded to 4 bytes.
  const mask = Buffer.alloc((SIZE / 8) * SIZE);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const info = Buffer.alloc(40);
  info.writeUInt32LE(40, 0); // header size
  info.writeInt32LE(SIZE, 4);
  info.writeInt32LE(SIZE * 2, 8); // height counts image + mask
  info.writeUInt16LE(1, 12); // planes
  info.writeUInt16LE(32, 14); // bits per pixel
  info.writeUInt32LE(pixels.length + mask.length, 20);

  const entry = Buffer.alloc(16);
  entry[0] = SIZE;
  entry[1] = SIZE;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(info.length + pixels.length + mask.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, info, pixels, mask]);
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
  <link rel="icon" href="${escapeHtml(faviconHref(baseUrl))}" sizes="32x32">
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
    const { title, description, fullDescription } = readMeta(html, surface.slug);
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
      fullDescription,
      searchIndex: searchTokens([
        title,
        fullDescription,
        surface.slug,
        ...(await collectPageTitles(surface.sourceDir, surface.entryFile)),
      ]),
      pageCount: await countPages(surface.sourceDir),
      hasSitemap: await exists(path.join(destination, 'sitemap.xml')),
    });
    log(`  ${surface.slug}`);
  }

  await fs.writeFile(path.join(outDir, 'index.html'), renderHub(surfaces, base));
  await fs.writeFile(path.join(outDir, 'robots.txt'), renderRobots(base));
  await fs.writeFile(path.join(outDir, 'favicon.ico'), renderFavicon());
  await fs.writeFile(path.join(outDir, '404.html'), renderNotFound(base));

  await fs.writeFile(path.join(outDir, 'sitemap.xml'), renderSitemapIndex(surfaces, base));
  await fs.writeFile(path.join(outDir, 'sitemap-hub.xml'), renderHubSitemap(surfaces, base));

  // Tell Jekyll (which GitHub Pages runs by default) to leave the tree alone;
  // without this, any directory starting with `_` is silently dropped.
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');

  return { outDir, baseUrl: base, surfaces, repairs };
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
}
