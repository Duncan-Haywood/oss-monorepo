# Candidate: EAA remediation pipeline

**One line.** Fixed-price accessibility remediation for small EU online shops
that have received a warning letter — AI-generated theme fixes, contractor-run
assistive-technology testing, and a dated evidence record.

**Verdict: build now, as a product line inside `ventures/local-site-studio`, not
as a new venture.** Same buyer, same delivery surface, and the venture already
has Stripe, a lead pipeline, and a dashboard. If it sells, split it out then.

**Graduated 2026-08-24** as a `product_lines` entry on
`ventures/local-site-studio`. That is the marker `session_gate.py` reads.
The first experiment (live themes, contractor AT, outreach) remains open.

**Public surface initiated 2026-08-24.** Catalog, buyer qualification, and
disclosed error rates live in
`ventures/local-site-studio/src/lib/pricing/eaa-evidence.ts`. Public page
`/accessibility-evidence`; operator docs `/docs/eaa-evidence`. Checkout is
not live (no Stripe Price IDs). Contractor AT pricing and outreach to ten
obligated shops remain owner-gated (first experiment steps 2–3).

Scored 2026-08-18. Composite 7.125 · floor 5 (liability containment).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 8 | Audit, prioritisation, and most theme-level fixes are model work against a well-specified standard (WCAG 2.2 AA) |
| Autonomous ops | 6 | One deliberate human step: manual AT testing, done by a contractor on a fixed-scope work order |
| Time to revenue | 9 | The buyer has a dated letter and a deadline; this is the rare B2B sale with no discovery phase |
| Gross margin | 7 | Contractor testing is a real per-job cost, roughly a fifth of a typical job |
| Defensibility | 5 | The method is copyable. What accrues is a re-test archive per customer and a fix library per platform |
| Distribution | 8 | High-intent moment, and `local-site-studio` already talks to this buyer |
| Liability containment | 5 | Real exposure if we overclaim; contained by selling evidence, never a compliance guarantee. **Measured 2026-08-21, 6 → 5** — see the amendment below |
| Ethical robustness | 9 | Measured 2026-08-21, 9 → 6 → 9. The record now prints both committed error rates, names both directions it errs in, and states which direction pays us. The three disclosure deductions lapse; read the 9 as the screening estimate no longer being reduced, not as a positive finding. See the second amendment below and [`portfolio/research/error-rate-disclosure/`](../../research/error-rate-disclosure/) |

## Amendment (2026-08-21): the first gate measurement, and it costs this candidate its margin

**`liability_containment` 6 → 5. Composite 7.25 → 7.125.** The floor is now a
tie between `defensibility` and `liability_containment`; the gate dimension is
named as the floor because at 5 it *rejects* on the next measured point, where
defensibility at 5 only lowers a mean.

`score_sensitivity.py` (#549) flagged this exact cell: the two gate dimensions
had never been measured on any candidate, and this one — the pipeline's only
`build-now` — sat one unmeasured point above the gate that would reject it. It
also recorded why no pass had attempted a gate measurement: the denominator
needs the WCAG normative index, and `www.w3.org` is egress-denied.

That was true of the host and false of the denominator. `axe-core` ships its
success-criterion tags in its published package, and `registry.npmjs.org` is
reachable from here. Measured in
[`portfolio/research/a11y-external-coverage-reference/`](../../research/a11y-external-coverage-reference/).

The score does not turn on whether the engine finds everything. Per the row
above and the directory's standing constraints, it turns on **the coverage
statement being accurate** — "coverage limits stated in the product, not buried
in terms." That artifact had never been compared to anything outside this
repository. Compared, it was wrong in both directions:

- **8 of 22** automatable A/AA criteria were in neither the checked list nor
  the not-tested list — invisible by this pipeline's own definition. Six are
  Level A, and they include **2.4.1 Bypass Blocks**, a criterion the free
  qualification audit would plausibly lead with. Confirmed by running defect
  markup through both engines, not by comparing tables.
- **Criterion-level disclosure hides the remainder.** 4.1.2, disclosed as
  `partial`, stands for three rules against the reference's 29; 1.1.1,
  disclosed as `automated` — the strongest word in the vocabulary — stands for
  one rule family against 7.

The eight are now disclosed in both engines, under a new `unimplemented`
label rather than `manual`, because they are decidable and the contractor step
does not cover them. That fix does not restore the point: the *granularity*
defect is structural, and a mitigation that had never been tested and failed on
first contact is not worth a point above the gate.

**Still at the gate, not below it.** Nothing here is filed, signed or
certified, and the customer remains the decision-maker. What is gone is the
margin — one more measured point in liability rejects the pipeline's only
build-now candidate.

What would settle it is the false-negative rate, which decides liability and
which nothing in this repository has measured out of sample: out-of-sample
*precision* is 0.821–0.881, and the only recall number anywhere is 1.0 against
the three-page fixture set written beside the engine.

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
supposed to ship inside. `print-atelier`'s 611 (internal-only, no deploy
workflow) were fixed and merged the same day
([#542](https://github.com/Duncan-Haywood/monorepo-projects/pull/542)). The
remaining 354, on `local-site-studio` and `ai-first-markets`, are fixed and
re-verified by rebuild on the branch that measured them, proposed for merge in
[#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523) /
[#531](https://github.com/Duncan-Haywood/monorepo-projects/pull/531) and
awaiting the account owner's sign-off (colour-token edits to deployable
`ventures/*` code) — `main` carries 354 open AA contrast failures now, not
965. A portfolio selling accessibility evidence should not be shipping the
defect it plans to bill for finding, and until this pass nobody could see
that it was.

## Amendment (2026-08-21): the engine's failure mode is a silent miss, not only a false positive

No score moved. Two measurements now bracket the audit engine from opposite
sides, and only one of them was on the record.

[`a11y-own-sites`](../../research/a11y-own-sites/) measured **precision**: out of
sample, 11.9% of findings were un-actionable, and the free qualification audit
therefore needs a build-artifact filter before a stranger reads it. That is the
visible failure — a customer can see a finding that is wrong. (Built
2026-08-22; see the amendment at the end of this file.)

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

## Amendment (2026-08-21): 389 of the newly-fixed engine's contrast findings have no remediation in progress

`a11y-own-sites`'s missing-stylesheet fix (already merged, `c2987af`) recorded
its pipeline effect as **"no score moves"** — accurate for the 354 findings
(`local-site-studio`, `ai-first-markets`) that duplicate what
[`a11y-contrast-decidability`](../../research/a11y-contrast-decidability/)
already found and that #523 already carries to the account owner, and for the
611 (`print-atelier`) already fixed same-day in #542. It is a different
statement for the remaining **389**, on `real-estate-agent-photo-app` (both
apps) and `photo-editing/docs-site`: those were outside every prior
contrast-measuring corpus in this repository, are now independently
corroborated (every reported ratio recomputed from its own stated colours,
zero arithmetic false positives; cross-checked against
`a11y-contrast-decidability`'s and `a11y-axe-recall`'s exact-match counts on
the four apps they cover), and **carry no fix, written or in progress,
anywhere in this repository** — unlike the other 354.

This does not move `liability_containment` by itself; it is one more data
point in the direction Finding 0 of `a11y-own-sites/README.md` already names
as "worse, not better." Recorded so the next session that touches this
score, or that owns `real-estate-agent-photo-app` or `photo-editing`, does
not have to re-derive which findings already have an owner and which do not.

## Amendment (2026-08-21): the disclosure gap is closed, and the score returns to its estimate

**`ethical_robustness` 6 → 9. Composite 6.75 → 7.125.** The first upward
revision anywhere in `candidates.yaml`.

[`error-rate-disclosure/`](../../research/error-rate-disclosure/) scored this
candidate 9 → 6 earlier the same day on three deductions — no rate in the
artifact, no direction in the artifact, and the undisclosed direction being the
one that pays us — and closed by saying the mitigation was "one line of
rendering." It was four. `evidence.py` now carries an `ACCURACY` block that the
record renders in two places: a headline in the summary block, so a reader who
reads nothing else learns the list can be wrong, and a full section immediately
above the findings table it qualifies.

What the record now says, that it did not:

- **Precision 0.821–0.881**, over-reporting, with its corpus (118 built pages,
  67 findings reviewed one by one), its date, its derivation path, and the
  reason it is not the last word — that denominator excluded 1.4.3 entirely, so
  no contrast finding has ever been precision-checked.
- **Recall 0.975**, under-reporting, against axe-core 4.13.0 over the 13
  criteria either engine claims — with the caveat that this corpus's real
  defects exercise only 2 of those 13.
- **That both were measured on this portfolio's own pages, not on the
  customer's site.**
- **Which direction pays us.** Verbatim: *"this audit is the qualification step
  for a paid remediation job, so over-reporting is the error that would pay us.
  That is why the precision figure is printed here, beside the findings it
  applies to, rather than supplied on request."* Deduction 3 asks whether the
  operator's conflict is visible to the person holding the record. It now is.

**Read the restored 9 for exactly what it is.** It is the 2026-08-18 screening
estimate, no longer reduced by a disclosure deduction — not a finding that this
business is ethically strong. That rubric measures disclosure and nothing else,
and three things it does not score are unchanged: the precision denominator
excluded contrast, the recall figure is a single comparison, and neither was
measured on a customer's shop. Those are now disclosed rather than resolved,
which is the whole of what changed.

Two mitigations named in the earlier amendment are still open: the
build-artifact filter `a11y-own-sites` asked for is unbuilt, and
`liability_containment` remains at 5, on the gate. **This candidate's floor did
not move, and one more measured point in liability still rejects it.**

**Amended 2026-08-22: the build-artifact filter is built.** It is
[`provenance.py`](../probes/eaa-wcag-triage/src/wcag_triage/provenance.py), and
on this portfolio's 118 built pages it removes exactly the 7 framework findings
`a11y-own-sites` identified by hand and keeps the 7 project pages a
filename-shaped filter would have taken with them. **No score moved, in either
direction.** `liability_containment` is still 5 and still on the gate — that
score rests on the *coverage* statement's accuracy against an external
reference, which this does not touch. `ethical_robustness` stays 9: the record's
precision on the hand-reviewed denominator rises to 0.917–0.983, and the figure
printed to customers was deliberately **not** raised to it, because the revision
would rest on this engine's own filter rather than on a second review by hand,
and overstating precision is the direction that costs the buyer. See
[Finding 5](../../research/a11y-own-sites/README.md#finding-5-2026-08-22-the-filter-finding-1-asked-for-built-and-measured),
including the two designs it refutes — one framework needs two markers, and the
obvious marker for the second appears in 106 of 138 built documents.

Guarded against going stale: `tests/test_accuracy_citations.py` in the probe
checks each printed figure against the derivation it cites, so a rate revised
upstream fails the build rather than leaving a false number in a
customer-facing record.

**Amended 2026-08-22: the four new rules' out-of-sample recall is now measured
on a corpus that can exercise them, and it holds.** Finding 6 above named the
open question precisely — a build directory cannot exercise structural
criteria (2.2.1, 2.2.2, 2.4.1, 3.1.2), so their out-of-sample result there was
zero findings, meaningless either way — and named a rendered corpus as what
would settle it.
[`a11y-generated-sites`](../../research/a11y-generated-sites/README.md), the
directory that renders `local-site-studio`'s actual per-request delivered
pages rather than a build's output, is that corpus, and #614 extended it with
a control mutation per new rule: injections for 2.2.1/2.2.2/3.1.2 (this
corpus's real pages have no meta-refresh, `<marquee>`, or invalid
part-language to remove), and — the load-bearing one — a removal for 2.4.1
that strips every mechanism the rule accepts as sufficient (`<main>`, every
heading, every in-page link) from the 14 real delivered pages, which
otherwise all carry at least one. **All four fire, 14/14.** `audit.py` citing
none of them is not a new gap: its own `COVERAGE` catalog already discloses
all four as criteria no rule there checks.

**No score moved, and #614 said so itself rather than leaving it implicit.**
This is one corpus (14 pages), one venture, and a synthetic positive control
rather than a naturally-occurring defect — the same limits `a11y-axe-recall`'s
own recall measurement stated about itself, and the same reasoning that kept
this candidate's score still on that finding. What it adds is the thing that
was genuinely missing: proof the 2.4.1 rule's gates (landmark, heading,
in-page link, minimum content) evaluate real per-request markup the way they
are meant to, not just a fixture or a page that never finished rendering.
`liability_containment` stays 5, on the gate.

**Amended 2026-08-24: the per-engagement positive control is now in the
product.** Finding 2 of
[`a11y-generated-sites`](../../research/a11y-generated-sites/) said a
qualification audit needs to mutate the customer's own page and check the
rule fires, otherwise a clean report cannot be told from a scanner that
could not read the site. That harness lived in research. It now runs on
every `eaa-wcag-triage` CLI invocation
and the evidence record prints the result in the header and above the
findings table. A miss is named as a miss. **No score moved** —
`liability_containment` is still 5 and still on the gate; this does not
change what the engine finds, only whether a clean table can hide a deaf
scanner.

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

## Amendment (2026-08-24): first-experiment software half on host themes

Step 1 asked for three real shop themes. Live shops are still owner-gated.
This pass ran the mechanical fix against the three category themes this
host venture already delivers — trades, salon, restaurant — from
[`a11y-generated-sites`](../../research/a11y-generated-sites/)
(`live-trades.html`, `live-salon.html`, `live-restaurant.html`).

**Unmodified, 0 findings on all three.** That restates Finding 1 of that
corpus; the close-rate on a clean page is undefined, and is recorded as
null rather than as 100%.

**On the same three pages, after injecting only the rewriteable defect
classes the pass is allowed to close** (missing title, heading-level skip,
viewport zoom-lock, `aria-hidden` on a named control, unmuted autoplay,
orientation-lock rotate, colour-only in-prose link), the pass closed
every injected finding. Blocking close-rate **1.0**. Operator job and
committed JSON: `ventures/local-site-studio/scripts/eaa-evidence-job/`.

A colour-only link (1.4.1) is closed by restoring the underline the page
removed; the words and the colours stay. A page with a navigation block
and no bypass (2.4.1) is closed by wrapping the content after that block
in `<main>` — a landmark, not invented skip-link text. `muted` on
autoplaying media (1.4.2) and a visual `rotate()` on `<html>`/`<body>`
under a pure orientation query (1.3.4) already landed in #835. Timed
refresh, blink/marquee, and name-override already landed in #825. None
of these invent words. The host-theme close-rate job does not inject
2.4.1: those pages already have headings, so the finding cannot fire.

That 1.0 is the rate on defects written to be closeable, placed onto real
theme markup. It is not a shop's natural mix. The probe's own fixture
aggregate the same day measured **1 of 11** blocking closed, because
those pages' blocking findings are mostly missing words the pass refuses
to invent. Read the two numbers together. Neither is AT verification, and
neither settles the kill criterion.

The catalog / buyer-qualification surface is the sibling draft #814.
This session did not reopen that surface and did not add a
`product_lines` marker: that marker is what `session_gate.py` reads to
stop naming this candidate, and landing it before the buyer surface
would send the next generic session off to invent a ninth candidate.

Steps 2–3 (contractor price, outreach to ten obligated shops) remain
owner-gated. No score moved.

## Sources

- [TestParty — accessibility remediation as EAA enforcement gets underway](https://testparty.ai/blog/website-accessibility-remediation-eaa-enforcement)
- [Level Access — European Accessibility Act 2026 compliance guide](https://www.levelaccess.com/compliance-overview/european-accessibility-act-eaa/)
- [Internet Pros — digital accessibility in 2026, WCAG and the EAA](https://internet-pros.com/blog/digital-accessibility-wcag-european-accessibility-act-2026/)
