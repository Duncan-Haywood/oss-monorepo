// Checks that every page the Pages site would publish carries the no-warranty
// clause PRODUCT_PLAYBOOK.md 5b requires.
//
// Why only that half. 5b requires two clauses, and they are enforced in two
// different places for a reason the build itself draws:
//
//   - The **no-SLA** clause is about how these pages are hosted, which is the
//     build's own statement to make, so `build.mjs` injects it into any
//     published page that lacks one. That requirement now holds by
//     construction and needs no check in front of a contributor.
//   - The **no-warranty** clause is about what a given tool is not advice
//     *about* -- "not landscaping, construction, legal, tax, or financial
//     advice" -- which only the venture can write. It cannot be injected, so
//     it is still the venture's to get right, and it is still enforced only by
//     build.test.mjs, which runs on `platform/pages/**`.
//
// That last gap is what this closes. A venture branch that omits the clause
// merges cleanly and turns `main` red in the Pages job, naming an author who
// never saw the requirement, in a workflow they did not touch. It has happened
// repeatedly for the no-SLA half (#1747, #1763, sewer-line-replace); injection
// retired that recurrence, and left this one exactly as it was.
//
// Reading the *sources* rather than a built site is the point. The build takes
// seconds and needs the whole tree; this walks the venture directories
// directly, so it is cheap enough to run from a venture's own CI, scoped to
// just that slug (`node platform/pages/clauses.mjs <slug>`, wired into every
// venture-ci.yml) -- a second, redundant check next to `portfolio-validate.yml`
// running the same command unscoped over every venture on any PR touching
// `ventures/**/*.html`.
//
// That redundancy is deliberate, not leftover: this comment used to justify
// the venture-scoped run as "the only place a PR that adds a venture reliably
// gets checked, since PRs opened with GITHUB_TOKEN do not trigger the
// portfolio-wide workflows." Neither half held. `portfolio-validate.yml`'s own
// `pull_request.paths` already covers `ventures/**/*.html`, and an agent PR
// here authenticates with a fine-grained PAT (`GH_TOKEN`), not the in-workflow
// `secrets.GITHUB_TOKEN` GitHub's no-recursion rule applies to, so it triggers
// `pull_request` workflows the same as a human's PR (see CLAUDE.md's "Absent
// CI is not failed CI"). The venture-scoped run stays worth keeping anyway:
// it is the faster, narrower signal on the PR that actually adds the venture,
// and it still catches the omission if `portfolio-validate.yml`'s own path
// list ever falls behind a new publishable extension the way it once did for
// `.css`/`.js` (see that workflow's own trigger comment).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { REPO_ROOT, discoverSurfaces, isPublishable, publishedPages } from './build.mjs';

/**
 * PRODUCT_PLAYBOOK.md 5b, first clause: free and as-is, no warranty of any
 * kind, not advice, verify before relying on it.
 *
 * Matched loosely on purpose. Ventures word the surrounding paragraph in their
 * own voice, and demanding the playbook's exact prose would force a rewrite of
 * correct pages rather than catch a missing one.
 */
export const NO_WARRANTY = /no warranty/i;

/**
 * PRODUCT_PLAYBOOK.md 5f: a page that names a specific commercial product to
 * compare against it (`vs-<competitor>.html`) has to say, in terms a reader
 * and a trademark owner both parse the same way, that it isn't that
 * product's page. Nominative fair use -- naming a trademark only to say what
 * you are not -- is a real defense; naming one and staying silent about
 * affiliation is what invites the claim the defense exists to answer.
 *
 * Matched loosely, same reasoning as NO_WARRANTY: 172 of 173 comparison pages
 * on `main` already carry some wording of this on their own, in the author's
 * own voice ("Not affiliated with ServiceMonster.", "not affiliated with,
 * endorsed by, or sponsored by ServiceMonster"), so the check has to accept
 * that range rather than demand one sentence.
 */
export const NOT_AFFILIATED = /not\s+affiliated\s+with/i;

/**
 * A comparison page compares this free tool against one specific named
 * product or company, which is the case the trademark disclaimer exists for.
 * A page that compares against a generic category or role -- "your title
 * company's net sheet", nobody's trademark -- is not one, and requiring the
 * disclaimer there would demand a sentence about a party that does not
 * exist. There is exactly one such page on `main` today; list it here by its
 * `slug/relative` display path, with why, rather than loosening the pattern
 * for everyone else.
 */
// Exported because `surface-budget.mjs` budgets exactly this class of page --
// the comparison written against a generic method rather than a named product
// -- and deriving that class a second time from filenames would let a page be
// one kind for the disclaimer check and the other kind for the budget.
export const COMPARISON_DISCLAIMER_EXEMPT = new Set([
  // Compares against "eyeballing Settings -> Branches" -- a manual habit
  // every repository admin already has, not a company or product this
  // could be mistaken for.
  'branch-protection-drift-check/vs-manually-checking-settings.html',
  // Compares against "your title company's net sheet" -- a role every deal
  // has, not a company or product this could be mistaken for.
  'seller-net-sheet/vs-title-company-net-sheet.html',
  // Compares against "a published custom rate survey" -- a category of
  // publication (state extension services, farm trade press) that several
  // different publishers produce, not one specific company or product this
  // could be mistaken for. The page's own FAQ already says so explicitly
  // ("does not name or link to any specific survey publisher").
  'custom-farm-rate-calculator/vs-survey-rates.html',
  // Compares against "a PPO fee-schedule negotiation service" -- an industry
  // role many different firms perform, charging a flat per-payer fee or a
  // percentage of the increase they win. The page names no specific company
  // and its own footer says so explicitly.
  'dental-ppo-writeoff-calculator/vs-ppo-fee-negotiators.html',
  // Compares against "a spreadsheet or mental math" -- a method every
  // adjuster already has, not a company or product this could be mistaken
  // for.
  'cat-adjuster-fee-calculator/vs-spreadsheet-comparison.html',
  // Compares against "a spreadsheet or a guess under a deadline" -- a
  // method every reporter already has, not a company or product this could
  // be mistaken for.
  'court-reporter-transcript-calculator/vs-spreadsheet-or-guessing.html',
  // Compares against reconciling a 1099-K by hand in a spreadsheet -- a
  // method every marketplace seller already has, not a company or product
  // this could be mistaken for. Same reasoning as the cat-adjuster page
  // above.
  '1099k-reconciliation-worksheet/vs-spreadsheet-comparison.html',
  // Compares against "checking pricing pages and doing the arithmetic by
  // hand" -- a generic method every user of the calculator already has
  // access to, not a company or product this could be mistaken for.
  'ai-coding-plan-cost-calculator/vs-checking-pricing-pages-yourself.html',
  // Compares against "clicking Re-run failed jobs and seeing what happens" --
  // a generic manual habit every GitHub Actions user already has, not a
  // company or product this could be mistaken for.
  'actions-runner-starvation-check/vs-rerunning-the-job.html',
  // Compares against "pricing an add-on by comparing to what other studios
  // charge" -- a generic pricing method every independent photographer
  // already uses, not one specific company or product this could be
  // mistaken for. The page's own FAQ says so explicitly ("has no data on
  // what any other studio charges").
  'photo-addon-pricing-calculator/vs-pricing-by-comparing-to-other-studios.html',
  // Compares against "reading the resistor color code by eye" -- a manual
  // reading method every user of this calculator already has access to,
  // not a company or product this could be mistaken for. Same reasoning as
  // the other manual-method pages above.
  'ai-engineering-academy/resistor-calculator/vs-reading-the-color-code-by-eye.html',
  // Compares against "a spreadsheet" -- a generic method every HOA board
  // treasurer already has, not a company or product this could be mistaken
  // for. Same reasoning as the other vs-spreadsheet pages above.
  'hoa-reserve-fund-calculator/vs-spreadsheet.html',
  // Compares against "multiplying filament cost by three" -- a pricing
  // habit passed around among makers, not a company or product this could
  // be mistaken for. The page names no vendor at all.
  '3d-print-price-calculator/vs-the-3x-filament-rule.html',
  // Compares against "a flat day rate" -- a generic pricing method every
  // bridal artist already knows, not a company or product this could be
  // mistaken for. Same reasoning as the other generic-method pages above.
  'bridal-hair-makeup-pricing-calculator/vs-flat-day-rate.html',
  // Compares against "the headline commission rate a company quotes" -- the
  // industry-wide convention of leading with one percentage out of a tiered
  // schedule, not a company or product this could be mistaken for. The page
  // names no estate sale company at all: its worked example uses "Company A"
  // and "Company B" and says in its own copy that the figures are "not a
  // claim about any real company's pricing". Same reasoning as the other
  // generic-method pages above.
  'estate-sale-net-proceeds-calculator/vs-headline-commission-rate.html',
  // Compares against "a spreadsheet formula" -- a generic method every
  // payroll admin already has, not a company or product this could be
  // mistaken for. Same reasoning as the other vs-spreadsheet pages above.
  'overtime-pay-calculator/vs-spreadsheet.html',
  // Compares against "doing the blended-rate arithmetic by hand or in a
  // spreadsheet" -- a generic method every payroll admin already has, not a
  // company or product this could be mistaken for. Same reasoning as the
  // other vs-spreadsheet / by-hand pages above.
  'overtime-pay-calculator/vs-doing-it-by-hand.html',
  // Compares against "a spreadsheet" -- a generic method every tutor already
  // has, not a company or product this could be mistaken for. Same reasoning
  // as the other vs-spreadsheet pages above.
  'tutor-package-pricing-calculator/vs-a-spreadsheet.html',
  // Compares against "dividing labor sales by labor hours off your own DMS
  // reports" -- the one line of arithmetic every shop owner can already run
  // against reports they have, not a company or product this could be
  // mistaken for. The page names no management system at all (the venture's
  // two named-product comparisons, vs-tekmetric and vs-shop-ware, carry their
  // own trademark disclaimers) and its copy opens by telling the reader to do
  // the division themselves. Same reasoning as the other generic-method pages
  // above.
  'auto-repair-effective-labor-rate/vs-dividing-labor-sales-by-hours.html',
  // Compares against "a flat per-vehicle price card" -- sedan/SUV/truck
  // pricing every mobile detailer already posts, not a company or product
  // this could be mistaken for. The page names no specific detailing
  // franchise, app, or competitor (the venture's own named-product
  // comparison, vs-mobiletechrx, carries its own trademark disclaimer) and
  // its copy opens by agreeing the flat card is the right tool for
  // advertising. Same reasoning as the other generic-method pages above.
  'mobile-detailing-bid-calculator/vs-a-flat-per-vehicle-price.html',
  // Compares against "a flat per-size price card" -- small/medium/large/giant
  // pricing every groomer already posts, not a company or product this could
  // be mistaken for. The page names no specific grooming franchise, app, or
  // competitor (the venture's own named-product comparison, vs-moego,
  // carries its own trademark disclaimer) and its copy opens by agreeing the
  // flat card is the right tool for a phone quote. Same reasoning as the
  // other generic-method pages above.
  'pet-grooming-bid-calculator/vs-a-flat-per-breed-price.html',
  // Compares against "opening each marketplace's own fee calculator and
  // reconciling the answers" -- the method every multi-channel seller already
  // uses, not a company or product this could be mistaken for. It is the one
  // entry here that names real trademarks (eBay, Etsy, Amazon), because the
  // channels being ranked are the tool's own subject matter; what it does not
  // do is compare against any one of them as a product. It carries the
  // affiliation disclaimer anyway rather than leaning on this exemption, and
  // a test asserts the disclaimer and that no rate or currency amount is
  // attributed to any of them. Same reasoning as the other generic-method
  // pages above, and as ai-coding-plan-cost-calculator's
  // vs-checking-pricing-pages-yourself.html, which names vendors the same way.
  'where-to-sell-calculator/vs-each-marketplaces-own-calculator.html',
  // Compares against "opening each marketplace's own fee calculator
  // separately and reconciling the numbers by hand" -- a generic method
  // every multi-channel seller already has access to, not a company or
  // product this could be mistaken for. It still names the six real
  // marketplaces it ranks, so it carries the nominative disclaimer anyway
  // rather than relying on this exemption to excuse its absence. Same
  // reasoning as the where-to-sell-calculator sibling entry above.
  'marketplace-fee-compare/vs-checking-each-marketplace-separately.html',
  // Compares against "adding up the month's bills and dividing by the miles
  // you ran" -- the one line of arithmetic every owner-operator already runs
  // against their own settlement statements, not a company or product this
  // could be mistaken for. The page names no bookkeeping service or rate
  // tool at all (the venture's two named-product comparisons, vs-atbs and
  // vs-dat-rateview, carry their own trademark disclaimers) and its copy
  // opens by agreeing the division is correct arithmetic and better cost
  // data than anything typed into a form. Same reasoning as
  // auto-repair-effective-labor-rate/vs-dividing-labor-sales-by-hours.html.
  'owner-operator-cpm-calculator/vs-dividing-your-bills-by-your-miles.html',
  // Compares against "reading your own workflow files" -- the manual habit a
  // maintainer already has, not a company or product this could be mistaken
  // for. It does name GitHub, unavoidably, because GitHub Actions workflow
  // YAML is the artifact the tool reads and there is no generic way to say
  // so; but it compares against *reading the files yourself*, never against
  // any GitHub product. It therefore carries the affiliation disclaimer
  // anyway rather than leaning on this exemption, and a test asserts it.
  // Same reasoning as where-to-sell-calculator/vs-each-marketplaces-own-
  // calculator.html and ai-coding-plan-cost-calculator/vs-checking-pricing-
  // pages-yourself.html, which name vendors the same way.
  'deploy-concurrency-check/vs-reading-your-workflows-yourself.html',
  // Compares against "your phone's built-in world clock" -- a generic
  // feature every phone platform ships, not a company or product this could
  // be mistaken for. The page itself names no specific platform or vendor
  // (asserted by a test).
  'world-clock-widget/vs-your-phones-clock-app.html',
  // Compares against "checking a DST calendar by hand" -- a generic manual
  // habit every developer already has access to, not a company or product
  // this could be mistaken for. Same reasoning as the other manual-method
  // pages above.
  'cron-dst-drift-check/vs-checking-a-dst-calendar-by-hand.html',
  // Compares against "diffing the raw JSON files by hand" and "a generic
  // online JSON-diff tool" -- a method and a category of tool, not any one
  // company's product this could be mistaken for. The page's own footer
  // says so explicitly ("names no specific product").
  'sbom-diff-check/vs-diffing-the-raw-json-files.html',
  // Compares against "splitting the kitchen bill evenly" -- a generic method
  // every commissary/shared-kitchen operator already has, not a company or
  // product this could be mistaken for. Same reasoning as the other
  // vs-spreadsheet / by-hand pages above.
  'commissary-kitchen-cost-split-calculator/vs-splitting-evenly.html',
  // Compares against "opening the instructions file and checking every link
  // and script reference by hand" -- a generic manual habit every developer
  // and reviewer already has access to, not a company or product this could
  // be mistaken for. Same reasoning as the other manual-method pages above.
  'agent-instructions-drift-check/vs-checking-it-by-hand.html',
  // Compares against "looking up each state's statute by hand" (a one-off
  // web search) -- a generic manual method anyone can do with a search
  // engine, not a company or product this could be mistaken for. The
  // page's own footer says so explicitly ("names no specific product").
  // Same reasoning as the other manual-method pages above.
  'call-recording-consent-check/vs-checking-each-states-statute-by-hand.html',
  // Compares against "a flat price per square foot" -- a generic pricing
  // method every insulation crew already has access to, not a company or
  // product this could be mistaken for. Same reasoning as the other
  // generic-method pages above.
  'attic-insulation-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against "a spreadsheet" -- a generic method every backflow
  // tester already has, not a company or product this could be mistaken
  // for. The page's own footer says so explicitly ("names no specific
  // product"). Same reasoning as the other vs-spreadsheet pages above.
  'backflow-test-fee-calculator/vs-spreadsheet.html',
  // Compares against "a flat per-acre quote" -- a generic pricing method
  // every land surveyor already has access to, not a company or product
  // this could be mistaken for. Same reasoning as the other generic-method
  // pages above (e.g. attic-insulation-bid-calculator's flat-rate page).
  'land-survey-bid-calculator/vs-a-flat-per-acre-quote.html',
  // Compares against "a flat panel-upgrade price" and the dollars-per-amp
  // rate that usually replaces it -- generic pricing methods every
  // electrical shop already has access to, not a company or product this
  // could be mistaken for. The page's own fine print says so explicitly
  // ("names no company or product"), and its sibling `vs-servicetitan.html`
  // is where this venture's named-product comparison lives. Same reasoning
  // as the other generic-method pages above.
  'electrical-panel-upgrade-bid-calculator/vs-a-flat-panel-upgrade-price.html',
  // Compares against "a flat rate per square foot" -- a generic pricing
  // method every abatement contractor already has access to, not a company
  // or product this could be mistaken for. Same reasoning as the other
  // generic-method pages above.
  'asbestos-abatement-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "a recipe markup spreadsheet" -- the sheet nearly every
  // floral studio builds for itself, which is a working method rather than
  // any one company's product this could be mistaken for. The page's own
  // footer says so explicitly ("names no specific product, company, or
  // software"). Same reasoning as the vs-spreadsheet / by-hand pages above.
  'wedding-florist-proposal-calculator/vs-a-recipe-markup-spreadsheet.html',
  // Compares against "manually reading the spec diff" -- a generic method
  // every API developer already has access to, not a company or product
  // this could be mistaken for. The page's own footer says so explicitly
  // ("names no specific product"). Same reasoning as the other
  // manual-method pages above.
  'openapi-breaking-change-check/vs-manually-reading-the-spec-diff.html',
  // Compares against "a flat rate per lineal foot" -- a generic pricing
  // method every waterproofing contractor already has access to, not a
  // company or product this could be mistaken for. Same reasoning as the
  // other generic-method pages above (e.g. asbestos-abatement-bid-calculator's
  // flat-rate page).
  'basement-waterproofing-bid-calculator/vs-a-flat-rate-per-lineal-foot.html',
  // Compares against "a flat day rate plus a per-pound hazmat estimate" --
  // a generic pricing method every biohazard/trauma-scene technician
  // already has access to, not a company or product this could be mistaken
  // for. The page's own footer says so explicitly ("names no specific
  // regulated-waste hauler, estimating software, or franchise"). Same
  // reasoning as the other generic-method pages above.
  'biohazard-cleanup-bid-calculator/vs-a-flat-rate-per-pound-quote.html',
  // Compares against "a flat rate per square foot" -- a generic pricing
  // method every paving contractor already has access to, not a company or
  // product this could be mistaken for. Same reasoning as the other
  // generic-method pages above (e.g. asbestos-abatement-bid-calculator's
  // flat-rate page).
  'asphalt-driveway-pave-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "a flat nightly rate copied from local competitors" --
  // a generic pricing habit every independent dog boarding/daycare operator
  // already has access to, not a company or product this could be mistaken
  // for. The page's own footer says so explicitly ("names no specific
  // competitor, product, or company"). Same reasoning as the other
  // generic-method pages above.
  'dog-boarding-daycare-pricing/vs-a-flat-nightly-rate.html',
  // Compares against "tracking offers in a spreadsheet" -- a generic method
  // every Reverb seller already has access to, not a company or product
  // this could be mistaken for. The page's own footer says so explicitly
  // ("names no specific product"). Same reasoning as the other
  // vs-spreadsheet / by-hand pages above.
  'reverb-fee-calculator/vs-tracking-offers-in-a-spreadsheet.html',
  // Compares against "a flat-rate boiler special" -- a generic pricing
  // method every hydronic/steam tech already has access to, not a company
  // or product this could be mistaken for. The page's own footer says so
  // explicitly ("common, honest shortcut"). Same reasoning as the other
  // generic-method pages above (e.g. attic-insulation-bid-calculator's
  // flat-rate page).
  'boiler-replacement-bid-calculator/vs-a-flat-rate-boiler-special.html',
  // Compares against "a flat $800-a-skylight special" -- a generic pricing
  // method every roofer/window crew already has access to, not a company
  // or product this could be mistaken for. The page's own footer says so
  // explicitly ("common, honest shortcut"). Same reasoning as the other
  // generic-method pages above.
  'skylight-install-bid-calculator/vs-a-flat-rate-per-skylight-special.html',
  // Compares against "a flat $1,800 installed" egress-window special -- a
  // generic pricing method every foundation/basement crew already has
  // access to, not a company or product this could be mistaken for. The
  // page's own footer says so explicitly ("common, honest shortcut"). Same
  // reasoning as the other generic-method pages above.
  'egress-window-bid-calculator/vs-a-flat-rate-egress-window-special.html',
  // Compares against "tracking payouts in a spreadsheet" -- a generic method
  // every Whatnot seller already has access to, not a company or product
  // this could be mistaken for. The page's own footer says so explicitly
  // ("names no specific product"). Same reasoning as the other
  // vs-spreadsheet / by-hand pages above (e.g. reverb-fee-calculator's).
  'whatnot-seller-payout/vs-tracking-payouts-in-a-spreadsheet.html',
  // Compares against "tracking landed cost in a spreadsheet" -- a generic
  // method every small importer already has access to, not a company or
  // product this could be mistaken for. The page's own copy says so
  // explicitly ("Names no specific product or company"). Same reasoning as
  // the other vs-spreadsheet / by-hand pages above (e.g. reverb-fee-
  // calculator's).
  'import-landed-cost-calculator/vs-tracking-landed-cost-in-a-spreadsheet.html',
  // Compares against "tracking propane customer margins in a spreadsheet"
  // -- a generic method every independent propane dealer already has
  // access to, not a company or product this could be mistaken for. The
  // page's own copy says so explicitly ("Names no specific product or
  // company"). Same reasoning as the other vs-spreadsheet / by-hand pages
  // above (e.g. import-landed-cost-calculator's).
  'propane-delivery-route-margin/vs-tracking-propane-delivery-margin-in-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a generic method every landlord or
  // tenant already has access to, not a company or product this could be
  // mistaken for. The page names no specific spreadsheet product. Same
  // reasoning as the other vs-spreadsheet / by-hand pages above.
  'security-deposit-return-calculator/vs-a-spreadsheet.html',
  // Compares against tracking payment terms and a client's pay-run schedule
  // in a spreadsheet formula -- a generic method every freelancer already
  // has access to, not a company or product this could be mistaken for. The
  // page names no specific spreadsheet or invoicing product. Same reasoning
  // as the other vs-spreadsheet / by-hand pages above.
  'invoice-payment-terms-calculator/vs-spreadsheet.html',
  // Compares against "opening robots.txt and reading it" -- a generic manual
  // habit every developer already has access to, not a company or product
  // this could be mistaken for. Same reasoning as the other manual-method
  // pages above.
  'subpath-robots-check/vs-checking-robots-txt-by-eye.html',
  // Compares against "sorting an AP export by vendor in a spreadsheet and
  // scanning for repeats" -- a generic method every small business or
  // bookkeeper already has access to, not a company or product this could
  // be mistaken for. The page names no specific spreadsheet product. Same
  // reasoning as the other vs-spreadsheet / by-hand pages above.
  'duplicate-payment-audit/vs-a-spreadsheet.html',
  // Compares against "tracking StockX payouts in a spreadsheet" -- a
  // generic method every reseller already has access to, not a company or
  // product this could be mistaken for. The page's own copy says so
  // explicitly ("Names no specific product or company"). Same reasoning as
  // the other vs-spreadsheet / by-hand pages above.
  'stockx-seller-payout-calculator/vs-tracking-stockx-payouts-in-a-spreadsheet.html',
]);

/** Does `page`'s filename mark it as a named-competitor comparison page? */
function isComparisonPage(page) {
  return /(?:^|\/)vs-[^/]+\.html$/i.test(page);
}

/**
 * Every page missing a required clause, as `{ page, clause }` rows.
 *
 * `pages` maps a display path to its markup. Returned rather than thrown so a
 * run reports the whole set at once -- fixing these one failure per run is how
 * the second venture in #1747 was missed on the first pass.
 */
export function missingClauses(pages) {
  const missing = [];
  for (const [page, markup] of pages) {
    if (!NO_WARRANTY.test(markup)) missing.push({ page, clause: 'no-warranty' });
    if (
      isComparisonPage(page) &&
      !COMPARISON_DISCLAIMER_EXEMPT.has(page) &&
      !NOT_AFFILIATED.test(markup)
    ) {
      missing.push({ page, clause: 'not-affiliated' });
    }
  }
  return missing;
}

/**
 * Every publishable `.html` page under `ventures/`, as `[displayPath, markup]`.
 *
 * `slug` limits the walk to one venture, which is what a venture's own CI
 * wants: a green run there should mean "my venture is clean", not "nobody
 * else's venture is dirty either".
 */
export async function collectPages({ venturesDir = path.join(REPO_ROOT, 'ventures'), slug } = {}) {
  const surfaces = (await discoverSurfaces(venturesDir)).filter((s) => !slug || s.slug === slug);
  const pages = [];

  for (const surface of surfaces) {
    for (const relative of await publishedPages(surface.sourceDir)) {
      // A venture may keep HTML fixtures beside its pages; the builder drops
      // them, so checking them would fail a page no visitor can reach.
      if (!relative.split('/').every((part) => isPublishable(part))) continue;
      const full = path.join(surface.sourceDir, relative);
      pages.push([`${surface.slug}/${relative}`, await fs.readFile(full, 'utf8')]);
    }
  }

  // Whether `slug` names a venture at all, which is a different question from
  // whether it has a browser surface. Both produce zero surfaces, and the
  // callers must not treat them alike: one is a CLI venture behaving
  // normally, the other is a typo silently reporting nothing to do.
  const known = slug === undefined ? true : await isVenture(venturesDir, slug);

  return { pages, surfaces, known };
}

/**
 * The exit for a slug that names no venture, shared by the three tools that
 * take one.
 *
 * These tools all report rather than gate -- a venture with nothing to measure
 * is a normal, passing result, and their CI passes a slug unconditionally, so
 * a coverage number must never fail a run. But that made a mistyped slug
 * indistinguishable from a real venture with no browser surface: both printed
 * "nothing to measure" and exited 0. `faq-coverage.mjs amazon-fba-calculater`
 * reported success for a venture that does not exist.
 *
 * A slug that names nothing is a usage error, not a measurement, so it is the
 * one case that exits non-zero. That leaves "never a gate" intact: what fails
 * here is the question, not the answer.
 */
export function unknownVenture(slug, { log = console.error } = {}) {
  log(
    `${slug}: no such venture.\n` +
      'Nothing was measured. Check the spelling against `ls ventures/`; a\n' +
      'venture that exists but ships no browser surface reports zero and exits 0.',
  );
  return 1;
}

/** Does `slug` name a directory under `venturesDir`? */
async function isVenture(venturesDir, slug) {
  // Guard against a slug that is a path rather than a name -- `foo/../bar`, or
  // an absolute path -- which would otherwise stat something outside the tree.
  if (slug !== path.basename(slug)) return false;
  try {
    return (await fs.stat(path.join(venturesDir, slug))).isDirectory();
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const slug = argv.find((arg) => !arg.startsWith('-'));
  const { pages, surfaces, known } = await collectPages({ slug });

  if (slug && !known) return unknownVenture(slug);

  if (slug && surfaces.length === 0) {
    // Not a failure: plenty of ventures are CLIs or libraries with no browser
    // entry point, and their CI passes this flag unconditionally.
    console.log(`${slug}: no published browser surface, nothing to check`);
    return 0;
  }

  const missing = missingClauses(pages);
  if (missing.length > 0) {
    const byClause = { 'no-warranty': [], 'not-affiliated': [] };
    for (const m of missing) byClause[m.clause].push(m.page);

    const lines = [`${missing.length} page(s) missing a required clause:`];
    if (byClause['no-warranty'].length > 0) {
      lines.push(
        `\nno-warranty (PRODUCT_PLAYBOOK.md 5b) -- free and as-is, no liability,\n` +
          'not [trade] advice, verify before relying on it. Copy the paragraph\n' +
          'from PRODUCT_PLAYBOOK.md rather than from a sibling venture -- copying\n' +
          'a sibling footer is how the clause goes missing:',
        ...byClause['no-warranty'].map((page) => `  ${page}`),
      );
    }
    if (byClause['not-affiliated'].length > 0) {
      lines.push(
        `\nnot-affiliated (PRODUCT_PLAYBOOK.md 5f) -- a vs-<competitor> page names a\n` +
          'trademark and has to say plainly that it is not that product\'s page,\n' +
          'not affiliated with, endorsed by, or sponsored by it. If the page truly\n' +
          'compares against a generic role rather than a named product or company,\n' +
          'add it to COMPARISON_DISCLAIMER_EXEMPT in clauses.mjs with why:',
        ...byClause['not-affiliated'].map((page) => `  ${page}`),
      );
    }
    lines.push(
      '\nThe no-SLA clause is not checked here: build.mjs injects it into every\n' +
        'published page, so a venture does not have to carry it.',
    );
    console.error(lines.join('\n'));
    return 1;
  }

  console.log(
    `${pages.length} published page(s) across ${surfaces.length} surface(s) carry their required clauses`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
