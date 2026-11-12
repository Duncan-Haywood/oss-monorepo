---
title: "Quality audit round 45: none of four sampled subjects meets the bar"
seo_title: "Quality audit 45: COBRA vs marketplace, pet-sitter fees, feeding arms, transformers"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meets the bar. A COBRA calculator said COBRA was cheaper at every level of care, above its own table showing it wasn't."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-d`, because rounds 42 to 44 had already used today's first three seeds. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 194 now meet it (Wilson 95% interval 10% to 20%), down from 28 of 190. All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/pet-sitting-platform-fee-calculator | 3 | 3 | 2 | 2 | 3 | 3 | 2 | no |
| ventures/cobra-vs-marketplace-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/osrobot-dof | 3 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| research/infra-transformer | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |

Across the four subjects, the tests caught 8 of 25 hand-seeded bugs in core logic:

| subject | seeded bugs caught |
|---|---|
| pet-sitting-platform-fee-calculator | 2 of 7 |
| cobra-vs-marketplace-calculator | 3 of 6 |
| osrobot-dof | 1 of 5 |
| infra-transformer | 2 of 7 |

## Verdicts and worst defects

### cobra-vs-marketplace-calculator

**It fails on correctness and claims.** The reviewer named for it is an ACA-certified navigator, who would check first how the tool decides which plan is cheaper.

**The tool said "COBRA costs no more than the marketplace plan at any level of care" above a table where the marketplace was cheaper (high).** The verdict looked only at $0 of care. The audit's example is a $150 COBRA premium against $400 for the marketplace plan, with a $9,200 out-of-pocket maximum against $1,000. At $9,000 of care that costs $10,800 on COBRA and $5,800 on the marketplace. I reran the command and got the same output.

**The second high defect is the plan year.** The tool treats the whole 1 to 18 months as one deductible year. Marketplace plans reset on January 1 (45 CFR 147.104(f)), and most employer plans do too. Its own worked example ends coverage on 31 October and runs six months, so it crosses January. It shows a worst case of $10,460 for the marketplace. Across two plan years the real worst case is 6 × $210 + 2 × $9,200 = $19,660.

What it gets right:
- The arithmetic, on the README example: a $4,875 break-even, from 3,420 + 600 + 0.2(s − 600) = s.
- The 60-day election window and the 60-day special enrollment window, checked against 26 CFR 54.4980B-6 and 45 CFR 155.420.
- The rule that being enrolled in COBRA, not just eligible for it, blocks the premium tax credit (26 CFR 1.36B-2(c)(3)(iv)).

What it does not say: in 2026 the premium tax credit cliff at 400% of the poverty line is back (Rev. Proc. 2025-25).

### pet-sitting-platform-fee-calculator

**It fails on verification.** The reviewer named for it is a pet sitter who runs their own business. The numbers are right. On the defaults, a platform booking nets $32.00 and a direct one $39.395, and the break-even is 55 / 7.395 = 7.44 direct bookings a month. I checked these by hand as well as the auditor's model.

Five of seven seeded bugs survived, including the headline "worth $X a year" figure computed from the wrong mix, and the per-hour column divided by bookings instead of hours.

The worst domain gap (medium) is in the Wag preset. It takes 40% off "price per booking", but Wag's split is on what the owner pays: about 1.67 times the walker's rate, which Wag's help centre states. A walker who types their own $25 rate is shown $15 kept, when they actually keep about $25.

A cleared field also silently became the example value: clearing "marketing" to mean $0 used $30.

### osrobot-dof

**It fails on verification and fitness.** The project asks whether a spoon-feeding arm needs more than two joints. The reviewer named for it is an assistive-robotics researcher.

The tip masses are right. An independent closed-form two-link calculation gives 0.628 kg, matching `results.txt`, and the finite-difference values for 3 to 6 joints match to four decimals.

**The headline is partly built in (high).** "Lip force barely moves with joint count" comes from holding the controller's damping *ratio* constant. That makes the damping gain grow with the square root of the mass, so heavier arms approach more slowly. The impact estimate v·√(K·m) then comes out at exactly 2.213 N for every mass. With the parent project's fixed gain instead, the worst peak rises from 4.00 to 4.07 to 4.25 N, and the safe share falls from 0.71 to 0.67 to 0.65. I reran this counterfactual myself.

Other gaps:
- Four of five seeded bugs survived, including reflecting the rotor inertia through N instead of N², which cuts the two-joint mass from 0.628 to 0.194 kg.
- The reported mass is Λ_xx, not the effective mass along one direction, which is 7 to 19% lower.
- The impact-safety literature (Khatib 1995, Haddadin, ISO/TS 15066) and existing feeding devices are not cited.

### infra-transformer

**It fails on verification.** The project asks how heat-pump and EV growth wears out a distribution transformer. The reviewer named for it is a utility distribution planning engineer.

Every number reproduces:
- a fresh run is byte-identical to the committed results;
- an independent IEEE C57.91 clause 7 implementation matches the loss of life per climate;
- the 110 °C / 85 °C rated point and the 6.78 K doubling interval match.

But every thermal test sat at rated load, where any exponent gives 1. So five of seven seeded bugs survived, including the hot-spot exponent K^(2m) changed to K^m.

**The 18-year end-of-life headline needs its caveat beside it (medium).** That case peaks at 2.38 per unit and a 207 °C hot spot, and 49 hours above 140 °C cause 92% of the year's ageing. I recomputed all three numbers. At those temperatures the guide's loading limits decide, not loss of life.

The finding agrees with Hilshey et al. (2013) and Navarro-Espinosa and Ochoa (2016). It is not new, and neither paper was cited.

## What changed in this PR

None of these raised a score this round; a later round re-audits.

- **cobra-vs-marketplace-calculator.**
  - The cheaper-plan verdict is now exact. Both cost curves are straight lines between corners, so the tool checks every corner.
  - It has new verdicts: "COBRA cheaper below $X" and a mixed case.
  - When the months cross January 1, a note says so.
  - The first-premium date is labelled as the latest possible one.
  - Tests pin what COBRA carries over and the exact $4,875. All three bugs that survived now fail.
  - The README lists the plan-year split and the 2026 credit cliff as known gaps.
- **pet-sitting-platform-fee-calculator.**
  - Tests pin the annual gain, the per-hour figure, the break-even threshold, the direct-share bound and the card-fee warning. All five bugs that survived now fail.
  - A blank field is now an error instead of the example value.
  - The price label says "the price the client pays", and the Wag answer explains the 1.67 multiplier.
- **osrobot-dof.**
  - The README's limitations now state the gain confound with the fixed-gain numbers, the Λ_xx versus directional-mass gap and the missing prior work.
  - Closed-form tip masses and the gain scaling are pinned. All four bugs that survived now fail.
- **infra-transformer.**
  - Tests pin the thermal model at 1.5 per unit (171.76 °C hot spot, worked by hand), growth applied to EV load, and charging starting at arrival. Four of the five bugs that survived now fail; the smart-charging `<=` one still survives.
  - The README puts the 140 °C caveat next to the headline, cites the prior work, and notes that older 95 °C insulation ages about 4.9 times faster.

## Something the round found about auditing

One auditor's mutation was reverted with the same file size in the same second as it was compiled. Python's `__pycache__` then kept serving the mutated bytecode, so a later rerun printed 0.178 kg where the true tip mass is 0.628. It looked like a wrong result in the project, but it was a stale cache. Clearing the cache restored the right number. Mutation runs on Python projects should set `PYTHONDONTWRITEBYTECODE=1`.

Round 44 found tests that do not pin the numbers they protect. This round found the same thing in all four subjects: 17 of 25 seeded bugs survived. Two of the four also had a verdict or headline the model behind it did not support. The COBRA "always cheaper" sentence ignored its own table, and the feeding arm's "joint count does not matter" came from how the gains were set, not from the arm.
