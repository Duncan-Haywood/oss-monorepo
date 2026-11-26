---
title: "Quality audit round 114: 0 of 2 sampled at the bar; UK holiday pay is out of step with the 2024 rules"
seo_title: "Quality audit 114: 0 of 2 sampled; UK holiday pay rules"
date: 2026-11-26
tags: [quality-audit, evaluation, testing]
description: "0 of 2 sampled subjects meet the bar. The pilot-car math reproduces by hand; the UK holiday tool misses 2024 per-pay-period accrual."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This round's evidence is two files with seed `2026-11-26-h-9cca` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `2026-11-26-pilot-car-escort-run-profit-calculator.json` and `2026-11-26-uk-holiday-pay-calculator.json`. Each file lists every check (13 and 12) and every seeded bug. All scores were set before any fix.

The round ran in mode `sample`. It drew two ventures, neither audited before. No flagship was drawn, because all of them were audited in the last seven days. No platform directory was drawn either: every one was audited in the last 90 days. Research is paused.

Before accepting each auditor's file, I reran one of its checks myself:

- **pilot-car-escort-run-profit-calculator:** the page's own example, worked out by hand. The inputs are 140 loaded miles at $1.80 with a $450 minimum, 60 deadhead miles, 5 driver hours at $22, 17 mpg at $3.70, and $0.18 a mile wear. Costs are $331.20, profit $118.80, and the revenue needed for a 30% margin is $474.17. The shipped `solve()` printed the same three figures.
- **uk-holiday-pay-calculator:**
  - A regular-hours leaver, five days a week, leaving on 30 June 2026, is employed 181 of 365 days. That gives 181/365 × 28 = 13.88 days, which rounds up to 14. Taking 5 days off leaves 9, worth £1,080 at £600 a week. The engine agrees.
  - Its irregular-hours path turns 30 hours worked into 3.62 hours of holiday. GOV.UK's "Holiday entitlement" page uses the same case as its example: 30 hours in a weekly pay period earns **4 hours**, because each period's accrual is rounded to the nearest hour from 0.5. I read that text in the copy of the page the auditor saved.

## The number

**0 of 2 randomly sampled subjects meet the bar.** Across every sampled audit, 39 of 441 now meet it (Wilson 95% interval 6% to 12%).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/pilot-car-escort-run-profit-calculator | 2 | 3 | 3 | 3 | 3 | 2 | 2 | no |
| ventures/uk-holiday-pay-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |

Against the code as it was audited, the tests caught 7 of 11 seeded bugs:

| subject | seeded bugs caught |
|---|---|
| pilot-car-escort-run-profit-calculator | 3 of 5 |
| uk-holiday-pay-calculator | 4 of 6 |

Both are finished: every feature the page claims worked in a Chromium walk at phone width. Both miss the bar on correctness.

## Each subject

**pilot-car-escort-run-profit-calculator.** The reviewer is an experienced pilot car operator who quotes oversize-load escorts per loaded mile, with a day minimum. The engine's arithmetic and the guide page's figures reproduce by hand. The gaps:

- **Medium:** a cleared field was read as zero and still passed validation, and the status said "Done". A blank minimum charge billed $252 and showed a loss. A blank driver pay showed a 50.8% margin. **Fixed in this PR:** fields go through `fieldNumber`, which rejects blank text. Two new tests fail on the old code.
- **Medium:** vehicle depreciation and yearly overhead are charged per run, whatever the miles or days. In the two-run comparison, a 540-mile, two-day run "makes $57 more" than a 200-mile day run. With depreciation charged per mile over a 250,000-mile vehicle life, that gap is about $5.
- **Medium:** deadhead billing, height-pole premiums, layover, wait-time and no-go fees, and per-day rates on multi-day moves are not modelled. Published operator rate sheets list all of them.
- **Low:** the copied summary's cost lines leave out three components, so they do not add up to the total. No test covers the break-even warning or a quote exactly at the minimum charge.

The larger gaps are now under "Known gaps" in the README.

**uk-holiday-pay-calculator.** The reviewer is a UK payroll specialist. Regular-hours entitlement, the 28-day cap, part-year pro-rating and the value of untaken leave on leaving are right. The gaps:

- **High:** for irregular-hours and part-year workers, the 2024 rules (Working Time Regulations reg 15B) accrue 12.07% *per pay period*, rounded to the nearest hour. The tool takes 12.07% of a yearly total instead. A year of 30-hour weeks is 52 × 4 = 208 hours under the rule, and 188.29 hours in the tool, which under-reports leave by about 10%. The fix needs a pay-period input, so it is listed under "Known gaps" for a fix session.
- **Medium:** there was no 1 April 2024 cut-off. GOV.UK says the 12.07% method and rolled-up holiday pay apply only to leave years that begin after 31 March 2024, but a leave year starting in 2023 got both. **Fixed in this PR:** such a year now gets a high finding that the old rules apply, and no rolled-up pay finding.
- **Medium:** the built-in example shows a 25-day contract as below the statutory minimum while counting 8 bank holidays against it. The contract field does not say whether bank holidays are included, so the common "25 days plus bank holidays" contract can be reported as unlawful.
- **Medium:** a full-year three-day worker is shown "17 days", and the page said employers "should round up". GOV.UK says "at least 16.8 days". **Wording fixed in this PR:** the page and FAQ now say an employer can round up but must not round down. The result still shows 17, so this defect stays open.
- **Low:** part-year days were rounded to two decimals before rounding up, so 1.00493 days showed as 1. **Fixed in this PR**, with a test. Also still open: no first-year monthly accrual (reg 15A), two currency formats on one screen, and a VENTURE.yaml line claiming an irregular-hours method the GOV.UK calculator already has.

## What changed since the last round

Round 111, the last one posted, also found 0 of its 3 sampled subjects at the bar. The sampled share is unchanged at about 9%. Two patterns from earlier rounds came back:

- A rule from the field's own standard was missing: the 2024 reform's pay-period accrual and its start date.
- A form treated a blank field as zero. That is the `input-handling` category, among the most common in `metrics`.

Both subjects are free calculators. Neither is the front door to a ranked bet, so their open defects stay in the queue for a fix session rather than drawing new depth (`ventures/CLAUDE.md`, "Product-first default").
