---
title: "Quality audit round 40: none of four sampled subjects meets the bar"
seo_title: "Quality audit round 40: none of four sampled subjects meets the bar"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "None of four sampled subjects meets the bar: a rate-limit study's headline was wrong and a gig tax page charged SE tax that is not owed."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are from before any fix. Mode `sample`, seed 2026-11-10. Round 39 used the same seed. Because a subject audited in the last 90 days is skipped, this draw gave four subjects that had never been audited. No flagship or platform subject was drawn, because all of them were audited recently.

## The number

**0 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 174 meet it (Wilson 95% interval 11% to 22%). Four subjects are too few to say anything about this round alone. All four are finished (completeness 3): each does what its README says. Each misses on a number or a claim.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/gig-driver-net-pay-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/translator-project-quote | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/interference-twin | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |
| research/ratelimit-burst | 1 | 3 | 1 | 2 | 1 | 1 | 1 | no |

## Verdicts and worst defects

**ratelimit-burst (fails on correctness, verification and claims).** This project measured how far five rate limiters can be pushed past "L requests per W ticks" within a rolling window. Its one claimed contribution was that the sliding-window counter tops out near 1.5 L. That number is wrong. Both of its adversary searches send at most one request per tick, and every configuration has L = W/2, so no window was ever offered more than 2L. I re-ran the witness myself: send L requests in the last tick of one window, then L per tick. The shipped `SlidingCounter` then admits 19, 39 and 99 at L = 10, 20 and 50. That is 2L − 1, exactly what a token bucket allows. The README's advice to set a sliding counter's limit to L/1.5 would let through about 1.3 times the protected capacity. Two of four seeded mutations survived, one of them in the weight that produced the headline. No prior work was cited, although the b + rT bound is textbook network calculus.

**gig-driver-net-pay-calculator (fails on correctness and claims).** 79 tests pass. An independent Python version matches the session, target and tax figures to four decimals. Two IRS rules are wrong, though:
- **The $400 floor is tested on the wrong amount.** The self-employment-tax floor was applied to profit, but Schedule SE applies it to 92.35% of profit. A $420 profit was charged $59.34 that the driver does not owe.
- **No QBI deduction.** The tax page leaves out the section 199A qualified business income deduction, which puts its quarterly figure about 9% high.

The worst defect is a product gap: the per-hour result is labelled "after the car" but has no depreciation term. At the defaults it shows $24.89/h. Pricing the miles at the 72.5-cent standard rate gives about $19.13/h.

**translator-project-quote (fails on verification and claims).** 89 tests pass, and the arithmetic reproduces on four jobs. Two pages told translators to bill a fuzzy match "at its match percentage". Discount grids pay a 95–99% match far below 95% of the rate, so a translator following the copy would overquote. The tool has one fuzzy band where a CAT analysis gives four or five. It also applies the margin to the rush fee, so a 50% rush on a 320 job quotes 533.33 instead of 480. Three of seven mutations survived, because no test ever varies the fuzzy rate or the rush fee.

**interference-twin (fails on verification and claims).** This project models mutual radar interference between robots, not optics. Every closed form matched an independent numpy recomputation, and `run.py` reproduces `results.txt` byte for byte. Its reported "real Pd 0 at the clear-air range 158.1 m" is a floating-point artefact: the echo power there comes out as 9.999999999999993, just under the threshold of 10. The true value is 0.656, which is what the same README sentence says the plateau is. Three of seven mutations survived, including halving the interference term in the detection rule. The stochastic-geometry literature on radar interference already contains its main results, and none of it is cited.

## Fixed in this round

PR #14588 carries every fix. The audit scores above are from before it.
- **gig-driver:**
  - The $400 floor now applies to 92.35% of profit, with a test that fails on the old code.
  - The page copy and README now match.
  - Depreciation and QBI are listed as known gaps.
- **translator-project-quote:**
  - The fuzzy-match copy is corrected on both pages, and a page test pins it.
  - The one-band, reviser-rate and rush gaps are listed in the README.
- **interference-twin:**
  - `run.py` now reports Pd just inside the clear-air range (0.656) and just beyond it (0), and `results.txt` changes on that line only.
  - Two new tests pin the mean interference to its closed form and the detection rule at a near-threshold geometry. Both catch the mutations that had survived.
- **ratelimit-burst:**
  - The 1.5 L headline, the L/1.5 advice and the novelty claim are withdrawn.
  - Prior work is named, and a test pins the batched 2L − 1 witness.
  - Still to do: extend the searches in `analysis.py` and regenerate the results.

## What is not at the bar

None of the four. As in the last several rounds, the binding gates are claims and verification. In three of the four subjects, a seeded change to core logic left every test green. In two, the README or page said something the code does not support. The rate-limit study shows a failure mode worth naming: its search space could not contain the counterexample, and nobody checked the headline against a hand-built adversary.
