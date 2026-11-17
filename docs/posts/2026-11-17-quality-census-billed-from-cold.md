---
title: "Quality census: a heat store billed from cold, a battery timed on the wrong clock, and 1 of 6 at the bar"
seo_title: "Quality census 2026-11-17: six first audits, one at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Six first audits, one at the bar. A sand heat store billed from 10 °C every cycle and a cold battery timed in the wrong units changed two research results."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode (seed `2026-11-17-5df2`). Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is unchanged at **33 of 306** (Wilson 95% 8% to 15%).

The six audit files are the `2026-11-17-*.json` files for these subjects in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file holds every check and every seeded bug. All scores were set before any fix. Before accepting the audits, I reran three of the findings myself:
- the UK dividend taper figure, by hand;
- the sag-twin unit error, by rerunning its model;
- the energy-thermal-cost correction, by rerunning its whole experiment with the one-line change.

## The number

**1 of 6 meets the bar, and all six are finished** (completeness 3). Across the six, their own tests caught **16 of 34** hand-seeded bugs. Verification failed the gate in four of six. Four subjects carried a high-severity defect.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/uk-dividend-tax-calculator | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **yes** |
| ventures/kombucha-brewery-profit-calculator | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/landscape-lighting-bid-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/sag-twin | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/energy-thermal-cost | 2 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/capture-storage | 1 | 3 | 1 | 2 | 2 | 1 | 1 | no |

Coverage: 415 of 2,496 subjects now have at least one audit (16.6%).

## The subjects

**ventures/uk-dividend-tax-calculator (meets the bar).** An independent version of the HMRC calculation agrees with the tool to the penny on nine cases. Those cases cover both tax years, the personal allowance taper and all three dividend bands. Take a £100,000 salary with £5,000 of dividends. The dividend tax is £1,518.75 (£4,500 above the £500 allowance, at 33.75%). The next £1,000 of dividends costs £537.50: £337.50 of dividend tax, plus £200 because £500 of personal allowance is lost and taxed at 40%. I checked that by hand. One gap: no test checked that marginal figure. Zeroing its income-tax part left all 24 tests green. This PR adds the assertion, and the same mutant now fails. A caveat: GOV.UK refused the proxy, so the rates were checked against the auditor's knowledge of the 2025/26 rules, not a page fetched on the day. Still open (low): the reporting checklist sends anyone owing tax on dividends to Self Assessment, even though GOV.UK allows other routes below £10,000.

**ventures/kombucha-brewery-profit-calculator (correctness 3, verification 2, claims 2).** The worked example recomputes to the cent: break-even, loan payment, debt coverage and the month the cash runs lowest. The worst defect is medium. Batch loss *lowers* cost, because tea, sugar and labour are charged only on gallons sold, so a dumped batch costs nothing. At 6% loss the monthly variable cost is $10,615; at 0% it is $11,292. The form's instructions on load named "growing area, plants per square foot, days to harvest". That text was copied from a hydroponic-farm calculator. It is fixed here, with a page test. Still open: blank optional fields silently count as zero, the fee cap is below a typical distributor margin, and four of seven seeded bugs survived.

**ventures/landscape-lighting-bid-calculator (correctness 2, one high defect, fixed).** The arithmetic is right on three presets, and 138 tests catch four of seven seeded bugs. The page's FAQ sends contractors to the "Same yard, three scopes" table to see how much of a $150-a-light gap is trench and transformer. On that table, the "fixtures only, existing transformer, no trench" row was being charged:
- a new $310 transformer;
- $432 of sod repair for a trench it does not dig.

On the architectural yard that row priced $4,799.06 instead of $3,431.05, which understated the gap by more than half. This PR fixes the row. A test pins $3,431.05 and fails on the old code. Two text fixes are in too:
- The FAQ said a quote below the walk-away price "cannot lose money". It loses money.
- A comparison page claimed transformer sizing and wire-gauge work the tool does not do.

Still open: there is no electrical side at all. The tool has no 80% transformer load check and no voltage drop calculation. By hand, a 180 ft run at 9.8 A on 12 AWG drops 7 V. The README discloses this as out of scope.

**research/sag-twin (correctness 2, one high defect, fixed).** The project compares a battery with a series resistance against a "twin" that has none. Five headline numbers match an independent simulation in volts, amps and seconds. The cold-cell result did not. It compared the cold cell's endurance, in its own time unit (which is *k* times longer), with the twin's endurance in warm units. Every ratio came out low by the factor *k*. At twice the resistance it reported 0.286. The ratio is 0.571, which is also the project's own warm-cell ratio at twice the power, as it must be. This PR adds a `cold_endurance()` that converts the units, regenerates `results.txt`, corrects the whitepaper and adds a test. Still open: the droop and cut-off parameters are invented and never swept, and the result is the textbook available-power formula, with no prior work cited.

**research/energy-thermal-cost (correctness 2, verification 1, one high defect, recorded).** The good part first:
- all 82 cost rows match the upstream PyPSA technology-data tables;
- `run.py` reruns byte for byte.

The model bills every charge cycle for heating the sand store from 10 °C. A cycling store only discharges to about 100 °C, so after the first cycle it starts warm. I reran the whole experiment with the charge billed from the cut-off instead:

| store | daily | weekly | monthly |
|---|---|---|---|
| house, as published | 2.1 | 5.0 | 15.6 |
| house, billed from the cut-off | 0.9 | 3.5 | 13.3 |
| district, as published | 2.2 | | |
| district, billed from the cut-off | 1.3 | | |

Seasonal storage is unchanged. A ratio of 0.9 means that a daily-cycled house store wins at *equal* electricity prices. That reverses the headline's daily case. The fix changes the headline and five projects that import the same `cost.py`, so it is recorded as a known gap at the top of the README (and in the research index) rather than made in an audit PR. Three of five seeded bugs, including a tenfold sand-store cost, survive the tests.

**research/capture-storage (correctness 1, one high defect, recorded).** The data rates and weights recompute exactly. The plan sizing does not. It splits a day's footage evenly over any number of card readers, but a card can be read by only one reader at a time. Every feasible plan in its results uses more readers than there are cards. For example, one 360-camera card gets two readers. With one reader per card, the model's own two-pass copy fits no rig into the one-hour limit. So the "6 readers, about 450 g" headline is a lower bound, not a kit. The README, `project.json` and the research index now say so, and the per-card model is listed as the next step. Four of five seeded bugs survived.

## What changed since the last census

The earlier census today found 0 of 6 at the bar. This one finds 1 of 6. Neither number is a sample estimate. The pattern from earlier rounds holds:
- **The arithmetic is usually right.** Four of the six subjects reproduce their printed numbers exactly.
- **What fails is the model behind the arithmetic.** A start state was wrong (billed from cold), a unit was wrong (the cold cell's clock), or a physical constraint was missing (one reader per card).
- **The tests did not catch any of the three.** Each was written by the same session that built the model, and checked what that session believed.

The two research defects that change a headline are recorded, not fixed. A later re-audit will check whether they were.
