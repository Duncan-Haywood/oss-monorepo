/**
 * The manufacturing and engineering industry page, `industries/manufacturing/`:
 * CNC and fabrication job shops and small engineering firms, their most
 * common problems, the paid products being built for them (bets #2 and #4 in
 * `portfolio/monetization/bets.md`), and the free tools in the catalogue that
 * already serve them, as front doors.
 *
 *   node platform/pages/industry-manufacturing.mjs --out=dist
 *
 * `build.mjs` calls `buildManufacturingPage` on every site build.
 *
 * Honesty rules this page keeps (tested in industry-manufacturing.test.mjs):
 *   - both products are in development: "early access", never "available";
 *     no price is shown until one is set;
 *   - no claim of CMMC certification, C3PAO status or DoD endorsement;
 *   - every market fact carries the source `bets.md` cites for it.
 *
 * Reachable from the hub through the free tools' front doors
 * (`front-doors.json` maps them to `manufacturing`), so it is indexed and
 * listed in the hub sitemap (`industryPages` in build.mjs). A free tool is
 * listed only if this build publishes it (`published`).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSiteHeader, siteTitle } from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const INDUSTRIES_DIR = 'industries';
export const MANUFACTURING_PATH = `${INDUSTRIES_DIR}/manufacturing/`;
export const INDEXED = true;

// Same file and attribute as `CHROME_MODULE_FILE` and `CHROME_SLUG_ATTR` in
// build.mjs (the test asserts the file name agrees); not imported, because
// build.mjs imports this module.
const CHROME_MODULE_FILE = 'pf-site.js';
const CHROME_SLUG_ATTR = 'data-pf-slug';

/** Where a shop asks for early access: the open request form. */
export const EARLY_ACCESS_HREF = 'custom-development/?kind=new#request';

export const PRODUCTS = Object.freeze([
  Object.freeze({
    id: 'jobshop-quote',
    name: 'Job-shop quoting: RFQ to priced quote',
    status: 'In development (early access)',
    for: 'CNC machine shops and fabricators who quote from drawings, CAD files and emails.',
    does: [
      'Reads an RFQ (the email, the drawings, the CAD) and drafts a priced quote.',
      'Prices from your own shop rates, setup times and material costs, not a generic table.',
      'Keeps every quote and its assumptions, so you can see why a job was priced the way it was.',
    ],
    problems: ['rfq-backlog', 'own-rates'],
  }),
  Object.freeze({
    id: 'cmmc',
    name: 'CMMC Level 1/2 and ISO 9001 workspace',
    status: 'In development (early access)',
    for: 'Small defense and aerospace suppliers that handle contract information for the DoD.',
    does: [
      'Walks through the 110 NIST SP 800-171 controls and records how each one is met.',
      'Drafts the System Security Plan (SSP) and the Plan of Action and Milestones (POA&M) from your answers.',
      'Works out the SPRS score your self-assessment supports, with the controls that cost you points.',
      'Keeps ISO 9001 / AS9100 documents (procedures, records, corrective actions) beside the security work.',
    ],
    note: 'A tool for preparing your own self-assessment and documents. It is not a certification, we are not a C3PAO, and nothing here is endorsed by the Department of Defense. Your assessment is yours to make and sign.',
    problems: ['cmmc', 'iso'],
  }),
]);

export const PROBLEMS = Object.freeze([
  Object.freeze({
    id: 'rfq-backlog',
    title: 'RFQs pile up and quotes go out slowly',
    body: 'Turning an RFQ (drawings, CAD, an email thread) into a priced quote is often hours of the owner\'s or estimator\'s time, and the quote that goes out late loses the job.',
  }),
  Object.freeze({
    id: 'own-rates',
    title: 'Pricing from your own rates, not a guess',
    body: 'A quote is only as good as the shop rate, setup hours, material and outside-process costs behind it. Most shops keep those in a spreadsheet, or in one person\'s head.',
  }),
  Object.freeze({
    id: 'cmmc',
    title: 'CMMC Level 1/2 self-assessment and the SPRS score',
    body: 'Defense suppliers have to assess themselves against the NIST SP 800-171 controls, write it up, and post a score in SPRS. Consultants charge thousands to write the SSP and POA&M.',
  }),
  Object.freeze({
    id: 'iso',
    title: 'ISO 9001 and AS9100 documents',
    body: 'Procedures, records, corrective actions and audits: the quality system a customer asks about, usually kept in folders nobody can find before the audit.',
  }),
]);

// Every figure below is copied with its source from `portfolio/monetization/bets.md`
// (bets #2 and #4, researched 2026-11-24) or `ventures/machine-shop-guides/SOURCES.md`.
export const FACTS = Object.freeze([
  Object.freeze({
    text: 'CMMC Phase 1 took effect on 10 November 2025.',
    source: 'MeriTalk',
    href: 'https://meritalk.com/articles/dod-begins-rollout-of-cmmc-on-nov-10-heres-what-you-need-to-know/',
  }),
  Object.freeze({
    text: 'Phase 2 was suspended on 13 July 2026.',
    source: 'SmallGovCon',
    href: 'https://smallgovcon.com/statutes-and-regulations/breakingdepartment-of-war-suspends-introduction-of-phase-two-of-cmmc/',
  }),
  Object.freeze({
    text: 'Level 1 and Level 2 self-assessments remain required during the pause.',
    source: 'Wiley',
    href: 'https://www.wiley.law/alert-DOD-Pauses-CMMC-2-0-Implementation-A-Big-Deal-with-Little-Immediate-Impact',
  }),
  Object.freeze({
    text: 'CMMC Level 1 covers the 15 requirements of FAR 52.204-21, with an annual self-assessment and affirmation entered in SPRS.',
    source: '32 CFR 170.15',
    href: 'https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-D/section-170.15',
  }),
  Object.freeze({
    text: 'An SPRS score for the 110 NIST SP 800-171 requirements runs from 110 (all met) down to -203.',
    source: 'DoD CIO, CMMC Alignment to NIST Standards',
    href: 'https://dodcio.defense.gov/Portals/0/Documents/CMMC/CMMC-AlignmentNIST-Standards.pdf',
  }),
  Object.freeze({
    text: 'The DoD estimates 337,968 contractors are affected, 229,818 of them small businesses.',
    source: 'Venable',
    href: 'https://www.venable.com/insights/publications/2025/09/the-cybersecurity-maturity-model-certification-is',
  }),
  Object.freeze({
    text: 'Consultants charge about $3,000 to $25,000 to write the SSP and POA&M.',
    source: 'Secureframe',
    href: 'https://secureframe.com/hub/cmmc/certification-cost',
  }),
  Object.freeze({
    text: 'There are about 20,138 machine shops in the US (NAICS 332710; third-party count, year not stated).',
    source: 'NAICS Association',
    href: 'https://www.naics.com/naics-code-description/?code=332710',
  }),
]);

// Free tools already in the catalogue that serve these shops. Each slug is a
// published venture (`platform/pages/launched.json`); the test checks that.
export const FREE_TOOLS = Object.freeze([
  Object.freeze({ slug: 'cnc-machining-quote-calculator', name: 'CNC machining quote calculator', why: 'Cost per part, break-even price and margin from your own stock, cycle, setup, tooling and outside-process figures, at every lot size.', problem: 'own-rates' }),
  Object.freeze({ slug: 'shop-rate-calculator', name: 'Shop rate calculator', why: 'Labor burden, overhead rate and the hourly rate an hour has to sell at, from your own payroll and overhead.', problem: 'own-rates' }),
  Object.freeze({ slug: 'dxf-nesting', name: 'DXF nesting', why: 'True-shape nesting of DXF parts on sheets for laser, plasma, waterjet and router shops, with utilisation, cut length and pierce counts.', problem: 'rfq-backlog' }),
  Object.freeze({ slug: 'laser-cutting-engraving-job-price-calculator', name: 'Laser cutting job price calculator', why: 'Price per piece, pieces per sheet and price by order size for laser cutting and engraving.', problem: 'own-rates' }),
  Object.freeze({ slug: 'powder-coating-job-price-calculator', name: 'Powder coating job price calculator', why: 'Price per piece and per square foot, by order size, for finishers and shops that coat in house.', problem: 'own-rates' }),
  Object.freeze({ slug: 'mobile-welding-job-price-calculator', name: 'Mobile welding job price calculator', why: 'A field welding job priced from hours, rig, consumables, miles and margin.', problem: 'own-rates' }),
  Object.freeze({ slug: 'job-shop-scheduler', name: 'Job shop scheduler', why: 'Sequence jobs across machines to the shortest makespan, with a Gantt chart and machine use.', problem: 'rfq-backlog' }),
  Object.freeze({ slug: 'machine-shop-guides', name: 'SPRS score calculator and CMMC guides', why: 'Score your NIST SP 800-171 self-assessment the way SPRS does, and read what CMMC Level 1 and Level 2 ask of a small shop.', problem: 'cmmc' }),
  Object.freeze({ slug: 'assembly-line-balancer', name: 'Assembly line balancer', why: 'Fewest stations at a takt time, or the shortest cycle on a set number of stations, solved exactly.', problem: null }),
  Object.freeze({ slug: 'spc-control-charts', name: 'SPC control charts', why: 'X-bar R, I-MR and attribute charts with Nelson rules and Cp/Cpk, for the quality records an ISO 9001 or AS9100 audit asks for.', problem: 'iso' }),
]);

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TITLE = 'Software for machine shops and engineering firms';
const DESCRIPTION = 'Quoting and CMMC/ISO 9001 software in development for CNC and fabrication job shops, plus free tools for shop rates, part costs, nesting and SPC.';

export function renderManufacturingPage({ baseUrl = '', indexed = INDEXED, published = null, footer = '', tail = '' } = {}) {
  const liveTools = FREE_TOOLS.filter((t) => !published || published.has(t.slug));
  const toRoot = '../../';
  const url = `${baseUrl}${MANUFACTURING_PATH}`;
  const canonical = baseUrl
    ? `<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(baseUrl)}social-card.png">
<meta name="twitter:card" content="summary_large_image">\n`
    : '';
  const problemTitle = new Map(PROBLEMS.map((p) => [p.id, p.title]));

  const problems = PROBLEMS.map((p) => {
    const product = PRODUCTS.find((x) => x.problems.includes(p.id));
    const tools = liveTools.filter((t) => t.problem === p.id);
    return `<li id="${esc(p.id)}">
  <h3>${esc(p.title)}</h3>
  <p>${esc(p.body)}</p>
  <p class="route">${product ? `Product: <a href="#${esc(product.id)}">${esc(product.name)}</a>` : ''}${product && tools.length ? ' · ' : ''}${tools.length ? `Free now: ${tools.map((t) => `<a href="${esc(`${toRoot}${t.slug}/`)}">${esc(t.name)}</a>`).join(', ')}` : ''}</p>
</li>`;
  }).join('\n');

  const products = PRODUCTS.map((p) => `<section class="product" id="${esc(p.id)}">
  <h3>${esc(p.name)} <span class="badge">${esc(p.status)}</span></h3>
  <p><strong>For:</strong> ${esc(p.for)}</p>
  <ul>${p.does.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
  <p class="solves">Solves: ${p.problems.map((id) => `<a href="#${esc(id)}">${esc(problemTitle.get(id))}</a>`).join('; ')}</p>
  ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
  <p>Pricing is not set yet. <a class="go" href="${esc(`${toRoot}${EARLY_ACCESS_HREF}`)}">Ask for early access</a></p>
</section>`).join('\n');

  const tools = liveTools.map((t) => `<li><a href="${esc(`${toRoot}${t.slug}/`)}">${esc(t.name)}</a>: ${esc(t.why)}</li>`).join('\n');
  const facts = FACTS.map((f) => `<li>${esc(f.text)} <span class="src">(<a href="${esc(f.href)}" rel="noopener">${esc(f.source)}</a>)</span></li>`).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(siteTitle(TITLE))}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
${indexed ? '' : '<meta name="robots" content="noindex">\n'}${canonical}<style>
.mfg{max-width:52rem;margin:0 auto;padding:1rem 16px 3rem;line-height:1.55}
.mfg h1{font-size:1.9rem;line-height:1.2;margin:.5rem 0}
.mfg .lede{font-size:1.1rem}
.mfg ol.problems{padding-left:1.2rem}
.mfg ol.problems h3{margin:.9rem 0 .2rem;font-size:1.1rem}
.mfg .route,.mfg .solves,.mfg .src{font-size:.92rem}
.mfg .product{border:1px solid currentColor;border-color:rgba(127,127,127,.4);border-radius:8px;padding:.25rem 1rem;margin:1rem 0}
.mfg .badge{font-size:.75rem;font-weight:600;padding:.1rem .45rem;border-radius:999px;border:1px solid rgba(127,127,127,.6);white-space:nowrap;vertical-align:middle}
.mfg .note{font-size:.92rem;font-style:italic}
.mfg .go{font-weight:600}
.mfg footer{margin-top:2.5rem;font-size:.88rem}
</style>
</head>
<body>
<main class="mfg">
<h1>${esc(TITLE)}</h1>
<p class="lede">For CNC and fabrication job shops and small engineering firms: quote faster from your own rates, and keep your CMMC and ISO 9001 paperwork in one place. Two products are in development and open for early access; the free tools below work today.</p>

<h2>Common problems, and what solves them</h2>
<ol class="problems">
${problems}
</ol>

<h2>Products in development</h2>
${products}

<h2>Free tools you can use today</h2>
<p>No sign-up. Each one does one part of the job well.</p>
<ul>
${tools}
</ul>

<h2>Why now</h2>
<ul>
${facts}
</ul>

<footer>
<p>No warranty. These products are in development and the free tools give estimates from the figures you enter; they are not legal, compliance, tax or engineering advice. CMMC requirements and their timing are set by the Department of Defense and change; check the current rules before you rely on any date here.</p>
${footer}
</footer>
</main>
${tail || `<script src="${esc(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="industry-manufacturing" defer></script>`}
</body>
</html>
`;
  return withSiteHeader(html, { toRoot, crumbs: [{ label: 'Industries' }, { label: 'Manufacturing and engineering' }] });
}

export async function buildManufacturingPage(outDir, baseUrl = '', opts = {}) {
  const dir = path.join(outDir, MANUFACTURING_PATH);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  await fs.writeFile(file, renderManufacturingPage({ baseUrl, ...opts }));
  return MANUFACTURING_PATH;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const file = await buildManufacturingPage(arg('out') ?? path.join(HERE, 'dist'), arg('base-url') ?? '');
  console.log(`industry-manufacturing: wrote ${file}`);
}
