---
title: "Quality audit round 77: 0 of 5 at the bar, and a profit goal that counted rent twice"
seo_title: "Quality audit 77: chant-forge, wash and fold, walk-in tubs"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 5 subjects meet the bar. A laundry pricing tool overstated the volume a profit goal needs by 28%, and a research comparison could only ever tie."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-d-8bc2` (chant-forge's is `2026-11-19-chant-forge-b.json`) in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample` with seed `2026-11-19-d-8bc2`. It drew the flagship `ventures/chant-forge`, two ventures and two research projects. No platform directory was drawn: every one has been audited in the last 90 days. Only the flagship had been audited before. Before accepting each auditor's file, I reran at least one of its checks myself, and every one reproduced:

- **Wash and fold:** at the guide's example inputs the tool says a $3,000 monthly profit needs 9,837 lb. Fed that volume back, the tool reports $4,533.87 of profit.
- **Walk-in tub:** the default bid is 11.78 hours, $3,005.86 of cost and a $3,757.32 price. That is $3,005.86 / 0.8, so the 20% margin is taken on price, as it should be.
- **accel-gatedprice:** `experiments/results.json` gives 63 of 64 cells won at 24 or fewer flops per gate, and a largest gate group of 27, as the README says.
- **mimic-codeloop:** at round 6 the baseline detector scores 0.998 to 1.000 in all 16 runs.
- **chant-forge:** the README called stage 3 (Arrange) "Not built", although `genre.mjs`, `--genre` and `--sections` ship.

## The number

**0 of 5 subjects meet the bar** (0 of 4 sampled, plus the flagship). Across every sampled audit, 33 of 323 now meet it (Wilson 95% interval 7% to 14%). Four of the five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/chant-forge (flagship) | 3 | 3 | 3 | 3 | 2 | 2 | 3 | no |
| ventures/walk-in-tub-bid-calculator | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/wash-and-fold-price-calculator | 2 | 3 | 3 | 3 | 2 | 3 | 2 | no |
| research/mimic-codeloop | 3 | 2 | 1 | 2 | 2 | 1 | 1 | no |
| research/accel-gatedprice | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Claims scored 2 for all five subjects, and on its own it would have kept every one of them under the bar. As in recent rounds, it is the gate that binds most often.

## Each subject

**chant-forge (flagship).** The reviewer it was judged against is a Gregorian schola director who also engraves chant. Since the last audit on 2026-11-08 it has improved: verification rose from 2 to 3 and domain from 2 to 3. All 331 tests pass, and all five seeded bugs were caught, including the change to the loudness gate that got through last time. Every output we recomputed matched its outside source: pitches against the printed Dies irae and Veni Creator, loudness against ffmpeg's EBU R128 meter, the MusicXML against the W3C 4.0 schema, and the organum against the Musica enchiriadis rules. Claims kept it under the bar. The first thing a reader sees, the README's pipeline summary, said the arranger was not built, and the test count was out of date. The worst defect still open is the synthetic choir's Latin. It decides pronunciation one syllable at a time, so "gratia" does not get /tsi/ and "mihi" does not get the /k/ that the Liber Usualis rules ask for (`sing.mjs:80`).

**walk-in-tub-bid-calculator.** The reviewer is a licensed plumber who bids bath remodels. The arithmetic is right, and the default price sits inside published cost-guide ranges. The comparison page against Housecall Pro listed two inputs the tool does not have: a freestanding unit and a valve rough-in. The FAQ said the default hours include "the surround", but the tile surround is off by default. The largest gap is electrical: a whirlpool or air-jet tub needs its own GFCI circuit under NEC 680.71, and the tool adds no cost for it. Two of four seeded bugs survived, one of them dropping the tub count from per-tub extras.

**wash-and-fold-price-calculator.** The reviewer is a laundromat owner who runs a pickup-and-delivery route. Cost per pound, the margin-based price ($2.2231 a pound for 35%) and the loss on a 10 lb order at the $20 minimum all recompute by hand. The worst defect this round is high severity: the volume a profit goal needs was the goal divided by profit per pound, and that per-pound profit already carries the fixed overhead spread over today's volume. Rent got counted twice. Cost-volume-profit arithmetic gives (2,400 + 3,000) / 0.705 = 7,660 lb, or 349 orders. The tool said 9,837 lb and 448 orders, 28% too high. The guide page published those figures as "175 more orders a month". The test pinned the same formula, so it passed.

**mimic-codeloop.** The reviewer is a machine-learning researcher who reviews program-synthesis papers. The numbers are right: `report.py` and the figure script regenerate the committed files byte for byte. The design is the problem. The code model is compared at a budget of 24 candidates. At that budget the baseline already sits at the ceiling, and so does the naive start program, so the result was a tie before the model ran. There is one seed per condition. The failures are blamed on the model, although 17 of 48 come from the sandbox's own banned-token rule, and the token is never logged. Nearest prior work (FunSearch, ELM, Eureka, Self-Debug, Reflexion) is not cited. It is not finished (completeness 2).

**accel-gatedprice.** The reviewer is a low-power architecture researcher. Its energies recompute from the raw Liberty files: the SKY130 `dlclkp_1` clock-gate cell comes to 39.66 fJ against the 39.7 reported, and the experiment rerun is byte-identical. The model gates only the extra accumulators. A gated weight-stationary array must gate every accumulator in a lane, because the one being written rotates. Counting those gates doubles the break-even weight energy on the reference layer. The headline survives, but its figures are those of the narrower model. Energies are also averaged across every input slew, which inflates the GF180 figures by about a third to two thirds. One test checked nothing: its tolerance was 1,000 times the leakage it was meant to allow for.

## What was fixed in this round

All of these fixes are in PR #17540. The scores above are from before them. A later round re-audits.

- **wash-and-fold:** volume for a goal is now (goal + fixed overhead) / contribution per pound. The guide now says 7,660 lb, 349 orders and 76 more a month, in both the table and the FAQ data. A new test feeds the returned volume back through the tool and requires the goal to be met by no more than one pound's contribution over. A page test ties the guide's figures to the engine.
- **walk-in-tub:** the comparison page lists only the tool's real inputs, and the FAQ no longer says a surround is included. Both changes have tests, plus a test with two tubs that kills the surviving tub-count bug.
- **chant-forge:** the README says the arranger is built as MIDI. The test count was fixed in both this PR and PR #17537. A new test fails if either one drifts again.
- **accel-gatedprice:** the test tolerance is now 8.44e-8 pJ, and the tests still pass.
- **Known gaps:** both research READMEs list the open design defects. The walk-in-tub README lists the missing electrical line, and the wash-and-fold README lists the missing delivery fee.

## Since the last round

Round 75 found 0 of 5, and round 76 found 1 of 5. The sampled share is unchanged at about one in ten (33 of 323).

chant-forge is the only re-audit here, and it got an unplanned blind second opinion. Round 76 drew it too, a few minutes earlier, because the flagship rotation picks the least recently audited flagship and neither round had landed yet. The two auditors did not see each other's files. They agree on correctness, completeness, verification and fitness. They split on three dimensions by one point each:

- claims: round 76 gave 3, this round 2;
- craft: round 76 gave 2, this round 3;
- domain: round 76 gave 2, this round 3.

Claims decides the verdict, so the same code at the same commit is "at the bar" in one file and "not at the bar" in the other. The stale "Not built" line in the README is why this auditor gave claims a 2. Round 76 did not flag that line, but did fix the test count and the stale `llms.txt` figure in PR #17537. A one-point disagreement on a gate dimension is enough to flip a verdict, which is worth remembering when reading any single round's count.
