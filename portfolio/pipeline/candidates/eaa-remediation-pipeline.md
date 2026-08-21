# Candidate: EAA remediation pipeline

**One line.** Fixed-price accessibility remediation for small EU online shops
that have received a warning letter — AI-generated theme fixes, contractor-run
assistive-technology testing, and a dated evidence record.

**Verdict: build now, as a product line inside `ventures/local-site-studio`, not
as a new venture.** Same buyer, same delivery surface, and the venture already
has Stripe, a lead pipeline, and a dashboard. If it sells, split it out then.

Scored 2026-08-18. Composite 7.25 · floor 5 (defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 8 | Audit, prioritisation, and most theme-level fixes are model work against a well-specified standard (WCAG 2.2 AA) |
| Autonomous ops | 6 | One deliberate human step: manual AT testing, done by a contractor on a fixed-scope work order |
| Time to revenue | 9 | The buyer has a dated letter and a deadline; this is the rare B2B sale with no discovery phase |
| Gross margin | 7 | Contractor testing is a real per-job cost, roughly a fifth of a typical job |
| Defensibility | 5 | The method is copyable. What accrues is a re-test archive per customer and a fix library per platform |
| Distribution | 8 | High-intent moment, and `local-site-studio` already talks to this buyer |
| Liability containment | 6 | Real exposure if we overclaim; contained by selling evidence, never a compliance guarantee |
| Ethical robustness | 9 | The output is a site disabled users can actually use — the interests line up |

## Amendment (2026-08-21): the manual step is smaller than this write-up assumes, and its size is now measurable

**No score moves.** What moves is the shape of the deliverable, and it moves in
the direction that makes the "quarter to a third" wedge above *more* precise
rather than less.

This candidate's margin story rests on a deliberate human step — contractor
assistive-technology testing — and every accessibility pass in this repository
has priced colour contrast (SC 1.4.3) into that step, on the grounds that it
"needs computed colour, which needs CSS and rendering." Contrast is the single
most common WCAG failure on the web, so this is not a detail of the coverage
table; it is a material share of what the contractor is being paid to look at.

It was never tested. Measured in
[`portfolio/research/a11y-contrast-decidability/`](../../research/a11y-contrast-decidability/):
**98.76% of 10,657 text elements across 85 built pages decide from the delivered
artifact alone**, because a delivered page ships the stylesheet that names its
colours and the arithmetic to a contrast ratio is exact. The claim was true of
every *corpus* this portfolio had measured — all of them HTML-only, none ever
handed a stylesheet — and that property of the sampling read for five passes as
a property of the standard.

Three consequences for what is sold:

1. **The evidence record gets a per-element contrast tally with named reasons**,
   not a blanket "1.4.3 requires manual review". "412 elements checked, 3 we
   could not decide and why" is a coverage limit a buyer can price. The blanket
   version quotes the contractor for the whole page.
2. **The audit must include the stylesheet, and say so when it does not.** A
   scan handed markup alone decides nothing about contrast, and the record now
   reports that as `0 of N decidable` rather than as no findings — which is the
   difference between a limit and a false clean bill.
3. **Both colour schemes, always.** `prefers-color-scheme` has two states and the
   stylesheet spells out both, so the page owes 1.4.3 in each. On this
   portfolio's own pages a light-only scan finds 581 failures and a two-scheme
   scan finds 965; the 384-element difference is muted text with no `dark:`
   counterpart inside a container that has one. Any competitor scanning one
   scheme is reporting those clean, which is a concrete, demonstrable gap in the
   free tools this candidate is positioned against.

It also found this portfolio shipping 965 real AA contrast failures on its own
built pages — including on `local-site-studio`, the venture this candidate is
supposed to ship inside. 354 are fixed and re-verified by rebuild on the branch that measured them,
proposed for merge in
[#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523) and
awaiting the account owner's sign-off (colour-token edits to deployable
`ventures/*` code); `print-atelier`'s 611 are recorded shape by shape and left
as component-level decisions. A portfolio selling accessibility evidence
should not be shipping the defect it plans to bill for finding, and until
this pass nobody could see that it was.

## Amendment (2026-08-21): the engine's failure mode is a silent miss, not only a false positive

No score moved. Two measurements now bracket the audit engine from opposite
sides, and only one of them was on the record.

[`a11y-own-sites`](../../research/a11y-own-sites/) measured **precision**: out of
sample, 11.9% of findings were un-actionable, and the free qualification audit
therefore needs a build-artifact filter before a stranger reads it. That is the
visible failure — a customer can see a finding that is wrong.

[`a11y-generated-sites`](../../research/a11y-generated-sites/) measured the other
direction, on the delivery surface this verdict names: the customer sites
`local-site-studio` renders per slug, which appear in no build and which no
audit had ever seen. They are **clean** — 0 findings on 14 pages, both engines
agreeing — and the pass found **a detection gap in each engine**: the probe had
no `<iframe>` rule at all (the repository's only frame is the map on every
delivered page), and `audit.py` accepted a control inside a text-less
`<label>`. Both fixed.

Two consequences for what is sold:

- **A record that omits a defect misstates its coverage in the direction that
  flatters the seller**, and unlike a false positive the customer cannot tell.
  This is squarely the `liability containment: 6` exposure — the mitigation is
  the coverage statement, and a silent miss is exactly a coverage statement that
  is wrong.
- **A qualification audit needs a positive control per engagement**, not per
  engine: mutate the customer's own page, confirm the rule fires. It is cheap,
  and it is the only thing separating "your site is clean" from "our scanner
  could not read your site." Both gaps above would have produced a clean report
  on a page that was not clean.

## Buyer-segment correction (2026-08-19, per ledger PR #96)

**The "ten German or Swedish shops" in the first experiment below is largely the
wrong buyer.** Under **EAA Art. 4(5)** and Germany's **BFSG §3**, microenterprises
*providing services* — fewer than 10 employees **and** turnover or balance sheet
≤ €2M, both conditions, per Recommendation 2003/361/EC — are **exempt** from the
service accessibility requirements this pipeline sells against. A "small shop"
sourced by visible WCAG failures alone is, more often than not, the exempt
segment: selling EAA-deadline urgency to a buyer the law does not obligate is
selling on a fear that does not legally apply to them, which the ethical-
robustness gate above exists to refuse.

This is a **re-target, not a kill**. The obligated buyer is the shop just above
the threshold — ≥10 employees or >€2M turnover — which still has no dedicated
accessibility staff but is actually inside the obligation the pitch cites. Any
outbound list or qualification step before the first experiment runs should
filter for that, not for warning-letter visibility alone. The same qualification
applies to [shopify-a11y-evidence](shopify-a11y-evidence.md), whose merchant base
skews micro.

This finding is corroborated secondary sourcing (`eur-lex.europa.eu` was
unreachable from the session that found it), not primary text — confirm against
the directive itself before it reaches customer-facing copy. Not re-scored: the
defensibility/ethical-robustness dimensions above already assume claims stay
narrow, which this correction is consistent with rather than in tension with.

## Why now

The European Accessibility Act applied from 28 June 2025, and 2026 is the first
year national authorities are supervising against it rather than warning about
it. The enforcement is not theoretical: Swedish PTS opened e-commerce cases from
October 2025, French advocacy groups took four major retailers to formal notice
and a court ordered Carrefour France to remediate its site and app under a daily
penalty, and the Dutch ACM has sent information requests with enforcement
expected in the second half of 2026.

The commercially interesting one is Germany, where small shops are receiving
law-firm warning letters demanding on the order of €1,780 in fees plus ~€490 for
an audit — *before* any remediation cost. That is a buyer with a dated document,
a countdown, and a price anchor already set by the other side.

The other half of the timing: automated tools catch roughly a quarter to a third
of WCAG issues. The gap between what a scanner reports and what actually blocks a
screen-reader user is precisely the work, and it is why the pure-software
competitors do not close the loop.

## What is sold

A fixed-price job, not a subscription, with a retainer offered after:

1. **Audit** — automated pass plus model review of templates, checkout, and
   forms, mapped to WCAG 2.2 AA success criteria, ranked by whether the issue
   blocks a task or merely degrades it.
2. **Fixes** — generated as reviewable changes against the shop's theme
   (Shopify Liquid, WooCommerce/PHP templates), applied on a staging copy.
3. **Manual verification** — a contractor tests the blocking paths with real
   assistive technology and signs a short report. This step is not optional and
   not automatable; it is what makes the record defensible.
4. **Record** — a dated file listing what was tested, with what tool or AT, what
   changed, what remains open and why, plus a drafted accessibility statement
   for the customer to publish under their own name.
5. **Re-test** — monthly or quarterly, priced separately. Themes drift; apps get
   installed; the record has to stay current to be worth anything.

Indicative pricing: €900–€1,800 per shop for the job, €49–€99/month for
monitored re-test. Anchored below the legal fees the buyer is already facing.

## Liability and ethics

The exposure is entirely in what is claimed. Two hard rules:

- **Never sell an overlay, and never sell "compliance."** Accessibility overlay
  widgets have repeatedly lost in court and are actively distrusted by the users
  they claim to serve. Selling one would be both the higher-margin and the
  wrong choice, which is exactly the kind of trade this pipeline exists to
  refuse. Deliverables state what was tested and when — a record, not a warranty.
- **The customer publishes the accessibility statement.** We draft; they sign.
  A statement of conformity issued in our name is a representation we are not
  positioned to stand behind.

Residual risk is a customer who is fined anyway and points at us. Mitigated by
the record itself: the scope, the open items, and the dates are in the
deliverable, so "we told you this was still open" is documented rather than
argued. Terms should cap liability at fees paid and exclude any advice framing.

## Where it can fail

- **Contractor supply.** Competent AT testers are a small pool. Start with one,
  paid per job, and cap sold volume at tested throughput rather than selling
  first and scrambling.
- **Fix quality on unfamiliar themes.** Generated changes against a heavily
  customised theme can break layout. Staging-only application and a rollback
  path are non-negotiable; the first ten jobs get reviewed before delivery.
- **The warning-letter wave is a moment, not a market.** If enforcement stalls,
  urgency evaporates and this becomes a normal, slow accessibility sale. That is
  the main reason to run it inside an existing venture rather than open a new one.

## First experiment

Two weeks, under €300 of spend, no new directory:

1. Build the audit-and-fix pass against three real shop themes; measure how many
   blocking issues the generated fixes actually close under AT verification.
2. Price one contractor test job to get a real cost, not an estimate.
3. Offer the job to ten German or Swedish shops with visible WCAG failures
   **and** at least 10 employees or >€2M turnover — see the buyer-segment
   correction above. Screening only on visible failures re-fills the list with
   the exempt microenterprise segment.

Kill it if fewer than two of ten take a paid audit, or if AT verification finds
that generated fixes close less than half of blocking issues — below that the
economics are a human service with an AI marketing story.

## Sources

- [TestParty — accessibility remediation as EAA enforcement gets underway](https://testparty.ai/blog/website-accessibility-remediation-eaa-enforcement)
- [Level Access — European Accessibility Act 2026 compliance guide](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/)
- [Internet Pros — digital accessibility in 2026, WCAG and the EAA](https://internet-pros.com/blog/digital-accessibility-wcag-european-accessibility-act-2026/)
