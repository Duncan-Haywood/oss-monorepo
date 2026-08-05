# Engineering systems roadmap

This roadmap turns [the engineering principles](../ENGINEERING-PRINCIPLES.md)
into measurable repository-wide controls. Each item needs an owner, issue,
evidence, and completion date before it can be marked done.

## Now: establish and enforce the baseline

- [ ] Retrofit every production UI with a deterministic Playwright critical-
  journey suite on pull requests and the immutable candidate. Owner: QA and
  venture owner. Priority order: Pairwise, homepage, AI-First Markets, then all
  other production UIs. Required coverage includes primary happy paths,
  validation and dependency failures, auth/authorization where present,
  persistence/reload, mobile and desktop layouts, keyboard navigation,
  accessibility scans plus manual checks, and reviewed visual artifacts.
  Automatic production promotion for the three named services is blocked in
  their workflows until this is complete; temporary releases require a tracked,
  owner-approved manual exception under `docs/QUALITY-ENGINEERING.md`.
  Partial, 2026-08-01, owner duncan. Pairwise, the first of the three, has one:
  `ventures/quick-pick-survey/e2e/` plus `playwright.config.ts`, 17 journeys
  across a desktop and a phone viewport, run by a `journeys` job in
  `.gitea/workflows/pairwise-ci.yml` that `container` now waits on — so a red
  journey stops an image being *built*, not merely promoted. Before this there
  was no Playwright anywhere in the repository. Covered: anonymous entry and
  primary task completion, validation refusal, persistence across reload, undo,
  keyboard voting, dependency-failure states, anonymous authorization against
  every admin handler, cross-origin refusal, and axe scans of both screens the
  journey passes through. It drives a production build and takes its base URL
  from `PLAYWRIGHT_BASE_URL`, so the same specs can run against the candidate;
  nothing under `e2e/` imports application code. `retries: 0`, deliberately —
  Playwright exits 0 on a test that passes on attempt two, which is the
  opposite of what this policy asks for — with traces, video and screenshots
  retained and uploaded on failure.

  **What writing it found is the reason the item exists.** Four votes produced
  "2 answered" on the insights screen, behind four HTTP 200s. `trials/next`
  hands a shown-but-unanswered pair back for 30 minutes so a reload does not
  mint a new row; the runner saves an answer in the background and asks for the
  next pair in the same tick. Both requests are therefore in flight together and
  the next-question one normally lands first, while the row it is about to skip
  still reads `result: null`. The identical pair came back, the person answered
  it again, and `trials/answer` correctly refused to apply one answer twice —
  replying `{ok: true, alreadyAnswered: true}`, which the client treats as
  success. Not a fast-tapper edge case: a race between two simultaneous
  requests that resolved the wrong way on essentially every answer. Roughly half
  of all taps in the only venture serving production traffic were discarded, the
  Glicko-2 ratings and every insight were computed from half the data, and
  nothing anywhere reported it. Fixed in `54733cc` by naming the in-flight trial
  so both fetchers exclude it, symmetric across `trials/next` and
  `financial-trials/next`, with the reload behaviour left intact. Guarded twice:
  by the journey that found it and by
  `src/app/api/trials/pendingReuse.integration.test.ts`, which runs in the
  existing `database` job and so binds where no browser exists — mutation-checked
  by removing the exclusion, which fails the two in-flight cases and leaves the
  two reload cases green.

  The floor beneath this control, rather than the control itself.
  2026-08-01, owner duncan: the homepage — one of the three named
  services — had no gate of any kind. Its three declared gates were
  `node -e 'console.log("Marisstella homepage build verified")'` and the same
  for `lint` and `test`; `VENTURE_CATALOG` ran `build`, it exited 0, and the
  component was reported PASSED for as long as it had existed. The workflow
  never ran the scripts at all. So the promotion block above was guarding a
  service whose *existing* verification was zero, which is a different and
  cheaper problem than the missing browser suite, and it is now fixed:
  `portfolio/marisstella-homepage/test/` holds 27 dependency-free tests that
  execute `app.js` in a `node:vm` against a fixture derived from `index.html`'s
  own `data-filter`/`data-category`/`openModal` values, plus a static contract
  over ids, anchors, accessible names, asset existence, the nginx security
  headers, and the venture count the hero claims against the number of cards the
  grid shows. Mutation-checked thirteen ways. It found five defects, all fixed:
  two `target="_blank"` links without `rel="noopener"`, `nginx.conf` and
  `package.json` published to the public web root (SEC-021 in
  [the security audit log](SECURITY_AUDIT_LOG.md)), keyboard focus lost when a
  venture brief closed, a decorative glyph missing `aria-hidden`, and every
  brief list item drawing a second bullet beside the browser's own.
  This is **not** the Playwright control: it runs against the working tree, not
  the immutable candidate; it drives a fake DOM, so it cannot see layout,
  contrast, or real focus rings; and it is not wired into the promotion gate.
  The real-browser check that found the doubled bullet was manual.
  The generalizable half is `platform/ci/test/gate-substance.test.mjs`, which
  fails when any gate the engine runs — or any `test`/`build`/`lint`/`typecheck`
  script under `ventures/`, `portfolio/` or `platform/` — either cannot fail or
  discards its own failure with `|| true`. Every control we had asked whether a
  gate was *declared* and whether it was *reachable*; this one was both, and
  neither question could tell it from a passing suite.

  **The homepage, second in the priority order, now has one.** 2026-08-05,
  owner duncan: `portfolio/marisstella-homepage/e2e/` plus
  `playwright.config.ts`, 46 journeys across a desktop and a phone viewport,
  run by a `journeys` job in `.gitea/workflows/homepage-ci.yml` that `container`
  waits on — so a red journey stops the image being *built*, the same position
  the pairwise chain takes. Covered: the filter-to-brief primary journey,
  per-venture brief content, reload behaviour, keyboard-only operation with
  focus entry, trap and return, the disclosure menu at both widths, contact
  reachability, layout integrity (horizontal overflow, text escaping its card,
  a brief taller than the phone it opens on, grid reflow), and axe scans of all
  four states the journey passes through. `retries: 0`. Mutation-checked seven
  ways — contrast, focus return, filter membership, panel dismissal, scroll-lock
  release, mobile reflow, focus trap — each mutation red, and the suite serves
  the site over HTTP so `PLAYWRIGHT_BASE_URL` points the same specs at a
  candidate.

  **What writing it found.** Four WCAG 2.1 AA contrast failures on the live
  site, all fixed: `.venture-badge` at 2.09:1 (white on the gold, on the
  flagship card), `--ink-muted` at 4.49:1 against the card background — under
  the floor by a hundredth, on every venture status and tech tag — and
  `.footer-pending em` at 3.27:1 where an opacity multiplied it further.
  Contrast is a resolved colour, and until this suite no test in the repository
  had evaluated one; the fake-DOM suite's `style` is an empty object and the
  responsive contract models `display` alone. Separately, the container was
  publishing its own test sources: `.dockerignore` excluded `test` while the
  directory has always been `tests`, and the contract guarding it asserted that
  six literal strings were *present in* `.dockerignore` rather than that the
  web root held only the site. That contract now resolves the patterns against
  the directory as it is and requires the survivors to equal the `--from-file`
  set in `platform/ci/deploy-homepage.sh`.

  Still open, and this item stays unchecked until all of it is done: AI-First
  Markets has no journey suite. The homepage suite has no candidate-side run
  either — the `journeys` job drives the working tree, so of the two runs the
  policy asks for ("on every relevant pull request and on the exact release
  candidate") only the first is wired for both services. What the homepage
  needs is a job between `container` and `deploy` that starts the published
  `:${sha}` image and re-runs the same specs against it; the config already
  takes the base URL. Promotion therefore stays behind its bounded owner
  exception, and lifting it is coupled — test 3 of
  `production-ui-promotion-policy.test.mjs` fails if the workflow declares
  `quality_exception:` inputs while no job classifies as a promotion, so the
  inputs and the six gate conditions have to go together. Pairwise's own suite has
  no authenticated, couple-linking, or admin-dashboard journey, no visual
  regression evidence, and no candidate-side run — `PLAYWRIGHT_BASE_URL` is
  supported but no workflow points it at the promoted digest yet. The accessible
  coverage is an automated axe scan of two screens at two viewports, which is
  roughly a third of what a person would find, and the manual checks the policy
  asks for are still owed. Automatic promotion therefore remains blocked for all
  three services, unchanged by this work.
  None of that homepage work is live, 2026-08-02, owner duncan, and checking
  why found a further defect. `origin/main` is at `a4b8f23` from 2026-07-31; 58
  commits — the homepage suite, its five fixes, SEC-019 through SEC-021, the CI
  runner repairs — sit on unpushed local branches. Production still serves the
  5806-byte `app.js` from `origin/main` rather than HEAD's 6310-byte version, so
  the `rel="noopener"`, focus-restore, `aria-hidden` and double-bullet fixes are
  all still absent from the live site. Nothing in the repository measures this:
  no lead-time, deployment-frequency or unshipped-work signal exists, which is
  the DORA item in the 30-day section below, still not started.
  The defect that gap exposed is SEC-022. Production does not serve the
  container image's web root at all — `web-portal-web-service` mounts the
  `marisstella-homepage-files` ConfigMap over `/usr/share/nginx/html` with no
  `items:` selector, so the public file set is whatever
  `platform/ci/deploy-homepage.sh` passes to `--from-file`, and one of those
  four keys was `Dockerfile`. `https://marisstella.dev/Dockerfile` returned the
  repository's Dockerfile byte-for-byte. So SEC-021's `.dockerignore` fix, and
  the test holding it, govern an artifact production overwrites — a remediation
  recorded against the surface that was easiest to reason about rather than the
  one that ships. `platform/ci/test/homepage-release-surface.test.mjs` now
  allow-lists the deploy script's publish list, mutation-checked seven ways.
  The class this belongs to is one past "a gate that cannot fail": a *fix* that
  cannot fix, with a passing test over the wrong artifact as its evidence.
  It also depends on cluster state the repository does not hold — the
  Deployment and ConfigMap are created imperatively and have no desired state
  in git, so the missing `items:` selector is visible only from `kubectl`.
- [ ] Hold every venture's customer-facing claims to what the venture can
  actually deliver, and gate the claim rather than the copy. Owner: venture
  owner. Not started as a portfolio-wide control; one venture is done.
  2026-08-02, owner duncan: `ai-engineering-academy` is the portfolio's
  highest-allocated venture (`$40/mo`, rank 1 in
  [the allocation report](../portfolio/ALLOCATION_REPORT.md)) and its pricing
  page is the only surface it has that could ever take money. Every branch in
  flight that touched this venture — eight of them — changed the same single
  line of `site/package.json`, adding the missing `test` script. None looked at
  what the pages say. That matters in a specific way: `VENTURE.yaml` declared
  `verify: npm --prefix site test && npm --prefix site run build`, `npm test`
  did not exist, so the venture's verification had never once run, and the
  moment those branches landed CI would have begun *enforcing* the following as
  regressions:
  the sandbox sold "test real multi-agent tool-calling workflows … directly in
  your browser" over a handler that printed one fixed transcript ending
  `12/12 passing` and `Subgoal satisfaction score: 100%` for any input including
  an empty one, and ignored which of the three tracks was selected;
  the mastery checkpoint answered "Schema structure verified. Portfolio point
  awarded (+25 pts)" to any input over ten characters — `aaaaaaaaaaa` passed,
  verified against the built page — and the points are stored nowhere;
  the pricing page headlined "$93.50 / mo (65% Savings)" against a "Retail LLM &
  Compute Value" computed from two invented rates ($1.50/sandbox-hour,
  $0.35/mentor-query) that nothing in this repository sources, clamped at zero
  so it could never show the usage levels where $49 costs more than it returns;
  it badged an unbuilt tier "Most Popular" for a product with zero customers,
  and ticked "All 50+ Project Specifications" and "Complete Engineering
  Knowledge Graph" as delivered when both are design documents in `docs/`.
  The savings framing also contradicted the venture's own written rule — that a
  paid tier is priced to cover what it costs to serve plus a modest margin, "not
  to maximize what a motivated learner is willing to pay" (`docs/05-business-
  and-strategy.md`). `$49` appears nowhere in the venture's documentation.
  Separately and more mundanely, the whole revenue surface was unstyled:
  `site/style.css` defined six nav classes, and the two authored pages
  referenced twenty-five it did not have, so the pricing cards rendered as an
  undifferentiated run of text and the waitlist dialog — the single conversion
  path — appeared as an unstyled block at the foot of the page. Pressing the
  call to action looked, to a visitor, like nothing happening.
  Fixed in `site/build.mjs` and `site/style.css`; `site/test.mjs` holds the
  contracts, and each was confirmed to fail against the pre-change build. The
  generalizable one is the class contract: every class name the built pages use
  must resolve in the stylesheet, which is what catches a shipped-but-invisible
  UI without anyone having to look at the page.
  **Two branches fixed this independently and the tree carries one of them.**
  `agent/continue-work-4-2026-08-02` and the base each found the same four
  false claims and the same unstyled surface, within a day of each other, and
  neither knew of the other. The base's implementation is the one that landed:
  it extracts the checkpoint rules into `site/checkpoint-validator.mjs` and
  inlines them, so the rules under test are the rules the learner meets, and
  its suite drives the page's own inlined script in a `node:vm` rather than
  grepping for strings — mutation-checked 20 ways, against the other's
  authored-walkthrough rewrite. One thing was ported from the branch that the
  base did not have: the two estimator sliders now carry the visitor's stated
  usage into the waitlist application. `$49` is a proposal that appears nowhere
  in the venture's documentation, so what visitors say they expect to use is
  the only evidence that could ever set it; without that, the estimator is
  decoration and the demand data is thrown away at the moment of conversion.
  Held by a test that drives the real handler and reads the generated `mailto`.
  That duplication is itself the finding. Two agents spent a session each on
  the same four defects in the same venture, and the only reason the second
  one's work was not silently discarded is that someone read both.
  2026-08-04, owner duncan: a second venture, and the most expensive instance
  found so far. `local-site-studio`'s Complete tier sells at `$500 + $199/mo`,
  and five public surfaces — the tier's feature list and tagline, the hero
  paragraph, the pricing-section blurb, and the upsell email whose only call to
  action is the checkout link — described "an AI phone agent that answers your
  business line". No telephony integration exists: `package.json` declares no
  Twilio, Vapi, Retell, Telnyx, Plivo or Vonage dependency and nothing under
  `src/` imports one. All of `src/lib/voice/` generates an FAQ and script pack
  that is emailed to the operator's client for them to read themselves.

  The instructive part is that the venture already knew. Its own
  `/docs/product-bundles` page, reachable from the same site, says "Until Twilio
  is live, operators fulfill with a generated FAQ/script pack". The truth was
  written down one click away from the copy that contradicted it, and nothing
  compared the two — so they could drift indefinitely, and only ever in the
  direction that sells better. Distance between an honest internal page and a
  dishonest sales page is not a documentation problem; it is the absence of a
  join.

  `src/lib/capability-claims.test.ts` is that join, and it is the generalizable
  half: it binds the advertised *capability* to whether the implementing code
  exists, exactly as `src/lib/pricing/advertised-price-claims.test.ts` already
  binds the advertised *price* to what Stripe charges. It reads the public copy
  surface off disk rather than from a list, excludes `/docs` so the page telling
  the truth is not forbidden from telling it, and is two-directional: when a
  provider is both declared in `package.json` and imported under `src/`, the
  test stops forbidding the claim. A control that must be switched off by hand
  to permit the improvement it is waiting for is a control that gets deleted
  instead. It immediately found a fifth surface the manual search had missed —
  the "Never miss a call or a customer" tagline — which is the argument for a
  test over an edit.

  Found in the same pass and fixed beside it, a defect of the same family on the
  legal rather than the commercial side. `UNSUBSCRIBE_CONVEX_PRIMARY` had made
  the CAN-SPAM suppression *write* fail closed; the read never followed.
  `isEmailSuppressed` caught a Convex query failure, logged "falling back to
  SQLite database", and queried a `suppression_list` table that — precisely
  because the write is Convex-primary — is provably always empty on such a
  deploy. It returned `false`, `sendEmail` read that as "not suppressed", and
  the send proceeded. The harder the write was hardened, the more certainly a
  Convex outage became permission to email someone who had just opted out.
  It now throws `ConvexPrimaryReadError` and `sendEmail` declines to send.

  Worth recording because it nearly shipped as a false fix: the first regression
  test mocked `../db` — `src/lib/db.ts` imports `server-only`, and no test in
  the venture imports it — so it pinned how `sendEmail` reacts and not whether
  `isEmailSuppressed` still raises. Reinstating the fallback left all four of
  its assertions green. Measured, not assumed; the mutation was applied and the
  suite passed. `suppression-read-source-contract.test.ts` reads `db.ts` instead
  and fails on that mutation. **A regression test that survives the regression
  it was written for is the defect, not the coverage** — mutate every fix whose
  test mocks the module the fix lives in.
  Not done: this is two ventures of eleven, and nothing checks the other nine.
  The academy check is string-and-DOM-level rather than a real browser, so
  layout, contrast and focus rings are argued from the stylesheet rather than
  observed. The `photos-import-tools` instance of the same class —
  `sd_offload.py` writing `"status": "verified"` into the manifest a user
  consults before erasing an SD card, on a same-byte-length comparison, with
  `sha256_file()` defined and called from nowhere — was open when the first half
  of this was written and is now closed: `sha256_file` is called on both source
  and destination and the digests compared before the status is written.

  Four ventures of the remaining nine, 2026-08-04, owner duncan — the full
  evidence is in [the claims audit](CLAIMS-AUDIT-2026-08-04.md); the two
  findings worth carrying here are the ones that change what this item is for.

  **A control of exactly this shape passed over the whole published site.**
  `real-estate-agent-photo-app` already had the join this item asks for:
  `pipeline/src/offer-claims.test.ts` binds each restricted alteration to the
  code signal that would implement it, and it was green while the docs site
  advertised all five of them. Its customer-facing surface was three hardcoded
  paths, and `docs-site/src/lib/docs.ts` renders `STRATEGY.md` as a public
  page. So the venture sold "instant on-device AI" over a `sharp`-only
  pipeline and cloud edits for virtual staging, twilight and object removal —
  the exact class triggering the CA AB 723 / NY / TX disclosure duty the
  contract was *derived from*. The contract was right, its surface was a
  guess, and the guess is what made it vacuous where it mattered. It now reads
  the site's own `DOC_REGISTRY` off disk. Claims may still be named when the
  same markdown block says they are not built — per claim, not per directory,
  and at block granularity so re-wrapping a paragraph cannot strip a claim of
  its disclaimer. **The next such contract should be reviewed for how it
  decides what to read, not for what it asserts.**

  **The commercial defect this class produces is not always a false claim.**
  In `print-atelier` the copy was accurate and the code was not. The storefront
  promises prints "shipped directly to your door"; the Stripe session never
  asked for one, so both print partners substituted a hardcoded street and
  every paid order would have been printed and posted to San Francisco or
  London. The same checkout displayed a bolded Total of subtotal + shipping +
  tax against a session carrying only the line items — a US cart quoted $99.11
  and charged $85.00, and EU/UK carts displayed 20% VAT that was never
  collected and so could never be remitted. Both are now gated by contracts
  that compare the promise to the behaviour rather than to the copy:
  `tests/buyer-shipping-address.test.ts` and
  `tests/checkout-charges-what-it-quotes.test.ts`, mutation-checked eight and
  four ways.

  **2026-08-04, owner duncan: the address fix stopped at the edge of the
  address, and the same defect was still live three fields over.** The rule it
  established — a missing field is a reason to refuse an order, never a reason
  to invent one — was applied to `shippingAddress`'s address lines and to
  nothing else in the same object literal. `buyerEmail` still defaulted to
  `buyer@printatelier.com`, a studio inbox, which Gelato uses as the recipient's
  shipment-notification address and Printful prints on the packing slip: right
  street, wrong person, on every order. Gelato's `fileUrl` — the artwork
  actually printed — defaulted to a URL assembled from the catalog slug, and
  `CatalogArtwork` carries an `imageClass`, a CSS class, and no print file
  anywhere in the repository, so it never named artwork. An unmapped artwork
  defaulted to `pf_<slug>`/`gel_<slug>` against real ids shaped like
  `gel_poster_18x24_matte`. Printful was told `shipping: "0.00"` and
  `tax: "0.00"` on every order, which are the retail values a customs
  declaration is built from, and nothing measured them.
  **Nothing in the repository writes any of those metadata keys**, so none of
  these was an edge case: each default was taken on every order. The tell was
  cheap and generalizable — grep a fulfillment builder for `??` and `||` against
  a string literal, then check whether anything writes the key being read.
  `src/lib/fulfillment-order-inputs.ts` now resolves them in the existing
  `{ok, missing}` shape and the queues refuse before the dry-run branch, since a
  queued dry run is the record an operator later retries. Nine mutations, all
  caught, including restoring each of the three defaults. The enabling half
  shipped with it: Stripe exposes the buyer's email as `receipt_email`,
  `customer_details.email` or `billing_details.email` depending on which object
  fired and never in `metadata`, so `extractStripeShippingMetadata` now lifts it
  alongside the address.
  **The same run found and fixed a second defect in the same checkout, of the
  same shape: a control reading caller-controlled text.** The route decided
  whether to reject a cart by substring-matching blocker strings that
  interpolate the caller's own artwork slug, so an artwork named `Gelato`
  produced `Unknown artwork slug: Gelato`, the filter dropped it, and an
  off-catalog line item reached a live Stripe session priced at one cent with
  the caller's own Connect account in the payout metadata. `cartEligible` and
  the funnel carried the same filter.
  `docs/SECURITY-FINDING-CHECKOUT-OFF-CATALOG-2026-08-04.md` holds the
  reproduction and separates the price bypass (live) from the payout
  redirection (poisons the payout queue; nothing in the venture executes a
  transfer today). The fix splits `cartBlockers` from environment blockers at
  the point the distinction is known, and `buildCheckoutSessionPayload` now
  refuses to price an off-catalog item at all, so the money boundary does not
  depend on a caller having checked first.
  **Two lessons worth carrying.** The three existing price-tampering tests all
  buy `midnight-coast`, so all three exercise the catalog-hit branch and none
  exercises the passthrough that carried client input — a protection can be
  real on the path that is tested and absent on the path that is not. And the
  first regression test written here tested `buildCheckoutReadiness` only; the
  mutation restoring the route's filter **survived it**, because the route held
  its own copy of the classification. A library-level test left exactly the gap
  that produced the bug. Six mutations, all caught, after the route-level cases
  were added.
  Not done, and deliberately: **Gelato cannot fulfil an order at all**, because
  no print file exists in this repository to send it — it is now blocked with a
  named reason instead of submitting a fabricated URL, which is what it was
  doing in substance anyway, only failing later and after payment. And the real
  shipping and tax figures are omitted rather than declared zero; carrying the
  values the checkout already computes needs `checkout.ts`, which was under
  concurrent edit by another agent during this run.

  Still open, and named with evidence in the audit: `retail-pilot-intel`
  presents fabricated pilot figures as "key numbers for the close" and asserts
  GDPR technical controls its edge package cannot perform, which is the
  highest-liability instance found so far because a prospect signs a DPIA on
  it; `photo-editing` counts dry-run JSON stubs as materialized deliverables in
  its pilot-readiness metrics, discarding the `renderer_adapter` field that
  would distinguish them exactly one layer before it would be shown, and
  derives its "color calibration" scores from slices of a SHA-256 digest. Five
  ventures of eleven remain entirely unread.
- [ ] Configure and verify Gitea branch/environment protection: pull requests
  only for release branches, current required checks, stale approval dismissal,
  CODEOWNERS, one independent approval for Tier 2, two including an accountable
  owner for Tier 3, and protected production secrets. Owner: infrastructure.
  Retain an exported/screenshot evidence record and audit after workflow changes
  and quarterly; repository YAML cannot prove provider-side settings are active.
  Partial live enforcement verified 2026-08-01 through the Gitea API: `main`
  blocks direct pushes and outdated branches, requires one approval, dismisses
  stale approvals, and blocks rejected or pending official reviews. Still open:
  required status checks await a real pull-request run to establish exact
  context names, production environment approvers/secrets remain unverified,
  Tier 3 cannot yet require two approvals by path/risk tier, and runner
  isolation remains unverified.

- [x] Inventory every active venture's verify commands, test types, coverage,
  production path, data classes, security boundaries, telemetry, and owner.
- [x] Make one fail-closed `verify` command per active venture the local and CI
  contract; remove swallowed failures and undocumented test exclusions.
  The command exists per venture; two of them were not executing, 2026-08-01,
  owner duncan. The box stays checked for what it claims — one declared
  fail-closed command each — but "remove swallowed failures" was not true, and
  the failures were swallowed in three distinct ways worth naming, because each
  is a different hole:
  1. **A gate declared and never called.** `verify-component.sh` has had a
     `local-site-studio` arm — typecheck, lint, test, build — that no workflow
     invoked, so 125 test files, 1214 tests and a production Next.js build were
     verified nowhere. `.gitea/workflows/local-site-studio-ci.yml` now calls it.
     All four steps pass, so the gate went in green.
  2. **A gate called and failing, reported by nothing.** `ai-first-markets` runs
     `verify-component.sh` from both its CI and deploy workflows, and it was red
     on every clean checkout: `npm run typecheck` rejected the `.ts` import
     extensions its own `--experimental-strip-types` runner requires (TS5097),
     and `npm test` failed five assertions across two drifted contracts.
     `ciContract` grepped the deploy workflow for gate commands that d3b61a2 had
     *moved into the shared script*, reading a tightened deploy path as a deleted
     one; it now follows that indirection and is mutation-checked five ways.
     `routeAuthPosture` declared an `/api/subscribe` handler that had not been
     committed alongside the contract declaring it — three failures that d999424
     resolved from the other end by landing the route. Worth recording which way
     that was fixed: the contract was right and the code caught up to it, which
     is what the contract is for. Typecheck, lint, test and build now pass
     together for this venture for the first time.
  3. **A gate that could not see the files it vouched for.** npm runs scripts
     under `sh`, which has no globstar, so an unquoted `src/**/*.test.ts` reaches
     the runner as `src/*/*.test.ts` — one directory level. `ai-first-markets`
     collected its three tests only by their happening to sit at that depth;
     a deliberately failing test placed at `src/app/deep/` was skipped in silence
     and the suite exited 0. The script is quoted now, and the posture-coverage
     control models the difference rather than reading every `**` as globstar,
     so it can no longer vouch for a contract `sh` cannot reach.
  What generalizes: a venture-local test proves nothing until you have checked
  which CI path executes it, and a contract that asserts on the *text* of a
  workflow breaks when the gate it guards is moved rather than removed. Follow
  the indirection instead. The fourth and last known instance of the class was
  `ventures/ai-engineering-academy/site`, registered in the Dagger catalog as
  running `test` while its package.json defined no such script, so the engine
  skipped it and `platform/ci`'s own suite failed on that assertion. Its
  `test.mjs` existed and passed; declaring it as the `test` script closed the
  gap, and the platform/ci suite is 38/38.
  No instance of this class is known to remain open, which is a weaker claim
  than it sounds: nothing generalizes the check beyond route-posture contracts
  and the catalog's own `test`-script assertion, so a fifth would be found the
  same way these were — by running each venture suite at a clean HEAD and
  naming which CI path executes it.
- [ ] Publish coverage reports in CI, capture current baselines, ratchet changed
  code upward, then meet the repository targets without low-value assertions.
  Not started, and worse than not started: the only automated check carrying the
  word coverage is `scripts/ci/test-engineering-policy.sh:42`, which greps
  `ENGINEERING-PRINCIPLES.md` for the sentence stating the 90% floor. Deleting
  every test in the repository leaves it green. No coverage tool is installed
  anywhere (`@vitest/coverage-v8`, `c8`, `nyc`, `pytest-cov` all absent), no
  venture defines a `coverage` script, and no `VENTURE.yaml` carries the
  `engineering.coverage` block `platform/VENTURE.template.yaml` declares. Start
  with a measured baseline and a two-directional ratchet — fail below it and
  fail when it is exceeded without being raised — modelled on the `count` field
  in `platform/exception-register.yaml`. Do not start at 90%.
  Partial, 2026-08-02, owner duncan. That ratchet exists:
  `platform/coverage-baseline.yaml` declares two components,
  `scripts/ci/coverage_ratchet.py` measures and compares them in both
  directions, and `tests/test_coverage_ratchet.py` runs it as a repository
  contract. Nine ventures remain unmeasured, so the paragraph above is still the
  plan for them.
  What the first ratcheting of that gate did is the part worth keeping.
  Both floors were raised the same day they were set — `platform-ci` 52.11 ->
  87.60 and `print-atelier` 91.70 -> 94.07 — each recorded as measured, each
  measured honestly, and both wrong. Node 22 counts a component's own test files
  as covered source and Node 24 stopped doing so. `platform-ci` has one source
  file of 805 lines; the report it was raised onto held 13 files and 3436 lines,
  which is `wc -l test/*.test.mjs src/pipeline.mjs` exactly. Test files execute
  themselves, so 2631 lines of near-total coverage averaged with 805 lines of
  63.98% and produced an apparent 87.60%. `print-atelier`'s 113 files were its 54
  source files plus all 59 of `tests/`. The real figures are 63.98/77.78/78.72
  and 91.81/87.53/79.76, and the engine that decides whether every other
  component passes is again the least covered thing in the repository.
  Three things generalize from it. First, the gate's verdict depended on the
  runner: `.gitea/workflows/ci-cd.yml` pins Node 22 and laptops run newer, so the
  same commit passed in CI and failed locally. Every Node coverage command now
  passes `--test-coverage-include=src/**`, verified to produce identical figures
  on 22.22.3 and 26.4.0, and a contract test fails any node-test component that
  omits it. Second, a percentage is a ratio and every check here compared
  ratios, so nothing could see the denominator move. Each component now declares
  `measured.files` and `measured.lines` and the audit checks them, which is the
  same shape as `count` in the exception register — the evidence was already
  written down in a comment beside the baseline, and being prose it was compared
  to nothing. Third, the dangerous direction is the quiet one: source silently
  dropping out of a report makes coverage *rise*, and a two-directional ratchet
  then reports `baseline-stale` and invites someone to raise the floor over a
  shrinking surface. The basis check is what distinguishes those two cases, and
  no percentage-only check ever can.
- [ ] Require regression tests for fixes and negative authorization/input tests
  for public APIs and server actions.
  Partial, 2026-08-01, owner duncan. Done in one venture, and the way it was
  done is the point. `print-atelier` had 7 API routes and no route-level
  authorization tests; `ventures/print-atelier/tests/api-route-guard-contract.test.ts`
  now enumerates every handler under `src/app/api` and fails unless it either
  calls `requireOperator` or is listed as public with a stated reason. Writing
  that contract found four unguarded handlers that reading the code had missed,
  including `GET /api/stripe/webhook` and `GET /api/stripe/checkout` reporting
  which secrets are configured — see SEC-019 in
  [the security audit log](SECURITY_AUDIT_LOG.md). The negative tests live in
  `tests/operator-route-authorization.test.ts` and each fails against the
  pre-fix handler.
  Measured surface elsewhere, 2026-08-01: `quick-pick-survey` 30 routes with
  integration tests covering auth, admin, trials, couple and usage;
  `local-site-studio` 9 routes with a `route.test.ts` beside each and ~20
  server-action tests; `ai-first-markets` 3 routes and
  `photo-editing/docs-site` 4 routes, both with none. Neither of those two has
  an equivalent guard contract, so the same class of gap is unmeasured there.
  The generalizable piece is the contract shape, not the specific guard: a
  venture-local test that makes every new route declare an auth posture.
  Both of those two now have one, 2026-08-01, owner duncan, in
  `src/lib/routeAuthPosture.test.ts` under each venture. Both guard in
  middleware rather than in handlers, so the contract checks reachability — it
  enumerates the handlers, requires each to declare `public` (with a reason
  naming what makes anonymous access safe) or `guarded`, and then checks that
  declaration against what the middleware actually does with the path. In
  `docs-site` it imports the real `isPublicPath` so it cannot drift; in
  `ai-first-markets` that function is module-local, so it mirrors the rule and
  fails if the original stops matching the mirrored shape. Both fail if the
  middleware matcher stops covering `/api`, and both fail on an empty route
  scan. Each was mutation-checked: a new undeclared handler, a narrowed
  `PUBLIC_PATHS`, a changed matching rule, an `/api`-excluding matcher and a
  moved app directory each fail the intended test and no other.
  Writing the `docs-site` one found SEC-020 — `isPublicPath` exempted
  `startsWith("/api/health")`, which matches siblings and not only children.
  That venture had no test of any kind under `src` before this.
  The contract shape is now a control rather than a habit, 2026-08-01, owner
  duncan. `platform/ci/test/route-auth-posture-coverage.test.mjs` scans
  `ventures/` for route handlers and requires every app package serving one to
  hold either a registered contract or a registered gap. A registered contract
  must exist, must read the app directory off disk rather than assert against a
  hard-coded list, must belong to a package the CI catalog runs `test` for, and
  must be matched by that package's real test script — both script shapes in
  this repository are modelled and an unrecognized one fails rather than being
  assumed to run. A registered gap carries owner, issue, reason, an expiry
  capped at 180 days, and an exact count of undeclared handlers that fails both
  when the unreviewed surface grows and when the register goes stale, as `count`
  does in `platform/exception-register.yaml`. Mutation-checked eleven ways.
  `local-site-studio` has a contract as of the same date, in
  `src/lib/routeAuthPosture.test.ts`. It is the first of the four whose guard is
  neither middleware nor proxy: `src/proxy.ts` matches nearly every path but
  gates only `/dashboard`, so every `/api` handler is reached anonymously and
  the guard is the handler's own `requireOperatorAuth()` call, with no
  deny-by-default behind it. The contract requires each handler to declare
  `public` with a stated reason or `operator`, checks an `operator` handler
  actually calls the guard and acts on the result, and asserts the proxy still
  leaves `/api` alone — if that changes, "declared public" stops meaning
  "reachable" and the test says so. All 10 handlers were reviewed and no
  unguarded operator surface was found; the eight public ones authenticate the
  request (Stripe signature, HMAC unsubscribe token, checkout session id) or
  serve anonymous visitors by design.
  Not yet completed for `quick-pick-survey`, and an earlier revision of this
  paragraph said otherwise. It claimed the venture's contract "covers all 32
  handlers, leaving 0 registered gaps" and that "all 5 route-bearing ventures
  now hold active, verified" contracts. Neither is true on this branch:
  `ventures/quick-pick-survey/src/lib/routeAuthPosture.test.ts` does not exist
  here, and `platform/ci/test/route-auth-posture-coverage.test.mjs` carries
  `quick-pick-survey` as a **registered gap of 32 undeclared handlers** expiring
  2026-11-01. The control was right and the prose was wrong, which is the
  dangerous direction: quick-pick-survey is the only venture serving live
  production traffic, so the claim invited an owner to believe the production
  route surface had been reviewed when it had not. A contract for it does exist
  on `agent/route-posture-repo-gate` (`4be387b`) and
  `agent/route-posture-repo-control` (`2ce17a3`) — two independent versions,
  neither merged here, because each arrives with a competing repo-level control
  (see the integration report). Until one is chosen, the registered gap is the
  accurate statement.
  `print-atelier`'s page routes, as distinct from its API routes, remain
  outside contracts — the coverage control scans for `route.*` modules — and
  auditing those 24 pages found a real exposure rather than a paperwork gap,
  2026-08-02, owner duncan. `/partner-setup` renders a `"use client"` component
  that called `getPartnerCredentialEnvFromProcess()`; the directive marks the
  hydration boundary, not where the code runs, so the server render read live
  credentials and serialised `maskedValue` — the key's real prefix and last
  four characters — into the HTML for anonymous visitors. That is exactly what
  `withoutMaskedValues` exists to strip, and the route guard never saw it
  because the read did not go through a route. `CheckoutRetargetingPanel` had
  the milder form. Both now fetch from the guarded route, and
  `ventures/print-atelier/tests/client-component-env-isolation.test.ts` holds
  every client module to reading no environment and rendering no mask. Still
  open: the other 23 pages have no authorization contract, and several
  (`/admin-portal`, `/ops`, `/sales-portal`, `/investor`) are shaped as
  operator consoles rendering hardcoded module constants — no live data today,
  so wiring them to real data is the moment the gap becomes an incident.
  Now a control, 2026-08-01, owner duncan.
  `scripts/ci/route_posture_contract.py` runs as the CI gate "Route
  Auth-Posture Contract Coverage" against
  `platform/route-posture-registry.yaml`, and a venture that grows its first
  HTTP route fails it until it declares a contract.
  Writing it found that the gap was not the one recorded above. The problem was
  never only that two ventures lacked a contract; it was that a contract which
  exists is not a contract that runs. Measured on a clean checkout:
  `ai-first-markets`' contract is executed by no gate at all **and fails
  outright** — it declares `/api/subscribe POST` and floors at three route
  modules, but that route was never committed, so it went red the moment it
  landed in `4d16bad` and nothing noticed. `photo-editing/docs-site`' contract
  is executed by no gate either. Only `print-atelier`'s ran, and only
  incidentally: it happens to sit in the `tests/*.test.ts` glob the coverage
  component already measures. So the audit checks coverage, execution and
  freshness, and proves the execution wiring rather than believing the label —
  including under `sh` glob semantics, since npm runs scripts under `sh` and
  `ai-first-markets`' `src/**/*.test.ts` reaches its contract only by luck of
  depth. Handler counts are exact and checked both ways, like `count` in the
  exception register; above declared means a route was added and nobody
  declared its posture, which is the case these contracts exist to catch.
  `quick-pick-survey` now has a contract too — the largest surface in the
  repository at 32 handlers, and the only venture serving live production
  traffic. It needed a shape the other three did not: its guards are
  return-value-based, so a presence check would have waved through the four
  handlers that call `getSessionUser()` for attribution only, and its posture
  vocabulary needs a third value for the nine handlers where an unguessable
  participant id is the credential rather than a session. That naming is what
  surfaced SEC-021.
  Coverage went from 12 of 61 handlers held by a contract that runs, to 44.
  Still open: `local-site-studio` (10 handlers) has no contract, and
  `ai-first-markets` and `photo-editing` have contracts that no gate executes —
  all three are registered exemptions with owners and dated expiries, so they
  fail this gate when they lapse rather than staying quietly uncovered. Wiring
  the latter two in needs a `test-ci.sh` gate per venture, which is the same
  missing piece as `print-atelier`'s page routes.
  Closed 2026-08-01, owner duncan. All five ventures that serve app-router
  handlers now have a posture contract, and
  `platform/ci/test/route-posture-contract.test.mjs` makes having one a
  repository-wide gate rather than a habit.
  `quick-pick-survey` (`4be387b`) and `local-site-studio` (`ef33ce9`)
  got the two that were missing; the gate (`c83c196`) fails when a component
  with route handlers has no registered contract, when a contract stops being
  collected by its venture's `npm test`, and when any handler is neither
  declared nor guarded.
  Neither new venture has middleware, so the contracts pin each handler to the
  guard symbol its own body must call. That made a third posture necessary that
  the earlier two contracts did not model: `quick-pick-survey` is anonymous by
  design — answering a survey before making an account is the product — so the
  boundary that matters is not whether a session exists but whose rows a
  handler may touch. `owner-scoped` carries it, checked against
  `participantAccess`, and a handler that reads a participant id from a request
  body without it is an IDOR against the couples privacy promise.
  Two things the enumeration found that reading the code had not:
  `/api/og/couple-card` is a `route.tsx`, so a manual survey of `route.ts`
  missed it entirely (it is public and cannot leak — it renders query
  parameters and never looks a couple up); and `local-site-studio`'s
  `requireOperatorAuth` admits *every* caller when `OPERATOR_DASHBOARD_PASSWORD`
  is unset, which is a deliberate local-demo affordance but was only a code
  comment. Its two operator routes — one of which creates live Stripe Price
  objects — are therefore claims about a deployment, not about the code. That
  condition is now executable in the contract; setting the password before that
  venture serves real lead data remains an operator action, tracked on its
  launch checklist.
  Still open: `print-atelier`'s page routes as distinct from its API routes,
  and the gate checks that every handler is *accounted for*, not that every
  venture's guard is equally strong — the per-venture contracts carry that.
- [ ] Hold every test to deciding on its inputs rather than on the machine it
  runs on. Owner: venture owner. Not started as a repository-wide control; one
  instance found and fixed.
  2026-08-04, owner duncan. Five tests in
  `ventures/photo-editing/tests/test_cli.py` passed or failed on the free disk
  space of the host. `shootflow.storage._rank_candidate` gives a volume the
  `destination` role only when it reports **more than 64 GiB free**; the tests
  build their fake `Volumes/EOS_DIGITAL` and `Volumes/Samsung_T7` inside a
  `tempfile.TemporaryDirectory()`, so `free_bytes` came from `os.statvfs` of the
  real filesystem. On a machine with 59 GiB free no destination is selected,
  every route reports `blocked`, and five tests fail for a reason none of them
  is about. They are green on a roomier machine and were green when this
  candidate was last verified, which is why nobody had seen it.
  Two of the five are the reason this is filed rather than just fixed. The
  symlinked-destination tests are **security guards** — they assert the CLI
  refuses to write through a symlink out of the destination volume. Below the
  threshold the command exits before it ever reaches the symlink check, so the
  test reported the guard broken; above it, the guard ran. Neither outcome was
  evidence about the guard. A test whose subject is reached only on a
  sufficiently empty disk is not testing what it claims on any host.
  Fixed by `pin_volume_free_space` in that module: the five tests now write a
  `--volume-metadata-json` file stating the free space the route depends on, a
  seam the CLI already had and that two neighbouring tests already used. All 68
  tests in the file pass, and mutation-checked in the direction that matters —
  deleting `_reject_symlinked_existing_subfolder_components` fails the
  broken-symlink test, and deleting the containment check as well fails both, so
  the guards bind now on any host rather than only on a roomy one.
  Not done, and this item stays open for it: nothing looks for the general case.
  A test that reads `os.statvfs`, the wall clock, the network, `$HOME`, or the
  host's locale is invisible until the day the machine changes, and this
  repository runs its suites on developer laptops and on CI runners with very
  different amounts of free disk. The cheap version is a scan for tests that
  reach real-filesystem or real-clock facts without a seam; the honest version
  is running the repository suite under a constrained environment in CI so the
  coupling fails there rather than in a year.
- [ ] Make repository policy, secret history, SAST, SCA/license, IaC, container,
  and image scanning required checks; repair the current failing security jobs.
  Partial, 2026-07-31, owner duncan. Repaired: the CI engine no longer reports
  PASSED for a component it never verified — a missing scanner script, a stale
  catalog directory, a moved Python test path and a failing `terraform validate`
  were all skip-and-pass, and `platform/ci/test/fail-closed.test.mjs` now covers
  each. `.gitea/workflows/security.yml` fails if a run retains no evidence.
  SAST landed 2026-08-01, owner duncan: `scripts/ci/sast_scan.py` runs Semgrep
  (`p/default`, 1074 rules) and Bandit from the `sast` job in
  `.gitea/workflows/security.yml`, fails closed on any unregistered finding, and
  is held to its register in both directions by `platform/sast-baseline.yaml`.
  Process, remediation order and limits in [SAST](SAST.md). Two things there are
  worth carrying forward rather than reading as done. First, the obvious
  configuration was nearly inert: `p/javascript` + `p/typescript` + `p/nextjs`
  loaded 74 rules for a TypeScript file and detected neither `eval(userInput)`
  nor `exec("ls " + userInput)`, so it would have been a green SAST check over
  710 TypeScript files finding almost nothing. Second, 191 of the 195 findings
  are registered as `inherited` — counted and count-locked, not assessed —
  because claiming otherwise would have been false; 19 are error-severity and
  the highest-value group is 6 GitHub Actions script injections.
  Still open: Trivy runs `vuln,misconfig` but not `license`, no SBOM, no
  container or published-image scanning. `license` specifically must not be
  enabled by just adding the scanner: measured 2026-08-01, it returns zero
  findings because it cannot read licences without `node_modules` installed and
  reports clean anyway, so in the current `scan` job it would be a permanently
  green check that measures nothing.
  The SCA half is measured and bound as of 2026-08-02, owner duncan, and what
  it measured is SEC-027 in [the security audit log](SECURITY_AUDIT_LOG.md).
  `.gitea/workflows/security.yml` has always run a `dependency-audit` job over a
  hand-written matrix of four ventures; the repository tracks ten Node
  lockfiles. The six nobody audited held **32 high-severity advisories**, the
  worst a Next.js middleware/proxy bypass in `local-site-studio` — the one
  venture whose route guard is the handler's own call with no deny-by-default
  behind it. The matrix now lists all ten, and
  `platform/ci/test/dependency-audit-coverage.test.mjs` scans git for lockfiles
  and fails when one is neither audited nor a registered, owned, expiring,
  counted exception, when an entry's manager does not match its lockfile
  (`npm audit` in a pnpm workspace succeeds without reading anything), and when
  the audit is made incapable of failing. Mutation-checked thirteen ways.
  Two things are worth carrying. Most advisories are **not** fixed: 46 of 47
  remain. The two whose fixes were not semver-major were taken the same day —
  `local-site-studio` to next 16.2.12 and `photo-editing/docs-site` to 15.5.22,
  verified at 1214 and 40 tests plus a green `next build` each — and in both,
  `next` now carries no CVE of its own and is flagged only through `postcss`
  and `sharp`, for which npm's proposed fix is a downgrade to next@9.3.3 and so
  no forward fix exists. The remaining 40 need semver-major bumps of
  `eslint-config-next`, `wrangler` and `sharp`, and two of the three
  `real-estate-agent-photo-app` packages holding 24 of them have **no test
  script at all** — an upgrade there has nothing to verify it, which makes the
  missing suite the blocking work rather than the bump. And the two ventures already in the matrix
  that fail — print-atelier at 7 and retail-pilot-intel at 8 — have been
  failing into a job nothing blocks on, because required status checks remain
  unconfigured. That is the same finding as the release-lag one below: a
  control that reports into a channel with no gate behind it is a control
  nobody has to answer. The three Python manifests are registered exceptions
  expiring 2026-11-30, blocked on pip-audit in the runner image, which belongs
  to this item's remaining SAST/SCA tooling work.
  **2026-08-04, owner duncan: the control found a lockfile by being given
  one.** `platform/ci/package-lock.json` had never been committed, so the
  coverage test — which enumerates *tracked* lockfiles — had nothing to demand
  an audit of, and the component that runs every gate in this repository was
  the one package in it nobody audited. Committing the lockfile surfaced 6 high
  and 19 moderate advisories, none of which `npm audit fix` clears:
  `@dagger.io/dagger` pins `adm-zip` below the 0.6.0 that fixes
  GHSA-xcpc-8h2w-3j85, and still does at 0.21.8, five minors above what was
  pinned here. The SDK was already reached through a dynamic `import()` inside
  a try, for a containerized path that needs a daemon no host in this fleet
  has, so it is no longer declared as a dependency: `platform/ci` now has none
  at all and audits clean. `platform/ci/test/dagger-optionality.test.mjs`
  holds that shape, because re-adding the import to the manifest reintroduces
  25 advisories without changing a line of behaviour and would read as a
  tidy-up. Its daemon preflight had to become injectable first — with no Docker
  CLI present the probe returns before the SDK branch, so a test of the
  fallback would have passed without executing it.

  **2026-08-04, owner duncan: the scanner that reports the findings could not
  fail on them.** `scripts/security-scan.sh` had exactly one `exit 1` — the
  incomplete-audit refusal. Once an audit *completed*, the script wrote
  `SECURITY_ROADMAP.md` and fell off the end, returning 0 whatever it had
  found, and `pipeline.mjs:382` printed "✔ Vulnerability & Secret Audit
  PASSED" over it. The gate was therefore strictest when it knew least: a
  hardcoded credential blocked a run that could not reach the registry, and
  passed the run that audited every package successfully. The dashboard that
  same run writes says CRITICAL means "Block Release"; nothing enforced the
  sentence. This is one past "a gate that cannot fail" in the same direction as
  SEC-022 — not a missing control but a control whose *reporting* half was
  complete and whose *refusing* half was never written.
  Its own suite held it in place. `scripts/security/test-security-scan.sh`
  drove a fixture carrying one CRITICAL advisory and asserted the scanner
  exited **zero**, under the title "a scan that finds vulnerabilities should
  still publish the roadmap". Publishing the finding and refusing the run are
  separate obligations; the test asserted only the first, so the suite covered
  the fail-open rather than uncovering it. That is the general lesson here: a
  test written from the recording obligation will pass over a missing blocking
  obligation, because both are true of the same green run.
  Both obligations now hold. The roadmap is still written before any exit below
  it, so findings survive; then a committed secret or a CRITICAL advisory exits
  1. The secret case has no waiver — a committed credential is compromised
  whether or not the dependency audit ran. Mutation-checked: disabling the new
  branch fails the two new assertions and only those.
  HIGH is deliberately left ungated, and the reason is recorded in the script
  rather than in a number. A complete audit of this repository is not reachable
  today — three packages fail `npm audit` with `EOVERRIDE` — so a live run
  measures 0 CRITICAL / 16 HIGH across 8 of 11 packages. Any HIGH ceiling
  seeded from that would be a declared figure the control could not reproduce,
  which is the defect class recorded against the coverage register above.
  Closing that gap means fixing the three `EOVERRIDE` manifests first; that is
  the open work this item now carries.
  Note what does *not* change today: `verify-all.sh:8` defaults
  `SECURITY_SCAN_ALLOW_OFFLINE=1`, and the `EOVERRIDE` gaps send every local
  and CI run down the incomplete branch, which exits before the new code. The
  refusal binds the day the audit completes, which is the day it should — but
  until then this control is reachable only in principle, so it does not yet
  discharge the item.

  **Reconciled 2026-08-04.** `agent/profit-lever-2026-08-02` built the same
  lockfile-coverage control independently, as
  `platform/ci/test/workflow-supply-chain.test.mjs`. This one was kept and that
  one deleted; its pinning half survives as
  `platform/ci/test/workflow-action-pinning.test.mjs`. The paragraphs below are
  the comparison that decided it, left in place because the reasoning is the
  reusable part.
  That one additionally checks every third-party action is pinned to a commit
  SHA, which this one does not and which was kept. This one additionally
  fails when a matrix entry's `manager` does not match the committed lockfile
  (`npm audit` in a pnpm workspace reports success without reading anything),
  when an audit command carries `|| true` or drops `--audit-level`, on
  `continue-on-error`, and on `fail-fast: true`; and it registers the three
  Python manifests, which that one does not scan.
  They also disagree on policy: that branch leaves the five vulnerable
  lockfiles out of the matrix as exceptions expiring 2026-11-01, so CI stays
  green; this one puts all ten in and lets the failures show. **Two of those
  five exceptions are factually wrong.** `local-site-studio`'s reads
  "advisories need a semver-major Next 16 upgrade" — it was already on Next
  16.2.9 and the fix was the patch to 16.2.12 taken above; `photo-editing/
  docs-site`'s reads "need a semver-major upgrade" and its direct CVEs cleared
  inside its existing `^15.2.4` range. An exception's stated reason is load-
  bearing, and re-testing these two is what showed the reason had not been.
  The host gap that kept named checks from executing in CI is closed
  (`316d814`): `.gitea/workflows/ci-cd.yml` installed only Node, so gate 1
  failed on a clean runner and `set -euo pipefail` in `scripts/verify-all.sh`
  aborted before the Dagger engine ran at all — none of the fail-closed work
  above actually bound in CI. It now installs Python 3.11 with
  `requirements-ci.txt`, the Pairwise and print-atelier venture dependencies,
  ShellCheck, actionlint (checksum-verified) and Terraform, and a missing
  linter fails instead of printing a skip notice.
  `platform/ci/test/ci-workflow-tooling.test.mjs` holds the workflow to the
  tools `scripts/test-ci.sh` invokes, so a new gate needing new tooling fails
  until the install step exists. Not yet verified on a real runner — the
  evidence is local (`bash scripts/test-ci.sh` green, actionlint and ShellCheck
  clean, each tooling pattern mutation-checked); a first CI run is what would
  confirm it.
  The same gap one level down is closed, 2026-08-01, owner duncan (`10cbb14`).
  The workflow installs venture dependencies for `quick-pick-survey` and
  `print-atelier` only, because those two are needed by gates in
  `scripts/test-ci.sh` that run before the engine. `verifyPnpmHost` installed the
  pnpm workspace when `node_modules` was absent; `verifyNodeHost` installed
  nothing, so every other Node component in `VENTURE_CATALOG` reached
  `npm run <script>` on a clean runner with no dependencies and died on
  ERR_MODULE_NOT_FOUND — a dependency failure reported as a broken component,
  firing precisely when affected-path detection selected a changed venture. The
  engine now installs what it verifies, with `npm ci` where a lockfile exists.
  `platform/ci/test/venture-dependency-install.test.mjs` holds it, mutation-checked
  four ways, and also requires a committed lockfile for every Node component that
  declares dependencies.
  What that turned up is the point: five components had no CI run that had ever
  executed their suites, and all five verify end to end at `HEAD` once the engine
  can install them — `ai-first-markets`, `photo-editing/docs-site`,
  `ai-engineering-academy/site`, `real-estate-agent-photo-app`, whose five test
  files were confirmed by moving `node_modules` aside and watching the component
  fail before this change and pass after it, and `local-site-studio`, the largest
  suite in the repository at 125 files and 1214 tests. So the work these gates
  were never running was passing work; the gap was the runner, not the ventures.
  Verified for `local-site-studio` in a detached worktree at `HEAD` with a real
  `npm ci`, because a `node_modules` symlink no longer suffices — Turbopack
  rejects one that points outside the project root.
  Two things remain open, neither belonging to this change. `next build` fails in
  the current working tree, from the concurrent agent's uncommitted `webpack`
  config: Next.js 16 makes Turbopack the default and errors when a `webpack`
  config appears with no `turbopack` config beside it. `HEAD` builds clean, so this
  is in-flight work to finish rather than a defect in the venture.
  Affected-path detection is fixed, 2026-08-01, owner duncan. The entry above
  described the defect as narrowing to the last commit of a push. That was true
  of the code read on its own, but not of what ran in CI, and the difference
  mattered more than the original claim. `.gitea/workflows/ci-cd.yml` checked out
  with `actions/checkout`'s default `fetch-depth: 1`, so `HEAD~1` did not exist in
  the checkout at all: the diff threw on every run, the `catch` returned null, and
  `resolveAffectedComponents` read null as "verify everything". Confirmed against a
  real `--depth 1` clone, where `HEAD~1` is an unknown revision. So the engine was
  never selecting anything in CI — it ran the full catalog every time while
  logging `Affected Path Detection: Found N affected component(s)`, which read as
  a considered selection and was in fact the catalog length. The narrowing defect
  was real only where full history existed, which is local runs.
  `getChangedFiles` now resolves an explicit range instead of a default: the
  branch diff on pull requests, and on pushes `before...HEAD` from the event
  payload, which spans every commit the push carried rather than its last one.
  `HEAD~1` is gone as a fallback and a test fails if it returns. Every path that
  cannot resolve a base — new ref with a zero SHA, force-pushed tip that is no
  longer present, shallow checkout, unreadable event payload, no event at all —
  widens to the full catalog and says why, so the log distinguishes a selection
  from a fallback. The checkout now uses `fetch-depth: 0`, and a test binds that
  depth to the engine's need for history, since detection is inert without it.
  Closing this made a latent hole live and it had to be closed in the same
  change: with detection finally resolving, a changed file that matches no
  component and no global trigger selects *nothing*, and an empty selection
  reports as a pass. `tests/`, `pytest.ini`, `requirements-ci.txt`,
  `platform/coverage-baseline.yaml` and `platform/exception-register.yaml` all
  behaved that way — each decides how every component is verified — and are now
  global triggers held by a test that also fails if one is renamed away.
  Eleven tests in `platform/ci/test/affected-path-detection.test.mjs`, each
  mutation-checked. Not yet observed on a real runner: the push payload shape is
  taken from Gitea's documented GitHub compatibility, and if it turns out to
  differ the resolver returns null and the behaviour is the full run that has
  been happening all along. A first CI run is what would confirm it, and the
  honest log line is what will show it.
  is in-flight work to finish rather than a defect in the venture. And the engine
  reaching a venture at all still depends on affected-path detection, which is
  narrower than it reads: `getChangedFiles` defaults to `HEAD~1`, so a push
  carrying several commits verifies only the components the *last* commit touched.
  A change to a venture in the middle of a push, followed by a docs-only commit,
  selects nothing. `GITHUB_BASE_REF` widens this to the full branch diff on pull
  requests, so the hole is on direct pushes — which is also where the weakest
  review is. Fixing it means diffing the push range rather than one commit, and
  wants a real runner to confirm what the Gitea event actually provides.
  Two supply-chain claims the docs stated as fact are now checked, 2026-08-02,
  owner duncan: `platform/ci/test/workflow-supply-chain.test.mjs` fails on any
  `uses:` that is not a 40-character SHA with a version comment (all thirty were
  already pinned, so this guards a regression `actionlint` cannot see), and on
  any lockfile absent from both `security.yml`'s `dependency-audit` matrix and a
  dated, owned exemption list. That matrix named four of the ten lockfiles on
  disk. Because the scanner writing `SECURITY_ROADMAP.md` walks the whole tree,
  the other six had their findings logged while no merge was blocked on them —
  the register said "tracked" and the gate covered nothing. One of the six was
  clean and is now in the matrix; five are exempt to 2026-11-01 because every
  remaining advisory needs a semver-major upgrade (Next 16, wrangler 4,
  sharp 0.35), which is an upgrade with its own verification rather than
  something to fold into this change. `npm audit fix` without `--force` was run
  against all five and cleared none of them.

  The action-pinning claim the docs stated as fact is now checked, 2026-08-02,
  owner duncan. `platform/ci/test/workflow-action-pinning.test.mjs` fails on any
  `uses:` that is not a 40-character SHA carrying a version comment. All forty
  were already pinned, so it passed on its first run — which is the point rather
  than a reason to skip it: `actionlint` does not check pinning and nothing else
  looked, so `uses: actions/checkout@v4` would have satisfied every gate in the
  repository, and a mutable tag is a third party's write access to our CI.
  It arrived on `agent/profit-lever-2026-08-02` welded to a second, weaker copy
  of the lockfile-audit control, and **the two disagreed on policy in the
  direction that matters.** That branch left five vulnerable lockfiles out of
  `security.yml`'s matrix as exemptions expiring 2026-11-01, so the job would
  stay green; the version already here puts all ten in and lets the failures
  show. The pinning sweep was kept, the duplicate control was deleted, and the
  five exemptions were rejected — two of them were factually wrong.
  `local-site-studio`'s read "advisories need a semver-major Next 16 upgrade"
  when the venture was already on Next 16.2.9 and the fix was the 16.2.12 patch
  since taken; `photo-editing/docs-site`'s named two of that package's eighteen
  findings, mischaracterised both, and omitted its two CRITICALs. An exception
  describing two of eighteen findings is not a decision anyone could review.
  What generalizes is the shape of the disagreement rather than the two wrong
  reasons. Both branches produced a control with the correct fields — owner,
  issue, reason, expiry, count — and only one of them was covering an unread
  surface. The register's *form* was satisfied in both. `ENGINEERING-PRINCIPLES.md`
  already says not to silence a scanner to make CI green, and nothing mechanical
  distinguishes a well-formed exception written because the work is scheduled
  from a well-formed exception written because the gate was red. Reading the
  reasons against the roadmap they cite is what found it, and no gate does that.
- [ ] Protect `main` in Gitea: required checks and review, no force push, no
  deletion, and least-privilege Actions tokens and isolated runners.
  The entrypoint that runs every gate above could skip them all, closed
  2026-08-02, owner duncan. `scripts/verify-all.sh` guarded its first step with
  a bare `if [ -f scripts/test-ci.sh ]; then … fi` and no `else`, so renaming or
  deleting that one file made all fourteen repository-wide gates — including
  every `platform/ci/test/*.test.mjs` — silently not run while the script still
  exited 0. The Dagger-engine block directly beneath it already had the correct
  `else … exit 1`, so the two halves of the same entrypoint disagreed about
  whether a missing runner is a failure. Found alongside it:
  `scripts/ci/test-verify-component.sh`, the contract test for the shared
  fail-closed gate every venture workflow shells into, was named by no runner
  and no workflow and had therefore never executed since it was written; it
  passes, so it was dormant rather than broken, and it is now gate 4 in
  `scripts/test-ci.sh`. `platform/ci/test/gate-wiring.test.mjs` fails on both
  shapes: a guarded runner invocation with no failing `else`, and a `test-*.sh`
  under `scripts/` that no runner or workflow names.
  Partially configured live on 2026-08-01 as recorded above; required status
  contexts and environment/runner controls remain open. Prepared 2026-07-31:
  `.gitea/CODEOWNERS` had a rule for
  `/SECURITY-ROADMAP.md`, which matches no file, so the vulnerability register
  was unowned; the CI engine, the exception register and the audit scripts were
  unowned too. Corrected and held by
  `platform/ci/test/codeowners-contract.test.mjs`. This is inert until
  protection is switched on. `platform/terraform/` still has no Gitea provider
  or `branch_protection` resource, and there is one Act Runner, so the split
  between untrusted verification and protected release runners does not exist.
- [ ] Hold every venture contract's `links.production` to naming a host this
  repository can actually serve.
  Done for the repository-side half, 2026-08-02, owner duncan. `links.production`
  is the field that says a customer can reach a venture, and the only rule
  guarding it asked whether it was *set*. Of the three ventures that declared
  one, `retail-pilot-intel` pointed at `https://retail-pilot-intel.pages.dev`,
  which resolves nowhere: the name follows the Cloudflare Pages convention while
  the venture's `deploy-docs.yml` publishes to GitHub Pages, and that workflow
  sits in a venture subdirectory of a Gitea repository, so it has never run. The
  hostname appeared exactly once in the entire tree — in the contract claiming
  it. A venture nobody can reach cannot earn, and promoting it to `launched`,
  which raises its stage weight from 0.55 to 0.75 and moves real budget, would
  have passed clean. Set to `null`; the two survivors are genuinely deployed
  (`pairwise.marisstella.dev` by `platform/k8s/apps/quick-pick-survey/ingress.yaml`,
  `listing-lens-docs.pages.dev` by its deploy workflow and Access script).
  `portfolio/router/validate_ventures.py` now requires the hostname to be named
  by deployment or operations machinery — a workflow, deploy script, k8s or
  Terraform config, or a recognised host-config file. The exclusions are the
  control: prose does not count, because a README sentence claiming a venture is
  live is the claim under test rather than evidence for it, and a repo-wide grep
  would let any such sentence satisfy the rule; a `VENTURE.yaml` cannot vouch for
  itself; tests and fixtures do not count. Matching is hostname-bounded, so
  `notexample.com` and `example.com.attacker.net` do not back `example.com`.
  Omitting the backed set fails closed rather than skipping the rule. Severity is
  `warn` at `prototype` and `error` once stage weighting draws budget on the
  claim; both fail `--strict`, which is how `scripts/test-ci.sh` runs it.
  29 tests, 17 mutations, every one killed.
  Not done, and it is the half that would have caught this directly: nothing
  checks that the URL *responds*. The dead hostname was found by hand with
  `curl`. The repository-side rule is a proxy — it proves the repository knows
  how to put something at that hostname, not that anything is there now. A live
  check needs the third-state treatment `scripts/ci/release_lag.py` uses for a
  shallow clone, so that "offline" reports `NOT MEASURABLE HERE` rather than a
  pass. `links.analytics` is null for all 12 ventures and is unchecked.
- [x] Define an owner and expiry for every suppression, quarantine, skipped
  check, accepted vulnerability, and policy exception.
  Owner duncan, completed 2026-07-31. `platform/exception-register.yaml` holds
  the register, `scripts/ci/audit_exceptions.py` fails closed on unregistered,
  expired, and stale entries, and `tests/test_audit_exceptions.py` runs it as a
  repository contract. Process and remediation plan in
  [the exception register](EXCEPTION-REGISTER.md); accepted vulnerabilities
  remain tracked as `SEC-xxx` in [the security audit log](SECURITY_AUDIT_LOG.md).
- [ ] Hold customer-facing copy to behaviour the code actually performs. Owner
  duncan, opened 2026-08-01.
  Every claim a venture makes to a visitor — a confirmation, a capability, a
  price, a statistic, a security posture — is either backed by something the
  code does or it is a false statement. The repository has no control for this,
  and an audit of the four ventures with a live or near-live surface found it
  is the most common defect class in the portfolio, ahead of anything found by
  the security or coverage work. The diagnostic that finds them: ask what would
  be *observably different* if the handler were replaced with `return ok()`.
  Three fixed on 2026-08-01, each with a test that fails against the pre-fix
  code:
  Pairwise shared every insight card with the literal link
  `https://quickpick.app` while the product is served from
  `pairwise.marisstella.dev`, so every recipient of the one artefact that
  reaches non-users landed off-product; and `alignmentPct` defaulted to `85`,
  so a couple with no computed overlap could share "85% Aligned" as their own
  result. `ShareInsightModal.test.tsx`, mutation-checked (5 of 7 fail on the
  pre-fix component).
  Listing Lens sold a $19 shoot including "sky replacement where needed, and
  perspective/vertical correction applied to every kept shot"; `enhance.ts`
  does `.rotate().resize().normalise().sharpen().jpeg()` and never did either.
  `process/mls-compliance.ts` already said so in as many words — the venture
  knew, and nothing connected the two files. Both named edits are also
  disclosure-triggering in strict states (CA AB 723, NY, TX), so the copy
  advertised an edit nobody can perform *and* a delivery this venture does not
  produce. `pipeline/src/offer-claims.test.ts` scans the three customer-facing
  copy files for five restricted alterations, each carrying the code signal in
  `enhance.ts` that would make its claim true, so building the capability
  unlocks the claim by itself — a contract, not a word blocklist.
  Listing Lens docs claimed "Private — Cloudflare Access" on every page while
  answering an unauthenticated GET with 200 and the whole site. SEC-023; fixed
  by ordering the policy before the publish and probing the result from
  outside.
  Still open, found by the same audit and not yet fixed:
  Pairwise's Double-Date Challenge builds a link to `/couple/challenge/<code>`
  and `src/app/couple/` contains only `page.tsx`, so every challenge link
  404s — and `route.test.ts` asserts the exact dead URL, pinning it. Its
  `$9/month` "Pairwise Together" tier has no payment path anywhere in the
  venture (no Stripe dependency, no subscription model), carries a "Most
  Popular" badge on a plan nobody can buy, lists an "Exportable Value Summary
  PDF" that no code generates, and gates none of its features.
  `api/og/couple-card/route.tsx` renders the same dead host and defaults to an
  invented "88%" — left alone because the concurrent agent has uncommitted
  changes in it.
  The feedback widget is fixed, 2026-08-02, owner duncan. It answered "that
  helps tune the next insight for you" while `insightFeedback` is never read by
  insight generation, and `FeedbackWidget.test.tsx` asserted that string. This
  one mattered more than its size suggests: `quick-pick-survey` is the only
  venture serving live production traffic, so it was a false statement being
  made to real people, and the promise it made — that giving feedback improves
  what you personally see next — is the kind a person acts on. The record is
  written by `/api/feedback` and read by the admin overview and export, so a
  person does read it; nothing under `src/lib`, where insight generation lives,
  reads it at all. The copy now says the true half: "we read every one of
  these."
  The guard is a capability contract rather than a corrected string, which is
  the shape this item keeps asking for. It scans every module outside the write
  path and the two admin read paths for a consumer of `insightFeedback`, and
  only while there is none does it forbid a personalization promise in the
  confirmation copy. Build the loop and the claim unlocks itself. Both
  directions were mutation-checked, and the second direction is the one worth
  insisting on: with the claim restored *and* a consumer added, the contract
  passes and only the copy assertion fails, which is what distinguishes a
  contract from a word blocklist someone will later delete. A second assertion
  ties the surviving weaker claim to the write path, so "we read every one of
  these" fails if the route stops persisting. Venture verify green end to end:
  typecheck, lint, 411 tests across 57 files, production build.
  AI Engineering Academy: all four fixed 2026-08-02, owner duncan, and the
  venture is worth reading as the fullest worked example of this item.
  The checkpoint answered "Checkpoint passed! Schema structure verified.
  Portfolio point awarded (+25 pts)" to any input over ten characters, storing
  nothing and validating nothing; the sandbox printed a hardcoded trace ending
  "12/12 passing" with no model or execution behind it; the "Always Free" tier
  listed four features that do not exist; and `site/test.mjs` asserted both
  handlers were *present*, so the suite protected them.
  The checkpoint is now a real grader. `site/checkpoint-validator.mjs` holds six
  rules the question actually asks for — parses, `type: "object"`, non-empty
  `properties`, a `required` naming declared properties, `additionalProperties:
  false`, and the injection-relevant one: every string parameter carries an
  `enum`, `pattern`, `maxLength`, `format` or `const`, because an unconstrained
  string is the hole the question is about. It is written once and inlined into
  the page by `build.mjs`, so the rules under test are the rules the learner
  meets; a contract fails if the built page stops carrying that source. This is
  the direction worth preferring where it is available — the fake was replaced
  with the real thing rather than deleted, so the free tier gained a working
  lead magnet instead of losing a feature.
  The sandbox trace keeps its teaching value and drops the fabrication: no
  timings, no invented pass counts, an explicit "no model is called, no code is
  executed" notice, and — new — stages that belong to the track selected, since
  all three tracks previously printed Track 1's test-suite story. The pricing
  page now separates "available now" (three items, each with a test naming the
  file that makes it true, so a claim cannot outlive its evidence) from
  "designed, not yet built", and marks both unbuyable tiers unavailable.
  Two further defects the audit had not named. The cost estimator asserted
  "$142.50 / mo Retail LLM & Compute Value" and "65% Savings" from two invented
  rates — $1.50/sandbox-hour for a sandbox that does not exist and $0.35/mentor
  query, roughly an order of magnitude above published API pricing — and floored
  the saving at zero, so every input where the subscription was the worse deal
  still displayed a saving. Both rates are visitor-editable now, labelled as
  placeholders rather than quotes, and the difference is reported in both
  directions. An inflated comparator manufacturing a savings percentage is the
  shape of this class that carries the most legal exposure, and it is the one
  the audit's "what would be observably different if the handler returned
  `ok()`" diagnostic does not find, because there is no handler.
  And the class this venture adds: **a page can be honest and still be
  unreachable.** Every one of the ~20 classes the two generated pages used —
  `.pricing-card`, `.btn`, `.console-box`, `.modal-overlay` among them — was
  defined nowhere in `style.css`. The venture's only conversion surface rendered
  as unstyled text, and `.modal-overlay` with no positioning meant pressing
  "Join the waitlist" appended the form to the foot of the document instead of
  opening it over the page, so the CTA read as broken. The suite now fails if a
  class used by the generated markup has no rule, matched as a whole token —
  substring matching passed on a *renamed* rule, which the mutation run caught.
  57 classes checked.
  The suite is the point as much as the fixes: it drives the page's own inlined
  script in a `node:vm` and grades through `verifyCheckpoint`, so a syntax error
  in the inlined validator fails rather than shipping silently, and it executes
  the estimator's arithmetic rather than grepping for the old expression — the
  first version of that assertion was pinned to a variable name and survived the
  floor being reintroduced under a different one. Mutation-checked 20 ways, all
  20 caught. Not done: no real-browser check ran. The browser tooling timed out
  twice in this session, so layout, contrast, focus rings and the modal actually
  overlaying are argued from the stylesheet rather than observed, and this
  venture is not in the Playwright item's priority order.
  Its waitlist flow remains the model to copy — it refuses to claim delivery
  ("your application has not been sent yet") and a test guards against
  regression. One gap there is closed too: the "Request Team Access" button
  opened the individual $49/mo Pro form verbatim, so a team lead asking about
  seats was shown a consumer signup; both routes still reach the same inbox, but
  the copy and the mail subject now say which was pressed.
  `retail-pilot-intel`'s `VENTURE.yaml` declares
  `production: https://retail-pilot-intel.pages.dev`, which does not resolve;
  the venture has no Cloudflare project, config or workflow, and its portal is
  built in CI and uploaded as an artifact only. Its `kill_criteria` are
  measured against a "sales demo availability" that was never achieved. Not
  corrected here: `portfolio/router/README.md` reserves venture-metadata
  changes for the portfolio owner.
  The generalizable control is the `offer-claims.test.ts` shape — enumerate the
  copy surface, enumerate the claims that need a capability, and name the code
  signal that grants each one. It is not yet a repository-wide control, and it
  should become one; a venture-local habit is what let all of the above ship.
  The price half is now a control, 2026-08-03, owner duncan.
  `local-site-studio` is the venture with a real checkout, and
  `src/lib/pricing/bundles.ts` is the field the Stripe Checkout Session is built
  from — `POST /api/stripe/checkout` resolves the tier there, and
  `bootstrap-stripe-prices.ts` creates each Stripe Price at exactly that
  `unit_amount` — so that field decides what a card is charged. Nothing bound
  the advertised amount to it. Twenty-six places restated the sold price as a
  typed string and only three read it: the checkout form, the tier upsell and
  the checkout route, all three at or after the checkout step. Everything a
  buyer reads *before* deciding to pay was unbound — the three pricing cards and
  the hero, the meta description search results show, the preview "Claim this
  site" CTA, six publicly reachable `/docs` pages (`src/proxy.ts` gates only
  `/dashboard`), and the script the AI phone agent reads to callers. Moving
  `monthlyPriceUsd` from 99 to 129 would have moved the charge while every one
  of those went on advertising $99, with nothing failing.
  The transactional surfaces now derive from `BUNDLES`, so they cannot disagree
  with it, and `src/lib/pricing/advertised-price-claims.test.ts` holds the prose
  pages: it walks the copy surface off disk and fails when any stated amount is
  not a price the venture currently sells. It found a `$99` still typed into the
  landing page while it was being written. Mutation-checked eight ways.
  The generalizable half is
  `platform/ci/test/advertised-price-coverage.test.mjs`, which requires every
  package that states a price **and** offers a way to pay to hold a registered
  contract or a counted, expiring gap. That second condition is what makes the
  register readable: scanning for price literals alone matches 10 packages and
  841 amounts, most of them market sizing in business plans, where a claims
  contract would be paperwork. With a payment path required it is 4 —
  `local-site-studio` (covered), `print-atelier`, `ai-first-markets`, and
  listing-lens `docs-site`. Mutation-checked eleven ways.
  Three things this does not do. It does not check what a contract *says*;
  where the sold amount lives is a venture-local judgement. It does not cover
  non-price claims — a capability or a statistic asserted in copy is the larger
  and still-open half of this item. And it says nothing about a price advertised
  with **no** payment path: `quick-pick-survey`'s $9/month tier and
  `ai-engineering-academy`'s $49/mo tier are both advertised, both carry a "Most
  Popular" badge, and neither venture has any payment path at all. That is a
  worse defect than drift and it is a product decision, so it is named here
  rather than gated. `listing-lens` `docs-site` is the third shape again: its
  $19 is real but collected by hand over Zelle or PayPal, so there is no charged
  amount in code to bind it to, and the package declares no `test` script to
  hold a contract even if one were written.

  The capability half is now a control too, 2026-08-04, owner duncan, and the
  interesting part is where it had a hole. `capability-claims.test.ts` binds an
  advertised *capability* to whether the implementing code exists, and it
  exempted the whole `/docs` tree — reasoning that those pages state the gap
  honestly ("Until Twilio is live, operators fulfill with a generated FAQ/script
  pack"). That was true of the sentence it was written against. It was not true
  of the tree, and `/docs` is not behind the password: `src/proxy.ts` gates only
  `/dashboard`, so those pages are copy a prospective buyer reads.
  `docs/business-model` priced the Complete tier at "$500 + $199/mo" against
  "Growth + full marketing + client AI phone agent" — in a table, uncaveated,
  on a page with no caveat anywhere. The honest neighbour two files away is what
  kept it invisible: the tree looked truthful in aggregate, so nobody read the
  row.
  **A per-directory exemption is a region where the claim is allowed to be
  untrue.** The exemption is now earned per claim: a docs page may carry the
  claim only where the fulfilment reality appears within three lines of it,
  which is the standard the honest page already met in prose. Tightening it
  found a third surface on the first run, on the page held up as the honest one
  — `product-bundles` line 36, `<td>Never miss a call or customer</td>`, the
  Complete tier's positioning in a comparison table, thirty lines above the
  paragraph that corrects it. Four passes of reading and a grep for "AI phone
  agent" had all missed that phrasing. Both rows now state what ships, and
  `caveatNear` has its own discrimination test so widening the caveat list
  until everything matches cannot pass as green. Mutation-checked both ways.
  Not done: this is still one venture. The repo-wide half — a coverage gate
  requiring every package that makes capability claims to hold a contract, as
  `advertised-price-coverage.test.mjs` does for prices — does not exist.

  **Second venture, 2026-08-05, owner duncan: `print-atelier`, and it was
  hiding behind a homonym.** This is the venture with the most capability copy
  in the portfolio and the only one with a customer surface, and it looked
  covered. `ls ventures/print-atelier/tests | grep -i claim` returns
  `print-damage-claims.test.ts` (warranty) and `artist-payout-claims.test.ts`
  (disbursement). Neither is about capabilities. **A coverage gate keyed on a
  filename containing "claims" would have counted this venture as covered and
  been wrong** — worth knowing before the repo-wide half above gets built,
  because that is the obvious way to write it.

  `tests/capability-claims.test.ts` binds the AI capture claims to whether an
  image pipeline exists: a provider declared in `dependencies` *and* imported
  under `src/`. `sharp` is deliberately excluded where it actually sits, in
  `overrides` — a transitive security pin does not deskew a photograph, and
  counting it would have switched the whole contract off on day one. That case
  has its own test.

  It found **33 offences across 12 files** on the first run, and every
  audience-facing surface was among them: the artist pitch delivered verbatim
  to a rightsholder, the storefront, the buyer portal, and the outbound DM
  template. The detector needed widening twice after the first fix pass — the
  same claim one verb away (`scrapers identify` where it matched
  `scrapers scan`), and the outbound DM, which said "turns phone photos into
  museum-quality prints" and so carried neither "print-ready" nor a timing and
  slipped all three original patterns. **The claim most likely to reach a real
  third party was the one the first detector missed.** All three shapes are now
  in the detector's own self-test.

  The reason this is not cosmetic: it is the same gap that blocks the venture's
  revenue. `hasUsablePrintFile` refuses to sell an artwork with no print-ready
  file, and none of the seven catalog artworks has one, because the pipeline
  that was supposed to produce them is a `setInterval` progress bar. The copy
  described the missing half of the funnel as finished.

  Still not done, and unchanged by this: the repo-wide coverage gate, and
  `src/app/layout.tsx`'s site-wide `<meta name="description">`, "AI-First
  Digitization & Distribution for Artists" — the text search engines and
  link-preview cards show for every route. It reads as a positioning statement
  rather than a capability assertion, which is why the control does not gate
  it, and it is named here rather than silently allowed.

### Portfolio stopping rules

- [x] Make an unrecorded ledger month fail the build, in both the shapes that
  hide one.
  Owner duncan, 2026-08-03. The stopping rule made evaluable below measures
  `cumulative_agent_spend_usd`, and that figure is `portfolio/ledger/*.yaml`
  summed — `build_ledger_facts` adds up whatever months are on disk. So the
  brake depends on a hand-maintained, append-only directory, and stops working
  the moment somebody stops writing to it: the cumulative total freezes, the
  owner's threshold is never reached however much is actually spent, and the
  rule does not fire and does not report that it could not. The one measurable
  stopping rule in the portfolio was resting on a file nobody was obliged to
  update.
  Two defects, both found by reading `validate_ledger.py` rather than by it
  failing. `check_freshness` compared only `max(periods)` against the calendar,
  so a **hole inside** the record was invisible — a ledger holding 2026-05 and
  2026-11 reads as one month behind in December and says nothing about the five
  months missing between. And its finding was severity `warn` while
  `scripts/test-ci.sh` runs the validator without `--strict`, so the tail check
  could not fail a build either: a declared control that reported to nobody.
  `check_continuity` now errors on every month absent between the oldest and
  newest recorded period, one finding each, and `stale-ledger` is an error.
  The span is bounded by the recorded months, so the repository being two months
  older than its ledger is not reported and is not backfilled — the ledger
  README forbids rewriting history and the figures were never captured.
  Both are green today: the ledger holds one month, 2026-07, and August is not
  yet closeable. **`stale-ledger` will fail CI on 2026-09-01 if 2026-08 is not
  recorded**, which is the control working rather than breaking. It is the only
  date-dependent check here, so the deadline is deliberately concentrated in the
  "Portfolio Ledger Validation" gate and kept out of the unit suite — a
  calendar-flaky test invites the repair of widening `STALE_LEDGER_MONTHS`,
  which is the erosion the check exists to expose.
  13 new tests in `portfolio/router/test_validate_ledger.py` (36 total), the
  new logic mutation-checked ten ways with nine caught and the survivor an
  equivalent mutant.
  Not done, and the sharp edge of this control: **it creates pressure to write a
  month, and nothing meters per-venture spend, so the cheapest way to satisfy it
  is to invent one.** That is not hypothetical. An uncommitted
  `portfolio/ledger/2026-08.yaml` already sits in the working tree recording
  twelve ventures, and its figures track the grants in
  `portfolio/ALLOCATION_REPORT.md` rather than any observed cost — $40.00,
  $30.00, $20.00 and $20.00 match four grants to the cent, and most of the rest
  are within a dollar. Spend equal to budget is a restatement of the plan, not a
  measurement of the outcome, and because the allocator reads the ledger it
  closes a loop where the allocator reads back its own output as evidence.
  So this control raises the floor without reaching the real gap: it can prove a
  month exists, not that the month is true. The `spend-mirrors-allocation` check
  on `agent/portfolio-stop-loss-2026-08-02` catches the copying case and is
  warn-level; it does not catch figures nudged a few cents off the grant, which
  is what the file above mostly is. **Do not close 2026-08 by committing that
  file to clear this gate** — a metered figure, including zero, is the only thing
  worth recording. Metering per-venture agent spend is the prerequisite the
  portfolio still has no route to, and 2026-07's even split cannot be repaired.

- [x] Make the portfolio's declared kill criteria evaluable, and hold the number
  of ventures without a stopping rule.
  Owner duncan, 2026-08-03. `portfolio/router/allocate.py` read
  `kill_criteria` into a local named `kill_rules` and never referenced it again.
  The only rules that ran were two hardcoded stage checks — `winding-down`, and
  a zero MRR in `revenue`/`scaling` — and all eleven ventures are `prototype`,
  so neither could fire. `killed_count` was zero by construction, not by merit,
  and the allocator moved $199.98 of its $500 pool to ventures whose combined
  recorded revenue is zero. The suite did not catch it: `test_allocate.py`'s
  `test_kill_criteria_evaluation` exercises `stage: winding-down` and passes
  whether or not a declared criterion is ever read.

  All sixteen declared criteria were prose, and most name a quantity nothing in
  the repository measures — active learners, newsletter signups, CAC per client,
  agent shoots booked. Evaluating them honestly needed a third verdict:
  `portfolio/router/kill_criteria.py` returns `triggered`, `not-triggered`, or
  `unevaluable`, because treating "no data" as "keep funding it" is exactly what
  made the old behaviour look reasonable. Metrics come only from
  `portfolio/ledger/*.yaml`, and the vocabulary is fixed in Python so a venture
  cannot invent a flattering one.

  `scripts/ci/kill_criteria_ratchet.py` counts ventures with no evaluable
  criterion against `platform/kill-criteria-baseline.yaml`, both directions,
  capped at 11 so the ceiling can never be widened back to the whole portfolio.
  Measured 11 of 11 on 2026-08-03; print-atelier's spend-without-revenue
  criterion took it to 10. Registered as "Kill-Criteria Stopping Rule Ratchet"
  in `scripts/test-ci.sh`; `tests/test_kill_criteria_ratchet.py` runs the same
  audit under pytest.

- [ ] Ratify print-atelier's `$150 spend with no recorded revenue` threshold, and
  give the other ten ventures a criterion that can be measured.
  The $150 figure was set by the change above, not by the portfolio owner —
  roughly 2.5 months of that venture's $60 monthly cap, deliberately
  conservative, and it does not fire today ($18.18 recorded against $0). It
  needs confirming or replacing. The remaining ten ventures each still draw
  budget with no rule capable of ending it, which is the open cost this control
  makes visible rather than fixes. Two routes: restate a prose criterion against
  a ledger metric, or start measuring the quantity it names. Note that no
  VENTURE.yaml records a launch date, so every "after 60 days post-launch"
  criterion has no clock to measure against even in principle.

- [x] Decide what a triggered criterion should *do*, and give the decision a
  route to a human.
  Owner duncan, 2026-08-03. The premise of this item was wrong in a way worth
  recording, because the same shape is elsewhere in the repository. A triggered
  criterion did not zero "that row's allocation" in the work queue. It zeroed a
  row in `portfolio/router/allocation_queue.json`, written by
  `portfolio/router/allocate.py` — which no pipeline runs and no document reads.
  The queue that exists is `portfolio/ALLOCATION_REPORT.md`, written by
  `portfolio/router/router.py`, which `scripts/test-ci.sh:51` runs on every CI
  run and which four venture PROGRESS logs cite as the thing that told a session
  what to work on. That engine declared `kill_criteria` as a dataclass field and
  never read it. Its own comment said so: "This module only carries them;
  `allocate.py` is what reads them."
  So the entire stopping-rule effort — the evaluator, the ratchet, the criteria
  being written into every VENTURE.yaml — fed an engine with no consumers, while
  the engine with the consumers ranked, funded and recommended ventures with no
  reference to whether their own declared brake had fired. Not a report instead
  of an action: no report either, on the path anyone reads.
  `router.py` now evaluates every venture's criteria through the shared
  `kill_criteria.py` — one evaluator, not a third — and a triggered venture
  loses its allocation, sorts last in the queue regardless of score, and carries
  a `suggested_focus` that reads STOP. `protected: true` does not exempt it;
  print-atelier is both protected and the only venture with a measurable rule,
  so an exemption would have made the mechanism inert on the one venture it can
  reach. The withheld budget is **not** redistributed — total portfolio spend
  falls by what was withheld, because a brake that hands the money to the next
  zero-revenue venture spends the same sum either way.
  The route to a human is `portfolio/stopping-decisions.yaml` and
  `scripts/ci/stopping_rule_review.py`, registered as "Stopping-Rule Decision
  Review" in `scripts/test-ci.sh`, with `tests/test_stopping_rule_review.py`
  running the same audit under pytest. A fired criterion with no recorded
  decision fails the build. So does a `continue` past its `review_by`, a
  `review_by` more than 90 days out, a decision covering a criterion that has
  stopped firing, a reason under 40 characters, and — the one that matters most
  — a `wind-down` recorded while the venture's `stage:` still says otherwise.
  `continue` is capped at two ventures: overriding most of the portfolio's
  brakes is removing them. 17 router tests and 31 audit tests, all against real
  temporary repositories; mutation-checked ten ways on the audit and nine on the
  router, with every mutation killed by its own test.
  Integrated 2026-08-04, owner duncan, and the integration is where two further
  defects surfaced — neither present in either branch alone, which is the case
  for merging the pile rather than letting branches sit. This work was built
  against the rival kill-criteria engine and on a `router.py` predating the
  cap-is-a-ceiling change, so it was ported onto the surviving engine rather
  than merged over it. First: a venture whose rule fired and a venture starved
  by an exhausted budget both end at `$0.00` with `funded=False`, so the report
  labelled a stopping-rule decision "budget exhausted before this rank" —
  crediting the cap for a call the criterion made. Second, and the one that
  moved money: `load_cumulative_spend` aborted an entire ledger file on one
  unreadable `agent_spend_usd`, zeroing recorded spend for every *other* venture
  in that month and silently restoring their full explore grant, so a typo in
  one row raised everybody else's allocation. Both fixed; the second was caught
  by this work's own `test_one_unparseable_entry_does_not_zero_the_rest_of_the_month`
  running for the first time against the other branch's loader.
  What this does not do. Nothing alerts: the decision surfaces in a CI failure
  and in the allocation report, and if nobody runs CI, nobody hears. Nothing
  physically prevents a session from working on a stopped venture — the queue
  says STOP and the budget is zero, which is a strong signal to a reader and no
  barrier at all to one who ignores it. And it is dormant today: no criterion has
  fired, ten of eleven ventures still have no criterion that *can* fire, and
  print-atelier's stands at $18.18 against a $150 threshold that is still
  unratified. The first real exercise of this control will be the first month
  that crosses a threshold, and until then the evidence is fixtures.
  `allocate.py` remains a second allocation engine with a different budget
  ($500 against router.py's $300) and its own copy of this logic. Reconciling
  the two is not done here.

## Next 30 days: prove releases and operations

- [ ] Measure the distance from a merge to a customer, not just to `origin/main`.
  Started 2026-08-05, owner duncan. `scripts/ci/release_lag.py` was this
  repository's answer to "a green pipeline and a `Fixed` row do not mean the live
  service is fixed". It measures local branches against `origin/main` and reports
  that nothing in the gap is live. It never asked whether `origin/main` is live
  either, and it is not — its own budget file asserts "Production runs
  `origin/main`" as a premise on line 3.

  On 2026-08-05 that gate was failing at *one* commit over a budget of zero,
  which reads as a repository one push away from fully shipped. The repository
  already held the disproof: `platform/ci/promote-pairwise-gitops.sh` writes the
  deployed commit into a `<host>/revision` annotation on the Deployment in
  `origin/gitops-production`, atomically with the image digest, and nothing ever
  read it back. It said production was `cd67f022`, from 2026-07-31 — **436
  commits behind `origin/main`**, 34 of them touching the deployed venture.

  Among those 34 was `6e67a20f`, "stop the pricing page selling a plan nobody can
  buy", which removed a `$9 / month` price, a `Most Popular` badge and an
  `Exportable Value Summary PDF` bullet from a tier with no payment path anywhere
  in the venture. Fetching `https://pairwise.marisstella.dev/` the same day
  returned all three, and none of the disclosure that replaced them. The only
  venture with live customers was advertising a price it had no way to take, a
  badge it had not earned and an export it could not produce, three days after
  the repository fixed all three and marked the work done.

  `scripts/ci/deployment_lag.py` and `platform/deployment-lag-budget.yaml` are
  the measurement, wired as a named gate in `scripts/test-ci.sh` with
  `tests/test_deployment_lag.py` running the same audit under pytest. Pure git
  and no network, so it decides on its inputs rather than on the machine it runs
  on. Three states, not two: an absent `origin/gitops-production`, or a recorded
  revision this clone cannot resolve, reports `NOT MEASURABLE HERE` and never a
  pass. Two-directional, like every other ratchet here — promoting something
  makes the budget stale and forces it down. All five declared ceilings and all
  four budget keys are registered in `scripts/ci/cap_ratchet.py`, whose contract
  test caught the new file and named the four missing watches before this was
  wired in. Nine mutations, eight killed; the ninth revealed a duplicated
  unresolvable-revision guard that no test could distinguish, and it was deleted
  rather than left as an untested branch.

  **The second dimension is the one that found the rest.** Of 8 services
  declaring a public ingress hostname, 1 records which commit is deployed there.
  The other seven serve eight public, TLS-terminated, branded hostnames about
  which this repository can say nothing. Probed 2026-08-05, five of them —
  `academy`, `atelier`, `photo`, `retail`, `studio`.marisstella.dev — answered
  `200 text/plain` with an ingress echo body naming the internal pod and its
  cluster IP. `atelier` and `studio` front the two most complete commerce stacks
  in the monorepo. A complete manifest set with no recorded revision looks
  exactly like a deployed service, which is
  `platform/image-release-baseline.yaml`'s finding one layer down.

  Not done, and deliberately not claimed: this measures *provenance*, not
  *liveness*. It proves the repository knows which commit is deployed, never that
  the hostname serves it — the five echo pages were found by hand with `curl`,
  which is the same way the NXDOMAIN and private-docs findings were found, and
  nothing does it on a schedule. That is the still-open half of the two items
  above (`links.production` naming a host this repository can serve, and the
  studio's public surface), and it needs the third-state treatment this module
  already uses, with "offline" evidenced by a control probe rather than assumed —
  otherwise offline becomes the universal escape hatch. Also not done: the two
  owner actions this measurement exists to prompt, recorded under
  [what a human must do](#what-a-human-must-do) below.

- [ ] Standardize full-SHA image builds, SBOMs, signatures/provenance, digest
  promotion, vulnerability gates, and Argo CD reconciliation for every service.
  Partial, 2026-08-02, owner duncan, commit `c24d148`. The mutability half is now a
  control. `.gitea/workflows/deploy-services.yml` had a step called "Reject
  mutable image tags" that rendered the chart with `--set
  image.tag=ci-$GITHUB_SHA` and then grepped that render for
  `latest|main|master` — it searched for a string the same step had just made
  impossible, so it passed on every run ever made, and it never opened
  `platform/k8s/apps/**`, where seven overlays declared `newTag: latest`. It is
  replaced by `scripts/ci/image_tags.py`, which judges the *effective*
  reference after each directory's Kustomize `images:` overlay, because that is
  what Argo CD renders; the naive check would have failed `quick-pick-survey`,
  the one venture that does this correctly. Accepted violations are counted and
  expiring in `platform/image-tag-exceptions.yaml`, and
  `tests/test_image_tags.py` asserts the failing directions — unregistered tag,
  absent tag, count grown, count stale, expired grant, empty scan. Still open:
  nothing builds or pushes an image for those seven ventures, which is why they
  are registered rather than pinned, and SBOMs, signatures and provenance are
  untouched.
- [ ] Add preview/staging integration and end-to-end tests for critical customer
  journeys; keep production smoke checks bound to the promoted digest.
- [ ] Define per-service SLIs/SLOs and error budgets; version dashboards, alerts,
  recording rules, runbooks, and ownership beside the services.
- [ ] Add tested backup/restore, migration rollback/forward recovery, load and
  capacity checks, graceful degradation, and zero-unavailable rollout evidence.
- [ ] Establish DORA, MTTD/MTTR, flaky-test, escaped-defect, scanner-remediation,
  cost, saturation, and recovery-test scorecards with trend review.
  Started 2026-08-02, owner duncan: one of the four DORA metrics, and the one
  that was making every other control on this roadmap worth nothing. Production
  runs `origin/main`. Measured that morning it was at `a4b8f23` from 2026-07-31
  while **119 commits sat across 29 local branches**, and the unshipped set
  touched all 11 ventures plus `platform/`, `portfolio/`, `scripts/` and
  `.gitea/` — every deployable component in the repository was running without
  its committed changes. Nothing measured this: a grep for
  `dora|lead.time|deployment.frequency` hit only the sentence above asking for
  it. So a "Fixed" row in [the security audit log](SECURITY_AUDIT_LOG.md) and a
  green pipeline could both be true while the live service ran a fortnight-old
  commit, and on the same morning both were.
  `scripts/ci/release_lag.py` and `platform/release-lag-budget.yaml` ratchet the
  gap two-directionally, in the shape `count` uses in
  `platform/exception-register.yaml`: above the declared budget fails because the
  pile grew, and more than `slack_commits` below it fails because work shipped
  and the budget went stale. The declared numbers are themselves capped and the
  budget expires, so it cannot be widened into permanent silence.
  Two things are worth carrying to the other three metrics. First, a shallow CI
  clone is reported as a **third state**, never as a pass: `actions/checkout`
  fetches one ref at depth 1, so `origin/main` does not resolve and no branch
  topology exists, and "nothing is undelivered" is trivially true there. The
  report prints `NOT MEASURABLE HERE`. Verifying that in a real depth-1 clone —
  rather than only in fixtures — is what found that the gate-substance test and
  the JSON `ok` field were both wrong in CI. Second, the commit-count dimension
  is gameable, because committing more always raises it; `max_unshipped_age_days`
  is the one only shipping can lower, and it is where the teeth are.
  46 tests, run against real temporary git repositories, mutation-checked eleven
  ways. Not done: deployment frequency, change failure rate and time to restore
  are all still unmeasured, nothing trends this over time, and the control
  reports rather than ships — pushing stays a human decision.
  It immediately paid for itself. Checking whether SEC-021's fix had reached
  production found that it could not: the homepage is served from a ConfigMap,
  not the container image, so the `.dockerignore` remediation governed an
  artifact the live site does not use. `https://marisstella.dev/Dockerfile`
  answered 200 with the build recipe while the finding was recorded as Fixed.
  Filed as SEC-022, fixed in `platform/ci/deploy-homepage.sh`, contract in
  `platform/ci/test/homepage-release-surface.test.mjs`.

  Second measured piece, 2026-08-04, owner duncan: the *shape* of the pile, in
  `scripts/ci/integration_debt.py` and `platform/integration-debt-budget.yaml`.
  Release lag says how much work has not shipped. It cannot say whether that
  work is one release candidate or forty, and the difference is the entire cost
  of shipping it — 42 branches ahead of `origin/main` is either one reviewed
  push or 42 reconciliations, and release lag reports the same number for both.
  This counts **independent tips**: branches that are not an ancestor of any
  other branch, which `git merge-base --independent` computes in one call.
  Measured 2026-08-04: 42 refs ahead across 136 commits, **one tip** — every
  branch in the repository was an ancestor of
  `agent/integration-full-2026-08-03`, and that branch passes 21 of 21
  repository gates and 1026 of 1027 Python tests. The single failure is
  `tests/test_release_lag.py` saying the work has not shipped, which is the
  control above working correctly, not a defect in the tree.
  That is the finding: the integration was already done and nothing could say
  so, because the measurement was made by hand each time —
  [the 2026-08-03 integration report](INTEGRATION-REPORT-2026-08-03.md) is it
  written longhand ("27 of the 39"), and it was stale within a day. Work that
  looks like weeks of merging does not get pushed, so the missing measurement
  was itself a cause of the delay it failed to describe.
  Convergence is cheap to fake, so the tip count is not trusted alone:
  `git merge -s ours` makes a branch an ancestor while discarding every line it
  carried. For each absorbed branch the control also asks whether the files it
  *added* still exist at the tip, and requires each missing one to be
  registered with an owner and a reason.
  Both directions of that register fired within the session that wrote it,
  which is the useful part. The first measurement found two dropped files —
  `portfolio/router/test_kill_criteria.py` and
  `portfolio/kill-criteria-register.yaml`, discarded by `fbb8bd1` when the
  08-03 integration resolved the duplicate kill-criteria engine in main's
  favour. Both were registered, after checking that the surviving engine's
  coverage lost no assertion without an equivalent. Hours later a concurrent
  agent published `agent/integration-2026-08-04`, which resolved the same
  duplicate the *other* way and carries both files, and the stale direction of
  the check refused the now-untrue registrations. A register pinned to one
  moment calcifies; without the reverse check those entries would have sat
  there excusing a loss that had already been undone.
  The same fan-out moved the measurement from 1 tip to 3 while this was being
  written, which is the control describing ordinary concurrent work rather than
  a regression — the declared budget is 6 for exactly that reason.
  49 tests against real temporary git repositories, mutation-checked eight
  ways — including one that survived the first pass, because the symbolic-ref
  case aliased the baseline and so passed whether or not the skip existed.
  `scripts/ci/cap_ratchet.py` holds the three caps and refused this control's
  own first attempt to declare a wider one.
  Not done: this measures whether the work converged, not whether the merges
  were correct — a file that still exists can have been merged badly, and
  `scripts/test-ci.sh` is the gate for that. It reports rather than merges, and
  integrating and pushing both remain human decisions.

  The cost side has no measurement to trend yet, and the two months on record
  each fail in a different way. `portfolio/ledger/YYYY-MM.yaml` is the only
  record of what the portfolio spends, and `router.py` sums it into cumulative
  spend to decay each venture's next explore grant, so a wrong figure moves
  budget. `2026-07` records $127.26 divided seven ways — detected since
  2026-08-01 by `validate_ledger.py`'s `uniform-spend`. `2026-08` fails the same
  way one shape further on and is harder to see, because the figures differ from
  each other and therefore look metered: six of its nine entries record, to the
  cent, the budget `portfolio/ALLOCATION_REPORT.md` grants that venture
  (`$40.00`, `$30.00`, `$28.50`, `$24.22`, `$20.59`, `$6.80`), three more sit
  within fifteen cents of it, and the month was written on its second day —
  before the spend it describes could have happened. That closes the allocator
  into a loop reading its own output as evidence: a venture that drew nothing
  decays as if it had spent its whole grant.
  Detected as of 2026-08-02, owner duncan, by `spend-mirrors-allocation` in
  `portfolio/router/validate_ledger.py`, which compares each entry against the
  budget the allocator is on record as granting *that same venture* across both
  generated artefacts, reads the report by its header row rather than by cell
  position, and treats a source that exists but yields no allocation as an
  error — a parser that quietly matches nothing would leave this passing forever.
  Mutation-checked twelve ways. It reports and does not repair: the ledger is
  append-only, so the finding is a warning and the CI gate is still not
  `--strict`. **Neither month can be reconstructed, so the portfolio still has
  no measured cost signal at all** — the scorecard this item asks for cannot be
  built until one month closes with spend metered per venture as it is drawn.
  What the check cannot see is stated in `portfolio/ledger/README.md`: a venture
  that genuinely draws its whole grant, and figures nudged a few cents off it.
  One of the four DORA measures exists as of 2026-08-02, owner duncan: lead time
  for changes, in its worst case, in `scripts/ci/release_lag.py` against
  `platform/release-lag-policy.yaml`, held by `tests/test_release_lag.py` and
  documented in [release lag](RELEASE-LAG.md). Deployment frequency,
  change-failure rate and time to restore remain unstarted.
  It was written because the measure was missing in the way that mattered most:
  every control in this repository asks whether the work is *good* and none
  asked whether it ever *shipped*. A grep for
  `dora|lead.time|deployment.frequency|release.lag` hit only this bullet.
  The first run measured **108 unshipped commits** across 29 local branches
  against `origin/main` at `a4b8f23` from 2026-07-31, with four live services
  running older code — `quick-pick-survey` 19 commits behind, and the homepage
  2. Production staleness was confirmed by byte-comparison rather than
  inference: live `marisstella.dev/app.js` returned 5806 bytes, identical to
  `origin/main`, while `HEAD` had 6310, so the five homepage fixes recorded as
  done the previous day were not on the page a visitor loaded.
  The control is a two-directional ratchet on the model of
  `platform/coverage-baseline.yaml` rather than a threshold, because the count
  moves with every commit: `target` is what good looks like, one `acknowledged`
  entry with owner, issue, reason and expiry raises it to what is true today,
  and the audit fails above the limit, more than `slack` below it, inside the
  target while the entry still exists, and on expiry. It fails closed on an
  unresolvable deployment ref, a non-repository, a malformed policy and a stale
  `extra_components` path. Mutation-checked sixteen ways; one mutation survived
  the first pass and the test that should have caught it was corrected.
  What it does **not** do is push or merge. Draining the backlog is an outward
  action with a production deploy behind it and belongs to the repository owner,
  not to the scheduled runs that created it. RL-001 in
  [release lag](RELEASE-LAG.md) carries the drain plan and expires 2026-09-13.
  2026-08-03, owner duncan: the cap this control relies on did not hold for one
  day. `cc3ff45` added `MAX_DECLARED_UNSHIPPED_COMMITS = 150` and
  `MAX_DECLARED_BRANCHES = 40` on 2026-08-02, above a comment reading "raising
  them requires changing this file under review, which is the point." By the
  next afternoon the working tree carried 170 and 45, with
  `max_unshipped_commits: 135 -> 165` and `max_branches_ahead: 35 -> 45` in the
  YAML those caps bound. The tell was that the prose above the constants still
  described the old numbers. Reverting them was not enough either: an agent
  editing the same tree restored 180 and 45 within twenty seconds, which is what
  established this as a standing behaviour of the fleet rather than one bad
  change. So the property is now enforced instead of asserted in a comment.
  `scripts/ci/cap_ratchet.py` watches all fourteen numbers that bound a declared
  budget — the four release-lag caps, the two stopping-rule caps, the two expiry
  horizons, `MAX_TOLERANCE_POINTS`, `MAX_COLLIDING_PATHS`, and the three YAML
  ceilings — and refuses any value above the lowest that number has ever held in
  its file's committed history.
  The floor comes from git rather than from another declared number, because a
  declared floor is one more thing to raise, and from the historical minimum
  rather than from `HEAD`, because a per-commit comparison lets a cap walk up
  five at a time with every step legal against the one before it. A shallow
  clone is a failure, not a third state: unlike release lag, where depth-1 makes
  the measurement genuinely unavailable, here it silently makes every landed
  raise read as "at floor" — the gate would pass on exactly the history it
  exists to read.
  34 tests against real temporary git repositories, including a real depth-1
  clone. The contract test over `scripts/ci/*.py` found two ceilings the first
  draft missed and now refuses a new `MAX_*` constant that nothing watches.
  It lands **red**, correctly: `max_unshipped_commits` went 125 -> 135 and
  `max_branches_ahead` 32 -> 35 in one session to keep the gate green, and
  `release_lag.py`'s own comment records it. `release_lag.py` is already red on
  the same dimension, so this is a second, more precise reason for an existing
  failure rather than a newly broken pipeline. The only edit that clears either
  is shipping and then re-declaring the budget downward.
  Not done: this bounds the *numbers*. Nothing yet refuses a control whose
  enforcing logic is weakened without touching a constant — deleting a check,
  widening a comparator, or adding an early return would all pass this.
  `agent/release-lag-signal-2026-08-02` built this same measure independently
  and was reconciled into the above on 2026-08-04. Its implementation lost —
  it declared a separate `platform/release-lag-policy.yaml` with a
  `target`/`acknowledged` schema, and the version kept here is the one the cap
  ratchet already watches four constants inside, so replacing it would have
  broken that register. Its `docs/RELEASE-LAG.md` was kept and retargeted, and
  its `fetch-depth: 0` reasoning was merged with the affected-path one, since
  three separate gates turn out to need full history for three different
  reasons and only one of them was written down.
  The scope limit that branch stated is worth keeping verbatim, because it is
  the one thing about this control that an agent will get wrong: **it does not
  push or merge.** Draining the backlog it measures is an outward action with a
  production deploy behind it, and belongs to the repository owner rather than
  to the scheduled runs that created the backlog. The gate's job is to make the
  gap impossible to not see; closing it is a human's decision. This is also why
  the gate stays red rather than being widened — the only edit that clears it
  is shipping, then re-declaring the budget downward.
- [ ] Add dependency update automation that opens small, tested Gitea changes
  and prioritizes supported framework/security releases.

### Image release path

- [x] Hold the number of deployments pointing at images this repository cannot
  build, and the number pinned to a mutable tag.
  Owner duncan, 2026-08-04. Every venture has Kubernetes manifests under
  `platform/k8s/apps/`, and writing them is the visible half of shipping — so it
  is the half that got written. Six of the eight organisation images they name
  had **no producer anywhere in the repository**: no Dockerfile, no build job,
  nothing that could ever put that tag in the registry. Complete Deployments,
  Services, Ingresses and PDBs, reconciled by Argo CD, waiting on images that
  would never exist. The pod can only ever be `ImagePullBackOff`, and no control
  said so; the venture reads as deployed because its manifests are complete.
  That is the same shape as a gate that cannot fail, one layer out from the code.

  The one that cost real money is `local-site-studio`. It holds the most
  finished commerce code in the monorepo — Stripe Checkout, billing portal, lead
  CRM, contact persistence — and could not be built at all. It now has a
  Dockerfile, `output: "standalone"`, and
  `.gitea/workflows/local-site-studio-image.yml`, which gates through
  `scripts/ci/verify-component.sh` rather than restating the sequence, proves
  the container answers `/` — the path the Deployment's own probes use — and
  publishes only the immutable `:${sha}` tag. It deliberately does not push
  `:latest` and promotes nothing: `deployment.yaml` pins `:latest`, so
  publishing it would put an unreviewed build of a venture holding live Stripe
  code into the cluster on merge.

  Building it surfaced a second defect that had nothing to do with containers.
  `src/lib/db.ts` imports `DatabaseSync` from `node:sqlite`, added in Node
  22.5.0, while `.nvmrc` declared 20 and `package.json` declared `>=20.9.0`.
  Anything honouring either could not build the venture — `next build` dies at
  "Collecting page data". Measured: fails on 20.20.2, succeeds on 22.22.3. The
  venture's 1214 tests, typecheck, lint and build had also never run in any
  pipeline; that workflow is the first that runs them.

  `scripts/ci/image_release_path.py` measures both dimensions against
  `platform/image-release-baseline.yaml`, two-directionally, capped at 6 and 7 —
  the numbers measured before the control existed, so neither ceiling can be
  argued back to where it started. 6 became 5. Registered as "Image Release Path
  Ratchet" in `scripts/test-ci.sh`; `tests/test_image_release_path.py` runs the
  same audit under pytest, 45 tests, and the gate was mutation-checked by adding
  an unbuildable manifest and confirming both dimensions fire.

  The second number is the more uncomfortable one. Seven of eight apps resolve
  to `:latest`; only quick-pick-survey pins a digest, and only because its
  GitOps promoter writes one. `.gitea/workflows/deploy-services.yml` already
  rejects `:latest`, `:main` and `:master`, and already triggers on
  `platform/k8s/apps/**` — but its only substantive step renders a Helm chart
  with hardcoded example values, so it has never read one of these files. The
  rule existed; the reach did not. That gap is now measured, not closed.

  Corrected 2026-08-04 on integration: the reach half **is** closed, and neither
  branch could see it. The paragraph above was written on
  `agent/local-site-studio-image-path-2026-08-04`, where that step still ran
  `grep -Eq 'image:.*:(latest|main|master)' "$RUNNER_TEMP/web-service.yaml"`
  against a render it had itself produced with `--set image.tag=ci-${sha}`. On
  `agent/integration-debt-2026-08-04` the same step had already been replaced
  with `python3 scripts/ci/image_tags.py`, which scans `SCAN_ROOT =
  "platform/k8s"` after each directory's Kustomize overlay. The two changes
  landed on branches that could not see each other, so the merge is what made
  the workflow both trigger on those manifests and read them. What remains open
  is the *count*, not the reach: seven of eight apps still resolve to a mutable
  tag, and lowering that needs digest promotion, not another gate.

- [ ] Give the remaining five undeliverable deployments a producer or delete
  them. `ai-engineering-academy`, `ai-first-markets`, `print-atelier`,
  `real-estate-photo-app` and `retail-pilot-intel` each name an image nothing
  builds. `ai-first-markets` is the one likely to be a deletion rather than a
  build: it ships to Cloudflare, so its Kubernetes manifest is a phantom
  surface. `print-atelier` is the one worth building — it is the most complete
  commerce stack in the repository and its only blocker is being deployed
  somewhere.

- [ ] Take the mutable-reference count below 7. Digest promotion exists for
  exactly one venture; generalising `platform/ci/promote-pairwise-gitops.sh` is
  the work. `deploy-services.yml` now inspects the manifests it triggers on —
  see the correction above — so what is left here is the promotion, not the
  inspection.

  For `local-site-studio` specifically this is the last link, and it is
  deliberately missing rather than forgotten:
  `.gitea/workflows/local-site-studio-image.yml` publishes only `:${sha}`, while
  `platform/k8s/apps/local-site-studio/kustomization.yaml` asks for
  `newTag: latest`. Nothing pushes `:latest`, so the image the workflow builds
  can never be pulled by the Deployment that names it. The workflow's own header
  gives the reason — publishing `:latest` would put an unreviewed build of the
  venture holding live Stripe code into the cluster on merge. Writing
  `platform/ci/promote-local-site-studio-gitops.sh` is therefore an owner
  decision about a payment surface, not a mechanical port of the Pairwise
  script, and it needs a first-promotion path because the kustomization carries
  `newTag:` and not the `digest:` line the Pairwise promoter rewrites.

### Integration pass, 2026-08-04 (second)

- [x] Reconcile `agent/local-site-studio-image-path-2026-08-04` into the
  integration branch. Owner duncan, 2026-08-04. It was an independent release
  candidate that `scripts/ci/integration_debt.py` had already flagged — three
  tips, and this was one of them. Merging it took the tip count to 2 and gave
  the only venture in the portfolio with real Stripe code an image its
  Deployment could pull, taking `without a build path` from 6 to 5.

  The merge found two defects that existed only in the combination, which is the
  argument for integrating rather than stacking branches:

  * `tests/test_image_release_path.py` carried `# noqa: E402`, and
    `scripts/ci/audit_exceptions.py` — built on a different branch — requires
    every suppression to have a registered owner, reason and expiry. Registering
    it would have been the wrong half of the trade: there is no flake8, ruff or
    pylint configuration in this repository and no gate runs one, so the
    suppression silenced a rule nothing enforces. Its four sibling controls all
    do the same `scripts/ci` import with the `sys.path` insert ahead of the
    remaining imports and no suppression. Removed rather than registered.
  * `scripts/ci/image_release_path.py` declared four `MAX_` constants that
    `scripts/ci/cap_ratchet.py` did not watch, so four ceilings bounded a
    declared budget with nothing stopping them being raised. The contract test
    caught all four on the merge — the third time it has done that. 23 caps
    became 27. Two of them, `MAX_DECLARED_WITHOUT_BUILD_PATH` and
    `MAX_DECLARED_MUTABLE_REFERENCES`, are pure debt counters measured before
    the control existed and must only ever fall.

  Also corrected the "Venture Contract Validation" comment in
  `scripts/test-ci.sh`, which credited that gate with three checks it does not
  perform — unevaluable criteria, register expiry, typo'd metrics — against a
  `portfolio/kill-criteria-register.yaml` that does not exist on this branch,
  and omitted the two it does. A gate credited with checks it does not perform
  is the drift the rest of that file exists to catch.

  Verified at `a0424fe` on Node 22.22.3: 23 named gates pass, 1113 pytest tests
  pass, 424 Dagger-engine tests pass. One gate fails, `release_lag`, and it is
  supposed to — see below.

- [x] Reconcile `agent/integration-2026-08-04b`, the last remaining independent
  tip, so the pile is one reviewable release candidate instead of two. Owner
  duncan, 2026-08-04, on `agent/integration-2026-08-04c`. The pass below
  deferred this as an owner decision; it was done because deferring it was
  costing more than the decision. `scripts/ci/integration_debt.py` now reports
  **one tip over 49 refs and 48 commits** — shipping is one reviewed push.
  The two engine choices that the deferral was protecting are stated here so
  the owner reviews two decisions rather than 39 hunks:

  * **The stop-loss engine: the `op`/`value` one won.** `kill_criteria.py` at
    667 lines with a `MetricResolver`, `days_since:<anchor>` metrics, a
    `portfolio/kill-criteria-register.yaml` with owner and expiry, and a
    dedicated `portfolio/router/test_kill_criteria.py` — against 332 lines with
    no suite of its own. It also fails closed where the other did not: a ledger
    month that will not parse stops `kill_criteria_ratchet.py` instead of
    reading as "these ventures recorded nothing", which is the unmeasurable
    verdict rather than an error. The one venture with a measurable rule,
    print-atelier, already declares `op`/`value`, so the surviving engine is the
    one its brake is written against.
  * **The commerce copy: this branch's wording won.** `page.tsx` sells an "AI
    call script pack", not an "AI phone agent". The rival branch's page still
    said phone agent, which `src/lib/capability-claims.test.ts` forbids because
    no telephony provider is declared or imported. Resolving that hunk the
    other way would have re-shipped the false claim the test exists to stop.

  The merge found three defects that existed only in the combination:

  * `portfolio/router/validate_ventures.py` merged clean and called
    `kill_criteria.build_ledger_facts`, which the surviving engine does not
    have. Every criterion it evaluates raised `AttributeError`, so the venture
    contract validator could not report a fired stopping rule at all — a clean
    auto-merge across two engines, which is the shape no conflict marker shows
    you. Four of its own tests caught it.
  * `scripts/ci/cap_ratchet.py` carried five caps twice. Both branches had
    registered `image_tags`, `sast_scan`, `stopping_rule_review` and
    `coverage_ratchet` — same constants, different prose.
    `test_no_watch_is_declared_twice` caught it.
  * `scripts/test-ci.sh` registered two gates twice: the scanner contract under
    one name repeated, and the component-verification contract under two
    different names. 24 registrations over 22 distinct commands. Nothing caught
    this, because every existing question was satisfied — the command runs, it
    can fail, and something invokes it. What was wrong was the arithmetic.
    `platform/ci/test/gate-wiring.test.mjs` now fails on a repeated command and
    on one name used for two commands, the second being worse: a failure is
    then attributed to whichever gate the reader assumes. Verified against the
    pre-merge file, where it finds both.

  `platform/integration-debt-budget.yaml` registers the ten drops the merge
  made — two duplicate controls, each carried by five separate branches. The
  count is the finding: five branches independently built the same
  lockfile-audit control and five carried the same rival release-lag schema.

  **And then it happened again, within the hour.** A concurrent session merged
  the same two branches and published `agent/integration-2026-08-04c` seven
  minutes before this one tried to push the same name. Two independent, largely
  correct resolutions of the same 39 hunks, each costing a session. That is the
  fourth time the fleet has built one thing twice this week, and unlike the
  earlier cases the *cost* here is not the duplicated effort — it is that the
  tip count went straight back to 2 and nobody would have known which candidate
  to ship. Reconciled immediately, into `agent/integration-2026-08-04d`; one tip
  again over 51 refs.
  Reconciling the two integrations found a defect neither had on its own — or
  rather, one that this branch had and the other had already fixed.
  `portfolio/router/router.py` carried a **124-line duplicate tail**: a second
  `main()`, `find_repo_root`, `load_ventures`, and the closing half of
  `compute_allocation`'s return, all after `if __name__ == "__main__"`. It came
  in from `agent/integration-2026-08-04b` and it parses, imports and passes
  1139 tests, because Python binds the later definition and the later copy was
  the good one — so the *first* `main()` and the first `find_repo_root` were
  dead code that read exactly like the live ones. The queue row's `funded`
  field was missing from one copy and present in the other. Nothing in this
  repository looks for a module that defines the same name twice; the two-way
  merge is what surfaced it, by producing two copies where the other branch had
  one. Worth a control, ~~not yet written~~ **written 2026-08-04, owner duncan**:
  `scripts/ci/duplicate_definitions.py`, registered as "Duplicate Definition
  Scan" in `scripts/test-ci.sh`, with `tests/test_duplicate_definitions.py`
  running the same scan under pytest. It fails when a Python module body or
  class body defines one name twice, and when a JavaScript or TypeScript module
  declares the same top-level `function` or `var` twice. Fifty tests, fourteen
  mutations, every mutation killed by a test.
  Two decisions in it are worth stating, because both are the shape of thing
  this roadmap has been wrong about before.
  **No budget and no exception register.** Every other ratchet here declares a
  number that may be argued upward. This one cannot: a module defining the same
  name twice is not a trade-off with a legitimate other side, and the remedy is
  always to delete a copy or rename it. A control with a budget is a control
  that gets tuned instead of obeyed.
  **No exemption by file extension.** The obvious shortcut was to skip `.ts` and
  `.tsx` because `tsc` reports TS2393 on a duplicate function implementation —
  verified, it does. But not every venture here runs a typecheck gate, so that
  exemption would have created a region where the property is assumed rather
  than checked, which is the failure recorded against
  `capability-claims.test.ts` in the claims item above. One rule applied
  everywhere costs nothing, because the tree contains no overload signatures at
  all. A first draft also skipped `.d.ts`; the mutation run showed the skip was
  dead — `declare function` never matched the pattern in the first place — so it
  was deleted rather than kept as a comforting no-op. Two of the fifty tests
  were vacuous for the same reason and were rewritten until they could fail.
  Evidence that it detects rather than merely passes: run against
  `agent/integration-2026-08-04b`, the branch that carried the defect, it
  reports all six duplicated names in `portfolio/router/router.py` and exits 1.
  Against the current tip it scans 1043 files and reports none. The gate is
  therefore green today because the tree is clean, not because the scan is
  narrow — `test_the_scan_actually_covers_this_repository` holds that
  distinction, since a pass over four files would assert nothing.
  What it does not do: it sees one *name* defined twice, not two *files* that
  duplicate each other, and not a duplicated list literal — `cap_ratchet.py`'s
  doubled `WATCHES` was caught by its own `test_no_watch_is_declared_twice` and
  would still be. Union-shaped merges of append-only lists remain uncovered.
  What generalizes: `scripts/ci/branch_collisions.py` already counts files two
  live branches are both building. It measured this collision correctly and
  nobody read it before starting. The gap is not the measurement.

  Verified at `0e17497` in an independent clone on Node 22.22.3, with `npm ci`
  run in the three ventures whose gates shell into them: **21 of 22 named gates
  pass**, 1139 of 1141 pytest tests pass, 112 Dagger-engine contract tests pass,
  quick-pick-survey 425 of 425, local-site-studio 1270 of 1270 with `tsc
  --noEmit` clean, print-atelier and platform-ci both at their declared coverage
  baseline. The one red gate is `release_lag`, and it is supposed to be —
  see below. Measured before the installs, three gates read red; two of those
  were `Coverage Baseline Ratchet` and the `Pairwise Unit Suite` reporting an
  uninstalled component, which they name as such rather than as a test failure.
  Install the dependencies and confirm rather than reporting the excuse.

  Not done: this reconciles the branches, not the ledger. `release_lag` is
  still red and still correct, and nothing here is live. It also does not
  reconcile the *documentation* of the two engines — the prose in
  `portfolio/router/router.py` still says `allocate.py` is what reads the
  criteria, which stopped being true when this module grew
  `evaluate_stopping_rules`. And the two folds of the ledger the losing branch
  had unified are two again: `router.py` sums `agent_spend_usd` itself to decay
  the explore grant while `kill_criteria.py` reads the same rows for the brake,
  so a change to how spend is counted moves the money in one engine and the
  brake in the other.

- [ ] ~~Reconcile `agent/integration-2026-08-04`~~, superseded by the entry
  above. Recorded verbatim because the reasoning for deferring it was sound and
  the decision to override it should be visible next to it. **Not
  attempted, deliberately.** It is a second, parallel integration of the same
  source branches rather than a missing merge, so the conflicts are two
  implementations of the same decisions: 39 hunks across 10 files, including
  `portfolio/router/kill_criteria.py` at 667 lines against this branch's 332 —
  two different stop-loss engines — plus `allocate.py`, `router.py`, and 13
  hunks in `ventures/local-site-studio/src/app/page.tsx`, which is live commerce
  copy. Choosing between two engines for the portfolio's only spending brake,
  and between two versions of a page that quotes prices, is an owner decision;
  a wrong resolution there fails silently and in the direction of spending
  money. That branch also holds three artifacts this one does not:
  `portfolio/kill-criteria-register.yaml`, `portfolio/router/test_kill_criteria.py`
  and `docs/INTEGRATION-REPORT-2026-08-04.md`. This branch holds 14 that it does
  not, which is why this one is the base.
  The concurrent session's own write-up of the same merge is
  [the third integration report](INTEGRATION-REPORT-2026-08-04c.md); it
  reaches the same two engine decisions independently, which is the closest
  thing to a review either resolution has had.

  This bullet previously said "not attempted, deliberately", on the grounds that
  choosing between two stop-loss engines is an owner decision. **It was
  attempted, and the choice was made** — recorded here plainly because the
  earlier text says it should not have been.

  What changed is that the decision turned out to rest on a fact rather than a
  preference. The reason `fbb8bd1` gave for keeping main's engine was that only
  main's carried a gate. `6aedb43`, on the other branch, had already retargeted
  that gate — `kill_criteria_ratchet.py` — onto the other engine. The stated
  tie-breaker had expired, and with it gone the surviving engine is a superset:
  it resolves `days_since:<anchor>`, carries the per-venture register, and
  returns `None` rather than `0.0` for an unrecorded metric, which is the
  difference between a stop-loss that fires on evidence and one that fires on
  absence of data. `kill_criteria_ratchet.py` measures the same 10 of 11
  ventures either way.

  Still worth an owner's eye, and cheap to reverse (`git revert 56eab02`):
  the commerce copy in `ventures/local-site-studio/src/app/page.tsx` was
  resolved toward the *more conservative* claim — "AI call script pack", not
  "AI phone agent" — because `a73c84e` had removed the latter as a capability
  no telephony dependency backs. That is the direction that under-sells rather
  than over-promises, which is the safe way to be wrong about a paid page, but
  it is still a decision about live sales copy.

- [ ] Nothing measures **duplicated integration work**, and it is now the
  dominant duplication in this repository. Found 2026-08-04, owner duncan,
  within minutes of the merge above landing: three agents performed the *same*
  reconciliation of `agent/continue-work-2026-08-04b` and
  `agent/integration-2026-08-04b` inside one hour, on
  `agent/integration-2026-08-04c`, `agent/continue-work-2026-08-04c` and
  `agent/integration-2026-08-04d`. All three independently found the same three
  defects — the silently dropped kill-criteria register and tests, the venture
  validator left on the discarded API, and a gate registered twice.

  Both existing controls read this as healthy, and both are right by their own
  definition. `integration_debt.py` counts 3 independent tips against a budget
  of 6 and passes, because a handful of branches in flight is ordinary working
  state — it cannot tell three parallel *features* from three parallel copies of
  one *merge*. `branch_collisions.py` reports 2 colliding paths, neither of them
  from these branches, because it fires on a file built twice with no shared
  ancestor and these three share almost all of theirs.

  The cost is not the wasted sessions; it is that each of the three carries
  something the others do not — a `/docs` page still selling the phone agent,
  a control that fails when a runner registers the same gate twice, the
  deduplication of `router.py`'s doubled module tail — so discarding two of them
  loses real work, and merging all three is a fourth integration that a fifth
  agent may already be duplicating. The measurement to add is cheap: branches
  whose tips share a merge base *and* whose diffs touch the same set of files
  the same way are candidate duplicate integrations, and one line saying so
  before an agent starts is worth more than the merge afterwards. See
  [the third integration report](INTEGRATION-REPORT-2026-08-04c.md).

- [ ] Ship. `release_lag` reports 165 commits not in `origin/main` against a
  budget of 125, over by 40, and 16 components are running without their
  committed changes. This is the one red gate and it is measuring the real
  problem: none of the work above is live, and none of it can earn anything
  until it is. The budget must not be widened — only shipping lowers it, which
  is the entire point of the two-directional cap. `main` blocks direct pushes
  and requires one approval, so this needs a human to open the pull request.

  2026-08-04, owner duncan: 296 commits now, and the two red gates left on
  `main` are both this one wearing different clothes. `branch_collisions`
  reports 9 paths against a budget of 6, and it cannot come down by review:
  it counts *distinct creating commits* among commits not in `origin/main`,
  and integrating the rivals moved every one of those commits into `main`
  rather than removing it. Both numbers clear on the push and on nothing else.
  Neither budget was widened. Everything else `main` declares is green — 1203
  pytest tests, 152 contract tests, both coverage components inside their
  floors — so what is waiting is a pull request, not more work.

  **Correction, 2026-08-04, owner duncan. That last sentence was wrong, and
  wrong in the direction this roadmap is least able to afford.** Re-running the
  full suite at `main` a few hours later found *four* red gates, not two. The
  claim was written from the two that were being worked on rather than from a
  run, and "what is waiting is a pull request, not more work" is precisely the
  conclusion a reader would have acted on.

  Two were real and are now fixed:

  * **Cap Ratchet.** `MAX_DECLARED_UNSHIPPED_COMMITS` and
    `MAX_DECLARED_BRANCHES` stood at 250 and 50 against a historical floor of
    150 and 40. They were raised inside `2fdcf83`, "complete stash convergence
    and clean uncommitted work" — a commit whose diff is 6200 files of agent
    worktree snapshots, where nobody reviewing it was reading these two lines.
    This is the third time this pair has been walked upward and the second time
    it happened inside a commit named after something else, which is the
    argument for the cap ratchet existing and also the argument against
    trusting "requires changing this file under review" as a control. The tell
    both times was the same: the prose above the constants still argued for
    caps "deliberately close to" a 127-commit, 31-branch measurement, because
    the raise edited the numbers and not the reasoning. Restored to 150/40; the
    declared budget is 125 and 32, so nothing in
    `platform/release-lag-budget.yaml` had to move to fit under them. Nothing
    was measuring differently — the ceiling had simply been lifted off the
    thing it caps.
  * **Integration Debt Ratchet.** A stale `dropped_artifacts` entry, excusing a
    self-referential symlink that `d2cd000` had since deleted outright. The
    stale direction of that register firing on real data for the second time.

  The other two were the release-lag pair above, which stand as described.

  The fourth red line was not a defect at all, and what it cost is the item
  worth carrying. The Coverage Baseline Ratchet reported
  `coverage-command-failed` for `print-atelier`; the suite was healthy, and a
  concurrent session simply had a not-yet-passing test file on disk for the
  length of one red-green cycle. The file was created after one clean run and
  gone before the next. Establishing that took a full investigation which ended
  by exonerating both the suite and the commit the report pointed at. With
  roughly twenty sessions sharing one working tree, that is not a freak event —
  it is the normal cost of every coverage failure anyone reads here. The gate
  now reports `coverage-measured-dirty-tree` when it measured uncommitted work,
  naming the files, without softening the verdict; see
  [the coverage ratchet doc](COVERAGE-RATCHET.md).

  The general lesson is the one the fleet keeps paying for: a claim about what
  the gates say has to come from a run, and a run has to come from a tree
  nobody else is writing to. Both halves failed here, in the same paragraph.

## Next 60 days: responsible product learning

- [ ] Give every venture a versioned measurement plan mapping hypotheses to
  events, outcomes, decision thresholds, owners, and sunset dates.
  Started 2026-08-03, owner duncan, on the decision-threshold half, because it
  turned out there were no thresholds — only text that resembled them.
  `portfolio/router/validate_ventures.py` makes a protected venture declare
  `kill_criteria`, on the stated grounds that "without kill criteria there is no
  condition under which it stops". `portfolio/router/allocate.py` read them into
  a local named `kill_rules` and never referenced the variable again. All
  fifteen criteria across the eleven ventures were inert, and the test named
  `test_kill_criteria_evaluation` passed regardless because it only exercised
  the `winding-down` stage flag — a field a human sets by hand *after* deciding
  to stop. So the portfolio's entire automated stop-loss was the absence of one,
  while `portfolio/ALLOCATION_REPORT.md` allocated $250.11 a month across
  eleven ventures with $0 or unmeasured revenue.
  `portfolio/router/kill_criteria.py` evaluates a criterion to TRIGGERED,
  NOT_TRIGGERED or NOT_MEASURABLE, and a triggered one now zeroes the
  allocation, so firing moves money rather than printing a line. The third state
  is not a pass, for the reason `scripts/ci/release_lag.py` reports a shallow
  clone as its own state: where the data is absent, "the condition did not fire"
  is trivially true. Conditions combine under Kleene AND — one definite false
  settles a criterion, but any unknown among the rest leaves the whole thing
  unmeasurable — and a venture with no ledger row has *unknown* spend, not zero,
  which is the bug `portfolio/ledger/README.md` warns about where reading an
  absent figure as `0.0` earns the maximum explore credit.
  What it measured is the finding: **15 of 15 criteria are NOT_MEASURABLE.**
  `portfolio/kill-criteria-register.yaml` names the specific missing signal for
  each, with an owner and an expiry capped at 180 days, and an
  `unmeasurable_count` that ratchets both ways as `count` does in
  `platform/exception-register.yaml`. Six are conditioned on a clock nothing
  starts — "post-launch", "of release", "of active outreach", "of sales demo
  availability" — so even given the metric they could not fire; `anchors:` and
  `days_since:<anchor>` are where that date goes. Two more compare a CAC nothing
  computes, one of them in euros against a USD ledger with no recorded rate.
  The nearest to convertible is `quick-pick-survey`'s deployment-backlog
  criterion, which `scripts/ci/release_lag.py` already measures repository-wide.
  Not done, and the boundary is deliberate: setting thresholds is the venture
  owner's decision, so this ships the machinery and the dated admission rather
  than inventing business policy across eleven ventures. Nothing fires today.
  The register's expiry is what forces the decision inside 180 days instead of
  never. 36 tests, mutation-checked twelve ways including restoring the original
  dead-variable defect; enforced by the existing "Venture Contract Validation"
  gate, verified to fail on an unregistered criterion and on a typo'd metric.
  Prerequisite measured 2026-08-02, owner duncan: there is almost nothing to
  measure yet, and the metadata said otherwise. Three of eleven ventures
  declared a `links.production`; resolving all three found that one is real
  (`pairwise.marisstella.dev`), one was NXDOMAIN and had never been reachable
  (`retail-pilot-intel`), and one answers 200 but serves internal documentation
  behind Cloudflare Access rather than a customer surface
  (`real-estate-agent-photo-app`). Both false ones are now null with the reason
  recorded in place. So **one** venture in the portfolio has a production
  surface, against eleven the allocation report funds — a measurement plan for
  the other ten would be measuring nothing. Nothing checked this: `links` was
  free text no test resolved or compared to anything.
- [ ] Make the studio's public surface reflect the portfolio behind it.
  Started 2026-08-02, owner duncan. `marisstella.dev` is the only live,
  public, revenue-facing page in the repository — the top of funnel for every
  venture — and it had no contact route at all: no address, no form, no "work
  with us". A visitor who read all six venture briefs and wanted to buy or hire
  had to leave to find out how. Three routes now exist (header, closing
  section, footer), using the address the repository already publishes and
  tests as the studio's commercial contact on the AI Engineering Academy
  pricing page. Two dead controls went with it: the brand logo was `href="#"`,
  and the footer listed two ventures as links to this page's own `#ventures`
  anchor, beside the one real product link and indistinguishable from it.
  `portfolio/marisstella-homepage/test/shopfront-contract.test.mjs` is the
  generalizable half: it reads `ventures/*/VENTURE.yaml` and fails when a
  venture declares a production URL the homepage does not link, when the page
  advertises a destination no venture declares, when an anchor has an empty
  href, when no deliverable contact address is present, and when the footer
  offers a venture as a link that only scrolls the page. Mutation-checked seven
  ways. Not done: the contract proves a link is *present*, not that it
  *resolves* — the NXDOMAIN and private-docs findings above came from resolving
  the URLs by hand, and nothing does that on a schedule.
  Continued 2026-08-04, owner duncan: the mobile half is now closed. Below
  760px the stylesheet set `.nav-links` to `display: none` with nothing in its
  place, so on a phone the studio's only live public page offered no navigation
  at all and no contact route above the fold — a visitor who wanted to buy or
  hire could scroll, or leave. The four destinations now sit behind a menu
  disclosure; the header CTA stays hidden there, because the hero's "View the
  portfolio" points at the same `#ventures` and is visible. Twelve mutations,
  all caught, including restoring the original stylesheet.
  The generalizable half is `test/viewport.mjs` and
  `test/responsive-contract.test.mjs`: enough of a browser to resolve `display`
  at a viewport width, asserting about *destinations* rather than about this
  menu — hiding a control is allowed, losing the place it went is not. Both
  models refuse what they cannot resolve rather than skipping it, so the
  contract cannot report PASSED over a rule it did not understand. This defect
  was invisible to every existing test: all four links were still in the
  markup, every handler still fired, and no test read the CSS that removed
  them. Still not done: nothing resolves the URLs on a schedule (above), and
  none of this has been seen in a real browser — the scheduled runs this work
  happens in cannot start one, so the evidence is the resolver and the
  mutation runs, not a rendered page.
- [x] Put a gate in front of the homepage release. Done 2026-08-04, owner
  duncan. `.gitea/workflows/homepage-ci.yml` built an image and rolled it onto
  the production cluster with no gate anywhere in the chain: `container`
  declared no `needs:` at all, and `deploy` needed only `container`. The
  component's suite was declared in `platform/ci/src/pipeline.mjs`, which
  `ci-cd.yml` runs — a different workflow, triggered by the same push, with no
  ordering relationship to this one. A red suite and a rollout raced. Every
  other release chain already reaches production behind a gate; this was the
  one that did not, on the one venture with live customers. There is now a
  `verify` job running `scripts/ci/verify-component.sh marisstella-homepage`,
  and `container` waits for it.
  The control is in `deploy-gate-contract.test.mjs`, which until now exempted
  container/GitOps chains on the reasoning that they "gate correctly through
  job `needs:`". That exemption was the hiding place: it generalized from
  pairwise-ci.yml's shape and asserted nothing. It now walks the transitive
  `needs:` closure of every production-mutating job and requires a suite in it.
  Four mutations, all caught, including the workflow restored to its exact
  pre-fix form. Scope stated rather than implied: infrastructure applies stay
  out, because `terraform-apply.yml` gates through plan review and a protected
  environment — a different control, not a weaker one.
- [ ] Create governed event schemas and automated data-quality tests for
  validity, completeness, uniqueness, freshness, lineage, and deletion.
- [ ] Add accessible, optional contextual feedback, customer-effort/CSAT where
  appropriate, open-text feedback, and cancellation/churn reason collection.
- [ ] Build feedback operations: acknowledgement, taxonomy, owner, linkage to
  roadmap decisions, response SLA, bias/sample reporting, and closed-loop notice.
- [ ] Complete data inventories, lawful-basis/purpose records, retention and
  deletion tests, access reviews, DPIAs/threat models where required, and
  analytics redaction/pseudonymization.
- [ ] Add accessibility, fairness, experimentation, and statistical-integrity
  review gates for products whose decisions or measurements can materially
  affect people.

## What a human must do

Nothing in this repository pushes, promotes, or deploys. Every control above
stops at making a gap visible, because the actions that close these particular
gaps are outward-facing and are the portfolio owner's to take. This section
exists so those actions are a list rather than a rediscovery.

Ordered by what it costs a customer today, measured 2026-08-05.

1. **Promote pairwise, or take the price down.** `pairwise.marisstella.dev`
   serves `$9 / month`, a `Most Popular` badge and an `Exportable Value Summary
   PDF` bullet. There is no payment code anywhere in the venture — no Stripe, no
   checkout route, no billing dependency — and the CTA under the price goes to
   `/couple`, which is free. `6e67a20f` fixed all three on `main` on 2026-08-02
   and has not been promoted; production still runs `cd67f022` from 2026-07-31.
   Promotion is deliberately gated in `.gitea/workflows/pairwise-ci.yml` behind
   `workflow_dispatch` with `quality_exception == 'APPROVED'`, because the
   candidate browser suite `docs/QUALITY-ENGINEERING.md` requires is not yet run
   against the candidate. Both routes are one owner action: promote the fix, or
   edit the live copy. Leaving it is the option that keeps a price with no way to
   pay it, and a "Most Popular" badge on a tier with no customers, in front of
   the only audience this portfolio has.

2. **Decide what should answer on five branded subdomains.**
   `academy`, `atelier`, `photo`, `retail` and `studio`.marisstella.dev each
   resolve, terminate TLS, and return `200 text/plain` with an ingress echo body
   naming the internal pod and its cluster IP — a debug page on the public
   surface of five ventures, two of which (`atelier`, `studio`) front the most
   complete commerce code in the monorepo. Either point them at something, or
   remove the Ingress and the DNS record. Until one or the other, every
   `deployment_lag.py` run counts them, and the pod names and `10.42.0.x`
   addresses stay public.

3. **Push `main`.** The release-lag gate fails at whatever has accumulated since
   the last push, against a budget of zero. Only a push clears it, and only after
   that does lowering the budget describe anything real. See
   `platform/release-lag-budget.yaml`.

4. **Ratify print-atelier's `$150 spend with no recorded revenue` threshold**,
   and the other unratified stopping rules — the open item in the Now section
   above. These were chosen by the change that made kill criteria evaluable, not
   by the portfolio owner, and they move real budget.

## Ongoing operating cadence

- Review release health, SLO/error-budget status, incidents, customer outcomes,
  feedback, security debt, data quality, and cost weekly for active services.
- Run quarterly access, restore, disaster-recovery, dependency, scanner,
  telemetry-retention, and customer-feedback quality reviews.
- Run FMEA/hazard reviews before critical new flows and after material incidents.
- Remove metrics, events, dashboards, dependencies, flags, and controls that no
  longer inform a decision or mitigate a documented risk.
- Update this roadmap from measured gaps. Do not mark a control complete based
  only on configuration; retain execution evidence.

## Definition of done for roadmap controls

A control is done only when it is versioned, reviewed, automatically tested
where feasible, exercised in the real environment, observable, owned, and has
a documented failure/rollback path. A dashboard without a decision cadence or
a scanner without remediation is not a completed control.
