---
title: "Quality audit round 69: 0 of 4 at the bar, and an escrow checker that misread a deficiency"
seo_title: "Quality audit 69: escrow, 3D print pricing, sand store, garment"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meets the bar. An escrow checker misread a Reg X definition, and a research headline rests on a heat double-count."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-o` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-o`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**0 of 4 sampled subjects meets the bar.** Across every sampled audit, 32 of 290 now meet it (Wilson 95% interval 8% to 15%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/3d-print-price-calculator | 3 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| ventures/mortgage-escrow-analysis-checker | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| research/energy-store-modelprice | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/garment-twonodeheld | 3 | 3 | 1 | 2 | 3 | 1 | 2 | no |

The subjects' own tests caught 11 of the 24 seeded bugs: 5 of 6 (3D print), 2 of 5 (escrow), 2 of 6 (energy store) and 2 of 7 (garment). The 3D print calculator came closest. It misses on one unbacked claim. In the other three, a rule or a model choice is wrong in a way the tests never examine.

## The subjects

**3d-print-price-calculator.** The reviewer is someone who runs a small print farm and prices jobs commercially. The default breakdown recomputes to the cent: material 0.99, electricity 0.0576, depreciation 0.25, total 5.4938, price 9.7235. Cura's length-to-grams conversion (10 m of 1.75 mm filament gives 29.83 g) matches. The page says G-code import works with Bambu Studio, and on real Bambu files it does not. Bambu Studio writes both print times on one line (`; model printing time: 1h 52m 3s; total estimated time: 1h 58m 40s`, from `GCodeProcessor.cpp` in its source). The parser only matched a line that starts with `total estimated time`. Its test passed because the fixture was a made-up line. The 8.5% marketplace fee default is also below Etsy's published percentage fees, and fixed per-order fees have no field of their own. The auditor could not load etsy.com through the proxy, so that comparison uses Etsy's fee policy as known, not a page loaded this round.

**mortgage-escrow-analysis-checker.** The reviewer is a mortgage servicing escrow compliance analyst. The aggregate method matches the CFPB's Regulation X Appendix E example exactly: monthly payment 130, cushion 260, target starting balance 1,040, low point 260 in December. The $50 surplus threshold is right at the boundary. The worst defect is a definition. 12 CFR 1024.17(b) defines a deficiency as "the amount of a negative balance in an escrow account". The tool instead treated any projected low point below zero as a deficiency, and a deficiency is exempt from the 12-month repayment rule. So a $540 shortage, from a $500 balance, collected at $90 a month over 6 months got no finding, though the rule requires at least 12 months. The page and two tests repeated the wrong definition. Three of five seeded bugs survived, all at regulatory thresholds ($50, 12 months, one month's payment). The "most in question" total also counts overlapping findings twice: 3,179.96 on the sample statement.

**energy-store-modelprice.** The reviewer is an energy-systems economist. The auditor's own code reproduces all 80 section A values, and an LP solve (scipy HiGHS) confirms the cheapest-quarter dispatch is optimal. The rerun is byte-identical on Python 3.11. On 3.13, four values differ by 0.0001: they sit on a rounding boundary that `sum()` handles differently from 3.12 on. The worst defect sits in the cost model this project reuses from `energy-thermal-cost`. Every cycle is billed for heating the sand from 10 °C to 500 °C, but the store only discharges to 100 °C. A recharge needs 400/490 of that heat, so the store's electricity bill is overstated by 22.5%. Corrected, the store wins weekly cycling in 4 of 5 years. The headline's "marginal weekly verdict" is mostly that accounting. Two small claims were also wrong. The README said the pump wins two weekly years under real prices: it wins one (2018), and 2019 is a tie. The lede said the model is "wrong in sign in 5 of 5 years": the verdict is wrong in all five, but the sign is opposite in only four. No storage-arbitrage prior work is cited.

**garment-twonodeheld.** The reviewer is a thermal-comfort and clothing-thermophysiology researcher. The rerun is byte-identical. The auditor's own implementation matches every reported number to 3 decimal places. Its "ref" model agrees with `pythermalcomfort`'s `two_nodes_gagge` to 1e-4. The finding is sound arithmetic on a circular setup, though. The score is the distance of skin temperature from 33.7 °C, and the gate switches on skin temperature. So the best band brackets 33.7 °C in any room, and "the tuned band carries over to held-out rooms" is close to guaranteed. The target also ignores activity. ISO 7730's relation gives about 34.1 °C at 1 met and 32.4 °C at 2 met, and with those targets the out-of-range advantage falls from 0.051 to 0.001 °C. The tests caught 2 of 7 seeded bugs, and CI found none of them, because they are bare pytest functions and research CI runs `unittest`. Four sibling projects reuse this code.

## What was fixed in the same PR

The scores above are from before these fixes. A later round re-audits.

- **mortgage-escrow-analysis-checker:** a deficiency is now a negative account balance, as Reg X defines it. A projected low point below zero is now treated as a shortage and held to the 12-month rule. The page, the README and the two tests that pinned the old definition are corrected. New tests cover the Appendix E example and each boundary: the 12-month spread (11 against 12 months), exactly one month's payment, and $49.99 against $50.00. Rerun after the fix, the three surviving threshold mutants and the old deficiency formula are all caught. The double-counted total and the 30-day deficiency option are listed in Known gaps.
- **3d-print-price-calculator:** import now reads Bambu Studio's one-line print time, and the test uses the real header shape. A new test pins "other fixed cost", the one mutant that survived. The README's "every field resets on refresh" now matches the Save button. Known gaps lists the marketplace fee model, parts per plate and the full-length failure assumption.
- **energy-store-modelprice:** the pump-win count, the sign claim (here and on the research index) and the run time are corrected. A `unittest` test pins section A, so the leave-one-year-out holdout and the flat merit price can no longer change unnoticed (both mutants are now caught). Limitations states the heat double-count and the missing prior work.
- **garment-twonodeheld:** a `unittest` test that CI discovers pins the tuned band, the training and held-out means, and the lag, and runs the old pytest functions too. Two survivors (the 0.1 °C width, the ignored lag) are now caught. Limitations states the circular target, the activity-blind target, and effects smaller than a skin sensor can resolve. The stale "lag was not run" now links `garment-twonodelag`.

## Not yet done

- The energy-store headline still stands as written. The heat-accounting fix belongs in `energy-thermal-cost`, and it changes numbers in two downstream projects, so it needs its own PR with both experiments rerun.
- garment-twonodeheld's held-out finding needs a score that is not the gate's own switching variable, and an activity-dependent target, before it says anything about carry-over.
- The escrow tool's "most in question" total still double-counts. The 3D print fee default still uses one percentage.
- `energy-store-modelprice/tests/test_model.py` still imports `pytest` and depends on pytest's path setup, so `unittest discover` cannot load it.
