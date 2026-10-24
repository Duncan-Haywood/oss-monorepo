# Car Hauler Load Planner

A free browser tool for car haulers: **paste the vehicles on your dispatch board with their pickup and drop miles, describe your two-deck trailer, and get which cars to carry and which deck each rides on** to net the most, with the lowest pay worth taking for each car.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/car-hauler-load-planner/

After using this, you can **build a load from a long board and counter-offer with a number**, instead of filling the trailer with the best-paying cars first and finding at mile 300 that the cars picked up later no longer fit.

## Model

- One route measured in miles from its start. Each offer has a pickup mile, a drop mile, a pay, a length and a weight (a vehicle type such as `sedan`, `suv`, `pickup`, `van`, `hdpickup` fills in typical length and weight; override either).
- A car holds its deck from pickup until drop (half-open: a car dropped at mile m frees space for one picked up at m). At every pickup mile, per deck: lengths plus gaps fit the deck; total weight fits the payload; the upper deck stays under its weight cap; cars over the lower-deck-only weight never ride up. Each car keeps its deck for the whole trip.
- Net per car = pay - handling - detour miles x cost per detour mile. The search picks the subset and deck assignment with the highest total net.
- Search: exact branch and bound over (skip, lower, upper) per offer, pruned by two fractional-knapsack bounds (deck length x miles, and weight x miles). Tests check it against exhaustive search on random small boards. If the node budget runs out on a very large board the page says the answer is best found, not proven.
- Lowest pay worth taking: per offer the whole load is re-solved with that car banned (carried cars: how far its pay could fall before the plan without it ties) or forced in (left cars: the pay at which it would just earn a place). Tests re-solve at that pay to confirm the tie.
- Compared against first-fit taking the best-paying cars first.

Not modelled: axle and bridge weights, height and ramp limits, the order cars must unload in, reshuffling cars between decks, inoperable or oversized vehicles, driver hours, deadhead to the first pickup, broker fees, whether listed pay is paid.

Up to 24 offers. Vehicle lengths and weights are typical figures, not specs for any model.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
