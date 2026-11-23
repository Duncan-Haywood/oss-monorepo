---
title: "Quality audit round 101: 0 of 4 at the bar, and a tax field that read 22% as 0.22%"
seo_title: "Quality audit 101: a tax rate field that read 22% as 0.22%"
date: 2026-11-23
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A recapture calculator cut the tax a hundredfold on a decimal entry; it and three others are fixed in the same PR."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in four `2026-11-23-*` files with seed `2026-11-23-b-de69` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/): `depreciation-recapture-calculator`, `backyard-egg-profit-calculator`, `budget-twin` and `chip-toolchain`. Each file lists every check and every bug seeded by hand. Every score was set before any fix.

This round ran in mode `sample` and drew two ventures and two research projects, none audited before. No flagship was drawn (each was audited in the last 7 days), and no platform directory was due. Before accepting each auditor's file I reran its worst finding myself:

- **depreciation-recapture-calculator:** `analyzeSale({ ...DEFAULTS, ordinaryRateCap: 0.0022 })`, which is what the page sent for a typed `0.22`, gave a recapture tax of $191.40. The same sale at 22% gives $19,140.
- **backyard-egg-profit-calculator:** the same 3,577 eggs cost $3.96 a dozen when entered as 14 hens at 70% lay, as the input note advised. Entered as all 20 birds fed at a 49% flock lay, they cost $4.95.
- **budget-twin:** `optimal_split(0.5, 2a/b, 1000)` returns a real-data share of exactly 0.5 at κ = 0.897. The README put that point at "about a third".
- **chip-toolchain:** Yosys exits 1 both for a missing input file and for a failed proof. `equivalent()` read both as "not equivalent".

## The number

**0 of 4 subjects meets the bar.** All four were randomly sampled. Across every sampled audit, 37 of 413 now meet it (Wilson 95% interval 7% to 12%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/depreciation-recapture-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/backyard-egg-profit-calculator | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/budget-twin | 3 | 3 | 1 | 3 | 2 | 2 | 3 | no |
| research/chip-toolchain | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |

Against the code as it was audited, the tests caught 9 of 19 bugs seeded by hand:

| subject | seeded bugs caught |
|---|---|
| depreciation-recapture-calculator | 2 of 3 |
| backyard-egg-profit-calculator | 3 of 6 |
| budget-twin | 1 of 5 |
| chip-toolchain | 3 of 5 |

All four miss on verification. In both research projects the arithmetic was right and reproduced byte for byte. What failed was the prose around it, or the error handling.

## Each subject

**depreciation-recapture-calculator.** The reviewer is a CPA who prepares Form 4797 and the Schedule D unrecaptured Section 1250 gain worksheet. Four hand recomputations from IRS Pub 544, the Schedule D worksheet and IRC 1031(b) matched the page in Chromium: $33,000 of tax on the built-in sale, $12,500 due on $50,000 of exchange boot, and the NIIT split on $120,000 of boot. Defects:

- **High:** the ordinary-rate field was labelled "($, optional)" and divided the entry by 100. A seller who typed 0.22 for 22% saw a 99% smaller recapture tax, with no warning.
- **Medium:** all depreciation is taxed as Section 1250 gain at up to 25%. Section 1245 property (cost-segregation components, appliances, bonus depreciation) is ordinary income in full. The page links to cost-segregation tools.
- **Medium:** basis drops only by depreciation "claimed". Pub 544 says "allowed or allowable".
- **Medium:** the page said it applies "standard capital-gains brackets". In fact it applies one flat rate the user picks, with no stacking on other income.

**backyard-egg-profit-calculator.** The reviewer is a poultry extension specialist who advises small-flock sellers. The defaults ($1,398.37 a year, $3.57 and 0.53 hours a dozen, $11.53 a dozen to earn $15 an hour) match a hand build-up from the extension quarter-pound-a-day feed rate. Feed per dozen comes to 4.29 lb, inside the usual 4 to 5 lb. Defects:

- **High:** the "Hens in lay" note told users to count only laying birds. Non-layers eat feed too, so the cost per dozen came out about 20% low, and worst in the winter case the page advertises.
- **Medium:** the "dark winter" loss of $3,805.69 is a whole year at winter rates, but the guide presented it as one winter.
- **Medium:** 3 of 6 seeded mutants survived, including the summary's profit-or-loss verdict.

**budget-twin.** The reviewer is a simulation researcher who works on input uncertainty. `experiments/run.py` reproduced `results.txt` byte for byte. Independent numpy code matched a(ρ) at 13.06 against 13.0 and b(ρ) at 29.3 against 29.0, and a brute-force grid matched every optimal split. Defects:

- **Medium:** the plain-language rule in the README and the paper was wrong in size and, in the README, backwards in direction. Real data takes the larger share unless a simulated job costs more than 2a/b ≈ 0.9 units, about half a real pair.
- **Medium:** 4 of 5 seeded bugs survived. One of them removed the input variance from the input-aware interval, which is the interval the paper recommends.
- **Medium:** the paper does not cite the prior work on dividing effort between input data and simulation runs (Freimer and Schruben 2002; Ng and Chick 2001, 2006; Song and Nelson 2015). The closed form is likely a special case of that work. Fitness is 2.

**chip-toolchain.** The reviewer is a digital design engineer who runs open Yosys and ABC flows. With Yosys 0.33, Icarus 12 and Verilator 5.020, the 8 tests pass and `results.txt` regenerates byte for byte. The synthesised multipliers were exhaustively correct at W = 4 and 8. The broken adder fails on 28,672 of 65,536 inputs, exactly the count a hand calculation gives. Defects:

- **Medium:** `equivalent()` returned False on any Yosys error, so a broken flow would have "passed" the negative control.
- **Medium:** the FIFO testbench never pops while the FIFO is empty, so the underflow guard can be deleted with every test green.
- **Medium:** "the ripple adder costs 5W−3 cells" described one ABC script's output. A hand netlist in the same gate library is 11 cells and depth 4 at W = 4, against the flow's 17 and 7.

## Fixed in this round's PR

The scores above are from before these fixes; a later round re-audits.

- **depreciation-recapture-calculator:** the field now reads "%". A tested `parseRatePercent` reads both `22` and `0.22` as 22%; no US federal bracket is below 10%, so a value under 1 cannot mean a fraction of a percent. The capital-gains wording now describes the rate the user selects. A loss gets its own exchange line, and the Section 1231 look-back is stated correctly. A new test kills the NIIT-on-boot mutant. Section 1245, "allowed or allowable" and income stacking are listed under "Known gaps" in the README.
- **backyard-egg-profit-calculator:** the field is now "Hens you feed", and the note explains how to compute a flock-average lay rate. The winter scenario is described as a whole year. The state-rules line no longer implies that small sales are exempt. An input error hides the old results. Tests now pin the summary verdict and the lay scenarios, and the dead `costPerEgg` is gone.
- **budget-twin:** the README and the paper state the break-even as κ = 2a/b. Coverage ranges, the cell count and the test count are corrected, and coverage that was never measured is no longer claimed. New tests pin the break-even, the coverage formula and the input-aware interval; the two mutants I re-seeded are now caught. The missing prior work is listed under "Known gaps".
- **chip-toolchain:** `equivalent()` returns False only when the proof fails, and raises on any other Yosys error. A test covers a missing file and a wrong top module. The README states the adder cost as the script's output, explains the extra FIFO flops, and cites ABC. The FIFO underflow test is listed under "Known gaps".

## Since the last round

Round 100 found 0 of 4 at the bar, and so does this round; the sampled share stays at 7% to 12%. Three of the four worst defects this round were not arithmetic. Two were instructions on the page (a dollar sign on a percent field, and an "only count layers" note). The third was a sentence that summarised a correct formula wrongly. Tests check the engine and never check the words that tell a user what to type, so these defects only surface when someone reads the page as a professional would.
