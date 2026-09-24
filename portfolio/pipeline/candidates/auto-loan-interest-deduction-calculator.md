# Auto loan interest deduction calculator

Scored 2026-09-24. Composite 6.625 · floor 1 (`ai_leverage`). Same shape as
this portfolio's other regulatory-threshold calculators
(`no-tax-on-tips-overtime-calculator`, `1099-vendor-tracker`,
`str-occupancy-tax-calculator`): a brand-new, dated federal tax provision
that has real, measurable search demand and a mechanic dense enough that a
free, deterministic calculator beats a by-hand estimate.

A car buyer financing a new, US-assembled personal-use vehicle in 2025-2028,
and the tax-prep professionals fielding their questions, can now deduct up
to $10,000/year of the loan's interest above the line (One Big Beautiful
Bill Act, new IRC 163(h)(4), the "qualified passenger vehicle loan
interest" or QPVLI deduction) — but only if all eight eligibility
conditions are met, and the deduction phases out by $200 per $1,000 of MAGI
above $100,000 single/head-of-household/MFS or $200,000 joint.

## Why this venture, not a restatement of the sibling tips/overtime calculator

`duplicate_check.py`, run against a description naming this exact
mechanism, scored every existing venture, screened-out row, and pipeline
candidate at 0.24 or below — well under the 0.45 read-this-first bar. The
closest match, `no-tax-on-tips-overtime-calculator` (0.24), is lexically
close only because both are new-2025-OBBBA-deduction calculators; it
computes an entirely different statutory deduction (IRC 224/225, tip and
overtime income) with different mechanics, confirmed by grepping that
venture's own source for "auto loan", "vehicle loan", and "final assembly"
(no matches). Nothing in `screened-out.md` mentions auto loan interest,
vehicle loan interest, QPVLI, or a car loan deduction.

**The reason this is worth building as its own venture, not a feature
bolted onto the sibling calculator, is that the two deductions disagree on
a rule a visitor is likely to assume transfers.** The tips/overtime
deduction excludes married filing separately entirely. This deduction does
not — each MFS spouse gets an independent $10,000 cap on their own return,
at the single-filer thresholds. A visitor who used one calculator first and
generalizes its MFS rule to the other would get it backwards in exactly the
direction that costs them a deduction they were actually entitled to. Both
calculators state this explicitly and cross-link to each other for exactly
that reason.

## Mechanics, verified via WebSearch 2026-09-24

Cross-checked against RSM's and H&R Block's own OBBBA explainers, Thomson
Reuters Tax & Accounting, the Federal Register's own proposed-regulations
notice (2026-01-02, docket 2025-24154), Drake Software's practitioner
knowledge base (for the MFS treatment specifically), and several
independent CPA-firm summaries:

- $10,000/year cap on **interest**, not principal or loan amount — and,
  confirmed independently by multiple sources, this cap does **not** double
  for a joint return (unlike the sibling tips/overtime deduction's per-cap
  doubling).
- Phase-out: $200 per $1,000 of MAGI over $100,000 (single, head of
  household, **or MFS**) or $200,000 (joint) — zero-crossing points
  $150,000 / $250,000, self-consistent with the $10,000-cap /
  $200-per-$1,000 formula.
- Eligibility is an 8-item checklist: new (original use begins with the
  taxpayer), final assembly in the United States, personal use (not fleet
  or business), loan secured by a first lien on the vehicle, a loan (not a
  lease), no salvage/parts title, vehicle type (car, minivan, van, SUV,
  pickup, or motorcycle) with GVWR under 14,000 lbs (RVs/campers explicitly
  excluded even as a primary residence), and debt incurred after
  2024-12-31.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic on a published statutory cap, phase-out formula, and eligibility checklist; no model in the loop. |
| Autonomous ops | 10 | Static client-side page; no queue, no human step to serve one more visitor. |
| Time to revenue | 7 | Donations-only, so read as time-to-first-user: filing-season traffic is dated and predictable, same class as the sibling deduction calculators. |
| Gross margin | 10 | Zero marginal cost per visitor — GitHub Pages, no server component. |
| Defensibility | 2 | The arithmetic is easily reimplemented; several finance-blog calculators for this exact deduction already exist. The edge is the MFS-differs-from-sibling framing and the full 8-item checklist, not the arithmetic itself. |
| Distribution | 7 | Real, confirmed search demand: at least half a dozen independent CPA-firm and finance-media pages (RSM, H&R Block, Thomson Reuters, Wiss, TaxGoddess, National Tax Tools, Morkel Financial, and others) found via WebSearch 2026-09-24 already publish dedicated explainers or calculators for this exact deduction — the same evidence class that justified the sibling tips/overtime calculator's distribution score. |
| Liability containment | 7 | Output is an estimate on user-supplied numbers and self-attested checkboxes, never a filing or a determination; every eligibility item points the user at a primary source (window sticker, VIN, lender statement) rather than asserting an answer; extensive disclaimers, same shape as every other tax-deduction calculator in this portfolio. |
| Ethical robustness | 9 | Donations-only, no data leaves the browser, no adverse incentive to mis-tune the arithmetic; gets no worse for anyone as it scales. |

Composite (1+10+7+10+2+7+7+9)/8 = 6.625. Floor 1 (`ai_leverage`).

## Mitigation (required: `ai_leverage` and `defensibility` are both ≤4)

Both are structural to the product shape, not gaps: `ai_leverage` is low
because the product is deliberately deterministic — a tax-adjacent
calculator is exactly where a model has no business guessing, so the low
score is a feature of the design, not a defect to fix. `defensibility` is
mitigated the same way this portfolio's other calculators of this shape
mitigate it: the moat is being first with the specific framing (the
MFS-and-cap-doubling correction against the sibling calculator, and the
full 8-item eligibility checklist rather than cap/phase-out arithmetic
alone) and the free/private/no-upsell posture against ad-supported
finance-blog competitors, not a technical barrier to reimplementation.

## Gates

Both pass. Liability: every figure is either a published, cited statutory
cap/threshold or a number the user supplies; the tool makes no
determination about a specific vehicle's or loan's actual eligibility, and
every eligibility item directs the user to a primary source before relying
on it. Ethics: the tool only helps a filer claim a deduction they may
otherwise miss or misapply — it never assists evading an obligation, holds
no personal or scraped data, and there is no revenue model that would
reward mistuning the arithmetic in either direction (donations only).

Graduated 2026-09-24 as `ventures/auto-loan-interest-deduction-calculator`;
browser-local QPVLI deduction estimator with the full 8-item eligibility
checklist and explicit MFS/joint-cap corrections against the sibling
tips/overtime calculator, with repeat usage and organic search demand
still unmeasured.
