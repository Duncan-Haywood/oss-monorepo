---
title: "Quality audit round 92: 0 of 4 at the bar, and a flywheel that held twice what fibre allows"
seo_title: "Quality audit 92: a flywheel that held twice what fibre allows"
date: 2026-11-22
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. Three engines summed correctly but used the wrong rule for their field, and tests caught 13 of 25 seeded bugs."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-22-*` files with seed `2026-11-22-c-1f0f` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `cash-runway-planner`, `paid-sick-leave-accrual-calculator`, `energy-density` and `society-lanes`. Each file lists every check and every hand-seeded bug. Every score was set before any fix.

This round ran in mode `sample`. It drew two ventures and two research projects, none audited before. No flagship was drawn (each was audited in the last 7 days) and no platform directory (each in the last 90). Before accepting each auditor's file I reran one of its findings myself:

- **cash-runway-planner:** with the auditor's case B, the page said moving a $3,000 week-3 tax bill "closes the gap". I applied that move and re-ran the forecast: week 2 is still −$500.
- **paid-sick-leave-accrual-calculator:** the page's own California example (32 h a week, $22) accrues 55.5 hours, but Cal. Lab. Code §246 lets the employer cap use at 40 hours a year. "Cost if all used" was $1,220 per employee; 40 × $22 is $880.
- **energy-density:** 3 × (700 bar gauge) × 1,560 kg/m³ / 2.86 GPa gives a fibre-vessel shell of 114.4 kg/m³. The results file said 57.2.
- **society-lanes:** the auditor's own script, which does not import the project, counted 473 of 723 Zurich street passes and 334 of 491 Nicosia ones on the walker's right. That matches `m7_wild_sides_results.txt`.

## The number

**0 of 4 subjects meet the bar.** All four were randomly sampled. Across every sampled audit, 36 of 376 now meet it (Wilson 95% interval 7% to 13%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/cash-runway-planner | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| ventures/paid-sick-leave-accrual-calculator | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/energy-density | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/society-lanes | 3 | 3 | 2 | 3 | 3 | 3 | 3 | no |

Of 25 bugs seeded by hand, the tests caught 13:

| subject | seeded bugs caught |
|---|---|
| cash-runway-planner | 5 of 6 |
| paid-sick-leave-accrual-calculator | 1 of 5 |
| energy-density | 2 of 6 |
| society-lanes | 5 of 8 |

The pattern from rounds 90 and 91 continues: arithmetic that recomputes, failures in the rules. In three subjects the sums were right but the rule they were summing was not the one the field uses.

## Each subject

**cash-runway-planner.** The reviewer is a bookkeeper who builds 13-week cash forecasts. Weekly balances matched an independent roll-forward to the dollar in three cases, including a quarterly bill repeating over 52 weeks. The worst defect is high, and it is in the headline feature. The "which payment to move" advice called a delay a fix whenever the payment was at least the deficit at the lowest week. It did not check whether the payment landed after cash had already gone negative. Moving such a payment cannot repair the earlier weeks. The README and both explainer pages also described the candidate rule differently from the code. There is no field for invoices already outstanding, so a trading business sees no collections for its first delay weeks. One note on the audit itself: the auditor ran `node --test '*.test.mjs'` and got 50 tests. The suite's 27 tests in a bare `test.mjs` did not run. CI's bare `node --test` runs them, and all 77 pass.

**paid-sick-leave-accrual-calculator.** The reviewer is a multi-state payroll compliance specialist. Accrual rates and size thresholds were right for most of the 14 states. The worst defect is high: Maryland's balance cap was 40 hours. Md. Lab. & Empl. §3-1305 lets the employer cap accrual at 40 a year, use at 64 a year and the balance at 64. A Maryland employer following the tool would under-provide up to 24 hours. Three further problems:

- "Cost if all used" ignored the use cap, overstating California by 39%.
- Front-loading ignored employer size, so Arizona under 15 employees showed 40 hours instead of 24.
- Minnesota's 48 hours was called a use cap when it is an accrual cap.

Verification is 1. Four of five seeded bugs survived, including changing Illinois' rate and Washington's carryover, and 7 of 14 states had no test. The README called the 14 "the states with statewide laws". Connecticut, Rhode Island, Vermont, Maine, Alaska, Nebraska and DC are missing. The statute citations are from the auditor's and my own knowledge; the state legislature sites returned 403 through the proxy.

**energy-density.** The reviewer is an energy-storage scientist who also reviews flywheel and pressure-vessel design. Five published battery ceilings, the hydrogen Gibbs energy, the thermal exergies and compressed air all recomputed. `run.py` regenerates the results byte for byte. The worst defect is high, in the headline. The "ideal fibre disc" flywheel used shape factor K = 1. Fibres carry stress in one direction only, so the virial theorem caps any fibre rotor at K = 0.5 (Genta 1985). The README's "756 Wh/kg, 0.34 eV per atom" should have been 378 Wh/kg and 0.17. The 700 bar tank had the same error. It used the isotropic sphere formula with a one-direction fibre strength, which halves the shell, so "the lightest possible tank" was half the netting bound. H₂ is 26.0% of the mass, not 41.3%. The closest prior work, Zu and Li (2011) with over 1,100 couples by the same method, was not cited. Four of six seeded bugs survived, all outside the battery path.

**society-lanes.** The reviewer is a pedestrian-dynamics researcher who calibrates crowd models on the Jülich corridor experiments. This was the strongest subject. Every number the auditor could reach recomputed exactly:

- the street-scene side counts;
- two HERMES lab runs;
- ORCA against a brute-force version of its own definition;
- the power-law force against a finite-difference gradient;
- the social-force defaults against Helbing, Farkas and Vicsek (2000).

The audit could not check 22 of 24 HERMES runs and the long simulation milestones, because the FZJ archive returned 403. It misses the bar on verification alone. Three of eight seeded bugs survived, including swapping the square in the lane-order statistic for an absolute value, and no test compares an experiment with its committed results. The worst research-design defect is medium. Milestone 3 calibrated the crowd's walker count at side bias β = 0, then fitted and scored at β = 0.1. At that setting the dense runs walk at 1.10 to 1.24 m/s against 0.28 to 0.33 observed, and the README reported only the smaller β = 0 miss. The robot milestones 5a to 6f use those crowds. Later milestones 6g and 6h found and partly fixed this.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits. Each audit file marks the defects fixed with `fixed_by`.

- **cash-runway-planner:** a delay now "closes the gap" only if it is large enough and dated no later than the first negative week. A new test applies the move, re-runs the forecast and confirms week 2 stays negative. The README and both explainer pages (text and JSON-LD) now describe the rule the code applies. 77 of 77 tests pass. Opening receivables, the "roughly 4 weeks" monthly bill and the CSV formula guard are still open.
- **paid-sick-leave-accrual-calculator:** the fixes are:
  - Maryland is now 40 hours a year accrual, 64 use and 64 balance.
  - Minnesota is now 48 accrual and 80 balance, with no use cap.
  - "Cost if all used" is capped at the use limit, so California shows $880, not $1,220.
  - Front-loading follows the size cap (Arizona 24, Michigan 40 for small employers).
  - The page says the rules were written from memory, and the README lists the seven missing jurisdictions.
  - New tests pin Maryland, Minnesota, Illinois' rate, Washington's carryover and New York's 5-employee threshold.

  30 of 30 pass. The missing jurisdictions are still a scope gap, and New York's $1M net-income rule for tiny employers is still only a note.
- **energy-density:** the fibre rotor now uses K = 0.5 (378 Wh/kg), and the vessel uses the netting bound 3pρ/σ (114.4 kg/m³, 26.0 wt%, 8,498 Wh/kg). The README, results and homepage card are updated. A test pins both figures. Zu and Li (2011) and Genta (1985) are cited, with a sentence on what is and is not new. 15 of 15 tests pass. The untested thermal and mechanical paths are still open.
- **society-lanes:** the README now reports the β = 0.1 speed miss and drops the stale "No robots yet". It also states that the three models agreeing on close passes share one steering stage. A mixed-bin lane-order test catches the surviving absolute-value mutant. The other two surviving mutants (in `encounters.py` and `orca.py`) are still open.

## What changed since the last round

Round 91 had 0 of 4 at the bar; the sampled share moves from 36 of 372 to 36 of 376. Verification bound again: three of four subjects scored 2 or below there. What is new this round is where the wrong numbers came from. None was an arithmetic slip. Each was a rule a senior reviewer in the field would check first and the author never encoded:

- a fibre carries load in one direction;
- a statute caps accrual and use separately;
- moving a payment cannot rescue a week that has already passed.

The tests had been written to match the code, so they passed with the wrong rule in place. The fixes in this PR each add a test that states the rule with its source.
