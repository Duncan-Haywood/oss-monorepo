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
  // Compares against "eyeballing the decoded payload" -- a manual review habit
  // any developer already has, not a company or product this could be
  // mistaken for.
  'jwt-security-check/vs-eyeballing-the-payload.html',
  // Compares against "writing llms.txt by hand" -- a generic authoring
  // practice every site owner can do without any tool, not a company or
  // product this could be mistaken for.
  'llms-txt-generator/vs-writing-llms-txt-by-hand.html',
  // Compares against "law-firm client alerts" -- a genre of publication that
  // dozens of different firms produce, not one specific company or product
  // this could be mistaken for. The page's own first paragraph says so
  // ("names no specific firm or product") and its own test pins that
  // sentence, precisely so this exemption cannot quietly stop being true:
  // an author who later added "vs. <Firm> LLP" here would be claiming this
  // exemption for a page that had become the thing it exempts.
  'ny-llc-transparency-act-tracker/vs-reading-client-alerts.html',
  // Compares against "checking hreflang tags by hand" -- a manual review
  // habit every site owner already has, not a company or product this
  // could be mistaken for. Same reasoning as this venture's own
  // vs-merkle-hreflang-tool.html, which names a real competitor and so is
  // not in this set.
  'hreflang-reciprocity-check/vs-checking-hreflang-tags-by-hand.html',
  // Compares against "eyeballing Settings -> Branches" -- a manual habit
  // every repository admin already has, not a company or product this
  // could be mistaken for.
  'branch-protection-drift-check/vs-manually-checking-settings.html',
  // Compares against "opening devtools and checking by hand" -- a manual
  // habit any developer already has, not a company or product this could be
  // mistaken for.
  'source-map-leak-check/vs-checking-devtools-by-hand.html',
  // Compares against "guessing a flat dollar no-show fee" -- a common habit
  // among appointment-based service providers, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-acuity-scheduling.html, which names a real platform and carries the
  // trademark disclaimer.
  'no-show-fee-calculator/vs-a-flat-no-show-fee.html',
  // Compares against "checking response headers by eye in DevTools'
  // Network tab" -- a manual habit any web developer already has, not a
  // company or product this could be mistaken for. Same reasoning as
  // source-map-leak-check's own devtools-by-hand page above; this venture's
  // vs-curl.html is separately exempt-free (curl is a named tool) and
  // already carries the trademark disclaimer, so the two comparison pages
  // are deliberately different classes.
  'cache-control-check/vs-checking-headers-by-eye-in-devtools.html',
  // Compares against "checking response headers by eye in DevTools' Network
  // tab" -- the same manual habit exempted above for cache-control-check,
  // applied to this venture's own frame-protection/CSP/HSTS findings. This
  // venture's vs-securityheaders.html is separately exempt-free (it names a
  // real hosted scanner and carries the trademark disclaimer), so the two
  // comparison pages are deliberately different classes.
  'security-headers-check/vs-checking-headers-by-eye-in-devtools.html',
  // Compares against "your title company's net sheet" -- a role every deal
  // has, not a company or product this could be mistaken for.
  'seller-net-sheet/vs-title-company-net-sheet.html',
  // Compares against checking RLS in Supabase's own Table Editor and
  // Advisor by hand -- the same platform's own built-in dashboard features,
  // described only to explain what a manual look there does and does not
  // tell you, not a separate company or product this could be mistaken
  // for. Same shape as branch-protection-drift-check's exemption above.
  'supabase-rls-check/vs-manually-checking-the-dashboard.html',
  // Compares against "eyeballing two CI console logs" -- a manual habit
  // every developer reaching for this tool already has, not a company or
  // product this could be mistaken for. Same shape as
  // branch-protection-drift-check's exemption above.
  'flaky-test-finder/vs-eyeballing-two-ci-logs-by-hand.html',
  // Compares against "reading two JSON manifest exports side by side, or
  // diffing them with a text tool" -- a manual habit any developer already
  // has, not a company or product this could be mistaken for. Same shape as
  // flaky-test-finder's eyeballing-two-ci-logs exemption above.
  'mcp-supply-chain-watch/vs-comparing-manifests-by-eye.html',
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
  // Compares against "quoting in a spreadsheet" -- the method essentially
  // every small job shop already uses, not a company or product this could be
  // mistaken for. The page names no spreadsheet application and its own
  // footer says so explicitly. Same reasoning as the cat-adjuster page above.
  'cnc-machining-quote-calculator/vs-quoting-in-a-spreadsheet.html',
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
  // Compares against "picking a resistor or capacitor from the parts bin"
  // -- a manual component-selection habit every user of this calculator
  // already has access to, not a company or product this could be
  // mistaken for. Same reasoning as the other manual-method pages above,
  // including this venture's own resistor-calculator sibling entry.
  'ai-engineering-academy/rc-filter-calculator/vs-picking-a-component-from-the-parts-bin.html',
  // Compares against "a spreadsheet" -- a generic method every HOA board
  // treasurer already has, not a company or product this could be mistaken
  // for. Same reasoning as the other vs-spreadsheet pages above.
  'hoa-reserve-fund-calculator/vs-spreadsheet.html',
  // Compares against "a spreadsheet" -- a generic method every bar or
  // beverage program already has, not a company or product this could be
  // mistaken for. Same reasoning as the other vs-spreadsheet pages above.
  // Distinct from this venture's own vs-binwise.html and vs-wisk.html,
  // which name real inventory platforms and carry the trademark disclaimer.
  'pour-cost-calculator/vs-a-spreadsheet.html',
  // Compares against scoring each job on a 1-10 scale -- a generic ranking
  // habit any contractor already has, not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-jobber.html,
  // which names Jobber specifically and carries the trademark disclaimer.
  'which-job-first/vs-scoring-every-job-out-of-ten.html',
  // Compares against "multiplying filament cost by three" -- a pricing
  // habit passed around among makers, not a company or product this could
  // be mistaken for. The page names no vendor at all.
  '3d-print-price-calculator/vs-the-3x-filament-rule.html',
  // Compares against "a flat day rate" -- a generic pricing method every
  // bridal artist already knows, not a company or product this could be
  // mistaken for. Same reasoning as the other generic-method pages above.
  'bridal-hair-makeup-pricing-calculator/vs-flat-day-rate.html',
  // Compares against "a flat day rate" -- a generic pricing method every
  // small rental operator already knows, not a company or product this
  // could be mistaken for. Same reasoning as the other vs-flat-day-rate
  // page above.
  'equipment-rental-break-even/vs-flat-day-rate.html',
  // Compares against "the flat $10-per-1,000-followers rule" -- a pricing
  // shortcut floated across influencer-marketing blogs and rate-card
  // templates generally, not a company or product this could be mistaken
  // for. The page names no specific source for the figure.
  'brand-deal-rate-calculator/vs-the-10-dollars-per-1000-followers-rule.html',
  // Compares against "a flat industry-average CPM" -- the single
  // cost-per-1000-downloads figure podcast ad rate reports and blog posts
  // commonly cite as "the average podcast CPM", not a company or product
  // this could be mistaken for. The page names no specific report or
  // publisher, and its illustrative $25 figure is explicitly disclaimed as
  // not a claim about any specific report's published number.
  'podcast-sponsorship-rate-calculator/vs-a-flat-industry-average-cpm.html',
  // Compares against "eyeballing which box triggers the dimensional
  // penalty" -- a habit every shipper already has, not a company or
  // product this could be mistaken for. The page names no carrier tool.
  'parcel-dim-weight-calculator/vs-guessing-the-box-size.html',
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
  // Compares against a landlord keeping rent and expenses in a spreadsheet --
  // a generic method, not a company or product this could be mistaken for.
  'rental-ledger/vs-spreadsheet.html',
  // Compares against "comparing effective rates" -- the standard rate-
  // shopping advice every merchant-services guide recommends, not a company
  // or product this could be mistaken for. The page names no processor and
  // its own test asserts that.
  'card-processing-fee-audit/vs-comparing-effective-rates.html',
  // Compares against "doing the blended-rate arithmetic by hand or in a
  // spreadsheet" -- a generic method every payroll admin already has, not a
  // company or product this could be mistaken for. Same reasoning as the
  // other vs-spreadsheet / by-hand pages above.
  'overtime-pay-calculator/vs-doing-it-by-hand.html',
  // Compares against "estimating the tips/overtime deduction by hand" -- a
  // generic method every filer already has, not a company or product this
  // could be mistaken for. The page names no specific tax-prep company or
  // competing calculator at all.
  'no-tax-on-tips-overtime-calculator/vs-estimating-the-deduction-by-hand.html',
  // Compares against "estimating the auto loan interest deduction by hand"
  // -- a generic method every filer already has, not a company or product
  // this could be mistaken for. The page names no specific tax-prep
  // company or competing calculator at all.
  'auto-loan-interest-deduction-calculator/vs-estimating-the-deduction-by-hand.html',
  // Compares against "the Form 8995-A worksheet by hand" -- the IRS's own
  // published worksheet, a generic method every filer already has, not a
  // company or product this could be mistaken for. The page names no
  // specific tax-prep company or competing calculator at all.
  'qbi-deduction-calculator/vs-doing-the-worksheet-by-hand.html',
  // Compares against "estimating the senior deduction by hand" -- a generic
  // method every filer already has, not a company or product this could be
  // mistaken for. The page names no specific tax-prep company or competing
  // calculator at all.
  'senior-deduction-calculator/vs-estimating-the-deduction-by-hand.html',
  // Compares against "a spreadsheet" -- a generic method every tutor already
  // has, not a company or product this could be mistaken for. Same reasoning
  // as the other vs-spreadsheet pages above.
  'tutor-package-pricing-calculator/vs-a-spreadsheet.html',
  // Compares against "tracking occupancy tax in a spreadsheet" -- a generic
  // method every host already has, not a company or product this could be
  // mistaken for. Same reasoning as the other vs-spreadsheet pages above.
  'str-occupancy-tax-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a generic method every personal
  // trainer already has, not a company or product this could be mistaken
  // for. Same reasoning as the other vs-spreadsheet pages above.
  'personal-trainer-package-pricing-calculator/vs-a-spreadsheet.html',
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
  // Compares against "a flat per-walk rate" -- the $20-a-walk pricing every
  // independent dog walker or pet sitter already posts, not a company or
  // product this could be mistaken for. The page names no marketplace app
  // or competitor (the venture's own named-product comparison, vs-rover,
  // carries its own trademark disclaimer) and its copy opens by agreeing the
  // flat rate is the right tool for advertising. Same reasoning as the other
  // generic-method pages above.
  'dog-walking-route-pricing/vs-a-flat-per-walk-rate.html',
  // Compares against "a flat $4,500 automatic gate special" -- the published
  // per-opening ad price every gate shop competes with, not a company or
  // product this could be mistaken for. The page names no vendor or field-
  // service platform (the venture's own named-product comparison, vs-jobber,
  // carries its own trademark disclaimer) and its copy opens by agreeing the
  // flat special is the right tool for advertising. Same reasoning as the
  // other generic-method pages above.
  'automatic-driveway-gate-bid-calculator/vs-a-flat-4500-special.html',
  // Compares against "a flat $1,200 installed" entry-door special -- the
  // published per-opening ad price every entry-door shop competes with, not
  // a company or product this could be mistaken for. The page names no
  // vendor or field-service platform (the venture's own named-product
  // comparison, vs-jobber, carries its own trademark disclaimer) and its
  // copy opens by agreeing the flat special is the right tool for
  // advertising. Same reasoning as the other generic-method pages above.
  'entry-door-bid-calculator/vs-a-flat-1200-special.html',
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
  // Compares against "checking a vendor's terms, privacy, or subprocessor
  // page from memory" -- a manual habit every practitioner already has, not
  // a company or product this could be mistaken for. The page names no
  // specific vendor-monitoring service; its sibling comparison page,
  // vs-changedetection-io.html, names a real product and carries its own
  // trademark disclaimer separately. Same reasoning as the other
  // manual-method pages above.
  'vendor-change-watch/vs-checking-vendor-pages-by-hand.html',
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
  'agent-permission-config-check/vs-manual-config-review.html',
  // Compares against "looking up each state's statute by hand" (a one-off
  // web search) -- a generic manual method anyone can do with a search
  // engine, not a company or product this could be mistaken for. The
  // page's own footer says so explicitly ("names no specific product").
  // Same reasoning as the other manual-method pages above.
  'call-recording-consent-check/vs-checking-each-states-statute-by-hand.html',
  // Compares against "checking each state's law by hand" (a one-off web
  // search) -- a generic manual method anyone can do with a search engine,
  // not a company or product this could be mistaken for. The page's own
  // footer says so explicitly ("names no specific product"). Same reasoning
  // as the other manual-method pages above.
  'salary-range-posting-check/vs-checking-each-states-law-by-hand.html',
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
  // Compares against "a flat $8-a-foot" crown molding special -- a generic
  // pricing method every finish carpenter already has access to, not a
  // company or product this could be mistaken for. The page's own footer
  // says so explicitly ("common, honest shortcut"). Same reasoning as the
  // other generic-method pages above.
  'crown-molding-bid-calculator/vs-a-flat-rate-crown-molding-special.html',
  // Compares against "a flat $3,995 installed" stair lift special -- a
  // generic pricing method every accessibility/elevator contractor already
  // has access to, not a company or product this could be mistaken for. The
  // page's own footer says so explicitly ("common, honest shortcut"). Same
  // reasoning as the other generic-method pages above.
  'stair-lift-bid-calculator/vs-a-flat-rate-stair-lift-special.html',
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
  // Compares against "tracking Twitch payouts in a spreadsheet" -- a
  // generic method every streamer already has access to, not a company or
  // product this could be mistaken for. The page's own copy says so
  // explicitly ("Names no specific product or company"). Same reasoning as
  // the other vs-spreadsheet / by-hand pages above.
  'twitch-payout-calculator/vs-tracking-payouts-in-a-spreadsheet.html',
  // Compares against "reading the workflow diff by eye" -- the ordinary code
  // review habit every GitHub Actions maintainer already has, not a company
  // or product this could be mistaken for. The page names no specific
  // reviewer, team, or code-review tool at all.
  'actions-secret-leak-check/vs-reading-the-workflow-by-eye.html',
  // Compares against "reading every workflow file by hand" -- the ordinary
  // manual-tracing habit every maintainer already has when a required check
  // gets stuck, not a company or product this could be mistaken for. The
  // page names no specific reviewer, team, or tool at all.
  'required-checks-drift-check/vs-reading-every-workflow-file-by-hand.html',
  // Compares against "manually checking nested references" -- clicking
  // through to a pinned reusable workflow or composite action on GitHub and
  // reading its own uses: lines by eye, a habit every maintainer already has,
  // not a company or product this could be mistaken for. The page names no
  // specific reviewer, team, or tool at all.
  'actions-transitive-pin-check/vs-manually-checking-nested-references.html',
  // Compares against "computing depreciation recapture by hand or in a
  // spreadsheet" -- a generic method every landlord/seller already has, not
  // a company or product this could be mistaken for. Same reasoning as the
  // other vs-spreadsheet / by-hand pages above.
  'depreciation-recapture-calculator/vs-doing-it-by-hand.html',
  // Compares against "computing certified payroll overtime by hand or in a
  // spreadsheet" -- a generic method every payroll admin on a Davis-Bacon
  // job already has, not a company or product this could be mistaken for.
  // Same reasoning as the other vs-doing-it-by-hand pages above.
  'certified-payroll-calculator/vs-doing-it-by-hand.html',
  // Compares against "looking up the 1099-K threshold yourself" -- a search
  // or memory check every gig/marketplace seller already does, not a
  // company or product this could be mistaken for. The page names no
  // specific tax-prep company or competing checker at all.
  '1099-k-threshold-checker/vs-checking-the-threshold-yourself.html',
  // Compares against "reviewing a Dockerfile by eye" -- the ordinary code
  // review habit every developer already has, not a company or product this
  // could be mistaken for. The page names no specific linter, CI product, or
  // company at all. Same reasoning as the other manual-method pages above.
  'docker-cache-order-check/vs-manually-reviewing-a-dockerfile.html',
  // Compares against "reading the plan JSON by eye" and "grepping it for
  // known secret shapes" -- manual habits every Terraform user already has
  // access to, not a company or product this could be mistaken for. Same
  // reasoning as the other manual-method pages above.
  'terraform-plan-secret-exposure-check/vs-manually-reading-the-plan-json.html',
  // Compares against "guessing your payroll burden and overhead from
  // memory" -- the 20%/10% rule of thumb every trade contractor already
  // reaches for, not a company or product this could be mistaken for. The
  // page names no vendor, competing calculator, or field-service platform
  // at all.
  'shop-rate-calculator/vs-guessing-your-burden-and-overhead.html',
  // Compares against "eyeballing the commission split against the rent
  // check" -- the chair-side napkin habit every stylist weighing a
  // booth-rent offer already runs, not a company or product this could be
  // mistaken for. The page names no salon-software platform or competing
  // calculator at all -- distinct from this venture's own vs-vagaro.html,
  // which does name a product and carries its own "not affiliated" clause.
  'booth-rent-vs-commission/vs-guessing-which-pays-more.html',
  // Compares against "mentally adding a flat percentage" -- a rough mental
  // habit every auction bidder already does, not a company or product this
  // could be mistaken for. The page names no specific auction house or
  // competing calculator at all.
  'equipment-auction-buyer-premium-calculator/vs-a-flat-percent-rule.html',
  // Compares against "dividing take-home income by billable hours" -- a
  // pricing habit every freelancer can do without this calculator, not a
  // company or product this could be mistaken for. The page names no vendor
  // or competing calculator at all.
  'freelance-retainer-calculator/vs-pricing-from-income-goal-alone.html',
  // Compares against "tracking it in a spreadsheet" -- the generic method
  // every FBA seller running more than one same-SKU decision already
  // reaches for, not a company or product this could be mistaken for. The
  // page names no spreadsheet application and its own footer says so
  // explicitly. Same reasoning as the reverb-fee-calculator spreadsheet
  // page above.
  'amazon-fba-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "tracking it in a spreadsheet" -- the generic method
  // every TikTok Shop seller pricing more than one organic/affiliate
  // decision already reaches for, not a company or product this could be
  // mistaken for. The page names no spreadsheet application and its own
  // footer says so explicitly. Same reasoning as the reverb-fee-calculator
  // and amazon-fba-calculator spreadsheet pages above.
  'tiktok-shop-fee-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "tracking payouts in a spreadsheet" -- the generic
  // method every host comparing more than one channel already reaches for,
  // not a company or product this could be mistaken for. The page names
  // Airbnb and Vrbo only as the channels this calculator's own arithmetic
  // runs -- the same way amazon-fba-calculator's spreadsheet page above
  // names "Amazon prep" and "Amazon's help pages" without comparing against
  // Amazon as a product -- and never frames itself as a rival to either
  // platform or to a named booking/PMS tool the way this venture's own
  // vs-airbnb-earnings-estimator.html does (that page carries its own
  // trademark disclaimer for exactly that reason). Same reasoning as the
  // amazon-fba-calculator spreadsheet page above.
  'str-host-payout-calculator/vs-tracking-payouts-in-a-spreadsheet.html',
  // Compares against "a flat rate per square foot" -- a pricing habit every
  // turf and landscape shop is shopped against, not a company or product
  // this could be mistaken for. The page names no vendor or competing
  // calculator at all.
  'artificial-turf-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "a flat rate per square foot" -- a pricing habit every
  // deck-staining shop is shopped against, not a company or product this
  // could be mistaken for. The page names no vendor or competing calculator
  // at all (the venture's own named-product comparison, vs-joist, carries
  // its own trademark disclaimer).
  'deck-staining-bid-calculator/vs-a-flat-rate-per-square-foot.html',

  // Compares against "a flat rate per yard" -- a generic quoting habit every
  // carpet installer meets, not a company or product this could be mistaken
  // for. The page names no vendor or competing calculator at all.
  'carpet-install-bid-calculator/vs-a-flat-rate-per-yard.html',
  // Compares against "a flat truck-fraction rate" -- the "half truck" /
  // "full truck" pricing habit every junk hauler is shopped against, not a
  // company or product this could be mistaken for. The page names no vendor
  // or competing calculator at all.
  'junk-removal-bid-calculator/vs-a-flat-truck-fraction-rate.html',
  // Compares against "tracking it in a spreadsheet" -- the generic method
  // every remodeler pricing rec-room versus framed-finish versus
  // legal-living scope already reaches for, not a company or product this
  // could be mistaken for. The page names no spreadsheet application and its
  // own footer says so explicitly. Same reasoning as the
  // amazon-fba-calculator and reverb-fee-calculator spreadsheet pages above.
  'basement-finishing-bid-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "tracking thresholds in a spreadsheet" -- the generic
  // method every seller doing this by hand already reaches for, not a
  // company or product this could be mistaken for. The page names no
  // spreadsheet application or competing tracker; the sibling
  // vs-paid-nexus-monitoring-software.html on the same venture already names
  // Avalara/TaxJar and carries the not-affiliated clause for that page.
  'economic-nexus-threshold-tracker/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "a flat installed price" -- the "$249 installed"
  // special this venture's own calc.mjs docstring and hypotheses already
  // describe, a generic quoting habit every plumber is shopped on, not a
  // company or product this could be mistaken for. The page names no vendor
  // or competing calculator at all.
  'toilet-replacement-bid-calculator/vs-a-flat-installed-price.html',
  // Compares against "a flat hang fee" -- the single-number EV charger
  // install quote every electrical contractor is shopped against, not a
  // company or product this could be mistaken for. The page names no
  // vendor or competing calculator at all -- distinct from this venture's
  // own vs-servicetitan.html and vs-workiz.html, which do name a product
  // and carry their own "not affiliated" clauses.
  'ev-charger-bid-calculator/vs-a-flat-hang-fee.html',
  // Compares against "a flat per-door price" -- the "$150 a door installed"
  // pricing habit every interior-door carpenter is shopped against, not a
  // company or product this could be mistaken for. The page names no vendor
  // or competing calculator at all.
  'interior-door-bid-calculator/vs-a-flat-per-door-price.html',
  // Compares against "tracking quotes in a spreadsheet" -- the generic
  // method every freelancer pricing a fixed quote already reaches for, not
  // a company or product this could be mistaken for. The page's own footer
  // says so explicitly ("names no specific product"). Same reasoning as the
  // reverb-fee-calculator and whatnot-seller-payout spreadsheet pages above.
  'quote-margin-check/vs-tracking-quotes-in-a-spreadsheet.html',
  // Compares against "a flat per-camera price" -- the "$900 a camera
  // installed" pricing habit every low-voltage and security installer is
  // shopped against, not a company or product this could be mistaken for.
  // The page names no vendor or competing calculator at all -- distinct
  // from this venture's own vs-d-tools.html and vs-housecall-pro.html,
  // which do name a product and carry their own "not affiliated" clauses.
  'security-camera-bid-calculator/vs-a-flat-per-camera-price.html',
  // Compares against "a flat pneumatic special" -- the "$18,995 pneumatic
  // installed" price every accessibility and elevator contractor is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-jobber.html, which does name a product and carries its
  // own "not affiliated" clause.
  'home-elevator-bid-calculator/vs-a-flat-pneumatic-special.html',
  // Compares against "a flat $3,499 installed" special -- the postcard
  // walk-in tub price every bath remodeler and accessibility contractor is
  // shopped against, not a company or product this could be mistaken for.
  // The page names no vendor or competing calculator at all -- distinct
  // from this venture's own vs-housecall-pro.html, which does name a
  // product and carries its own "not affiliated" clause.
  'walk-in-tub-bid-calculator/vs-a-flat-installed-special.html',
  // Compares against "a flat water heater special" -- the "$1,200 water
  // heater installed" price every plumber and water-heater installer is
  // shopped against, not a company or product this could be mistaken for.
  // The page names no vendor or competing calculator at all -- distinct
  // from this venture's own vs-servicetitan.html, which does name a
  // product and carries its own "not affiliated" clause.
  'water-heater-bid-calculator/vs-a-flat-rate-water-heater-special.html',
  // Compares against "a flat $799 installed" special -- the postcard
  // water-softener price every plumbing and water-treatment shop is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-jobber.html, which does name a product and carries its
  // own "not affiliated" clause.
  'water-softener-bid-calculator/vs-a-flat-rate-water-softener-special.html',
  // Compares against "a flat per-window special" -- the "$250 a window
  // installed" price every window-treatment shop is shopped against, not a
  // company or product this could be mistaken for. The page names no vendor
  // or competing calculator at all -- distinct from this venture's own
  // vs-jobber.html, which does name a product and carries its own
  // "not affiliated" clause.
  'plantation-shutter-bid-calculator/vs-a-flat-per-window-special.html',
  // Compares against "a flat rate per square foot" -- the "$35 a square
  // foot installed" pricing habit every tile setter and kitchen remodeler
  // is shopped against, not a company or product this could be mistaken
  // for. The page names no vendor or competing calculator at all --
  // distinct from this venture's own vs-jobber.html, which does name a
  // product and carries its own "not affiliated" clause.
  'kitchen-tile-backsplash-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "a flat per-square-foot price" -- the "35 cents a
  // square foot" pricing habit every sealcoating contractor is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-bitumio.html, which does name a product and carries
  // its own "not affiliated" clause.
  'asphalt-sealcoat-bid-calculator/vs-a-flat-per-square-foot-price.html',
  // Compares against "a bedroom-count quote" -- the "3 bedroom house"
  // size-bracket pricing habit every local mover is shopped against, not a
  // company or product this could be mistaken for. The page names no
  // vendor or competing calculator at all -- distinct from this venture's
  // own vs-smartmoving.html, which does name a product and carries its own
  // "not affiliated" clause.
  'moving-bid-calculator/vs-a-bedroom-count-quote.html',
  // Compares against "a flat rate repair price" -- the price-book-by-
  // complaint habit every independent appliance repair technician is
  // shopped against, not a company or product this could be mistaken for.
  // The page names no vendor or competing calculator at all -- distinct
  // from this venture's own vs-housecall-pro.html, which does name a
  // product and carries its own "not affiliated" clause.
  'appliance-repair-quote-calculator/vs-a-flat-rate-repair-price.html',
  // Compares against "a flat Saturday-special price" -- the flat per-unit
  // event-day pricing habit every portable sanitation yard is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing platform at all -- distinct from this
  // venture's own vs-servicecore.html, which does name a product and
  // carries its own "not affiliated" clause.
  'portable-restroom-event-quote/vs-a-flat-saturday-special-price.html',
  // Compares against "a spreadsheet" -- the flat fee-percentage tracking
  // habit every eBay seller already has, not a company or product this
  // could be mistaken for. The page names no vendor or competing
  // calculator at all -- distinct from this venture's own
  // vs-ebay-fee-calculator.html, which does name a product and carries
  // its own "not affiliated" clause.
  'ebay-fee-calculator/vs-a-spreadsheet.html',
  // Compares against "a flat price per door" -- the per-door pricing habit
  // every cabinet painter is shopped against, not a company or product this
  // could be mistaken for. The page names no vendor or competing calculator
  // at all -- distinct from this venture's own vs-kickserv.html, which does
  // name a product and carries its own "not affiliated" clause.
  'cabinet-refinishing-bid-calculator/vs-a-flat-price-per-door.html',
  // Compares against "a flat $199 house sweep special" -- the postcard
  // chimney-sweep rate every sweep is shopped against, not a company or
  // product this could be mistaken for. The page names no vendor or
  // competing calculator at all -- distinct from this venture's own
  // vs-jobber.html, which does name a product and carries its own
  // "not affiliated" clause.
  'chimney-sweep-bid-calculator/vs-a-flat-house-sweep-special.html',
  // Compares against "a flat per-room special" -- the "3 bedrooms, $129"
  // room-count pricing habit every carpet-cleaning technician is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-servicemonster.html, which does name a product and
  // carries its own "not affiliated" clause.
  'carpet-cleaning-bid-calculator/vs-a-flat-per-room-special.html',
  // Compares against "watching your backup's exit code yourself" -- the
  // cron-mail/systemd-status habit every operator running a scheduled
  // backup already has, not a company or product this could be mistaken
  // for. The page names no vendor or competing tool at all -- distinct
  // from this venture's own vs-healthchecks.html, which does name a
  // product and carries its own "not affiliated" clause.
  'backup-verification-evidence/vs-checking-the-exit-code-yourself.html',
  // Compares against "a flat price-per-foot" fence quote -- the "$35 a
  // foot installed" per-foot pricing habit every fence contractor is
  // shopped on, not a company or product this could be mistaken for. The
  // page names no vendor or competing calculator at all -- distinct from
  // this venture's own vs-fence-cloud.html, which does name a product and
  // carries its own "not affiliated" clause.
  'fence-bid-calculator/vs-a-flat-price-per-foot.html',
  // Compares against "building your own cash-flow spreadsheet" -- the
  // running-balance habit every small business owner already has, not a
  // company or product this could be mistaken for. The page names no
  // vendor or competing platform at all -- distinct from this venture's
  // own vs-quickbooks-cash-flow-planner.html, which does name a product
  // and carries its own "not affiliated" clause.
  'cash-runway-planner/vs-a-spreadsheet.html',
  // Compares against "a flat whole-house special" -- the "$99 whole-house"
  // or "$299 after-coupon" rate every duct-cleaning company is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-jobber.html, which does name a product and carries its
  // own "not affiliated" clause.
  'duct-cleaning-bid-calculator/vs-a-flat-whole-house-special.html',
  // Compares against "a flat $28-a-foot estimate" -- the per-square-foot
  // rule of thumb every deck job is shopped against, not a company or
  // product this could be mistaken for. The page names no vendor or
  // competing calculator at all -- distinct from this venture's own
  // vs-quoteiq.html, which does name a product and carries its own
  // "not affiliated" clause.
  'deck-bid-calculator/vs-a-flat-28-a-foot-estimate.html',
  // Compares against "a flat price per square foot" -- the per-square-foot
  // quoting habit homeowners and GCs already ask concrete contractors for,
  // not a company or product this could be mistaken for. The page names no
  // vendor or competing calculator at all -- distinct from this venture's
  // own vs-stack.html, which does name a product and carries its own
  // "not affiliated" clause.
  'concrete-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against "a flat $99 dryer vent special" -- the coupon-page
  // flat rate every dryer-vent tech is shopped against, not a company or
  // product this could be mistaken for. The page names no vendor or
  // competing calculator at all -- distinct from this venture's own
  // vs-wepro.html, which does name a product and carries its own
  // "not affiliated" clause.
  'dryer-vent-bid-calculator/vs-a-flat-99-dollar-special.html',
  // Compares against "a flat price per linear foot" -- the per-foot
  // quoting habit gutter-cleaning companies are told to bid by, not a
  // company or product this could be mistaken for. The page names no
  // vendor or competing calculator at all -- distinct from this venture's
  // own vs-jobber.html, which does name a product and carries its own
  // "not affiliated" clause.
  'gutter-cleaning-bid-calculator/vs-a-flat-price-per-linear-foot.html',
  // Compares against "a flat usage-fee percentage" -- the "just add 25%"
  // round-number habit photographers already use when quoting usage
  // rights, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-fotoquote.html, which does name a product and
  // carries its own "not affiliated" clause.
  'commercial-photo-license-calculator/vs-a-flat-usage-fee.html',
  // Compares against "a flat $X/sq ft or $X/hole special" -- the coupon-rate
  // habit lifting shops already get quoted against, not a company or
  // product this could be mistaken for. The page names no vendor or
  // competing calculator at all -- distinct from this venture's own
  // vs-quoteiq.html, which does name a product and carries its own
  // "not affiliated" clause.
  'concrete-lifting-bid-calculator/vs-a-flat-rate-special.html',
  // Compares against "a flat price per finished square foot" -- the
  // per-square-foot pricing habit every countertop fabricator is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing calculator at all -- distinct from this
  // venture's own vs-moraware.html, which does name a product and carries
  // its own "not affiliated" clause.
  'countertop-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against a flat "2.9% + 30 cents" card-fee rule of thumb -- the
  // generic processing-fee estimate every merchant already carries, not a
  // company or product this could be mistaken for. The page names no
  // processor or payment company at all, referring only to "Shopify
  // Payments" (Shopify's own term) and "a third-party processor" generically
  // -- distinct from this venture's own vs-beprofit.html, which does name a
  // product and carries its own "not affiliated" clause.
  'shopify-fee-calculator/vs-a-flat-card-fee-guess.html',
  // Compares against "tracking it in a spreadsheet" -- the generic method
  // a freelancer pricing the same job on both platforms already reaches
  // for, not a company or product this could be mistaken for. The page
  // names Upwork and Fiverr only as the two platforms this calculator's own
  // arithmetic runs, the same way tiktok-shop-fee-calculator's spreadsheet
  // page above names TikTok Shop, and its own footer says so explicitly.
  'freelance-platform-fee-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "a rough lump sum" -- the round-number, eyeball-the-
  // takeoff habit contractors already price change orders with, not a
  // company or product this could be mistaken for. The page names no
  // vendor or competing calculator at all -- distinct from this venture's
  // own vs-buildertrend.html, which does name a product and carries its
  // own "not affiliated" clause.
  'change-order-margin-calculator/vs-a-rough-lump-sum.html',
  // Compares against "a flat $180/sf special" -- the per-square-foot
  // pricing habit every sunroom shop is shopped against, not a company or
  // product this could be mistaken for. The page names no vendor or
  // competing calculator at all -- distinct from this venture's own
  // vs-jobber.html, which does name a product and carries its own "not
  // affiliated" clause.
  'sunroom-bid-calculator/vs-a-flat-180-per-square-foot-special.html',
  // Compares against "doing it in a spreadsheet" -- a generic method every
  // Shopify merchant already has, not a company or product this could be
  // mistaken for. The page names no spreadsheet application and its own
  // first paragraph says so explicitly.
  'shopify-fee-calculator/vs-doing-it-in-a-spreadsheet.html',
  // Compares against "doing it by hand or in a spreadsheet" -- the generic
  // method every service business already has, not a company or product
  // this could be mistaken for. The page names no spreadsheet application,
  // booking platform, or vendor at all -- distinct from this venture's own
  // vs-square-appointments.html, which does name a product and carries its
  // own "not affiliated" clause. Same reasoning as the other vs-doing-it-by-
  // hand / vs-spreadsheet pages above.
  'appointment-deposit-calculator/vs-doing-it-by-hand.html',
  // Compares against "pricing tuition by hand or in a spreadsheet" -- the
  // generic method every center director already has, not a company or
  // product this could be mistaken for. The page names no spreadsheet
  // application or childcare management platform at all -- distinct from
  // this venture's own vs-procare.html, which does name a product and
  // carries its own "not affiliated" clause. Same reasoning as the other
  // vs-doing-it-by-hand / vs-spreadsheet pages above.
  'childcare-tuition-calculator/vs-doing-it-by-hand.html',
  // Compares against "tallying a serve's profit by hand or in a spreadsheet"
  // -- the generic method every independent process server already has, not
  // a company or product this could be mistaken for. The page names no
  // spreadsheet application or notebook app at all -- distinct from this
  // venture's own vs-servemanager.html, which does name a product and
  // carries its own "not affiliated" clause. Same reasoning as the other
  // vs-doing-it-by-hand / vs-spreadsheet pages above.
  'process-server-fee-calculator/vs-doing-it-by-hand.html',
  // Compares against "tracking orders in a spreadsheet" -- the generic
  // method every Etsy seller already has, not a company or product this
  // could be mistaken for. The page names no spreadsheet application or
  // vendor at all -- distinct from this venture's own
  // vs-etsys-listing-form-calculator.html, which does name a product
  // (Etsy's own Profit Calculator) and carries its own "not affiliated"
  // clause.
  'etsy-profit-calculator/vs-a-spreadsheet.html',
  // Compares against "a flat $4/sq ft encapsulation special" -- a generic
  // pricing habit every waterproofing contractor already meets, not a
  // company or product this could be mistaken for. The page names no
  // vendor at all -- distinct from this venture's own vs-quoteiq.html,
  // which does name a product and carries its own "not affiliated"
  // clause. Same reasoning as the other vs-a-flat-*-special pages above.
  'crawl-space-encapsulation-bid-calculator/vs-a-flat-4-dollar-sq-ft-special.html',
  // Compares against "a flat $3,999 house special" -- a generic postcard
  // pricing pattern painting companies of many different names advertise,
  // not one specific company or product this could be mistaken for. The
  // page names no painting company at all. Same reasoning as the other
  // vs-a-flat-*-special pages already in the tree (e.g.
  // automatic-driveway-gate-bid-calculator's vs-a-flat-4500-special.html).
  'exterior-painting-bid-calculator/vs-a-flat-3999-house-special.html',
  // Compares against "a flat $2,499 installed special" -- a generic
  // postcard pricing pattern hearth/chimney shops of many different names
  // advertise, not one specific company or product this could be mistaken
  // for. The page names no hearth shop at all -- distinct from this
  // venture's own vs-jobber.html, which does name a product and carries
  // its own "not affiliated" clause.
  'fireplace-insert-bid-calculator/vs-a-flat-2499-installed-special.html',
  // Compares against "the app's own earnings screen" -- a feature every
  // gig-delivery/rideshare platform has (DoorDash, Uber, Instacart, Lyft,
  // and others alike), not one specific company or product this could be
  // mistaken for. The page names no platform at all -- distinct from this
  // venture's own vs-gridwise.html, which does name a product and carries
  // its own "not affiliated" clause.
  'gig-driver-net-pay-calculator/vs-the-apps-earnings-screen.html',
  // Compares against tracking a tiled-shower bid in a spreadsheet -- the
  // generic method, not a company or product this could be mistaken for.
  // The page names no vendor or competing calculator at all -- distinct
  // from this venture's own vs-jobber.html, which does name a product and
  // carries its own "not affiliated" clause.
  'walk-in-shower-bid-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "a flat price per square foot" -- the generic pricing
  // habit the trade is shopped on, not a company or product this could be
  // mistaken for. The page names no vendor or competing calculator at all --
  // distinct from this venture's own vs-buildxact.html, which does name a
  // product and carries its own "not affiliated" clause.
  'drywall-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against "a flat $650 per square special" -- a generic postcard
  // pricing pattern low-slope roofing companies of many different names
  // advertise, not one specific company or product this could be mistaken
  // for. The page names no roofing company at all. Same reasoning as the
  // other vs-a-flat-*-special pages already in the tree (e.g.
  // exterior-painting-bid-calculator's vs-a-flat-3999-house-special.html).
  'flat-roof-bid-calculator/vs-a-flat-650-per-square-special.html',
  // Compares against "a flat price per square foot" -- a generic pricing
  // habit popcorn ceiling removal is shopped on, not a company or product
  // this could be mistaken for. The page names no vendor or competing
  // calculator at all -- distinct from this venture's own vs-jobber.html,
  // which does name a product and carries its own "not affiliated" clause.
  // Same reasoning as the other generic-method pages above (e.g.
  // drywall-bid-calculator's flat-rate page).
  'popcorn-ceiling-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against "a flat price per pier" -- the generic pricing habit
  // the trade is shopped on, not a company or product this could be
  // mistaken for. The page names no vendor or competing calculator at all --
  // distinct from this venture's own vs-jobber.html, which does name a
  // product and carries its own "not affiliated" clause.
  'foundation-repair-bid-calculator/vs-a-flat-price-per-pier.html',
  // Compares against "a flat $2,495 furnace special" -- a generic postcard
  // pricing pattern HVAC companies of many different names advertise, not
  // one specific company or product this could be mistaken for. The page
  // names no HVAC company at all -- distinct from this venture's own
  // vs-servicetitan.html, which does name a product and carries its own
  // "not affiliated" clause. Same reasoning as the other
  // vs-a-flat-*-special pages already in the tree (e.g.
  // exterior-painting-bid-calculator's vs-a-flat-3999-house-special.html).
  'furnace-bid-calculator/vs-a-flat-2495-furnace-special.html',
  // Compares against "a flat $8/ft leaf-filter special" -- a generic
  // per-foot pricing habit the trade is shopped on, not a company or product
  // this could be mistaken for. The page names no vendor or competing
  // calculator at all -- distinct from this venture's own vs-jobber.html
  // and vs-jobnimbus.html, which do name products and carry their own
  // "not affiliated" clauses.
  'gutter-guard-bid-calculator/vs-a-flat-8-per-foot-special.html',
  // Compares against "a flat price per foot" -- the generic pricing habit
  // the trade is shopped on, not a company or product this could be
  // mistaken for. The page names no vendor or competing calculator at all --
  // distinct from this venture's own vs-jobber.html, which does name a
  // product and carries its own "not affiliated" clause.
  'french-drain-bid-calculator/vs-a-flat-price-per-foot.html',
  // Compares against "a spreadsheet" -- a generic method almost every EHS
  // team already has, not a company or product this could be mistaken for.
  // The page names no spreadsheet vendor at all, same reasoning as
  // overtime-pay-calculator's own vs-spreadsheet.html above.
  'osha-trir-dart-calculator/vs-spreadsheet.html',
  // Compares against "a flat $4 a square foot installed" special -- a generic
  // postcard pricing pattern excavation and landscape shops of many different
  // names advertise for gravel driveways, not one specific company or product
  // this could be mistaken for. The page names no vendor or competing
  // calculator at all -- distinct from this venture's own vs-jobber.html,
  // which does name a product and carries its own "not affiliated" clause.
  // Same reasoning as the other vs-a-flat-*-special pages already in the tree
  // (e.g. exterior-painting-bid-calculator's vs-a-flat-3999-house-special.html).
  'gravel-driveway-bid-calculator/vs-a-flat-4-per-square-foot-special.html',
  // Compares against "a flat price per square foot" -- the generic pricing
  // habit the trade is shopped on, not a company or product this could be
  // mistaken for. The page names no vendor or competing calculator at all --
  // distinct from this venture's own vs-rfms.html, which does name a
  // product and carries its own "not affiliated" clause.
  'flooring-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against "reading a page's view-source or devtools for SRI tags
  // by eye" -- a manual method every developer already has access to, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-srihash.html, which does name a product (srihash.org)
  // and carries its own "not affiliated" clause. Same reasoning as the other
  // vs-checking-it-by-hand / vs-reading-the-color-code-by-eye pages above.
  'sri-check/vs-checking-tags-by-hand.html',
  // Compares against "a flat price per window" -- the generic postcard
  // pricing habit the trade is shopped on, not a company or product this
  // could be mistaken for. The page names no vendor or competing calculator
  // at all -- distinct from this venture's own vs-marketsharp.html, which
  // does name a product and carries its own "not affiliated" clause.
  'window-replacement-bid-calculator/vs-a-flat-price-per-window.html',
  // Compares against "a flat quote by house size" -- the generic pricing
  // habit pest control accounts are shopped on, not a company or product
  // this could be mistaken for. The page names no vendor or competing
  // calculator at all -- distinct from this venture's own vs-pestpac.html,
  // which does name a product and carries its own "not affiliated" clause.
  'pest-control-bid-calculator/vs-a-flat-quote-by-house-size.html',
  // Compares against "a flat $189 broken-spring special" -- the generic
  // postcard/search-ad pricing habit the trade is shopped on, not a company
  // or product this could be mistaken for. The page names no vendor or
  // competing calculator at all -- distinct from this venture's own
  // vs-housecall-pro.html, which does name a product and carries its own
  // "not affiliated" clause.
  'garage-door-bid-calculator/vs-a-flat-189-broken-spring-special.html',
  // Compares against doing Mercari fee math in your head -- a method every
  // seller already has, not a company or product this could be mistaken
  // for. Mercari itself is named only as the subject of the fee schedule
  // both approaches compute against, the same way the tool's own index.html
  // names it, and the page still carries its own "not affiliated" line.
  // Same reasoning as the cat-adjuster and 1099k spreadsheet pages above.
  'mercari-fee-calculator/vs-doing-the-fee-math-yourself.html',
  // Compares against "a flat $999 mold special" -- a generic postcard
  // pricing pattern mold remediation companies of many different names
  // advertise, not one specific company or product this could be mistaken
  // for. The page names no company at all -- distinct from this venture's
  // own vs-xactimate.html, which does name a product and carries its own
  // "not affiliated" clause. Same reasoning as the other
  // vs-a-flat-*-special pages already in the tree (e.g.
  // furnace-bid-calculator's vs-a-flat-2495-furnace-special.html).
  'mold-remediation-bid-calculator/vs-a-flat-999-mold-special.html',
  // Compares against "a spreadsheet" -- a generic method most filers who pay
  // quarterly estimated tax more than once already build for themselves, not
  // a company or product this could be mistaken for. The page names no
  // spreadsheet vendor at all, same reasoning as osha-trir-dart-calculator's
  // own vs-spreadsheet.html above -- distinct from this venture's own
  // vs-keeper.html, which does name a product and carries its own "not
  // affiliated" clause.
  'quarterly-estimated-tax-calendar/vs-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a generic method every Turo host
  // already has, not a company or product this could be mistaken for. The
  // page names no spreadsheet vendor at all. Same reasoning as the other
  // vs-a-spreadsheet pages above; distinct from this venture's own
  // how-much-does-turo-take-from-hosts.html, which is a guide page, not a
  // comparison.
  'turo-host-payout-calculator/vs-a-spreadsheet.html',
  // Compares against "pasting a Realtime Database URL into a browser or
  // curl-ing the Firestore REST API by hand" -- a generic manual habit any
  // developer with the project ID already has, not a company or product
  // this could be mistaken for. Same reasoning as source-map-leak-check's
  // vs-checking-devtools-by-hand.html exemption above.
  'firebase-rules-check/vs-requesting-the-url-by-hand.html',
  // Compares against "checking the URL by hand in a browser" -- a generic
  // manual habit any developer already has access to, not a company or
  // product this could be mistaken for. Same reasoning as this file's own
  // source-map-leak-check/vs-checking-devtools-by-hand.html and
  // branch-protection-drift-check/vs-manually-checking-settings.html entries
  // above.
  'git-exposure-check/vs-checking-the-url-by-hand.html',
  // Compares against "clicking through your own cloud provider's console
  // by hand" -- a manual habit every bucket owner already has, not a
  // company or product this could be mistaken for. The page's own first
  // paragraph says so explicitly ("names no specific company or
  // product"), same reasoning as branch-protection-drift-check's and
  // supabase-rls-check's own-console exemptions above.
  'cloud-bucket-exposure-check/vs-manually-checking-in-the-cloud-console.html',
  // Compares against "pasting an introspection query into GraphiQL, Postman,
  // or curl" -- a generic manual habit every GraphQL developer already has
  // (every server ships a playground that runs the identical query), not a
  // company or product this could be mistaken for. Same reasoning as this
  // file's own git-exposure-check/vs-checking-the-url-by-hand.html entry
  // above.
  'graphql-introspection-exposure-check/vs-checking-introspection-by-hand.html',
  // Compares against "doing the math yourself" -- a generic method (adding
  // up wall-clock minutes by hand) every repository maintainer already
  // does, not a company or product this could be mistaken for. Distinct
  // from this venture's own vs-billing-page.html, which compares against
  // GitHub's own billing page and already carries the "not affiliated"
  // clause for that reason.
  'actions-minutes-estimator/vs-doing-the-math-yourself.html',
  // Compares against "typing the URL into a browser tab and eyeballing the
  // response" -- a manual habit every developer already has, not a company
  // or product this could be mistaken for. This page names no git-hosting
  // platform, IDE, or scanning tool.
  'dotenv-exposure-check/vs-checking-by-hand.html',
  // Compares against "typing the URL into a browser tab and downloading the
  // file by hand" -- a manual habit every developer already has, not a
  // company or product this could be mistaken for. This page names no
  // hosting platform, backup tool, or scanning tool. Same reasoning as this
  // file's own dotenv-exposure-check/vs-checking-by-hand.html and
  // git-exposure-check/vs-checking-the-url-by-hand.html entries above.
  'backup-file-exposure-check/vs-checking-by-hand.html',
  // Compares against "running dig CNAME by hand" -- a generic DNS-lookup
  // habit every developer already has, not a company or product this could
  // be mistaken for. The page names third-party hosting providers (S3,
  // Heroku, GitHub Pages) only as CNAME-target examples, not as the thing
  // being compared against.
  'subdomain-takeover-check/vs-checking-dig-by-hand.html',
  // Compares against "typing the bucket URL into a browser tab" -- a
  // generic manual habit every AWS developer already has, not a company or
  // product this could be mistaken for. The page mentions AWS's own tools
  // (Trusted Advisor, IAM Access Analyzer) only to contrast "checks from
  // inside the account" with this tool's "checks from outside, no login",
  // never as the thing being compared against -- the same reasoning as
  // git-exposure-check's and dotenv-exposure-check's own by-hand pages.
  's3-bucket-exposure-check/vs-checking-by-hand.html',
  // Compares against "a flat rate per square foot" -- a generic pricing
  // method every garage-floor coating contractor already has access to, not
  // a company or product this could be mistaken for. Same reasoning as the
  // other generic-method pages above (e.g. asphalt-driveway-pave-bid-
  // calculator's flat-rate page). Distinct from this venture's own
  // vs-coatingos.html, which compares against a named estimating product
  // and already carries the "not affiliated" clause for that reason.
  'epoxy-garage-floor-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "a spreadsheet" -- a generic method every SaaS
  // operator already has access to, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-vendr.html and
  // vs-zylo.html, which name specific SaaS-management platforms and already
  // carry the "not affiliated" clause for that reason. Same reasoning as
  // the other vs-spreadsheet pages above (e.g. turo-host-payout-calculator's).
  'saas-seat-true-up/vs-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a generic method every freelance
  // interpreter already has access to, not a company or product this could
  // be mistaken for. Same reasoning as the other vs-spreadsheet pages above.
  'sign-language-interpreter-rate-calculator/vs-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a generic method every rental
  // operator already has access to, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-booqable.html and
  // vs-inflatableoffice.html, which name specific rental platforms and
  // already carry the "not affiliated" clause for that reason. Same
  // reasoning as the other vs-spreadsheet pages above.
  'bounce-house-rental-calculator/vs-a-spreadsheet.html',
  // Compares against "reading the concentrate label's sticker price as the
  // diluted product's cost" -- a generic pricing habit every janitorial
  // operator already has, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-janitorial-manager.html, which
  // names a specific platform and already carries the "not affiliated"
  // clause for that reason.
  'cleaning-dilution-calculator/vs-pricing-off-the-label-price.html',
  // Compares against "bidding a flat percentage of value" -- a generic rule
  // of thumb repeated across storage-auction forums generally, not a
  // company or product this could be mistaken for. The page names no
  // auction platform, forum, or vendor. Distinct from this venture's own
  // vs-storagetreasures.html, which names a specific marketplace and
  // already carries the "not affiliated" clause for that reason.
  'storage-auction-max-bid-calculator/vs-bidding-a-flat-percentage.html',
  // Compares against "a spreadsheet" -- a generic method every contractor
  // already has access to, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-levelset.html, which names
  // Levelset/Procore and already carries the "not affiliated" clause for
  // that reason. Same reasoning as the other vs-spreadsheet pages above
  // (e.g. saas-seat-true-up's).
  'retainage-cashflow-calculator/vs-a-spreadsheet.html',
  // Compares against "a flat $4.50-a-foot installed special" -- the
  // published per-foot ad rate every gutter shop competes with, not a
  // company or product this could be mistaken for. The page names no
  // vendor or field-service platform (the venture's own named-product
  // comparison, vs-jobnimbus, carries its own trademark disclaimer) and its
  // copy opens by agreeing the flat special is the right tool for
  // advertising. Same reasoning as automatic-driveway-gate-bid-calculator's
  // vs-a-flat-4500-special.html and entry-door-bid-calculator's
  // vs-a-flat-1200-special.html above.
  'gutter-install-bid-calculator/vs-a-flat-per-foot-special.html',
  // Compares against "a flat fee per assignment" -- a generic pricing habit
  // every freelance interpreter already has access to (a memorized number
  // quoted for most bookings), not a company or product this could be
  // mistaken for. The page names no agency, platform, or vendor.
  'sign-language-interpreter-rate-calculator/vs-a-flat-fee-per-assignment.html',
  // Compares against "a flat price per shirt" -- a generic pricing habit
  // every apparel decorator already has access to (one per-piece quote
  // regardless of placement count), not a company or product this could be
  // mistaken for. The page names no vendor, platform, or shop-management
  // tool; vs-printavo.html already carries this venture's one
  // named-competitor comparison and its own trademark disclaimer.
  'apparel-decoration-price-calculator/vs-a-flat-price-per-shirt.html',
  // Compares against "a spreadsheet" -- a generic method every restaurant
  // operator already has access to, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-toast.html, which
  // names Toast and already carries the "not affiliated" clause for that
  // reason. Same reasoning as the other vs-spreadsheet pages above.
  'delivery-app-margin-calculator/vs-a-spreadsheet.html',
  // Compares against "sales minus booth fee" mental math or a one-line
  // spreadsheet -- a generic gut check every maker already does, not a
  // company or product this could be mistaken for. The page names no
  // spreadsheet application or bookkeeping tool. Distinct from this
  // venture's own vs-craftybase.html, which names a specific product and
  // already carries the "not affiliated" clause for that reason.
  'craft-fair-booth-calculator/vs-a-spreadsheet.html',
  // Compares against "a flat rate per acre" -- the per-acre mowing rate
  // every lawn-care operator is shopped against, not a company or product
  // this could be mistaken for. The page names no vendor or competing
  // calculator at all -- distinct from this venture's own vs-lmn.html,
  // which does name a product and carries its own "not affiliated" clause.
  'lawn-care-bid-calculator/vs-a-flat-rate-per-acre.html',
  // Compares against sending a single crafted curl request and reading the
  // response by eye -- a manual habit every developer testing CORS already
  // has, not a company or product this could be mistaken for. The page
  // does cross-link to this venture's own vs-burp-suite.html, which does
  // name a product and carries its own "not affiliated" clause.
  'cors-misconfig-check/vs-checking-cors-by-hand.html',
  // Compares against "a flat monthly fee" -- the round, competitor-matched
  // maintenance-plan price every HVAC contractor is shopped against, not a
  // company or product this could be mistaken for. The page names no
  // vendor or field-service platform at all -- distinct from this
  // venture's own vs-servicetitan.html, which does name a product and
  // carries its own "not affiliated" clause.
  'hvac-maintenance-contract-calculator/vs-a-flat-monthly-fee.html',
  // Compares against "a spreadsheet" -- a generic method every decoration
  // shop already has access to, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-printavo.html, which
  // names a specific shop-management platform and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-spreadsheet pages above (e.g. bounce-house-rental-calculator's).
  'apparel-decoration-price-calculator/vs-a-spreadsheet.html',
  // Compares against "a per-job pricing spreadsheet" -- a generic method
  // every operator already has access to, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-jobber.html,
  // which names a specific field-service platform and already carries the
  // "not affiliated" clause for that reason.
  'dumpster-rental-margin-calculator/vs-a-spreadsheet.html',
  // Compares against "reading the workflow file by hand" -- a manual
  // review habit every GitHub Actions user already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-zizmor.html, which names a specific open-source tool and already
  // carries the "not affiliated" clause for that reason. Same reasoning as
  // the other vs-checking-*-by-hand pages above (e.g.
  // graphql-introspection-exposure-check's).
  'actions-injection-check/vs-checking-a-workflow-by-hand.html',
  // Compares against "a flat installed price per square foot" -- a generic
  // pricing habit every shed dealer already shops against (the "$X.XX
  // installed" Facebook-special quote), not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-jobber.html, which
  // names a specific field-service platform and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-a-flat-rate-per-square-foot pages above (e.g.
  // artificial-turf-bid-calculator's).
  'shed-install-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against "opening each base image's own release page by hand" --
  // a manual lookup habit every Dockerfile author already has, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-a-vulnerability-scanner.html, which names specific
  // scanners (Trivy, Grype, Docker Scout) and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above (e.g. actions-injection-check's).
  'docker-base-image-eol-check/vs-checking-eol-dates-by-hand.html',
  // Compares against "reading a Dockerfile by hand" -- a manual review
  // habit every Docker user already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-hadolint.html,
  // which names a specific open-source tool and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above.
  'docker-base-image-pin-check/vs-reading-a-dockerfile-by-hand.html',
  // Compares against "ranking route locations by withdrawal count" -- a
  // habit every ATM route operator already has from a monthly transaction
  // report, not a company or product this could be mistaken for. Distinct
  // from this venture's own vs-atm-depot.html, which names a specific
  // equipment/processing vendor and already carries the "not affiliated"
  // clause for that reason. Same reasoning as the other generic-method pages
  // above.
  'atm-route-margin/vs-ranking-by-transaction-count.html',
  // Compares against "ranking sites by extinguisher count" -- a habit every
  // inspection route operator already has from a unit-count schedule, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-servicetitan.html, which names a specific field-service
  // platform and already carries the "not affiliated" clause for that
  // reason. Same reasoning as atm-route-margin's transaction-count
  // exemption above.
  'fire-extinguisher-inspection-route-margin/vs-ranking-sites-by-extinguisher-count.html',
  // Compares against "running dig by hand" -- a manual DNS lookup habit
  // every developer and admin already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-mxtoolbox.html, which names a specific commercial product and
  // already carries the "not affiliated" clause for that reason. Same
  // reasoning as the other vs-checking-*-by-hand pages above.
  'email-auth-check/vs-checking-dns-records-by-hand.html',
  // Compares against "checking the manifest by hand" -- a manual review
  // habit every Chrome extension developer already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-crxcavator.html, which names a specific product and already carries
  // the "not affiliated" clause for that reason. Same reasoning as the
  // other vs-checking-*-by-hand pages above.
  'chrome-extension-permission-check/vs-checking-the-manifest-by-hand.html',
  // Compares against "matching an SBOM to advisories by hand" -- a manual
  // review habit anyone with the two export files already has, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-dependency-track.html, which names a specific
  // open-source project and already carries the "not affiliated" clause for
  // that reason. Same reasoning as the other vs-checking-*-by-hand pages
  // above.
  'cra-evidence-desk/vs-matching-by-hand.html',
  // Compares against "a spreadsheet" -- a method every route operator
  // already has, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-atm-depot.html, which names a
  // specific equipment/processing vendor and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-a-spreadsheet pages above.
  'atm-route-margin/vs-a-spreadsheet.html',
  // Compares against "reviewing workflows by eye" -- a manual review habit
  // every GitHub Actions user already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-zizmor.html,
  // which names a specific open-source tool and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above.
  'actions-cache-poisoning-check/vs-checking-by-hand.html',
  // Compares against "reviewing workflows by eye" -- a manual review habit
  // every GitHub Actions user already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-zizmor.html,
  // which names a specific open-source tool and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above.
  'actions-secrets-inherit-check/vs-checking-by-hand.html',
  // Compares against "a flat price per window" -- a pricing method every
  // window cleaner already has, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-servicemonster.html,
  // which names a specific field-service platform and already carries the
  // "not affiliated" clause for that reason. Same reasoning as the other
  // generic-method pages above.
  'window-cleaning-bid-calculator/vs-a-flat-price-per-window.html',
  // Compares against "estimating egress in a spreadsheet" -- a method every
  // engineer pricing a workload already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-aws-pricing-calculator.html, vs-azure-pricing-calculator.html and
  // vs-google-cloud-pricing-calculator.html, which each name a specific
  // provider's own tool and already carry that provider's "not affiliated"
  // clause for that reason. Same reasoning as the other vs-a-spreadsheet
  // pages above.
  'cloud-egress-calculator/vs-a-spreadsheet.html',
  // Compares against "planning cuts by hand" -- a manual layout habit every
  // woodworking or sign shop already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-opticutter-and-cutlist-optimizer.html, which names two specific
  // hosted services and already carries the "not affiliated" clause for
  // that reason. Same reasoning as the other generic-method pages above.
  'cut-list-optimizer/vs-planning-cuts-by-hand.html',
  // Compares against "a flat $1,495 well-pump special" -- a generic
  // advertised price every well-service shop is shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-servicetitan.html, which names a specific field
  // service platform and already carries the "not affiliated" clause for
  // that reason. Same reasoning as the other flat-rate generic-method
  // pages above (e.g. shed-install-bid-calculator's).
  'well-pump-bid-calculator/vs-a-flat-well-pump-special.html',
  // Compares against a flat "$X a square foot" or "$28,000 for a 30x40"
  // post-frame special -- a generic advertised pricing habit the trade is
  // shopped against, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-jobtread.html, which names a
  // specific project-management platform and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // flat-rate generic-method pages above.
  'pole-barn-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against a flat "$X an acre" mulching rate -- a generic
  // advertised pricing habit the trade is shopped against, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-aspire.html, which names a specific field-service platform and
  // already carries the "not affiliated" clause for that reason. Same
  // reasoning as the other flat-rate generic-method pages above.
  'forestry-mulching-bid-calculator/vs-a-flat-price-per-acre.html',
  // Compares against "a flat $3/LF Christmas light special" -- a generic
  // advertised price every holiday lighting contractor is shopped against,
  // not a company or product this could be mistaken for. Distinct from
  // this venture's own vs-realgreen.html, which names a specific business-
  // management software vendor and already carries the "not affiliated"
  // clause for that reason. Same reasoning as the other flat-rate
  // generic-method pages above (e.g. well-pump-bid-calculator's).
  'holiday-light-bid-calculator/vs-a-flat-3-per-lf-special.html',
  // Compares against "eyeballing the copy-paste test yourself" -- the same
  // manual technique this checker automates, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-jobscan.html,
  // which names a specific resume-scanning service and already carries the
  // "not affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand/by-eye pages above.
  'ats-resume-checker/vs-checking-it-by-eye.html',
  // Compares against "a spreadsheet" -- a method every job seeker already
  // has, not a company or product this could be mistaken for.
  'job-application-tracker/vs-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a method every carrier filing their
  // own IFTA return already has, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-expressifta.html,
  // which names a specific paid preparation service and already carries the
  // "not affiliated" clause for that reason. Same reasoning as the other
  // vs-a-spreadsheet pages above.
  'ifta-quarterly-fuel-tax-calculator/vs-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a method every independent medical
  // courier pricing their own route already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-onfleet.html, which names a specific dispatch platform and already
  // carries the "not affiliated" clause for that reason. Same reasoning as
  // the other vs-a-spreadsheet pages above.
  'medical-courier-route-margin/vs-a-spreadsheet.html',
  // Compares against "a spreadsheet" -- a method every self-published author
  // tracking their own royalties already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-amazon-kdp-royalty-calculator.html, which names Amazon's own official
  // tool and already carries the "not affiliated" clause for that reason.
  // Same reasoning as the other vs-a-spreadsheet pages above.
  'kdp-royalty-calculator/vs-a-spreadsheet.html',
  // Compares against "a flat $499 delivery and setup special" -- a generic
  // advertised price every spa dealer is shopped against, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-jobber.html, which names a specific field-service platform and
  // already carries the "not affiliated" clause for that reason. Same
  // reasoning as the other flat-rate generic-method pages above (e.g.
  // well-pump-bid-calculator's).
  'hot-tub-bid-calculator/vs-a-flat-499-setup-special.html',
  // Compares against "eyeballing package.json by hand" -- the same manual
  // read-and-recognize habit this checker automates, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-socket.html, which names a specific commercial scanning service and
  // already carries the "not affiliated" clause for that reason. Same
  // reasoning as the other vs-checking-*-by-hand/by-eye pages above.
  'slopsquatting-check/vs-checking-package-names-by-eye.html',
  // Compares against tracking a hood-cleaning bid in a spreadsheet -- the
  // generic method, not a company or product this could be mistaken for.
  // The page names no vendor or competing calculator at all -- distinct
  // from this venture's own vs-hoodcleanpro.html and
  // vs-hoodcleaningdispatch.html, which do name products and carry their
  // own "not affiliated" clauses.
  'hood-cleaning-bid-calculator/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "a flat per-acre quote" -- a generic pricing method
  // every mapping pilot already has access to, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-dronedeploy.html, which names a specific reality-capture platform
  // and already carries the "not affiliated" clause for that reason. Same
  // reasoning as land-survey-bid-calculator's own
  // vs-a-flat-per-acre-quote.html.
  'drone-mapping-job-calculator/vs-a-flat-per-acre-quote.html',
  // Compares against "a flat $950/square metal-roof special" -- a generic
  // advertised price every metal-roofing crew is shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-acculynx.html, which names a specific estimating
  // platform and already carries the "not affiliated" clause for that
  // reason. Same reasoning as the other flat-rate generic-method pages
  // above (e.g. well-pump-bid-calculator's).
  'metal-roof-bid-calculator/vs-a-flat-950-per-square-special.html',
  // Compares against a flat "$X a square foot" refinishing rate -- a
  // generic advertised pricing habit the trade is shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-jobber.html, which names a specific field service
  // platform and already carries the "not affiliated" clause for that
  // reason. Same reasoning as the other flat-rate generic-method pages
  // above (e.g. pole-barn-bid-calculator's).
  'hardwood-refinishing-bid-calculator/vs-a-flat-price-per-square-foot.html',
  // Compares against a flat "$150 a light installed" special -- a generic
  // advertised pricing habit the trade is shopped against, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-aspire.html, which names a specific business-management
  // platform and already carries the "not affiliated" clause for that
  // reason. Same reasoning as the other flat-rate generic-method pages
  // above (e.g. hardwood-refinishing-bid-calculator's).
  'landscape-lighting-bid-calculator/vs-a-flat-150-per-light-special.html',
  // Compares against a flat "$2,800 a head" mini-split quote -- a generic
  // advertised pricing habit the trade is shopped against, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-servicetitan.html, which names a specific field service
  // platform and already carries the "not affiliated" clause for that
  // reason. Same reasoning as the other flat-rate generic-method pages
  // above (e.g. landscape-lighting-bid-calculator's).
  'mini-split-bid-calculator/vs-a-flat-2800-per-head-quote.html',
  // Compares against "a flat $395 removal fee" -- a generic advertised price
  // every wildlife-control shop is shopped against, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-pestpac.html, which names a specific field-service platform and
  // already carries the "not affiliated" clause for that reason. Same
  // reasoning as the other flat-rate generic-method pages above (e.g.
  // well-pump-bid-calculator's).
  'wildlife-exclusion-bid-calculator/vs-a-flat-395-removal-fee.html',
  // Compares against a flat "$400 a zone installed" special / "$2,400 for 6
  // zones" coupon -- a generic advertised pricing habit the trade is shopped
  // against, not a company or product this could be mistaken for. Distinct
  // from this venture's own vs-aspire.html, which names a specific business
  // management platform and already carries the "not affiliated" clause for
  // that reason. Same reasoning as the other flat-rate generic-method pages
  // above (e.g. landscape-lighting-bid-calculator's).
  'irrigation-install-bid-calculator/vs-a-flat-400-a-zone-special.html',
  // Compares against a flat "$2 a square foot" interior painting bid -- a
  // generic advertised pricing habit the trade is shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-paintscout.html, which names a specific
  // business-management platform and already carries the "not affiliated"
  // clause for that reason. Same reasoning as the other flat-rate
  // generic-method pages above (e.g. mini-split-bid-calculator's).
  'painting-bid-calculator/vs-a-flat-2-per-square-foot-bid.html',
  // Compares against "a flat burden-percentage rule of thumb" -- a generic
  // budgeting habit ("add 20-30% on top of wages") every small business
  // owner already has, not a company or product this could be mistaken
  // for. The page names no payroll or HR vendor at all.
  'employee-cost-calculator/vs-a-flat-burden-percentage.html',
  // Compares against "a flat per-vehicle price" (a posted "$180 sedan /
  // $220 SUV / $250 truck" list) -- a pricing habit every independent tint
  // shop already posts, not a company or product this could be mistaken
  // for. The page names no specific tint franchise, film brand, or
  // competing calculator at all. Same reasoning as this venture's sibling
  // vs-a-flat-*-price pages above (mobile-detailing-bid-calculator's
  // vs-a-flat-per-vehicle-price.html, pet-grooming-bid-calculator's
  // vs-a-flat-per-breed-price.html).
  'window-tinting-bid-calculator/vs-a-flat-per-vehicle-size-price.html',
  // Compares against "quoting from the vehicle's bare surface area" -- the
  // coverage-chart pricing habit every wrap shop is shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-shopvox.html, which does name a product and carries
  // its own "not affiliated" clause.
  'vehicle-wrap-bid-calculator/vs-quoting-from-bare-vehicle-surface-area.html',
  // Compares against a flat "$8 a stall" / "$400 for a 50-space lot"
  // striping special -- a generic advertised pricing habit the trade is
  // shopped against, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-saasphalt.html, which names a
  // specific estimating platform and already carries the "not affiliated"
  // clause for that reason. Same reasoning as the other flat-rate
  // generic-method pages above (e.g. mini-split-bid-calculator's).
  'parking-lot-striping-bid-calculator/vs-a-flat-8-per-stall-special.html',
  // Compares against a flat "10 cents a square foot" wash special -- a
  // generic advertised pricing habit the trade is shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-jobber.html and vs-gorilladesk.html, which name
  // specific field-service platforms and already carry the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // flat-rate generic-method pages above.
  'pressure-washing-bid-calculator/vs-a-flat-10-cents-a-square-foot-price.html',
  // Compares against "a flat per-guest price" -- dividing a past booking's
  // total by its own headcount and reusing the result as a rate, a pricing
  // habit every operator already reaches for, not a company or product
  // this could be mistaken for. The page names no marketplace or
  // competing calculator (distinct from this venture's own
  // vs-roaminghunger.html, which does and already carries the trademark
  // disclaimer for that reason).
  'food-truck-event-margin-calculator/vs-a-flat-per-guest-price.html',
  // Compares against "manually re-checking each dependency's license after
  // an update" -- a habit any developer already has, not a company or
  // product this could be mistaken for. This venture's own vs-fossa.html is
  // separately exempt-free (FOSSA is a named product) and carries the
  // trademark disclaimer. Same reasoning as flaky-test-finder's
  // vs-eyeballing-two-ci-logs-by-hand.html above.
  'license-drift-check/vs-manually-rechecking-licenses.html',
  // Compares against pricing purely by a flat per-square-foot rate -- a
  // generic estimating shortcut independent home inspectors reach for
  // absent a franchise's own fee schedule, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-franchise-fee-schedule.html, which is about the business decision of
  // joining a franchise rather than a pricing method, and does not name any
  // franchise brand either. Same reasoning as the other flat-rate
  // generic-method pages above.
  'home-inspection-fee-calculator/vs-a-flat-per-square-foot-rate.html',
  // Compares against reading a canonical tag in view-source -- a manual
  // habit any web developer already has, not a company or product this
  // could be mistaken for. This venture's own vs-screaming-frog.html is
  // separately exempt-free (Screaming Frog is a named product) and carries
  // the trademark disclaimer. Same reasoning as license-drift-check's
  // vs-manually-rechecking-licenses.html above.
  'canonical-tag-check/vs-checking-canonicals-by-view-source.html',
  // Compares against "building your own Faire payout spreadsheet" -- a
  // generic method every seller already has access to, not a company or
  // product this could be mistaken for. This venture's own vs-ankorstore.html
  // is separately exempt-free (Ankorstore is a named competitor marketplace)
  // and carries the trademark disclaimer; the two comparison pages are
  // deliberately different classes, same as cache-control-check's pairing
  // of vs-curl.html and vs-checking-headers-by-eye-in-devtools.html above.
  'faire-wholesale-calculator/vs-building-your-own-spreadsheet.html',
  // Compares against a flat coverage floor (--cov-fail-under and
  // equivalents) -- a generic CI-gating habit any project already has, not
  // a company or product this could be mistaken for. Distinct from this
  // venture's own vs-codecov.html, which names a specific hosted service
  // and already carries the trademark disclaimer.
  'coverage-drop-check/vs-a-flat-coverage-floor.html',
  // Compares against "a spreadsheet" -- a generic method every fleet owner
  // already has, not a company or product this could be mistaken for. The
  // page's own footer says so explicitly ("names no specific product").
  // Distinct from this venture's own vs-fleet-management-software.html,
  // which names a category of paid product and already carries its own
  // trademark-free framing. Same reasoning as the other vs-spreadsheet
  // pages above.
  'fleet-repair-or-replace-planner/vs-spreadsheet.html',
  // Compares against "holding this year's repair invoice up against a new
  // price" -- the default comparison every fleet owner already runs in their
  // head, not a company or product this could be mistaken for. The page
  // names no vendor or fleet-management platform (the venture's own
  // named-product comparison, vs-fleet-management-software, carries its own
  // framing already) and its copy opens by agreeing the repair-bill
  // comparison is a reasonable first filter. Same reasoning as the other
  // generic-method pages above.
  'fleet-repair-or-replace-planner/vs-comparing-the-repair-bill-to-a-new-price.html',
  // Compares against "working the formula out by hand with a datasheet and a
  // calculator app" -- the generic method every user of these electronics
  // calculators already has, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-omni-calculator.html, which
  // names a real calculator site and already carries the trademark
  // disclaimer via NOT_AFFILIATED; this page's own footer says explicitly
  // that it names no specific product or company. Same reasoning as the
  // other generic-method pages above.
  'ai-engineering-academy/vs-doing-the-math-by-hand.html',
  // Compares against "grepping requirements.txt/pip.conf for
  // --extra-index-url and skimming package.json for an unscoped name" -- the
  // manual habit most developers already have, not a company or product
  // this could be mistaken for. The page names no specific vendor or
  // scanning service; its sibling comparison page, vs-socket.html, names a
  // real product and carries its own trademark disclaimer separately. Same
  // reasoning as the other manual-method pages above
  // (vendor-change-watch/vs-checking-vendor-pages-by-hand.html in
  // particular).
  'dependency-confusion-check/vs-checking-configs-by-hand.html',
  // Compares against "a flat rate per square foot" -- a generic pricing
  // method every janitorial contractor already has access to, not a
  // company or product this could be mistaken for. Same reasoning as
  // asphalt-driveway-pave-bid-calculator's own flat-rate exemption above.
  'janitorial-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "reading each vendor's pricing page and estimating
  // index storage by hand" -- the generic method every engineer sizing a
  // vector database already uses, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-pinecone.html, which
  // names Pinecone specifically and already carries the trademark
  // disclaimer; this page's worked example uses "Provider A" and "Provider
  // B" and names no real vendor. Same reasoning as the other generic-method
  // pages above.
  'vector-db-cost-calculator/vs-doing-the-math-yourself.html',
  // Compares against reusing one downloaded or bookmarked chargeback
  // checklist for every dispute reason -- a habit any seller fighting a
  // chargeback already has, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-chargeflow.html,
  // which names Chargeflow specifically and already carries the trademark
  // disclaimer. Same reasoning as the other generic-method pages above.
  'chargeback-evidence-packet/vs-a-generic-dispute-checklist.html',
  // Compares against "a flat per-zone rate" -- a generic pricing method
  // every irrigation contractor already has access to, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-jobber.html, which names Jobber specifically and already carries the
  // trademark disclaimer. Same reasoning as janitorial-bid-calculator's own
  // flat-rate exemption above.
  'irrigation-winterization-bid-calculator/vs-a-flat-per-zone-rate.html',
  // Compares against "tracking 1099 vendors in a spreadsheet" -- the
  // generic method most small-business bookkeepers already use, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-track1099.html, which names Track1099 (an Avalara
  // product) specifically and already carries the trademark disclaimer.
  // Same reasoning as the other generic-method pages above.
  '1099-vendor-tracker/vs-tracking-vendors-in-a-spreadsheet.html',
  // Compares against "opening each of ten AI-crawler operators' own docs
  // pages and cross-referencing each token against robots.txt by eye" -- the
  // manual habit any site owner deciding on AI-crawler access already has,
  // not a company or product this could be mistaken for. Its sibling
  // comparison page, vs-known-agents.html, names a real product (Known
  // Agents, formerly Dark Visitors) and already carries the trademark
  // disclaimer separately. Same reasoning as the other manual-method pages
  // above (dependency-confusion-check/vs-checking-configs-by-hand.html in
  // particular).
  'ai-crawler-access-check/vs-checking-each-crawlers-docs-by-hand.html',
  // Compares against "normalizing a 3PL rate-card quote yourself in a
  // spreadsheet" -- the generic method anyone comparing a fulfillment quote
  // already reaches for, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-extensiv.html and
  // vs-shipbob.html, which name real products and already carry the
  // trademark disclaimer; this page names no vendor or software product
  // (the test file asserts none of the sibling pages' named products
  // appear). Same reasoning as the other generic-method pages above.
  '3pl-quote-normalizer/vs-normalizing-a-quote-in-a-spreadsheet.html',
  // Compares against "a flat per-foot rate card" -- a generic pricing
  // method every ice dam removal contractor already has access to, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-jobber.html, which names Jobber specifically and
  // already carries the trademark disclaimer. Same reasoning as
  // irrigation-winterization-bid-calculator's own flat-rate exemption
  // above.
  'ice-dam-removal-bid-calculator/vs-a-flat-rate-per-linear-foot.html',
  // Compares against "a flat price per house square foot" -- the generic
  // shorthand quoting habit ("$X a square foot") every reroofing customer
  // and many contractors already reach for, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-jobber.html
  // and vs-acculynx.html, which name real products and already carry the
  // trademark disclaimer. Same reasoning as asphalt-sealcoat-bid-calculator's
  // own flat-per-square-foot exemption above.
  'roofing-bid-calculator/vs-a-flat-price-per-house-square-foot.html',
  // Compares against "multiplying total monthly tokens by one headline
  // blended $/M rate" -- the generic estimating shortcut any developer
  // sizing an LLM API bill already reaches for, not a company or product
  // this could be mistaken for. The worked example uses the calculator's
  // own preloaded "Anthropic (Claude)" example rates, the same illustrative
  // placeholders index.html already labels as examples, not a claim about
  // Anthropic's or any vendor's current pricing. Same reasoning as the
  // other generic-method pages above.
  'llm-api-pricing-calculator/vs-a-blended-per-token-rate.html',
  // Compares against "tracking grant deadlines in a spreadsheet" -- the
  // generic method most small-nonprofit coordinators already use, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-instrumentl.html, which names Instrumentl specifically
  // and already carries the trademark disclaimer. Same reasoning as the
  // other generic-method pages above.
  'grant-deadline-tracker/vs-tracking-deadlines-in-a-spreadsheet.html',
  // Compares against "a flat rate for every call" -- the generic quoting
  // habit ("$X for a lockout, day or night") every mobile locksmith is
  // shopped against, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-jobber.html, vs-workiz.html, and
  // vs-housecall-pro.html, which name real products and already carry the
  // trademark disclaimer. Same reasoning as the other generic-method pages
  // above.
  'locksmith-bid-calculator/vs-a-flat-rate-for-every-call.html',
  // Compares against "running curl -sI -L or reading DevTools' Network
  // panel by hand" -- generic tools and habits any developer already has,
  // not a company or product this could be mistaken for. Distinct from
  // this venture's own vs-httpstatus-io.html, which names a real hosted
  // service and already carries the trademark disclaimer. Same reasoning
  // as cache-control-check's vs-checking-headers-by-eye-in-devtools.html
  // and source-map-leak-check's vs-checking-devtools-by-hand.html above.
  'redirect-chain-check/vs-checking-a-chain-by-hand.html',
  // Compares against "averaging margins in a spreadsheet" -- the generic
  // =AVERAGE() formula an operator builds by hand, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-marginedge.html, which names MarginEdge specifically and already
  // carries the trademark disclaimer. Same reasoning as the other
  // generic-method pages above.
  'menu-engineering-calculator/vs-averaging-margins-in-a-spreadsheet.html',
  // Compares against "a flat per-room rate" -- the generic quoting habit
  // ("$X a room, however long it takes") every independent home stager is
  // shopped against, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-hutch.html and vs-honeybook.html,
  // which name real products and already carry the trademark disclaimer.
  // Same reasoning as the other generic-method pages above.
  'home-staging-bid-calculator/vs-a-flat-per-room-rate.html',
  // Compares against "reading a Dockerfile by hand" -- a manual review habit
  // every Dockerfile author already has, not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-gitleaks.html, which
  // names a specific open-source tool and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above (e.g. docker-base-image-pin-check's).
  'docker-build-secrets-check/vs-reading-a-dockerfile-by-hand.html',
  // Compares against "reading Kubernetes' own Deprecated API Migration
  // Guide and cross-checking a manifest by hand" -- a manual review habit
  // any platform engineer already has, not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-pluto.html, which
  // names a specific open-source tool and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above (e.g. docker-build-secrets-check's).
  'k8s-deprecated-api-check/vs-checking-the-migration-guide-by-hand.html',
  // Compares against "a flat pump-swap special" -- the generic coupon
  // pricing ($X, any sump pump, done) that swap specials are shopped
  // against, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-servicetitan.html, which names
  // ServiceTitan specifically and already carries the trademark
  // disclaimer. Same reasoning as the other generic-method pages above.
  'sump-pump-bid-calculator/vs-a-flat-pump-swap-special.html',
  // Compares against "just checking whether the invoice cleared the bid" --
  // the generic before/after gut check every contractor already runs
  // without any tool, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-quickbooks-job-costing.html, which
  // names QuickBooks/Intuit specifically and already carries the trademark
  // disclaimer. Same reasoning as the other generic-method pages above.
  'job-margin-variance/vs-checking-if-you-still-made-money.html',
  // Compares against "a flat pump special" -- the generic coupon pricing
  // ($X, any tank, pumped) that septic pump specials are shopped against,
  // not a company or product this could be mistaken for. Distinct from
  // this venture's own vs-servicecore.html, which names ServiceCore
  // specifically and already carries the trademark disclaimer.
  'septic-pumping-bid-calculator/vs-a-flat-pump-special.html',
  // Compares against "a flat per-inch rate" -- the generic "$X a diameter
  // inch" quoting habit tree services are shopped against, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-singleops.html, which names SingleOps specifically and already
  // carries the trademark disclaimer.
  'tree-service-bid-calculator/vs-a-flat-per-inch-rate.html',
  // Compares against "a flat rate per lineal foot" -- the generic "$X a
  // lineal foot" quoting habit ramp builders are shopped against, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-jobber.html, which names Jobber specifically and
  // already carries the trademark disclaimer.
  'wheelchair-ramp-bid-calculator/vs-a-flat-rate-per-lineal-foot.html',
  // Compares against "a flat $1,800 installed" patio door special -- a
  // generic pricing method every window/door crew already has access to,
  // not a company or product this could be mistaken for. The page's own
  // footer says so explicitly ("common, honest shortcut"). Same reasoning
  // as the other generic-method pages above. Distinct from this venture's
  // own vs-jobber.html, which names Jobber specifically and already
  // carries the trademark disclaimer.
  'patio-door-bid-calculator/vs-a-flat-installed-price.html',
  // Compares against "a sticky note or mental checklist" -- a manual
  // tracking habit any contractor already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-jobtread.html, which names JobTread specifically and already
  // carries the trademark disclaimer.
  'contractor-bid-readiness/vs-a-sticky-note-checklist.html',
  // Compares against "picking a rate off the going local price" -- the
  // generic habit of copying a nearby studio's posted per-lesson price, not
  // a company or product this could be mistaken for. Distinct from this
  // venture's own vs-mymusicstaff.html, which names My Music Staff
  // specifically and already carries the trademark disclaimer.
  'music-lesson-break-even/vs-picking-a-rate-off-the-going-local-price.html',
  // Compares against "grepping the codebase by hand" -- a manual audit
  // habit any developer already has, not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-dotenv-linter.html,
  // which names a specific open-source tool and already carries the "not
  // affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand pages above (e.g. docker-build-secrets-check's).
  'env-example-drift-check/vs-grepping-the-codebase-by-hand.html',
  // Compares against "ranking dishes by food cost percentage" -- the
  // ordinary per-dish metric every restaurant kitchen already tracks off
  // its own recipe cards and POS reports, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-marginedge.html, which names MarginEdge specifically and already
  // carries the trademark disclaimer.
  'menu-engineering-calculator/vs-ranking-by-food-cost-percent.html',
  // Compares against "a flat rate per square foot" -- the generic "$X a
  // square foot installed" quoting habit hardscape contractors are shopped
  // against, not a company or product this could be mistaken for. Distinct
  // from this venture's own vs-aspire.html, which names Aspire specifically
  // and already carries the trademark disclaimer.
  'paver-patio-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "reading the migration file by hand" -- a manual
  // review habit any developer applying a schema change already has, not
  // a company or product this could be mistaken for. Distinct from this
  // venture's own vs-squawk.html, which names a specific open-source
  // linter and already carries the "not affiliated" clause for that
  // reason. Same shape as docker-build-secrets-check's
  // vs-reading-a-dockerfile-by-hand.html.
  'sql-migration-lock-check/vs-reading-the-migration-by-hand.html',
  // Compares against "diffing package-lock.json by hand" -- a manual
  // review habit any developer already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-socket.html,
  // which names Socket, Inc. specifically and already carries the
  // trademark disclaimer. Same shape as the other vs-*-by-hand pages above.
  'npm-lifecycle-script-check/vs-diffing-package-lock-by-hand.html',
  // Compares against "reading values.yaml next to values.schema.json by
  // eye" -- a manual review habit any chart author already has, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-helm-lint.html, which names a specific tool (Helm)
  // and already carries the "not affiliated" clause for that reason. Same
  // shape as sql-migration-lock-check's vs-reading-the-migration-by-hand.html.
  'helm-values-schema-check/vs-checking-it-by-eye.html',
  // Compares against "a flat 3-hour, $500 package" -- the generic
  // flat-rate booking pattern any mobile photo booth operator already
  // uses, not a company or product this could be mistaken for. Distinct
  // from this venture's own vs-photobooth-supply-co.html, which names
  // Photobooth Supply Co specifically and already carries the "not
  // affiliated" clause for that reason.
  'photo-booth-event-quote/vs-a-flat-package-price.html',
  // Compares against "a flat rate per square foot" -- a common pricing
  // habit any outdoor-living contractor already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-buildxact.html, which names a specific estimating platform and
  // already carries the trademark disclaimer.
  'pergola-bid-calculator/vs-a-flat-45-per-square-foot-special.html',
  // Compares against "a flat $249 windshield coupon" -- a common
  // advertised rate any auto-glass shop already runs, not a company or
  // product this could be mistaken for.
  'auto-glass-bid-calculator/vs-a-flat-249-windshield-coupon.html',
  // Compares against "a flat rate per linear foot" -- the generic
  // per-foot quoting habit hardscape and retaining-wall contractors are
  // shopped against, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-aspire.html, which names Aspire
  // specifically and already carries the trademark disclaimer.
  'retaining-wall-bid-calculator/vs-a-flat-140-per-linear-foot-rate.html',
  // Compares against "a flat rate per square" -- a common pricing habit any
  // siding contractor already has, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-jobnimbus.html, which
  // names JobNimbus specifically and already carries the trademark
  // disclaimer.
  'siding-bid-calculator/vs-a-flat-rate-per-square.html',
  // Compares against "checking it by eye" -- reading view-source and
  // comparing a page's JSON-LD against its rendered text by hand, a manual
  // habit any developer already has, not a company or product this could be
  // mistaken for. Same shape as source-map-leak-check's
  // vs-checking-devtools-by-hand.html exemption above.
  'structured-data-drift-check/vs-checking-it-by-eye.html',
  // Compares against reading the workflow YAML by hand -- a manual review
  // habit any repository maintainer already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-openssf-scorecard.html, which names OpenSSF Scorecard specifically
  // and already carries the "not affiliated" disclaimer.
  'actions-permissions-check/vs-reading-the-workflow-yaml-by-hand.html',
  // Compares against reading the workflow YAML by hand -- a manual review
  // habit any repository maintainer already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-zizmor.html, which names zizmor specifically and already carries the
  // "not affiliated" disclaimer.
  'actions-artifact-poisoning-check/vs-reading-the-workflow-yaml-by-hand.html',
  // Compares against "reading the file by hand" -- a manual review habit
  // every developer already has, not a company or product this could be
  // mistaken for. Same reasoning as the other vs-reading-*-by-hand pages
  // above (e.g. docker-build-secrets-check's, sql-migration-lock-check's).
  'hidden-unicode-check/vs-reading-the-file-by-hand.html',
  // Compares against "comparing the buyout price to fair market value" -- a
  // generic sanity check any lessee already runs against a payoff letter,
  // not a company or product this could be mistaken for. Distinct from this
  // venture's own vs-lendzero.html and vs-crest-capital.html, which name
  // specific competitors and already carry the trademark disclaimer.
  'equipment-lease-buyout-calculator/vs-comparing-the-buyout-price-to-fair-market-value.html',
  // Compares against "a flat $1,195 radon special" -- a common advertised
  // rate any radon mitigation contractor already runs, sized for the
  // smallest single-suction basement job, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-oneradon.html, which names Sun Nuclear's OneRADON software
  // specifically and already carries the trademark disclaimer.
  'radon-mitigation-bid-calculator/vs-a-flat-1195-radon-special.html',
  // Compares against "a flat price-per-watt quote" -- a common dollars-per-
  // watt rate any solar installer already quotes from, sized for the roof
  // and panel condition the rate was set on, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-aurora-solar.html, which names Aurora Solar specifically and already
  // carries the trademark disclaimer.
  'solar-pv-bid-calculator/vs-a-flat-price-per-watt.html',
  // Compares against "re-reading a post and checking it by eye for a
  // disclosure" -- a manual habit any blogger already has, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-post-affiliate-pro.html, which names Post Affiliate Pro
  // specifically and already carries the trademark disclaimer.
  'affiliate-disclosure-checker/vs-checking-a-post-by-eye.html',
  // Compares against "tracking payouts in a spreadsheet" -- a generic method
  // every Poshmark seller already has access to, not a company or product
  // this could be mistaken for. The page's own footer says so explicitly
  // ("names no specific product"). Same reasoning as the other
  // vs-spreadsheet / by-hand pages above (e.g. whatnot-seller-payout's).
  'poshmark-fee-calculator/vs-tracking-poshmark-payouts-in-a-spreadsheet.html',
  // Compares against "reading the command/args/env blocks by hand before
  // approving a server" -- a manual habit anyone reviewing an MCP config
  // already has, not a company or product this could be mistaken for.
  // This venture names no named-product comparison at all.
  'mcp-config-risk-check/vs-reading-the-config-by-hand.html',
  // Compares against "reviewing an invoice by eye" -- a manual review habit
  // any shipper, broker, or AP clerk already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-trax.html and vs-cass.html, which name specific freight audit and
  // payment providers and already carry the "not affiliated" disclaimer.
  'freight-accessorial-auditor/vs-reviewing-an-invoice-by-eye.html',
  // Compares against "reviewing 3PL invoices in a spreadsheet" -- a manual review habit any brand with a 3PL already has, not a
  // company or product this could be mistaken for. The page names no product or company.
  '3pl-invoice-audit-checker/vs-reviewing-3pl-invoices-in-a-spreadsheet.html',
  // Compares against "a trading spreadsheet" -- a manual modelling habit any challenge entrant already has, not a company or
  // product this could be mistaken for. The page names no product or company.
  'prop-firm-challenge-calculator/vs-a-trading-spreadsheet.html',
  // Compares against "reading the SKILL.md by hand" -- a manual review
  // habit every skill author already has, not a company or product this
  // could be mistaken for. Same reasoning as the other vs-reading-*-by-hand
  // pages above (e.g. hidden-unicode-check's, docker-build-secrets-check's).
  'skill-manifest-check/vs-reading-the-skill-by-hand.html',
  // Compares against "deciding tip-pool eligibility in a staff meeting" --
  // a verbal, ungoverned habit any restaurant or bar already has, not a
  // company or product this could be mistaken for.
  'tip-pool-compliance-calculator/vs-guessing-from-a-staff-meeting.html',
  // Compares against "a plain DNS lookup" (dig, or any generic online CAA
  // record viewer) -- a manual method and a genre of interchangeable free
  // utilities, not one specific company or product this could be mistaken
  // for. The page names no specific lookup tool or brand.
  'caa-record-check/vs-a-plain-dns-lookup.html',
  // Compares against "assembling a press kit by hand in a document editor"
  // -- a generic class of tool (word processors, slide decks) any artist
  // already has access to, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-presskit.html, which names a
  // real hosted service and already carries the "not affiliated" disclaimer.
  'epk-generator/vs-assembling-one-by-hand.html',
  // Compares against "a flat $8,000 generator special" -- the postcard/
  // search-result pricing habit every generator installer is shopped
  // against, not a company or product this could be mistaken for. Distinct
  // from this venture's own vs-servicetitan.html, which does name a
  // product and carries its own "not affiliated" clause.
  'standby-generator-bid-calculator/vs-a-flat-8000-generator-special.html',
  // Compares against "tracking Depop sales in a spreadsheet" -- a generic
  // method every Depop seller already has access to, not a company or
  // product this could be mistaken for. The page's own footer says so
  // explicitly ("names no specific product"). This venture's calculator
  // still names Depop itself (the platform whose fee schedule it computes
  // against) and separately carries the trademark disclaimer for that
  // reason; the two clauses are independent. Same reasoning as the other
  // vs-spreadsheet pages above (e.g. whatnot-seller-payout's).
  'depop-fee-calculator/vs-tracking-depop-sales-in-a-spreadsheet.html',
  // Compares against manually reviewing Google Play Console's Data safety
  // warnings, or waiting for a policy reviewer to flag a mismatch -- a
  // generic, ungoverned habit any Android developer already has, not a
  // company or product this could be mistaken for. This venture's checker
  // still names Google Play, Play Console, Android and Data safety (the
  // platform whose declarations it checks against) and separately carries
  // the trademark disclaimer for that reason; the two clauses are
  // independent. Same reasoning as supabase-rls-check's
  // vs-manually-checking-the-dashboard.html above.
  'android-data-safety-check/vs-manually-reviewing-play-console-warnings.html',
  // Compares against "reading CODEOWNERS by eye" -- a manual review habit
  // any repository maintainer already has, not a company or product this
  // could be mistaken for. This venture's checker still names GitHub (the
  // platform whose CODEOWNERS format it checks) and separately carries the
  // trademark disclaimer for that reason; the two clauses are independent.
  // Same reasoning as branch-protection-drift-check's
  // vs-manually-checking-settings.html above.
  'codeowners-shadow-check/vs-reading-codeowners-by-eye.html',
  // Compares against the flat "8-10%" rule of thumb some campaign creators
  // use to estimate Kickstarter's combined fees -- a generic, one-line
  // estimate any campaign creator already has access to, not a company or
  // product this could be mistaken for. This venture's calculator still
  // names Kickstarter (the platform whose published fee schedule it
  // computes against) and separately carries the trademark disclaimer for
  // that reason; the two clauses are independent. Same reasoning as the
  // other flat-rate/rule-of-thumb pages above (e.g.
  // stair-lift-bid-calculator's vs-a-flat-rate-stair-lift-special.html).
  'kickstarter-fee-calculator/vs-the-flat-8-10-percent-rule-of-thumb.html',
  // Compares against guessing from Obsidian's own guidelines, or waiting
  // for a community plugin reviewer to comment -- a generic, ungoverned
  // habit any plugin author already has, not a company or product this
  // could be mistaken for. This venture's checker still names Obsidian and
  // Dynalist Inc. (the platform whose review guidelines it checks against)
  // and separately carries the trademark disclaimer for that reason; the
  // two clauses are independent. Same reasoning as
  // skill-manifest-check's vs-reading-the-skill-by-hand.html above.
  'obsidian-plugin-review-check/vs-guessing-or-waiting-for-review.html',
  // Compares against "quoting one flat seasonal rate for every driveway
  // from memory" -- a pricing habit any snow contractor already has, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-aspire.html, which names Aspire specifically and
  // already carries the trademark disclaimer.
  'snow-removal-bid-calculator/vs-a-flat-seasonal-rate.html',
  // Compares against "quoting one flat project rate regardless of usage" --
  // a pricing habit any freelance narrator already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-voices-com.html, which names a real marketplace and already carries
  // the trademark disclaimer.
  'voiceover-project-rate-calculator/vs-a-flat-rate-regardless-of-usage.html',
  // Compares against "working out your 415(c) after-tax headroom by hand in a
  // spreadsheet or from memory" -- a generic method every saver evaluating
  // this strategy already has access to, not a company or product this could
  // be mistaken for. The page's own footer says so explicitly ("names no
  // specific plan provider"). Same reasoning as the other vs-doing-it-by-hand
  // / vs-a-spreadsheet pages above (e.g. depreciation-recapture-calculator's).
  'mega-backdoor-roth-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out a Trump Account's growth and withdrawal
  // tax by hand -- a generic method every parent evaluating one already has
  // access to, not a company or product this could be mistaken for. Names
  // no vendor, brokerage, or 529 plan provider. Same reasoning as
  // mega-backdoor-roth-calculator's own vs-doing-the-math-by-hand.html
  // right above.
  'trump-account-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the Section 174A R&E catch-up election by
  // hand -- a generic method every filer or preparer evaluating it already
  // has access to, not a company or product this could be mistaken for.
  // Names no accounting firm, software vendor, or tax-prep product. Same
  // reasoning as trump-account-calculator's own
  // vs-doing-the-math-by-hand.html right above.
  'section-174a-catchup-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out bonus depreciation and Section 179 by
  // hand -- a generic method every business owner or preparer evaluating
  // an equipment purchase already has access to, not a company or product
  // this could be mistaken for. Names no accounting firm, software vendor,
  // or tax-prep product. Same reasoning as section-174a-catchup-calculator's
  // own vs-doing-the-math-by-hand.html right above.
  'bonus-depreciation-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the SALT deduction cap phase-out by
  // hand -- a generic method every itemizing filer or preparer already
  // has access to, not a company or product this could be mistaken for.
  // Names no accounting firm, software vendor, or tax-prep product. Same
  // reasoning as bonus-depreciation-calculator's own
  // vs-doing-the-math-by-hand.html right above.
  'salt-cap-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the two 2026 charitable-giving deduction
  // paths by hand -- a generic method every donor or preparer already has
  // access to, not a company or product this could be mistaken for. Names
  // no accounting firm, software vendor, or tax-prep product. Same
  // reasoning as salt-cap-calculator's own vs-doing-the-math-by-hand.html
  // right above.
  'charitable-deduction-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the OBBBA 90% gambling-loss deduction cap
  // by hand -- a generic method every gambler or preparer already has
  // access to, not a company or product this could be mistaken for. Names
  // no accounting firm, software vendor, or tax-prep product. Same
  // reasoning as charitable-deduction-calculator's own
  // vs-doing-the-math-by-hand.html right above.
  'gambling-loss-deduction-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the 2026 federal estate tax exclusion by
  // hand -- a generic method every estate planning attorney, CPA, or
  // individual already has access to, not a company or product this could
  // be mistaken for. Names no law firm, software vendor, or tax-prep
  // product. Same reasoning as charitable-deduction-calculator's own
  // vs-doing-the-math-by-hand.html right above.
  'estate-tax-exemption-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the excess business loss limitation by
  // hand -- a generic method every business owner or preparer already
  // has access to, not a company or product this could be mistaken for.
  // Names no accounting firm, software vendor, or tax-prep product. Same
  // reasoning as charitable-deduction-calculator's own
  // vs-doing-the-math-by-hand.html right above.
  'excess-business-loss-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the QSBS exclusion by hand -- a generic
  // method every shareholder or preparer already has access to, not a
  // company or product this could be mistaken for. Names no accounting
  // firm, law firm, or tax-prep product. Same reasoning as
  // excess-business-loss-calculator's own vs-doing-the-math-by-hand.html
  // right above.
  'qsbs-exclusion-calculator/vs-doing-the-math-by-hand.html',
  // Compares against reading a security.txt file and checking it by eye --
  // a generic method anyone with a text editor already has, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-securitytxt-org-generator.html, which names a real site and
  // already carries its own non-affiliation disclaimer.
  'security-txt-check/vs-checking-it-by-eye.html',
  // Compares against working out the Child Tax Credit by hand -- a generic
  // method every parent or preparer already has access to, not a company
  // or product this could be mistaken for. Names no tax-prep firm or
  // software vendor. Same reasoning as qsbs-exclusion-calculator's own
  // vs-doing-the-math-by-hand.html above.
  'child-tax-credit-calculator/vs-doing-the-math-by-hand.html',
  // Compares against working out the EITC by hand -- a generic method
  // every filer or preparer already has access to, not a company or
  // product this could be mistaken for. Names no tax-prep firm or
  // software vendor. Same reasoning as child-tax-credit-calculator's own
  // vs-doing-the-math-by-hand.html above.
  'eitc-calculator/vs-doing-the-math-by-hand.html',
  // Compares against "assembling one by hand in a document editor" -- a
  // generic method (a word processor or slide deck) every creator already
  // has access to, not a company or product this could be mistaken for.
  // The page's own footer says so explicitly ("names no specific document
  // editor, product, or company"). This venture's own vs-kitly.html names
  // a real platform and already carries the trademark disclaimer
  // separately; the two comparison pages are deliberately different
  // classes, same shape as epk-generator's own by-hand page.
  'influencer-media-kit-generator/vs-assembling-one-by-hand.html',
  // Compares against "picking a round salary number" -- the manual habit
  // every S-corp owner without a paid report already has (a figure that
  // sounds reasonable, matches a peer, or rolls last year's number forward),
  // not a company or product this could be mistaken for. The page's own
  // "Common questions" section says so explicitly. Distinct from this
  // venture's own vs-rcreports-and-a-paid-valuation-report.html, which names
  // RCReports specifically and already carries the trademark disclaimer.
  's-corp-reasonable-compensation-calculator/vs-picking-a-round-number.html',
  // Compares against "a flat $2,999 special" -- the water-surface pricing
  // habit every vinyl-liner crew is shopped against, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-jobber.html, which does name a product and carries its own "not
  // affiliated" clause.
  'vinyl-liner-bid-calculator/vs-a-flat-2999-special.html',
  // Compares against "a flat per-square-foot special" -- the yard-sign and
  // Facebook-post pricing habit every sod crew is shopped against, not a
  // company or product this could be mistaken for. Same shape as this
  // venture's own vinyl-liner sibling above; distinct from vs-aspire.html,
  // which does name a product and carries its own "not affiliated" clause.
  'sod-install-bid-calculator/vs-a-flat-per-square-foot-special.html',
  // Compares against "a flat $55-a-square-foot special" -- the yard-sign
  // pricing habit every porch/lanai crew is shopped against, not a company
  // or product this could be mistaken for. Same shape as the sod-install
  // and vinyl-liner siblings above; distinct from this venture's own
  // vs-buildxact.html, which does name a product and carries its own "not
  // affiliated" clause.
  'screened-porch-bid-calculator/vs-a-flat-55-a-square-foot-special.html',
  // Compares against "manually checking each exports target by eye" -- the
  // habit every package.json author already has, not a company or product
  // this could be mistaken for. The page's own first paragraph says so
  // ("Names no specific product or company") and its own test pins that
  // sentence, same shape as branch-protection-drift-check's and
  // source-map-leak-check's by-hand pages above.
  'package-exports-drift-check/vs-manually-checking-exports-targets.html',
  // Compares against "doing the trip math yourself" -- a mental-estimate
  // habit every mobile notary already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-notarygadget.html, which names NotaryGadget specifically and
  // carries the trademark disclaimer.
  'notary-trip-quote/vs-doing-the-trip-math-yourself.html',
  // Compares against "tracking grants in a spreadsheet" -- a hand-maintained
  // habit every small nonprofit already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-granthub.html,
  // which names GrantHub/Foundant specifically and carries the trademark
  // disclaimer.
  'grant-reporting-tracker/vs-tracking-grants-in-a-spreadsheet.html',
  // Compares against "doing the cost math yourself" -- a mental estimate
  // every laundromat and pickup-and-delivery operator already does, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-cents.html, which names Cents specifically and carries
  // the trademark disclaimer.
  'wash-and-fold-price-calculator/vs-doing-the-cost-math-yourself.html',
  // Compares against "guessing a flat rate" -- copying a round CPM figure
  // from a blog post or a competitor's public rate card, a pricing habit
  // every newsletter operator already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-paved.html,
  // which names Paved specifically and carries the trademark disclaimer.
  'newsletter-sponsorship-rate-calculator/vs-guessing-a-flat-rate.html',
  // Compares against "looking up the density-to-class table yourself" -- a
  // manual lookup habit any shipper already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-smc3-fastclass.html, which names SMC³/FastClass specifically and
  // carries the trademark disclaimer.
  'ltl-freight-class-estimator/vs-looking-up-the-class-table-yourself.html',
  // Compares against "building your own bid spreadsheet" -- a hand-built
  // sheet habit any shop already has, not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-jobber.html, which
  // names Jobber specifically and carries the trademark disclaimer.
  'sewer-hydrojet-bid-calculator/vs-building-your-own-spreadsheet.html',
  // Compares against "reading the workflow YAML by hand" -- a manual review
  // habit any maintainer already has, not a company or product this could
  // be mistaken for. Same reasoning as actions-permissions-check's and
  // actions-artifact-poisoning-check's own pages of the same name. Distinct
  // from this venture's own vs-openssf-scorecard.html, which names OpenSSF
  // Scorecard specifically and carries the trademark disclaimer.
  'pinned-actions-check/vs-reading-the-workflow-yaml-by-hand.html',
  // Compares against "tracking sales in a spreadsheet" -- the hand-built
  // rate/minimum/local-pickup worksheet every Facebook Marketplace seller
  // already has, not a company or product this could be mistaken for. The
  // page's own copy says so explicitly ("names no specific product -- it
  // compares against the generic method of tracking these numbers in a
  // spreadsheet, not a competing calculator"). Registering this closes a
  // gap that had surface-budget.mjs reporting "room for 1 more
  // generic-method page" on a venture that (as of this same window) already
  // had two: this page, and vs-doing-the-fee-math-by-hand.html below, added
  // independently by a concurrent session that read the same false signal
  // and, unlike this fix, took it as license to add a second page rather
  // than correct the classification. See that entry's own comment, and the
  // GENERIC_BUDGET_OVERRIDES entry for this venture, for why both survive
  // rather than one being removed.
  'facebook-marketplace-fee-calculator/vs-tracking-facebook-marketplace-sales-in-a-spreadsheet.html',
  // Compares against "doing the fee math by hand" -- mental arithmetic every
  // seller already does, not a company or product this could be mistaken
  // for. Distinct from this venture's own
  // vs-tracking-facebook-marketplace-sales-in-a-spreadsheet.html above (a
  // spreadsheet formula) -- the same "no formula at all" vs. "a formula with
  // specific gaps" pair of angles GENERIC_BUDGET_OVERRIDES already
  // recognizes for overtime-pay-calculator, shopify-fee-calculator,
  // sign-language-interpreter-rate-calculator,
  // apparel-decoration-price-calculator, atm-route-margin and
  // fleet-repair-or-replace-planner.
  'facebook-marketplace-fee-calculator/vs-doing-the-fee-math-by-hand.html',
  // Compares against "a flat rate per square foot" -- the "$8 a square
  // foot" quoting habit every masonry contractor is shopped against, not
  // a company or product this could be mistaken for. The page names no
  // vendor or competing calculator at all -- distinct from this venture's
  // own vs-quoteiq.html, which does name a product and carries its own
  // "not affiliated" clause. Same shape as asphalt-sealcoat-bid-calculator's
  // vs-a-flat-per-square-foot-price.html.
  'tuckpointing-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "reading the hooks config by eye" -- a manual review
  // habit anyone trusting a Claude Code hooks configuration already has,
  // not a company or product this could be mistaken for. Same reasoning as
  // the other vs-reading-*-by-hand/-by-eye pages above (e.g.
  // mcp-config-risk-check's, skill-manifest-check's). This venture names no
  // named-product comparison at all.
  'claude-code-hooks-security-check/vs-reading-the-hooks-config-by-eye.html',
  // Compares against "checking each package on PyPI by hand" -- a manual
  // review habit any maintainer or reviewer already has, not a company or
  // product this could be mistaken for. This venture names no named-product
  // comparison at all (its why-not-just page discusses PyPA's own
  // pypi-attestations verify CLI, which is a first-party tool comparison,
  // not a competing product, and predates this generic-method page).
  'pypi-provenance-check/vs-checking-each-package-on-pypi-by-hand.html',
  // Compares against "checking each package on npmjs.com by hand" -- a
  // manual review habit any maintainer or reviewer already has, not a
  // company or product this could be mistaken for. This page names no
  // named-product comparison at all (the venture's own vs-socket.html is a
  // separate page for that). Same reasoning as this venture's PyPI sibling
  // immediately above.
  'npm-provenance-check/vs-checking-each-package-on-npmjs-by-hand.html',
  // Compares against tracking MRR movements in a spreadsheet -- a habit
  // any SaaS operator without a subscription-analytics platform already
  // has, not a company or product this could be mistaken for.
  'mrr-waterfall-calculator/vs-tracking-mrr-in-a-spreadsheet.html',
  // Compares against "a flat $125-a-foot" sewer-replacement price -- a
  // generic pricing method every plumbing/sewer-repair shop already has
  // access to, not a company or product this could be mistaken for. The
  // page's own footer says so explicitly ("common, honest shortcut"). Same
  // reasoning as the other generic-method flat-rate pages above (e.g.
  // boiler-replacement-bid-calculator's flat-rate page).
  'sewer-line-replace-bid-calculator/vs-a-flat-per-foot-price.html',
  // Compares against "reading the settings.json by eye" -- a manual review
  // habit anyone editing a Claude Code settings.json already has, not a
  // company or product this could be mistaken for. Same reasoning as the
  // other vs-reading-*-by-hand/-by-eye pages above (e.g.
  // claude-code-hooks-security-check's, mcp-config-risk-check's). This
  // venture names no named-product comparison at all.
  'claude-code-settings-check/vs-reading-the-settings-json-by-eye.html',
  // Compares against "reading the subagent file by eye" -- a manual review
  // habit anyone writing a Claude Code subagent definition already has, not
  // a company or product this could be mistaken for. Same reasoning as the
  // other vs-reading-*-by-hand/-by-eye pages above. This venture names no
  // named-product comparison at all.
  'claude-code-subagent-check/vs-reading-the-subagent-file-by-eye.html',
  // Compares against "writing the frontmatter by hand" (copying a sibling
  // skill's SKILL.md and editing it) -- a manual habit any Claude Skill
  // author already has, not a company or product this could be mistaken
  // for. This venture names no named-product comparison at all.
  'claude-skill-scaffold-generator/vs-writing-the-frontmatter-by-hand.html',
  // Compares against "a flat per-pool monthly rate" -- a generic pricing
  // method every independent pool service operator already has access to,
  // not a company or product this could be mistaken for. Distinct from this
  // venture's own vs-skimmer.html, which names Skimmer and carries the
  // trademark disclaimer. Same reasoning as the other generic-method pages
  // above (e.g. sewer-line-replace-bid-calculator's flat-per-foot page).
  'pool-route-pricing/vs-a-flat-per-pool-monthly-rate.html',
  // Compares against "filling out the VPAT template by hand" -- typing
  // into ITI's own published Word/Excel template, a manual habit any VPAT
  // author already has, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-hiring-a-vpat-consultant.html,
  // which discusses paid consulting engagements generically without naming
  // a specific firm. Same reasoning as the other generic-method pages
  // above (e.g. claude-skill-scaffold-generator's frontmatter-by-hand page).
  'vpat-acr-generator/vs-filling-out-the-vpat-template-by-hand.html',
  // Compares against "doing the payout math yourself" (a mental estimate
  // that subtracts only the platform fee percentage) -- a generic
  // estimation habit any creator already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own guide
  // page, which names no competitor either. The page still carries the
  // "not affiliated with Patreon" clause on its own merits (Patreon is
  // named as background context throughout), so this registration is
  // purely so surface-budget.mjs classifies it as generic-method rather
  // than named-product -- see facebook-marketplace-fee-calculator's entry
  // above for what happens when a generic-method page is shipped without it.
  'patreon-fee-calculator/vs-doing-the-math-yourself.html',
  // Compares against "a flat per-square-foot attic price" -- the published
  // coupon-style rate ("$3.50/sf") that every spray-foam contractor in this
  // trade is shopped against, not one company's product. The venture's own
  // calc.mjs docstring and pricing walkthrough describe this exact generic
  // method as the thing board-foot pricing corrects for; the page names no
  // vendor and its own footer says so explicitly ("names no specific
  // company or product"). Distinct from this venture's own vs-jobber.html,
  // which names a real field-service platform and carries the trademark
  // disclaimer.
  'spray-foam-bid-calculator/vs-a-flat-per-square-foot-price.html',
  // Compares against "comparing the quoted rates by eye" -- reading two
  // per-job numbers off a rate card and picking the lower one -- a generic
  // habit any operator comparing vendor quotes already has, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-crest-capital.html, which names Crest Capital and carries the
  // trademark/affiliation disclaimer.
  'vendor-rate-break-even/vs-comparing-rates-by-eye.html',
  // Compares against "pricing a move-out at the tenant's rent" -- a generic
  // mental model every self-storage operator already reaches for, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-sitelink.html, which names SiteLink/Storable and
  // carries the trademark disclaimer. Same reasoning as the other
  // generic-method pages above.
  'self-storage-rate-increase-calculator/vs-pricing-a-move-out-at-the-tenants-rent.html',
  // Compares against "a flat rate per square foot of water surface" -- a
  // generic pricing shortcut every pool-replaster shop already reaches for,
  // not a company or product this could be mistaken for. Distinct from this
  // venture's own vs-buildxact.html, which names Buildxact and carries the
  // trademark disclaimer. Same reasoning as the other generic-method pages
  // above.
  'pool-plaster-bid-calculator/vs-a-flat-rate-per-square-foot-of-water.html',
  // Compares against "reconciling CAM by square footage alone" -- the plain
  // area-share arithmetic every CAM statement starts from, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-yardi.html and vs-appfolio.html, which name real platforms and carry
  // the trademark/affiliation disclaimer. Same reasoning as the other
  // generic-method pages above.
  'cam-reconciliation-check/vs-square-footage-alone.html',
  // Compares against "reading the guidelines and checking your own files by
  // eye" -- the generic first pass every plugin author already does, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-plugin-check.html, which names wordpress.org's Plugin
  // Check and carries the trademark/affiliation disclaimer. Same reasoning
  // as the other generic-method pages above.
  'wordpress-plugin-review-check/vs-manually-checking-against-the-guidelines.html',
  // Compares against "a flat per-word rate" -- the generic pricing habit of
  // multiplying total word count by one number, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-smartcat.html, which names a real CAT-tool platform and carries the
  // trademark/affiliation disclaimer. Same reasoning as the other
  // generic-method pages above.
  'translator-project-quote/vs-a-flat-per-word-rate.html',
  // Compares against "reading the manifest by eye" during review -- the
  // generic first pass every team already does, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-polaris.html, which names Polaris/Fairwinds and carries the
  // trademark disclaimer. Same reasoning as the other generic-method pages
  // above.
  'k8s-resource-limits-check/vs-reading-the-manifest-by-eye.html',
  // Compares against "comparing the two trace exports by eye" -- the
  // generic first pass anyone reviewing a consent sequence already does,
  // not a company or product this could be mistaken for. Distinct from
  // this venture's own vs-cookiebot.html, which names Cookiebot/
  // Usercentrics and carries the trademark disclaimer. Same reasoning as
  // the other generic-method pages above.
  'consent-change-record/vs-comparing-the-traces-by-eye.html',
  // Compares against "eyeballing the feed in a spreadsheet" -- the generic
  // visual scan any seller already does before a sync, not a company or
  // product this could be mistaken for (it deliberately names no specific
  // spreadsheet software). Distinct from this venture's own
  // vs-datafeedwatch.html, which names DataFeedWatch and carries the
  // trademark/affiliation disclaimer. Same reasoning as the other
  // generic-method pages above.
  'merchant-feed-check/vs-eyeballing-the-feed-in-a-spreadsheet.html',
  // Compares against pricing a placement's markup and margin in a
  // spreadsheet formula -- the generic practice most staffing desks already
  // use, not a company or product this could be mistaken for (it names no
  // specific spreadsheet software). Distinct from this venture's own
  // vs-tempworks.html, which names TempWorks Software, Inc. and carries the
  // trademark/affiliation disclaimer.
  'staffing-markup-calculator/vs-a-spreadsheet.html',
  // Compares against "treating materials as cash out on day one" -- the
  // generic back-of-envelope budgeting habit any sub already has, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-billd.html, which names Billd and carries the
  // trademark/affiliation disclaimer. Same reasoning as the other
  // generic-method pages above.
  'subcontractor-cashflow-planner/vs-treating-materials-as-cash-out-on-day-one.html',
  // Compares against a one-line referral-percentage spreadsheet -- the
  // generic pricing habit most Walmart sellers already have, not a company
  // or product this could be mistaken for. Distinct from this venture's own
  // vs-wfs-cost-estimator.html, which names Walmart's own WFS Cost
  // Estimator and carries the trademark/affiliation disclaimer.
  'walmart-marketplace-calculator/vs-a-spreadsheet.html',
  // Compares against pricing a stucco/EIFS repair by a flat rate per
  // square foot -- the generic estimating shortcut any plastering shop
  // already uses, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-jobber.html, which names Jobber
  // and carries the trademark/affiliation disclaimer.
  'stucco-repair-bid-calculator/vs-a-flat-rate-per-square-foot.html',
  // Compares against "a flat rate per lineal foot" -- the $12-or-so
  // wrap-and-fascia special every soffit and fascia crew already has access
  // to, not a company or product this could be mistaken for. Distinct from
  // this venture's own vs-jobber.html, which names Jobber and carries the
  // trademark/affiliation disclaimer. Same reasoning as the other
  // generic-method pages above (e.g. asbestos-abatement-bid-calculator's
  // flat-rate page).
  'soffit-fascia-bid-calculator/vs-a-flat-rate-per-lineal-foot.html',
  // Compares against "eyeballing two page loads side by side" -- the
  // generic manual habit every vendor-risk reviewer already has, not a
  // company or product this could be mistaken for (it names no specific
  // tool or service). Distinct from this venture's own vs-upguard.html,
  // which names UpGuard and carries the trademark/affiliation disclaimer.
  // Same reasoning as the other manual-method pages above (e.g.
  // openapi-breaking-change-check's vs-manually-reading-the-spec-diff.html).
  'vendor-change-evidence/vs-eyeballing-two-page-loads-side-by-side.html',
  // Compares against "reading manifest.json by eye" -- the free habit any
  // developer already has, not a company or product this could be mistaken
  // for. Distinct from this venture's own vs-lighthouse.html, which names
  // Google's Lighthouse tool and carries the trademark/affiliation
  // disclaimer. Same reasoning as source-map-leak-check's
  // vs-checking-devtools-by-hand.html above.
  'pwa-installability-check/vs-reading-the-manifest-by-eye.html',
  // Compares against "reviewing workflow files by eye for a self-hosted
  // runner under a risky trigger" -- the generic manual-review habit any
  // maintainer already has, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-stepsecurity.html,
  // which names StepSecurity, Inc. and carries the trademark/affiliation
  // disclaimer. Same reasoning as the other generic-method pages above.
  'actions-self-hosted-exposure-check/vs-reviewing-workflows-by-eye.html',
  // Compares against "reading the trust policy JSON by eye" -- the free
  // review habit any cloud/security engineer already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-wiz.html, which names Wiz, Inc. and carries the trademark/affiliation
  // disclaimer. Same reasoning as the other generic-method pages above.
  'oidc-trust-policy-check/vs-reading-the-trust-policy-by-eye.html',
  // Compares against "reading FinCEN's own guidance" -- the primary source
  // itself, not a company or product this could be mistaken for. Same
  // reasoning as ny-llc-transparency-act-tracker/vs-reading-client-alerts.html
  // above: the page's own first paragraph says it names no specific firm or
  // product, and its own test pins that sentence.
  'boi-reporting-exemption-checker/vs-reading-fincens-guidance-yourself.html',
  // Compares against working IRS Publication 560 by hand -- the primary
  // source itself, not a company or product. Same reasoning as the BOI
  // page above; the page's first paragraph says it names no specific firm.
  'solo-401k-contribution-calculator/vs-irs-publication-560-by-hand.html',
  // Compares against "judging a quote by its headline number" -- the
  // generic manual habit any freelancer already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // sibling-tool links, which name no competitor either but also carry no
  // comparison-page filename. Same reasoning as the other generic-method
  // pages above (e.g. eitc-calculator's vs-doing-the-math-by-hand.html).
  'freelance-writer-rate-calculator/vs-judging-a-quote-by-its-headline-number.html',
  // Compares against "time and materials" billing -- the hourly-rate-plus-parts
  // method every plumber already knows, not a company or product this could be
  // mistaken for. The page names no software or vendor, and its own test
  // (page.test.mjs) pins that, so this exemption cannot quietly stop being true.
  // Same reasoning as the other generic-method pages above.
  'plumber-flat-rate-price-calculator/vs-time-and-materials.html',
  // Compares against quoting a single repair price -- the generic method most
  // small shops start from, not a company or product this could be mistaken for.
  // The page names no software, vendor or manufacturer, and its own test
  // (page.test.mjs) pins that, so this exemption cannot quietly stop being true.
  'hvac-repair-tier-price-calculator/vs-quoting-one-repair-price.html',
  // Generic-method comparison (no company or product named): same reasoning as the pages above.
  'exempt-salary-threshold-checker/vs-checking-the-threshold-yourself.html',
  // Generic-method comparison (no company or product named): same reasoning as the pages above.
  'final-paycheck-deadline-calculator/vs-checking-the-deadline-yourself.html',
  // Generic-method comparison (no company or product named): same reasoning as the pages above.
  'hsa-contribution-limit-calculator/vs-doing-the-proration-math-by-hand.html',
  // Generic-method comparison (no company or product named): same reasoning as the pages above.
  'payment-reconciliation-workbench/vs-reconciling-in-a-spreadsheet.html',
  // Generic-method comparison (no company or product named): same reasoning as the pages above.
  'social-preview-check/vs-checking-tags-by-eye.html',
  // Generic-method comparison (no company or product named): same reasoning as the pages above.
  'vending-machine-route-margin/vs-judging-a-location-by-gross-sales-alone.html',
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
