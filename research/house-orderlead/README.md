# house-orderlead: when should a builder order long-lead materials, once holding them costs money?

Project of track 12, open-source residential construction (`PROJECTS.md`, milestone 8). `house-schedule` found that ordering windows, cabinets and HVAC equipment on day 0 cuts 63 working days, but it treated early ordering as free and named that as its main limitation. This project prices it: material that arrives before its task sits on site and costs money, so there is a best order time, and it moves with the cost of holding. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-orderlead/

**Headline (stylised, every cost is my assumption).** **Ordering about two lead times ahead of the planned start beats both the baseline rule and ordering everything on day 0.** With default holding costs it takes the build from 214 to 182 working days and cuts interest plus holding cost from 3.34% to 2.91% of the price. Ordering on day 0 saves more days (151) but its holding cost (1.9% of price) makes the total 4.00%, *worse* than the baseline. When holding is free the best order time is three lead times ahead (total 2.40%); when it is expensive (storage 50%/yr, damage 100%/yr) it is 1.5 (3.65%). So the 63 days in `house-schedule` is the days saved by an extreme policy, not its net benefit. The finding I would defend is the shape: the total has an interior minimum, and it shifts earlier as holding gets cheaper.

**Builds on.** [`house-schedule`](../house-schedule) (its task list, crews, inspections, weather and lead-time model, imported unchanged; with the baseline rule this project reproduces its results exactly, and a test checks it) and [`house-cost`](../house-cost) for the lot and construction shares of the price (NAHB, "Cost of Constructing a Home in 2024", Eye on Housing, 23 Jan 2025). It builds on none of the CU Boulder groups in `prompt.md`.

**Not a design, not a schedule for a real house.** Research code. Nothing here has been reviewed by a licensed professional or tested on a real project.

## Method
- Each material is ordered `k` mean lead times before the day its task is *planned* to start, never before day 0. The plan is each task's mean start over 400 baseline builds (other random seeds than the experiments). k = 0 is just in time on the plan; k = 20 is day 0.
- Material that arrives before its task starts is "on site". Holding cost, as a share of the material's value: financing at 8% a year, a 20% deposit financed from the order date, storage and handling (12%/yr), and expected damage or theft (20%/yr), for the time on site.
- Material values are assumed shares of construction cost: lumber 15%, windows 6%, cabinets 7%, HVAC equipment 5%, concrete 4%, siding 4%, roofing 3%. Construction is 64.4% of the price (NAHB).
- Total cost is schedule interest (as in `house-schedule`) plus holding cost, as a percent of the price. Policies share random numbers, so differences are tight.

## Reproduce
```bash
pip install pytest
cd research/house-orderlead
python -m pytest -q tests                              # 5 tests
python experiments/run.py > experiments/results.txt    # about 20 s, deterministic
python experiments/figure.py                           # experiments/ordering.svg
```

## Results (from `experiments/results.txt`, 3,000 builds per row, working days, % of price)
Default holding costs:

| policy | days | interest | holding | total |
|---|---|---|---|---|
| baseline rule (task before starts) | 213.7 | 3.02 | 0.32 | 3.34 |
| k = 0 (just in time on plan) | 249.8 | 3.53 | 0.22 | 3.75 |
| k = 1 | 214.9 | 3.04 | 0.18 | 3.22 |
| k = 1.5 | 197.9 | 2.80 | 0.23 | 3.02 |
| **k = 2** | 182.2 | 2.57 | 0.34 | **2.91** |
| k = 3 | 159.7 | 2.26 | 0.74 | 2.99 |
| k = 5 | 150.7 | 2.13 | 1.42 | 3.55 |
| day 0 | 150.7 | 2.13 | 1.88 | 4.00 |

- **Cheapest k by holding cost** (storage plus damage per year): 0% gives 3, 32% gives 2, 100% and 200% give 1.5, 400% and above give 1. Days fall from 160 to 215 as it rises.
- **Just in time on the plan is slower than the baseline** (250 against 214 days): half the builds run behind plan, and each late material delays the crew.
- **After k about 3 nothing is gained** (150.7 days): other waits (handoffs, inspections, weather) bind, and more holding is pure cost.

## Limitations
- **Every cost is assumed.** Material shares, deposit, storage and damage rates are my guesses, not data. Only the shape of the curve is a finding, not the location of its minimum.
- **A fixed plan.** Orders are timed from the baseline's planned start days. When early ordering shortens the build, tasks start earlier than that plan, so a re-planned order would be later and cheaper to hold. The optimum here is therefore somewhat early.
- **No price risk or discounts.** Lumber and windows prices move, and bulk or early orders can win or lose a discount.
- **"Free to hold" still charges financing** of the deposit and of the material from delivery, so row B in `results.txt` is not zero holding cost.
- **One house, one crew per trade,** independent delays, all of `house-schedule`'s limits; uncalibrated durations.

## Next steps
Re-plan the order dates from the shortened schedule (iterate to a fixed point); add price drift and an early-order discount; give each material its own k; calibrate holding costs from builder or supplier quotes.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python standard library, `house-schedule` (this repository) and `pytest` for tests. No data, no prices from suppliers.
