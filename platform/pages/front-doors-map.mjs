#!/usr/bin/env node
// Builds `front-doors.json`: which free tool pages, category pages and
// audience pages are front doors to which paid-product industry page
// (`industries/<slug>/`). The build reads the JSON (`front-doors.mjs`); this
// script is the only thing that writes it.
//
//   node platform/pages/front-doors-map.mjs           # rewrite front-doors.json
//   node platform/pages/front-doors-map.mjs --check   # exit 1 if it is stale
//
// Why (owner, 2026-11-24): free single-purpose tools are demoted; they matter
// as front doors to paid SMB products (`prompts/goals.md`, "Where effort
// goes"; `portfolio/monetization/bets.md`). A tool page links an industry page
// only when the person on it is plausibly the customer that product is for.
// A wrong pairing reads as an ad and costs the trust the free tool earned, so
// the rules are deliberately narrow and the uncertain cases are hand lists.
//
// How a tool is mapped, first match wins, in the order of INDUSTRIES:
//   1. `slugs`: hand-picked (read from each page on 2026-11-24);
//   2. `subcategories`: a trades shelf that is construction by definition;
//   3. `tokens`: a whole hyphen-separated word of the slug, but only in the
//      categories listed in `tokenCategories` (so `independent-contractor`
//      in UK tax or `amazon-s3` in CI never matches);
// minus `exclude` and minus the paid products themselves
// (portfolio/monetization/transition.json, "proprietary"): a product's own
// page is not a front door to itself.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const MAP_FILE = path.join(HERE, 'front-doors.json');

const BUSINESS_CATEGORIES = ['trades', 'sales', 'backoffice', 'bookkeeping', 'evidence', 'imports', 'logistics', 'services', 'marketplace', 'food-service', 'more'];

/**
 * The five industry pages (owned by the hub's renderers, not this file) and
 * what may honestly be said about the product behind each. Every product is
 * "in development — early access" except Grant Autopilot, which is live; none
 * of them is the free tool the line sits on (`note`).
 */
export const INDUSTRIES = {
  'eu-e-invoicing': {
    label: 'E-invoicing',
    product: 'E-invoice fix-and-explain for EU SMEs and their accountants: every failed rule in plain language, with a corrected file',
    status: 'In development — early access',
    slugs: ['eu-einvoicing-mandate-checker'],
  },
  nonprofits: {
    label: 'Nonprofits',
    product: 'Grant Autopilot, a hosted grants workspace for small nonprofits: deadlines, drafts and reports in one place',
    status: 'Early access',
    slugs: [
      'grant-deadline-tracker', 'grant-reporting-tracker', 'grant-indirect-cost-calculator', 'grant-writer-proposal-price-calculator',
      'donor-acknowledgment-letter-generator', 'donor-retention-analyzer', 'fundraising-event-net-calculator', 'volunteer-shift-scheduler',
    ],
  },
  manufacturing: {
    label: 'Manufacturing',
    product: 'RFQ-to-quote for CNC and fabrication job shops, and a CMMC and ISO 9001 workspace for small defense suppliers',
    status: 'In development — early access',
    slugs: [
      'cnc-machining-quote-calculator', 'job-shop-scheduler', 'laser-cutting-engraving-job-price-calculator', 'powder-coating-job-price-calculator',
      'mobile-welding-job-price-calculator', 'spc-control-charts', 'assembly-line-balancer', 'dxf-nesting', '3d-print-price-calculator',
      'machine-shop-guides',
    ],
    tokens: ['cnc', 'machining', 'cmmc', 'as9100', 'dfars', 'itar', 'fabrication', 'fabricator', 'manufacturing', 'manufacturer'],
    tokenCategories: BUSINESS_CATEGORIES,
  },
  construction: {
    label: 'Construction',
    product: 'Pay-app billing for subcontractors (G702/G703, retainage, lien waivers, change orders), growing into a contractor suite',
    status: 'In development — early access',
    slugs: [
      // Outdoor and envelope work done by building contractors; the rest of
      // those two shelves (lawn care, snow, cleaning) is service work.
      'deck-bid-calculator', 'fence-bid-calculator', 'pergola-bid-calculator', 'screened-porch-bid-calculator',
      'attic-insulation-bid-calculator', 'spray-foam-bid-calculator', 'basement-waterproofing-bid-calculator',
      'crawl-space-encapsulation-bid-calculator', 'asbestos-abatement-bid-calculator', 'radon-mitigation-bid-calculator',
      // "Getting paid & job margin" tools written for contractors.
      'bid-leveling-worksheet', 'contractor-bid-readiness', 'experience-mod-calculator', 'fixed-bid-overrun-forecaster',
      'handyman-minimum-job-calculator', 'hvac-repair-tier-price-calculator', 'job-margin-variance', 'plumber-flat-rate-price-calculator',
      'project-estimate-calibrator', 'quote-margin-check', 'coi-expiry-gap-checker', 'trade-bid-studio',
    ],
    subcategories: ['trades-mep', 'trades-roof', 'trades-openings', 'trades-interior', 'trades-site'],
    tokens: [
      'construction', 'contractor', 'contractors', 'subcontractor', 'retainage', 'lien', 'takeoff', 'submittal', 'surety',
      'change-order', 'aia', 'g702', 'drywall', 'roofing', 'framing', 'rebar', 'concrete', 'masonry', 'hvac', 'plumber',
      'plumbing', 'electrician', 'remodel', 'remodeling', 'homebuilder', 'davis-bacon', 'prevailing-wage', 'certified-payroll',
    ],
    tokenCategories: BUSINESS_CATEGORIES,
    // On a construction shelf, but not a building contractor's job.
    exclude: ['appliance-repair-quote-calculator', 'locksmith-bid-calculator', 'commercial-solar-ppa-lease-buy-calculator', 'home-staging-bid-calculator', 'auto-repair-effective-labor-rate'],
  },
  'online-sellers': {
    label: 'Online sellers',
    product: 'Profit and Schedule C books for resellers who sell on several platforms',
    status: 'In development — early access',
    // Not the whole marketplace shelf: it also holds short-term-rental hosts,
    // course creators, streamers and gig platforms, who are not this
    // product's customers. Resellers and store owners only.
    slugs: [
      'card-grading-submission-picker', 'liquidation-pallet-bid-calculator', 'storage-auction-max-bid-calculator',
      'thrift-haul-buy-picker', 'where-to-sell-calculator', 'marketplace-fee-compare', 'facebook-marketplace-fee-calculator',
      'print-on-demand-profit-calculator', 'ticket-resale-profit-calculator', '1099k-reconciliation-worksheet',
      'returns-policy-cost-analyzer', 'free-shipping-threshold-optimizer',
    ],
    tokens: [
      'ebay', 'etsy', 'amazon', 'poshmark', 'mercari', 'depop', 'whatnot', 'shopify', 'fba', 'reseller', 'resellers', 'resale',
      'tiktok-shop', 'walmart', 'faire', 'reverb', 'grailed', 'stockx', 'tcgplayer', 'discogs',
    ],
    tokenCategories: BUSINESS_CATEGORIES,
  },
};

/** Category and audience pages (`c/<id>/`) that are front doors as a whole. */
export const PAGE_DOORS = {
  trades: 'construction',
  marketplace: 'online-sellers',
  'for-roofers': 'construction',
  'for-hvac': 'construction',
  'for-plumbers': 'construction',
  'for-electricians': 'construction',
  'for-painters': 'construction',
  'for-etsy-sellers': 'online-sellers',
  'for-ebay-sellers': 'online-sellers',
  'for-amazon-sellers': 'online-sellers',
  'for-shopify-stores': 'online-sellers',
  'for-resellers': 'online-sellers',
};

function slugHasToken(slug, token) {
  // A token may itself be hyphenated (`change-order`): match it as a run of
  // whole words.
  return `-${slug}-`.includes(`-${token}-`);
}

/** The industry slug a tool maps to, or null. `category`/`subcategory` are ids. */
export function industryForTool(slug, { category, subcategory, proprietary = new Set() }) {
  if (proprietary.has(slug)) return null;
  for (const [id, rule] of Object.entries(INDUSTRIES)) {
    if (rule.exclude?.includes(slug)) continue;
    if (rule.slugs?.includes(slug)) return id;
    if (rule.categories?.includes(category)) return id;
    if (subcategory && rule.subcategories?.includes(subcategory)) return id;
    if (rule.tokens && (rule.tokenCategories ?? []).includes(category) && rule.tokens.some((t) => slugHasToken(slug, t))) return id;
  }
  return null;
}

export function proprietarySlugs(root = ROOT) {
  const t = JSON.parse(readFileSync(path.join(root, 'portfolio', 'monetization', 'transition.json'), 'utf8'));
  return new Set(t.proprietary.map((row) => row.venture));
}

export async function buildMap(root = ROOT) {
  const { categoryFor, subcategoryFor } = await import('./build.mjs');
  const proprietary = proprietarySlugs(root);
  const ventures = path.join(root, 'ventures');
  const slugs = readdirSync(ventures).filter((s) => statSync(path.join(ventures, s)).isDirectory()).sort();
  const tools = {};
  for (const slug of slugs) {
    const industry = industryForTool(slug, { category: categoryFor(slug).id, subcategory: subcategoryFor(slug)?.id ?? null, proprietary });
    if (industry) tools[slug] = industry;
  }
  // Hand lists must name real ventures: a renamed tool should fail here, not
  // silently drop out of the map.
  for (const [id, rule] of Object.entries(INDUSTRIES)) {
    for (const slug of rule.slugs ?? []) {
      if (!slugs.includes(slug)) throw new Error(`${id}: hand-listed ${slug} is not a venture`);
    }
  }
  const industries = Object.fromEntries(
    Object.entries(INDUSTRIES).map(([id, { label, product, status }]) => [id, { label, product, status }]),
  );
  return {
    about: 'Generated by platform/pages/front-doors-map.mjs (edit the rules there, then rerun it). Maps free tool slugs and category/audience page ids to the industry page (industries/<slug>/) of the paid product their visitors are plausibly customers for. Read by front-doors.mjs; a door renders only when its industry page is in the built site.',
    industries,
    pages: PAGE_DOORS,
    tools,
  };
}

export function serialise(map) {
  return `${JSON.stringify(map, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = serialise(await buildMap());
  if (process.argv.includes('--check')) {
    const current = readFileSync(MAP_FILE, 'utf8');
    if (current !== next) {
      console.error('front-doors.json is stale: run node platform/pages/front-doors-map.mjs');
      process.exit(1);
    }
    console.log('front-doors.json is current');
  } else {
    writeFileSync(MAP_FILE, next);
    const counts = {};
    for (const id of Object.values(JSON.parse(next).tools)) counts[id] = (counts[id] ?? 0) + 1;
    console.log(`wrote ${path.relative(ROOT, MAP_FILE)}:`, counts);
  }
}
