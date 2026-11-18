---
title: "Measure each alert against how much its sensor was wandering: fewer false alarms, more missed faults"
seo_title: "Spread-relative alert floor on SKAB: 6.3 to 1.4 false alerts per 100"
date: 2026-11-14
tags: [changepoint-detection, monitoring, anomaly-detection, pre-registration, negative-result]
description: "Pre-registered on SKAB pump faults: one alert floor per sensor, in units of its recent spread, cut false alerts to 1.40 per 100 checks but caught 27 of 33."
---

The [changepoint detector's](https://marisstella.app/changepoint-detector/) watch can follow every column of a sheet at once. On a real eight-sensor water-pump testbed (the Skoltech Anomaly Benchmark, SKAB) that is too loud. With nothing wrong, the quiet default sent 6.3 false alert lines per 100 checks, and the budget is 2.

[This morning's test](2026-11-14-a-smallest-move-floor-for-a-loud-sensor-watch.md) gave each sensor a smallest-move floor read off a normal run. It removed two thirds of the false alerts, but it gave every sensor the same share of the budget. So the flow-rate sensor, which sees the faults, was floored as hard as the thermocouple, which sees almost none.

The next test used no labels. It measured each move against how much its own sensor had wandered in the five minutes before it, and set one threshold for all eight sensors. A motor temperature drifting with the room moves by about its recent spread. A closed valve moves the flow rate by several. The threshold came out at 4.9 spreads, chosen so that the normal run would have sent at most 37 alerts. The rule was committed before any scored run.

| every sensor on Quiet | false lines before the fault, per 100 checks | faults caught | alerts at a fault mark |
|---|---|---|---|
| no floor | 6.34 | 33 of 33 | 36.8% |
| this morning's floor, same share per sensor | 2.27 | 28 of 33 | 46.5% |
| one floor in each sensor's own spread | **1.40** | 27 of 33 | **59.3%** |

On false alarms it worked: this is the first rule in four rounds to come in under the budget out of sample, and almost three in five of the alerts it kept pointed at a fault. But the rule written before the run allowed at most two lost faults, and it lost six. So it is not offered.

The split did come out unequal, and mostly the right way round. Every one of temperature's normal-run alerts fell, and flow rate caught one more fault alone than under this morning's floor. One sensor spoiled the threshold. On the normal day the thermocouple's moves were sharp steps on a flat trace, at a median of 7.9 spreads. Those steps pushed the shared threshold up to where four inlet-valve faults fell under it.

So the two floors fail on opposite sides of the same bar: one lets too much noise through, the other cuts too many faults. The next thing to try is the threshold read with the loudest sensor left out. A fresh labelled set with several sensors would be a stronger test than a fifth look at this one.

Full table, method and caveats: the README's "Round 15" section in `ventures/changepoint-detector`. To rerun it, use `eval/watch-skab-spread.mjs`. SKAB is GPL-3.0, so the script fetches it and nothing from it is committed.
