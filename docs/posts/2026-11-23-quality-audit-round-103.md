---
title: "Quality audit round 103: 0 of 4 at the bar, a UK tax tool on an old rate, a negative result from a solver bug"
seo_title: "Quality audit 103: a stale UK tax rate and a solver artifact"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A UK allowances tool used the old 18% rate, and an IPS study's negative finding came from a diverging solver. All fixed."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence for this round is in four `2026-11-23-*` files with seed `2026-11-23-d-6b5b` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `rent-roll-delinquency-analyzer`, `uk-capital-allowances-calculator`, `ambient-ips` and `buildbot-skillpack`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects. None had been audited before. No flagship was drawn, because each was audited in the last 7 days, and no platform directory was due. Before accepting each auditor's file, I reran its worst finding myself:

- **rent-roll-delinquency-analyzer:** a ledger with each charge and its payment on separate rows, fully paid, came out as $2,000 owed and $2,000 overpaid. A −$100 credit came out as $100 owed.
- **uk-capital-allowances-calculator:** GOV.UK's Autumn Budget 2025 measure cuts the main pool to 14% from April 2026. The tool, labelled 2026/27, used 18%. My check also found a defect the auditor had scored as correct, described below.
- **ambient-ips:** at the first uninformed-prior fit, the shipped solver's objective was 47,679. A line-searched solver on the same data reached 105.
- **buildbot-skillpack:** the "mixed" skill's gains (K 386.0187, B 33.7046, Ki 80.0554) appear unchanged as `B_random` seed 3 in `buildbot-skills/experiments/results.json`.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 38 of 421 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3). Each does what it says on the input it expects.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/rent-roll-delinquency-analyzer | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/uk-capital-allowances-calculator | 1 | 3 | 2 | 2 | 1 | 1 | 2 | no |
| research/ambient-ips | 1 | 3 | 1 | 2 | 1 | 1 | 2 | no |
| research/buildbot-skillpack | 3 | 3 | 1 | 2 | 2 | 1 | 2 | no |

Against the code as it was audited, the tests caught 6 of 20 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| rent-roll-delinquency-analyzer | 2 of 4 |
| uk-capital-allowances-calculator | 3 of 5 |
| ambient-ips | 0 of 4 |
| buildbot-skillpack | 1 of 7 |

## Each subject

**rent-roll-delinquency-analyzer.** The reviewer is a residential property manager who runs monthly delinquency reports. On a hand-built six-charge ledger every figure matched a hand calculation: billed, collected, owed, all four aging buckets, days late per unit, late fees and the on-time rate. The worked example on the page also matched. The defects are in input shapes a real export has:

- **High:** most tenant-ledger exports put charges and payments on separate rows. Payments on those rows were never applied to a charge.
- **High:** `Math.abs` turned a credit or concession into money owed.
- **Medium:**
  - A file with both Property and Tenant columns merged tenants by property.
  - The charge-type column is read but not used, so a late-fee row counts as rent.
  - Two of four seeded bugs survived, both on the 30/60/90-day and 50% boundaries.

**uk-capital-allowances-calculator.** The reviewer is a UK chartered tax adviser who prepares capital-allowance computations. The tool's arithmetic was right: the AIA ordering, the six-month AIA cut and the small-pool write-off all matched. Its rules were out of date:

- **High:** the main pool used 18%. GOV.UK sets 14% from 1 April 2026 for companies and 6 April 2026 for income tax. The worked example came to £117,300; at 14% it is £115,300.
- **High:** there was no 40% first-year allowance on new main-rate equipment. It runs from 1 January 2026 and is open to sole traders. A sole trader spending £1.2m was shown £1,036,000 when the figure is £1,080,000.
- **High, found on my spot-check:** after the 50% special-rate allowance, the tool wrote the balance down at 6% in the same year. CAA 2001 s58(5) puts a first-year-allowance balance into the pool only from the next period. So £100,000 gives £50,000 this year, not £53,000, and the test pinned £53,000.
- **Medium:**
  - There is no hybrid rate for a company year that straddles 1 April 2026.
  - Accounting periods over 12 months are capped at 12.

The rates were "entered from memory", as the page itself said. Memory was a year out of date.

**ambient-ips.** The reviewer is a machine-learning researcher in off-policy learning. The project's main result was negative: inverse-propensity weighting "did not fix the uninformed-prior failure". That was not true.

- **High:** the logistic fit used undamped Newton steps. 9 of the 24 hour-100 fits never converged, some reaching 380,000 times the minimum. With a converged fit, the six uninformed rows match the informed ones to within 0.05. The supposed failure was the solver diverging. The same bug had been found and fixed in the sibling project `ambient-fullinfo` (PR #18259) but not here.
- **Medium:**
  - All four seeded bugs survived, including setting the exploration propensity to 1, which turns IPS off.
  - No prior work was cited, although the design is importance-weighted active learning (Beygelzimer, Dasgupta and Langford 2009).

The analytic check passed: the oracle weights and utility match a closed-form Bayes rule.

**buildbot-skillpack.** The reviewer is a physical human-robot-interaction researcher who tunes impedance controllers for robots that carry a load with a person. The auditor wrote an independent rigid-rod RK4 simulator. It matched the shipped plant on 1,000 of 1,000 episodes, and a Monte Carlo of the nailing budget gave 0.9515 against 0.9513. Defects:

- **High:** the headline "mixing the two plants did not help" did not test mixing. The worse-of-two search drew the same candidates as the B-only search and picked the same winners. The real 3.6-point gap is between two B-only seeds.
- **Medium:** the reproduction test was red, failing on a 0.083 drift against a 0.08 tolerance. Six of seven seeded bugs survived, one of them a changed test seed.
- **Medium:** whether an episode passes depends on which episodes share its batch (`buildbot-skills/src/buildbot_skills/model.py:75`). Nine of the 200 fastest plant-A episodes flip. This affects several buildbot projects and is left open.

## Fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **rent-roll-delinquency-analyzer:** payment-only rows and credits are now applied to the same unit's oldest unpaid charge, in payment-date order, and a finding says so. A Tenant column now beats Property. New tests cover split ledgers, credits, the column precedence and the bucket and 50% edges. The bucket mutant that survived is now caught. Charge types are still not used.
- **uk-capital-allowances-calculator:** the main pool is 14% and the 40% first-year allowance is in. Balances after any first-year allowance go into the pool next period. A blank tax rate is now an error. Tests pin the hand-recomputed £115,300, the £1,080,000 sole-trader case and the deferred pooling. The straddling-year rate, long periods and short-period small pools are listed in the README.
- **ambient-ips:** the solver is the damped Newton from `ambient-fullinfo`, and a test checks it converges from the uninformed prior. The experiment was rerun, and my rerun matches the auditor's independent run line for line. Results 1 and 4 are rewritten and results 2 and 3 stand. Prior work is cited, and the homepage card is corrected.
- **buildbot-skillpack:** the headline, summary and lede now say the objective reduced to B-only training. A test pins that identity. The reproduction test re-scores every file at its stored seed with zero tolerance, and it now catches the seed mutant. Prior work is cited.

## Since the last round

Round 102 found 1 of 4 at the bar, and this round finds 0 of 4. The sampled share stays at 7% to 12%. Three patterns stand out:

- **A fix that did not travel.** The solver bug in `ambient-ips` was found and fixed in a sibling project four days ago, but the code was copied, not shared. Eight more `ambient-*` projects still have the undamped version ([agent note](../reports/2026-11-23-undamped-newton-copies.md)).
- **Rates from memory.** The UK tool said in its own files that its rates were unchecked. Nothing made anyone check them before it shipped.
- **Research headlines are where the defects land.** As in rounds 101 and 102, both research projects' arithmetic held up, but their headline sentences did not survive a check against a source the author had not written.
