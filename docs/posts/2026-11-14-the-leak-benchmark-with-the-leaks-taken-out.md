---
title: "The leak benchmark with the leaks taken out"
seo_title: "BattLeDIM L-Town without leaks: which leak detectors still alarm"
date: 2026-11-14
description: "L-Town simulated with no leaks: two pressure detectors raise 1 alarm in 716 days; a night-flow detector raises 31, credited with 14 of 19 leaks."
tags: [research, water-leaks, leak-detection, BattLeDIM, EPANET, water-loss, counterfactual]
---

For thirteen steps the [water-leaks programme](/research/water-leaks/) has asked one question about the BattLeDIM L-Town benchmark: how much of a leak detector's score beats random alarms? The only yardstick so far was the same number of alarms placed at random hours. This step uses a better one: the same network in the same two years, with no leaks.

**The file that makes it possible.** Alongside the data, the BattLeDIM organisers published `L-TOWN_Real.inp`, a 177 MB EPANET model. Their README calls it "the model of the network used to generate the datasets" and says it "does not contain any leakages". Its demand patterns run at 5-minute steps for every node across a whole year. We stepped it through EPANET 2.2 for 2018 and 2019 and read the 33 pressure sensors, three flow meters and the tank level, as the published SCADA files do.

**It matches to the last digit.** In the first two weeks of January 2018, when almost no leak is running, the simulated hourly pressures differ from the published ones by at most 0.0008 m at every sensor. At 5-minute resolution, 99.6% of the first week's published readings equal the simulation rounded to 0.01 m. So the benchmark's data are this model's output plus the leaks, rounded, with no measurement noise. That also makes the simulation the benchmark's exact no-leak counterfactual. Every alarm a detector raises on it is false by construction.

**What the detectors do on it.** We kept six detectors at the thresholds earlier steps had tuned on 2018:

| detector | alarms on the real data | alarms with no leaks | leak-free alarms the scorer credits (of 19 new 2019 leaks) |
|---|---|---|---|
| pressure CUSUM (D1-F) | 26 | **0** | 0 |
| LILA, automatic | 26 | **1** | 0 |
| night flow (M1) | 25 | 28 | 9 |
| night flow less smart meters (M3) | 29 | **31** | **14** |

The two pressure detectors go almost silent: one alarm between them in 716 days. Each of their 52 alarms on the real data goes away when the leaks are removed. Earlier steps found their leak counts near chance, and this explains why. Their "false" alarms are responses to real leaks that the 30-day matching rule doesn't credit, because the leak was already running or the alarm went to another leak. They are not alarms the network raises by itself.

The night-flow detectors are the opposite. With no leaks at all they alarm as often as with them. They fire on the demand year itself, on the same calendar dates in both years, because the model repeats one year of demand. Scored against the real leak list, M3's leak-free alarms get credit for **14 of the 19** new 2019 leaks. That is one more than its real alarms earn, and the same as random alarms at that count (median 13). Step 8's headline, smart-meter-corrected night flow at 15 of 19 with P = 0.001, therefore carries no evidence of detection on this benchmark. We wrote four predictions before running anything. Two failed: we expected the pressure detectors to raise at least one leak-free alarm each, and every detector to alarm less without leaks than with them.

**What it changes.** A counterfactual answers what random alarms cannot: was this alarm caused by a leak? For the pressure detectors the answer is yes, for all of them. For night flow on L-Town it is mostly no. It also changes the next milestone. On noise-free data these residual detectors already hold a near-zero false-alarm rate at their tuned thresholds. A guaranteed rate needs a harder null, with demand, pipe and sensor uncertainty the generator never added, and that is what we build next. One caution for the literature, untested here: a residual against the public `L-TOWN_Real.inp` would be an oracle detector. Any L-Town result that used that file can't be compared with blind ones.

L-Town is a simulated network with simulated leaks, and nothing here is an operational recommendation. The simulator, the plan written before the run, per-alarm results and the figure are in [the project](/research/water-leaks/), step 14. This post and the analysis were written with AI assistance.
