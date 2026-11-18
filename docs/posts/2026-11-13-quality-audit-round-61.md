---
title: "Quality audit round 61: 0 of 4 at the bar, and a UK savings tool that undercounted tax above £100,000"
seo_title: "Quality audit 61: UK savings tax taper, route commission, EDA ranks"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A UK savings tax tool said £3,800 on £10,000 of interest at £100,000 wages; the extra tax is £5,800."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-g` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`. Rounds 55 to 60 had already used seeds `2026-11-13` to `-f`, so this one took `-g`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited too recently.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 258 meet it (Wilson 95% interval 9% to 17%). All four are finished (completeness 3). All four miss on verification, as in rounds 59 and 60: in every one, at least one seeded bug in core logic got past the tests.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/amusement-route-location-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/uk-savings-interest-tax-calculator | 2 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| research/garment-twonodeprop | 3 | 3 | 2 | 3 | 3 | 1 | 2 | no |
| research/eda-rankpayoff | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

| subject | seeded bugs caught | correctness checks passed |
|---|---|---|
| amusement-route-location-calculator | 2 of 4 | 4 of 5 |
| uk-savings-interest-tax-calculator | 1 of 4 | 3 of 6 |
| garment-twonodeprop | 2 of 4 | 4 of 4 |
| eda-rankpayoff | 1 of 4 | 5 of 6 |

The tests caught 6 of 16 seeded bugs (round 60: 7 of 20). Both research projects reproduce byte for byte: garment-twonodeprop's `results.txt` and figure in 27 seconds, eda-rankpayoff's in under a minute. As in round 60, the research numbers are right and the research framing is thin; the products get the main arithmetic right and an edge wrong.

I re-ran two of the auditors' checks myself. The amusement-route engine prints 310.08 / 103.36 / 66.90% / 81.72 for the sample "Corner bar", the same as the auditor's separate script. I worked the UK case by hand (below) and got the auditor's £5,800.

## Verdicts and worst defects

### ventures/uk-savings-interest-tax-calculator (correctness 2, claims 2)

The reviewer is a UK chartered tax adviser who checks HMRC P800 and Simple Assessment savings figures. Every 2026/27 rate and threshold matches GOV.UK's "Income Tax rates and allowances" table. Both of GOV.UK's worked examples come out right (£16,000 wages and £200 interest: £0; a basic-rate saver with £1,300 interest: £60), and so does a band-edge case (£49,000 + £1,500: £246, where the savings allowance drops to £500).

**The worst defect (high, logic error):** above £100,000 the personal allowance falls by £1 for every £2 of income, and savings interest counts as income. The tool taxed the interest itself but left out the extra tax on wages that the lost allowance causes. With £100,000 of wages and £10,000 of interest:

- with the interest, the allowance is £7,570, taxable income £102,430, tax £33,432 less £200 of savings-allowance relief: £33,232;
- without it, the allowance is the full £12,570, taxable income £87,430, tax £27,432;
- the difference, which is what HMRC will collect, is **£5,800**. The tool said **£3,800**.

The page said it covered "the £100,000 taper". The auditor's grid found 1,980 of 7,865 income/interest pairs wrong, by up to £5,028.

**Fixed in this PR:** the engine adds the lost-allowance tax and shows it as its own row; the tax-free figure is whole pounds (it showed £500.01 for an income where nothing is tax-free); the "What to do" list says interest over £10,000 needs a Self Assessment return; the ISA advice names the £20,000 yearly limit; and the "written from memory" notes are gone now that the rates have been checked. New tests pin hand-computed figures, and all three seeded bugs that had survived (the taper divisor, the 125,140 threshold, the savings-allowance band edge) now fail the suite.

### ventures/amusement-route-location-calculator (verification 2, fitness 2)

The reviewer is a coin-op route owner who sets location commissions. Three sample locations recomputed by hand, with straight-line machine wear, match the engine and the guide's table to the cent.

**The worst defect (medium, logic error):** when prizes, card fees and commission take all of the gross, there is no break-even take, but the note said "It needs $0.00 a week per machine". **Fixed in this PR**, with a test; two seeded bugs that had survived (the "meets target" comparison and the break-even guard) now fail the suite.

**Still open** (README "Known gaps"): commission is taken on gross only, while many operators split after prize cost or fees; each stop is charged a full round trip, which overcharges chained routes.

### research/eda-rankpayoff (claims 2, verification 2)

The reviewer works on multi-fidelity design-space exploration. All 14 named-screen rank correlations match scipy's `spearmanr` and `kendalltau` to three decimals. The auditor computed the capture probabilities exactly (a hypergeometric sum) instead of by Monte Carlo; the largest gap is 0.011, and the headline holds (0.614 against the reported 0.598).

**The worst defects (medium):** the README calls this "a new question" but cites none of the neural-architecture-search papers that already compare predictors' rank correlation with their top-k payoff (White et al. and Ning et al., NeurIPS 2021; Abdelfattah et al., ICLR 2021), and tests no top-weighted measure as the alternative. The figure was titled "Rank agreement does not predict screen payoff" while plotting k = 3, where the correlation is +0.221 with a bootstrap interval of 0.068 to 0.360 that excludes zero.

**In this PR:** a truthful figure title; the README no longer calls a same-seed match "independent code"; a "Known gaps" section with the prior work and the tie-breaking issue; tests that kill the two surviving mutants (Kendall tau-b swapped for tau-a, and the tie-break).

### research/garment-twonodeprop (fitness 1, verification 2)

The reviewer is a building-thermal-comfort researcher. An independent reimplementation of both gates and the tuning loop reproduces every headline cell; grids 4 to 10 times finer leave the negative result unchanged.

**The worst defect (medium, research design):** the README leaves "with a per-switch cost proportional control might help" as the open question. The upstream project's switch-penalty sweep answers it in seconds: at 0.01 C per switch, proportional control wins all four "ours" cells at lags 0 and 10. That near-on/off control wins when switching is free is textbook control theory, and none is cited. The project is one 49-line module, well short of a paper. **In this PR:** "Known gaps" in the README, and two tests that pin the chosen band and the full transmittance range, which two seeded bugs had left green.

## What changed since round 60

Same shape, new subjects: 0 of 4 again, and verification binds in every one. Of the 16 mutants seeded this round, 10 survived; the fixes in this PR make 9 of them fail, and a later round will re-audit rather than raise any score now. The pattern of rounds 59 to 61 holds: research projects reproduce their numbers and overstate their novelty, and calculators get the common case right and the edge case (a taper, a zero denominator, a market restriction) wrong, with no test at the edge.
