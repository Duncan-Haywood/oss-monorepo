# Demand Charge Interval Analyzer

A free browser tool for businesses billed a demand charge: **paste your utility's 15-minute interval data and see what your worst 15 minutes cost each month**, whether a ratchet is carrying an old peak forward, and what holding demand to a lower cap would save and require.

**Live tool:** https://marisstella.app/demand-charge-interval-analyzer/

After using this, you can **tell whether your bill is set by a short spike you can shave or by a sustained load you cannot**, and size a peak-shaving battery or a load-staggering fix against real numbers instead of a vendor's estimate.

## Model

Readings are parsed as wall-clock timestamps plus a usage column (kW, or kWh per interval converted by interval length). Per month: peak = highest interval kW, billed = max(peak, ratchet% x highest peak of the prior 11 months in the data), charge = billed x rate, load factor = average / peak. A cap sweep recomputes billed demand with every interval limited to 97%...70% of the highest peak; saving = (charge before - after), scaled from complete months to 12. Battery energy = the largest contiguous stretch of kWh above the cap, divided by the usable share; cost = energy x $/kWh + kW shaved x $/kW; payback = cost / yearly saving.

**Battery dispatch (`battery.mjs`, 2026-11-01).** Sizes are run through your readings, not estimated from the worst stretch. For a fixed cap on grid draw the best control is greedy (discharge above the cap, recharge as fast as the cap and inverter allow), and it is exact for feasibility: if any control holds the cap, this one does. Feasibility only gets easier as the cap rises, so each month's lowest holdable cap is found by bisection; the ratchet is then recomputed from the shaved peaks (lower early peaks only lower later floors, so month-by-month is optimal). One-way efficiency is the square root of the round trip; loss kWh x your energy price is subtracted from the saving. Tests (`battery.test.mjs`) check the cap is tight (feasible at it, infeasible just under it) on random series, the kW-limited and kWh-limited cases by hand, and the ratchet. Not checked: any real site's bill, or a real controller. Perfect foresight of the month, a full battery at each month's start, no degradation: an upper bound on real savings.

**Time-of-use bill and energy arbitrage (`tou.mjs`, 2026-11-11).** Optional inputs: an on-peak window (start hour, end hour exclusive, weekdays only or every day), an on-peak demand charge, and on-peak and off-peak energy prices. The bill is facility demand (with the ratchet) + on-peak demand + energy. One battery (the size you enter, else the fastest-payback size from the sweep) is planned per month in two steps: (1) the facility and on-peak caps with the lowest demand cost it can hold, found by a 32-point scan of the facility cap, a 16-point refinement, and for each facility cap a bisection on the on-peak cap, using the greedy controller generalised to a cap that changes by interval (still exact for feasibility); (2) a backward dynamic programme over state of charge, about ten charge levels per interval's worth of inverter power, that minimises the energy bill within those caps with no export and the inverter limit, starting full and paying to refill at the cheapest price at month end. Each month keeps the cheapest of no battery, greedy peak shaving, the programme at the caps, and the programme with no caps (energy only). Tests (`tou.test.mjs`) check the window flags (weekends, wrap past midnight), the arbitrage saving against hand arithmetic (lossless: kWh x spread x weekdays; 81% round trip: 0.9 x 40 x on-peak price - 40 / 0.9 x off-peak price per day, within 1%), that a spread below the loss is not traded, that an off-peak spike is left alone when only on-peak demand is charged, that the on-peak cap is tight, and that no month is ever billed more than without a battery. Steps (1) then (2) is not a joint optimum of demand and energy cost. A year of 15-minute data takes about a second in a browser.

Not modelled: holidays, seasonal or mid-peak windows, seasonal demand rates, power-factor charges, degradation, incentives, controls, tariff changes, export credits.

## Run

Open `index.html` through any static server. Tests: `node --test *.test.mjs`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, engineering or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded; pasted data and chosen files are read in your browser only. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
