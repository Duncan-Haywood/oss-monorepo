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
  // Compares against reconciling a 1099-K by hand in a spreadsheet -- a
  // method every marketplace seller already has, not a company or product
  // this could be mistaken for. Same reasoning as the cat-adjuster page
  // above.
  '1099k-reconciliation-worksheet/vs-spreadsheet-comparison.html',
  // Compares against "clicking Re-run failed jobs and seeing what happens" --
  // a generic manual habit every GitHub Actions user already has, not a
  // company or product this could be mistaken for.
  'actions-runner-starvation-check/vs-rerunning-the-job.html',
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
  // Compares against scoring each job on a 1-10 scale -- a generic ranking
  // habit any contractor already has, not a company or product this could
  // be mistaken for. Distinct from this venture's own vs-jobber.html,
  // which names Jobber specifically and carries the trademark disclaimer.
  'which-job-first/vs-scoring-every-job-out-of-ten.html',
  // Compares against "a flat day rate" -- a generic pricing method every
  // small rental operator already knows, not a company or product this
  // could be mistaken for. Same reasoning as the other vs-flat-day-rate
  // page above.
  'equipment-rental-break-even/vs-flat-day-rate.html',
  // Compares against "comparing effective rates" -- the standard rate-
  // shopping advice every merchant-services guide recommends, not a company
  // or product this could be mistaken for. The page names no processor and
  // its own test asserts that.
  'card-processing-fee-audit/vs-comparing-effective-rates.html',
  // Compares against "dividing labor sales by labor hours off your own DMS
  // reports" -- the one line of arithmetic every shop owner can already run
  // against reports they have, not a company or product this could be
  // mistaken for. The page names no management system at all (the venture's
  // two named-product comparisons, vs-tekmetric and vs-shop-ware, carry their
  // own trademark disclaimers) and its copy opens by telling the reader to do
  // the division themselves. Same reasoning as the other generic-method pages
  // above.
  'auto-repair-effective-labor-rate/vs-dividing-labor-sales-by-hours.html',
  // Compares against "a flat per-walk rate" -- the $20-a-walk pricing every
  // independent dog walker or pet sitter already posts, not a company or
  // product this could be mistaken for. The page names no marketplace app
  // or competitor (the venture's own named-product comparison, vs-rover,
  // carries its own trademark disclaimer) and its copy opens by agreeing the
  // flat rate is the right tool for advertising. Same reasoning as the other
  // generic-method pages above.
  'dog-walking-route-pricing/vs-a-flat-per-walk-rate.html',
  // Compares against "opening each marketplace's own fee calculator
  // separately and reconciling the numbers by hand" -- a generic method
  // every multi-channel seller already has access to, not a company or
  // product this could be mistaken for. It still names the six real
  // marketplaces it ranks, so it carries the nominative disclaimer anyway
  // rather than relying on this exemption to excuse its absence. Same
  // reasoning as the where-to-sell-calculator sibling entry above.
  'marketplace-fee-compare/vs-checking-each-marketplace-separately.html',
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
  // Compares against "checking each state's law by hand" (a one-off web
  // search) -- a generic manual method anyone can do with a search engine,
  // not a company or product this could be mistaken for. The page's own
  // footer says so explicitly ("names no specific product"). Same reasoning
  // as the other manual-method pages above.
  'salary-range-posting-check/vs-checking-each-states-law-by-hand.html',
  // Compares against "manually reading the spec diff" -- a generic method
  // every API developer already has access to, not a company or product
  // this could be mistaken for. The page's own footer says so explicitly
  // ("names no specific product"). Same reasoning as the other
  // manual-method pages above.
  'openapi-breaking-change-check/vs-manually-reading-the-spec-diff.html',
  // Compares against "a flat nightly rate copied from local competitors" --
  // a generic pricing habit every independent dog boarding/daycare operator
  // already has access to, not a company or product this could be mistaken
  // for. The page's own footer says so explicitly ("names no specific
  // competitor, product, or company"). Same reasoning as the other
  // generic-method pages above.
  'dog-boarding-daycare-pricing/vs-a-flat-nightly-rate.html',
  // Compares against "tracking payouts in a spreadsheet" -- a generic method
  // every Whatnot seller already has access to, not a company or product
  // this could be mistaken for. The page's own footer says so explicitly
  // ("names no specific product"). Same reasoning as the other
  // vs-spreadsheet / by-hand pages above (e.g. reverb-fee-calculator's).
  'whatnot-seller-payout/vs-tracking-payouts-in-a-spreadsheet.html',
  // Compares against "tracking propane customer margins in a spreadsheet"
  // -- a generic method every independent propane dealer already has
  // access to, not a company or product this could be mistaken for. The
  // page's own copy says so explicitly ("Names no specific product or
  // company"). Same reasoning as the other vs-spreadsheet / by-hand pages
  // above (e.g. import-landed-cost-calculator's).
  'propane-delivery-route-margin/vs-tracking-propane-delivery-margin-in-a-spreadsheet.html',
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
  // Compares against "eyeballing the commission split against the rent
  // check" -- the chair-side napkin habit every stylist weighing a
  // booth-rent offer already runs, not a company or product this could be
  // mistaken for. The page names no salon-software platform or competing
  // calculator at all -- distinct from this venture's own vs-vagaro.html,
  // which does name a product and carries its own "not affiliated" clause.
  'booth-rent-vs-commission/vs-guessing-which-pays-more.html',

  // Compares against "tracking thresholds in a spreadsheet" -- the generic
  // method every seller doing this by hand already reaches for, not a
  // company or product this could be mistaken for. The page names no
  // spreadsheet application or competing tracker; the sibling
  // vs-paid-nexus-monitoring-software.html on the same venture already names
  // Avalara/TaxJar and carries the not-affiliated clause for that page.
  'economic-nexus-threshold-tracker/vs-tracking-it-in-a-spreadsheet.html',
  // Compares against "tracking quotes in a spreadsheet" -- the generic
  // method every freelancer pricing a fixed quote already reaches for, not
  // a company or product this could be mistaken for. The page's own footer
  // says so explicitly ("names no specific product"). Same reasoning as the
  // reverb-fee-calculator and whatnot-seller-payout spreadsheet pages above.
  'quote-margin-check/vs-tracking-quotes-in-a-spreadsheet.html',
  // Compares against "a flat Saturday-special price" -- the flat per-unit
  // event-day pricing habit every portable sanitation yard is shopped
  // against, not a company or product this could be mistaken for. The page
  // names no vendor or competing platform at all -- distinct from this
  // venture's own vs-servicecore.html, which does name a product and
  // carries its own "not affiliated" clause.
  'portable-restroom-event-quote/vs-a-flat-saturday-special-price.html',
  // Compares against "watching your backup's exit code yourself" -- the
  // cron-mail/systemd-status habit every operator running a scheduled
  // backup already has, not a company or product this could be mistaken
  // for. The page names no vendor or competing tool at all -- distinct
  // from this venture's own vs-healthchecks.html, which does name a
  // product and carries its own "not affiliated" clause.
  'backup-verification-evidence/vs-checking-the-exit-code-yourself.html',
  // Compares against "building your own cash-flow spreadsheet" -- the
  // running-balance habit every small business owner already has, not a
  // company or product this could be mistaken for. The page names no
  // vendor or competing platform at all -- distinct from this venture's
  // own vs-quickbooks-cash-flow-planner.html, which does name a product
  // and carries its own "not affiliated" clause.
  'cash-runway-planner/vs-a-spreadsheet.html',
  // Compares against "reading a page's view-source or devtools for SRI tags
  // by eye" -- a manual method every developer already has access to, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-srihash.html, which does name a product (srihash.org)
  // and carries its own "not affiliated" clause. Same reasoning as the other
  // vs-checking-it-by-hand / vs-reading-the-color-code-by-eye pages above.
  'sri-check/vs-checking-tags-by-hand.html',
  // Compares against "a spreadsheet" -- a generic method most filers who pay
  // quarterly estimated tax more than once already build for themselves, not
  // a company or product this could be mistaken for. The page names no
  // spreadsheet vendor at all, same reasoning as osha-trir-dart-calculator's
  // own vs-spreadsheet.html above -- distinct from this venture's own
  // vs-keeper.html, which does name a product and carries its own "not
  // affiliated" clause.
  'quarterly-estimated-tax-calendar/vs-a-spreadsheet.html',
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
  // Compares against "a spreadsheet" -- a generic method every SaaS
  // operator already has access to, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-vendr.html and
  // vs-zylo.html, which name specific SaaS-management platforms and already
  // carry the "not affiliated" clause for that reason. Same reasoning as
  // the other vs-spreadsheet pages above (e.g. turo-host-payout-calculator's).
  'saas-seat-true-up/vs-a-spreadsheet.html',
  // Compares against sending a single crafted curl request and reading the
  // response by eye -- a manual habit every developer testing CORS already
  // has, not a company or product this could be mistaken for. The page
  // does cross-link to this venture's own vs-burp-suite.html, which does
  // name a product and carries its own "not affiliated" clause.
  'cors-misconfig-check/vs-checking-cors-by-hand.html',
  // Compares against "reading the workflow file by hand" -- a manual
  // review habit every GitHub Actions user already has, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-zizmor.html, which names a specific open-source tool and already
  // carries the "not affiliated" clause for that reason. Same reasoning as
  // the other vs-checking-*-by-hand pages above (e.g.
  // graphql-introspection-exposure-check's).
  'actions-injection-check/vs-checking-a-workflow-by-hand.html',
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
  // Compares against "planning cuts by hand" -- a manual layout habit every
  // woodworking or sign shop already has, not a company or product this
  // could be mistaken for. Distinct from this venture's own
  // vs-opticutter-and-cutlist-optimizer.html, which names two specific
  // hosted services and already carries the "not affiliated" clause for
  // that reason. Same reasoning as the other generic-method pages above.
  'cut-list-optimizer/vs-planning-cuts-by-hand.html',
  // Compares against "eyeballing the copy-paste test yourself" -- the same
  // manual technique this checker automates, not a company or product this
  // could be mistaken for. Distinct from this venture's own vs-jobscan.html,
  // which names a specific resume-scanning service and already carries the
  // "not affiliated" clause for that reason. Same reasoning as the other
  // vs-checking-*-by-hand/by-eye pages above.
  'ats-resume-checker/vs-checking-it-by-eye.html',
  // Compares against "a spreadsheet" -- a method every independent medical
  // courier pricing their own route already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-onfleet.html, which names a specific dispatch platform and already
  // carries the "not affiliated" clause for that reason. Same reasoning as
  // the other vs-a-spreadsheet pages above.
  'medical-courier-route-margin/vs-a-spreadsheet.html',
  // Compares against "eyeballing package.json by hand" -- the same manual
  // read-and-recognize habit this checker automates, not a company or
  // product this could be mistaken for. Distinct from this venture's own
  // vs-socket.html, which names a specific commercial scanning service and
  // already carries the "not affiliated" clause for that reason. Same
  // reasoning as the other vs-checking-*-by-hand/by-eye pages above.
  'slopsquatting-check/vs-checking-package-names-by-eye.html',
  // Compares against "manually re-checking each dependency's license after
  // an update" -- a habit any developer already has, not a company or
  // product this could be mistaken for. This venture's own vs-fossa.html is
  // separately exempt-free (FOSSA is a named product) and carries the
  // trademark disclaimer. Same reasoning as flaky-test-finder's
  // vs-eyeballing-two-ci-logs-by-hand.html above.
  'license-drift-check/vs-manually-rechecking-licenses.html',
  // Compares against reading a canonical tag in view-source -- a manual
  // habit any web developer already has, not a company or product this
  // could be mistaken for. This venture's own vs-screaming-frog.html is
  // separately exempt-free (Screaming Frog is a named product) and carries
  // the trademark disclaimer. Same reasoning as license-drift-check's
  // vs-manually-rechecking-licenses.html above.
  'canonical-tag-check/vs-checking-canonicals-by-view-source.html',
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
  // Compares against reusing one downloaded or bookmarked chargeback
  // checklist for every dispute reason -- a habit any seller fighting a
  // chargeback already has, not a company or product this could be
  // mistaken for. Distinct from this venture's own vs-chargeflow.html,
  // which names Chargeflow specifically and already carries the trademark
  // disclaimer. Same reasoning as the other generic-method pages above.
  'chargeback-evidence-packet/vs-a-generic-dispute-checklist.html',
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
  // Compares against "tracking grant deadlines in a spreadsheet" -- the
  // generic method most small-nonprofit coordinators already use, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-instrumentl.html, which names Instrumentl specifically
  // and already carries the trademark disclaimer. Same reasoning as the
  // other generic-method pages above.
  'grant-deadline-tracker/vs-tracking-deadlines-in-a-spreadsheet.html',
  // Compares against "running curl -sI -L or reading DevTools' Network
  // panel by hand" -- generic tools and habits any developer already has,
  // not a company or product this could be mistaken for. Distinct from
  // this venture's own vs-httpstatus-io.html, which names a real hosted
  // service and already carries the trademark disclaimer. Same reasoning
  // as cache-control-check's vs-checking-headers-by-eye-in-devtools.html
  // and source-map-leak-check's vs-checking-devtools-by-hand.html above.
  'redirect-chain-check/vs-checking-a-chain-by-hand.html',
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
  // Compares against "just checking whether the invoice cleared the bid" --
  // the generic before/after gut check every contractor already runs
  // without any tool, not a company or product this could be mistaken for.
  // Distinct from this venture's own vs-quickbooks-job-costing.html, which
  // names QuickBooks/Intuit specifically and already carries the trademark
  // disclaimer. Same reasoning as the other generic-method pages above.
  'job-margin-variance/vs-checking-if-you-still-made-money.html',
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
  // Compares against "re-reading a post and checking it by eye for a
  // disclosure" -- a manual habit any blogger already has, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-post-affiliate-pro.html, which names Post Affiliate Pro
  // specifically and already carries the trademark disclaimer.
  'affiliate-disclosure-checker/vs-checking-a-post-by-eye.html',
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
  // Compares against "reading the SKILL.md by hand" -- a manual review
  // habit every skill author already has, not a company or product this
  // could be mistaken for. Same reasoning as the other vs-reading-*-by-hand
  // pages above (e.g. hidden-unicode-check's, docker-build-secrets-check's).
  'skill-manifest-check/vs-reading-the-skill-by-hand.html',
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
  // Compares against guessing from Obsidian's own guidelines, or waiting
  // for a community plugin reviewer to comment -- a generic, ungoverned
  // habit any plugin author already has, not a company or product this
  // could be mistaken for. This venture's checker still names Obsidian and
  // Dynalist Inc. (the platform whose review guidelines it checks against)
  // and separately carries the trademark disclaimer for that reason; the
  // two clauses are independent. Same reasoning as
  // skill-manifest-check's vs-reading-the-skill-by-hand.html above.
  'obsidian-plugin-review-check/vs-guessing-or-waiting-for-review.html',
  // Compares against reading a security.txt file and checking it by eye --
  // a generic method anyone with a text editor already has, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-securitytxt-org-generator.html, which names a real site and
  // already carries its own non-affiliation disclaimer.
  'security-txt-check/vs-checking-it-by-eye.html',
  // Compares against "assembling one by hand in a document editor" -- a
  // generic method (a word processor or slide deck) every creator already
  // has access to, not a company or product this could be mistaken for.
  // The page's own footer says so explicitly ("names no specific document
  // editor, product, or company"). This venture's own vs-kitly.html names
  // a real platform and already carries the trademark disclaimer
  // separately; the two comparison pages are deliberately different
  // classes, same shape as epk-generator's own by-hand page.
  'influencer-media-kit-generator/vs-assembling-one-by-hand.html',
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
  // Compares against "looking up the density-to-class table yourself" -- a
  // manual lookup habit any shipper already has, not a company or product
  // this could be mistaken for. Distinct from this venture's own
  // vs-smc3-fastclass.html, which names SMC³/FastClass specifically and
  // carries the trademark disclaimer.
  'ltl-freight-class-estimator/vs-looking-up-the-class-table-yourself.html',
  // Compares against "reading the workflow YAML by hand" -- a manual review
  // habit any maintainer already has, not a company or product this could
  // be mistaken for. Same reasoning as actions-permissions-check's and
  // actions-artifact-poisoning-check's own pages of the same name. Distinct
  // from this venture's own vs-openssf-scorecard.html, which names OpenSSF
  // Scorecard specifically and carries the trademark disclaimer.
  'pinned-actions-check/vs-reading-the-workflow-yaml-by-hand.html',
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
  // Compares against "comparing the quoted rates by eye" -- reading two
  // per-job numbers off a rate card and picking the lower one -- a generic
  // habit any operator comparing vendor quotes already has, not a company
  // or product this could be mistaken for. Distinct from this venture's
  // own vs-crest-capital.html, which names Crest Capital and carries the
  // trademark/affiliation disclaimer.
  'vendor-rate-break-even/vs-comparing-rates-by-eye.html',
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
  // Compares against "treating materials as cash out on day one" -- the
  // generic back-of-envelope budgeting habit any sub already has, not a
  // company or product this could be mistaken for. Distinct from this
  // venture's own vs-billd.html, which names Billd and carries the
  // trademark/affiliation disclaimer. Same reasoning as the other
  // generic-method pages above.
  'subcontractor-cashflow-planner/vs-treating-materials-as-cash-out-on-day-one.html',
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
