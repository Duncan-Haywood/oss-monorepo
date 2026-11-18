---
title: "Loss penalty factors from before a line trip still fix DC dispatch afterwards"
seo_title: "Stale loss penalty factors after a line outage: DC OPF on IEEE 118-bus"
date: 2026-11-11
tags: [infra-dcopf, research, power-systems]
description: "On IEEE 118-bus, loss penalty factors from before a line trip beat plain DC OPF on all 80 trips tested and kept at least 88% of the gain of fresh factors."
---

A DC optimal power flow ignores losses, so on the IEEE 118-bus case its dispatch costs about 1.5 % more than the AC optimum once the losses are paid for. Earlier `infra-dcopf` runs showed that nodal loss penalty factors close most of that gap, and that factors an hour or even twelve hours old still do. The open question was a topology change. When a line trips, the loss sensitivities change at once. Can an operator keep using the factors they held just before the trip?

**The setup.** I took the factors and loss share at the AC optimum of the intact network, tripped one line, updated the DC model to the new topology, and solved the DC OPF with the old factors. I then ran the resulting dispatch through an AC power flow on the tripped network and compared its cost with the post-trip AC optimum. I tested 40 trips per load level: the 20 most-loaded lines (excluding any trip that would cut off a bus) and 20 drawn at random. Before running, I logged three predictions.

**Results.** Mean excess cost over the post-trip AC optimum:

| load | trips | plain DC | pre-trip factors | fresh factors |
|---|---|---|---|---|
| 1.0 | 20 most-loaded | 1.671 % | 0.409 % | 0.367 % |
| 1.0 | 20 random | 1.491 % | 0.368 % | 0.365 % |
| 1.1 | 20 most-loaded | 1.874 % | 0.378 % | 0.338 % |
| 1.1 | 20 random | 1.692 % | 0.341 % | 0.338 % |

- The stale factors beat plain DC on all 80 trips. I had predicted at least one trip where they would do worse, and that prediction was wrong.
- They lose more ground on heavier lines (Spearman 0.69 between the tripped line's pre-trip flow and the stale-to-fresh gap). The worst trip was the 196 MW line from bus 25 to bus 29, and even there the stale factors kept 88 % of the fresh factors' gain.
- The trip hurts plain DC more than it hurts the factors. One trip (37-64) raised plain DC's excess cost to 2.73 %, while the stale factors stayed at 0.55 %.
- The largest change in any generator's factor across the trip tracks the stale-to-fresh gap (Spearman 0.74). That makes it a cheap signal for when to recompute the factors.

**Caveats.** These are benchmark cases, not a measured system. case118's ratings do not bind, so none of these trips congested the network, and that is the case where stale factors are most at risk. I tested single-line trips only, with one AC solver (pandapower's interior point). The "fresh factors" column needs the post-trip AC optimum, so it is a bound, not a scheme. The next step is the same test on the congested PGLib-OPF cases.

Code, tables and log: `research/infra-dcopf/` (`experiments/run_outage.py`, `results_outage.txt`, `results_outage_k1.1.txt`).

*Research with AI assistance; not engineering advice for any real system.*
