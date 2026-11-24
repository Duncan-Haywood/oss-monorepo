/**
 * `industries/nonprofits/`: the industry page for small nonprofits.
 *
 * Part of the 2026-11-24 pivot (`prompts/goals.md`, "The 2026-11-24 pivot, in
 * one place"): the site is organised around specific small businesses and
 * organisations and their most common problems, each leading to a product.
 * For a small nonprofit the paid product is Grant Autopilot (bet #7 in
 * `portfolio/monetization/bets.md`, served at `/grants/` by the site Worker),
 * and the free tools already published here are the front doors.
 *
 * Honesty rules this file keeps:
 *
 *  - Grant Autopilot is described only as its live page describes it, and its
 *    prices are the ones that page publishes (read 2026-11-24 from
 *    https://marisstella.app/grants and /grants/pricing). If the plans change
 *    there, change `GRANT_AUTOPILOT.plans` here. No outcome claims (no "win
 *    more grants"): the page promises drafting, not awards, and so does this.
 *  - Every outside fact carries its source and link (`FACTS`).
 *  - A free tool is listed only if it is actually published in this build
 *    (`published`), so a renamed or excluded venture drops off rather than
 *    leaving a dead link.
 *
 * The site foundation (`business.mjs`, the `industries/` index) is a sibling
 * session's work. Until it lands on main this page carries its own data;
 * follow-up: once `business.mjs` exists, move `GRANT_AUTOPILOT` there and
 * link this page from the industries index.
 *
 *   node platform/pages/industry-nonprofits.mjs --out=DIR   # writes DIR/industries/nonprofits/index.html
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_NAME, withSiteHeader } from './site-nav.mjs';

export const NONPROFITS_PATH = 'industries/nonprofits/';
const TO_ROOT = '../../';

/** What `/grants/` says about itself, 2026-11-24. Prices are the published ones. */
export const GRANT_AUTOPILOT = Object.freeze({
  name: 'Grant Autopilot',
  href: 'grants/',
  pricingHref: 'grants/pricing',
  signupHref: 'grants/signup',
  headline: 'Apply for more grants with the team you already have.',
  plans: Object.freeze([
    Object.freeze({ name: 'Starter', monthly: '$5 a month', yearly: '$54 a year', drafts: '1 application draft a month', seats: 'Up to 3 team members' }),
    Object.freeze({ name: 'Standard', monthly: '$20 a month', yearly: '$216 a year', drafts: '5 application drafts a month', seats: 'Up to 10 team members' }),
    Object.freeze({ name: 'Pro', monthly: '$100 a month', yearly: '$1,080 a year', drafts: '33 application drafts a month', seats: 'Up to 25 team members' }),
  ]),
  terms: 'No free trial; 30-day money-back guarantee on the first payment; cancel any time. Prices in US dollars; sales tax may apply.',
});

/** Outside facts this page quotes, each with where it comes from. */
export const FACTS = Object.freeze({
  candid: Object.freeze({
    text: 'Of the very small nonprofits Candid studied (those filing the IRS e-Postcard, Form 990-N), 22% received at least one foundation grant between 2019 and 2023, against 72% of other nonprofits.',
    source: 'Candid, “The ‘invisible majority’: What we know about very small nonprofits”',
    url: 'https://candid.org/blogs/data-insights-very-small-nonprofits-make-up-majority-us-nonprofits/',
  }),
  epostcard: Object.freeze({
    text: 'Form 990-N is the annual filing for small tax-exempt organizations whose gross receipts are normally $50,000 or less.',
    source: 'IRS, “Annual electronic filing requirement for small exempt organizations — Form 990-N (e-Postcard)”',
    url: 'https://www.irs.gov/charities-non-profits/annual-electronic-filing-requirement-for-small-exempt-organizations-form-990-n-e-postcard',
  }),
});

/**
 * The common problems, in the order a small nonprofit meets them, each with
 * what answers it here: Grant Autopilot's own words for what it does, and the
 * free tools (by real slug) that help without an account.
 */
export const PROBLEMS = Object.freeze([
  Object.freeze({
    id: 'finding',
    title: 'Finding grants that actually fit',
    body: 'Searching funder lists by hand eats the hours a one- or two-person team does not have, and most results are for someone else’s mission.',
    product: 'Grant Autopilot finds and ranks federal grants daily, and you can add foundation opportunities by link or by uploading the RFP. Each is ranked by fit to your mission, with its reasons and deadline shown.',
    tools: Object.freeze([]),
  }),
  Object.freeze({
    id: 'rewriting',
    title: 'Rewriting the same story for every funder',
    body: 'Every application asks for your mission, programmes, numbers and budget again, in a slightly different shape.',
    product: 'Grant Autopilot builds a fact base from your reports, budgets and past proposals, or from a guided interview, and drafts only from it. Every fact cites the document it came from, a separate check flags sentences it cannot support, and gaps become questions for you rather than invented answers.',
    tools: Object.freeze(['grant-indirect-cost-calculator']),
  }),
  Object.freeze({
    id: 'deadlines',
    title: 'Deadlines, and the reports afterwards',
    body: 'An award is the start of the work: interim and final reports, restricted balances, thank-yous. A missed report can put the next grant at risk.',
    product: 'Grant Autopilot shows each grant’s deadline, keeps an exact copy of what was submitted, and reminds you about reports and thank-yous.',
    tools: Object.freeze(['grant-deadline-tracker', 'grant-reporting-tracker']),
  }),
  Object.freeze({
    id: 'budget',
    title: 'A small budget and a smaller team',
    body: 'Most of the work falls on volunteers or an executive director who is also the bookkeeper, the event planner and the grant writer.',
    product: 'Grant Autopilot plans start at $5 a month for one application draft a month, and nothing is sent until someone on your team approves it.',
    tools: Object.freeze(['donor-acknowledgment-letter-generator', 'donor-retention-analyzer', 'fundraising-event-net-calculator', 'volunteer-shift-scheduler']),
  }),
]);

/** One line each for the free tools, so the page reads without opening them. */
export const TOOL_BLURBS = Object.freeze({
  'grant-deadline-tracker': 'Grant deadline tracker: overdue obligations and award funds remaining, private in your browser.',
  'grant-reporting-tracker': 'Grant reporting tracker: reporting deadlines and restricted balances, no account needed.',
  'grant-indirect-cost-calculator': 'Grant indirect cost calculator: modified total direct costs and the indirect you can charge.',
  'donor-acknowledgment-letter-generator': 'Donor acknowledgment letters: one year-end receipt letter per donor from a gift list.',
  'donor-retention-analyzer': 'Donor retention analyzer: LYBUNT and SYBUNT lists from your own gift history.',
  'fundraising-event-net-calculator': 'Fundraising event calculator: net proceeds and cost per dollar raised.',
  'volunteer-shift-scheduler': 'Volunteer shift scheduler: a fair roster with unfilled slots flagged.',
});

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Every free tool slug this page links, in page order, without repeats. */
export function nonprofitToolSlugs() {
  return [...new Set(PROBLEMS.flatMap((p) => p.tools))];
}

/**
 * The page. `published`: the slugs this build serves (tools not in it are
 * left out). `footer`: the site's shared disclaimer/footer HTML. `tail`: the
 * chrome script tag (usage counter and header behaviour) from build.mjs.
 */
export function renderNonprofitsPage({ baseUrl = '/', published = null, footer = '', tail = '' } = {}) {
  const url = `${baseUrl}${NONPROFITS_PATH}`;
  const live = (slug) => !published || published.has(slug);
  const ga = GRANT_AUTOPILOT;
  const title = 'Software for small nonprofits: grants, reports and donors';
  const description =
    'For small nonprofits: find grants that fit, draft applications from your own documents, and keep up with deadlines and reports. Grant Autopilot from $5 a month, plus free tools.';

  const toolList = (slugs) => {
    const shown = slugs.filter(live);
    if (!shown.length) return '';
    return `<p class="ind-free-h">Free, no account:</p><ul class="ind-tools">${shown
      .map((s) => `<li><a href="${esc(`${TO_ROOT}${s}/`)}">${esc(TOOL_BLURBS[s] ?? s)}</a></li>`)
      .join('')}</ul>`;
  };

  const problems = PROBLEMS.map(
    (p) => `
      <section class="ind-problem" id="${esc(p.id)}">
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.body)}</p>
        <p class="ind-answer"><strong>${esc(ga.name)}:</strong> ${esc(p.product)}</p>
        ${toolList(p.tools)}
      </section>`,
  ).join('');

  const plans = ga.plans
    .map(
      (pl) => `<tr><th scope="row">${esc(pl.name)}</th><td>${esc(pl.monthly)}</td><td>${esc(pl.yearly)}</td><td>${esc(pl.drafts)}</td><td>${esc(pl.seats)}</td></tr>`,
    )
    .join('');

  const facts = Object.values(FACTS);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    about: { '@type': 'Audience', audienceType: 'Small nonprofit organizations' },
  };

  return withSiteHeader(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <link rel="icon" href="${esc(`${TO_ROOT}favicon.svg`)}" type="image/svg+xml">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:site_name" content="${esc(SITE_NAME)}">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
  <style>
    :root{--ind-bg:#f7f7f4;--ind-surface:#fff;--ind-text:#1d1d22;--ind-muted:#5c5b66;--ind-border:#e3e1da;--ind-accent:#2f4fb0}
    @media (prefers-color-scheme:dark){:root{--ind-bg:#111114;--ind-surface:#19191e;--ind-text:#ececf1;--ind-muted:#a3a2ad;--ind-border:#2c2c34;--ind-accent:#9fb0ff}}
    body{margin:0;background:var(--ind-bg);color:var(--ind-text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    main{max-width:860px;margin:0 auto;padding:0 16px 32px}
    a{color:var(--ind-accent)}
    .ind-hero{padding:28px 0 8px}
    .ind-hero h1{font-size:clamp(1.6rem,4.5vw,2.3rem);line-height:1.2;margin:.2rem 0 .6rem}
    .ind-eyebrow{font-size:14px;color:var(--ind-muted);margin:0}
    .ind-lede{color:var(--ind-muted);max-width:70ch}
    .ind-cta{display:inline-block;margin:6px 12px 6px 0;padding:10px 16px;border-radius:8px;background:var(--ind-accent);color:#fff;text-decoration:none;font-weight:600}
    @media (prefers-color-scheme:dark){.ind-cta{color:#111114}}
    .ind-problem,.ind-panel{background:var(--ind-surface);border:1px solid var(--ind-border);border-radius:12px;padding:16px 18px;margin:16px 0}
    .ind-problem h2,.ind-panel h2{font-size:1.2rem;margin:0 0 .4rem}
    .ind-answer{margin:.6rem 0}
    .ind-free-h{font-size:14px;color:var(--ind-muted);margin:.6rem 0 .2rem}
    .ind-tools{margin:0;padding-left:1.2rem}
    .ind-scroll{overflow-x:auto}
    table{border-collapse:collapse;width:100%;font-size:15px}
    th,td{text-align:left;border-bottom:1px solid var(--ind-border);padding:7px 8px;vertical-align:top}
    .ind-note{font-size:14px;color:var(--ind-muted)}
    .ind-facts li{margin:.3rem 0}
  </style>
</head>
<body>
  <main>
    <header class="ind-hero">
      <p class="ind-eyebrow">Industries › Nonprofits</p>
      <h1>For small nonprofits: grants, reports and donors without a development team</h1>
      <p class="ind-lede">Grant funding reaches the smallest nonprofits far less often than larger ones. ${esc(FACTS.candid.text)} <a href="${esc(FACTS.candid.url)}">Source</a>.</p>
      <p><a class="ind-cta" href="${esc(`${TO_ROOT}${ga.href}`)}">See ${esc(ga.name)}</a><a href="${esc(`${TO_ROOT}${ga.pricingHref}`)}">Compare plans</a></p>
    </header>

    <p>Below are four problems small nonprofits commonly run into, what ${esc(ga.name)} does about each, and the free tools on this site that help with them today, no account needed.</p>
${problems}

    <section class="ind-panel" id="grant-autopilot">
      <h2>${esc(ga.name)}</h2>
      <p>${esc(ga.headline)} It finds grants that fit your mission and drafts applications from your own documents and interviews. Each fact shows its source, anything it cannot verify is flagged, and your team decides what gets sent.</p>
      <div class="ind-scroll" tabindex="0" role="region" aria-label="${esc(ga.name)} plans">
        <table>
          <thead><tr><th scope="col">Plan</th><th scope="col">Monthly</th><th scope="col">Yearly</th><th scope="col">Drafts</th><th scope="col">Team</th></tr></thead>
          <tbody>${plans}</tbody>
        </table>
      </div>
      <p class="ind-note">${esc(ga.terms)} Prices as published on the <a href="${esc(`${TO_ROOT}${ga.pricingHref}`)}">pricing page</a>, which is the one to trust if they ever differ.</p>
      <p><a class="ind-cta" href="${esc(`${TO_ROOT}${ga.signupHref}`)}">Create an account</a></p>
      <p class="ind-note">${esc(ga.name)} drafts and organises applications; it does not decide funding, and no tool can promise an award.</p>
    </section>

    <section class="ind-panel" id="sources">
      <h2>Sources</h2>
      <ul class="ind-facts">${facts
        .map((f) => `<li>${esc(f.text)} <a href="${esc(f.url)}">${esc(f.source)}</a>.</li>`)
        .join('')}</ul>
    </section>
  </main>
  <footer>${footer}
  </footer>
${tail}
</body>
</html>
`,
    { toRoot: TO_ROOT, crumbs: [{ label: 'Nonprofits' }] },
  );
}

/** Writes the page into `outDir`; returns the site-relative path written. */
export async function buildNonprofitsPage(outDir, baseUrl, opts = {}) {
  const dir = path.join(outDir, NONPROFITS_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderNonprofitsPage({ baseUrl, ...opts }));
  return NONPROFITS_PATH;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=dist').slice(6);
  buildNonprofitsPage(out, 'https://marisstella.app/').then((p) => console.log(`wrote ${path.join(out, p)}index.html`));
}
