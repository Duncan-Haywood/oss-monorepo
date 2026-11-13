---
title: "Quality audit round 71: 1 of 4 at the bar, and an emulator that skipped instructions a Cortex-M4 runs"
seo_title: "Quality audit 71: roofing bids, mortgage points, M4 counts, jaw cap"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "1 of 4 sampled subjects meets the bar. A roofing bid tool passes; a Cortex-M4 cost study undercounts by 8%, and two projects' tests miss most seeded bugs."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-q-5db1` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-q-5db1`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**1 of 4 sampled subjects meets the bar.** Across every sampled audit, 33 of 294 now meet it (Wilson 95% interval 8% to 15%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/roofing-bid-calculator | 3 | 3 | 3 | 3 | 3 | 2 | 2 | yes |
| ventures/mortgage-points-break-even-calculator | 3 | 3 | 2 | 3 | 3 | 3 | 2 | no |
| research/ambient-gatem4 | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/robofab-jawcap | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |

The subjects' own tests caught 13 of the 25 seeded bugs: 6 of 8 (roofing), 3 of 8 (mortgage points), 1 of 4 (Cortex-M4) and 3 of 5 (jaw cap, where one survivor was an equivalent change). Every headline number in all four recomputed correctly from an independent model, so this round's misses are about tests and disclosure, not wrong arithmetic. The exception is the Cortex-M4 study, whose numbers are right for its counter but the counter undercounts.

## The subjects

**roofing-bid-calculator** (meets the bar). The reviewer is a residential roofing estimator who bids asphalt reroofs. The starting example recomputes to the cent from trade definitions alone: a square is 100 sq ft of surface, and the pitch factor is √(1 + (rise/12)²). The example is 1,800 sq ft at 6/12 plus 400 at 4/12, which gives 24.341 squares, cost $11,085.87 and price $13,857.34. The worst defect was input handling. A cleared field arrives as `''`, and `Number('')` is 0, so a blank crew wage priced the job with $0 labour and no warning. A blank pitch priced the roof flat. Fitness and domain stay at 2: there is no deck-replacement allowance, no linear-foot items (drip edge, ridge cap, ice barrier), and one waste percentage covers every section.

**mortgage-points-break-even-calculator.** The reviewer is a senior loan officer, with a CFP for the tax and opportunity-cost side. The payments recompute exactly: $2,594.39 at 6.75% and $2,495.48 at 6.375% on $400k over 30 years. That gives a simple break-even at 40.44 months, and month 35 once the return on the cash is counted. Verification is the gap: 5 of 8 seeded bugs survived, because the tests checked which way the outputs moved, not their values. Removing the compounding of the savings left every test green. So did reporting "chance you still hold the loan at break-even" in months instead of years, which shows about 0% to every user. The tax treatment is also biased against points. The interest saving is taxed, but the points themselves are never deducted, though IRS Pub 936 generally allows that on a main-home purchase. With a 24% rate entered, that moves break-even from about month 35 to month 47.

**ambient-gatem4.** The reviewer is an embedded DSP engineer who ports audio front-ends to Cortex-M parts. The rerun is byte-identical, and the auditor's own clang builds match every flash size. An independent count reproduces 3237, 2096 and 1977 instructions per frame. Those numbers are right for the counter, but the counter is wrong. Unicorn's code hook skips an instruction in an IT block whose condition fails, and a Cortex-M4 still issues it. A five-instruction probe sees four, and I re-ran the probe and got the same. Counting what the core actually issues gives 3486, 2122 and 1982. That moves the floor-scan share from 39% to 43% and the block-10 saving from 35% to 39%. The conclusion survives. Three of four seeded bugs survived, including doubling every count and reading the wrong `llvm-size` column. Research CI also records the suite as skipped, because it needs clang and Unicorn. The block-minimum floor is compared only with a naive scan. A streaming minimum filter (Lemire 2006), which takes about 3 comparisons per sample, is not considered.

**robofab-jawcap.** The reviewer is a motion-planning researcher who reviews time-optimal path parameterisation papers. The rerun is byte-identical. An independent solver built on a different algorithm (TOPP-RA-style reachability) matches every total to within 1 ms, for example 4.001 s against 2.286 s at 0.12 m and 5 N m. The worst defect is a dropped disclosure. The carry is modelled in the vertical plane only, so the base turn between pick and lift is neither timed nor loaded. That turn is up to 197° at 0.08 m links, and its acceleration loads the grasp axis that the jaw bound treats as free. The parent project `robofab-armbang` says so; this README did not. The README also had two wrong claims. It put the worst torque overshoot at 3.3%, where the results show 0.8%. It said feasibility is not monotone in speed, which convexity rules out, and a 14,472-node scan found no gap. It called the constraint "my own derivation" without citing the TOPP literature on friction and waiter-motion constraints. The `paper/` directory is a 14-line stub.

## What was fixed in the same PR

The scores above are from before these fixes. A later round re-audits.

- **roofing-bid-calculator:** a blank crew wage, pitch, tear-off layers, footprint or per-square rate is now an error, not zero. Optional costs still read blank as zero. The engine's own tests now pin the recomputed $11,085.87 and $13,857.34. Before, only a marketing-page test caught two core mutants. Starter and ridge are no longer counted in both the waste and the accessories guidance. A comparison-page sentence that counted $5,795.62 twice ("before counting the $10,708.86") is corrected. The README gains a Known gaps section.
- **mortgage-points-break-even-calculator:** the tests pin the recomputed values (month 35, $6,514.15, 31.329%, $12,006.54, 0.9^(35/12)). Re-run with `quality_mutate.py`, the compounding and months-for-years mutants are now caught. A negative points cost or rate now returns warnings and no figures, where before it showed a break-even of −40 months. The structured data no longer lists "lender credit comparison" as a feature without saying it works by swapping the inputs. Known gaps covers the points deduction and the pre-tax return.
- **ambient-gatem4:** Limitations now gives the IT-block undercount with the corrected numbers, the uncounted divide, the wrapper instructions and the missing streaming-minimum comparison. It also drops the "64-bit multiply-accumulate" exclusion, which described an instruction the loop does not use. A new test pins the flash sizes (252 and 258 bytes), so a wrong `llvm-size` column fails.
- **robofab-jawcap:** the torque figure is corrected to 0.8%. The base-yaw limitation is restored. The non-monotone claim is replaced by the convexity argument. The constraint is no longer presented as new, and the README names the TOPP-RA and waiter-motion work it should be compared with.

## Not yet done

- The mortgage tool still does not deduct points for an itemizer, and the roofing tool still has no deck or linear-foot items. Both are listed in the products' Known gaps.
- ambient-gatem4's headline table still uses the undercounting counter. A fix means counting instructions from the trace with the IT state decoded, then rerunning. The tests still never run in CI.
- robofab-jawcap's paper is still a stub. The base turn needs to be modelled before the absolute carry times describe the stated task.
