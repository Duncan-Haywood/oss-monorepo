/**
 * What the company is, what is live and what is in development: stated once,
 * read by the About page, the site `llms.txt` / `llms-full.txt` intro and the
 * Organization JSON-LD on the home page, so the three cannot disagree.
 *
 * Honesty rules (prompts/goals.md, Guardrails): the company is one owner plus
 * AI agents; no invented team, customers, revenue or press. Only a product a
 * visitor can use and pay for today goes in LIVE_PRODUCTS, and only live
 * products are named as offers in structured data. OPEN_FREE names hosted apps
 * a stranger can sign up to and use on a free plan today while their paid
 * plans are not on sale (checkout dark); they are linked, never offered as for
 * sale. IN_DEVELOPMENT names work
 * in progress with no price, date or customer claimed; its order and evidence
 * are in portfolio/monetization/bets.md. Change these lists in the PR that
 * changes what is actually live.
 */

/** One sentence, used as the llms.txt blockquote lead and the JSON-LD description. */
export const COMPANY_SUMMARY =
  'builds software for small and medium businesses (billing, quoting, paperwork and compliance), run by one owner with AI agents doing most of the building in public';

export const LIVE_PRODUCTS = Object.freeze([
  Object.freeze({
    name: 'Grant Autopilot',
    path: 'grants/',
    audience: 'small nonprofits',
    // Checked against the live page on 2026-11-24 (its meta description and
    // pricing section). No prices here: they live on the product's own page.
    summary:
      'finds grants that fit and drafts applications in which every fact cites the organisation\'s own documents; nothing is sent until a person approves it. Sold as a monthly or yearly subscription; its own pricing page states the plans.',
  }),
]);

/**
 * Open on a free plan (business.mjs status 'open-free'; the same URLs). Each
 * app's deploy record is in its ventures/<slug>/DEPLOY.md.
 */
export const OPEN_FREE = Object.freeze([
  Object.freeze({
    name: 'PayApps',
    url: 'https://payapps.marisstella.app/?signup&from=about',
    audience: 'specialty subcontractors and small general contractors',
    // ventures/payapps/apps/payapps/src/shared/plans.ts: Free is one active job.
    summary:
      'builds AIA-style G702/G703 pay applications from a schedule of values, with retainage and change orders, free on one active job with no card; lien waivers, QuickBooks and job costing are in paid plans that are not on sale yet',
  }),
  Object.freeze({
    name: 'Seller Books',
    url: 'https://seller-books.marisstella.app/signup',
    audience: 'resellers selling on several marketplaces',
    // ventures/seller-books/apps/seller-books/src/shared/plans.ts: Free is one platform, 25 orders a month.
    summary:
      'reads the sales reports eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Shopify, Amazon, TikTok Shop and Square let sellers download, tracks cost of goods and mileage, and builds profit by platform and a Schedule C worksheet (not tax advice); free for one platform and 25 orders a month, with paid plans not on sale yet',
  }),
]);

export const IN_DEVELOPMENT = Object.freeze([
  ['RFQ-to-quote', 'for CNC and fabrication job shops: a drawing or an emailed request in, a priced quote out'],
  ['E-invoice fix-and-explain', 'for small businesses and their accountants facing the German and French e-invoicing mandates: each failed rule explained, with a corrected file'],
  ['Compliance workspace', 'for small defense and aerospace shops working toward CMMC and ISO 9001'],
  ['Residential takeoff', 'for remodelers, roofers and framers: quantities and material lists from plan PDFs'],
]);

/**
 * The industries the products are built for, most weight first. Owner,
 * 2026-11-25: most kinds of small business ("most types of smbs"); the full
 * list, and which have a product yet, is INDUSTRIES in business.mjs.
 */
export const INDUSTRIES =
  'construction first (specialty subcontractors, general contractors, remodelers, roofers, estimators), then machine shops, fabricators, small manufacturers and engineering firms; online resellers; small nonprofits; and any small business facing the new e-invoicing formats. Free tools, with products to follow, also serve restaurants, home services, salons, health practices, fitness studios, retail shops, auto shops, professional services, landlords, trucking, farms, childcare and education, events, and freelancers';
