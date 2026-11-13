---
title: "Quality audit round 68: 1 of 4 at the bar, and a robot-cost headline that drifted from its own results"
seo_title: "Quality audit 68: law firm realization, quote margin, robot cost"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "1 of 4 sampled subjects meets the bar: a quote margin checker. Every number recomputed matched; tests, stale headlines and unstated assumptions did not."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-n` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-n`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**1 of 4 sampled subjects meets the bar.** Across every sampled audit, 32 of 286 now meet it (Wilson 95% interval 8% to 15%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/law-firm-realization-rate-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| ventures/quote-margin-check | 3 | 3 | 3 | 3 | 3 | 3 | 2 | **yes** |
| research/buildbot-cost | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/capture-kit | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |

All four scored 3 on correctness: every output the auditors recomputed matched. The subjects fell short elsewhere. Their own tests caught 8 of the 20 seeded bugs: 2 of 5 (law firm), 3 of 5 (quote margin), 1 of 4 (buildbot-cost) and 2 of 6 (capture-kit). In the two research projects, the claims said more than the model supports.

## The subjects

**law-firm-realization-rate-calculator.** The reviewer is a billing partner or legal operations manager who runs timekeeper productivity, unbilled time and receipts reports. On the shipped five-person example, standard value is 2,401,000, billed 2,042,000 and collected 1,824,000. That gives realization 85.05%, collection 89.32% and yield 75.97%. Lockup is 31.92 days of unbilled time plus 67.92 days of receivables, and the target needs 8,563.6 hours. The tool gives the same figures, and I re-ran the arithmetic myself. The dollar value of one point of realization was slightly off: 21,445.73 against 21,446.74, because it used the collection rate after rounding. The worst gap is a refusal. If any timekeeper collected more than they billed, the tool will not calculate. On a period report that happens whenever old receivables get paid. Three of five seeded bugs survived, including inverting the finding that says whether the loss happens before or after the invoice. The README also called the usage counters opt-in when they are on unless the user opts out.

**quote-margin-check.** The reviewer is a small-business controller or agency estimator. Every figure checked by hand matched: effective rate 54.86, target price 3,105 and a 10% discount ask of 2,160 − 480 = 1,680 over 35 hours = 48.00/h, which needs 12.6 hours cut. A parity test holds the browser and the command-line version to the same numbers. This is the one subject at the bar. Its domain score is 2. A tool named for margin never reports a gross margin or markup percentage. Fees that scale with the price can only be entered as a flat amount. A 10% platform fee entered that way gives a target of 3,345, where grossing up gives 3,450. The two seeded bugs that survived were both exact-zero boundaries.

**buildbot-cost.** The reviewers are an equipment-cost estimator and an operations researcher. The experiment reproduces byte for byte. An independent 200,000-draw run gave 0.148 and 0.0040 for P(saves money), against the reported 0.151 and 0.004. The G1 break-even was checked by hand: 37.856 / (2.667 + 1.6 + 0.3 × 37.856) = 2.42. The headline had drifted from the results file. It said the H1 ceiling was $1,237 (0.19%), the best draw $226 and the scope 48 hours. `results.txt` says $1,217 (0.18%), $222 and 46.4 hours. The ownership rate leaves out the cost of capital, which standard equipment costing includes. At 10% a year on 0.6 of the price, the H1's break-even slowdown falls from 1.07 to 0.93, below human speed. Three of four seeded bugs survived, including one that lets out-of-reach tasks count as robot hours.

**capture-kit.** The reviewers are a documentary camera operator and an operations researcher. An independent brute force reproduces all 16 table rows and the 5 kg kit: 4,970 g, 18 shots, (176 Wh) / (10.5 W) = 16.76 h. The numbers are right for the model. The model disagrees with itself, though. Recording hours assume every mounted camera runs at once, while shot variety assumes cameras are swapped between mounts. With one camera running at a time, the 4 h floor no longer changes the winning kit. That undercuts the finding that "the floor is not a detail." The headline says a greedy packer stalls at 12 shots. That is true only of a naive greedy. A greedy that adds a body and a lens as one item matches exact search at every budget the auditor checked. Mount payload is not modelled: a 150 g mini tripod is counted as holding a body with a 70-200 lens. Fitness is 1, because a camera operator would not pack by this model as it stands.

## What was fixed in the same PR

The scores above are from before these fixes. A later round re-audits.

- **law-firm-realization-rate-calculator:** the value of a realization point now uses the unrounded collection rate. The sample test pins the top-leak share and the finding about where the loss happens, which kills two mutants that had survived. The README's usage wording now matches `usage.mjs`. Known gaps lists the refusal on collected above billed.
- **quote-margin-check:** tests in Python and JavaScript pin the two exact-zero boundaries. I confirmed that the `cost_coverage >= 0` mutant is now caught. The stale "not yet deployed" sentence is gone. Known gaps lists margin %, price-scaled fees and staff labour.
- **buildbot-cost:** the headline and `project.json` now match `results.txt`. A test pins the eligible hours, and the eligibility-filter mutant is now caught. Limitations lists the missing cost of capital and prior work, and the "average house" wording is corrected.
- **capture-kit:** the README corrects "2 and 4 kg" to "2, 3 and 4 kg". Limitations now discloses the camera-use mismatch, the naive greedy baseline, the missing mount payload and the battery pooled at 100% efficiency. A two-camera hours test was added.

## Not yet done

- The research headlines still stand as written. capture-kit's greedy finding and buildbot-cost's break-even both need a model change and a rerun, not a wording fix.
- The law-firm tool still refuses collected above billed, and the quote checker still reports no margin percentage.
- No auditor could load `marisstella.app`, bls.gov or the NAHB site through the proxy. Nothing was checked against the served pages, and the BLS and NAHB inputs were checked only against figures already in the repository.
