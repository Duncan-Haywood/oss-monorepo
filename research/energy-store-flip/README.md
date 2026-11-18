# energy-store-flip: how far must capital costs move to flip the sand-store vs heat-pump verdict, and is that more than the price year moves it?

Track 16 (energy), next step 2 of [`energy-store-modelprice`](../energy-store-modelprice) ("put a confidence interval on the weekly margin by varying the technology-data capital costs, to see how much of the margin is price and how much cost"). [`energy-thermal-real`](../energy-thermal-real) found a house-sized sand heat store beats an air-source heat pump on real German day-ahead prices for daily cycling and mostly for weekly cycling. Here the capital costs are scaled instead of the price. Produced with AI assistance (Claude). No CU Boulder group's work is built on; no connection is claimed.

**Live page:** https://marisstella.app/research/energy-store-flip/

**Known gap (inherited, found 2026-11-17, corrected at source 2026-11-18):** this project prices the store with [`energy-thermal-cost`](../energy-thermal-cost)'s `store_lcoh`, which until 2026-11-18 billed every cycle as a first charge from 10 &deg;C and sized the store with cold insulation. A cycling store only discharges to 100 &deg;C, so the store's electricity here is overstated for daily and weekly cycling (at house size, daily: 0.63 of the heat put in comes back on the old rule, 0.81 at cyclic steady state). The code pins `accounting="first-charge"` so the committed results still reproduce; rerunning with the default `"steady"` and rewriting the headline is the next step. The direction is known: every store result below is too pessimistic for short cycles. See the [audit file](../../portfolio/quality/audits/2026-11-17-energy-thermal-cost.json).

## Headline (German day-ahead prices 2015 to 2019, wholesale, EUR/kWh of heat)
All numbers are in `experiments/results.txt` (deterministic, stdlib only, about 30 s).

- **On one currency basis, weekly cycling at house scale goes to the heat pump in all five years** (section E, added 2026-11-15). The cost table's capex rows are in 2025 euros and the prices are nominal 2015 to 2019 euros. Deflating every capex row to the price year with Eurostat HICP for Germany (factor 0.758 to 0.800; `data/hicp_annual.csv`) turns the house weekly margin from -0.004, -0.005, -0.005, +0.011, -0.000 to **+0.004, +0.003, +0.003, +0.019, +0.007 EUR/kWh** (positive: the pump wins); the euro-area HICP gives the same signs. Lower capex favours the pump because capital is a larger part of its cost of heat (0.062 against the store's 0.027 EUR/kWh), and the common capex multiplier at which they tie (0.85 to 0.99 in the four store years) is above every deflator. With capex drawn within ±10% on this basis the store wins 0 to 23% of draws (±25%: 0 to 38%). **Daily cycling survives** at house scale in all five years (margin -0.013 to -0.001; 2018 is nearly a tie) and **district weekly** in four of five (all but 2018), while district daily loses 2018 too. The bullets below are on the mixed basis of the first version and are kept because the flip multipliers are still the distance to a tie; read them against this one. (Found by the [quality census](../../portfolio/quality/audits/2026-11-15-energy-store-flip.json), high-severity defect.)

- **Weekly cycling flips on a 2 to 41% change in store capex.** House scale, real prices: the store (sand + charger) wins weekly cycling if its capex is below **1.16, 1.20, 1.20, 0.59 and 1.02 times** the PyPSA technology-data value in 2015 to 2019. The table's own vintage step (v0.9.2 to the pinned head, currency-year inflation) is 1.257 times for the store, but the same step moves the heat pump 1.262 times, so the step on the store alone flips nothing: on the newer table the verdict is unchanged, and on the older v0.9.2 table the heat pump wins all five years (diff +0.002 to +0.007 EUR/kWh in the four store years) because its capex falls too. (Corrected 2026-11-15 after the [quality census](../../portfolio/quality/audits/2026-11-15-energy-store-flip.json).) The heat pump's capex flips it at 0.93, 0.91, 0.91, 1.18 and 0.99 times.
- **Daily cycling is robust, monthly and seasonal are not close.** House daily: the store wins up to 3.4, 3.5, 3.4, 2.1 and 2.9 times its table capex (and the heat pump would have to cost 0.57 to 0.81 times its table value). Monthly storage would have to cost 0.06 to 0.14 times the table value to win (no flip in 2018); seasonal storage never wins by cost at house scale.
- **District scale is steadier but not decisive for weekly:** weekly flip multipliers 1.41, 1.43, 1.51, 0.92, 1.33; monthly 0.29 to 0.50.
- **Price year against cost, weekly house.** With both capex values drawn independently and uniformly within 1 ± h (an assumed range), the store wins in 84 to 90% of draws in 2015 to 2017 and 0% in 2018 at h = 0.10, and the mean margin is -0.0008 EUR/kWh. The spread across price years (sd 0.0063) is larger than the spread from costs at h = 0.10 (0.0039) and smaller at h = 0.25 (0.0098); the between-year share of variance is 72% at h = 0.10 and 29% at h = 0.25. For daily cycling the mean margin (-0.022) is 2 to 6 times either spread.

What this says: the earlier "weekly cycling mostly favours the store" did not survive putting costs and prices in the same euros (section E); on the mixed basis it was already a statement about the price year and the cost table together, and neither can be pinned to better than about 20% (cost) or one year (price). What it does not say: that technology-data costs are uncertain by any particular amount. The h values are assumptions, swept so the reader can pick one.

## Method
`src/energy_store_flip/model.py`; `experiments/run.py`.
1. Cost model, prices and heat-pump price exactly as `energy-thermal-real` (head_2030 technology-data, cheapest quarter of each cycle window, heat pump pays the November to March mean), imported unchanged. The transient sizing in `energy-thermal` does not depend on cost, so it is cached.
2. `m_store` multiplies the Sand-store and Sand-charger capex, `m_hp` the heat-pump capex (both scales). Nothing else changes.
3. **A.** For each scale, cycle and year, bisect (log scale, 0.05 to 20) for the multiplier at which store minus pump is zero, varying one cost at a time. **C.** Share of 1,000 draws (seed 20261023) in which the store wins. **D.** Variance of the margin split into between-price-year and within-year (cost) parts, 500 draws (population variance over the five years, ddof 0). **E.** The same margins with every capex row multiplied by HICP(price year)/HICP(2025), Germany and euro area, plus the common capex multiplier at which store and pump tie and the section C draws on that basis.

## Inputs
| Input | Value | Source |
|---|---|---|
| Hourly prices, loads | Germany 2015 to 2019 | OPSD (2020) / ENTSO-E, CC BY 4.0, via `energy-thermal-real` |
| Store and heat-pump costs | head_2030 | PyPSA technology-data, via `energy-thermal-cost` |
| Vintage ratio 1.257 / 1.262 | v0.9.2 vs pinned head | `energy-thermal-cost/data/params.csv` (Sand-store 8425.2/6700.9; decentral heat pump 1135.4/899.5) |
| Deflator 2025 euros to price-year euros | DE 0.7582, 0.7612, 0.7741, 0.7885, 0.7998 (2015 to 2019); EA20 0.777 to 0.814 | Eurostat HICP all items, annual average index, `prc_hicp_aind` (`data/hicp_annual.csv`, regenerated by `data/fetch_hicp.py`) |
| **Not from a source** | cost half-width h = 0.10, 0.25, 0.50 (uniform, independent); charge fraction 0.25 | assumptions, swept or labelled |

## Reproduce
```
cd research/energy-store-flip
python experiments/run.py > experiments/results.txt   # 30 s
python -m pytest tests                                # 11 tests
python data/fetch_hicp.py > data/hicp_annual.csv     # Eurostat HICP, only to refresh
```

## Tests and checks
11 tests: the base case reproduces `energy-thermal-real`'s weekly house margins (-0.004, -0.005, -0.005, +0.011, -0.000); `scaled` touches only the named rows; the margin rises with store capex and falls with heat-pump capex; a flip multiplier is a zero of the margin; seasonal store cost has no flip; draw endpoints and variance split (with no cost spread it equals the population variance of the base margins); the deflator against Eurostat's index by hand; the one-currency signs of section E.

## Limitations
- Five price years, each one cell; the 2018 year is the only one where the pump wins weekly, so "price year" spread is mostly one year.
- Only capex is scaled, jointly for store and charger. Lifetime, O&M, efficiency, COP, discount rate and the 2000 full-load hours are fixed. The heat exchanger is not costed (it favours the store, per `energy-thermal-cost`), so the real flip points sit lower for the store than shown.
- h is an assumed range, not a fitted one; the vintage ratio is inflation, not technical uncertainty. Independent uniform draws ignore correlated cost movements.
- Wholesale prices, no levies; no data after 2019.
- The deflator is the all-items consumer index (HICP), not a capital-goods index. A capital-goods deflator would give a different factor; the pump wins house weekly in all five years for any factor below 0.85 (the lowest joint tie, 2017), and the store regains all four of its years only above 0.99. Sections A to D stay on the mixed basis.

## Next steps
1. Cost ranges from the technology-data source columns (low and high estimates) in place of an assumed h.
2. Add the heat exchanger and a measured heat-pump COP by temperature to see whether the weekly store survives at all.
3. Fuel/carbon regressor for the price model (`energy-store-modelprice` step 1) once post-2019 data are reachable.

## Outside dependencies
Data and code of `energy-thermal-real`, `energy-thermal-hourly`, `energy-thermal-cost` and `energy-thermal` in this repository. Python standard library only.

MIT.
