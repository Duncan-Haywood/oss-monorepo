// What a shared link to any page on the site looks like.
//
// The tool pages and the category pages have long had cards of their own. The
// rest of the site did not: 847 research pages, the writing, the comparison
// pages, Updates and Ask all pointed at the one site-wide card, so a share of
// "Does time-of-use pricing make a home battery pay?" previewed as the same
// picture as a share of the homepage. And the tags around the image were
// uneven: some pages had no image size (so X and LinkedIn fetch the image
// before they can lay the card out, and sometimes give up), none had
// `twitter:title` or `twitter:image` (X falls back to og:, but Mastodon,
// Bluesky's card fetcher and several chat clients read only one or the
// other), and the research index carried a stray inline favicon of a
// different logo.
//
// This pass runs over the finished site once, after every generator has
// written its pages. For each directory page still on the site-wide card it
// draws a card of its own (title, its section from the breadcrumb, a colour
// per section) beside the page; then on every page it makes the share tags
// complete and consistent. Cards render in a pool of worker threads: there
// are two thousand of them and each is a CPU-bound raster.

import { availableParallelism } from 'node:os';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { renderCard } from './sharecard.mjs';

export const PAGE_CARD_FILE = 'share-card.png';

// Separators that start a search-result tagline, and the suffixes a title
// carries for a search result rather than for a reader.
const TAGLINE = /\s+[—–|]\s+|\s+-\s+|\s+·\s+(?=Maris Stella Labs|Open research)/;
const FREE_PRIVATE = /[\s.,:;—–-]*(?:(?:a\s+)?free(?:,|\s+and)?\s+private(?:\s+(?:calculator|checker|tool))?|free,?\s+private,?\s+in your browser|in your browser)\.?\s*$/i;

/** The part of a page title worth setting large on a card. */
export function cardTitle(title) {
  const raw = String(title ?? '').replace(/\s+/g, ' ').trim();
  let primary = raw.split(TAGLINE)[0].trim() || raw;
  primary = primary.replace(FREE_PRIVATE, '').trim() || primary;
  return primary.replace(/[\s,:;]+$/, '');
}

/** The host and path a card prints, from the site's base URL. */
export function siteAddress(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return `${url.host}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// A colour per section: a research topic, an essay and a comparison page
// should not share one, and the same section should always get the same.
const SECTION_ACCENTS = {
  writing: '#9333ea',
  compare: '#0e7490',
  updates: '#15803d',
  ask: '#4338ca',
  about: '#12594a',
  lab: '#be185d',
  c: '#1d4ed8',
  deploy: '#0f766e',
  dev: '#0369a1',
};
const PALETTE = ['#0f766e', '#1d4ed8', '#7c3aed', '#be185d', '#c2410c', '#a16207', '#15803d', '#0e7490', '#4338ca', '#9333ea', '#b91c1c', '#0369a1'];

// Research topics already have colours: the research index's map draws each
// as `--t-<topic>`, so a project's card takes the colour its topic has there.
let TOPIC_COLOURS = null;
export function researchTopicColour(slug) {
  if (!TOPIC_COLOURS) {
    TOPIC_COLOURS = {};
    try {
      const template = readFileSync(new URL('../../research/_homepage/template.html', import.meta.url), 'utf8');
      const light = template.split('@media')[0];
      for (const m of light.matchAll(/--t-([a-z0-9]+):(#[0-9a-f]{6})/gi)) TOPIC_COLOURS[m[1]] = m[2];
    } catch {
      // No template (a partial checkout): fall back to the hashed palette.
    }
  }
  return TOPIC_COLOURS[slug] ?? null;
}

export function accentFor(section, topic = '') {
  if (!topic && SECTION_ACCENTS[section]) return SECTION_ACCENTS[section];
  let h = 0;
  for (const ch of `${section}/${topic}`) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const SECTION_NAMES = {
  research: 'Research',
  writing: 'Writing',
  compare: 'Compare',
  updates: 'Updates',
  ask: 'Ask',
  about: 'About',
  lab: 'Lab',
  c: 'Tools',
  deploy: 'Deploy your own',
  dev: 'How it is built',
};

const FOOTERS = {
  research: 'Open research · code, tests and results',
  writing: 'Essays from building in public',
};
const DEFAULT_FOOTER = 'Free · open source · MIT licensed';

const decode = (s) => String(s ?? '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’')
  .replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&hellip;/g, '…')
  .replace(/&amp;/g, '&');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The whole tag, tolerating a `>` inside a quoted attribute value.
const META = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

function metaContent(html, attr, key) {
  for (const m of html.matchAll(META)) {
    if (new RegExp(`\\b${attr}\\s*=\\s*["']${key.replace(/[:]/g, '\\:')}["']`, 'i').test(m[0])) {
      const c = /\bcontent\s*=\s*(["'])([\s\S]*?)\1/i.exec(m[0]);
      return c ? decode(c[2]) : '';
    }
  }
  return null;
}

// The page's own <title>: the first one inside <head>, not an SVG chart's.
function headTitle(html) {
  const head = html.slice(0, Math.max(0, html.search(/<\/head>/i)));
  return decode(/<title>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

/** The breadcrumb trail's labels, without "Home". */
export function crumbsOf(html) {
  const start = html.search(/<(?:span|nav)\b[^>]*class="[^"]*\b(?:pfs-crumbs|crumbs)\b/i);
  if (start < 0) return [];
  const close = html.indexOf('</nav>', start);
  const slice = html.slice(start, close > -1 ? Math.min(close, start + 4000) : start + 4000);
  return [...slice.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter((t) => t && !/^home$/i.test(t));
}

/**
 * The card a directory page should carry, or null when it already has one of
 * its own (a tool card, a category card, a venture's own image).
 *
 * `relative` is the page's path inside the site, e.g. `research/energy-tou/index.html`.
 */
export function pageCardPlan(html, relative, { baseUrl, siteCard = 'social-card.png' } = {}) {
  if (!relative.endsWith('index.html') || relative === 'index.html') return null;
  const image = metaContent(html, 'property', 'og:image');
  if (image && !(image.endsWith(`/${siteCard}`) || image === siteCard)) return null;
  const rawTitle = metaContent(html, 'property', 'og:title') || headTitle(html);
  const headline = cardTitle(decode(rawTitle));
  if (!headline) return null;
  const dir = relative.slice(0, -'index.html'.length);
  const section = dir.split('/')[0];
  const crumbs = crumbsOf(html).filter((c) => c !== headline);
  const sectionName = SECTION_NAMES[section] ?? crumbs[0] ?? '';
  let kicker = sectionName;
  const topic = crumbs.find((c) => c !== sectionName && c.length < 70) ?? '';
  if (topic && topic !== headline) kicker = sectionName ? `${sectionName} · ${topic}` : topic;
  if (section === 'writing') {
    const minutes = /(\d+)\s*min read/i.exec(html.replace(/<[^>]+>/g, ' '))?.[1];
    if (minutes && dir !== 'writing/') kicker = `Writing · ${minutes} min read`;
  }
  // A section's own front page ("Writing", "Updates") has a one-word title,
  // so its card carries the page's description under it.
  const isSectionRoot = dir.split('/').filter(Boolean).length === 1;
  const subtitle = isSectionRoot ? tidy(metaContent(html, 'property', 'og:description') ?? metaContent(html, 'name', 'description') ?? '') : '';
  return {
    file: `${dir}${PAGE_CARD_FILE}`,
    options: {
      accent: (section === 'research' && researchTopicColour(/href="[^"]*research\/topics\/([a-z0-9-]+)\/"/.exec(html)?.[1] ?? ''))
        || accentFor(section, section === 'research' ? topic : ''),
      headline,
      kicker: kicker === headline ? '' : kicker,
      subtitle,
      footer: FOOTERS[section] ?? DEFAULT_FOOTER,
      address: siteAddress(baseUrl),
    },
  };
}

const tidy = (s) => String(s ?? '')
  .replace(/\s+/g, ' ')
  // A space left where markup was stripped: "energy-home 's model", "( x )".
  .replace(/\s+([,.;:!?)’'”])/g, '$1')
  .replace(/([(“‘])\s+/g, '$1')
  .trim();

/**
 * Make one page's share tags complete. Only adds what is missing, except
 * `og:image` when `card` names a card drawn for this page, and a description
 * whose whitespace was left by stripped markup.
 */
export function completeShareTags(html, { card = '', siteName = 'Maris Stella Labs', toRoot = '', url = '' } = {}) {
  if (!/<\/head>/i.test(html)) return html;
  let next = html;

  const setContent = (attr, key, value) => {
    let found = false;
    next = next.replace(META, (tag) => {
      if (found || !new RegExp(`\\b${attr}\\s*=\\s*["']${key.replace(/[:]/g, '\\:')}["']`, 'i').test(tag)) return tag;
      found = true;
      return tag.replace(/\bcontent\s*=\s*(["'])[\s\S]*?\1/i, () => `content="${escapeAttr(value)}"`);
    });
    return found;
  };

  if (card) {
    if (!setContent('property', 'og:image', card)) next = next.replace(/<\/head>/i, `<meta property="og:image" content="${escapeAttr(card)}">\n</head>`);
    // A card drawn for this page has its own alt text.
    const title = metaContent(next, 'property', 'og:title');
    if (title) setContent('property', 'og:image:alt', `${cardTitle(title)} — ${siteName}`);
  }

  // A page that names its own picture by a relative path (a venture's
  // `renders/hero.jpg`) keeps it, made absolute: scrapers do not resolve
  // relative og:image URLs, so the picture would otherwise never show.
  if (url) {
    for (const [attr, key] of [['property', 'og:image'], ['name', 'twitter:image']]) {
      const value = metaContent(next, attr, key);
      if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;
      try { setContent(attr, key, new URL(value, url).href); } catch { /* leave it */ }
    }
  }

  for (const key of ['og:description', 'twitter:description']) {
    const attr = key.startsWith('og:') ? 'property' : 'name';
    const value = metaContent(next, attr, key);
    if (value && tidy(value) !== value) setContent(attr, key, tidy(value));
  }

  const has = (attr, key) => metaContent(next, attr, key) !== null;
  const tags = [];
  const add = (attr, key, value) => {
    if (!value || has(attr, key)) return;
    tags.push(`<meta ${attr}="${key}" content="${escapeAttr(value)}">`);
  };
  // A page written without any og: tags (the deploy guide, the development
  // dashboards) still gets the basics, from its own title and description.
  add('property', 'og:title', headTitle(next));
  add('property', 'og:description', tidy(metaContent(next, 'name', 'description') ?? ''));
  add('property', 'og:type', 'website');
  add('property', 'og:url', url);
  const pending = (key) => tags.find((t) => t.includes(`"${key}"`))?.match(/content="([^"]*)"/)?.[1];
  const ogTitle = metaContent(next, 'property', 'og:title') ?? decode(pending('og:title') ?? '');
  const ogDescription = metaContent(next, 'property', 'og:description') ?? metaContent(next, 'name', 'description');
  const ogImage = metaContent(next, 'property', 'og:image');
  add('property', 'og:site_name', siteName);
  if (ogImage) {
    const ours = /(?:share-card|social-card[\w-]*)\.png$/.test(ogImage);
    if (ours) {
      add('property', 'og:image:type', 'image/png');
      add('property', 'og:image:width', '1200');
      add('property', 'og:image:height', '630');
    }
    const alt = metaContent(next, 'property', 'og:image:alt') ?? (ogTitle ? `${cardTitle(ogTitle)} — ${siteName}` : siteName);
    add('property', 'og:image:alt', alt);
    add('name', 'twitter:card', 'summary_large_image');
    add('name', 'twitter:image', ogImage);
    add('name', 'twitter:image:alt', alt);
  }
  add('name', 'twitter:title', ogTitle);
  add('name', 'twitter:description', ogDescription ? tidy(ogDescription) : '');

  // One logo everywhere: drop an inline data: favicon (a different mark the
  // research index used to carry) and make sure the scalable icon is linked.
  next = next.replace(/\s*<link\b[^>]*\brel=["'](?:shortcut )?icon["'][^>]*\bhref=["']data:[^"']*["'][^>]*>/gi, '');
  if (!/<link\b[^>]*rel=["'][^"']*\bicon\b[^"']*["'][^>]*favicon\.svg/i.test(next)) {
    tags.push(`<link rel="icon" href="${toRoot}favicon.svg" type="image/svg+xml">`);
  }
  // The touch icon itself is linked by the offline layer (`offlineHead`),
  // which runs after this; a page that linked the old transparent 192px one
  // is pointed at the opaque 180px tile iOS wants.
  next = next.replace(/(<link\b[^>]*rel=["']apple-touch-icon["'][^>]*href=["'][^"']*)icon-192\.png/gi, '$1apple-touch-icon.png');

  if (!tags.length) return next;
  return next.replace(/<\/head>/i, `${tags.join('\n')}\n</head>`);
}

// -- Rendering in parallel ------------------------------------------------------

/**
 * Render `jobs` ([{ file, options }], options as for `renderCard`) to disk on
 * a pool of worker threads. Falls back to this thread for a handful of cards,
 * where starting workers costs more than it saves.
 *
 * With a cache directory (`cacheDir`, default `PAGES_CARD_CACHE`), a card whose
 * options and renderer are unchanged is copied from the last build instead of
 * drawn again. Drawing was most of the build's time: about 2,700 cards per
 * deploy, 55 of the build's 110 s on 2026-10-24, and nearly all identical to
 * the previous deploy's. The key covers the options and every file a card's
 * pixels depend on, so a renderer or font change misses every entry. Hits are
 * touched, so the workflow can prune what no build has used lately. Cards
 * drawn earlier in this process are also kept in memory, which is what makes
 * the test suite's repeat builds cheap without any cache directory.
 */
export async function renderCards(jobs, {
  threads = Math.max(1, Math.min(8, availableParallelism())),
  cacheDir = process.env.PAGES_CARD_CACHE || '',
} = {}) {
  if (!jobs.length) return;
  if (cacheDir) await fs.mkdir(cacheDir, { recursive: true });
  const now = new Date();
  const todo = [];
  await mapLimit(jobs, 32, async (job) => {
    const key = cardKey(job.options);
    await fs.mkdir(path.dirname(job.file), { recursive: true });
    // This process drew it already: the test suite builds the site several
    // times in one process (docs/history/pages-test-perf-2026-10-24.md).
    const png = drawnCards.get(key);
    if (png) return fs.writeFile(job.file, png);
    if (cacheDir) {
      const cached = path.join(cacheDir, `${key}.png`);
      try {
        await fs.copyFile(cached, job.file);
        await fs.utimes(cached, now, now);
        return undefined;
      } catch {
        // Not cached yet: drawn below.
      }
    }
    todo.push({ job, key });
    return undefined;
  });
  await drawCards(todo.map((t) => t.job), threads);
  await mapLimit(todo, 32, async ({ job, key }) => {
    const png = await fs.readFile(job.file);
    drawnCards.set(key, png);
    if (cacheDir) await fs.writeFile(path.join(cacheDir, `${key}.png`), png);
  });
}

const drawnCards = new Map();

let rendererHash = null;
/** What a card's pixels depend on besides its options: the renderer and its fonts. */
function rendererVersion() {
  if (rendererHash) return rendererHash;
  const hash = createHash('sha256');
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of ['sharecard.mjs', 'fontraster.mjs']) hash.update(readFileSync(path.join(here, file)));
  const fonts = path.join(here, 'fonts');
  for (const name of readdirSync(fonts).sort()) hash.update(name).update(readFileSync(path.join(fonts, name)));
  rendererHash = hash.digest('hex');
  return rendererHash;
}

export const cardKey = (options) =>
  createHash('sha256').update(rendererVersion()).update(JSON.stringify(options ?? {})).digest('hex');

async function drawCards(jobs, threads) {
  if (!jobs.length) return;
  if (jobs.length < 16 || threads === 1) {
    for (const job of jobs) {
      await fs.mkdir(path.dirname(job.file), { recursive: true });
      await fs.writeFile(job.file, renderCard(job.options));
    }
    return;
  }
  const queue = [...jobs];
  const workerUrl = new URL('./share-worker.mjs', import.meta.url);
  await Promise.all(Array.from({ length: Math.min(threads, jobs.length) }, () => new Promise((resolve, reject) => {
    // `execArgv: []`: a worker inherits the parent's flags, and a build started
    // as `node --input-type=module -e ...` (gitops/tests) would pass a flag a
    // file-backed worker refuses.
    const worker = new Worker(workerUrl, { execArgv: [] });
    const next = () => {
      const job = queue.shift();
      if (!job) { worker.terminate().then(() => resolve()); return; }
      worker.postMessage(job);
    };
    worker.on('message', (msg) => (msg?.error ? (worker.terminate(), reject(new Error(msg.error))) : next()));
    worker.on('error', reject);
    next();
  })));
}

/** `fn` over `items`, at most `limit` at once; results in input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function listHtml(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * The pass itself: draw a card for every page still on the site-wide one,
 * then complete the tags on every page. Returns what it changed.
 */
export async function addShareCards({ outDir, baseUrl, siteName, siteCard = 'social-card.png', only = null }) {
  const files = only
    ? (await Promise.all(only.map((dir) => listHtml(path.join(outDir, dir)).catch(() => [])))).flat()
    : await listHtml(outDir);
  // Each page is independent, so they are read and rewritten a few dozen at a
  // time; one at a time, the disk sat idle between them. Results keep file order.
  const results = await mapLimit(files, 32, async (file) => {
    const relative = path.relative(outDir, file).split(path.sep).join('/');
    const html = await fs.readFile(file, 'utf8');
    const plan = pageCardPlan(html, relative, { baseUrl, siteCard });
    const depth = relative.split('/').length - 1;
    const toRoot = '../'.repeat(depth);
    const url = baseUrl ? `${baseUrl}${relative.replace(/(^|\/)index\.html$/, '$1')}` : '';
    const next = completeShareTags(html, { card: plan ? `${baseUrl}${plan.file}` : '', siteName, toRoot, url });
    if (next !== html) await fs.writeFile(file, next);
    return { relative, plan, changed: next !== html };
  });
  const jobs = results.filter((r) => r.plan).map((r) => ({ file: path.join(outDir, r.plan.file), options: r.plan.options }));
  const changed = results.filter((r) => r.changed).map((r) => r.relative);
  await renderCards(jobs);
  return { cards: jobs.map((j) => path.relative(outDir, j.file)), changed };
}

// CLI, for pages built after `build.mjs` (the deploy guide and the
// development dashboards are written into the artifact by later workflow
// steps, so the build's own pass never sees them):
//
//   node platform/pages/share.mjs platform/pages/dist --base=https://example.github.io/site/ --only=deploy,dev
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const opt = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const baseUrl = opt('base') ?? process.env.PAGES_BASE_URL ?? '';
  if (!dir || !baseUrl) {
    console.error('usage: share.mjs <dist> --base=<site url> [--only=dir,dir]');
    process.exit(2);
  }
  const result = await addShareCards({
    outDir: path.resolve(dir),
    baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    siteName: 'Maris Stella Labs',
    only: opt('only')?.split(',').filter(Boolean) ?? null,
  });
  console.log(`Drew ${result.cards.length} share card(s); completed share tags on ${result.changed.length} page(s).`);
}
