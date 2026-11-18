---
title: "Quality census: a photo importer that skipped new photos with old names, and 0 of 6 at the bar"
seo_title: "Quality census 2026-11-17-7528: six first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six first audits, none at the bar. Worst: a Photos importer marked a new DSC00002.JPG imported, never sent, because an old one had the same name."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-7528`). Census sweeps subjects nobody has audited yet, so these scores are left out of the sampled share. That share is still **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file holds every check and every seeded bug. All scores were set before any fix. For each subject I reran the auditor's headline recomputation myself before accepting the audit; all six reproduced.

## The number

**0 of 6 meet the bar. Five of six are finished** (completeness 3). The sixth, photos-import-tools, is not. Across the six, their own tests caught **17 of 35** hand-seeded bugs. Verification failed the gate (scored 1 or 2) in all six. Claims failed in four.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/photos-import-tools | 1 | 2 | 2 | 2 | 1 | 2 | 1 | no |
| ventures/eu-packaging-regulation-checker | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/print-on-demand-profit-calculator | 3 | 3 | 2 | 3 | 3 | 3 | 2 | no |
| research/marine-detect | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/robofab-cell-monitor | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/accel-nsgatune | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Coverage: 371 of 2,485 subjects have now had at least one audit (14.9%).

## The subjects

**ventures/photos-import-tools (correctness 1; three high defects, two fixed).** The card-offload half holds up. Its SHA-256 manifest matches coreutils `sha256sum`, and `--verify hash` catches a single flipped byte that the default size check misses. The importer half does not hold up. On every `run`, before importing, it marked a file imported if any photo already in the Photos library had the same file name. Camera counters roll over at 9999, so names repeat. With osascript mocked, a card of DSC00001 to DSC00003 against a library that already held an older DSC00002.JPG sent only two files to Photos. The run still printed "Complete: imported=3" and exited 0. `verify` then passed, so a user who wiped the card would lose the photo. That match now runs only with `--photos-preflight`, and a test that fails on the old code covers it. The page's promise that it is "safe after Ctrl-C or a Photos.app timeout" is reworded. Still open: an interrupted batch is retried with Photos' duplicate check turned off. A denied Automation permission marks every file skipped and exits 0. The watchdog's 900 s stall limit is shorter than the worker's own 1,860 s batch timeout.

**ventures/eu-packaging-regulation-checker (correctness 2; one high defect, open).** The dates that legal summaries agree on all check out: 12 August 2026 for the PFAS limits and producer registration, 2029 for deposit-return, 2030 for the design duties. The day counts are right too (634 days to 12 August 2028). The worst gap is the reuse target, 40% from 2030. The tool shows it only for transport packaging and only to producers, importers and distributors. E-commerce packaging and online sellers never see it, so the tool's own worked example, a non-EU seller of plastic mailers, shows no reuse duty. It also gives the target to cardboard boxes, which the reuse article excludes. The deposit-return exemption was described as "90 percent already met". The Regulation's exemption is a Member State that reached 80% in 2026 and has a plan. That is fixed here, with a test. The EUR-Lex text was blocked through this session's proxy, so the dates rest on secondary legal summaries. The audit file names them.

**ventures/print-on-demand-profit-calculator (verification 2; correctness 3).** The Etsy, Shopify and eBay presets match the published rates. The sample shirt recomputes by hand to $3.7489 in fees, $5.89 profit and a $35.44 price for a 30% margin. eBay's per-order fee was always $0.40, even though the tool's own note says that rate applies to orders over $10. Orders of $10 or less pay $0.30. That is fixed here, with tests, and the target-price solve uses the lower tier. Still open: Etsy's $100 cap on the Offsite Ads fee, and the fact that both platforms charge fees on sales tax.

**research/marine-detect (verification 1).** The training data host was blocked, so the auditor rebuilt every headline number from the per-object records the project committed. All of them match, for example 22.6% large-object recall at fog transmission 0.15. But obstacles are labelled with scipy's default 4-connectivity and no minimum size. A diagonal pole becomes a run of one-pixel "obstacles". 80 of the 204 test obstacles are single pixels. The lead claim, that the network "misses most floating obstacles", rests on that count. The README now says so and points to the 16-pixel-and-up figure (60%, n = 31). An unbacked claim about a seed rerun is removed. Re-scoring needs the dataset. Five of six seeded bugs survived the tests.

**research/robofab-cell-monitor (verification 1; correctness 3).** The experiment reruns byte for byte in 10 seconds. The auditor's own simulation, written from the README alone, agrees with it at five of six settings. The "exact upper bound", though, is computed at the mean print time, while every run draws print times with a coefficient of variation of 0.3. At two printers with a camera, the simulation beats it: 2.321 ± 0.012 parts an hour against 2.289. The README now calls it a capacity estimate, not a strict bound. It also says "understates" where it said "overstates", and gives the runtime as 10 s, not 1 min. Four of five seeded bugs survived. No queueing or print-failure-detection prior work is cited.

**research/accel-nsgatune (claims 2; correctness 3).** The auditor rebuilt the exact Pareto fronts (41 and 33 designs) from the raw data without the author's search code. The hypervolumes match to six decimals. On 60 fresh seeds, the main finding holds: the original mutation rate of 0.25 was under-tuned. The headline "crossover matters little" did not match the project's own table. At 200 µs, population 40, mutation 0.1, crossover finds 0.663 of the front against 0.486 without it (Welch t about 6.2). The README and the research page now say the effect is sizeable and changes sign with the deadline. Mean differences are still judged against the per-seed standard deviation rather than the standard error.

## What the six have in common

The arithmetic mostly holds: three of six score 3 on correctness. What fails is the step from the numbers to the sentence that sums them up. A bound called exact that the simulation beats. "Crossover matters little" against a t of 6. "Safe after a timeout" when the retry turns duplicate detection off. "Misses most obstacles" counted over one-pixel fragments. Four of six fail the claims gate this way. The tests have the matching blind spot: 18 of 35 seeded bugs survived, and the survivors were usually in the line a headline depends on.

## Fixed in this round

Fixed in [PR #16798](https://github.com/Duncan-Haywood/oss-monorepo/pull/16798). Each code fix has a test that fails on the old code. The scores above stay as audited, and a later re-audit will check them.

- photos-import-tools: matching library file names during `run` now needs `--photos-preflight`, and the page copy no longer promises no duplicates after an interruption.
- print-on-demand-profit-calculator: the eBay per-order fee is $0.30 on orders of $10 or less.
- eu-packaging-regulation-checker: the deposit-return exemption is stated correctly, and a "false" done marker no longer counts as done.
- marine-detect, robofab-cell-monitor, accel-nsgatune: headline claims now match their own data.

The larger defects are listed under "Known gaps" in each subject's README, linked to its audit file.
