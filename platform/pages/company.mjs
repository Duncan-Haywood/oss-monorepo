/**
 * What the company is, what is live and what is in development: stated once,
 * read by the About page, the site `llms.txt` / `llms-full.txt` intro and the
 * Organization JSON-LD on the home page, so the three cannot disagree.
 *
 * Honesty rules (prompts/goals.md, Guardrails): the company is one owner plus
 * AI agents; no invented team, customers, revenue or press. Only a product a
 * visitor can use and pay for today goes in LIVE_PRODUCTS, and only live
 * products are named as offers in structured data. IN_DEVELOPMENT names work
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

export const IN_DEVELOPMENT = Object.freeze([
  ['Pay applications and retainage', 'for specialty subcontractors and small general contractors: AIA-style pay apps, retainage, lien waivers and change orders, growing into a contractor suite'],
  ['RFQ-to-quote', 'for CNC and fabrication job shops: a drawing or an emailed request in, a priced quote out'],
  ['E-invoice fix-and-explain', 'for small businesses and their accountants facing the German and French e-invoicing mandates: each failed rule explained, with a corrected file'],
  ['Compliance workspace', 'for small defense and aerospace shops working toward CMMC and ISO 9001'],
  ['Profit and books for resellers', 'for people selling across several marketplaces'],
  ['Residential takeoff', 'for remodelers, roofers and framers: quantities and material lists from plan PDFs'],
]);

/**
 * The industries the products are built for, most weight first. Owner,
 * 2026-11-25: most kinds of small business ("most types of smbs"); the full
 * list, and which have a product yet, is INDUSTRIES in business.mjs.
 */
export const INDUSTRIES =
  'construction first (specialty subcontractors, general contractors, remodelers, roofers, estimators), then machine shops, fabricators, small manufacturers and engineering firms; online resellers; small nonprofits; and any small business facing the new e-invoicing formats. Free tools, with products to follow, also serve restaurants, home services, salons, health practices, fitness studios, retail shops, auto shops, professional services, landlords, trucking, farms, childcare and education, events, and freelancers';
