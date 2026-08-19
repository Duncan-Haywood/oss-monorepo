# Candidate: CRA evidence desk

**One line.** Continuously-maintained Cyber Resilience Act evidence for small
software vendors selling into the EU: a live SBOM, EU vulnerability-database
matching, and a pre-drafted 24-hour incident report they can send in minutes.

**Verdict: build now, narrow.** Sell the reporting-readiness slice only. Do not
sell conformity assessment, do not sign anything, do not file on anyone's behalf.

Scored 2026-08-18. Composite 7.0 · floor 4 (defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 8 | Dependency reconciliation, advisory triage, and drafting the technical file are model work over structured inputs |
| Autonomous ops | 8 | Ingest, diff, match, alert, draft — no human step in the normal path |
| Time to revenue | 7 | Deadline-driven urgency, but the buyer is an engineering org with a procurement habit |
| Gross margin | 9 | Inference plus a feed and a database |
| Defensibility | 4 | SBOM generation is commodity and partly open source; the durable part is the archive and the EUVD mapping |
| Distribution | 6 | Reachable through open-source maintainer channels and CRA-deadline content, but no warm list today |
| Liability containment | 6 | Compliance-adjacent; contained by refusing the advice and filing positions |
| Ethical robustness | 8 | Pushes small vendors toward genuinely knowing what is in their software |

## Why now

Article 14 reporting obligations under the Cyber Resilience Act go live on
**11 September 2026** — three weeks from this scoring pass — requiring
manufacturers to report actively exploited vulnerabilities to ENISA within 24
hours, with follow-up inside 72. It applies to products already on the market,
not just new releases. Full compliance, including the secure-by-design and
documentation requirements, follows on 11 December 2027.

The gap is specific and well-evidenced. A vendor cannot meet a 24-hour clock
without already knowing its component inventory, so the SBOM is effectively due
a year before it is formally mandated. ENISA's own SME maturity work found the
constraint is not awareness but tooling and templates: 142 of 194 SME
respondents cited a need for financial support to close compliance gaps, and
over 70 percent asked for practical templates for technical documentation and
secure development. Meanwhile no single SBOM tool covers every language
ecosystem well, and Dependency-Track — the common open-source choice — does not
natively integrate the EU Vulnerability Database, which is the register the CRA
regime points at.

That last item is the wedge. The generic answer ("generate an SBOM") is
crowded and partly free. The specific answer — *your components, matched against
the European register, with the 24-hour notification already drafted* — is not.

## What is sold

Subscription, per product line, €99–€399/month by dependency count:

- **Inventory** — SBOM generated or ingested from the customer's CI, normalised
  across ecosystems, versioned so history is queryable.
- **Watch** — continuous matching against EUVD and other advisory sources, with
  noise suppressed by reachability rather than by version range alone.
- **Draft on trigger** — when something in the inventory is flagged as actively
  exploited, produce the Article 14 notification draft populated with product
  identifiers, affected versions, and known mitigations, ready for the customer
  to review and submit.
- **Technical file scaffolding** — the December 2027 documentation set, kept in
  sync with what the inventory actually says, as templates the customer owns.

## Liability and ethics

This sits one step from regulated advice, so the boundary has to be structural,
not just worded:

- **The customer submits.** We never hold the credentials to the reporting
  portal and never transmit on their behalf. The moment we file, we are in the
  chain of a regulatory obligation with a 24-hour clock and no staff.
- **No conformity claims.** We do not assert that a product meets the CRA. The
  product tells them what is in their software and what is known about it.
- **Failure mode is disclosed.** A missed advisory or an incomplete SBOM is a
  foreseeable failure of any tool in this category. Say so in the product, cap
  liability at fees, and make the coverage limits visible in the UI rather than
  buried in terms — a customer who believes coverage is total is the one who
  gets hurt.

The honest version of the ethical question: is this selling fear? Partly. It is
kept legitimate by only charging for something that is independently useful —
knowing your dependencies and their vulnerabilities is good practice regardless
of the regulation — and by not inflating what the obligation requires.

## Where it can fail

- **Commodity floor.** If a well-funded SBOM vendor ships EUVD matching, the
  differentiator evaporates. The counter is speed and a narrower buyer, not
  features.
- **Deadline decay.** Post-11-September the panic buying ends and this becomes a
  steady compliance-tooling sale with a longer cycle. Pricing should assume the
  steady state, not the spike.
- **Language coverage.** Partial ecosystem coverage produces confidently
  incomplete inventories, which is worse than none. Launch with two ecosystems
  covered well and say plainly what is not covered.

## First experiment

Ten days, under €200:

1. Take three real open-source-heavy products, produce the inventory, and match
   against EUVD. Measure false-positive rate against manual review — this is the
   only number that matters.
2. Generate one Article 14 draft from a real historical exploited-vulnerability
   case and have it read for plausibility against the required fields.
3. Take it to fifteen small EU-selling vendors reachable through maintainer
   channels; ask for €99/month, not for feedback.

Kill it if fewer than three of fifteen will pay before the deadline. A
compliance product that cannot sell three weeks before an obligation lands will
not sell three months after it.

## Sources

- [Keysight — one year countdown to CRA compliance, 11 September 2026](https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything)
- [SafeDep — SBOM and the EU Cyber Resilience Act](https://safedep.io/sbom-and-eu-cra-cyber-resilience-act/)
- [OpenSSF — 2026 CRA awareness and readiness report](https://openssf.org/wp-content/uploads/2026/06/2026_CRA_Awareness_Readiness_Report.pdf)
- [Cloud Security Alliance — ENISA SME maturity model and the CRA readiness gap](https://labs.cloudsecurityalliance.org/research/csa-research-note-enisa-cra-sme-maturity-20260715-csa-styled/)
