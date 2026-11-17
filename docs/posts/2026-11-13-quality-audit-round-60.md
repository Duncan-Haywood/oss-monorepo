---
title: "Quality audit round 60: 0 of 4 at the bar, and a Turo calculator that overpaid most US hosts"
seo_title: "Quality audit 60: Turo host share, delivery refunds, rare failures"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A Turo payout tool applied a nine-market booking-window table to every US host, overstating a $350 trip by $35."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-f` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 59 had already used seeds `2026-11-13` to `-e`, so this one took `-f`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 254 meet it (Wilson 95% interval 9% to 17%). All four subjects are finished (completeness 3). As in round 59, all four miss on verification: in every one, at least one seeded bug in core logic got past the tests.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/turo-host-payout-calculator | 2 | 3 | 2 | 3 | 1 | 2 | 2 | no |
| ventures/restaurant-delivery-commission-analyzer | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/stop-twin | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/garment-wearwrong | 3 | 3 | 1 | 3 | 2 | 1 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| turo-host-payout-calculator | 2 of 4 | 3 of 5 |
| restaurant-delivery-commission-analyzer | 4 of 7 | 5 of 8 (2 fail, 1 partial) |
| stop-twin | 1 of 5 | 5 of 5 |
| garment-wearwrong | 0 of 4 | 5 of 5 |

The tests caught 7 of 20 seeded bugs, fewer than round 59's 12 of 21. Again the two research projects reproduce their numbers exactly, and both products get the arithmetic right and the inputs wrong. stop-twin's `results.txt` came back byte for byte in 97 seconds. garment-wearwrong's came back in 4.

I changed one auditor's score. The stop-twin auditor gave claims a 3, but two of its own claim checks were partial. The README also cites Chow and Robbins (1965) as the classical method while showing a rule fail that Chow and Robbins' own rule does not. I set claims to 2 and wrote the reason into the file. The verdict does not change, because verification already fails.

## Verdicts and worst defects

### ventures/turo-host-payout-calculator (correctness 2, claims 1)

The reviewer is an experienced US Turo fleet host. Every one of the 12 host-share cells (plan by booking window) and all three damage caps ($250, $1,500, $2,750) match Turo's own help center as of today. Mileage, late-return and additional-usage fees are split at the host share, as Turo's rule says.

**The worst defect (high, domain rule):** Turo uses that booking-window table only in nine markets: Austin, Dallas, Detroit, Las Vegas, Maui, Philadelphia, Phoenix, San Diego and Seattle. Its "Earnings and host share" page says so under "Variable host share in select US markets". Everywhere else in the US the share is a flat 70%, 80% or 90%, set by the plan. The tool applied the table to every host and never mentioned markets. I fetched the page and re-ran the auditor's check: for a host outside those nine markets, only 3 of the 12 cells were right. A Balanced-plan trip of $350 booked 30 days ahead showed $315.00; Turo pays $280.00. The README, the page, the guide, `llms.txt` and the FAQ markup all said the share "now depends on" the booking window.

**Fixed in this PR:**
- The page asks where the car is listed, and defaults to "most US markets". The flat share is used unless you pick a variable-share market. Outside those markets, the booking-window table now says plainly that every window pays the same.
- Every page that described the matrix now says where it applies.
- A new test pins all 12 cells, the three flat rates, the three caps and the market list to the values on Turo's page. The two seeded bugs that had survived (a Peace of Mind cell, and the Peace of Mind cap) now fail the suite.
- So does removing the market check.

**Still open** (README, "Status"): delivery and Extras income, which Turo also splits at the host share, cannot be entered yet.

### ventures/restaurant-delivery-commission-analyzer (correctness 2, verification 2)

The reviewer is a restaurant operator or bookkeeper who reconciles delivery payouts every month. On a clean sheet the arithmetic is right. A $40 DoorDash Plus order at the published 25% gives a 25.0% take rate and $17.20 left after a 30% food cost and $0.80 packaging. Pickup at 6%, Uber Eats Lite at 20% and the own-ordering net at Stripe's 2.9% + 30¢ all match the platforms' own pricing pages. Grubhub's fee page shows its rates only as images, so no Grubhub figure was recomputed.

**The worst defect (high, logic error):** every amount passes through `Math.abs` (`calc.mjs:208`). A $6 error charge followed by its +$6 reversal is counted as $12 of charges. A refund row with subtotal −15 adds $15 of food sales and an extra order. The page does say charges are read as costs whatever their sign, but any month with refunds or adjustments comes out wrong. The fix needs sign detection per column and refunds kept apart from orders. That is too big to make safely in an audit round, so it is in the README's new "Known gaps". So are three more issues:
- Fee columns that match no known column name are ignored without a notice.
- Pickup and delivery orders are blended into one rate per platform.
- Three seeded threshold bugs survived the tests.

### research/stop-twin (verification 2, claims 2)

The reviewer is a statistician who reviews simulation-methods papers. Every number the auditor recomputed matches:
- the negative-binomial moments;
- the closed-form exact interval, computed from beta quantiles;
- exact coverage of 0.95001 by summing the pmf;
- the planning table.

I re-ran the exact-coverage script myself and got 0.95002 and 0.95001, and upper-to-lower ratios of 3.561 and 2.057, the paper's figures.

**The worst defect (medium, research design):** the "sequential Wald" rule the note shows failing is the naive plug-in rule. Chow and Robbins (1965), whose paper the README cites, add +1/n to the variance estimate. That term stops their rule from halting on zero failures: in an exact run at p = 10⁻³ it stops on zero failures in 5.5 × 10⁻⁵ of runs, and its interval covers p in 94.2% of runs. The note never says this, so a reader comes away thinking the classical method fails. The nearest prior work on inverse sampling (Best 1974; Mikulski and Smith 1976; Dagum, Karp, Luby and Ross 2000) is not compared.

**In this PR:**
- The whitepaper's limitations and a new README "Known gaps" section say both things.
- Two tests pin the exact interval to the beta-quantile values and the inverse sampler's mean. Three of the four surviving mutants now fail the suite: the `n − 1` in the upper limit, the `α/2` split, and the +1 per gap. I re-ran them to check.
- The README's coverage wording and run time are corrected.

### research/garment-wearwrong (verification 1, fitness 1)

The reviewer is a thermal-comfort researcher who reviews for Building and Environment. The project is reproducible and its arithmetic is right. An independent brute-force implementation and three hand-derived closed forms match every number checked.

**The worst defect (high, overclaim):** the headline said that at a $50 budget the pair's edge is "negligible (+0.009 C) either way". In the project's own `results.txt`, section A shows that under random wrong picks the $50 edge grows to +0.184 C at a 30% error rate, 20 times the headline figure. I checked the rows. All four seeded bugs survived the tests, which only checked inequalities. The test that claimed to guard against duplicate garments diluting errors could not fail.

**Fixed in this PR:**
- The headline gives the $50 figures under both error models.
- A test pins the core expectation to hand values, under both error models.
- A duplicate-garment check that can fail replaces the claim. On my first try the duplicate was a copy of the best option, which counts as right under the tie rule, so the check could not fail either. The seeded mutant caught that, and I fixed it.

Still open:
- No prior work on noisy choice (random utility, quantal response) or on clothing behaviour is cited.
- The break-even tolerance is still untested.
- The project is one 55-line module, far from the publishable bar the research guide sets.

## What changed since round 59

The sampled share is flat at 31 of 254. Verification is still the gate that binds: it failed in all four subjects this round, as it did in all four last round. Of the 20 bugs seeded this round, 13 got past the tests. After this PR's new tests, 8 of those 13 fail the suite: both in turo-host-payout-calculator, three in stop-twin and three in garment-wearwrong. The five left are the restaurant analyzer's three threshold bugs, one stop-twin mutant and garment-wearwrong's break-even tolerance. The pattern holds across rounds: the arithmetic is usually right, and the tests check properties, not values. A test that compares a few outputs against a figure from an outside source catches the bugs that survive.
