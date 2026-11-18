# Forty California homes with solar (ResStock AMY2018 release 2), run through home-battery-planner

Written by `node check/resstock-check.mjs DIR` from the CSVs `check/resstock_ca.py` writes. Building simulations on real 2018 weather, not meters; the rate plans are the page's invented examples (A: 4-9 pm peak with a low export credit, B: the same import prices with export at import minus $0.03). Battery: 13.5 kWh usable, 5 kW, 90% round trip, 20% backup reserve, no grid charging. 40 homes; 0 hour(s) filled by the reader in total (the spring-forward hours).

## Plan A: Example A, 4-9 pm peak, low export credit (invented prices)

| | 25th pct | median | 75th pct |
|---|---:|---:|---:|
| Yearly bill, no battery ($) | 937 | 2,049 | 2,945 |
| Saving, self-powered ($/yr) | 562 | 691 | 878 |
| Saving, time-based ($/yr) | 100 | 192 | 326 |
| Saving, perfect-foresight ceiling ($/yr) | 592 | 732 | 900 |
| Self-powered as a share of the ceiling | 94% | 97% | 98% |
| Time-based as a share of the ceiling | 13% | 25% | 59% |

Self-powered saved more than time-based in 40 of 40 homes.

Size sweep, median saving across the homes ($/yr), and the median extra saving per extra usable kWh over the next smaller size:

| usable kWh / kW | ceiling | self-powered | extra $/yr per extra kWh (ceiling) |
|---|---:|---:|---:|
| 5 / 3.8 | 426 | 418 | 85.1 |
| 10 / 5 | 669 | 645 | 48.5 |
| 13.5 / 5 | 732 | 691 | 20.8 |
| 20 / 7.6 | 773 | 716 | 7.0 |
| 27 / 10 | 780 | 724 | 1.6 |
| 40 / 11.5 | 787 | 728 | 0.6 |

## Plan B: Example B, same prices, export credited at import minus 0.03 (invented)

| | 25th pct | median | 75th pct |
|---|---:|---:|---:|
| Yearly bill, no battery ($) | -791 | 930 | 2,136 |
| Saving, self-powered ($/yr) | -50 | -12 | 18 |
| Saving, time-based ($/yr) | 22 | 39 | 78 |
| Saving, perfect-foresight ceiling ($/yr) | 142 | 239 | 303 |
| Self-powered as a share of the ceiling | -22% | -6% | 13% |
| Time-based as a share of the ceiling | 8% | 23% | 60% |

Self-powered saved more than time-based in 0 of 40 homes.

Size sweep, median saving across the homes ($/yr), and the median extra saving per extra usable kWh over the next smaller size:

| usable kWh / kW | ceiling | self-powered | extra $/yr per extra kWh (ceiling) |
|---|---:|---:|---:|
| 5 / 3.8 | 128 | 21 | 25.7 |
| 10 / 5 | 215 | -3 | 17.0 |
| 13.5 / 5 | 239 | -12 | 6.9 |
| 20 / 7.6 | 246 | -30 | 0.8 |
| 27 / 10 | 246 | -34 | 0.1 |
| 40 / 11.5 | 248 | -36 | 0.1 |
