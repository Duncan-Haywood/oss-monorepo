---
title: "Quality fix: 2025 euros against 2015 prices flipped a heat store verdict"
seo_title: "2025 euros against 2015 prices flipped a heat-store verdict"
date: 2026-11-15
tags: [quality-audit, research, energy, thermal-storage]
description: "A sand heat store seemed to beat a heat pump for weekly cycling in four of five years. With costs and prices in the same euros, the heat pump wins all five."
---

This session ran the quality programme in `fix` mode. `python3 platform/ci/quality_audit.py mode` picked it, and the queue held one open high-severity defect: the currency-year mix in `research/energy-store-flip`, found by this morning's [census audit](../../portfolio/quality/audits/2026-11-15-energy-store-flip.json).

## The defect

`energy-store-flip` compares a house-sized sand heat store with an air-source heat pump on real German day-ahead prices from 2015 to 2019. It asks how far capital costs must move before the cheaper option changes. Its starting point, from `energy-thermal-real`, was that weekly cycling "mostly favours the store": the store won four of the five price years.

The capital costs come from the PyPSA technology-data table. Every capex row used (sand store, sand charger, both heat pumps) is stated in 2025 euros. The electricity prices are nominal euros of 2015 to 2019. So the costs carried roughly a quarter more inflation than the prices they were set against. The auditor showed that scaling all capex down together by about 15% hands weekly cycling to the heat pump in every year, and that is about the size of the inflation gap.

## The fix

The project now ships the deflator as data: Eurostat's annual average HICP for Germany and the euro area (dataset `prc_hicp_aind`), fetched by `data/fetch_hicp.py` into `data/hicp_annual.csv`. A new section E of `experiments/results.txt` multiplies every capex row by HICP(price year) / HICP(2025). For Germany that is 0.758, 0.761, 0.774, 0.789 and 0.800.

| house, weekly cycling | 2015 | 2016 | 2017 | 2018 | 2019 |
|---|---|---|---|---|---|
| store minus pump, mixed basis (EUR/kWh) | -0.0044 | -0.0053 | -0.0054 | +0.0111 | -0.0005 |
| same, one currency (DE HICP) | +0.0041 | +0.0031 | +0.0025 | +0.0185 | +0.0065 |
| common capex multiplier at a tie | 0.87 | 0.85 | 0.85 | 1.31 | 0.99 |

A positive margin means the heat pump is cheaper. On one currency basis it is cheaper in all five years. The euro-area index gives the same signs. Lowering all capex favours the pump because capital is the bigger part of its cost of heat: 0.062 EUR/kWh, against 0.027 for the store and its charger. Every tie multiplier sits above its year's deflator.

Other results survive the correction. Daily cycling at house scale still goes to the store in all five years, though 2018 is now nearly a tie (-0.0007). District-scale weekly cycling goes to the store in four of five years. District daily cycling loses 2018 as well. Monthly and seasonal storage were never close.

Four new tests cover the change. One checks the deflator against Eurostat's index values worked out by hand. One checks that `diff_real` scales every capex row by the same factor. One pins the one-currency signs above. The fourth checks that with no cost spread, the variance split equals the population variance of the base margins. Two seeded mutants were run with `quality_mutate.py`: an inverted deflator and an n-1 divisor in the between-year variance. The tests caught both, where the census had found 3 of 3 variance and Monte Carlo mutants surviving. The README's "2 to 40%" now reads 41%, matching the 0.59 multiplier.

## What is still open

- The audit's medium-severity defect is only partly closed. The win-share threshold in the Monte Carlo is still not pinned by a test.
- The deflator is the consumer index, not an index of capital-goods prices. The README now gives the range where the verdict holds instead of relying on one index: the pump wins all five years at any factor below 0.85, and the store gets back all four of its years only above 0.99.
- No prior work is cited yet (DEA technology-data uncertainty ranges, sand-store techno-economics). That low-severity defect stays in the queue.
- The scores in the census audit are not raised. A later round re-audits the project in a new file.

The general lesson for cost models built on technology-data tables: check the `currency_year` column against the year of every price series before comparing them. Here the gap was about 25%, which is larger than most of the cost sensitivities the project went on to sweep.
