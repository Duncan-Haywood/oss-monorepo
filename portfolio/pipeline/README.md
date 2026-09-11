# Candidate pipeline

Businesses that have been researched and scored but are **not** ventures yet.

**Portfolio direction (2026-08-24, deploy-first as of 2026-08-25):**
candidates exist to be **built**, not re-screened — and a built product
with no public URL outranks the next `build-now` item. Graduate only after
something already on `main` is reachable by a stranger. See
[`../DIRECTION.md`](../DIRECTION.md) "Current priority" and
[`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md).

Two of the scoring dimensions below read differently under that direction, and
the table has **not** been re-derived for it: **time to revenue** is really
*time to first user*, since everything ships free, and **distribution** means
*findable by search and AI assistants in a narrow niche*, not *listable in a
marketplace*. Read the ranking with that in mind rather than rescoring it — a
rescore is not a product, and the ranking is not what has been holding these
back.

`ventures/` is for things being built. This directory is the stage before that:
written-up candidates with an explicit verdict, so that starting a new venture
is a decision someone makes against evidence rather than an idea that arrived on
a good afternoon.

Nothing here is committed to. A candidate graduates in one of two ways,
matching its `graduate_as` field, and until one of them is true the router
cannot see it and no agent budget flows to it:

- **`graduate_as: venture`** — someone writes `ventures/<name>/VENTURE.yaml`.
- **`graduate_as: product-line`** — someone adds the candidate's slug under
  `product_lines` in its `host_venture`'s `VENTURE.yaml`. Two `build-now`
  verdicts have graduated this way: `eaa-remediation-pipeline` into
  `local-site-studio` and `mls-photo-spec-preflight` into
  `real-estate-agent-photo-app`, both on 2026-08-24. See the closing section
  on why adding ventures to an unmeasured portfolio is the more expensive
  problem.

In both cases the directory must actually be routable: a `NOT-A-VENTURE`
marker wins over a `VENTURE.yaml` in the same directory and `allocate.py` skips
it, so a graduation into a marked directory routes nothing.
`python3 portfolio/ledger/session_gate.py` reads exactly this rule to name the
next unbuilt `build-now` candidate.

**What a `product_lines` entry does and does not do today.** It is a
*session-gate* marker: `session_gate.py` reads it to stop naming the candidate
as unbuilt. `allocate.py` does **not** read `product_lines` — it builds one
`Venture` from the host's own fields and routes the host's hypotheses and
roadmap, identically before and after the slug is added. So effort reaches a
product line at *host-venture* granularity, not as a line item with its own
budget or task. Routing product lines directly would need an extension to
`allocate.py` and to the schema `portfolio/router/validate.py` enforces; that
is unbuilt, and until it exists, do not read "graduated" here as "the router
now allocates to it separately."

## Why this is separate from `ventures/ai-first-markets`

That venture is a **product**: a market map and scored idea library for solo
founders, and its ideas are chosen to be useful to that audience. This directory
is the portfolio's **own intake**, and it is scored on two dimensions that
product does not use — liability containment and ethical robustness — because
this portfolio has to actually live with what it starts.

Overlap is checked in both directions. A candidate that duplicates one of the
eight ideas in `ventures/ai-first-markets/src/data/ideas.ts`, or an existing
venture, is screened out and recorded in [screened-out.md](screened-out.md).

**Run the check before writing the check by hand.** At 199 `ventures/`
directories, most of them a `<trade>-bid-calculator` shape, eyeballing this
list is no longer reliable — see `duplicate_check.py`'s own module docstring
for the near-duplicate that scored as unrelated under a naive word-overlap
metric before this existed:

```
python3 portfolio/pipeline/duplicate_check.py "one-line description of the niche"
```

It scores the proposed niche against every venture description (including
product lines), every `screened-out.md` row, the eight `ai-first-markets`
ideas, and every existing pipeline candidate, and exits 1 with the closest
matches printed when the top score clears the "read this before you write a
candidate" bar. It is lexical overlap, not meaning — a low score is evidence
of novelty, not proof — so read the top matches it prints either way.

**The `<trade>-bid-calculator` archetype itself is now the thing to weigh,
not just the individual niche** (added 2026-09-07). Counted directly from
`ventures/` this session: of 200 venture directories, **141 have a slug
ending in `-calculator`, `-margin`, `-pricing`, or containing `-route-`** —
one deterministic arithmetic calculator for one trade, repeated. Every one
of them clears `duplicate_check.py` on its own (a boiler is not a crown
molding job), and every one is individually well-justified in its own
write-up. None of that is in question. What is: `usage/usage.yaml` has
never recorded a nonzero visitor on *any* of the 200, and the shape itself
— not any one instance of it — has now had 141 independent tries with
nothing to show. A 142nd instance clearing the duplicate check and the
liability/ethics gates is necessary but no longer strong evidence that the
*archetype* is the right next bet, separately from whether the *niche* is.

This does not mean stop building bid calculators — a specific niche with an
unusually strong, named channel (a trade forum that already discusses this
exact pricing problem, a subreddit with real thread volume) is still worth
building regardless of shape. It does mean: when screening a fresh niche
with no channel stronger than "searchable, like the other 141," weigh a
different product shape first — CLI/library, a GitHub Action or checker
that runs in the user's own CI, or a generator (`PRODUCT_PLAYBOOK.md` §2
ranks these above the browser calculator already, on cost grounds; this is
the same ranking, argued from zero traffic across 141 tries rather than
from marginal cost alone). `ventures/actions-runner-starvation-check` is
one such attempt — a developer-niche CLI/browser tool, not a trade
calculator, built the same session this note was added.

## Scoring

Eight dimensions, 0–10. The first six are the same dimensions
`ai-first-markets` uses, so scores are comparable across both:

| Dimension | 10 means |
|---|---|
| AI leverage | The work is mostly model work; a human adds little per unit |
| Autonomous ops | Runs unattended; no queue that only a person can drain |
| Time to revenue | First paid customer plausible inside a month |
| Gross margin | Cost of delivery is inference and hosting, nothing else |
| Defensibility | A copy of the product does not take the customers |
| Distribution | A reachable channel exists today, without paid acquisition |
| Liability containment | Being wrong costs a refund, not a lawsuit |
| Ethical robustness | The business gets better for customers as it scales, not worse |

Three rules make the composite mean less misleading than it would be alone:

1. **Ethics and liability are gates, not weights.** A candidate scoring below 5
   on either is rejected regardless of composite. Averaging lets a high margin
   buy off a legal exposure; that trade is not available here.
2. **Any dimension at 4 or below needs a named mitigation** before graduation.
   Distribution and time-to-revenue are where good candidates usually die, and a
   strong composite hides exactly that.
3. **A candidate that fits an existing venture is a product line first.** New
   ventures cost a distribution channel from scratch. If the buyer is already a
   buyer of something in `ventures/`, test it there before opening a directory.

## Standing constraints these candidates were selected against

From the portfolio's brief: AI-heavy or software, no employees (contractors
managed by agents are acceptable), low capital, low liability, and revenue that
survives its own ethics review.

Four consequences worth stating once, because they eliminated more candidates
than any market analysis did:

- **No advice-of-record.** Legal, tax, medical, and filing-on-behalf-of positions
  carry professional liability an unattended agent cannot hold. Candidates here
  produce evidence, drafts, and monitoring — the customer remains the filer,
  the signer, and the decision-maker. This is a positioning constraint on
  otherwise good compliance markets, not a reason to avoid them.
- **No claim of compliance.** "You are now compliant" is a warranty. "Here is
  what we tested, what we changed, what remains, and when we checked" is a
  record. Only the second is sellable without counsel.
- **Contractors do the parts that must be human**, on fixed-scope work orders,
  and the agent owns intake, scheduling, review, and payment. Manual assistive
  technology testing is the clearest example — it cannot be automated honestly,
  and pretending otherwise is what got the overlay vendors sued.
- **Data must be public or customer-supplied.** Scraped personal data and
  purchased lead lists move a business from "low liability" to "GDPR exposure
  with no legal team" in one step.

## Current candidates

Scored 2026-08-18 unless noted. Composite is the mean of eight dimensions;
`floor` is the lowest single dimension, which is usually the thing that actually
decides.

Rescored 2026-08-20 for the two candidates that have actually been probed — see
[rescore-2026-08-20.md](rescore-2026-08-20.md) for the derivation. Scores with no
`measured:` block in `candidates.yaml` are still the original estimates.

Both gates were measured on 2026-08-21 — see the two sections below — so the
four candidates carrying a probe have moved and the table is re-ordered.

| # | Candidate | Composite | Floor | Verdict |
|---|---|---|---|---|
| 1 | [Shopify accessibility evidence app](candidates/shopify-a11y-evidence.md) | 7.25 | 4 | Probe the channel — scored 2026-08-19. Top of the table only because nobody has probed it |
| 2 | [Invoice payment terms calculator](candidates/invoice-payment-terms-calculator.md) | 7.25 | 1 | Graduated 2026-08-26 as `ventures/invoice-payment-terms-calculator`; browser-local due-date, late-fee, exposure, and 2/10 Net 30 vs waiting arithmetic, with repeat usage and organic search demand still unmeasured |
| 3 | [Quote margin check](candidates/quote-margin-check.md) | 7.125 | 3 | Graduated as `ventures/quote-margin-check`; deterministic local calculator now with proposal-batch comparison and a spreadsheet-ready review export, with repeat usage and defensibility still unmeasured |
| 4 | [EAA remediation pipeline](candidates/eaa-remediation-pipeline.md) | 7.125 | 5 | Graduated 2026-08-24 as a `local-site-studio` product line. Both gates measured 2026-08-21 — `liability_containment` 6→5 (**on** the gate, unmoved), `ethical_robustness` 9→6→9 after the record began printing its error rates |
| 5 | [Etsy profit calculator](candidates/etsy-profit-calculator.md) | 7.125 | 2 | Graduated 2026-08-24 as `ventures/etsy-profit-calculator`; browser-local fee-stack arithmetic, with repeat usage and organic search demand still unmeasured |
| 6 | [Public-record watch](candidates/public-record-watch.md) | 7.0 | 4 | Cheap probe — one vertical, two weeks. `ethical_robustness` 9→6→9 on 2026-08-21, after the subscriber record was built; the detector still misses two thirds of the dormancy it looks for |
| 7 | [Cut-list optimizer](candidates/cut-list-optimizer.md) | 7.0 | 2 | Graduated 2026-08-24 as `ventures/cut-list-optimizer`; deterministic kerf-aware stock planning for makers, with repeat usage and material savings still unmeasured |
| 8 | [Pool route pricing calculator](candidates/pool-route-pricing.md) | 7.0 | 1 | Graduated 2026-08-24 as `ventures/pool-route-pricing`; browser-local recurring-account pricing that makes drive time and chemical allowance explicit, with repeat usage and organic search demand still unmeasured |
| 9 | [Agent permission harness](candidates/agent-permission-harness.md) | 6.875 | 4 | Park; revisit 2027-Q1. Probed 2026-08-21 — internal build done, `ai_leverage` 9→8; `ethical_robustness` 9→7→9 after `validate_accuracy.py` measured 0 false positives / 0 false negatives on a 34-case fixture corpus and the findings report started disclosing it |
| 10 | [MCP supply-chain watch](candidates/mcp-supply-chain-watch.md) | 6.875 | 3 | Probe: steps 1–2 run; mitigation refuted, cannot graduate as scored. `ai_leverage` 6→7 on 2026-08-22 — a blind model pass on the held-out corpus roughly doubled the rules classifier's F1 |
| 11 | [Dog walking & pet sitting route pricing calculator](candidates/dog-walking-route-pricing.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/dog-walking-route-pricing`; browser-local per-visit and route pricing for independent dog walkers and pet sitters, with repeat usage and organic search demand still unmeasured |
| 12 | [Vending machine route profit calculator](candidates/vending-machine-route-margin.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/vending-machine-route-margin`; browser-local per-location and route profit for independent vending-machine route operators, with repeat usage and organic search demand still unmeasured |
| 13 | [ATM route margin calculator](candidates/atm-route-margin.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/atm-route-margin`; browser-local per-location and route profit for independent ATM route operators, modeling surcharge split, processor fees, and vault cash cost of capital, with repeat usage and organic search demand still unmeasured |
| 14 | [Custom farm rate calculator](candidates/custom-farm-rate-calculator.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/custom-farm-rate-calculator`; browser-local per-job and season pricing for custom farm operators, modeling field capacity, fuel, repairs, and annually-amortized machine ownership cost, with repeat usage and organic search demand still unmeasured |
| 15 | [Dumpster rental margin calculator](candidates/dumpster-rental-margin-calculator.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/dumpster-rental-margin-calculator`; browser-local roll-off rental pricing, with repeat usage and organic search demand still unmeasured |
| 16 | [Locksmith bid calculator](candidates/locksmith-bid-calculator.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/locksmith-bid-calculator`; browser-local per-call pricing for mobile locksmiths, modeling an after-hours premium scoped to billed time and a minimum-service-charge floor, with repeat usage and organic search demand still unmeasured |
| 17 | [Pour cost calculator](candidates/pour-cost-calculator.md) | 6.875 | 1 | Graduated 2026-09-07 as `ventures/pour-cost-calculator`; browser-local liquor-cost-percentage pricing for bar and restaurant beverage programs, modeling a spirit/modifier/mixer recipe against a target pour cost and the annual dollar cost of a stated over-pour, with repeat usage and organic search demand still unmeasured |
| 18 | [Fire extinguisher inspection route margin calculator](candidates/fire-extinguisher-inspection-route-margin.md) | 6.875 | 1 | Graduated 2026-09-06 as `ventures/fire-extinguisher-inspection-route-margin`; browser-local per-site and route profit for independent fire-extinguisher/life-safety inspection route operators, modeling the recharge/hydro-test/replacement materials split and NFPA 10's annual-visit cadence, with repeat usage and organic search demand still unmeasured. |
| 19 | [Poshmark fee calculator](candidates/poshmark-fee-calculator.md) | 6.875 | 1 | Graduated 2026-09-07 as `ventures/poshmark-fee-calculator`; browser-local flat-$2.95/20% commission arithmetic for Poshmark resellers, modeling the $14.75 break-even price and the payout swing when an offer or bundle discount crosses the $15 line, with repeat usage and organic search demand still unmeasured |
| 20 | [Duplicate payment audit](candidates/duplicate-payment-audit.md) | 6.875 | 1 | Graduated 2026-09-07 as `ventures/duplicate-payment-audit`; browser-local checker flagging likely duplicate vendor payments in an AP CSV export, with repeat usage and false-positive rate against a real ledger still unmeasured |
| 21 | [Affiliate disclosure checker](candidates/affiliate-disclosure-checker.md) | 6.875 | 1 | Graduated 2026-09-09 as `ventures/affiliate-disclosure-checker`; browser-local + CLI checker for affiliate/sponsored-content disclosure placement (Amazon Associates tag= links, amzn.to, rel=sponsored, known affiliate-network tracking domains) against Amazon's own required exact statement and generic FTC-style disclosure phrasing, with repeat usage and organic search demand still unmeasured |
| 22 | [Chrome extension permission checker](candidates/chrome-extension-permission-check.md) | 6.875 | 1 | Graduated 2026-09-09 as `ventures/chrome-extension-permission-check`; browser-local + CLI checker cross-referencing manifest.json permissions against detected chrome.* API usage in both directions (declared-unused, the Chrome Web Store "Purple Potassium" rejection cause, and used-undeclared, a runtime failure), plus broad host_permissions detection, with repeat usage and organic search demand still unmeasured |
| 23 | [WordPress plugin review checker](candidates/wordpress-plugin-review-check.md) | 6.875 | 1 | Graduated 2026-09-09 as `ventures/wordpress-plugin-review-check`; browser-local + CLI checker cross-referencing a readme.txt Stable tag against the plugin header's Version, required readme/header fields, unescaped superglobal output, and $_POST handling with no nonce check, with repeat usage and organic search demand still unmeasured |
| 24 | [Social preview checker](candidates/social-preview-check.md) | 6.875 | 1 | Graduated 2026-09-10 as `ventures/social-preview-check`; zero-dependency CLI + browser report viewer reading a page's Open Graph/Twitter Card tags and its og:image/twitter:image real pixel dimensions (decoded from the image file's own byte header, PNG/JPEG/GIF/WebP), classifying missing tags, a relative og:image URL, an image below Facebook/Twitter's documented minimum size, and applying the twitter:image -> og:image fallback chain, plus a standalone in-browser image-dimension checker that needs no CLI step, repeat usage and organic search demand still unmeasured |
| 25 | [MLS photo spec preflight](candidates/mls-photo-spec-preflight.md) | 6.75 | 5 | Graduated 2026-08-24 as a `real-estate-agent-photo-app` product line (`process/mls-compliance.ts`) — file-spec evidence, not listing photography the venture and not web accessibility |
| 26 | [CRA evidence desk](candidates/cra-evidence-desk.md) | 6.75 | 3 | Probe (was build-now); wedge is egress-blocked. `ethical_robustness` 8→6→7→8 — 7→8 on 2026-08-21 after the triage engine's own record began carrying its hand-verified wrong-suppression rate (0 of 53 claims wrong) |
| 27 | [Vendor-change evidence monitor](candidates/vendor-change-evidence.md) | 6.75 | 4 | Graduated 2026-08-29 as `ventures/vendor-change-watch`; free CLI to monitor vendor ToS/privacy pages, with distribution and archive value still unmeasured |
| 28 | [Shopify app-permission drift record](candidates/shopify-permission-drift.md) | 6.75 | 4 | Probe; customer-authorized app inventory, with platform observability and App Store demand unmeasured |
| 29 | [Tender radar](candidates/tender-radar.md) | 6.625 | 4 | Park; needs a channel partner |
| 30 | [DNS configuration evidence monitor](candidates/dns-configuration-evidence.md) | 6.625 | 4 | Probe; needs an MSP or domain-operations channel and a history-value test |
| 31 | [Grant reporting tracker](candidates/grant-reporting-tracker.md) | 6.625 | 1 | Graduated 2026-08-24 as `ventures/grant-reporting-tracker`; browser-local award reporting queue and restricted-balance arithmetic for small nonprofits, with repeat usage and organic search demand still unmeasured |
| 32 | [Repository branch hygiene and recovery](candidates/repository-branch-hygiene.md) | 6.5 | 4 | Graduated 2026-08-24 as `ventures/repository-branch-hygiene`; read-only pilot and distribution remain unmeasured |
| 33 | [Backup verification evidence](candidates/backup-verification-evidence.md) | 6.5 | 4 | Probe; local exit-code/artifact classifier built, needs a real recurring job and a sysadmin/MSP channel |
| 34 | [CORS misconfiguration checker](candidates/cors-misconfig-check.md) | 6.5 | 1 | Graduated 2026-09-10 as `ventures/cors-misconfig-check`; zero-dependency CLI sending five real GET requests with crafted Origin headers to a URL the user names, classifying reflected-arbitrary-origin, accepted-null-origin, and unanchored startsWith/endsWith allow-list bypasses, plus wildcard-with-credentials and missing-Vary notices, with a browser report-viewer for the CLI's JSON output (the browser cannot probe itself -- Origin is a forbidden request header), repeat usage and organic search demand still unmeasured |
| 35 | [Software evidence provenance ledger](candidates/software-evidence-provenance.md) | 6.375 | 3 | Reject; existing provenance standards leave no defensible wedge and distribution is unresolved |
| 36 | [hreflang reciprocity checker](candidates/hreflang-reciprocity-check.md) | 6.375 | 1 | Graduated 2026-09-11 as `ventures/hreflang-reciprocity-check`; zero-dependency CLI fetching a target URL and its hreflang alternates over real HTTP, checking missing reciprocal confirmation, invalid/malformed language-region codes against the full ISO 639-1/ISO 3166-1 lists (naming the en-uk -> en-GB mistake by name), a missing x-default, a missing self-reference, and duplicate/conflicting hreflang values, with a browser page that works from pasted HTML plus a best-effort per-alternate automatic fetch (the browser usually can't read a cross-origin response without the target's own CORS opt-in), repeat usage and organic search demand still unmeasured |
| 37 | [Sitemap lastmod freshness checker](candidates/sitemap-lastmod-freshness-check.md) | 6.25 | 1 | Graduated 2026-09-11 as `ventures/sitemap-lastmod-freshness-check`; zero-dependency CLI fetching a sitemap.xml and every <loc>'s live headers over real HTTP, checking invalid/malformed W3C-Datetime <lastmod> format (including calendar validity), a future-dated lastmod, duplicate <loc> entries with conflicting lastmod values, a suspiciously uniform lastmod date across nearly every URL (the "freshness-faking" pattern Google's own sitemap documentation warns about), and a lastmod not confirmed by the live page's own HTTP Last-Modified header, with a browser page that works entirely from pasted sitemap XML for the four checks that need no live fetch, repeat usage and organic search demand still unmeasured |
| 38 | [Redirect chain checker](candidates/redirect-chain-check.md) | 6.25 | 1 | Graduated 2026-09-11 as `ventures/redirect-chain-check`; zero-dependency CLI walking a URL's real HTTP redirect chain one hop at a time, checking a redirect loop, a chain longer than Google's own recommended single hop, an HTTPS-to-HTTP protocol downgrade, a same-path scheme/host normalization using a temporary 302/303/307 instead of a permanent 301/308, and a chain ending in an error or still redirecting with nowhere further to go, with a browser page that works entirely from a pasted "<status> <url>" hop list (a browser tab cannot reliably read a cross-origin redirect chain's own intermediate headers), repeat usage and organic search demand still unmeasured |
| 39 | [E-invoice preflight](candidates/einvoice-preflight.md) | 6.125 | 4 | Reject broad version; narrow version conditional |
| 40 | [Consent change record](candidates/consent-change-record.md) | 6.125 | 4 | Probe; needs an agency or privacy-implementation channel |

**"No measured dimension has ever risen" is no longer true, and the way it
stopped being true is the useful part.** This file said it across four
candidates and eleven revisions, and before that it said every revision was
exactly one point until an `ethical_robustness` measurement revised by two and
by three. Both sentences were fixed prose describing a sample that kept moving.
Of the eleven revisions recorded, **seven are downward and four are upward**,
and no upward one is a later pass liking a candidate more. In each case the
artifact being measured was changed and the same harness was re-run:
`eaa-remediation-pipeline` printed its committed error rates into its customer
record (6 → 9), `public-record-watch` gained the subscriber record it did not
have (6 → 9), `agent-permission-harness` gained a measured accuracy figure it
never had (7 → 9), and `cra-evidence-desk` first got back a point a rubric bug
had charged it and then had its own remaining gap actually measured (6 → 8).
That distinction is the thing to preserve — **a score may rise because someone
fixed the thing being measured, never because someone re-estimated it** — and
`test_score_sensitivity.py` now pins it rather than trusting it.

(A `measured:` block holds one revision per dimension and its opener states the
current one, so the intermediate 9 → 6 steps are prose inside those blocks
rather than extra rows in this count. The count is of *dimensions revised*, not
of times anyone changed a number.)

`score_sensitivity.py` derives all of this rather than asserting it, and
**withholds** its rank extrapolation: with revisions in both directions there is
no consistent sign to carry to the cells nobody has looked at, let alone a
magnitude — withheld rather than set to zero, since an unlooked-at cell is not
thereby confirmed. Read the
four unmeasured rows as upper bounds rather than as better candidates —
[rescore-2026-08-20.md](rescore-2026-08-20.md) has the pattern and what follows
from it, and the top of this table is now the clearest case of it: the leading
candidate leads because it has never been probed.

### The pattern is narrower than it reads, and it points somewhere else

`python3 portfolio/pipeline/score_sensitivity.py` does the arithmetic on the
sentence above. Three findings, all of them checkable from
[candidates.yaml](candidates.yaml) alone and none of them requiring a market:

1. **The measurement record now covers five of eight dimensions**, including
   both gates: the three rank dimensions (`ai_leverage`, `defensibility`,
   `distribution`) plus `liability_containment` and `ethical_robustness`, both
   measured on 2026-08-21. "No measured dimension has ever risen" held across
   eleven revisions and then stopped: it is now 7 down and 4 up across eleven.
   It never meant that measurement always lowers a score — a pass
   that measures a dimension and leaves it alone records no revision at all, so
   confirmations are nearly invisible here, and two are recorded explicitly
   (`flagged_unmeasured` blocks). What the four upward revisions add is the case
   the sample could not previously contain: a *fixed* artifact, re-measured by
   the harness that faulted it.
2. **The magnitude claim did not survive the gate measurements, and the
   extrapolation went with it.** This section used to read "revised down by
   one", which was true of all six revisions it was written about. The first
   `ethical_robustness` measurement revised by 2 and by 3, so the script now
   derives a *range* (1–3) and withholds the rank extrapolation entirely: with
   no single magnitude there is nothing to carry to the cells nobody has looked
   at, and setting it to zero would quietly assert those cells are fine.
   `rescore-2026-08-20.md`'s conclusion — that further rank-scoring has no
   decision value — is unaffected, and is now the *only* thing this section
   claims about rank. A pass tempted to re-rank should still run the script and
   stop.
3. **The dimensions that decide admission were the ones nobody had measured.**
   Liability containment and ethical robustness are gates, not weights — below
   5 rejects regardless of composite. When this section was written all sixteen
   of those scores were 2026-08-18 screening estimates, and extrapolating the
   same one point to them put `einvoice-preflight` below the liability gate and
   left `eaa-remediation-pipeline` — the pipeline's only `build-now` — sitting
   one unmeasured point above the gate that would reject it.

So the next scoring measurement worth paying for was a **gate** measurement,
and no pass had attempted one. That is a different kind of work from the probes
in [probes/](probes/), which all test whether a candidate *works*; a gate
measurement tests whether being wrong costs a refund or a lawsuit.

### The first gate measurement has now been taken (2026-08-21)

`liability_containment` on `eaa-remediation-pipeline`: **6 → 5**, composite
7.25 → 7.125. Derivation in
[`portfolio/research/a11y-external-coverage-reference/`](../research/a11y-external-coverage-reference/);
the prediction above was right about which cell mattered.

**The reason this had been recorded as blocked was wrong, and the way it was
wrong is the reusable part.** This file said a gate measurement needs the WCAG
normative index as a denominator, that `www.w3.org` is egress-denied, and that
no copy is in the repository. All three clauses are true. The conclusion does
not follow: `axe-core` publishes its success-criterion tags in its npm package,
and `registry.npmjs.org` has been measured reachable twice. The denominator had
a distribution channel nobody probed, which is exactly the error
[`../research/data-reachability/`](../research/data-reachability/) exists to
stop — a rule that had been applied to feeds and never to a standard.

What it measured is not whether the engine finds everything. The candidate's
liability position rests on **the coverage statement being accurate**, and that
artifact had never been compared to anything outside this repository. Compared:
8 of 22 automatable A/AA criteria were in neither the checked list nor the
not-tested list (6 Level A, including 2.4.1 Bypass Blocks), and criterion-level
disclosure hides the rest — 4.1.2, disclosed as `partial`, stands for 3 rules
against the reference's 29. The 8 are now disclosed in both engines; the
granularity is structural and is what moved the score.

Two consequences for what to do next:

- **The pipeline's only `build-now` now sits *on* the gate**, tied at the floor
  with `defensibility`. One more measured point in liability rejects it.
- **`ethical_robustness` was then the remaining unmeasured gate**, on all eight
  candidates. `score_sensitivity.py` derives this rather than asserting it, so
  it stopped asking when the next section measured it.

### The second gate measurement, the same day (2026-08-21)

`ethical_robustness`, on the four candidates that have a built probe:
`eaa-remediation-pipeline` **9 → 6**, `public-record-watch` **9 → 6**,
`cra-evidence-desk` **8 → 6**, `agent-permission-harness` **9 → 7**. Derivation,
rubric and the script that produced it are in
[`portfolio/research/error-rate-disclosure/`](../research/error-rate-disclosure/).
The other four are untouched: they have no probe, so there is nothing to
measure and their 8s and 9s remain screening estimates.

The dimension asks whether the business gets better for customers as it scales.
That is answerable rather than atmospheric once you name the mechanism by which
an evidence business gets *worse*: **the customer acts on a record whose errors
are invisible to them, in a direction the operator profits from.** Both halves
are checkable from this repository alone, and neither had been checked.

What the measurement found, by rendering each probe's own customer-facing
artifact and looking in it. **This is the state as measured; one of the four
gaps has since been closed — see the subsection after this one:**

- **Every probe that renders a customer record discloses its scope. None of
  the four discloses its accuracy.** Four of four artifacts carry no error rate — including the two whose rate this
  repository has already measured and committed (`eaa-wcag-triage`'s
  out-of-sample precision of 0.821–0.881; `source-silence-detector`'s held-out
  recall of 0.35). The numbers exist. They stop at the research directory.
- **Scope disclosure is not accuracy disclosure**, and this pipeline had been
  treating them as one thing. `eaa-wcag-triage`'s record is the most careful
  disclosure artifact in the repository — every criterion labelled, every
  undecidable element named with its reason — and it never says that a finding
  in the list can be wrong. Out of sample, 12–18% of them are not defects.
- **Only one artifact names the direction it errs in**
  (`npm-reachability-triage`: *"False positives are expected; a suppressed
  finding that should not have been is the failure this tool is built to
  avoid"*) — and that is precisely the direction whose rate has never been
  measured. Saying which way you are wrong without saying how often, and
  measuring how often without saying which way, are the two halves of the same
  omission, and the four probes split evenly between them.
- **Two candidates' products have no customer-facing record module at all.**
  `source-silence-detector`'s closest artifact prints `MISSED` beside a source
  whose dormancy it failed to catch — the detector knows, and nothing carries
  that to a subscriber.
- **In three of four, the undisclosed direction is the one that pays.** The
  accessibility audit is the qualification step that sells the fixed-price job,
  so over-reporting converts. The dependency triage is sold on cutting the
  alert count, so a wrong suppression improves the headline. The register watch
  loses subscribers to nuisance alarms and loses nothing to a miss, so the
  cheapest tuning is the one that fails them. The fourth,
  `agent-permission-harness`, states no revenue model, so no alignment
  deduction was taken — it loses two points for not knowing its error rates
  rather than for not disclosing them.

**No candidate crossed the gate**, and that is the honest headline: the errors
are real and the mitigations are cheap. Printing the measured precision in the
record is one line of rendering, and is worth a point back on the pipeline's
only `build-now`. The gap this measures is a disclosure gap, not a business
model that has to harm someone to work.

It also says something about the last four passes over this directory. Every
one of them measured an accuracy number and wrote it *here*, where the pipeline
reads, rather than into the artifact where a customer would. That is a
reasonable division while nothing ships, and it stops being reasonable at the
moment anything does.

### The mitigation was taken, on one of the four (2026-08-21)

`eaa-wcag-triage` now prints its error rates in the record it hands a customer.
**`eaa-remediation-pipeline` 6 → 9, composite 6.75 → 7.125** — the first upward
revision in [candidates.yaml](candidates.yaml), and the reason the "no measured
dimension has ever risen" sentence above had to go.

The record carries both committed figures with their corpus, date, derivation
path and limits (precision **0.821–0.881** over-reporting; recall **0.975**
under-reporting), in two places — a headline in the summary block and a full
section immediately above the findings table — and it states which direction
pays the operator, verbatim: *"this audit is the qualification step for a paid
remediation job, so over-reporting is the error that would pay us."* All three
deductions lapse.

Three things to carry forward rather than the number:

- **The restored 9 is the screening estimate no longer being reduced, not a
  finding that this business is ethically strong.** This rubric measures
  disclosure and nothing else. The precision denominator excluded 1.4.3
  entirely, the recall figure is a single comparison on a corpus exercising 2 of
  13 criteria, and neither was measured on a customer's shop. Those are now
  *disclosed*, not resolved.
- **The candidate's floor did not move.** `liability_containment` is still 5,
  still on the gate, and one more measured point there still rejects it. This
  changed the composite, not the thing that decides.
- **A fixed rate must not be able to go stale in a customer record.** The
  probe's `tests/test_accuracy_citations.py` checks every printed figure against
  the derivation it cites, so a number revised upstream fails the build instead
  of being quoted at a buyer.

**`cra-evidence-desk` 6 → 7 in the same pass, for a different reason.** Its
artifact did not change; the harness did. `score()` charged the adverse-alignment
deduction whenever alignment was adverse, while the rubric it publishes conditions
that deduction on the direction being *undisclosed* — and this is the one probe
that already named its adverse direction, so it was charged for concealing what
it discloses. The rubric suite's `test_full_disclosure_costs_nothing` had only
ever run against the single candidate whose alignment is not adverse, so the
disagreement was never exercised. Both cases are pinned now. Its remaining
deduction is the real one: the false-suppression rate has never been measured,
so there is no figure to print.

**Two of the four gaps needed building rather than rendering**, because
`source-silence-detector` and `agent-permission-harness` had no
customer-facing record module at all. `source-silence-detector`'s was the
sharper one — it *had* a committed held-out recall of 0.35 and no product
surface to print it on, and a subscriber sees the same silence whether the
register is quiet or the watch failed; see the amendments in
[`portfolio/research/error-rate-disclosure/`](../research/error-rate-disclosure/)
for that fix.

**`agent-permission-harness` closed its gap the same day, in
`probes/agent-permission-harness/`.** It had no rate to print at all — one
unlabelled corpus, no ground-truth. `validate_accuracy.py` is a new, explicit,
labeled fixture corpus (34 cases: the existing fire/silent regression fixtures
from `test_harness.py`, plus new cases per rule, run for real through
`harness.analyse()`) and measures 0 false positives, 0 false negatives on the
16/34 positive-rule opportunities those fixtures cover. `harness.render_markdown()`
now states that figure in a "How this can be wrong" section, together with the
honest limit: the corpus is author-authored, not held-out, so this is a floor
on precision/recall against cases built to trip the seven coded rules, and it
says nothing about attack or misconfiguration classes none of the seven
encodes. `ethical_robustness` **9 → 7 → 9**, composite 6.625 → 6.875.

Step 1 of `public-record-watch`'s first experiment has since been run — see the
amendment in [its write-up](candidates/public-record-watch.md) and the
measurement in
[`portfolio/research/register-change-rate/`](../research/register-change-rate/).
No score moved; the change-rate premise holds and the reasons the candidate is
hard did not change.

Executable probes already built for these candidates: [probes/](probes/) —
`npm-reachability-triage` (for `cra-evidence-desk`), `eaa-wcag-triage` (for
`eaa-remediation-pipeline`), `source-silence-detector` (for
`public-record-watch`), `agent-permission-harness` (for the candidate of the
same name) and, from 2026-08-22, `mcp-drift-watch` (for
`mcp-supply-chain-watch`, which had research but no artifact until then; its
held-out run measured the shipped classifier at precision 0.40 / recall
0.24–0.29 while the alert *rate* reproduced to within 0.2 points, and changed
no rule and no score). `CLAUDE.md`'s intake gate sends every generic
session to "advance a probe that is already specified in `portfolio/pipeline/`",
and until this line existed no file that routes a session named the directory
those probes live in. Read `probes/README.md` before writing a new one.

Machine-readable scores: [candidates.yaml](candidates.yaml), checked by
`validate_candidates.py` (`python3 portfolio/pipeline/validate_candidates.py`).
What the measurement record does and does not license about the unmeasured
scores: `score_sensitivity.py` (`python3
portfolio/pipeline/score_sensitivity.py`), tested by
`test_score_sensitivity.py`. It also fails loudly if a `measured:` block stops
opening with `<was> -> <now>`, so a revision can never be silently dropped from
the sample it reports on.
Considered and rejected: [screened-out.md](screened-out.md).
What six independent screening runs agreed on: [convergence.md](convergence.md).
Why the next pass should screen channel-first:
[distribution-first.md](distribution-first.md).
Which channels this portfolio can actually list in, and what each costs in
credentials: [channel-inventory.md](channel-inventory.md).

A candidate's composite and floor are written in three places — the table above,
[candidates.yaml](candidates.yaml), and the write-up's own headline — and are
rescored by one session at a time. `python3
portfolio/pipeline/validate_doc_consistency.py` checks that all three still say
the same number, because a rescore that updates two of them is invisible in the
diff of the pull request that makes it. CI runs this on any change under
`portfolio/pipeline/`.

## Status of the claims in these write-ups

**These are internal research notes, not published content and not legal
advice.** Nothing in this directory is rendered by any venture's site, and
`ventures/ai-first-markets` is deliberately untouched by it. (That sentence
used to read "which does deploy to a live site". It does not, and no venture
here does: `python3 platform/ci/publish_surface.py` derives from the workflow
files that nothing publishes on a push to `main`, and this venture's deploy is
`workflow_dispatch`-only besides. The isolation is still right; the reason
given for it was wrong.)

The regulatory dates, fine levels, market sizes, and competitor claims in the
candidate write-ups came from web research during the screening pass and are
**unverified against primary sources**. They are recorded at the confidence they
were gathered at, which is good enough to rank candidates against each other and
not good enough to act on. Before any candidate graduates to a venture, the
specific obligation dates it depends on must be checked against the actual
legislation, and any claim that would appear in customer-facing copy must be
verified independently.

This distinction is why the consolidation landed here rather than in
`ai-first-markets`: ranking candidates in an internal directory needs no
publication decision, so it does not need the account owner to adjudicate legal
accuracy first.

## Provenance of this directory

This is a consolidation. Six scheduled agent runs on 2026-08-18 screened the
same brief independently and opened six overlapping pull requests
(#17, #18, #20, #27, #30, #34) proposing about thirty-six candidates between
them. Those reduce to nine archetypes; this directory keeps the write-ups that
cleared the gates and records the rest in [screened-out.md](screened-out.md).
[convergence.md](convergence.md) analyses what the six runs agreed on and what
that does and does not tell us.

A further scheduled run on 2026-08-19 was assigned the same brief again. Rather
than produce a thirty-seventh candidate, it acted on the finding those six runs
had already reached but not used — that distribution, not capability, is what
kills these candidates. [distribution-first.md](distribution-first.md) turns that
into a selection rule, records marketplace evidence for and against the existing
candidates, and adds the single candidate that rule produces
([shopify-a11y-evidence](candidates/shopify-a11y-evidence.md), found by starting
from a channel rather than from a market).

A ninth run on 2026-08-19 was assigned the same brief again. It added no
candidate. It landed the consolidation above onto a `main` that had moved
underneath it, and recorded one amendment that the eighth run could not have
made: two marketplace-native products —
`ventures/garmin-world-traveler-watchface` and `ventures/world-clock-widget` —
were merged to `main` *after* `distribution-first.md` was written, and both
pass that document's own distribution test while nothing in this directory is
built. See the ninth-run amendment at the end of
[distribution-first.md](distribution-first.md). It also added an intake gate to
[CLAUDE.md](../../CLAUDE.md) so a tenth run is redirected here before it
screens.

A tenth run on 2026-08-19 was assigned the same brief again, hit that intake
gate, and added no candidate. It carried the ninth run's whole diff onto a
`main` that had moved again, and did the one thing
[distribution-first.md](distribution-first.md) asked for that nobody had done:
enumerate the channels. [channel-inventory.md](channel-inventory.md) is the
result. Its finding is that "run one probe to a real buyer" is two actions —
demand measurement and revenue capture — and only the second needs the
developer-account credentials that have blocked this for four cycles. The
first is free, needs no credential, and is available on a channel three of the
eight candidates above can reach.

An eleventh run on 2026-08-19 was assigned the same brief again. It added no
candidate and changed no score. It established the one fact the previous four
runs each missed about their own situation: **none of this directory has ever
been on `main`.** Runs seven through ten (#36, #44, #53, #61) each built a
version of it and each was closed unmerged, so every subsequent run began from
a checkout with no `portfolio/pipeline/`, no intake gate in `CLAUDE.md`, and
therefore no way to discover that the brief was already answered. Each run
correctly diagnosed the duplication and then wrote its diagnosis into a branch
that did not land — which is why the loop survived being noticed four times.
This run carried the tenth run's whole diff onto current `main` and opened it
as the consolidation PR, so the gate above is enforceable rather than
re-derived. The screening content below is the tenth run's work, unchanged;
verifying it and getting it landed is the eleventh run's only contribution.

A twelfth run on 2026-08-19 was assigned the same brief again. It added no
candidate and changed no score. It found the mechanism behind the fact the
eleventh run established — *why* five consecutive consolidation PRs were each
built correctly and then never merged:

> **The blocked PR blocked itself.** Every version of this directory was
> bundled with a `portfolio/ledger/2026-08.yaml` entry in the same pull
> request. That file is append-only and *every* scheduled session appends to
> it, several per hour. So each consolidation PR became un-mergeable within
> about an hour of being opened — not because anyone disagreed with it, but
> because its own ledger hunk collided with the next session's. The next run
> would find a conflicted PR, rebuild it onto a fresh `main`, re-attach a new
> ledger entry, and start the same clock again. Five cycles of that.

The eleventh run measured this and reported it as "a trial merge conflicts
only in the ledger's append point (routine, not a real conflict)." It is
routine, and it was also the whole blocker: a PR awaiting a human decision
cannot carry a hunk that goes stale hourly. Verified again this run — #70
against current `main` produces exactly one conflict, in that file, and
nothing else in the 17-file diff conflicts with anything.

The fix is separation, and it is the twelfth run's only contribution:

- **This directory, the intake gate, and the README/router edits ship with no
  ledger change at all.** No other session touches `portfolio/pipeline/`,
  `CLAUDE.md`, or `README.md`, so this pull request stays mergeable
  indefinitely. It can sit awaiting the account owner's decision for a week
  without a rebase, and no future run needs to rebuild it.
- **The ledger entry for this cycle ships separately** and is merged on its
  own, the way every other session's routine ledger append already is.

A later run on 2026-08-20 was assigned the same brief again. It added no
candidate and screened nothing. It found that the four probes run in the
preceding ten hours (#207, #245, #250, #253) had each ended by declining to
write their result into `candidates.yaml` — so the ranking above was still
entirely pre-measurement while the measurements themselves sat in unmerged
branches. It applied those five score changes, replaced one refuted mitigation
and one verdict, added an arithmetic checker so the next edit is cheap, and
recorded the pattern the five changes make. See
[rescore-2026-08-20.md](rescore-2026-08-20.md).

If you are a thirteenth run reading this on `main`, the separation worked and
the intake gate above applies to you: do not screen. If you are reading it in
an unmerged branch, check whether a content-only pipeline PR is already open
before rebuilding anything — rebuilding is what sustained this loop.

## Portfolio note recorded during this pass

The `VENTURE.yaml` backfill this pass originally flagged has since landed —
every directory under `ventures/` now carries either that file or a
`NOT-A-VENTURE` marker. A CI workflow to enforce that exists
(`.github/workflows/portfolio-validate.yml`); it had **never successfully
run** as of 2026-08-18 (see that day's ledger entry) because account-wide
Actions runs were failing before any job started (`startup_failure`, a
broken workflow file elsewhere in the repo reporting as `path: "BuildFailed"`
on every push — tracked separately in issue #139 section 3, alongside #144
and #146). **Update 2026-08-19 ~15:55 UTC:** run
[`32266714656`](https://github.com/Duncan-Haywood/monorepo-projects/actions/runs/32266714656)
completed with `conclusion: success` — the workflow's first recorded success,
triggered by the #79 merge commit (`42ebd981`, which touched
`portfolio/router/README.md` and so matched this workflow's path filter).
Re-run locally the same day: `python3 portfolio/router/validate.py` →
`All 11 VENTURE.yaml files are valid`, matching the CI result. This confirms
the `startup_failure` signature is not an account-wide Actions block —
push-triggered workflows do run and can succeed — but it is only proven for
commits that touch this workflow's own trigger paths
(`ventures/**/VENTURE.yaml`, `ventures/**/NOT-A-VENTURE`,
`portfolio/router/**`). No push since (`110d68c`, `fc49deef`) touched those
paths, so there is no further evidence either way yet. Treat the invariant as
verified locally and now spot-confirmed once in CI, not yet as continuously
enforced. The underlying caution stands: economics are still `null` across
the portfolio, so the router is allocating against stage and budget cap
rather than measured return. Adding new ventures on top of an unmeasured
portfolio is the more expensive version of that problem, which is why every
verdict above is a probe or a product line rather than a new `ventures/`
directory.

A 2026-08-24 session found the pipeline empty of unbuilt `build-now`
items after `eaa-remediation-pipeline` graduated, and added one candidate
that is *not* a restatement of the nine archetypes:
[mls-photo-spec-preflight](candidates/mls-photo-spec-preflight.md), a
file-spec evidence product line of `real-estate-agent-photo-app`. Named
against [screened-out.md](screened-out.md) (not listing photography the
venture, not multi-location-listing-guard, not web accessibility). The
probe is [`probes/mls-photo-spec/`](probes/mls-photo-spec/).
