#!/usr/bin/env node
// Assembles every static, browser-runnable venture surface in this monorepo
// into ONE GitHub Pages site.
//
// Why this exists
// ---------------
// GitHub serves exactly one Pages site per repository. Before this script the
// only workflow that could publish one built `retail-pilot-intel`'s
// passcode-gated docs app — so the owner's single Pages-enable flip
// (`PAGES_ENABLED`; see `platform/pages/README.md` for why it is not spelled
// `GITHUB_PAGES_ENABLED`)
// would have put an internal docs site live and left ~30 finished, tested,
// free calculators with no public URL at all. Deploy-first (portfolio/DIRECTION.md)
// means the flip has to publish the products, so the site the flip publishes
// has to *be* the products.
//
// Discovery is automatic on purpose. A calculator lands on `main` here most
// days; a hand-maintained manifest would be stale within a week and the new
// tool would silently never be reachable. Anything that grows a browser entry
// point is published on the next push, and `EXCLUDED_SLUGS` is the deliberate
// opt-out.

import { promises as fs, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { decodeEntities } from './entities.mjs';
import {
  FEED_MAX_ENTRIES,
  feedUpdatedAt,
  isIsoDate,
  loadLaunchDates,
  orderForFeed,
} from './launched.mjs';

import {
  ICONS,
  OFFLINE_SIZE_MARKER,
  OFFLINE_WIDGET_HTML,
  OFFLINE_WIDGET_SCRIPT,
  THEME_COLOR,
  injectOfflineSupport,
  offlineBundleSizeLabel,
  renderIcon,
  renderKillSwitchWorker,
  renderManifest,
  renderOfflinePage,
  renderServiceWorker,
  renderSocialCard,
} from './offline.mjs';
import {
  SHOP_RATES_MODULE_FILE,
  SHOP_RATES_STYLE_FILE,
  injectShopRates,
  renderShopRatesModule,
  renderShopRatesStyle,
} from './rates.mjs';
import {
  BID_FOLLOW_UP_HELPERS,
  BID_PRICING_HELPERS,
  BID_RECORD_HELPERS,
  SAVED_BIDS_MODULE_FILE,
  SAVED_BIDS_STYLE_FILE,
  injectSavedBids,
  pageHeadlineAmountSelector,
  renderSavedBidsModule,
  renderSavedBidsStyle,
  stripForInjection,
} from './jobs.mjs';
import {
  BID_LINK_MODULE_FILE,
  injectBidLink,
  renderBidLinkModule,
} from './link.mjs';
import {
  DEFAULT_EMBED_HEIGHT,
  EMBED_HOST_FILE,
  EMBED_MODULE_FILE,
  EMBED_QUERY_PARAM,
  EMBED_STYLE_FILE,
  injectEmbedWidget,
  renderEmbedHostModule,
  renderEmbedModule,
  renderEmbedStyle,
} from './embed.mjs';
import {
  INVALID_MODULE_FILE,
  INVALID_STYLE_FILE,
  injectInvalidField,
  renderInvalidModule,
  renderInvalidStyle,
} from './invalid.mjs';
import { BACKUP_WIDGET_HTML, BACKUP_WIDGET_SCRIPT } from './backup.mjs';
import { REFLOW_CSS, WRAP_TABLES_JS, injectReflow } from './reflow.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

// Owner-overridable at build time; this default is where GitHub serves a
// project Pages site for this repository.
export const DEFAULT_BASE_URL = 'https://duncan-haywood.github.io/monorepo-projects/';

// The placeholder origin every venture's sitemap.xml and canonical tags were
// written against, back when no real origin existed. Rewriting it is what
// turns already-written SEO into SEO that points at a reachable page.
const PLACEHOLDER_ORIGIN = 'https://example.invalid/';

// Where a venture's public entry point may live, in preference order.
//
// Exported because this build is not the only thing that has to answer "is
// this venture a static page, and where does it start?". The apex tool mirror
// (`platform/marketing/front-door-tools.mjs`) answers the same question for
// the front door, and every time the two have disagreed the apex has silently
// dropped ventures this build publishes — six of them on 2026-09-03, when the
// mirror knew only the flat `index.html`. Importing the rule is what keeps a
// third divergence from being possible.
export const ENTRY_CANDIDATES = ['index.html', path.join('site', 'index.html')];

// Ventures whose public surface is not at one of the standard paths.
//
// Exported for the same reason as ENTRY_CANDIDATES, and it is the half that
// actually went wrong: the mirror grew the `site/` candidate but never learned
// that overrides exist at all, so `ai-engineering-academy`'s hub and its six
// calculators were reported as "not a static page the mirror can serve" while
// this build was publishing all seven.
export const ENTRY_OVERRIDES = {
  // Six electronics calculators behind their own hub page.
  'ai-engineering-academy': 'tools',
};

// Not products a stranger should land on.
const EXCLUDED_SLUGS = new Set([
  // Passcode-gated internal docs that need a pnpm build of its own; it keeps
  // its own workflow and its own (now separately gated) deploy.
  'retail-pilot-intel',
  // Infrastructure for the agent fleet, explicitly kept off the public path
  // by portfolio/hosting/README.md.
  'ubuntu-agent-server',
]);

/**
 * Words a tool should answer to that its own copy never uses.
 *
 * Stemming closes the gap between "fence" and "fences". It cannot close the
 * gap between two different words for the same job, and that gap is where the
 * searcher usually stands: the trade writes "pressure washing" and the
 * customer types "power washing"; the tool is a "snow removal" calculator and
 * the search is "snow plowing". Each entry below was a query that returned
 * zero results against the built catalogue while the listed tool sat there.
 *
 * Keyed by slug substring rather than by an indexed word, because a word
 * trigger misfires: keying "air conditioning" off the token "pressure" would
 * hang it on the well-pump calculator. A slug is explicit about which tools
 * an alias reaches, which also makes a wrong entry easy to spot in review.
 * The cost is that a new venture gets no aliases until someone adds a line.
 *
 * These widen a card's index only. Nothing is removed, so no alias can take
 * away a result a query already found.
 */
export const SEARCH_ALIASES = [
  { slug: 'pressure-washing', add: 'power washing powerwashing soft wash softwash' },
  { slug: 'window-cleaning', add: 'window washing washer squeegee' },
  { slug: 'junk-removal', add: 'hauling haul away cleanout clean out debris' },
  { slug: 'snow-removal', add: 'plowing plow shoveling shovel deicing' },
  // "removal" earns its place: the matcher ANDs across words, so "wildlife
  // removal" found nothing while "wildlife" alone found this tool.
  { slug: 'pest-control', add: 'termite termites bedbug bed bugs roaches ants exterminator wildlife removal trapping' },
  { slug: 'gutter-cleaning', add: 'downspout leaves' },
  // Both tools price cooling work; neither says "air conditioning" outright.
  { slug: 'mini-split', add: 'air conditioning conditioner cooling ductless' },
  { slug: 'hvac-maintenance', add: 'air conditioning conditioner cooling heating furnace' },
  // A whole-room search is how people shop for these, and no single tool
  // carries both words, so the matcher's AND across words found nothing.
  { slug: 'kitchen-tile-backsplash', add: 'kitchen remodel renovation' },
  { slug: 'countertop', add: 'kitchen remodel renovation' },
  { slug: 'cabinet-refinishing', add: 'kitchen remodel renovation' },
  { slug: 'walk-in-shower', add: 'bathroom remodel renovation' },
  { slug: 'walk-in-tub', add: 'bathroom remodel renovation' },
  { slug: 'toilet-replacement', add: 'bathroom remodel renovation' },
  { slug: 'basement-finishing', add: 'basement remodel renovation' },
  // The trade writes "security camera"; the customer, the search engine, and
  // half the installers write "CCTV". `nvr`/`dvr` are the head end this tool
  // actually prices, and "low voltage" is the trade that bids the work.
  // Deliberately NOT here: alarm, access control, structured cabling. An alias
  // only widens, so a word this tool does not price would put it in front of
  // someone pricing a different job — reach bought with a wrong answer.
  { slug: 'security-camera', add: 'cctv surveillance nvr dvr ip camera poe low voltage lowvoltage' },
  // The roof this tool prices is the one nobody calls "a reroof" when they
  // search for it. Its own copy says "reroof", "squares", "pitch" and
  // "tear-off" — every word of the trade's vocabulary and none of the
  // material's, so "shingle", the single most obvious query a homeowner or a
  // roofer types, returned nothing at all. Not added to the flat-roof or
  // metal-roof calculators: those price membrane and panel, and a shingle
  // query reaching them is the wrong answer rather than a wider one.
  { slug: 'roofing', add: 'shingle shingles asphalt architectural laminate three tab dimensional' },
  // "Sod" is the trade word for what the customer calls grass. The lawn-care
  // route tool is the recurring-service half of the same query.
  { slug: 'sod-install', add: 'grass turfgrass' },
  { slug: 'lawn-care', add: 'grass mowing mow mower cutting' },
  // Priced by the yard and the landfill ticket, sold to the customer as a
  // dumpster or a truckload.
  { slug: 'junk-removal', add: 'dumpster truckload truck load' },
  // "AC" is how this equipment is asked for everywhere except its own spec
  // sheet. Both tools already answer "air conditioning" through the alias
  // above; neither answered the two letters people actually type. "unit" rides
  // along because the query is nearly always "ac unit", and the matcher ANDs
  // across words — "ac" alone would still have found nothing.
  { slug: 'mini-split', add: 'ac unit units' },
  { slug: 'hvac-maintenance', add: 'ac unit units' },
  // "Tuckpointing" and "repointing" name the same job; a homeowner or GC
  // typing either word, or the material ("mortar", "brick", "masonry"),
  // found nothing, because the tool's own copy only ever says
  // "tuckpointing" and "wall".
  { slug: 'tuckpointing', add: 'brick masonry mortar repointing brickwork' },
  // The trade word for what this tool prices is "hardscape" or
  // "hardscaping"; the tool's own copy says "paver" and "patio" but never
  // the word the industry and the customer both search first.
  { slug: 'paver-patio', add: 'hardscape hardscaping' },
  // The regulation that drives most of this tool's demand is never named in
  // its own copy, so a search for the term that actually motivates the
  // purchase ("ADA ramp", "wheelchair accessibility") found nothing.
  { slug: 'wheelchair-ramp', add: 'ada accessibility accessible' },
  // "Sheetrock" is the genericized brand name half the trade uses instead
  // of "drywall".
  { slug: 'drywall', add: 'sheetrock' },
  // The professional a homeowner searches for tree work by title.
  { slug: 'tree-service', add: 'arborist' },
  // The pump type most residential wells actually use, and the word a
  // customer researching a quote is as likely to type as "well pump".
  { slug: 'well-pump', add: 'submersible' },
  // "Replacement" does not stem down to "replace" under the suffix list
  // above (no `-ment` rule), so a query built around the word a customer
  // actually uses — "pool liner replacement" — matched nothing even though
  // the tool's own copy says "replace" throughout.
  { slug: 'vinyl-liner', add: 'replacement replacing' },
];

/**
 * The alias words for one venture, or '' when it has none.
 *
 * The key is matched against the slug's `-`-separated words as a contiguous
 * run, not as a raw substring. A substring test reads a slug as one long
 * string and cannot see where a word starts, so it silently attaches an alias
 * to a tool that merely *ends* the same way: `basement-waterproofing-bid-
 * calculator` contains the substring `roofing-bid-calculator`, so keying the
 * shingle words above off `roofing` — or even off the full roofing slug —
 * would have put "shingle" in front of someone pricing a French drain. That is
 * the failure the comment above this table warns about, arriving through the
 * matcher rather than through a badly chosen word.
 */
export function aliasesFor(slug) {
  const words = String(slug).split('-');
  const claims = (key) => {
    const wanted = String(key).split('-');
    return words.some((_, start) =>
      wanted.every((word, offset) => words[start + offset] === word));
  };
  return SEARCH_ALIASES.filter((alias) => claims(alias.slug))
    .map((alias) => alias.add)
    .join(' ');
}

// Never shipped to a visitor: test payload they would download for no benefit,
// repo bookkeeping, or a per-venture robots.txt that crawlers never read
// (only the one at the origin root counts).
// `package.json` is on the list for the same reason its lockfile already was:
// two ventures ship one, a visitor downloads none of it, and publishing it puts
// internal script names and dependency versions on a public URL for no benefit.
// The rule below this one is by extension, so `.json` alone does not catch it —
// and `.json` has to stay publishable for JSON-LD payloads and web manifests.
const EXCLUDED_FILES = new Set([
  'VENTURE.yaml', 'robots.txt', 'README.md', 'package.json', 'package-lock.json',
]);
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.cache', 'tests', '__pycache__']);
// `foo.test.mjs` is the house convention, but it is a convention rather than a
// rule, and two ventures did not follow it: `retainage-cashflow-calculator`
// ships its suite as `test.mjs` and `freelance-retainer-calculator` as
// `test_app.mjs`. Both were being copied to the public site, where a visitor
// downloads none of it and a crawler can index the venture's internal
// assertions. Cover the other spellings a test file is given.
const isTestFile = (name) =>
  /(^|\.)test\.(mjs|js|cjs|py)$/.test(name) || /^test_/.test(name) || /_test\.(mjs|js|cjs|py)$/.test(name);

// Several ventures ship a browser tool *and* a CLI from the same directory
// (einvoice-preflight is both a Python package and a static page). A visitor
// downloads none of the CLI, so it is not part of the Pages payload. The rule
// is by extension rather than by directory name, because a venture is free to
// keep browser modules in `src/` too.
const NON_WEB_EXTENSIONS = new Set([
  '.py', '.toml', '.cfg', '.ini', '.lock', '.yaml', '.yml', '.sh', '.ts', '.tsx', '.md',
]);

// Files whose contents get the placeholder origin swapped for the real one.
const REWRITABLE = new Set(['.html', '.xml', '.txt', '.json', '.mjs', '.js', '.webmanifest']);

// Ordered: the first rule whose test matches wins.
const CATEGORY_RULES = [
  {
    id: 'marketplace',
    title: 'Marketplace seller tools',
    blurb: 'Price a listing, a fee change, or a program before you opt in — with your own cost of goods in the arithmetic.',
    // The share-card field colour for every tool in this section — see
    // `socialCardFileFor` and `SOCIAL_CARD_ACCENTS` below for why each
    // category gets its own tint. This one is the site's own brand teal.
    accent: '#12594a',
    // `tiktok-shop` and `delivery-app` sell through someone else's storefront and
    // pay someone else's fee schedule, which is what this section is: they sat in
    // the catch-all, where a seller looking for their marketplace never scrolled.
    //
    // `marketplace-fee-compare` is the cross-channel tool the rest of this
    // section feeds into, so it belongs here for the same reason — landing in
    // the catch-all would hide the one page that answers "which of these?" from
    // the readers of all the pages that answer "how much on this one?".
    // `str-host` is an Airbnb-vs-Vrbo payout calculator: a host comparing two
    // marketplaces' fee schedules on one booking, which is this section's exact
    // job. It sat in the catch-all because the slug does not start with a
    // storefront's name.
    test: (slug) => /^(amazon|ebay|etsy|shopify-fee|faire|reverb|walmart|where-to-sell|tiktok-shop|delivery-app|marketplace-fee-compare|str-host)/.test(slug),
  },
  {
    id: 'trades',
    title: 'Trade & contractor bids',
    accent: '#5c4412',
    // Names the proposal because it is the half a visitor is searching for.
    // The bid arithmetic is what the contractor needs; the printed quote is
    // what wins them the job, and it was invisible on the one page most
    // visitors land on.
    blurb: 'Bid a job the way the trade does — materials, crew hours, burden, overhead, and what the extras really cost — then print the customer a proposal with the scope, the deposit split, and a line to sign.',
    // `shop-rate` is the upstream tool for this whole section: it computes the
    // payroll burden and overhead rate that every bid calculator below asks for.
    // Landing in the catch-all would have hidden it from exactly the readers who
    // meet those two fields.
    // `cleaning-dilution`, `hvac-maintenance` and `appliance-repair` are trade
    // work whose slugs end in something other than `bid-calculator`, so they
    // landed in the catch-all — where a cleaning contractor reading "Cleaning,
    // restoration & insulation" and an HVAC contractor reading "HVAC, plumbing
    // & electrical" never saw them. The tool existed, its audience was browsing
    // the right section, and it was not in it.
    // `cut-list` is the one tool here that prices no job at all: it plans how a
    // parts list falls onto sheet stock and boards. It is in this section
    // anyway, because the section is defined by who is reading it, and the
    // people who cut plywood for a living are the ones bidding the cabinet,
    // countertop and molding work below. See the note in `logistics`, which is
    // where it used to land.
    // `tender-bid-readiness` and `which-job-first` sat in the catch-all for the
    // same reason `contractor-bid-readiness` used to: the slug names the
    // surface, not the trade, so no keyword above caught it. Both are read by
    // the same contractor deciding whether and what to bid — a readiness
    // checklist before a tender submission, a pairwise ranker for which job on
    // the list to take first — which is this section's audience exactly.
    // `tender-radar` triages the tender listings that `tender-bid-readiness`
    // then checks, so the two belong beside each other for the reader who uses
    // both.
    test: (slug) => /bid-calculator$/.test(slug) || /^(janitorial|retainage|quote-margin|no-show-fee|freelance-retainer|change-order|job-margin|subcontractor-cashflow|contractor-bid-readiness|construction-evidence|shop-rate|cleaning-dilution|hvac-maintenance|appliance-repair|cut-list|tender-bid-readiness|tender-radar|which-job-first)/.test(slug),
  },
  {
    id: 'services',
    title: 'Service business pricing & quotes',
    accent: '#1d4a5c',
    blurb: 'Price a visit, a route, a booking, or a licence — for the service businesses that quote work without bidding a construction job.',
    // These six were the coherent half of the catch-all: one-person and small
    // service businesses (salon, photographer, mobile notary, pool route, event
    // rental, translator) that all do the same job — turn time, travel and
    // materials into a price for a customer — and none of which is a trade bid,
    // a marketplace fee, or a back-office reconciliation. Grouped by an explicit
    // slug list rather than a keyword, because what unites them is the buyer,
    // and no substring names that.
    // `fire-extinguisher-inspection-route-margin` is the same shape as
    // `pool-route` above: a one-technician certified-maintenance route,
    // priced per visit and rolled up per route. It landed in the catch-all
    // only because its slug does not start with `pool-`.
    test: (slug) => /^(booth-rent|commercial-photo-license|notary-trip|pool-route|portable-restroom|translator-project|fire-extinguisher-inspection)/.test(slug),
  },
  {
    id: 'logistics',
    title: 'Logistics, freight & cloud cost',
    accent: '#3d2f5c',
    blurb: 'Normalise a quote, audit a bill, or size a transfer window before you sign for it.',
    // `ltl-`, `owner-operator-` and `medical-courier-` are freight arithmetic that
    // was landing in the catch-all only because the slug did not start with "3pl".
    //
    // `cut-list` used to be in this list and is not freight. It is a plywood and
    // board cutting planner for "woodworkers, sign shops, and makers" — its own
    // words — and the only thing it shares with this section is the word
    // "optimizer". The cost of the mistake was not cosmetic: the four related
    // tools at the foot of every cut-list page were a 3PL quote normaliser, a
    // cloud egress calculator, a medical-courier route margin and an
    // owner-operator CPM, none of which a cabinet maker has any use for, and the
    // tool was listed on `/c/logistics/` where a freight buyer met it instead.
    // It now sits in `trades` / `trades-interior`, beside the countertop,
    // cabinet-refinishing, crown-molding and flooring bids sold by the same
    // people who cut sheet goods.
    test: (slug) => /^(3pl|freight|cloud-egress|ltl-|owner-operator|medical-courier)/.test(slug),
  },
  {
    id: 'evidence',
    title: 'Compliance checks & evidence records',
    accent: '#5c2a1f',
    blurb: 'Produce a dated record of what you checked. Observations you act on — never a determination made on your behalf.',
    // `real-estate-agent-photo-app` and `print-atelier` are both preflights
    // that export a dated record and refuse to call themselves an acceptance
    // decision — this section's exact job, and its exact disclaimer posture.
    // Both slugs name the venture (an iPhone photography app; an art
    // marketplace) rather than the surface, so neither the `preflight$` suffix
    // nor any prefix above catches them, and both landed in the catch-all
    // where the readers of "Compliance checks & evidence records" never saw
    // them.
    test: (slug) =>
      /(evidence|evidence-packet|preflight|drift|tracker|record|watch|desk)$/.test(slug)
      || /^(einvoice|backup|dns|grant|shopify-a11y|shopify-permission|consent-change|cra-|public-record|repository-branch|real-estate-agent-photo|print-atelier)/.test(slug),
  },
  {
    id: 'backoffice',
    title: 'Back-office money & contracts',
    accent: '#1f5c35',
    blurb: 'Cash timing, contract terms, and the break-even behind a price change — the arithmetic that happens after the job is won.',
    // `equipment-lease-buyout-calculator` is the same decision as
    // `equipment-rental-break-even` — converting a financing choice to cost
    // per month of use — but its slug ends in `-calculator`, not `-break-even`,
    // so the suffix rule above never caught it and it sat in the catch-all
    // beside its own sibling's section.
    // `card-processing-fee-audit` splits a merchant statement into pass-through
    // and markup — the same after-the-sale reconciliation job as this section's
    // other tools, just for a card processor's bill instead of a landlord's CAM
    // statement or a SaaS seat count.
    test: (slug) =>
      /(break-even|reconciliation-check|reconciliation-workbench)$/.test(slug)
      || /^(cash-runway|invoice-payment-terms|cam-|saas-seat|subscription-price|seller-net-sheet|appointment-deposit|equipment-lease-buyout|card-processing-fee-audit)/.test(slug),
  },
];

const FALLBACK_CATEGORY = {
  id: 'more',
  title: 'More free tools',
  blurb: 'Everything else that runs entirely in your browser.',
  accent: '#3a4552',
};

export function categoryFor(slug) {
  return CATEGORY_RULES.find((rule) => rule.test(slug)) ?? FALLBACK_CATEGORY;
}

/**
 * The share-card image a page in this category points at. One file per
 * category (7 total, named by a stable id) rather than one per tool (164,
 * named by a title that renames): a rebrand or a retitled tool never breaks
 * this filename, and a share into the roofing group and a share into the
 * marketplace-fee thread render as visibly different cards without anyone
 * drawing 164 of them. See `renderSocialCard`'s `color` parameter in
 * `offline.mjs` for why a colour field is the whole difference — there is no
 * font rasteriser in this build to draw a per-category headline with.
 */
export function socialCardFileFor(categoryId) {
  return `social-card-${categoryId}.png`;
}

/**
 * The share card for one tool, served from inside that tool's own directory.
 *
 * Named by slug, not by title: a slug is the URL and therefore already the
 * thing that cannot change without a redirect, whereas titles here are edited
 * for search wording several times a year. Under `<slug>/` rather than at the
 * root so 164 files do not land beside `robots.txt`, and so deleting a venture
 * takes its card with it.
 *
 * Categories keep their own tinted card (`socialCardFileFor`) because a
 * category page is not a tool and has no slug of this kind.
 */
export function toolCardFileFor(slug) {
  return `${slug}/share-card.png`;
}

// The two lines every tool and category card carries besides its headline.
// Both are claims the site already makes on its manifest and its About page —
// a card is the wrong place to introduce a new one.
export const CARD_FOOTER = 'Runs in your browser · nothing you type is uploaded';

// The one card-sized substitute for a card whose tool (or whose category,
// because it holds that tool) is a documented `externalCallExceptions` entry
// — currently just Sponsor Ready, filed under "more". Sized to fit the same
// footer band as `CARD_FOOTER`; see the About page and the category page's
// own `nothing you type is uploaded, except on…` for the unabbreviated claim.
export const CARD_FOOTER_EXCEPTION = 'Runs in your browser · one lookup checks a public API';

export const ALL_CATEGORIES = [...CATEGORY_RULES, FALLBACK_CATEGORY];

/**
 * Where a category's own landing page is served.
 *
 * Under `c/` rather than at the root because the root is the product
 * namespace: a directory there is a published tool, and `check.mjs` reads it
 * that way (it requires an `index.html`, a hub link, and a disclaimer for each
 * one). A single reserved prefix keeps the two namespaces from colliding the
 * first time someone ships a venture called `logistics`.
 */
export const CATEGORY_PATH_PREFIX = 'c';

export function categoryPagePath(categoryId) {
  return `${CATEGORY_PATH_PREFIX}/${categoryId}/`;
}

/**
 * The one page on this site that is about the site rather than about a job to
 * be done. Served as a directory so the URL a person types, links, or reads
 * aloud is `/about` with no extension.
 */
export const ABOUT_PATH = 'about/';

/**
 * The owner's GitHub Sponsors profile, in one place.
 *
 * It was written out longhand in four separate templates before this constant
 * existed, which is four places to miss on the day the account changes — the
 * copied-constant mistake CLAUDE.md records twice as having cost live product.
 */
export const SPONSORS_URL = 'https://github.com/sponsors/Duncan-Haywood';

/**
 * The one usage event name that is fleet-standard rather than per-product.
 *
 * Every venture names its own feature events for what that product does
 * (`bid_calculated`, `record_exported`, ...) and they vary on purpose. The
 * Sponsors link is the single thing identical across all of them, and until
 * this shipped it was the fleet's only *unmeasured* revenue signal: 186
 * ventures render the link and not one recorded whether it is ever used, so
 * "does the link exist" was closed while "does anyone click it" was not.
 *
 * The literal string is specified in `portfolio/usage/README.md` so a click is
 * comparable across products instead of scattered under a different name per
 * venture. It is deliberately un-slugged: every published page is served from
 * one origin, so one store already aggregates the fleet, and `tool_viewed:*`
 * in that same store is the denominator this number is read against.
 */
export const SPONSOR_CLICK_EVENT = 'sponsor_link_clicked';

/**
 * The marker `markSponsorLinks` writes and the chrome counter matches on.
 *
 * The counter could have matched `a[href^="<the sponsors URL>"]` directly and
 * needed no marker at all. It does not, for one reason worth stating because
 * it looks like indirection for its own sake: `pf-site.js` is asserted to
 * contain **no off-origin URL whatsoever** (`build.test.mjs`, "the chrome
 * counts locally ... and asks for nothing off-origin"). That guard is blunt on
 * purpose — a script every published page loads is the one file where a single
 * added URL would undo the privacy claim on all 733 of them — and a URL sitting
 * in a `closest()` selector would have been a real weakening of it to buy
 * nothing, since the marker costs one attribute.
 *
 * It also matches the `[data-pf-to]` delegation already in that handler, and it
 * catches the link wherever it was written: five templates in this file plus
 * the 186 ventures that author their own footer.
 */
export const SPONSOR_LINK_ATTR = 'data-pf-sponsor';

const SPONSOR_ANCHOR_RE = new RegExp(
  `<a\\b([^>]*\\bhref="${SPONSORS_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*)>`,
  'gi',
);

/**
 * Tags every Sponsors anchor on a page so a click on it can be counted.
 *
 * Idempotent: a page that already carries the marker is returned unchanged, so
 * running this after a pass that copied markup around cannot double-tag.
 */
export function markSponsorLinks(html) {
  return html.replace(SPONSOR_ANCHOR_RE, (whole, attrs) =>
    (attrs.includes(SPONSOR_LINK_ATTR) ? whole : `<a${attrs} ${SPONSOR_LINK_ATTR}>`));
}

/**
 * Applies `markSponsorLinks` across the finished site.
 *
 * A whole-tree pass rather than a step inside `addSiteChrome`, because the
 * sponsor line is not only on the tool pages the chrome wraps: the hub, the
 * category pages, the comparison pages and `about/` each render their own, and
 * a counter that missed those would under-report exactly the pages a visitor
 * arriving from search lands on first. Returns the files it changed.
 */
export async function markSponsorLinksIn(outDir) {
  const marked = [];
  for (const file of (await listFiles(outDir)).filter((f) => f.endsWith('.html'))) {
    const html = await fs.readFile(file, 'utf8');
    const next = markSponsorLinks(html);
    if (next === html) continue;
    await fs.writeFile(file, next);
    marked.push(path.relative(outDir, file));
  }
  return marked;
}

/**
 * The optional-support line a user-facing page carries in its footer.
 *
 * ## Why the hub pages needed one
 *
 * Measured 2026-09-06 against the published snapshot: 698 of its 721 pages
 * carried a sponsors line and 23 did not. Two of those are `404.html` and
 * `offline.html`, which correctly have none. The other 21 were the category
 * hubs (`/c/<id>/`) and the comparison pages (`/compare/`, `/compare/<product>/`)
 * — which is exactly backwards, because those are the pages a stranger arriving
 * from a search query lands on *first*. A visitor could read a whole
 * "vs ServiceTitan" comparison and never be told the tools are free and
 * supportable, while the deeper tool page they might never reach said so.
 *
 * `portfolio/DIRECTION.md` names this as the agent-doable half of the
 * `funding-sponsors-live` decision: whether the repo publishes a funding
 * surface is the owner's call, but making sure every product already carries
 * its own half correctly is not, so the day it is decided nothing is missing.
 *
 * ## Why it is phrased this way
 *
 * `PRODUCT_PLAYBOOK.md` §6: a donation prompt lives in the README and the
 * footer, "nowhere a user has to pass through", and never in front of a
 * feature. The sentence says the ask changes nothing about the product because
 * that is true — refusing costs the visitor no functionality — and a donation
 * ask that overstates itself is worse than none.
 */
export function sponsorsNote() {
  return `<a href="${SPONSORS_URL}">Sponsoring on GitHub</a> is optional and changes nothing about what these tools do.`;
}

/**
 * The index of every `vs-<product>.html` comparison page in the catalogue,
 * grouped by the product each one names.
 *
 * ## Why this page exists
 *
 * Ventures here had written 167 comparison pages on 2026-09-05 — a snapshot,
 * not a constant; the page is generated and the count tracks the tree — and
 * every one of them was
 * reachable from exactly one place: its own tool's entry page. Nothing linked
 * across ventures (measured 2026-09-05: zero `../<slug>/vs-…` hrefs in the
 * whole tree), and no page on either host collects them — the word
 * "alternative" did not appear anywhere in the served surface.
 *
 * That is a distribution hole rather than a cosmetic one. Thirty-two separate
 * tools compare themselves with Jobber; thirteen with ServiceTitan. A reader
 * searching "Jobber alternatives" who lands on the artificial-turf one has no
 * route to the other thirty-one, and there is no single URL that is *about*
 * that query for a crawler to rank. One page that is about it links all
 * thirty-two, and gives the catalogue the cross-venture internal linking layer
 * `renderCategoryPage` gave it within a trade.
 *
 * ## What it may and may not say
 *
 * Every word on it is lifted from a page a venture author already wrote and
 * cited: the product's name comes out of that page's own `<h1>`, the tool's
 * name and blurb out of the tool's own `<title>`/description. This page adds
 * no comparison of its own, no ranking, and no claim about any named product —
 * it is an index, so it cannot introduce a fact that the page it links to does
 * not already carry. See `PRODUCT_PLAYBOOK.md`: a marketing surface here may
 * only restate what is already true and already cited.
 */
export const COMPARE_PATH = 'compare/';

/**
 * The URL segment a product's own comparison page lives under.
 *
 * Derived from `comparisonSubjectKey`, never from the product's display name,
 * so the page's URL and the group it renders cannot drift apart: the key is
 * already the thing two comparison pages must share to be filed together, and
 * a second normalisation here would be a rule restated rather than imported —
 * the mistake CLAUDE.md records twice under "168 became 169".
 *
 * The key is `[a-z0-9]` and single spaces by construction, so mapping space to
 * hyphen is injective (no key can contain a hyphen to collide with) and the
 * result always matches the `[a-z0-9][a-z0-9-]*` that both the front door's
 * nginx location and a ConfigMap key require.
 */
export function comparisonProductSlug(key) {
  return key.replace(/\s+/g, '-');
}

/** A product page's path under the catalogue host's root. */
export function comparisonProductPath(key) {
  return `${COMPARE_PATH}${comparisonProductSlug(key)}/`;
}

/**
 * How many tools must compare themselves with a product before it gets a page.
 *
 * Two, and the threshold is the whole point of the page rather than a tidiness
 * rule. `/compare/` is one URL carrying every comparison in the catalogue, so
 * it has to be titled for all of them at once — which means it competes for
 * "Jobber alternatives" with pages that are about nothing else, and loses. A
 * product compared by one tool gains nothing from a page of its own: that page
 * would say what the tool's own `vs-` page already says, at a URL with less
 * authority, and split the little signal there is across two. A product
 * compared by thirty-two is the opposite case — the set *is* the answer to the
 * query, and no page in the catalogue was about it.
 */
export const COMPARE_PRODUCT_MIN_TOOLS = 2;

/** The groups that get a page of their own. See `COMPARE_PRODUCT_MIN_TOOLS`. */
export function comparisonProductGroups(groups) {
  return groups.filter((group) => group.items.length >= COMPARE_PRODUCT_MIN_TOOLS);
}

/**
 * The filename convention a comparison page follows.
 *
 * Matched rather than listed: `vs-*.html` is the convention every one of the
 * 167 uses, and a hand-kept list would silently drop the next one — the same
 * staleness the venture discovery in this file exists to avoid. `.test.mjs`
 * siblings cannot match because they are not `.html`.
 */
export const COMPARISON_FILE_PATTERN = /^vs-[a-z0-9][a-z0-9-]*\.html$/i;

/**
 * The product a comparison page is about, taken from the page's own words.
 *
 * Not from the filename. `vs-lmn.html` is titled "This calculator vs. LMN by
 * Granum" and `vs-yardi.html` "…vs. Yardi Voyager CAM reconciliation" — the
 * author knows the product's real name and casing, and a slug does not. So the
 * text after the last "vs." in the `<h1>` is the answer, with the `<title>`
 * (minus any " | Site name" suffix) as the fallback for a page whose heading is
 * phrased differently.
 *
 * Returns `null` when neither carries the pattern, and the caller drops that
 * page rather than guessing: an index entry naming the wrong product is worse
 * than one fewer entry, and this is a page about other companies' products.
 * Measured across all 167 pages on 2026-09-05, nothing fell through.
 */
export function comparisonSubject(html) {
  const text = (value) =>
    value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const afterVs = (value) => {
    const matches = [...value.matchAll(/\svs\.?\s/gi)];
    if (!matches.length) return null;
    const last = matches[matches.length - 1];
    const tail = value.slice(last.index + last[0].length).trim();
    return tail || null;
  };

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const fromH1 = h1 ? afterVs(text(h1[1])) : null;
  if (fromH1) return fromH1;

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? afterVs(text(title[1]).split(' | ')[0]) : null;
}

/**
 * The key two comparison pages must share to be filed under one product.
 *
 * Leading articles and possessives are what actually differ between authors —
 * "the AWS Pricing Calculator" and "AWS Pricing Calculator" are one product,
 * and "Amazon's own Revenue Calculator" is filed under the words the author
 * chose because trimming a possessive off a brand ("Etsy's own Profit
 * Calculator") would merge products that are genuinely distinct. So this
 * normalises punctuation and case only, and deliberately does not try to guess
 * a canonical brand out of a phrase.
 */
export function comparisonSubjectKey(subject) {
  return subject
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Every comparison page in the catalogue, grouped by product, most-compared
 * first and alphabetical within a tie.
 *
 * Ordered that way because the ordering is the page's editorial judgement and
 * the only one it makes: a product thirty-two tools compare themselves with is
 * the reason a stranger opens this page, and burying it under an alphabetical
 * "AccuLynx" would be filing rather than publishing.
 */
export function groupComparisons(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const existing = byKey.get(entry.subjectKey);
    if (existing) {
      existing.items.push(entry);
      continue;
    }
    byKey.set(entry.subjectKey, { key: entry.subjectKey, subject: entry.subject, items: [entry] });
  }
  for (const group of byKey.values()) {
    group.items.sort((a, b) => a.title.localeCompare(b.title));
  }
  return [...byKey.values()].sort(
    (a, b) => b.items.length - a.items.length || a.subject.localeCompare(b.subject),
  );
}

/**
 * Read every published surface's comparison pages off disk.
 *
 * Takes the finished `surfaces` list rather than re-walking `ventures/`, so a
 * venture excluded from the build (`EXCLUDED_SLUGS`) cannot contribute an entry
 * linking to a page that was never published — and so a venture publishing from
 * `site/` is covered without restating that rule, because `sourceDir` already
 * points at whichever directory `ENTRY_CANDIDATES` resolved.
 */
export async function discoverComparisons(surfaces) {
  const entries = [];
  for (const surface of surfaces) {
    let names;
    try {
      names = await fs.readdir(surface.sourceDir);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (!COMPARISON_FILE_PATTERN.test(name)) continue;
      const file = path.join(surface.sourceDir, name);
      const html = await fs.readFile(file, 'utf8');
      const subject = comparisonSubject(html);
      // A page whose heading does not name a product is dropped rather than
      // guessed at. See `comparisonSubject`.
      if (!subject) continue;
      entries.push({
        slug: surface.slug,
        file: name,
        subject,
        subjectKey: comparisonSubjectKey(subject),
        title: surface.title,
        description: surface.description,
      });
    }
  }
  return entries;
}

/**
 * The copy each category page is published with.
 *
 * Separate from `CATEGORY_RULES` because these are different jobs. The rules
 * decide which tools a section holds and are edited every time a venture
 * lands; this is the page's search-facing copy — the phrase a visitor actually
 * types — and changes only when the category's audience does.
 *
 * The hub cannot do this job itself. It is one URL carrying 164 tools across
 * six trades, so its title and description have to stay generic enough to
 * cover all of them, and it competes for "free contractor bid calculator"
 * against pages that are about nothing else. A category page is about one
 * thing, which is the whole reason it can rank for one thing.
 *
 * `title` deliberately omits the site name: the build appends it, and a title
 * that carries it twice is what search engines truncate.
 */
const CATEGORY_PAGE_COPY = {
  marketplace: {
    title: 'Free marketplace seller fee calculators',
    description:
      'Free fee and profit calculators for eBay, Etsy, Amazon, Shopify, Walmart, TikTok Shop, Faire and Reverb. Enter your cost of goods, see what an order nets.',
    intro:
      'Every marketplace publishes a fee schedule and none of them publish what you keep. These calculators put your own cost of goods, shipping and return rate into the arithmetic, so the number you get is the one that lands in your account — not a percentage off the sale price.',
    audience: 'people selling on marketplaces',
  },
  trades: {
    title: 'Free contractor bid calculators and estimating tools',
    description:
      'Free bid calculators for roofing, HVAC, plumbing, electrical, concrete, painting and cleaning. Price materials, crew hours and overhead, then print a proposal.',
    intro:
      'A bid that only counts materials and an hourly rate loses money on burden, overhead and the extras nobody wrote down. These calculators price a job the way the trade does, then print the customer a proposal with the scope, the deposit split and a line to sign.',
    audience: 'trade contractors',
  },
  logistics: {
    title: 'Free freight, 3PL and cloud cost calculators',
    description:
      'Free tools to normalise a 3PL quote, audit a freight accessorial bill, class an LTL shipment, price owner-operator miles and size a cloud egress transfer.',
    intro:
      'Freight and cloud quotes are priced to be hard to compare: different accessorial lists, different fuel bases, different units. These tools put competing quotes on one basis so the cheapest headline rate and the cheapest total stop being different answers.',
    audience: 'logistics and infrastructure buyers',
  },
  evidence: {
    title: 'Free compliance check and evidence record tools',
    description:
      'Free tools that produce a dated record of what you checked: e-invoicing readiness, backup verification, permission drift, accessibility, chargeback packets.',
    intro:
      'The hard part of a compliance obligation is usually not the check — it is proving later that you did it, on the day you say you did. These tools produce a dated, exportable record of an observation you made, in a form you can hand to whoever asks.',
    audience: 'small teams preparing compliance evidence',
  },
  backoffice: {
    title: 'Free small-business cash flow and pricing tools',
    description:
      'Free calculators for cash runway, invoice payment terms, CAM reconciliation, SaaS seat true-ups and break-even on a price move — the arithmetic after the win.',
    intro:
      'Winning the work and getting paid for it are two different problems. These tools cover the second one: when the cash actually arrives, what a payment term costs you, and what a price change has to earn before it breaks even.',
    audience: 'small-business owners and operators',
  },
  services: {
    title: 'Free pricing calculators for service businesses',
    description:
      'Free quoting tools for salons, photographers, mobile notaries, pool routes, event rentals and translators. Turn travel, time and materials into a price.',
    intro:
      'A service business quotes work without bidding a construction job, and the arithmetic is its own: travel time nobody bills, a route that has to cover the truck, a licence term that changes what the work is worth. These tools price that, one trade at a time.',
    audience: 'small service businesses',
  },
  more: {
    title: 'More free small-business calculators',
    description:
      'The rest of the free, browser-only calculators here — everything outside the marketplace, trade, services, logistics, compliance and back-office sections.',
    intro:
      'Tools that did not fit the other sections. Same terms as the rest of the site: free, no account, and every calculation runs in your own browser.',
    audience: 'small businesses',
  },
};

export function categoryPageCopy(category) {
  return (
    CATEGORY_PAGE_COPY[category.id] ?? {
      title: category.title,
      description: category.blurb,
      intro: category.blurb,
      audience: 'small businesses',
    }
  );
}

/**
 * Sub-groups inside a category, so a section that has grown past a screenful is
 * still scannable.
 *
 * `trades` is why this exists. It reached 105 tools — an alphabetical wall from
 * `artificial-turf` to `window-replacement` in which a roofer looking for the
 * metal-roof calculator has to read past sixty trades that are not theirs. The
 * hub's search finds a tool you can already name; a directory has to also work
 * for the visitor who is browsing, and browsing 105 undifferentiated cards is
 * not browsing.
 *
 * Rules are keyword tests rather than a slug list on purpose. A bid calculator
 * lands here most days, and a hand-maintained list would silently drop each new
 * one into "More …" within a week — the same staleness the venture discovery in
 * this file exists to avoid. A slug no rule claims falls to the category's own
 * trailing group, which is a visible bucket rather than a missing tool.
 *
 * Ordered per category: the first matching rule wins, so a narrow rule
 * (`window-cleaning` is cleaning work) must precede a broad one (`window-…` is
 * an opening).
 */
const SUBCATEGORY_RULES = {
  trades: [
    {
      id: 'trades-paid',
      title: 'Getting paid & job margin',
      test: (slug) => /^(quote-margin|retainage|freelance-retainer|no-show-fee|change-order|job-margin|subcontractor-cashflow|contractor-bid-readiness|construction-evidence|shop-rate|tender-bid-readiness|tender-radar|which-job-first)/.test(slug),
    },
    {
      id: 'trades-cleaning',
      title: 'Cleaning, restoration & insulation',
      test: (slug) => /^(janitorial|window-cleaning|pressure-washing|carpet-cleaning|cleaning-dilution|hood-cleaning|duct-cleaning|dryer-vent|gutter-cleaning|chimney-sweep|mobile-detailing|vehicle-wrap|junk-removal|moving|pest-control|mold-remediation|radon-mitigation|crawl-space|basement-waterproofing|attic-insulation|spray-foam|pet-grooming)/.test(slug),
    },
    {
      id: 'trades-roof',
      title: 'Roofing, siding & gutters',
      test: (slug) => /^(roofing|flat-roof|metal-roof|siding|soffit-fascia|gutter-|skylight|stucco|tuckpointing|exterior-painting|ice-dam-removal)/.test(slug),
    },
    {
      id: 'trades-openings',
      title: 'Windows, doors & garage',
      // `locksmith` joins this group rather than a new one of its own: the
      // hardware a locksmith prices (cylinders, deadbolts, fobs) sits on the
      // same doors this group's other tools are installing or replacing.
      test: (slug) => /^(window-replacement|egress-window|entry-door|interior-door|patio-door|garage-door|plantation-shutter|automatic-driveway-gate|locksmith)/.test(slug),
    },
    {
      id: 'trades-mep',
      title: 'HVAC, plumbing & electrical',
      // `security-camera` sits here as low-voltage electrical work: the people
      // who bid it are the electrical and structured-cabling trades, and it is
      // closer to a panel or EV-charger job than to anything in the other groups.
      test: (slug) => /^(furnace|boiler|mini-split|hvac-maintenance|ev-charger|electrical-panel|standby-generator|solar-pv|water-heater|water-softener|well-pump|sump-pump|toilet-replacement|sewer-|septic-|security-camera|appliance-repair)/.test(slug),
    },
    {
      id: 'trades-interior',
      title: 'Interior finishes & remodels',
      // `cut-list` joins this group rather than any other: the parts it nests
      // are cabinet doors, countertop substrate and molding stock, so the
      // related-tool offer at the foot of its pages is work the same visitor
      // sells. `home-staging` joins for the same reason as `cut-list`: it
      // sells to the same real-estate-prep visitor as the remodel tools here,
      // even though its own job is furniture, not construction.
      test: (slug) => /^(painting|drywall|flooring|carpet-install|hardwood-refinishing|kitchen-tile|countertop|cabinet-refinishing|crown-molding|popcorn-ceiling|basement-finishing|walk-in-|sunroom|screened-porch|home-elevator|stair-lift|wheelchair-ramp|fireplace-insert|cut-list|home-staging)/.test(slug),
    },
    {
      id: 'trades-site',
      title: 'Concrete, masonry & site work',
      test: (slug) => /^(concrete|asphalt-|gravel-driveway|paver-patio|retaining-wall|parking-lot|french-drain|foundation-repair|epoxy-garage|pole-barn|shed-install)/.test(slug),
    },
    {
      id: 'trades-outdoor',
      title: 'Landscape, deck & pool',
      test: (slug) => /^(artificial-turf|sod-install|lawn-care|irrigation-|tree-service|landscape-lighting|holiday-light|snow-removal|fence|deck-|deck-bid|pergola|hot-tub|pool-plaster|vinyl-liner)/.test(slug),
    },
  ],
};

const SUBCATEGORY_FALLBACKS = {
  trades: { id: 'trades-other', title: 'More trade bids' },
};

/**
 * The sub-group `slug` belongs to, or `null` when its category is small enough
 * that the hub shows one flat list.
 */
export function subcategoryFor(slug) {
  const rules = SUBCATEGORY_RULES[categoryFor(slug).id];
  if (!rules) return null;
  return rules.find((rule) => rule.test(slug)) ?? SUBCATEGORY_FALLBACKS[categoryFor(slug).id];
}

/**
 * Split one category's tools into its sub-groups, dropping empty ones and
 * keeping `SUBCATEGORY_RULES` order. Returns a single unnamed group when the
 * category has no sub-groups, so callers render one code path either way.
 */
export function groupBySubcategory(categoryId, items) {
  const rules = SUBCATEGORY_RULES[categoryId];
  if (!rules) return [{ subcategory: null, items }];
  return [...rules, SUBCATEGORY_FALLBACKS[categoryId]]
    .map((subcategory) => ({
      subcategory,
      items: items.filter((item) => subcategoryFor(item.slug)?.id === subcategory.id),
    }))
    .filter((group) => group.items.length > 0);
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

async function exists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Every file under `dir`, recursively. */
export async function listFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * Every venture that ships a browser entry point, as
 * `{ slug, sourceDir, entryFile }` sorted by slug.
 */
export async function discoverSurfaces(venturesDir) {
  const entries = await fs.readdir(venturesDir, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || EXCLUDED_SLUGS.has(entry.name)) continue;

    const override = ENTRY_OVERRIDES[entry.name];
    const candidates = override ? [path.join(override, 'index.html')] : ENTRY_CANDIDATES;

    for (const candidate of candidates) {
      const entryPath = path.join(venturesDir, entry.name, candidate);
      if (!(await exists(entryPath))) continue;
      found.push({
        slug: entry.name,
        sourceDir: path.dirname(entryPath),
        entryFile: entryPath,
      });
      break;
    }
  }

  return found.sort((a, b) => a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

// `decodeEntities` is imported at the top of this file, shared with the page
// checks so that a `<meta>` description and the visible copy it is compared
// against decode the same way. The local five-entity version that used to sit
// here read `&mdash;` back out verbatim, and 1,324 of those ship in this
// repo's HTML.

/**
 * Every `<meta>` tag in `html`, as raw source.
 *
 * The alternation consumes either an ordinary character or a whole quoted
 * string, so an attribute value is never mistaken for the end of the tag. A
 * plain `<meta[^>]*>` ends the tag at the first `>` even when that `>` sits
 * inside a quoted description ("4×8 > 5×5").
 */
const metaTags = (html) => html.match(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];

const ATTRIBUTE = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Attribute name → value for one tag, names lowercased, values still encoded. */
const parseAttributes = (tag) => {
  const attrs = {};
  for (const [, name, dq, sq, bare] of tag.matchAll(ATTRIBUTE)) {
    attrs[name.toLowerCase()] = dq ?? sq ?? bare ?? '';
  }
  return attrs;
};

/**
 * The `content` of the first `<meta>` whose `attr` equals `value`.
 *
 * Tags are parsed attribute by attribute rather than matched with one regex.
 * The regex form had to guess where a value ended, and `content=["']([^"']*)["']`
 * stops at whichever quote comes first — so a description written with a
 * literal apostrophe inside a double-quoted attribute
 * (`content="Turn a Shopify storefront's axe-core export…"`) was silently cut
 * to "Turn a Shopify storefront". That fragment reached the hub card, the
 * JSON-LD `ItemList`, and the card's `data-search` index — so the hub's own
 * search box could not find that tool by "axe-core", the term its users would
 * actually type. A surface's own pages are copied verbatim and were unaffected.
 * Parsing per attribute also drops the old attribute-order fallback: which of
 * `name` and `content` is written first no longer matters.
 *
 * A backreferenced `content=(["'])(.*?)\1` also fixes the apostrophe, and
 * landed on `main` first. This keeps the parser instead because `.` does not
 * match a newline: a description written across two lines makes that pattern
 * fail outright and return the empty string — losing the whole description
 * rather than the tail of it. No venture wraps one today, so that is latent
 * rather than live, but the parser costs nothing to keep and cannot regress it.
 */
const metaContent = (html, attr, value) => {
  const wanted = value.toLowerCase();
  for (const tag of metaTags(html)) {
    const attrs = parseAttributes(tag);
    if (attrs[attr.toLowerCase()]?.toLowerCase() === wanted && attrs.content) {
      return decodeEntities(attrs.content).trim();
    }
  }
  return '';
};

const titleize = (slug) => slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

/** Trim to a whole word at or under `limit` characters. */
export function truncate(text, limit = 180) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : limit).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * How long a published page's own description may be.
 *
 * 160 is where a search result stops showing one: Google renders roughly that
 * many characters of a snippet on a desktop result and fewer on a phone. It is
 * also the budget that matters for the other half of this site's acquisition —
 * a link pasted into a trade group or a Discord — where the preview card gives
 * the description two or three lines and drops the rest.
 */
export const SNIPPET_MAX = 160;

/**
 * A boundary is only worth cutting at if it leaves most of the budget used —
 * otherwise an early full stop turns a 160-character budget into a 20-character
 * snippet, which is a worse result than the truncation being avoided.
 */
const snippetFloor = (limit) => Math.floor(limit * 0.6);

const lastIndexMatching = (text, pattern) => {
  let at = -1;
  for (const match of text.matchAll(pattern)) at = match.index;
  return at;
};

/**
 * A page description cut to something a search result and a share card can
 * actually show, ending where the prose does rather than mid-thought.
 *
 * WHY THIS EXISTS
 *
 * These descriptions accrete. Every session that adds a feature to a tool adds
 * a clause to its description saying so, nothing ever trims one, and the result
 * is copy no reader will ever see the end of: 138 of 168 published pages were
 * over the snippet budget, 11 of them past 300 characters, and the eBay
 * calculator had reached 1,862 — a single sentence of twenty-five "whether X
 * still beats Y" clauses, of which a search result showed the first 160 and
 * stopped in the middle of the word "whether".
 *
 * The long copy is not waste and is not deleted here: `readMeta` keeps it as
 * `fullDescription`, which is what the hub's search indexes and what `llms.txt`
 * hands a model. It is only wrong in the two places a human reads a fixed
 * number of characters. So the budget is applied where it is published, not to
 * the venture's own source, and a session can keep writing as much as the tool
 * deserves without having to think about a limit.
 *
 * `truncate` is the wrong instrument for this: it cuts at a whole word, which
 * for a description made of clauses lands on "...whether a…". Prefer a sentence
 * end inside the budget (nothing is added and no truncation is visible), then a
 * clause boundary with an ellipsis, and only fall back to a word.
 */
export function snippetize(text, limit = SNIPPET_MAX) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;

  const floor = snippetFloor(limit);
  const window = clean.slice(0, limit);

  // A sentence that ends inside the budget is the best possible cut: the
  // snippet is a whole thought and nothing marks it as shortened.
  const sentence = lastIndexMatching(window, /[.!?](?=["')\]]?(?:\s|$))/g);
  if (sentence >= floor) return clean.slice(0, sentence + 1);

  // Otherwise end at the last clause. The ellipsis is honest — the sentence
  // does go on — and it is where a reader would have stopped anyway.
  const clause = lastIndexMatching(window, /[,;:](?=\s)|\s[—–-](?=\s)/g);
  if (clause >= floor) return `${clean.slice(0, clause).replace(/[\s,;:—–-]+$/, '')}…`;

  // `truncate` overshoots by the ellipsis on text with no space to fall back to
  // (a single unbroken token), which is the one input that would ship a snippet
  // over the budget this function exists to hold.
  const word = truncate(clean, limit);
  return word.length <= limit ? word : `${clean.slice(0, limit - 1)}…`;
}

/**
 * The card copy for one surface. Prefers the venture's own og:title, because a
 * `<title>` is written for a search result page ("Janitorial Bid Calculator |
 * Commercial Cleaning Price Per Month") and reads badly in a card grid.
 */
export function readMeta(html, slug) {
  const rawTitle = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const ogTitle = metaContent(html, 'property', 'og:title');
  const title =
    ogTitle || (rawTitle ? decodeEntities(rawTitle.split('|')[0]).trim() : '') || titleize(slug);

  const description =
    metaContent(html, 'name', 'description') || metaContent(html, 'property', 'og:description') || '';

  // `description` is card copy and is trimmed to fit one. `fullDescription` is
  // what the hub's search actually indexes: 24 of 34 tools say more about
  // themselves than a card can hold, and the eBay tool says 1862 characters'
  // worth. Indexing the trimmed copy made ~90% of that tool unfindable.
  return { title, description: truncate(description), fullDescription: description };
}

/** Words too common across these tools to narrow a search. */
const SEARCH_STOPWORDS = new Set(
  ('a an and are as at be but by for from get how if in into is it its of on or so that the then ' +
   'there these they this to too was what when where which who why will with you your' ).split(' '),
);

/**
 * The searchable token set for one card.
 *
 * Kept as deduplicated tokens rather than raw prose for two reasons: the page
 * carries the whole index inline, so repeating "calculator" 34 times costs
 * bytes for nothing; and matching per token is what makes a two-word query
 * ("ebay return") work, which a substring match over prose cannot do.
 */
export function searchTokens(parts) {
  const seen = new Set();
  for (const part of parts) {
    for (const token of String(part ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (token.length < 2 || SEARCH_STOPWORDS.has(token)) continue;
      seen.add(token);
    }
  }
  return [...seen].sort().join(' ');
}

/**
 * The forms of one query word that should still reach a tool.
 *
 * The index stores the words a tool's own copy uses -- "fence", "pool",
 * "tree" -- and the matcher is a token-*prefix* test, so a query word can
 * only ever reach an indexed word at least as long as itself. Half the
 * catalogue was unreachable through that asymmetry: "fences", "pools",
 * "trees", "patios", "sheds", "chimneys", "driveways" and "cleaners" each
 * returned nothing while the matching calculator sat one plural away, and
 * "electrician", "plumber" and "remodeling" missed the tools that spell
 * themselves "electrical", "plumbing" and "remodel".
 *
 * Returns the word plus the shorter forms worth trying. Matching is an OR
 * over the set and the word itself is always the first member, so this can
 * only widen a result set, never shrink one.
 *
 * Deliberately not a real stemmer: Porter would pull in a dependency and a
 * pile of rules earning nothing here, because the queries that matter are
 * trade nouns rather than English prose.
 */
export function searchVariants(word) {
  // Each suffix comes off the original word, never off an already-stripped
  // form -- chaining would take "processing" to "proces" and then "proc".
  const SUFFIXES = ['s', 'es', 'ing', 'ings', 'er', 'ers', 'ian', 'ians'];
  const forms = [word];
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    // Four characters is the floor, measured rather than guessed. At three,
    // "trees" also yields "tre" and drags in trench, tread and treatment --
    // ten hits where two are about trees. Four keeps every plural that has a
    // tool behind it and drops the stems that have stopped being words.
    if (stem.length >= 4) forms.push(stem);
  }
  return [...new Set(forms)];
}

/**
 * Share of the catalogue a word has to appear in before it stops narrowing
 * anything. Measured, not guessed: at 164 tools the words above this line are
 * `see` (70%), `away` (59%), `charge` (54%), `much` (52%), `special` (43%) and
 * `not` (37%) — house phrasing ("see what a 5× special costs", "what to charge",
 * "the cost a per-square special cannot see") rather than anything a visitor is
 * looking for. The next word down is `number` at 32%, which is the same kind of
 * word, so the exact cut is not load-bearing.
 */
export const CATALOGUE_STOPWORD_SHARE = 0.35;

/**
 * Words this catalogue's own copy repeats so often they cannot narrow a search.
 *
 * `SEARCH_STOPWORDS` is generic English. This is the domain half, and it has to
 * be derived rather than listed: the copy changes every time a tool ships, and
 * a hand-written list would be describing last month's catalogue.
 *
 * It matters because the matcher ANDs across query words, so a word in half the
 * indexes still costs nothing while a word in *no* index zeroes the whole
 * query. `how much to charge to install a water heater` returned the **boiler**
 * calculator alone: that tool happens to use all seven content words somewhere,
 * and the water-heater calculator does not say "charge". Dropping the two words
 * that mean nothing here leaves `install water heater`, which finds the tool the
 * visitor asked for.
 *
 * **A word that appears in any tool's name is never a stopword**, however common
 * it is. That rule is what makes this safe: `quote` is in three names (Notary
 * Trip Quote, Translator Project Quote, 3PL Quote Normalizer) and `rate` is in
 * one, so neither can be dropped, and searching a tool by its own name keeps
 * working. Without it a frequency cut would quietly delete tools from the
 * search — the worst possible outcome for the box that exists to find them.
 *
 * Dropped from the index and from the query alike; they have to agree, or a
 * query containing one would match nothing at all.
 */
export function catalogueStopwords(cards, share = CATALOGUE_STOPWORD_SHARE) {
  if (cards.length === 0) return new Set();
  const named = new Set();
  const frequency = new Map();
  for (const card of cards) {
    for (const word of String(card.name ?? '').split(' ')) if (word) named.add(word);
    for (const word of new Set(String(card.index ?? '').split(' ').filter(Boolean))) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const floor = cards.length * share;
  return new Set(
    [...frequency]
      .filter(([word, count]) => count >= floor && !named.has(word))
      .map(([word]) => word),
  );
}

/** One card's search index with the words that cannot narrow it removed. */
export function withoutStopwords(index, stopwords) {
  return index
    .split(' ')
    .filter((word) => word && !stopwords.has(word))
    .join(' ');
}

/**
 * How well one card answers a query, so the hub can put the best match first.
 *
 * The hub used to filter without ranking: matched cards stayed in catalogue
 * order, which is alphabetical inside a sub-group. That is fine at four hits
 * and useless at twelve. Measured against the built site, "roof" returned
 * twelve tools led by chimney-sweep, dryer-vent and gutter-cleaning — all of
 * which merely mention a roof — with `roofing-bid-calculator` far enough down
 * that a phone showed three wrong answers and no right one. "windows" led with
 * the no-show fee calculator; "concrete" with the stair-lift calculator. The
 * tool the visitor named by name was present every time and buried every time.
 *
 * A word found in the tool's *name* is worth four of the same word found in
 * its description or aliases, which is the whole of the fix: a tool called
 * "Roofing Bid Calculator" outranks one whose copy happens to say "roof". The
 * weights are per query word and summed, so a two-word query that hits both
 * words in a name beats one that hits a name and a description.
 *
 * The trailing fraction is a tie-break and never more than that: it is under 1
 * by construction, so it can only order cards that scored the same on words.
 * It prefers the shorter name, on the reading that a query matching most of a
 * name found the tool it was looking for — "roof" wants Roofing Bid Calculator
 * before Metal Roof Bid Calculator. Equal names fall back to catalogue order,
 * which the sort is stable in.
 */
export function searchScore(nameIndex, searchIndex, forms, boundary) {
  const hit = (index, word) =>
    boundary ? (' ' + index).includes(' ' + word) : index.includes(word);
  let score = 0;
  for (const variants of forms) {
    if (variants.some((word) => hit(nameIndex, word))) score += 4;
    else if (variants.some((word) => hit(searchIndex, word))) score += 1;
  }
  const nameWords = nameIndex ? nameIndex.split(' ').filter(Boolean).length : 0;
  return score + 1 / (2 + nameWords);
}

/**
 * The `<title>`/`<h1>` of every other page in a venture.
 *
 * These are the venture's SEO articles, and they are phrased as the question a
 * visitor actually types ("should I use Amazon AWD", "how much to charge to
 * install crown molding"). None of that wording appears in the tool's own meta
 * description, so without this the hub cannot answer the search that brought
 * the visitor to the portfolio in the first place.
 */
export async function collectPageTitles(sourceDir, entryFile) {
  const files = (await listFiles(sourceDir)).filter(
    (file) => file.endsWith('.html') && file !== entryFile,
  );
  const titles = [];
  for (const file of files.slice(0, 40)) {
    const html = await fs.readFile(file, 'utf8');
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
    const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
    titles.push(decodeEntities(title), decodeEntities(heading.replace(/<[^>]*>/g, ' ')));
  }
  return titles;
}

async function countPages(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.html')).length;
}

/**
 * Hostnames a venture's own shipped JavaScript sends a `fetch()` request to,
 * other than a same-origin path (loading an `examples/*.json` fixture, say —
 * several ventures do that and it does not count). Empty for the great
 * majority of tools, which make none.
 *
 * This feeds the site's privacy claims ("nothing you type leaves your
 * browser"), which are true for every tool except the ones this finds — a
 * tool whose whole job is checking a live public API (`sponsor-ready` sends
 * the repo you paste to `api.github.com`, because that is what checking it
 * means) would make those claims quietly false without this, the same
 * silent-drift failure the hand-typed catalogue counts elsewhere in this file
 * already guard against.
 *
 * Heuristic, not a JS parser: it recognises a `const NAME = "https://...";`
 * style declaration, a `fetch()`/`fetchImpl()`-shaped call whose target is a
 * literal URL or one of those constants, and — for `.js`/`.mjs` files only,
 * to avoid flagging a page's own canonical/share-card links — any
 * `https://` literal at all in a file that makes a fetch-shaped call
 * somewhere, to catch a target built by indirection (a record's own
 * `endpoint` field, say) that the precise checks can't trace. That last rule
 * trades precision for recall on purpose: naming a URL that turns out not to
 * be requested is a harmless over-disclosure, missing one that is requested
 * is a false privacy claim. It still cannot see a target assembled from
 * string concatenation with no literal `https://` substring anywhere in the
 * file, which is why callers should read an empty result as "none found",
 * not as a verified guarantee that none exist.
 */
export async function surfaceExternalFetchHosts(dir) {
  // `.mjs` too, not just `.js`: ventures overwhelmingly ship ES modules
  // (`calc.mjs`, `share.mjs`, …), and a scanner that only reads `.js` never
  // opens most of a venture's own logic.
  const files = (await listFiles(dir)).filter((f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.html'));
  const hosts = new Set();

  for (const file of files) {
    const src = await fs.readFile(file, 'utf8');
    const urlConsts = new Map();
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/g)) {
      urlConsts.set(m[1], m[2]);
    }
    const targets = [
      ...[...src.matchAll(/fetch\w*\(\s*[`'"](https?:\/\/[^`'"]+)[`'"]/g)].map((m) => m[1]),
      ...[...src.matchAll(/fetch\w*\(\s*`\$\{([A-Za-z_$][\w$]*)\}/g)]
        .map((m) => urlConsts.get(m[1]))
        .filter(Boolean),
      ...[...src.matchAll(/fetch\w*\(\s*([A-Za-z_$][\w$]*)\s*[+,)]/g)]
        .map((m) => urlConsts.get(m[1]))
        .filter(Boolean),
    ];
    // A fetch-shaped call (`fetch(`, `fetchImpl(`, …) whose URL is built from
    // something other than a literal or a top-level const -- a record's own
    // `endpoint` field read inside a template literal, say -- is invisible to
    // the three precise checks above, and the gap was not hypothetical: it is
    // exactly how dns-configuration-evidence queries three public DoH
    // resolvers (`` fetchImpl(`${resolver.endpoint}?name=...`) ``), and it
    // went undisclosed on /about/ until this was added. Rather than trace
    // every such indirection, treat any `https://` literal in a `.js`/`.mjs`
    // file that also makes a fetch-shaped call as a target. This is safe to
    // over-disclose (a URL named in the source but never actually requested
    // still just adds a mention) and unsafe to under-disclose (a false "stays
    // in your browser" claim) -- and checked against the whole built site on
    // 2026-09-04, it adds no host beyond the one it exists to catch.
    if (!file.endsWith('.html') && /\bfetch\w*\(/.test(src)) {
      targets.push(...[...src.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/g)].map((m) => m[1]));
    }
    // HTML-only: a browser fetches these on page load without any `fetch()`
    // call ever appearing in a `.js` file, so the checks above miss them
    // entirely. `rel="canonical"` / `rel="alternate"` are metadata a crawler
    // reads, never a request a browser makes, so they are deliberately not
    // included here — every venture's own canonical tag would otherwise show
    // up as a false "external call" on itself.
    if (file.endsWith('.html')) {
      targets.push(...[...src.matchAll(/<script[^>]+\bsrc=["']?(https?:\/\/[^"'\s>]+)/gi)].map((m) => m[1]));
      targets.push(
        ...[...src.matchAll(/<link\b[^>]*\brel=["'][^"']*\b(?:stylesheet|preconnect|preload|modulepreload|dns-prefetch)\b[^"']*["'][^>]*>/gi)]
          .flatMap((tag) => [...tag[0].matchAll(/\bhref=["']?(https?:\/\/[^"'\s>]+)/gi)])
          .map((m) => m[1]),
      );
    }
    for (const url of targets) {
      try {
        hosts.add(new URL(url).host);
      } catch {
        // Not a resolvable absolute URL — skip rather than guess.
      }
    }
  }

  return [...hosts].sort();
}

/**
 * The surfaces flagged by `surfaceExternalFetchHosts`, as the shape the
 * privacy copy below needs: which tool, what it is called, and where it
 * sends what you type. Surfaces built without that field (a hand-written
 * test fixture, say) are silently treated as having none, so this is safe to
 * call on any surface list.
 */
export function externalCallExceptions(surfaces) {
  return surfaces
    .filter((s) => s.externalFetchHosts && s.externalFetchHosts.length)
    .map((s) => ({ slug: s.slug, title: s.title, hosts: s.externalFetchHosts }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** "A", "A and B", or "A, B, and C" — used to read an exception list as prose. */
export function listProse(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Every `.html` file published under `dir`, as paths relative to it.
 *
 * This reads the built output rather than the sources, so it sees exactly what
 * a visitor can reach — after exclusions, after nested directories, after any
 * page a venture added without telling anyone.
 */
export async function publishedPages(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      pages.push(...(await publishedPages(path.join(dir, entry.name), relative)));
    } else if (entry.isFile() && entry.name.endsWith('.html') && entry.name !== '404.html') {
      pages.push(relative);
    }
  }

  return pages.sort();
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

// Point already-written SEO at the real, served URL: every venture wrote its
// canonical tags against the placeholder origin, back when none existed.
function rewriteOrigin(contents, baseUrl) {
  const rewritten = contents.split(PLACEHOLDER_ORIGIN).join(baseUrl);

  // Three ventures (freelance-retainer, no-show-fee, retainage-cashflow) wrote
  // today's Pages address into their canonical tags directly, rather than the
  // placeholder. That is correct by accident: it holds only while the site is
  // served from exactly that URL, and `PAGES_BASE_URL` exists so a custom
  // domain can be attached. On that day those pages would keep naming the
  // github.io origin as canonical, which tells every crawler the real page is
  // at the old address and hands the new domain a duplicate.
  //
  // Sitemaps are safe without this — they are regenerated from what actually
  // published — but canonical tags are copied through, so they are not.
  // Treating the default as a second placeholder makes the whole portfolio
  // follow the base URL it is actually built with.
  if (baseUrl === DEFAULT_BASE_URL) return rewritten;
  return rewritten.split(DEFAULT_BASE_URL).join(baseUrl);
}

export function isPublishable(name) {
  if (EXCLUDED_FILES.has(name) || isTestFile(name)) return false;
  return !NON_WEB_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Recursively copy `from` into `to`, dropping test payload and repo bookkeeping. */
/**
 * Point one published page at the site's favicon.
 *
 * `renderFavicon()` writes the icon to the *published tree's* root, on the
 * reasoning that a browser fetches `/favicon.ico` on its own for every page.
 * That is true of the **origin** root — and this is a GitHub *project* site, so
 * the origin root is `duncan-haywood.github.io/`, not the tree at
 * `.../monorepo-projects/`. The automatic request lands outside this repository
 * and the generated icon is never reached. Writing the link in is what closes
 * that gap.
 *
 * The href is relative to the page rather than root-absolute, for the same
 * reason every other in-site link here is: `check.mjs` rejects a link that
 * leaves the site root, and a relative one is correct whatever path the site is
 * served under — including a local preview at `/`.
 *
 * A venture that declares its own icon keeps it, and the link goes after the
 * charset declaration so that stays the first thing the parser sees.
 */
export function injectFavicon(html, toRoot) {
  if (/<link[^>]+rel=["'][^"']*icon/i.test(html)) return html;
  const link = `\n  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">`;
  if (/<meta[^>]+charset/i.test(html)) {
    return html.replace(/<meta[^>]+charset[^>]*>/i, (meta) => `${meta}${link}`);
  }
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${link}`);
}

export async function copyTree(from, to, baseUrl) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  const copied = [];

  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const nested = await copyTree(src, dest, baseUrl);
      // A directory that held only CLI source leaves an empty shell behind.
      if (nested.length === 0) await fs.rm(dest, { recursive: true, force: true });
      copied.push(...nested);
      continue;
    }
    if (!entry.isFile() || !isPublishable(entry.name)) continue;

    if (REWRITABLE.has(path.extname(entry.name))) {
      const contents = await fs.readFile(src, 'utf8');
      await fs.writeFile(dest, rewriteOrigin(contents, baseUrl));
    } else {
      await fs.copyFile(src, dest);
    }
    copied.push(dest);
  }

  return copied;
}

// ---------------------------------------------------------------------------
// Link repair
// ---------------------------------------------------------------------------

export const SOURCE_URL_PREFIX = 'https://github.com/Duncan-Haywood/monorepo-projects/blob/main/';

/**
 * Every venture page was written assuming its own directory was the site root,
 * so several link out to files that sit beside the venture rather than inside
 * it (`../README.md`, `../LICENSE`) or to files this build deliberately does
 * not publish (CLI source). Under one shared origin those become 404s.
 *
 * Rather than edit another venture's product code, point each such link at the
 * file in the public repository, where it still renders and still answers the
 * question the link was there to answer. Links that resolve inside the site are
 * left exactly as written.
 */
export async function repairLinks({ publishedDir, sourceDir, repoRoot, outDir }) {
  const htmlFiles = (await listFiles(publishedDir)).filter((f) => f.endsWith('.html'));
  const repaired = [];

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, 'utf8');
    // The published file mirrors the source tree, so the same relative path
    // from `sourceDir` locates the original the link was written against.
    const sourceOfFile = path.join(sourceDir, path.relative(publishedDir, file));
    let changed = false;

    const next = html.replace(/((?:href|src)=")([^"]+)(")/g, (whole, open, ref, close) => {
      if (/^(https?:|mailto:|data:|#|\/\/)/.test(ref) || ref === '') return whole;

      const [pathPart] = ref.split(/[#?]/);
      if (!pathPart) return whole;

      const resolvedInSite = path.resolve(path.dirname(file), pathPart);
      const target = pathPart.endsWith('/') ? path.join(resolvedInSite, 'index.html') : resolvedInSite;
      const insideSite = target === outDir || target.startsWith(`${outDir}${path.sep}`);
      if (insideSite && existsSync(target)) return whole;

      const inRepo = path.resolve(path.dirname(sourceOfFile), pathPart);
      if (!inRepo.startsWith(`${repoRoot}${path.sep}`) || !existsSync(inRepo)) return whole;

      changed = true;
      repaired.push({ file: path.relative(outDir, file), from: ref });
      return `${open}${SOURCE_URL_PREFIX}${path.relative(repoRoot, inRepo).split(path.sep).join('/')}${close}`;
    });

    if (changed) await fs.writeFile(file, next);
  }

  return repaired;
}

// ---------------------------------------------------------------------------
// Hub page
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// A `<script>` element's contents are not HTML-escaped by the parser, so a
// venture whose title happened to contain `</script>` would close the block
// early and the remainder would land in the document as markup. Escaping the
// angle brackets as JSON unicode escapes keeps the value identical to a parser
// while making that impossible.
const jsonLd = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/**
 * The shared "No warranty / no SLA / Privacy" footer block that ships on the
 * hub, every category page, and the About page's own footer.
 *
 * The Privacy paragraph makes one absolute claim — no server ever receives
 * what a visitor types — which `externalCallExceptions` can now disprove for
 * a specific tool. Rather than let that make the paragraph silently false,
 * `surfaces` (the same list every caller already has in scope) is checked on
 * every render and an accurate exception clause is appended only when one is
 * needed, naming the tool and where it sends what you type.
 *
 * The name is plain text, not a link to the tool: this block is rendered on
 * the hub too, whose own listing already links every slug exactly once, and
 * a second `href="<slug>/"` here would read as a second listing of the same
 * tool. The About page's own, separate privacy panel makes the same point
 * with a working link — this one points there instead.
 */
function disclaimerHtml(toRoot, surfaces = []) {
  const exceptions = externalCallExceptions(surfaces);
  const exceptionNote = exceptions.length
    ? ` Except ${listProse(
        exceptions.map((x) => escapeHtml(x.title)),
      )} — each of which checks a live public API as its whole job, so what you paste there to look up goes to ${listProse(
        [...new Set(exceptions.flatMap((x) => x.hosts))],
      )} and nowhere else. <a href="${escapeHtml(`${toRoot}${ABOUT_PATH}`)}">About</a> says exactly what.`
    : '';
  return `
      <h2>No warranty</h2>
      <p>
        These tools are provided free and as-is, without warranty of any kind,
        express or implied. They are not legal, tax, financial, or engineering
        advice, and they do not replace a qualified professional.
        <strong>You are responsible for reviewing and verifying any output
        before relying on it</strong>, and for meeting any obligation it helps
        you prepare for. To the maximum extent permitted by law, the authors
        accept no liability for any loss or damage arising from their use.
      </p>
      <h2>Best-effort hosting, no SLA</h2>
      <p>
        These tools are free and experimental, and may be slow, broken, moved,
        or taken offline without notice. We do not promise uptime, backups of
        anything you type, or that a URL will keep working. Do not use them as
        a system of record. If a tool needs to survive, export your inputs —
        every one of them is open source and runs from a local file.
      </p>
      <h2>Privacy</h2>
      <p>
        Everything runs in your browser. What you type is never uploaded: there
        is no account system, no tracking cookie, no analytics vendor, and no
        server that could receive it.${exceptionNote} We count anonymous, aggregate events —
        which tools get opened, never anything about who opened them — and that
        count stays in your own browser's local storage. Browsers sending
        <em>Do&nbsp;Not&nbsp;Track</em> or <em>Global Privacy Control</em> are
        not counted at all.
      </p>`;
}

/**
 * The category sections, in the order the hub shows them, with empty ones
 * dropped. Shared so the hub, `llms.txt`, and anything else that groups the
 * catalogue cannot drift into showing different sets of tools.
 */
export function groupByCategory(surfaces) {
  return [...CATEGORY_RULES, FALLBACK_CATEGORY]
    .map((category) => ({
      category,
      items: surfaces.filter((s) => categoryFor(s.slug).id === category.id),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * The shared look for a category page. Kept as one string rather than a file so
 * a category page is a single request with nothing to 404: the hub already
 * inlines its own, for the same reason.
 *
 * Deliberately a subset of the hub's sheet — the same tokens, the same card,
 * none of the search-box or contents-index rules a category page has no markup
 * for. Two sheets that share a palette drift; two sheets that share *names*
 * drift visibly, which is the point.
 */
const CATEGORY_STYLE = `
    :root {
      color-scheme: light dark;
      --bg: #eef2f7; --panel: #ffffff; --ink: #1d2530; --muted: #4a5666;
      --line: #d3dce6; --accent: #12594a; --soft: #656e78;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #10151c; --panel: #171e27; --ink: #e8eef5; --muted: #a2b0c0;
              --line: #2a343f; --accent: #7fd8c0; --soft: #8d9aab; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 26px 18px 60px; }
    .crumbs { font-size: .87rem; color: var(--muted); margin: 0 0 22px; }
    .crumbs a { color: var(--accent); }
    header { max-width: 760px; margin-bottom: 8px; }
    .eyebrow { font-size: .78rem; font-weight: 700; letter-spacing: .09em;
               text-transform: uppercase; color: var(--accent); margin: 0 0 8px; }
    h1 { font-size: clamp(1.8rem, 5vw, 2.8rem); line-height: 1.05;
         letter-spacing: -.04em; margin: 0 0 14px; }
    .lede { font-size: 1.06rem; line-height: 1.55; color: var(--muted); margin: 0 0 10px; }
    .count { font-size: .85rem; color: var(--soft); margin: 0; }
    .subgroup { margin-top: 30px; scroll-margin-top: 14px; }
    .subgroup h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: .07em;
                   color: var(--muted); font-weight: 700; margin: 0 0 12px;
                   padding-bottom: 7px; border-bottom: 1px solid var(--line); }
    .subgroup-count { font-weight: 600; color: var(--soft); letter-spacing: 0; }
    .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px;
             grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
            padding: 17px 18px; }
    .card h3 { margin: 0 0 7px; font-size: 1.03rem; line-height: 1.25; }
    .card a { color: inherit; text-decoration: none; }
    .card a:hover h3, .card a:focus-visible h3 { color: var(--accent); text-decoration: underline; }
    .card p { margin: 0; color: var(--muted); font-size: .92rem; line-height: 1.5; }
    .card .meta { margin-top: 8px; font-size: .82rem; color: var(--soft); }
    .siblings { margin-top: 44px; padding: 18px; background: var(--panel);
                border: 1px solid var(--line); border-radius: 13px; }
    .siblings h2 { font-size: 1.05rem; margin: 0 0 10px; }
    .siblings ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px;
                   grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .siblings a { color: var(--accent); text-decoration: none; font-weight: 600; font-size: .94rem; }
    .siblings a:hover, .siblings a:focus-visible { text-decoration: underline; }
    .siblings span { color: var(--soft); font-weight: 500; }
    footer { margin-top: 44px; padding-top: 22px; border-top: 1px solid var(--line);
             color: var(--muted); font-size: .9rem; line-height: 1.55; max-width: 760px; }
    footer h2 { font-size: .95rem; color: var(--ink); margin: 18px 0 6px; }
    footer p { margin: 0; }
    footer a { color: var(--accent); }
`;

/**
 * One category's landing page.
 *
 * Why these exist at all: the hub is a single URL carrying 164 tools across six
 * unrelated trades. That is the right front door for someone who already knows
 * the site, and the wrong page for organic search, which matches a query
 * against one page's whole subject. A contractor searching "free roofing bid
 * calculator" is competing for the hub's attention with eleven marketplace fee
 * tools and nine compliance checks, and the hub cannot describe itself as a
 * roofing page without lying to the other 153.
 *
 * A category page is about one thing, links only that thing's tools, and says
 * so in its title, its description, its H1 and its JSON-LD. It also gives the
 * catalogue an internal-linking layer it did not have: every tool was one click
 * from a page about everything, and is now one click from a page about its own
 * trade.
 *
 * Not a copy of the hub with a filter applied. No search box (the hub's is
 * better and this page is already the filtered view), and the cards carry no
 * `data-search` payload, which is a meaningful weight saving on the 112-tool
 * trades page.
 */
export function renderCategoryPage({ category, items, groups, baseUrl }) {
  const copy = categoryPageCopy(category);
  const url = `${baseUrl}${categoryPagePath(category.id)}`;
  // Every asset lives at the site root and this page is served two levels down.
  const toRoot = '../../';
  const subgroups = groupBySubcategory(category.id, items);
  // Computed the same way the About page proves its own privacy claim, so a
  // category that happens to hold a tool with a documented external call
  // (Sponsor Ready under "more", DNS Change Evidence under "evidence") does
  // not have this page say "nothing you type is uploaded" for all of its
  // tools when that is false for one of them.
  const categoryExceptions = externalCallExceptions(items);
  const countPrivacyClaim = categoryExceptions.length
    ? `nothing you type is uploaded, except on ${listProse(categoryExceptions.map((x) => x.title))}`
    : 'nothing you type is uploaded';
  const flat = subgroups.length === 1 && subgroups[0].subcategory === null;

  const renderCard = (surface) => `          <li class="card">
            <a href="${escapeHtml(`${toRoot}${surface.slug}/`)}" data-tool="${escapeHtml(surface.slug)}" data-pf-to="${escapeHtml(surface.slug)}">
              <h3>${escapeHtml(surface.title)}</h3>
            </a>
            <p>${escapeHtml(surface.description)}</p>
            ${
              surface.pageCount > 1
                ? `<p class="meta">${surface.pageCount} question${surface.pageCount === 1 ? '' : 's'} answered</p>`
                : ''
            }
          </li>`;

  const body = flat
    ? `      <ul class="cards">
${items.map(renderCard).join('\n')}
      </ul>`
    : subgroups
        .map(
          ({ subcategory, items: subItems }) => `      <section class="subgroup" id="${escapeHtml(subcategory.id)}">
        <h2>${escapeHtml(subcategory.title)} <span class="subgroup-count">${subItems.length}</span></h2>
        <ul class="cards">
${subItems.map(renderCard).join('\n')}
        </ul>
      </section>`,
        )
        .join('\n');

  // Sibling links matter more here than they look. Without them each category
  // page is a leaf: a crawler that lands on one from search reaches the hub and
  // nothing else, and a visitor whose tool is one section over has to go back
  // to a page of 164 to find it.
  const siblings = groups
    .filter((group) => group.category.id !== category.id)
    .map(
      ({ category: other, items: otherItems }) =>
        `        <li><a href="${escapeHtml(`${toRoot}${categoryPagePath(other.id)}`)}">${escapeHtml(
          categoryPageCopy(other).title,
        )}</a> <span>(${otherItems.length})</span></li>`,
    )
    .join('\n');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.title,
    url,
    description: copy.description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: baseUrl },
        { '@type': 'ListItem', position: 2, name: category.title, item: url },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((surface, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${baseUrl}${surface.slug}/`,
        name: surface.title,
      })),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${copy.title} | ${SITE_NAME}`)}</title>
  <meta name="description" content="${escapeHtml(snippetize(copy.description))}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — new tools`)}" href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(copy.title)}">
  <meta property="og:description" content="${escapeHtml(snippetize(copy.description))}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${socialCardFileFor(category.id)}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${copy.title} — free, private, in your browser`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <style>${CATEGORY_STYLE}  </style>
</head>
<body>
  <div class="wrap">
    <p class="crumbs"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">All ${escapeHtml(String(groups.reduce((n, g) => n + g.items.length, 0)))} free tools</a> › ${escapeHtml(category.title)}</p>
    <header>
      <p class="eyebrow">${escapeHtml(category.title)}</p>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="lede">${escapeHtml(copy.intro)}</p>
      <p class="count">${items.length} free tool${items.length === 1 ? '' : 's'} · no account · ${countPrivacyClaim}</p>
    </header>

    <main>
${body}
    </main>

    <section class="siblings">
      <h2>Other tools on this site</h2>
      <ul>
${siblings}
      </ul>
    </section>

    <footer>${disclaimerHtml(toRoot, groups.flatMap((g) => g.items))}
      <p style="margin-top:18px"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">Back to all ${escapeHtml(String(groups.reduce((n, g) => n + g.items.length, 0)))} tools</a> · <a href="${escapeHtml(`${toRoot}${ABOUT_PATH}`)}">About</a> · <a href="${escapeHtml(`${toRoot}${COMPARE_PATH}`)}">Comparisons</a> · <a href="${escapeHtml(`${toRoot}llms.txt`)}">llms.txt</a> · <a href="${escapeHtml(`${toRoot}sitemap.xml`)}">Sitemap</a> · <a href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">Feed</a></p>
      <p>${sponsorsNote()}</p>
    </footer>
  </div>
  <!-- The same anonymous, local-only counter every tool page loads, with the
       category as its slug. Without it a category page is unmeasurable: we
       would not know whether search sends anyone to one, nor whether the people
       it does send go on to open a tool — which is the only evidence that would
       justify keeping these pages or writing more of them. The cross_tool_click
       count on each card is the second half of that: arrivals without opens
       means the copy is wrong, not that the page is unwanted. -->
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="${escapeHtml(`${CATEGORY_PATH_PREFIX}/${category.id}`)}" defer></script>
</body>
</html>
`;
}

/**
 * Prose rules the card-and-grid sheet has no need for. Appended to
 * `CATEGORY_STYLE` rather than replacing it so the About page inherits the same
 * palette, the same `.wrap`, the same footer treatment — a visitor arriving
 * from a tool page should not feel they have left the site.
 */
/**
 * The extra rules the comparison index needs on top of `CATEGORY_STYLE`.
 *
 * Appended rather than replacing it for the reason `ABOUT_STYLE` is: a visitor
 * arriving here from a category page should not feel they have left the site.
 */
const COMPARE_STYLE = `
    .jump { margin: 30px 0 6px; padding: 16px 18px; background: var(--panel);
            border: 1px solid var(--line); border-radius: 13px; }
    .jump h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: .07em;
               color: var(--muted); font-weight: 700; margin: 0 0 10px; }
    .jump ul { list-style: none; margin: 0; padding: 0; display: flex;
               flex-wrap: wrap; gap: 8px 14px; }
    .jump a { color: var(--accent); text-decoration: none; font-weight: 600; font-size: .93rem; }
    .jump a:hover, .jump a:focus-visible { text-decoration: underline; }
    .jump span { color: var(--soft); font-weight: 500; }
    .subject { margin-top: 34px; scroll-margin-top: 14px; }
    .subject h2 { font-size: 1.12rem; letter-spacing: -.02em; margin: 0 0 4px; }
    .subject .note { font-size: .85rem; color: var(--soft); margin: 0 0 12px; }
    .singles { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px;
               grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
    .singles li { background: var(--panel); border: 1px solid var(--line);
                  border-radius: 11px; padding: 12px 14px; font-size: .94rem;
                  line-height: 1.45; }
    .singles strong { display: block; color: var(--ink); }
    .singles a { color: var(--accent); }
`;

/**
 * The catalogue's comparison pages, on one URL, grouped by the product each
 * names. See `COMPARE_PATH` for why this page exists and what it is allowed to
 * say.
 *
 * Two bands, because 167 pages across ~120 products rendered as one flat list
 * is the alphabetical wall `SUBCATEGORY_RULES` was written to fix on the trades
 * page. Products compared by more than one tool get a section of their own —
 * those are the queries with volume, and the only ones where a reader gains
 * something from seeing the set. The long tail of one-offs gets a single
 * compact band at the foot, which is enough for a crawler to find the page and
 * enough for a reader to scan.
 */
export function renderComparePage({ groups, surfaces, categoryGroups = [], baseUrl }) {
  const url = `${baseUrl}${COMPARE_PATH}`;
  const toRoot = '../';
  const total = groups.reduce((n, group) => n + group.items.length, 0);
  const multi = groups.filter((group) => group.items.length > 1);
  const singles = groups.filter((group) => group.items.length === 1);
  const anchorFor = (group) => `p-${group.key.replace(/\s+/g, '-')}`;

  // Derived the same way the category pages and the About page derive theirs.
  // This page spans the whole catalogue, so it always covers the tools that do
  // make a documented live call (Sponsor Ready, the DNS evidence tool) — a
  // flat "nothing you type is uploaded" in the header would be false for them
  // while the footer's own disclaimer named the exception two screens below.
  const exceptions = externalCallExceptions(surfaces);
  const privacyClaim = exceptions.length
    ? `nothing you type is uploaded, except on ${listProse(
        exceptions.map((x) => escapeHtml(x.title)),
      )}`
    : 'nothing you type is uploaded';

  const title = `Comparisons: free tools next to the software they are measured against`;
  const description =
    `${total} side-by-side pages comparing the free calculators on this site with named commercial products — ` +
    `what each one does, what it does not, and which to use when. Not affiliated with any product named.`;

  const entryHref = (entry) => `${toRoot}${entry.slug}/${entry.file}`;

  const renderCard = (entry) => `          <li class="card">
            <a href="${escapeHtml(entryHref(entry))}" data-tool="${escapeHtml(entry.slug)}" data-pf-to="${escapeHtml(entry.slug)}">
              <h3>${escapeHtml(entry.title)}</h3>
            </a>
            <p>${escapeHtml(truncate(entry.description, 120))}</p>
          </li>`;

  const sections = multi
    .map(
      (group) => `      <section class="subject" id="${escapeHtml(anchorFor(group))}">
        <h2>${escapeHtml(group.subject)}</h2>
        <p class="note">${escapeHtml(
          `${group.items.length} tools here have a page comparing themselves with ${group.subject}. Written by the tool's author; not affiliated with ${group.subject}.`,
        )} <a href="${escapeHtml(`${toRoot}${comparisonProductPath(group.key)}`)}">${escapeHtml(
          `${group.subject} on its own page →`,
        )}</a></p>
        <ul class="cards">
${group.items.map(renderCard).join('\n')}
        </ul>
      </section>`,
    )
    .join('\n');

  const singleItems = singles
    .map((group) => {
      const entry = group.items[0];
      return `        <li><strong>${escapeHtml(group.subject)}</strong><a href="${escapeHtml(entryHref(entry))}" data-pf-to="${escapeHtml(entry.slug)}">${escapeHtml(entry.title)}</a></li>`;
    })
    .join('\n');

  const jump = multi
    .map(
      (group) =>
        `        <li><a href="#${escapeHtml(anchorFor(group))}">${escapeHtml(group.subject)}</a> <span>(${group.items.length})</span></li>`,
    )
    .join('\n');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url,
    description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: baseUrl },
        { '@type': 'ListItem', position: 2, name: 'Comparisons', item: url },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: groups.flatMap((group) =>
        group.items.map((entry) => ({
          '@type': 'ListItem',
          name: `${entry.title} vs. ${group.subject}`,
          url: `${baseUrl}${pageUrlPath(entry.slug, entry.file)}`,
        })),
      ).map((item, index) => ({ ...item, position: index + 1 })),
    },
  };

  const categoryLinks = categoryGroups
    .map(
      ({ category, items }) =>
        `        <li><a href="${escapeHtml(`${toRoot}${categoryPagePath(category.id)}`)}">${escapeHtml(
          categoryPageCopy(category).title,
        )}</a> <span>(${items.length})</span></li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${title} | ${SITE_NAME}`)}</title>
  <meta name="description" content="${escapeHtml(snippetize(description))}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — new tools`)}" href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(snippetize(description))}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} — free, private, in your browser`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <style>${CATEGORY_STYLE}${COMPARE_STYLE}  </style>
</head>
<body>
  <div class="wrap">
    <p class="crumbs"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">All ${escapeHtml(String(surfaces.length))} free tools</a> › Comparisons</p>
    <header>
      <p class="eyebrow">Comparisons</p>
      <h1>What each free tool here does that the paid product does not — and what it does not do</h1>
      <p class="lede">Every tool on this site that overlaps with a commercial product has a page saying so plainly: what the product does, what the free tool does, and when the paid one is the right answer. They are written by the tool's author, cite the product's own public documentation, and are not affiliated with, endorsed by, or reviewed by any product named here.</p>
      <p class="count">${total} comparison page${total === 1 ? '' : 's'} across ${groups.length} product${groups.length === 1 ? '' : 's'} · free · no account · ${privacyClaim}</p>
    </header>

    <nav class="jump" aria-label="Products with more than one comparison">
      <h2>Products compared by more than one tool</h2>
      <ul>
${jump}
      </ul>
    </nav>

    <main>
${sections}

      <section class="subject" id="p-one-each">
        <h2>One comparison each</h2>
        <p class="note">${escapeHtml(
          `${singles.length} more products, each compared by a single tool here.`,
        )}</p>
        <ul class="singles">
${singleItems}
        </ul>
      </section>
    </main>

    <section class="siblings">
      <h2>Browse by trade instead</h2>
      <ul>
${categoryLinks}
      </ul>
    </section>

    <footer>${disclaimerHtml(toRoot, surfaces)}
      <h2>About the products named here</h2>
      <p>
        Every product name on this page is a trademark of its owner and is used
        only to identify the product being compared. Nothing here is affiliated
        with, endorsed by, or reviewed by any of them, and no comparison on this
        site is a statement about a product's quality — only about what each
        tool does and does not do.
      </p>
      <p style="margin-top:18px"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">Back to all ${escapeHtml(String(surfaces.length))} tools</a> · <a href="${escapeHtml(`${toRoot}${ABOUT_PATH}`)}">About</a> · <a href="${escapeHtml(`${toRoot}llms.txt`)}">llms.txt</a> · <a href="${escapeHtml(`${toRoot}sitemap.xml`)}">Sitemap</a> · <a href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">Feed</a></p>
      <p>${sponsorsNote()}</p>
    </footer>
  </div>
  <!-- The same anonymous, local-only counter every other page loads, with this
       page's own slug. Without it the page is unmeasurable: we would not know
       whether a comparison query sends anyone here, nor whether the people it
       sends go on to open a tool — which is the only evidence that would
       justify writing more comparison pages. -->
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="compare" defer></script>
</body>
</html>
`;
}

/**
 * One product's comparison pages, on a URL that is about that product only.
 *
 * ## Why the hub is not enough
 *
 * `/compare/` is the index and it works as one: a reader who lands there can
 * find any comparison in the catalogue. But it is a single URL carrying 167
 * pages across ~120 products, so its `<title>`, its description and its
 * heading have to be true of all of them at once — "Comparisons: free tools
 * next to the software they are measured against". A stranger does not search
 * that. They search "Jobber alternatives", and the page that answers it is
 * competing, on one shared URL, against pages that are about nothing else.
 * The thirty-two Jobber comparisons were an anchor two-thirds of the way down
 * a 100 KB document.
 *
 * This is the hub-and-spoke half. Each product compared by more than one tool
 * gets a page whose every word is about that product, and the hub keeps its
 * job of linking all of them. The spokes also give the catalogue the thing it
 * had least of (measured 2026-09-05: zero cross-venture `vs-` links anywhere
 * in the tree) — thirty-two tools that share a subject now sit on one page
 * linking each other, which is an internal-linking layer no category page can
 * provide because these tools are spread across every trade.
 *
 * ## What it may say
 *
 * Exactly what the hub may say, and for the same reason: nothing of its own.
 * The product's name is `comparisonSubject`'s reading of the linked page's own
 * `<h1>`; the tool names and blurbs are the tools' own. It states no
 * comparison, ranks nothing, and makes no claim about any named product — an
 * index cannot introduce a fact the page it links does not already carry.
 *
 * The heading is deliberately "compared with", not "better than". Several of
 * these tools price one job and the product they name runs a whole business;
 * calling them alternatives outright would be the page's own claim, and a
 * false one. The word a searcher types belongs in the title, where it is a
 * description of the query the page answers, and the lede immediately says
 * what the linked pages actually are — including that they say when the paid
 * product is the right answer.
 */
export function renderCompareProductPage({
  group,
  groups = [],
  surfaces,
  categoryGroups = [],
  baseUrl,
}) {
  const url = `${baseUrl}${comparisonProductPath(group.key)}`;
  // Two segments deep (`compare/<product>/`), unlike the hub's one.
  const toRoot = '../../';
  const subject = group.subject;
  const n = group.items.length;

  const exceptions = externalCallExceptions(surfaces);
  const privacyClaim = exceptions.length
    ? `nothing you type is uploaded, except on ${listProse(
        exceptions.map((x) => escapeHtml(x.title)),
      )}`
    : 'nothing you type is uploaded';

  const title = `${subject} alternatives: ${n} free tools with a side-by-side page`;
  const description =
    `${n} free browser tools on this site each have a page comparing themselves with ${subject} — ` +
    `what ${subject} does, what the free tool does, and when ${subject} is the right answer. ` +
    `Written by each tool's author. Not affiliated with ${subject}.`;

  const entryHref = (entry) => `${toRoot}${entry.slug}/${entry.file}`;

  const cards = group.items
    .map(
      (entry) => `          <li class="card">
            <a href="${escapeHtml(entryHref(entry))}" data-tool="${escapeHtml(entry.slug)}" data-pf-to="${escapeHtml(entry.slug)}">
              <h3>${escapeHtml(entry.title)}</h3>
            </a>
            <p>${escapeHtml(truncate(entry.description, 120))}</p>
          </li>`,
    )
    .join('\n');

  // The sibling spokes. This is the cross-linking the catalogue had none of:
  // without it every product page is a leaf reachable only from the hub, and a
  // crawler that finds one finds one.
  const siblings = comparisonProductGroups(groups)
    .filter((other) => other.key !== group.key)
    .map(
      (other) =>
        `        <li><a href="${escapeHtml(`${toRoot}${comparisonProductPath(other.key)}`)}">${escapeHtml(
          other.subject,
        )}</a> <span>(${other.items.length})</span></li>`,
    )
    .join('\n');

  const categoryLinks = categoryGroups
    .map(
      ({ category, items }) =>
        `        <li><a href="${escapeHtml(`${toRoot}${categoryPagePath(category.id)}`)}">${escapeHtml(
          categoryPageCopy(category).title,
        )}</a> <span>(${items.length})</span></li>`,
    )
    .join('\n');

  const structured = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url,
    description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: baseUrl },
        { '@type': 'ListItem', position: 2, name: 'Comparisons', item: `${baseUrl}${COMPARE_PATH}` },
        { '@type': 'ListItem', position: 3, name: subject, item: url },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: n,
      itemListElement: group.items.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${entry.title} vs. ${subject}`,
        url: `${baseUrl}${pageUrlPath(entry.slug, entry.file)}`,
      })),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${title} | ${SITE_NAME}`)}</title>
  <meta name="description" content="${escapeHtml(snippetize(description))}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — new tools`)}" href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(snippetize(description))}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} — free, private, in your browser`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(structured)}</script>
  <style>${CATEGORY_STYLE}${COMPARE_STYLE}  </style>
</head>
<body>
  <div class="wrap">
    <p class="crumbs"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">All ${escapeHtml(String(surfaces.length))} free tools</a> › <a href="${escapeHtml(`${toRoot}${COMPARE_PATH}`)}">Comparisons</a> › ${escapeHtml(subject)}</p>
    <header>
      <p class="eyebrow">Compared with ${escapeHtml(subject)}</p>
      <h1>${escapeHtml(`${n} free tools here have a page comparing themselves with ${subject}`)}</h1>
      <p class="lede">${escapeHtml(
        `Each page below is written by the author of the free tool, cites ${subject}'s own public documentation, and says three things: what ${subject} does, what the free tool does, and when ${subject} is the right answer. None of them is affiliated with, endorsed by, or reviewed by ${subject}, and none is a statement about its quality — only about what each tool does and does not do.`,
      )}</p>
      <p class="count">${n} comparison page${n === 1 ? '' : 's'} · free · no account · ${privacyClaim}</p>
    </header>

    <main>
      <section class="subject">
        <ul class="cards">
${cards}
        </ul>
      </section>
    </main>
${
  siblings
    ? `
    <nav class="jump" aria-label="Other products compared here">
      <h2>Other products compared by more than one tool</h2>
      <ul>
${siblings}
      </ul>
    </nav>
`
    : ''
}
    <section class="siblings">
      <h2>Browse by trade instead</h2>
      <ul>
${categoryLinks}
      </ul>
    </section>

    <footer>${disclaimerHtml(toRoot, surfaces)}
      <h2>About ${escapeHtml(subject)}</h2>
      <p>
        ${escapeHtml(subject)} is a trademark of its owner and is used on this
        page only to identify the product being compared. This site is not
        affiliated with, endorsed by, or reviewed by ${escapeHtml(subject)},
        and nothing here is a statement about its quality. For what
        ${escapeHtml(subject)} does, read ${escapeHtml(subject)}'s own
        documentation.
      </p>
      <p style="margin-top:18px"><a href="${escapeHtml(`${toRoot}${COMPARE_PATH}`)}">All comparisons</a> · <a href="${escapeHtml(toRoot)}" data-pf-to="hub">All ${escapeHtml(String(surfaces.length))} tools</a> · <a href="${escapeHtml(`${toRoot}${ABOUT_PATH}`)}">About</a> · <a href="${escapeHtml(`${toRoot}llms.txt`)}">llms.txt</a> · <a href="${escapeHtml(`${toRoot}sitemap.xml`)}">Sitemap</a> · <a href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">Feed</a></p>
      <p>${sponsorsNote()}</p>
    </footer>
  </div>
  <!-- Its own slug, not the hub's. Whether a product page earns the traffic
       the hub could not is the entire question these pages were written to
       answer, and folding them onto the hub's slug would leave it
       unanswerable. -->
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="${escapeHtml(`compare/${comparisonProductSlug(group.key)}`)}" defer></script>
</body>
</html>
`;
}

const ABOUT_STYLE = `
    .prose { max-width: 720px; }
    .prose h2 { font-size: 1.25rem; letter-spacing: -.02em; margin: 38px 0 12px; }
    .prose h3 { font-size: 1rem; margin: 24px 0 6px; }
    .prose p { color: var(--muted); line-height: 1.62; margin: 0 0 14px; }
    .prose ul { color: var(--muted); line-height: 1.62; padding-left: 22px; margin: 0 0 14px; }
    .prose li { margin-bottom: 7px; }
    .prose a { color: var(--accent); }
    .prose strong { color: var(--ink); }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
             padding: 18px 20px; margin: 0 0 16px; }
    .panel h3 { margin-top: 0; }
    .panel p:last-child, .panel ul:last-child { margin-bottom: 0; }
    .boiler { font-size: .93rem; line-height: 1.6; color: var(--ink);
              background: var(--bg); border: 1px solid var(--line); border-radius: 9px;
              padding: 13px 15px; margin: 0 0 12px; white-space: pre-wrap;
              overflow-wrap: anywhere;
              font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
`;

/**
 * The site's About page — and, in its second half, its press kit.
 *
 * Why a static catalogue of calculators needs one at all:
 *
 * 1. **Trust.** Every one of these tools asks a stranger to type their costs,
 *    their margins, or their client's numbers into a page they found through
 *    search. The single most common reason not to is the reasonable suspicion
 *    that a free calculator is a lead magnet and the numbers are the product.
 *    Here they are not, and that is checkable — no form, no account, no
 *    beacon, no third-party script. Nowhere on the site said so in one place a
 *    person could read before deciding.
 *
 * 2. **Distribution.** Organic linking is the whole acquisition plan. Somebody
 *    writing a forum answer or a trade-association newsletter needs a sentence
 *    to describe this, a URL to point at, and permission to do it. Making them
 *    invent all three is why good tools go unlinked. The press-kit section
 *    hands over exactly that, pre-written and copy-pasteable.
 *
 * Every claim here is one the build itself keeps true: the counts come from
 * `surfaces`, and the privacy claims are properties of the generated output
 * (no `fetch`, no `sendBeacon`, no third-party origin) rather than promises
 * written by hand and left to rot.
 */
export function renderAboutPage({ surfaces, groups, baseUrl }) {
  const url = `${baseUrl}${ABOUT_PATH}`;
  // Served one level down, like a category page is served two.
  const toRoot = '../';
  const total = surfaces.length;
  const categoryCount = groups.length;
  const title = 'About these tools';
  const description = `Who makes these ${total} free calculators, why they are free, and what happens to the numbers you type in (nothing — every tool runs in your browser).`;

  // The one absolute claim below — nothing typed ever leaves the browser —
  // is true for every tool except one this checks for: a tool whose whole
  // job is checking a live public API. Computed from what actually shipped
  // rather than remembered by hand, so a future tool built the same way
  // cannot make this page quietly false the way the old, unconditional
  // wording would have.
  const exceptions = externalCallExceptions(surfaces);
  const exceptionNames = listProse(
    exceptions.map((x) => `<a href="${escapeHtml(`${toRoot}${x.slug}/`)}">${escapeHtml(x.title)}</a>`),
  );
  const exceptionHosts = listProse([...new Set(exceptions.flatMap((x) => x.hosts))]);

  // The boilerplate a linker copies. Kept as data, not prose, so the numbers in
  // it cannot drift from the catalogue the way hand-written marketing copy does.
  const shortBoiler = `${total} free, private calculators for small businesses — bid pricing, marketplace fees, cashflow and compliance checks. No account, everything runs in your browser.`;
  const deviceClaim = exceptions.length
    ? `the numbers a user types never leave their device, except on ${listProse(exceptions.map((x) => x.title))}, where the one thing you paste — the lookup target — goes to the public API it checks (${exceptionHosts}) and nowhere else`
    : `the numbers a user types never leave their device`;
  const longBoiler = `${SITE_NAME} is a collection of ${total} free web tools for people who run a small business: trade contractors pricing a job, marketplace sellers working out what a sale actually nets, logistics buyers comparing quotes, and small teams assembling compliance evidence. Every tool is a single static page that does its arithmetic in the visitor's own browser. There is no account system, no payment, and no third-party analytics — ${deviceClaim}, and each tool keeps working offline once it has been opened. All ${total} are free with no gated features and no paid tier.`;

  // A stand-in slug, not a real one: naming an actual tool here would go stale
  // the day that tool is renamed, and every real snippet is already generated,
  // correctly, on that tool's own page (`injectEmbedWidget` in embed.mjs) — this
  // is illustrating the one shape that snippet always takes, not replacing it.
  const embedSample = `<iframe src="${baseUrl}<tool-slug>/?${EMBED_QUERY_PARAM}=1" style="width:100%;max-width:820px;border:0;min-height:${DEFAULT_EMBED_HEIGHT}px" loading="lazy"></iframe>`;

  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: title,
    url,
    description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: baseUrl },
        { '@type': 'ListItem', position: 2, name: title, item: url },
      ],
    },
  };

  const categoryLinks = groups
    .map(
      ({ category, items }) =>
        `        <li><a href="${escapeHtml(`${toRoot}${categoryPagePath(category.id)}`)}">${escapeHtml(
          categoryPageCopy(category).title,
        )}</a> <span>(${items.length})</span></li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${title} | ${SITE_NAME}`)}</title>
  <meta name="description" content="${escapeHtml(snippetize(description))}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — new tools`)}" href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} — free, private, in your browser`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(aboutLd)}</script>
  <style>${CATEGORY_STYLE}${ABOUT_STYLE}  </style>
</head>
<body>
  <div class="wrap">
    <p class="crumbs"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">All ${total} free tools</a> › About</p>
    <header>
      <p class="eyebrow">About</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${total} free calculators and checks for people who run a small business. They run in your browser, they cost nothing, and ${deviceClaim}.</p>
    </header>

    <main class="prose">
      <h2>What this is</h2>
      <p>
        A working set of ${total} small, single-purpose web tools across
        ${categoryCount} areas — pricing a job, checking what a marketplace sale
        actually nets, planning cashflow, normalising freight quotes, and
        assembling the evidence a compliance obligation asks for. Each one
        exists because the arithmetic behind it is easy to get wrong under time
        pressure and expensive to get wrong in front of a customer.
      </p>
      <p>
        They are deliberately narrow. A tool here answers one question for one
        kind of business, rather than being a spreadsheet template that answers
        none of them well.
      </p>

      <h2>What happens to what you type</h2>
      <div class="panel">
        <h3>${exceptions.length ? `Nothing, with ${exceptions.length === 1 ? 'one documented exception' : `${exceptions.length} documented exceptions`} below.` : 'Nothing. There is no server that could receive it.'}</h3>
        <p>
          Every tool on this site is a static page. The calculation happens in
          your browser, in JavaScript you can read with your browser's own
          <em>View Source</em> or developer tools — no build step, no
          minification, nothing hidden from you. Specifically:
        </p>
        <ul>
          <li><strong>No account and no sign-up.</strong> There is no login, no email capture, and no "enter your address to see the result" gate.</li>
          <li><strong>${exceptions.length ? `Nothing you enter is transmitted, with ${exceptions.length === 1 ? 'one documented exception' : `${exceptions.length} documented exceptions`}.` : 'Nothing you enter is transmitted.'}</strong> These pages make no network request with your input — no form post, no background beacon${exceptions.length ? ` — except ${exceptionNames}, each of which checks a live public API as its whole job. What you paste there to look up goes to ${exceptionHosts} and nowhere else on this site; that page explains exactly what is sent` : ''}.</li>
          <li><strong>No third-party scripts.</strong> No analytics vendor, no tag manager, no advertising network, no hosted fonts, no CDN. ${exceptions.length ? `Besides the live API call${exceptions.length === 1 ? '' : 's'} ${exceptionNames} make${exceptions.length === 1 ? 's' : ''}, above, the` : 'The'} only outside addresses on this site are links you can choose to click.</li>
          <li><strong>No cookies and no cross-site identifiers.</strong></li>
          <li><strong>It works offline.</strong> Once a tool has loaded, its page keeps working with the connection off, which is the plainest demonstration that the answer is computed where you are${exceptions.length ? ` — except ${exceptionNames}, whose whole point is a live lookup, so it needs the connection back to check anything new` : ''}.</li>
        </ul>
      </div>
      <p>
        The one thing that is counted is which tools get opened, as a plain
        tally that is written to your own browser's local storage and is never
        sent anywhere. It exists so the next tool built is one people actually
        opened. Browsers sending <em>Do&nbsp;Not&nbsp;Track</em> or
        <em>Global&nbsp;Privacy&nbsp;Control</em> are not counted at all, and
        there is an opt-out checkbox at the foot of
        <a href="${escapeHtml(toRoot)}" data-pf-to="hub">the tool list</a>.
      </p>

      <h2>Why it is free</h2>
      <p>
        Because keeping it free costs almost nothing. A static page has no
        per-user cost, so there is no usage to meter and no reason to build a
        paywall around arithmetic. There is no paid tier, no trial, and no
        feature held back — the version you are using is the whole product.
      </p>
      <p>
        If one of these has saved you money,
        <a href="${SPONSORS_URL}">sponsoring on
        GitHub</a> is welcome and entirely optional. Declining changes nothing
        about what any tool does, and nothing here is gated behind it.
      </p>

      <h2>What these tools are not</h2>
      <p>
        They are estimates and working records, not professional advice and not
        a determination made on anyone's behalf. They do not replace a
        quantity surveyor, an accountant, a lawyer, or an engineer, and the
        output of any of them is a starting figure to check against your own
        numbers before you quote it to a customer or file it anywhere. The full
        terms are in the footer of this and every other page.
      </p>

      <h2>Linking to these tools</h2>
      <p>
        You do not need permission to link to anything here, quote a page, or
        screenshot a result — for a forum answer, a trade newsletter, a course
        handout, or a write-up. Linking straight to the individual tool is more
        use to a reader than linking to the front page. If it helps, here is
        the description, already written:
      </p>
      <h3>One line</h3>
      <p class="boiler">${escapeHtml(shortBoiler)}</p>
      <h3>A paragraph</h3>
      <p class="boiler">${escapeHtml(longBoiler)}</p>
      <h3>The facts, if you would rather write your own</h3>
      <ul>
        <li><strong>${total} tools</strong> across ${categoryCount} categories, all free, none gated.</li>
        <li><strong>Runs client-side.</strong> Static pages; no account, no third-party analytics; works offline once opened.${exceptions.length ? ` ${exceptionNames} ${exceptions.length === 1 ? 'is the one documented exception' : 'are the documented exceptions'} — see Privacy above.` : ' No upload.'}</li>
        <li><strong>MIT licensed.</strong> Every tool ships its licence text alongside it — open any tool and add <code>LICENSE</code> to its address.</li>
        <li><strong>Front page:</strong> <a href="${escapeHtml(toRoot)}" data-pf-to="hub">${escapeHtml(baseUrl)}</a></li>
      </ul>
      <p>
        Please do not describe these as certified, audited, guaranteed, or as
        professional advice — they are none of those things, and saying so
        would mislead the person you are recommending them to.
      </p>

      <h2>Embedding a tool on your own page</h2>
      <p>
        Every one of the ${total} tools here can be framed on someone else's
        page — a trade association's resource page, a supplier's blog post, a
        forum's sidebar. Open any tool and scroll to the bottom for a
        ready-made, copyable snippet built from that page's own address and
        title; there is nothing to write by hand. It always takes this shape:
      </p>
      <p class="boiler">${escapeHtml(embedSample)}</p>
      <ul>
        <li><strong>Same arithmetic, same disclaimer.</strong> The framed page is the calculator's own page, not a stripped-down copy, so it keeps the tool's full working and its liability notice.</li>
        <li><strong>Links back.</strong> A framed tool swaps its own site-wide navigation for one line linking back to the full page here, so a visitor can always reach the rest of the site.</li>
        <li><strong>Adds nothing.</strong> No script, cookie, or request is added by embedding — the framed page runs the same client-side arithmetic described above, on the host's page instead of this one.</li>
        <li><strong>${DEFAULT_EMBED_HEIGHT}px is a starting height</strong>, not a fit for every form; most hosts adjust it once the embed is on the page.</li>
      </ul>
      <p>
        This needs no permission and no message to us first.
      </p>

      <h2>For crawlers and assistants</h2>
      <p>
        The catalogue is published in machine-readable form so an assistant can
        cite the right tool rather than guess at one:
        <a href="${escapeHtml(`${toRoot}catalog.json`)}">catalog.json</a> lists
        every tool with its category and description,
        <a href="${escapeHtml(`${toRoot}llms.txt`)}">llms.txt</a> is the same
        catalogue as prose, and
        <a href="${escapeHtml(`${toRoot}sitemap.xml`)}">sitemap.xml</a> indexes
        every published page. Every tool page carries
        <code>SoftwareApplication</code> structured data. To follow new tools
        rather than re-read the catalogue, subscribe to the
        <a href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">Atom feed</a>.
      </p>
    </main>

    <section class="siblings">
      <h2>Browse by trade</h2>
      <ul>
${categoryLinks}
      </ul>
    </section>

    <footer>${disclaimerHtml(toRoot, surfaces)}
      <p style="margin-top:18px"><a href="${escapeHtml(toRoot)}" data-pf-to="hub">Back to all ${total} tools</a> · <a href="${escapeHtml(`${toRoot}${COMPARE_PATH}`)}">Comparisons</a> · <a href="${escapeHtml(`${toRoot}llms.txt`)}">llms.txt</a> · <a href="${escapeHtml(`${toRoot}sitemap.xml`)}">Sitemap</a> · <a href="${escapeHtml(`${toRoot}${FEED_FILE}`)}">Feed</a></p>
    </footer>
  </div>
  <!-- The same local-only counter every other page loads. An About page that
       nobody reaches is a different problem from one that is reached and does
       not send anyone on to a tool, and only the cross_tool_click half of this
       tells them apart. -->
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="about" defer></script>
</body>
</html>
`;
}

export function renderHub(surfaces, baseUrl) {
  const groups = groupByCategory(surfaces);

  // Indexes first, then the words they turn out to share, then the cards. The
  // stopword cut is a property of the whole catalogue, so it cannot be decided
  // one card at a time.
  const rawIndex = new Map(
    surfaces.map((surface) => [
      surface.slug,
      {
        name: searchTokens([surface.title, surface.slug]),
        // The words a person chose for this tool: its name, plus the aliases
        // someone wrote down because a query was reaching nothing. Both are
        // deliberate, which is the property the closest-match trigger needs.
        // Kept apart from `name` so an alias never earns the name weight in
        // the ranking itself — reach and relevance are different claims.
        strong: searchTokens([surface.title, surface.slug, aliasesFor(surface.slug)]),
        index:
          surface.searchIndex ??
          searchTokens([
            surface.title,
            surface.fullDescription ?? surface.description,
            surface.slug,
            aliasesFor(surface.slug),
          ]),
      },
    ]),
  );
  const catalogueStops = catalogueStopwords([...rawIndex.values()]);
  // One set for the page: the browser normalises a query with exactly the list
  // the index was built from, generic and derived words alike.
  const stopwords = [...new Set([...SEARCH_STOPWORDS, ...catalogueStops])].sort();

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Free calculators and checks for people who run a small business',
    url: baseUrl,
    description:
      'Free, private, browser-only calculators for marketplace sellers, trade contractors, logistics buyers, and small teams preparing compliance evidence.',
    isPartOf: { '@type': 'WebSite', name: 'Free small-business calculators', url: baseUrl },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: surfaces.length,
      itemListElement: surfaces.map((surface, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: surface.title,
        description: surface.description,
        url: `${baseUrl}${surface.slug}/`,
      })),
    },
  };

  // A tool card. `headingLevel` follows the section it lands in so the document
  // outline stays legal: a card is an h3 in a flat category and an h4 under a
  // sub-group's h3. Screen-reader heading navigation is the browse path for
  // anyone not using the search box, so it has to describe the real nesting.
  const renderCard = (surface, headingLevel) => `          <li class="card" data-name="${escapeHtml(
    rawIndex.get(surface.slug).name,
  )}" data-strong="${escapeHtml(
    withoutStopwords(rawIndex.get(surface.slug).strong, catalogueStops),
  )}" data-search="${escapeHtml(
    withoutStopwords(rawIndex.get(surface.slug).index, catalogueStops),
  )}">
            <a href="${escapeHtml(surface.slug)}/" data-tool="${escapeHtml(surface.slug)}">
              <h${headingLevel}>${escapeHtml(surface.title)}</h${headingLevel}>
            </a>
            <p>${escapeHtml(surface.description)}</p>
            ${
              surface.pageCount > 1
                ? `<p class="meta">${surface.pageCount} question${surface.pageCount === 1 ? '' : 's'} answered</p>`
                : ''
            }
          </li>`;

  const sections = groups
    .map(({ category, items }) => {
      const subgroups = groupBySubcategory(category.id, items);
      // One unnamed sub-group means the category is small enough to read as a
      // flat list; rendering a lone sub-heading over it would be noise.
      const flat = subgroups.length === 1 && subgroups[0].subcategory === null;
      const body = flat
        ? `        <ul class="cards">
${items.map((surface) => renderCard(surface, 3)).join('\n')}
        </ul>`
        : subgroups
            .map(
              ({ subcategory, items: subItems }) => `        <section class="subgroup" id="${subcategory.id}" data-subgroup="${subcategory.id}">
          <h3>${escapeHtml(subcategory.title)} <span class="subgroup-count">${subItems.length}</span></h3>
          <ul class="cards">
${subItems.map((surface) => renderCard(surface, 4)).join('\n')}
          </ul>
        </section>`,
            )
            .join('\n');

      // The heading links its own category page. This is the only path a
      // crawler has to those pages from the hub, and it is also the honest
      // affordance for a visitor who wants one trade rather than all six —
      // without it the section heading is the one thing on this page that
      // names a subject and cannot be opened.
      return `
      <section class="group" id="${category.id}" data-group="${category.id}">
        <h2><a class="group-link" href="${escapeHtml(categoryPagePath(category.id))}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.title)}</a></h2>
        <p class="group-blurb">${escapeHtml(category.blurb)}</p>
${body}
      </section>`;
    })
    .join('\n');

  // A contents index, because the hub is 43 screens tall on a phone and a
  // contractor reading it is often standing on a job site. Without this, the
  // only route to "Compliance checks" is scrolling past 28 screens of trade
  // cards, and the only alternative is a search box that needs the visitor to
  // already know what the tool is called.
  //
  // Plain in-page anchors, so it works before — and without — the script.
  const contents = `
    <nav class="contents" id="contents" aria-label="Jump to a section">
${groups
  .map(({ category, items }) => {
    const subgroups = groupBySubcategory(category.id, items).filter((g) => g.subcategory);
    const children = subgroups.length
      ? `
        <ul>
${subgroups
  .map(
    ({ subcategory, items: subItems }) =>
      `          <li><a href="#${subcategory.id}">${escapeHtml(subcategory.title)} <span>${subItems.length}</span></a></li>`,
  )
  .join('\n')}
        </ul>`
      : '';
    return `      <div class="contents-group">
        <a class="contents-top" href="#${category.id}">${escapeHtml(category.title)} <span>${items.length}</span></a>${children}
      </div>`;
  })
  .join('\n')}
    </nav>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="./favicon.ico" sizes="16x16">
  <title>Free Small-Business Calculators | Marketplace Fees, Trade Bids, Freight &amp; Compliance</title>
  <meta name="description" content="${escapeHtml(
    snippetize(
      `${surfaces.length} free, private calculators for marketplace sellers, trade contractors, logistics buyers and small teams. Everything runs in your browser, nothing uploaded.`,
    ),
  )}">
  <link rel="canonical" href="${escapeHtml(baseUrl)}">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="favicon.ico" sizes="16x16">
  <!-- Feed autodiscovery. This is how a reader, and every aggregator that
       accepts a site URL rather than a feed URL, finds the feed at all. -->
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — new tools`)}" href="${escapeHtml(FEED_FILE)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Free small-business calculators">
  <meta property="og:description" content="Price a listing, bid a job, audit a freight bill, or produce a compliance record — free, and entirely in your browser.">
  <meta property="og:url" content="${escapeHtml(baseUrl)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} — free, private, in your browser`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #eef2f7; --panel: #ffffff; --ink: #1d2530; --muted: #4a5666;
      --line: #d3dce6; --accent: #12594a; --accent-ink: #f2f8f5;
      /* One step quieter than --muted, and the quietest ink on this page.
         It exists because the de-emphasis it provides used to be spelled as an
         opacity, which is not a colour and therefore cannot be checked:
         --muted at .65 renders #89919c on the white panel, 3.18:1, under the
         4.5:1 WCAG AA needs for body-size text. The group counts are the only
         thing that told a visitor how big a category is, so the number that
         failed was content, not decoration. Naming the tint makes it a value
         contrast.mjs can measure. */
      --soft: #656e78;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #10151c; --panel: #171e27; --ink: #e8eef5; --muted: #a2b0c0;
              --line: #2a343f; --accent: #7fd8c0; --accent-ink: #0d1319;
              --soft: #8d9aab; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 34px 18px 60px; }
    header { max-width: 720px; margin-bottom: 26px; }
    .eyebrow { font-size: .78rem; font-weight: 700; letter-spacing: .09em;
               text-transform: uppercase; color: var(--accent); margin: 0 0 8px; }
    h1 { font-size: clamp(2rem, 6vw, 3.3rem); line-height: 1.02; letter-spacing: -.045em; margin: 0 0 14px; }
    .lede { font-size: 1.06rem; line-height: 1.55; color: var(--muted); margin: 0 0 6px; }
    .search { margin: 26px 0 8px; }
    .search label { display: block; font-size: .87rem; font-weight: 650; margin-bottom: 6px; }
    .search input { width: 100%; max-width: 520px; padding: 12px 14px; font: inherit;
                    border: 1px solid var(--line); border-radius: 9px;
                    background: var(--panel); color: var(--ink); }
    .count { font-size: .85rem; color: var(--muted); margin: 8px 0 0; }
    .closest { font-size: .85rem; color: var(--ink); margin: 6px 0 0; max-width: 520px; }
    /* Multi-column rather than grid: one section holds eight sub-groups and the
       rest hold none, and grid would size every cell in the row to that tallest
       one, leaving four columns of white space beside it. Columns just flow. */
    .contents { margin-top: 26px; padding: 16px 18px; background: var(--panel);
                border: 1px solid var(--line); border-radius: 13px;
                columns: 210px; column-gap: 22px; }
    .contents[hidden] { display: none; }
    .contents-group { break-inside: avoid; margin: 0 0 14px; }
    .contents ul { list-style: none; margin: 6px 0 0; padding: 0; }
    .contents li { margin-top: 2px; }
    .contents a { color: inherit; text-decoration: none; display: block;
                  padding: 3px 0; font-size: .88rem; line-height: 1.35; }
    .contents a:hover, .contents a:focus-visible { color: var(--accent); text-decoration: underline; }
    .contents .contents-top { font-weight: 700; font-size: .93rem; }
    .contents li a { color: var(--muted); padding-left: 10px;
                     border-left: 1px solid var(--line); }
    .contents span { font-weight: 600; color: var(--soft); }
    /* Anchor targets clear the section heading of the viewport edge, so a jump
       lands on the heading rather than on its first row of cards. */
    .group, .subgroup { scroll-margin-top: 14px; }
    .group { margin-top: 38px; }
    .group h2 { font-size: 1.3rem; margin: 0 0 4px; letter-spacing: -.02em; }
    .group h2 a { color: inherit; text-decoration: none; }
    .group h2 a:hover, .group h2 a:focus-visible { color: var(--accent); text-decoration: underline; }
    .group-blurb { color: var(--muted); margin: 0 0 16px; font-size: .95rem; line-height: 1.5; }
    .cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px;
             grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
            padding: 17px 18px; }
    .subgroup { margin-top: 26px; }
    .subgroup[hidden] { display: none; }
    .subgroup h3 { font-size: .82rem; text-transform: uppercase; letter-spacing: .07em;
                   color: var(--muted); font-weight: 700; margin: 0 0 12px;
                   padding-bottom: 7px; border-bottom: 1px solid var(--line); }
    .subgroup-count { font-weight: 600; color: var(--soft); letter-spacing: 0; }
    .card h3, .card h4 { margin: 0 0 7px; font-size: 1.03rem; line-height: 1.25; }
    .card a { color: inherit; text-decoration: none; }
    .card a:hover h3, .card a:focus-visible h3,
    .card a:hover h4, .card a:focus-visible h4 { color: var(--accent); text-decoration: underline; }
    .card p { margin: 0; font-size: .89rem; line-height: 1.5; color: var(--muted); }
    .card .meta { margin-top: 9px; font-size: .78rem; font-weight: 650; color: var(--accent); }
    .yours { margin-top: 30px; padding: 16px 18px 18px; background: var(--panel);
             border: 1px solid var(--line); border-radius: 13px; }
    .yours h2 { font-size: 1.05rem; margin: 0 0 4px; letter-spacing: -.01em; }
    .yours p { color: var(--muted); margin: 0 0 12px; font-size: .87rem; line-height: 1.5; }
    .yours ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .yours li { margin: 0; }
    .yours li a { display: inline-block; border: 1px solid var(--line); border-radius: 999px;
                  padding: 7px 14px; font-size: .88rem; font-weight: 600;
                  color: var(--ink); text-decoration: none; background: var(--bg); }
    .yours li a:hover, .yours li a:focus-visible { border-color: var(--accent); color: var(--accent); }
    .yours .times { display: block; font-size: .72rem; color: var(--muted); margin-top: 3px; padding-left: 4px; }
    .bids { margin-top: 30px; padding: 16px 18px 18px; background: var(--panel);
            border: 1px solid var(--line); border-radius: 13px; }
    .bids h2 { font-size: 1.05rem; margin: 0 0 4px; letter-spacing: -.01em; }
    .bids p { color: var(--muted); margin: 0 0 12px; font-size: .87rem; line-height: 1.5; }
    .bids ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .bids li { margin: 0; }
    .bids li a { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
                 border: 1px solid var(--line); border-radius: 11px; padding: 9px 13px;
                 color: var(--ink); text-decoration: none; background: var(--bg); }
    .bids li a:hover, .bids li a:focus-visible { border-color: var(--accent); }
    .bids li a:hover .bid-name, .bids li a:focus-visible .bid-name { color: var(--accent); }
    .bids .bid-name { font-size: .92rem; font-weight: 650; }
    .bids .bid-amount { font-size: .86rem; font-weight: 650; white-space: nowrap;
      font-variant-numeric: tabular-nums; }
    .bids .bid-amount[hidden] { display: none; }
    .bids .bid-where { font-size: .8rem; color: var(--muted); }
    .bids .bid-when { font-size: .74rem; color: var(--muted); margin-left: auto; }
    /* Not muted, unlike every other line of prose in this panel: it is the
       sentence the section is worth opening for. */
    .bids .bid-summary { color: var(--ink); font-weight: 600; margin: 0 0 12px; }
    .bids .bid-state { font-size: .74rem; border: 1px solid var(--line); border-radius: 999px;
                       padding: 1px 8px; color: var(--muted); }
    /* The one row state that is asking for something. */
    .bids .bid-state[data-state="waiting"] { color: var(--accent); border-color: var(--accent); }
    /* A quiet quote keeps the waiting colour — it is the same state, further
       along — and the row carries the word "Chase" beside it rather than a
       second hue. Weight and a word do the work, so the distinction survives a
       monochrome print and reads for a visitor who cannot separate the two
       colours. */
    .bids .bid-state[data-state="quiet"] { color: var(--accent); border-color: var(--accent);
                                           font-weight: 700; }
    .bids .bid-chase-tag { font-size: .74rem; font-weight: 700; letter-spacing: .03em;
                           border: 1px solid var(--accent); border-radius: 999px;
                           padding: 1px 8px; color: var(--accent); white-space: nowrap; }
    .bids .bid-chase { color: var(--ink); margin: -4px 0 12px; padding: 8px 10px;
                       border-left: 3px solid var(--accent); background: var(--bg);
                       border-radius: 0 8px 8px 0; font-size: .85rem; }
    /* All four standing readings share one rule, in the muted border rather
       than the accent one: the chase line is asking the contractor to do
       something today, and these are standing readings about their pricing.
       Stacked accent bars would make none of them the thing to act on. */
    .bids .bid-pricing,
    .bids .bid-win-rate,
    .bids .bid-trend,
    .bids .bid-keep,
    .bids .bid-mix { color: var(--ink); margin: -4px 0 12px; padding: 8px 10px;
                     border-left: 3px solid var(--line); background: var(--bg);
                     border-radius: 0 8px 8px 0; font-size: .85rem; }
    .bids li a:has(.bid-state[data-state="won"]) .bid-name,
    .bids li a:has(.bid-state[data-state="lost"]) .bid-name { font-weight: 550; color: var(--muted); }
    .bids .bid-more { margin: 10px 0 0; font-size: .82rem; color: var(--muted); }
    .bids .bid-more button { font: inherit; font-size: .82rem; color: var(--accent);
                             background: none; border: 0; padding: 0; cursor: pointer;
                             text-decoration: underline; }
    /* A bid name is a customer's name or their street address. It is the
       visitor's own data on their own device, but it has no place on a sheet
       they hand to somebody else. */
    @media print { .bids { display: none; } }
    .empty { display: none; color: var(--muted); font-style: italic; margin-top: 30px; }
    footer { margin-top: 52px; border-top: 1px solid var(--line); padding-top: 24px;
             font-size: .87rem; line-height: 1.6; color: var(--muted); }
    footer h2 { font-size: .95rem; color: var(--ink); margin: 20px 0 6px; }
    footer a { color: var(--accent); }
    .support { background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
               padding: 15px 18px; margin-top: 26px; }
    .optout { margin-top: 18px; font-size: .84rem; }
    .offline p { margin: 8px 0 12px; font-size: .9rem; line-height: 1.5; color: var(--muted); }
    .offline button { font: inherit; font-weight: 650; padding: 10px 16px; border-radius: 9px;
                      border: 1px solid var(--accent); background: var(--accent);
                      color: var(--accent-ink); cursor: pointer; }
    .offline button[disabled] { opacity: .6; cursor: progress; }
    .offline #offline-status:empty { display: none; }
    .offline #offline-status { margin: 10px 0 0; font-size: .85rem; }
    .backup p { margin: 8px 0 0; font-size: .9rem; line-height: 1.5; color: var(--muted); }
    .backup .backup-actions { display: flex; flex-wrap: wrap; align-items: center;
                              gap: 8px 12px; margin-top: 12px; }
    .backup .backup-actions label { font-size: .85rem; font-weight: 650; color: var(--ink); }
    .backup button { font: inherit; font-weight: 650; padding: 10px 16px; border-radius: 9px;
                     border: 1px solid var(--accent); background: var(--accent);
                     color: var(--accent-ink); cursor: pointer; }
    .backup input[type=file] { font: inherit; font-size: .85rem; max-width: 100%; }
    .backup .backup-note { font-size: .82rem; }
    .backup #backup-status:empty { display: none; }
    .backup #backup-status { margin: 10px 0 0; font-size: .85rem; color: var(--ink); }
    /* Same reason the saved-bid list is hidden in print: the counts here are
       about a customer list, and the sheet a homeowner receives is not where
       that belongs. */
    @media print { .backup { display: none; } }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <p class="eyebrow">Free &amp; private</p>
      <h1>Calculators for the decisions that cost real money</h1>
      <p class="lede">
        ${surfaces.length} free tools for marketplace sellers, trade contractors,
        logistics buyers, and small teams. Each one answers a specific question
        with your own numbers — the fee, the bid, the bill, the record.
      </p>
      <p class="lede">
        Everything runs in your browser. Nothing you type is uploaded, and there
        is no signup, no trial, and no paid tier.
      </p>
    </header>

    <div class="search">
      <label for="q">Search these tools</label>
      <input id="q" type="search" placeholder="eBay fees, tile backsplash, freight, VAT…"
             autocomplete="off" spellcheck="false">
      <p class="count" id="count"></p>
      <p class="closest" id="closest" hidden></p>
    </div>

${contents}

    <!-- Filled in by script from the saved bids on this device. Above "pick up
         where you left off" deliberately: a contractor whose customer just rang
         back wants the job, not the tool that priced it. -->
    <section class="bids" id="bids" hidden>
      <h2>Your saved bids</h2>
      <p>
        Bids you saved in any tool on this site, newest first. Opening one takes
        you to the tool that priced it with your saved bids showing, ready to
        restore. These are kept in this browser only — never uploaded, and
        clearing your browser data clears them, so download a backup below if
        they matter. Mark one won or lost in the tool that priced it and it
        stops counting as waiting here — and once a few have been decided, this
        page says how often your quotes are landing, whether that is the same
        across the tools you use or one trade pulling it down, and once a trade
        has a longer history, whether it has been landing differently lately
        than it used to. Add what a won job came to once it was delivered and
        it also says which of your trades keeps the most of what it charges —
        and whether that is the same trade your quotes actually land on, which
        is the one thing no single tool here can tell you.
      </p>
      <!-- The reason to open the hub rather than the tool: how many quotes are
           still out, and how long the oldest has been. Drawn only when there is
           something to say — see followUpSentence. -->
      <p class="bid-summary" id="bidsSummary" hidden></p>
      <!-- How long this contractor's customers actually take to answer, and how
           many quotes have outlived that. Read across every tool, which is the
           only place it can usually be read at all: the window needs three
           answered bids, and a contractor working six calculators reaches three
           in none of them while having twelve in total. A reply time is a fact
           about their customers rather than about a trade, so a gutter bid and
           a deck bid belong in the same sample. -->
      <p class="bid-chase" id="bidsChase" hidden></p>
      <!-- How their pricing is landing, pooled the same way and for the same
           reason. The money readings stay on the tool pages, where one tool
           means one trade and one currency; what comes here is percentages
           only, because a percentage over the winning price is unit-free and so
           pools across trades and currencies alike without a conversion this
           site does not have. See pricingSentence. -->
      <p class="bid-pricing" id="bidsPricing" hidden></p>
      <!-- How often the quotes land at all, counted the same way. This is the
           one reading here that needs no figure and no currency — only that a
           bid was marked won or lost — so it draws for a book where every money
           reading in the portfolio draws nothing, and it is the only place a
           contractor working six calculators can see that five of them are fine
           and the sixth is not. See winRateSentence. -->
      <p class="bid-win-rate" id="bidsWinRate" hidden></p>
      <!-- Whether what they changed is working. Directly under the rate it is
           the second derivative of, and the only reading here that asks when a
           bid was priced rather than only what became of it: every line above
           pools the whole book, so a shop that re-costed a trade in June reads
           a rate that averages before and after and cannot see its own change.
           Inside one tool, never pooled across trades. See trendSentence. -->
      <p class="bid-trend" id="bidsTrend" hidden></p>
      <!-- Which of their trades the finished work is actually worth doing, and
           the only reading here about money already earned rather than money
           still being chased. The tool pages each say what one trade kept; this
           is the only place the three a crew works can be put beside each
           other, which is the comparison that decides what they go and sell.
           Percentages only, for the reason the pricing line above is: a share
           of a bid's own price is unit-free, so trades and currencies compare
           without a conversion. See keepSentence. -->
      <p class="bid-keep" id="bidsKeep" hidden></p>
      <!-- The two lines above, crossed. Last because it is the only reading
           here that is a decision rather than a measurement: the rate says
           which quotes land, the kept share says which finished jobs paid, and
           a shop whose best-landing trade is its worst-keeping one is being
           told by both of the lines above to do the wrong thing. Drawn only
           when the two rankings clearly oppose or clearly agree — a hedge
           would be a line on the busiest page in the site that changes
           nothing. See mixSentence. -->
      <p class="bid-mix" id="bidsMix" hidden></p>
      <ul id="bidsList"></ul>
      <p class="bid-more" id="bidsMore" hidden></p>
    </section>

    <!-- Directly under the list it backs up, and deliberately still drawn when
         that list is empty: the browser with no saved bids is exactly the one
         where "restore from a backup" is the only thing that helps, and a
         control tucked inside the hidden section above would be unreachable
         there. The script re-words it for the two cases. -->
${BACKUP_WIDGET_HTML}

    <!-- Filled in by script from counts held on this device; a visitor with no
         history, no storage, or an opt-out never sees it. -->
    <section class="yours" id="yours" hidden>
      <h2>Pick up where you left off</h2>
      <p>
        The tools you have opened in this browser, most used first. This list is
        built from a count kept on your own device — it is never uploaded, and
        clearing your browser data clears it.
      </p>
      <ul id="yoursList"></ul>
    </section>

${sections}

    <p class="empty" id="empty">No tool matches that. Try a marketplace, a trade, or the thing you are pricing.</p>

${OFFLINE_WIDGET_HTML}

    <div class="support">
      <strong>Free, and staying free.</strong> If one of these saved you money,
      <a href="${SPONSORS_URL}">sponsoring on GitHub</a>
      is welcome and entirely optional — nothing here is gated behind it, and
      declining changes nothing about what the tools do.
    </div>

    <footer>
${disclaimerHtml('', surfaces)}
      <p class="optout">
        <label><input type="checkbox" id="optout"> Don't count my visit</label>
      </p>
      <p>
        Open source — every tool is a static page, and one you have opened keeps
        working with no connection.
        <a href="${ABOUT_PATH}">About &amp; press kit</a> ·
        <a href="${COMPARE_PATH}">Comparisons</a> ·
        <a href="catalog.json">Machine-readable catalog</a> ·
        <a href="llms.txt">llms.txt</a> ·
        <a href="sitemap.xml">Sitemap</a> ·
        <a href="${FEED_FILE}" type="application/atom+xml">New tools feed</a>
      </p>
    </footer>
  </div>

  <script type="module">
    // Search filters the already-rendered list, so the page is fully usable
    // with JavaScript off: without it every tool is simply visible.
    const q = document.getElementById('q');
    const count = document.getElementById('count');
    const empty = document.getElementById('empty');
    const closest = document.getElementById('closest');
    const contents = document.getElementById('contents');
    // How many near-misses to offer when nothing matches every word. Enough to
    // be a real second chance on a phone, short enough that the list is still
    // a suggestion rather than the catalogue back again.
    const CLOSEST_LIMIT = 8;
    const cards = [...document.querySelectorAll('.card')];
    // Sub-groups and their parent sections both empty out on a query. Each is
    // decided from its own descendant cards, so one flat list covers both and
    // the order within it does not matter.
    const groups = [...document.querySelectorAll('.subgroup, .group')];
    const total = cards.length;

    // The catalogue order, kept so clearing the box puts the directory back
    // exactly as it was rendered. Ranking reorders siblings in place — cards
    // inside their list, sub-groups inside their section, sections inside the
    // page — so a card never leaves the heading that describes it and the
    // document outline a screen reader walks stays the one the markup built.
    const sections = [...document.querySelectorAll('.group')];
    const subgroups = [...document.querySelectorAll('.subgroup')];
    // Sections are not the last children of their parent (the empty-state
    // paragraph, the offline widget and the footer follow them), so they are
    // re-inserted before a fixed anchor rather than appended.
    const sectionAnchor = sections.length ? sections[sections.length - 1].nextSibling : null;
    const sectionHome = sections.length ? sections[0].parentNode : null;
    let ranked = false;

    // Injected from build.mjs rather than written twice: a stemmer that
    // disagreed with its tests would be a search bug nothing could catch.
    ${searchVariants.toString()}

    // Likewise injected rather than reimplemented: the weights below decide
    // what a visitor sees first, and a copy that drifted from the tested one
    // would be a ranking bug with a green suite.
    ${searchScore.toString()}

    // Every query word must hit, so "ebay return" narrows to the eBay tool
    // instead of finding nothing because those two words are never adjacent.
    // A word matches at a token boundary, which is what makes a half-typed
    // "backspl" still find the backsplash calculator.
    //
    // "forms" is one entry per query word, each the output of searchVariants,
    // so a word hits when any of its forms does. Built once per keystroke in
    // normalise() instead of per card -- 163 cards would recompute it 163
    // times for an answer that cannot differ between them.
    const matches = (index, forms, boundary) =>
      forms.every((variants) =>
        variants.some((word) =>
          boundary ? (' ' + index).includes(' ' + word) : index.includes(word)));

    // The query is normalised exactly as the index was. It has to be: a word
    // the index never stores can never match, so keeping it would force every
    // query containing it down to zero hits — typing "2/10 net 30" would find
    // nothing because "2" was dropped at build time but not from the query.
    // Generic English plus the words this catalogue's own copy repeats so often
    // they cannot narrow anything — derived at build time from the indexes
    // above, never from a hand-written list that would describe last month's
    // catalogue. A word in any tool's *name* is never in here.
    const STOPWORDS = new Set(${JSON.stringify(stopwords)});
    const normalise = (text) =>
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
        .map(searchVariants);

    // Highest-scoring visible card inside a container, or -1 when it has none.
    // Hidden cards are excluded on purpose: a sub-group whose only match is
    // filtered out has nothing to offer this query and should not lead on the
    // strength of a card the visitor cannot see.
    const best = (node, score) => {
      let top = -1;
      for (const card of node.querySelectorAll('.card')) {
        if (!card.hidden) top = Math.max(top, score(card));
      }
      return top;
    };

    // Re-insert each node among its own siblings, highest score first. Sort is
    // stable, so equal scores keep catalogue order — which is what makes a
    // one-word query that matches nothing in particular leave the page looking
    // exactly as it did.
    const reorder = (nodes, valueOf, anchor) => {
      const byParent = new Map();
      for (const node of nodes) {
        if (!byParent.has(node.parentNode)) byParent.set(node.parentNode, []);
        byParent.get(node.parentNode).push(node);
      }
      for (const [parent, siblings] of byParent) {
        const ordered = siblings
          .map((node, index) => ({ node, index, value: valueOf(node) }))
          .sort((a, b) => b.value - a.value || a.index - b.index);
        for (const { node } of ordered) parent.insertBefore(node, anchor ?? null);
      }
    };

    // Put the catalogue back in the order the build wrote it.
    const restore = () => {
      for (const card of cards) card.parentNode.appendChild(card);
      for (const subgroup of subgroups) subgroup.parentNode.appendChild(subgroup);
      for (const section of sections) sectionHome.insertBefore(section, sectionAnchor);
    };

    function filter() {
      const forms = normalise(q.value.trim());
      // Token-prefix first; fall back to a loose substring pass so a query that
      // would have matched before this became token-aware still matches.
      let boundary = true;
      if (forms.length && !cards.some((c) => matches(c.dataset.search, forms, true))) {
        boundary = false;
      }
      let shown = 0;
      const score = new Map();
      for (const card of cards) {
        const hit = !forms.length || matches(card.dataset.search, forms, boundary);
        card.hidden = !hit;
        if (hit) shown += 1;
        score.set(
          card,
          hit && forms.length
            ? searchScore(card.dataset.name || '', card.dataset.search, forms, boundary)
            : 0,
        );
      }
      // Every word has to hit, which is what keeps a two-word query precise —
      // and what turns a typed sentence into nothing at all. "new roof
      // estimate", "tree removal quote" and "freight class calculator" each
      // returned zero against the built site while the tool sat there, because
      // one word of the sentence ("estimate", "quote", "class") is not in any
      // index. People type sentences; requiring the visitor to guess the
      // keyword is the hub's job, not theirs.
      //
      // So when nothing matches every word, keep the strict pass as the answer
      // it is — none — and offer the best partial matches instead of a dead
      // end. Ranked by the same function, capped, and labelled as approximate:
      // showing sixty loosely-related tools under the visitor's exact words
      // would be its own kind of wrong answer.
      //
      // The other half of the same failure is a sentence that matches exactly
      // one tool by accident. "install water heater" returns the *boiler*
      // calculator alone: it happens to use all three words somewhere in its
      // copy, and the water-heater calculator does not say "install". One
      // confident wrong answer is worse than none. So the shortlist also runs
      // when nothing that matched carries a query word in data-strong — the
      // tool's name plus its aliases, the words a person deliberately gave it.
      // A tool nobody named and nobody aliased is a coincidence, not an answer.
      //
      // Aliases have to count. An earlier version tested the name alone, and
      // since an alias exists precisely because the word is *not* in the name,
      // it demoted "air conditioning" and "asphalt shingles" — both answered
      // exactly, both by alias — behind loose matches.
      //
      // Scored at a token boundary even where the loose pass is in force. That
      // pass exists so a half-typed word still matches; reused for ranking it
      // scores "air" inside "stair", "chair" and "repair", which is how a
      // suggestion list fills up with the wrong trade.
      const strongly = (card) =>
        forms.some((variants) =>
          variants.some((word) => (' ' + (card.dataset.strong || '')).includes(' ' + word)));
      let closestFor = 0;
      if (forms.length && (shown === 0 || !cards.some((c) => !c.hidden && strongly(c)))) {
        const partial = cards
          .map((card) => ({
            card,
            value: searchScore(card.dataset.name || '', card.dataset.search, forms, true),
          }))
          // A whole word has to land somewhere. Below that the score is only
          // the name-length tie-break, which every card has and which means
          // nothing on its own.
          .filter(({ value }) => value >= 1)
          .sort((a, b) => b.value - a.value)
          .slice(0, CLOSEST_LIMIT);
        // Only when it actually offers something the strict pass did not. For a
        // one-word query the two sets are the same by construction, and
        // labelling an exact answer as approximate would be the page lying
        // about its own result.
        if (partial.some(({ card }) => card.hidden)) {
          for (const card of cards) card.hidden = true;
          for (const { card, value } of partial) {
            card.hidden = false;
            score.set(card, value);
          }
          closestFor = partial.length;
        }
      }
      for (const group of groups) {
        group.hidden = ![...group.querySelectorAll('.card')].some((c) => !c.hidden);
      }
      // Best answer first, and only while there is a query to be best for. A
      // container's score is its best card's, so the section holding the top
      // tool leads the page and the visitor never scrolls past a heading of
      // near-misses to reach the tool they named.
      if (forms.length) {
        const valueOf = (card) => score.get(card) ?? 0;
        reorder(cards, valueOf);
        reorder(subgroups, (node) => best(node, valueOf));
        reorder(sections, (node) => best(node, valueOf), sectionAnchor);
        ranked = true;
      } else if (ranked) {
        restore();
        ranked = false;
      }
      // The dead end stays a dead end only when even the partial pass found
      // nothing — "wifi" and "locksmith" match no tool here, and saying so is
      // the honest answer.
      empty.style.display = shown === 0 && closestFor === 0 ? 'block' : 'none';
      closest.hidden = closestFor === 0;
      closest.textContent = closestFor === 0
        ? ''
        : (shown === 0
          ? 'No tool matches every word. Closest ' + closestFor + ':'
          : 'No tool is named for that. Closest ' + closestFor + ':');
      count.textContent = !forms.length
        ? total + ' tools'
        : (closestFor || shown) + ' of ' + total + ' tools';
      // The contents index answers "where is my section"; a query has already
      // answered it. Leaving it up would also lie, since its counts are of the
      // whole catalogue and the page below is filtered.
      if (contents) contents.hidden = forms.length > 0;
    }
    q.addEventListener('input', filter);
    filter();

    // Anonymous, aggregate, local-only counting — same convention every tool
    // in this portfolio uses. It records that a hub visit happened and which
    // tool slugs were opened. It never records who, and it never leaves the
    // device.
    const KEY = 'portfolio-hub-usage';
    const OPT_OUT = 'portfolio-hub-optout';
    const optout = document.getElementById('optout');

    function honorsBrowserSignal() {
      try {
        return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
      } catch { return false; }
    }
    function optedOut() {
      try { return localStorage.getItem(OPT_OUT) === '1'; } catch { return true; }
    }
    function record(event) {
      if (optedOut() || honorsBrowserSignal()) return;
      try {
        const current = JSON.parse(localStorage.getItem(KEY) || '{}');
        current[event] = (current[event] || 0) + 1;
        current.last_day = new Date().toISOString().slice(0, 10);
        localStorage.setItem(KEY, JSON.stringify(current));
      } catch { /* private mode, storage disabled — counting is not worth an error */ }
    }

    try { optout.checked = optedOut(); } catch { /* ignore */ }
    optout.addEventListener('change', () => {
      try { localStorage.setItem(OPT_OUT, optout.checked ? '1' : '0'); } catch { /* ignore */ }
    });

    record('hub_visited');
    for (const link of document.querySelectorAll('[data-tool]')) {
      link.addEventListener('click', () => record('tool_opened:' + link.dataset.tool));
    }

    // Thirty-seven tools is a lot to search through when you came back for the
    // one you used last week. Every tool page already records a tool_viewed
    // count for its own slug on this device, so the hub can lead with the tools
    // this browser actually uses without asking anyone to sign in and without a
    // byte leaving the machine. Counting is what makes the shortcut possible,
    // which is also the honest argument for the counting.
    //
    // tool_viewed and not tool_opened: a visit counts however the visitor
    // arrived, and most of them arrive from a search result rather than here.
    function yourTools(limit = 6) {
      // No counts exist for someone who opted out or whose browser asked not to
      // be counted, so there is nothing to show and nothing to decide.
      if (optedOut() || honorsBrowserSignal()) return [];

      let counts;
      try { counts = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return []; }
      if (!counts || typeof counts !== 'object') return [];

      const used = [];
      for (const [event, value] of Object.entries(counts)) {
        const slug = /^tool_viewed:(.*)$/.exec(event)?.[1];
        // Every tool on this site shares one origin, so any page on it can write
        // to this key. Take a slug only in the shape the build produces, and
        // build the link from that — never from the stored string as given.
        if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
        if (!Number.isFinite(value) || value <= 0) continue;
        used.push([slug, value]);
      }

      return used
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit);
    }

    function showYourTools() {
      const section = document.getElementById('yours');
      const list = document.getElementById('yoursList');
      const mine = yourTools();
      list.replaceChildren();

      for (const [slug, times] of mine) {
        // Only offer a tool the hub is actually showing: a slug left behind by
        // a tool that has since been renamed or withdrawn would 404.
        const card = document.querySelector('[data-tool="' + slug + '"]');
        if (!card) continue;

        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = slug + '/';
        link.textContent = card.querySelector('h3')?.textContent.trim() || slug;
        link.addEventListener('click', () => record('tool_opened:' + slug));

        const meta = document.createElement('span');
        meta.className = 'times';
        meta.textContent = times === 1 ? 'opened once' : 'opened ' + times + ' times';

        item.append(link, meta);
        list.append(item);
      }

      section.hidden = list.childElementCount === 0;
    }

    showYourTools();
    // Turning counting off should take the shortcut away with it, in the same
    // click rather than on the next visit.
    optout.addEventListener('change', showYourTools);

    // The saved-bid index.
    //
    // Saved bids are stored per tool and restored per tool — a bid never
    // crosses tools, because the form it was priced on is the only form it
    // fits. What was left unanswered is "which tool was it?": the store is a
    // single key on this one origin, so the hub has held every visitor's whole
    // bid list all along and showed none of it. On Friday, when the customer
    // rings back, that is the difference between one click and remembering
    // which of 162 calculators priced the job on Tuesday.
    //
    // Deliberately not gated on the opt-out, unlike "pick up where you left
    // off" above. That list is derived from counts, so opting out of counting
    // genuinely empties it. These are the visitor's own saved documents; the
    // tool pages show them to someone who has opted out, and the hub hiding
    // them would look like data loss. Only the counting below is gated.
    const BIDS_KEY = 'portfolio-saved-bids';

    // The same function bodies the calculator band runs and the tests here
    // exercise, embedded rather than re-written — so the hub and the tool can
    // never disagree about how old a waiting bid is, or about whether what a
    // tool put on screen reads as a figure at all. See BID_FOLLOW_UP_HELPERS.
    //
    // Declared here rather than relied on from the backup block further down:
    // that block also carries this function, but it is assigned after
    // showSavedBids() has already run once on load.
${BID_FOLLOW_UP_HELPERS}
    // The record shape itself, for the reason it exists -- see
    // BID_RECORD_HELPERS and savedBids() below. It carries
    // normalizeHeadlineAmount, so it stands in for the BID_AMOUNT_HELPER this
    // block used to emit here.
${BID_RECORD_HELPERS}
    // The cross-tool pricing reading. After BID_RECORD_HELPERS because
    // bidAmountValue calls normalizeHeadlineAmount.
${BID_PRICING_HELPERS}

    // How many rows are shown before the list is cut. A contractor keeps up to
    // 25 bids per tool, so a busy one crosses this easily — hence the count
    // below rather than a silent truncation.
    const BIDS_SHOWN = 8;

    function savedBids() {
      let parsed;
      try { parsed = JSON.parse(localStorage.getItem(BIDS_KEY) || '{}'); } catch { return []; }
      const bids = parsed && typeof parsed === 'object' ? parsed.bids : null;
      if (!bids || typeof bids !== 'object') return [];

      const rows = [];
      for (const [slug, list] of Object.entries(bids)) {
        // Any page on this origin can write this key, so a slug is used only in
        // the shape the build produces and the link is built from that — never
        // from the stored string as given. Same rule as yourTools() above.
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
          // normalizeBid itself, not a paraphrase of it. This loop used to be
          // a hand copy, and the copy went stale three times in a row: a field
          // added in jobs.mjs and not here was silently dropped on the way to
          // every hub reading that needed it, and the reading then returned ''
          // forever with nothing failing anywhere. decidedAt did it to
          // chaseSentence, lostTo to pricingSentence, cost to keepSentence.
          //
          // The rule the backup panel already follows (see BID_RECORD_HELPERS)
          // now covers the hub too: the browser gets the tested definition
          // through Function.prototype.toString, so anything added to a bid
          // from here on arrives here without a second edit — and cannot be
          // validated differently on the way.
          const bid = normalizeBid(entry);
          if (!bid) continue;
          // The fields are the job itself — thirty to forty form values, kept
          // so the band can put the whole bid back. Nothing on this page reads
          // them, and they are the only part of the record that is large, so
          // they are the one key dropped. Everything else rides across by
          // spread, which is what stops this going stale again.
          const { fields, ...row } = bid;
          // outcome is absent rather than null on a bid still waiting, which
          // is what lets a bid saved before outcomes existed read as waiting
          // without migrating. The readings test it for truthiness, so the
          // absent key and the old explicit null behave alike.
          rows.push({ slug, ...row });
        }
      }

      // Newest first, with slug and name breaking ties so two bids saved in the
      // same second cannot swap places between renders.
      rows.sort((a, b) =>
        b.at.localeCompare(a.at) || a.slug.localeCompare(b.slug) || a.name.localeCompare(b.name));
      // Every row, uncut. The caller decides how many to draw, and says so.
      return rows;
    }

    let bidsExpanded = false;
    let chaseShown = '';
    let pricingShown = '';
    let winRateShown = '';
    let trendShown = '';
    let keepShown = '';
    let mixShown = '';

    function showSavedBids() {
      const section = document.getElementById('bids');
      const list = document.getElementById('bidsList');
      const more = document.getElementById('bidsMore');
      list.replaceChildren();
      more.replaceChildren();

      // Only offer a tool the hub is actually showing: a bid left behind by a
      // tool since renamed or withdrawn would link to a 404. The bid stays on
      // disk — jobs.mjs keeps unknown slugs for exactly this reason — it is
      // just not offered a link that goes nowhere.
      //
      // Filtered before the cut, not after, so the count below is a count of
      // rows the visitor could actually open.
      const rows = [];
      for (const row of savedBids()) {
        const card = document.querySelector('[data-tool="' + row.slug + '"]');
        // The tool's own heading, taken off the card the row was matched to
        // rather than off the bid: the slug is what storage carries, and
        // "deck-bid-calculator" is not what a contractor calls the thing. Read
        // here, once per row, so winRateSentence stays a pure function of its
        // rows and can be tested without a document.
        if (card) {
          rows.push({
            ...row,
            card,
            label: card.querySelector('h3, h4')?.textContent.trim() || row.slug,
          });
        }
      }

      const now = Date.now();

      // Counted over every row, not the eight drawn: "3 bids are waiting" must
      // mean three on this device, or the number contradicts the "Show all"
      // button directly beneath it.
      const summary = document.getElementById('bidsSummary');
      const sentence = followUpSentence(rows, now);
      summary.textContent = sentence;
      summary.hidden = sentence === '';

      // Same rule, and the same reason: the window is read off every bid on the
      // device, not off the eight this page happens to draw.
      const chase = document.getElementById('bidsChase');
      const chasing = chaseSentence(rows, now);
      chase.textContent = chasing;
      chase.hidden = chasing === '';
      // Counted when the reading changes rather than on every render, so
      // pressing "Show all" is not a second reading. record() is already silent
      // under DNT/GPC and the opt-out, and carries no name and no slug.
      if (chasing !== '' && chasing !== chaseShown) {
        chaseShown = chasing;
        record('saved_bid_chase_shown');
      }

      // How the pricing is landing, pooled across every tool. Read off every
      // row for the same reason the two lines above are: this is a statement
      // about the contractor's whole book, and computing it from the eight rows
      // the page happens to draw would make it change when they press "Show
      // all".
      const pricing = document.getElementById('bidsPricing');
      const priced = pricingSentence(rows);
      pricing.textContent = priced;
      pricing.hidden = priced === '';
      // Counted on change rather than on every render, as the chase line is.
      // record() is already silent under DNT/GPC and the opt-out, and this
      // carries no name, no slug, and no figure.
      if (priced !== '' && priced !== pricingShown) {
        pricingShown = priced;
        record('saved_bid_pricing_shown');
      }

      // How often the quotes land, over the same whole book and for the same
      // reason: computing it from the eight rows drawn would make the rate
      // change when the visitor pressed "Show all", which is the one thing a
      // rate must not do.
      const winRate = document.getElementById('bidsWinRate');
      const rated = winRateSentence(rows);
      winRate.textContent = rated;
      winRate.hidden = rated === '';
      // Counted on change rather than on every render, as the two lines above
      // are. record() is already silent under DNT/GPC and the opt-out, and this
      // carries no name, no slug, no tool and no figure — only that a reading
      // was drawn, which is what says whether the feature is worth its bytes.
      if (rated !== '' && rated !== winRateShown) {
        winRateShown = rated;
        record('saved_bid_win_rate_shown');
      }

      // Whether what this contractor changed is working, read off the same
      // whole book — and here the "every row, not the eight drawn" rule is
      // load-bearing in a way it is not above: this reading splits a tool's
      // bids into an older and a newer half, and the eight rows the page draws
      // are the newest, so computing it from them would compare the recent
      // half against itself.
      const trend = document.getElementById('bidsTrend');
      const trending = trendSentence(rows, now);
      trend.textContent = trending;
      trend.hidden = trending === '';
      // Counted on change, as every line above is. record() is already silent
      // under DNT/GPC and the opt-out, and this carries no name, no slug, no
      // trade, no figure and no direction — only that the reading drew, which
      // is what says whether a book here is long enough to have a history.
      if (trending !== '' && trending !== trendShown) {
        trendShown = trending;
        record('saved_bid_trend_shown');
      }

      // Which trades the finished work is worth doing, over the same whole
      // book and for the same reason as every line above: a share that moved
      // when the visitor pressed "Show all" would be a different claim about
      // their business each time they looked at it.
      const keep = document.getElementById('bidsKeep');
      const keeping = keepSentence(rows);
      keep.textContent = keeping;
      keep.hidden = keeping === '';
      // Counted on change rather than on every render, as the three lines
      // above are. record() is already silent under DNT/GPC and the opt-out,
      // and this carries no name, no slug, no trade and no figure — only that
      // the reading was drawn at all, which is the signal that says whether
      // contractors are costing their finished jobs.
      if (keeping !== '' && keeping !== keepShown) {
        keepShown = keeping;
        record('saved_bid_keep_shown');
      }

      // Whether the work that lands is the work that pays — the two readings
      // directly above, crossed. Off the same whole book for the same reason
      // they are: a mix that changed when the visitor pressed "Show all" would
      // be telling them to raise a different price each time they looked.
      const mix = document.getElementById('bidsMix');
      const mixed = mixSentence(rows);
      mix.textContent = mixed;
      mix.hidden = mixed === '';
      // Counted on change rather than on every render, as every line above is.
      // record() is already silent under DNT/GPC and the opt-out, and this
      // carries no name, no slug, no trade, no figure and not even which of
      // the two branches drew — only that a book here was long enough on both
      // halves at once to cross them, which is the one thing the reading's
      // sample bars make worth knowing.
      if (mixed !== '' && mixed !== mixShown) {
        mixShown = mixed;
        record('saved_bid_mix_shown');
      }

      const seen = responseWindow(rows);

      // Which rows to draw: the newest BIDS_SHOWN, plus every quote that has
      // gone quiet wherever it falls in the list.
      //
      // A quiet bid is an old bid by definition, so the plain cut hid precisely
      // the rows the chase line directly above had just asked the contractor to
      // act on — the page said "2 have been out longer than that" and then
      // showed eight rows, none of them the two.
      //
      // Order is left alone. A surfaced row keeps its place in the newest-first
      // list rather than being promoted to the top: this section is the index
      // the copy says it is, used to find the job whose customer just rang, and
      // resorting it around a second purpose would cost that one.
      const drawn = bidsExpanded
        ? rows
        : rows.filter((row, i) => i < BIDS_SHOWN || isQuietBid(row, seen, now));

      for (const row of drawn) {
        const { slug, name, at, amount, outcome, card } = row;
        const item = document.createElement('li');
        const link = document.createElement('a');
        // The anchor jobs.mjs answers: the band opens and scrolls into view, so
        // the visitor arrives at their bid list rather than at the top of a
        // calculator. The bid's name is never put in the URL — it is a
        // customer's name, and a fragment lands in browser history and in
        // anything the visitor shares.
        link.href = slug + '/#pf-jobs';

        const label = document.createElement('span');
        label.className = 'bid-name';
        // textContent, never innerHTML: the name is typed by the visitor and
        // read back out of storage any page on this origin can write.
        label.textContent = name;

        // What the tool came to. The index has always been able to say where a
        // bid lives and how long it has been out; without this it could not say
        // the one thing the contractor is actually being asked on the phone.
        // The row names its tool two spans along, which is what fixes the
        // meaning: a quote on the trade calculators, profit per unit on the
        // seller-fee ones. Absent where the tool has no headline figure — see
        // pageHeadlineAmountSelector — so the row is built around it missing.
        const figure = document.createElement('span');
        figure.className = 'bid-amount';
        figure.textContent = amount || '';
        figure.hidden = !amount;

        const where = document.createElement('span');
        where.className = 'bid-where';
        where.textContent = card.querySelector('h3, h4')?.textContent.trim() || slug;

        const when = document.createElement('span');
        when.className = 'bid-when';
        when.textContent = at.slice(0, 10);

        // Every row says which of the three states it is in, including the
        // waiting ones with no age yet. A badge only on the old bids would
        // leave the rest looking untracked, and the visitor could not tell a
        // bid saved this morning from one this feature had failed to read.
        const state = document.createElement('span');
        state.className = 'bid-state';
        // A quote that has outlived every answer this contractor has ever had
        // is a fourth state, and it is the one worth a word rather than a date:
        // "Waiting 19 days" reads as tracked, "Chase" reads as owed. The tool
        // pages mark the same rows off the same window; this page is where the
        // window usually exists at all, since three answered bids is a
        // threshold a contractor working six calculators clears in none of them
        // and easily across all of them.
        const quiet = isQuietBid(row, seen, now);
        state.dataset.state = outcome || (quiet ? 'quiet' : 'waiting');
        state.textContent = outcome
          ? outcome === 'won' ? 'Won' : 'Lost'
          : bidWaitingPhrase(bidWaitingDays(at, now)) || 'Waiting';

        // Before the date, which bid-when's auto margin pushes to the far right:
        // the tag qualifies the state beside it rather than ending the row.
        const tag = [];
        if (quiet) {
          const chaseTag = document.createElement('span');
          chaseTag.className = 'bid-chase-tag';
          // Says what to do rather than what happened, like the band's own tag.
          chaseTag.textContent = 'Chase';
          tag.push(chaseTag);
        }
        link.append(label, figure, where, state, ...tag, when);
        // The event carries no name and no slug — how often the index is used,
        // never for what. record() is already silent under DNT/GPC and the
        // opt-out.
        link.addEventListener('click', () => record('saved_bid_followed'));

        item.append(link);
        list.append(item);
      }

      // Never a silent cut. The section says "bids you saved in any tool", so a
      // list that quietly stopped at eight would be stating something the page
      // contradicts — and the contractor looking for the job they saved three
      // weeks ago would conclude the tool had forgotten it.
      const hidden = rows.length - drawn.length;
      more.hidden = hidden === 0;
      if (hidden > 0) {
        // The newest ones, counted separately from the quiet ones pulled up
        // past them: "showing the 10 most recent" would be false the moment a
        // row older than the tenth is on screen, and this section's whole
        // contract is that it never states a number the page contradicts.
        const recent = Math.min(rows.length, BIDS_SHOWN);
        const surfaced = drawn.length - recent;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Show all ' + rows.length;
        button.addEventListener('click', () => {
          bidsExpanded = true;
          record('saved_bid_index_expanded');
          showSavedBids();
        });
        more.append(
          document.createTextNode(
            'Showing the ' + recent + ' most recent of ' + rows.length + ' saved bids' +
            (surfaced > 0
              ? ', plus ' + surfaced + ' that ' + (surfaced === 1 ? 'has' : 'have') + ' gone quiet. '
              : '. ')),
          button,
        );
      }

      section.hidden = list.childElementCount === 0;
      if (!section.hidden && !bidsExpanded) record('saved_bid_index_shown');
    }

    showSavedBids();
${BACKUP_WIDGET_SCRIPT}
${OFFLINE_WIDGET_SCRIPT}
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Site chrome
// ---------------------------------------------------------------------------

// Every venture page was written as a standalone site, so none of them links to
// any other. Under one origin that makes 33 tools into 33 dead ends: a visitor
// who arrives from a search result at `does-subscribe-and-save-still-pay.html`
// can see one calculator and has no route to the other 32 — not to the hub, not
// to the sibling tool that answers their next question. The hub links down; up
// to now nothing linked back or across.
//
// The chrome is injected at build time rather than written into each venture,
// for two reasons. A calculator lands on `main` most days and the injection
// covers each new one for free. And venture pages are edited concurrently by
// other sessions, so a nav bar committed into 150 product files would conflict
// with nearly every open branch.
const CHROME_MARKER = 'pf-chrome';

/**
 * The one thing the shared chrome script cannot know until it is on a page:
 * which tool it is counting a view of. See `CHROME_SCRIPT`.
 */
const CHROME_SLUG_ATTR = 'data-pf-slug';

/**
 * How a page says it carries no availability promise, in any of the wordings
 * the ventures actually use. Deliberately loose: several write the clause in
 * their own voice ("Hosted URLs, when they exist, carry no availability SLA"),
 * and a page that already says it must not be given a second notice.
 */
export const NO_SLA_PATTERN =
  /best-effort hosting|no (availability )?sla|carry no availability|taken offline without notice/i;

/**
 * The availability clause, injected into any published page that lacks one.
 *
 * PRODUCT_PLAYBOOK.md 5b requires it on every hosted surface, and a test has
 * enforced that since #1731 — but it can only fail *after* the venture is on
 * `main`, and three ventures shipped without the clause and turned `main` red
 * in a single day (#1747 for two, and sewer-line-replace after them). That is
 * not carelessness: a calculator is written as a standalone page, months
 * before anyone decides it will be hosted, so nothing in front of its author
 * says an availability promise is now implied.
 *
 * Injecting it where it is missing makes the requirement hold by construction
 * for every tool including the one that lands tomorrow, the same way the
 * canonical below is injected only where absent.
 *
 * Only the *hosting* clause is injected, never the no-warranty one. This build
 * decides how these pages are hosted, so the availability promise is its
 * statement to make; what a tool is not advice *about* is the venture's own
 * ("not landscaping, construction, legal, tax, or financial advice"), and
 * generic prose there would be worse than what each venture already writes.
 */
const NO_SLA_CLAUSE =
  '<p class="pf-sla"><strong>Best-effort hosting, no SLA.</strong> These tools are free and ' +
  'experimental, and may be slow, broken, moved, or taken offline without notice. We do not ' +
  'promise uptime, or that a URL will keep working. Do not use this as a system of record.</p>';

// Scoped under `.pf-chrome` so it cannot restyle a venture's own page, and
// declared with fallbacks rather than inherited variables because each venture
// names its theme variables differently.
// The chrome takes its colours from the host page, not from the operating
// system, and that is the one non-obvious thing about this block.
//
// It used to paint an opaque band from its own palette behind
// `prefers-color-scheme`. Internally that is perfectly legible — the band sets
// both its background and its text, so the contrast within it is fine. The
// problem is what it sits on. Most ventures in this portfolio are deliberately
// light-only: they carry no `prefers-color-scheme` rule at all, so their page
// stays cream whatever the OS says. A visitor with a dark OS therefore got a
// near-black slab bolted to the bottom of a light page — readable, and
// unmistakably broken-looking. On a phone at night, which is a lot of this
// audience, that slab was the last thing they saw before deciding whether the
// site was worth trusting with a bid.
//
// So: `color:inherit` for text, and a neutral mid-grey at low alpha for lines
// and fills, which reads as a subtle tint over a light or a dark background
// without the chrome needing to know which one it is. Links are underlined
// rather than tinted, because no single accent is legible on all 42 pages.
// A venture with its own dark mode still gets dark chrome — it inherits it,
// which is the point.
//
// (`favicon.ico` is the deliberate exception elsewhere in this file: the
// browser draws it onto its own furniture, so there is no host page for it to
// inherit from.)
//
// Raw CSS rather than a `<style>` element: it is written once to
// `pf-chrome.css` at the site root and linked from all 442 published pages.
// See `CHROME_STYLE_FILE`.
const CHROME_CSS = `
.pf-chrome{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.9rem;line-height:1.5;
  color:inherit;--pf-line:rgba(128,128,128,.34);--pf-fill:rgba(128,128,128,.07)}
.pf-chrome a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.pf-chrome-top{border-bottom:1px solid var(--pf-line);background:var(--pf-fill);padding:9px 16px}
.pf-chrome-top a{font-weight:650;text-decoration:none}
.pf-chrome-top a:hover,.pf-chrome-top a:focus-visible{text-decoration:underline}
.pf-chrome-foot{border-top:1px solid var(--pf-line);background:var(--pf-fill);margin-top:40px;padding:22px 16px 26px}
.pf-chrome-foot .pf-inner{max-width:1080px;margin:0 auto}
.pf-chrome-foot h2{font-size:1rem;margin:0 0 4px;color:inherit}
/* No opacity here, and it is the same reasoning as the color:inherit above run
 * the other way. The chrome does not know its host's palette, so it cannot know
 * what an opacity of .78 will produce: the declaration multiplies down a colour
 * chosen by a venture, and a host whose body text already sits near the 4.5:1
 * AA floor lands under it. There is no safe value — a host exactly at 4.5:1
 * fails at any opacity below 1 — which is why this is a deletion rather than a
 * larger number. Measured on the built site, freight-accessorial-auditor
 * rendered this footer at 3.22:1 and cloud-egress-calculator at 3.32:1.
 * What the tint was dimming is also the wrong thing to dim: the no-warranty and
 * no-SLA clauses PRODUCT_PLAYBOOK.md 5b requires, the link to the rest of the
 * portfolio, and the sponsors line. The footer is quieter than the venture's
 * own content already, by its border, fill and position. */
.pf-chrome-foot p{margin:0 0 12px}
.pf-chrome-foot ul{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:8px 18px;
  grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.pf-chrome-foot li{margin:0}
.pf-chrome :focus-visible{outline:2px solid currentColor;outline-offset:2px}

/* Site chrome is not part of anything a visitor prints.
 *
 * Nine bid calculators produce a customer proposal (platform/proposal), whose
 * own print stylesheet hides header, main and footer so the homeowner's copy
 * carries the price and not the contractor's wages. That allow-list was written
 * against the venture's own markup — it cannot know about the nav and aside
 * this build injects as siblings of main, so on the published site the
 * customer's quote came out with the site navigation and the "more tools"
 * footer stapled to it. The rule belongs here, with the markup it hides, rather
 * than in each venture: a calculator that adopts the proposal next week is
 * covered without touching it. */
@media print{.pf-chrome{display:none !important}}
`;

/**
 * The chrome's stylesheet as one file, for the whole site.
 *
 * It was written into every published page — 2.75 KB × 442 pages, **1.19 MiB
 * of the built site**, all of it the same bytes. Nothing in it was ever
 * per-page: the block is deliberately palette-free (see above), which is
 * exactly what makes it shareable.
 *
 * The `id` the element carried did one job: it let a test find the chrome's own
 * rules among a venture's. The filename does that now, and better — the tests
 * that used to fish the block out of a built page and `continue` when they
 * could not find one would have gone silently green the moment it moved.
 */
export const CHROME_STYLE_FILE = 'pf-chrome.css';

/**
 * The contents of that file. Written once by the build, at the site root.
 *
 * The reflow rules ride along rather than taking a stylesheet of their own:
 * this file is already linked by every page they apply to and already in the
 * offline bundle, so folding them in costs no second request on a phone with
 * one bar — the visitor those rules exist for. See `reflow.mjs`.
 */
export function renderChromeStyle() {
  return `${CHROME_CSS.trimStart()}${REFLOW_CSS}`;
}

// The same anonymous, local-only convention the hub uses: which tool slugs were
// opened, never who opened them, never leaving the device, and silent for a
// browser asking not to be counted. Until this shipped the only page that
// counted anything was the hub, so a visitor arriving from search at a deep SEO
// page was invisible — which is most of the traffic these pages are written for.
//
// The slug is the only per-page value, and it rides on the `<script>` tag as
// `data-pf-slug` now that this is one shared file. See `CHROME_MODULE_FILE`.
//
// Three events, and the third is why the click delegate reads two selectors
// instead of one. `sponsor_link_clicked` (see `SPONSOR_CLICK_EVENT`) is counted
// here rather than in each venture's own `usage.mjs` because the link is not a
// venture's own feature: it is identical markup on all 186 of them, and 155 of
// those have a `usage.mjs` to wire while the rest have none. Counting it in the
// shared chrome covers every published page — tools, category pages, compare
// pages, the about page, the hub — in one file that every page already loads,
// so it costs no per-page bytes and no second request, and it cannot go stale
// on the day a 187th venture ships.
//
// Same store, same rules, same off switches as the two events above it: DNT or
// Sec-GPC silences it, `portfolio-hub-optout` silences it, and it never leaves
// the device. `localStorage.setItem` is synchronous and the handler runs before
// the browser navigates, so following the link does not lose the count.
const CHROME_SCRIPT = () => `
(function(){
  try{
    if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
    if(localStorage.getItem('portfolio-hub-optout')==='1')return;
    var tag=document.querySelector('script[${CHROME_SLUG_ATTR}]');
    var slug=tag?tag.getAttribute('${CHROME_SLUG_ATTR}')||'':'';
    if(!slug)return;
    var k='portfolio-hub-usage';
    var bump=function(event){
      try{
        var c=JSON.parse(localStorage.getItem(k)||'{}');
        c[event]=(c[event]||0)+1;
        c.last_day=new Date().toISOString().slice(0,10);
        localStorage.setItem(k,JSON.stringify(c));
      }catch(e){}
    };
    bump('tool_viewed:'+slug);
    document.addEventListener('click',function(e){
      var t=e.target&&e.target.closest?e.target:null;
      if(!t)return;
      var a=t.closest('[data-pf-to]');
      if(a)bump('cross_tool_click:'+a.getAttribute('data-pf-to'));
      if(t.closest('[${SPONSOR_LINK_ATTR}]'))bump('${SPONSOR_CLICK_EVENT}');
    });
  }catch(e){}
})();
`;

/**
 * Gives a horizontally scrolling box the keyboard access it silently lost.
 *
 * A `overflow-x:auto` box scrolls with a mouse wheel, a trackpad and a
 * touchscreen, and not with a keyboard: arrow keys scroll the focused element,
 * and a box holding only text holds nothing focusable, so there is nothing to
 * focus. The content past the right edge is then reachable by every visitor
 * except the one navigating by keyboard. Axe calls this
 * `scrollable-region-focusable`, and it is WCAG 2.1.1 (Keyboard).
 *
 * The wide comparison tables in the calculators' result panels are exactly this
 * shape: several columns of figures inside a narrow sticky card.
 *
 * Done here rather than as a `tabindex="0"` in each venture's markup because
 * whether a box scrolls is not a property of the markup — it depends on the
 * viewport, the font, and how long the numbers rendered. A static attribute
 * would put a tab stop on every table on every page, most of which fit and
 * would strand a keyboard user on a box that does not move; and it would still
 * miss the table that overflows only at 900px. Measuring `scrollWidth` gets
 * both cases right, and re-measures on resize.
 *
 * `role` is deliberately not set: `region` on a `<table>` replaces its table
 * semantics, so a screen reader would stop announcing rows and columns. The
 * accessible name comes from the caption or heading the venture already wrote.
 *
 * It also *creates* the box, for a table that has none. `reflow.mjs` wraps
 * every table in the markup at build time; the ones this half has to catch are
 * the tables a calculator writes into its result panel from a string, which no
 * build pass can see. Both halves are here because they are one behaviour —
 * make the table scroll rather than the page, then make what scrolls reachable.
 */
const SCROLL_A11Y_SCRIPT = `
(function(){
  // Which elements can scroll sideways is decided by CSS, so the candidate set
  // only changes when the cascade does — on load and on resize, where a media
  // query may swap overflow. Whether a candidate *is* scrolling changes far
  // more often, every recalculation, so the two are measured separately: the
  // expensive getComputedStyle sweep is rare, the cheap width comparison is not.
  // Selecting by class name was the first attempt and missed .table-wrap; the
  // wrappers are named differently in every venture, so the property is asked
  // for directly.
  var candidates=[];
  var tables=0;
  var collect=function(){
    // Before the sweep, not after: a table a calculator just wrote into its
    // result panel has no scrolling box around it yet, so collecting first
    // would find nothing to give a tab stop to. See reflow.mjs.
    ${WRAP_TABLES_JS}
    candidates=[];
    var all=document.body?document.body.getElementsByTagName('*'):[];
    for(var i=0;i<all.length;i++){
      var o=getComputedStyle(all[i]).overflowX;
      if(o==='auto'||o==='scroll')candidates.push(all[i]);
    }
    tables=document.getElementsByTagName('table').length;
  };
  var measure=function(){
    for(var i=0;i<candidates.length;i++){
      var el=candidates[i];
      if(el.scrollWidth>el.clientWidth+1){
        if(!el.hasAttribute('tabindex')){
          el.setAttribute('tabindex','0');
          el.setAttribute('data-pf-scrollable','');
        }
      }else if(el.hasAttribute('data-pf-scrollable')){
        // It fits now — drop the tab stop rather than stranding a keyboard user
        // on a box that no longer moves.
        el.removeAttribute('tabindex');
        el.removeAttribute('data-pf-scrollable');
      }
    }
  };
  var full=function(){try{collect();measure();}catch(e){}};
  // A recalculation that replaced the result panel can have added or removed a
  // table, and a table that arrived after the last sweep is not a candidate yet
  // — so the cheap path re-sweeps exactly when the table count moved, and stays
  // cheap on every other keystroke.
  var quick=function(){
    try{
      if(document.getElementsByTagName('table').length!==tables){collect();}
      measure();
    }catch(e){}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',full);
  else full();
  addEventListener('resize',full);
  addEventListener('input',quick);
  addEventListener('change',quick);
  addEventListener('click',quick);
})();
`;

/**
 * The chrome's two browser halves as one file, for the whole site.
 *
 * Both ran on all 442 published pages and neither was ever per-page except for
 * the slug the counter names — 663 B and 994 B written out 442 times each, or
 * **715 KiB of the built site**. They ship together because they ship to the
 * same set of pages: two files would be two requests to say what one says.
 *
 * A classic script, as both were inline. It sits at the end of the body, after
 * the markup it reads, and neither half needs to run before the venture's own
 * module: the counter records a page view and the scroll pass waits for
 * `DOMContentLoaded` or measures immediately, whichever comes first.
 */
export const CHROME_MODULE_FILE = 'pf-site.js';

/** The contents of that file. Written once by the build, at the site root. */
export function renderChromeModule() {
  return `${stripForInjection(CHROME_SCRIPT())}\n${stripForInjection(SCROLL_A11Y_SCRIPT)}\n`;
}

// ---------------------------------------------------------------------------
// Number inputs
// ---------------------------------------------------------------------------

/**
 * Whether a `step` value admits fractions.
 *
 * `step` is the only thing on these inputs that says whether the field is a
 * count or a measurement, and every calculator sets it: `step="1"` on niches
 * and doors, `step="0.25"` on hours, `step="0.01"` on dollar rates. An absent
 * or `any` step means the browser imposes no integer constraint, so a decimal
 * keypad is the safe reading.
 */
export function stepAllowsDecimals(step) {
  if (step === undefined || step === null || step === '') return true;
  const trimmed = String(step).trim();
  if (trimmed.toLowerCase() === 'any') return true;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return true;
  return !Number.isInteger(value);
}

/**
 * Gives every `<input type="number">` the mobile keyboard it should have had.
 *
 * `type="number"` alone does not settle which keypad appears. On iOS it opens
 * the numbers-and-punctuation layout -- the small top-row keys, no dedicated
 * decimal point -- rather than the large phone-dial keypad. These calculators
 * ask for thirty to forty numbers each, and the person entering them is
 * frequently standing in a driveway on a phone, so the difference between a
 * cramped punctuation row and a full keypad is the difference between a bid
 * measured on site and one retyped later at a desk.
 *
 * `inputmode` is chosen from `step`, so a field that only accepts whole
 * numbers does not offer a decimal key that would produce a value the input
 * then rejects.
 *
 * Injected rather than written into the ~180 venture pages for the same two
 * reasons the chrome above is: a calculator lands on `main` most days and this
 * covers each new one for free, and those pages are edited concurrently by
 * other sessions, so an attribute added to every one of them would conflict
 * with nearly every open branch.
 *
 * An input that already carries an `inputmode` keeps it -- the venture's own
 * choice wins, and re-running this is a no-op.
 */
export function annotateNumberInputs(html) {
  return html.replace(/<input\b[^>]*>/gi, (tag) => {
    if (!/\btype\s*=\s*["']?number\b/i.test(tag)) return tag;
    if (/\binputmode\s*=/i.test(tag)) return tag;
    const step = tag.match(/\bstep\s*=\s*["']([^"']*)["']/i)?.[1];
    const mode = stepAllowsDecimals(step) ? 'decimal' : 'numeric';
    // Insert before the tag's own close, keeping whatever whitespace and
    // self-closing slash were there, so `<input … />` does not come back as
    // `<input …/>`.
    return tag.replace(/(\s*)(\/?)>$/, ` inputmode="${mode}"$1$2>`);
  });
}

/** How many `../` segments reach the site root from a published file. */
export function upToRoot(relativePath) {
  const depth = relativePath.split(/[\\/]/).length - 1;
  return depth === 0 ? './' : '../'.repeat(depth);
}

/**
 * Up to `limit` other tools to offer at the foot of `slug`'s pages: same
 * sub-group first, then the rest of the category, then the rest of the site.
 * Rotating each list by the tool's own position means neighbouring tools do not
 * all advertise the same four, while keeping the choice deterministic — the
 * build has to be reproducible.
 *
 * The sub-group tier matters most in `trades`, where "same category" is 110
 * tools: without it a metal-roof page offers whichever four the rotation lands
 * on, and a roofer is shown a music-lesson break-even. Same sub-group means the
 * offer is another roofing, siding, or gutter bid — work the same visitor sells.
 */
export function relatedTools(surfaces, slug, limit = 4) {
  const others = surfaces.filter((surface) => surface.slug !== slug);
  if (others.length === 0) return [];

  const category = categoryFor(slug).id;
  const subcategory = subcategoryFor(slug)?.id ?? null;
  const inCategory = (surface) => categoryFor(surface.slug).id === category;
  const inSubcategory = (surface) =>
    subcategory !== null && inCategory(surface) && subcategoryFor(surface.slug)?.id === subcategory;

  const sameSubcategory = others.filter(inSubcategory);
  const sameCategory = others.filter((surface) => inCategory(surface) && !inSubcategory(surface));
  const rest = others.filter((surface) => !inCategory(surface));

  const rotate = (list) => {
    if (list.length === 0) return list;
    const offset = surfaces.findIndex((surface) => surface.slug === slug) % list.length;
    return [...list.slice(offset), ...list.slice(0, offset)];
  };

  return [...rotate(sameSubcategory), ...rotate(sameCategory), ...rotate(rest)].slice(0, limit);
}

/**
 * Wrap one already-published page in the site's navigation. Returns the html
 * unchanged when there is no `<body>` to attach to, or when the page has been
 * wrapped already — the pass has to be safe to run twice.
 */
// The one file every share card points at. A single site-wide image rather
// than one per tool: 164 rasterised cards would be 164 files to keep in step
// with 164 titles, and a scraper that finds no image at all falls back to
// whatever it scrapes off the page — usually nothing, since these pages carry
// no content images either.
export const SOCIAL_CARD_FILE = 'social-card.png';

/** The Atom feed's path. See `renderFeed`. */
export const FEED_FILE = 'feed.xml';
export const SITE_NAME = 'Free small-business calculators';

/**
 * Make one published page's discovery tags true.
 *
 * `injectChrome` inserts a canonical where a venture has none. This is the
 * other half, and it is the half that was missing: a venture that *does* carry
 * its own canonical keeps it, however wrong it has become. Fifteen tools were
 * written as standalone sites and say `href="./index.html"`, which resolves to
 * `/<slug>/index.html` — while the hub, every sitemap, and every internal link
 * use `/<slug>/`. Those are two URLs for one page, and the canonical named the
 * one nothing links to, so the address the whole site advertises was the one
 * being consolidated away. A relative canonical is legal HTML and self-
 * resolving, which is why neither `check.mjs` nor a validator ever flagged it.
 *
 * Then the social half. Organic sharing into trade groups and forums is a
 * named acquisition channel here, and a link pasted into one renders from
 * `og:` tags:
 *
 *   * `og:url` — 7 of 442 pages had one. Without it a scraper keys the card to
 *     the pasted URL, so `?bid=...` share links (157 pages emit them) each
 *     preview as a separate page instead of consolidating onto the tool.
 *   * `og:image` — no page had one, so every share rendered as a bare text
 *     card. This is the single largest determinant of whether anyone clicks.
 *   * `og:title` / `og:description` — 21 pages carried neither, and fall back
 *     here to the `<title>` and meta description they do have.
 *
 * Everything is added only where the page does not already say it: a venture's
 * own card copy is written for its audience and beats anything derived here.
 *
 * The one exception is a description longer than a search result or a share
 * card will show — see `snippetize`. That copy is still the venture's own, so
 * it is cut rather than replaced, and a description already inside the budget
 * is never touched.
 */
export function injectDiscoveryTags(html, { canonical, baseUrl, title, description, cardFile } = {}) {
  if (!canonical) return html;
  if (!/<\/head>/i.test(html)) return html;

  let next = html;

  // Repair rather than insert: `injectChrome` has already guaranteed exactly
  // one canonical, and a page may reach here with a stale relative one.
  next = next.replace(
    /<link\b[^>]*\brel=["']canonical["'][^>]*>/i,
    () => `<link rel="canonical" href="${escapeHtml(canonical)}">`,
  );

  // Whole-tag matcher rather than `[^>]*`: a hand-written description may
  // contain a bare `>` ("net > 0"), and stopping at it would silently leave the
  // longest descriptions — the ones this pass exists to cut — unmatched.
  const metaTags = () => [...next.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)];
  const tagFor = (attr, value) =>
    metaTags().find((m) => new RegExp(`\\b${attr}=["']${value}["']`, 'i').test(m[0])) ?? null;
  const contentOf = (tag) => decodeEntities(/\bcontent=(["'])([\s\S]*?)\1/i.exec(tag)?.[2] ?? '');

  /** Rewrite one existing meta tag's content in place; a no-op if it has none. */
  const rewrite = (match, content) => {
    const replaced = match[0].replace(
      /\bcontent=(["'])([\s\S]*?)\1/i,
      () => `content="${escapeHtml(content)}"`,
    );
    if (replaced === match[0]) return;
    next = next.slice(0, match.index) + replaced + next.slice(match.index + match[0].length);
  };

  // The page's own description is the truest source for its snippet — a deep
  // SEO page inside a tool describes itself, not the tool — and `description`
  // is the caller's fallback for the pages that carry none.
  const descriptionTag = tagFor('name', 'description');
  const ownDescription = descriptionTag ? contentOf(descriptionTag[0]) : '';
  const snippet = snippetize(ownDescription || description || '');
  if (descriptionTag && ownDescription.length > SNIPPET_MAX && snippet) {
    rewrite(descriptionTag, snippet);
  }

  // The same budget on the social side, where the page may carry its own
  // `og:description` copied from the over-long meta description it shipped with.
  const ogTag = tagFor('property', 'og:description');
  if (ogTag && contentOf(ogTag[0]).length > SNIPPET_MAX) {
    rewrite(ogTag, snippetize(contentOf(ogTag[0])));
  }
  const twitterTag = tagFor('name', 'twitter:description');
  if (twitterTag && contentOf(twitterTag[0]).length > SNIPPET_MAX) {
    rewrite(twitterTag, snippetize(contentOf(twitterTag[0])));
  }

  const has = (attr, value) =>
    new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value.replace(/:/g, ':')}["']`, 'i').test(next);
  const tags = [];
  const add = (attr, value, content) => {
    if (!content || has(attr, value)) return;
    tags.push(`<meta ${attr}="${value}" content="${escapeHtml(content)}">`);
  };

  add('property', 'og:url', canonical);
  add('property', 'og:type', 'website');
  add('property', 'og:site_name', SITE_NAME);
  add('property', 'og:title', title);
  // `snippet`, not `description`: the caller's copy is trimmed to a hub card
  // (180) rather than to a share card, so adding it raw would ship the very
  // over-long description this pass just cut out of the page beside it.
  add('property', 'og:description', snippet);
  if (baseUrl) {
    // `cardFile` lets a page point at the card drawn for its own tool — see
    // `toolCardFileFor`. Falls back to the site-wide default for callers (the
    // hub, the About page) that are not a tool.
    const image = `${baseUrl}${cardFile || SOCIAL_CARD_FILE}`;
    add('property', 'og:image', image);
    add('property', 'og:image:width', '1200');
    add('property', 'og:image:height', '630');
    // The alt text describes the card that was actually drawn, which now
    // carries the tool's name. A screen reader announcing the site name on a
    // card that says "Deck bid calculator" is describing a different picture.
    add(
      'property',
      'og:image:alt',
      cardFile && title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — free, private, in your browser`,
    );
    // Without a card type X renders a link as plain text. `summary_large_image`
    // is the wide form, which is what a 1200×630 card is drawn for.
    add('name', 'twitter:card', 'summary_large_image');
  }

  if (!tags.length) return next;
  return next.replace(/<\/head>/i, `${tags.map((tag) => `\n${tag}`).join('')}\n</head>`);
}

// `decodeEntities` covers the five that matter for markup safety. Prose needs
// the typographic ones too: an answer written with `&ldquo;` reaches JSON-LD as
// the literal characters `&ldquo;`, and a search engine renders exactly that
// inside the answer it shows. Numeric forms are decoded generically; the named
// map is the punctuation these pages actually use.
const TEXT_ENTITIES = {
  nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–',
  hellip: '…', times: '×', minus: '−', deg: '°', plusmn: '±', frac12: '½', frac14: '¼',
  euro: '€', pound: '£', cent: '¢', trade: '™', reg: '®', copy: '©', apos: "'",
};

const decodeTextEntities = (value) =>
  decodeEntities(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name) => TEXT_ENTITIES[name.toLowerCase()] ?? whole);

/** Visible text of an HTML fragment, with script/style content dropped. */
const stripTags = (fragment) =>
  decodeTextEntities(
    fragment
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The prose of a fragment: its paragraphs, or all its text if it has none.
 *
 * Paragraphs first because the slice after a question heading is usually a
 * short answer followed by the widget that answers it — inputs, buttons, a
 * results table. Taking every text node would put "Calculate Reset $0.00" in
 * an answer a search engine may quote verbatim.
 */
const answerProse = (fragment) => {
  const paragraphs = [...fragment.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, inner]) => stripTags(inner))
    .filter(Boolean);
  return paragraphs.length ? paragraphs.slice(0, 2).join(' ') : stripTags(fragment);
};

// A heading that labels its question ("Common question: should I accept Net
// 30?") reads as a label plus a question. The label is page furniture, not
// part of what anyone asks, so it is dropped from the structured copy.
const FAQ_LABEL = /^(?:common questions?|faq|q)\s*[:.–—-]\s*/i;

/**
 * A function name appearing in prose, which marks the paragraph as a note about
 * how the page works rather than an answer to the question above it.
 *
 * `3pl-quote-normalizer` answers four of its questions with "This block uses
 * the same compareInboundMethods on the quote you just typed" — true, useful to
 * a maintainer, and no kind of answer to quote back to someone who searched
 * "should I pay the 3PL to kit". The rule is narrow on purpose: a
 * lowercase-initial camelCase run of ten or more characters is an identifier,
 * while the brand names that share that shape are all far shorter (`eBay`,
 * `iPhone`, `iOS`) and every other brand here starts with a capital
 * (`PayPal`, `DoorDash`, `TikTok`), so none of them trip it.
 */
const CODE_IDENTIFIER = /\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b/g;

const readsAsCode = (text) =>
  [...text.matchAll(CODE_IDENTIFIER)].some(([token]) => token.length >= 10);

/**
 * The end of the block an answer lives in.
 *
 * The last question on a page has no heading after it, so its answer would
 * otherwise run to the end of the document — straight through `</main>` and
 * into the footer, where every tool here carries the same "No warranty. This
 * free tool is not tax, financial, or business advice" paragraph. That would
 * be picked up as the answer's second paragraph and quoted, on every page, as
 * part of the answer to whatever its last question happened to be.
 */
const toBlockEnd = (fragment) => {
  const boundary = fragment.search(/<\/(?:section|main|article|aside)\b|<footer\b|<hr\b/i);
  return boundary === -1 ? fragment : fragment.slice(0, boundary);
};

const FAQ_MAX_ENTRIES = 8;
const FAQ_MIN_ANSWER = 40;
const FAQ_MAX_QUESTION = 200;
const FAQ_MAX_ANSWER = 600;

/**
 * Question/answer pairs a page already shows a visitor, as data.
 *
 * These pages answer real questions in prose — "Should unused hours roll
 * over?", "Does leftover long-term storage flip the quote?" — and an answer
 * engine cannot tell that prose apart from the rest of the page. `FAQPage`
 * JSON-LD is how that is said in machine-readable form, and 129 of the 164
 * tools ship none.
 *
 * It is *derived* rather than authored for a reason. Google's structured-data
 * policy requires the question and answer to be visible on the page, and an
 * authored block maintained beside the copy drifts from it — the schema then
 * describes a page that no longer exists, which is worse than having none.
 * Reading the rendered copy makes the two the same text by construction.
 *
 * Nothing is invented: a page with no visible Q&A gets no schema.
 */
export function faqEntries(html) {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
    level: Number(match[1]),
    text: stripTags(match[2]),
    start: match.index,
    end: match.index + match[0].length,
  }));

  const found = [];

  headings.forEach((heading, index) => {
    if (heading.level !== 2 && heading.level !== 3) return;
    if (!heading.text.endsWith('?')) return;
    // The answer runs to the next heading of any level: a sibling question, or
    // the section that follows. Anything past it belongs to another topic.
    const next = headings[index + 1];
    found.push({
      at: heading.start,
      question: heading.text,
      answer: answerProse(
        toBlockEnd(html.slice(heading.end, next ? next.start : html.length)),
      ),
    });
  });

  for (const match of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const summary = match[1].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    if (!summary) continue;
    const question = stripTags(summary[1]);
    if (!question.endsWith('?')) continue;
    found.push({
      at: match.index,
      question,
      answer: answerProse(match[1].slice(summary.index + summary[0].length)),
    });
  }

  const seen = new Set();
  return found
    .sort((a, b) => a.at - b.at)
    .map(({ question, answer }) => ({ question: question.replace(FAQ_LABEL, '').trim(), answer }))
    .filter(({ question, answer }) => {
      // A one-line answer is usually a caption, not an answer. Requiring real
      // prose keeps thin pairs out rather than padding the page with them.
      if (question.length < 2 || question.length > FAQ_MAX_QUESTION) return false;
      if (answer.length < FAQ_MIN_ANSWER) return false;
      if (readsAsCode(answer)) return false;
      const key = question.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, FAQ_MAX_ENTRIES)
    .map(({ question, answer }) => ({ question, answer: truncate(answer, FAQ_MAX_ANSWER) }));
}

export function injectChrome(html, { slug, toRoot, total, related = [], canonical, isEntry, title, externalCallHosts = [] }) {
  if (html.includes(CHROME_MARKER)) return html;
  const bodyOpen = html.match(/<body[^>]*>/i);
  if (!bodyOpen || !/<\/body>/i.test(html)) return html;

  // Two head tags that only became possible once these pages shared an origin.
  // Both are added only where the venture does not already provide its own — a
  // second canonical is worse than none, because the crawler then picks one
  // arbitrarily.
  let headExtras = '';
  if (canonical && !/<link[^>]+rel=["']canonical["']/i.test(html)) {
    // Under one origin every page is reachable at both `/tool/page.html` and,
    // for an index, `/tool/` — which splits the ranking of a page already
    // competing for one narrow search term. Ventures written as standalone
    // sites had no origin to point a canonical at, so many carry none.
    headExtras += `\n<link rel="canonical" href="${escapeHtml(canonical)}">`;
  }
  if (isEntry && canonical && !html.includes('"BreadcrumbList"')) {
    // Lets a result render as "Free small-business calculators › eBay Fee
    // Calculator" rather than a bare URL, and tells an answer engine these are
    // one collection rather than 42 unrelated pages. Entry pages only: a deep
    // SEO page inside a tool is not a third level of the site, and saying it is
    // would describe a hierarchy that does not exist.
    headExtras += `\n<script type="application/ld+json">${jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Free small-business calculators',
          item: canonical.slice(0, canonical.length - `${slug}/`.length),
        },
        { '@type': 'ListItem', position: 2, name: title || slug, item: canonical },
      ],
    })}</script>`;
  }
  if (isEntry && !html.replace(/<!--[\s\S]*?-->/g, '').includes('FAQPage')) {
    // Only where the venture wrote none of its own: two FAQPage blocks on one
    // page describe the same page twice, and a crawler is free to believe
    // whichever it reads first. 37 ventures author their own — those are left
    // exactly as they are. Comments are stripped before the check: a page
    // whose only mention of "FAQPage" is a comment *documenting* that the
    // schema is derived (not authoring one) was reading as already-covered
    // and silently shipping none (grant-deadline-tracker, 2026-08-31).
    const faq = faqEntries(html);
    if (faq.length) {
      headExtras += `\n<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      })}</script>`;
    }
  }
  if (headExtras) {
    html = /<\/head>/i.test(html)
      ? html.replace(/<\/head>/i, `${headExtras}\n</head>`)
      : html.replace(bodyOpen[0], `${headExtras}\n${bodyOpen[0]}`);
  }

  const hub = `${toRoot}`;
  const topBar = `<nav class="pf-chrome pf-chrome-top" aria-label="Site">
  <a href="${escapeHtml(hub)}" data-pf-to="hub">← All ${total} free tools</a>
</nav>`;

  const links = related
    .map(
      (surface) =>
        `      <li><a href="${escapeHtml(`${toRoot}${surface.slug}/`)}" data-pf-to="${escapeHtml(
          surface.slug,
        )}">${escapeHtml(surface.title)}</a></li>`,
    )
    .join('\n');

  // Tested against the venture's own markup, before any chrome is added.
  const noSla = NO_SLA_PATTERN.test(html) ? '' : `    ${NO_SLA_CLAUSE}\n`;

  const footer = `<aside class="pf-chrome pf-chrome-foot" aria-label="More free tools">
  <div class="pf-inner">
    <h2>More free tools</h2>
    <p>${externalCallHosts.length
      ? `Everything on this page runs in your browser too, except this one lookup: what you type here also goes to ${listProse(externalCallHosts)}, because that is what checking it means — see the note on this page for exactly what is sent.`
      : 'Free and private, like this one — everything runs in your browser, and nothing you type is uploaded.'
    }</p>
${noSla}${links ? `    <ul>\n${links}\n    </ul>\n` : ''}    <p>
      <a href="${escapeHtml(hub)}" data-pf-to="hub">Browse all ${total} free tools →</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(`${toRoot}${ABOUT_PATH}`)}">About &amp; privacy</a>
      &nbsp;·&nbsp;
      <a href="${SPONSORS_URL}">Sponsoring on GitHub</a>
      is optional and changes nothing about what these tools do.
    </p>
  </div>
</aside>
<script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="${escapeHtml(slug)}"></script>`;

  // A link now, not a `<style>` body: one file at the site root, fetched once
  // and served from cache for every other tool on the site. See
  // `CHROME_STYLE_FILE`.
  const styleLink =
    `<link rel="stylesheet" href="${escapeHtml(`${toRoot}${CHROME_STYLE_FILE}`)}">`;
  const withStyle = html.replace(/<\/head>/i, `${styleLink}\n</head>`);
  // A page with no <head> still gets the stylesheet, ahead of the bar it styles.
  const stylePrefix = withStyle === html ? `${styleLink}\n` : '';

  return withStyle
    .replace(bodyOpen[0], `${bodyOpen[0]}\n${stylePrefix}${topBar}`)
    .replace(/<\/body>/i, `${footer}\n</body>`);
}

/** A copy-link button a venture wrote itself, in any of its four spellings. */
const OWN_COPY_BUTTON = /<button[^>]*\bid="(share|copyShare|copyLink|shareLink)"/;

/**
 * Does this page already carry a share control of its own?
 *
 * `pageHasOwnShareLink` reads the markup, which is enough for the 58 pages that
 * import `share.mjs` inline. `freelance-retainer-calculator` does not: its whole
 * script lives in `app.js`, so the import, the button id (`share`) and the label
 * ("Copy shareable link") were all outside the html the gate could see, and the
 * page shipped with its own button *and* the injected one — two controls writing
 * two hash formats, which is precisely what that gate exists to prevent.
 *
 * Both halves are required, and each rules out a page the other would get wrong:
 *
 *   * **The script.** Without it, `mobile-detailing-bid-calculator` counts —
 *     it has a `#copyLink` button and no share module at all, just an inline
 *     one-liner that serialized `readInput()` and dropped the proposal terms.
 *     That page wants the injected control, not protection from it.
 *   * **The button.** Without it, the venture's deep "should I…" pages count,
 *     because they load the same `app.js`. They carry a form and no share
 *     control, and treating the script as the answer took the bid link off
 *     sixty pages that had nothing to conflict with.
 *
 * Only same-directory scripts are read: a `../` or absolute src is the site
 * chrome, which is this build's own and never a venture's share control.
 */
export async function pageHasOwnShareControl(dir, html, cache) {
  if (typeof html !== 'string') return false;
  if (!OWN_COPY_BUTTON.test(html)) return false;
  const SRC_RE = /<script[^>]*\bsrc="([^"]+)"/g;
  for (const [, src] of html.matchAll(SRC_RE)) {
    if (/^[a-z]+:|^\/\/|^\/|\.\./i.test(src)) continue;
    if (!/\.m?js$/.test(src)) continue;
    if (!cache.has(src)) {
      cache.set(src, await fs.readFile(path.join(dir, src), 'utf8').catch(() => ''));
    }
    if (/share\.mjs/.test(cache.get(src))) return true;
  }
  return false;
}

/**
 * Adds the navigation to every published venture page. Runs after the hub is
 * written, because `repairLinks` treats a link to a file that does not exist yet
 * as one that escapes the site and repoints it at GitHub — which is exactly what
 * would happen to a `../` hub link injected any earlier.
 */
export async function addSiteChrome({ outDir, surfaces, baseUrl = DEFAULT_BASE_URL }) {
  const wrapped = [];
  const rated = [];
  const saved = [];
  const shared = [];
  const described = [];
  const highlighted = [];
  const narrowed = [];
  const embedded = [];

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    if (!(await exists(dir))) continue;
    const related = relatedTools(surfaces, surface.slug);
    // Read once per venture; several pages in a directory load the same script.
    const scriptCache = new Map();

    for (const file of (await listFiles(dir)).filter((f) => f.endsWith('.html'))) {
      const relative = path.relative(outDir, file);
      const url = relative.split(path.sep).join('/');
      const html = await fs.readFile(file, 'utf8');
      const toRoot = upToRoot(relative);
      // `/tool/index.html` and `/tool/` are the same page; the directory form
      // is the one to declare.
      const canonical = `${baseUrl}${url.replace(/(^|\/)index\.html$/, '$1')}`;
      // The attribute pass runs on the venture's own markup, before the chrome
      // adds any input of its own, and is a no-op on a page with no numbers.
      const chromed = injectFavicon(annotateNumberInputs(injectChrome(html, {
        slug: surface.slug,
        toRoot,
        total: surfaces.length,
        related,
        title: surface.title,
        canonical,
        isEntry: url === `${surface.slug}/index.html`,
        externalCallHosts: surface.externalFetchHosts,
      })), toRoot);
      // After the chrome, which guarantees the canonical this repairs, and read
      // from the venture's *own* markup: a deep SEO page inside a tool has its
      // own title and description, and `surface` carries the tool's.
      const pageMeta = readMeta(html, surface.slug);
      const withCard = injectDiscoveryTags(chromed, {
        canonical,
        baseUrl,
        title: pageMeta.title,
        description: pageMeta.description,
        // Every page inside a tool points at that tool's card, deep SEO pages
        // included: they are shared as "the deck bid calculator's page about
        // labour rates", so the tool's name is the right thing on the picture.
        cardFile: toolCardFileFor(surface.slug),
      });
      if (withCard !== chromed) described.push(relative);
      // The embed offer rides in the footer chrome `injectChrome` already
      // wrote, so it needs to run after that and can run independently of
      // the bars below — it touches neither's markup and neither touches its.
      const withEmbed = injectEmbedWidget(withCard, {
        slug: surface.slug,
        toRoot,
        canonical,
        title: surface.title,
        isEntry: url === `${surface.slug}/index.html`,
      });
      if (withEmbed !== withCard) embedded.push(relative);
      // Last: the bar anchors under the site nav, so the chrome has to be there
      // already, and it carries no numeric input for the attribute pass to
      // annotate.
      const withRates = injectShopRates(withEmbed, surface.slug, toRoot);
      if (withRates !== withCard) rated.push(relative);
      // After the rates bar, which it anchors beneath, and after the attribute
      // pass, which must see the venture's own inputs and not the name box this
      // one adds.
      const next = injectSavedBids(withRates, surface.slug, toRoot);
      if (next !== withRates) saved.push(relative);
      // Last of all, and after the saved-bids band it hangs its button on.
      //
      // Both the gate and the headline selector are read from `withRates` — the
      // same markup `injectSavedBids` was handed — while the edit is made to
      // `next`, which is the only copy that has the band to hang the button on.
      // The two are passed apart so this decides from the venture's own form
      // rather than from a document another pass has already written into.
      const linked = injectBidLink(next, {
        slug: surface.slug,
        toRoot,
        source: withRates,
        hasShareModule: await pageHasOwnShareControl(dir, html, scriptCache),
        amountSelector: pageHeadlineAmountSelector(withRates, surface.slug),
      });
      if (linked !== next) shared.push(relative);
      // Last, and gated on the page's own promise rather than on anything the
      // passes above added: it explains a message the venture's calculator
      // writes, so a page that never prints that message must not receive it.
      const marked = injectInvalidField(linked, toRoot);
      if (marked !== linked) highlighted.push(relative);
      // After every pass that adds markup of its own — the saved-bids band and
      // the share row both carry tables of their own on some pages, and they
      // are as capable of pushing the document sideways as a venture's.
      const reflowed = injectReflow(marked);
      if (reflowed !== marked) narrowed.push(relative);
      if (reflowed === html) continue;
      await fs.writeFile(file, reflowed);
      wrapped.push(relative);
    }
  }

  return { wrapped, rated, saved, shared, described, highlighted, narrowed, embedded };
}

export function renderRobots(baseUrl) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}sitemap.xml\n`;
}

/**
 * `/feed.xml` — an Atom feed of tools as they are published, newest first.
 *
 * ## Why a feed, on a site with no news
 *
 * Every other machine surface here answers "what exists" — `sitemap.xml` for
 * crawlers, `catalog.json` and `llms.txt` for models. None of them answers
 * "what changed", and that is the question every organic distribution channel
 * this portfolio is allowed to use actually asks. `portfolio/DIRECTION.md`
 * rules out ad spend and `mandate.md` rules out posting into communities
 * ourselves, which leaves channels people opt into: readers, aggregators that
 * poll for new entries, and the IFTTT/Zapier-shaped glue a niche community's
 * own moderators run. A feed is the one asset that lets someone else do the
 * distributing, and it costs one static file.
 *
 * It is also the only surface that gives a *returning* visitor a reason to
 * come back. The tools themselves are single-use by design: a contractor who
 * has priced their job is done with us until the next job.
 *
 * ## Atom rather than RSS 2.0
 *
 * Atom requires a stable `<id>` per entry that is distinct from the link, and
 * requires dates be RFC 3339. Both matter here: the link for a tool is its
 * directory URL, which would change if the site ever moved off
 * `tools.marisstella.dev`, and a reader keyed on the link would then re-notify
 * every subscriber about all 169 tools. `tag:` URIs keyed on the slug survive
 * that move. RSS 2.0's `<guid isPermaLink="false">` can do the same thing but
 * nothing in the format makes it the default, and its `pubDate` is RFC 822,
 * which is where hand-rolled feeds usually break.
 *
 * ## What the dates mean, and what they do not
 *
 * `<published>` and `<updated>` are both the day the tool first appeared in
 * `ventures/` — see `launched.mjs` for where that comes from and why it is a
 * committed file. They are equal on purpose. These pages are edited constantly
 * (copy, FAQ entries, a new worked example), and republishing an entry on
 * every edit would make the feed a changelog of our own commits rather than a
 * list of tools, which is not what anyone subscribed for.
 *
 * Entries are capped at `FEED_MAX_ENTRIES`. A tool that scrolls off is still
 * in `sitemap.xml`, `catalog.json` and `llms.txt`; the feed is the "new" list,
 * not another catalogue.
 */
export function renderFeed(surfaces, baseUrl, launched = {}) {
  const ordered = orderForFeed(surfaces, launched).filter((surface) => isIsoDate(launched[surface.slug]));
  const entries = ordered.slice(0, FEED_MAX_ENTRIES);

  // No dated surface at all means the feed would claim the site is empty.
  // Fall back to the build's own instant so the document stays valid Atom;
  // `check.mjs` is what refuses to publish a site in that state.
  const updated = feedUpdatedAt(ordered, launched) ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // Domain-based tag URI (RFC 4151). The authority is fixed rather than taken
  // from `baseUrl` so that serving the same build from GitHub Pages and from
  // the Hetzner ingress — which `portfolio/hosting/README.md` says may both
  // happen — does not mint two different ids for one tool and double every
  // subscriber's feed.
  const tagId = (slug) => `tag:marisstella.dev,2026:tool/${slug}`;

  const entryXml = (surface) => {
    const url = `${baseUrl}${surface.slug}/`;
    const date = `${launched[surface.slug]}T00:00:00Z`;
    return `  <entry>
    <title>${escapeHtml(surface.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeHtml(url)}"/>
    <id>${escapeHtml(tagId(surface.slug))}</id>
    <published>${date}</published>
    <updated>${date}</updated>
    <category term="${escapeHtml(categoryFor(surface.slug).title)}"/>
    <summary type="text">${escapeHtml(oneLineText(surface.fullDescription || surface.description))}</summary>
  </entry>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeHtml(SITE_NAME)}</title>
  <subtitle>New free, browser-only calculators and checks for people who run a small business. No account, no upload: every number stays on the visitor's own device.</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeHtml(`${baseUrl}${FEED_FILE}`)}"/>
  <link rel="alternate" type="text/html" href="${escapeHtml(baseUrl)}"/>
  <id>${escapeHtml(`tag:marisstella.dev,2026:${SITE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)}</id>
  <updated>${updated}</updated>
  <rights>Tools are MIT-licensed. They are estimates and records to act on, not professional advice.</rights>
${entries.map(entryXml).join('\n')}
</feed>
`;
}

/** Collapse to a single line: a newline inside an Atom `<summary>` is legal but reads badly in every reader. */
function oneLineText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}


/**
 * The sitemap `robots.txt` names. A `<sitemapindex>` cannot hold `<url>`
 * entries, so the hub page itself lives in `sitemap-hub.xml`, which this index
 * also lists — otherwise a crawler following robots.txt would reach the
 * ventures and never the front page.
 *
 * Every published venture gets a generated sitemap (see `renderVentureSitemap`),
 * so there is no venture the index can leave out.
 */
export function renderSitemapIndex(surfaces, baseUrl) {
  const entries = [`  <sitemap><loc>${baseUrl}sitemap-hub.xml</loc></sitemap>`].concat(
    surfaces.map(
      (surface) => `  <sitemap><loc>${baseUrl}${surface.slug}/sitemap.xml</loc></sitemap>`,
    ),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>
`;
}

/**
 * The site's own pages, as opposed to the ventures': the hub, and one entry per
 * category landing page. Both belong here rather than in a sitemap of their
 * own — they are the same kind of page (this build's, not a venture's) and a
 * crawler following `robots.txt` reaches them through the same index.
 */
export function renderHubSitemap(baseUrl, categoryIds = [], compareProductKeys = []) {
  const urls = [`  <url><loc>${baseUrl}</loc></url>`]
    .concat(categoryIds.map((id) => `  <url><loc>${baseUrl}${categoryPagePath(id)}</loc></url>`))
    // The About page is a hub-level surface, not a venture's, so it is listed
    // here or in no sitemap at all — and an unlisted page is one a crawler
    // reaches only by following a footer link on a page it happened to find.
    .concat([`  <url><loc>${baseUrl}${ABOUT_PATH}</loc></url>`])
    // And the comparison index, on exactly the same terms: a hub-level page
    // this build writes, so it is listed here or nowhere.
    .concat([`  <url><loc>${baseUrl}${COMPARE_PATH}</loc></url>`])
    // And its spokes. These are the pages most likely to be *found* by search
    // rather than by following a link — each is about one product a stranger
    // may be typing the name of — so leaving them out of the sitemap would
    // omit exactly the pages that need it most.
    .concat(
      compareProductKeys.map(
        (key) => `  <url><loc>${baseUrl}${comparisonProductPath(key)}</loc></url>`,
      ),
    );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/**
 * The URL a published page is served at, relative to the site root.
 * `index.html` is served as its directory, so it is listed that way.
 */
export function pageUrlPath(slug, relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  if (posix === 'index.html') return `${slug}/`;
  if (posix.endsWith('/index.html')) return `${slug}/${posix.slice(0, -'index.html'.length)}`;
  return `${slug}/${posix}`;
}

/**
 * A venture's sitemap, generated from the pages the build actually published.
 *
 * The ventures ship their own hand-written `sitemap.xml` files, and copying
 * those verbatim published two defects at once. They go stale — a venture
 * grows a landing page and nobody edits the sitemap, so 70 of the 186 pages
 * on this site were in no sitemap at all. And several were written against
 * `…/monorepo-projects/ventures/<slug>/`, a path this site does not serve
 * (products are mounted at `/<slug>/`), so every URL they advertised was a
 * 404 — the worst possible thing to hand a crawler, since organic search is
 * how these tools are meant to be found.
 *
 * Generating from the output makes both impossible by construction: a page is
 * listed because it shipped, at the URL it actually shipped to.
 */
export function renderVentureSitemap(slug, relativePages, baseUrl) {
  const urls = relativePages
    .map((relative) => `${baseUrl}${pageUrlPath(slug, relative)}`)
    .sort()
    .map((url) => `  <url><loc>${url}</loc></url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/**
 * A machine-readable index of the whole site.
 *
 * `renderHub` already emits JSON-LD for a human-facing crawler. This is the
 * flatter thing an AI assistant answering "is there a free tool that does X"
 * can fetch and read in one request, without parsing a page of markup. It is
 * the discoverability half of PRODUCT_PLAYBOOK.md §5e, and it costs one file.
 *
 * Deliberately not carrying a sponsorship or funding field: whether this repo
 * publishes a funding surface is an open owner decision (`funding-sponsors-live`
 * in the decision queue), and a machine-readable file is the wrong place to
 * pre-answer it.
 */
export function renderCatalog(surfaces, baseUrl, launched = {}) {
  return `${JSON.stringify(
    {
      name: 'Free calculators for sellers, contractors, and small back offices',
      url: baseUrl,
      license: 'MIT',
      price: { amount: '0', currency: 'USD' },
      privacy: 'client-side-only',
      generated_by: 'platform/pages/build.mjs',
      // The feed carries the newest FEED_MAX_ENTRIES tools; this file carries
      // every tool with the same dates, which is what lets `check.mjs` prove
      // no tool is undated using only the artifact. It is also the answer to
      // "what did they add recently" for a client that would otherwise have to
      // poll the feed and remember what it saw.
      feed: `${baseUrl}${FEED_FILE}`,
      // The catalogue's own index. `tools[].category` names a category but
      // gives no way to reach one, so a client that wanted "everything in this
      // category" had to scan all 164 rows and rebuild the grouping itself.
      categories: groupByCategory(surfaces).map(({ category, items }) => ({
        id: category.id,
        name: category.title,
        url: `${baseUrl}${categoryPagePath(category.id)}`,
        description: categoryPageCopy(category).description,
        tool_count: items.length,
      })),
      tools: surfaces.map((surface) => ({
        slug: surface.slug,
        name: surface.title,
        url: `${baseUrl}${surface.slug}/`,
        category: categoryFor(surface.slug).title,
        // Present only where the category is sub-grouped. An assistant asked for
        // "a gutter bid calculator" can filter on this instead of reading 110
        // trade descriptions to work out which ones are roof work.
        ...(subcategoryFor(surface.slug) ? { subcategory: subcategoryFor(surface.slug).title } : {}),
        description: surface.description,
        pages: surface.pageCount,
        // Omitted rather than null when unknown, so a consumer that reads the
        // key at all can trust it. `check.mjs` refuses to publish an artifact
        // where any tool is missing it.
        ...(launched[surface.slug] ? { launched: launched[surface.slug] } : {}),
      })),
    },
    null,
    2,
  )}\n`;
}

/**
 * `/llms.txt` — the same catalogue as `catalog.json`, at the path an assistant
 * actually looks for.
 *
 * `catalog.json` is richer, but nothing points at it: a model answering "is
 * there a free tool that prices a fence install" has no reason to guess that
 * filename, and `robots.txt` has no directive that would name it. `llms.txt`
 * (llmstxt.org) is a well-known path, so it gets fetched without being
 * discovered first — which is the whole difference for a portfolio whose
 * growth plan is organic search and AI discovery rather than ad spend
 * (`portfolio/DIRECTION.md`, "What we are doing").
 *
 * Markdown, not JSON, and deliberately so: the format is read by a model, not
 * parsed by a client, and a link list under a heading survives being chunked
 * into a context window in a way a nested object does not.
 *
 * Carries `fullDescription`, not the trimmed `description` the hub cards show.
 * A card has a fixed height and `readMeta` trims to it; this file has no
 * layout, and the trimmed copy drops most of what 24 of these tools say about
 * themselves — which is the half a model matches a query against. The hub's
 * own search indexes the full text for exactly that reason.
 *
 * Descriptions are flattened to one line each. A stray newline inside a bullet
 * silently ends the list item, so a tool whose meta description wrapped would
 * publish its second half as body prose.
 */
export function renderLlmsTxt(surfaces, baseUrl, compareProductGroups = []) {
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  // Same fact the About page states in full; see `disclaimerHtml` for why it
  // is derived rather than hand-typed.
  const exceptions = externalCallExceptions(surfaces);

  const bullet = (surface) =>
    `- [${oneLine(surface.title)}](${baseUrl}${surface.slug}/): ${oneLine(surface.fullDescription || surface.description)}`;

  const sections = groupByCategory(surfaces).map(({ category, items }) => {
    const subgroups = groupBySubcategory(category.id, items);
    // Sub-headings for a sub-grouped category, so a model reading this file can
    // answer "which of these is a roofing tool" from the structure rather than
    // by matching prose across 110 sibling bullets.
    const body =
      subgroups.length === 1 && subgroups[0].subcategory === null
        ? items.map(bullet).join('\n')
        : subgroups
            .map(
              ({ subcategory, items: subItems }) =>
                `### ${subcategory.title}\n\n${subItems.map(bullet).join('\n')}`,
            )
            .join('\n\n');
    // The category's own page, named on the line under its heading. An
    // assistant that has been asked for "a roofing bid calculator" can cite a
    // page that is about roofing bid calculators rather than the hub, which is
    // about 164 unrelated things and reads that way in a citation.
    const landing = `Category page: ${baseUrl}${categoryPagePath(category.id)}`;
    return `## ${category.title}\n\n${oneLine(category.blurb)}\n\n${landing}\n\n${body}\n`;
  });

  // Per llmstxt.org, "Optional" marks material an assistant may skip when it is
  // short of context. The tools themselves never belong here; these are the
  // machine surfaces that describe them.
  const optional = [
    '## Optional',
    '',
    `- [About and press kit](${baseUrl}${ABOUT_PATH}): what this site is, how visitor data is handled (it never leaves the browser${exceptions.length ? ', with a documented exception listed there' : ''}), the licence, and pre-written boilerplate for citing or linking to these tools.`,
    `- [Comparisons](${baseUrl}${COMPARE_PATH}): every page on this site that compares one of these tools with a named commercial product, grouped by product. Useful for answering "is there a free alternative to X?" with a page that says what the free tool does *not* do as well as what it does.`,
    // Named individually rather than left behind the index, because the
    // question an assistant is actually asked is about one product ("a free
    // alternative to Jobber?"), and a bare link to a 167-entry index makes it
    // fetch and scan the lot to find out whether this site has an answer. One
    // line per product answers that from `llms.txt` alone, and points at the
    // page that carries the detail if it needs it. Only the multi-tool
    // products: a product with a single comparison is already reachable
    // through the index and would pad this file without adding an answer.
    ...compareProductGroups.map(
      (group) =>
        `  - [${group.subject}](${baseUrl}${comparisonProductPath(group.key)}): ${group.items.length} tools here have a side-by-side page against ${group.subject}, each saying what it does, what the free tool does, and when ${group.subject} is the right answer.`,
    ),
    `- [Machine-readable catalog](${baseUrl}catalog.json): the same tool list as JSON, with categories and page counts.`,
    `- [Sitemap](${baseUrl}sitemap.xml): every published page, including the worked-example and decision pages inside each tool.`,
    `- [Atom feed](${baseUrl}${FEED_FILE}): new tools as they are published, newest first. Poll this rather than re-reading the whole catalogue to find out what is new.`,
    '',
  ].join('\n');

  return `# Free calculators and checks for people who run a small business

> ${surfaces.length} free, browser-only tools for marketplace sellers, trade contractors, logistics buyers, and small teams preparing compliance evidence. No account, no payment: every calculation runs in the visitor's own browser${exceptions.length ? `, and the numbers they type never leave their device — except on ${listProse(exceptions.map((x) => x.title))}, where the one thing you paste is sent to the public API it checks; the About page explains exactly what` : ' and the numbers they type never leave their device'}.

Each tool is a static page that works offline once opened, and is free with no
gated features. They are estimates and records to act on, not professional
advice or a determination made on anyone's behalf; each page carries its own
limitations.

${sections.join('\n')}
${optional}`;
}

export function renderNotFound(baseUrl) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="./favicon.ico" sizes="16x16">
  <!-- GitHub Pages serves this body under every mistyped path, each of which is
       a distinct URL a crawler may have followed from a stale link. Without
       this they index as hundreds of duplicate "That page isn't here" pages
       under the site's own name. offline.html already carries the same tag. -->
  <meta name="robots" content="noindex">
  <title>Not found</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 12vh auto;
           padding: 0 1.2rem; line-height: 1.6; color: #1d2530; background: #eef2f7; }
    a { color: #12594a; }
    @media (prefers-color-scheme: dark) {
      body { color: #e8eef5; background: #10151c; } a { color: #7fd8c0; }
    }
  </style>
</head>
<body>
  <h1>That page isn't here</h1>
  <p>The tool may have moved, or the link may be mistyped.</p>
  <p><a href="${escapeHtml(baseUrl)}">See every free calculator →</a></p>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Offline support
// ---------------------------------------------------------------------------

/** Files a visitor asking to "save all tools" needs: each tool's entry page and
 *  the modules and styles that page loads. Not the whole tree — the SEO
 *  articles and sitemaps are not what someone with no signal is reaching for,
 *  and this runs on a phone's data. */
const BUNDLE_EXTENSIONS = new Set(['.mjs', '.js', '.css']);

export async function collectOfflineBundle(outDir, surfaces) {
  // The shared scripts and stylesheets are loaded by every tool page in this
  // bundle, so a tool cached for offline use without them opens with no band at
  // all — or, for the stylesheets, with an unstyled one bolted to the page.
  // That is the cost of extracting them: what used to be inline and therefore
  // cached with the page is now a separate request the cache has to know about.
  const assets = new Set([
    './', 'index.html', 'offline.html', 'manifest.webmanifest', SAVED_BIDS_MODULE_FILE,
    BID_LINK_MODULE_FILE, SHOP_RATES_MODULE_FILE, CHROME_MODULE_FILE,
    CHROME_STYLE_FILE, SHOP_RATES_STYLE_FILE, SAVED_BIDS_STYLE_FILE,
    INVALID_MODULE_FILE, INVALID_STYLE_FILE, EMBED_MODULE_FILE, EMBED_STYLE_FILE,
    // Not loaded by any page on this site — it runs on the embedder's — but
    // precached all the same so the snippet's second line is served from the
    // same revision as the first.
    EMBED_HOST_FILE,
  ]);

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    // copyTree publishes the directory holding the entry point as `slug/`, so
    // the tool's front page is always exactly here.
    const entry = path.join(dir, 'index.html');
    const rel = (file) => path.relative(outDir, file).split(path.sep).join('/');
    if (existsSync(entry)) {
      assets.add(rel(entry));
      // A visitor can arrive at either form; a cache entry under one does not
      // answer a request for the other.
      assets.add(`${surface.slug}/`);
    }

    for (const file of await listFiles(dir)) {
      if (BUNDLE_EXTENSIONS.has(path.extname(file))) assets.add(rel(file));
    }
  }

  return [...assets].sort();
}

/**
 * Emits the worker, the manifest, the icons and the offline fallback, then
 * wires every published page to them.
 *
 * The cache name carries a hash of what was built, which is what makes the
 * worker's cache-first strategy safe: a deploy lands in a new cache and the old
 * one is deleted on activation, so a visitor is never served a mix of two
 * builds and is at most one navigation behind.
 */
export async function addOfflineSupport({
  outDir,
  base,
  surfaces,
  disableWorker = false,
  // The worker, the head injection and the offline page are all produced from
  // this module, and none of them are on disk when the hash is taken. Without
  // this, changing the worker's own logic would leave the cache name identical,
  // old caches undeleted, and visitors served the previous behaviour from cache
  // forever. Hashing the generator closes that.
  codeVersion,
} = {}) {
  const bundle = await collectOfflineBundle(outDir, surfaces);

  const hash = crypto.createHash('sha256');
  hash.update(codeVersion ?? (await fs.readFile(path.join(HERE, 'offline.mjs'))));
  for (const file of (await listFiles(outDir)).sort()) {
    hash.update(path.relative(outDir, file));
    hash.update(await fs.readFile(file));
  }
  const cacheName = `portfolio-${hash.digest('hex').slice(0, 12)}`;

  await fs.writeFile(path.join(outDir, 'offline.html'), renderOfflinePage(base));
  await fs.writeFile(
    path.join(outDir, 'manifest.webmanifest'),
    renderManifest(base, surfaces.length, externalCallExceptions(surfaces).length > 0),
  );

  for (const icon of ICONS) {
    await fs.writeFile(
      path.join(outDir, icon.file),
      renderIcon({ size: icon.size, maskable: Boolean(icon.maskable) }),
    );
  }
  await fs.writeFile(
    path.join(outDir, 'sw.js'),
    disableWorker
      ? renderKillSwitchWorker()
      : renderServiceWorker({
        cacheName,
        // Enough for the front door to open with no signal on a device that has
        // been here once. Everything else is cached as it is visited.
        shell: ['./', 'index.html', 'offline.html', 'manifest.webmanifest', 'icon-192.png'],
        bundle,
      }),
  );

  let injected = 0;
  for (const file of await listFiles(outDir)) {
    if (!file.endsWith('.html')) continue;
    const depth = path.relative(outDir, file).split(path.sep).length - 1;
    const result = injectOfflineSupport(await fs.readFile(file, 'utf8'), '../'.repeat(depth));
    if (!result.injected) continue;
    await fs.writeFile(file, result.html);
    injected += 1;
  }

  // The real weight of everything "Save all tools for offline" fetches, over
  // the wire rather than on disk -- GitHub Pages (Fastly) and the front
  // door's own nginx both gzip text responses in transit, so raw bytes
  // overstate what a visitor's mobile data plan is actually charged (see
  // build.test.mjs's "stays small enough to fetch on mobile data" for the
  // same measurement). Taken after the head injection above, so it matches
  // what a browser really downloads. Patched into the hub's own copy so it
  // can never drift from reality: see OFFLINE_SIZE_MARKER in offline.mjs for
  // the stale "about 3 MB" claim this replaces, which stood while the
  // catalog grew to 174 tools and 16.8 MB raw (5.2 MB gzipped).
  let bundleBytes = 0;
  for (const asset of bundle) {
    if (asset.endsWith('/')) continue; // directory alias of a page already counted
    const buf = await fs.readFile(path.join(outDir, asset));
    bundleBytes += zlib.gzipSync(buf, { level: 9 }).length;
  }
  const hubIndex = path.join(outDir, 'index.html');
  const beforePatch = await fs.readFile(hubIndex, 'utf8');
  const afterPatch = beforePatch.replaceAll(OFFLINE_SIZE_MARKER, offlineBundleSizeLabel(bundleBytes));
  await fs.writeFile(hubIndex, afterPatch);
  // index.html is itself one of the stated assets; account for the patch's own
  // size delta so bundleBytes matches the bytes actually on disk afterward,
  // rather than the pre-patch state it was measured from.
  bundleBytes +=
    zlib.gzipSync(Buffer.from(afterPatch), { level: 9 }).length -
    zlib.gzipSync(Buffer.from(beforePatch), { level: 9 }).length;

  return { cacheName, bundle, bundleBytes, injected };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildSite({
  venturesDir = path.join(REPO_ROOT, 'ventures'),
  outDir = path.join(REPO_ROOT, 'platform', 'pages', 'dist'),
  baseUrl = DEFAULT_BASE_URL,
  log = () => {},
  // The rollback lever for a worker already on visitors' devices; see
  // renderKillSwitchWorker.
  disableWorker = false,
} = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  const discovered = await discoverSurfaces(venturesDir);
  const launched = await loadLaunchDates();
  const surfaces = [];
  const repairs = [];

  // Pass 1: copy every venture's tree, and nothing else.
  //
  // This used to be one loop that copied a surface and immediately repaired its
  // links, which made `repairLinks` order-dependent in a way it cannot see. It
  // judges a link "inside the site" by whether the target exists on disk, so a
  // link to a sibling venture that sorts later alphabetically was tested before
  // that sibling had been copied, came back missing, and was repointed at
  // GitHub — a 404 for every visitor, because this repository is private.
  //
  // It is the same hazard `addSiteChrome` documents for its own `../` hub link;
  // that one was solved by running after the hub is written. Cross-venture links
  // need every venture written, so the copy is split out ahead of everything
  // that reads the finished tree.
  //
  // Ten links across the built site were being rewritten this way, and all seven
  // distinct targets were live published pages (`no-show-fee-calculator`,
  // `where-to-sell-calculator`, `walmart-marketplace-calculator`,
  // `tiktok-shop-fee-calculator`, `shopify-fee-calculator`, `quote-margin-check`,
  // and one `invoice-payment-terms-calculator` page). `check.mjs` reported no
  // dead links throughout, because by then the link was absolute and it does not
  // follow those.
  for (const surface of discovered) {
    await copyTree(surface.sourceDir, path.join(outDir, surface.slug), base);
  }

  // A handful of ventures (currently: ai-engineering-academy, tender-radar,
  // quote-margin-check, shopify-permission-drift, mcp-supply-chain-watch,
  // equipment-rental-break-even) publish from a `site/` subdirectory, so their
  // own root LICENSE sits one level above `sourceDir` and never gets copied
  // above. Every one of those tools still links to its own LICENSE (an
  // `<a href="LICENSE">` footer), and until now that link "escaped the site"
  // and `repairLinks`, below, correctly-by-its-own-logic repointed it at this
  // private GitHub repository -- a 404 for every visitor, same defect #2720
  // fixed for cross-venture links. Publishing the file here, ahead of
  // `repairLinks`, means the link resolves locally and `repairLinks` leaves it
  // alone: this fixes it without touching that function's matching logic.
  //
  // README.md is deliberately NOT part of this: `EXCLUDED_FILES` and
  // `NON_WEB_EXTENSIONS` keep every venture's README.md out of the published
  // tree on purpose (`check.mjs` fails a build that publishes one, as "repo
  // bookkeeping"), so copying it here for six ventures while `copyTree` drops
  // it for the other 163 would both contradict that policy and make this
  // build fail its own check.
  for (const surface of discovered) {
    const from = path.join(venturesDir, surface.slug, 'LICENSE');
    const to = path.join(outDir, surface.slug, 'LICENSE');
    if (existsSync(to) || !(await exists(from))) continue;
    await fs.copyFile(from, to);
  }

  // Pass 2: everything that has to read a complete site.
  //
  // `repairLinks` stays ahead of `surfaceExternalFetchHosts` within this loop,
  // and that order is load-bearing: a repair can rewrite a `<script src>` or a
  // stylesheet `<link href>` to a github.com URL, which is a genuine external
  // request the privacy copy has to report.
  for (const surface of discovered) {
    const html = await fs.readFile(surface.entryFile, 'utf8');
    const { title, description, fullDescription } = readMeta(html, surface.slug);
    const destination = path.join(outDir, surface.slug);

    repairs.push(
      ...(await repairLinks({
        publishedDir: destination,
        sourceDir: surface.sourceDir,
        repoRoot: REPO_ROOT,
        outDir,
      })),
    );

    // Overwrite whatever sitemap the venture shipped with one generated from
    // what actually published. See `renderVentureSitemap` for why.
    const pages = await publishedPages(destination);
    await fs.writeFile(
      path.join(destination, 'sitemap.xml'),
      renderVentureSitemap(surface.slug, pages, base),
    );

    surfaces.push({
      ...surface,
      title,
      description,
      fullDescription,
      searchIndex: searchTokens([
        title,
        fullDescription,
        surface.slug,
        aliasesFor(surface.slug),
        ...(await collectPageTitles(surface.sourceDir, surface.entryFile)),
      ]),
      pageCount: await countPages(surface.sourceDir),
      publishedPageCount: pages.length,
      externalFetchHosts: await surfaceExternalFetchHosts(destination),
    });
    log(`  ${surface.slug}`);
  }

  await fs.writeFile(path.join(outDir, 'index.html'), renderHub(surfaces, base));
  // The saved-bids script, once for the whole site. Every page that carries the
  // band loads it from here; it used to be written into each of them.
  await fs.writeFile(path.join(outDir, SAVED_BIDS_MODULE_FILE), renderSavedBidsModule());
  await fs.writeFile(path.join(outDir, BID_LINK_MODULE_FILE), renderBidLinkModule());
  // The shop-rates script and the chrome's own, on the same terms, plus the
  // three stylesheets this build used to write into every page it touched.
  await fs.writeFile(path.join(outDir, SHOP_RATES_MODULE_FILE), renderShopRatesModule());
  await fs.writeFile(path.join(outDir, CHROME_MODULE_FILE), renderChromeModule());
  await fs.writeFile(path.join(outDir, CHROME_STYLE_FILE), renderChromeStyle());
  await fs.writeFile(path.join(outDir, SHOP_RATES_STYLE_FILE), renderShopRatesStyle());
  // The invalid-field runtime and its mark, on the same terms as the three
  // above: one file each at the root, loaded by every page that promises a
  // highlight.
  await fs.writeFile(path.join(outDir, INVALID_MODULE_FILE), renderInvalidModule());
  await fs.writeFile(path.join(outDir, INVALID_STYLE_FILE), renderInvalidStyle());
  await fs.writeFile(path.join(outDir, SAVED_BIDS_STYLE_FILE), renderSavedBidsStyle());
  // The embed-widget runtime and its stylesheet, on the same terms. The
  // resizer joins them because the snippet every entry page offers names it
  // absolutely: a build that wrote the snippet without the file would hand
  // embedders a `<script src>` that 404s.
  await fs.writeFile(path.join(outDir, EMBED_MODULE_FILE), renderEmbedModule());
  await fs.writeFile(path.join(outDir, EMBED_STYLE_FILE), renderEmbedStyle());
  await fs.writeFile(path.join(outDir, EMBED_HOST_FILE), renderEmbedHostModule());
  await fs.writeFile(path.join(outDir, 'robots.txt'), renderRobots(base));
  await fs.writeFile(path.join(outDir, '404.html'), renderNotFound(base));

  // One landing page per category, under the reserved `c/` prefix. Written
  // before the sitemaps because `renderHubSitemap` has to list exactly the
  // pages this loop produced — a category page in no sitemap is the quiet
  // failure `check.mjs` exists to catch.
  const categoryGroups = groupByCategory(surfaces);
  for (const { category, items } of categoryGroups) {
    const dir = path.join(outDir, CATEGORY_PATH_PREFIX, category.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      renderCategoryPage({ category, items, groups: categoryGroups, baseUrl: base }),
    );
  }

  // After the categories because the About page links every one of them, and
  // before the sitemaps for the same reason they are.
  const aboutDir = path.join(outDir, ABOUT_PATH);
  await fs.mkdir(aboutDir, { recursive: true });
  await fs.writeFile(
    path.join(aboutDir, 'index.html'),
    renderAboutPage({ surfaces, groups: categoryGroups, baseUrl: base }),
  );

  // The comparison index. After the categories because it links every one of
  // them, and before the sitemaps for the same reason they are.
  const comparisons = groupComparisons(await discoverComparisons(surfaces));
  const compareDir = path.join(outDir, COMPARE_PATH);
  await fs.mkdir(compareDir, { recursive: true });
  await fs.writeFile(
    path.join(compareDir, 'index.html'),
    renderComparePage({ groups: comparisons, surfaces, categoryGroups, baseUrl: base }),
  );

  // One spoke per product compared by more than one tool. After the index
  // because each links back to it, and before the sitemaps because they list
  // every one. See `renderCompareProductPage` for why the index alone is not
  // enough.
  const compareProducts = comparisonProductGroups(comparisons);
  for (const group of compareProducts) {
    const dir = path.join(outDir, comparisonProductPath(group.key));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      renderCompareProductPage({
        group,
        groups: comparisons,
        surfaces,
        categoryGroups,
        baseUrl: base,
      }),
    );
  }

  await fs.writeFile(path.join(outDir, 'sitemap.xml'), renderSitemapIndex(surfaces, base));
  await fs.writeFile(
    path.join(outDir, 'sitemap-hub.xml'),
    renderHubSitemap(
      base,
      categoryGroups.map(({ category }) => category.id),
      compareProducts.map((group) => group.key),
    ),
  );
  await fs.writeFile(path.join(outDir, 'catalog.json'), renderCatalog(surfaces, base, launched));
  await fs.writeFile(path.join(outDir, 'llms.txt'), renderLlmsTxt(surfaces, base, compareProducts));
  // Read from the committed file, not from `git log`: the in-cluster build
  // clones `--depth 1` and has no history. See `launched.mjs`.
  await fs.writeFile(path.join(outDir, FEED_FILE), renderFeed(surfaces, base, launched));

  await fs.writeFile(path.join(outDir, 'favicon.ico'), renderFavicon());
  await fs.writeFile(path.join(outDir, 'favicon.svg'), renderFaviconSvg());
  // The site-wide card: what the hub and the About page point at, since
  // neither belongs to one category.
  await fs.writeFile(path.join(outDir, SOCIAL_CARD_FILE), renderSocialCard());
  // One card per category, tinted and headlined with the section's own name.
  // A category holding a documented `externalCallExceptions` entry (today:
  // "more", because Sponsor Ready lives there) gets the exception footer —
  // otherwise this card would tell every social preview "nothing you type is
  // uploaded" for a category where that is false for one of its tools.
  const categoriesWithExceptions = new Set(
    categoryGroups
      .filter(({ items }) => externalCallExceptions(items).length)
      .map(({ category }) => category.id),
  );
  await Promise.all(
    ALL_CATEGORIES.map((category) =>
      fs.writeFile(
        path.join(outDir, socialCardFileFor(category.id)),
        renderSocialCard({
          color: category.accent,
          headline: category.title,
          kicker: SITE_NAME,
          footer: categoriesWithExceptions.has(category.id) ? CARD_FOOTER_EXCEPTION : CARD_FOOTER,
        }),
      )),
  );
  // And one per tool, headlined with the tool's own name on its category's
  // tint. This is the difference between 164 shares of the same anonymous
  // picture and 164 shares that each say what they link to — the single
  // highest-leverage change available to a portfolio whose only distribution
  // is organic. `cardtext.mjs` is what makes it possible without a font
  // dependency; before it existed there was nothing to draw a headline with.
  //
  // Sequential, not `Promise.all`: each card is a 1200x630 CPU-bound raster
  // and the in-cluster build runs under a 2-core limit, so firing 164 at once
  // buys no wall-clock and peaks memory at 164 frame buffers.
  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    if (!(await exists(dir))) continue;
    await fs.writeFile(
      path.join(outDir, toolCardFileFor(surface.slug)),
      renderSocialCard({
        color: categoryFor(surface.slug).accent,
        headline: surface.title,
        kicker: SITE_NAME,
        // Sponsor Ready's own card gets the exception footer — its whole job
        // is a live lookup, so "nothing you type is uploaded" is the one
        // claim this card must not make. See `CARD_FOOTER_EXCEPTION`.
        footer: surface.externalFetchHosts?.length ? CARD_FOOTER_EXCEPTION : CARD_FOOTER,
      }),
    );
  }

  // Tell Jekyll (which GitHub Pages runs by default) to leave the tree alone;
  // without this, any directory starting with `_` is silently dropped.
  await fs.writeFile(path.join(outDir, '.nojekyll'), '');

  const {
    wrapped, rated, saved, shared, described, highlighted, narrowed, embedded,
  } = await addSiteChrome({ outDir, surfaces, baseUrl: base });

  // After the chrome pass, which writes the sponsor line into the footer of
  // every page it wraps -- marking before it would leave those unmarked and
  // uncounted. Before the offline layer below, for the reason stated there:
  // this rewrites HTML, so a cache named from a hash taken earlier would ship
  // pages that no longer match it.
  const sponsored = await markSponsorLinksIn(outDir);

  // After the chrome pass, not before: the offline layer hashes the finished
  // site to name its cache, and injects into pages the chrome has already
  // rewritten. Reversed, every deploy would cache a page missing its nav.
  const offline = await addOfflineSupport({ outDir, base, surfaces, disableWorker });

  return {
    outDir, baseUrl: base, surfaces, repairs, wrapped, rated, saved, shared, described,
    highlighted, narrowed, embedded, sponsored, offline, comparisons,
  };
}

// ---------------------------------------------------------------------------
// Favicon
// ---------------------------------------------------------------------------

/**
 * Every browser requests `/favicon.ico` on its own, for every page, whether or
 * not the markup asks for one -- so without this file all 183 published pages
 * log a 404 on load and open as an anonymous blank tab. The ventures' own
 * pages cannot be asked to link an icon (there are 183 of them and they are
 * the ventures' files, not this build's), and only `.ico` at the origin root
 * is fetched automatically, so the icon has to be generated here.
 *
 * Built rather than committed so the tree stays reviewable text: a 16x16 PNG
 * assembled by hand and wrapped in a single-image ICO container. Deterministic
 * -- same bytes on every run.
 */
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

let CRC_TABLE = null;
function crc32(buffer) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

// The mark, in one place. `renderFavicon` rasterises it to the 16x16 ICO every
// browser fetches on its own; `renderFaviconSvg` emits the same geometry as
// vector art for the icon the hub links explicitly. Sharing the constants is
// what keeps the two from drifting into different logos.
const ICON_SIZE = 16;
const ICON_INK = [36, 61, 53]; // the hub's accent green, so the tab matches the site
const ICON_MARK = [197, 237, 181];

// Three rising bars on a rounded square. Chosen after looking at it at
// actual size: anything with a diagonal turns to mush at 16px, while flat
// bars stay crisp and read as "numbers" rather than as a generic glyph.
const ICON_BARS = [
  { x0: 3, x1: 4, top: 9 },
  { x0: 7, x1: 8, top: 6 },
  { x0: 11, x1: 12, top: 3 },
];
const ICON_BAR_BOTTOM = 12;
const ICON_CORNER = 2; // matches the 2px corner the rasteriser cuts

const rgbHex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

/**
 * The same mark as `renderFavicon()`, as vector art.
 *
 * The `.ico` is a fixed raster: exactly right at 16px in a tab, and soft
 * everywhere a browser shows it larger — a pinned tab, the bookmark bar, a
 * phone home screen. A browser that understands `rel="icon"
 * type="image/svg+xml"` prefers this and renders the mark crisply at any size,
 * while the automatic `/favicon.ico` request still finds a file.
 */
export function renderFaviconSvg() {
  const bars = ICON_BARS.map(
    (b) =>
      `<rect x="${b.x0}" y="${b.top}" width="${b.x1 - b.x0 + 1}" ` +
      `height="${ICON_BAR_BOTTOM - b.top + 1}" fill="${rgbHex(ICON_MARK)}"/>`,
  ).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">` +
    `<rect width="${ICON_SIZE}" height="${ICON_SIZE}" rx="${ICON_CORNER}" ` +
    `fill="${rgbHex(ICON_INK)}"/>${bars}</svg>\n`
  );
}

export function renderFavicon() {
  const size = ICON_SIZE;
  const ink = ICON_INK;
  const mark = ICON_MARK;
  const BARS = ICON_BARS;
  const raw = [];
  for (let y = 0; y < size; y += 1) {
    raw.push(0); // PNG filter byte: none
    for (let x = 0; x < size; x += 1) {
      const corner = (x < 2 || x > 13) && (y < 2 || y > 13);
      const inBar = BARS.some((b) => x >= b.x0 && x <= b.x1 && y >= b.top && y <= 12);
      if (corner) raw.push(0, 0, 0, 0);
      else if (inBar) raw.push(...mark, 255);
      else raw.push(...ink, 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from(raw), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  // ICO container: 6-byte header, one 16-byte directory entry, then the PNG.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = size;
  entry[1] = size;
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argBase = process.argv.find((a) => a.startsWith('--base='))?.slice('--base='.length);
  const argOut = process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length);

  const result = await buildSite({
    baseUrl: argBase || process.env.PAGES_BASE_URL || DEFAULT_BASE_URL,
    outDir: argOut ? path.resolve(argOut) : undefined,
    disableWorker: process.env.PAGES_DISABLE_SW === '1',
    log: console.log,
  });

  console.log(`\nBuilt ${result.surfaces.length} tools into ${result.outDir}`);
  console.log(`Base URL: ${result.baseUrl}`);
  if (result.repairs.length > 0) {
    console.log(`Repointed ${result.repairs.length} off-site link(s) at the repository source.`);
  }
  console.log(`Added site navigation to ${result.wrapped.length} page(s).`);
  console.log(`Carried saved shop rates into ${result.rated.length} bid calculator page(s).`);
  console.log(`Added saved bids to ${result.saved.length} page(s) with a form.`);
  console.log(`Added a shareable bid link to ${result.shared.length} page(s).`);
  console.log(`Corrected canonical and share-card tags on ${result.described.length} page(s).`);
  console.log(`Highlighted the rejected input on ${result.highlighted.length} page(s).`);
  console.log(`Kept ${result.narrowed.length} page(s) with a table from scrolling sideways on a phone.`);
  console.log(`Added an embed offer to ${result.embedded.length} tool entry page(s).`);
  console.log(`Made the sponsor link countable on ${result.sponsored.length} page(s).`);
}
