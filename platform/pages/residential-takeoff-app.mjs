/**
 * Residential Takeoff, the paid edition of Wall Framing Takeoff (paid bet #6), at
 * /residential-takeoff/.
 *
 * The app is static (it runs in the browser; nothing is uploaded), so serving it is a copy: the
 * page, the modules it imports (followed import by import, so test files, benches, fixtures and the
 * CLI stay out) and the IFC reader's .wasm. The paid path stays dark
 * (`checkout.mjs`, generated from platform/billing/catalogue.mjs, has no Paddle values yet), so every feature is open until the owner fills the catalogue.
 *
 * The paid folder also carries copies of the free edition's ~60 calculator pages. Those are not
 * copied (nor the bid-package pages, which the free edition serves too): they would duplicate the free edition's pages at /wall-framing-takeoff/, which stay the
 * ones search engines index, so links to them are pointed there. Like the other product sites the
 * hub does not list it as a tool; the construction page and the free edition link it.
 */
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESIDENTIAL_TAKEOFF_DIR = 'residential-takeoff';
export const RESIDENTIAL_TAKEOFF_APP = path.join(ROOT, 'ventures', 'residential-takeoff', 'apps', 'wall-framing-takeoff');
export const FREE_EDITION_DIR = 'wall-framing-takeoff';
const PRODUCTION = 'https://marisstella.app/';
// Pages of the paid folder that are the paid edition's own (not free-edition copies).
// The bid-package pages are served by the free edition already (same titles), so the app page and
// its Terms of Sale, Refund Policy and Privacy notice (what Paddle's website review asks for).
export const OWN_PAGES = ['index.html', 'terms.html', 'refunds.html', 'privacy.html'];
const ASSETS = ['ifc-engine.wasm'];

/** `./x.mjs` specifiers a page or module imports, statically or with `import()`. */
export function localImports(text) {
  const found = new Set();
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.\/[\w./-]+\.mjs)["']/g)) found.add(m[1].slice(2));
  return [...found];
}

/** Every module the page needs, following imports from `entries` inside `app`. */
export function moduleClosure(app, entries) {
  const seen = new Set();
  const queue = entries.flatMap((f) => localImports(readFileSync(path.join(app, f), 'utf8')));
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    const file = path.join(app, rel);
    if (!existsSync(file)) throw new Error(`${RESIDENTIAL_TAKEOFF_DIR}: ${rel} is imported but missing`);
    seen.add(rel);
    queue.push(...localImports(readFileSync(file, 'utf8')));
  }
  return [...seen].sort();
}

/**
 * Links to a calculator page this copy leaves out go to the free edition (`../wall-framing-takeoff/x.html`);
 * the licence link goes to the copied `LICENSE.txt`; the canonical becomes absolute.
 */
export function rewritePage(html, rel, { baseUrl = PRODUCTION, copied = new Set(OWN_PAGES) } = {}) {
  const out = html.replace(/href="(\.\/)?([\w-]+\.html)(#[\w-]*)?"/g, (whole, _dot, file, hash = '') =>
    copied.has(file) ? whole : `href="../${FREE_EDITION_DIR}/${file}${hash}"`)
    .replace(/href="LICENSE"/g, 'href="LICENSE.txt"');
  // The host serves `page.html` as `page`, so a canonical names it without the extension.
  const canonical = `${baseUrl}${RESIDENTIAL_TAKEOFF_DIR}/${rel === 'index.html' ? '' : rel.replace(/\.html$/, '')}`;
  // The legal pages name the site-wide share card relatively; a share preview needs it absolute.
  return out.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`)
    .replace('<meta property="og:image" content="../social-card.png">', `<meta property="og:image" content="${baseUrl}social-card.png">`);
}

/** The served copy's llms.txt: what the paid edition is, honestly, with the free edition beside it. */
export function llmsTxt(baseUrl = PRODUCTION) {
  const at = `${baseUrl}${RESIDENTIAL_TAKEOFF_DIR}/`;
  return `# Residential Takeoff

> The paid edition of Wall Framing Takeoff, for remodelers, framers and small builders. A house typed, drawn on a sketch (over a photo or a vector plan PDF placed at its printed scale, with clicks snapping to the drawn corners), or read from an IFC or DXF file gives every stud, header, plate splice and cut, the cheapest mix of board lengths to buy (with a lower bound), wall and roof sheathing, outline and hip roofs with a roof plan drawing, siding, soffit and fascia, and one supplier material list (CSV) a lumberyard can quote from, plus a branded bid package. Runs in the browser; nothing is uploaded.

Status: early access. Checkout is not open, so every feature works without a key. Once it opens, the supplier material list and the branded bid package are planned as a $29 Job report per house; the free edition stays free.

Limits: quantities come from the plan the user typed or drew. Nothing checks header sizes, spans, loads or the building code; a licensed engineer or the building department decides what is allowed. No lumber prices are stated; prices are what the user types.

## Pages

- [The app](${at}): walls, openings, roof, sheathing, siding, the material list and the bid package.
- [Branded bid package for framers](${baseUrl}${FREE_EDITION_DIR}/branded-bid-package-for-framers.html): the proposal on your letterhead with a quantities appendix and no unit prices.
- [Sample bid package](${baseUrl}${FREE_EDITION_DIR}/sample-bid-package.html): the package for an invented house.
- [Terms of Sale](${at}terms), [Refund Policy](${at}refunds) and [Privacy notice](${at}privacy): the Job report sold through Paddle as merchant of record, a full refund within 30 days, and what is collected (plans stay in the browser; cookieless Cloudflare Web Analytics counts visits).
- [Free edition: Wall Framing Takeoff](${baseUrl}${FREE_EDITION_DIR}/): stud layout, cut list, board order and the building calculators, free to use, source visible (all rights reserved).
`;
}

/**
 * Copies the app into `<outDir>/residential-takeoff/`. Returns the files written (relative to
 * outDir), or [] when the venture is missing (a sparse checkout).
 */
export async function buildResidentialTakeoffApp(outDir, { baseUrl = PRODUCTION, app = RESIDENTIAL_TAKEOFF_APP } = {}) {
  if (!existsSync(path.join(app, 'index.html'))) return [];
  const dest = path.join(outDir, RESIDENTIAL_TAKEOFF_DIR);
  if (existsSync(path.join(dest, 'index.html'))) {
    throw new Error(`${RESIDENTIAL_TAKEOFF_DIR}/ is already written by another part of the build`);
  }
  await fs.mkdir(dest, { recursive: true });
  const pages = OWN_PAGES.filter((f) => existsSync(path.join(app, f)));
  const copied = new Set(pages);
  const written = [];
  const put = async (rel, data) => {
    await fs.writeFile(path.join(dest, rel), data);
    written.push(`${RESIDENTIAL_TAKEOFF_DIR}/${rel}`);
  };
  for (const rel of pages) await put(rel, rewritePage(await fs.readFile(path.join(app, rel), 'utf8'), rel, { baseUrl, copied }));
  for (const rel of moduleClosure(app, pages)) await put(rel, await fs.readFile(path.join(app, rel)));
  for (const rel of ASSETS) if (existsSync(path.join(app, rel))) await put(rel, await fs.readFile(path.join(app, rel)));
  const licence = path.join(app, '..', '..', 'LICENSE');
  if (existsSync(licence)) await put('LICENSE.txt', await fs.readFile(licence));
  await put('llms.txt', llmsTxt(baseUrl));
  const urls = pages.map((f) => `  <url><loc>${baseUrl}${RESIDENTIAL_TAKEOFF_DIR}/${f === 'index.html' ? '' : f.replace(/\.html$/, '')}</loc></url>`);
  await put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  return written.sort();
}
