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
