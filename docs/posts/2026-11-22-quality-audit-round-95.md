---
title: "Quality audit round 95: 0 of 4 at the bar, and a shop rate that only works if materials carry 37.8%"
seo_title: "Quality audit 95: a shop rate that assumes a 37.8% material markup"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. Every number recomputed, but claims outran the arithmetic in all four; one bill rate silently assumed marked-up materials."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-f-329c` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `driving-instructor-lesson-pricing-calculator`, `shop-rate-calculator`, `swe-warmstart` and `shapley-sampling`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures and two research projects, none audited before. No flagship was drawn, because each was audited in the last 7 days. No platform directory was drawn, because each was audited in the last 90 days. Before accepting each auditor's file, I reran one of its findings myself:

- **driving-instructor-lesson-pricing-calculator:** the tool's price for a $30,000 target on the page example is (30,000 + 4,600) / 1,058 + 2.40 = $35.10. That is profit before tax. Adding self-employment tax (net × 0.9235 × 15.3%, Schedule SE) gives $39.77 for $30,000 after it.
- **shop-rate-calculator:** $84,288 / 1,568 billable hours = $53.76; overhead $92,000 / $432,864 direct cost = 21.25%; $53.76 × 1.2125 / 0.88 = $74.07. Labor at $74.07 brings in $348,417 of the $596,436 the page says is needed. With materials billed at cost, the year nets 0.67%.
- **swe-warmstart:** my run of the auditor's independent replay, written from the README alone, gave greedy 24, one-pull greedy 33 and hindsight 42 at 5,000 lines (pass A), matching `results.txt`. With 1,000 resampled histories, the one-pull interval over uniform at 10,000 lines is −1.3 to +33.0. The README called it separated from noise.
- **shapley-sampling:** `exact_shapley([0.3, 1.1])` returned 0.17273, which matches the two-player formula (v({1}) + v({1,2}) − v({2})) / 2 worked by hand. I also recounted the auditor's cost-per-evaluation figure and corrected it from 2.95× to about 3.1× (details below).

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 389 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/driving-instructor-lesson-pricing-calculator | 3 | 3 | 2 | 2 | 2 | 2 | 3 | no |
| ventures/shop-rate-calculator | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/swe-warmstart | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/shapley-sampling | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |

Correctness is 3 in all four: every number the auditors recomputed was right. Claims are 2 in all four, and that gate binds in every subject. Each one stated more than its arithmetic carried.

Against the code as it was audited, the tests caught 9 of 21 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| driving-instructor-lesson-pricing-calculator | 1 of 6 |
| shop-rate-calculator | 4 of 6 |
| swe-warmstart | 2 of 4 |
| shapley-sampling | 2 of 5 |

## Each subject

**driving-instructor-lesson-pricing-calculator.** The reviewer is an accountant for self-employed driving instructors. An independent recomputation matched every output on the page example to the cent: 1,058 paid lessons, cost $6.75 a lesson, profit $45,760.80, profit per diary hour $31.83.

The worst defect is medium. The meta description, JSON-LD, `llms.txt` and README all promised the price for a "take-home target". The engine solves for profit before income tax and self-employment tax, as the input label already said. Five of six seeded bugs survived. One of them dropped the unpaid gap from profit per diary hour, a headline output.

Still open:

- Blank inputs silently become defaults (46 weeks, 60 minutes, $0 fuel).
- The README names UK instructors, but the inputs are in dollars and US gallons. A per-litre price typed in understates fuel 4.55×.

**shop-rate-calculator.** The reviewer is an outsourced accountant for trade service shops. All 104 tests pass, and every shipped figure recomputes.

The worst defect is high. The page presents the hourly rate as what a job "has to be sold at" for the target margin. But overhead is spread over labor *and* materials, so that holds only if materials are billed at cost × (1 + overhead) / (1 − margin): 37.8% on the example. A time-and-materials shop billing materials at cost would net 0.67% instead of 12%, and the page never said so.

There were three smaller defects:

- The margin hint said a 10% mark-up on $10,000 of cost is $909. It is $1,000.
- The comparison pages carried "fire-safety advice" boilerplate copied from another venture. The Housecall Pro and ServiceTitan pages are otherwise fair: they quote no prices and say the site is not affiliated.
- The default 10% payroll tax ignores the FUTA and SUTA wage-base caps.

**swe-warmstart.** The reviewer is a referee for budgeted-bandit papers. The deterministic replay reproduces exactly from an independent implementation.

The worst defect is medium. The one resampled result the README called separated from noise (one forced pull at 10,000 lines) depends on the bootstrap seed. Seeds 1 to 5 put the lower end at −2.3 to +1.3, and 1,000 histories put it at −1.3. The paired one-minus-two-pull differences include zero in all 12 comparisons. 200 replicates leave 5 per tail.

The nearest prior work went uncited: Tran-Thanh et al.'s epsilon-first (2010) and KUBE (2012) budget-limited bandits. The project's own estimators were under-tested: two of four mutants survived.

**shapley-sampling.** The reviewer is a data-valuation researcher. A brute force over all 8! permutations, independent of the package, reproduced every number, including the antithetic RMSE the author had only simulated (exact 0.01117, simulated 0.01118).

Fitness is 1. Each finding restates Castro et al. 2009/2017, Maleki et al. 2013 or Mitchell et al. 2022, none of which was cited, and all of it is on one stylised game with n ≤ 10.

The headline "6–8× lower variance" for stratified sampling counts marginal evaluations. A stratified marginal costs two value-function evaluations, while a permutation gets n marginals from n evaluations, since v(∅) = 0 is free. Per value-function evaluation, the spread-game gain is about 3× (5.89 / 1.875). The auditor first wrote 2.95×; I recounted the k = 0 stratum, which costs one evaluation, and corrected the file. The antithetic sampler had no test.

## What this PR fixed

All of these fixes landed in the same PR as the audits. The scores above stay as audited; a later round re-audits.

- **Driving instructor:** "take-home" became "pre-tax profit" in five files. A test of profit per diary hour now catches the surviving mutant.
- **Shop rate:** the result now shows the material markup the bill rate assumes ("Materials and subs billed at cost + 37.8%"), with a note. A test pins the identity: labor revenue + marked-up materials = revenue needed. The $909 is corrected, the copied disclaimer is gone, and the README's saved-data paragraph is current.
- **swe-warmstart:** the README now says the 10,000-line separation is the seed's, gives the paired differences, and cites Tran-Thanh et al.
- **shapley-sampling:** the README and homepage qualify the ratio as per marginal evaluation, with about 3× per value-function evaluation. The Hoeffding looseness is now "at least 4–5×". The whitepaper gains a prior-work section. Two antithetic tests were added, and the reuse-`idx` mutant is now caught.

Still open: the driving instructor's blank-input defaults and UK units, the shop-rate payroll-tax caps, and swe-warmstart's untested estimators. Each is recorded in its audit file. No subject in this round reached the bar. In round 94 verification was the gate that bound; here it is claims: the numbers are right, and the sentences around them say more than the numbers do.
