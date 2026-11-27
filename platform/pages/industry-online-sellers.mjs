// The online sellers industry page (`industries/online-sellers/`).
//
// Why this exists
// ---------------
// Bet #5 in portfolio/monetization/bets.md (2026-11-24) is reseller profit and
// Schedule C books: payout files from eBay, Etsy, Poshmark, Mercari, Whatnot,
// Depop and Shopify in, fees split out, cost of goods and mileage tracked, a
// Schedule C-ready profit and loss out. The site already has dozens of free
// seller calculators, each a door for one search ("ebay fee calculator").
// This page is the room behind those doors: it names the problems a
// multi-platform seller actually has, says which product is being built for
// them (open on its Free plan since 2026-11-27), and picks the strongest free
// tools as the way in.
//
// Honesty rules this page keeps (from the brief and bets.md):
//   - The hosted product is open on its Free plan (seller-books-deploy run
//     45973427499, 2026-11-27): the page says what Free does, using the app's
//     own limits (apps/seller-books/src/shared/plans.ts), and that paid plans
//     are not on sale; no price while checkout is dark. The same sentence is
//     on the free tools (ventures/reseller-books/seller-books-cta.mjs).
//   - Problem lines say what the app does today only where its README says it
//     ships; the rest stay "will".
//   - Not tax advice, on the page and in the FAQ data.
//   - No 1099-K fear: the federal threshold is stated plainly as $20,000 and
//     200 transactions, with the IRS's own page as the source.
//   - Every figure on the page links to its source. Fee rates are left to the
//     calculators, which carry their own sourced and tested numbers.
//
// The module imports only site-nav.mjs, not build.mjs, so build.mjs can import
// it without a cycle; build.mjs hands in the page head, the disclaimer and the
// chrome script (usage counting) through `shell`.
//
// Follow-up: a sibling session is building `platform/pages/business.mjs` (the
// home, `/products/` and `industries/` index). When it lands, the product data
// below (ONLINE_SELLERS_PRODUCT) should come from there and the breadcrumb
// should link the industries index.

import { renderSiteHeader, renderSiteFooterNav } from './site-nav.mjs';

export const ONLINE_SELLERS_PATH = 'industries/online-sellers/';
const TO_ROOT = '../../';

/** Sources quoted on the page. Each fact on the page points at one of these. */
export const ONLINE_SELLERS_SOURCES = Object.freeze({
  irs1099k: {
    label: 'IRS: FAQs on the Form 1099-K threshold under the One Big Beautiful Bill',
    url: 'https://irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000',
  },
});

/**
 * The product being built for this industry. Local data until business.mjs
 * lands on main (see the follow-up note above).
 */
export const ONLINE_SELLERS_PRODUCT = Object.freeze({
  name: 'Seller Books',
  status: 'Open · free on one platform',
  // The deployed app; `from` names this page for a later sign-up source report.
  appUrl: 'https://seller-books.marisstella.app/signup?from=industries%2Fonline-sellers',
  free: 'The Free plan is one platform, one user and up to 25 orders a month, with no card, and every report on it: profit by platform and month, the stock report, the Schedule C worksheet and the exports for your preparer. Plans for more platforms and more orders are not on sale yet.',
  pitch: 'One set of books for everywhere you sell. Drop in the payout and sales reports from each marketplace; get fees split out, cost of goods and mileage tracked, and a profit and loss grouped the way Schedule C asks for it.',
  does: [
    'Reads the sales and payout reports you download from eBay, Etsy, Poshmark, Mercari, Whatnot and Depop. No bank link and no marketplace login needed.',
    'Splits each sale into what the buyer paid, platform fees, payment processing, shipping labels, ads and refunds, so the payout reconciles to the sales.',
    'Tracks what you paid for each item, so profit is real profit, by item, by channel and by month.',
    'Logs business miles for sourcing runs and post office trips.',
    'Reads your card or bank statement CSV for expenses: postage and packaging start ticked, thrift buys and fuel are left out with the reason, and it remembers how you filed each merchant, including the personal ones you leave out.',
    'Groups the year under Schedule C lines for you or your preparer, and says where a line is a judgment call.',
  ],
  freeSlug: 'reseller-books',
});

/**
 * The problems, in the seller's words, each answered by what the product does
 * and the free tools that cover part of it today. `tools` are slugs from
 * ONLINE_SELLERS_TOOLS.
 */
export const ONLINE_SELLERS_PROBLEMS = Object.freeze([
  {
    id: 'true-profit',
    q: '“I sold $3,000 last month. What did I actually make?”',
    body: 'Every marketplace takes its cut differently: a final value fee here, a flat fee under a price line there, payment processing, promoted listings, shipping labels bought through the platform. The sales figure on the dashboard is not what lands in your bank, and what lands in your bank is not profit until the cost of the item comes out.',
    product: 'Seller Books puts every channel into one ledger and shows profit by platform and by month, after fees, postage, refunds and what each item cost you.',
    tools: ['ebay-fee-calculator', 'poshmark-fee-calculator', 'marketplace-fee-compare'],
  },
  {
    id: 'payouts',
    q: '“My payouts never match my sales.”',
    body: 'A payout bundles several orders, holds back fees and label costs, nets out refunds and sometimes arrives days after the sale, so it rarely lines up with one order or one month. Reconciling by hand means opening every report side by side.',
    product: 'Seller Books will check that sales, refunds and deductions add up to the net payout for every month and channel, and shows the line that does not.',
    tools: ['ebay-transaction-report-analyzer', 'poshmark-sales-report-analyzer'],
  },
  {
    id: 'cogs',
    q: '“I have no idea what I paid for half my inventory.”',
    body: 'Cost of goods is the number resellers most often skip, and without it there is no profit figure, only a sales figure. It is also what decides whether a thrift haul was worth buying.',
    product: 'Seller Books will keep a cost against each item and withhold a profit figure for a channel until every sale on it has a cost, rather than guessing.',
    tools: ['thrift-haul-buy-picker'],
  },
  {
    id: 'mileage',
    q: '“Do my sourcing trips count?”',
    body: 'Driving to estate sales, thrift stores and the post office for the business is business mileage, and a deduction is only as good as the log behind it.',
    product: 'Seller Books logs trips (typed in, or read from a mileage tracker app\'s CSV) and prices each at the IRS standard rate on the day it was driven.',
    tools: ['mileage-log', 'mileage-deduction-calculator'],
  },
  {
    id: 'schedule-c',
    q: '“Tax time: which number goes where?”',
    body: 'A preparer wants gross receipts, returns, cost of goods sold and expenses by category, not five marketplace exports in five shapes.',
    product: 'Seller Books groups the year under Schedule C lines and hands over one worksheet, with the judgment calls marked for you or your preparer.',
    tools: ['1099k-reconciliation-worksheet'],
  },
  {
    id: 'thresholds',
    q: '“Will I get a 1099-K, and do I owe sales tax in other states?”',
    body: 'For federal Form 1099-K, a marketplace reports you when your payments pass $20,000 and 200 transactions in a year, per the IRS. Some states set lower reporting thresholds. Either way, the form is a report, not a tax: income is income whether a form arrives or not. Selling on your own store can also create sales tax obligations in other states once your sales there pass that state\'s threshold.',
    source: 'irs1099k',
    product: 'Seller Books checks a platform\'s 1099-K against your books, box 1a and each month, and names the months that do not match.',
    tools: ['1099-k-threshold-checker', 'economic-nexus-threshold-tracker'],
  },
]);

/**
 * The free front doors, chosen from the dozens of seller tools on the site:
 * the per-platform fee calculators sellers
 * search for by name, the cross-platform comparison, report analyzers for eBay
 * and Poshmark, sourcing, mileage, and the year-end
 * worksheets. Order is the order shown.
 */
export const ONLINE_SELLERS_TOOLS = Object.freeze([
  { slug: 'ebay-fee-calculator', name: 'eBay fee and profit calculator', what: 'Final value fee, promoted listings and shipping against what you paid for the item.' },
  { slug: 'etsy-profit-calculator', name: 'Etsy profit calculator', what: 'Listing, transaction and processing fees, and the net profit on one sale.' },
  { slug: 'poshmark-fee-calculator', name: 'Poshmark fee calculator', what: 'What you keep after Poshmark\'s fee on a sale.' },
  { slug: 'mercari-fee-calculator', name: 'Mercari fee calculator', what: 'What you keep after Mercari\'s fees on a sale.' },
  { slug: 'whatnot-seller-payout', name: 'Whatnot payout calculator', what: 'Commission and processing on a live-show sale.' },
  { slug: 'depop-fee-calculator', name: 'Depop fee calculator', what: 'What you keep after Depop\'s fees on a sale.' },
  { slug: 'marketplace-fee-compare', name: 'Marketplace fee comparison', what: 'The same item priced on each platform, side by side: which channel nets the most.' },
  { slug: 'ebay-transaction-report-analyzer', name: 'eBay transaction report analyzer', what: 'Your eBay report turned into fees and profit per item.' },
  { slug: 'poshmark-sales-report-analyzer', name: 'Poshmark sales report analyzer', what: 'Profit per item and per brand from your Poshmark sales report.' },
  { slug: 'thrift-haul-buy-picker', name: 'Thrift haul buy picker', what: 'What to buy and the most to pay, from the price it will sell for.' },
  { slug: 'mileage-log', name: 'Mileage log', what: 'A trip log for sourcing runs, kept in your browser.' },
  { slug: 'mileage-deduction-calculator', name: 'Mileage deduction calculator', what: 'Standard mileage against actual vehicle costs for the year.' },
  { slug: '1099k-reconciliation-worksheet', name: '1099-K reconciliation worksheet', what: 'What a platform reported against what you actually earned.' },
  { slug: '1099-k-threshold-checker', name: '1099-K threshold checker', what: 'Whether a platform is likely to send you a 1099-K, federal and state.' },
  { slug: 'economic-nexus-threshold-tracker', name: 'Economic nexus threshold tracker', what: 'Which states\' sales tax thresholds your sales have crossed.' },
]);

/** The seller audience pages (audiences.mjs) the page links as "more tools". */
export const ONLINE_SELLERS_AUDIENCES = Object.freeze([
  { id: 'resellers', label: 'resellers' },
  { id: 'ebay-sellers', label: 'eBay sellers' },
  { id: 'etsy-sellers', label: 'Etsy sellers' },
  { id: 'amazon-sellers', label: 'Amazon sellers' },
  { id: 'shopify-stores', label: 'Shopify stores' },
]);

/** Plain-text questions and answers, shown on the page and repeated as FAQPage data. */
export const ONLINE_SELLERS_FAQ = Object.freeze([
  ['Can I use Seller Books today?', 'Yes. It is open on a Free plan: one platform, one user and up to 25 orders a month, with no card. Plans for more platforms are not on sale yet. The free Reseller Books tool on this site also reads several marketplaces\' reports together in your browser, with no account.'],
  ['Which platforms does it cover?', 'Seller Books imports reports from eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square, and takes cash and local sales typed in one at a time. The free fee calculators cover single sales on these and more.'],
  ['Do I need to connect my bank or marketplace accounts?', 'No. It works from the reports each marketplace lets you download, so nothing needs your login or a bank link.'],
  ['Is this tax advice?', 'No. It organises your numbers and groups them the way Schedule C asks for them. What to deduct and how to file is for you or a tax professional to decide.'],
  ['When does a marketplace send a 1099-K?', 'Federally, when your payments on that platform pass $20,000 and 200 transactions in a calendar year, according to the IRS. Some states report at lower amounts. Income is taxable whether or not a form is sent.'],
  ['What if a report does not import?', 'Tell us which platform and report it is, using the feedback link on this page. Importers are checked against real reports, so a file that will not read is the most useful thing to send.'],
]);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** JSON for a <script> block: `<` escaped so text can never close the tag. */
const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

export const ONLINE_SELLERS_STYLE = `
.os-problems{list-style:none;padding:0;margin:1rem 0;display:grid;gap:1rem}
.os-problem{border:1px solid var(--line,#d8d8d8);border-radius:10px;padding:1rem 1.1rem}
.os-problem h3{margin:0 0 .4rem;font-size:1.05rem}
.os-problem p{margin:.35rem 0}
.os-fix{font-weight:600}
.os-tools{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));list-style:none;padding:0;margin:1rem 0}
.os-tools li{border:1px solid var(--line,#d8d8d8);border-radius:10px;padding:.8rem 1rem}
.os-tools a{font-weight:600}
.os-tools span{display:block;font-size:.95rem;margin-top:.25rem}
.os-status{display:inline-block;font-size:.85rem;font-weight:600;padding:.15rem .55rem;border-radius:999px;border:1px solid currentColor}
.os-cta{display:flex;flex-wrap:wrap;gap:.75rem;margin:1rem 0}
.os-cta a{display:inline-block;padding:.6rem 1rem;border-radius:8px;border:1px solid currentColor;text-decoration:none;font-weight:600}
.os-sources{font-size:.9rem}
`;

/** The tools to show: those in ONLINE_SELLERS_TOOLS that the build published. */
export function onlineSellersTools(surfaces = []) {
  const shipped = new Set(surfaces.map((s) => s.slug));
  return ONLINE_SELLERS_TOOLS.filter((t) => shipped.has(t.slug));
}

/**
 * @param {object} o
 * @param {string} o.baseUrl site root with a trailing slash
 * @param {Array<{slug: string}>} o.surfaces published ventures; tools not in it are left out
 * @param {object} o.shell what only build.mjs knows how to draw:
 *   head({title, description, url, toRoot, baseUrl, extraHead}) -> '<!doctype html>...</head>',
 *   disclaimer -> the site disclaimer HTML for this page,
 *   tail -> scripts before </body> (the chrome script, which counts usage)
 */
export function renderOnlineSellersPage({ baseUrl, surfaces = [], shell }) {
  const toRoot = TO_ROOT;
  const url = `${baseUrl}${ONLINE_SELLERS_PATH}`;
  const shipped = new Set(onlineSellersTools(surfaces).map((t) => t.slug));
  const tool = (slug) => ONLINE_SELLERS_TOOLS.find((t) => t.slug === slug);
  const toolLink = (slug) => `<a href="${esc(`${toRoot}${slug}/`)}">${esc(tool(slug).name)}</a>`;
  const product = ONLINE_SELLERS_PRODUCT;
  const freeShipped = shipped.has(product.freeSlug) || surfaces.some((s) => s.slug === product.freeSlug);
  const freeUrl = `${toRoot}${product.freeSlug}/`;
  const feedbackUrl = `${toRoot}feedback/?type=idea&tool=${product.freeSlug}`;
  const src = ONLINE_SELLERS_SOURCES;

  const title = 'Bookkeeping and profit tools for online sellers and resellers';
  const description = 'For resellers and small shops selling on eBay, Etsy, Poshmark, Mercari, Whatnot, Depop, Shopify and Amazon: true profit after fees, payouts that match sales, cost of goods, mileage and Schedule C, in one place.';

  const problems = ONLINE_SELLERS_PROBLEMS.map((p) => {
    const tools = p.tools.filter((s) => shipped.has(s));
    const source = p.source ? ` <a href="${esc(src[p.source].url)}" rel="noopener">Source: IRS</a>.` : '';
    return `
        <li class="os-problem" id="${esc(p.id)}">
          <h3>${esc(p.q)}</h3>
          <p>${esc(p.body)}${source}</p>
          <p class="os-fix">${esc(p.product)}</p>${tools.length ? `
          <p>Free today: ${tools.map(toolLink).join(', ')}.</p>` : ''}
        </li>`;
  }).join('');

  const tools = onlineSellersTools(surfaces).map((t) => `
        <li><a href="${esc(`${toRoot}${t.slug}/`)}">${esc(t.name)}</a><span>${esc(t.what)}</span></li>`).join('');

  const audiences = ONLINE_SELLERS_AUDIENCES.map((a) => `<a href="${esc(`${toRoot}c/for-${a.id}/`)}">${esc(a.label)}</a>`).join(', ');

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: ONLINE_SELLERS_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return `${shell.head({ title, description, url, toRoot, baseUrl, extraHead: `<style>${ONLINE_SELLERS_STYLE}</style>\n  <script type="application/ld+json">${ldJson(faqLd)}</script>` })}
<body>
  ${renderSiteHeader({ toRoot, crumbs: [{ label: 'For online sellers', echo: false }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">For online sellers and resellers</p>
      <h1>Know what you actually made, on every platform you sell on.</h1>
      <p class="lede">You list on eBay, Poshmark, Mercari, Etsy, Whatnot, Depop, maybe your own Shopify store or Amazon. Each one pays out on its own schedule, takes its fees its own way and hands you a report in its own shape. ${esc(product.name)} turns all of that into one set of books: real profit after fees and cost of goods, mileage logged, a 1099-K checked against your books, and a Schedule C worksheet at the end of the year.</p>
      <p class="os-cta">
        <a href="${esc(product.appUrl)}">Start free in ${esc(product.name)}</a>${freeShipped ? `
        <a href="${esc(freeUrl)}">Try the in-browser tool, no account</a>` : ''}
        <a href="#free-tools">Free seller calculators</a>
      </p>
    </header>
    <main class="prose">
      <h2>The problems this is for</h2>
      <ul class="os-problems">${problems}
      </ul>

      <h2 id="product">${esc(product.name)} <span class="os-status">${esc(product.status)}</span></h2>
      <p>${esc(product.pitch)}</p>
      <ul>${product.does.map((d) => `
        <li>${esc(d)}</li>`).join('')}
      </ul>
      <p>${esc(product.free)} <a href="${esc(product.appUrl)}">Start free in ${esc(product.name)}</a>.</p>
      <p>${freeShipped ? `Rather not make an account? The free <a href="${esc(freeUrl)}">Reseller Books</a> tool does the core of it in your browser, with nothing uploaded. ` : ''}A report that will not import, or a platform we do not read yet: <a href="${esc(feedbackUrl)}">tell us which</a>.</p>

      <h2 id="free-tools">Free tools for sellers</h2>
      <p>Each answers one question on one sale or one report, free, with no account.</p>
      <ul class="os-tools">${tools}
      </ul>
      <p>More free tools for ${audiences}.</p>

      <h2>Questions sellers ask</h2>
      <dl class="cd-faq">${ONLINE_SELLERS_FAQ.map(([q, a]) => `
        <dt>${esc(q)}</dt>
        <dd>${esc(a)}</dd>`).join('')}
      </dl>

      <p><strong>Not tax advice.</strong> These tools organise and estimate; they do not tell you what to deduct or how to file. Check with a tax professional for your situation.</p>
      <p class="os-sources">Sources: <a href="${esc(src.irs1099k.url)}" rel="noopener">${esc(src.irs1099k.label)}</a>. Platform fee rates are in each calculator, with that calculator's own sources.</p>
    </main>

    <footer>
      ${shell.disclaimer}
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  ${shell.tail || ''}
</body>
</html>
`;
}
