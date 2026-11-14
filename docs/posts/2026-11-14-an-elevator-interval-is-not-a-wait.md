---
title: "An elevator interval is not a wait, and the formula's capacity is the knee"
seo_title: "Elevator round trip time, interval and simulated waiting time"
date: 2026-11-14
tags: [elevator-traffic-analysis, ventures, building-services, simulation]
description: "The up-peak lift formula matched 20,000 simulated trips within 1.4% in 27 buildings. Waits were half the interval at 80% load, a full one at capacity."
---

How many lifts does an office building need? The first answer in most designs is a hand calculation from the 1970s and 80s: the up-peak round trip time. Everyone arrives at the lobby in the morning, each car fills to about 80%, runs up making its probable stops and comes back. Divide the round trip by the number of cars and you have the interval, the average time between cars leaving the lobby. Multiply out and you have the handling capacity, the share of the building's population the lifts can move in five minutes.

The new [elevator traffic analysis](https://marisstella.app/elevator-traffic-analysis/) tool does that calculation in the browser, with the improvements Richard Peters published in 2000: flight times from the lift's real acceleration and jerk, floors of different heights, and express zones. It also searches every combination of 1 to 8 lifts, eight common rated loads and eight speeds for the smallest designs that meet your targets. Then it does two things the hand method cannot.

## Does the formula hold up?

The formula works with averages: average stops, an average top floor, an average gap between stops. So the tool also runs 20,000 trips under the formula's own assumptions. Each trip draws the passengers' floors at random by population, flies each stop at its real distance and adds the same door and boarding times.

We ran this over 27 buildings: 6, 12 and 20 floors; two 1,000 kg, four 1,275 kg or six 1,600 kg cars; 1.6, 2.5 or 4 m/s. The formula came out between 0.83% below and 1.39% above the mean of the sampled trips. The probable stops and highest floor matched the sampled ones to within a few hundredths. The averaging is not where an up-peak design goes wrong.

## What it cannot tell you: how long people wait

The interval is how often a car leaves. A person who walks in at a random moment waits for the next car with room, and when arrivals bunch, a car fills and the next person waits for the car after. So the tool also simulates an hour of random arrivals at the lobby. It uses a deliberately plain dispatcher: cars fill in turn and leave when full or a few seconds after the doors open.

Across the same 27 buildings, here is the median mean wait as a fraction of the formula's interval:

| Arrivals, share of the formula's handling capacity | Dwell 4 s | Dwell 8 s | Dwell 15 s |
|---|---:|---:|---:|
| 50% | 0.27 | 0.24 | 0.20 |
| 80% | 0.50 | 0.51 | 0.51 |
| 100% | 0.92 | 0.98 | 1.03 |

At 80% of capacity the wait is about half the interval. That is close to the rule of thumb Peters quotes from Strakosch: waiting is about 55 to 60% of the interval, depending on the controller. At the formula's own capacity, the mean wait is about one whole interval. In 2 of the 27 buildings the cars were leaving full and the queue was still growing. Above it, waits climb steeply; the tool's chart shows the curve for your building.

So the handling capacity figure is the knee of the curve, not a comfortable operating point. A design that just meets a 12% target leaves no margin for a busy morning. The two buildings already past the knee were both six floors with six 1,600 kg cars at 2.5 or 4 m/s. Boarding a full car of 21 at 1.2 s a person takes about 25 s, longer than the 19 s interval.

## The limits

The dispatcher is ours and simple. Real group controllers and destination dispatch are smarter, and real arrivals come in groups, which makes waits worse. The ratio is a reason to simulate your own building, not a constant to quote. Up-peak is also only one traffic pattern: lunch-time two-way traffic is often the harder one in a modern office, and the tool does not model it yet. That, and a general analysis with several entrance floors, are the obvious next steps.

The engine, the CLI, the tests and the benchmark that produced the table above (`node bench/grid.mjs`) are [in the repository](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/elevator-traffic-analysis). The tool's tests regenerate that table byte for byte. It is free, MIT licensed, and an estimate, not engineering advice.

*Sources: G. C. Barney and S. M. dos Santos, Elevator Traffic Analysis Design and Control, 2nd edn (1985); R. D. Peters, "Improvements to the Up Peak Round Trip Time Calculation", International Journal of Elevator Engineers 3(1), 2000. The tool is not affiliated with either. Written with AI assistance.*
