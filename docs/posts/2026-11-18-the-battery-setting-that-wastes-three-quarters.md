---
title: "Self-Powered or Time-Based? On Forty Solar Homes, One Battery Setting Saved Nearly Four Times the Other"
seo_title: "Home Battery Self-Powered vs Time-Based Mode, Measured"
date: 2026-11-18
tags: [energy, batteries, solar, green-button, website]
description: "Forty simulated California solar homes, hour by hour: with a low export credit, self-powered reached 97% of the best possible saving and a peak-only rule 25%."
---

Most home batteries offer two settings. *Self-powered* stores solar the house isn't using and spends it whenever the house would draw from the grid. *Time-based* holds the charge for the expensive evening hours. Under a time-of-use rate, time-based sounds like the obvious choice. We built a [home battery planner](/home-battery-planner/) that replays a battery through a year of a household's own smart-meter data, then ran forty homes through it. Under a low export credit, time-based as we modelled it left three quarters of the money on the table.

## What was run

Forty single-family homes with 5, 7 or 9 kW of rooftop solar, picked by a fixed rule from NREL's ResStock model of California housing. ResStock simulates each building on real 2018 weather; these are simulations, not meters. Each home's hourly use minus its solar was written out as a Green Button CSV and loaded through the tool's own reader. The battery was 13.5 kWh usable, 5 kW, with a 90% round trip and 20% held back for outages. The two rate plans have the same invented 4-to-9 pm prices ($0.33 to $0.55 a kWh) and differ only in what an exported kWh earns:

- **Plan A:** $0.04 most hours, more on summer evenings. This is roughly how California's net billing tariff works.
- **Plan B:** the hour's import price minus $0.03, the way older net metering worked.

Each home was billed four ways: with no battery, with each setting, and at the *perfect-foresight ceiling*. The ceiling is the cheapest schedule possible if the whole year were known in advance.

## Low export credit

| Plan A, median home | saving a year | share of the ceiling |
|---|---:|---:|
| Self-powered | $691 | 97% |
| Time-based (discharge only in the day's top-price hours) | $192 | 25% |
| Perfect-foresight ceiling | $732 | 100% |

Self-powered saved more in all forty homes. The reason is simple. When exports earn $0.04 and imports cost $0.33 or more, every kWh of solar kept in the house is worth about $0.30, whatever hour it's used. A battery that waits for 4 pm covers the evening but goes into the night partly full. The next day it has less room for surplus solar, and the overflow goes to the grid for almost nothing. A self-powered battery empties every night and fills every day.

Our time-based rule is deliberately strict: it only discharges in the day's top-price hours. Real controllers often forecast and fall somewhere between the two. The point stands, though. Under a low export credit, simple self-consumption already gets within a few percent of perfect.

## Near-retail export credit

| Plan B, median home | saving a year |
|---|---:|
| Self-powered | −$12 |
| Time-based | $39 |
| Perfect-foresight ceiling | $239 |

Here the order flips. When exports earn almost what imports cost, storing solar gains next to nothing, and the battery loses 10% of whatever passes through it. Self-powered costs the median home money, and the only savings left come from the time-of-use spread. On a plan like this, a battery is mostly backup power.

## Size

Under Plan A, going from 13.5 to 20 kWh added a median $7 a year per extra kWh. From 20 to 27 kWh added $1.60. Once a battery holds the evening's use, more capacity buys backup, not savings. Where that point falls depends on how much the house uses after dark, and that's exactly what a household's own meter file shows.

## How we know the ceiling is the ceiling

The ceiling comes from a dynamic programme over stored energy. Our first version kept energy on a fixed grid of levels. It lost 3 to 4% of the saving because a midday surplus of 0.37 kWh couldn't be stored exactly. The shipped version interpolates between levels and also tries the points where an hour's cost bends: stay put, store exactly the spare solar, cover exactly the house's draw. We then solved 32 full-year cases a second way, as one linear programme with the HiGHS solver. The programme came within 0.21% of that exact optimum in every case (worst: $1.51 a year), and usually within 0.01%.

## Try it on your own year

The [planner](/home-battery-planner/) reads Green Button CSV or XML (solar exports included) and Smart Meter Texas files. You write your rate plan in a few lines, for example `import jun-sep weekdays 16-21: 0.55`, and the tool shows every setting and size, compares several plans, and gives a payback if you enter a cost. It all runs in the browser, and the file never leaves your computer. The [full write-up](/home-battery-planner/self-powered-vs-time-based.html) has the tables, and the scripts that produced them are in the repository.

*Not financial advice. The homes are simulations and the prices are invented. Your tariff, incentives and interconnection agreement decide what a real battery may do.*
