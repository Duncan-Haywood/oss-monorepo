---
title: "Quality audit round 75: 0 of 5 at the bar, and a tax tool that left the child benefit charge out"
seo_title: "Quality audit 75: tennis robots, SLO alerts, UK tax, FE, SfM"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 5 subjects meet the bar. A UK tax tool left the child benefit charge out of payments on account; a robot safety page understated top speed by half."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-b-a496` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-19-b-a496`. It drew the flagship `ventures/open-tennis-robots`, two ventures and two research projects. No platform directory was drawn, because every one was audited in the last 90 days. Only the flagship had been audited before. I reran one check from each auditor before accepting their files, and every one reproduced:

- **UK payments on account:** £6,000 of tax plus a £2,000 child benefit charge gives payments of £3,000 the way the page tells you to enter it, against £4,000 with the charge counted.
- **PAYE reduction:** on the reduction case with tax deducted through PAYE, the tool offers no reduction.
- **SLO plan:** 99.95% over 28 days gives a 13.44x page, an error ratio above 0.672% and a 20m 10s budget.
- **revwidth slope:** across the six fine-mesh rows of `sweep.txt` the slope is 0.193 per mm.
- **epigate figures:** along-epipolar recall at 20% is 0.7736 in `results.txt`.
- **Tennis launcher:** 46.7 m/s at 7,000 rpm, and 4,367 rpm for the README's example shot.

## The number

**0 of 5 subjects meets the bar** (0 of 4 sampled, plus the flagship). Across every sampled audit, 33 of 315 now meet it (Wilson 95% interval 8% to 14%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/open-tennis-robots (flagship) | 3 | 3 | 3 | 3 | 2 | 2 | 3 | no |
| ventures/slo-burn-rate-alerts | 3 | 3 | 2 | 2 | 2 | 3 | 3 | no |
| ventures/uk-payments-on-account-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/simdesign-revwidth | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/sensing-epigate | 3 | 3 | 1 | 3 | 3 | 2 | 2 | no |

Claims is the gate that binds this time. Four of the five fall short on claims, and it is the only gate the flagship misses. Tests are close behind: 18 of 32 hand-seeded bugs left every test green.

## Each subject

**open-tennis-robots (flagship).** This subject has improved most since its last audit. There have been 74 commits since 2026-11-08, and every defect that audit found is fixed or mitigated. The two seeded bugs that survived last time, in catch width and the Magnus constant, are now caught. The base command is clamped. A latching relay that only a button at the machine can reset now backs up the software e-stop. The auditor's own integrator puts the README example shot at (9.000, −2.000) after 1.2993 s, with 1.886 m of net clearance. All 257 Python tests and 34 Node tests pass. Two things hold it back:

- **Top speed in the safety page.** `hardware/safety.md` said the machine throws balls at "up to ~30 m/s". The firmware's 7,000 rpm limit allows 46.7 m/s, about 168 km/h, so the page understated the speed a builder has to guard and net against by half.
- **Never run on hardware.** Nothing has been built, and the 2,459-line controller has never run under MicroPython. The flash steps copy it as source to an ESP32 with no PSRAM, where MicroPython has to compile it on the board.

**slo-burn-rate-alerts.** The burn rates, thresholds and windows match the SRE Workbook's multiwindow table. Detection times agree with a per-second simulation to within 1 s. The problems sit at the edges:

- **Periods under 30 days.** These give burn rates below 1x with no warning. A 1-day period pages at 0.48x, which means it fires while the SLO is still being met.
- **Unreachable alerts.** `rules --slo 90` exited 0 and wrote an alert that can never fire.
- **Stale output.** After an invalid input, the page left the old rules on screen, ready to copy.
- **Tests.** Changing the `and` between the two windows to `or` passed every test.

**uk-payments-on-account-calculator.** Both gov.uk worked examples match to the pound, and so do the £1,000 and 80% thresholds and the dates. It fails on two rules a chartered tax adviser would catch:

- **The child benefit charge.** The page told users to enter the High Income Child Benefit Charge as an "other amount", so it was left out of the payments on account. ITEPA 2003 s681B makes it a charge to income tax, so it belongs in them. Each payment came out half the charge too low.
- **The reduction check.** It compared a gross expected bill with an instalment net of PAYE, which s59A(4) does not allow. With £5,000 of tax through PAYE, it said a reduction would not help when each payment could fall from £2,500 to £500.

**simdesign-revwidth.** The finite-element numbers reproduce exactly. A Timoshenko narrow-cantilever formula brackets the reported width of 22.54 to 22.62 mm. The weaknesses:

- **Tests.** Three of four seeded bugs survived. One was density times 10; another let the bisection return a width that misses the target.
- **Slope.** The README gave 0.22 per mm where its own data give 0.19.
- **What the factor of 3 means.** The floor of 3 is an elastic eigenvalue only. An EN 1993-1-1 reduction at this slenderness puts the design margin nearer 1.7 to 1.9.
- **Novelty.** As research it is a one-parameter sizing step and is not new.

**sensing-epigate.** The geometry is right. The fundamental matrix matches the one built from the cameras, the Sampson distance agrees with Hartley and Zisserman to 2e-12, and the full run reproduces byte for byte. Five of seven seeded bugs survived, though; two of them removed the rank-2 step and halved the Sampson denominator. The research design limits what the result says:

- **Small view pairs.** The median pair shares 22 points, and 26% of pairs have too few to fit at all. That likely explains why the gate removes 93% of bad matches rather than 99%.
- **No spread.** Results are means over six seeds. One 10% cell's mean comes from a single bad seed.
- **No comparison with standard tools.** The structure-from-motion prior work, such as COLMAP's geometric verification and LO-RANSAC, is not compared.

## What was fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **uk-payments-on-account-calculator:** the child benefit charge now goes in the tax figure, and the expected-bill input says "after tax deducted at source". Two new tests fail on the old code. A third pins the year label that a surviving bug had mislabelled.
- **slo-burn-rate-alerts:** new `sub-unit-burn` finding. `rules` exits 1 on an alert that can never fire. Invalid input or a negative req/s now hides the old report. The FAQ no longer says a 99% SLO never alerts. The policy table scrolls at 375 px. The `and`→`or` bug is now caught.
- **simdesign-revwidth:** slope corrected to 0.19. Tests pin the masses and check that the bisection result meets the target, and all three surviving bugs are now caught. The EN 1993 limit and the thicker-sheet option are disclosed.
- **sensing-epigate:** the 77–87% range and the "0.32 without it" comparison are corrected. The voting claim is scoped to how many pairs each observation sits in. Tests now pin rank 2 and the Sampson formula, and the shift-range test checks `near` as well as `along`.
- **open-tennis-robots:** `safety.md` states 47 m/s, and a test ties that figure to `MAX_RPM`. The bumper test now checks pivots in both directions. One correction to the audit: the auditor said the surviving bumper bug would let the robot pivot into an obstacle. In fact `tick()` re-zeroes forward drive later in the same loop, so the gap was a missing test, not an unguarded hazard. The audit file says so.

Not fixed here, and listed in each subject's README or audit:

- the tennis robot's MicroPython build and its single-channel e-stop;
- SLO selector syntax and latency SLIs;
- the UK tool's PAYE coding-out case;
- revwidth's novelty;
- epigate's small view pairs, seed spread and missing structure-from-motion baselines.

## Since the last round

Round 74 found the same pattern: tests are the weakest dimension across the corpus. Verification is at the bar in 113 of 454 audited subjects. This round adds a second pattern: four small claim errors that were each one number off what the project's own files say. Examples are 0.22 against 0.19, 79% against 77%, and 30 m/s against 47 m/s. A check that recomputes the README's stated numbers from the results file would catch this kind of error before an audit does.
