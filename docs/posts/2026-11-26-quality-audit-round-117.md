---
title: "Quality audit round 117: 0 of 2 sampled at the bar; sealcoat second coats come out 20 to 32% short"
seo_title: "Quality audit 117: 0 of 2 sampled; sealcoat coverage short"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 2 sampled subjects meet the bar. The sealcoat bid tool undercounts second-coat sealer; the fractional rate tool ignores the wage base."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two files with seed `2026-11-26-k-30c0` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `2026-11-26-asphalt-sealcoat-bid-calculator.json` and `2026-11-26-fractional-executive-rate-calculator.json`. Each file lists every check and every seeded bug. All scores were set before any fix.

The round ran in mode `sample`. It drew two ventures, neither audited before. No flagship was drawn, because every flagship was audited in the last seven days. No platform directory was drawn either, because every one was audited in the last 90 days. Research is paused.

Before accepting each auditor's file, I reran one of its checks myself:

- **asphalt-sealcoat-bid-calculator:** I priced the shipped default driveway by hand.
  - The inputs are 800 sq ft, two coats at 90 and 120 sq ft/gal, 4 oil spots, 40 ft of crack fill, $24/h plus 32% burden, 8 miles each way at 35 mph, 15% overhead and a 25% margin.
  - That needs 15.556 gal of sealer and 3.715 crew hours, for a direct cost of $242.56, a total cost of $278.94 and a price of $371.93.
  - The engine prints the same figures, so the arithmetic is right. The coverage rates are the problem (below).
- **fractional-executive-rate-calculator:** I re-solved the page's own example under IRS self-employment tax rules.
  - The tax is 15.3% of 92.35% of net earnings, with the 12.4% Social Security part applying only up to $184,500 in 2026, plus 0.9% above $200,000.
  - Revenue needed is $295,829.62, a day rate of $2,009.71 over 147.2 sold days.
  - The tool charges a flat 7.65% on all revenue and gives $303,194.37 and $2,060, which is 2.5% high.

## The number

**0 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 447 now meet it (Wilson 95% interval 6% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/asphalt-sealcoat-bid-calculator | 2 | 2 | 2 | 3 | 1 | 2 | 2 | no |
| ventures/fractional-executive-rate-calculator | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |

Against the code as it was audited, the tests caught 7 of 13 seeded bugs:

| subject | seeded bugs caught |
|---|---|
| asphalt-sealcoat-bid-calculator | 4 of 6 |
| fractional-executive-rate-calculator | 3 of 7 |

## Each subject

**asphalt-sealcoat-bid-calculator.** The reviewer is a pavement-maintenance contractor who bids sealcoating, crack fill and striping. All 118 tests pass, and a Chromium walk at 375 px computed, printed a proposal with no cost lines and had no horizontal scroll. The gaps:

- **High:** second-coat coverage is fixed at 110 to 125 sq ft/gal and has no field. SealMaster's PMCTS and PMM data sheets give one rate for every coat, 70 to 82 sq ft per gallon of mixed material. At that rate the default two-coat driveway needs 19.5 to 22.9 gal, not 15.6, and is priced at $397.71 to $419.51, not $371.93. Changing the presets moves every published example, so this is listed under "Known gaps" in the README for a fix session.
- **High:** the comparison page stated facts about Bitumio, a named competitor, without citing a source. That included "a free tier", which third-party listings disagree on: GetApp lists a free plan, while Software Advice and Krowdbase list only a trial. It also said "its own marketing describes" for features that came from those listings. **Fixed in this PR:** the free-tier claim is gone, and the description now says it comes from the Capterra and GetApp listings read on 2026-11-26. A test now fails if the old wording comes back.
- **Medium:** a surface set to 0 coats still billed a full first coat (8.89 gal). **Fixed in this PR**, with a test that fails on the old code.
- **Medium:** the comparison page said this tool takes "waste", and the README said "every coverage figure is editable". Neither is true. **Both fixed in this PR.**
- **Medium, still open:**
  - The page adds the handicap stencil to any job with stalls, and the user cannot turn it off.
  - The flat-price page publishes $988.99 for a lot that the tool itself prices at $1,031.17, because its test builds the input without that stencil.
  - Neither coverage nor price per gallon says whether it means concentrate or mixed material.
- **Low:** the minimum-hours boundary and the sand mix-time term had no test (two mutants survived); both tests are added in this PR. "Needs one coat" on the flat-price page, where its example uses two, is corrected.

**fractional-executive-rate-calculator.** The reviewer is a US fractional CFO pricing their own engagements. All 25 tests pass, and the day-rate arithmetic reproduces exactly. The gaps:

- **Medium:** payroll tax is a flat rate on all revenue, business costs included, with no Social Security wage base. The day rate comes out 2.5% high for the example and 3.4% high for a $300,000 CFO. This is listed under "Known gaps" in the README. The page note now says the 7.65% applies only up to the wage base and that the field overstates the tax above it.
- **Medium:** a cleared or zero "share you expect to sell" silently became 100%. The page then showed $1,648 a day over 184 days instead of flagging the input. **Fixed in this PR:** only a missing value defaults to 100%, and an explicit 0 gives the "No billable days left" finding. A test fails on the old code.
- **Low:** four mutants survived: the daily-pay divisor, the 1.5x multiple threshold, the client-concentration threshold and the sold-share fallback. Tests for the first, second and fourth are added. The client-mix table was 2 px wider than a 375 px screen; it now fits (scrollWidth 375). The "1.5x the employee's daily pay" rule of thumb is still uncited.

## What changed since the last round

Round 114 also found 0 of 2 at the bar, and the sampled share is unchanged at about 9%. Both subjects show the pattern earlier rounds keep finding. The arithmetic matches the author's own tests, but a constant or rule from outside the code is off: here a coverage rate the manufacturer's sheet contradicts, and a tax with no wage base. Tests the author writes check what the author believed, so neither one failed. The competitor page had a second version of the same gap. Its test comment recorded where the facts came from, but the page a reader sees cited nothing.

*Scores are an agent's audit against the rubric above, with every check listed in the audit files; they are not a professional certification. Nothing here is tax, legal or engineering advice.*
