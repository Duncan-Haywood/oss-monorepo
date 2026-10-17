# house-schedule: how much do fewer handoffs, parallel trades, early ordering and a factory shell cut the time to build a house, and the interest paid meanwhile?

Seventh project of track 12, open-source residential construction (`PROJECTS.md`, milestone 8). It is a Monte Carlo discrete-event model of one house build: a crew per trade, inspections that can fail, weather that stops exterior work, and material lead times. It compares schedule levers against a baseline with the same random numbers. Produced with AI assistance (Claude).

**Headline.** In this stylised model the biggest schedule lever is **ordering long-lead materials (windows, cabinets, HVAC equipment) at day 0 instead of when the preceding task starts: 214 to 151 working days (-63 d, saves 0.9% of the price in interest)**. Cutting crew handoff gaps from 2.0 to 0.5 days saves 21 d, parallel rough-in 12.5 d, and faster inspections 11 d. **A factory-built wall and roof shell saves only 6 d if it is ordered when the foundation starts, because its 25-day lead time is longer than the foundation takes; ordered at day 0 it saves 78 d.** All levers together: 96 working days, 1.7% of the price in interest at 8%. The finding that survives my assumptions is the shape: the schedule is driven by waiting, not by work (the zero-noise critical path is 100 days; the baseline mean is 214).

**Builds on.** [`house-cost`](../house-cost) for the lot and construction shares of the price (NAHB, "Cost of Constructing a Home in 2024", Eye on Housing, 23 Jan 2025, <https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/>), used only to size the interest. The task list follows the usual order of residential trades; it is not copied from any source. I did not use the Census Survey of Construction's time-to-complete figures and did not calibrate to them. It builds on none of the CU Boulder groups in `prompt.md`; track 4's manufacturing loops are related to the factory-shell lever only in spirit.

**Not a design, not a schedule for a real house.** Research code. Every duration, probability and lead time is my assumption. Nothing here has been reviewed by a licensed professional or tested against a real project.

## Method
- 20 tasks (`src/house_schedule/model.py`, `TASKS`) in dependency order from site prep to the final inspection: foundation, 7-day cure, framing, roof, windows, plumbing, electrical and HVAC rough-in, insulation, drywall, paint, cabinets, flooring, siding, finish plumbing, and five inspections.
- One crew per trade (the framer also sets windows, the plumber also does finish work). A task starts at max(predecessors done, crew free, materials arrived) plus an exponential handoff gap (mean 2 d): the crew arriving late.
- Durations are lognormal (sigma 0.2, mean preserved). Exterior tasks stretch by the expected weather loss (15% of days) with uniform noise. Lead times are lognormal (sigma 0.3).
- Inspections: 1 d plus an exponential wait (mean 3 d); 15% fail and cost 3 d of rework plus another wait.
- Materials are ordered when the task's first predecessor starts (lumber and the shell: when the foundation starts), unless `order_early`, which orders everything at day 0 with no carrying cost.
- Interest: 8% a year on the lot from day 0 plus half the construction cost (drawn linearly), as a percent of price, from NAHB's 13.7% and 64.4% shares. A loan structure would change this.
- Scenarios share random numbers (common random numbers), so the differences are tight: standard errors of 0.05 to 0.26 days on 4,000 builds.

## Reproduce
```bash
pip install pytest
cd research/house-schedule
python -m pytest -q tests                      # 6 tests
python experiments/run.py > experiments/results.txt   # a few seconds, deterministic
python experiments/figure.py                   # experiments/schedule.svg
```

## Results (from `experiments/results.txt`, 4,000 builds each, working days)
| scenario | mean | p10 | p90 | change | interest, % of price |
|---|---|---|---|---|---|
| baseline | 213.6 | 189.6 | 239.4 | | 3.02 |
| fewer handoffs (gap 2.0 to 0.5 d) | 192.6 | 170.5 | 216.5 | -21.0 | 2.72 |
| faster inspections (wait 3 to 1 d, fail 15 to 5%) | 202.4 | 180.5 | 225.5 | -11.1 | 2.86 |
| rough-in trades in parallel | 201.1 | 177.2 | 226.7 | -12.5 | 2.84 |
| order all materials at day 0 | 150.7 | 135.0 | 167.5 | -62.9 | 2.13 |
| factory shell | 207.1 | 183.1 | 233.2 | -6.4 | 2.93 |
| factory shell, ordered at day 0 | 135.2 | 120.4 | 151.3 | -78.3 | 1.91 |
| all of the above | 95.9 | 86.4 | 106.4 | -117.6 | 1.35 |

- **Waiting dominates.** Zero noise gives 100 days; handoffs, inspection waits and failures, weather and late materials take the baseline to 214. The levers that remove waiting beat the one that speeds work.
- **The shell needs its order placed early.** Panels with a 25-day lead time, ordered at the foundation start, arrive after the foundation and cure (15 d) plus the inspection: the site sits idle. Offsite construction pays only with early commitment to a design.
- **Weather helps the shell a little.** Its saving rises from 76 to 82 days as exterior weather loss goes from 0 to 30%, since the shell cuts exposed days.
- **Interest scales with the rate.** The all-levers saving is 0.8, 1.7 and 2.5% of the price at 4, 8 and 12%.

## Limitations
- **The big result rests on my ordering rule.** "Order at day 0" looks large because the baseline orders windows (30 d lead) and cabinets (35 d) only when the previous task starts, so the crew waits. A builder who orders earlier is closer to the "early" case already. Treat the 63 days as the cost of that specific habit, not a general number.
- **Nothing is calibrated.** Durations, gaps, failure and weather rates are guesses. The baseline (214 working days, about ten months) was not checked against Census or builder data. Absolute times are not evidence; the ordering of levers is the model's output.
- **Early ordering is free here.** No deposit, storage, damage or price-change risk. A factory shell has no transport limit, crane cost, design freeze or extra cost either (those are `PROJECTS.md` milestone 7, `house-offsite`).
- **One house, one crew per trade, no overlap within a trade,** no labour shortages, no permit wait before day 0, no change orders, no seasonal calendar (weather loss is the same every day).
- **Independence.** Gaps, failures and delays are independent across tasks; real delays cluster (one bad subcontractor, one wet month).

## Next steps
Calibrate durations and the baseline to a published completion-time distribution; add a seasonal weather calendar and a permit wait; price the carrying cost of early ordering and the factory shell with `house-cost`, then give `house-offsite` the panel layout and transport limits.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python standard library only. The NAHB shares come from `house-cost`'s sourcing.
