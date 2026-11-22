---
title: "Quality audit round 97: 0 of 4 at the bar, and a bonus calculator that skipped the 37% rule"
seo_title: "Quality audit 97: a bonus tool that skipped the 37% rule"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A bonus tool withheld 22% on a $1.5M bonus where the law says 37%, and two research headlines outran their runs."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-h-c712` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `bonus-take-home-gross-up-calculator`, `consignment-markdown-planner`, `simdesign-robustmove` and `energy-store-hx`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects, none audited before. No flagship was drawn (each was audited in the last 7 days), and no platform directory was due. Before accepting each auditor's file I reran one of its findings myself. One of those reruns corrected the auditor:

- **bonus-take-home-gross-up-calculator:** the gross-up for $1,000,000 net, with $200,000 of regular wages already paid. No Social Security is left, so net = g × (1 − 0.0145 − 0.009 − 0.05 − 0.37) + $1M × (0.37 − 0.22). That gives g = 850,000 / 0.5565 = **$1,527,403**. The auditor's file said $1,581,312. That figure only holds if the $200,000 already paid was itself bonus pay, so I corrected it in the file. The defect itself stands.
- **consignment-markdown-planner:** "never mark down" for the designer silk blazer. Each week it is still on the floor is worth 0.4 × $120 × 0.08 − $0.60 = $3.24. Over 12 weeks at a 92% weekly survival that is 7.904 weeks, so 3.24 × 7.904 − $2 handling = **$23.61**. The CLI prints $23.61.
- **simdesign-robustmove:** I reran 60×20, filter radius 3, at move limits 0.19 and 0.18. The blueprint compliances were 476.6 (a failure) and 201.2 (a pass). The same non-monotone pattern the auditor found.
- **energy-store-hx:** I reran the break-even exchanger price with the upstream store rule corrected (`accounting="steady"`). Weekly cycling at a 45 °C sink gave 541, 563, 610, 203 and 490 EUR/kW for 2015 to 2019. The published figures are 211, 241, 274, −242 and 123.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 397 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/bonus-take-home-gross-up-calculator | 2 | 3 | 3 | 2 | 2 | 3 | 2 | no |
| ventures/consignment-markdown-planner | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/simdesign-robustmove | 3 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/energy-store-hx | 1 | 3 | 2 | 3 | 2 | 1 | 2 | no |

Against the code as it was audited, the tests caught 14 of 27 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| bonus-take-home-gross-up-calculator | 4 of 5 |
| consignment-markdown-planner | 3 of 7 |
| simdesign-robustmove | 3 of 9 |
| energy-store-hx | 4 of 6 |

All four miss on claims. Every subject said at least one thing its own files do not back.

## Each subject

**bonus-take-home-gross-up-calculator.** The reviewer is a payroll specialist. Everyday arithmetic is exact. That covers the Social Security cap against wages already paid, the 2026 wage base of $184,500, the 0.9% Additional Medicare with no employer match, 401(k) deferrals still owing FICA, and the gross-up net / (1 − sum of rates). For example, $10,000 net at the defaults needs $15,302.22.

The worst defect is high. IRS Publication 15, section 7, makes 37% withholding mandatory on supplemental pay over $1,000,000 in the year, and the tool had no such rule. A $1.5M bonus at the labelled "22 is the flat supplemental rate" withheld $330,000 federal instead of $405,000, so it overstated take-home by $75,000.

Two medium defects:

- When no gross bonus can reach the target (a 100% deferral, or withholding rates that add up to 100%), the gross-up printed 6.43e64 as a dollar amount.
- A cleared box silently ran at the example value.

**consignment-markdown-planner.** The reviewer runs a resale consignment shop. The maths is right: an independent brute force over all 1,820 non-decreasing 12-week schedules reproduced every fixture number. Two medium defects:

- The explainer page was titled "30/60/90-day schedule math", but the fixed rule the planner compares against is a two-step 30/60 rule (25% off from week 5, 50% from week 9).
- The slow-season re-check, the weekly sell cap and the take-it boundary had no tests. Removing any one of them left every test green.

Two medium defects remain:

- **Lift default:** the advice hinges on an uncited lift of 0.35 per 10% off. With it, five of the six items the planner says to take are told to go below their tag from week 1.
- **Unsold items:** an item still unsold at the end of the term is worth $0, with no return to the consignor modelled.

**simdesign-robustmove.** The reviewer works on robust topology optimisation (the eroded, blueprint and dilated designs of Wang, Lazarov and Sigmund 2011). Every 60×20 row reran identically. The auditor's own finite-element solver matched the table exactly: 1347.3, 741.88 and 474.09 for the failing r = 3 run.

The worst defect is high and sits in the headline: "the cause is the move limit of 0.2". Extra runs are not monotone in the move: 0.25 fails, 0.21 passes, 0.19 fails, 0.18 passes, 0.15 fails and 0.12 passes. At 0.2, one more iteration per β step rescues the run and one fewer fails it. So above about 0.15 the outcome depends on the trajectory, and no single threshold decides it. What does hold is the practical advice: all 13 extra runs at moves of 0.12 or below passed. Six of nine seeded bugs survived, including changing the penalty used to evaluate every reported compliance.

**energy-store-hx.** The reviewer designs discharge heat exchangers for sand and packed-bed thermal stores. The exchanger cost arithmetic checks out against a textbook capital recovery factor: 0.0536 + 1.075% upkeep, × 500 EUR / 10,000 kWh = 0.00322 EUR/kWh.

Correctness scores 1 because every result inherits a store-pricing rule that was corrected upstream on 2026-11-18, and the README did not say so. Under the corrected rule the break-evens are two to four times higher, and the headline "2018 never wins, even with a free exchanger" is false (203 EUR/kW).

Fitness scores 1 for two reasons:

- The README calls the exchanger "a small item". The hard part is the sand side: dry sand conducts about 0.27 W/m K.
- No prior work on storage break-even costing is cited.

## What this round fixed

All fixes are in PR #18313. Each defect it fixed carries `fixed_by` in its audit file. Scores stay as audited, and a later round re-audits.

- **bonus-take-home-gross-up-calculator:**
  - Supplemental pay past $1,000,000 for the year is now withheld at 37%, with a new box for bonuses already paid this year. The page says so and names the amount at 37%.
  - A gross-up with no answer returns nothing and the page says why.
  - A blank box stops the run and names the box.
  - I checked all three in a headless browser: $405,000 federal on a $1.5M bonus.
  - New tests pin the 37% split, both gross-ups past $1M, the no-answer cases and the surviving Additional Medicare mutant.
- **consignment-markdown-planner:**
  - The explainer, its FAQ, the index link and `llms.txt` now say 30/60, and the FAQ spells out the rule.
  - New tests cover the slow-season scale, the sell cap and break-even acceptance. All three of those surviving mutants now fail.
  - A fractional `--weeks` value is refused with a message instead of crashing.
- **simdesign-robustmove:** the README headline, results, limitations and next steps now state the non-monotone finding under a "Correction", and so do the research index line and the homepage summary. A pinned small run kills the penalty and blueprint-value mutants.
- **energy-store-hx:** a "Known gap" banner gives the corrected figures, in the README, the project card and the research index. A test keeps the banner in place while the old rule is pinned. The upstream discharger upkeep figure is noted in the inputs table, and a wrong annuity comment is fixed.

Still open:

- energy-store-hx needs a real rerun with the corrected rule, a sand-side heat-transfer model and prior work.
- simdesign-robustmove has one run per cell and no comparison with MMA.
- The consignment planner's lift default is uncited.
- The bonus calculator still clips negative inputs to zero.

## What changed since the last round

Round 96 also scored 0 of 4, and its two research subjects also missed on a headline the runs did not support. This round has the same pattern. A research project here reports one deterministic run per cell, or inherits a number from a sibling project, and the README states the result as a cause. Both research fixes this round are disclosures, not new results. Each now names the experiment that would settle the question.
