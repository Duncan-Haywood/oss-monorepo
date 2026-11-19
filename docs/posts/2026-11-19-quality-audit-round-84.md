---
title: "Quality audit round 84: 1 of 5 at the bar, and a Substack analyzer that counted free readers as paid"
seo_title: "Quality audit 84: free readers counted as paid, 111 units for 110"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "1 of 5 meets the bar, the shift-roster flagship; 15 of 34 seeded bugs caught. A Substack tool counted plan 'free' as paid; a DynamoDB tool rounded 110 to 111."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-k-4c5e` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/shift-roster-builder`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. Only the flagship had been audited before, last on 2026-11-09. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **shift-roster-builder:** seven 9-hour California days at $20 with a 30-minute break gave `22 1 1500` (22 overtime hours, 1 double-time hour, $1,500). By hand: 63 × 20 + 0.5 × 20 × 22 + 20 × 1 = 1,500.
- **dynamodb-capacity-mode-advisor:** a flat week at 100 read and 10 write units per second gave on-demand $49.275 and autoscaled $20.688, the hand figures. The fixed-peak figure came out at $15.7534 instead of $15.6585, which is the rounding defect below.
- **substack-subscriber-export-analyzer:** a three-row file (one monthly payer, two readers with plan `free`) gave 2 paid, conversion 1.0 and MRR $16. The right answer is 1 paid, 0.333 and $8.
- **free-buckreal:** the auditor's own ARX 2/2 fit gave a free-run test error of 0.819 V, the same as `experiments/results.txt`. SysIdentPy's tutorial on these files does give the static law Vo = 4Vd/3 − Vd·u/3 with Vd = 24 V, and arXiv 1909.04320 is a grey-box study of a buck converter in continuous conduction.
- **simdesign-processcover:** I did not rerun the coverage integral. I did check the three beam flip points by hand (below), and each new test pins one.

## The number

**1 of 5 subjects meets the bar**: the flagship, and none of the 4 sampled. Across every sampled audit, 35 of 347 now meet it (Wilson 95% interval 7% to 14%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/shift-roster-builder (flagship) | 3 | 3 | 3 | 2 | 3 | 3 | 3 | yes |
| ventures/dynamodb-capacity-mode-advisor | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/substack-subscriber-export-analyzer | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/free-buckreal | 3 | 3 | 2 | 3 | 2 | 1 | 2 | no |
| research/simdesign-processcover | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

Of 34 bugs seeded by hand, the tests caught 15. The shift-roster suite caught 7 of 7. The other four caught 3 of 8, 1 of 8, 2 of 6 and 2 of 5. Verification is the gate every sampled subject failed.

## Each subject

**shift-roster-builder (flagship).** The reviewer is a workforce-scheduling manager who knows US overtime, meal-break and youth-labour rules. All 11 recomputed pay figures matched sources the author did not write: federal weekly overtime, California daily and seventh-day overtime, meal premiums, a two-rate regular rate, Nevada, Kentucky and 15-minute rounding. Six core test files ran: 232 pass, 0 fail. Claims rose from 2 to 3 since round 3, and the weekly-overtime line that one test guarded is now caught by mutation. What is still not at the bar:

- The planner prices an overnight shift's daily overtime on the day it starts. Sat 8pm to 6am at $20, with daily overtime after 8 hours, shows 2 overtime hours and $220. The product's own timesheet splits by calendar day and shows none.
- A 14 or 15 year old in a school week is capped at 3 hours on every day, Saturday and Sunday included. 29 CFR 570.35(a) allows 8 hours on a non-school day, so a 6-hour Saturday shift is left open.
- `calc.mjs` is one 6,076-line module (2,916 at round 3), and the README is 541 KB. Craft stays at 2.
- Not run: the browser page, the server end to end, and 76 of 82 test files.

**dynamodb-capacity-mode-advisor.** The reviewer is an AWS FinOps engineer. Its us-east-1 prices match AWS's live price list exactly, after the November 2024 on-demand cut. The 29% break-even and a run over the fixture week matched an independent Python version. The worst defect is high severity: the window is the number of rows times the period, not the span of the timestamps. CloudWatch leaves out periods with no datapoint, so on a test week with 8 idle hours a day, on-demand came out at $98.55 instead of $65.70, and the cheapest mode changed from autoscaling to fixed peak. Five of eight seeded bugs survived, including one that prices write capacity at the read rate. Two more defects:

- 5-minute data pasted at the default hourly period is priced 12 times too low, with no warning.
- Global secondary indexes are not priced at all.

**substack-subscriber-export-analyzer.** The reviewer is a newsletter growth analyst. The parser is strong: it handles a BOM, CRLF, quoted commas and line breaks, semicolons and day-first dates. The paid logic is not:

- **High severity:** paid status is read from `plan`, `first_payment_at` or `type`, never from `active_subscription`. Ghost's Substack importer, the one independent source the auditor could reach, reads an export of `email, active_subscription, expiry, email_disabled, created_at`. On a file of that shape the tool shows 0 paid and $0, with no warning.
- A plan cell reading `free` counted as paid.
- Lapsed subscribers with no expiry date drop out of retention, so it can read 100% next to 50% churn.
- 7 of 8 seeded bugs survived.

**free-buckreal.** The reviewer is a referee in grey-box identification of power converters. The numbers reproduce: `experiments/run.py` rebuilds `results.txt` byte for byte, and an independent script matches the baselines and ARX fits. The problem is the framing. The README said the input scaling was unknown. But SysIdentPy's own tutorial on this dataset gives a linear static law, and the rig is likely the one in Hafiz, Swain, Mendes and Aguirre (2020). A two-parameter twin with that law fixed scores 0.489 V on the reversed split, against 0.500 V for the five-parameter Hammerstein twin. So the headline "static curvature matters" is not established. There is no polynomial NARX baseline either, though that is the standard model for this data.

**simdesign-processcover.** The reviewer is a design-for-manufacture referee. The coverage values match a grid integration to within 0.002, and FDM's geometry-only share matches a closed form (0.8931 against 0.893). But the cantilever check that drives every load-case number had no test. Bending stress cut to a tenth, deflection cut to a tenth and casting draft removed all left the suite green. The prior work is uncited: Ashby-style process screening, and budgeted maximum coverage (Khuller, Moss and Naor, 1999). The greedy shortfall it reports at budgets of 600 to 800 is that problem's known failure.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits.

- **dynamodb-capacity-mode-advisor:** one `ceilUnits` helper now rounds capacity up past float noise. Before it, `Math.ceil(100 * 1.1)` was 111, and 7 / 0.7 autoscaled to 11 units. A new test fails on the old engine.
- **substack-subscriber-export-analyzer:** a plan cell reading `free`, `none` or `unpaid` is no longer a paid plan, and the three-row file above now gives 1 paid, $8. The FAQ (and its schema) no longer states the export's columns as fact. The `active_subscription` defect is under "Known gaps" in the README.
- **simdesign-processcover:** three tests now pin hand-computed flip loads: 125 N for a 10 × 6 mm laser-cut steel arm, 4.3945 N of deflection-bound load for a 5 × 6 mm FDM arm, and 87.66 N for a drafted 12 × 6 mm casting. All three mutants that survived now fail. The stock-rule docstring now matches the code, and the uncited prior work is listed under limitations.
- **free-buckreal:** the README cites the published static law and the likely source rig, says the curvature claim is not established, and gives the measured 2.5-minute runtime.
- **shift-roster-builder:** a comma-less first shift line such as `Mon 8am-5pm` is now an error instead of a silently skipped header. That defect had been open since round 1. A real header row is still skipped. The overnight and youth-hours defects are listed in the README.

## Since the last round

Round 83, earlier today, had 2 of 4 sampled subjects at the bar. This round has none. In all four, the code computes the right thing on the cases its author tried, and the tests check no more than those cases. Three of the four would clear verification with tests that pin a hand-computed value where a rule switches on, which is what this PR added for processcover. The flagship is the counter-example: its suite caught every seeded bug, because its tests pin pay figures computed from the statutes.
