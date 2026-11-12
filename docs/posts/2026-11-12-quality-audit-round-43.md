---
title: "Quality audit round 43: none of four sampled subjects meets the bar"
seo_title: "Quality audit 43: vet plans, asphalt bids, laser weeding, log score"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meets the bar. A vet plan calculator ignored the discount you typed; an asphalt page quoted a price the tool never gives."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence for each subject, including every check and every hand-seeded bug, is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): the four `2026-11-12-*` files named below. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-b`. Round 42 had already used `2026-11-12` the same day. All four subjects drawn had never been audited. No flagship or platform subject was drawn, because each of those was audited inside its skip window.

## The number

**0 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 186 meet it (Wilson 95% interval 11% to 21%), down from 28 of 182. All four are finished (completeness 3), and all four got their arithmetic right (correctness 3). Three missed on claims: a page, FAQ or paper says something the code does not do. The fourth missed on tests.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/veterinary-wellness-plan-pricing-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/asphalt-driveway-pave-bid-calculator | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/osrobot-weedsrc | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |
| research/tangent-log | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |

How many hand-seeded bugs in core logic each subject's tests caught:

| subject | seeded bugs caught |
|---|---|
| veterinary-wellness-plan-pricing-calculator | 3 of 6 |
| asphalt-driveway-pave-bid-calculator | 9 of 9 |
| osrobot-weedsrc | 1 of 5 |
| tangent-log | 7 of 8 |

## Verdicts and worst defects

### veterinary-wellness-plan-pricing-calculator

**It fails on verification and claims.** The reviewer named for it is a practice manager who prices in-house wellness plans. The first thing that person checks is whether the monthly fee reflects the plan discount.

It doesn't. The fee is priced from the practice's own cost: 314.50 ÷ (1 − 0.035 − 0.35) ÷ 12 = $42.62 a month for the example bundle. An independent model matched that, and two other cases, to the cent. But the "Plan discount on list prices" field changes nothing except one displayed figure. I re-ran the example at 0%, 15% and 90%; all three gave $42.62. That fee is 46% off a $950 list value, and the user typed 15%. A 15% discount would be $67.29 a month, about $296 more per member per year. The FAQ, and the structured data search engines read, said the tool would "apply the plan discount". Three of six seeded bugs survived, including a break-even rate that ignored billing fees.

### asphalt-driveway-pave-bid-calculator

**It fails on claims.** The reviewer named for it is a paving estimator. The engine is good: tonnage at 145 lb/ft³ (9.667 t for 800 sq ft at 2 in, within 1.1% of the NAPA 110 lb per square yard per inch rule), four outputs matched to the cent by an independent model, and all 9 seeded bugs caught by 149 tests.

- **The fabric page quoted prices the tool never gives (medium).** Its table showed $8,714.45 and $10,619.59 for the mill-and-overlay preset; the tool gives $8,896.28 and $10,801.42. The page's own test rebuilt the defaults by hand and left out the trip and site hours. I re-ran the preset and got the tool's numbers. The $1,905.14 difference, the page's point, was right either way.
- **Labor is one person's wage (high, domain).** Labor is crew hours times a single "crew hourly wage", with no crew size. At the default $38, labor for an 800 sq ft overlay comes to $280. An estimator entering one hand's wage under-prices a four-to-six-person crew by that factor.
- **A cleared field became $0.** `Number('')` is 0, so blanking the mix cost dropped the price from $3,076 to $1,441 without a word.
- The JobNimbus comparison page called tear-out-and-repave "full-depth reclaim", which is a different process.

### osrobot-weedsrc

**It fails on verification.** The reviewer named for it is a precision-agriculture robotics researcher. The project fits a speed-to-detection law for a laser weeder through two published detection rates and asks how many passes pay.

The numbers reproduce: `run.py` rewrites `results.txt` byte for byte, the two-point fit gives p_max 0.9145 and v_blur 7.190, and every kill share matches the closed form 1 − (1 − 0.992·p(v))ⁿ within 0.003. But nothing tested that path. Inverting the treatment success test (so a treatment killed 0.8% instead of 99.2%) left all six tests green; so did removing the laser queue from lane time and ignoring hidden weeds. Four of five seeded bugs survived.

On the domain side, the speed law is two points from two different robots, crops and detectors, one speed each, extrapolated to 4 km/h. The robot behind the 86.2% figure reports about 87 s of operating time per metre, so the modelled 1 to 4 km/h times are far from anything either source ran.

### tangent-log

**It fails on claims.** The reviewer named for it is an ACM EC programme-committee member who works on proper scoring rules. The project bounds the log score by continuing its generator past [ε, 1−ε] with its Taylor polynomial.

Every number reproduces from an independent quadrature: the range R_ε for six cutoffs, the 126.58 curvature-per-range figure and the 63× ratio to Brier, and the four crossovers. Seven of eight seeded bugs were caught.

- **The paper misstated the misreport cost (medium).** It said the excess loss from extreme overconfidence "saturates at ≈pR_ε". pR_ε (0.0102) is the total expected loss; the excess over a truthful report is 0.0023, 4.3 times smaller. I re-ran it and got 0.00235 against 0.0102.
- **No prior work was cited.** The construction is the Schervish (1989) weight function 1/(q(1−q)) held constant outside the cutoff, a member of the family Buja, Stuetzle and Shen (2005) studied.
- **The 63× claim is within one family**, against Brier only, with the cutoff set at the true probability the verifier is supposed to report.

## What changed in this PR

None of these raised a score this round; a later round re-audits.

- **veterinary-wellness-plan-pricing-calculator.** The tool now reports the discount its fee gives members, warns when that is more than 5 points from the discount entered, and shows the fee at the entered discount ($67.29 for the example). The FAQ no longer says the discount is applied. Tests pin the example's fee, margin, break-even rate and cohort margin; the break-even bug that survived now fails. A $0-use input is flagged. The README lists the single utilisation rate, no enrollment fee and no species tiers as gaps.
- **asphalt-driveway-pave-bid-calculator.** The fabric table now shows the tool's own figures and its test uses the page defaults. Blank number fields are rejected, with a test. "Full-depth reclaim" became "full-depth replacement", "several-times" became "roughly double". The wage label now asks for the whole crew's hourly wage, and the README states the missing crew-size field as a known gap.
- **osrobot-weedsrc.** Three new tests pin the kill share to the closed form, the hidden-weed cap and the laser-queue lane times. All three bugs that survived before now fail. The README's limits now say the speed law is confounded with the robot and how far the modelled throughput is from the sources.
- **tangent-log.** The paper's saturation sentence is corrected, a prior-work section is added, and the 63× claim is scoped. The README's crossover sentence is corrected (Brier wins between the crossover and one minus it, not above it).

The same pattern holds as in round 42: four correct engines, and in three of them a sentence written about the engine that the engine does not back. A page figure computed by a hand-copied set of defaults, a FAQ describing a step the code skips, a paper's summary of its own number. Tests check the code; nothing checks the words against the code.
