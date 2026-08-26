# Candidate: Consent change record

**One line.** A customer-owned browser check that records what a website loads
before and after a consent choice, then produces a diff with request URLs,
storage keys, and screenshots for the site operator to review.

**Verdict: probe → graduated 2026-08-24 (ship-and-measure override).** The
artifact is useful without declaring a site compliant: it records observable
browser behaviour and leaves the legal interpretation to the customer. The
unresolved question is whether agencies and small publishers will pay for
recurring evidence rather than rely on a one-off manual check.

**Graduated 2026-08-24, mitigation not yet satisfied.** This candidate's own
mitigation ("secure a named web-agency or privacy-implementation partner
before graduation") has not been met. Per the portfolio's 2026-08-24
product-first direction — ship free value and measure real usage instead of
running another pre-build validation round — it graduates directly to
`ventures/consent-change-record` as a v0 rather than staying a paper probe.
Scope was narrowed from the full "browser check that records live page
loads" (screenshots, live automation) to a **HAR-diff tool**: the user
exports two HAR captures themselves (a standard DevTools feature in every
major browser) and this diffs them client-side. That is a smaller, honestly
scoped, zero-network-risk v0 of the same underlying value — "what changed
before vs. after a consent choice" — that does not require this session to
build or operate live browser automation. Distribution and willingness to
pay are unmeasured; the kill criteria in `ventures/consent-change-record/VENTURE.yaml`
track exactly that gap.

Scored 2026-08-24. Composite 6.125 · floor 4 (distribution).

| Dimension | Score | Why |
|---|---:|---|
| AI leverage | 7 | A model can group request changes, explain differences, and turn raw traces into a review queue; browser capture and comparison remain deterministic |
| Autonomous ops | 7 | Scheduled checks and artifact generation are unattended, but consent flows and ambiguous changes need customer review |
| Time to revenue | 5 | A browser fixture and sample report are quick to build, but purchase needs an agency or publisher channel and trust in the evidence |
| Gross margin | 8 | Headless-browser minutes and object storage are the main delivery costs; no filing, credential, or human service is required |
| Defensibility | 5 | Customer history and site-specific consent-flow baselines compound, but the trace format and browser tooling are copyable |
| Distribution | 4 | Web agencies and privacy implementers already gather around the problem, but this portfolio has no warm channel to them |
| Liability containment | 6 | The product reports observed requests and preserves raw evidence, never says a site is compliant, and never chooses a legal basis |
| Ethical robustness | 7 | It reduces invisible tracking and makes operator incentives inspectable, provided the report exposes missing observations and does not become a compliance badge |

## Boundary conditions

- Run only against properties the customer owns or is authorised to test.
- Capture request metadata and storage state, not form values, page content, or
  visitor identities.
- Label every result as an observation from a particular browser, region, date,
  and consent sequence. A missing request is not proof that a technology is
  absent in every visitor context.
- Never issue a compliance grade, select a legal basis, or recommend a consent
  banner configuration as legally sufficient.
- Keep the raw trace private to the customer and expire it on a declared
  retention schedule.

## Why it is distinct

This is not a public-register watch: its input is a customer's own site and its
output is a reproducible browser trace, not a change alert about a public source.
It is not the EAA remediation pipeline: accessibility findings are a separate
surface, and this candidate does not claim to test WCAG. It is also narrower than
generic privacy advice or cookie-management software because it does not manage
consent, identify the applicable law, or make a compliance assertion.

## First experiment

Build a standard-library report generator around three local HTML fixtures:
one honest consent flow, one flow that loads an analytics request too early, and
one flow whose request is conditional on region. Produce before/after trace
diffs and verify that the report keeps the raw observation, browser context, and
unknown state visible. Then show the report privately to ten web agencies or
privacy implementers found through their existing public materials and ask three
whether they would pay EUR50 for a monthly evidence pack for one customer site.

Kill or narrow the candidate if fewer than three can name a recurring review
workflow, or if the report cannot distinguish "not observed" from "not present"
without encouraging a compliance claim. A successful fixture run is a product
sanity check, not evidence of demand.

## Low-score mitigation

Distribution requires a named agency or privacy-implementation partner before
graduation. Until one exists, keep this as a local probe and do not build a
standalone venture around an untested acquisition channel.
