---
title: "Quality census: an Amazon claim window 18 months stale, and 0 of 6 subjects at the bar"
seo_title: "Quality census 2026-11-20: six first audits, none at the bar"
date: 2026-11-20
tags: [quality-audit, evaluation, testing]
description: "Six first audits, none at the bar, all finished. Worst: an FBA claim finder used Amazon's old 18-month window; it has been 60 days since late 2024."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-20-67e4`). Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share, which is still **33 of 306** (Wilson 95% 8% to 15%).

There is one audit file per subject, named `2026-11-20-<subject>.json`, in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every seeded bug, and the scores were set before any fix. Before accepting an audit, I reran its worst finding myself: the UK reimbursement case, the free-f32bounce lag, the qual-features pool count and the Amazon policy.

## The number

**0 of 6 meet the bar, and all six are finished** (completeness 3). Every one fails on verification, claims or both. Across the six, their own tests caught **14 of 32** hand-seeded bugs.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/uk-working-from-home-tax-relief-calculator | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/fba-reimbursement-claim-finder | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/tile-layout-optimizer | 3 | 3 | 2 | 3 | 3 | 3 | 2 | no |
| research/free-f32bounce | 3 | 3 | 2 | 3 | 2 | 2 | 3 | no |
| research/qual-features-outcomes | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/buildbot-nailpay | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Coverage: 443 of 2,496 subjects have now had at least one audit (17.7%).

## The subjects

**ventures/fba-reimbursement-claim-finder (correctness 2, two high defects, fixed).** The matching logic is right. An independent Python version reproduced the example exactly: 9 units worth $165, with the inbound shortages and the month-end clamping matching too. The tests are the best of the six (7 of 9 seeded bugs caught). The rule it aged claims against was wrong, though. It used an 18-month window for units lost or damaged in Amazon's warehouses, and the FAQ stated that as fact. Amazon's reimbursement policy has allowed 60 days since late 2024. I confirmed that on Amazon's supply-chain support page. Under the current rule the example's "9 units / $165 claimable" is zero, so a seller would have opened cases Amazon refuses. Fixed in this PR:
- The window is now in days: 60 by default, editable, with the wait set to 0.
- A `Found` row that Amazon later reverses no longer cancels real losses.

Still open:
- Units are valued at past payouts, while Amazon now pays manufacturing cost.
- The summary ledger cannot tell warehouse damage from carrier damage.
- The inbound window stays at 9 months, because I found no source for its current value.

**ventures/uk-working-from-home-tax-relief-calculator (correctness 2, one high defect, fixed).** The £6-a-week rate, the four-year deadlines and the sample's £225.60 all match GOV.UK. The bug was in how the employer's payment was taken off. It was scaled by weeks/52 before being subtracted. Someone whose employer paid £156 for 26 weeks at home was shown a £15.60 refund, but under ITEPA 2003 s336 they bore nothing and have no claim. Fixed, with a test that fails on the old code. Still open: there are no Scottish 41%, 46% or 47% rates, and one annual payment figure is applied to every year.

**ventures/tile-layout-optimizer (verification 2).** This is the strongest venture of the round. An independent brute-force search agreed with its tile count on 40 of 40 random rooms, and the worked example in its guide reproduces. Two problems:
- **The advice.** The tool recommended a half brick offset for its own 30×60 cm sample with no warning. The guide said a half offset "hides a bowed plank", which is the opposite of the industry guidance: ANSI A108.02 §4.3.8 and the TCNA Handbook limit the offset to 33% for tile with a side over 18 in. Fixed: plans now carry that warning, and the guide and FAQ say the right thing.
- **The tests.** They caught 1 of 5 seeded bugs, including missing a dropped saw kerf. The random-room test was widened from 40 to 150 rooms, and it now catches that bug.

**research/free-f32bounce (claims 2).** This one reproduces bit for bit. An independent pure-Python billiard matches the exact mean free path (0.45321) and the float32 departure at 21 collisions. The overclaim was in the README, which said the event order changes "always exactly one collision after the position departure". A new section 5 in `run.py` measures the lag for each member. For float32, the lag is exactly one collision in only 29% of members, zero in 32%, two or more in 32%, and negative in 7%. The README and homepage now say that. Still open: there is no shadowing literature (Grebogi et al. 1990), and the headline equivalent-error formula is untested.

**research/qual-features-outcomes (claims 2).** The run reproduces exactly (5 minutes), and five numbers were recomputed independently. Two findings are weaker than written:
- **The words baseline is untuned.** A default naive Bayes on raw counts gets 0.595 at n = 1,600, against the author's 0.557, so "a dense embedding uses labels more efficiently" may just reflect a weak baseline.
- **Draws are skipped silently.** On outcome D, the n = 50 cell averages 7 of the 30 draws it claims.

Both are now in its Limitations. The "about 85" positives in the pool is 77, which I checked myself and corrected.

**research/buildbot-nailpay (claims 2).** Every break-even row reproduces from first principles. The headline prices a Unitree G1 nailing a sheet in 85 s. But this repo's own taskbook marks the G1's payload "no" for that task: about 0.2 kg at the pose against a 3.4 kg nailer. The person-side 372 s per sheet is also a hand-hammer pace. Both are now at the top of its Limitations. The model fix (no base cost for walking robots) needs the results regenerated and is left to the project.

## What changed, and what this round says

- **Fixed in this PR:** two high defects (FBA window and FAQ, UK reimbursement) and eight medium or low ones. Each has a test that fails on the old code, or a recomputed number.
- **Open:** the larger research defects, which are in each project's Limitations with the audit linked.

**Verification is again the gate that binds.** It failed in five of six subjects, and seeded bugs survived in every one.

Two of the six worst defects were domain rules that changed or were never checked against the standard: Amazon's 60-day window and the ANSI offset limit. Neither is something a unit test written by the same author would catch. The lesson is the one the [reflections](../../portfolio/quality/reflections/) keep reaching: a rule a user will act on needs a citation at the point of use and a date it was last checked.
