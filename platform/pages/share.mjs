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
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { renderCard } from './sharecard.mjs';
import { servedPath } from './served-path.mjs';

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
  about: '#1f4e8c',
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
const DEFAULT_FOOTER = 'Free · source available · FSL-1.1-MIT';

// Every entity below starts with `&`, so a string without one comes back as
// it went in, without the fourteen passes; most meta values have none
// (docs/history/pages-build-perf-2026-11-15-meta-content-backreference.md).
const decode = (s) => {
  const str = String(s ?? '');
  return str.includes('&') ? decodeEntities(str) : str;
};
const decodeEntities = (str) => str
  .replace(/&#(\d+);/g, (_, n) => codePointOr(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => codePointOr(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’')
  .replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&hellip;/g, '…')
  .replace(/&amp;/g, '&');
const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// An inline data: favicon link (see `completeShareTags`).
const DATA_ICON = /<link\b[^>]*\brel=["'](?:shortcut )?icon["'][^>]*\bhref=["']data:[^"']*["'][^>]*>/gi;

// The whole tag, tolerating a `>` inside a quoted attribute value.
const META = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

// metaContent runs about fifteen times on one page's HTML: scan the tags once
// per string (a one-slot memo) and compile each attr/key matcher once.
let metaTagsFor = null;
let metaTagsOf = [];
const metaMatchers = new Map();

// A tag's content value, double- or single-quoted. Spelled as two quoted
// alternatives rather than `(["'])([\s\S]*?)\1`: both stop at the first
// closing quote of the same kind, but on a two-byte string (any page with a
// `—` in it) V8 runs a backreference under `i` about 20 times slower, about
// 4 us a tag, and this runs on every meta read
// (docs/history/pages-build-perf-2026-11-15-meta-content-backreference.md).
const META_CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function metaMatcher(attr, key) {
  const id = `${attr}\0${key}`;
  let test = metaMatchers.get(id);
  if (!test) {
    test = new RegExp(`\\b${attr}\\s*=\\s*["']${key.replace(/[:]/g, '\\:')}["']`, 'i');
    metaMatchers.set(id, test);
  }
  return test;
}

// Where a tag may start (`META`'s own opening), and `META` anchored at one place.
const META_START = /<meta\b/i;
const META_AT = new RegExp(META.source, 'iy');

function reparsesAs(html, at, tag) {
  META_AT.lastIndex = at;
  return META_AT.exec(html)?.[0] === tag;
}

function metaContent(html, attr, key) {
  if (metaTagsFor !== html) {
    metaTagsOf = html.match(META) ?? [];
    metaTagsFor = html;
  }
  const test = metaMatcher(attr, key);
  for (const tag of metaTagsOf) {
    if (test.test(tag)) {
      const c = META_CONTENT.exec(tag);
      return c ? decode(c[1] ?? c[2]) : '';
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

  // The first matching tag's content, set in place. Stops at that tag: a
  // `replace` over every tag scanned the rest of the page for nothing and
  // compiled the matcher once per tag.
  //
  // When `metaContent`'s memo holds this page's tags, the edited tag is
  // swapped into it rather than the memo dropped: the next read would
  // otherwise rescan the whole page for its tags, two or three times a page
  // (about 2 s a build). The swap is exactly what a rescan would find when
  // every `<meta` before the tag began a matched tag (so no earlier attempt
  // that failed could now run on into the edit) and the new tag still parses
  // as one tag from the same place (the text after it is unchanged, so the
  // scan resumes as before). Otherwise the memo is dropped, as it always was
  // (docs/history/pages-build-perf-2026-11-15-share-memo-swap.md).
  const setContent = (attr, key, value) => {
    const test = metaMatcher(attr, key);
    let i = 0;
    let gapEnd = 0;
    let clean = true;
    for (const m of next.matchAll(META)) {
      if (clean && m.index > gapEnd && META_START.test(next.slice(gapEnd, m.index))) clean = false;
      gapEnd = m.index + m[0].length;
      if (!test.test(m[0])) { i += 1; continue; }
      const tag = m[0].replace(META_CONTENT, () => `content="${escapeAttr(value)}"`);
      const memo = metaTagsFor === next && metaTagsOf[i] === m[0];
      next = next.slice(0, m.index) + tag + next.slice(gapEnd);
      if (memo && clean && reparsesAs(next, m.index, tag)) {
        metaTagsOf = metaTagsOf.slice();
        metaTagsOf[i] = tag;
        metaTagsFor = next;
      }
      return true;
    }
    return false;
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
  // research index used to carry), with the whitespace before it, and make
  // sure the scalable icon is linked. The cheap `data:` test first: most pages
  // have no data: URI at all. The link is matched without a leading `\s*`
  // (which made the engine try the pattern from every whitespace run, 0.7 s a
  // build) and the gap before it trimmed by hand: `\s` and `trimEnd` strip the
  // same characters, and, as with `replace`, a gap never reaches back into the
  // previous match. Same output
  // (docs/history/pages-build-perf-2026-11-13-share-data-icon-scan.md).
  if (/data:/i.test(next)) {
    let out = '';
    let last = 0;
    for (const m of next.matchAll(DATA_ICON)) {
      out += next.slice(last, m.index).trimEnd();
      last = m.index + m[0].length;
    }
    if (last) next = out + next.slice(last);
  }
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
 *
 * Several builds can share one cache directory at once: the site-builder suite
 * runs four (two full catalogue builds and two fixture builds, which still
 * card every post and research page) in separate processes. Until 2026-11-16
 * each looked in the directory only before it started drawing and stored its
 * cards only after it finished, so on a cold cache all four drew the same
 * ~6,500 cards side by side, and a fresh cloud container (always cold) spent
 * most of the suite's 340-410 s on that. Now a card is stored the moment it is
 * drawn, each build draws its misses in its own shuffled order, and the
 * directory is checked again just before each draw, so the builds split the
 * work instead of repeating it
 * (docs/history/pages-test-perf-2026-11-16-shared-card-cache.md). Entries are
 * written to a temporary name and renamed, so a reader never copies half a PNG.
 */
/**
 * Off for one build: `renderCards` draws and copies nothing, so pages keep
 * their share tags but their card files are absent. For fixture builds in the
 * tests (`buildSite({ cards: false })`), which assert on markup only and whose
 * own base URL gives every card a different key from the catalogue build's:
 * the two fixture builds drew ~14,000 cards nobody read, most of a cold
 * suite's drawing (docs/history/pages-test-perf-2026-11-16-shared-card-cache.md).
 */
let cardDrawing = true;
export function setCardDrawing(on) { cardDrawing = Boolean(on); }

export async function renderCards(jobs, {
  threads = Math.max(1, Math.min(8, availableParallelism())),
  cacheDir = process.env.PAGES_CARD_CACHE || '',
} = {}) {
  if (!jobs.length || !cardDrawing) return;
  if (cacheDir) await fs.mkdir(cacheDir, { recursive: true });
  const now = new Date();
  const cachedPath = (key) => path.join(cacheDir, `${key}.png`);
  const copyCached = async (job, key) => {
    if (!cacheDir) return false;
    try {
      await fs.copyFile(cachedPath(key), job.file);
      await fs.utimes(cachedPath(key), now, now);
      return true;
    } catch {
      return false; // not cached (yet): drawn
    }
  };
  const todo = [];
  await mapLimit(jobs, 32, async (job) => {
    const key = cardKey(job.options);
    await fs.mkdir(path.dirname(job.file), { recursive: true });
    // This process drew it already: the test suite builds the site several
    // times in one process (docs/history/pages-test-perf-2026-10-24.md).
    const png = drawnCards.get(key);
    if (png) return fs.writeFile(job.file, png);
    if (await copyCached(job, key)) return undefined;
    todo.push({ job, key });
    return undefined;
  });
  if (cacheDir) shuffle(todo);
  await drawCards(todo, threads, {
    // Another build sharing the directory may have drawn it since the pass above.
    skip: ({ job, key }) => copyCached(job, key),
    drawn: async ({ job, key }) => {
      const png = await fs.readFile(job.file);
      drawnCards.set(key, png);
      if (!cacheDir) return;
      const tmp = `${cachedPath(key)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.writeFile(tmp, png);
      await fs.rename(tmp, cachedPath(key));
    },
  });
}

/** Fisher-Yates, in place. Only the order cards are drawn in depends on it. */
function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
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

/**
 * Draw `entries` ({ job, key }) on a pool of workers. `skip(entry)` runs just
 * before an entry is drawn and returns true when it no longer needs drawing;
 * `drawn(entry)` runs as soon as its card is on disk.
 */
async function drawCards(entries, threads, { skip = async () => false, drawn = async () => {} } = {}) {
  if (!entries.length) return;
  if (entries.length < 16 || threads === 1) {
    for (const entry of entries) {
      if (await skip(entry)) continue;
      await fs.mkdir(path.dirname(entry.job.file), { recursive: true });
      await fs.writeFile(entry.job.file, renderCard(entry.job.options));
      await drawn(entry);
    }
    return;
  }
  const queue = [...entries];
  const workerUrl = new URL('./share-worker.mjs', import.meta.url);
  await Promise.all(Array.from({ length: Math.min(threads, entries.length) }, () => new Promise((resolve, reject) => {
    // `execArgv: []`: a worker inherits the parent's flags, and a build started
    // as `node --input-type=module -e ...` (gitops/tests) would pass a flag a
    // file-backed worker refuses.
    const worker = new Worker(workerUrl, { execArgv: [] });
    let current = null;
    const fail = (error) => { worker.terminate(); reject(error); };
    const next = async () => {
      for (;;) {
        current = queue.shift();
        if (!current) { worker.terminate().then(() => resolve()); return; }
        if (!(await skip(current))) break;
      }
      worker.postMessage(current.job);
    };
    worker.on('message', (msg) => {
      if (msg?.error) { fail(new Error(msg.error)); return; }
      drawn(current).then(next).catch(fail);
    });
    worker.on('error', reject);
    next().catch(fail);
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

// Synchronous on purpose: `fs.promises` costs more per call than the work on
// a site of ~8,800 mostly small pages, and nothing runs beside this pass
// (docs/history/pages-build-perf-2026-11-12-share-identity-preload-sync.md).
function listHtml(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const listHtmlOrNone = (dir) => {
  try { return listHtml(dir); } catch { return []; }
};

/**
 * The pass itself: draw a card for every page still on the site-wide one,
 * then complete the tags on every page. Returns what it changed.
 */
export async function addShareCards({ outDir, baseUrl, siteName, siteCard = 'social-card.png', only = null }) {
  const files = only
    ? only.flatMap((dir) => listHtmlOrNone(path.join(outDir, dir)))
    : listHtml(outDir);
  // Read and rewritten one page after another with sync calls: measured on a
  // full build, 32 promise reads in flight were slower than this
  // (docs/history/pages-build-perf-2026-11-12-share-identity-preload-sync.md).
  // `buildSite` awaits this pass with nothing beside it. Results keep file order.
  const results = files.map((file) => {
    const relative = path.relative(outDir, file).split(path.sep).join('/');
    const html = readFileSync(file, 'utf8');
    const { next, plan } = shareTagsFor(html, relative, { baseUrl, siteName, siteCard });
    if (next !== html) writeFileSync(file, next);
    return { relative, plan, changed: next !== html };
  });
  return drawPlannedCards(outDir, results);
}

/**
 * One page's share step, with no file access: its card plan (or null) and the
 * page with complete share tags. `addShareCards` runs it over a tree;
 * `build.mjs` runs it inside its one-walk page finish (`finishPagesInOneWalk`),
 * so a full build reads and writes each page once for the title, sponsor,
 * notice and share passes together.
 */
export function shareTagsFor(html, relative, { baseUrl, siteName, siteCard = 'social-card.png' }) {
  const plan = pageCardPlan(html, relative, { baseUrl, siteCard });
  const depth = relative.split('/').length - 1;
  const toRoot = '../'.repeat(depth);
  const url = baseUrl ? `${baseUrl}${servedPath(relative)}` : '';
  const next = completeShareTags(html, { card: plan ? `${baseUrl}${plan.file}` : '', siteName, toRoot, url });
  return { next, plan };
}

/**
 * Draws the cards `results` plan (`{ relative, plan, changed }` per page, in
 * walk order) and returns what `addShareCards` reports.
 */
export async function drawPlannedCards(outDir, results) {
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

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
