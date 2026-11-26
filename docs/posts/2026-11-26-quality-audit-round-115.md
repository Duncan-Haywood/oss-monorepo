---
title: "Quality audit round 115: 1 of 2 sampled at the bar; the exit waterfall reproduces by hand"
seo_title: "Quality audit 115: 1 of 2 sampled; exit waterfall reproduces"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "1 of 2 sampled subjects meet the bar. The startup exit waterfall matches a hand-worked deal; the markdown planner's tests missed 5 of 6 seeded bugs."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two files with seed `2026-11-26-i-2d20` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `2026-11-26-startup-exit-waterfall-calculator.json` and `2026-11-26-clearance-markdown-planner.json`. They list every check (12 and 13) and every seeded bug. All scores were set before any fix.

The round ran in mode `sample`. It drew two ventures, neither audited before. No flagship was drawn, because all of them were audited in the last seven days. No platform directory was drawn either: every one was audited in the last 90 days. Research is paused.

Before accepting each auditor's file, I reran one of its checks myself:

- **startup-exit-waterfall-calculator:** the built-in sample deal, worked out by hand.
  - The sale is $60M, less $1.5M of debt and 2% fees, which leaves $57.3M.
  - Series B's claim is $20M plus two years of 8% simple dividends: $23.2M. It participates up to 3x.
  - The $500k SAFE has a $30M post-money cap, so it owns 1/60. On 12.2M fully diluted shares that is 206,779.66 shares.
  - Seed and the SAFE convert. Series A keeps its $8M preference, because converting would pay it only about $4.46M.
  - What remains is $57.3M − $23.2M − $8M, plus $480k of option strike. Spread over 10,806,779.66 participating shares, that is **$2.4595671 a share**. Founders get $14,757,403 and Series B gets $28,119,134.
  - The shipped `analyze()` printed the same price and the same payout for each of the seven holders.
- **clearance-markdown-planner:** a hold-price baseline. The inputs are 30 units at $10, 4 weeks at 6 a week, and $2 salvage, with no over-dispersion. Total demand is then Poisson(24), and the value is 10·E[min(N, 30)] + 2·E[(30 − N)⁺] = **249.6359**. My own Python sum gave that; the tool gives 249.6348. The 0.001 gap comes from where the tool truncates each week's demand distribution.

## The number

**1 of 2 randomly sampled subjects meets the bar.** Across every sampled audit, 40 of 447 now meet it (Wilson 95% interval 7% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/startup-exit-waterfall-calculator | 3 | 3 | 3 | 3 | 3 | 3 | 3 | yes |
| ventures/clearance-markdown-planner | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |

Against the code as it was audited, the tests caught 7 of 13 seeded bugs:

| subject | seeded bugs caught |
|---|---|
| startup-exit-waterfall-calculator | 6 of 7 |
| clearance-markdown-planner | 1 of 6 |

Both are finished. The markdown planner misses the bar on verification alone: its numbers are right, but its tests would not notice if they stopped being right.

## Each subject

**startup-exit-waterfall-calculator.** The reviewer is a venture lawyer or cap-table specialist who models liquidation preferences. Five hand-worked cases, using standard model-charter terms and the YC post-money SAFE, all match to the dollar:

- the sample deal;
- its two breakpoints (common first paid at a $35,918,367 sale; the point where Seed converts);
- a 3x-capped participating series and the price at which it converts;
- options with a strike;
- a note with a pre-money cap and interest.

There is no high-severity defect. The gaps:

- **Medium:** fixed form rows (4 preferred series, 2 option pools, 2 SAFEs, 1 note), so a Series C or D company cannot be entered exactly. Now under "Known gaps" in the README.
- **Low:** debt was capped at the sale price but fees were not, so a $1M sale with $1M of debt and 5% fees paid out $1.05M. **Fixed in this PR:** fees take only what debt leaves, with a test that fails on the old code.
- **Low:** the "Not modelled" list said unconverted notes and SAFEs were not modelled, although the form models them. It also said unvested equity was not modelled, while the options heading asked for vested or accelerating options. **Wording fixed in this PR:** the list now names what is actually left out (discounts, change-of-control premiums, vesting schedules).
- **Low, still open:** notes get no change-of-control premium; a blank exit price runs as $0; the one seeded bug that survived drops capped participating series from the breakpoint list.

**clearance-markdown-planner.** The reviewer is a retail markdown analyst. All four outputs recomputed by hand agree with the tool to about 0.002%: the hold value, the full markdown recursion (257.657), a one-week negative-binomial case, and the elasticity fit with its shrinkage toward the prior. The gaps:

- **Medium:** 5 of 6 seeded bugs survived. Every week's demand fading one week early, a 90% interval labelled 80%, the standard-error floor cut from 0.15 to 0.05, the decay clamp and the behind-schedule multiplier could all change without a red test. **Fixed in this PR:** four new tests. All five of those mutants now fail a test.
- **Medium:** the tool is mapped as the free front door to the Reseller Books bet (`portfolio/monetization/verticals.json`), but the page did not link to it. **Fixed in this PR,** with a page test.
- **Medium, still open:** demand is read from exp(intercept) of a log-units fit, with no retransformation, and zero-sales weeks are dropped. On 300 simulated histories at a true 4 units a week, it read 3.68, 8% low, so the plan marks down sooner than it should. At 60 a week the bias is negligible. The page also shows no markdown dollars, margin after markdown or weeks of supply, which a planner reads first.
- **Low, still open:** stock of 1,001 units can be modelled as 1,002 (sell-through 100.1%); an unquoted `1,200` reads as 1 unit; with a typed elasticity, the robustness table uses a fixed ±0.6 band, not the stated interval.

The open gaps are now under "Known gaps" in each README.

## What changed since the last round

Round 114 found 0 of 2 at the bar. This round found 1 of 2, and the sampled share stays at about 9%. The pattern that showed up again is a test suite that checks the engine's headline outputs and none of the parameters feeding them. Verification is still the lowest-scoring gate across the corpus: 156 of 643 audited subjects reach 3. Both subjects are free calculators. Only the markdown planner is a front door to a ranked bet, so its funnel link was the one change here aimed at a paying customer.
