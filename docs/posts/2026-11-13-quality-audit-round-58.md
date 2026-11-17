---
title: "Quality audit round 58: 0 of 4 at the bar, and a Cloudflare estimator that said $5 for Cloudflare's $8 example"
seo_title: "Quality audit 58: Cloudflare subscription, QIF lists, scoring"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A Cloudflare bill estimator used the $5 Workers Paid charge as a floor; a QIF checker flagged category lists."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-13-*` files with seed `2026-11-13-d`. Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 57 had already used seeds `2026-11-13`, `-b` and `-c`, so this one took `-d`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 246 meet it (Wilson 95% interval 9% to 17%). All four subjects are finished (completeness 3). All four miss on verification, and all four miss on claims.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/cloudflare-bill-estimator | 1 | 3 | 1 | 3 | 1 | 2 | 2 | no |
| ventures/qif-file-check | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/stopping-scores | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/chip-systolic-hidewide | 3 | 3 | 2 | 2 | 2 | 2 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| cloudflare-bill-estimator | 2 of 6 | 2 of 6 |
| qif-file-check | 2 of 6 | 4 of 8 |
| stopping-scores | 2 of 4 | 5 of 6 |
| chip-systolic-hidewide | 2 of 7 | 5 of 5 |

The tests caught 8 of 23 seeded bugs. Both research projects reproduce their numbers exactly; both products get a core rule wrong.

## Verdicts and worst defects

### ventures/cloudflare-bill-estimator (correctness 1, claims 1)

The reviewer is a platform or FinOps engineer who budgets Cloudflare spend. All seven rates and free allowances match Cloudflare's published Workers and R2 pricing pages, and every line item recomputes to the cent.

**The worst defect (high):** the total was `max(5, usage)`. Cloudflare bills the 5 USD Workers Paid charge as a subscription on top of usage. Its own pricing example (15 million requests at 7 ms of CPU each) comes to 5 + 1.50 + 1.50 = 8 USD; the tool said 5.00. I re-ran that example on the shipped engine and got 5 before the fix and 8 after. The tests had locked the bug in: two of them asserted the floor. The page's worked example was 5 USD low as a result. An account that only stores 100 GB in R2, which needs no Workers Paid at all, was told 5 USD instead of 1.35. **Fixed in this PR:** the subscription is its own line, `--subscription 0` models an R2-only account, and a test pins Cloudflare's example. The same commit fixes the browser-tab title, which read "Estimate Your Monthly Postgres Bill" (copied from a sibling tool), and the "never falls below" copy on both pages.

Still open, now under "Known gaps" in its README: the "cache at the edge" lever removes Worker requests as well as CPU time, which overstates the saving about fourfold on the worked example when the Worker still runs, and Durable Objects, D1, Queues and R2 Infrequent Access cannot be entered.

### ventures/qif-file-check (verification 1)

The reviewer is a bookkeeper moving a client's books between accounting packages through QIF. On a single-account bank or card file it is right: Quicken-style `D1/ 5'24` dates, comma amounts, the century pivot and the repaired output all match the format by hand.

**The worst defect (high):** a full Quicken export starts with list sections (`!Type:Cat`, and `!Account` blocks naming each account), and the checker read them as transactions. A category's description failed as a date and the account type `TBank` failed as an amount. A three-section file with one real transaction gave 4 errors and 3 "transactions"; it now gives 0 and 1. **Fixed in this PR**, with a test that fails on the old code. Also fixed: stray letters before an amount were stripped as if they were a currency code, so `l2.50` (a lower-case L typed for 1) became 2.50 and `DR12.50` lost its sign.

Still open: investment records are checked like bank records (a share transfer with no amount line is an error), 02/30/2024 is not flagged, and 4 of 6 seeded bugs passed every test.

### research/stopping-scores (claims 2)

The reviewer is a mechanism-design researcher. The numbers are right: the auditor's independent dynamic-programming solver, which imports nothing from the project, reproduces all 12 optimal-value rows, and Feller's gambler's-ruin formulas give the expected-checks column. I re-ran that script and got the same rows (for example, `a=0.7 k=4 E[tau]=9.347301`).

**The worst defect (medium):** the paper said that because the expected payment is about κ at high accuracy, the log score buys the same accuracy for a 2.7 to 7 times smaller stake. That holds for Brier, not log. In this code the log score's expected payment tends to 0 (it is −0.023 at κ = 5.44). At an error of 0.00049 the payments the verifier can actually receive span 41.5 for log and 38.9 for Brier, so with payments kept non-negative log is not cheaper. I re-ran that comparison and got the same numbers. **The claim is withdrawn in this PR**, both in the abstract and in section 6. The PR also adds the closest prior work it did not cite (Neyman, Noarov and Weinberg, EC 2021), notes that the threshold rule's optimality is a 1949 result rather than a new one, and adds two hand-valued tests that catch the two seeded bugs which survived.

### research/chip-systolic-hidewide (verification 2)

The reviewer is a computer-architecture researcher. The auditor installed the same Yosys and Icarus versions and re-ran the full sweep; `results.txt` came back byte for byte. All 8 array cycle counts match the textbook output-stationary formula, and I re-ran the independent recomputation of the headline ratios (1.30 and 1.27: `ALL MATCH`).

**The worst defect (medium):** the comparison cannot show what a systolic array is for. The weights are compiled into fixed logic and there is no memory, so the array's data reuse never enters the score. The "MAC engine wins" result is pipeline fill overhead on tiny layers, which the TPU v1 paper and SCALE-Sim already cover, and neither is cited. 5 of 7 seeded bugs survived, including dropping the divide-by-rows in the headline score. **In this PR:** the score is a tested function, a backwards comparison in the README is corrected (2x8 at 268,037 is *ahead* of 1x8 at 274,762; lower is better), the package name copied from an earlier project is fixed, and the design limit is stated under Limitations.

## What this round says

Two pricing and format tools passed their own tests while getting the first rule a practitioner would check wrong: how Cloudflare actually charges for the subscription, and what a full Quicken export contains. In both cases the tests asserted the author's belief, not the vendor's example. The two research projects compute exactly what they say. They fall short on what they claim the computation means. That is the same pattern as the earlier rounds: verification and claims are the gates that bind (94 and 104 of 260 audited subjects at 3 or more).

A later round re-audits these four subjects against the fixed code.
