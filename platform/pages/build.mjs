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

import { promises as fs, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadLastChanged } from './lastmod.mjs';
import { generateVenturePages } from './generated-pages.mjs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { decodeEntities } from './entities.mjs';
import { REFS as CHANNEL_REFS, SOURCE_HOSTS, SOURCE_LABELS, sourceOf } from '../counter/counter.mjs';
import { buildEngineeringPage, ENGINEERING_PATH, REPO_URL } from './engineering.mjs';
import { loadRequests, SOURCES as REQUEST_SOURCES, STATUSES as REQUEST_STATUSES } from '../../portfolio/requests/requests.mjs';
import { moveAudioToCdn } from './audio-cdn.mjs';
import { AGENT_POSTS_DIR, AGENTS_PATH, buildWriting, loadPosts, WRITING_PATH } from './writing.mjs';
import { buildStories, STORIES_PATH } from './stories.mjs';
import { buildLab } from './lab.mjs';
import { buildUpdates, CHANGELOG_PATH, UPDATES_PATH } from './updates.mjs';
import { audienceGroups, audiencePageId, audiencesFor } from './audiences.mjs';
import {
  FEED_MAX_ENTRIES,
  feedUpdatedAt,
  isIsoDate,
  loadLaunchDates,
  orderForFeed,
} from './launched.mjs';

import { addShareCards, cardTitle, mapLimit, renderCards, siteAddress } from './share.mjs';
import {
  MARK_GEOMETRY,
  renderSiteCard,
  drawMark,
  markSvg,
  encodePng as encodeCardPng,
} from './sharecard.mjs';
import {
  ICONS,
  OFFLINE_WIDGET_SCRIPT,
  THEME_COLOR,
  injectOfflineSupport,
  offlineBundleSizeLabel,
  offlineSizeMarker,
  renderIcon,
  renderKillSwitchWorker,
  renderManifest,
  renderOfflinePage,
  renderOfflineWidgetHtml,
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
  slugTakesSavedBids,
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
  maskScriptAndStyleBodies,
  renderEmbedHostModule,
  renderEmbedModule,
  renderEmbedStyle,
} from './embed.mjs';

// Re-exported so callers outside `platform/pages/` (the mirror generator,
// `platform/marketing/front-door-tools.mjs`) get it from the module they
// already import other build-time helpers from, rather than reaching into
// `embed.mjs` -- an implementation detail of where this file's own version of
// the same defect (see the export's own doc comment) happened to need it too.
export { maskScriptAndStyleBodies };
import {
  INVALID_MODULE_FILE,
  INVALID_STYLE_FILE,
  injectInvalidField,
  renderInvalidModule,
  renderInvalidStyle,
} from './invalid.mjs';
import { BACKUP_WIDGET_HTML, BACKUP_WIDGET_SCRIPT } from './backup.mjs';
import { REFLOW_CSS, WRAP_TABLES_JS, injectReflow } from './reflow.mjs';
import {
  SITE_NAME,
  MARK_BG,
  SITE_NAV,
  SITE_HEADER_CSS,
  SITE_STYLE_FILE,
  VENTURE_CHROME_CSS,
  VENTURE_CHROME_JS,
  SEARCH_ANCHOR,
  renderSiteHeader,
  renderSiteFooterNav,
  renderSiteStyle,
  sponsorsNote,
  SPONSORS_URL,
  BUY_ME_A_COFFEE_URL,
  siteStyleLink,
  writeResearchChrome,
  siteTitle,
} from './site-nav.mjs';
import { ASK_PATH, ASSISTANT_LAUNCHER_JS, renderAskPage, renderAssistantFiles } from './assistant.mjs';
import { loadResearchRegistry } from './research-registry.mjs';
import {
  HERO_BACKDROP_HTML,
  HOME_MOTION_CSS,
  HOME_MOTION_SCRIPT,
  copyShowcase,
  loadShowcase,
  renderMarquee,
  renderShowcaseSection,
} from './showcase.mjs';
import {
  HOME_SECTIONS_CSS,
  cardName,
  icon,
  renderCategoryCard,
  renderHowItWorks,
  renderLatestWriting,
  renderResearchBand,
  siteStructuredData,
} from './home.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');

// The Pages path used before the repository was renamed; it now answers 404.
export const LEGACY_BASE_URL = 'https://duncan-haywood.github.io/monorepo-projects/';
// Owner-overridable at build time; this default is where GitHub serves a
// project Pages site for this repository.
export const DEFAULT_BASE_URL = 'https://duncan-haywood.github.io/oss-monorepo/';

// IndexNow (api.indexnow.org) proves ownership of a set of URLs with a key
// file hosted at a location the submitter names in each request -- it does
// not have to sit at the host root the way `robots.txt` does. That matters
// here: the site is served from a project-Pages *subpath*
// (`platform/ci/pages_state.py`'s "subpath-robots" finding), so a host-root
// key file would be as undiscoverable as the sitemap line in `robots.txt`
// already is. Naming the location explicitly in every submission
// (`platform/marketing/indexnow.mjs`) sidesteps that rather than repeating
// it. The value is not a secret -- it only proves this build controls the
// URLs it submits -- so it is a plain committed constant, generated once
// with `python3 -c "import secrets; print(secrets.token_hex(16))"`.
export const INDEXNOW_KEY = '51c80c301d4b5583163e00e6c89b06cf';
export const indexNowKeyFileName = () => `${INDEXNOW_KEY}.txt`;

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

// Pages a venture writes from its own engine at build time: generated-pages.mjs.
export { GENERATED_PAGES, generateVenturePages } from './generated-pages.mjs';

// Ventures whose own page offers a specific `.py` CLI as a download --
// "get check.py from the repo, run it yourself, no network calls." `.py` is
// in `NON_WEB_EXTENSIONS` (a browser visitor downloads none of a venture's
// CLI source), so `copyTree` never publishes these, and every one of these
// 18 ventures linked its CTA at `github.com/.../blob/main/...` instead --
// which 404s for every visitor, because this repository is private. That is
// the same defect #5515 fixed for `license-drift-check`'s `cli.mjs`, except
// `cli.mjs` was already published (not a NON_WEB_EXTENSIONS extension) so a
// relative link was already enough; a `.py` deliverable needs publishing
// too. Listed explicitly, like `ENTRY_OVERRIDES` above, rather than by a
// name-based rule (`check.py` is a common filename and most ventures that
// have one do NOT offer it as a public download), so publishing stays
// opt-in per file rather than quietly widening to every `.py` in the tree.
export const DOWNLOADABLE_CLI_FILES = {
  'actions-artifact-poisoning-check': ['check.py'],
  'actions-cache-poisoning-check': ['check.py'],
  'actions-checkout-credentials-check': ['check.py'],
  'actions-injection-check': ['check.py'],
  'actions-permissions-check': ['check.py'],
  'actions-runner-starvation-check': ['check.py'],
  'actions-secret-leak-check': ['check.py'],
  'actions-secrets-inherit-check': ['check.py'],
  'actions-schedule-check': ['check.py'],
  'actions-timeout-check': ['check.py'],
  'actions-runtime-deprecation-check': ['check.py'],
  'jwt-verification-misuse-check': ['check.py'],
  'docker-compose-security-check': ['check.py'],
  'git-bus-factor-check': ['busfactor.py'],
  'k8s-pod-security-check': ['check.py'],
  'actions-self-hosted-exposure-check': ['check.py'],
  'coverage-drop-check': ['check.py'],
  'dependency-confusion-check': ['check.py'],
  'docker-base-image-eol-check': ['check.py'],
  'docker-base-image-pin-check': ['check.py'],
  'docker-build-secrets-check': ['check.py'],
  'flaky-test-finder': ['check.py'],
  'openapi-breaking-change-check': ['openapi_diff.py'],
  'pinned-actions-check': ['check.py'],
  'required-checks-drift-check': ['check.py'],
  'sbom-diff-check': ['sbom_diff.py'],
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
  { slug: 'snow-plow-contract', add: 'snow removal shoveling deicing salting ice management seasonal per push' },
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
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.cache', 'tests', 'mobile', '__pycache__']);
// Every dot-directory is skipped unless it is named here, and the allowlist is
// the whole reason this is a rule rather than four more entries in the set
// above. That set is a list of names someone had already seen, and it has now
// aged twice: it learned `__pycache__` after a Python venture shipped, and it
// still did not know `.ruff_cache` or `.pytest_cache`, which land in a venture
// directory the moment a session runs that venture's Python suite — which is
// exactly what CLAUDE.md's own pre-merge checklist instructs.
//
// Measured 2026-09-09, and it is not cosmetic: `publish-branch.sh` runs
// `check.mjs` against the dist and is fail-closed, and `check.mjs` rejects
// `CACHEDIR.TAG` because nothing tells nginx how to type `.tag`. So running the
// documented checklist and then publishing was enough to *block the publish of
// the live catalogue* — during the starvation window in which that manual
// publish is the only route to the live site. Two ventures were carrying the
// cache in this session's tree, and two more carry `__pycache__` that only the
// older entry above catches.
//
// A name list cannot win this race: the next tool ships its own cache and the
// list learns about it from the outage. Skipping dot-directories by shape does
// not go stale, and it costs nothing today — measured on a full build, not one
// dot-directory reaches the artifact. `.well-known` is allowlisted because it
// is the one dot-directory a static site has a real reason to serve (ACME
// challenges, `security.txt`), so a future need for it is already answered.
const PUBLISHABLE_DOT_DIRS = new Set(['.well-known']);
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
// Manufacturing files (CAD exchange formats and the zip that bundles them, as
// in open-tennis-robots/manufacturing/) are downloads for fabricators, not web
// payload: check.mjs has no MIME type for them, and the page links them on
// GitHub instead.
const NON_WEB_EXTENSIONS = new Set([
  '.py', '.toml', '.cfg', '.ini', '.lock', '.yaml', '.yml', '.sh', '.ts', '.tsx', '.md',
  '.dxf', '.step', '.stp', '.stl', '.zip',
  // Labelled data sets (sales-agent's eval/*.jsonl): read by scripts in the repo, of no use to a visitor, and
  // nginx has no type for them.
  '.jsonl',
  // Rust sources (dupehound): the page loads the compiled .wasm, never the source.
  '.rs',
]);

// Files whose contents get the placeholder origin swapped for the real one.
const REWRITABLE = new Set(['.html', '.xml', '.txt', '.json', '.mjs', '.js', '.webmanifest']);

// Ordered: the first rule whose test matches wins.
// `categoryFor` runs for every slug on every page and link the build writes,
// and this check stats the venture's files, so it is answered once per slug
// (the tree does not change during a build). Uncached it made ~25M `existsSync`
// calls and took the front-door tests past CI's 20-minute job limit.
const deployableApp = new Map();
function shipsDeployableApp(slug) {
  let hit = deployableApp.get(slug);
  if (hit === undefined) {
    hit = surfaceKind(path.join(REPO_ROOT, 'ventures', slug), slug) === 'app'
      && !CATEGORY_RULES.slice(1).some((rule) => rule.test(slug));
    deployableApp.set(slug, hit);
  }
  return hit;
}

// Tools that implement a published paper (portfolio/research-tools/README.md).
export const RESEARCH_ALGORITHM_SLUGS = ['changepoint-detector', 'conformal-prediction-intervals', 'matrix-profile-explorer'];

const CATEGORY_RULES = [
  {
    // Added 2026-10-16 (P019): the self-hosted SaaS-operations apps had been
    // filed by slug into `ci` and the catch-all, which tripped the catch-all
    // bound (14) and told a visitor a dunning engine was a CI check. First so
    // it wins over the `ci` list, which still names several of them.
    id: 'self-hosted',
    title: 'Self-hosted business apps',
    accent: '#2b4c7e',
    blurb: 'Open-source business software you run on your own server: failed-payment recovery, cancellation flows, MRR and revenue recognition, lifecycle email, referrals, feature flags, status pages, help centres, booking pages, cookie-free analytics and more. Deploy your own copy with your own keys; you own the data.',
    // Named apps first; then any venture that ships a server and a deploy
    // manifest (surfaceKind 'app') that no other section claims, so the next
    // self-hosted app lands here instead of in the catch-all.
    test: (slug) =>
      /-keeper$/.test(slug)
      || ['cancel-flow', 'churn-radar', 'cron-heartbeat', 'dunning-engine', 'feedback-board', 'form-inbox',
        'mrr-pulse', 'rev-rec', 'self-hosted-saas-stack', 'support-desk', 'trial-converter', 'webhook-relay'].includes(slug)
      || shipsDeployableApp(slug),
  },
  {
    // `1099k-reconciliation-worksheet` moved here from `backoffice` 2026-10-10: it reconciles a marketplace's 1099-K against a seller's own sales, a
    // marketplace-seller job; `backoffice` had crept past its 3 MB gzipped offline bound (build.test.mjs).
    // `wholesale-vs-retail-pricing-calculator` filed here 2026-10-10: a maker comparing direct, wholesale and consignment profit per unit is a seller's
    // channel-fee decision; the catch-all had grown past its bound of 5 (build.test.mjs).
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
    // `whatnot-seller-payout` is the livestream/auction sibling the retail fee
    // ranking already deep-links (#3682): commission on the hammer plus
    // processing on checkout. It sat in "More free tools" because the slug
    // starts with `whatnot-`, which no marketplace prefix above caught — same
    // catch-all hole tiktok-shop and kdp already closed.
    // `poshmark-fee-calculator` is the same single-channel fee-schedule shape
    // as `reverb` and `whatnot` above — flat/percentage seller commission on
    // one storefront — and would otherwise sit in the catch-all for the same
    // reason those two did: the slug names the storefront, not a marketplace
    // keyword this rule already recognised.
    // `auction-car-flip-calculator` joined 2026-10-01 on its first commit: a reseller
    // turning a resale price, repairs and tiered buyer fees into a max bid is the
    // `storage-auction-max-bid-calculator` job for a vehicle.
    // `liquidation-pallet-bid-calculator` is `storage-auction-max-bid-calculator`'s
    // manifest-driven sibling: an auction hammer plus buyer's premium for goods
    // the winner resells, so it files with the marketplace tools, not with the
    // trades section its `bid-calculator` suffix would otherwise sweep it into.
    // `tax-deed-auction-max-bid-planner` joined 2026-10-11: the same hammer-plus-premium max bid, for real property.
    // `storage-auction-max-bid-calculator` is `whatnot-seller-payout`'s buy
    // side rather than its sell side: a hammer bid plus a buyer's premium
    // (the auction-house equivalent of processing on checkout), for contents
    // the winner then resells through the same marketplaces this section
    // already covers. Its slug ends in `bid-calculator`, which would
    // otherwise sweep it into the trades section as a contractor job bid —
    // it prices a resale purchase, not a construction trade, so it is
    // matched here first.
    // `stockx-seller-payout-calculator` is the same single-channel
    // fee-schedule shape as `whatnot` and `poshmark` above — a seller-level
    // fee tier plus a flat processing fee on one storefront's sale price —
    // and would otherwise sit in the catch-all for the same reason those two
    // did: the slug names the storefront, not a marketplace keyword this
    // rule already recognised.
    // `twitch-payout-calculator` is the same platform-revenue-split shape as
    // `stockx` and `whatnot` above, one further step removed from a sale
    // price: Twitch keeps a fixed percentage of subscription revenue (the
    // platform's own "fee schedule") rather than a seller listing an item,
    // but the arithmetic a creator needs — apply the platform's cut, then
    // decide whether the program (Partner Plus) is worth it — is the same
    // question this section already answers for a resale seller. It sat in
    // the catch-all because its slug names a streaming platform, not a
    // storefront keyword this rule already recognised.
    // `upwork-connects-roi-calculator` prices the same Upwork bidding decision
    // from the other side (what a hire costs in Connects and writing time), so
    // it sits beside `freelance-platform-fee-calculator`, not in the catch-all.
    // `app-subscription-proceeds-calculator` is the same platform-cut question for an app
    // developer: what a subscription charge nets after the store's percentage, so it
    // sits with the other fee tools rather than in the catch-all.
    // `freelance-platform-fee-calculator` is the same platform-cut shape one
    // further step removed again: Upwork and Fiverr take a percentage of a
    // freelancer's job price the same way a resale marketplace takes a
    // percentage of a sale price, and the reader deciding which of the two
    // nets more is the same reader as `where-to-sell` and
    // `marketplace-fee-compare` above, just pricing labor instead of an
    // item. Its slug names neither platform first, so no storefront keyword
    // above would have caught it and it would otherwise have swelled the
    // catch-all.
    // `turo-host-payout-calculator` is `str-host`'s exact sibling one asset
    // class over: a Turo host comparing a plan/booking-window payout matrix
    // on one trip is the same "price a program before you opt in" question
    // as an Airbnb/Vrbo host comparing fee schedules on one stay. Its slug
    // does not start with a marketplace keyword this rule already
    // recognised, so it would otherwise have swelled the catch-all the way
    // `str-host` itself once did.
    // `mercari-fee-calculator` is the same single-channel fee-schedule shape
    // as `poshmark` and `stockx` above — a shipping-inclusive percentage
    // selling fee on one storefront, with an older schedule an unedited
    // listing may still be running — and would otherwise sit in the
    // catch-all for the same reason those two did: the slug names the
    // storefront, not a marketplace keyword this rule already recognised.
    // `str-occupancy-tax-calculator` is `str-host`'s exact sibling on the
    // other side of the same booking: instead of what a host is paid, it
    // is what a host must remit once a platform's collection agreement is
    // netted out, on the same Airbnb/Vrbo stay this section already prices.
    // Broadened the `str-host` match to `str-` rather than adding a second
    // alternative, since both slugs share the audience and the storefront
    // prefix.
    // `kickstarter-fee-calculator` is the same platform-cut shape as
    // `stockx` and `twitch` above, one step further from a resale: a
    // platform fee plus a per-transaction processing charge netted out of
    // what a creator collects, rather than a seller's sale price — the
    // same "what do I actually keep on this platform" question this
    // section already answers. Its slug names neither a marketplace nor a
    // storefront keyword this rule already recognised, so it would
    // otherwise have swelled the catch-all.
    // `depop-fee-calculator` is the same single-channel fee-schedule shape
    // as `mercari` and `poshmark` above — a per-region selling/processing
    // fee split on one storefront, with an older flat schedule some sellers
    // still run — and would otherwise sit in the catch-all for the same
    // reason those two did: the slug names the storefront, not a
    // marketplace keyword this rule already recognised.
    // `facebook-marketplace-fee-calculator` is the same single-channel
    // fee-schedule shape as `depop` and `mercari` above — a shipped-vs-local
    // split with a minimum-fee floor on one storefront — and its slug
    // starts with the storefront name plus "-marketplace-fee", which the
    // bare `marketplace-fee-compare` alternative does not prefix-match, so
    // it would otherwise sit in the catch-all for the same reason those two
    // did.
    // `demand-forecast-backtester` joined 2026-10-18 on its first commit: it forecasts a seller's own sales export and sizes safety
    // stock, the same reader as `shopify-inventory-reorder-planner`, which links it. `grailed-fee-calculator` and
    // `tcgplayer-fee-calculator` were filed here the same day: storefront fee calculators the catch-all bound (build.test.mjs) was rejecting.
    // `clearance-markdown-planner` joined 2026-09-30: a seller clearing leftover
    // stock on someone else's storefront is this section's reader; it would
    // otherwise sit in the catch-all, and it is reciprocally linked from
    // `shopify-inventory-reorder-planner`.
    // `bundle-discount-optimizer` joined 2026-09-30: it reads a Shopify, Etsy or Amazon seller's own order
    // export to price product bundles, the same reader as the fee tools here; the slug names no platform.
    // `returns-policy-cost-analyzer` joined 2026-10-02 on its first commit: it reads a store's own orders-and-refunds
    // export to price returns and test return fees, the same reader as `free-shipping-threshold-optimizer` here.
    // `free-shipping-threshold-optimizer` joined 2026-10-02 on its first commit: it reads a Shopify, WooCommerce or Etsy
    // seller's own order export to choose a free-shipping minimum, the same reader as `bundle-discount-optimizer` here.
    // `breakeven-roas-calculator` joined 2026-10-01 on its first commit: turns a DTC seller's per-order
    // margin into the break-even ROAS and max CPA an ad campaign needs; the same reader as the fee tools here.
    // `used-car-lot-aging-planner` joined 2026-10-02 on its first commit: an independent dealer deciding when an
    // aged unit goes to auction is the same reseller as `auction-car-flip-calculator` here, and the two cross-link.
    // `wholesale-line-sheet-maker` joined 2026-10-07 on its first commit: a maker pricing products for boutiques, with the retailer's
    // margin and an optional marketplace commission in the arithmetic, is the same seller as `marketplace-fee-compare` and `faire` here.
    // `chargeback-ratio-monitor` joined 2026-10-09 on its first commit: an online seller checking a monthly dispute ratio against card-program lines is
    // a storefront seller's own payments problem beside `shopify-payout-profit-analyzer`; `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `glamping-unit-payback-calculator` joined 2026-10-12 on its first commit: a glamping host turning build cost, seasonal nightly rates booked through listing sites and a loan into payback is the same host as `rv-rental-host-profit-calculator` and the `str-` tools here.
    // `str-arbitrage-lease-calculator` is covered by the `str-` prefix below: an operator who leases a unit to sublet by the night is the same host as `midterm-rental-calculator` and the other `str-` tools.
    // `app-review-insights` joined 2026-10-10 on its first commit: an app developer reading store reviews is a storefront seller reading customer feedback beside `app-subscription-proceeds-calculator` here.
    test: (slug) => /^(demand-forecast-backtester|grailed-fee-calculator|tcgplayer-fee-calculator|reseller-books|axe-throwing-bar-profit-calculator|tournament-pairing-manager|tailor-alterations-shop-profit-calculator|shoe-repair-shop-profit-calculator|phone-repair-shop-profit-calculator|barbershop-chair-profit-calculator|driving-school-profit-calculator|braiding-studio-profit-calculator|esthetician-studio-profit-calculator|lash-studio-profit-calculator|payment-processor-fee-comparison|1099k-reconciliation-worksheet|wholesale-vs-retail-pricing-calculator|severance-package-calculator|chargeback-ratio-monitor|app-review-insights|commercial-lease-abstract-reader|vendor-contract-clause-reader|business-insurance-policy-reader|workers-comp-audit-dispute-checker|percentage-rent-audit-checker|bail-bond-agency-exposure-calculator|midterm-rental|amazon|fba-|clearance-markdown|bundle-discount|free-shipping-threshold|returns-policy|breakeven-roas|course-launch|ebay|etsy|print-on-demand|shopify-fee|shopify-payments-fee|shopify-discount|shopify-inventory|shopify-product-csv|shopify-customer-csv|bigcommerce-product-csv|squarespace-product-csv|wix-product-csv|teachers-pay-teachers|course-platform|music-distribution|shopify-to-woocommerce|woocommerce-product-csv|square-catalog-csv|shopify-payout|faire|reverb|walmart|where-to-sell|tiktok-shop|delivery-app|restaurant-delivery-commission|marketplace-fee-compare|str-|rv-rental-host|glamping-unit-payback|turo-host|kdp|whatnot|poshmark|storage-auction|tax-deed-auction|auction-car-flip|used-car-lot|liquidation-pallet|stockx|twitch|freelance-platform-fee|upwork-connects|app-subscription|thumbtack-lead|mercari|discogs|kickstarter|depop|facebook-marketplace|ticket-resale|card-grading-submission|thrift-haul|price-increase-breakeven|wholesale-line-sheet)/.test(slug),
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
    // `mosquito-control-program-pricing-calculator` joined 2026-10-09 on its first commit: a recurring seasonal spray route priced per visit and per
    // prepaid season is trade route work like `lawn-care-bid-calculator`, and its slug does not end in `bid-calculator`.
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
    // `custom-farm-rate-calculator` is a custom farm operator (their own
    // combine, planter, sprayer or baler) pricing one job for another farmer
    // from field speed, fuel burn, repairs and the machine's own ownership
    // cost spread over hours run — the same "materials, burden, overhead"
    // job-costing this section's bid calculators do, just for field work
    // instead of a construction trade, and it landed in the catch-all only
    // because its slug ends in `-rate-calculator`, not `-bid-calculator`.
    // `cow-calf-breakeven-calculator` is the herd-side sibling: a cattle producer's cost per cow
    // against calf price, the same own-numbers job costing for a farm, so it sits beside it.
    // `auto-repair-effective-labor-rate` is the same reader as `shop-rate`
    // above, arriving from the other end of the year: `shop-rate` computes the
    // hour a shop must sell, this measures the hour it actually sold. Its slug
    // names neither a trade nor a bid, so no keyword caught it and it fell to
    // the catch-all — where the shop owner meeting the burden and overhead
    // fields on every calculator in this section would never have seen it.
    // `handyman-minimum-job-calculator` joined 2026-10-01: small-job pricing for a handyman, same reader as the bid calculators here; slug names no trade-bid shape.
    // `tire-shop-ticket-margin-calculator` joined 2026-10-01: same reader as `auto-repair-effective-labor-rate` above; slug names no trade.
    // `bid-win-rate-optimizer` joined 2026-09-30: it learns from a contractor's own won and lost quotes which
    // markup to put on the job the bid calculators here price; slug names no trade, so it would land in the catch-all.
    // `quote-follow-up-timing` joined 2026-09-30: it reads a contractor's or agency's own won, lost and open quotes to show when
    // wins arrive and which open quotes are worth chasing; same reader as the bid calculators here, slug names no trade.
    // `crew-dispatch-optimizer` joined 2026-09-30: plans which crew takes which job and in what order for
    // plumbing, HVAC, electrical and cleaning crews, next to the job-costing tools those owners already use.
    // `service-van-stock-optimizer` joined 2026-09-30: it picks the parts an HVAC, plumbing or electrical van carries from
    // the owner's own job history; same reader as the trade bid calculators here, slug names no trade.
    // `route-account-pruner` joined 2026-09-30: ranks a recurring route's accounts (lawn, pool, pest, cleaning) by profit
    // per route hour including driving, same owner as the crew and bid tools here; slug names no trade.
    // `project-estimate-calibrator` joined 2026-09-30: it turns a freelancer's or contractor's own estimate-versus-actual
    // history into the buffer and fixed-price risk the bid calculators here leave to a guess; slug names no trade.
    // `quote-follow-up-timing` and `revenue-target-lead-planner` joined 2026-09-30: both read a small service business's
    // own quote and lead history (when quotes close; how many leads a revenue target needs); slugs name no trade.
    // `home-service-lead-roi-analyzer` reads a trades owner's lead-buying log (Thumbtack, Angi, Google LSA) to
    // show which paid source books jobs; same reader as the bid calculators here, slug names no trade.
    // `snow-plow-contract-calculator` joined 2026-10-03: compares per-push, per-inch, seasonal and hybrid plow contracts across low/normal/high snow
    // years for a route of sites; slug names no `bid-calculator`, same reader as `snow-removal-bid-calculator` (also here, in trades-outdoor).
    // `plumber-flat-rate-price-calculator` joined 2026-10-03 on its first commit: a plumbing shop's flat-rate price book from its own
    // billable-hour cost, same reader as `appliance-repair-quote-calculator` and the bid calculators here; slug names no `bid-calculator`.
    // `hvac-repair-tier-price-calculator` joined 2026-10-03 on its first commit: Good/Better/Best repair prices and an average-call model for an HVAC
    // shop, same reader as `plumber-flat-rate-price-calculator` just above; slug names no `bid-calculator`.
    // `roofing-insurance-supplement-finder` joined 2026-10-08 on its first commit: a storm-restoration roofer pricing what an adjuster's estimate
    // left out is this section's reader; the slug does not end in `bid-calculator`, so it needs naming to stay out of the catch-all.
    // `surety-bond-capacity-calculator` joined 2026-10-09 on its first commit: a contractor pricing the performance and payment bond into a bid and
    // testing it against a surety limit is this section's reader; the slug does not end in `bid-calculator`, so it needs naming.
    // `bid-leveling-worksheet` joined 2026-10-10 on its first commit: a general contractor leveling subcontractor bids to one scope before awarding is this section's reader; the slug does not end in `bid-calculator`, so it needs naming.
    // `timber-sale-offer-checker` joined 2026-10-10 on its first commit: a landowner testing a logger's offer against their own log list sits with `firewood-profit` and `cow-calf-breakeven` as the land-based small operator; the slug does not end in `bid-calculator`, so it needs naming.
    // `grazing-lease-rate-calculator` and `pollination-contract-checker` joined 2026-10-10: a land or livestock operator pricing a lease or contract from their own numbers, beside `hunting-lease-income` and `cow-calf-breakeven`.
    // `grain-store-or-sell-calculator` joined 2026-10-11 on its first commit: a grain farmer pricing storage against a harvest sale from their own numbers, beside `hay-sale-price` and `cow-calf-breakeven`.
    // `tailor-alterations-shop-profit-calculator` joined 2026-10-11 on its first commit beside `nail-tech-booth-rent-calculator`: a tailor or alterations shop turning bench minutes, supplies and rent into profit per job and a season result.
    // `braiding-studio-profit-calculator` joined 2026-10-11: a braiding studio owner turning long style times, supplies, no-shows and rent into profit per style, and comparing braiding, commission and booth rent for a chair.
    // `lash-studio-profit-calculator` joined 2026-10-11 on its first commit beside `esthetician-studio-profit-calculator`: a lash tech turning set and fill minutes, supplies, card fees and no-shows into profit per chair hour and client lifetime value.
    // `esthetician-studio-profit-calculator` joined 2026-10-11: an esthetician or skin-care studio owner turning facial, waxing and peel minutes, supplies, no-shows and rent into profit per treatment, and comparing working the chair, commission and booth rent.
    // `barbershop-chair-profit-calculator` joined 2026-10-11: a barbershop owner turning chair minutes, supplies, no-shows and rent into profit per cut, and comparing cutting, commission and booth rent for a chair.
    // `driving-school-profit-calculator` joined 2026-10-11: a driving school owner turning lesson, block-lesson and road-test minutes, fuel, cancellations and the car's cost into profit per lesson and car hour, and comparing instructing, employing an instructor and leasing the car.
    // `phone-repair-shop-profit-calculator` joined 2026-10-11: a phone or device repair shop turning bench minutes, parts, warranty redos and rent into profit per job and a season result.
    // `shoe-repair-shop-profit-calculator` joined 2026-10-11: a cobbler or shoe repair shop turning bench minutes, supplies and rent into profit per job and a season result.
    // `upholstery-shop-job-profit-calculator` joined 2026-10-11 on its first commit beside the other bench-and-fixed-cost shop calculators here: an upholstery shop turning bench minutes, materials and rent into profit per job.
    // `standby-generator-install-price-calculator` joined 2026-10-11 on its first commit: an electrician or generator dealer pricing an install from equipment, runs and crew hours is this section's reader; the slug does not end in `bid-calculator`, so it needs naming.
    // `wall-framing-takeoff` joined 2026-10-28 out of the catch-all: a
    // framer's stud layout, cut list and lumber order is the materials half of
    // a framing bid, so its readers browse this section.
    // `shed-designer` joined 2026-10-29 on its first PR: framing plans, a cut
    // sheet and a lumber order for a shed, the same reader as `wall-framing-takeoff`.
    test: (slug) => (/bid-calculator$/.test(slug) && !/^water-well-drilling/.test(slug)) || slug === 'wall-framing-takeoff' || slug === 'shed-designer' || /^(upholstery-shop-job-profit|standby-generator-install|mosquito-control-program|surety-bond-capacity|experience-mod-calculator|bid-leveling|timber-sale|hunting-lease|grazing-lease|hay-sale-price|grain-store-or-sell|vineyard-grape-vs-wine|solar-land-lease|pollination-contract|fixed-bid-overrun|roofing-insurance-supplement|janitorial|coi-expiry-gap-checker|retainage|quote-margin|no-show-fee|freelance-retainer|freelance-rate-increase|price-increase-breakeven|change-order|construction-delay-claim|job-margin|subcontractor-cashflow|contractor-bid-readiness|bid-win-rate|quote-follow-up-timing|revenue-target-lead-planner|construction-evidence|shop-rate|tire-shop-ticket-margin|handyman-minimum-job|trade-bid-studio|auto-repair-effective-labor-rate|cleaning-dilution|hvac-maintenance|appliance-repair|plumber-flat-rate|hvac-repair-tier|cut-list|tile-layout|rfp-compliance-matrix|security-questionnaire-matcher|tender-bid-readiness|tender-radar|recompete-radar|sawmill-custom-sawing|commercial-solar-ppa|which-job-first|solar-panel-cleaning|custom-farm-rate|cow-calf-breakeven|stocker-cattle-margin|firewood-profit|home-service-lead-roi|invoice-aging|late-invoice-collections|client-profitability|project-estimate-calibrator|crew-dispatch-optimizer|service-van-stock-optimizer|route-account-pruner|snow-plow-contract|stump-grinding|lead-response-time)/.test(slug),
  },
  {
    id: 'food-service',
    title: 'Restaurant, bar & food truck pricing',
    accent: '#6b2f3a',
    blurb:
      'What a plate, a pour, or a booked event actually earns once food cost, waste, and the hours behind it are in the arithmetic — for the operators who sell food and drink rather than a job at someone else\'s property.',
    // Added 2026-09-13. The catch-all guard in `build.test.mjs` is what
    // prompted it -- `More free tools` had reached 6 against a bound of 5 --
    // but this section is NOT what fixed that, and the distinction matters for
    // anyone weighing whether to keep it. #4677 restored the bound
    // independently in the same window by filing `caption-quality-check` (the
    // arrival that tripped it) under `ci`.
    //
    // What the guard actually bought was the enumeration. Following its own
    // instruction -- "Prefer listing the catch-all to reasoning about the one
    // venture in front of you" -- the six were listed rather than judging the
    // arrival, and the cluster turned out to be already there, two of it
    // sitting in the catch-all and one of it filed under `services` for want
    // of anywhere better. So judge this section on the axis below and on
    // `pour-cost-calculator` having a home that fits, not on a bound.
    //
    // The axis is what is being sold: food and drink, priced per item or per
    // event, where the cost side is ingredients and prep hours. That is a
    // different question from every named section above:
    //
    //   - `trades` bids a job at the customer's property. `hood-cleaning-bid-
    //     calculator` cleans a restaurant's hood and is deliberately NOT moved
    //     here -- it is a trade pricing its own visit, and the restaurant is
    //     its customer, not its operator.
    //   - `services` prices "a visit, a route, a booking, or a licence".
    //   - `marketplace` is someone else's storefront and fee schedule.
    //   - `solo-earner` is one individual's own labour or audience.
    //
    // `pour-cost-calculator` moves here out of `services`, and that is the
    // part worth justifying rather than assuming. A bar working out the pour
    // cost on a spirit is not pricing a visit, a route, a booking or a licence
    // -- it was in `services` because nothing fitted better, which is the same
    // condition the catch-all exists to express, one section over. A reader
    // who found the menu tool is plausibly the same person who wants the pour
    // cost; a reader of `dog-walking-route-pricing` is not.
    //
    // An exact slug list rather than a prefix family, for the reason
    // `solo-earner` records: these three are named for three unrelated things
    // and no prefix catches them without stealing from a section above. A
    // `food` prefix would not catch `menu-engineering-calculator` or
    // `pour-cost-calculator` at all, and a `menu` or `pour` prefix claims
    // nothing a fourth member would inherit. The cost is that a fourth member
    // needs one line here -- which the catch-all bound will ask for anyway.
    //
    // Smallest named section at three members (`logistics` is next at seven),
    // and the honest case for it has to stand without the bound, since #4677
    // already satisfied that. Two things carry it:
    //
    // `pour-cost-calculator` gains a home that fits. It was in `services`,
    // which prices "a visit, a route, a booking, or a licence", and a pour cost
    // is none of those -- so one of these three was already mis-filed
    // regardless of what the catch-all did.
    //
    // And a hub that answers "restaurant menu pricing" or "bar pour cost" is
    // worth more to a searcher than three rows spread across "Everything else"
    // and a service-business page they have no reason to open. This catalogue's
    // measured problem is enumeration, not content (`pages_state.py`'s
    // `indexing` row: sitemap auto-discovery cannot happen from a project-Pages
    // subpath), so a named hub on a high-intent phrase is the cheap half of
    // that.
    //
    // The risk in the other direction is real and worth naming: a section this
    // small is one venture away from looking arbitrary, and food/bev is a wide
    // enough niche that it should grow rather than sit at three. If it has not
    // gained a fourth member in a few months, fold it back into `services`
    // rather than defending it.
    // `commissary-kitchen-cost-split-calculator` added 2026-09-16, the fourth
    // member the comment above says to watch for. Its customer is the
    // commissary operator (or a lead tenant) billing several food trucks for
    // shared kitchen space, not a truck pricing its own food -- but the
    // reader is the same food-truck-operator audience `food-truck-event-
    // margin-calculator` already serves, one hop away as a declared sibling,
    // and no section above fits better: it is not a trade bidding a job at a
    // customer's property (`trades`), not a route/booking/licence
    // (`services`), not someone else's storefront (`marketplace`), and not
    // one person's own labour (`solo-earner`). It belongs beside the tool a
    // reader of this hub is most likely to also want.
    test: (slug) => [
      'menu-engineering-calculator',
      'food-truck-event-margin-calculator',
      'pour-cost-calculator',
      // `catering-quote-calculator` joined 2026-10-02 on its first commit: per-guest event pricing for the
      // operator who sells food, one hop from `food-truck-event-margin-calculator`.
      'catering-quote-calculator',
      // `coffee-cart-event-quote-calculator` joined 2026-10-10 on its first commit: drink-cart owners comparing a host's fee, share or guarantee,
      // the drink-cart sibling of `food-truck-event-margin-calculator`.
      'coffee-cart-event-quote-calculator',
      // `shaved-ice-stand-profit-calculator` joined 2026-10-10 on its first commit: per-cup concession stands at fairs and
      // festivals, the cold-drink sibling of `coffee-cart-event-quote-calculator`.
      'shaved-ice-stand-profit-calculator',
      // `shared-kitchen-rate-planner` joined 2026-10-07 on its first commit: commissary and shared-kitchen owners pricing
      // station-hours and memberships; the renters are the food-truck and catering operators served here, one hop away.
      'shared-kitchen-rate-planner',
      // `u-pick-farm-profit-planner` joined 2026-10-07 on its first commit: u-pick farms and pumpkin patches selling food and
      // picking to visitors, one hop from `farmers-market-booth-calculator`.
      'u-pick-farm-profit-planner',
      // `bakery-production-scheduler` joined 2026-10-07 on its first commit: bakers planning oven and prep time from
      // wholesale orders, one hop from the other food-service tools here.
      'bakery-production-scheduler',
      // `cake-pricing-calculator` joined 2026-10-10: custom cake pricing for home and small bakeries, a sibling of `bakery-production-scheduler`.
      'cake-pricing-calculator',
      // `ghost-kitchen-brand-picker` joined 2026-10-09 on its first commit: which virtual brands a delivery-only kitchen keeps under a kitchen-hours limit, beside `menu-engineering-calculator`'s per-item margins.
      'ghost-kitchen-brand-picker',
      // `cafe-drink-margin-calculator` joined 2026-10-09 on its first commit: per-drink margin for coffee shops after card fees and make-time labor, beside `menu-engineering-calculator`'s dish margins.
      'cafe-drink-margin-calculator',
      // `boba-tea-shop-profit-calculator` joined 2026-10-13 on its first commit: a leased-store pro forma (break-even cups a day with the
      // loan, delivery commission, ramp-up reserve) beside `cafe-drink-margin-calculator`'s per-drink margin.
      'boba-tea-shop-profit-calculator',
      // `pizzeria-profit-calculator` joined 2026-10-13 on its first commit: a pizzeria pro forma (break-even orders a day with the loan,
      // own-driver and delivery-app channel cost) beside `boba-tea-shop-profit-calculator`'s per-cup pro forma.
      'pizzeria-profit-calculator',
      // `ice-cream-shop-seasonal-profit-calculator` joined 2026-10-13 on its first commit: a seasonal frozen-dessert shop's twelve-month P&L and open-or-close decision per month, beside `shaved-ice-stand-profit-calculator`'s event stands and `cafe-drink-margin-calculator`'s per-drink margins.
      'ice-cream-shop-seasonal-profit-calculator',
      // `daily-prep-quantity-optimizer` joined 2026-10-09 on its first commit: how many to make, beside `bakery-production-scheduler`'s when to bake.
      'daily-prep-quantity-optimizer',
      // `brewery-tank-schedule-optimizer` joined 2026-10-09 on its first commit: when and where each batch goes, beside `craft-brewery-batch-margin-calculator`'s profit per barrel.
      'brewery-tank-schedule-optimizer',
      // `fitness-studio-membership-calculator` joined 2026-10-09 on its first commit: member lifetime value, churn and break-even for boutique studios, beside `car-wash-membership-calculator`'s recurring-membership model.
      'fitness-studio-membership-calculator',
      // `farmers-market-booth-calculator` joined 2026-10-03 on its first commit: market vendors who sell food,
      // one hop from `food-truck-event-margin-calculator`.
      'farmers-market-booth-calculator',
      // `backyard-egg-profit-calculator` joined 2026-10-03 on its first commit: egg sellers at the same farm stands
      // and markets, one hop from `farmers-market-booth-calculator`.
      'backyard-egg-profit-calculator',
      // `backyard-honey-profit-calculator` joined 2026-10-03 on its first commit: hobby sellers at the same farm stands
      // and markets, one hop from `backyard-egg-profit-calculator`.
      'backyard-honey-profit-calculator',
      // `apiary-profit-planner` joined 2026-10-07 on its first commit: beekeepers projecting colonies, nucs and pollination
      // over several years, the sideline step up from `backyard-honey-profit-calculator`.
      'apiary-profit-planner',
      // `pollination-contract-checker` and `oyster-farm-growout-planner` joined 2026-10-10: beekeepers pricing rented hives and shellfish
      // growers planning a 12-24 month crop, same farm category, one hop from `apiary-profit-planner`.
      'pollination-contract-checker',
      'oyster-farm-growout-planner',
      // `grain-store-or-sell-calculator` joined 2026-10-11 on its first commit: row-crop farmers deciding to store or sell,
      // same farm category, one hop from `cow-calf-breakeven` style own-numbers costing.
      'grain-store-or-sell-calculator',
      // `christmas-tree-farm-profit-planner` joined 2026-10-07 on its first commit: land-based growers on the same farm
      // category, the longest-horizon sibling of `u-pick-farm-profit-planner`.
      'christmas-tree-farm-profit-planner',
      // `pastured-poultry-profit-planner` joined 2026-10-07 on its first commit: meat-bird growers on the same farm
      // category, a batch-based sibling of `sheep-goat-flock-profit-planner`.
      'pastured-poultry-profit-planner',
      // `sheep-goat-flock-profit-planner` joined 2026-10-07 on its first commit: small livestock producers at the same
      // farm stands and markets, one hop from `apiary-profit-planner`.
      'sheep-goat-flock-profit-planner',
      // `beef-cattle-ration-optimizer` joined 2026-10-07 on its first commit: cattle producers on the same farm category,
      // the feed-cost step after `sheep-goat-flock-profit-planner`.
      'beef-cattle-ration-optimizer',
      // `hay-baling-own-vs-hire-calculator` joined 2026-10-07 on its first commit: hay producers on the same farm category,
      // the buy-or-hire step beside `custom-farm-rate-calculator`.
      'hay-baling-own-vs-hire-calculator',
      // `ball-python-morph-pairing-planner` joined 2026-10-07 on its first commit: small livestock breeders selling hatchlings,
      // one hop from `backyard-egg-profit-calculator`.
      'ball-python-morph-pairing-planner',
      // `ag-spray-drone-quote-calculator` joined 2026-10-07 on its first commit: custom applicators pricing crop spraying by the acre,
      // the farm-services step next to `beef-cattle-ration-optimizer`.
      'ag-spray-drone-quote-calculator',
      // `fertilizer-blend-optimizer` joined 2026-10-07 on its first commit: row-crop, hay and garden growers on the same farm
      // category, the input-cost step beside `beef-cattle-ration-optimizer`.
      'fertilizer-blend-optimizer',
      // `vegetable-garden-planting-calendar` joined 2026-10-11 on its first commit: a home or market gardener's dated sow/transplant/harvest plan from two frost dates,
      // the calendar step beside `fertilizer-blend-optimizer` and `market-garden-bed-planner` on the same grower category.
      'vegetable-garden-planting-calendar',
      // `secret-santa-draw` joined 2026-10-11 on its first commit: a no-email gift-exchange draw for families and offices; the catch-all was at its bound,
      // so it files beside the other seasonal consumer planner on this list rather than raising it.
      'secret-santa-draw',
      // `wedding-day-timeline-builder` joined 2026-10-11 on its first commit: couples, planners and photographers building the day-of schedule with sunset worked out,
      // the scheduling step beside `wedding-photographer-profit-calculator` and `bridal-hair-makeup-pricing-calculator` on the same wedding category.
      'wedding-day-timeline-builder',
      // `farm-crop-mix-optimizer` joined 2026-10-09 on its first commit: growers choosing acres per crop under land, labor and capital limits,
      // the planning step before `fertilizer-blend-optimizer` on the same row-crop farm.
      'farm-crop-mix-optimizer',
      // `food-truck-prep-mix-optimizer` joined 2026-10-09 on its first commit: truck and pop-up operators choosing portions per item under prep,
      // station and cash limits, the per-service step beside `food-truck-event-margin-calculator`.
      'food-truck-prep-mix-optimizer',
      // `farmland-lease-cash-rent-vs-crop-share-calculator` joined 2026-10-08 on its first commit: landowners and operators negotiating a farm lease
      // sit beside `custom-farm-rate-calculator` and `fertilizer-blend-optimizer`, the same row-crop farm job.
      'farmland-lease-cash-rent-vs-crop-share-calculator',
      // `crop-insurance-coverage-calculator` joined 2026-10-08 on its first commit: the insurance side of the same farm, beside the lease.
      'crop-insurance-coverage-calculator',
      // `sba-loan-capacity-calculator` joined 2026-10-07 on its first commit: owners sizing a bank or SBA term loan from cash
      // flow, the pre-application step before `business-loan-offer-comparator`.
      'sba-loan-capacity-calculator',
      // `franchise-unit-economics-calculator` joined 2026-10-08 on its first commit: a buyer sizing the cash, loan and payback of a franchise
      // unit sits beside `sba-loan-capacity-calculator` and `business-loan-offer-comparator`, the same fund-a-business-purchase job.
      'franchise-unit-economics-calculator',
      // `franchise-item-19-reality-check` joined 2026-10-12 on its first commit: the franchisor's earnings claim read before the buyer's own cash plan,
      // beside `franchise-unit-economics-calculator`.
      'franchise-item-19-reality-check',
      // `convenience-store-gas-station-profit-calculator` joined 2026-10-13 on its first commit: an independent c-store or gas station owner or buyer sizing fuel margin after card fees,
      // inside sales and debt coverage sits beside `franchise-unit-economics-calculator` and `sba-loan-capacity-calculator`, the same run-or-buy-a-store job.
      'convenience-store-gas-station-profit-calculator',
      // `dry-cleaner-profit-calculator` joined 2026-10-13 on its first commit: a plant owner or buyer sizing break-even pieces and debt coverage sits beside
      // `convenience-store-gas-station-profit-calculator` and `franchise-unit-economics-calculator`, the same run-or-buy-a-store job.
      'dry-cleaner-profit-calculator',
      // `microgreens-tray-planner` joined 2026-10-06 on its first commit: growers who sell at the same markets and
      // restaurants, one hop from `backyard-honey-profit-calculator`.
      'microgreens-tray-planner',
      // `hydroponic-farm-profit-calculator` joined 2026-10-12 on its first commit: an indoor or hydroponic grower sizing a build, selling
      // at the same restaurants and markets, one hop from `microgreens-tray-planner`.
      'hydroponic-farm-profit-calculator',
      // `kombucha-brewery-profit-calculator` joined 2026-10-13 on its first commit: a brewer selling drink by the gallon, one hop from
      // `craft-brewery-batch-margin-calculator` and `cafe-drink-margin-calculator`.
      'kombucha-brewery-profit-calculator',
      // `maple-syrup-sugarbush-profit-calculator` joined 2026-10-07 on its first commit: producers selling syrup at the
      // same farm stands and markets, one hop from `backyard-honey-profit-calculator`.
      'maple-syrup-sugarbush-profit-calculator',
      // `craft-brewery-batch-margin-calculator` joined 2026-10-07 on its first commit: a brewery sells drink by the
      // pint, keg and can; the same operator reader as `pour-cost-calculator`, one hop away.
      'craft-brewery-batch-margin-calculator',
      // `brewery-excise-tax-calculator` joined 2026-10-10 on its first commit: the federal tax built into every keg and case,
      // beside the batch margin that has to absorb it.
      'brewery-excise-tax-calculator',
      // `distillery-excise-tax-calculator` joined 2026-10-10 on its first commit: the spirits sibling of the brewery tax tool,
      // proof-gallon math and the $2.70 / $13.34 CBMA tiers.
      'distillery-excise-tax-calculator',
      // `winery-excise-tax-calculator` joined 2026-10-10 on its first commit: the wine and cider sibling of the brewery and
      // distillery tax tools, wine-gallon math and the CBMA credit tiers.
      'winery-excise-tax-calculator',
      // `mobile-bartender-event-quote` joined 2026-10-03 on its first commit: per-event bar service pricing,
      // one hop from `pour-cost-calculator` and `catering-quote-calculator`.
      'mobile-bartender-event-quote',
      'commissary-kitchen-cost-split-calculator',
      // `restaurant-pos-menu-mix-analyzer` added 2026-09-29: the POS-export
      // sibling of `menu-engineering-calculator`, same owner reading the same
      // matrix. The `restaurant-delivery-commission` prefix is the marketplace
      // section's, so this slug is listed by name.
      'restaurant-pos-menu-mix-analyzer',
      // `restaurant-labor-cost-daypart-analyzer` added 2026-09-29: the labor
      // half of the restaurant owner's cost picture, next to the menu tools.
      'restaurant-labor-cost-daypart-analyzer',
      // `dining-room-table-mix-optimizer` joined 2026-10-09 on its first commit: the seating half of the same owner's room, beside the
      // labor and menu tools above.
      'dining-room-table-mix-optimizer',
      // `shift-cover-optimizer` added 2026-09-30: plans the shifts forward from
      // an hourly need; same reader as the labor daypart analyzer above.
      'shift-cover-optimizer',
      // `shift-roster-builder` joined 2026-10-01 on its first commit: assigns named
      // people to the shifts `shift-cover-optimizer` sizes; the same owner, next door.
      'shift-roster-builder',
      // `weekly-staff-schedule-maker` joined 2026-10-12 on its first commit: a rules-checked weekly rota solver (roles, rest, fair hours);
      // the same owner as the shift tools above.
      'weekly-staff-schedule-maker',
      // `shift-rotation-schedule-generator` joined 2026-10-12 on its first commit: fixed-rotation (Pitman, DuPont, 24/48) calendars for the crews
      // whose rosters the shift tools above build week by week.
      'shift-rotation-schedule-generator',
      // `fair-workweek-schedule-checker` joined 2026-10-11 on its first commit: checks the schedule the shift tools above build against
      // predictive-scheduling law; the same restaurant and retail owner.
      'fair-workweek-schedule-checker',
      // `ca-meal-rest-break-premium-checker` joined 2026-10-12 on its first commit: the other California-style wage claim the same
      // restaurant and retail owner hits, meal and rest break premium, checked from timecards.
      'ca-meal-rest-break-premium-checker',
      // `flsa-regular-rate-overtime-audit` joined 2026-10-12 on its first commit: the federal overtime half of the same payroll-claim
      // exposure, regular rate with bonuses and differentials, for the same restaurant, retail and staffing owner.
      'flsa-regular-rate-overtime-audit',
      // `time-off-request-planner` joined 2026-10-01 on its first commit: decides which
      // leave requests fit a team's minimum cover; the same owner as the shift tools above.
      'time-off-request-planner',
      // `retirement-withdrawal-sequencer` joined 2026-10-01 on its first commit: whole-retirement
      // withdrawal-order comparison, beside `roth-conversion-bracket-fill-calculator`.
      'retirement-withdrawal-sequencer',
      // `production-mix-optimizer` added 2026-10-01: which products a bakery or
      // small food maker should bake when oven and labour hours run out; the
      // same owner as the menu and pour-cost tools above.
      'production-mix-optimizer',
      // `supplier-price-creep-checker` joined 2026-10-06 on its first commit: the invoice side of the restaurant
      // owner's food cost, beside `pour-cost-calculator` and `menu-engineering-calculator`.
      'supplier-price-creep-checker',
      // `restaurant-tip-pool-calculator` joined 2026-10-06 on its first commit: the payroll side of the same owner, beside
      // `tip-pool-compliance-calculator` (may we pool) -- this one splits the pool.
      'restaurant-tip-pool-calculator',
      // `tip-fica-credit-calculator` joined 2026-10-08 on its first commit: the employer-tax side of tipped payroll, the FICA credit
      // on the tips `restaurant-tip-pool-calculator` splits.
      'tip-fica-credit-calculator',
    ].includes(slug),
  },
  {
    // `water-well-drilling-bid-calculator` joined 2026-10-09 on its first commit: a small driller bidding a well is a trade bid like the ones in
    // `trades`, but that bundle is at the 3 MB ceiling (build.test.mjs) and its slug would match `bid-calculator$` there, so `trades` excludes it by name.
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
    // `atm-route-margin`, `vending-machine-route-margin` and
    // `dog-walking-route-pricing` are the same route-margin shape again: one
    // independent operator, a list of locations or clients, rolled up into
    // monthly route profit against an income goal — `fire-extinguisher`'s
    // and `pool-route`'s exact audience and job, just three more trades that
    // don't start with `pool-` either. `photo-booth-event-quote` and
    // `dumpster-rental-margin-calculator` are the booking half of the same
    // section: a solo operator pricing one event or one rental — travel,
    // setup/teardown or included allowance, equipment cost — against a flat
    // headline price that hides the real cost, same job as `booth-rent` and
    // `portable-restroom` above. All five shipped the same day and sat in
    // the catch-all for the same reason as every entry above them: no
    // keyword in this list started with their slug.
    //
    // `pour-cost-calculator` prices a menu item for a bar or restaurant
    // beverage program the same way `notary-trip-quote` prices a visit and
    // `booth-rent-vs-commission` prices a stall — a small service business
    // turning its own costs into a customer-facing price, not a trade bid, a
    // marketplace fee, or a back-office reconciliation.
    //
    // `wash-and-fold-price-calculator` joined 2026-09-10: a laundromat or
    // laundry pickup-and-delivery operator turning labour minutes, machine
    // cycles, supplies, delivery stops and overhead into a price per pound —
    // the same "what does this cost me before I quote it" job as `pour-cost`
    // above, and its delivery half is the per-stop drive-time arithmetic the
    // route members of this section already share. Listed here by exact
    // prefix rather than left in the catch-all, which is where every entry
    // above it started.
    //
    // `apparel-decoration-price-calculator` joined 2026-09-10 for the same
    // reason as `wash-and-fold` directly above: a small shop turning its own
    // labour, machine and material costs into a number it quotes a customer.
    // It is not a trade bid (nothing is priced by area or by site visit) and
    // not a marketplace fee tool. The one section that could also have
    // claimed it is `solo-earner`, which holds `3d-print-price-calculator` —
    // the tool this one is cross-linked to and the closest thing to it by
    // shape. That section groups on the *earner*, a person monetising their
    // own output, and a four-person shop quoting a corporate order is not
    // that; the axis here is a business pricing work for a customer, which is
    // what this is.
    // `cnc-machining-quote-calculator` joined 2026-09-17 on the same axis, and
    // for the same reason spelled out for `apparel-decoration` directly above:
    // a small shop turning its own labour, machine and material costs into a
    // number it quotes a customer. Nothing is priced by area or by site visit,
    // so it is not a trade bid, and no marketplace takes a cut. `trades` was
    // the near miss because `shop-rate-calculator` and `cut-list-optimizer`
    // both live there and this tool links to both — but the first exists to
    // feed trade bid calculators an hourly rate (it is upstream of this one,
    // not a peer) and the second solves a nesting problem rather than pricing
    // a job. `solo-earner` could have claimed it on the strength of
    // `3d-print-price-calculator`, the closest thing to it by shape and
    // cross-linked to it; that section groups on the *earner*, one person
    // monetising their own output, and a job shop quoting a purchase order is
    // a business pricing work for a customer instead — the identical call, on
    // the identical pair of candidates, already made for `apparel-decoration`.
    //
    // Found by enumerating the catch-all after this arrival pushed it to 6
    // rather than by judging the arrival alone, which is what
    // `build.test.mjs`'s bound asks for. Worth recording for whoever trips it
    // next, because the enumeration turned up one more that looks misfiled and
    // was left alone deliberately: `android-data-safety-check` sat in the
    // catch-all while its own `VENTURE.yaml` calls it "the direct Android-side
    // counterpart to `ios-privacy-manifest-check`", and that counterpart is
    // filed under `ci`. Moving it would have taken the catch-all to 4, but it
    // was another session's arrival from the same day and filing this one
    // restored the bound on its own, so it was noted rather than moved.
    // Moved to `ci` on 2026-09-23 (see that section's own comment) when
    // `voiceover-project-rate-calculator` needed the slot this note had been
    // holding open.
    //
    // `staffing-markup-calculator` joined 2026-09-10 and is filed here on its
    // first commit rather than after a spell in the catch-all — which is what
    // `build.test.mjs`'s catch-all bound is for, and it fired. A staffing
    // agency quoting a bill rate is a service business turning labour and its
    // own carrying costs into a price for a client: the same job as
    // `booth-rent-vs-commission` and `translator-project-quote`, and not a
    // trade bid (nothing is priced by area or a site visit), not a marketplace
    // fee, and not a back-office reconciliation — the number is quoted before
    // the work, not reconciled after it. `trades` was the near miss, because
    // `shop-rate-calculator` computes a superficially similar burden; that one
    // exists to feed the trade bid calculators an overhead rate, and this one
    // exists to price a third party's labour billed on to a client.
    // `bounce-house-rental-calculator` joined 2026-09-10 on its first commit,
    // filed here rather than left for a catch-all spell: an inflatable
    // rental operator pricing one event booking from delivery, setup labor,
    // a generator, a wet-unit attendant and fleet-value insurance is the
    // same job as `photo-booth-event-quote` and `portable-restroom` above —
    // a solo or small operator turning travel, labor and equipment cost into
    // a price against a flat per-unit headline rate that hides the real
    // cost. Not a trade bid (nothing priced by area or a site visit) and not
    // the route-margin shape (one booking, not a rolled-up monthly route).
    // `drone-mapping-job-calculator` joined 2026-09-11 on its first commit,
    // for the same reason and by the same test: a Part 107 pilot pricing one
    // mapping sortie from travel, setup, ground control, airtime and
    // processing hours is a solo operator turning labour and equipment time
    // into a quote — the same job as `photo-booth-event-quote` and
    // `commercial-photo-license-calculator`, which it links to and which
    // links back. `trades` was the near miss because it is priced by area,
    // but the resemblance stops at the word "acre": a trade bid prices work
    // *done to* a site, and this prices a flight *over* one, with the cost
    // driven by sensor geometry and an overlap specification rather than by
    // materials and crew hours on the ground. Filed here rather than left
    // for a spell in the catch-all, which the bound below exists to prevent.
    // `home-inspection-fee-calculator` joined 2026-09-11 on its first commit,
    // filed here rather than left for a catch-all spell: an independent home
    // inspector pricing one residential inspection from on-site time (driven
    // by square footage, stories, foundation access, and home age), travel,
    // and flat add-on fees (radon, sewer scope, termite/WDO, mold) is the same
    // job as `notary-trip-quote` and `drone-mapping-job-calculator` — a solo
    // professional turning time, travel, and materials/add-ons into a
    // customer-facing price, not a trade bid (nothing priced by area of
    // construction work done to the site) and not a marketplace fee.
    //
    // `childcare-tuition-calculator` and `food-truck-event-margin-calculator`
    // moved out of the catch-all here on 2026-09-13, per the same test
    // (`the catch-all holds only what no section claims`) that caught
    // `certified-payroll-calculator` and `home-inspection-fee-calculator`
    // above. `childcare-tuition-calculator` turns a classroom's own
    // child:staff ratio, staffing cost, and overhead into the tuition rate
    // it needs to charge — the same job as `pour-cost-calculator` (turning a
    // bar's own ingredient and labor cost into a menu price), just for a
    // recurring seat instead of a drink. `food-truck-event-margin-calculator`
    // prices one private event, catering, or festival booking from prep
    // time, travel, staff labor, fuel, and a one-off permit fee — the exact
    // shape `photo-booth-event-quote` and `bounce-house-rental-calculator`
    // already hold: a solo or small operator turning travel, labor, and
    // equipment cost into a price for one booking against a flat headline
    // rate that hides the real cost. Neither is a trade bid (nothing priced
    // by area or a site visit) and neither is a marketplace fee.
    //
    // `court-reporter-transcript-calculator` joined 2026-09-13, filed here on
    // its first commit rather than after a spell in the catch-all — which is
    // what `build.test.mjs`'s catch-all bound is for. A freelance court
    // reporter turning page count, turnaround speed, travel, and add-on fees
    // into a deposition invoice total is the same job as `notary-trip-quote`
    // and `translator-project-quote` — a solo professional pricing one job
    // for a client — just billed per page with a turnaround multiplier
    // instead of a flat trip or per-word fee. Not `trades` (nothing priced
    // by area or a site visit) and not a back-office reconciliation (the
    // number is invoiced for the job just done, not reconciled against a
    // prior statement).
    //
    // `process-server-fee-calculator` joined 2026-09-11 on its first commit,
    // filed here rather than left for a catch-all spell: an independent
    // process server pricing one service-of-process job from a flat base
    // fee, extra-attempt/rush/skip-trace add-ons, mileage, and their own
    // vehicle cost and time is the same job as `notary-trip-quote` (which it
    // links to) — a solo legal-support professional turning a client's flat
    // fee schedule and their own travel/time cost into an accept-or-decline
    // decision, not a trade bid and not a marketplace fee.
    //
    // `photo-addon-pricing-calculator` joined 2026-09-16 on its first commit,
    // filed here rather than left for a catch-all spell: an independent
    // wedding/event photographer pricing one package add-on (an extra hour,
    // a second shooter, an album/print upgrade, an engagement session) from
    // their own shoot/cull/edit time valued at a target hourly rate, gear
    // depreciation/wear, and any subcontractor or physical-goods cost is the
    // same job as `photo-booth-event-quote` and `commercial-photo-license-
    // calculator` (both of which it links to) — a solo photography
    // professional turning their own time and cost into a customer-facing
    // price, not a trade bid and not a marketplace fee.
    //
    // `bridal-hair-makeup-pricing-calculator` joined 2026-09-16, filed here
    // on its first commit rather than left for a catch-all spell (what
    // `build.test.mjs`'s catch-all bound is for): a mobile bridal hair and
    // makeup artist pricing one wedding-day booking from per-person service
    // tiers, an early-start fee, and mileage, then checking the booking
    // against a service minimum and the artists' own schedule capacity, is
    // the same job as `notary-trip-quote` and `photo-booth-event-quote` — a
    // solo (or small-team) service professional turning time, travel, and a
    // booking policy into a customer-facing price, not a trade bid and not a
    // marketplace fee. It shipped with a reciprocal inbound sibling link
    // from `appointment-deposit-calculator`'s first commit rather than
    // landing as a crawlable orphan to close later.
    //
    // `backflow-test-fee-calculator` joined 2026-09-16, filed here on its
    // first commit rather than left for a catch-all spell: a certified
    // backflow-preventer tester pricing a multi-device property visit from a
    // per-device test fee, a multi-device discount, a per-device filing fee,
    // travel, and a retest fee for failures is the exact same shape as
    // `fire-extinguisher-inspection-route-margin` above — a solo or small-crew
    // recurring-compliance-test business turning a device/stop list and its
    // own fee schedule into a customer-facing price. Not a trade bid (nothing
    // priced by area or a construction job) and not a marketplace fee.
    // `estate-sale-net-proceeds-calculator` joined 2026-09-17, filed here
    // rather than left for a catch-all spell: an estate-sale company applying
    // its own tiered commission schedule and fees to an estimated gross is
    // the same job as `booth-rent-vs-commission` and `staffing-markup` —
    // turning the business's own cost/fee structure into a customer-facing
    // number — and not a trade bid, a marketplace fee, or a back-office
    // reconciliation.
    // `wedding-florist-proposal-calculator` joined 2026-09-16 on its first
    // commit, filed here rather than left for a spell in the catch-all —
    // which is what `build.test.mjs`'s catch-all bound is for. A floral
    // studio pricing one event booking from flowers, hard goods, design and
    // on-site labour, and delivery is the same job as `photo-booth-event-
    // quote`, `bounce-house-rental-calculator` and `bridal-hair-makeup-
    // pricing-calculator`, which it cross-links to: a small operator turning
    // materials, labour and travel into a price for one booking. Not a trade
    // bid (nothing is priced by area or a site visit) and not a marketplace
    // fee. The near miss was `solo-earner`, which groups on a person
    // monetising their own output; a studio quoting a couple's wedding is a
    // business pricing work for a customer, the axis this section uses.
    //
    // `dog-boarding-daycare-pricing` joined 2026-09-17 on its first commit,
    // filed here rather than left for a catch-all spell (what
    // `build.test.mjs`'s catch-all bound is for): an independent boarding
    // and daycare facility pricing a reservation from staff time, supplies,
    // and overhead is the same job as `dog-walking-route-pricing`, which it
    // links to and which links back — a solo or small operator turning
    // time, materials, and overhead into a price for a customer. Not a
    // trade bid and not the route-margin shape (a facility's occupancy, not
    // a rolled-up monthly route).
    // `propane-delivery-route-margin` joined 2026-09-17 on its first commit,
    // filed here rather than left for a catch-all spell: an independent
    // propane (LP gas) delivery route operator turning one customer's
    // annual gallon volume, fill size, price spread, and fixed monthly
    // tank-rental/hazmat cost into a per-customer profit figure, then
    // rolling a customer list up into route profit, is the exact same shape
    // as `fire-extinguisher-inspection-route-margin` (which it links to and
    // which links back) — a solo or small-crew route operator turning a
    // customer/stop list and its own cost structure into route economics.
    // Not a trade bid (nothing priced by area or a construction job) and
    // not a marketplace fee.
    // `sign-language-interpreter-rate-calculator` joined 2026-09-23, filed
    // here on its first commit rather than left for a catch-all spell: a
    // freelance/contract sign language interpreter turning an assignment's
    // hours, a booking minimum, portal-to-portal travel, and an after-hours
    // differential into a customer-facing fee is the same job as
    // `notary-trip-quote` and `court-reporter-transcript-calculator` (which
    // it links to, and which links back) — a solo professional turning
    // time, travel, and a booking policy into a price. Not a trade bid
    // (nothing priced by area or a construction job) and not a marketplace
    // fee.
    // `laundromat-machine-payback-calculator` joined 2026-10-01 on its first commit: an
    // owner turning machine lines, vend prices and turns into payback months sits
    // beside `vending-machine-route-margin`.
    // `house-cleaning-quote-calculator` joined 2026-10-01 on its first commit: a cleaning
    // owner turning home size, crew pace and wages into a price floor and a discount limit
    // is the same solo-service pricing job as `dog-grooming-profit-calculator` below.
    // `dog-grooming-profit-calculator` joined 2026-10-01 on its first commit: a
    // groomer turning services, minutes, supplies and overhead into a profit per
    // hour and a price floor is the `dog-boarding-daycare-pricing` job again.
    // `rental-fleet-size-optimizer` joined 2026-10-01 on its first commit: how many
    // identical units a small rental business should own is the owner-operator
    // side of `bounce-house-rental-calculator` and `dumpster-rental-margin-
    // calculator`, which it sits beside and cross-links.
    // `league-schedule-generator` joined 2026-10-01 on its first commit: a volunteer
    // organiser turning a team list, dates and courts into a fair fixture list is
    // the same event-organiser job as `event-seating-chart-optimizer` above.
    // `driving-instructor-lesson-pricing-calculator` joined 2026-10-01 on its first commit:
    // a self-employed instructor pricing by the hour is the same solo-service job as
    // `dj-gig-profit` and `massage-therapist-profit` above.
    // `swim-lesson-pool-rental-profit-calculator` joined 2026-10-11 on its first commit: an independent swim instructor renting a pool by the hour and choosing between private, semi-private and group classes is the same solo-service pricing job as the driving instructor above.
    // `coffee-roaster-margin-calculator` joined 2026-10-01 on its first commit: a micro
    // roaster turning green price, roast loss and channel fees into a per-bag margin is
    // the same small-operator pricing job as `pour-cost-calculator` and
    // `cottage-food-pricing-calculator`.
    // `tattoo-piece-profit-calculator` joined 2026-10-01 on its first commit: an artist turning needle,
    // drawing and setup hours into a lowest price per piece is the `booth-rent` and `massage-therapist-profit` solo-service job.
    // `car-wash-membership-calculator` joined 2026-10-01 on its first commit: an owner turning plan
    // price, wash cost and member usage into break-even washes sits beside `vending-machine-route-margin`
    // and `laundromat-machine-payback-calculator`, the same recurring-revenue small-operator job.
    // `ev-charging-site-roi-calculator` joined 2026-10-09 on its first commit: a site host or operator turning ports, price and utilization into payback and NPV
    // sits beside `laundromat-machine-payback-calculator` and `car-wash-membership-calculator`, the same fixed-cost, per-use-revenue operator job.
    // `pickleball-facility-pro-forma` joined 2026-10-05 on its first commit: a facility owner turning court hours, rates, membership
    // and a ramp into a monthly P&L and break-even sits beside `car-wash-membership-calculator` and `laundromat-machine-payback-calculator`.
    // `escape-room-pricing-capacity-planner` joined 2026-10-08 on its first commit: a venue owner turning slots, price and occupancy into
    // monthly profit sits beside `pickleball-facility-pro-forma` and `car-wash-membership-calculator`, the same fixed-cost venue job.
    // `boutique-fitness-studio-pricing-planner` joined 2026-10-08 on its first commit: a studio owner's membership, pack and drop-in profit sits beside
    // `escape-room-pricing-capacity-planner` and `car-wash-membership-calculator`, the same fixed-cost venue job.
    // `waterfront-rental-season-planner` joined 2026-10-08 on its first commit: a kayak or boat livery owner's seasonal P&L, weather-day break-even
    // and fleet-size payback sit beside `fishing-charter-trip-pricing-calculator` and `rental-fleet-size-optimizer`, the same small-fleet rental job.
    // `good-faith-estimate-generator` joined 2026-10-08 on its first commit: a cash-pay practice's estimate builder sits with the other practice-economics tools here,
    // and `backoffice` is over its gzipped offline bundle bound.
    // `property-management-profit-calculator` joined 2026-10-08 on its first commit: a management company owner turning doors, fee and staffing
    // into profit and a hiring cliff sits beside `law-firm-realization-rate-calculator` and `home-care-agency-margin-calculator`, the same fee-for-service firm job.
    // `mobile-welding-job-price-calculator` joined 2026-10-08 on its first commit: a mobile welder's per-job price, drive and overrun check sits beside
    // `mobile-mechanic-visit-pricing-calculator` and `fishing-charter-trip-pricing-calculator`, the same go-to-the-customer service pricing job.
    // `volunteer-shift-scheduler` joined 2026-10-08 on its first commit: a volunteer coordinator turning availability and shift
    // needs into a fair roster is the same event-organiser job as `league-schedule-generator` and `event-seating-chart-optimizer`.
    // `sauna-cold-plunge-install-bid-calculator` joined 2026-10-08 on its first commit: a backyard sauna or cold plunge installer's bid, delivery and overrun check
    // sits beside `mobile-welding-job-price-calculator` and `pergola-bid-calculator`, the same go-to-the-customer trade pricing job.
    // `pool-service-route-calculator` joined 2026-10-03: a pool route owner's per-account true hourly, reprice/drop and route
    // density sits beside `pool-route-pricing` (same buyer, same job at route level) and `vending-machine-route-margin`.
    // `appointment-no-show-cost-calculator` joined 2026-10-08 on its first commit: a salon, clinic or vet front desk turning its schedule into a yearly
    // cost and a fee/reminder/overbooking choice is this category's buyer. It would match the `appointment-no-show` prefix in the back-office rule,
    // but that category's gzipped offline bundle was already at the 3 MB ceiling (build.test.mjs), so one more tool there fails it.
    // `home-inspection-business-profit-calculator` joined 2026-10-11 on its first commit: an inspector turning fees, drive and report hours, fall-through and fixed cost into profit per hour,
    // and weighing an associate, is the same solo-inspector job as `home-inspection-fee-calculator` one level up.
    // `home-inspection-report-builder` joined 2026-10-08 on its first commit: an inspector turning findings into a client-ready report sits beside
    // `home-inspection-fee-calculator`, the same solo-inspector professional-services job.
    // `grape-grower-sell-vs-bottle-calculator` joined 2026-10-09 on its first commit: a vineyard owner's fruit-contract-or-own-wine decision is a small
    // producer's pricing-of-their-own-output call; filed here because the food-service bundle is at the 3 MB ceiling (build.test.mjs).
    // `junk-car-buyer-offer-calculator` joined 2026-10-09 on its first commit: a scrap or salvage buyer's offer-before-towing call sits beside
    // `scrap-gold-buy-price-calculator` and `tow-truck-rate-calculator`, the same buy-at-a-price-then-resell small-operator job.
    // `lash-studio-service-profit-calculator` joined 2026-10-09 on its first commit: a lash artist's per-service take-home sits beside
    // `massage-therapist-profit-calculator` and `nail-tech-booth-rent-calculator`, the same solo appointment-service pricing job.
    // `pte-tax-election-calculator` joined 2026-10-08 on its first commit: a pass-through owner weighing a state tax election is a service-business
    // owner's pricing-of-their-own-books decision; filed here because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `commercial-lease-abstract-reader` joined 2026-10-08 on its first commit: a small-business tenant abstracting a lease into dates and clauses is a
    // service-business owner's own-books decision; filed here because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `percentage-rent-audit-checker` joined 2026-10-12 on its first commit: a tenant checking a landlord's percentage-rent statement is the same own-books decision as
    // `commercial-lease-abstract-reader`; filed beside it because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `workers-comp-audit-dispute-checker` joined 2026-10-12 on its first commit: a small employer disputing a premium audit is the same own-books decision as
    // `business-insurance-policy-reader`; filed beside it because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `business-insurance-policy-reader` joined 2026-10-12 on its first commit: a small owner checking a liability policy against a client's required limits is the same
    // own-books decision as `vendor-contract-clause-reader`; filed beside it because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `vendor-contract-clause-reader` joined 2026-10-12 on its first commit: a small buyer reading an auto-renewing vendor agreement is the same own-books
    // decision as `commercial-lease-abstract-reader`; filed beside it because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `wedding-venue-date-pricing-optimizer` joined 2026-10-09 on its first commit: a venue owner pricing dates by demand is a small-operator
    // pricing job beside `escape-room-pricing-capacity-planner`; filed here because the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `capex-budget-prioritizer` joined 2026-10-09 on its first commit: a small owner choosing which upgrades to fund sits beside the payback calculators; filed here for the same bundle-ceiling reason.
    // `appointment-no-show-analyzer` moved here from `backoffice` 2026-10-09: it is a service-business scheduling tool, and `backoffice` had crossed the 3 MB gzipped ceiling (build.test.mjs).
    // `vending-machine-planogram-optimizer` joined 2026-10-09 on its first commit: how many coils each product gets in a vending machine sits beside
    // `vending-machine-route-margin`, the same operator; filed with its sibling bundle because it is at the 3 MB ceiling (build.test.mjs).
    // `auto-detailing-service-menu-picker` joined 2026-10-09: its first commit left it in the catch-all, which sat at the bound of five (build.test.mjs); a detailing shop picking a service menu is `mobile-detailing-day-planner`'s buyer.
    // `saas-feature-packaging-optimizer` joined 2026-10-09 beside its sibling `saas-tier-price-optimizer`, same section, same reason.
    // `arcade-game-payback-calculator` joined 2026-10-12 on its first commit: an arcade or family-entertainment-center owner deciding which games to keep sits beside `amusement-route-location-calculator` and `mini-golf-course-profit-calculator`; `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `self-serve-dog-wash-profit-calculator` joined 2026-10-12 on its first commit: a would-be owner underwriting a tub-based dog wash sits beside `dog-grooming-profit` and `dog-boarding-daycare` in this section; `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `coworking-space-profit-calculator` joined 2026-10-12 on its first commit: a coworking or flex-office operator sizing a lease, a room mix and a ramp-up sits beside `boutique-fitness-studio-pricing-planner` and `climbing-gym-profit-calculator`; `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `rv-boat-storage-lot-calculator` joined 2026-10-12 on its first commit: a landowner or small investor underwriting an outdoor vehicle-storage lot sits beside `pickleball-facility` and `property-management-profit` in this section; `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `subscription-proration-calculator` joined 2026-10-12 on its first commit: billing a mid-cycle plan change for a software business sits beside `saas-tier-price-optimizer`; `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `saas-tier-price-optimizer` joined 2026-10-09 on its first commit: plan pricing for a software business sits beside `mrr-waterfall-calculator` in this
    // section, and `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `patent-maintenance-fee-planner` joined 2026-10-12 on its first commit: an inventor or small IP team docketing US maintenance-fee deadlines is a professional-services-style compliance job beside `lien-waiver-checker` and `aba-authorization-tracker`; filed here because `backoffice` is at the 3 MB ceiling and the catch-all at its bound (build.test.mjs).
    // `sales-quota-capacity-planner` joined 2026-10-12 on its first commit: a sales or RevOps leader turning a bookings target into a hiring schedule is a professional-services-style staffing-and-capacity job beside `project-staffing-margin-optimizer`; filed here because `backoffice` is at the 3 MB ceiling and the catch-all at its bound (build.test.mjs).
    // `project-staffing-margin-optimizer` joined 2026-10-09 on its first commit: an agency or consultancy owner deciding who works on which client is a
    // professional-services firm's own staffing-and-margin job beside `law-firm-realization-rate-calculator`; filed here because `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `wedding-flower-order-optimizer` joined 2026-10-09 on its first commit: a florist buying the cheapest wholesale stems for an event is the buying half of
    // `wedding-florist-proposal-calculator`, which it cross-links to; filed with it rather than in a bundle at the 3 MB ceiling (build.test.mjs).
    // `veterinary-dental-estimate-calculator` joined 2026-10-10 on its first commit: a clinic costing a procedure by grade sits beside its sibling
    // `veterinary-wellness-plan-pricing-calculator`; filed here because `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `mobile-vet-house-call-fee-calculator` joined 2026-10-10 on its first commit: a mobile vet pricing the house call beside the clinic-side `veterinary-dental-estimate-calculator`;
    // filed here because `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `grease-trap-pumping-price-calculator` joined 2026-10-10 beside `dumpster-rental-margin-calculator`: a hauler pricing a pump-out visit from drive, dump trip and disposal fee.
    // `bed-bug-heat-treatment-price-calculator` joined 2026-10-11 on its first commit beside `grease-trap-pumping-price-calculator`: a pest control operator turning heaters, clutter and warranty risk into a job price.
    // `fundraising-event-net-calculator` joined 2026-10-11 on its first commit beside `appointment-no-show-analyzer`: a nonprofit or school turning tickets, sponsors and the cost of the night into net and cost per dollar raised.
    // `ppf-ceramic-coating-price-calculator` joined 2026-10-11 on its first commit beside `bed-bug-heat-treatment-price-calculator`: a film and coating shop turning film waste, correction and bay days into a job price.
    // `paintless-dent-repair-quote-calculator` joined 2026-10-11 on its first commit beside `ppf-ceramic-coating-price-calculator`: a PDR and hail tech checking a per-dent matrix against tech time and stall days.
    // `hydroseeding-job-bid-calculator` joined 2026-10-11 on its first commit beside `ski-snowboard-tune-shop-profit-calculator`: a hydroseeding contractor turning slurry gallons, tank loads, crew hours and travel into the cost of a job and the price per 1,000 sq ft.
    // `bike-shop-repair-profit-calculator` joined 2026-10-11 on its first commit beside `ski-snowboard-tune-shop-profit-calculator`: a bike repair shop turning bench minutes, stands and rent into profit per job and a busy-season result.
    // `ski-snowboard-tune-shop-profit-calculator` joined 2026-10-11 on its first commit beside `dog-grooming-profit-calculator`: a tune shop turning bench minutes, grinder and rent into profit per tune and a season result.
    // `private-chef-service-price-calculator` joined 2026-10-11 on its first commit beside `food-truck-event-margin-calculator`: a private chef or meal-prep business turning shopping, prep, cooking and travel hours into a price per visit and per guest.
    // `pool-opening-closing-price-calculator` joined 2026-10-11 on its first commit beside `bed-bug-heat-treatment-price-calculator`: a pool service owner pricing the two seasonal visits from gallons, cover and water condition.
    // `water-damage-drying-estimate-calculator` joined 2026-10-11 on its first commit beside `grease-trap-pumping-price-calculator`: a restoration contractor turning wet area, equipment days and labour into a job invoice and margin.
    // `hoarding-cleanout-bid-calculator` joined 2026-10-11 on its first commit beside `dumpster-rental-margin-calculator`: a cleanout contractor pricing volume, crew days and containers.
    // `powder-coating-job-price-calculator` joined 2026-10-10 on its first commit beside `cnc-machining-quote-calculator`: a job shop turning labour, machine and material into a customer price.
    // `laser-cutting-engraving-job-price-calculator` joined 2026-10-10 on its first commit beside `cnc-machining-quote-calculator`: a laser shop turning sheet, machine time and labour into a customer price.
    // `therapy-8-minute-rule-calculator` joined 2026-10-10: a therapy practice turning timed minutes into billable units is a services-business job; the catch-all was at 6, over the bound of five (build.test.mjs).
    // `real-estate-photographer-shoot-profit-calculator` joined 2026-10-10 on its first commit: a listing photographer pricing packages by true hourly pay sits beside
    // `wedding-photographer-profit-calculator`; filed here because `backoffice` is at the 3 MB ceiling (build.test.mjs).
    // `private-school-tuition-discount-calculator` joined 2026-10-11 on its first commit: an independent school's business office turning sticker price and aid groups into net tuition and a discount rate, filed beside `childcare-tuition-calculator` in services.
    // `amusement-route-location-calculator` joined 2026-10-11 on its first commit beside `vending-machine-route-margin`: a coin-op route operator turning each location's take, commission, visits and miles into profit per route hour and the highest commission worth paying.
    // `climbing-gym-profit-calculator` joined 2026-10-12 on its first commit beside `trampoline-park-profit-calculator` and `pickleball-facility-pro-forma`: a prospective or new climbing or bouldering gym owner turning day passes, members, youth programs, parties, staff, route setting and rent into monthly profit, build payback, break-even members and the lowest day pass and membership fee for a target margin.
    // `axe-throwing-bar-profit-calculator` joined 2026-10-12 on its first commit beside `trampoline-park-profit-calculator` and `golf-simulator-bay-profit-calculator`: a prospective or new axe throwing bar owner turning throwers per session, sessions, fill, ticket price, private events, league players, food and drink, staff and rent into monthly profit, build payback, break-even fill and the lowest ticket for a target margin and payback.
    // `review-reply-desk` joined 2026-10-17 on its first commit: a local service business owner (restaurant, contractor, salon, dental practice) writing the public reply to a customer review; it fits no trade, marketplace or back-office section, and the catch-all bound would have fired.
    // `bowling-center-profit-calculator` joined 2026-10-13 on its first commit beside `padel-club-profit-calculator` and `trampoline-park-profit-calculator`: a would-be buyer or operator of a bowling center turning lanes, peak and off-peak prices and utilization, leagues, parties, food and bar, staff and rent into monthly profit, break-even utilization and ramp-up cash.
    // `padel-club-profit-calculator` joined 2026-10-13 on its first commit beside `pickleball-facility-pro-forma` and `golf-simulator-bay-profit-calculator`: a prospective or new padel club owner turning courts, peak and off-peak prices and utilisation, members, coaching, food and drink, staff and rent into monthly profit, break-even utilisation and ramp-up cash.
    // `indoor-play-center-profit-calculator` joined 2026-10-13 on its first commit beside `trampoline-park-profit-calculator` and `kids-birthday-party-package-profit-calculator`: an indoor playground or soft-play cafe owner turning weekday and weekend visits, memberships, parties, cafe spend, staff hours and rent into monthly profit, break-even visits and ramp-up cash.
    // `trampoline-park-profit-calculator` joined 2026-10-12 on its first commit beside `kids-birthday-party-package-profit-calculator` and `golf-simulator-bay-profit-calculator`: a prospective or new trampoline park or family entertainment center owner turning jumper capacity, sessions, fill, ticket price, parties, members, staff and rent into monthly profit, build payback, break-even fill and the lowest ticket for a target margin and payback.
    // `ebike-rental-fleet-profit-calculator` joined 2026-10-12 on its first commit beside `boat-rental-fleet-profit-calculator`: a bike shop, hotel or campground owner turning bikes, busy and quiet days, utilization, half-day and full-day prices and staff into season profit, payback, break-even utilization and the lowest prices.
    // `golf-simulator-bay-profit-calculator` joined 2026-10-12 on its first commit beside `pickleball-facility-pro-forma` and `escape-room-pricing-capacity-planner`: a prospective or new indoor golf simulator lounge owner turning bays, peak and off-peak rates and utilization, members, food and drink, staff and rent into monthly profit, build payback, break-even utilization and the lowest rates for a target margin.
    // `mini-golf-course-profit-calculator` joined 2026-10-12 on its first commit beside `golf-simulator-bay-profit-calculator` and `trampoline-park-profit-calculator` here: a per-round, seasonal, weather-exposed fun-center pro forma is the same buyer as those two.
    // `pilot-car-escort-run-profit-calculator` joined 2026-10-12 on its first commit beside `tow-truck-rate-calculator` and `party-bus-charter-profit-calculator`: a pilot car or oversize-load escort operator turning a per-mile or day quote, minimum charge, deadhead, hours and overhead into true profit per run, the lowest quote for a target margin and break-even runs.
    // `event-rental-inventory-payback-calculator` joined 2026-10-12 on its first commit beside `tent-rental-job-profit-calculator`: a party and event rental owner ranking chairs, tables, linens and floors by payback and return to decide what to buy next.
    // `kids-birthday-party-package-profit-calculator` joined 2026-10-12 on its first commit beside `bounce-house-rental-calculator`: a trampoline park, bounce gym or play cafe owner turning a party package price, children, host hours, food, the open-play margin given up and yearly rent into true profit per party, profit per room hour and the lowest package price for a target margin.
    // `party-bus-charter-profit-calculator` joined 2026-10-12 on its first commit beside `tent-rental-job-profit-calculator`: a party bus, limo or shuttle operator turning a quote, minimum hours, deadhead, miles and vehicle cost into true profit per charter, the lowest quote for a target margin and vehicle payback.
    // `tent-rental-job-profit-calculator` joined 2026-10-12 on its first commit beside `photo-booth-event-quote` and `mobile-bartender-event-quote`: a tent and party rental owner turning a quote, crew hours, truck and tent cost into true profit per job, the lowest quote for a target margin and tent payback.
    // `lawn-aeration-overseeding-bid-calculator` joined 2026-10-12 on its first commit beside `hydroseeding-job-bid-calculator` and `pool-opening-closing-price-calculator`: a lawn-care operator turning turf area, aerator passes, seed and crew into true profit per job, the lowest quote for a target margin and price per 1,000 sq ft.
    // `courier-van-route-profit-calculator` joined 2026-10-12 on its first commit beside `mobile-oil-change-route-profit-calculator` and `propane-delivery-route-margin`: an independent delivery van contractor turning route pay, stops, miles and van costs into true profit per route, per hour and per stop and the lowest route pay worth taking.
    // `yoga-pilates-studio-class-profit-calculator` joined 2026-10-11 on its first commit: a boutique studio owner turning classes, attendance, the price mix and teacher pay into profit per class and room hour sits beside `boutique-fitness-studio-pricing-planner` and `music-teacher-studio-profit-calculator`, the same small-studio owner job.
    // `laundromat-acquisition-offer-calculator` joined 2026-10-11 on its first commit beside `laundromat-machine-payback-calculator`: a buyer turning a laundromat's revenue and costs into a walk-away price.
    test: (slug) =>
      /^(youth-lineup-rotator|local-site-studio|review-reply-desk|bowling-center-profit-calculator|padel-club-profit-calculator|pet-boarding-daycare-profit-calculator|arcade-game-payback-calculator|self-serve-dog-wash-profit-calculator|coworking-space-profit-calculator|rv-boat-storage-lot-calculator|subscription-proration-calculator|patent-maintenance-fee-planner|sales-quota-capacity-planner|climbing-gym-profit-calculator|trampoline-park-profit-calculator|golf-simulator-bay-profit-calculator|mini-golf-course-profit-calculator|ebike-rental-fleet-profit-calculator|pilot-car-escort-run-profit-calculator|event-rental-inventory-payback-calculator|kids-birthday-party-package-profit-calculator|indoor-play-center-profit-calculator|lawn-aeration-overseeding-bid-calculator|party-bus-charter-profit-calculator|tent-rental-job-profit-calculator|courier-van-route-profit-calculator|laundromat-acquisition-offer-calculator|amusement-route-location-calculator|private-school-tuition-discount-calculator|mobile-oil-change-route-profit-calculator|boat-rental-fleet-profit-calculator|mobile-phlebotomy-route-profit-calculator|music-teacher-studio-profit-calculator|yoga-pilates-studio-class-profit-calculator|freelance-project-picker|swim-lesson-pool-rental-profit-calculator|home-inspection-business-profit-calculator|hydroseeding-job-bid-calculator|bike-shop-repair-profit-calculator|ski-snowboard-tune-shop-profit-calculator|fundraising-event-net-calculator|therapy-8-minute-rule-calculator|real-estate-photographer-shoot-profit-calculator|auto-detailing-service-menu-picker|saas-feature-packaging-optimizer|saas-tier-price-optimizer|pto-accrual-liability-calculator|wedding-flower-order-optimizer|project-staffing-margin-optimizer|appointment-no-show-analyzer|vending-machine-planogram-optimizer|capex-budget-prioritizer|childcare-enrollment-mix-optimizer|wedding-venue-date-pricing-optimizer|water-well-drilling-bid-calculator|sign-shop-job-pricing-calculator|medical-billing-pricing-calculator|ghostwriter-book-quote-calculator|gift-vs-inherit-basis-calculator|qcd-calculator|fbar-8938-checker|niit-calculator|sbir-budget-builder|401k-loan-vs-withdrawal-calculator|529-to-roth-rollover-calculator|speaker-fee-calculator|nanny-tax-calculator|recipe-costing-calculator|real-estate-professional-status-calculator|bonus-take-home-gross-up-calculator|pte-tax-election-calculator|appointment-no-show-cost-calculator|aba-authorization-tracker|h1b-weighted-lottery-odds-calculator|rent-increase-notice-checker|tenant-security-deposit-deadline-checker|pay-application-generator|lien-waiver-checker|medicaid-lookback-penalty-calculator|injury-settlement-net-proceeds-calculator|employment-contract-checker|worker-classification-checker|freelance-contract-checker|freelance-proposal-maker|nua-employer-stock-calculator|exemption-certificate-audit-check|insurance-commission-reconciler|mrr-waterfall-calculator|hoa-reserve-fund-calculator|pickleball-facility|property-management-profit|mobile-welding-job-price|sauna-cold-plunge-install-bid-calculator|good-faith-estimate|collision-shop-drp|escape-room-pricing|boutique-fitness-studio|waterfront-rental-season|car-wash-membership|law-firm-realization-rate-calculator|laundromat-machine-payback|ev-charging-site-roi|home-care-agency|childcare-center-break-even|booth-rent|commercial-photo-license|notary-trip|mobile-signing-agent|pool-route|pool-service-route|fishing-charter-trip-pricing|portable-restroom|translator-project|fire-extinguisher-inspection|atm-route-margin|vending-machine-route|dog-walking-route|dog-boarding-daycare|dog-grooming-profit|tattoo-piece-profit|massage-therapist-profit|dj-gig-profit|band-tour-profit|driving-instructor-lesson-pricing|wedding-photographer-profit|wedding-videographer-profit|photo-booth-event-quote|dumpster-rental-margin|pour-cost|wash-and-fold|apparel-decoration|embroidery-shop-quote|screen-print-job-quote|sports-official-game-fee|powder-coating-job-price|grease-trap-pumping-price|hoarding-cleanout-bid|bed-bug-heat-treatment-price|ppf-ceramic-coating-price|paintless-dent-repair-quote|water-damage-drying-estimate|laser-cutting-engraving-job-price|cnc-machining-quote|staffing-markup|bounce-house-rental|drone-mapping-job|home-inspection-fee|home-inspection-report-builder|childcare-tuition|food-truck-event-margin|court-reporter-transcript|process-server-fee|photo-addon-pricing|bridal-hair-makeup|backflow-test-fee|estate-sale-net-proceeds|wedding-budget-allocator|wedding-florist-proposal|propane-delivery-route|sign-language-interpreter-rate|client-rebooking|rental-fleet-size|event-seating-chart|league-schedule|volunteer-shift-scheduler|coffee-roaster-margin|house-cleaning-quote|str-turnover-crew|process-server-day|appraisal-assignment|translation-job|tax-season-client|interior-design-fee|nail-tech-booth-rent|birth-doula-package|pet-sitting-platform-fee|dog-grooming-price|farrier-visit|pet-waste-removal-route|private-pilot-training-cost|wedding-officiant-fee|cdl-school-payback|mobile-mechanic-visit|fishing-charter|horse-boarding-stall-profit|tutor-effective-hourly-rate|campground-site-profit|mobile-detailing-day-planner|fishing-crew-share-settlement|scrap-gold-buy-price|pawn-loan-profit|junk-car-buyer-offer|grape-grower-sell-vs-bottle|adjunct-course-offer-calculator|lash-studio-service-profit-calculator|optical-dispensary-margin-calculator|hearing-aid-dispensing-margin-calculator|provider-credentialing-delay-cost-calculator|independent-pharmacy-rx-margin-calculator|veterinary-wellness-plan-pricing-calculator|veterinary-dental-estimate-calculator|mobile-vet-house-call-fee-calculator|demand-charge-interval-analyzer|dental-patient-financing-fee-calculator|pool-opening-closing-price-calculator|private-chef-service-price-calculator)/.test(
        slug,
      ),
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
    // `ifta-` is the quarterly fuel tax return the carriers behind
    // `owner-operator-cpm-calculator` and `freight-accessorial-auditor` file
    // four times a year — same desk, same audience, and the three tools link
    // to each other. Named explicitly rather than folded into a wider pattern
    // because the slug starts with an acronym no other rule here would guess.
    //
    // `vector-db-` joined 2026-09-17, found by enumerating the catch-all
    // rather than judging the arrival that tripped `build.test.mjs`'s
    // bound alone (that arrival was `tutor-package-pricing-calculator`,
    // which belongs nowhere near this section — see `solo-earner` below).
    // `vector-db-cost-calculator` sizes a storage/query cost decision
    // before committing to a vendor, the same "size a transfer window
    // before you sign for it" shape this section's own blurb already
    // names — it is `cloud-egress-calculator`'s direct sibling (both are
    // bring-your-own-rates infrastructure cost estimators, and the two
    // pages already cross-link each other as Related), just for a
    // different resource (a vector index instead of object storage).
    //
    // `import-landed-cost` is filed here on its first commit rather than
    // after a spell in the catch-all -- what `build.test.mjs`'s catch-all
    // bound is for. It normalises a shipment's total cost (item, freight,
    // duty, MPF, HMF, broker fee) before an importer commits to an order,
    // the same "normalise a quote ... before you sign for it" shape this
    // section's own blurb already names, just for a customs entry instead
    // of a freight quote or a cloud bill.
    //
    // `equipment-auction-buyer-premium-calculator` joined 2026-09-17, filed
    // here on its first commit for the same reason as `import-landed-cost`
    // right above it rather than after a spell in the catch-all -- what
    // `build.test.mjs`'s catch-all bound is for. It normalises a hammer
    // price into its true total cost (buyer's premium, online-bidding
    // premium, card surcharge, sales tax, doc fee) before a bidder commits
    // to a bid, the same "normalise a quote ... before you sign for it"
    // shape, just for an auction lot instead of a customs entry, a freight
    // quote, or a cloud bill.
    // `parcel-dim-weight` is filed here on its first commit rather than after a
    // spell in the catch-all -- what `build.test.mjs`'s catch-all bound is for.
    // It is `ltl-`'s direct counterpart one tier down: the same shipper asking
    // the same question ("what will this actually be billed at, and can the
    // packaging move it?") about a parcel instead of a pallet, answered with a
    // DIM divisor instead of a density band. The two pages cross-link each
    // other as the place to go when a shipment crosses that line, which closes
    // the crawlable-orphan gap a new venture otherwise opens. Named by exact
    // slug prefix rather than folded into a wider pattern, for the same reason
    // as its neighbours here.
    // `parcel-late-delivery-refund` is filed here on its first commit: it reads
    // the same shipper's carrier report after the parcel has shipped and audits
    // what was billed for it, `freight-accessorial-auditor`'s parcel-tier
    // counterpart and `parcel-dim-weight`'s after-the-fact partner (the two
    // cross-link).
    // `route-stop-optimizer` added 2026-09-30: orders a day's stops to cut drive
    // time, the same reader as the owner-operator and courier tools here.
    // `shipping-box-size-optimizer` joined 2026-10-01 on its first commit: it is
    // `parcel-dim-weight`'s assortment-level partner (which set of cartons to
    // stock, rather than what one carton bills at), and the two cross-link.
    // `container-load-planner` joined 2026-10-01 on its first commit: it packs the
    // cartons and pallets into a container or truck, the same shipper as the box
    // optimizer above, and the two cross-link.
    // `fleet-ev-vs-diesel-tco-calculator` joined 2026-10-08 on its first commit: a small fleet's electric-vs-diesel cost sits beside
    // `fleet-repair-or-replace-planner` and `ifta-`, the same vehicle-fleet operating-cost job.
    // `warehouse-slotting-optimizer` joined 2026-10-09 on its first commit: where each SKU sits on a small warehouse's shelves decides the walk, beside the box and container planners.
    // `self-storage-unit-mix-optimizer` joined 2026-10-09 on its first commit: a storage owner sizing a building's unit mix is a warehousing-space
    // decision beside the 3PL and freight tools; filed here because the catch-all is at its bound and the back-office bundle is over the 3 MB ceiling (build.test.mjs).
    // `car-hauler-load-planner` joined 2026-10-09 on its first commit: an auto-transport owner-operator choosing which vehicles share a trailer, beside `owner-operator` and `truck-detention`.
    // `scrap-metal-yard-payout-calculator` joined 2026-10-12 on its first commit beside `equipment-auction-buyer-premium-calculator`: a scrapper, electrician or demolition crew netting a hauled load at two yards after fuel, time and fees, with a strip-or-sell wire check.
    test: (slug) => /^(scrap-metal-yard-payout-calculator|lcl-vs-fcl-container|fuel-surcharge-schedule|lumper-fee-reimbursement|car-hauler-load-planner|fleet-ev-vs-diesel|self-storage-unit-mix-optimizer|3pl|freight|cloud-egress|ifta-|form-2290-hvut|ucr-fee|invoice-factoring|hos-trip-planner|ltl-|owner-operator|truck-detention|medical-courier|vector-db|import-landed-cost|equipment-auction-buyer-premium|parcel-dim-weight|parcel-late-delivery-refund|tow-motor-club|tow-truck-rate|mobile-tire-van|route-stop-optimizer|shipping-box-size|container-load-planner|container-demurrage-detention-calculator|warehouse-slotting-optimizer)/.test(
      slug,
    ),
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
    // `vpat-acr-generator` joined 2026-09-11, filed here on its first commit
    // rather than after a spell in the catch-all -- what `build.test.mjs`'s
    // catch-all bound is for. It assembles a dated Accessibility Conformance
    // Report from the vendor's own self-reported testing, this section's
    // exact "produce a dated record of what you checked" job -- the same
    // evidence-record shape as `shopify-a11y-evidence` and
    // `real-estate-agent-photo-app` right above, just for a software
    // vendor's procurement bid instead of a merchant's theme or a listing
    // photo set. Slug ends in neither `-evidence` nor any suffix above, and
    // starts with `vpat`, which none of the prefixes above would guess.
    //
    // `pdf-accessibility-tag-check` joined 2026-09-16, filed here on its
    // first commit rather than after a spell in the catch-all -- what
    // `build.test.mjs`'s catch-all bound is for. Its buyer and evidence
    // posture match this section exactly ("3 of N automatable checks did
    // not pass -- here is each one", never "this PDF is compliant"), the
    // same as `shopify-a11y-evidence` and `vpat-acr-generator` right above:
    // a dated accessibility-structure record a government or university
    // webmaster hands to whoever remediates the file, not a determination
    // this tool made on their behalf. Not `ci`, even though it also ships a
    // matching CLI: that section's buyer is a developer auditing their own
    // supply chain, not a compliance record for a document library. Slug
    // ends in `-check`, not any suffix above, and starts with `pdf`, which
    // none of the prefixes above would guess.
    // `call-recording-consent-check` joined 2026-09-17, filed here on its
    // first commit rather than after a spell in the catch-all -- what
    // `build.test.mjs`'s catch-all bound is for. Its posture is this
    // section's blurb almost verbatim: it reports a state's default
    // call-recording consent classification and a conservative interstate
    // reading -- an observation the caller acts on -- and says explicitly,
    // on every page, that it is not a legal determination for their
    // specific call. Not `ci`, even though it also ships a matching CLI:
    // that section's buyer is a developer auditing their own supply chain
    // or workflow file, not a sales/support/recruiting team checking a
    // consent rule before a call. Not `services`: nothing here prices a
    // visit, route, or booking for a customer. Slug ends in `-check`, not
    // any suffix above, and starts with `call-`, which none of the
    // prefixes above would guess.
    // `1099-k-threshold-checker` joined 2026-09-17, filed here on its first
    // commit rather than after a spell in the catch-all -- which is what
    // `build.test.mjs`'s catch-all bound is for. It is the payee-side twin
    // of `1099-vendor-tracker` right above (also filed here, via the
    // `tracker$` suffix): that one screens whether the *payer* owes a
    // 1099-NEC, this one screens whether the *payee* will receive a
    // 1099-K, and both are the same "produce a dated record of what you
    // checked" job this section's own blurb names. Not `backoffice`, where
    // its sibling `1099k-reconciliation-worksheet` sits: that tool
    // reconciles a 1099-K already received down to net profit (money
    // already in hand), while this one answers whether a form is coming at
    // all (before it exists) -- the same forward-looking-check-vs-
    // after-the-sale-reconciliation distinction that keeps the two
    // `1099-vendor-tracker`/`1099k-reconciliation-worksheet` siblings in
    // different sections already. Slug ends in `-checker`, not any suffix
    // this rule already catches, so it is added by exact match rather than
    // widening the suffix list to a word this is the only user of.
    // `osha-trir-dart-calculator` joined 2026-09-23, filed here on its
    // first commit rather than after a spell in the catch-all -- what
    // `build.test.mjs`'s catch-all bound is for. Its posture matches this
    // section's blurb exactly: it turns a company's own OSHA 300 log
    // counts into a TRIR/DART rate observation the safety coordinator acts
    // on, and is explicit in its disclaimer and FAQ that it never decides
    // whether a specific case is OSHA recordable or claims compliance with
    // any OSHA rule. Not `trades`, even though its buyer is often a
    // construction contractor: that section prices a bid, this one reports
    // a compliance rate, the same buyer-vs-job distinction that keeps
    // `real-estate-agent-photo-app` here rather than with the other
    // real-estate tools. Slug ends in `-calculator`, not any suffix this
    // rule already catches, so it is added by exact match rather than
    // widening the suffix list to a word this is the only user of.
    //
    // The `backup` prefix narrowed to `backup-verification` on 2026-09-24,
    // when `backup-file-exposure-check` graduated and `categoryFor` swept
    // it in here on the strength of its slug alone -- it is the `git-
    // exposure-check`/`dotenv-exposure-check` "read what's actually there,
    // name the exact evidence" checker family filed under `ci` below, not a
    // compliance evidence record, and this category's own test ran before
    // that one's and won on prefix order. `backup-verification-evidence`
    // is still the only venture the narrower prefix needs to reach.
    //
    // `salary-range-posting-check` joined 2026-09-24, filed here on its
    // first commit rather than after a spell in the catch-all -- what
    // `build.test.mjs`'s catch-all bound is for. It is the same shape as
    // `call-recording-consent-check` right above: a US-jurisdiction legal
    // reference table plus a text scan, with every page stating it is not
    // legal advice and not a compliance determination -- this section's
    // exact "produce a dated observation you act on, never a determination
    // made on your behalf" posture. Slug ends in `-check`, which the `ci`
    // category's own rule does not claim (that rule is an explicit prefix
    // list, not a `-check$` suffix), so it is added here by prefix rather
    // than widening any suffix rule to a word this is the only user of.
    //
    // `final-paycheck-deadline-calculator` joined 2026-09-25, filed here on
    // its first commit rather than after a spell in the catch-all -- what
    // `build.test.mjs`'s catch-all bound is for. It is the same shape as
    // `call-recording-consent-check` and `salary-range-posting-check`
    // right above: a US-jurisdiction legal reference table (eleven states'
    // final-paycheck-timing statutes) applied to dates the user supplies,
    // with every page stating it does not determine which state's law
    // governs and is not a compliance determination -- this section's
    // exact "produce a dated observation you act on, never a determination
    // made on your behalf" posture. It cross-links
    // `call-recording-consent-check` as its nearest sibling (duplicate_check.py's
    // top match): both are all-state-ish employment-law reference tables
    // with the identical disclaimer posture, checking unrelated questions.
    // Not `backoffice`, where the tax/deadline calculators sit: this is a
    // legal-classification lookup with a not-a-determination disclaimer,
    // not an arithmetic conversion of figures the filer already computed.
    // Slug ends in `-calculator`, not any suffix this rule already
    // catches, so it is added by exact match rather than widening the
    // suffix list to a word this is the only user of.
    //
    // `mechanics-lien-deadline-calculator` joined 2026-09-30: a five-state (CA, TX, FL, AZ, WA) date lookup for the preliminary-notice and
    // lien-filing clocks an unpaid subcontractor faces, same not-legal-advice reference-table posture as
    // `final-paycheck-deadline-calculator` right above; added by exact slug, not a new suffix.
    //
    // `boi-reporting-exemption-checker` joined 2026-09-25, concurrently,
    // filed here on its first commit rather than after a spell in the
    // catch-all -- what `build.test.mjs`'s catch-all bound is for. Its
    // posture matches this section's blurb exactly: it applies FinCEN's
    // own August 2026 final rule to the facts entered and reports whether
    // a federal beneficial-ownership filing obligation still exists,
    // explicitly stating on every page that it is a rule-application aid
    // rather than a filing service or legal opinion -- the same shape as
    // its nearest sibling, `ny-llc-transparency-act-tracker` (filed here
    // via the `tracker$` suffix), which checks a different, state-level
    // beneficial-ownership law. Slug ends in `-checker`, not `-check`, so
    // `salary-range-posting-check`'s prefix rule does not reach it; added
    // by exact slug match, the same way `1099-k-threshold-checker` was,
    // rather than widening the suffix list to a word this is the only
    // user of.
    test: (slug) =>
      /(evidence|evidence-packet|preflight|drift|tracker|record|watch|desk)$/.test(slug)
      || /^(einvoice|backup-verification|dns|grant|shopify-a11y|shopify-permission|consent-change|cra-|public-record|repository-branch|real-estate-agent-photo|print-atelier|vpat-acr-generator|pdf-accessibility-tag-check|call-recording-consent-check|salary-range-posting-check|eu-pay-gap-report-calculator|pay-transparency-directive-checker|eu-einvoicing-mandate-checker|dac7-seller-reporting-checker|eu-platform-work-directive-checker|eu-product-liability-directive-checker|eu-whistleblower-channel-checker|eu-dora-readiness-checker|eu-espr-readiness-checker|nis2-scope-checker|eu-ai-act-risk-checker|eudr-scope-checker|cbam-cost-estimator|eaa-accessibility-act-checker|eu-data-act-checker|gpsr-product-safety-checker|eu-battery-regulation-checker|eu-packaging-regulation-checker|eu-green-claims-checker|eu-green-claims-copy-scanner|eu-csrd-scope-checker|eu-dsa-obligations-checker|eu-price-reduction-claim-checker)/.test(slug)
      || slug === '1099-k-threshold-checker'
      || slug === 'osha-trir-dart-calculator'
      || slug === 'final-paycheck-deadline-calculator'
      // `paid-sick-leave-accrual-calculator` joined 2026-10-13: a 14-state employment-law reference table (accrual, caps, size thresholds) with the same
      // not-legal-advice posture as `final-paycheck-deadline-calculator`; added by exact slug beside it.
      || slug === 'paid-sick-leave-accrual-calculator'
      // `employer-payroll-tax-cost-calculator` joined 2026-10-13: federal payroll-tax arithmetic plus editable state unemployment presets with a not-tax-advice posture; exact slug.
      || slug === 'employer-payroll-tax-cost-calculator'
      // `retirement-plan-startup-credit-calculator` joined 2026-10-13: SECURE 2.0 credit arithmetic from published Form 8881 rules with a not-tax-advice posture; exact slug.
      || slug === 'retirement-plan-startup-credit-calculator'
      || slug === 'mechanics-lien-deadline-calculator'
      || slug === 'boi-reporting-exemption-checker'
      // `hubspot-contacts-csv-check` joined 2026-10-04: a list preflight that reports what it found with line numbers and an explicit not-checked list, and
      // `backoffice` is already over its gzipped offline bundle bound, so it cannot take another page.
      || slug === 'hubspot-contacts-csv-check'
      // `salesforce-lead-import-csv-check` joined 2026-10-04: the Salesforce half of the CRM import pre-flight above, filed beside it for the same bundle-bound reason.
      || slug === 'salesforce-lead-import-csv-check'
      // `pipedrive-import-csv-check` joined 2026-10-04: the Pipedrive (deals, people, organizations) half of the same CRM import pre-flight.
      || slug === 'pipedrive-import-csv-check'
      // `zoho-crm-import-csv-check` joined 2026-10-04: the Zoho CRM (leads, contacts, accounts, deals) half of the same CRM import pre-flight.
      || slug === 'zoho-crm-import-csv-check'
      // `activecampaign-import-csv-check` joined 2026-10-04: the ActiveCampaign (contacts, accounts, deals) half of the same import pre-flight.
      || slug === 'activecampaign-import-csv-check'
      // `klaviyo-profile-csv-check` joined 2026-10-04: the Klaviyo (email/SMS marketing profiles) member of the same import pre-flight family.
      || slug === 'klaviyo-profile-csv-check'
      // `google-ads-editor-csv-check` joined 2026-10-04: the Google Ads Editor (campaigns, keywords, responsive search ads) member of the same import pre-flight family.
      || slug === 'google-ads-editor-csv-check'
      // `mailchimp-audience-csv-check` joined 2026-10-04: the Mailchimp (email audience contacts) member of the same import pre-flight family.
      || slug === 'mailchimp-audience-csv-check'
      // `payroll-hours-csv-check` joined 2026-10-04: the payroll hours sheet member of the same file pre-flight family.
      || slug === 'payroll-hours-csv-check'
      // `gbp-bulk-location-check` joined 2026-10-04: a Google Business Profile bulk-location spreadsheet pre-flight, the same line-numbered findings and explicit not-checked list as the import pre-flights above, filed beside them for the same reason.
      || slug === 'gbp-bulk-location-check'
      // `meta-catalog-csv-check` joined 2026-10-05: a Meta (Facebook and Instagram) catalog feed pre-flight, the same line-numbered findings and explicit not-checked list as the import pre-flights above, filed beside them for the same reason.
      || slug === 'meta-catalog-csv-check'
      // `redirect-map-check` joined 2026-10-05: a site-migration redirect map pre-flight, the same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them for the same bundle-bound reason.
      || slug === 'redirect-map-check'
      // `internal-link-planner` joined 2026-10-16: a site-structure audit for the same technical-SEO audience, filed beside `redirect-map-check` rather than in the catch-all.
      || slug === 'internal-link-planner'
      // `brevo-contacts-csv-check` joined 2026-10-05: the Brevo (email + SMS contacts) member of the same import pre-flight family.
      || slug === 'brevo-contacts-csv-check'
      // `gtin-list-check` joined 2026-10-05: a product-list barcode pre-flight, the same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them for the same bundle-bound reason.
      || slug === 'gtin-list-check'
      // `iban-list-check` joined 2026-10-05: a supplier/payroll bank-detail pre-flight, the same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them.
      || slug === 'iban-list-check'
      // `ics-calendar-check` joined 2026-10-05: an iCalendar file pre-flight, the same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them for the same bundle-bound reason.
      || slug === 'ics-calendar-check'
      // `gpx-track-check` joined 2026-10-05: a GPX track file pre-flight, filed beside the other file pre-flights for the same bundle-bound reason.
      || slug === 'gpx-track-check'
      // `vcard-contacts-check` joined 2026-10-05: a vCard contacts-file pre-flight, same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them.
      || slug === 'vcard-contacts-check'
      // `ofx-file-check` joined 2026-10-05: a bank-export (OFX/QFX) pre-flight, same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them.
      || slug === 'ofx-file-check'
      // `qif-file-check` joined 2026-10-05: the QIF half of the bank-export pre-flights above (no transaction ID, no declared date order), same line-numbered findings and explicit not-checked list.
      || slug === 'qif-file-check'
      // `xero-bank-statement-csv-check` joined 2026-10-05: the statement-CSV member of the bank-export pre-flights above, same line-numbered findings and explicit not-checked list.
      || slug === 'xero-bank-statement-csv-check'
      // `camt053-to-ofx-converter` joined 2026-10-05: the conversion half of the camt.053/MT940 pair (balance check first, then OFX/QBO, QIF or Xero CSV), same line-numbered findings and explicit not-checked list.
      || slug === 'camt053-to-ofx-converter'
      // `bank-statement-pdf-to-csv` joined 2026-10-05: the PDF front end to the bank-export tools above (rows read from a statement PDF, proved against its own balances), same findings and explicit not-checked list.
      || slug === 'bank-statement-pdf-to-csv'
      // `bai2-to-ofx-converter` joined 2026-10-05: the US BAI2 counterpart of the camt.053/MT940 converter above (control-total and balance check first, then OFX/QBO, QIF or Xero CSV).
      || slug === 'bai2-to-ofx-converter'
      // `amazon-settlement-to-journal` joined 2026-10-05: the accounting-journal end of the marketplace tools (deposit check first, then a month-split Xero / QuickBooks journal), filed beside the bank-export converters above.
      || slug === 'amazon-settlement-to-journal'
      // `stripe-payout-to-journal` joined 2026-10-05: the Stripe end of the same payout-to-journal pair, filed beside it.
      || slug === 'stripe-payout-to-journal'
      // `shopify-payout-to-journal` joined 2026-10-05: the Shopify end of the same payout-to-journal set, filed beside it.
      || slug === 'shopify-payout-to-journal'
      // `etsy-statement-to-journal` joined 2026-10-05: the Etsy end of the same payout-to-journal set, filed beside it.
      || slug === 'etsy-statement-to-journal'
      // `square-sales-to-journal` joined 2026-10-05: the Square end of the same payout-to-journal set, filed beside it.
      || slug === 'square-sales-to-journal'
      // `payroll-register-to-journal` joined 2026-10-05: the payroll side of the same journal-engine family (register check, then a pay-run journal with every withholding as a liability), filed beside it.
      || slug === 'payroll-register-to-journal'
      // `ebay-payout-to-journal` joined 2026-10-05: the eBay end of the same payout-to-journal set, filed beside it.
      || slug === 'ebay-payout-to-journal'
      // `gumroad-sales-to-journal` joined 2026-10-05: the Gumroad end of the same payout-to-journal set, filed beside it.
      || slug === 'gumroad-sales-to-journal'
      // `patreon-payout-to-journal` joined 2026-10-05: the Patreon end of the same payout-to-journal set (platform and processing fees booked separately), filed beside it.
      || slug === 'patreon-payout-to-journal'
      // `ko-fi-payout-to-journal` joined 2026-10-05: the Ko-fi end of the same payout-to-journal set (income split by transaction type, fee derived), filed beside it.
      || slug === 'ko-fi-payout-to-journal'
      // `buymeacoffee-payout-to-journal` joined 2026-10-06: the Buy Me a Coffee end of the same payout-to-journal set, filed beside it.
      || slug === 'buymeacoffee-payout-to-journal'
      // `upwork-earnings-to-journal` joined 2026-10-06: the Upwork (freelancer) end of the same payout-to-journal set, filed beside it.
      || slug === 'upwork-earnings-to-journal'
      // `kdp-royalty-to-journal` joined 2026-10-06: the Amazon KDP (self-publishing) end of the same payout-to-journal set, filed beside it.
      || slug === 'kdp-royalty-to-journal'
      // `distrokid-royalty-to-journal` joined 2026-10-06: the independent-music (DistroKid) end of the same payout-to-journal set, filed beside it.
      || slug === 'distrokid-royalty-to-journal'
      // `fiverr-earnings-to-journal` joined 2026-10-06: the Fiverr (freelancer marketplace) end of the same payout-to-journal set, filed beside it.
      || slug === 'fiverr-earnings-to-journal'
      // `teachable-payout-to-journal` joined 2026-10-06: the Teachable (course creator) end of the same payout-to-journal set, filed beside it.
      || slug === 'teachable-payout-to-journal'
      // `youtube-adsense-payout-to-journal` joined 2026-10-06: the YouTube AdSense end of the same payout-to-journal set (US withholding receivable, realised FX), filed beside it.
      || slug === 'youtube-adsense-payout-to-journal'
      // `lemonsqueezy-payout-to-journal` joined 2026-10-05: the Lemon Squeezy end of the same payout-to-journal set, filed beside it.
      || slug === 'lemonsqueezy-payout-to-journal'
      // `paddle-payout-to-journal` joined 2026-10-05: the Paddle (merchant-of-record SaaS) end of the same payout-to-journal set, filed beside it.
      || slug === 'paddle-payout-to-journal'
      // `wise-statement-to-journal` joined 2026-10-06: the multi-currency bank end of the same journal set (foreign balance valued in the books' currency, realised FX on its own line), filed beside it.
      || slug === 'wise-statement-to-journal'
      // `revolut-business-statement-to-journal` joined 2026-10-06: the Revolut Business end of the same multi-currency journal set, filed beside Wise.
      || slug === 'revolut-business-statement-to-journal'
      // `payoneer-statement-to-journal` joined 2026-10-06: the Payoneer end of the same multi-currency journal set (marketplace and freelancer payouts), filed beside Wise and Revolut.
      || slug === 'payoneer-statement-to-journal'
      // `sales-export-to-journal` joined 2026-10-05: the single front door to the eight platform tools above (drop any export, the page detects the platform), filed beside them.
      || slug === 'sales-export-to-journal'
      // `ai-bookkeeper` joined 2026-10-21: the double-entry ledger these journal tools feed (bank CSVs in, learned categories, transfers paired, P&L and balance sheet out), filed beside the front door.
      || slug === 'ai-bookkeeper'
      // `airbnb-payout-to-journal` joined 2026-10-05: the Airbnb host end of the same payout-to-journal set, filed beside it.
      || slug === 'airbnb-payout-to-journal'
      // `paypal-activity-to-journal` joined 2026-10-05: the PayPal end of the same payout-to-journal set (Balance-column continuity proof, then a month-split journal), filed beside it.
      || slug === 'paypal-activity-to-journal'
      // `quickbooks-iif-file-check` joined 2026-10-05: the QuickBooks Desktop IIF half of the import-file pre-flights above, same line-numbered findings and explicit not-checked list.
      || slug === 'quickbooks-iif-file-check'
      // `mt940-statement-check` joined 2026-10-05: the SWIFT MT940 half of the bank-export pre-flights above (balance arithmetic, statement continuity, CSV conversion), same line-numbered findings and explicit not-checked list.
      || slug === 'mt940-statement-check'
      // `camt053-statement-check` joined 2026-10-05: the ISO 20022 XML successor to the MT940 check above, same balance arithmetic, continuity and CSV conversion with line-numbered findings.
      || slug === 'camt053-statement-check'
      // `youtube-chapters-check` joined 2026-10-05: a chapter-list pre-flight, same line-numbered findings and explicit not-checked list as the file pre-flights above, filed beside them.
      || slug === 'youtube-chapters-check'
      // `google-contacts-csv-check` joined 2026-10-05: the CSV half of the contacts-file pre-flights above, same line-numbered findings and explicit not-checked list.
      || slug === 'google-contacts-csv-check',
  },
  {
    // UK tax, pay and benefits, split out of `backoffice` 2026-10-17: 52 `uk-`
    // calculators had taken that category's offline bundle past its 4 MiB
    // gzipped bound (build.test.mjs), and a UK visitor looking for take-home
    // pay or Self Assessment should not have to find it among US cash-flow tools.
    id: 'uk-tax',
    title: 'UK tax, pay & benefits',
    accent: '#3b3f8f',
    blurb: 'Take-home pay, Self Assessment, dividends, IR35, VAT, pensions, statutory pay and the 100k trap — worked with HMRC rates for the current tax year, in your browser.',
    test: (slug) => /^uk-/.test(slug),
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
    // `duplicate-payment-audit` joined 2026-09-08, in the same commit that
    // graduated it. It reads an AP payment ledger the business already exports
    // and flags vendor payments that look paid twice -- the same
    // after-the-sale reconciliation job as `payment-reconciliation-workbench`
    // (matching payouts to deposits) and `card-processing-fee-audit`
    // (splitting a processor's bill), and it cross-links the workbench as a
    // sibling. Landing it here rather than leaving it in the catch-all is also
    // what keeps that catch-all inside the bound `build.test.mjs` puts on it.
    // `certified-payroll-calculator` joined 2026-09-08, in the same commit
    // that graduated it (#4064). It checks a paid week's wages against a
    // wage determination's required base + fringe rate and computes any
    // shortfall -- the same after-the-fact reconciliation job as
    // `duplicate-payment-audit` (checking a ledger against what should have
    // been paid), just for a certified-payroll wage row instead of an AP
    // invoice. It had been landing in the catch-all, pushing it to 9 tools
    // and past the bound `build.test.mjs` puts on it (`the catch-all holds
    // only what no section claims`), because the venture's own graduation
    // commit added no category rule for it.
    // `market-garden-bed-planner` joined 2026-10-01: a market gardener's crop mix under bed, labor and demand limits, solved as a linear program from their own figures --
    // the same own-numbers planning job as `seasonal-buy-quantity-optimizer`, for a farm's beds instead of a retailer's open-to-buy.
    // `adu-payback-calculator` joined 2026-10-01: a homeowner's or small builder's own-figures payback and return decision for a backyard unit (cost, loan, rent, uplift),
    // the same own-numbers invest-or-not job as `heat-pump-vs-furnace-calculator`, here for a rental unit.
    // `family-child-care-time-space-calculator` joined 2026-10-01: a home day care's time-space percentage and the business share of its home expenses,
    // the home-office-deduction-calculator question for the one trade whose regular-use rooms are scaled by hours.
    // `private-practice-payer-mix-calculator` joined 2026-10-01: a therapy or counseling practice's insurance panels and cash fee put on one net-per-clinical-hour footing,
    // the dental-ppo-writeoff-calculator question (what a contracted rate really collects) for a practice that can choose which payers to keep.
    // `cottage-food-pricing-calculator` joined 2026-10-01: a home baker's full cost and price per item by channel, from their own batch figures --
    // the pricing job `menu-engineering-calculator` does for a restaurant menu, for a cottage-food kitchen.
    // `freelance-rate-increase-calculator` joined 2026-10-01 on its first commit: a freelancer's client list replayed against a proposed raise and each client's leave chance --
    // the break-even companion to `freelance-retainer-calculator`'s income-goal pricing.
    // `freelance-retainer-vs-hourly-calculator` joined 2026-10-01: a freelancer's proposed monthly retainer replayed against their own time log, per client --
    // the empirical counterpart of `freelance-retainer-calculator`'s income-goal pricing.
    // `donor-retention-analyzer` joined 2026-10-01: a nonprofit's donor retention by fiscal year and a ranked list of lapsed donors,
    // the retention arithmetic its sibling `patreon-members-churn-analyzer` does for creators, from the organisation's own gifts.
    // `trial-conversion-timing-analyzer` joined 2026-09-30: when in a free trial people first pay, and what a shorter trial would have lost --
    // the timing half of the price-change break-even `subscription-price` runs, from the founder's own trial dates.
    // `str-nightly-rate-optimizer` joined 2026-09-30: a short-term rental host's nightly price priced against the bookings it loses,
    // fitted to their own listed nights -- the `renewal-rent-optimizer` logistic machinery applied to a per-night price.
    // `renewal-rent-optimizer` joined 2026-09-30: a landlord's renewal increase priced against the move-outs it causes,
    // fitted to their own history -- the `self-storage-rate-increase` decision with a measured rather than assumed churn.
    // `self-storage-rate-increase-calculator` joined 2026-09-10 and is filed
    // here on its first commit rather than after a spell in the catch-all --
    // which is what `build.test.mjs`'s catch-all bound is for. It is this
    // section's own blurb almost word for word ("the break-even behind a price
    // change"): an existing-customer rate increase priced against the
    // move-outs it causes, which is the same decision `subscription-price`
    // directly above runs for recurring software revenue, and the two
    // cross-link each other. Not `trades` (nothing is bid), not `services`
    // (the number is not quoted to a customer deciding whether to accept a
    // job), and not `marketplace` (no platform takes a cut).
    // `quarterly-estimated-tax-calendar` joined 2026-09-11, filed here on its
    // first commit for the same reason as `self-storage-rate-increase`
    // above: it is this section's own blurb, "cash timing", almost literally
    // -- when a filer needs cash on hand to send the IRS, and how much. Not
    // `solo-earner`: that section groups people pricing their own labour or
    // audience before a sale; this is a downstream obligation on income
    // already earned, the same "after the job is won" axis as
    // `invoice-payment-terms-calculator` right above it in this same rule,
    // just for a tax authority instead of a client.
    // `1099k-reconciliation-worksheet` joined 2026-09-11, filed here on its
    // first commit rather than after a spell in the catch-all -- which is
    // what `build.test.mjs`'s catch-all bound is for. It is the same
    // after-the-sale reconciliation job as `card-processing-fee-audit`
    // (splitting a processor's statement) and `cam-reconciliation-check`
    // (a landlord's statement), just for a marketplace's 1099-K instead of a
    // bill -- and it cross-links `quarterly-estimated-tax-calendar` right
    // above as a sibling, the two other ends of one tax year. The suffix
    // rule below only catches `-reconciliation-check`/`-workbench`, not
    // `-worksheet`, so it is added by name rather than widening the suffix
    // to match a word ("worksheet") no other venture in this section uses.
    test: (slug) =>
      /(break-even|reconciliation-check|reconciliation-workbench)$/.test(slug)
      || slug === '1099k-reconciliation-worksheet'
      // `nacha-file-validator` joined 2026-10-04 on its first commit: it checks the ACH payment file a bookkeeper
      // exports from payroll or AP before the bank sees it -- the same back-office money-movement job as
      // `payroll-tax-deposit-penalty-calculator` and `duplicate-payment-audit`.
      || slug === 'nacha-file-validator'
      // `w2-efw2-file-validator` joined 2026-10-04 on its first commit: it checks the W-2 wage file a payroll
      // preparer exports before it goes to SSA -- the same back-office payroll job as the deposit-penalty calculator.
      || slug === 'w2-efw2-file-validator'
      // `irs-iris-1099-csv-check` joined 2026-10-04 on its first commit: it checks the 1099-NEC/MISC bulk file a bookkeeper
      // uploads to IRIS -- the same back-office information-return job as `w2-efw2-file-validator` just above.
      || slug === 'irs-iris-1099-csv-check'
      // `1099-vendor-csv-checker` joined 2026-10-04 on its first commit: the January pre-flight on the vendor list before 1099-NEC
      // filing -- the same back-office tax-form job as the W-2 file validator and the 1099 vendor tracker.
      || slug === '1099-vendor-csv-checker'
      // `form-5500-late-filing-calculator` joined 2026-10-04 on its first commit: a retirement-plan sponsor's overdue
      // annual return priced against two agencies' penalties -- the same downstream tax-authority obligation as
      // `quarterly-estimated-tax-calendar` above, not `solo-earner` (nothing is priced before a sale).
      || slug === 'form-5500-late-filing-calculator'
      // `bai2-statement-reader` joined 2026-10-04 on its first commit: it reads and checks the bank statement file a
      // bookkeeper downloads for reconciliation -- the same back-office money-movement job as `nacha-file-validator`.
      || slug === 'bai2-statement-reader'
      // `eu-bank-statement-reader` joined 2026-10-04 on its first commit: the camt.053/MT940 counterpart of
      // `bai2-statement-reader` -- the statement file a bookkeeper downloads for reconciliation.
      || slug === 'eu-bank-statement-reader'
      // `sepa-payment-file-validator` joined 2026-10-04 on its first commit: the euro-area twin of `nacha-file-validator`,
      // checking the pain.001 file a bookkeeper exports from AP or payroll before the bank sees it.
      || slug === 'sepa-payment-file-validator'
      // `sepa-pain001-validator` joined 2026-10-04 on its first commit: the euro-area twin of `nacha-file-validator` -- the SEPA payment
      // file a bookkeeper exports from accounting or payroll, checked before the bank sees it.
      || slug === 'sepa-pain001-validator'
      // `sepa-pain002-status-reader` joined 2026-10-04 on its first commit: the receiving end of `sepa-pain001-validator` -- the bank's
      // status report on an uploaded SEPA file, read per payment with each rejection code explained.
      || slug === 'sepa-pain002-status-reader'
      // `csv-to-sepa-pain001` and `csv-to-sepa-pain008` joined 2026-10-20: the generator halves of the SEPA set above -- a bookkeeper's
      // payment or collection spreadsheet turned into the bank upload file the validator checks.
      || slug === 'csv-to-sepa-pain001'
      || slug === 'csv-to-sepa-pain008'
      // `edi-x12-order-checker` joined 2026-10-04 on its first commit: a supplier's EDI purchase order, invoice and ship
      // notice checked before they go to a retailer -- the same back-office document-preflight job as the payment-file checkers.
      || slug === 'edi-x12-order-checker'
      // `bank-csv-to-qbo-converter` joined 2026-10-04 on its first commit: the CSV-in, accounting-file-out partner of the statement
      // readers -- a bookkeeper's bank CSV turned into QBO/OFX/QIF with the date and sign assumptions stated.
      || slug === 'bank-csv-to-qbo-converter'
      // `xero-invoice-csv-check` joined 2026-10-04 on its first commit: a bookkeeper's sales invoice import file checked before Xero
      // sees it, the same CSV-preflight job as the bank converter next to it.
      || slug === 'xero-invoice-csv-check'
      // `quickbooks-import-csv-check` joined 2026-10-04 on its first commit: a bookkeeper's QuickBooks customer, vendor or item import
      // file checked before QuickBooks sees it, the same CSV-preflight job as the Xero and bank converters next to it.
      || slug === 'quickbooks-import-csv-check'
      // `quickbooks-chart-of-accounts-csv-check` joined 2026-10-04 on its first commit: the chart-of-accounts half of the QuickBooks list checker next to it.
      || slug === 'quickbooks-chart-of-accounts-csv-check'
      // `xero-contacts-csv-check` joined 2026-10-04 on its first commit: the contacts half of the Xero import checker next to it.
      || slug === 'xero-contacts-csv-check'
      // `email-list-csv-check` joined 2026-10-04 on its first commit: a contact list checked before it is imported into an email
      // platform, the same CSV-preflight job as the Xero and bank converters next to it.
      || slug === 'email-list-csv-check'
      // `eu-vat-oss-calculator` joined 2026-10-04 on its first commit: a small seller's EU cross-border VAT return from a sales export, the
      // same back-office compliance-arithmetic job as the SEPA and e-invoice tools here.
      || slug === 'eu-vat-oss-calculator'
      // `ca-gst-hst-small-supplier-checker` joined 2026-10-13 on its first commit: when a small seller must register for sales tax, the same compliance-arithmetic job.
      || slug === 'ca-gst-hst-small-supplier-checker'
      // `ca-self-employed-tax-set-aside-calculator` joined 2026-10-14 on its first commit: Canadian self-employed CPP and income tax set-aside, sibling of the GST/HST small-supplier test, same compliance-arithmetic job.
      || slug === 'ca-self-employed-tax-set-aside-calculator'
      // `us-freelancer-tax-set-aside-calculator` joined 2026-10-14 on its first commit: the US member of the self-employed set-aside family (SE tax, federal income tax with QBI, state, 1040-ES), sibling of the Schedule SE calculator.
      || slug === 'us-freelancer-tax-set-aside-calculator'
      // `au-sole-trader-tax-set-aside-calculator` joined 2026-10-14 on its first commit: Australian sole-trader income tax and Medicare set-aside, sibling of the GST registration checker, same compliance-arithmetic job.
      || slug === 'au-sole-trader-tax-set-aside-calculator'
      // `nz-sole-trader-tax-set-aside-calculator` joined 2026-10-14 on its first commit: New Zealand self-employed income tax and ACC set-aside, sibling of the NZ GST registration checker.
      || slug === 'nz-sole-trader-tax-set-aside-calculator'
      // `ie-self-employed-tax-set-aside-calculator` and `za-freelancer-provisional-tax-set-aside-calculator` joined 2026-10-14: Irish and South African self-employed tax set-aside, siblings of the AU/CA/NZ tools, same compliance-arithmetic job.
      || slug === 'ie-self-employed-tax-set-aside-calculator'
      || slug === 'za-freelancer-provisional-tax-set-aside-calculator'
      // `sg-freelancer-tax-set-aside-calculator` joined 2026-10-14 on its first commit: Singapore freelancer income tax set-aside, sibling of the AU/CA/NZ/IE/ZA tools.
      || slug === 'sg-freelancer-tax-set-aside-calculator'
      // `in-freelancer-advance-tax-set-aside-calculator` joined 2026-10-14 on its first commit: Indian freelancer income tax, 44ADA and advance tax set-aside, sibling of the AU/CA/NZ/IE/ZA tools.
      || slug === 'in-freelancer-advance-tax-set-aside-calculator'
      || slug === 'nl-zzp-tax-set-aside-calculator'
      || slug === 'de-freiberufler-tax-set-aside-calculator'
      || slug === 'uk-self-employed-tax-set-aside-calculator'
      // `au-gst-registration-checker` joined 2026-10-13 on its first commit: the Australian sibling of the GST/HST small-supplier test, same compliance-arithmetic job.
      || slug === 'au-gst-registration-checker'
      // `uk-cis-deduction-refund-calculator` joined 2026-10-13 on its first commit: UK construction subcontractors' CIS deduction and refund, sibling of the UK VAT and sole-trader tools.
      || slug === 'uk-cis-deduction-refund-calculator'
      // `nz-gst-registration-checker` joined 2026-10-13 on its first commit: the New Zealand sibling of the AU/CA registration tests, same compliance-arithmetic job.
      || slug === 'nz-gst-registration-checker'
      // `uk-trading-allowance-calculator` joined 2026-10-13 on its first commit: UK side-earner tax arithmetic, sibling of the UK VAT and sole-trader tools.
      || slug === 'uk-trading-allowance-calculator'
      // `uk-child-benefit-charge-calculator` joined 2026-10-13 on its first commit: UK household tax arithmetic, sibling of the trading-allowance and payments-on-account tools.
      || slug === 'uk-child-benefit-charge-calculator'
      // `uk-student-loan-repayment-calculator` joined 2026-10-13 on its first commit: UK graduate repayment arithmetic, sibling of the Child Benefit and payments-on-account tools.
      || slug === 'uk-student-loan-repayment-calculator'
      // `uk-100k-tax-trap-calculator` joined 2026-10-13 on its first commit: UK GBP 100k personal-allowance taper and pension/childcare planning, sibling of the Child Benefit tool.
      || slug === 'uk-100k-tax-trap-calculator'
      // `uk-landlord-section-24-calculator` joined 2026-10-14 on its first commit: UK personal-tax arithmetic for landlords, sibling of the capital-gains and dividend tools.
      || slug === 'uk-landlord-section-24-calculator'
      // `uk-marriage-allowance-calculator` joined 2026-10-14 on its first commit: UK household tax arithmetic, sibling of the Child Benefit and 100k-trap tools.
      || slug === 'uk-marriage-allowance-calculator'
      // `uk-redundancy-pay-calculator` joined 2026-10-14 on its first commit: UK employment-payment arithmetic, sibling of the take-home pay and student loan tools.
      || slug === 'uk-redundancy-pay-calculator'
      // `uk-tax-code-checker` joined 2026-10-14 on its first commit: PAYE tax code decoding and payslip tax checking, sibling of the take-home pay and Scottish income tax tools.
      || slug === 'uk-tax-code-checker'
      // `uk-rent-a-room-relief-calculator` joined 2026-10-14 on its first commit: Rent a Room Relief versus expenses, sibling of the landlord Section 24 and trading allowance tools.
      || slug === 'uk-rent-a-room-relief-calculator'
      // `uk-state-pension-ni-years-checker` joined 2026-10-14 on its first commit: UK pension-record arithmetic, sibling of the pension annual allowance tool.
      || slug === 'uk-state-pension-ni-years-checker'
      // `uk-minimum-wage-checker` joined 2026-10-14 on its first commit: UK employment-pay arithmetic, sibling of the holiday pay and sick pay tools.
      || slug === 'uk-minimum-wage-checker'
      // `uk-statutory-maternity-pay-calculator` joined 2026-10-14 on its first commit: UK employment-payment arithmetic, sibling of the sick pay and redundancy tools.
      || slug === 'uk-statutory-maternity-pay-calculator'
      // `uk-scottish-income-tax-calculator` joined 2026-10-14 on its first commit: Scottish income tax bands, sibling of the UK take-home pay and student loan tools.
      || slug === 'uk-scottish-income-tax-calculator'
      // `uk-self-assessment-tax-calculator` joined 2026-10-14 on its first commit: combined Self Assessment estimate, hub for the narrower UK tax tools.
      || slug === 'uk-self-assessment-tax-calculator'
      // `uk-money-tools-finder` joined 2026-10-14 on its first commit: situation checklist routing to the 27 UK tax and pay tools.
      || slug === 'uk-money-tools-finder'
      // `uk-salary-sacrifice-calculator` joined 2026-10-14 on its first commit: salary sacrifice vs net pay vs relief at source, with the April 2029 NI cap; sibling of the UK take-home and annual allowance tools.
      || slug === 'uk-salary-sacrifice-calculator'
      // `uk-company-car-tax-calculator` joined 2026-10-14 on its first commit: UK company car benefit in kind (electric, hybrid, petrol), sibling of the take-home pay and salary sacrifice tools.
      || slug === 'uk-company-car-tax-calculator'
      // `uk-late-payment-interest-calculator` joined 2026-10-14 on its first commit: UK B2B late payment statutory interest and compensation, sibling of the self assessment and trading allowance tools.
      || slug === 'uk-late-payment-interest-calculator'
      // `uk-tax-free-childcare-calculator` joined 2026-10-14 on its first commit: UK childcare support (free hours, Tax-Free Childcare), sibling of the 100k trap and child benefit charge tools.
      || slug === 'uk-tax-free-childcare-calculator'
      // `uk-simplified-expenses-calculator` joined 2026-10-14 on its first commit: UK sole-trader simplified expenses vs actual costs, sibling of the self assessment and trading allowance tools.
      || slug === 'uk-simplified-expenses-calculator'
      // `uk-vat-flat-rate-scheme-calculator` joined 2026-10-14 on its first commit: UK VAT Flat Rate Scheme vs standard accounting, sibling of the VAT registration checker.
      || slug === 'uk-vat-flat-rate-scheme-calculator'
      // `uk-capital-allowances-calculator` joined 2026-10-14 on its first commit: UK equipment relief (AIA, full expensing, writing-down), sibling of the sole-trader and VAT tools.
      || slug === 'uk-capital-allowances-calculator'
      // `uk-directors-loan-s455-calculator` joined 2026-10-14 on its first commit: UK director's loan s455 tax, sibling of the dividend and sole trader vs limited company tools.
      || slug === 'uk-directors-loan-s455-calculator'
      // `uk-savings-interest-tax-calculator` joined 2026-10-14 on its first commit: UK savings interest tax (starting rate, PSA), sibling of the dividend tax and take-home pay tools.
      || slug === 'uk-savings-interest-tax-calculator'
      // `uk-pension-withdrawal-tax-calculator` joined 2026-10-14: UK pension withdrawal tax, sibling of the annual allowance and 100k trap tools.
      || slug === 'uk-pension-withdrawal-tax-calculator'
      // `uk-holiday-pay-calculator` joined 2026-10-14 on its first commit: UK employment-pay arithmetic, sibling of the redundancy and sick pay tools.
      // `uk-rd-tax-relief-calculator` joined 2026-10-14 on its first commit: UK R&D relief (merged scheme, ERIS), sibling of the capital allowances and sole-trader tools.
      || slug === 'uk-rd-tax-relief-calculator'
      // `uk-eis-seis-relief-calculator` joined 2026-10-14 on its first commit: UK angel-investor tax relief (EIS/SEIS), sibling of the capital gains and dividend tax tools.
      || slug === 'uk-eis-seis-relief-calculator'
      // `uk-emi-share-option-tax-calculator` joined 2026-10-14 on its first commit: UK EMI option tax (BADR, discount, unapproved comparison), sibling of the capital gains and R&D relief tools.
      || slug === 'uk-emi-share-option-tax-calculator'
      // `uk-mortgage-overpayment-calculator` joined 2026-10-14 on its first commit: UK mortgage overpayment arithmetic, sibling of the stamp duty and landlord tools.
      || slug === 'uk-mortgage-overpayment-calculator'
      // `uk-gift-aid-higher-rate-relief-calculator` joined 2026-10-14 on its first commit: UK charity-giving tax relief (Gift Aid, carry-back, allowance taper), sibling of the £100k trap and self assessment tools.
      || slug === 'uk-gift-aid-higher-rate-relief-calculator'
      // `uk-shared-parental-pay-planner` joined 2026-10-14 on its first commit: UK shared parental pay planning for two parents, sibling of the maternity and sick pay tools.
      || slug === 'uk-shared-parental-pay-planner'
      // `uk-mileage-allowance-calculator` joined 2026-10-14 on its first commit: UK business mileage (HMRC approved rates), sibling of the simplified expenses and self assessment tools.
      || slug === 'uk-mileage-allowance-calculator'
      // `uk-unfair-dismissal-compensation-calculator` joined 2026-10-14 on its first commit: UK dismissal-payment arithmetic, sibling of the redundancy pay and holiday pay tools.
      || slug === 'uk-unfair-dismissal-compensation-calculator'
      // `uk-lifetime-isa-vs-pension-calculator` joined 2026-10-14 on its first commit: UK LISA vs pension choice, sibling of the salary sacrifice and pension annual allowance tools.
      || slug === 'uk-lifetime-isa-vs-pension-calculator'
      // `uk-working-from-home-tax-relief-calculator` joined 2026-10-14 on its first commit: UK backdated homeworking tax relief claims, sibling of the tax code and self assessment tools.
      || slug === 'uk-working-from-home-tax-relief-calculator'
      // `uk-bonus-tax-calculator` joined 2026-10-14 on its first commit: UK bonus take-home, 60% trap and Child Benefit charge, sibling of the salary sacrifice and 100k trap tools.
      || slug === 'uk-bonus-tax-calculator'
      // `uk-umbrella-company-take-home-calculator` joined 2026-10-14 on its first commit: UK agency day rate to take-home through an umbrella, sibling of the IR35 and take-home tools.
      || slug === 'uk-umbrella-company-take-home-calculator'
      || slug === 'uk-holiday-pay-calculator'
      // `uk-employer-hiring-cost-calculator` joined 2026-10-14 on its first commit: UK employer cost arithmetic (NIC, pension, allowance), sibling of the take-home pay and holiday pay tools.
      || slug === 'uk-employer-hiring-cost-calculator'
      // `uk-pension-annual-allowance-calculator` joined 2026-10-14 on its first commit: UK pension tapered annual allowance and carry forward, sibling of the 100k tax trap tool.
      || slug === 'uk-pension-annual-allowance-calculator'
      // `uk-inheritance-tax-calculator` joined 2026-10-14 on its first commit: UK estate tax (nil-rate bands, residence band taper), sibling of the stamp duty and CGT tools.
      || slug === 'uk-inheritance-tax-calculator'
      // `uk-payments-on-account-calculator` joined 2026-10-13 on its first commit: UK Self Assessment payment-schedule arithmetic, sibling of the trading-allowance and CIS tools.
      || slug === 'uk-payments-on-account-calculator'
      // `uk-ir35-inside-outside-calculator` joined 2026-10-13 on its first commit: UK contractor tax arithmetic, sibling of the sole-trader-vs-company and trading-allowance tools.
      || slug === 'uk-ir35-inside-outside-calculator'
      // `uk-self-assessment-late-penalty-calculator` joined 2026-10-13 on its first commit: UK Self Assessment penalty and interest arithmetic, sibling of the payments-on-account tool.
      || slug === 'uk-self-assessment-late-penalty-calculator'
      // `uk-capital-gains-tax-calculator` joined 2026-10-13 on its first commit: UK personal-tax arithmetic, sibling of the payments-on-account and child-benefit tools.
      || slug === 'uk-capital-gains-tax-calculator'
      // `uk-stamp-duty-calculator` joined 2026-10-14 (launch date added with its sibling): UK home-buyer tax arithmetic, sibling of the landlord Section 24 and capital-gains tools.
      || slug === 'uk-stamp-duty-calculator'
      // `uk-take-home-pay-calculator` joined 2026-10-14 on its first commit: UK employee pay-after-tax arithmetic, hub for the UK student loan, 100k trap and pension tools.
      || slug === 'uk-take-home-pay-calculator'
      // `uk-dividend-tax-calculator` joined 2026-10-13 on its first commit: UK personal-tax arithmetic for directors and investors, sibling of the capital-gains and sole-trader tools.
      || slug === 'uk-dividend-tax-calculator'
      // `tfsa-over-contribution-checker` joined 2026-10-13 on its first commit: Canadian personal-tax room and penalty arithmetic, a sibling of the Canada GST/HST checker.
      || slug === 'tfsa-over-contribution-checker'
      // `uk-statutory-sick-pay-calculator` joined 2026-10-13 on its first commit: UK employer payroll-compliance arithmetic, same back-office job.
      || slug === 'uk-statutory-sick-pay-calculator'
      // `au-redundancy-pay-calculator` joined 2026-10-13 on its first commit: employer termination-pay compliance arithmetic, same back-office job.
      || slug === 'au-redundancy-pay-calculator'
      // `uk-vat-registration-checker` was left in the catch-all by its own merge (which put the tree one over the bound); filed here beside its UK sibling above.
      || slug === 'uk-vat-registration-checker'
      // `iolta-three-way-reconciliation-checker` joined 2026-10-13 on its first commit: a lawyer's monthly trust-account reconciliation, the same back-office bookkeeping job.
      || slug === 'iolta-three-way-reconciliation-checker'
      // `client-concentration-risk-analyzer` joined 2026-10-02 on its first commit: it reads the same invoice
      // export as `invoice-payment-terms-calculator` here and asks how much revenue one client carries.
      || slug === 'client-concentration-risk-analyzer'
      // `bookkeeping-client-fee-calculator` joined 2026-10-02 on its first commit: a bookkeeper's retainer, cleanup and walk-away price from a client's
      // workload, and a roster ranked by effective hourly -- the back-office pricing job `client-profitability-time-analyzer` does after the fact.
      || slug === 'bookkeeping-client-fee-calculator'
      // `price-increase-breakeven-calculator` filed here 2026-10-02: it was landing in the catch-all (bound 5) and is
      // the same after-the-fact margin arithmetic as the break-even tools above.
      || slug === 'price-increase-breakeven-calculator'
      // `rent-roll-delinquency-analyzer` reads a landlord's rent ledger after the rent fell due
      // (what is unpaid, how old, who pays late) -- the same after-the-fact reconciliation job
      // as `cam-reconciliation-check` above, for tenants' payments instead of a CAM statement.
      || slug === 'rent-roll-delinquency-analyzer'
      // `rental-property-schedule-e-categorizer` sorts a landlord's bank file after the year is over
      // into tax lines: the same after-the-fact reconciliation job, next to the rent ledger reader.
      || slug === 'rental-property-schedule-e-categorizer'
      // `state-residency-day-counter` joined 2026-10-01 on its first commit: a tax-year record of days
      // per state checked against residency limits -- the same tax-obligation axis as
      // `quarterly-estimated-tax-calendar` above, which it links to.
      || slug === 'state-residency-day-counter'
      // `s-corp-basis-tracker` joined 2026-10-17 on its first commit: a shareholder's yearly basis roll-forward
      // for the return -- the same tax-position bookkeeping axis as `state-residency-day-counter`.
      || slug === 's-corp-basis-tracker'
      // `feie-physical-presence-calculator` joined 2026-10-03 on its first commit: the federal 330-day
      // count a US expat keeps, the same tax-obligation day-counting axis as `state-residency-day-counter`.
      || slug === 'feie-physical-presence-calculator'
      // `us-substantial-presence-test-calculator` joined 2026-10-19 on its first commit: the inbound US
      // residency day count, the counterpart of the 330-day FEIE count above.
      || slug === 'us-substantial-presence-test-calculator'
      // `cheap-meal-plan-optimizer` joined 2026-10-01 on its first commit: a household's food budget as a
      // minimum-cost linear program -- a personal money decision rather than an operator pricing food, so it
      // sits here and not under `food-service`, which is for people who sell food.
      || slug === 'cheap-meal-plan-optimizer'
      // `self-employed-schedule-c-categorizer` is the same bank-file-to-tax-lines job for a sole proprietor's
      // Schedule C, and its page sits next to `1099k-reconciliation-worksheet` and the landlord version.
      || slug === 'self-employed-schedule-c-categorizer'
      // `freelancer-schedule-c-categorizer` is the same after-the-year bank-file reconciliation for a
      // sole proprietor's Schedule C, filed beside its landlord sibling.
      || slug === 'freelancer-schedule-c-categorizer'
      // `dental-ppo-writeoff-calculator` measures what a signed contract
      // actually paid over a period already billed — the same after-the-sale
      // reconciliation job as `card-processing-fee-audit` (splitting a
      // processor's bill) and `cam-reconciliation-check` (a landlord's
      // statement), for an insurance carrier's fee schedule instead. Named
      // here rather than left in the catch-all, where a practice owner
      // reading "contract terms" would never have seen it.
      // `fleet-repair-or-replace-planner` joined 2026-09-12, in the same
      // commit that graduated it. It is the same capital-decision arithmetic
      // as `equipment-lease-buyout-calculator` above -- converting a
      // financing or replacement choice into an annual cost per asset -- but
      // applied across a whole fleet against one budget rather than to a
      // single machine. Named here rather than left in the catch-all, where
      // an owner reading "the break-even behind a price change" would never
      // have found the page that ranks which van to replace first.
      //
      // `security-deposit-return-calculator` moved out of the catch-all here
      // on 2026-09-13, per the same test (`the catch-all holds only what no
      // section claims`) that caught `fleet-repair-or-replace-planner` above.
      // It itemizes a security deposit's deductions into a refund or balance
      // due, and prorates rent for a partial month -- arithmetic that happens
      // once a tenancy already ended or began, not a price quoted before the
      // work, which is what puts it here rather than in `services`. The same
      // "after the fact" axis as `card-processing-fee-audit` (splitting a
      // processor's bill after the sale) and `cam-reconciliation-check` (a
      // landlord's own statement), just for a move-out deposit instead.
      // `depreciation-recapture-calculator` joined 2026-09-17, filed here on
      // its first commit for the same reason as `quarterly-estimated-tax`
      // above rather than after a spell in the catch-all: it is a downstream
      // tax obligation on a gain already realized -- the same "after the job
      // is won" axis as `security-deposit-return` right above (arithmetic
      // that happens once a transaction already closed), just triggered by
      // a property sale instead of a lease ending, and it cross-links
      // `quarterly-estimated-tax-calendar` as a sibling: one is the ongoing
      // filing, the other is the one-time sale.
      // `no-tax-on-tips-overtime-calculator` joined 2026-09-17 concurrently,
      // filed here on its first commit rather than after a spell in the
      // catch-all -- what `build.test.mjs`'s catch-all bound is for. It
      // estimates a federal deduction on tips and overtime pay already
      // earned -- the same "downstream obligation on income already earned"
      // axis as `quarterly-estimated-tax-calendar` right above it in this
      // same rule, just a deduction owed to the filer instead of a payment
      // owed to the IRS. Not `solo-earner`: that section groups people
      // pricing their own labour or audience before a sale; this runs after
      // the pay period, on a W-2 or 1099 figure already received.
      // `qbi-deduction-calculator` joined 2026-09-17, filed here on its
      // first commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for. It estimates a federal
      // deduction on business income already earned -- the same "downstream
      // obligation on income already earned" axis as
      // `no-tax-on-tips-overtime-calculator` right above it in this same
      // rule, just a deduction tied to QBI instead of tips/overtime, and it
      // cross-links `quarterly-estimated-tax-calendar` as a sibling for the
      // same reason that tool does.
      // `employee-cost-calculator` joined 2026-09-24, filed here on its first
      // commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for, which was already sitting
      // at its bound of 5 the day this venture graduated. It is a back-office
      // money decision like the rest of this section -- the fully-loaded
      // annual cost of a role, W-2 versus 1099, computed with the same
      // capped-FUTA/SUTA employer-burden arithmetic
      // `ventures/staffing-markup-calculator/calc.mjs` uses for a billed
      // placement -- just for a direct hire's own payroll rather than a
      // staffing agency's invoice. Not `services` (staffing-markup-calculator
      // itself sits there): that section groups a business quoting *billed*
      // work to a client, and this tool has no client, only an internal
      // staffing-cost decision. It cross-links staffing-markup-calculator as
      // a sibling -- the same burden math, applied on the other side of who
      // pays it.
      // `s-corp-reasonable-compensation-calculator` joined 2026-09-24, filed
      // here on its first commit rather than after a spell in the catch-all
      // -- what `build.test.mjs`'s catch-all bound is for. Same axis as
      // `qbi-deduction-calculator` and `no-tax-on-tips-overtime-calculator`
      // right above it: a downstream tax/compensation decision on business
      // income already earned, not a quote to a client (that is `services`)
      // and not pricing labour before a sale (that is `solo-earner`). It
      // cross-links `qbi-deduction-calculator` as a sibling -- both are a
      // federal-tax consequence of the same S-corp/pass-through income, one
      // on the deduction side and one on the salary-vs-distribution split
      // that feeds it.
      // `mega-backdoor-roth-calculator` joined 2026-09-24, filed here rather
      // than left in the catch-all (where this session found it after it had
      // pushed the catch-all to 6, past `build.test.mjs`'s bound of 5): a
      // downstream tax-advantaged-savings decision on income already
      // earned -- the same axis as `qbi-deduction-calculator` and
      // `no-tax-on-tips-overtime-calculator` above it in this rule, just
      // computing after-tax 401(k) contribution headroom under the IRS
      // 415(c) overall-additions limit instead of a deduction. Not
      // `solo-earner` (this runs on a W-2 already received, not labour
      // priced before a sale). It cross-links `qbi-deduction-calculator`
      // as a sibling (reciprocally, in the same commit) -- both are a
      // federal-tax-code decision an individual makes about income already
      // on the books.
      // `auto-loan-interest-deduction-calculator` joined 2026-09-24,
      // concurrently, filed here on its first commit rather than after a
      // spell in the catch-all -- what `build.test.mjs`'s catch-all bound is
      // for. It estimates a federal deduction on interest already paid on a
      // loan already taken out -- the same "downstream obligation/benefit on
      // a transaction already made" axis as `no-tax-on-tips-overtime-calculator`
      // and `qbi-deduction-calculator` right above it in this same rule, just
      // a deduction tied to a vehicle loan instead of tips/overtime pay or
      // QBI. It cross-links `no-tax-on-tips-overtime-calculator` as a
      // sibling: both are new-for-2025 OBBBA deductions a filer may claim in
      // the same season, and the two disagree on whether married filing
      // separately qualifies, which is worth a reader hitting explicitly
      // rather than assuming one rule generalizes to the other.
      //
      // `tip-pool-compliance-calculator` joined 2026-09-24, concurrently,
      // filed here on its first commit rather than after a spell in the
      // catch-all -- the catch-all was already at its bound of 5
      // (ai-engineering-academy, hoa-reserve-fund-calculator,
      // overtime-pay-calculator, voiceover-project-rate-calculator,
      // world-clock-widget) the day this venture graduated. It is the same
      // "wage/payroll obligation computed after the fact" axis as
      // `certified-payroll-calculator` and `employee-cost-calculator` right
      // above it in this rule -- a federal FLSA tip-pooling eligibility
      // check and the back-wage exposure a violation creates, rather than a
      // bid or a fee schedule. It cross-links `no-tax-on-tips-overtime-calculator`
      // as a sibling: same section of the tipped-wage workforce, a
      // different obligation (a federal income-tax deduction there, a
      // federal wage-and-hour rule here).
      //
      // `mega-backdoor-roth-calculator` joined 2026-09-24, concurrently on
      // `main` while a sibling session's branch was in flight -- filed here
      // rather than left in the catch-all (`build.test.mjs`'s bound is what
      // that guard is for). Same "IRS dollar-limit lookup against a filer's
      // own numbers" axis as `qbi-deduction-calculator` and
      // `depreciation-recapture-calculator` right above it in this rule --
      // after-tax 401(k)/415(c) headroom instead of a deduction, but the
      // same shape: a published, dated table plus arithmetic on figures the
      // saver already has, never a filed election or plan-compliance
      // determination.
      //
      // `senior-deduction-calculator` joined 2026-09-24, concurrently on
      // `main` too, filed here on its first commit rather than after a
      // spell in the catch-all -- same "new-for-2025 OBBBA federal
      // deduction" axis as `auto-loan-interest-deduction-calculator` and
      // `no-tax-on-tips-overtime-calculator` right above it in this rule,
      // just the age-65 bonus deduction instead of vehicle-loan interest or
      // tips/overtime pay. It cross-links both of those siblings: all three
      // are new, temporary 2025-2028 OBBBA deductions a filer may claim in
      // the same season, and all three disagree on married-filing-separately
      // treatment in ways worth a reader hitting explicitly rather than
      // assuming one rule generalizes to the others.
      // `mega-backdoor-roth-calculator` joined 2026-09-24, concurrently --
      // the same "personal-finance tax arithmetic against a published,
      // dated federal limit table" axis as `senior-deduction-calculator`
      // and `auto-loan-interest-deduction-calculator` right above it, just
      // an after-tax 401(k)/IRS 415(c) headroom lookup rather than a
      // deduction. Its slug names neither a bid, a fee, nor an OBBBA
      // deduction, so no keyword above would have caught it and it would
      // otherwise have swollen the catch-all past its bound of 5.
      //
      // `trump-account-calculator` joined 2026-09-24, concurrently on
      // `main` too, filed here on its first commit rather than after a
      // spell in the catch-all -- what `build.test.mjs`'s catch-all bound is
      // for. Same "IRS dollar-limit lookup against a filer's own numbers"
      // axis as `mega-backdoor-roth-calculator` right above it in this rule
      // -- a published, dated contribution cap plus arithmetic on figures
      // the saver already has, never a filed election or plan-compliance
      // determination -- just for a federal child savings account (26
      // U.S.C. 530A) instead of a 401(k)'s after-tax bucket. It cross-links
      // `mega-backdoor-roth-calculator` as its nearest sibling.
      //
      // `section-174a-catchup-calculator` joined 2026-09-25, filed here on
      // its first commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for. Same "downstream federal
      // tax election on figures the filer already has" axis as
      // `depreciation-recapture-calculator` and `qbi-deduction-calculator`
      // above it in this rule -- comparing the two Rev. Proc. 2025-28
      // Section 174A R&E catch-up election paths (1-year vs. 2-year) rather
      // than a single deduction estimate, never a filed election made on the
      // visitor's behalf. It cross-links `trump-account-calculator` as its
      // nearest sibling: both are brand-new, deterministic 2025-2026 OBBBA
      // calculators with no closer topical match in this portfolio.
      //
      // `bonus-depreciation-calculator` joined 2026-09-25, filed here on its
      // first commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for. Same "downstream federal
      // tax election on figures the filer already has" axis as
      // `section-174a-catchup-calculator` right above it in this rule --
      // comparing bonus depreciation, a Section 179 election, and plain
      // MACRS for a new equipment purchase, never a filed election made on
      // the visitor's behalf. It cross-links
      // `depreciation-recapture-calculator` as its nearest sibling: the two
      // opposite ends of one asset's depreciation lifecycle, buying new
      // property vs. selling depreciated property.
      //
      // `salt-cap-calculator` joined 2026-09-25, filed here on its first
      // commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for. Same "downstream
      // federal tax election/limit on figures the filer already has" axis
      // as `senior-deduction-calculator` and the other OBBBA calculators
      // in this rule -- computing the SALT itemized-deduction cap after
      // its MAGI-based phase-out, never a filed election made on the
      // visitor's behalf. It cross-links `senior-deduction-calculator` as
      // its nearest sibling: both are new-in-2025 OBBBA provisions with an
      // income-based MAGI phase-out, but this one floors at a fixed dollar
      // amount while the senior deduction phases fully to zero.
      //
      // `charitable-deduction-calculator` joined 2026-09-25, filed here on
      // its first commit rather than after a spell in the catch-all --
      // what `build.test.mjs`'s catch-all bound is for. Same "downstream
      // federal itemized-deduction change on figures the filer already
      // has" axis as `salt-cap-calculator` right above it in this rule --
      // comparing the new non-itemizer above-the-line charitable
      // deduction against itemizing after the new 0.5%-of-AGI floor,
      // never a filed election made on the visitor's behalf. It
      // cross-links `salt-cap-calculator` as its nearest sibling: both are
      // new-in-2025/2026 OBBBA itemized-deduction changes with a
      // floor/ceiling shape, one on state and local tax, the other on
      // charitable giving.
      //
      // `gambling-loss-deduction-calculator` joined 2026-09-25, filed here
      // on its first commit rather than after a spell in the catch-all --
      // what `build.test.mjs`'s catch-all bound is for. Same "downstream
      // federal itemized-deduction change on figures the filer already
      // has" axis as `charitable-deduction-calculator` right above it in
      // this rule -- computing the allowable deduction under the new
      // 90%-of-winnings gambling-loss cap and the resulting phantom
      // taxable income, never a filed election made on the visitor's
      // behalf. It cross-links `charitable-deduction-calculator` as its
      // nearest sibling: both are new-in-2025/2026 OBBBA itemized-
      // deduction changes with a percentage-based haircut rather than a
      // flat dollar cap.
      //
      // `estate-tax-exemption-calculator` joined 2026-09-25, filed here on
      // its first commit rather than after a spell in the catch-all --
      // what `build.test.mjs`'s catch-all bound is for. Same "downstream
      // federal tax figure applied to numbers the filer already has" axis
      // as the other OBBBA calculators in this rule -- projecting federal
      // estate tax exposure under OBBBA's permanent 2026 $15,000,000
      // basic exclusion amount, never a filed Form 706/709 made on the
      // visitor's behalf. It cross-links `trump-account-calculator` as its
      // nearest sibling: both are brand-new federal OBBBA wealth-transfer
      // provisions -- one a parent-to-child savings account, the other the
      // lifetime/at-death estate and gift exclusion -- with no closer
      // topical match in this portfolio.
      //
      // `excess-business-loss-calculator` joined 2026-09-25, concurrently
      // with the ventures above and invisible to them, filed here on its
      // first commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for. Same "downstream
      // federal tax threshold on figures the filer already has" axis as
      // `qbi-deduction-calculator` right above it in this rule --
      // computing the IRC 461(l) excess-business-loss threshold and the
      // resulting NOL carryforward, never a filed position made on the
      // visitor's behalf. It cross-links `qbi-deduction-calculator` as its
      // nearest sibling: both serve pass-through business owners and flag
      // (without computing) the interaction between the two calculations.
      //
      // `qsbs-exclusion-calculator` joined 2026-09-25, also concurrently,
      // filed here on its first commit rather than after a spell in the
      // catch-all -- what `build.test.mjs`'s catch-all bound is for. Same
      // "downstream federal tax exclusion on figures the filer already
      // has" axis as `excess-business-loss-calculator` right above it in
      // this rule -- computing the Section 1202 QSBS capital-gain
      // exclusion, never a filed position made on the visitor's behalf.
      // It cross-links `excess-business-loss-calculator` as its nearest
      // sibling: both are OBBBA provisions made permanent/expanded in
      // 2025 with a cap-and-threshold shape, one on ordinary business
      // losses, the other on capital gains from a stock sale.
      //
      // `exempt-salary-threshold-checker` joined 2026-09-25, also
      // concurrently, filed here on its first commit rather than after a
      // spell in the catch-all -- what `build.test.mjs`'s catch-all bound
      // is for. Same "federal wage-and-hour figure checked against a
      // state's own higher number" axis as `tip-pool-compliance-calculator`
      // above in this rule -- a salary-threshold comparison for the FLSA
      // white-collar exemption, never a duties-test or salary-basis
      // determination made on the visitor's behalf. It cross-links
      // `tip-pool-compliance-calculator` as its nearest sibling: both check
      // one FLSA wage-and-hour rule against a fixed federal-or-state table,
      // neither computes pay.
      //
      // `child-tax-credit-calculator` joined 2026-09-25, filed here on its
      // first commit rather than after a spell in the catch-all -- what
      // `build.test.mjs`'s catch-all bound is for. Same "downstream federal
      // tax figure applied to numbers the filer already has" axis as the
      // other OBBBA calculators in this rule -- applying the permanent
      // $2,200-per-child Child Tax Credit, the $500 Credit for Other
      // Dependents, their combined MAGI phase-out, and the refundable
      // Additional Child Tax Credit ceiling, never a filed Schedule 8812
      // made on the visitor's behalf. It cross-links `trump-account-
      // calculator` as its nearest sibling: both are child/family-focused
      // federal OBBBA provisions -- one a recurring annual tax credit, the
      // other a one-time child-savings-account seed deposit.
      //
      // `eitc-calculator` joined 2026-09-25, also filed here on its first
      // commit. Unlike every other rule in this section, the Earned Income
      // Tax Credit is NOT an OBBBA provision -- it is a decades-old,
      // mass-claimed credit -- but shares the same "downstream federal tax
      // figure applied to numbers the filer already has" computational
      // shape as the rest of this section, applying the EITC's
      // phase-in/plateau/phase-out formula and the earned-income-vs-AGI
      // dual lookup, never a filed Schedule EIC made on the visitor's
      // behalf. It cross-links `child-tax-credit-calculator` as its
      // nearest sibling: both are federal per-household tax credits often
      // claimed on the same return, one built on earned income, the other
      // on a per-child amount.
      //
      // `hsa-contribution-limit-calculator` joined 2026-09-25, filed here
      // on its first commit rather than after a spell in the catch-all --
      // what `build.test.mjs`'s catch-all bound is for. Same "IRS
      // dollar-limit lookup against a filer's own numbers" axis as
      // `mega-backdoor-roth-calculator` above it in this rule -- a
      // published, dated annual contribution cap (with monthly proration
      // or the last-month-rule alternative) applied to a saver's own HDHP
      // eligibility, never a filed election or plan-compliance
      // determination -- just for an HSA instead of a 401(k)'s after-tax
      // bucket. It cross-links `mega-backdoor-roth-calculator` as its
      // nearest sibling: both are annually-indexed IRS contribution-limit
      // lookups with an eligibility wrinkle the headline number alone
      // does not capture.
      //
      // `solo-401k-contribution-calculator` joined 2026-09-28, filed here
      // on its first commit rather than after a spell in the catch-all --
      // what `build.test.mjs`'s catch-all bound is for. Same "IRS
      // dollar-limit lookup against a filer's own numbers" axis as
      // `mega-backdoor-roth-calculator` and `hsa-contribution-limit-calculator`
      // above it in this rule -- an annually-indexed contribution limit
      // applied to a saver's own net self-employment earnings, never a
      // filed election or plan-compliance determination -- just for a
      // self-employed retirement plan instead of a W-2 employer's 401(k)
      // or an HSA. It cross-links `mega-backdoor-roth-calculator` as its
      // nearest sibling (both are annually-indexed IRS contribution-limit
      // lookups with an eligibility wrinkle the headline number alone
      // does not capture), with a reciprocal inbound link from that
      // venture's first commit rather than shipping as an orphan.
      || /^(hard-money-loan-cost-calculator|wash-sale-checker|inherited-ira-10-year-withdrawal-planner|cobra-vs-marketplace-calculator|nsa-idr-offer-calculator|adu-payback-calculator|wage-garnishment-limit|commercial-lease-effective-rent-calculator|ad-spend-saturation-optimizer|ad-incrementality-test-analyzer|freelance-retainer-vs-hourly-calculator|scope-creep-change-order-calculator|freelance-project-picker|like-kind-exchange|syndication-waterfall|med-spa-treatment-profit-calculator|fractional-executive-rate-calculator|grant-writer-proposal-price-calculator|chiropractor-new-patient-roi-calculator|dependent-care-fsa-vs-credit-calculator|google-play-earnings-report|amazon-ppc-search-term|whatnot-sales-report|youtube-revenue-rpm|meta-ads-fatigue|turo-earnings-report|substack-subscriber-export|ghost-members-export|app-store-sales-report|era-835-underpayment-finder|tiktok-shop-settlement|kdp-royalty-report|gig-driver-earnings-report|airbnb-earnings-report|cash-runway|invoice-payment-terms|early-pay-discount-picker|cam-|saas-seat|saas-renewal-planner|vendor-contract-clause-reader|saas-annual-plan|saas-efficiency-metrics-calculator|saas-cac-payback|stripe-churn-cohort|ebay-promoted-listings-roi|etsy-ads-roi|stripe-failed-payment|google-ads-wasted-spend|subscription-price|subscription-audit-from-statement|self-storage-rate-increase|renewal-rent-optimizer|quote-follow-up-timing|trial-conversion-timing-analyzer|str-nightly-rate-optimizer|booking-request-chooser|market-event-picker|consignment-markdown-planner|trade-show-roi-calculator|dog-grooming-day-planner|str-turnover-scheduler|midterm-rental-calculator|support-staffing-planner|lot-split-calculator|csa-share-pricing-calculator|seller-net-sheet|property-tax-appeal-calculator|aca-subsidy-cliff-calculator|medical-bill-error-checker|insurance-denial-appeal-builder|mortgage-escrow-analysis-checker|social-security-claiming-age-calculator|social-security-survivor-spousal-benefit-calculator|travel-nurse-contract-comparison-calculator|appointment-deposit|appointment-no-show|appointment-overbooking|service-hourly-yield-analyzer|equipment-lease-buyout|equipment-lease-vs-buy|fleet-repair-or-replace-planner|card-processing-fee-audit|card-surcharge|duplicate-payment-audit|certified-payroll-calculator|quarterly-estimated-tax|cannabis-280e-tax-calculator|dental-ppo-writeoff|security-deposit-return|depreciation-recapture|no-tax-on-tips-overtime-calculator|qbi-deduction-calculator|employee-cost-calculator|workers-comp-premium-calculator|s-corp-reasonable-compensation-calculator|auto-loan-interest-deduction-calculator|tip-pool-compliance-calculator|senior-deduction-calculator|mega-backdoor-roth-calculator|trump-account-calculator|section-174a-catchup-calculator|rd-tax-credit-calculator|bonus-depreciation-calculator|business-vehicle-depreciation-calculator|salt-cap-calculator|charitable-deduction-calculator|gambling-loss-deduction-calculator|estate-tax-exemption-calculator|excess-business-loss-calculator|qsbs-exclusion-calculator|exempt-salary-threshold-checker|child-tax-credit-calculator|eitc-calculator|hsa-contribution-limit-calculator|solo-401k-contribution-calculator|sep-ira-vs-solo-401k-calculator|mileage-deduction-method-calculator|mileage-log|home-office-deduction-calculator|str-tax-loophole-calculator|estimated-tax-penalty-calculator|self-employment-tax-calculator|backdoor-roth-pro-rata-calculator|roth-conversion-bracket-fill-calculator|rsu-withholding-gap-calculator|iso-exercise-amt-calculator|job-offer-total-comp-calculator|physician-wrvu-compensation-calculator|dental-associate-pay-calculator|solar-payback-calculator|heat-pump-vs-furnace-calculator|cash-balance-plan-calculator|safe-dilution-calculator|cost-segregation-study-calculator|agent-brokerage-split-calculator|espp-tax-calculator|tax-loss-harvesting-calculator|crypto-cost-basis-calculator|home-sale-exclusion-calculator|medicare-irmaa-cliff-calculator|coast-fire-calculator|rmd-calculator|rental-dscr-calculator|commercial-property-cap-rate-calculator|rental-rent-optimizer|contractor-wip-schedule|landlord-repair-or-replace-planner|brrrr-calculator|self-employed-health-insurance-deduction-calculator|physician-wrvu-contract-calculator|veterinarian-associate-pay-calculator|section-83b-election-calculator|pslf-vs-refinance-calculator|startup-option-value-calculator|van-westendorp-pricing-analyzer|sales-commission-plan-comparison-calculator|rule-72t-sepp-calculator|locum-tenens-vs-employed-calculator|fix-and-flip-deal-analyzer|merchant-cash-advance-true-cost-calculator|business-loan-offer-comparator|usage-based-pricing-simulator|startup-exit-waterfall-calculator|augusta-rule-calculator|gabor-granger-price-analyzer|insurance-agency-book-valuation-calculator|ab-test-significance-calculator|investor-update-builder|online-business-valuation-calculator|customer-lifetime-value-predictor|icp-lens|sales-seasonality-forecaster|price-elasticity-estimator|seasonal-buy-quantity-optimizer|donor-retention-analyzer|donor-acknowledgment-letter-generator|private-practice-payer-mix-calculator|market-garden-bed-planner|cottage-food-pricing-calculator|payroll-tax-deposit-penalty-calculator|family-child-care-time-space-calculator)/.test(slug),
  },
  {
    id: 'ci',
    title: 'CI checks & developer gates',
    accent: '#1a4560',
    blurb: 'Audit a GitHub Actions workflow for injection, over-broad permissions, unpinned actions and cache poisoning; tell a starved runner from a real failure; catch a coverage drop, classify flaky tests, see which AI crawlers your robots.txt allows, catch a dependency that just gained an install-time script or could be confused with an internal package, find a missing iOS privacy-manifest declaration before App Review does, or catch a page whose JSON-LD no longer matches its own visible text — free, local, no account.',
    // These four sat in the catch-all together: each is a browser-local (and
    // matching CLI) checker a maintainer runs against files or API JSON they
    // already have, not a trade bid, marketplace fee, or compliance evidence
    // packet. They already deep-link each other as Related, but a visitor
    // browsing "More free tools" never met the group — and related-tool chrome
    // mixed them with Sponsor Ready and marketplace payouts. A named section
    // is how a developer looking for a CI gate finds all four.
    //
    // The workflow-YAML checkers joined 2026-09-07, when
    // `actions-cache-poisoning-check` graduated and pushed the catch-all past
    // the bound `build.test.mjs` puts on it. All four —
    // `actions-cache-poisoning`, `actions-injection`, `actions-permissions`
    // and `pinned-actions` — read a GitHub Actions workflow the visitor
    // already has and name a specific supply-chain pattern in it. That is the
    // same shape as `actions-runner-starvation` (which this rule already
    // claimed only because of its prefix), and they cross-link each other as
    // Related, so the group was already coherent everywhere except the one
    // place a stranger browses. Written as one `actions-` prefix plus
    // `pinned-actions` rather than four alternatives, so the next checker in
    // the family lands here without another edit.
    //
    // `license-drift-check` and `npm-lifecycle-script-check` both joined
    // 2026-09-07, within hours of each other. `license-drift-check`
    // graduated in #3808 and landed in the catch-all because the rule above
    // enumerates families by prefix and its slug starts a new one — it names
    // what it diffs (licenses) rather than what it reads. It is the same
    // shape as the rest: a browser-local checker plus a matching CLI, run by
    // a maintainer against a dependency tree they already have, reporting
    // which packages' declared license changed since the last snapshot.
    // `npm-lifecycle-script-check` is a paste-a-snapshot, deterministic-diff
    // checker for that same dependency tree, just for an install-time script
    // instead of a declared license. Both belong beside the four workflow
    // checkers, not below the childcare tuition calculator.
    //
    // `vscode-extension-drift-check` joined 2026-09-07: the same
    // paste-a-snapshot, deterministic-diff shape as its two neighbors above,
    // just for an installed editor extension's activation surface instead of
    // an npm dependency's license or install-time script. It cross-links
    // `npm-lifecycle-script-check` as Related for the same reason those two
    // already cross-link each other.
    // `dependency-confusion-check` joined 2026-09-08. It asks whether a public
    // package could be substituted for an internal one -- the same
    // supply-chain question `npm-lifecycle-script-check` asks about
    // install-time scripts, read from a manifest the maintainer already has,
    // and it cross-links that tool as Related. It had sat in the catch-all
    // since it graduated only because its slug starts a family the prefix list
    // did not name, which is the same accident this comment block records for
    // `license-drift-check` a day earlier.
    //
    // `ios-privacy-manifest-check` joined the same day. Same shape again --
    // a browser-local checker plus a matching CLI, run by a developer against
    // source and a manifest file they already have, reporting which
    // declarations are missing or wrong -- just for an iOS app's
    // PrivacyInfo.xcprivacy instead of an npm/Actions supply-chain artifact.
    // It cross-links `dependency-confusion-check` as Related. Listed by exact
    // slug rather than a new prefix, the same way `dependency-confusion-check`
    // itself is: one tool does not earn a whole family pattern.
    //
    // `structured-data-drift-check` joined 2026-09-09. Same shape again -- a
    // browser-local checker plus a matching CLI, run by a developer against
    // an HTML page (and its own JSON-LD) they already have, reporting
    // exactly where a FAQPage/HowTo/Product/etc. claim diverges from the
    // page's own visible text -- just for structured-data drift instead of
    // an npm/Actions/iOS supply-chain artifact. It cross-links
    // `ai-crawler-access-check` as Related (same "can an AI system actually
    // trust this page" question, different failure mode). Listed by exact
    // slug rather than a new prefix, the same way `dependency-confusion-check`
    // and `ios-privacy-manifest-check` are: one tool does not earn a whole
    // family pattern, and landing it here rather than the catch-all is also
    // what keeps that catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `env-example-drift-check` joined 2026-09-09. Same shape again -- a
    // browser-local checker plus a matching CLI, run by a developer against
    // an `.env.example` file and their own source code, reporting exactly
    // which environment variables the code reads that the example file is
    // missing (or declares but no longer reads) -- just for a repo's config
    // contract instead of an npm/Actions/iOS/structured-data artifact. It
    // cross-links `structured-data-drift-check` as Related (same "does the
    // doc still match the code" question, different pair). Listed by exact
    // slug rather than a new prefix, the same way `structured-data-drift-check`
    // is: one tool does not earn a whole family pattern.
    //
    // `package-exports-drift-check` joined 2026-09-09, the same day. Same
    // shape again -- a browser-local checker plus a matching CLI, run by a
    // maintainer against their own `package.json` and a file listing they
    // already have, reporting exactly which literal target in the `exports`
    // map points at a file that does not exist -- just for a package's
    // publish contract instead of an env file, a workflow, an iOS manifest,
    // or a page's own structured data. It cross-links both
    // `env-example-drift-check` and `structured-data-drift-check` as
    // Related (same "does the doc still match the code/build" question,
    // different pair). Listed by exact slug rather than a new prefix, the
    // same way its two siblings are: one tool does not earn a whole family
    // pattern, and landing it here rather than the catch-all is also what
    // keeps that catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `chrome-extension-permission-check` joined 2026-09-09. Same shape
    // again -- a browser-local checker plus a matching CLI, run by a
    // developer against their own source and a manifest file they already
    // have, reporting which declarations are missing or unused in both
    // directions -- just for a Chrome/Edge extension's manifest.json
    // permissions instead of an npm/Actions/iOS/structured-data/env/package
    // artifact. It cross-links `ios-privacy-manifest-check` as Related (same
    // "cross-check a platform-review-gating manifest against real API usage"
    // question, different platform). Listed by exact slug rather than a new
    // prefix, the same way its neighbors above are: one tool does not earn a
    // whole family pattern, and landing it here rather than the catch-all is
    // also what keeps that catch-all inside the bound `build.test.mjs` puts
    // on it.
    //
    // `wordpress-plugin-review-check` joined the same day. Same shape again
    // -- a browser-local checker plus a matching CLI, run by a developer
    // against their own PHP source and readme.txt they already have,
    // cross-checking a review-gating field (readme.txt's Stable tag against
    // the plugin header's Version) in both directions plus two more patterns
    // (unescaped superglobal output, a $_POST handler with no nonce check) --
    // just for a WordPress plugin's Plugin Directory submission instead of a
    // Chrome/iOS/npm/Actions artifact. It cross-links both
    // `chrome-extension-permission-check` and `ios-privacy-manifest-check` as
    // Related (same "cross-check a platform-review-gating manifest/header
    // against real source" question, a third platform). Listed by exact slug
    // rather than a new prefix, the same way its neighbors above are: one
    // tool does not earn a whole family pattern, and landing it here rather
    // than the catch-all is also what keeps that catch-all inside the bound
    // `build.test.mjs` puts on it.
    //
    // `cors-misconfig-check` joined 2026-09-10. Same shape again -- a
    // zero-dependency CLI plus a matching browser report-viewer, run by a
    // developer against their own API's response headers -- just for a live
    // network probe (crafted Origin headers) rather than a static
    // source/manifest/config file a maintainer already has. It is the first
    // member here where the browser page cannot run the check itself at
    // all (Origin is a forbidden request header a page can never set), so
    // its "browser" half only ever renders a report the CLI produced. It
    // cross-links `actions-injection-check` and `pinned-actions-check` as
    // Related (same "read what's actually there, name the exact evidence"
    // question, a different vulnerability class). Listed by exact slug
    // rather than a new prefix, the same way its neighbors above are: one
    // tool does not earn a whole family pattern, and landing it here rather
    // than the catch-all is also what keeps that catch-all inside the bound
    // `build.test.mjs` puts on it.
    //
    // `merchant-feed-check` joined 2026-09-10. Same shape again -- a
    // browser-local checker plus a matching CLI, run against a data file the
    // operator already has, reporting exactly which rows fail the published
    // specification -- just for a Google Merchant Center / Meta Catalog
    // product feed instead of a source/manifest/config artifact. The CLI is
    // positioned the same way as every member above it: wired into a deploy
    // pipeline as a gate run before the feed syncs, not a one-off web-form
    // upload. It cross-links `structured-data-drift-check` as Related (the
    // other representation of a product Google's Shopping features read).
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are: one tool does not earn a whole family pattern,
    // and landing it here rather than the catch-all is also what keeps that
    // catch-all inside the bound `build.test.mjs` puts on it.
    // `sri-check` joined 2026-09-10. Same shape again -- a zero-dependency
    // CLI plus a matching browser page, run by a developer against their
    // own page's cross-origin tags -- just for a live network probe
    // (re-fetching each declared-integrity asset to check the hash still
    // matches) rather than a static source/manifest/config file, the same
    // "browser can't do the full check itself" split `cors-misconfig-check`
    // established (reading another origin's response body is CORS-gated).
    // Unlike every member above it, its browser half is not only a report
    // viewer: the standalone hash generator half needs no CLI and no fetch
    // at all, since it only hashes content pasted in. It cross-links
    // `cors-misconfig-check` as Related (same "real fetch, name the exact
    // evidence" question, a different tag-and-response risk). Listed by
    // exact slug rather than a new prefix, the same way its neighbors above
    // are: one tool does not earn a whole family pattern, and landing it
    // here rather than the catch-all is also what keeps that catch-all
    // inside the bound `build.test.mjs` puts on it.
    //
    // `email-auth-check` joined 2026-09-10. Same shape again -- a zero-
    // dependency CLI plus a matching browser page, run against records the
    // operator already controls -- just for a domain's own SPF/DKIM/DMARC/
    // BIMI DNS TXT records (read live over public DNS-over-HTTPS) rather
    // than a source/manifest/config/feed artifact or an HTTP response
    // header. It shares `cors-misconfig-check`'s live-network-probe shape
    // (the browser page cannot make the DoH request that matters on its own
    // in `cors-misconfig-check`'s case; here it can, and does, since DNS
    // TXT lookups over DoH carry none of the forbidden-header restriction
    // that forces that venture's browser half to only render a pasted
    // report). It cross-links `dns-configuration-evidence` as Related (both
    // read a domain's own DNS records with nothing uploaded, one diffing a
    // named set of records over time, the other checking one specific
    // record family at a point in time) and `ai-crawler-access-check` (both
    // read what a domain's own public-facing configuration already says,
    // one about crawler access, the other about who may send mail as it).
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are: one tool does not earn a whole family pattern,
    // and landing it here rather than the catch-all is also what keeps that
    // catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `security-headers-check` joined 2026-09-10, the same day. Same shape
    // again -- a zero-dependency CLI plus a matching browser report-viewer,
    // run by a developer against their own site's response headers -- just
    // for Content-Security-Policy and X-Frame-Options/frame-ancestors
    // instead of a reflected CORS Origin or a cross-origin tag's integrity
    // hash. It shares `cors-misconfig-check`'s "browser half only renders a
    // pasted report" shape for the same underlying reason (a page checking
    // an arbitrary third-party URL runs into the same cross-origin
    // restriction its own subject enforces). It cross-links
    // `cors-misconfig-check` and `sri-check` as Related (same "real
    // request, name the exact response-header evidence" question, a third
    // header-and-tag risk class). Listed by exact slug rather than a new
    // prefix, the same way its neighbors above are: one tool does not earn
    // a whole family pattern, and landing it here rather than the catch-all
    // is also what keeps that catch-all inside the bound `build.test.mjs`
    // puts on it.
    //
    // `pwa-installability-check` joined 2026-09-10. Same shape again -- a
    // zero-dependency CLI plus a matching browser page, run against a
    // page/manifest/icon set the developer already has -- just for a Web App
    // Manifest's installability fields instead of an npm/Actions/iOS/DNS
    // supply-chain artifact. It shares `chrome-extension-permission-check`'s
    // and `ios-privacy-manifest-check`'s "read a manifest file, cross-check
    // it against a fixed platform-published checklist" shape, and cross-
    // links `chrome-extension-permission-check` as Related for that reason.
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are: one tool does not earn a whole family pattern,
    // and landing it here rather than the catch-all is also what keeps that
    // catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `docker-base-image-pin-check` joined 2026-09-10. Same shape again -- a
    // zero-dependency CLI plus a matching browser page, run against a
    // Dockerfile the developer already has -- just for a container base
    // image's `FROM` reference instead of a GitHub Actions `uses:` line. It
    // shares `pinned-actions-check`'s exact "mutable tag vs. immutable
    // pinned reference" question, applied to a different supply-chain
    // surface, and cross-links it as Related for that reason. Listed by
    // exact slug rather than a new prefix, the same way its neighbors above
    // are: one tool does not earn a whole family pattern, and landing it
    // here rather than the catch-all is also what keeps that catch-all
    // inside the bound `build.test.mjs` puts on it.
    //
    // `social-preview-check` joined 2026-09-10, and landing it here (rather
    // than the catch-all, which the guard below caps) is the same call as
    // its siblings above: a zero-dependency CLI + browser report-viewer that
    // sends real requests and classifies a fixed, named set of patterns --
    // here Open Graph/Twitter Card tags and an image file's own byte header,
    // rather than a response header or a manifest field. It is not filed
    // under `solo-earner` the way `affiliate-disclosure-checker` is: that
    // tool protects one creator's own account-earned income specifically,
    // while this one checks how a link renders for any web developer or
    // marketer, which is the `ci` family's audience.
    //
    // `cookie-security-check` joined 2026-09-10, the same day. Same shape
    // again -- a zero-dependency CLI plus a matching browser report-viewer,
    // run by a developer against their own site's response headers -- just
    // for Set-Cookie attributes (SameSite=None without Secure, a broken
    // __Host-/__Secure- prefix) instead of CSP/frame-ancestors, a reflected
    // CORS Origin, or a cross-origin tag's integrity hash. It shares
    // `security-headers-check`'s "browser half only renders a pasted
    // report" shape for the same underlying reason, and that venture's own
    // README names cookie flags as the gap this one fills. It cross-links
    // `security-headers-check` and `cors-misconfig-check` as Related (same
    // "real request, name the exact response-header evidence" question, a
    // fourth header risk class), and `security-headers-check` now links
    // back the same way. Listed by exact slug rather than a new prefix, the
    // same way its neighbors above are: one tool does not earn a whole
    // family pattern, and landing it here rather than the catch-all is also
    // what keeps that catch-all inside the bound `build.test.mjs` puts on
    // it.
    //
    // `oidc-trust-policy-check` joined 2026-09-10, the same day. Same shape
    // once more, and it is the first here to read the *cloud* side of a
    // GitHub Actions trust boundary rather than the repository side:
    // `actions-permissions-check` and `actions-self-hosted-exposure-check`
    // scan the workflow file, and this reads the AWS IAM trust policy those
    // workflows authenticate against. It cross-links both of them as
    // Related for exactly that reason -- same boundary, opposite ends of
    // the handshake. Unlike its neighbors it needs no CLI-then-paste round
    // trip, because its input is a document the user already has rather
    // than something that must be fetched over the network; the CLI exists
    // for CI rather than to work around a browser restriction. Listed by
    // exact slug rather than a new prefix, the same way its neighbors
    // above are.
    //
    // `canonical-tag-check` joined 2026-09-10, the same day. Same shape
    // again -- a zero-dependency CLI plus a matching browser report-viewer,
    // run by a developer or SEO practitioner against a URL they choose --
    // just for a page's own `<link rel=canonical>` tag(s) and (when there
    // is exactly one) the page that tag points at, rather than a live
    // network probe of response headers or a static source/manifest/feed
    // artifact. It shares `cors-misconfig-check` and
    // `security-headers-check`'s "browser half only renders a pasted
    // report" shape, for the same underlying reason: reading another
    // origin's response body from inside a page is CORS-gated. It
    // cross-links `structured-data-drift-check` (both ask "does what
    // search engines actually read still match what the page claims", one
    // about JSON-LD text, the other about which URL is canonical) and
    // `security-headers-check` (a fourth response-evidence class) as
    // Related. Listed by exact slug rather than a new prefix, the same way
    // its neighbors above are: one tool does not earn a whole family
    // pattern, and landing it here rather than the catch-all is also what
    // keeps that catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `cache-control-check` joined 2026-09-10, the same day. Same shape
    // once more -- a zero-dependency CLI plus a matching browser report-
    // viewer, run by a developer against their own site's response headers
    // -- just for HTTP caching headers (Vary, Cache-Control, Expires,
    // ETag) instead of CSP/frame-ancestors, Set-Cookie attributes, or a
    // reflected CORS Origin. It shares `security-headers-check` and
    // `cookie-security-check`'s "browser half only renders a pasted
    // report" shape for the same underlying reason, and cross-links both
    // as Related (same "real request, name the exact response-header
    // evidence" question, a fifth header-evidence class). Listed by exact
    // slug rather than a new prefix, the same way its neighbors above are.
    //
    // `hreflang-reciprocity-check` joined 2026-09-11: a zero-dependency CLI
    // plus a matching browser page, run by a developer or SEO practitioner
    // against a page (and its hreflang alternates) they name -- just for
    // `<link rel=alternate hreflang>` reciprocity, ISO 639-1/ISO 3166-1 code
    // validity, x-default, self-reference and duplicate/conflicting values,
    // rather than JSON-LD text, a canonical tag, or a response header. It
    // shares `cors-misconfig-check`'s "browser half can't do the full
    // network check itself" split, for a related but distinct reason (a
    // cross-origin fetch usually can't be *read back*, rather than a
    // forbidden request header), and cross-links `canonical-tag-check` and
    // `structured-data-drift-check` as Related (a third and fourth "does
    // what a search engine actually reads still match what the page
    // claims" question). Listed by exact slug rather than a new prefix, the
    // same way its neighbors above are, and landing it here rather than the
    // catch-all is also what keeps that catch-all inside the bound
    // `build.test.mjs` puts on it.
    //
    // `sitemap-lastmod-freshness-check` joined 2026-09-11: a zero-dependency
    // CLI plus a matching browser page, run by a developer or SEO
    // practitioner against a sitemap.xml (and, via the CLI, every URL's live
    // response headers) they name -- just for a sitemap's own `<lastmod>`
    // format validity, plausibility, internal consistency, and freshness
    // against the live page's `Last-Modified` header, rather than a
    // page's `<head>` tags or a response header. It shares
    // `hreflang-reciprocity-check`'s "browser half can't do the full network
    // check itself" split, for a related but distinct reason (an unreadable
    // cross-origin response *header*, rather than an unreadable response
    // *body*), and cross-links `canonical-tag-check` and
    // `ai-crawler-access-check` as Related (a fifth and sixth "does the
    // crawl-facing evidence a search engine reads actually hold up" question).
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are, and landing it here rather than the catch-all is
    // also what keeps that catch-all inside the bound `build.test.mjs` puts
    // on it.
    //
    // `security-txt-check` joined 2026-09-16: a zero-dependency CLI plus a
    // matching browser page, run by a security engineer or platform team
    // against a `security.txt` they publish -- just for that file's own
    // conformance to RFC 9116 (a missing or expired `Expires`, a `Contact`
    // that is a bare address rather than a URI, a key pasted where an
    // `Encryption` URI belongs, a silently-ignored field name), rather than a
    // response header, a sitemap's `<lastmod>`, or a page's `<head>` tags. It
    // shares `sitemap-lastmod-freshness-check`'s "CLI does the real fetch,
    // browser half works from pasted text" split, for the same reason the
    // whole category has it -- and cross-links `security-headers-check` and
    // `email-auth-check` as Related.
    //
    // The one thing that distinguishes it from every other entry in this
    // category is worth recording, because it is the reason it was built:
    // every other checker here reports a state that stays fixed once fixed,
    // and this one reports a *deadline*. RFC 9116 makes `Expires` mandatory
    // and time-bound, so a file that passes today fails on its own with no
    // commit and no deploy -- which is the only venture in this catalogue
    // with a mechanical reason to be re-run rather than visited once.
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are (and note `security-headers-check` above does not
    // cover it: the regex is anchored, and these are two different slugs).
    //
    // `redirect-chain-check` joined 2026-09-11: a zero-dependency CLI plus a
    // matching browser page, run by a developer or SEO practitioner against
    // a URL they name -- just for the URL's own HTTP redirect chain (a
    // loop, an over-long chain, an HTTPS-to-HTTP downgrade, a temporary
    // status code used for a permanent scheme/host move, a dead-end error),
    // rather than a sitemap's `<lastmod>`, a page's `<head>` tags, or a
    // response header. It shares `sitemap-lastmod-freshness-check`'s "CLI
    // does the real network walk, browser half works from pasted evidence"
    // split, for a related but distinct reason (a browser's default
    // `fetch()` follows the whole chain and hides every intermediate hop,
    // while `redirect: "manual"` makes the response opaque and hides the
    // first hop's own status/Location instead -- either way the chain
    // itself, not just one header, is unreadable), and cross-links
    // `canonical-tag-check` and `security-headers-check` as Related (a
    // seventh "does this URL's own HTTP behaviour actually hold up" class).
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are, and landing it here rather than the catch-all is
    // also what keeps that catch-all inside the bound `build.test.mjs` puts
    // on it.
    //
    // `app-store-screenshot-check` joined 2026-09-11: a zero-dependency CLI
    // plus a matching browser page, run by an app developer against the
    // images they are about to attach to an App Store Connect or Google Play
    // listing -- just for those files' own container headers (an app icon
    // declaring an alpha channel or a tRNS chunk, an icon or feature graphic
    // at the wrong exact size, a HEIC or WebP wearing a .png extension, a
    // screenshot set whose members disagree about their dimensions, a count
    // past the store's per-set limit, Play's side-length and aspect-ratio
    // bounds), rather than a URL's HTTP behaviour, a page's `<head>` tags or
    // a response header. It is the first member of this family whose evidence
    // is **binary rather than text** -- every sibling above parses a
    // robots.txt, a sitemap, a header list or a JSON payload; this one reads
    // PNG `IHDR`/`tRNS` and JPEG `SOFn` bytes -- and it inverts the split
    // those siblings share: where `redirect-chain-check` and
    // `cors-misconfig-check` fall back to pasted evidence because a browser
    // tab is forbidden from doing the thing the check needs, a browser can
    // read a local file completely through the File API, so the page here is
    // the full check with nothing degraded and nothing uploaded. Cross-links
    // `ios-privacy-manifest-check` as Related (the other "catch it before the
    // store does, at the stage of the release where it is cheapest" check).
    // Listed by exact slug rather than a new prefix, the same way its
    // neighbors above are, and landing it here rather than the catch-all is
    // also what keeps that catch-all inside the bound `build.test.mjs` puts
    // on it.
    // `k8s-rollout-safety-check` joined 2026-09-11: the same browser-local
    // (and matching zero-dependency CLI) checker shape, run by a maintainer
    // against a file they already have, one stage further down the same
    // delivery pipeline its neighbours cover. `pinned-actions-check` asks
    // whether the workflow that builds the image is pinned,
    // `docker-base-image-pin-check` asks the same of the image's own `FROM`
    // lines, and this asks whether shipping that image drops live requests —
    // and it cross-links both as Related for exactly that reason. Listed by
    // exact slug rather than a new prefix, the same way its neighbours are,
    // and landing it here rather than the catch-all is also what keeps that
    // catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `llms-txt-generator` joined 2026-09-11, and it is the first member here
    // that is not a checker at all — it is a *generator*, producing the file
    // rather than grading one that already exists. `ai-crawler-access-check`
    // already carries a structural llms.txt *validator* as one small part of
    // a robots.txt-focused checker; this venture is the complementary half
    // that one deliberately left alone — building a correct llms.txt from a
    // Markdown docs tree, a sitemap.xml, or a hand-picked page list, then
    // validating its own output against the same shape. It cross-links
    // `ai-crawler-access-check` as Related (same convention, opposite job:
    // check one vs. build one) and shares this family's audience exactly —
    // the developer/site-owner deciding what a crawler or assistant should
    // read. Listed by exact slug rather than a new prefix, the same way its
    // neighbours above are, and landing it here rather than the catch-all is
    // also what keeps that catch-all inside the bound `build.test.mjs` puts
    // on it.
    //
    // `codeowners-shadow-check` joined 2026-09-11, the same day. Same shape
    // again — a browser-local checker plus a matching CLI, run by a
    // maintainer against a CODEOWNERS file and a file list they already
    // have, reporting exactly which rules never win ownership of anything
    // because a broader rule listed later always overrides them under
    // GitHub's last-match-wins resolution — just for review-routing
    // correctness instead of a workflow, a manifest, or a page's own
    // structured data. It shares this family's audience (a repository
    // maintainer hardening their own repo) exactly, and cross-links
    // `actions-permissions-check` and `repository-branch-hygiene` as
    // Related. Listed by exact slug rather than a new prefix, the same way
    // several of its neighbours above are: one tool does not earn a whole
    // family pattern, and landing it here rather than the catch-all is also
    // what keeps that catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `ai-coding-plan-cost-calculator` joined 2026-09-11, the same day. Not
    // a checker or a generator — a cost model, the same shape as
    // `actions-minutes-estimator` right above this family — but it shares
    // this family's exact audience: a developer deciding something about
    // their own AI-assisted coding setup, not a trade bid, a marketplace
    // fee, or a compliance evidence packet. It cross-links
    // `mcp-supply-chain-watch` as Related. Listed by exact slug rather than
    // a new prefix, the same way several of its neighbours above are, and
    // landing it here rather than the catch-all is also what keeps that
    // catch-all inside the bound `build.test.mjs` puts on it.
    //
    // `terraform-plan-secret-exposure-check` joined 2026-09-11: the same
    // browser-local (and matching zero-dependency CLI) checker shape as
    // `k8s-rollout-safety-check` and `docker-base-image-pin-check` right
    // above it, one stage earlier in the same delivery pipeline those two
    // cover — a `terraform plan` the CI/CD system is about to apply, rather
    // than the image or manifest that plan produces. Same audience exactly:
    // a platform engineer hardening their own pipeline, not a trade bid, a
    // marketplace fee, or a compliance evidence packet. It cross-links
    // `env-example-drift-check` as Related (both catch a config/secrets
    // hygiene gap before it reaches production, on different artifacts).
    //
    // `terraform-plan-blast-radius-check` joined it 2026-09-11, and the two
    // together are why this one *is* listed as a prefix (`terraform-plan-`)
    // rather than by exact slug: they read the same input file — the
    // structured plan from `terraform show -json` — and answer two
    // unrelated questions about it (what it would print in plaintext, and
    // what the apply would take away), so a third tool over that same file
    // is a family rather than a coincidence. Same audience as the rest of
    // this category: a platform engineer hardening their own pipeline. They
    // cross-link each other as Related.
    //
    // `obsidian-plugin-review-check` joined 2026-09-13. Same shape as
    // `chrome-extension-permission-check` and `wordpress-plugin-review-check`
    // right above it -- a browser-local checker plus a matching CLI, run by
    // a developer against their own manifest and source files they already
    // have, cross-checking a review-gating field (manifest.json's version
    // against versions.json) plus a security pattern
    // (innerHTML/outerHTML/insertAdjacentHTML) -- just for an Obsidian
    // community-plugin submission instead of a Chrome/WordPress/iOS/npm/
    // Actions artifact. It cross-links `chrome-extension-permission-check`
    // and `wordpress-plugin-review-check` as Related (same "cross-check a
    // platform-review-gating manifest against real source" question, a
    // fourth platform). Listed by exact slug rather than a new prefix, the
    // same way its neighbors above are: one tool does not earn a whole
    // family pattern, and landing it here rather than the catch-all is also
    // what keeps that catch-all inside the bound `build.test.mjs` puts on
    // it.
    //
    // `caption-quality-check` joined 2026-09-13, in the same graduation
    // commit, and sat in the catch-all because nothing above names its slug
    // or a caption-specific prefix. Same shape as every other entry in this
    // category: a browser-local checker plus a matching zero-dependency CLI
    // ("the CLI runs the same checks in your own CI"), run against a file the
    // developer already has (an SRT/WebVTT caption track instead of a
    // manifest or workflow file), reporting mechanically-verifiable
    // threshold violations rather than a determination -- its own FAQ says
    // this almost word for word: "Treat a clean report as evidence that the
    // mechanical thresholds are met, not as a substitute for reviewing the
    // captions yourself." That is this category's disclaimer posture, not
    // `evidence`'s: nothing here is a compliance record of a decision made,
    // it is a CI gate a maintainer wires into their own pipeline. Landing it
    // here rather than the catch-all is also what keeps that catch-all
    // inside the bound `build.test.mjs` puts on it.
    //
    // `cron-dst-drift-check` and `agent-instructions-drift-check` joined
    // 2026-09-17, and they were found the way that guard asks for — by
    // enumerating the catch-all rather than judging the one arrival that
    // tripped it. The arrival was `world-clock-widget`'s new browser surface,
    // which is not a developer tool at all; these two were already sitting
    // there, and both are this category exactly. `cron-dst-drift-check` ships
    // a CLI whose own page says "want this in CI before a deploy?" and whose
    // "Both subcommands exit 1 when they find DST risk, so either works as a
    // one-line CI check before a new scheduled job ships" is the category's
    // whole shape in one sentence. `agent-instructions-drift-check` reads an
    // AGENTS.md/CLAUDE.md against the repo it describes and reports the paths
    // that no longer resolve; its own scored hypothesis is that a maintainer
    // "will wire it into CI so the same PR that renames a script also has to
    // fix the instruction file that pointed at it". Both are browser-local
    // plus a matching zero-dependency CLI, run against files the developer
    // already has, reporting mechanical drift rather than a determination.
    // They sat in the catch-all only because neither slug matches a prefix
    // above — the same reason `license-drift-check` did.
    //
    // `openapi-breaking-change-check` joined 2026-09-17. Same shape as
    // `sbom-diff-check` and `sql-migration-lock-check` right above it -- a
    // browser-local checker plus a matching zero-dependency CLI, run by a
    // developer against files they already have (two OpenAPI 3.x documents
    // instead of two SBOMs or a SQL migration), classifying a structural
    // difference (a breaking API contract change) rather than making a
    // determination. It cross-links both siblings as Related, and
    // `sbom-diff-check` links back, closing the crawlable-orphan gap a new
    // venture with no existing sibling otherwise opens
    // (`platform/pages/siblings.test.mjs`). Listed by exact slug rather
    // than a new prefix, the same way `sbom-diff-check` is: one tool does
    // not earn a whole family pattern, and landing it here rather than the
    // catch-all is also what keeps that catch-all inside the bound
    // `build.test.mjs` puts on it.
    //
    // `required-checks-drift-check` joined 2026-09-17. Same shape as the
    // rest of this family -- a browser-local checker plus a matching
    // zero-dependency CLI, run by a maintainer against a required-checks
    // list and workflow YAML they already have, reporting exactly which
    // required status check name no job can ever report again -- just for
    // branch-protection drift instead of an npm/Actions/iOS/OpenAPI
    // artifact. It cross-links `pinned-actions-check` as Related (both are
    // free, browser-only GitHub Actions/branch-protection checkers), and
    // that link is reciprocal, closing the same crawlable-orphan gap a new
    // venture with no existing sibling otherwise opens. Listed by exact
    // slug rather than a new prefix, for the same reason as its neighbors.
    //
    // `subpath-robots-check` joined 2026-09-17, and it is filed here rather
    // than with the SEO tools for a specific reason: what it checks is a
    // deployment property, not a content one. Whether a site sits at an
    // origin root or under a path prefix is decided by where it was
    // published, so the reader who needs it is the person who set up the
    // hosting, and the fix (a custom domain, a CI gate on
    // `--fail-on-critical`) lives in the deploy pipeline. It cross-links
    // `sitemap-lastmod-freshness-check`, `ai-crawler-access-check` and
    // `canonical-tag-check` as Related -- all three assume the robots.txt or
    // sitemap they read is the governing one, which is the assumption this
    // venture tests -- closing the crawlable-orphan gap a new venture
    // otherwise opens. Listed by exact slug, same reason as its neighbors.
    //
    // `k8s-deprecated-api-check` joined 2026-09-17, right beside its one
    // named sibling. Same browser-local-plus-CLI shape, run by a platform
    // engineer against Kubernetes manifest YAML they already have, one
    // question further back in the same pipeline `k8s-rollout-safety-check`
    // covers: not "will this rollout drop requests" but "will the API
    // server even accept this manifest's apiVersion on the cluster version
    // I'm upgrading to." It cross-links `k8s-rollout-safety-check` as
    // Related both ways, closing the crawlable-orphan gap a new venture
    // with no existing sibling otherwise opens. Listed by exact slug, same
    // reason as its neighbors.
    //
    // `branch-protection-drift-check` joined 2026-09-17, beside
    // `required-checks-drift-check`. Same branch-protection surface, a
    // different question: not whether a required check *name* still
    // matches a job that would report, but whether the surrounding policy
    // (review counts, admin enforcement, force-push/deletion rules, which
    // checks are required at all) still matches what was declared. It
    // cross-links `required-checks-drift-check` as Related both ways,
    // closing the crawlable-orphan gap a new venture with no existing
    // sibling otherwise opens.
    //
    // `helm-values-schema-check` joined 2026-09-17, adjacent in the same
    // delivery pipeline one step further back: not "will the cluster
    // accept this apiVersion" but "does the chart's own values.yaml match
    // the schema it ships before you even render it." Same browser-local-
    // plus-CLI, read-only, never-fetch shape as its neighbors, applied to
    // a distinct, verified Helm behavior (Go's template engine returns the
    // zero value for an undeclared values.yaml key rather than erroring,
    // and helm lint enforces additionalProperties only when a schema sets
    // it to false, which most do not). It cross-links
    // `k8s-deprecated-api-check` as Related both ways, closing the
    // crawlable-orphan gap a new venture with no existing sibling
    // otherwise opens. Listed by exact slug, same reason as its neighbors.
    //
    // `k8s-resource-limits-check` joined 2026-09-24, adjacent to all three
    // existing `k8s-`/Helm siblings but asking a question none of them ask:
    // not "will this rollout drop requests," not "will the cluster accept
    // this apiVersion," not "does values.yaml match its own schema," but
    // "can this container starve or crowd out everything else on its node."
    // Same browser-local-plus-CLI, read-only, never-fetch shape, applied to
    // Kubernetes' own documented node-pressure eviction, OOM, and CFS CPU-
    // throttling behavior. It cross-links `k8s-rollout-safety-check` and
    // `k8s-deprecated-api-check` as Related, closing the crawlable-orphan
    // gap a new venture with no existing sibling otherwise opens. Listed by
    // exact slug, same reason as its neighbors.
    // `deploy-concurrency-check` joined 2026-09-17. Same browser-local-plus-
    // CLI shape as the `actions-` family it sits with, reading workflow YAML
    // the maintainer already has -- but one step past what the rest of that
    // family asks. They ask whether a workflow is *safe to run* (injection,
    // over-broad permissions, an unpinned action, a poisoned cache). This one
    // asks whether running it twice puts the right revision live: a missing
    // or per-run `concurrency:` group, `cancel-in-progress` on a deploy, two
    // workflows writing one environment under different group names, a
    // deploying job checking out a moving branch. That is a delivery-ordering
    // question rather than a supply-chain one, which is why no existing
    // `actions-` checker covers it. It cross-links `pinned-actions-check` and
    // `actions-permissions-check` as Related, reciprocally, closing the
    // crawlable-orphan gap a new venture otherwise opens. Listed by exact
    // slug, same reason as its neighbors.
    // `docker-build-secrets-check` joined 2026-09-17. Same browser-local
    // (and matching zero-dependency CLI) checker shape as
    // `docker-base-image-pin-check`, reading the same Dockerfile for a
    // different risk: whether an ENV/ARG name looks like a secret or a
    // COPY/ADD names a credential file, rather than whether FROM is pinned
    // to a digest. It cross-links `docker-base-image-pin-check` (reciprocally,
    // in the same commit), `terraform-plan-secret-exposure-check`, and
    // `actions-secret-leak-check` as Related, closing the crawlable-orphan
    // gap a new venture otherwise opens. Listed by exact slug, same reason
    // as its neighbors.
    // `docker-cache-order-check` joined 2026-09-17. A third Dockerfile
    // checker reading the same file for a third, independent question:
    // not FROM pinning, not leaked secrets, but whether instruction *order*
    // busts the build cache (a manifest copied/installed after a
    // whole-context `COPY . .`, or `apt-get update` split from `install`
    // across layers). It cross-links `docker-base-image-pin-check` and
    // `docker-build-secrets-check` as Related, reciprocally, closing the
    // crawlable-orphan gap a new venture otherwise opens. Listed by exact
    // slug, same reason as its neighbors. (Also what keeps the catch-all
    // guard in `build.test.mjs` from tripping — a `docker-` prefix alone
    // isn't in this regex, so a new Dockerfile checker still needs its
    // exact slug added here.)
    // `supabase-rls-check` joined 2026-09-23, filed here on its first commit
    // rather than after a spell in the catch-all -- what `build.test.mjs`'s
    // catch-all bound is for. Same browser-plus-CLI, "read what's actually
    // there, name the exact evidence" shape as the rest of this section, run
    // by a developer against their own project -- just for a Supabase
    // project's live PostgREST schema and per-table read access instead of a
    // source file, response header, or workflow YAML. It cross-links
    // `cors-misconfig-check`, `security-headers-check`, and
    // `dependency-confusion-check` as Related, reciprocally, closing the
    // crawlable-orphan gap a new venture otherwise opens. Listed by exact
    // slug, same reason as its neighbors.
    // `firebase-rules-check` joined 2026-09-23, filed here on its first
    // commit rather than after a spell in the catch-all -- same reasoning
    // as `supabase-rls-check` immediately above: same browser-plus-CLI,
    // "read what's actually there, name the exact evidence" shape, run by
    // a developer against their own project -- just for a Firebase
    // project's Realtime Database and named Firestore collections instead
    // of a Supabase project's PostgREST schema. It cross-links
    // `supabase-rls-check`, `cors-misconfig-check`, and
    // `security-headers-check` as Related, reciprocally, closing the
    // crawlable-orphan gap a new venture otherwise opens. Listed by exact
    // slug, same reason as its neighbors.
    //
    // `source-map-leak-check` joined 2026-09-23 concurrently, same session
    // as `supabase-rls-check`. Same "read what's actually there, name the
    // exact evidence" checker shape again, for a different exposure class:
    // whether a script's own trailing sourceMappingURL comment points at a
    // publicly readable production source map, and whether that map embeds
    // full original source text or only file paths. It cross-links
    // `cors-misconfig-check`, `security-headers-check`, and
    // `docker-build-secrets-check` as Related, reciprocally, closing the
    // crawlable-orphan gap a new venture otherwise opens. Listed by exact
    // slug, same reason as its neighbors.
    //
    // `android-data-safety-check` moved here 2026-09-23, restoring the bound
    // `voiceover-project-rate-calculator`'s arrival (a creator/freelance
    // pricing tool, no honest home in this section) tripped. The trades
    // comment block above already named this exact move and deliberately
    // deferred it -- its own `VENTURE.yaml` calls it "the direct Android-side
    // counterpart to `ios-privacy-manifest-check`", which is filed here, and
    // it is the same browser-plus-CLI "read a manifest you already have, name
    // the exact undeclared category" shape as the rest of this section. Doing
    // the move now is what that comment asked the next session that needed
    // the slot to do, rather than raising the bound instead.
    //
    // `graphql-introspection-exposure-check` joined 2026-09-23, filed here on
    // its first commit rather than left for a later move -- the same
    // "read what's actually there, name the exact evidence" checker shape as
    // `cors-misconfig-check`, `security-headers-check`, `supabase-rls-check`,
    // `firebase-rules-check`, and `source-map-leak-check`, for a GraphQL
    // endpoint's introspection exposure rather than a response header, a
    // database table, or a source map. It cross-links `cors-misconfig-check`
    // and `supabase-rls-check` as Related, reciprocally (a link added to
    // `cors-misconfig-check`'s own footer, not just this one, so the pair
    // closes the crawlable-orphan gap a new venture otherwise opens).
    //
    // `git-exposure-check` joined 2026-09-23, concurrently: the same "read
    // what's actually there, name the exact evidence" shape as
    // `cors-misconfig-check` and `security-headers-check` (two real GET
    // requests, response classified against a fixed decision table), just
    // reading a response body instead of headers. Its slug does not start
    // with a keyword this rule already recognised, so it would otherwise
    // have swelled the catch-all the way `supabase-rls-check` once did.
    //
    // `dotenv-exposure-check` joined 2026-09-23, the same session: the same
    // "read what's actually there, name the exact evidence" shape as
    // `git-exposure-check` immediately above -- five real GET requests to a
    // site's own well-known dotenv paths, the response body classified
    // against the real KEY=VALUE line shape rather than just an HTTP status.
    // Its slug does not start with a keyword this rule already recognised
    // either, so it landed in the catch-all on its first commit and pushed
    // it past `build.test.mjs`'s bound the same way `git-exposure-check`
    // would have on its own. It cross-links `git-exposure-check` as Related
    // (same family, a different static-file exposure class).
    //
    // `subdomain-takeover-check` joined 2026-09-23: the same "read what's
    // actually there, name the exact evidence" shape as `git-exposure-check`
    // and `dotenv-exposure-check` immediately above -- a real DNS lookup
    // plus one real GET request, the response classified against a
    // provider's own fingerprint rather than escalated from the DNS match
    // alone. Its slug does not start with a keyword this rule already
    // recognised, so it landed in the catch-all on its first commit and
    // pushed it past `build.test.mjs`'s bound the same way its two
    // predecessors above did.
    //
    // `slopsquatting-check` joined 2026-09-24: the same "browser-local
    // checker plus a matching CLI, run by a developer against a manifest
    // they already have" shape as `license-drift-check`,
    // `npm-lifecycle-script-check`, and `dependency-confusion-check` --
    // just for a dependency name that looks hallucinated or freshly
    // squatted instead of a declared license, an install-time script, or a
    // registry-substitution config mistake. It cross-links
    // `dependency-confusion-check` and `npm-lifecycle-script-check` as
    // Related, reciprocally. Its slug does not start with a keyword this
    // rule already recognised, so it would otherwise have landed in the
    // catch-all on its first commit.
    //
    // `cloud-bucket-exposure-check` also joined 2026-09-24, concurrently on
    // `main`, same shape again: one real read-only request to a cloud
    // provider's own anonymous bucket-listing endpoint, classified against
    // that provider's documented response body rather than a bare status
    // code. Filed here on its first commit rather than after a spell in
    // the catch-all, the lesson `build.test.mjs`'s bound and this rule's
    // own history exist to encode.
    //
    // `backup-file-exposure-check` joined 2026-09-24: the same "read what's
    // actually there, name the exact evidence" shape as `git-exposure-check`
    // and `dotenv-exposure-check` -- real GET requests to a site's own
    // well-known paths, the response classified against a real archive's
    // magic bytes or a real SQL dump's line shape rather than a bare status
    // code, just for backup archives and database dumps instead of
    // git-internal plumbing or a dotenv file. Filed here on its first commit
    // rather than after a spell in the catch-all. It cross-links both as
    // Related (same static-file exposure family, different file classes).
    //
    // `llm-api-pricing-calculator` joined 2026-09-24: same audience as
    // `ai-coding-plan-cost-calculator` above (a developer sizing what an
    // LLM API costs them), just the cross-provider raw-token-pricing
    // comparison instead of one vendor's subscription-vs-API question. Its
    // footer already cross-links `ai-coding-plan-cost-calculator`
    // reciprocally. Filed here on its first commit rather than after a
    // spell in the catch-all, the lesson `build.test.mjs`'s bound and this
    // rule's own history exist to encode.
    //
    // `mcp-config-risk-check` joined 2026-09-24, the same day: a maintainer
    // auditing a pasted MCP server launch config (mcp.json /
    // claude_desktop_config.json) for broad filesystem/shell access,
    // hardcoded secrets, missing version pins, and shadowed tool names --
    // the exact "browser-local checker plus a matching audience of a
    // maintainer hardening their own setup" shape as `actions-permissions-
    // check` and `agent-instructions-drift-check` above, just for an MCP
    // config instead of a workflow file or an instruction file. Its footer
    // already cross-links `mcp-supply-chain-watch` (a different question --
    // drift between two captured manifests over time, not a single config's
    // structural risk). Filed here on its first commit rather than after a
    // spell in the catch-all, the same lesson.
    //
    // `hidden-unicode-check` joined 2026-09-24, the same day: same
    // audience-hardening-their-own-AI-agent-setup shape as
    // `mcp-config-risk-check` and `agent-instructions-drift-check` right
    // above it, one more angle on the same file class -- not a stale
    // reference (agent-instructions-drift-check) or a risky launch config
    // (mcp-config-risk-check), but a character in the file's own bytes that
    // a human reviewer cannot see: a zero-width or Unicode Tag character
    // (decoded back to plaintext when found), or a bidirectional-override
    // character from the Trojan Source family. Its footer already
    // cross-links both `mcp-config-risk-check` (reciprocally, in the same
    // commit) and `agent-instructions-drift-check` as Related, closing the
    // crawlable-orphan gap a new venture otherwise opens. Filed here on its
    // first commit rather than after a spell in the catch-all, the same
    // lesson.
    //
    // `skill-manifest-check` joined 2026-09-24, the same day: same
    // audience-hardening-their-own-AI-agent-setup shape as
    // `mcp-config-risk-check` and `hidden-unicode-check` right above it, one
    // more file class in the same family -- not a launch config
    // (mcp-config-risk-check) or a hidden-character scan
    // (hidden-unicode-check), but a pasted SKILL.md agent-skill manifest
    // checked for missing/malformed frontmatter, a description too vague to
    // trigger reliably, overlapping triggers across sibling skills, and a
    // body-size context-budget caution. Its footer already cross-links
    // `mcp-config-risk-check` (reciprocally, in the same commit) and
    // `hidden-unicode-check` as Related. Filed here on its first commit
    // rather than after a spell in the catch-all -- `build.test.mjs`'s bound
    // is why: it would otherwise have been the sixth tool in `more`.
    //
    // `caa-record-check` joined 2026-09-24, the same day: same
    // read-a-domain's-own-public-DNS-records shape as `email-auth-check`
    // above it -- a zero-dependency CLI plus a matching browser page, live
    // DNS-over-HTTPS lookups only, nothing uploaded -- just for the CAA
    // record set governing certificate-authority issuance (RFC 8659's
    // tree-walk, the issuewild fallback, the critical-unknown-tag block)
    // instead of SPF/DKIM/DMARC/BIMI mail authentication. Its footer already
    // cross-links `email-auth-check`, `security-headers-check`, and
    // `subdomain-takeover-check` (the latter reciprocally, in the same
    // commit) as Related. Filed here on its first commit rather than after a
    // spell in the catch-all -- `build.test.mjs`'s bound is why: it would
    // otherwise have been the sixth tool in `more`.
    //
    // `claude-code-settings-check` joined 2026-09-24, the same day: same
    // audience-hardening-their-own-AI-agent-setup shape as
    // `mcp-config-risk-check`, `hidden-unicode-check`, and
    // `skill-manifest-check` above it, a fourth angle on the same file class
    // -- not a launch config, a hidden-character scan, or a skill manifest,
    // but Claude Code's own settings.json: a hook matcher regex that fails
    // to compile, a hook with no command, a permission rule with unbalanced
    // parentheses, and a rule that contradicts itself between settings.json
    // and settings.local.json. Its footer already cross-links all three
    // siblings as Related (reciprocally, in the same commit). Filed here on
    // its first commit rather than after a spell in the catch-all, the same
    // lesson.
    //
    // `claude-skill-scaffold-generator` joined 2026-09-24, the same day:
    // the generator half of the pair skill-manifest-check started as the
    // checker half -- skill-manifest-check validates an existing SKILL.md;
    // this tool produces a starting one from a plain-language description,
    // flagging a non-slug name, a first-person description, and a missing
    // trigger condition before the file exists. Its footer cross-links
    // skill-manifest-check, claude-code-settings-check, and
    // mcp-config-risk-check (reciprocally, in the same commit). Filed here
    // on its first commit rather than after a spell in the catch-all, the
    // same lesson.
    //
    // `claude-code-subagent-check` joined 2026-09-24, extending the same
    // cluster with the one Claude Code AI-agent-tooling file the four above
    // it leave unchecked: a subagent definition (.claude/agents/*.md) --
    // not a skill manifest (skill-manifest-check has no tools/model fields
    // and is loaded by name, not matched for delegation), a launch config
    // (mcp-config-risk-check), a hidden-character scan (hidden-unicode-
    // check), or Claude Code's own settings.json (claude-code-settings-
    // check). Checks: a malformed/mismatched name, a description too vague
    // for reliable orchestrator delegation, a malformed tools list, an
    // unrecognized model alias, and a missing/near-empty system prompt.
    // Its footer already cross-links all four siblings as Related
    // (reciprocally, in the same commit). Filed here on its first commit
    // rather than after a spell in the catch-all, the same lesson.
    // `npm-provenance-check` joined 2026-09-24, filed here on its first
    // commit rather than after a spell in the catch-all -- the same lesson
    // as claude-code-settings-check above. Same shape as its sibling
    // `npm-lifecycle-script-check`: a paste-a-snapshot (or plain package
    // list) checker plus a matching CLI, run by a maintainer against a
    // dependency tree they already have, reporting a different npm
    // registry supply-chain signal (whether a package was published with
    // a provenance attestation, rather than whether it runs an
    // install-time script). It cross-links npm-lifecycle-script-check and
    // slopsquatting-check as Related in its footer.
    //
    // `claude-code-hooks-security-check` and `pypi-provenance-check` moved
    // here 2026-09-25, out of the catch-all, when two concurrent sessions
    // each hit build.test.mjs's bound of 5 in the same window --
    // `mrr-waterfall-calculator` and `patreon-fee-calculator` both pushed
    // it to 6, and enumerating found the same fix independently both
    // times. Neither is a new prefix this list had never seen:
    // `claude-code-hooks-security-check` is the fourth sibling of
    // `claude-code-settings-check` and `claude-code-subagent-check` two
    // paragraphs up (same "read a Claude Code artifact you already have,
    // report a dangerous shape" checker family, just for the hooks config
    // rather than settings.json or an agent manifest), and
    // `pypi-provenance-check` is the PyPI-side counterpart to
    // `npm-provenance-check` immediately above (same provenance-attestation
    // lookup, a different package registry). Both were left un-added at
    // graduation, which is what let them sit in the catch-all rather than
    // beside their own siblings; enumerating the catch-all rather than
    // judging the new arrival in isolation is what found the fix, the same
    // method this file's own comments already record three times over for
    // this exact guard.
    //
    // `node-version-drift-check` joined 2026-10-12, filed here on its first
    // commit. A zero-dependency CLI plus browser tool that compares a repo's
    // own Node.js version declarations (engines.node, .nvmrc, Dockerfile,
    // setup-node) to each other and to a dated end-of-life table -- CI/build
    // hygiene next to `package-exports-drift-check` and the Docker checkers.
    // It cross-links `package-exports-drift-check` and
    // `docker-base-image-eol-check` as Related in its footer.
    //
    // `referrer-permissions-policy-check` joined 2026-09-25, filed here on
    // its first commit rather than after a spell in the catch-all -- the
    // same lesson. Same shape as `cors-misconfig-check` and
    // `cache-control-check` right above: a zero-dependency CLI plus a
    // matching browser report-viewer, sending one real GET request and
    // classifying the response's own headers -- just for Referrer-Policy
    // (an unsafe-url full-URL leak, an unrecognised or missing value) and
    // Permissions-Policy (a malformed structured-field allowlist, a
    // wildcard on a sensitive feature like camera/microphone, the
    // deprecated Feature-Policy header) rather than CSP, cookies, or
    // caching. No sibling venture reads either header. It cross-links
    // `security-headers-check` and `cookie-security-check` as Related in
    // its footer (reciprocal link not yet added to those two's own
    // footers -- left for a future pass, the same as several siblings
    // above that only cross-link one direction at graduation).
    //
    // `devsec-toolkit` joined 2026-10-16: one zero-dependency CLI that runs
    // 22 of the checks in this section (and k8s/docker/supply-chain ones)
    // over a whole repository, with one report, SARIF and baselines, plus a
    // browser viewer for that report. It belongs with the checks it wraps,
    // and landing it here keeps the catch-all inside its bound.
    //
    // `agent-workroom` joined 2026-10-24: a task board for the coding agents
    // the checks above configure, next to `agent-permission-config-check`
    // and `agent-instructions-drift-check`, which it links; landing it here
    // keeps the catch-all inside its bound.
    test: (slug) =>
      /^(jwt-security-check|page-seo-audit|actions-|workflow-audit|pinned-actions|coverage-drop-check|flaky-test-finder|ci-test-shard-balancer|datadog-bill-estimator|vercel-bill-estimator|neon-bill-estimator|cloudflare-bill-estimator|upstash-redis-bill-estimator|error-tracking-pricing-calculator|product-analytics-pricing-calculator|auth-mau-pricing-calculator|git-timesheet|email-api-pricing-calculator|ci-minutes-pricing-calculator|cdn-bandwidth-pricing-calculator|object-storage-pricing-calculator|search-api-pricing-calculator|training-gpu-pricing-calculator|uptime-monitoring-pricing-calculator|speech-to-text-pricing-calculator|video-hosting-pricing-calculator|log-management-pricing-calculator|feature-flag-pricing-calculator|merchant-of-record-fee-calculator|ppp-pricing-table-generator|llm-output-regression-diff|app-store-commission-calculator|sms-segment-cost-calculator|supabase-bill-estimator|webhook-signature-debugger|webhook-relay|ai-crawler-access|license-drift-check|license-compat-check|npm-lifecycle-script-check|npm-provenance-check|vscode-extension-drift-check|dependency-confusion-check|dependabot-config-check|slopsquatting-check|ios-privacy-manifest-check|android-data-safety-check|structured-data-drift-check|json-ld-rich-result-validator|env-example-drift-check|llm-call-cost-scan|llm-spend-guard|liability-audit|lambda-memory-rightsizer|k8s-requests-rightsizer|rds-instance-rightsizer|lambda-vs-fargate-cost-breakeven|dynamodb-capacity-mode-advisor|ebs-volume-cost-advisor|nat-gateway-cost-advisor|cloudwatch-logs-cost-advisor|bigquery-query-cost-advisor|snowflake-warehouse-cost-advisor|rds-instance-cost-advisor|databricks-cluster-cost-advisor|s3-storage-class-savings|s3-storage-class-advisor|postgres-explain-analyzer|pg-stat-statements-analyzer|postgres-index-auditor|prometheus-cardinality-cost|slo-burn-rate-alerts|regex-redos-check|package-exports-drift-check|chrome-extension-permission-check|wordpress-plugin-review-check|obsidian-plugin-review-check|caption-quality-check|cors-misconfig-check|merchant-feed-check|sri-check|email-auth-check|dmarc-report-reader|pwa-installability-check|security-headers-check|docker-base-image-pin-check|docker-base-image-eol-check|docker-build-secrets-check|docker-cache-order-check|node-version-drift-check|social-preview-check|cookie-security-check|oidc-trust-policy-check|canonical-tag-check|cache-control-check|hreflang-reciprocity-check|sitemap-lastmod-freshness-check|security-txt-check|redirect-chain-check|k8s-rollout-safety-check|k8s-deprecated-api-check|helm-values-schema-check|k8s-resource-limits-check|app-store-screenshot-check|app-listing-metadata-check|llms-txt-generator|release-notes-generator|json-to-types-generator|csv-to-sql-generator|codeowners-shadow-check|ai-coding-plan-cost-calculator|llm-api-pricing-calculator|aws-commitment-breakeven-calculator|aws-bill-change-explainer|llm-usage-log-analyzer|sql-migration-lock-check|terraform-plan-|sbom-diff-check|cron-dst-drift-check|cron-heartbeat|status-keeper|visit-keeper|dunning-engine|waitlist-keeper|license-keeper|mrr-pulse|rev-rec|feedback-board|form-inbox|cancel-flow|agent-instructions-drift-check|openapi-breaking-change-check|required-checks-drift-check|subpath-robots-check|deploy-concurrency-check|branch-protection-drift-check|supabase-rls-check|firebase-rules-check|source-map-leak-check|graphql-introspection-exposure-check|git-exposure-check|dotenv-exposure-check|subdomain-takeover-check|cloud-bucket-exposure-check|backup-file-exposure-check|mcp-config-risk-check|hidden-unicode-check|skill-manifest-check|caa-record-check|claude-code-settings-check|claude-skill-scaffold-generator|claude-code-subagent-check|claude-code-hooks-security-check|pypi-provenance-check|pip-audit-triage|cargo-audit-triage|referrer-permissions-policy-check|jwt-verification-misuse-check|docker-compose-security-check|git-bus-factor-check|lockfile-license-check|npm-audit-triage|npm-lockfile-duplicates-check|dupehound|requirements-pin-check|incident-postmortem-timeline|oncall-load-analyzer|soc2-readiness|k8s-pod-security-check|agent-permission-config-check|agent-workroom|s3-bucket-exposure-check|aws-iam-policy-risk-check|devsec-toolkit)/.test(
        slug,
      ),
  },
  {
    id: 'solo-earner',
    title: 'Creator & solo earner income',
    accent: '#7a3f8c',
    blurb:
      'What one person actually earns from their own work — a print, an ad slot, a delivery shift, a repo, a job application. Priced or checked before you commit to a number.',
    // Added 2026-09-08, because the catch-all guard asked for it: `More free
    // tools` had reached 10 and `build.test.mjs`'s bound exists to say the
    // taxonomy has stopped keeping up. Two prior sessions raised that bound
    // instead (8 -> 9), each correctly noting its own venture was not a
    // coherent cluster *on its own*. Enumerating the catch-all rather than
    // judging one arrival at a time shows the cluster was already there:
    // five of the ten share an axis no existing category has.
    //
    // That axis is the *earner*, not the subject. Every other category here
    // is small-business-facing (a trade, a marketplace seller, a back office)
    // or developer-facing. These five are one individual working out what
    // their own labour or audience is worth: a maker pricing a print, a
    // newsletter operator pricing an ad slot, a maintainer trying to attract
    // sponsors, a gig driver finding out what a shift actually netted after
    // costs, a job seeker checking whether a resume survives parsing. Someone
    // browsing for one of those is plausibly in the market for the others;
    // nobody browsing "Cleaning, restoration & insulation" is.
    //
    // Written as an exact slug list rather than a prefix family, unlike most
    // rules above. Those work because their members share a naming
    // convention (`actions-*`, `*-evidence`) that a future sibling will
    // inherit for free. This group's members are named for five unrelated
    // domains -- there is no prefix that catches `sponsor-ready` and
    // `gig-driver-net-pay-calculator` without also catching things that
    // belong elsewhere (`sponsor` alone would claim any sponsorship tool a
    // *business* uses). An exact list cannot silently steal a slug from a
    // section above it, and the cost is that a sixth member needs one line
    // here -- which the catch-all bound will ask for anyway.
    //
    // `affiliate-disclosure-checker` joined 2026-09-09: a blogger or content
    // creator checking their own published post for a missing or too-late
    // affiliate disclosure, protecting the same kind of self-earned income
    // `ats-resume-checker` protects (a job seeker's own resume) rather than
    // pricing anything -- the axis this section groups on is the earner, not
    // whether the tool is a calculator or a checker, and `ats-resume-checker`
    // is already the precedent for a checker-shaped member here.
    //
    // `candle-batch-cost-calculator` joined 2026-10-01: a candle or soap maker costing wax, fragrance and
    // their own hours across online, fair and wholesale sales is the same person as the maker above.
    // `pottery-piece-pricing-calculator` joined 2026-10-07 on its first commit: a potter costing clay, kiln firings and
    // breakage is the same maker as the candle or soap maker above.
    // `craft-fair-booth-calculator` joined 2026-09-10, and it is the clearest
    // member yet: a maker deciding whether one market booth is worth their
    // weekend is the same person as `3d-print-price-calculator`'s maker
    // pricing a print, asking the same question about the same labour at a
    // different moment. It is deliberately *not* in `service-pricing`
    // alongside `photo-booth-event-quote` and the route-margin tools, even
    // though all of them price an event: that section groups on a business
    // quoting work for a customer, and a maker has no customer to quote —
    // they are deciding what their own hours are worth against a booth fee
    // nobody negotiated with them.
    // `epk-generator` joined 2026-09-11: a musician or band assembling an
    // electronic press kit is the same move as `ats-resume-checker`'s job
    // seeker and `sponsor-ready`'s maintainer -- a self-presentation
    // document or profile built to attract someone else's booking,
    // employment, or funding decision, not a price and not a business
    // check. It shipped with an inbound sibling link to ats-resume-checker
    // from its first commit (see `siblings-budget.json`) rather than
    // landing in the catch-all, which is also what keeps that catch-all
    // inside the bound `build.test.mjs` puts on it.
    // `influencer-media-kit-generator` joined the same day: the same move
    // as `epk-generator` again, one step further along the same axis -- a
    // content creator's self-presentation document built to attract a
    // brand's sponsorship decision rather than a venue's booking decision.
    // Cross-linked with `epk-generator` in the same commit (each footer
    // names the other, with a page.test.mjs assertion on the href in both
    // ventures) rather than shipping as an orphan to close later.
    //
    // `brand-deal-rate-calculator` joined 2026-09-11, the same day: a social
    // media creator pricing a sponsored post from their own follower count
    // and engagement rate is the same move as `newsletter-sponsorship-rate-calculator`'s
    // newsletter operator pricing an ad slot -- an individual working out
    // what their own audience is worth, on a different channel. It shipped
    // with a reciprocal inbound sibling link from
    // `newsletter-sponsorship-rate-calculator`'s first commit rather than
    // landing in the catch-all, which is also what keeps that catch-all
    // inside the bound `build.test.mjs` puts on it.
    //
    // `cat-adjuster-fee-calculator` joined 2026-09-11: a 1099 independent
    // catastrophe claims adjuster deciding whether an IA firm's per-claim
    // fee schedule is worth a storm deployment is the same move as
    // `gig-driver-net-pay-calculator`'s gig driver -- an individual pricing
    // their own labour against costs nobody else carries, not a business
    // quoting a customer. It shipped with reciprocal inbound sibling links
    // from `medical-courier-route-margin` and `translator-project-quote`'s
    // first commits rather than landing in the catch-all, which is also
    // what keeps that catch-all inside the bound `build.test.mjs` puts on
    // it.
    //
    // `tutor-package-pricing-calculator` joined 2026-09-17, found by
    // enumerating the catch-all after a merge pushed it to 6 rather than by
    // judging either arrival alone: an independent tutor or coach deciding
    // whether a discounted prepaid session package still pays as well per
    // hour as billing per session is the same move as
    // `gig-driver-net-pay-calculator`'s gig driver and
    // `cat-adjuster-fee-calculator`'s adjuster -- one person pricing their
    // own labour, not a business quoting a customer.
    //
    // `freelance-writer-rate-calculator` joined 2026-09-25: a freelance
    // writer, copywriter, or ghostwriter comparing a per-word rate against a
    // flat project fee for the same job is the same move as
    // `voiceover-project-rate-calculator`'s voice-over artist and
    // `tutor-package-pricing-calculator`'s instructor -- one person pricing
    // their own labour from their own inputs (word count, research time,
    // revision rounds), not a business quoting a customer. It shipped with a
    // reciprocal inbound sibling link from `freelance-retainer-calculator`'s
    // first commit rather than landing as an orphan to close later --
    // freelance-retainer-calculator already links freelance-platform-fee-
    // calculator for the same reason (one self-employed writer's two pricing
    // decisions, an ongoing retainer vs. a single job).
    //
    // `podcast-sponsorship-rate-calculator` joined the same day: a third
    // creator-economy channel alongside `newsletter-sponsorship-rate-
    // calculator` (email opens) and `brand-deal-rate-calculator` (social
    // engagement) -- a podcaster pricing an ad slot from their own
    // downloads-per-episode figure, the same move on a different audience
    // and CPM market. Shipped with reciprocal inbound sibling links from
    // both of those ventures' first commits rather than landing in the
    // catch-all.
    //
    // `personal-trainer-package-pricing-calculator` joined 2026-09-23, found
    // by enumerating the catch-all after this new venture pushed it to 6
    // rather than by judging the arrival alone: an independent personal
    // trainer deciding whether a discounted prepaid session package still
    // pays as well per hour, net of a gym or studio's cut, as billing per
    // session is the same move as `tutor-package-pricing-calculator`'s
    // instructor -- one person pricing their own labour, not a business
    // quoting a customer. Shipped with a reciprocal inbound sibling link
    // from `tutor-package-pricing-calculator`'s own commit rather than
    // landing as an orphan, which is also what keeps the catch-all inside
    // the bound `build.test.mjs` puts on it.
    // `studio-class-slot-optimizer` joined 2026-09-30, filed here on its first
    // commit rather than after a spell in the catch-all (which it would have
    // pushed past the bound `build.test.mjs` puts on it). A studio owner
    // deciding which of their own timetable slots pay for the instructor is
    // the same move as `personal-trainer-package-pricing-calculator`'s
    // trainer checking what an hour earns -- one small fitness business
    // reading its own numbers. Shipped with a reciprocal inbound sibling link
    // from that venture.
    // `podcast-feed-check` joined 2026-09-23, landing here rather than in the
    // `ci` category above it: the axis this section groups on is the earner,
    // not whether the tool is a calculator or a checker (already established
    // by `affiliate-disclosure-checker`, which protects a blogger's own
    // earned income the same shape as `ats-resume-checker` protects a job
    // seeker's). A podcaster checking their own feed before publishing is
    // protecting their show's reach the same way an affiliate blogger checks
    // their own post before it costs them a disclosure violation -- and it
    // sits beside `podcast-sponsorship-rate-calculator`, the other tool for
    // the same solo-earner audience.
    //
    // `overtime-pay-calculator` and `voiceover-project-rate-calculator` both
    // joined 2026-09-24, found by enumerating the catch-all after a batch of
    // concurrent merges pushed it to 6 rather than by judging either arrival
    // alone (two sessions independently reached `voiceover-project-rate-
    // calculator` the same way; this is the merged reasoning for both).
    // `voiceover-project-rate-calculator` is the clearest kind of member
    // here: a freelance voice-over artist turning their own script word
    // count and the buyer's intended usage into a defensible project rate
    // is the same move as `tutor-package-pricing-calculator`'s instructor
    // and `cat-adjuster-fee-calculator`'s adjuster -- one person pricing
    // their own labour from their own inputs, not a business quoting a
    // customer. `overtime-pay-calculator` fits the other half of this
    // section's blurb, "priced or checked": an hourly employee checking
    // whether their own paycheck's blended overtime rate was computed
    // correctly is the same shape as `ats-resume-checker`'s job seeker and
    // `gig-driver-net-pay-calculator`'s gig driver checking what a shift
    // actually netted -- one person verifying what their own labour earned
    // them, not a business quoting a customer. (It also serves payroll
    // admins checking the same arithmetic for someone else, which is why it
    // is not a pure fit the way the others are -- but the individual-employee
    // audience is the one no other section covers.) The other two arrivals
    // in that same catch-all reading, `hoa-reserve-fund-calculator` (a board
    // treasurer's reserve-fund planning -- no customer quote, no individual
    // earner) and `world-clock-widget` (a general-purpose utility, not a
    // pricing or income question at all), share no axis with this section or
    // each other, so they stay in the catch-all rather than being forced in
    // here.
    // 2026-10-06: the six creator-earnings report analyzers below were filed in `backoffice` by prefix, which
    // pushed its gzipped offline bundle to 3.16 MB against the 3 MB bound. A creator reading their own
    // Gumroad, Fiverr, Upwork, Patreon, Bandcamp or indie-game payout export is this section's earner, so they
    // moved here (exact slugs, as the rest of this list) rather than the bound being raised.
    test: (slug) =>
      [
        // `mileage-deduction-calculator` and `proposal-maker` joined 2026-10-09 when landed. Back-office is over its 3 MB offline
        // bound; a self-employed filer's vehicle deduction and a freelancer's proposal are one person earning from their own work.
        'mileage-deduction-calculator',
        'proposal-maker',
        // Joined 2026-10-18 to bring the catch-all back under its bound: one person comparing their own aid letters / turning their own meeting notes into actions.
        'aid-award-letter-comparator',
        'meeting-action-items',
        // `wholesale-real-estate-offer-calculator`: one wholesaler pricing their own assignment deal; left the catch-all 2026-10-16.
        'wholesale-real-estate-offer-calculator',
        // `clergy-housing-allowance-calculator` joined 2026-10-10 on its first commit: one minister working out the tax-free share of their own pay.
        'clergy-housing-allowance-calculator',
        // `retreat-profit-pricing-calculator` joined 2026-10-09 on its first commit: one teacher or coach costing and pricing their own event.
        'retreat-profit-pricing-calculator',
        // `card-bonus-planner` joined 2026-10-09 on its first commit. Back-office is over its 3 MB offline bound on main; one person scheduling their own sign-up bonuses is an individual earning from their own spending, not a business back office.
        'card-bonus-planner',
        // `greenhouse-bench-planner` joined 2026-10-07 on its first commit. Back-office was at its 3 MB offline bound; a
        // grower selling transplants on fixed dates is one person pricing their own season's space.
        // `contract-vs-fte-rate-calculator` joined 2026-10-08 on its first commit: one person working out what a contract rate must be to match a salary.
        'contract-vs-fte-rate-calculator',
        // `mobile-home-park-valuation-calculator` joined 2026-10-08 on its first commit. Back-office was at its 3 MB offline bound; a small park owner or buyer
        // working out what their own asset is worth and what a rent increase adds is one person valuing their own income stream.
        'mobile-home-park-valuation-calculator',
        // `cell-tower-lease-buyout-calculator` joined 2026-10-08 on its first commit, same reason: one landowner weighing a buyout of their own lease income.
        'cell-tower-lease-buyout-calculator',
        // `pension-lump-sum-vs-annuity-calculator` joined 2026-10-08 on its first commit: one retiree weighing a buyout of their own pension income, beside the lease buyout tools.
        'pension-lump-sum-vs-annuity-calculator',
        // `fers-retirement-planner` joined 2026-10-09 on its first commit: one federal employee comparing retirement ages on their own pension, beside the pension buyout tool.
        'fers-retirement-planner',
        // `401k-plan-fee-calculator` joined 2026-10-10 on its first commit: filed here because `backoffice` is at its 3 MB gzipped offline bound; one plan sponsor sizing their own retirement plan's cost, beside the other retirement planners.
        '401k-plan-fee-calculator',
        // `tax-lot-sale-optimizer` joined 2026-10-08 on its first commit: one investor choosing which lots of their own holding to sell, beside the other single-person tax and income-timing tools.
        'tax-lot-sale-optimizer',
        // `mortgage-extra-payment-vs-invest-calculator` joined 2026-10-08 on its first commit: one homeowner deciding what to do with their own spare cash against their own loan, beside the other single-person money-decision tools.
        'mortgage-extra-payment-vs-invest-calculator',
        // `covered-call-wheel-calculator` joined 2026-10-08 on its first commit: one investor ranking option quotes on their own holding, beside the other single-person investing and income-timing tools.
        'covered-call-wheel-calculator',
        // `rent-vs-buy-breakeven-calculator` joined 2026-10-08 on its first commit: one household deciding whether to buy, beside the home-sale and mortgage tools.
        'rent-vs-buy-breakeven-calculator',
        // `car-lease-deal-checker` joined 2026-10-11 on its first commit: one shopper checking their own lease quote, beside the other single-household money-decision tools.
        'car-lease-deal-checker',
        // `home-sale-net-proceeds-calculator` joined 2026-10-11 on its first commit: one seller's net sheet and tax estimate, beside the other single-household money-decision tools.
        'home-sale-net-proceeds-calculator',
        // `roommate-rent-splitter` joined 2026-10-11 on its first commit: roommates dividing their own rent, beside the other single-household money-decision tools.
        'roommate-rent-splitter',
        // `funeral-price-list-checker` joined 2026-10-12 on its first commit: one family checking their own funeral quote line by line, beside the other single-household money-decision tools.
        'funeral-price-list-checker',
        // `cd-treasury-ladder-planner` joined 2026-10-08 on its first commit: one saver laddering their own cash, beside the other single-person investing and income-timing tools.
        'cd-treasury-ladder-planner',
        // `hsa-shoebox-reimbursement-planner` joined 2026-10-08 on its first commit: one HSA owner valuing their own unreimbursed receipts, beside the other single-person tax and income-timing tools.
        'hsa-shoebox-reimbursement-planner',
        // `student-loan-rap-ibr-standard-calculator` joined 2026-10-08 on its first commit: one borrower choosing between repayment plans on their own federal loans, beside the other single-person money-decision tools.
        'student-loan-rap-ibr-standard-calculator',
        // `charity-bunching-planner` joined 2026-10-08 on its first commit: one donor timing gifts into a donor-advised fund, beside the other single-person tax and income-timing tools.
        'charity-bunching-planner',
        // `structured-settlement-buyout-calculator` joined 2026-10-08 on its first commit: one payee weighing a factoring company's cash offer for settlement payments, beside the buyout tools.
        'structured-settlement-buyout-calculator',
        // `film-tax-credit-net-value-calculator` joined 2026-10-08 on its first commit: one producer turning their own production's incentive into net cash, the catch-all being at its bound.
        'film-tax-credit-net-value-calculator',
        // `mortgage-points-break-even-calculator` joined 2026-10-08 on its first commit: one buyer weighing points on their own loan estimate, beside the other lump-sum-for-income decisions.
        'mortgage-points-break-even-calculator',
        // `heloc-vs-cash-out-refinance-calculator` joined 2026-10-08 on its first commit: one homeowner pricing their own two ways to borrow against equity, beside the mortgage points tool.
        'heloc-vs-cash-out-refinance-calculator',
        // `oil-gas-mineral-rights-offer-calculator` joined 2026-10-08 on its first commit: one owner weighing a buyout of their own royalty income, beside the tower-lease tool.
        'oil-gas-mineral-rights-offer-calculator',
        // `tax-lien-certificate-yield-calculator` joined 2026-10-08: the catch-all hit its bound of 5 when it graduated; one investor working out the yield on their own certificate.
        'tax-lien-certificate-yield-calculator',
        'greenhouse-bench-planner',
        // `mushroom-fruiting-room-planner` joined 2026-10-07 on its first commit, same reason: back-office is at its bound,
        // and a grower deciding flushes, slots and starting cash for their own room is one person pricing their own farm.
        'mushroom-fruiting-room-planner',
        // `small-business-acquisition-calculator` joined 2026-10-06 on its first
        // commit. Its natural home, back-office, was already over the 3 MB
        // gzipped offline bound; what it answers is what one owner-operator
        // takes home after the loan on a business they are about to buy.
        'small-business-acquisition-calculator',
        // `cash-flow-risk-forecaster` and `freelance-editor-quote-calculator` joined 2026-10-06. Back-office was at
        // its 3 MB offline bound and the catch-all at its bound; a freelancer or owner-operator pricing their
        // own job or forecasting their own cash is this section's earner.
        'cash-flow-risk-forecaster',
        'freelance-editor-quote-calculator',
        // `installment-sale-tax-calculator` joined 2026-10-06 for the same reason: back-office was at the 3 MB
        // gzipped bound, and what it answers is what one seller nets, year by year, from selling their own business or
        // property for a note.
        'installment-sale-tax-calculator',
        // `invoice-maker` joined 2026-10-06 for the same reason (back-office at its 3 MB bound): a freelancer or sole proprietor
        // making the invoice for their own job.
        'invoice-maker',
        // `estimate-maker` joined 2026-10-07 beside it: the quote a freelancer or trade sends before the invoice, with win-rate tracking.
        'estimate-maker',
        // `time-tracker` joined 2026-10-07: the hours behind the invoice, handing unbilled time to Invoice Maker.
        'time-tracker',
        // `freelance-contract-maker` joined 2026-10-07: the service agreement a freelancer sends before the estimate, time and invoice.
        'freelance-contract-maker',
        // `freelance-proposal-maker` joined 2026-10-07: the priced proposal a freelancer sends before the contract.
        'freelance-proposal-maker',
        // `freelance-lead-tracker` joined 2026-10-07: the prospects and follow-ups in front of the proposal.
        'freelance-lead-tracker',
        // `sales-call-notes-desk` joined 2026-10-17 on its first commit: a seller or founder turning discovery-call notes into CRM fields, qualification gaps and the follow-up email, the step between the lead and the proposal.
        'sales-call-notes-desk',
        // `sales-cadence-builder` joined 2026-10-20 on its first commit: the multi-channel prospecting plan (email, call, LinkedIn, letter) for a list the seller already has, the step before the call notes.
        'sales-cadence-builder',
        // `sales-agent` joined 2026-10-21 on its first commit: the AI sales inbox agent after the cadence, sorting replies, honouring opt-outs and queueing drafts the seller approves.
        'sales-agent',
        // `rental-ledger` joined 2026-10-07: the records-and-Schedule-E home for the landlord calculators, which each answer one typed question and hold nothing.
        'rental-ledger',
        // `expense-tracker` joined 2026-10-07: the costs beside the hours and the invoice, grouped by Schedule C line.
        'expense-tracker',
        // `freelance-dashboard` joined 2026-10-07: one view over the four tools above, ranking what to chase, bill and set aside.
        'freelance-dashboard',
        // `freelancer-tax-pack` joined 2026-10-07: reads the three tools' records and answers what is owed and what to pay now.
        'freelancer-tax-pack',
        'indie-game-payout-calculator',
        'upwork-earnings-fee-analyzer',
        'patreon-members-churn-analyzer',
        'bandcamp-sales-report-analyzer',
        'fiverr-earnings-fee-analyzer',
        'gumroad-sales-fee-analyzer',
        '3d-print-price-calculator',
        'affiliate-disclosure-checker',
        'ats-resume-checker',
        'house-hack-calculator',
        'brand-deal-rate-calculator',
        // `ugc-creator-rate-calculator` joined 2026-10-13 on its first commit: a creator pricing content plus ad rights is the same solo earner as brand-deal-rate-calculator.
        'ugc-creator-rate-calculator',
        // `uk-sole-trader-vs-limited-company-calculator` joined 2026-10-13 on its first commit: one UK freelancer deciding whether to incorporate, the same solo earner.
        'uk-sole-trader-vs-limited-company-calculator',
        // `uk-mtd-income-tax-checker` joined 2026-10-13 on its first commit: UK sole traders and landlords checking their Making Tax Digital start date, the same solo earner.
        'uk-mtd-income-tax-checker',
        // `schengen-90-180-day-calculator` joined 2026-10-13 on its first commit: remote workers and nomads tracking Schengen days, the same solo earner.
        'schengen-90-180-day-calculator',
        'cat-adjuster-fee-calculator',
        'ad-slot-sell-through-planner',
        'candle-batch-cost-calculator',
        // `small-batch-run-size-optimizer` joined 2026-10-09 on its first commit: how big each run should be, beside the candle batch cost.
        'small-batch-run-size-optimizer',
        'pottery-piece-pricing-calculator',
        'craft-fair-booth-calculator',
        'epk-generator',
        // `prop-firm-challenge-calculator` joined 2026-10-12: a retail trader pricing a funded-account challenge fee against their own pass odds is one person deciding what their own risk-taking is worth.
        'prop-firm-challenge-calculator',
        'freelance-writer-rate-calculator',
        'freelance-editor-quote-calculator',
        'gig-driver-net-pay-calculator',
        'influencer-media-kit-generator',
        // `interview-content-studio` joined 2026-10-20: a creator or small business planning and drafting its own posts across platforms is one person building their own audience, beside the media kit and sponsorship-rate tools.
        'interview-content-studio',
        'newsletter-sponsorship-rate-calculator',
        'overtime-pay-calculator',
        'personal-trainer-package-pricing-calculator',
        'podcast-feed-check',
        'podcast-sponsorship-rate-calculator',
        // `publish-kit` joined 2026-10-20 beside its sibling `podcast-feed-check`: a podcaster or author building their own feed, EPUB or audiobook is one creator publishing their own work (it had landed in the catch-all, tripping its bound of 5).
        'publish-kit',
        // `youtube-sponsorship-rate-calculator` joined 2026-10-15 on its first commit: a creator pricing their own sponsored video is one person working out their own income.
        'youtube-sponsorship-rate-calculator',
        'sponsor-ready',
        // `section-1256-futures-tax-calculator` joined 2026-10-08 on its first commit: back-office was at its 3 MB offline bound,
        // and a futures trader pricing what the 60/40 rule leaves them is one person working out their own income.
        'section-1256-futures-tax-calculator',
        // `sep-ira-contribution-calculator` landed 2026-10-08 from a stranded branch: back-office was at its 3 MB offline bound,
        // and a self-employed filer sizing their own retirement contribution is one person working out their own income.
        'sep-ira-contribution-calculator',
        // `class-price-and-minimum-optimizer` joined 2026-10-09 on its first commit: a studio or tutoring centre setting its own seat price,
        // one hop from `studio-class-slot-optimizer` and `tutor-package-pricing-calculator`.
        'class-price-and-minimum-optimizer',
        'studio-class-slot-optimizer',
        'tutor-package-pricing-calculator',
        // `tutor-weekly-schedule-optimizer` joined 2026-10-09 on its first commit: the same one-to-one teacher as the package calculator, deciding which students to book when.
        'tutor-weekly-schedule-optimizer',
        // `tutoring-group-schedule-optimizer` joined 2026-10-19 on its first commit: the group-class case of the one-to-one timetable above, same centre owner.
        'tutoring-group-schedule-optimizer',
        // `rush-job-sequencer` joined 2026-10-09 on its first commit: a small shop ordering its own job queue, one hop from the scheduling optimizers above.
        'rush-job-sequencer',
        // `patreon-fee-calculator` and the two Social Security calculators were filed here 2026-10-09 because the catch-all hit 6:
        // each is one individual working out what their own creator income or benefit actually nets.
        'patreon-fee-calculator',
        'social-security-benefits-tax-calculator',
        'social-security-earnings-test-calculator',
        'voiceover-project-rate-calculator',
        // The three below joined 2026-10-15 when they got landing pages and the catch-all hit 8: one photographer or one frequent traveler running their own kit.
        'garmin-world-traveler-watchface',
        'photo-editing',
        'photos-import-tools',
        // `quick-pick-survey` joined 2026-10-15 when it got a landing page and the catch-all hit 6: a survey engine, one hop from the individual-decision tools above.
        'quick-pick-survey',
      ].includes(slug),
  },
  {
    // Added 2026-10-20 with the first tools of "research algorithms as free
    // tools" (portfolio/research-tools/README.md): methods from published
    // papers run on the visitor's own data. Listed by name; add a slug here
    // when a tool lands, as that README says.
    id: 'research-algorithms',
    title: 'Research algorithms & ML',
    accent: '#5b3f8c',
    blurb: 'Methods from published research papers, run on your own data in your browser and cited: changepoint detection, conformal prediction intervals, matrix-profile motifs and anomalies. Also callable from the command line and by AI agents.',
    test: (slug) => RESEARCH_ALGORITHM_SLUGS.includes(slug),
  },
  {
    // Added 2026-10-19 when `hands-free-language-coach` and
    // `listen-and-learn-audio` took the catch-all to 6. Listing it showed a
    // third member on the same axis, `ai-engineering-academy`: tools for one
    // person learning a skill, rather than earning, pricing or checking.
    id: 'learning',
    title: 'Learning & practice',
    accent: '#127a4b',
    blurb: 'Learn a language or a technical skill by doing it: hands-free speaking drills, graded audio stories, and project-first engineering lessons, free in your browser. Plus free stories to read or listen to.',
    // `hearth-and-horizon` joined 2026-10-20: free stories with audio and
    // podcast feeds, the same read-and-listen axis as the graded stories.
    // `saints-by-candlelight` joined 2026-10-28, when it and
    // `wall-framing-takeoff` took the catch-all to 6: a bedtime podcast of
    // saints' stories, the same read-and-listen axis as `hearth-and-horizon`.
    test: (slug) => ['ai-engineering-academy', 'hands-free-language-coach', 'listen-and-learn-audio', 'hearth-and-horizon', 'saints-by-candlelight'].includes(slug),
  },
  {
    // Added 2026-10-21 when `open-floor-robots` and `open-robot-mower` took
    // the catch-all to 7. Listing it put `open-tennis-robots` on the same
    // axis: a machine to build, with CAD, firmware and a fabrication package,
    // rather than a calculation about money or a check on a file.
    // `open-house-plans` joined 2026-10-21 on its first commit, which took the
    // catch-all to 6: on the same axis, a thing to build from open files
    // (public-domain plan sets with DXF, IFC and a bill of materials).
    id: 'open-hardware',
    title: 'Open hardware, robots & house plans',
    accent: '#7a4a12',
    blurb: 'Things you can build, change and sell: MIT-licensed robot CAD with laser-cut and 3D-print files, firmware, bills of materials and a browser simulator for each (a robot vacuum and mop, a robotic lawn mower, tennis ball robots), and a generator of public-domain house plans with drawings, IFC and DXF.',
    test: (slug) => ['open-floor-robots', 'open-robot-mower', 'open-tennis-robots', 'open-house-plans'].includes(slug),
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
 * category (8 total, named by a stable id) rather than one per tool (164,
 * named by a title that renames): a rebrand or a retitled tool never breaks
 * this filename, and a share into the roofing group and a share into the
 * marketplace-fee thread render as visibly different cards without anyone
 * drawing 164 of them. The card itself is drawn by `sharecard.mjs`, with the
 * category's name as its headline on the category's accent.
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

/**
 * What a tool's share card draws: its name under its category, on the
 * category's colour. Exported so the tests render the same card the build does.
 */
export function toolCardOptions(surface, { baseUrl = '' } = {}) {
  const category = categoryFor(surface.slug);
  return {
    accent: category.accent,
    headline: cardTitle(surface.title),
    kicker: category.title,
    // Sponsor Ready's own card gets the exception footer — its whole job is a
    // live lookup, so "nothing you type is uploaded" is the one claim this
    // card must not make. See `CARD_FOOTER_EXCEPTION`.
    footer: surface.externalFetchHosts?.length ? CARD_FOOTER_EXCEPTION : CARD_FOOTER,
    address: siteAddress(baseUrl),
  };
}

/** What a category (or audience, or kind) page's share card draws. */
export function categoryCardOptions(category, { footer = CARD_FOOTER, baseUrl = '' } = {}) {
  return {
    accent: category.accent,
    headline: category.title,
    kicker: 'Free tools',
    footer,
    address: siteAddress(baseUrl),
  };
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

// Both support links live in site-nav.mjs, beside the footer that carries them.
export { SPONSORS_URL, BUY_ME_A_COFFEE_URL, sponsorsNote };
// The repository the site is built from, named in the hub's Organization data.
export const REPO_WEB_URL = 'https://github.com/Duncan-Haywood/oss-monorepo';

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

// Both support links count as one event: the question is whether anyone
// supports the work, not which button they pressed.
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SPONSOR_ANCHOR_RE = new RegExp(
  `<a\\b([^>]*\\bhref="(?:${escapeRe(SPONSORS_URL)}|${escapeRe(BUY_ME_A_COFFEE_URL)})[^"]*"[^>]*)>`,
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

// The optional-support line (`sponsorsNote`, site-nav.mjs) rides in
// `renderSiteFooterNav`, so every site-owned page that ends in the shared link
// row carries it — the category hubs and comparison pages included, which a
// stranger arriving from search lands on first (21 of them had none when
// measured on 2026-09-06). Tool pages get it from the chrome footer below.

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
/**
 * The plain text of a fragment, with the entity spellings a heading uses folded
 * to one form: `&rsquo;` and `&#8217;` both become a straight `'`.
 *
 * Exported because the containment check that keeps the comparison index honest
 * — "every product name it prints is text the linked page contains" — has to
 * normalise *both* sides or it is comparing a decoded subject against raw
 * markup. It did exactly that until 2026-09-07, and passed only because
 * `vs-amazon-kdp-royalty-calculator.html` happened to carry the straight-quote
 * spelling in its FAQ JSON-LD while its `<h1>` used `&rsquo;`. Correcting that
 * JSON-LD to match the visible copy removed the coincidence and the check went
 * red on a page that had never misnamed anything.
 *
 * A caller that re-spelled this normaliser instead of importing it would be the
 * fourth instance of the mistake CLAUDE.md records under "168 became 169".
 */
export function comparisonText(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function comparisonSubject(html) {
  const text = comparisonText;
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
 * The index of every page a venture ships *beside* its calculator — the
 * "how much should I charge to install carpet" articles, the worked examples,
 * the decision pages and the extra panels.
 *
 * ## Why this page exists
 *
 * `guide-coverage.mjs` states the case for these pages in its own header, and
 * it is the case for indexing them: a tool's entry page ranks for the
 * transactional query ("deck bid calculator"); the informational query ("how
 * much should I charge to build a deck?") is a separate and larger search
 * surface, and the house answer to it is a second page per venture. Measured
 * against a fresh build on 2026-09-07 there are 342 of them, against 189 tool
 * entry pages — the largest body of content on this site by a wide margin, and
 * the only one with no index anywhere.
 *
 * That is the same distribution hole `COMPARE_PATH` was written to close, one
 * content type over. `/compare/` collects the 201 `vs-<product>.html` pages;
 * nothing collects these. Concretely, measured on the same build:
 *
 *   - No page on this site lists them. The hub lists tools, the category pages
 *     list tools, `/compare/` lists comparisons.
 *   - `llms.txt` — the surface this portfolio's growth plan actually leans on,
 *     per `renderLlmsTxt` — named **0 of 173** question-shaped guide pages.
 *   - 64 of them had exactly one inbound link in the whole artifact (their own
 *     tool's entry page), so a crawler reaches them at depth 3 or not at all.
 *
 * ## What it may and may not say
 *
 * The same rule `/compare/` follows, for the same reason: every word is lifted
 * from a page a venture author already wrote. An entry's text is that page's
 * own `<h1>`, and its blurb that page's own meta description. This page ranks
 * nothing, recommends nothing and compares nothing — it is an index, so it
 * cannot introduce a claim the page it links to does not already carry.
 */
export const GUIDES_PATH = 'guides/';

// The research portfolio (`research/`, MIT licensed) has its own homepage
// builder; the site publishes its output here so the repository has one front
// door. Not a venture: no launch date, no card, linked from the hub footer.
export const RESEARCH_PATH = 'research/';
export const RESEARCH_BUILDER = path.join('research', '_homepage', 'build.py');
// One page per research theme, written by the same builder (`TOPICS_DIR` there).
export const RESEARCH_TOPICS_DIR = 'topics';

async function buildResearchPage(outDir, baseUrl) {
  // The site header and footer, handed to the Python builder as data so the
  // research pages carry exactly the markup every other page does. Written
  // outside the published tree.
  const chrome = await writeResearchChrome(
    path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'pf-research-chrome-')), 'site-chrome.json'),
  );
  const args = [
    path.join(REPO_ROOT, RESEARCH_BUILDER),
    '--out', path.join(outDir, RESEARCH_PATH),
    '--base-url', baseUrl,
    '--site-chrome', chrome,
  ];
  execFileSync('python3', args, {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/**
 * Pages the guides index deliberately does not list.
 *
 * A venture's own entry page is on the hub, on its category page and in
 * `llms.txt` already. A `vs-<product>.html` page has `/compare/`, which is
 * about the product it names and does that job better than a trade-grouped
 * list would. And a nested `index.html` is a second *tool* rather than a guide
 * — `ai-engineering-academy/555-timer-calculator/` and
 * `consent-change-record/tool/` are entry points, and filing them under
 * "guides" would describe them as something they are not.
 *
 * Stated as three rules over the published tree rather than as a list of
 * filenames, so the next venture's pages are covered without anyone editing
 * this file — the staleness `COMPARISON_FILE_PATTERN` avoids the same way.
 */
export function isGuidePage(relativePath) {
  const posix = relativePath.split(path.sep).join('/');
  if (!posix.endsWith('.html')) return false;
  if (posix === 'index.html' || posix.endsWith('/index.html')) return false;
  return !COMPARISON_FILE_PATTERN.test(posix.slice(posix.lastIndexOf('/') + 1));
}

/**
 * The heading, title and blurb a guide page describes itself with.
 *
 * `<h1>` first because that is the sentence the author wrote for a reader, and
 * on these pages it is usually the query itself ("How much to charge to
 * replace a boiler"). The `<title>` is the fallback for a page whose heading is
 * an image or is missing, minus the " | Site name" suffix the build appends —
 * the same trim `comparisonSubject` makes, for the same reason.
 *
 * Returns `null` when the page carries neither, and the caller drops it rather
 * than inventing a label from the filename. A slug reads as
 * "how-much-to-charge" and that is not a sentence anyone wrote.
 */
export function guidePageMeta(html) {
  const text = (value) =>
    decodeEntities(String(value).replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleTag ? text(titleTag[1]).split(' | ')[0] : '';
  const heading = h1 ? text(h1[1]) : '';
  const label = heading || title;
  if (!label) return null;

  const description = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  return { label, title, description: description ? text(description[1]) : '' };
}

/**
 * Read every published guide page off the built tree, grouped by the tool it
 * belongs to and then by that tool's category.
 *
 * Reads the *output* directory rather than `ventures/`, unlike
 * `discoverComparisons`, and the difference is deliberate: this index has to
 * list a page because it shipped, at the URL it shipped to, which is the same
 * argument `renderVentureSitemap` makes for generating from the artifact. A
 * source-tree read would list pages `EXCLUDED_FILES` dropped and miss nothing
 * in exchange.
 */
export async function discoverGuides(surfaces, outDir) {
  const groups = [];
  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    let relatives;
    try {
      relatives = await publishedPages(dir);
    } catch {
      continue;
    }
    const items = [];
    for (const relative of relatives) {
      if (!isGuidePage(relative)) continue;
      const html = await fs.readFile(path.join(dir, relative), 'utf8');
      const meta = guidePageMeta(html);
      // A page whose own words do not name it is dropped rather than guessed
      // at. See `guidePageMeta`.
      if (!meta) continue;
      items.push({ slug: surface.slug, file: relative, ...meta });
    }
    if (items.length === 0) continue;
    items.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({
      slug: surface.slug,
      title: surface.title,
      description: surface.description,
      category: categoryFor(surface.slug),
      items,
    });
  }
  return groups;
}

/**
 * The guides grouped the way the site is already grouped: by category, then by
 * tool, most pages first inside a category.
 *
 * Most-first rather than alphabetical for the same editorial reason
 * `groupComparisons` orders products by how many tools compare against them: a
 * tool that has written eighteen answers is the reason the page is worth
 * opening, and burying it under an alphabetical "Appliance Repair" would be
 * filing rather than publishing.
 */
export function groupGuidesByCategory(groups) {
  const byCategory = new Map();
  for (const group of groups) {
    const id = group.category.id;
    if (!byCategory.has(id)) byCategory.set(id, { category: group.category, tools: [] });
    byCategory.get(id).tools.push(group);
  }
  for (const entry of byCategory.values()) {
    entry.tools.sort(
      (a, b) => b.items.length - a.items.length || a.title.localeCompare(b.title),
    );
  }
  return ALL_CATEGORIES.map((category) => byCategory.get(category.id)).filter(Boolean);
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
  'uk-tax': {
    title: 'Free UK tax, pay and benefits calculators',
    description:
      'Free UK calculators: take-home pay, Self Assessment, dividend tax, IR35, VAT schemes, pension relief, statutory pay and the £100k personal-allowance trap.',
    intro:
      'Each tool works one UK tax or pay question with HMRC rates and thresholds, shows the arithmetic, and says which tax year it assumes. Nothing you type leaves your browser.',
    audience: 'UK employees, sole traders, company directors and landlords',
  },
  marketplace: {
    title: 'Free marketplace seller fee calculators',
    description:
      'Free fee and profit calculators for eBay, Etsy, Amazon, KDP, Shopify, Walmart, TikTok Shop, Faire and Reverb. Enter your cost of goods, see what an order nets.',
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
  'food-service': {
    title: 'Free menu, pour cost and food truck pricing calculators',
    description:
      'Free pricing tools for restaurants, bars and food trucks. Work out a menu item\'s margin, a spirit\'s pour cost, or whether a booked event covers its own prep.',
    intro:
      'Food and drink is priced per item, and the cost side is the part that moves: an ingredient price that changed last week, waste nobody logged, and the prep hours that never make it onto the plate cost. These tools put those in the arithmetic, so a menu price or an event quote is a margin you can point at rather than a guess with a multiplier on it.',
    audience: 'restaurant, bar and food truck operators',
  },
  services: {
    title: 'Free pricing calculators for service businesses',
    description:
      'Free quoting tools for salons, photographers, mobile notaries, pool routes, event rentals and translators. Turn travel, time and materials into a price.',
    intro:
      'A service business quotes work without bidding a construction job, and the arithmetic is its own: travel time nobody bills, a route that has to cover the truck, a licence term that changes what the work is worth. These tools price that, one trade at a time.',
    audience: 'small service businesses',
  },
  ci: {
    title: 'Free CI checks and developer gates',
    description:
      'Free local tools that read a GitHub Actions job JSON, two coverage XML reports, JUnit XML across runs, or a robots.txt — and report a deterministic verdict. No account, nothing uploaded.',
    intro:
      'A red CI check, a coverage cliff, a flaky suite, or an AI crawler you thought you blocked — each is a file or a JSON blob you already have. These tools read that input in your browser (or as a matching zero-dependency CLI) and name the verdict, without an account or an upload.',
    audience: 'maintainers and developers running CI',
  },
  more: {
    title: 'More free small-business calculators',
    description:
      'The rest of the free, browser-only calculators here — everything outside the marketplace, trade, services, logistics, compliance, back-office and CI sections.',
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
      // `custom-farm-rate` joins this group rather than one of the seven
      // trade-specific ones below, and it is the same argument `shop-rate`
      // sits here on: it is not a takeoff for an installed product, it is a
      // rate derived from the operator's own overhead — a machine's annual
      // ownership cost spread over the hours it actually runs — plus a
      // season-against-an-income-goal check, which is what `job-margin` and
      // `which-job-first` do for a construction trade. #3596 routed it into
      // `trades` and stopped there, so it fell to the `trades-other`
      // fallback and `main` went red on "every published trade tool lands in
      // a named sub-group"; this is the missing half of that change.
      // `auto-repair-effective-labor-rate` belongs beside `shop-rate` for the
      // same reason `custom-farm-rate` does: it is not a takeoff for an
      // installed product, it is a rate measured against the operator's own
      // payroll and overhead — which is what this group is.
      // `land-survey-bid-calculator` joined 2026-09-16, for the same reason
      // `custom-farm-rate` did: it is not a takeoff for an installed
      // product — nothing is built, poured, or replaced — it prices a crew's
      // own field, office-research, and drafting hours against a target
      // margin, the same job-costing shape as `job-margin` and
      // `shop-rate` for a licensed surveyor's boundary/ALTA retracement
      // work instead of a construction trade.
      // `trade-bid-studio` is the trade-agnostic bid front door: it prices a job from
      // labour, burden, materials and overhead at a target margin, the same
      // job-costing shape as `job-margin`, so it sits here.
      test: (slug) => /^(trade-bid-studio|construction-delay-claim|surety-bond-capacity|bid-leveling|timber-sale|hunting-lease|grazing-lease|hay-sale-price|grain-store-or-sell|vineyard-grape-vs-wine|solar-land-lease|pollination-contract|fixed-bid-overrun|mosquito-control-program|quote-margin|coi-expiry-gap-checker|retainage|freelance-retainer|price-increase-breakeven|freelance-rate-increase|no-show-fee|change-order|construction-delay|job-margin|subcontractor-cashflow|contractor-bid-readiness|bid-win-rate|quote-follow-up-timing|revenue-target-lead-planner|project-estimate-calibrator|construction-evidence|shop-rate|tire-shop-ticket-margin|handyman-minimum-job|plumber-flat-rate|hvac-repair-tier|auto-repair-effective-labor-rate|rfp-compliance-matrix|security-questionnaire-matcher|tender-bid-readiness|tender-radar|recompete-radar|sawmill-custom-sawing|which-job-first|crew-dispatch-optimizer|service-van-stock-optimizer|route-account-pruner|lead-response-time|custom-farm-rate|cow-calf-breakeven|stocker-cattle-margin|firewood-profit|land-survey|home-service-lead-roi|invoice-aging|late-invoice-collections|client-profitability|experience-mod)/.test(slug),
    },
    {
      id: 'trades-cleaning',
      title: 'Cleaning, restoration & insulation',
      // `hoarding-cleanout-bid-calculator` joins beside `biohazard-cleanup`: it prices a heavy-clutter cleanout (containment, sanitising, haul-away).
      // `biohazard-cleanup` and `asbestos-abatement` join this group beside
      // `mold-remediation` and `radon-mitigation`: all price a licensed
      // hazard-removal or remediation job (containment, protective
      // procedures, testing/monitoring, special disposal) rather than an
      // installed product or a takeoff.
      // `window-tinting` joins beside `vehicle-wrap` and `mobile-detailing`:
      // it applies a film treatment to a vehicle's own surface rather than
      // installing or replacing a fixed building product, the same "vehicle
      // care/treatment" shape this group already groups those two under.
      // `auto-glass-bid-calculator` joins the same vehicle-service cluster:
      // the buyer is the same mobile/in-shop auto tech as `mobile-detailing`,
      // `vehicle-wrap`, and `window-tinting`, working on the vehicle's own
      // surface rather than a fixed building product.
      test: (slug) => /^(upholstery-shop|hydroseeding|hoarding-cleanout|janitorial|window-cleaning|solar-panel-cleaning|pressure-washing|carpet-cleaning|cleaning-dilution|hood-cleaning|duct-cleaning|dryer-vent|gutter-cleaning|chimney-sweep|mobile-detailing|vehicle-wrap|window-tinting|auto-glass|junk-removal|moving|pest-control|mold-remediation|radon-mitigation|asbestos-abatement|crawl-space|basement-waterproofing|attic-insulation|spray-foam|pet-grooming|wildlife-exclusion|bed-bug-heat-treatment|biohazard-cleanup|pool-opening-closing)/.test(slug),
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
      test: (slug) => /^(furnace|boiler|mini-split|hvac-maintenance|ev-charger|electrical-panel|standby-generator|solar-pv|commercial-solar|water-heater|water-softener|well-pump|sump-pump|toilet-replacement|sewer-|septic-|security-camera|appliance-repair)/.test(slug),
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
      // `tile-layout-planner` joined 2026-10-01 on its first commit: it lays out the
      // floor the flooring and tile-backsplash bids price, for the same remodeler.
      // `wall-framing-takeoff` joined 2026-10-28: studs and plates go up
      // before the drywall here, and its lumber list is the same job as `cut-list`.
      test: (slug) => /^(painting|drywall|flooring|carpet-install|hardwood-refinishing|kitchen-tile|countertop|cabinet-refinishing|crown-molding|popcorn-ceiling|basement-finishing|walk-in-|sunroom|screened-porch|home-elevator|stair-lift|wheelchair-ramp|fireplace-insert|cut-list|tile-layout|home-staging|wall-framing)/.test(slug),
    },
    {
      id: 'trades-site',
      title: 'Concrete, masonry & site work',
      // `shed-designer` joined 2026-10-29 beside `shed-install` and `pole-barn`.
      test: (slug) => /^(concrete|asphalt-|gravel-driveway|paver-patio|retaining-wall|parking-lot|french-drain|foundation-repair|epoxy-garage|pole-barn|shed-install|shed-designer)/.test(slug),
    },
    {
      id: 'trades-outdoor',
      title: 'Landscape, deck & pool',
      // `forestry-mulching` joins this group beside `tree-service`, and the
      // two link to each other: one lot commonly carries both standing stems
      // a mulching head is not rated for and understory a chainsaw crew has
      // no business on, so the operator quoting either is regularly asked
      // about the other. Filed here on its first commit rather than left for
      // a spell in `trades-other`, which `build.test.mjs`'s "every published
      // trade tool lands in a named sub-group" assertion exists to prevent.
      // `trades-site` was the near miss -- land clearing does precede site
      // work -- but this tool prices vegetation removal by acres per
      // machine-hour, not excavation, grading or a poured product, and its
      // nearest neighbour by both buyer and job is the tree service beside it.
      test: (slug) => /^(artificial-turf|sod-install|lawn-care|lawn-aeration|irrigation-|tree-service|stump-grinding|forestry-mulching|landscape-lighting|holiday-light|snow-removal|snow-plow-contract|fence|deck-|deck-bid|pergola|hot-tub|sauna-cold-plunge|pool-plaster|vinyl-liner)/.test(slug),
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

/**
 * What kind of product a venture is, read from the files it ships, so the hub
 * can file a self-hosted server or a command-line check as what it is rather
 * than as one more calculator. `app` ships a container (it runs as a server a
 * person deploys); `cli` offers a download or a CLI entry point; everything
 * else is a `browser` tool. A file test, not a slug rule: a new venture is
 * classified without anyone editing a list.
 */
export function surfaceKind(ventureDir, slug = path.basename(ventureDir)) {
  const has = (name) => existsSync(path.join(ventureDir, name));
  if (has('Dockerfile') && (has('render.yaml') || has('fly.toml') || has('docker-compose.yml') || has('compose.yaml'))) {
    return 'app';
  }
  if (DOWNLOADABLE_CLI_FILES[slug] || has('cli.mjs') || has('cli.py') || has('cli.js')) return 'cli';
  return 'browser';
}

/**
 * The research homepage's own featured projects and themes, read from the file
 * that builds it (`research/_homepage/projects.json`), so the hub can show what
 * the research is about instead of only a count. Only slugs that exist under
 * `research/` are kept, so a stale entry never becomes a dead link.
 */
export function researchHighlights(repoRoot = REPO_ROOT) {
  const data = loadResearchRegistry(repoRoot);
  if (!data) return { featured: [], themes: [], projects: [] };
  const exists = (slug) => existsSync(path.join(repoRoot, 'research', slug, 'README.md'));
  const bySlug = new Map();
  const themes = (data.themes ?? []).map((theme) => {
    const projects = (theme.projects ?? []).filter((p) => exists(p.slug));
    for (const p of projects) bySlug.set(p.slug, p);
    return { id: theme.id, name: theme.name, count: projects.length };
  }).filter((theme) => theme.count > 0);
  const featured = (data.featured ?? [])
    .filter((slug) => bySlug.has(slug))
    .map((slug) => ({ slug, title: bySlug.get(slug).title }));
  // Every project, for the hub's search index.
  const projects = (data.themes ?? []).flatMap((theme) =>
    (theme.projects ?? [])
      .filter((p) => exists(p.slug))
      .map((p) => ({ slug: p.slug, title: p.title, summary: p.summary ?? '', themeId: theme.id, themeName: theme.name })),
  );
  return { featured, themes, projects };
}

/**
 * The flagship ventures, in the order `portfolio/flagships.yaml` lists them:
 * the projects with the most engineering in them, chosen by an audit rather
 * than by a count this page can take. The hub's featured row leads with them.
 * Read with a line match (the file is a flat list of `- venture: <slug>`).
 */
export function flagshipSlugs(repoRoot = REPO_ROOT) {
  const file = path.join(repoRoot, 'portfolio', 'flagships.yaml');
  if (!existsSync(file)) return [];
  return [...readFileSync(file, 'utf8').matchAll(/^  - venture: ([a-z0-9-]+)\s*$/gm)].map((m) => m[1]);
}

/** Research projects the research homepage builds: `research/<slug>/` with a README. */
export function researchProjectCount(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, 'research');
  if (!existsSync(dir)) return 0;
  return execFileSync('ls', [dir], { encoding: 'utf8' })
    .split('\n')
    .filter((name) => name && !name.startsWith('_') && !name.startsWith('.') && existsSync(path.join(dir, name, 'README.md')))
    .length;
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
// Strips `//` and `/* */` comments from `.js`/`.mjs` source before the regex
// passes below ever see it. Heuristic, like the rest of this scanner, not a
// tokenizer -- two things keep it from eating real code:
//
//   - `//` only starts a strip when it follows the start of a line or
//     whitespace/punctuation that plausibly ends a statement (`;{}(),`).
//     `://` is never preceded by any of those (it is always preceded by a
//     scheme letter), so `https://example.com` inside a string survives, and
//     so does a protocol-relative literal like `'//example.com'` (preceded
//     by the opening quote).
//   - `/* */` removal runs first, so a `//` sitting inside a block comment
//     cannot re-open a line-comment strip that swallows the code after it.
//
// This exists because a fetch-shaped call *mentioned in a comment* --
// `cors-misconfig-check/probe.mjs` explains in its header why it deliberately
// does not use `fetch()`, and says so using the literal text `fetch()` twice
// -- used to satisfy the `/\bfetch\w*\(/` trigger below on its own, turning on
// the catch-all rule for a file that makes no fetch call at all. That rule
// then grabbed every `https://` *looking* quoted substring in the file,
// including the un-resolved half of two of that file's own template-literal
// test fixtures (`cors-probe-${randomBytes...}`, `evil-${hostname}`), and
// published them on /about/, llms.txt and the guide pages as if they were
// real hosts the tool calls.
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
}

// A real hostname (or host:port) never contains `$`, `{`, `}`, `(`, `)`,
// `<`, `>` or whitespace. `new URL(...)` is far more permissive than that --
// it happily parses `https://evil-${hostname}` and reports the host as the
// literal string `evil-${hostname}` -- so a garbage string produced when a
// regex above grabs a fragment of a template literal (the interpolation
// syntax intact) can still pass URL parsing and reach the Set. This is the
// second, independent guard against that: even if a future file trips the
// same shape of false match some other way, a host this obviously malformed
// never reaches the published exception list.
const PLAUSIBLE_HOST = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d+)?$/i;

export async function surfaceExternalFetchHosts(dir) {
  // `.mjs` too, not just `.js`: ventures overwhelmingly ship ES modules
  // (`calc.mjs`, `share.mjs`, …), and a scanner that only reads `.js` never
  // opens most of a venture's own logic.
  const files = (await listFiles(dir)).filter((f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.html'));
  const hosts = new Set();

  for (const file of files) {
    const rawSrc = await fs.readFile(file, 'utf8');
    // HTML is left untouched: `//` is a normal, frequent character there
    // (protocol-relative URLs, query strings) with no `//`-comment
    // convention of its own, so a JS-shaped comment strip would delete real
    // markup rather than commentary.
    const src = file.endsWith('.html') ? rawSrc : stripJsComments(rawSrc);
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
        // `new URL(...).host` only looks at the authority component, so a
        // literal host followed by an interpolated path/query
        // (`https://dns.google/resolve?name=${encodeURIComponent(name)}`,
        // dns-configuration-evidence's real shape) still resolves to the
        // genuine, plain host and must still be reported. It is only when
        // the interpolation itself lands inside the authority
        // (`https://evil-${hostname}`, or the un-terminated half of a
        // template like `${randomBytes(6).toString(`) that `.host` comes
        // back holding `$`/`{`/`(`/… — characters no real hostname has —
        // which `PLAUSIBLE_HOST` below exists to catch.
        const host = new URL(url).host;
        if (PLAUSIBLE_HOST.test(host)) hosts.add(host);
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

/**
 * A tool's name with any trailing tagline removed, for splicing into a
 * sentence.
 *
 * `readMeta` takes a surface's title from its `og:title`, falling back to
 * `<title>` split on `|`. Eight tools in the catalogue write that title as
 * `Name — what it does` (an em dash), which reads correctly as a card heading
 * and as link text, and wrongly the moment it is joined by `listProse` into
 * running prose: the tagline swallows the conjunction, so a two-item list
 * reads as one item with a long name. The site's own privacy sentence was the
 * casualty, on the About page and in `llms.txt` —
 *
 *   ...never leave their device, except on DNS Change Evidence — prove what a
 *   DNS change actually did and Sponsor Ready, where the one thing you paste...
 *
 * — where a reader cannot tell whether "Sponsor Ready" is a second tool or
 * more of the first one's tagline. That sentence is the portfolio's central
 * promise about a visitor's data, so it is the one place ambiguity costs the
 * most.
 *
 * Deliberately narrow. It splits on a *spaced* em or en dash only, which is
 * the convention those eight titles actually use; a hyphen is left alone
 * because tool names legitimately contain one ("Before/After DNS"), and a
 * dash with no surrounding spaces is not this pattern. It changes no card
 * heading and no link text — only names read as words in a sentence.
 */
export function toolProseName(title) {
  const raw = String(title ?? '').trim();
  const name = raw.split(/\s+[—–]\s+/)[0].trim();
  return name || raw;
}

/**
 * The privacy claim a catalogue-wide page's count line makes, and the list of
 * exceptions that goes with it.
 *
 * Up to `inline` exceptions are named in the sentence itself. Past that the
 * sentence counts them and the names go in a `<details>` placed right under
 * the count line, as the About page already does: inlined, the 40-odd lookup
 * tools that call a public API made a paragraph of tool names the size of
 * the lede in every hero that carried them. The claim and every name are
 * still on the page; only the long list is folded.
 */
export function privacyClaimParts(exceptions, { inline = 3 } = {}) {
  const names = exceptions.map((x) => escapeHtml(toolProseName(x.title)));
  if (names.length === 0) return { claim: 'nothing you type is uploaded', list: '' };
  if (names.length <= inline) return { claim: `nothing you type is uploaded, except on ${listProse(names)}`, list: '' };
  return {
    claim: `nothing you type is uploaded, except on the ${names.length} lookup tools listed below`,
    list: `\n      <details class="count-exceptions"><summary>The ${names.length} lookup tools that send the one thing you paste to the public API they check</summary><p>${listProse(names)}</p></details>`,
  };
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
  // The retired /monorepo-projects/ path is a second default: venture pages and
  // posts written before the move still name it, and it now answers 404.
  const current = rewritten.split(LEGACY_BASE_URL).join(baseUrl);
  if (baseUrl === DEFAULT_BASE_URL) return current;
  return current.split(DEFAULT_BASE_URL).join(baseUrl);
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
  // `icon` as a whole rel token (`icon`, `shortcut icon`, `alternate icon`):
  // an `apple-touch-icon` is a home-screen tile, not the tab icon, and treating
  // it as one left bid-price-engine with no favicon.
  if (/<link[^>]+rel=["'](?:[^"']*\s)?icon(?:\s[^"']*)?["']/i.test(html)) return html;
  const link = `\n  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">`;
  if (/<meta[^>]+charset/i.test(html)) {
    return html.replace(/<meta[^>]+charset[^>]*>/i, (meta) => `${meta}${link}`);
  }
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${link}`);
}

/**
 * Keep a page's `<meta name="description">` to what a results page can show.
 *
 * Venture pages were hand-written with descriptions up to 550 characters; a
 * search engine cuts them mid-sentence. Rather than edit hundreds of other
 * ventures' pages, the published copy ends the description at the last whole
 * sentence that fits `max`, or at the last word with an ellipsis when the
 * first sentence alone is longer. Only the authored text is shortened, never
 * added to, and a description already within `max` is returned untouched.
 */
export const META_DESCRIPTION_MAX = 320;
export function clampMetaDescription(html, max = META_DESCRIPTION_MAX) {
  return html.replace(
    /(<meta[^>]+name=["']description["'][^>]+content=")([^"]*)(")/i,
    (whole, open, content, close) => {
      if (content.length <= max) return whole;
      const window = content.slice(0, max);
      const stop = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
      );
      // A "sentence" under 80 characters is usually a heading fragment: prefer words.
      if (stop >= 80) return `${open}${content.slice(0, stop + 1)}${close}`;
      const cut = window.slice(0, max - 1);
      const word = cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:\-\u2013\u2014(]+$/, '');
      return `${open}${word}\u2026${close}`;
    },
  );
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
      if (entry.name.startsWith('.') && !PUBLISHABLE_DOT_DIRS.has(entry.name)) continue;
      const nested = await copyTree(src, dest, baseUrl);
      // A directory that held only CLI source leaves an empty shell behind.
      if (nested.length === 0) await fs.rm(dest, { recursive: true, force: true });
      copied.push(...nested);
      continue;
    }
    if (!entry.isFile() || !isPublishable(entry.name)) continue;

    if (REWRITABLE.has(path.extname(entry.name))) {
      const contents = await fs.readFile(src, 'utf8');
      const rewritten = rewriteOrigin(contents, baseUrl);
      await fs.writeFile(
        dest,
        path.extname(entry.name) === '.html' ? clampMetaDescription(rewritten) : rewritten,
      );
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
        exceptions.map((x) => escapeHtml(toolProseName(x.title))),
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
        server that could receive it.${exceptionNote}${feedbackOn() ? ` The one thing
        that is sent on purpose is a message you choose to submit through the
        <a href="${escapeHtml(`${toRoot}${FEEDBACK_PATH}`)}">feedback form</a>, which
        is published in this site's public GitHub repository.` : ''} We count anonymous, aggregate events —
        which tools get opened, never anything about who opened them — and that
        count stays in your own browser's local storage.${counterOn() ? ` Each page load
        also adds one to a daily per-page total on our own open-source counter
        (which page, which day, and — if you followed one of our own channel
        links, such as a release note or package page — which channel, and what
        kind of site sent you, such as "google" or "reddit", never its address;
        plus the country the request came from as a two-letter code and whether
        the browser is a phone, tablet or desktop, each kept only as a daily
        total; nothing you type, no cookie, no IP address stored; its host sees each
        request the way any web server does), and those totals are
        published in the repository.` : ''} Browsers sending
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

/** The bucket a tool's offline download falls into: its sub-group where its
 *  category has `SUBCATEGORY_RULES` (only `trades` does, at 131 tools and
 *  growing), its category otherwise. Used by both the hub's "save this
 *  category" picker and `collectOfflineBundle`, so the two can never name
 *  different buckets -- a category on its own is the coarsest partition that
 *  scales with the catalog rather than a fixed ceiling (see
 *  `collectOfflineBundle`), and `trades` alone had already outgrown that once
 *  the fleet's dominant shape (bid calculators) concentrated there. */
export function offlineBucketFor(slug) {
  return subcategoryFor(slug) ?? categoryFor(slug);
}

/** Every offline bucket, in the order the hub picker should list them. */
export function offlineBuckets(surfaces) {
  const buckets = [];
  for (const { category, items } of groupByCategory(surfaces)) {
    for (const { subcategory } of groupBySubcategory(category.id, items)) {
      const { id, title } = subcategory ?? category;
      buckets.push({ id, title });
    }
  }
  return buckets;
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
    .card { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 13px;
            padding: 17px 18px; transition: transform .18s, box-shadow .18s, border-color .18s; }
    .card::before { content: ""; position: absolute; left: -1px; top: 14px; bottom: 14px; width: 3px;
                    border-radius: 0 3px 3px 0; background: var(--pf-cat, var(--accent)); opacity: .85; }
    .card:hover, .card:focus-within { transform: translateY(-2px); border-color: var(--pf-cat, var(--accent));
                                      box-shadow: 0 10px 28px rgba(20, 30, 60, .10); }
    @media (prefers-reduced-motion: reduce) { .card, .cat { transition: none; } .card:hover, .cat:hover { transform: none; } }
    .card h3 { margin: 0 0 7px; font-size: 1.03rem; line-height: 1.25; }
    .card a { color: inherit; text-decoration: none; }
    .card a:hover h3, .card a:focus-visible h3 { color: var(--accent); text-decoration: underline; }
    .card p { margin: 0; color: var(--muted); font-size: .92rem; line-height: 1.5; }
    .card .meta { margin-top: 8px; font-size: .82rem; color: var(--soft); }
    .starting { margin: 12px 0 0; max-width: 70ch; line-height: 1.6; padding: 12px 14px;
                border-left: 3px solid var(--accent); background: var(--panel); border-radius: 0 9px 9px 0; }
    .siblings { margin-top: 44px; padding: 18px; background: var(--panel);
                border: 1px solid var(--line); border-radius: 13px; }
    .siblings h2 { font-size: 1.05rem; margin: 0 0 10px; }
    .siblings ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px;
                   grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .siblings a { color: var(--accent); text-decoration: none; font-weight: 600; font-size: .94rem; }
    .siblings a:hover, .siblings a:focus-visible { text-decoration: underline; }
    .siblings span { color: var(--soft); font-weight: 500; }
    .jumps { margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .jumps a { font-size: .85rem; padding: 5px 12px; border: 1px solid var(--line); border-radius: 999px;
               background: var(--panel); color: var(--ink); text-decoration: none; }
    .jumps a:hover, .jumps a:focus-visible { border-color: var(--accent); }
    .jumps span { color: var(--soft); }
    .filter { margin: 20px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
    .filter label { font-size: .87rem; font-weight: 650; }
    .filter input { flex: 1 1 260px; max-width: 420px; font: inherit; padding: 9px 12px; border-radius: 9px;
                    border: 1px solid var(--line); background: var(--panel); color: var(--ink); }
    .filter span { font-size: .85rem; color: var(--muted); }
    .filter[hidden] { display: none; }
    .card .deploy-link { display: inline-block; margin-top: 10px; font-size: .85rem; font-weight: 650;
                         color: var(--accent); text-decoration: none; }
    .card .deploy-link:hover { text-decoration: underline; }
    .empty { color: var(--muted); font-style: italic; }
    [hidden] { display: none !important; }
    footer { margin-top: 44px; padding-top: 22px; border-top: 1px solid var(--line);
             color: var(--muted); font-size: .9rem; line-height: 1.55; max-width: 760px; }
    footer h2 { font-size: .95rem; color: var(--ink); margin: 18px 0 6px; }
    footer p { margin: 0; }
    footer a { color: var(--accent); }
    /* Audience pages: "Start here" and "Questions these tools answer". */
    .start-here { margin: 28px 0 0; }
    .start-here h2, .answers h2 { font-size: 1.15rem; margin: 0 0 4px; letter-spacing: -.01em; }
    .start-here .sub, .answers .sub { margin: 0 0 14px; color: var(--muted); font-size: .92rem; }
    .start-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; counter-reset: start;
                  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
    .start-grid li { counter-increment: start; position: relative; background: var(--panel);
                     border: 1px solid var(--line); border-top: 3px solid var(--pf-cat, var(--accent));
                     border-radius: 13px; padding: 16px 18px 16px 18px; }
    .start-grid li::before { content: counter(start); display: inline-grid; place-items: center;
                             width: 26px; height: 26px; border-radius: 999px; margin-bottom: 8px;
                             font-size: .82rem; font-weight: 750; color: var(--panel);
                             background: var(--pf-cat, var(--accent)); }
    .start-grid a { color: var(--ink); text-decoration: none; font-weight: 650; font-size: 1.02rem; line-height: 1.3; display: block; }
    .start-grid a:hover, .start-grid a:focus-visible { color: var(--accent); text-decoration: underline; }
    .start-grid p { margin: 6px 0 0; color: var(--muted); font-size: .9rem; line-height: 1.5; }
    .start-grid .meta { font-size: .8rem; color: var(--soft); }
    .answers { margin: 30px 0 0; padding: 18px 20px; background: var(--panel); border: 1px solid var(--line); border-radius: 13px; }
    .answers ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px 22px;
                  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .answers li a { color: var(--accent); text-decoration: none; font-weight: 600; font-size: .93rem; line-height: 1.4; }
    .answers li a:hover, .answers li a:focus-visible { text-decoration: underline; }
    .answers li span { display: block; color: var(--soft); font-size: .8rem; }
    .answers .all { margin: 12px 0 0; font-size: .88rem; }
    .answers .all a { color: var(--accent); }
    .all-tools { font-size: 1.15rem; margin: 34px 0 0; letter-spacing: -.01em; }
`;

/**
 * An audience page's two lead blocks, or '' on any other page.
 *
 * "Start here" is the fullest of the audience's tools, by the rule the hub's
 * featured row already uses (`exampleTools`: most published pages first), so
 * nothing is ranked by a judgement this page cannot show. "Questions these
 * tools answer" lists the tools' own guide pages (`discoverGuides`), so every
 * line is a page that shipped, in that page's own words.
 */
export function renderAudienceLead({ start = [], questions = [], toRoot = '../../', who = '', total = 0 }) {
  if (!start.length) return '';
  const cards = start
    .map(
      (surface) => `        <li>
          <a href="${escapeHtml(`${toRoot}${surface.slug}/`)}" data-pf-to="${escapeHtml(surface.slug)}">${escapeHtml(cardName(surface.title))}</a>
          <p>${escapeHtml(surface.description)}</p>${
            surface.pageCount > 1
              ? `
          <p class="meta">${surface.pageCount} questions answered</p>`
              : ''
          }
        </li>`,
    )
    .join('\n');
  const answers = questions.length
    ? `
    <section class="answers" aria-labelledby="answers-h">
      <h2 id="answers-h">Questions these tools answer</h2>
      <p class="sub">Worked answers written beside the calculators${who ? ` ${escapeHtml(who)} use` : ''}.</p>
      <ul>
${questions
  .map(
    (q) => `        <li><a href="${escapeHtml(`${toRoot}${q.slug}/${q.file.replace(/(^|\/)index\.html$/, '$1')}`)}">${escapeHtml(q.label)}</a><span>${escapeHtml(cardName(q.toolTitle))}</span></li>`,
  )
  .join('\n')}
      </ul>
      <p class="all"><a href="${escapeHtml(`${toRoot}${GUIDES_PATH}`)}">Every guide on the site →</a></p>
    </section>`
    : '';
  return `
    <section class="start-here" aria-labelledby="start-h">
      <h2 id="start-h">Start here</h2>
      <p class="sub">The fullest tools on this page, with the most worked questions behind them.</p>
      <ol class="start-grid">
${cards}
      </ol>
    </section>${answers}
    <h2 class="all-tools">All ${total} tools${who ? ` for ${escapeHtml(who)}` : ''}</h2>
`;
}

/**
 * Up to `limit` guide pages from these tools, taken round-robin in the tools'
 * own order so one tool with twenty pages does not fill the list.
 */
export function audienceQuestions(tools, guides, limit = 8) {
  const byTool = new Map(guides.map((g) => [g.slug, g]));
  const queues = tools.map((t) => [...(byTool.get(t.slug)?.items ?? [])].map((item) => ({ ...item, toolTitle: t.title })));
  const out = [];
  while (out.length < limit && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (q.length && out.length < limit) out.push(q.shift());
    }
  }
  return out;
}

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
export function renderCategoryPage({
  category,
  items,
  groups,
  baseUrl,
  deployable = false,
  subgroups: subgroupsOverride,
  copy: copyOverride,
  audiences = [],
}) {
  // An audience page (`audiences.mjs`) passes its own copy; a category or type
  // page reads it from `CATEGORY_PAGE_COPY`.
  const copy = copyOverride ?? categoryPageCopy(category);
  const url = `${baseUrl}${categoryPagePath(category.id)}`;
  // Every asset lives at the site root and this page is served two levels down.
  const toRoot = '../../';
  // A browse-by-type page (KIND_PAGES) passes its own sections: the apps and
  // command-line tools are filed by the category each one serves.
  const subgroups = subgroupsOverride ?? groupBySubcategory(category.id, items);
  // Computed the same way the About page proves its own privacy claim, so a
  // category that happens to hold a tool with a documented external call
  // (Sponsor Ready under "more", DNS Change Evidence under "evidence") does
  // not have this page say "nothing you type is uploaded" for all of its
  // tools when that is false for one of them.
  const categoryExceptions = externalCallExceptions(items);
  const { claim: countPrivacyClaim, list: countExceptionList } = privacyClaimParts(categoryExceptions);
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
            }${
              deployable
                ? `<a class="deploy-link" href="${escapeHtml(`${toRoot}deploy/?app=${encodeURIComponent(surface.slug)}`)}">Deploy your own copy →</a>`
                : ''
            }
          </li>`;

  // Jump links to each section, so a 190-tool page is a table of contents
  // first and a wall of cards second. Plain anchors: they work with no script.
  const jumps = flat
    ? ''
    : `    <nav class="jumps" aria-label="Sections on this page">
${subgroups
  .map(
    ({ subcategory, items: subItems }) =>
      `      <a href="#${escapeHtml(subcategory.id)}">${escapeHtml(subcategory.title)} <span>${subItems.length}</span></a>`,
  )
  .join('\n')}
    </nav>`;

  // An in-page filter over this page's own cards. Drawn hidden and revealed by
  // the script, so a visitor without JavaScript never sees a box that does
  // nothing; the full list is the markup either way.
  const filter = items.length > 12
    ? `    <p class="filter" id="cat-filter-row" hidden>
      <label for="cat-filter">Filter these ${items.length} tools</label>
      <input id="cat-filter" type="search" placeholder="Type a word from the tool's name or job" autocomplete="off">
      <span id="cat-filter-count" aria-live="polite"></span>
    </p>`
    : '';

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

  // "Free tools for roofers", "for Etsy sellers": the same catalogue filed by
  // who it serves rather than by job. Every category and audience page links
  // every audience page, so each one is two clicks from the hub and a crawler
  // that lands on any of them reaches the rest.
  const otherAudiences = audiences.filter(({ audience }) => audiencePageId(audience) !== category.id);
  const audienceLinks = otherAudiences.length
    ? `    <section class="siblings">
      <h2>Free tools by trade and business</h2>
      <ul>
${otherAudiences
  .map(
    ({ audience, items: audienceItems }) =>
      `        <li><a href="${escapeHtml(`${toRoot}${categoryPagePath(audiencePageId(audience))}`)}">${escapeHtml(
        audience.name,
      )}</a> <span>(${audienceItems.length})</span></li>`,
  )
  .join('\n')}
      </ul>
    </section>
`
    : '';

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
  <title>${escapeHtml(siteTitle(copy.title))}</title>
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
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'tools', crumbs: [{ label: 'Tools', href: `${toRoot}${CATEGORY_PATH_PREFIX}/` }, { label: category.title }] })}
  <div class="wrap"${category.accent ? ` style="--pf-cat:${escapeHtml(category.accent)}"` : ''}>
    <header class="pf-hero">
      <p class="eyebrow">${escapeHtml(category.title)}</p>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="lede">${escapeHtml(copy.intro)}</p>${
        copy.starting
          ? `
      <p class="starting">${escapeHtml(copy.starting)}</p>`
          : ''
      }
      <p class="count">${items.length} free tool${items.length === 1 ? '' : 's'} · no account · ${countPrivacyClaim}</p>${countExceptionList}
    </header>
${copy.lead ?? ''}${jumps}
${filter}

    <main>
${body}
      <p class="empty" id="cat-filter-empty" hidden>No tool on this page matches that. <a href="${escapeHtml(`${toRoot}#${SEARCH_ANCHOR}`)}">Search every tool</a>.</p>
    </main>

    <section class="siblings">
      <h2>Other tools on this site</h2>
      <ul>
${siblings}
      </ul>
    </section>
${audienceLinks}
    <footer>${disclaimerHtml(toRoot, groups.flatMap((g) => g.items))}
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  <!-- The same anonymous, local-only counter every tool page loads, with the
       category as its slug. Without it a category page is unmeasurable: we
       would not know whether search sends anyone to one, nor whether the people
       it does send go on to open a tool — which is the only evidence that would
       justify keeping these pages or writing more of them. The cross_tool_click
       count on each card is the second half of that: arrivals without opens
       means the copy is wrong, not that the page is unwanted. -->
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="${escapeHtml(`${CATEGORY_PATH_PREFIX}/${category.id}`)}" defer></script>${
    filter
      ? `
  <script>
    (function () {
      var row = document.getElementById('cat-filter-row');
      var box = document.getElementById('cat-filter');
      var out = document.getElementById('cat-filter-count');
      var none = document.getElementById('cat-filter-empty');
      var cards = Array.prototype.slice.call(document.querySelectorAll('main .card'));
      var sections = Array.prototype.slice.call(document.querySelectorAll('main .subgroup'));
      var text = cards.map(function (c) { return c.textContent.toLowerCase(); });
      row.hidden = false;
      box.addEventListener('input', function () {
        var words = box.value.toLowerCase().split(/\\s+/).filter(Boolean);
        var shown = 0;
        cards.forEach(function (card, i) {
          var hit = words.every(function (w) { return text[i].indexOf(w) !== -1; });
          card.hidden = !hit;
          if (hit) shown += 1;
        });
        sections.forEach(function (s) { s.hidden = !s.querySelector('.card:not([hidden])'); });
        out.textContent = words.length ? shown + ' of ' + cards.length : '';
        none.hidden = shown !== 0;
      });
    })();
  </script>`
      : ''
  }
</body>
</html>
`;
}

/**
 * The category-shaped stand-in an audience page is rendered and carded as. Its
 * tint is the trades green or the marketplace blue of whichever category the
 * audience's tools mostly sit in, so "for roofers" looks like the trade pages
 * it links into rather than a section of its own.
 */
export function audienceCategory(audience, items = []) {
  const counts = new Map();
  for (const s of items) {
    const id = categoryFor(s.slug).id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const home = ALL_CATEGORIES.find((c) => c.id === top) ?? ALL_CATEGORIES.find((c) => c.id === 'trades');
  return { id: audiencePageId(audience), title: audience.name, blurb: audience.description, accent: home?.accent };
}

/**
 * "Free tools for roofers": one audience's page (`audiences.mjs`). The same
 * page shape and checks as a category page, with copy written for the person
 * rather than the job, and the tools grouped by the category each sits in when
 * they span more than one.
 */
export function renderAudiencePage({ audience, items, groups, baseUrl, audiences = [], guides = [] }) {
  const category = audienceCategory(audience, items);
  // Four when the page is big enough to need a way in; none on a short page,
  // where the list below already is the way in.
  const start = items.length >= 8 ? exampleTools(items, 4) : [];
  const lead = renderAudienceLead({
    start,
    questions: audienceQuestions(exampleTools(items, items.length), guides),
    who: audience.who,
    total: items.length,
  });
  const byCategory = groupByCategory(items);
  const subgroups =
    byCategory.length > 1
      ? byCategory.map(({ category: home, items: subItems }) => ({
          subcategory: { id: `${category.id}-${home.id}`, title: home.title },
          items: subItems,
        }))
      : undefined;
  return renderCategoryPage({
    category,
    items,
    groups,
    baseUrl,
    subgroups,
    audiences,
    copy: {
      title: audience.title,
      description: audience.description,
      intro: audience.intro,
      starting: audience.starting,
      audience: audience.who,
      lead,
    },
  });
}

/**
 * Browse-by-type pages: every self-hostable app, and every command-line tool,
 * on a page of its own under the reserved `c/` prefix. They used to be two
 * extra lists on the hub, duplicating cards the category sections already
 * carried; as pages they are linkable, searchable, and out of the front door's
 * way. `check.mjs` treats them exactly like a category page.
 */
export const KIND_PAGES = [
  {
    id: 'apps',
    kind: 'app',
    title: 'Self-hostable apps',
    blurb:
      'Business software that runs as your own server: deploy a copy to your own cloud account with your own keys, and you own the data.',
    accent: '#1f4f8a',
    deployable: true,
  },
  {
    id: 'cli',
    kind: 'cli',
    title: 'Command-line tools',
    blurb:
      'Checks that run in a terminal or a CI pipeline; each page explains what it looks for and how to install it.',
    accent: '#2f3b52',
    deployable: false,
  },
];

/** The surfaces a browse-by-type page lists, sectioned by the category each serves. */
export function kindPageGroups(kindPage, surfaces) {
  const items = surfaces.filter((s) => s.kind === kindPage.kind);
  const subgroups = groupByCategory(items).map(({ category, items: subItems }) => ({
    subcategory: { id: `${kindPage.id}-${category.id}`, title: category.title },
    items: subItems,
  }));
  return { items, subgroups };
}

/**
 * Up to `limit` tools to show for a category on the front door: the ones with
 * the most pages behind them first (a tool with twenty answered questions is a
 * fuller product than a single calculator), then by name.
 */
export function exampleTools(items, limit = 4) {
  return [...items]
    .sort((a, b) => (b.pageCount ?? 0) - (a.pageCount ?? 0) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/**
 * The "Tools" section's own front page (`c/`): every category and type page,
 * each with its sub-sections, so the whole catalogue is two clicks from
 * anywhere without one page carrying all of it.
 */
export function renderToolsIndexPage({ groups, kindPages = [], audiencePages = [], surfaces, baseUrl }) {
  const toRoot = '../';
  const url = `${baseUrl}${CATEGORY_PATH_PREFIX}/`;
  const total = surfaces.length;
  const title = `All ${total} free tools, by category`;
  const description = `Every free tool on ${SITE_NAME}, filed by the job it does: ${groups
    .map(({ category }) => category.title.toLowerCase())
    .join(', ')}. Runs in your browser; no account.`;
  const section = (id, heading, blurb, count, subs, accent) => `      <section class="cat" id="${escapeHtml(id)}"${
    accent ? ` style="--pf-cat:${escapeHtml(accent)}"` : ''
  }>
        <h2><a href="${escapeHtml(`${id}/`)}" data-category="${escapeHtml(id)}">${escapeHtml(heading)}</a> <span>${count}</span></h2>
        <p>${escapeHtml(snippetize(blurb, 170))}</p>${
          subs.length
            ? `
        <p class="subs">${subs
          .map((sub) => `<a href="${escapeHtml(`${id}/#${sub.subcategory.id}`)}">${escapeHtml(sub.subcategory.title)} <span>${sub.items.length}</span></a>`)
          .join(' ')}</p>`
            : ''
        }
      </section>`;
  const cats = groups
    .map(({ category, items }) =>
      section(
        category.id,
        category.title,
        category.blurb,
        items.length,
        groupBySubcategory(category.id, items).filter((g) => g.subcategory),
        category.accent,
      ),
    )
    .join('\n');
  const kinds = kindPages
    .map(({ page, items, subgroups }) => section(page.id, page.title, page.blurb, items.length, subgroups, page.accent))
    .join('\n');
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url,
    description,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: groups.length + kindPages.length,
      itemListElement: [...groups.map(({ category }) => category), ...kindPages.map(({ page }) => page)].map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.title,
        url: `${baseUrl}${categoryPagePath(c.id)}`,
      })),
    },
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle(title))}</title>
  <meta name="description" content="${escapeHtml(snippetize(description))}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(snippetize(description))}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <style>${CATEGORY_STYLE}${TOOLS_INDEX_STYLE}  </style>
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'tools', crumbs: [{ label: 'Tools' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">Tools</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Each section has its own page with every tool in it. Know what you need? <a href="${escapeHtml(`${toRoot}#${SEARCH_ANCHOR}`)}">Search all ${total} tools</a> instead.</p>
    </header>
    <main>
      <h2 class="band">By job</h2>
      <div class="cats">
${cats}
      </div>
      <h2 class="band">By type</h2>
      <div class="cats">
${kinds}
      </div>${
        audiencePages.length
          ? `
      <h2 class="band">By trade or business</h2>
      <div class="cats">
${audiencePages
  .map(({ audience, items }) => section(audiencePageId(audience), audience.name, audience.description, items.length, []))
  .join('\n')}
      </div>`
          : ''
      }
      <h2 class="band">Reading</h2>
      <p class="more"><a href="${escapeHtml(`${toRoot}${GUIDES_PATH}`)}">Guides</a>: the explainers written beside each tool. <a href="${escapeHtml(`${toRoot}${COMPARE_PATH}`)}">Comparisons</a>: products compared side by side. <a href="${escapeHtml(`${toRoot}${RESEARCH_PATH}`)}">Research</a>: the open research portfolio.</p>
    </main>
    <footer>${disclaimerHtml(toRoot, surfaces)}
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="${CATEGORY_PATH_PREFIX}" defer></script>
</body>
</html>
`;
}

const TOOLS_INDEX_STYLE = `
    .band { font-size: .82rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
            margin: 34px 0 12px; padding-bottom: 7px; border-bottom: 1px solid var(--line); }
    .cats { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .cats { align-items: start; }
    .cat { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 13px; padding: 17px 18px;
           transition: transform .18s, box-shadow .18s, border-color .18s; }
    .cat { border-top: 3px solid var(--pf-cat, #1fb68f); }
    .cat:hover, .cat:focus-within { transform: translateY(-2px); border-color: var(--pf-cat, var(--accent));
                                    box-shadow: 0 10px 28px rgba(20, 30, 60, .10); }
    .cat h2 { font-size: 1.1rem; margin: 0 0 6px; letter-spacing: -.01em; }
    .cat h2 a { color: inherit; text-decoration: none; }
    .cat h2 a:hover, .cat h2 a:focus-visible { color: var(--accent); text-decoration: underline; }
    .cat h2 span, .subs span { color: var(--soft); font-weight: 500; font-size: .85em; }
    .cat > p { margin: 0; color: var(--muted); font-size: .92rem; line-height: 1.5; }
    .cat .subs { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    .subs a { font-size: .82rem; padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px;
              color: var(--ink); text-decoration: none; background: var(--bg); }
    .subs a:hover, .subs a:focus-visible { border-color: var(--accent); }
    .more { color: var(--muted); line-height: 1.6; }
`;

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
  const { claim: privacyClaim, list: exceptionList } = privacyClaimParts(exceptions);

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
  <title>${escapeHtml(siteTitle(title))}</title>
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
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'tools', crumbs: [{ label: 'Tools', href: `${toRoot}${CATEGORY_PATH_PREFIX}/` }, { label: 'Comparisons' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">Comparisons</p>
      <h1>What each free tool here does that the paid product does not — and what it does not do</h1>
      <p class="lede">Every tool on this site that overlaps with a commercial product has a page saying so plainly: what the product does, what the free tool does, and when the paid one is the right answer. They are written by the tool's author, cite the product's own public documentation, and are not affiliated with, endorsed by, or reviewed by any product named here.</p>
      <p class="count">${total} comparison page${total === 1 ? '' : 's'} across ${groups.length} product${groups.length === 1 ? '' : 's'} · free · no account · ${privacyClaim}</p>${exceptionList}
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
      ${renderSiteFooterNav({ toRoot })}
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
  const { claim: privacyClaim, list: exceptionList } = privacyClaimParts(exceptions);

  const title = `${subject} alternatives: ${n} free tool${n === 1 ? '' : 's'}`;
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
  <title>${escapeHtml(siteTitle(title))}</title>
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
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'tools', crumbs: [{ label: 'Tools', href: `${toRoot}${CATEGORY_PATH_PREFIX}/` }, { label: 'Comparisons', href: `${toRoot}${COMPARE_PATH}` }, { label: subject }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">Compared with ${escapeHtml(subject)}</p>
      <h1>${escapeHtml(`${n} free tools here have a page comparing themselves with ${subject}`)}</h1>
      <p class="lede">${escapeHtml(
        `Each page below is written by the author of the free tool, cites ${subject}'s own public documentation, and says three things: what ${subject} does, what the free tool does, and when ${subject} is the right answer. None of them is affiliated with, endorsed by, or reviewed by ${subject}, and none is a statement about its quality — only about what each tool does and does not do.`,
      )}</p>
      <p class="count">${n} comparison page${n === 1 ? '' : 's'} · free · no account · ${privacyClaim}</p>${exceptionList}
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
      <p style="margin-top:18px"><a href="${escapeHtml(`${toRoot}${COMPARE_PATH}`)}">All comparisons</a></p>
      ${renderSiteFooterNav({ toRoot })}
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

const GUIDES_STYLE = `
    .tool { margin-top: 34px; }
    .tool h3 { font-size: 1.05rem; letter-spacing: -.02em; margin: 0 0 3px; }
    .tool h3 a { color: var(--ink); text-decoration: none; }
    .tool h3 a:hover, .tool h3 a:focus-visible { color: var(--accent); text-decoration: underline; }
    .tool .note { font-size: .85rem; color: var(--soft); margin: 0 0 10px; }
    .answers { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px;
               grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
    .answers li { background: var(--panel); border: 1px solid var(--line);
                  border-radius: 11px; padding: 12px 14px; font-size: .94rem;
                  line-height: 1.45; }
    .answers a { color: var(--accent); text-decoration: none; font-weight: 600; }
    .answers a:hover, .answers a:focus-visible { text-decoration: underline; }
    .answers p { margin: 5px 0 0; color: var(--muted); font-size: .88rem; line-height: 1.45; }
`;

/**
 * Every guide page in the catalogue, on one URL, grouped by trade and then by
 * the tool that wrote it. See `GUIDES_PATH` for why this page exists and what
 * it is allowed to say.
 *
 * Grouped by category first rather than rendered as one flat list of 342, for
 * the reason `renderCategoryPage` states: a flat alphabetical wall is a filing
 * cabinet, and the reader arriving here is a contractor or a seller who cares
 * about one trade. Each tool keeps its own block so the guide sits next to the
 * calculator that answers the same question with the reader's own numbers,
 * which is the conversion this page exists to make possible at all.
 */
export function renderGuidesPage({ groups, surfaces, categoryGroups = [], baseUrl }) {
  const url = `${baseUrl}${GUIDES_PATH}`;
  const toRoot = '../';
  const sections = groupGuidesByCategory(groups);
  const total = groups.reduce((n, group) => n + group.items.length, 0);
  const anchorFor = (category) => `g-${category.id}`;

  // Derived the same way `renderComparePage` derives its own: this page spans
  // the whole catalogue, so a flat "nothing you type is uploaded" would be
  // false for the tools that do make a documented live call.
  const exceptions = externalCallExceptions(surfaces);
  const { claim: privacyClaim, list: exceptionList } = privacyClaimParts(exceptions);

  const title = 'Guides: what to charge, and how each price is worked out';
  const description =
    `${total} plain-English pages from ${groups.length} free calculators — how a price is built up, ` +
    'when one option beats another, and what to do with the answer. Written by each tool\'s author, ' +
    'free, and with the calculator on the same site.';

  const entryHref = (item) => `${toRoot}${item.slug}/${item.file}`;

  const renderTool = (group) => `        <div class="tool">
          <h3><a href="${escapeHtml(`${toRoot}${group.slug}/`)}" data-tool="${escapeHtml(group.slug)}" data-pf-to="${escapeHtml(group.slug)}">${escapeHtml(group.title)}</a></h3>
          <p class="note">${escapeHtml(
            `${group.items.length} page${group.items.length === 1 ? '' : 's'} beside the calculator`,
          )}</p>
          <ul class="answers">
${group.items
  .map(
    (item) => `            <li><a href="${escapeHtml(entryHref(item))}" data-pf-to="${escapeHtml(item.slug)}">${escapeHtml(item.label)}</a>${
      item.description ? `<p>${escapeHtml(truncate(item.description, 130))}</p>` : ''
    }</li>`,
  )
  .join('\n')}
          </ul>
        </div>`;

  const body = sections
    .map(
      ({ category, tools }) => `      <section class="subject" id="${escapeHtml(anchorFor(category))}">
        <h2>${escapeHtml(categoryPageCopy(category).title)}</h2>
        <p class="note">${escapeHtml(
          `${tools.reduce((n, t) => n + t.items.length, 0)} pages across ${tools.length} tool${
            tools.length === 1 ? '' : 's'
          } for ${categoryPageCopy(category).audience}.`,
        )} <a href="${escapeHtml(`${toRoot}${categoryPagePath(category.id)}`)}">${escapeHtml(
          `Open the ${category.title} →`,
        )}</a></p>
${tools.map(renderTool).join('\n')}
      </section>`,
    )
    .join('\n');

  const jump = sections
    .map(
      ({ category, tools }) =>
        `        <li><a href="#${escapeHtml(anchorFor(category))}">${escapeHtml(category.title)}</a> <span>(${tools.reduce((n, t) => n + t.items.length, 0)})</span></li>`,
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
        { '@type': 'ListItem', position: 2, name: 'Guides', item: url },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement: groups
        .flatMap((group) =>
          group.items.map((item) => ({
            '@type': 'ListItem',
            name: item.label,
            url: `${baseUrl}${pageUrlPath(item.slug, item.file)}`,
          })),
        )
        .map((item, index) => ({ ...item, position: index + 1 })),
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
  <title>${escapeHtml(siteTitle(title))}</title>
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
  <style>${CATEGORY_STYLE}${COMPARE_STYLE}${GUIDES_STYLE}  </style>
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'tools', crumbs: [{ label: 'Tools', href: `${toRoot}${CATEGORY_PATH_PREFIX}/` }, { label: 'Guides' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">Guides</p>
      <h1>The question people ask before they know a calculator exists</h1>
      <p class="lede">Every tool on this site ships pages beside the calculator: how a price is actually built up, when one option beats another, what a fee schedule does to a payout, and what to do with the number once you have it. They are written by the tool's author, in plain English, and the calculator that answers the same question with your own figures is one click away from each one.</p>
      <p class="count">${total} page${total === 1 ? '' : 's'} across ${groups.length} tool${groups.length === 1 ? '' : 's'} · free · no account · ${privacyClaim}</p>${exceptionList}
    </header>

    <nav class="jump" aria-label="Guides by trade">
      <h2>Jump to a trade</h2>
      <ul>
${jump}
      </ul>
    </nav>

    <main>
${body}
    </main>

    <section class="siblings">
      <h2>Browse the tools instead</h2>
      <ul>
${categoryLinks}
      </ul>
    </section>

    <footer>${disclaimerHtml(toRoot, surfaces)}
      <h2>What these pages are</h2>
      <p>
        Each page linked here is written by the author of the tool it sits
        beside, and says how that tool works out a number — not what you should
        charge, and not what any other business charges. The wording on this
        index is taken from each page's own heading and description; it adds no
        figure, no ranking and no claim of its own.
      </p>
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  <!-- The same anonymous, local-only counter every other page loads, with this
       page's own slug. Whether an informational query sends anyone here, and
       whether the people it sends go on to open a calculator, is the only
       evidence that would justify writing more guide pages — and folding this
       onto the hub's slug would leave it unanswerable. -->
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="guides" defer></script>
</body>
</html>
`;
}

const ABOUT_STYLE = `
    .exceptions { margin: 14px 0 0; max-width: 68ch; font-size: .92rem; color: var(--muted); }
    .exceptions summary { cursor: pointer; font-weight: 650; color: var(--accent); }
    .exceptions p { margin: 8px 0 0; line-height: 1.6; }
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
    ? `the numbers a user types never leave their device, except on ${listProse(exceptions.map((x) => toolProseName(x.title)))}, where the one thing you paste — the lookup target — goes to the public API it checks (${exceptionHosts}) and nowhere else`
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
  <title>${escapeHtml(siteTitle(title))}</title>
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
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'about', crumbs: [{ label: 'About' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">About</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${total} free calculators and checks for people who run a small business. They run in your browser and they cost nothing. ${
        exceptions.length
          ? `The numbers you type never leave your device, except on the ${exceptions.length} lookup tools listed below, where the one thing you paste goes to the public API that tool checks.`
          : 'The numbers you type never leave your device.'
      }</p>${
        exceptions.length
          ? `
      <details class="exceptions">
        <summary>The ${exceptions.length} lookup tools that call a public API</summary>
        <p>${deviceClaim.replace(/^the numbers a user types never leave their device, /, 'The numbers a user types never leave their device, ')}.</p>
      </details>`
          : ''
      }
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
        <h3>${exceptions.length ? `Nothing, with ${exceptions.length === 1 ? 'one documented exception' : `${exceptions.length} documented exceptions`} below.` : feedbackOn() ? 'Nothing. No tool sends it anywhere.' : 'Nothing. There is no server that could receive it.'}</h3>
        <p>
          Every tool on this site is a static page. The calculation happens in
          your browser, in JavaScript you can read with your browser's own
          <em>View Source</em> or developer tools — no build step, no
          minification, nothing hidden from you. Specifically:
        </p>
        <ul>
          <li><strong>No account and no sign-up.</strong> There is no login, no email capture, and no "enter your address to see the result" gate.</li>
          <li><strong>${exceptions.length ? `Nothing you enter is transmitted, with ${exceptions.length === 1 ? 'one documented exception' : `${exceptions.length} documented exceptions`}.` : 'Nothing you enter is transmitted.'}</strong> These pages make no network request with your input — no form post, no background beacon${counterOn() ? ' (the page-view ping described below carries only the page name and where-from labels; the counter adds the country code and device type from the request)' : ''}${exceptions.length ? ` — except ${exceptionNames}, each of which checks a live public API as its whole job. What you paste there to look up goes to ${exceptionHosts} and nowhere else on this site; that page explains exactly what is sent` : ''}.</li>
          <li><strong>No third-party scripts.</strong> No analytics vendor, no tag manager, no advertising network, no hosted fonts, no CDN. ${exceptions.length ? `Besides the live API call${exceptions.length === 1 ? '' : 's'} ${exceptionNames} make${exceptions.length === 1 ? 's' : ''}, above, the` : 'The'} only outside addresses on this site are links you can choose to click.</li>
          <li><strong>No cookies and no cross-site identifiers.</strong></li>${feedbackOn() ? `
          <li><strong>Feedback is sent only when you send it.</strong> The <a href="${escapeHtml(`${toRoot}${FEEDBACK_PATH}`)}">feedback form</a> posts the message you write, the type you pick and the tool it is about, and nothing else, to this site's own small server, and is then published in the site's public GitHub repository. Nothing about you is stored with it, and email addresses are removed from the text first. Don't include anything you would not want published.</li>` : ''}
          <li><strong>It works offline.</strong> Once a tool has loaded, its page keeps working with the connection off, which is the plainest demonstration that the answer is computed where you are${exceptions.length ? ` — except ${exceptionNames}, whose whole point is a live lookup, so it needs the connection back to check anything new` : ''}.</li>
        </ul>
      </div>
      <p>
        The one thing that is counted is which tools get opened, as a plain
        tally that is written to your own browser's local storage${counterOn() ? `. One
        page-view ping per load also goes to this site's own
        <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/platform/counter">open-source counter</a>:
        it carries the page's name and, when you arrived by one of this
        portfolio's own channel links (a <code>?ref=</code> tag such as
        <code>?ref=npm</code>, removed from the address bar on arrival), that
        channel's name, plus what kind of site sent you (a label from a fixed
        list, such as <code>google</code>, <code>reddit</code> or
        <code>other</code>, worked out in your browser so the referring
        address itself is never sent), and nothing else. From the request itself
        the counter also reads the country it came from (Cloudflare's two-letter
        code, such as <code>US</code>) and whether the browser string is a
        phone's, a tablet's or a desktop's. It keeps one number per page, per
        channel, per kind of site, per country and per device type, per day,
        and none of these is linked to another or to you. Self-declared
        crawlers are tallied separately by name (such as <code>googlebot</code>)
        and never counted as visits. No IP address, cookie, browser string or
        referring address is stored. The daily totals are committed to the public
        repository. That counter's host sees each request the way any web server
        does; the counter stores none of it` : ` and is never
        sent anywhere`}. It exists so the next tool built is one people actually
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
        <a href="${SPONSORS_URL}">sponsoring on GitHub</a> or
        <a href="${BUY_ME_A_COFFEE_URL}">buying me a coffee</a> is welcome and
        entirely optional. Declining changes nothing
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
      ${renderSiteFooterNav({ toRoot })}
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

/** Where the feedback page is served, relative to the site root. */
export const FEEDBACK_PATH = 'feedback/';

/**
 * "Report a problem or suggest a feature", linked from every tool's footer
 * (with `?tool=<slug>`) and from the shared footer nav.
 *
 * Two ways in, because the site serves two audiences. A developer with a
 * GitHub account gets the repository's issue forms, pre-filled with the tool.
 * Everyone else (a roofer pricing a job has no reason to own a GitHub account)
 * gets a plain form, which posts to `platform/edge/`; a daily workflow copies
 * the messages into `portfolio/usage/site-feedback.json`. The form is rendered only when the build knows that endpoint
 * (`feedbackOn()`), so the page never offers a form that goes nowhere.
 *
 * `noindex`, and not in the sitemap: it is a utility page, and a search result
 * for "report a problem" helps nobody.
 */
export function renderFeedbackPage({ surfaces = [], baseUrl, feedbackUrl = SITE_FEEDBACK_URL }) {
  const url = `${baseUrl}${FEEDBACK_PATH}`;
  const toRoot = '../';
  const title = 'Report a problem or suggest a feature';
  const description = `Tell us what is wrong with one of these ${surfaces.length} free tools, or what you would like one to do. No account needed.`;
  const issueBase = `${REPO_URL}/issues/new`;
  const form = feedbackUrl
    ? `
      <form id="fb" class="panel" novalidate>
        <h2>Send feedback</h2>
        <p>No account needed. Your message is published in
        <a href="${escapeHtml(REPO_URL)}">this site's public GitHub repository</a>, where
        the people and agents who maintain these tools read it. Nothing about
        you is stored with it, and email addresses are removed. Don't include
        anything private.</p>
        <fieldset>
          <legend>What kind of feedback is it?</legend>
          <label><input type="radio" name="type" value="problem" checked> Something is wrong or broken</label>
          <label><input type="radio" name="type" value="idea"> An idea or feature request</label>
          <label><input type="radio" name="type" value="other"> Something else</label>
        </fieldset>
        <p id="fb-tool-line" hidden>About: <a id="fb-tool-link" href="${escapeHtml(toRoot)}"></a></p>
        <label for="fb-message">Your message</label>
        <textarea id="fb-message" name="message" rows="7" minlength="5" maxlength="4000" required
          placeholder="What did you expect, and what happened instead? Which numbers did you enter?"></textarea>
        <div class="fb-hp" aria-hidden="true"><label for="fb-website">Leave this empty</label><input id="fb-website" name="website" tabindex="-1" autocomplete="off"></div>
        <button type="submit">Send feedback</button>
        <p id="fb-status" role="status" aria-live="polite"></p>
      </form>`
    : '';
  const script = `
(function(){
  var q=new URLSearchParams(location.search),tool=q.get('tool')||'';
  if(!/^[a-z0-9][a-z0-9._/-]{0,119}$/.test(tool)||tool.indexOf('..')>=0)tool='';
  var links=document.querySelectorAll('[data-fb-issue]');
  for(var i=0;i<links.length;i++){
    var a=links[i],u=new URL(a.href);
    if(tool){u.searchParams.set('title','['+tool+'] ');u.searchParams.set('tool',tool);}
    a.href=u.toString();
  }
  var f=document.getElementById('fb');${feedbackUrl ? `
  if(!f)return;
  if(tool){
    var l=document.getElementById('fb-tool-link');
    l.textContent=tool;l.href='${toRoot}'+tool+'/';
    document.getElementById('fb-tool-line').hidden=false;
  }
  var st=document.getElementById('fb-status'),btn=f.querySelector('button');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var msg=f.message.value.trim();
    if(msg.length<5){st.textContent='Please write a few words first.';f.message.focus();return;}
    var body={type:f.querySelector('input[name=type]:checked').value,tool:tool,page:document.referrer?(function(){try{var r=new URL(document.referrer);return r.origin===location.origin?r.pathname:'';}catch(x){return '';}})():'',message:msg,website:f.website.value};
    btn.disabled=true;st.textContent='Sending...';
    fetch(${JSON.stringify(`${feedbackUrl}/feedback`)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){
        if(r.ok){
          f.message.value='';
          st.textContent='Thank you, it has been sent.';
        }else if(r.status===429){st.textContent='Too many messages right now. Please try again later.';}
        else{st.textContent='That did not go through. Please try again, or use a GitHub issue below.';}
      })
      .catch(function(){st.textContent='That did not go through. Please check your connection and try again.';})
      .then(function(){btn.disabled=false;});
  });` : ''}
})();
`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle(title))}</title>
  <meta name="description" content="${escapeHtml(snippetize(description))}">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(snippetize(description))}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta name="twitter:card" content="summary_large_image">
  <style>${CATEGORY_STYLE}${ABOUT_STYLE}${FEEDBACK_STYLE}  </style>
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'about', crumbs: [{ label: 'Feedback' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">Feedback</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Found a wrong number, a broken page, or a tool that almost does what you need? Tell us. Every report is read.</p>
    </header>

    <main class="prose">${form}
      <h2>${feedbackUrl ? 'Or, with a GitHub account' : 'Open an issue on GitHub'}</h2>
      <p>${feedbackUrl ? 'If you have a GitHub account, an issue there lets you follow the reply and add screenshots.' : 'Feedback goes to this site\'s public GitHub repository as an issue, which needs a free GitHub account.'}</p>
      <ul>
        <li><a data-fb-issue href="${escapeHtml(`${issueBase}?template=bug.yml`)}">Report a problem</a> (a wrong result, a broken page, something confusing)</li>
        <li><a data-fb-issue href="${escapeHtml(`${issueBase}?template=feature.yml`)}">Suggest a feature or a new tool</a></li>
        <li><a href="${escapeHtml(`${toRoot}${CUSTOM_DEV_PATH}`)}">Request custom development</a> (ask for a tool to be built for your work, and follow its progress)</li>
      </ul>
      <p>Whatever you send is public. Please leave out names, addresses and anything else private.</p>
    </main>

    <footer>
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  <script>${script}</script>
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="feedback" defer></script>
</body>
</html>
`;
}

const FEEDBACK_STYLE = `
    #fb h2 { margin-top: 0; }
    #fb label, #fb legend { display: block; font-weight: 600; color: var(--ink); margin: 12px 0 6px; }
    #fb fieldset { border: 0; padding: 0; margin: 0; }
    #fb fieldset label { font-weight: 400; color: var(--muted); margin: 4px 0; }
    #fb textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 10px 12px;
                   border: 1px solid var(--line); border-radius: 9px; background: var(--bg); color: var(--ink); }
    #fb button { margin-top: 12px; font: inherit; font-weight: 600; padding: 9px 18px; border-radius: 9px;
                 border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
    #fb button:disabled { opacity: .6; cursor: progress; }
    #fb-status { min-height: 1.5em; margin-top: 10px; }
    .fb-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
`;

/** Where the open custom development page is served, relative to the site root. */
export const CUSTOM_DEV_PATH = 'custom-development/';

/**
 * Open custom development: how anyone asks the agents to build something, how
 * they follow it, and every request so far with its status, read from
 * `portfolio/requests/requests.json` (`requests` here). Indexed and in the hub
 * sitemap, because it is the page a person searching for free custom software
 * should land on. The licence term is stated before the ask, not after: it is
 * the one condition (owner, 2026-10-30).
 */
export function renderCustomDevelopmentPage({ surfaces = [], baseUrl, requests = [] }) {
  const url = `${baseUrl}${CUSTOM_DEV_PATH}`;
  const toRoot = '../';
  const title = 'Open custom development';
  const description = 'Ask AI agents to build the tool your work needs, free and in public. Follow its progress here. One condition: it stays MIT licensed.';
  const issueUrl = `${REPO_URL}/issues/new?template=custom-build.yml`;
  const listUrl = `${REPO_URL}/issues?q=label%3Acustom-request`;
  const counts = Object.keys(REQUEST_STATUSES).map((s) => [s, requests.filter((r) => r.status === s).length]);
  const rows = [...requests]
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || (a.id || '').localeCompare(b.id || ''))
    .map((r) => {
      const links = [
        r.link ? `<a href="${escapeHtml(r.link)}">request</a>` : '',
        r.project ? `<a href="${escapeHtml(`${REPO_URL}/tree/main/${r.project}`)}">project</a>` : '',
        r.live ? `<a href="${escapeHtml(r.live)}">live</a>` : '',
      ].filter(Boolean).join(' · ');
      const note = r.status === 'declined' ? r.reason : r.next;
      return `
          <tr>
            <td>${escapeHtml(r.id)}</td>
            <td><strong>${escapeHtml(r.title)}</strong><br><span class="cd-ask">“${escapeHtml(r.ask)}”, from ${escapeHtml(REQUEST_SOURCES[r.source] || r.source)}, ${escapeHtml(r.received)}</span>${note ? `<br>${escapeHtml(note)}` : ''}</td>
            <td><span class="cd-st cd-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span><br><small>${escapeHtml(r.updated)}</small></td>
            <td>${links}</td>
          </tr>`;
    })
    .join('');
  const table = requests.length
    ? `
      <div class="cd-table"><table>
        <thead><tr><th>ID</th><th>Request</th><th>Status</th><th>Links</th></tr></thead>
        <tbody>${rows}
        </tbody>
      </table></div>`
    : '<p>No requests on file yet. Yours could be the first.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(siteTitle(title))}</title>
  <meta name="description" content="${escapeHtml(snippetize(description))}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="${escapeHtml(`${toRoot}favicon.svg`)}" type="image/svg+xml">
  <link rel="alternate icon" href="${escapeHtml(`${toRoot}favicon.ico`)}" sizes="16x16">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(snippetize(description))}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta name="twitter:card" content="summary_large_image">
  <style>${CATEGORY_STYLE}${ABOUT_STYLE}${CUSTOM_DEV_STYLE}  </style>
  ${siteStyleLink(toRoot)}
</head>
<body>
  ${renderSiteHeader({ toRoot, current: 'about', crumbs: [{ label: 'Custom development' }] })}
  <div class="wrap">
    <header class="pf-hero">
      <p class="eyebrow">Custom development</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">Tell us the tool your work needs. AI agent sessions build accepted requests in this public repository, free, and you can watch every step. The one condition: what is built stays open source under the MIT licence, held by the repository owner.</p>
    </header>

    <main class="prose">
      <h2>How it works</h2>
      <ol>
        <li><strong>Ask.</strong> <a href="${escapeHtml(issueUrl)}">Open a request</a> on GitHub (a free account), or use the <a href="${escapeHtml(`${toRoot}${FEEDBACK_PATH}`)}">feedback form</a> and pick “An idea” if you have no account. Short on time? The one-box <a href="${escapeHtml(`${REPO_URL}/issues/new?template=idea.yml`)}">idea form</a> works too. Describe the job from the inside: who does it, how, and where today's tools fall short.</li>
        <li><strong>It is triaged.</strong> Each request gets an ID in the table below and a status: ${counts.map(([s]) => `<em>${s}</em>`).join(', ')}. A declined request says why.</li>
        <li><strong>It is built in public.</strong> Sessions work in the open: every change is a pull request, and the project's README says what was tested and what was not.</li>
        <li><strong>You follow it.</strong> Watch your issue for replies, check its row here (rebuilt on every merge), or browse <a href="${escapeHtml(listUrl)}">all requests on GitHub</a>. Add detail or real sample material to the issue at any time; that is the fastest way to move a request forward.</li>
      </ol>

      <h2>The terms</h2>
      <ul>
        <li><strong>Free.</strong> No fee for the engineering, the hosting or the agent compute.</li>
        <li><strong>MIT licensed, held by the repository owner.</strong> What is built is published in <a href="${escapeHtml(REPO_URL)}">this repository</a> under its <a href="${escapeHtml(`${REPO_URL}/blob/main/LICENSE`)}">MIT licence</a>, with the owner's copyright notice. Anything you attach, you must be allowed to share, and you agree to its publication on those terms.</li>
        <li><strong>You may use it commercially</strong>, as anyone may: deploy it, change it, sell a service on it. The licence is the same for everyone, so there is no exclusivity.</li>
        <li><strong>No promise of a date or of acceptance.</strong> Agent time is shared across the whole repository. A request is weighed on how useful it is, how well it fits, and whether it can be built and run legally at no per-user cost.</li>
        <li><strong>Public by default.</strong> Requests, code and discussion are visible to everyone. Leave out names, addresses and anything private.</li>
      </ul>

      <h2>Requests so far</h2>
      <p>${requests.length} on file${requests.length ? `: ${counts.filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ')}` : ''}. The list is kept in <a href="${escapeHtml(`${REPO_URL}/blob/main/portfolio/requests/requests.json`)}">one file</a>, so each request's history is that file's history. The first entries are the owner's own asks, to show how deep a request goes over many sessions.</p>${table}
    </main>

    <footer>
      ${disclaimerHtml(toRoot, surfaces)}
      ${renderSiteFooterNav({ toRoot })}
    </footer>
  </div>
  <script src="${escapeHtml(`${toRoot}${CHROME_MODULE_FILE}`)}" ${CHROME_SLUG_ATTR}="custom-development" defer></script>
</body>
</html>
`;
}

const CUSTOM_DEV_STYLE = `
    .cd-table { overflow-x: auto; }
    .cd-table table { border-collapse: collapse; width: 100%; }
    .cd-table th, .cd-table td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .cd-ask { color: var(--muted); font-size: .92em; }
    .cd-st { display: inline-block; font-weight: 600; font-size: .85em; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); }
    .cd-building, .cd-accepted { border-color: var(--accent); color: var(--accent); }
    @media (max-width: 600px) {
      .cd-table thead { display: none; }
      .cd-table tr, .cd-table td { display: block; border: 0; padding: 2px 0; }
      .cd-table tr { padding: 10px 0; border-bottom: 1px solid var(--line); }
    }
`;

/** The slim search index the hub (and nothing else) loads. See `renderSearchIndex`. */
export const SEARCH_INDEX_FILE = 'search-index.json';

/** The `cats` key blog posts are filed under in the search index. */
const POST_CATEGORY = 'writing';

/**
 * Every page inside a tool other than its entry page that a search engine is
 * invited to index and that says what it is about: the guide and comparison
 * pages, as `{ slug, url, title, description }` with `url` relative to the
 * site root. A page marked noindex, or with no description, stays out.
 */
export async function collectGuidePages(outDir, surfaces) {
  const guides = [];
  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    if (!(await exists(dir))) continue;
    for (const file of (await listFiles(dir)).filter((f) => f.endsWith('.html')).sort()) {
      const url = path.relative(outDir, file).split(path.sep).join('/');
      if (url === `${surface.slug}/index.html`) continue;
      const html = await fs.readFile(file, 'utf8');
      if (/noindex/i.test(metaContent(html, 'name', 'robots'))) continue;
      const { title, fullDescription } = readMeta(html, surface.slug);
      if (!title || !fullDescription) continue;
      guides.push({ slug: surface.slug, url: url.replace(/(^|\/)index\.html$/, '$1'), title, description: fullDescription });
    }
  }
  return guides;
}

/** The `cats` keys and labels the site's own collection pages are filed under. */
const SECTION_CATEGORIES = Object.freeze({ [CATEGORY_PATH_PREFIX]: 'Collection of tools', compare: 'Comparison' });

/**
 * The site's own collection pages, as `{ url, title, description, section }`:
 * each category and audience shelf under `c/` ("Free tools for roofers") and
 * each competitor page under `compare/` ("Jobber alternatives"). A query that
 * names a trade or a product someone already uses is best answered by the
 * page built for exactly that.
 */
export async function collectSectionPages(outDir) {
  const pages = [];
  for (const section of Object.keys(SECTION_CATEGORIES)) {
    const dir = path.join(outDir, section);
    if (!(await exists(dir))) continue;
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name, 'index.html');
      if (!(await exists(file))) continue;
      const { title, fullDescription } = readMeta(await fs.readFile(file, 'utf8'), entry.name);
      pages.push({ url: `${section}/${entry.name}/`, title, description: fullDescription, section });
    }
  }
  return pages;
}

/**
 * The search index, as the JSON the hub fetches when a visitor starts typing.
 *
 * The hub used to *be* the index: 1,270 cards, each carrying three token
 * attributes, rendered into one 1.7 MB page that a phone had to parse before a
 * visitor could see the front door. The same tokens now live in this file —
 * the same `searchTokens` output, the same catalogue-wide stopword cut — and
 * the page that loads it is small. The ranking (`searchScore`) and stemmer
 * (`searchVariants`) the browser runs are still injected from this file's own
 * tested exports, so the search a visitor gets is the one the tests check.
 *
 * Each item: `s` slug, `u` URL relative to the site root (tools omit it: it
 * is `<slug>/`), `t` title, `d` the
 * card description, `c` a key into `cats`, `k` kind (tool, app, cli or
 * research), `n` the name tokens, `g` the name-plus-alias tokens when they
 * differ from `n`, `x` the full index. Research projects ride in the same list
 * so one box finds a calculator and a paper alike.
 *
 * So do a tool's own guide and comparison pages (`k` guide, `s` the tool's
 * slug, `u` the page) and the blog's posts (`k` post). A guide's title was
 * already folded into its tool's `x`, so "why is my 1099-k higher" found the
 * tool, and the visitor then had to find the one page of thirty inside it
 * that answers the question. The site's collection and comparison pages
 * (`k` page, `u` the page) ride along too. All of these are listed after every
 * tool, so where a guide and its tool score alike the tool comes first.
 */
export function renderSearchIndex(surfaces, research = [], { guides = [], sections = [], posts = [], covered = new Set() } = {}) {
  const raw = surfaces.map((surface) => ({
    surface,
    name: searchTokens([surface.title, surface.slug]),
    // The words a person chose for this tool: its name, plus the aliases
    // someone wrote down because a query was reaching nothing. Kept apart from
    // `name` so an alias never earns the name weight in the ranking itself.
    strong: searchTokens([surface.title, surface.slug, aliasesFor(surface.slug)]),
    index:
      surface.searchIndex ??
      searchTokens([surface.title, surface.fullDescription ?? surface.description, surface.slug, aliasesFor(surface.slug)]),
  }));
  // The stopword cut is a property of the whole tool catalogue, so it cannot
  // be decided one item at a time.
  const catalogueStops = catalogueStopwords(raw.map(({ name, index }) => ({ name, index })));
  const stopwords = [...new Set([...SEARCH_STOPWORDS, ...catalogueStops])].sort();
  const cats = {};
  for (const category of [...ALL_CATEGORIES]) cats[category.id] = category.title;
  const items = raw.map(({ surface, name, strong, index }) => {
    const category = categoryFor(surface.slug);
    const g = withoutStopwords(strong, catalogueStops);
    return {
      s: surface.slug,
      t: surface.title,
      d: surface.description ?? '',
      c: category.id,
      k: surface.kind === 'app' || surface.kind === 'cli' ? surface.kind : 'tool',
      n: name,
      ...(g !== name ? { g } : {}),
      x: withoutStopwords(index, catalogueStops),
    };
  });
  for (const project of research) {
    const title = decodeEntities(project.title);
    const summary = decodeEntities(String(project.summary ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const key = `research:${project.themeId}`;
    cats[key] = `Research · ${decodeEntities(project.themeName)}`;
    const name = searchTokens([title, project.slug]);
    items.push({
      s: project.slug,
      u: `${RESEARCH_PATH}${project.slug}/`,
      t: title,
      d: snippetize(summary),
      c: key,
      k: 'research',
      n: name,
      // The abstract's opening, not all of it: 500 abstracts in full were most
      // of this file, and the words that say what a project is about come first.
      x: withoutStopwords(searchTokens([title, project.slug, decodeEntities(project.themeName), summary.slice(0, 320)]), catalogueStops),
    });
  }
  for (const page of sections) {
    const key = `site:${page.section}`;
    cats[key] = SECTION_CATEGORIES[page.section] ?? 'Collection';
    items.push({
      s: page.url,
      u: page.url,
      t: page.title,
      d: snippetize(page.description, 110),
      c: key,
      k: 'page',
      n: withoutStopwords(searchTokens([page.title]), catalogueStops),
      x: withoutStopwords(searchTokens([page.title, page.description.slice(0, 200)]), catalogueStops),
    });
  }
  // A "vs. Jobber" page that several tools carry is, as results, one row
  // ("This calculator vs. Jobber") repeated 43 times down the page. Its
  // compare/<product>/ page, listed above, gathers them, so those guides
  // (`covered`, their URLs) are left out; the tools stay findable by name.
  for (const guide of guides.filter((g) => !covered.has(g.url))) {
    // The title and the description's opening only, as for research: the
    // question a guide answers is in its title, and 1,700 guides indexed in
    // full would have grown this file by two thirds.
    items.push({
      s: guide.slug,
      u: guide.url,
      t: guide.title,
      d: snippetize(guide.description, 110),
      c: categoryFor(guide.slug).id,
      k: 'guide',
      n: withoutStopwords(searchTokens([guide.title]), catalogueStops),
      x: withoutStopwords(searchTokens([guide.title, guide.description.slice(0, 200)]), catalogueStops),
    });
  }
  if (posts.length) cats[POST_CATEGORY] = 'Blog';
  for (const post of posts) {
    items.push({
      s: post.slug,
      u: `${WRITING_PATH}${post.slug}/`,
      t: post.title,
      d: snippetize(post.description, 160),
      c: POST_CATEGORY,
      k: 'post',
      n: withoutStopwords(searchTokens([post.title]), catalogueStops),
      x: withoutStopwords(searchTokens([post.title, post.description, post.tags ?? []]), catalogueStops),
    });
  }
  return JSON.stringify({ v: 1, stopwords, cats, items });
}

/** One category's card on the front door: what it is for, how big, and a taste. */
function renderCategoryTile({ id, title, blurb, count, examples, note = '', accent }) {
  return renderCategoryCard({
    id, href: categoryPagePath(id), title, blurb: snippetize(blurb, 140), count, examples, note, accent,
  });
}

export function renderHub(
  surfaces,
  baseUrl,
  { researchCount = 0, research = { featured: [], themes: [] }, showcase = { shots: [], reel: null }, posts = [], flagships = [] } = {},
) {
  const groups = groupByCategory(surfaces);
  const audiencePages = audienceGroups(surfaces);
  const apps = surfaces.filter((s) => s.kind === 'app');
  const clis = surfaces.filter((s) => s.kind === 'cli');
  const browserCount = surfaces.length - apps.length - clis.length;
  const kindPages = KIND_PAGES.map((page) => ({ page, ...kindPageGroups(page, surfaces) })).filter((k) => k.items.length);

  // The front door describes its sections, not every tool: each category page
  // carries its own ItemList, and listing 1,270 tools here twice over was most
  // of what made this page 1.7 MB.
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: SITE_NAME,
    url: baseUrl,
    description:
      'Free, open-source browser tools, self-hostable business apps, command-line checks and research projects, each with its own page.',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: baseUrl },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: groups.length + kindPages.length,
      itemListElement: [...groups.map(({ category, items }) => ({ category, count: items.length })),
        ...kindPages.map(({ page, items }) => ({ category: page, count: items.length }))]
        .map(({ category, count }, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: `${category.title} (${count})`,
          url: `${baseUrl}${categoryPagePath(category.id)}`,
        })),
    },
  };

  const categoryTiles = groups
    .map(({ category, items }) =>
      renderCategoryTile({
        id: category.id,
        title: category.title,
        blurb: category.blurb,
        count: items.length,
        examples: exampleTools(items, 4),
        accent: category.accent,
      }),
    )
    .join('\n');
  const kindTiles = kindPages
    .map(({ page, items }) =>
      renderCategoryTile({
        id: page.id,
        title: page.title,
        blurb: page.blurb,
        count: items.length,
        examples: exampleTools(items, 4),
        note: `All ${items.length} ${page.kind === 'app' ? 'apps' : 'command-line tools'}`,
        accent: page.accent,
      }),
    )
    .join('\n');

  // A short featured row: the flagships first (`flagshipSlugs`), then, while
  // there is room, the tool with the most pages in each of the largest
  // categories. Page count alone put a day-count adder at the front
  // (2026-10-21): pages measure explainers written beside a tool, not the
  // engineering in it (docs/reports/2026-10-21-flagship-front-door.md).
  const bySlug = new Map(surfaces.map((s) => [s.slug, s]));
  const featured = flagships.map((slug) => bySlug.get(slug)).filter(Boolean).slice(0, 6);
  for (const { items } of [...groups].sort((a, b) => b.items.length - a.items.length)) {
    if (featured.length >= 6) break;
    const pick = exampleTools(items.filter((s) => !featured.includes(s)), 1)[0];
    if (pick) featured.push(pick);
  }

  // The moving shelf under the hero: a few tools from every section, split
  // across two rows so neither repeats a section back to back.
  const shortName = (s) => cardName(s.title);
  const shelf = groups.flatMap(({ items }) => exampleTools(items, 5)).map((s) => ({ slug: s.slug, name: shortName(s) }));
  const marqueeRows = [shelf.filter((_, i) => i % 2 === 0), shelf.filter((_, i) => i % 2 === 1)];
  const titles = new Map(surfaces.map((s) => [s.slug, shortName(s)]));
  const audienceWords = audiencePages.map(({ audience }) => audience.name).slice(0, 14);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="./favicon.ico" sizes="16x16">
  <title>${escapeHtml(SITE_NAME)} | Free Tools, Self-Hostable Apps &amp; Research</title>
  <meta name="description" content="${escapeHtml(
    snippetize(
      `${surfaces.length} free, open-source products: browser tools, self-hostable business apps and command-line checks, plus ${researchCount} research projects. Browser tools run on your device; apps deploy to your own cloud.`,
    ),
  )}">
  <link rel="canonical" href="${escapeHtml(baseUrl)}">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="favicon.ico" sizes="16x16">
  <!-- Feed autodiscovery. This is how a reader, and every aggregator that
       accepts a site URL rather than a feed URL, finds the feed at all. -->
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — new tools`)}" href="${escapeHtml(FEED_FILE)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:description" content="Free, open-source tools, self-hostable business apps and research: use them in your browser or run your own copy.">
  <meta property="og:url" content="${escapeHtml(baseUrl)}">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:image" content="${escapeHtml(`${baseUrl}${SOCIAL_CARD_FILE}`)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(`${SITE_NAME} — free, private, in your browser`)}">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonLd(itemList)}</script>
  <script type="application/ld+json">${jsonLd(siteStructuredData({
    baseUrl,
    siteName: SITE_NAME,
    description: 'Free, open-source browser tools, self-hostable business apps and reproducible research.',
    repoUrl: REPO_WEB_URL,
    logo: `${baseUrl}icon-512.png`,
  }))}</script>
  ${siteStyleLink('')}
  <style>
    :root {
      color-scheme: light dark;
      --bg: #eef2f7; --panel: #ffffff; --ink: #1d2530; --muted: #4a5666;
      --line: #d3dce6; --accent: #12594a; --accent-ink: #f2f8f5;
      /* One step quieter than --muted, and the quietest ink on this page.
         It exists because the de-emphasis it provides used to be spelled as an
         opacity, which is not a colour and therefore cannot be checked:
         --muted at .65 renders #89919c on the white panel, 3.18:1, under the
         4.5:1 WCAG AA needs for body-size text. Naming the tint makes it a
         value contrast.mjs can measure. */
      --soft: #656e78;
      --hero-2: #3b5bdb;
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #10151c; --panel: #171e27; --ink: #e8eef5; --muted: #a2b0c0;
              --line: #2a343f; --accent: #7fd8c0; --accent-ink: #0d1319;
              --soft: #8d9aab; --hero-2: #8ea2ff; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
    a { color: var(--accent); }
    [hidden] { display: none !important; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 8px 16px 64px; }
    .skip { position: absolute; left: -999px; top: 8px; background: var(--panel); padding: 8px 12px; border-radius: 8px; z-index: 10; }
    .skip:focus { left: 8px; }
    .hero { background:
              radial-gradient(1000px 420px at 85% -10%, color-mix(in srgb, var(--hero-2) 22%, transparent), transparent 70%),
              radial-gradient(800px 400px at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%),
              var(--bg);
            border-bottom: 1px solid var(--line); }
    .hero-inner { max-width: 1120px; margin: 0 auto; padding: clamp(36px, 7vw, 80px) 16px clamp(32px, 5vw, 52px); }
    .eyebrow, .section-eyebrow { font-size: .76rem; font-weight: 700; letter-spacing: .12em;
               text-transform: uppercase; color: var(--accent); margin: 0 0 12px; }
    h1 { font-size: clamp(2rem, 5.2vw, 3.5rem); line-height: 1.05; letter-spacing: -.04em;
         margin: 0 0 16px; max-width: 22ch; text-wrap: balance; }
    .lede { font-size: clamp(1rem, 1.6vw, 1.15rem); line-height: 1.6; color: var(--muted); margin: 0; max-width: 64ch; }
    /* The search is the front door's main control, so it sits in the hero. */
    .search { margin: 28px 0 0; max-width: 720px; scroll-margin-top: 16px; }
    .search label { display: block; font-size: .9rem; font-weight: 650; margin-bottom: 8px; }
    .search-row { display: flex; gap: 8px; }
    .search input { flex: 1 1 auto; min-width: 0; padding: 14px 16px; font: inherit; font-size: 1.05rem;
                    border: 1px solid var(--line); border-radius: 12px;
                    background: var(--panel); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    .search button { font: inherit; font-weight: 650; padding: 0 18px; border-radius: 12px; cursor: pointer;
                     border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
    .search-hint { font-size: .85rem; color: var(--muted); margin: 8px 0 0; }
    .count { font-size: .88rem; color: var(--muted); margin: 14px 0 0; }
    .closest { font-size: .88rem; color: var(--ink); margin: 14px 0 0; }
    .results { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
    .results[hidden] { display: none; }
    .results li { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
    .results li:hover { border-color: var(--accent); }
    .results a { font-weight: 650; color: var(--ink); text-decoration: none; }
    .results a:hover, .results a:focus-visible { color: var(--accent); text-decoration: underline; }
    .results .r-cat { display: block; font-size: .78rem; color: var(--soft); margin-top: 2px; }
    .results p { margin: 4px 0 0; font-size: .88rem; color: var(--muted); line-height: 1.45; }
    .results-more button { font: inherit; font-size: .9rem; font-weight: 650; color: var(--accent);
                           background: none; border: 0; padding: 8px 0; cursor: pointer; text-decoration: underline; }
    .empty { color: var(--muted); font-style: italic; margin: 14px 0 0; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 32px 0 0; max-width: 820px;
             border: 1px solid var(--line); border-radius: 14px; background: var(--panel); overflow: hidden; }
    .stats div { padding: 14px 16px; border-left: 1px solid var(--line); }
    .stats div:first-child { border-left: 0; }
    .stats dt { font-size: .8rem; color: var(--muted); }
    .stats dd { margin: 4px 0 0; font-size: 1.55rem; font-weight: 750; letter-spacing: -.03em;
                font-variant-numeric: tabular-nums; }
    .stats dd a { color: var(--ink); text-decoration: none; }
    .stats dd a:hover, .stats dd a:focus-visible { color: var(--accent); }
    @media (max-width: 640px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
      .stats div:nth-child(3) { border-left: 0; }
      .stats div:nth-child(n+3) { border-top: 1px solid var(--line); }
    }
    .band { margin-top: 56px; scroll-margin-top: 16px; }
    .band h2 { font-size: clamp(1.4rem, 3vw, 1.9rem); letter-spacing: -.03em; line-height: 1.15; margin: 0 0 8px; }
    .band-lede { color: var(--muted); line-height: 1.6; max-width: 70ch; margin: 0; }
    /* The category grid: the browse path for a visitor who cannot name the tool. */
    .cats { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 14px;
            grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }
    .for-list { list-style: none; padding: 0; margin: 22px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .for-list a { display: inline-block; padding: 7px 14px; border: 1px solid var(--line); border-radius: 999px;
                  background: var(--panel); color: var(--ink); text-decoration: none; font-weight: 600; font-size: .92rem; }
    .for-list a:hover, .for-list a:focus-visible { border-color: var(--accent); color: var(--accent); }
    .for-list span { color: var(--soft); font-size: .85rem; }
    .cat { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line);
           border-radius: 14px; padding: 18px 18px 16px; }
    .cat:hover { border-color: var(--accent); }
    .cat h3 { margin: 0 0 6px; font-size: 1.1rem; letter-spacing: -.01em; }
    .cat h3 a { color: var(--ink); text-decoration: none; }
    .cat h3 a:hover, .cat h3 a:focus-visible { color: var(--accent); text-decoration: underline; }
    .cat-blurb { margin: 0 0 10px; font-size: .9rem; color: var(--muted); line-height: 1.5; }
    .cat-examples { list-style: none; margin: 0 0 12px; padding: 0; flex: 1; }
    .cat-examples li { margin: 0; padding: 5px 0; border-top: 1px solid var(--line); font-size: .9rem; line-height: 1.35; }
    .cat-examples a { color: var(--ink); text-decoration: none; }
    .cat-examples a:hover, .cat-examples a:focus-visible { color: var(--accent); text-decoration: underline; }
    .cat-all { font-weight: 650; font-size: .9rem; text-decoration: none; }
    .cat-all:hover { text-decoration: underline; }
    .featured { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 12px;
                grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .featured li { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
    .featured a { font-weight: 650; color: var(--ink); text-decoration: none; }
    .featured a:hover, .featured a:focus-visible { color: var(--accent); text-decoration: underline; }
    .featured .f-cat { display: block; font-size: .78rem; color: var(--soft); margin-top: 3px; }
    .featured p { margin: 6px 0 0; font-size: .87rem; color: var(--muted); line-height: 1.5; }
    .pillar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-top: 22px; }
    .pillar { display: flex; flex-direction: column; padding: 22px; border: 1px solid var(--line); border-radius: 16px;
              background: var(--panel); color: var(--ink); text-decoration: none;
              transition: border-color .15s, transform .15s; }
    .pillar:hover, .pillar:focus-visible { border-color: var(--accent); transform: translateY(-2px); }
    .pillar h3 { margin: 0 0 8px; font-size: 1.1rem; letter-spacing: -.01em; }
    .pillar p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; font-size: .93rem; flex: 1; }
    .pillar-more { font-weight: 650; color: var(--accent); font-size: .92rem; }
    .principles { list-style: none; padding: 0; margin: 18px 0 0; display: flex; flex-wrap: wrap; gap: 8px 22px;
                  font-size: .9rem; color: var(--muted); }
    .principles li::before { content: "✓"; color: var(--accent); font-weight: 800; margin-right: 8px; }
    .research-themes { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }
    .research-themes a { padding: 5px 12px; border: 1px solid var(--line); border-radius: 999px; font-size: .83rem;
                         text-decoration: none; color: var(--ink); background: var(--panel); }
    .research-themes a:hover { border-color: var(--accent); }
    .research-themes span { color: var(--soft); font-weight: 500; font-size: .9em; margin-left: 2px; }
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
    /* A quiet quote keeps the waiting colour and carries the word "Chase"
       beside it rather than a second hue, so the distinction survives a
       monochrome print and reads for a visitor who cannot separate colours. */
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
       something today, and these are standing readings about their pricing. */
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
    footer { margin-top: 52px; border-top: 1px solid var(--line); padding-top: 24px;
             font-size: .87rem; line-height: 1.6; color: var(--muted); }
    footer h2 { font-size: .95rem; color: var(--ink); margin: 20px 0 6px; }
    footer a { color: var(--accent); }
    .optout { margin-top: 18px; font-size: .84rem; }
    .offline p { margin: 8px 0 12px; font-size: .9rem; line-height: 1.5; color: var(--muted); }
    .offline select { max-width: 100%; box-sizing: border-box; font: inherit; padding: 8px 10px;
                      border-radius: 9px; border: 1px solid var(--line); background: var(--panel);
                      color: var(--ink); margin-bottom: 10px; }
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
${HOME_MOTION_CSS}
${HOME_SECTIONS_CSS}
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  ${renderSiteHeader({ toRoot: '', current: 'home' })}

  <header class="hero">
${HERO_BACKDROP_HTML}
    <div class="hero-inner">
      <p class="eyebrow">Open source · MIT licensed · Built in public</p>
      <h1>Software and research that anyone can <span class="grad">use, inspect, and run</span> themselves.</h1>
${
  audienceWords.length
    ? `      <p class="ticker">Built for <b data-words="${escapeHtml(JSON.stringify(audienceWords))}">${escapeHtml(audienceWords[0])}</b> and anyone with numbers to run.</p>\n`
    : ''
}
      <p class="lede">
        ${escapeHtml(SITE_NAME)} is an open portfolio of business software and research:
        focused tools that run entirely in your browser, self-hostable apps a small
        business can deploy into its own cloud account, and reproducible research
        with its code and tests. No accounts, no paywalls, and no data leaving your hands.
      </p>

      <!-- The search runs over a JSON index of every tool and research project
           (search-index.json), fetched when a visitor first types. Without
           JavaScript the category grid below is the way in: every tool is on
           its category's page. -->
      <form class="search" id="${SEARCH_ANCHOR}" role="search" action="./" method="get">
        <label for="q">Search ${surfaces.length} tools${researchCount ? ` and ${researchCount} research projects` : ''}</label>
        <div class="search-row">
          <input id="q" name="q" type="search" placeholder="eBay fees, roofing bid, freight, VAT, scoring rules…"
                 autocomplete="off" spellcheck="false">
          <button type="submit">Search</button>
        </div>
        <noscript><p class="search-hint">Search needs JavaScript. Every tool is listed on its category page below.</p></noscript>
        <p class="count" id="count" aria-live="polite"></p>
        <p class="closest" id="closest" hidden></p>
        <ol class="results" id="results" hidden></ol>
        <p class="results-more" id="results-more" hidden></p>
        <p class="empty" id="empty" hidden>No tool matches that. Try a marketplace, a trade, or the thing you are pricing — or <a href="${CATEGORY_PATH_PREFIX}/">browse by category</a>.</p>
      </form>

      <dl class="stats" id="overview">
        <div><dt>Browser tools</dt><dd><a href="${CATEGORY_PATH_PREFIX}/">${browserCount}</a></dd></div>
        <div><dt>Self-hostable apps</dt><dd><a href="${escapeHtml(categoryPagePath('apps'))}">${apps.length}</a></dd></div>
        <div><dt>Command-line tools</dt><dd><a href="${escapeHtml(categoryPagePath('cli'))}">${clis.length}</a></dd></div>
        <div><dt>Research projects</dt><dd><a href="${RESEARCH_PATH}">${researchCount}</a></dd></div>
      </dl>
    </div>
  </header>

${renderMarquee(marqueeRows)}

  <main class="wrap" id="main">
    <!-- Filled in by script from the saved bids on this device. Above everything
         else deliberately: a contractor whose customer just rang back wants the
         job, not the tool that priced it. -->
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
      <!-- How many quotes are still out, and how long the oldest has been.
           See followUpSentence. -->
      <p class="bid-summary" id="bidsSummary" hidden></p>
      <!-- How long this contractor's customers take to answer, read across
           every tool, which is the only place it can usually be read at all. -->
      <p class="bid-chase" id="bidsChase" hidden></p>
      <!-- How their pricing is landing, pooled the same way, in percentages
           only. See pricingSentence. -->
      <p class="bid-pricing" id="bidsPricing" hidden></p>
      <!-- How often the quotes land at all. See winRateSentence. -->
      <p class="bid-win-rate" id="bidsWinRate" hidden></p>
      <!-- Whether what they changed is working. See trendSentence. -->
      <p class="bid-trend" id="bidsTrend" hidden></p>
      <!-- Which of their trades the finished work is worth doing. See keepSentence. -->
      <p class="bid-keep" id="bidsKeep" hidden></p>
      <!-- The two lines above, crossed. See mixSentence. -->
      <p class="bid-mix" id="bidsMix" hidden></p>
      <ul id="bidsList"></ul>
      <p class="bid-more" id="bidsMore" hidden></p>
    </section>

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

${renderHowItWorks({ toolCount: browserCount, appCount: apps.length })}

${
  audiencePages.length
    ? `    <section class="band" id="for" aria-labelledby="for-h">
      <p class="section-eyebrow">Who it is for</p>
      <h2 id="for-h">Find the tools for your trade or business</h2>
      <p class="band-lede">The same tools, filed by who they are for. Each page lists the calculators that kind of business uses, and what to price first if you are just starting one.</p>
      <ul class="for-list">
${audiencePages
  .map(
    ({ audience, items }) =>
      `        <li><a href="${escapeHtml(categoryPagePath(audiencePageId(audience)))}" data-category="${escapeHtml(
        audiencePageId(audience),
      )}">${escapeHtml(audience.name)} <span>${items.length}</span></a></li>`,
  )
  .join('\n')}
      </ul>
    </section>

`
    : ''
}
    <section class="band" id="browse" aria-labelledby="browse-h">
      <p class="section-eyebrow">Browse</p>
      <h2 id="browse-h">Tools by the job they do</h2>
      <p class="band-lede">${surfaces.length} free tools in ${groups.length} sections. Each section's page lists every tool in it, grouped and filterable. <a href="${CATEGORY_PATH_PREFIX}/">See every section →</a></p>
      <ul class="cats">
${categoryTiles}
      </ul>
    </section>

    <section class="band" id="types" aria-labelledby="types-h">
      <p class="section-eyebrow">By type</p>
      <h2 id="types-h">Apps you run yourself, and checks for your terminal</h2>
      <ul class="cats">
${kindTiles}
      </ul>
    </section>

${renderShowcaseSection(showcase, (slug) => titles.get(slug) ?? slug)}

    <section class="band" id="featured" aria-labelledby="featured-h">
      <p class="section-eyebrow">Featured</p>
      <h2 id="featured-h">The projects with the most engineering in them</h2>
      <p class="band-lede">Flagships first: the projects most runs go deeper on, picked for the engineering in them rather than the number of pages beside them.</p>
      <ul class="featured">
${featured
  .map(
    (s) => `        <li style="--feat:${escapeHtml(categoryFor(s.slug).accent)}"><a href="${escapeHtml(s.slug)}/" data-tool="${escapeHtml(s.slug)}">${escapeHtml(cardName(s.title))}</a><span class="f-cat">${escapeHtml(categoryFor(s.slug).title)}</span><p>${escapeHtml(s.description ?? '')}</p></li>`,
  )
  .join('\n')}
      </ul>
    </section>

${renderResearchBand(research, researchCount, { researchPath: RESEARCH_PATH, topicsDir: RESEARCH_TOPICS_DIR })}

${renderLatestWriting(posts, { writingPath: WRITING_PATH })}

    <section class="band" id="more" aria-labelledby="more-h">
      <p class="section-eyebrow">Also here</p>
      <h2 id="more-h">Run your own copy, read the guides, follow the work</h2>
      <div class="pillar-grid">
        <a class="pillar" href="deploy/">
          <span class="pillar-ico">${icon('deploy')}</span>
          <h3>Deploy your own copy</h3>
          <p>Every app and tool is MIT licensed. Pick one, paste your own cloud credentials, and get a running copy in your own account. Nothing of ours sits in between.</p>
          <span class="pillar-more">Deploy your own →</span>
        </a>
        <a class="pillar" href="${GUIDES_PATH}">
          <span class="pillar-ico">${icon('guide')}</span>
          <h3>Guides and comparisons</h3>
          <p>The explainers written beside each tool, and products compared side by side, filed by trade.</p>
          <span class="pillar-more">Read the guides →</span>
        </a>
        <a class="pillar" href="${UPDATES_PATH}">
          <span class="pillar-ico">${icon('pulse')}</span>
          <h3>Built in public</h3>
          <p>What shipped this week, what is in progress, where the project is going and how AI agents build it, from the repository's own records.</p>
          <span class="pillar-more">Updates and roadmap →</span>
        </a>
      </div>
      <ul class="principles">
        <li>No accounts or sign-up</li>
        <li>No tracking cookies</li>
        <li>MIT licence throughout</li>
        <li>Every change in the <a href="${CHANGELOG_PATH}">public changelog</a></li>
      </ul>
    </section>

<!-- With the other "your data on this device" panel rather than at the top:
     it is still drawn when no bids are saved (the browser with none is exactly
     the one where restoring a backup helps), but a first-time visitor should
     meet the tools before a file picker. Tool pages link here by #backup-box. -->
${BACKUP_WIDGET_HTML}

${renderOfflineWidgetHtml(offlineBuckets(surfaces))}

    <footer>
${disclaimerHtml('', surfaces)}
      <p class="optout">
        <label><input type="checkbox" id="optout"> Don't count my visit</label>
      </p>
      <p>
        Open source — every tool is a static page, and one you have opened keeps
        working with no connection.
      </p>
      ${renderSiteFooterNav({ toRoot: '' })}
    </footer>
  </main>

  <script type="module">
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

    // ---- The search index -------------------------------------------------
    //
    // Fetched from this site's own origin the first time something needs it
    // (a query, or a saved bid to label), never on a bare visit: a visitor who
    // only browses the categories pays nothing for it. It is the same kind of
    // request as opening any page here, and carries nothing about the visitor.
    const SEARCH_INDEX = '${SEARCH_INDEX_FILE}';
    // Slug -> index record for every tool, filled when the index arrives. The
    // saved-bid list and "pick up where you left off" name a tool from here.
    let TOOLS = new Map();
    let indexReady = false;
    let indexLoad = null;
    function loadIndex() {
      if (!indexLoad) {
        indexLoad = fetch(SEARCH_INDEX)
          .then((response) => {
            if (!response.ok) throw new Error('index ' + response.status);
            return response.json();
          })
          .then((data) => {
            data.items.forEach((item, i) => {
              item.i = i;
              if (!item.g) item.g = item.n;
              if (!item.u) item.u = item.s + '/';
            });
            data.stop = new Set(data.stopwords);
            // Tools only: a guide shares its tool's slug, and a post is not a tool.
            TOOLS = new Map(data.items.filter((item) => item.k === 'tool' || item.k === 'app' || item.k === 'cli').map((item) => [item.s, item]));
            indexReady = true;
            return data;
          });
        // A failed load (offline, say) is retried on the next keystroke rather
        // than remembered as the answer.
        indexLoad.catch(() => { indexLoad = null; });
      }
      return indexLoad;
    }

    // ---- Search -----------------------------------------------------------
    const q = document.getElementById('q');
    const form = document.getElementById('${SEARCH_ANCHOR}');
    const count = document.getElementById('count');
    const empty = document.getElementById('empty');
    const closest = document.getElementById('closest');
    const resultsList = document.getElementById('results');
    const resultsMore = document.getElementById('results-more');
    // How many near-misses to offer when nothing matches every word. Enough to
    // be a real second chance on a phone, short enough that the list is still
    // a suggestion rather than the catalogue back again.
    const CLOSEST_LIMIT = 8;
    // How many results to draw before a "Show all" button.
    const RESULTS_SHOWN = 20;
    let searchCounted = false;

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
    const matches = (index, forms, boundary) =>
      forms.every((variants) =>
        variants.some((word) =>
          boundary ? (' ' + index).includes(' ' + word) : index.includes(word)));

    // The query is normalised exactly as the index was: a word the index never
    // stores can never match, so keeping it would force every query containing
    // it down to zero hits. The stopword list ships with the index it was cut
    // from, so the two cannot disagree.
    const normalise = (text, stop) =>
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 2 && !stop.has(word))
        .map(searchVariants);

    // The ranked answer for one query: every item that matches every word,
    // best first — or, when nothing matches every word, or nothing that
    // matched was named or aliased for it, the closest few by the same score,
    // labelled as approximate. People type sentences ("new roof estimate");
    // requiring the visitor to guess the keyword is the page's job, not theirs.
    // One confident wrong answer ("install water heater" finding only the
    // boiler calculator, which happens to say "install") is worse than none,
    // which is what the data-strong test guards. Scored at a token boundary
    // even where the loose pass is in force, so "air" does not score inside
    // "stair", "chair" and "repair".
    function rank(data, forms) {
      const items = data.items;
      const boundary = items.some((item) => matches(item.x, forms, true));
      const hits = items.filter((item) => matches(item.x, forms, boundary));
      let list = hits.map((item) => ({ item, value: searchScore(item.n, item.x, forms, boundary) }));
      const strongly = (item) =>
        forms.some((variants) => variants.some((word) => (' ' + item.g).includes(' ' + word)));
      let closestFor = 0;
      if (hits.length === 0 || !hits.some(strongly)) {
        const hitSet = new Set(hits);
        const partial = items
          .map((item) => ({ item, value: searchScore(item.n, item.x, forms, true) }))
          // A whole word has to land somewhere. Below that the score is only
          // the name-length tie-break, which every item has.
          .filter(({ value }) => value >= 1)
          .sort((a, b) => b.value - a.value || a.item.i - b.item.i)
          .slice(0, CLOSEST_LIMIT);
        // Only when it offers something the strict pass did not: for a
        // one-word query the two sets are the same by construction, and
        // labelling an exact answer approximate would be the page lying.
        if (partial.some(({ item }) => !hitSet.has(item))) {
          list = partial;
          closestFor = partial.length;
        }
      }
      list.sort((a, b) => b.value - a.value || a.item.i - b.item.i);
      return { list, closestFor, exact: hits.length };
    }

    function drawResults(data, ranked, all) {
      resultsList.replaceChildren();
      const shown = all ? ranked.list : ranked.list.slice(0, RESULTS_SHOWN);
      for (const { item } of shown) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = item.u;
        link.textContent = item.t;
        if (item.k === 'research') {
          link.addEventListener('click', () => record('research_opened_from_search'));
        } else if (item.k === 'guide' || item.k === 'post' || item.k === 'page') {
          link.addEventListener('click', () => record(item.k + '_opened_from_search'));
        } else {
          link.dataset.tool = item.s;
          link.addEventListener('click', () => record('tool_opened:' + item.s));
        }
        const where = document.createElement('span');
        where.className = 'r-cat';
        // A guide's own title often leans on its tool ("This calculator vs. a
        // flat rate"), so the line under it names the tool it belongs to.
        const parent = item.k === 'guide' ? TOOLS.get(item.s) : null;
        where.textContent = item.k === 'guide'
          ? 'Guide' + (parent ? ' · ' + parent.t : '')
          : (data.cats[item.c] || '') +
            (item.k === 'app' ? ' · self-hostable app' : item.k === 'cli' ? ' · command-line tool' : '');
        const blurb = document.createElement('p');
        blurb.textContent = item.d;
        li.append(link, where, blurb);
        resultsList.append(li);
      }
      resultsList.hidden = shown.length === 0;
      resultsMore.replaceChildren();
      resultsMore.hidden = shown.length >= ranked.list.length;
      if (!resultsMore.hidden) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Show all ' + ranked.list.length + ' results';
        button.addEventListener('click', () => drawResults(data, ranked, true));
        resultsMore.append(button);
      }
    }

    function clearResults() {
      resultsList.replaceChildren();
      resultsList.hidden = true;
      resultsMore.hidden = true;
      closest.hidden = true;
      empty.hidden = true;
      count.textContent = '';
    }

    async function runSearch() {
      const text = q.value.trim();
      // Keep the address in step, so a result list can be shared or reloaded,
      // and the header's search box on every other page lands here with it.
      try {
        const url = new URL(location.href);
        if (text) url.searchParams.set('q', text); else url.searchParams.delete('q');
        history.replaceState(null, '', url);
      } catch { /* a sandboxed frame may refuse; the search still works */ }
      if (!text) { clearResults(); return; }
      let data;
      try {
        data = await loadIndex();
      } catch {
        count.textContent = 'Search could not load. Every tool is listed on its category page below.';
        return;
      }
      if (q.value.trim() !== text) return; // a newer keystroke owns the page
      const forms = normalise(text, data.stop);
      if (!forms.length) { clearResults(); return; }
      if (!searchCounted) { searchCounted = true; record('hub_search_used'); }
      const ranked = rank(data, forms);
      drawResults(data, ranked, false);
      empty.hidden = ranked.list.length !== 0;
      closest.hidden = ranked.closestFor === 0;
      closest.textContent = ranked.closestFor === 0
        ? ''
        : (ranked.exact === 0
          ? 'No tool matches every word. Closest ' + ranked.closestFor + ':'
          : 'No tool is named for that. Closest ' + ranked.closestFor + ':');
      count.textContent = ranked.closestFor
        ? ''
        : ranked.list.length + ' result' + (ranked.list.length === 1 ? '' : 's') + ' of ' + data.items.length;
    }

    q.addEventListener('input', runSearch);
    // Warm the index the moment the box is focused, so the first keystroke
    // usually finds it already here.
    q.addEventListener('focus', () => { loadIndex().catch(() => {}); }, { once: true });
    form.addEventListener('submit', (event) => { event.preventDefault(); runSearch(); });
    {
      const initial = new URLSearchParams(location.search).get('q');
      if (initial) {
        q.value = initial;
        runSearch();
        form.scrollIntoView({ block: 'start' });
      }
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
        // Only offer a tool the site actually publishes: a slug left behind by
        // a tool that has since been renamed or withdrawn would 404. The
        // search index is the list of what ships, and names each tool.
        const tool = TOOLS.get(slug);
        if (!tool) continue;

        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = slug + '/';
        link.textContent = tool.t || slug;
        link.addEventListener('click', () => record('tool_opened:' + slug));

        const meta = document.createElement('span');
        meta.className = 'times';
        meta.textContent = times === 1 ? 'opened once' : 'opened ' + times + ' times';

        item.append(link, meta);
        list.append(item);
      }

      section.hidden = list.childElementCount === 0;
    }

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
      // Rows are named from the search index; until it is here there is
      // nothing to name them with. A restore from backup lands here first on a
      // page that never needed the index, so fetch it and come back.
      if (!indexReady) {
        if (savedBids().length) loadIndex().then(showSavedBids, () => {});
        return;
      }
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
        const tool = TOOLS.get(row.slug);
        // The tool's own name, taken from the search index entry the row was
        // matched to rather than off the bid: the slug is what storage
        // carries, and "deck-bid-calculator" is not what a contractor calls
        // the thing. Read here, once per row, so winRateSentence stays a pure
        // function of its rows and can be tested without a document.
        if (tool) {
          rows.push({
            ...row,
            label: tool.t || row.slug,
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
        const { slug, name, at, amount, outcome, label: toolName } = row;
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
        where.textContent = toolName || slug;

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

    // Both lists name their tools from the search index, which this page does
    // not otherwise load until someone searches. Fetch it now only when this
    // browser has something to show: a saved bid, or a tool it has opened.
    try {
      const hasBids = Object.keys((JSON.parse(localStorage.getItem(BIDS_KEY) || '{}') || {}).bids || {}).length > 0;
      const hasViews = /"tool_viewed:/.test(localStorage.getItem(KEY) || '');
      if (hasBids || hasViews) {
        loadIndex().then(() => { showYourTools(); showSavedBids(); }, () => {});
      }
    } catch { /* storage unavailable: nothing saved to show */ }
${BACKUP_WIDGET_SCRIPT}
${OFFLINE_WIDGET_SCRIPT}
  </script>
  <script>${HOME_MOTION_SCRIPT}
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
 * The first-party visitor counter (`platform/counter/`), off unless the build
 * is given its URL (`--counter-url=` or `PAGES_COUNTER_URL`). Empty means the
 * built site is byte-for-byte what it was before the counter existed: no
 * beacon, and the privacy copy still says the tally never leaves the browser.
 * Set for the length of one `buildSite` call; every renderer that states the
 * privacy promise reads it through `counterOn()` so the copy and the beacon
 * can never disagree.
 */
let SITE_COUNTER_URL = '';
export function counterOn() {
  return SITE_COUNTER_URL !== '';
}
/**
 * The feedback endpoint (`platform/edge/`), off unless the build is given its
 * origin (`--feedback-url=`, `PAGES_FEEDBACK_URL`, or `platform/edge/site.json`).
 * Off, the feedback page offers GitHub issues only and the privacy copy says
 * nothing is sent; on, the page carries the form and the copy says where its
 * text goes. Same lifetime and reason as `SITE_COUNTER_URL`.
 */
let SITE_FEEDBACK_URL = '';
export function feedbackOn() {
  return SITE_FEEDBACK_URL !== '';
}
/**
 * The 20 stdlib-only `*-check` linters that `platform/distribution/` already
 * publishes as a GitHub Action, a pre-commit hook and a Nix flake app. Those
 * channels need no account or publish step, so they are live today, but until
 * 2026-10-29 no tool page said so: a developer who found the checker had no
 * way to learn it could run in their CI. Gated on the generated action file,
 * so a linter is offered only once its action, hook and app exist.
 */
const CI_ACTIONS_DIR = path.join(REPO_ROOT, 'platform', 'distribution', 'actions');
const CI_USES_PREFIX = 'duncan-haywood/oss-monorepo/platform/distribution/actions';
export function hasCiChannels(slug, actionsDir = CI_ACTIONS_DIR) {
  return existsSync(path.join(actionsDir, slug, 'action.yml'));
}
export function renderCiInstall(slug, baseUrl) {
  const script = `${baseUrl}${slug}/check.py`;
  const block = (text) => `<pre><code>${escapeHtml(text)}</code></pre>`;
  return `    <details class="pf-ci">
      <summary>Run this check from a terminal, in CI or as a pre-commit hook</summary>
      <p>The same checker as this page, as one Python file with no dependencies. Nothing is sent anywhere; it reads the files you point it at.</p>
      ${block(`curl -fsSLO ${script}
python3 check.py --fail-on-risk .`)}
      <p>GitHub Actions (after <code>actions/checkout</code>). It fetches this whole repository, so pin a commit rather than <code>main</code> in real use:</p>
      ${block(`- uses: ${CI_USES_PREFIX}/${slug}@main
  with:
    path: .
    fail-on-risk: 'true'`)}
      <p>pre-commit (<code>.pre-commit-config.yaml</code>):</p>
      ${block(`- repo: ${REPO_URL}
  rev: main  # pin a commit in real use
  hooks:
    - id: ${slug}`)}
      <p>Nix: <code>${escapeHtml(`nix run github:duncan-haywood/oss-monorepo#${slug} -- --fail-on-risk .`)}</code></p>
    </details>
`;
}
export function normaliseCounterUrl(raw) {
  if (!raw) return '';
  const u = new URL(raw);
  if (u.protocol !== 'https:') throw new Error(`counter URL must be https: ${raw}`);
  return u.origin;
}

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
.pf-ci{margin:0 0 14px}
.pf-ci summary{cursor:pointer;font-weight:600}
.pf-ci pre{overflow-x:auto;margin:0 0 10px;padding:8px 10px;border:1px solid var(--pf-line);border-radius:6px;font-size:.82rem}
.pf-chrome :focus-visible{outline:2px solid currentColor;outline-offset:2px}

/* The site header as a full-width band, as it is on the site's own pages.
 *
 * Every venture centres its body in a 1000-1080px column with ~28px of padding,
 * and the header is the body's first child, so it used to sit as a grey strip
 * inset in that column, floating 28px below the top of the window. The band
 * now meets the top edge (the body's top padding moves below it) and its fill
 * runs to both edges through a spread shadow clipped to the band's height. A
 * shadow, not a 100vw pseudo-element: it adds no scrollable overflow, so no
 * venture page grows a sideways scroll, and the fill stays the host-neutral
 * grey the header always had. A browser without :has() keeps the old top gap.
 *
 * The mark is the one literal colour here, and it is not text: it is the
 * site's logo (pf-site.css draws the same compass-star mark), so it reads as one
 * site on every venture palette instead of a blot of the host's ink. */
body:has(> .pf-chrome-top[data-pfs-head]:first-child){padding-top:0;margin-top:0}
.pf-chrome-top[data-pfs-head]{margin:0 0 26px;border-bottom:0;
  box-shadow:0 0 0 100vmax var(--pfs-head-bg,rgba(128,128,128,.07));clip-path:inset(0 -100vmax)}
.pf-chrome-top .pfs-bar{padding:12px 0}
.pf-chrome-top .pfs-crumbs{padding:0 0 10px}
.pf-chrome-top .pfs-mark{background:${MARK_BG}}
.pf-chrome-top .pfs-searchlink{padding:4px 14px;border:1px solid var(--pf-line);border-radius:999px}
[data-pfs-head].pf-chrome-top .pfs-searchlink:hover{text-decoration:none;border-color:currentColor}
/* The shop-rates and saved-bids bars (rates.mjs, jobs.mjs) sit under the band
 * in the same column, so they line up with the venture's content rather than
 * their own 18px inset. */
body:has(> .pf-chrome-top[data-pfs-head]:first-child) > :is(.pf-rates,.pf-jobs){padding-left:0;padding-right:0}
body:has(> .pf-chrome-top[data-pfs-head]:first-child) > .pf-jobs .pf-jobs-status:empty{display:none}

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
input[type=file]{max-width:100%;cursor:pointer}
input[type=file]::file-selector-button{font:inherit;color:inherit;background:rgba(128,128,128,.14);border:1px solid rgba(128,128,128,.55);border-radius:7px;padding:6px 14px;margin-right:12px;cursor:pointer}
input[type=file]::file-selector-button:hover{background:rgba(128,128,128,.26)}
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
  // The site header's layout rules ride along (see site-nav.mjs), then
  // `VENTURE_CHROME_CSS`, which gives the venture header and footer the site's
  // own palette so every tool page carries the same bar as the rest of the site.
  return `${CHROME_CSS.trimStart()}${SITE_HEADER_CSS}${VENTURE_CHROME_CSS}${REFLOW_CSS}`;
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
const CHROME_SCRIPT = ({ counterUrl = '' } = {}) => `
(function(){
  try{
    if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
    if(localStorage.getItem('portfolio-hub-optout')==='1')return;
    var tag=document.querySelector('script[${CHROME_SLUG_ATTR}]');
    var slug=tag?tag.getAttribute('${CHROME_SLUG_ATTR}')||'':'';
    if(!slug)return;${counterUrl ? `
    var hit={p:slug};
    try{
      var q=new URLSearchParams(location.search),ref=q.get('ref');
      if(ref&&${JSON.stringify(CHANNEL_REFS)}.indexOf(ref)>=0){
        hit.r=ref;
        q.delete('ref');
        var s=q.toString();
        history.replaceState(history.state,'',location.pathname+(s?'?'+s:'')+location.hash);
      }
    }catch(e){}
    try{
      var rh=document.referrer?new URL(document.referrer).hostname:'';
      if(rh&&rh!==location.hostname){var src=(${sourceOf.toString()})(rh,${JSON.stringify(SOURCE_HOSTS)},${JSON.stringify(SOURCE_LABELS)});if(src)hit.s=src;}
    }catch(e){}
    try{navigator.sendBeacon(${JSON.stringify(`${counterUrl}/hit`)},new Blob([JSON.stringify(hit)],{type:'text/plain'}));}catch(e){}` : ''}
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
export function renderChromeModule({ counterUrl = SITE_COUNTER_URL } = {}) {
  return `${stripForInjection(CHROME_SCRIPT({ counterUrl }))}\n${stripForInjection(VENTURE_CHROME_JS)}\n${stripForInjection(SCROLL_A11Y_SCRIPT)}\n${stripForInjection(ASSISTANT_LAUNCHER_JS)}\n`;
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
export { SITE_NAME };

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

// Finds the document's real `<body ...>`/`</body>` pair by position, not by
// literal text. `html.match(/<body[^>]*>/i)` (the previous implementation)
// finds the *first* occurrence of that shape anywhere in the string, which is
// wrong the moment a page's own content quotes an example HTML document
// earlier than its real body tag -- exactly what a security checker's own
// copy does when it shows what a soft-404 error page looks like, e.g. a
// FAQPage JSON-LD answer containing the literal text
// `<html><body>404 Not Found</body></html>`. `git-exposure-check`'s own
// "how-to-tell-a-real-exposed-git-directory-from-a-soft-404.html" page hit
// this: the fake `<body>`/`</body>` inside its head's JSON-LD matched first,
// and the topBar/footer this function inserts landed *inside the JSON
// string*, corrupting it (`check.mjs` and `page-integrity.mjs` both catch
// invalid JSON-LD, but only after the page ships broken to a crawler until
// caught -- and it blocked `publish-branch.sh`'s own build-artifact check the
// day this was found, for the same reason). The real `<body>` tag can only
// legitimately appear after the real `</head>`, so searching from there skips
// any earlier, textually-identical example inside the head's own scripts.
//
// `</body>` is the *last* match after that real opening tag, not the first --
// added after the first version of this fix (which took the first match
// after `openEnd`) still corrupted a page whose fake example sits inside the
// real `<body>` rather than in `<head>`: the fake `</body>` inside it then
// preceded the page's own real closing tag, and "first after the open tag"
// found that one instead. Nothing legitimate ever follows the document's real
// `</body>` but `</html>`, so the last match in the document is always the
// real one, regardless of where an earlier quoted example -- in `<head>` or
// in `<body>` -- happens to place its own fake `<body>`/`</body>` text.
// Every insertion below uses this function's indices with plain string
// slicing rather than `String.prototype.replace(literalOrRegex, ...)`,
// because that method also matches by content rather than position and would
// reintroduce the identical bug at each call site.
function locateBody(html) {
  const headEnd = /<\/head\s*>/i.exec(html);
  const searchFrom = headEnd ? headEnd.index + headEnd[0].length : 0;
  const open = /<body[^>]*>/i.exec(html.slice(searchFrom));
  if (!open) return null;
  const openIndex = searchFrom + open.index;
  const openEnd = openIndex + open[0].length;
  const closes = [...html.slice(openEnd).matchAll(/<\/body\s*>/gi)];
  if (!closes.length) return null;
  const lastClose = closes[closes.length - 1];
  return { openTag: open[0], openIndex, openEnd, closeIndex: openEnd + lastClose.index };
}

function spliceAt(html, index, text) {
  return html.slice(0, index) + text + html.slice(index);
}

export function injectChrome(html, { slug, toRoot, total, related = [], canonical, baseUrl, isEntry, title, pageTitle, externalCallHosts = [], audiences = [] }) {
  if (html.includes(CHROME_MARKER)) return html;
  const initialBody = locateBody(html);
  if (!initialBody) return html;

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
  // The trail the header shows (Home › category › tool › page), built once so
  // the visible breadcrumb and the BreadcrumbList below cannot disagree.
  // Search engines want the markup to describe the trail on the page; until
  // 2026-10-24 only entry pages carried any, and it skipped the category the
  // visible trail shows, so ~1,750 guide and comparison pages inside tools
  // showed a four-level trail and declared none.
  const category = categoryFor(slug);
  const categoryHref = categoryPagePath(category.id);
  const crumbs = [{ label: category.title, href: `${toRoot}${categoryHref}` }];
  if (isEntry) crumbs.push({ label: title || slug });
  else crumbs.push({ label: title || slug, href: `${toRoot}${slug}/` }, { label: pageTitle || 'This page' });
  if (canonical && !html.includes('"BreadcrumbList"') && (isEntry || pageTitle)) {
    // Lets a result render as "Maris Stella Labs › Marketplace sellers ›
    // eBay Fee Calculator" rather than a bare URL, and tells an answer engine
    // these are one collection rather than 1,300 unrelated pages. A page that
    // wrote its own is left alone. A deep page with no title of its own gets
    // none: "This page" is a fine visible label and a useless result name.
    const base = baseUrl || (isEntry ? canonical.slice(0, canonical.length - `${slug}/`.length) : '');
    if (base) {
      const trail = [
        { name: SITE_NAME, item: base },
        { name: category.title, item: `${base}${categoryHref}` },
        { name: title || slug, item: `${base}${slug}/` },
      ];
      if (!isEntry) trail.push({ name: pageTitle, item: canonical });
      headExtras += `\n<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
      })}</script>`;
    }
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
      : spliceAt(html, initialBody.openIndex, `${headExtras}\n`);
  }

  const hub = `${toRoot}`;
  // The same header every page on the site carries (site-nav.mjs), plus a
  // breadcrumb to the tool's category: the next tool a visitor needs is
  // usually one shelf over, not back through the whole catalogue. The search
  // entry is a link here, never a form, so a venture script that reads the
  // first form or every input on its page still finds its own.
  const topBar = renderSiteHeader({
    toRoot,
    current: 'tools',
    search: 'link',
    crumbs,
    extraClass: 'pf-chrome pf-chrome-top',
  });

  const links = related
    .map(
      (surface) =>
        `      <li><a href="${escapeHtml(`${toRoot}${surface.slug}/`)}" data-pf-to="${escapeHtml(
          surface.slug,
        )}">${escapeHtml(surface.title)}</a></li>`,
    )
    .join('\n');

  // "More free tools for roofers →": the page about this tool's audience, which
  // links every other tool that person uses. Absent when no audience claims it.
  const forLinks = audiences.length
    ? `    <p class="pf-for">${audiences
        .map(
          (audience) =>
            `<a href="${escapeHtml(`${toRoot}${categoryPagePath(audiencePageId(audience))}`)}">More free tools for ${escapeHtml(audience.who)} →</a>`,
        )
        .join(' &nbsp;·&nbsp; ')}</p>\n`
    : '';

  // Tested against the venture's own markup, before any chrome is added.
  const noSla = NO_SLA_PATTERN.test(html) ? '' : `    ${NO_SLA_CLAUSE}\n`;

  const footer = `<aside class="pf-chrome pf-chrome-foot" aria-label="More free tools">
  <div class="pf-inner">
    <h2>More free tools</h2>
    <p>${externalCallHosts.length
      ? `Everything on this page runs in your browser too, except this one lookup: what you type here also goes to ${listProse(externalCallHosts)}, because that is what checking it means — see the note on this page for exactly what is sent.`
      : 'Free and private, like this one — everything runs in your browser, and nothing you type is uploaded.'
    }</p>
${noSla}${isEntry && baseUrl && hasCiChannels(slug) ? renderCiInstall(slug, baseUrl) : ''}${links ? `    <ul>\n${links}\n    </ul>\n` : ''}${forLinks}    <p>
      <a href="${escapeHtml(hub)}" data-pf-to="hub">Browse all ${total} free tools →</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(`${toRoot}${ABOUT_PATH}`)}">About &amp; privacy</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(`${toRoot}${FEEDBACK_PATH}?tool=${encodeURIComponent(slug)}`)}">Report a problem or suggest a feature</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(`${toRoot}deploy/?app=${encodeURIComponent(slug)}`)}">Run your own copy</a>
    </p>
    <p class="pf-support">${sponsorsNote()}</p>
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

  // Re-located rather than reusing `initialBody`: the head-extras/stylesheet
  // insertions above may have shifted every index that followed them. Two
  // separate `locateBody` calls, not one reused across both splices below,
  // because inserting the top bar shifts `closeIndex` by exactly the bar's
  // length -- reusing the first call's stale index would put the footer that
  // many characters into the wrong place on every page long enough for it to
  // matter.
  const bodyAfterHead = locateBody(withStyle);
  if (!bodyAfterHead) return withStyle; // defensive: entry already required a body pair
  const withTopBar = spliceAt(withStyle, bodyAfterHead.openEnd, `\n${stylePrefix}${topBar}`);

  const bodyBeforeFooter = locateBody(withTopBar);
  if (!bodyBeforeFooter) return withTopBar; // defensive: same structure, just shifted
  return spliceAt(withTopBar, bodyBeforeFooter.closeIndex, `${footer}\n`);
}

/**
 * A copy-link button a venture wrote itself, in any of its five spellings.
 *
 * `copy-link` was added 2026-09-10, found while fixing the same gap in
 * `roundtrip.mjs` (which had grown eleven recognised spellings to this file's
 * four): `wash-and-fold-price-calculator`, `sponsor-ready` and
 * `ai-engineering-academy/tools/rc-filter-calculator` all ship a real button
 * under this id. None currently sit in the bid-calculator family this gate
 * guards, so the duplicate-button bug this regex exists to prevent has not
 * fired yet for them -- but the next venture that reuses this id and *is* a
 * bid calculator would silently get two share controls, exactly the
 * `freelance-retainer-calculator` failure documented below.
 */
const OWN_COPY_BUTTON = /<button[^>]*\bid="(share|copyShare|copyLink|shareLink|copy-link)"/;

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
  const audiencePages = audienceGroups(surfaces);
  const wrapped = [];
  const rated = [];
  const saved = [];
  const shared = [];
  const described = [];
  const highlighted = [];
  const narrowed = [];
  const embedded = [];

  // Sixteen tools at a time: each tool's pages are independent of every other
  // tool's, and one at a time the pass mostly waited on the disk. Results are
  // gathered per tool and joined in catalogue order, so the output is the same.
  const perSurface = await mapLimit(surfaces, 16, async (surface) => {
    const found = { wrapped: [], rated: [], saved: [], shared: [], described: [], highlighted: [], narrowed: [], embedded: [] };
    const { wrapped, rated, saved, shared, described, highlighted, narrowed, embedded } = found;
    const dir = path.join(outDir, surface.slug);
    if (!(await exists(dir))) return found;
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
      const pageMeta = readMeta(html, surface.slug);
      const chromed = injectFavicon(annotateNumberInputs(injectChrome(html, {
        slug: surface.slug,
        toRoot,
        total: surfaces.length,
        related,
        title: surface.title,
        pageTitle: pageMeta.title,
        canonical,
        baseUrl,
        isEntry: url === `${surface.slug}/index.html`,
        externalCallHosts: surface.externalFetchHosts,
        audiences: audiencesFor(surface.slug, audiencePages),
      })), toRoot);
      // After the chrome, which guarantees the canonical this repairs, and read
      // from the venture's *own* markup: a deep SEO page inside a tool has its
      // own title and description, and `surface` carries the tool's.
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
      // Only for tools whose users keep bids: the band and the share row are
      // written for contractors, and on a 401(k) page they read as a mistake.
      const next = slugTakesSavedBids(surface.slug)
        ? injectSavedBids(withRates, surface.slug, toRoot)
        : withRates;
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
    return found;
  });
  for (const found of perSurface) {
    wrapped.push(...found.wrapped);
    rated.push(...found.rated);
    saved.push(...found.saved);
    shared.push(...found.shared);
    described.push(...found.described);
    highlighted.push(...found.highlighted);
    narrowed.push(...found.narrowed);
    embedded.push(...found.embedded);
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
export function renderHubSitemap(baseUrl, categoryIds = [], compareProductKeys = [], researchSlugs = [], writingSlugs = []) {
  const urls = [`  <url><loc>${baseUrl}</loc></url>`]
    // The Tools section's index of every category page.
    .concat([`  <url><loc>${baseUrl}${CATEGORY_PATH_PREFIX}/</loc></url>`])
    .concat(categoryIds.map((id) => `  <url><loc>${baseUrl}${categoryPagePath(id)}</loc></url>`))
    // The About page is a hub-level surface, not a venture's, so it is listed
    // here or in no sitemap at all — and an unlisted page is one a crawler
    // reaches only by following a footer link on a page it happened to find.
    .concat([`  <url><loc>${baseUrl}${ABOUT_PATH}</loc></url>`])
    // The assistant's page, on the same terms: hub-level, so listed here or nowhere.
    .concat([`  <url><loc>${baseUrl}${ASK_PATH}</loc></url>`])
    // Open custom development, on the same terms.
    .concat([`  <url><loc>${baseUrl}${CUSTOM_DEV_PATH}</loc></url>`])
    // And the comparison index, on exactly the same terms: a hub-level page
    // this build writes, so it is listed here or nowhere.
    .concat([`  <url><loc>${baseUrl}${COMPARE_PATH}</loc></url>`])
    .concat([`  <url><loc>${baseUrl}${RESEARCH_PATH}</loc></url>`])
    // Each research project's own home page, written by the research builder.
    .concat(researchSlugs.map((slug) => `  <url><loc>${baseUrl}${RESEARCH_PATH}${slug}/</loc></url>`))
    // The writing index and each post, only when the build wrote them.
    .concat(writingSlugs.length ? [`  <url><loc>${baseUrl}${WRITING_PATH}</loc></url>`] : [])
    .concat(writingSlugs.map((slug) => `  <url><loc>${baseUrl}${WRITING_PATH}${slug}/</loc></url>`))
    // The fiction section, a hub-level page this build always writes.
    .concat([`  <url><loc>${baseUrl}${STORIES_PATH}</loc></url>`])
    // The open book: updates and the changelog. Both change with every merge,
    // which is what a crawler deciding how often to come back wants to see.
    .concat([`  <url><loc>${baseUrl}${UPDATES_PATH}</loc></url>`, `  <url><loc>${baseUrl}${CHANGELOG_PATH}</loc></url>`])
    // And the guides index, for the same reason. See `GUIDES_PATH`: it is the
    // only page on the site that is *about* the 342 informational pages the
    // ventures wrote, which is the half of the catalogue organic search
    // actually reaches.
    .concat([`  <url><loc>${baseUrl}${GUIDES_PATH}</loc></url>`])
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
export function renderVentureSitemap(slug, relativePages, baseUrl, lastmods = {}) {
  // `lastmods` maps a published page to the date its source last changed
  // (`lastmod.mjs`). A page with no known date gets no `<lastmod>` at all.
  const urls = relativePages
    .map((relative) => [`${baseUrl}${pageUrlPath(slug, relative)}`, lastmods[relative]])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([url, date]) => `  <url><loc>${url}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`);

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
 * The `llms.txt` for a product that ships none: title, its own description,
 * the tool's page and its source, and the standing caveat. Nothing is added
 * that the page does not already say.
 */
export function llmsAsOfLine(updated, before) {
  if (/^\d{4}-\d{2}-\d{2}/.test(updated ?? '')) return `Source last changed: ${updated.slice(0, 10)} (from the repository's git history).`;
  // A shallow build cannot see the change itself, only that it predates the
  // oldest commit it has (`historyStart` in lastmod.mjs): say exactly that.
  return /^\d{4}-\d{2}-\d{2}/.test(before ?? '') ? `Source last changed: on or before ${before.slice(0, 10)} (older than the git history this build read).` : '';
}

/**
 * A hand-written `llms.txt` is copied as is, so it cannot go stale on its own
 * date line; the build appends the git date instead, unless the author already
 * wrote a "last changed", "last updated" or "as of" line.
 */
export function withLlmsAsOf(text, updated, before) {
  const line = llmsAsOfLine(updated, before);
  if (!line || /(last (changed|updated|verified)|as of)\s*:?\s*\d{4}-\d{2}-\d{2}/i.test(text)) return text;
  return `${text.replace(/\s+$/, '')}\n\n${line}\n`;
}

export function renderProductLlmsTxt({ slug, title, description, fullDescription, updated, before }, baseUrl) {
  const asOf = llmsAsOfLine(updated, before) ? `\n${llmsAsOfLine(updated, before)}\n` : '';
  const one = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const body = one(fullDescription || description);
  return `# ${one(title)}

> ${body}

## Pages

- [The tool](${baseUrl}${slug}/): the tool itself, with its own notes and disclaimer.
- [Source and README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/${slug}): MIT-licensed code, tests and notes.
- [All tools](${baseUrl}llms.txt): the catalogue this tool belongs to.

## Limits

Results are estimates from the values typed in, not legal, tax, financial or professional advice. Check the figures with a qualified professional before relying on them.
${asOf}`;
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
const LLMS_INDEX_DESC_MAX = 140;
const LLMS_INDEX_TOOLS_PER_CATEGORY = 4;

export function renderLlmsTxt(surfaces, baseUrl, compareProductGroups = [], guideGroups = [], { audiences = [], research = { themes: [] }, agentPostCount = 0, full = false } = {}) {
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  // The index (`llms.txt`) keeps each tool to its first sentence, capped, so
  // the file fits one fetch (539 KB did not: backlog P052); `llms-full.txt`
  // keeps `fullDescription`, which is what a model matches a query against.
  const shortText = (value) => {
    const text = oneLine(value);
    const first = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
    const cut = first.length > LLMS_INDEX_DESC_MAX ? `${first.slice(0, LLMS_INDEX_DESC_MAX - 1).replace(/\s+\S*$/, '')}…` : first;
    return cut;
  };
  // Same fact the About page states in full; see `disclaimerHtml` for why it
  // is derived rather than hand-typed.
  const exceptions = externalCallExceptions(surfaces);

  // A product that ships its own `llms.txt` (how to call it, which options fit
  // which data, its limits) gets it named on its line, so an assistant that
  // matched the product here can fetch the detail without crawling the page.
  const bullet = (surface) =>
    full
      ? `- [${oneLine(surface.title)}](${baseUrl}${surface.slug}/): ${oneLine(surface.fullDescription || surface.description)}${surface.llmsDoc ? ` LLM docs: ${baseUrl}${surface.slug}/llms.txt` : ''}`
      : `- [${oneLine(surface.title)}](${baseUrl}${surface.slug}/): ${shortText(surface.description || surface.fullDescription)}`;

  const sections = groupByCategory(surfaces).map(({ category, items }) => {
    const subgroups = groupBySubcategory(category.id, items);
    // Sub-headings for a sub-grouped category, so a model reading this file can
    // answer "which of these is a roofing tool" from the structure rather than
    // by matching prose across 110 sibling bullets.
    const body = !full
      ? `${items.slice(0, LLMS_INDEX_TOOLS_PER_CATEGORY).map(bullet).join('\n')}${
          items.length > LLMS_INDEX_TOOLS_PER_CATEGORY
            ? `\n\n${items.length - LLMS_INDEX_TOOLS_PER_CATEGORY} more tools in this category: see the category page, or [llms-full.txt](${baseUrl}llms-full.txt).`
            : ''
        }`
      : subgroups.length === 1 && subgroups[0].subcategory === null
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
    full
      ? `- [Short index](${baseUrl}llms.txt): the same tools with one-sentence descriptions, small enough to read in one fetch.`
      : `- [Full text](${baseUrl}llms-full.txt): every tool with its complete description and the LLM docs a product ships; large (several hundred KB), fetch only when the index does not answer the question.`,
    `- [About and press kit](${baseUrl}${ABOUT_PATH}): what this site is, how visitor data is handled (${counterOn() ? 'inputs never leave the browser; a cookieless per-page daily tally, with the kind of referring site, the country code and the device type, goes to a first-party counter' : 'it never leaves the browser'}${exceptions.length ? ', with a documented exception listed there' : ''}), the licence, and pre-written boilerplate for citing or linking to these tools.`,
    `- [Open custom development](${baseUrl}${CUSTOM_DEV_PATH}): how anyone can ask the agents that build this site for a new tool, free and in public, the one condition (the result stays MIT licensed, held by the repository owner), and every request so far with its status.`,
    `- [Ask](${baseUrl}${ASK_PATH}): fill any calculator here by voice or a typed sentence, find a tool, or hear a result read back; in browsers with WebMCP every page also offers \`search_site_tools\`, \`read_page_results\` and (on calculators) \`fill_form\` to an agent. Runs in the browser; no model unless the visitor switches one on. The page states the measured accuracy and the limitations.`,
    `- [Updates and roadmap](${baseUrl}${UPDATES_PATH}): what shipped this week, what is in progress, the owner's direction for the project and how AI agents build it; and the [changelog](${baseUrl}${CHANGELOG_PATH}) of every change merged, by day.`,
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
    // The informational half of the catalogue, which this file named nowhere
    // until 2026-09-07. Measured against a fresh build that day: 0 of the 173
    // question-shaped guide pages appeared anywhere in `llms.txt`, while every
    // tool did — so an assistant asked "how much should I charge to replace a
    // boiler" could see that a boiler calculator exists and could not see that
    // a page answering the question in prose exists beside it. One line, not
    // 342: the index is what an assistant should fetch, and the sitemap line
    // below already covers the individual pages for a crawler.
    ...(guideGroups.length
      ? [
          `- [Guides](${baseUrl}${GUIDES_PATH}): ${guideGroups.reduce(
            (n, group) => n + group.items.length,
            0,
          )} plain-English pages the tools' own authors wrote beside the calculators — how a price is built up, when one option beats another, what a fee schedule does to a payout — grouped by trade and by tool. Useful for answering "how much should I charge for X" with a page that shows the arithmetic, and a calculator on the same site that runs it on the reader's own numbers.`,
        ]
      : []),
    // The agent-to-agent blog (writing.mjs, AGENT_BLOG): posts written for a
    // model reader, each as raw Markdown, with its own llms.txt.
    ...(agentPostCount
      ? [`- [Agent-to-agent blog](${baseUrl}${AGENTS_PATH}llms.txt): ${agentPostCount} post${agentPostCount === 1 ? '' : 's'} written by AI agents for AI agents about building and running this repository, each as raw Markdown, with every claim tied to a repository path.`]
      : []),
    `- [Machine-readable catalog](${baseUrl}catalog.json): the same tool list as JSON, with categories and page counts.`,
    // For an agent acting on someone's behalf, which wants the numbers rather
    // than a page to send a person to. Every tool's arithmetic is a pure module
    // beside its page; platform/agents/tools.mjs calls those modules from a
    // clone, from the command line or as an MCP server, with no browser.
    `- [Command line and MCP server for agents](${REPO_URL}/tree/main/platform/agents): call any of these tools' calculation engines directly with JSON inputs from a clone of the open-source repository — \`node platform/agents/tools.mjs search|describe|call\`, or the same as a local stdio MCP server. No browser, no network, no account.`,
    `- [Sitemap](${baseUrl}sitemap.xml): every published page, including the worked-example and decision pages inside each tool.`,
    `- [Atom feed](${baseUrl}${FEED_FILE}): new tools as they are published, newest first. Poll this rather than re-reading the whole catalogue to find out what is new.`,
    '',
  ].join('\n');

  // "Free tools for roofers" and its 27 siblings: the page to cite when the
  // question names a trade rather than a tool. Absent from this file until
  // 2026-10-21, while every tool was here.
  const audienceSection = audiences.length
    ? `## Tools by who you are

One page per trade or kind of business, listing only the tools that serve it.

${audiences
  .map(({ audience, items }) => `- [${oneLine(audience.title)}](${baseUrl}${categoryPagePath(audiencePageId(audience))}): ${items.length} tools. ${oneLine(audience.description)}`)
  .join('\n')}
`
    : '';
  // The research half of the site, by topic, with counts. It was one line
  // under "Optional" describing two of its 28 topics.
  const researchProjects = research.themes.reduce((n, t) => n + t.count, 0);
  const researchSection = research.themes.length
    ? `## Open research

${researchProjects} research projects, each with its question, code, tests and results, MIT licensed: [the research index](${baseUrl}${RESEARCH_PATH}). By topic:

${research.themes
  .map((t) => `- [${oneLine(t.name)}](${baseUrl}${RESEARCH_PATH}topics/${t.id}/): ${t.count} project${t.count === 1 ? '' : 's'}`)
  .join('\n')}
`
    : '';

  const network = exceptions.length
    ? `## Tools that call the network

On ${listProse(exceptions.map((x) => toolProseName(x.title)))} the one thing you paste is sent to the public API it checks; the [About page](${baseUrl}${ABOUT_PATH}) explains exactly what.

`
    : '';

  return `# ${SITE_NAME}

> ${surfaces.length} free, open-source tools (browser calculators and checks, self-hostable business apps and command-line tools) for marketplace sellers, trade contractors, logistics buyers and small teams, plus ${researchProjects ? `${researchProjects} reproducible research projects` : 'open research'}; no account or payment, and the numbers you type stay in your browser.

Each tool is a static page that works offline once opened, and is free with no
gated features. They are estimates and records to act on, not professional
advice or a determination made on anyone's behalf; each page carries its own
limitations.

${network}${audienceSection ? `${audienceSection}\n` : ''}${sections.join('\n')}
${researchSection ? `${researchSection}\n` : ''}${optional}`;
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
  ${siteStyleLink(baseUrl)}
  <style>
    :root { --bg: #eef2f7; --panel: #ffffff; --ink: #1d2530; --muted: #4a5666; --line: #d3dce6; --accent: #12594a; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #10151c; --panel: #171e27; --ink: #e8eef5; --muted: #a2b0c0; --line: #2a343f; --accent: #7fd8c0; }
    }
    body { font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; line-height: 1.6;
           color: var(--ink); background: var(--bg); -webkit-font-smoothing: antialiased; }
    .nf { max-width: 46rem; margin: 0 auto; padding: 0 16px 64px; --pf-hero-pull: 0px; }
    .nf h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.08; margin: 0 0 12px; }
    .nf .lede { font-size: 1.08rem; margin: 0 0 22px; }
    .code { font: 700 clamp(4.5rem, 14vw, 7.5rem)/1 "Inter", system-ui, sans-serif; letter-spacing: -.06em; margin: 0 0 4px;
            background: linear-gradient(100deg, #7fe3c6, #8ea2ff 55%, #c79bff); -webkit-background-clip: text;
            background-clip: text; color: transparent; }
    .nf-search { display: flex; gap: 8px; max-width: 34rem; }
    .nf-search input { flex: 1 1 auto; min-width: 0; font: inherit; padding: 11px 14px; border-radius: 12px;
                       border: 1px solid var(--line); background: var(--panel); color: var(--ink); }
    .nf-search button { font: inherit; font-weight: 700; padding: 11px 18px; border-radius: 12px; cursor: pointer;
                        border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
    .nf h2 { font-size: .8rem; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); margin: 8px 0 12px; }
    .ways { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .ways a { display: block; height: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 12px; text-decoration: none;
              border: 1px solid var(--line); background: var(--panel); color: var(--ink);
              transition: transform .15s ease, border-color .15s ease; }
    .ways a:hover, .ways a:focus-visible { transform: translateY(-2px); border-color: var(--accent); }
    .ways strong { display: block; color: var(--accent); }
    .ways span { font-size: .9rem; color: var(--muted); }
    @media (prefers-reduced-motion: reduce) { .ways a { transition: none; } .ways a:hover { transform: none; } }
  </style>
</head>
<body>
  <!-- Absolute links throughout: GitHub Pages serves this file under whatever
       path was mistyped, so a relative link would resolve against that. -->
  ${renderSiteHeader({ toRoot: baseUrl, search: 'link' })}
  <main class="nf">
  <header class="pf-hero">
    <p class="code" aria-hidden="true">404</p>
    <h1>That page isn't here</h1>
    <p class="lede">The tool may have moved, or the link may be mistyped. Search for it, or start from one of the sections below.</p>
    <form class="nf-search" action="${escapeHtml(baseUrl)}" method="get" role="search">
      <label class="pfs-vh" for="nf-q">Search every tool and research project</label>
      <input id="nf-q" name="q" type="search" placeholder="Search every tool and research project" autocomplete="off">
      <button type="submit">Search</button>
    </form>
  </header>
  <h2>Or start here</h2>
  <ul class="ways">
    <li><a href="${escapeHtml(`${baseUrl}${CATEGORY_PATH_PREFIX}/`)}"><strong>Tools by category →</strong><span>Every free calculator and checker, grouped by job.</span></a></li>
    <li><a href="${escapeHtml(`${baseUrl}guides/`)}"><strong>Guides →</strong><span>How a price is built up, and when one option beats another.</span></a></li>
    <li><a href="${escapeHtml(`${baseUrl}research/`)}"><strong>Research →</strong><span>Open projects with their code, tests and limitations.</span></a></li>
    <li><a href="${escapeHtml(`${baseUrl}writing/`)}"><strong>Blog →</strong><span>What building this with AI agents has taught us.</span></a></li>
  </ul>
  </main>
  <script>
    // Seed the search with the words of the path that missed, so a renamed
    // tool is usually one press of Enter away: /ebay-fee-calc/ -> "ebay fee calc".
    try {
      var words = decodeURIComponent(location.pathname).split('/').filter(Boolean).pop() || '';
      words = words.replace(/\.html?$/i, '').replace(/[-_.]+/g, ' ').trim();
      if (words && words.length < 80 && !/^404$/.test(words)) document.getElementById('nf-q').value = words;
    } catch (e) {}
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Offline support
// ---------------------------------------------------------------------------

/** Files a visitor asking to "save a category" needs: each tool's entry page
 *  and the modules and styles that page loads. Not the whole tree — the SEO
 *  articles and sitemaps are not what someone with no signal is reaching for,
 *  and this runs on a phone's data. */
const BUNDLE_EXTENSIONS = new Set(['.mjs', '.js', '.css']);

/**
 * Partitioned by category rather than one bundle of every tool: see
 * `renderServiceWorker`'s `bundles` param for why. Returns `{ shared,
 * categories }` — `shared` is fetched alongside whichever category the
 * visitor picks, and each category's own `assets` are that category's tool
 * pages and their scripts.
 */
export async function collectOfflineBundle(outDir, surfaces) {
  // The shared scripts and stylesheets are loaded by every tool page, so a
  // tool cached for offline use without them opens with no band at all — or,
  // for the stylesheets, with an unstyled one bolted to the page. That is the
  // cost of extracting them: what used to be inline and therefore cached with
  // the page is now a separate request the cache has to know about. `./`,
  // `index.html`, `offline.html` and `manifest.webmanifest` are not here —
  // they are already in `shell` and precached on install regardless of
  // whether a visitor ever asks to save a category.
  const shared = [
    SAVED_BIDS_MODULE_FILE, BID_LINK_MODULE_FILE, SHOP_RATES_MODULE_FILE, CHROME_MODULE_FILE,
    CHROME_STYLE_FILE, SHOP_RATES_STYLE_FILE, SAVED_BIDS_STYLE_FILE,
    INVALID_MODULE_FILE, INVALID_STYLE_FILE, EMBED_MODULE_FILE, EMBED_STYLE_FILE,
    // Not loaded by any page on this site — it runs on the embedder's — but
    // precached all the same so the snippet's second line is served from the
    // same revision as the first.
    EMBED_HOST_FILE,
  ].sort();

  const byCategory = new Map();
  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    // copyTree publishes the directory holding the entry point as `slug/`, so
    // the tool's front page is always exactly here.
    const entry = path.join(dir, 'index.html');
    const rel = (file) => path.relative(outDir, file).split(path.sep).join('/');
    const assets = new Set();
    if (existsSync(entry)) {
      assets.add(rel(entry));
      // A visitor can arrive at either form; a cache entry under one does not
      // answer a request for the other.
      assets.add(`${surface.slug}/`);
    }
    for (const file of await listFiles(dir)) {
      if (BUNDLE_EXTENSIONS.has(path.extname(file))) assets.add(rel(file));
    }
    if (assets.size === 0) continue;

    const { id, title } = offlineBucketFor(surface.slug);
    if (!byCategory.has(id)) byCategory.set(id, { id, title, assets: new Set() });
    const bucket = byCategory.get(id).assets;
    for (const asset of assets) bucket.add(asset);
  }

  const categories = [...byCategory.values()]
    .map((category) => ({ id: category.id, title: category.title, assets: [...category.assets].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { shared, categories };
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
  const { shared, categories } = await collectOfflineBundle(outDir, surfaces);

  const hash = crypto.createHash('sha256');
  hash.update(codeVersion ?? (await fs.readFile(path.join(HERE, 'offline.mjs'))));
  // Each file hashed on its own, many at once, then the digests in path order:
  // the same guarantee (any byte or name changes the cache) without reading
  // the site one file at a time.
  const files = (await listFiles(outDir)).sort();
  const digests = await mapLimit(files, 32, async (file) =>
    crypto.createHash('sha256').update(await fs.readFile(file)).digest());
  files.forEach((file, i) => hash.update(path.relative(outDir, file)).update(digests[i]));
  const cacheName = `portfolio-${hash.digest('hex').slice(0, 12)}`;

  await fs.writeFile(path.join(outDir, 'offline.html'), renderOfflinePage(base));
  await fs.writeFile(
    path.join(outDir, 'manifest.webmanifest'),
    renderManifest(base, surfaces.length, externalCallExceptions(surfaces).length > 0),
  );

  for (const icon of ICONS) {
    await fs.writeFile(
      path.join(outDir, icon.file),
      renderIcon({ size: icon.size, maskable: Boolean(icon.maskable), opaque: Boolean(icon.opaque) }),
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
        shell: ['./', 'index.html', 'offline.html', 'manifest.webmanifest', 'icon-192.png', SITE_STYLE_FILE],
        shared,
        bundles: Object.fromEntries(categories.map((c) => [c.id, c.assets])),
      }),
  );

  const pages = (await listFiles(outDir)).filter((file) => file.endsWith('.html'));
  const injected = (await mapLimit(pages, 32, async (file) => {
    const depth = path.relative(outDir, file).split(path.sep).length - 1;
    const result = injectOfflineSupport(await fs.readFile(file, 'utf8'), '../'.repeat(depth));
    if (!result.injected) return 0;
    await fs.writeFile(file, result.html);
    return 1;
  })).reduce((a, b) => a + b, 0);

  // The real weight of what "Save this category for offline" fetches, over
  // the wire rather than on disk -- GitHub Pages (Fastly) and the front
  // door's own nginx both gzip text responses in transit, so raw bytes
  // overstate what a visitor's mobile data plan is actually charged (see
  // build.test.mjs's "stays small enough to fetch on mobile data" for the
  // same measurement). Taken after the head injection above, so it matches
  // what a browser really downloads. `shared` and `index.html` are not
  // patch-order-sensitive here the way the old single whole-catalog number
  // was: neither carries a size marker, so nothing this loop reads is a file
  // the patch below is about to rewrite.
  const gzipBytesOf = async (assets) => {
    let bytes = 0;
    for (const asset of assets) {
      if (asset.endsWith('/')) continue; // directory alias of a page already counted
      const buf = await fs.readFile(path.join(outDir, asset));
      bytes += zlib.gzipSync(buf, { level: 9 }).length;
    }
    return bytes;
  };
  const sharedBytes = await gzipBytesOf(shared);
  const categorySizes = [];
  for (const category of categories) {
    categorySizes.push({
      id: category.id,
      title: category.title,
      assets: category.assets,
      bundleBytes: sharedBytes + (await gzipBytesOf(category.assets)),
    });
  }

  // Patched into the hub's own copy so the picker's per-category size can
  // never drift from reality: see offlineSizeMarker in offline.mjs for the
  // stale "about 3 MB" whole-catalog claim this replaces, which stood while
  // the catalog grew to 174 tools and 16.8 MB raw (5.2 MB gzipped).
  const hubIndex = path.join(outDir, 'index.html');
  let hub = await fs.readFile(hubIndex, 'utf8');
  for (const { id, bundleBytes } of categorySizes) {
    hub = hub.replaceAll(offlineSizeMarker(id), offlineBundleSizeLabel(bundleBytes));
  }
  await fs.writeFile(hubIndex, hub);

  return { cacheName, shared, categories: categorySizes, injected };
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
  // platform/counter's origin; '' (the default) builds with no beacon.
  counterUrl = '',
  // platform/edge's origin; '' (the default) builds the feedback page without its form.
  feedbackUrl = '',
  // Link committed MP3s from jsDelivr instead of shipping them (audio-cdn.mjs).
  // The deploy turns it on with --audio-cdn; local and test builds keep the files.
  audioCdn = false,
} = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  SITE_COUNTER_URL = normaliseCounterUrl(counterUrl);
  SITE_FEEDBACK_URL = normaliseCounterUrl(feedbackUrl);
  try {
    return await buildSiteInner({ venturesDir, outDir, base, log, disableWorker, audioCdn });
  } finally {
    SITE_COUNTER_URL = '';
    SITE_FEEDBACK_URL = '';
  }
}

async function buildSiteInner({ venturesDir, outDir, base, log, disableWorker, audioCdn }) {

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  generateVenturePages(venturesDir);
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

  // Same reasoning as the LICENSE loop just above, for the `.py` CLI files
  // `DOWNLOADABLE_CLI_FILES` names: `NON_WEB_EXTENSIONS` drops `.py` from
  // `copyTree` on purpose (most ventures' CLI source is not a public
  // deliverable), so the specific files a venture's own page offers as a
  // download have to be published here instead, ahead of `repairLinks`, or
  // the CTA's link 404s for every visitor against this private repository.
  for (const [slug, files] of Object.entries(DOWNLOADABLE_CLI_FILES)) {
    for (const name of files) {
      const from = path.join(venturesDir, slug, name);
      const to = path.join(outDir, slug, name);
      if (existsSync(to) || !(await exists(from))) continue;
      await fs.copyFile(from, to);
    }
  }

  // Pass 2: everything that has to read a complete site.
  //
  // `repairLinks` stays ahead of `surfaceExternalFetchHosts` within this loop,
  // and that order is load-bearing: a repair can rewrite a `<script src>` or a
  // stylesheet `<link href>` to a github.com URL, which is a genuine external
  // request the privacy copy has to report.
  const sourceDates = await loadLastChanged(REPO_ROOT);
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
      renderVentureSitemap(
        surface.slug,
        pages,
        base,
        Object.fromEntries(
          pages.flatMap((page) => {
            const date = sourceDates.get(path.relative(REPO_ROOT, path.join(surface.sourceDir, page)).split(path.sep).join('/'));
            return date ? [[page, date]] : [];
          }),
        ),
      ),
    );

    // A product with its own llms.txt keeps it (and is named so in the index);
    // every other product gets a plain one derived from the same description
    // the page uses, so an assistant can fetch a short, sourced summary at
    // /<slug>/llms.txt instead of 1,300 products having none.
    const ownLlmsDoc = existsSync(path.join(destination, 'llms.txt'));
    const sourceDate = (file) => sourceDates.get(path.relative(REPO_ROOT, path.join(surface.sourceDir, file)).split(path.sep).join('/'));
    if (!ownLlmsDoc) {
      await fs.writeFile(path.join(destination, 'llms.txt'), renderProductLlmsTxt({ slug: surface.slug, title, description, fullDescription, updated: sourceDate('index.html'), before: sourceDates.historyStart }, base));
    } else {
      const own = path.join(destination, 'llms.txt');
      const text = await fs.readFile(own, 'utf8');
      const dated = withLlmsAsOf(text, sourceDate('llms.txt') ?? sourceDate('index.html'), sourceDates.historyStart);
      if (dated !== text) await fs.writeFile(own, dated);
    }

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
      kind: surfaceKind(path.join(REPO_ROOT, 'ventures', surface.slug), surface.slug),
      pageCount: await countPages(surface.sourceDir),
      publishedPageCount: pages.length,
      llmsDoc: ownLlmsDoc,
      externalFetchHosts: await surfaceExternalFetchHosts(destination),
    });
    log(`  ${surface.slug}`);
  }

  const research = researchHighlights();
  // Stills and a recording of real tools for the hub (showcase/capture.mjs).
  const showcase = loadShowcase(surfaces.map((s) => s.slug));
  log(`Published ${await copyShowcase(outDir, showcase)} showcase file(s).`);
  await fs.writeFile(
    path.join(outDir, 'index.html'),
    renderHub(surfaces, base, { researchCount: researchProjectCount(), research, showcase, posts: loadPosts(), flagships: flagshipSlugs() }),
  );
  // The stylesheet every site-owned page links for the shared header (site-nav.mjs).
  await fs.writeFile(path.join(outDir, SITE_STYLE_FILE), renderSiteStyle());
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
  // The IndexNow key file. Content is the key itself, per the protocol; see
  // `INDEXNOW_KEY` above for why this lives at the site root rather than the
  // host root.
  await fs.writeFile(path.join(outDir, indexNowKeyFileName()), INDEXNOW_KEY);

  // One landing page per category, under the reserved `c/` prefix. Written
  // before the sitemaps because `renderHubSitemap` has to list exactly the
  // pages this loop produced — a category page in no sitemap is the quiet
  // failure `check.mjs` exists to catch.
  const categoryGroups = groupByCategory(surfaces);
  const audiencePages = audienceGroups(surfaces);
  // Read off the built tree, so it comes after the per-venture copy above: a
  // guide is listed because it shipped, at the URL it shipped to. Before the
  // audience pages, which list their tools' questions, and the guides index
  // and sitemaps below. See `GUIDES_PATH`.
  const guides = await discoverGuides(surfaces, outDir);
  for (const { category, items } of categoryGroups) {
    const dir = path.join(outDir, CATEGORY_PATH_PREFIX, category.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      renderCategoryPage({ category, items, groups: categoryGroups, baseUrl: base, audiences: audiencePages }),
    );
  }
  // One page per trade or kind of business ("free tools for roofers"), under
  // the same prefix so `check.mjs` holds them to the category-page contract:
  // linked from the hub, disclaimered, and listing only tools that shipped.
  for (const { audience, items } of audiencePages) {
    const dir = path.join(outDir, CATEGORY_PATH_PREFIX, audiencePageId(audience));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      renderAudiencePage({ audience, items, groups: categoryGroups, baseUrl: base, audiences: audiencePages, guides }),
    );
  }
  // The browse-by-type pages (apps, command-line tools), on the same footing.
  const kindPages = KIND_PAGES.map((page) => ({ page, ...kindPageGroups(page, surfaces) })).filter((k) => k.items.length);
  for (const { page, items, subgroups } of kindPages) {
    const dir = path.join(outDir, CATEGORY_PATH_PREFIX, page.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'index.html'),
      renderCategoryPage({
        category: page,
        items,
        groups: categoryGroups,
        baseUrl: base,
        deployable: page.deployable,
        subgroups: subgroups.length > 1 ? subgroups : undefined,
        audiences: audiencePages,
      }),
    );
  }
  // And the Tools section's own front page, which lists all of them.
  await fs.writeFile(
    path.join(outDir, CATEGORY_PATH_PREFIX, 'index.html'),
    renderToolsIndexPage({ groups: categoryGroups, kindPages, audiencePages, surfaces, baseUrl: base }),
  );

  // After the categories because the About page links every one of them, and
  // before the sitemaps for the same reason they are.
  const aboutDir = path.join(outDir, ABOUT_PATH);
  await fs.mkdir(aboutDir, { recursive: true });
  await fs.writeFile(
    path.join(aboutDir, 'index.html'),
    renderAboutPage({ surfaces, groups: categoryGroups, baseUrl: base }),
  );
  const feedbackDir = path.join(outDir, FEEDBACK_PATH);
  await fs.mkdir(feedbackDir, { recursive: true });
  await fs.writeFile(path.join(feedbackDir, 'index.html'), renderFeedbackPage({ surfaces, baseUrl: base }));
  const customDevDir = path.join(outDir, CUSTOM_DEV_PATH);
  await fs.mkdir(customDevDir, { recursive: true });
  await fs.writeFile(
    path.join(customDevDir, 'index.html'),
    renderCustomDevelopmentPage({ surfaces, baseUrl: base, requests: loadRequests() }),
  );

  // The assistant's own page, and the files every page lazy-loads it from.
  const askDir = path.join(outDir, ASK_PATH);
  await fs.mkdir(askDir, { recursive: true });
  await fs.writeFile(
    path.join(askDir, 'index.html'),
    renderAskPage({
      baseUrl: base,
      siteName: SITE_NAME,
      toolCount: surfaces.length,
      chrome: {
        style: `${CATEGORY_STYLE}${ABOUT_STYLE}`,
        styleLink: siteStyleLink('../'),
        header: renderSiteHeader({ toRoot: '../', current: 'ask', crumbs: [{ label: 'Ask' }] }),
        disclaimer: disclaimerHtml('../', surfaces),
        footerNav: renderSiteFooterNav({ toRoot: '../' }),
        script: `<script src="../${CHROME_MODULE_FILE}" ${CHROME_SLUG_ATTR}="ask" defer></script>`,
        ogImage: `${base}${SOCIAL_CARD_FILE}`,
      },
    }),
  );
  for (const [name, contents] of Object.entries(renderAssistantFiles({ searchVariants, searchScore }))) {
    await fs.writeFile(path.join(outDir, name), contents);
  }

  await buildResearchPage(outDir, base);
  const researchSlugs = [];
  for (const entry of await fs.readdir(path.join(outDir, RESEARCH_PATH), { withFileTypes: true })) {
    if (entry.isDirectory() && (await fs.stat(path.join(outDir, RESEARCH_PATH, entry.name, 'index.html')).catch(() => null))) {
      researchSlugs.push(entry.name);
    }
  }
  researchSlugs.sort();
  // A project's static browser app (research/<slug>/app/) is a page in its own right.
  const researchApps = [];
  for (const slug of researchSlugs) {
    if (await fs.stat(path.join(outDir, RESEARCH_PATH, slug, 'app', 'index.html')).catch(() => null)) researchApps.push(`${slug}/app`);
  }
  // The topic pages, research/topics/<id>/, for the sitemap.
  const researchTopics = (
    await fs.readdir(path.join(outDir, RESEARCH_PATH, RESEARCH_TOPICS_DIR), { withFileTypes: true }).catch(() => [])
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${RESEARCH_TOPICS_DIR}/${entry.name}`)
    .sort();

  // The engineering status page: what the agent fleet shipped, is working on,
  // spent and is blocked on, read from the committed run records and history.
  // `noindex` and in no sitemap; see `engineering.mjs`.
  await buildEngineeringPage(outDir, base);

  // Essays and write-ups from `docs/posts/` (see `writing.mjs`). Indexed, so
  // each post is listed in the hub sitemap below.
  // Page slugs under writing/: each post, and `podcast`.
  const writingPages = await buildWriting(outDir, base, { socialCard: `${base}${SOCIAL_CARD_FILE}`, originAlias: [LEGACY_BASE_URL, DEFAULT_BASE_URL] });

  // The fiction the creative track writes, one page linking into its ventures (see `stories.mjs`).
  await buildStories(outDir, base, { socialCard: `${base}${SOCIAL_CARD_FILE}` });

  // The lab (see `lab.mjs`): contained, `noindex` experiments in what the
  // site can be. Its handoff page reads catalog.json in the browser.
  await buildLab(outDir);

  // The open book (see `updates.mjs`): what shipped, what is in progress, the
  // owner's direction and the process, plus the changelog of every merge.
  // After the research pages so a merge can link the page it changed.
  await buildUpdates(outDir, base, {
    published: new Set(surfaces.map((s) => s.slug)),
    researchSlugs: new Set(researchSlugs),
    titles: new Map(surfaces.map((s) => [s.slug, s.title])),
    socialCard: `${base}${SOCIAL_CARD_FILE}`,
  });

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

  // The guides index (`guides` was read above, before the audience pages).
  const guidesDir = path.join(outDir, GUIDES_PATH);
  await fs.mkdir(guidesDir, { recursive: true });
  await fs.writeFile(
    path.join(guidesDir, 'index.html'),
    renderGuidesPage({ groups: guides, surfaces, categoryGroups, baseUrl: base }),
  );
  // The index the hub's search fetches. Written here, after the collection and
  // comparison pages it lists, rather than beside the hub.
  await fs.writeFile(
    path.join(outDir, SEARCH_INDEX_FILE),
    renderSearchIndex(surfaces, research.projects, {
      guides: await collectGuidePages(outDir, surfaces),
      sections: await collectSectionPages(outDir),
      posts: loadPosts(),
      covered: new Set(compareProducts.flatMap((group) => group.items.map((item) => `${item.slug}/${item.file}`))),
    }),
  );

  await fs.writeFile(path.join(outDir, 'sitemap.xml'), renderSitemapIndex(surfaces, base));
  await fs.writeFile(
    path.join(outDir, 'sitemap-hub.xml'),
    renderHubSitemap(
      base,
      [
        ...categoryGroups.map(({ category }) => category.id),
        ...kindPages.map(({ page }) => page.id),
        ...audiencePages.map(({ audience }) => audiencePageId(audience)),
      ],
      compareProducts.map((group) => group.key),
      [...researchSlugs, ...researchTopics, ...researchApps],
      writingPages,
    ),
  );
  await fs.writeFile(path.join(outDir, 'catalog.json'), renderCatalog(surfaces, base, launched));
  const llmsOptions = { audiences: audiencePages, research, agentPostCount: loadPosts(undefined, AGENT_POSTS_DIR).length };
  await fs.writeFile(path.join(outDir, 'llms.txt'), renderLlmsTxt(surfaces, base, compareProducts, guides, llmsOptions));
  await fs.writeFile(path.join(outDir, 'llms-full.txt'), renderLlmsTxt(surfaces, base, compareProducts, guides, { ...llmsOptions, full: true }));
  // Read from the committed file, not from `git log`: the in-cluster build
  // clones `--depth 1` and has no history. See `launched.mjs`.
  await fs.writeFile(path.join(outDir, FEED_FILE), renderFeed(surfaces, base, launched));

  await fs.writeFile(path.join(outDir, 'favicon.ico'), renderFavicon());
  await fs.writeFile(path.join(outDir, 'favicon.svg'), renderFaviconSvg());
  // The site-wide card: what the hub and the About page point at, since
  // neither belongs to one category. It carries the homepage's own headline.
  await fs.writeFile(
    path.join(outDir, SOCIAL_CARD_FILE),
    renderSiteCard({
      address: siteAddress(base),
      footer: `${surfaces.length} free tools · ${researchProjectCount()} research projects`,
    }),
  );
  // One card per category, tinted and headlined with the section's own name.
  // A category holding a documented `externalCallExceptions` entry (today:
  // "more", because Sponsor Ready lives there) gets the exception footer —
  // otherwise this card would tell every social preview "nothing you type is
  // uploaded" for a category where that is false for one of its tools.
  const categoriesWithExceptions = new Set([
    ...categoryGroups
      .filter(({ items }) => externalCallExceptions(items).length)
      .map(({ category }) => category.id),
    ...audiencePages
      .filter(({ items }) => externalCallExceptions(items).length)
      .map(({ audience }) => audiencePageId(audience)),
  ]);
  const cardJobs = [];
  for (const category of [
    ...ALL_CATEGORIES,
    ...KIND_PAGES,
    ...audiencePages.map(({ audience, items }) => audienceCategory(audience, items)),
  ]) {
    cardJobs.push({
      file: path.join(outDir, socialCardFileFor(category.id)),
      options: categoryCardOptions(category, {
        footer: categoriesWithExceptions.has(category.id) ? CARD_FOOTER_EXCEPTION : CARD_FOOTER,
        baseUrl: base,
      }),
    });
  }
  // And one per tool, headlined with the tool's own name under its category.
  // This is the difference between a thousand shares of the same anonymous
  // picture and a thousand that each say what they link to — the single
  // highest-leverage change available to a portfolio whose only distribution
  // is organic. They render on a pool of worker threads (`share.mjs`): each is
  // a CPU-bound raster and there are well over a thousand.
  for (const surface of surfaces) {
    if (!(await exists(path.join(outDir, surface.slug)))) continue;
    cardJobs.push({
      file: path.join(outDir, toolCardFileFor(surface.slug)),
      options: toolCardOptions(surface, { baseUrl: base }),
    });
  }
  await renderCards(cardJobs);

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

  // After every generator has written its pages and the chrome has wrapped
  // them: a card for each page still on the site-wide one (research, writing,
  // comparisons, the section front pages), and complete share tags on all of
  // them. Before the offline layer, which hashes the finished HTML.
  const shareCards = await addShareCards({ outDir, baseUrl: base, siteName: SITE_NAME, siteCard: SOCIAL_CARD_FILE });

  // Before the offline layer, which hashes the finished site: this rewrites
  // pages and feeds and removes the files it moved.
  const audio = audioCdn
    ? await moveAudioToCdn({ outDir, base, repoRoot: REPO_ROOT, log })
    : { moved: 0, kept: 0, bytes: 0 };

  // After the chrome pass, not before: the offline layer hashes the finished
  // site to name its cache, and injects into pages the chrome has already
  // rewritten. Reversed, every deploy would cache a page missing its nav.
  const offline = await addOfflineSupport({ outDir, base, surfaces, disableWorker });

  return {
    outDir, baseUrl: base, surfaces, repairs, wrapped, rated, saved, shared, described,
    highlighted, narrowed, embedded, sponsored, offline, comparisons, shareCards, audio,
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
 * Built rather than committed so the tree stays reviewable text, and
 * deterministic -- same bytes on every run.
 */

// The mark, in one place: `sharecard.mjs`'s `MARK_GEOMETRY` (an eight-point
// compass star in a brass ring on a navy disc, the Maris Stella Labs logo) is
// what `drawMark` rasterises for the app icons, the .ico and every share card,
// and what `markSvg` draws as vector art for the tab and the site header, so
// the tab, the pinned tab, the home screen and a shared link carry one logo.
export { MARK_GEOMETRY };
// Sizes in the .ico: 16 for the tab strip, 32 for a high-DPI tab and the
// Windows taskbar, 48 for a desktop shortcut.
export const FAVICON_SIZES = [16, 32, 48];

export function renderFaviconSvg() {
  return `${markSvg(16)}\n`;
}

/**
 * Every browser requests `/favicon.ico` on its own; see above. One PNG per
 * size in `FAVICON_SIZES`, each drawn by `drawMark` at that size rather than
 * scaled from one, wrapped in an ICO container.
 */
export function renderFavicon() {
  const pngs = FAVICON_SIZES.map((size) => {
    const data = Buffer.alloc(size * size * 4);
    drawMark({ width: size, height: size, data, channels: 4 }, 0, 0, size, { channels: 4 });
    return encodeCardPng(size, size, data, 4);
  });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach((png, i) => {
    const size = FAVICON_SIZES[i];
    const entry = Buffer.alloc(16);
    entry[0] = size;
    entry[1] = size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  });
  return Buffer.concat([header, ...entries, ...pngs]);
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
    counterUrl: process.argv.find((a) => a.startsWith('--counter-url='))?.slice('--counter-url='.length)
      ?? process.env.PAGES_COUNTER_URL
      ?? JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform', 'counter', 'site.json'), 'utf8')).url,
    feedbackUrl: process.argv.find((a) => a.startsWith('--feedback-url='))?.slice('--feedback-url='.length)
      ?? process.env.PAGES_FEEDBACK_URL
      ?? JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform', 'edge', 'site.json'), 'utf8')).url,
    audioCdn: process.argv.includes('--audio-cdn'),
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
  console.log(`Drew ${result.shareCards.cards.length} page share card(s); completed share tags on ${result.shareCards.changed.length} page(s).`);
}
