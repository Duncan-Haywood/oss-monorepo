// How tall each tool page's h1 renders, and how many lines it wraps to.
//
//   node platform/pages/hero-heading.mjs                    # every ventures/*/index.html, 1280 and 390 px
//   node platform/pages/hero-heading.mjs --slugs=a,b         # just these
//   node platform/pages/hero-heading.mjs --dist=DIR --json=out.json
//
// The h1 is the first thing on a tool page, and on a 900 px laptop screen every
// pixel of it pushes the tool itself further down. On 2026-11-16 the ADA Title II
// page's h1 was 5rem across four lines at 1,280 px (about 230 px), more than its
// lede had ever cost (docs/reports/polish-2026-11-16-hero-walls.md, item 3).
// This serves the built site (build it first), opens each page in the
// pre-installed Chromium at 1,280x900 and 390x844, and reports the h1's height,
// line count and computed font size. `hero-heading.test.mjs` holds the static
// budget that keeps the font ceiling in check without a browser: no tool page's
// own h1 CSS asks for more than MAX_H1_REM (docs/reports/polish-2026-11-17-hero-headings.md).
//
// Not in CI: it needs a build and a browser. Exit 1 when any page's h1 is taller
// than MAX_H1_PX at either width.
import { requirePlaywright } from './load-playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_H1_PX = { 1280: 160, 390: 200 };
/** Largest h1 font size a tool page's own CSS may ask for, in rem (48 px). */
export const MAX_H1_REM = 3;
/**
 * Longest h1 a tool page may carry, in characters. At 390 px a 28.8 px h1 fits about 20
 * characters a line, so 101 to 125 characters wrapped to 5 or 6 lines (155 to 193 px) before the
 * lede; the second question moves to the lede (docs/reports/polish-2026-11-17-h1-length.md).
 * 91 to 100 still wrapped to 5 lines, so the cap is 90 (docs/reports/polish-2026-11-17-h1-90.md).
 */
export const MAX_H1_CHARS = 90;

/** Tags removed until none remain, so a removal cannot splice a new tag together. */
function stripTags(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/<[^>]+>/g, '');
  } while (s !== prev);
  return s;
}

/** The visible text of the first h1 in a page's HTML, entities decoded and whitespace collapsed, or null. */
export function h1Text(html) {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026' };
  return stripTags(m[1])
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePointOr(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePointOr(Number(d)))
    .replace(/&([a-z]+);/gi, (e, n) => ent[n.toLowerCase()] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}

/** `[{ slug, chars, text }]` for every tool page whose h1 is longer than `max` characters. */
export function longHeadings(root = fileURLToPath(new URL('../../ventures/', import.meta.url)), max = MAX_H1_CHARS) {
  const out = [];
  for (const slug of fs.readdirSync(root)) {
    const f = path.join(root, slug, 'index.html');
    if (!fs.existsSync(f)) continue;
    const text = h1Text(fs.readFileSync(f, 'utf8'));
    if (text && [...text].length > max) out.push({ slug, chars: [...text].length, text });
  }
  return out.sort((a, b) => b.chars - a.chars);
}

/** Font sizes (rem) that `h1` rules in a stylesheet or page ask for at most: a clamp's ceiling, or a fixed rem size. */
export function h1Ceilings(css) {
  const out = [];
  for (const m of css.matchAll(/(?<![\w.#-])h1\s*\{([^}]*)\}/g)) {
    for (const c of m[1].matchAll(/clamp\(\s*[0-9.]+rem\s*,\s*[0-9.]+vw\s*,\s*([0-9.]+)rem\s*\)/g)) out.push(Number(c[1]));
    for (const c of m[1].matchAll(/font-size\s*:\s*([0-9.]+)rem/g)) out.push(Number(c[1]));
  }
  return out;
}

/** `[{ slug, file, rem }]` for every tool page whose own h1 CSS asks for more than `max` rem. */
export function oversizedHeadings(root = fileURLToPath(new URL('../../ventures/', import.meta.url)), max = MAX_H1_REM) {
  const out = [];
  for (const slug of fs.readdirSync(root)) {
    if (!fs.existsSync(path.join(root, slug, 'index.html'))) continue;
    for (const file of ['index.html', 'style.css']) {
      const f = path.join(root, slug, file);
      if (!fs.existsSync(f)) continue;
      for (const rem of h1Ceilings(fs.readFileSync(f, 'utf8'))) if (rem > max) out.push({ slug, file, rem });
    }
  }
  return out;
}

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

async function main() {
  const dist = path.resolve(arg('dist') ?? fileURLToPath(new URL('./dist', import.meta.url)));
  const ventures = fileURLToPath(new URL('../../ventures/', import.meta.url));
  const slugs = arg('slugs')?.split(',') ?? fs.readdirSync(ventures).filter((s) => fs.existsSync(path.join(ventures, s, 'index.html')) && fs.existsSync(path.join(dist, s, 'index.html'))).sort();
  const pw = await requirePlaywright();
  const srv = http.createServer((q, r) => {
    const rel = decodeURIComponent(q.url.split('?')[0]);
    let p = path.resolve(dist, `.${rel}`);
    const within = path.relative(dist, p);
    if (within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) { r.writeHead(403); r.end(); return; }
    if (rel.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  const browser = await pw.chromium.launch();
  const out = {};
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 1280 ? 900 : 844 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let next = 0;
    async function worker() {
      const page = await ctx.newPage();
      while (next < slugs.length) {
        const slug = slugs[next++];
        try {
          await page.goto(`http://127.0.0.1:${port}/${slug}/`, { waitUntil: 'load', timeout: 20000 });
          const m = await page.evaluate(() => {
            const h = document.querySelector('main h1') || document.querySelector('h1');
            if (!h) return null;
            const r = h.getBoundingClientRect();
            const cs = getComputedStyle(h);
            const range = document.createRange();
            range.selectNodeContents(h);
            const tops = new Set([...range.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top)));
            return { height: Math.round(r.height), top: Math.round(r.top + scrollY), lines: tops.size, fontPx: parseFloat(cs.fontSize), chars: h.textContent.trim().length };
          });
          (out[slug] ??= {})[width] = m;
        } catch (e) {
          (out[slug] ??= {})[width] = { error: String(e).slice(0, 120) };
        }
      }
      await page.close();
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    await ctx.close();
  }
  await browser.close();
  srv.close();
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
  const over = [];
  for (const [slug, w] of Object.entries(out)) for (const width of [1280, 390]) {
    const m = w[width];
    if (m?.height > MAX_H1_PX[width]) over.push({ slug, width, ...m });
  }
  over.sort((a, b) => b.height - a.height);
  console.log(`${slugs.length} pages measured; ${over.length} h1(s) over budget (${MAX_H1_PX[1280]} px at 1280, ${MAX_H1_PX[390]} px at 390).`);
  for (const o of over) console.log(`${String(o.height).padStart(4)} px  ${o.width}  ${o.lines} lines  ${o.fontPx}px  ${o.chars} chars  ${o.slug}`);
  process.exitCode = over.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
