---
title: "Cleaner night flow still misses the small leaks, and pressure's hits on them were luck"
seo_title: "Minimum night flow with smart meters on BattLeDIM leaks"
date: 2026-11-13
description: "A weekday baseline plus 82 smart meters halves BattLeDIM night-flow noise to 5 m³/h, yet it finds 3 of 9 small leaks. Five barely leak for a month."
tags: [research, water-leaks, leak-detection, BattLeDIM, minimum-night-flow, smart-meters, AMR, water-loss]
---

The [last step](/posts/2026-11-13-night-flow-misses-the-small-leaks/) of the [water-leaks programme](/research/water-leaks/) found that minimum night flow, the water-loss engineer's standard tool for slow leaks, caught only 3 of the 9 small leaks on the BattLeDIM L-Town benchmark. The noise was the culprit: the nightly minimum moved by about 11 m³/h from one night to the next, as much as the leaks themselves. Two fixes were obvious, and each got one pre-registered run.

The first was a weekday baseline. Friday and Saturday nights in L-Town run 10 to 15 m³/h above the rest of the week, so those offsets were taken out, using 2018 only. The second was what utilities do when they can: subtract the night use of customers with smart (AMR) meters. L-Town has 82 of them, and they carry about 8% of the district's flow. Both fixes together halved the noise, to 5.1 m³/h.

It made no difference to the small leaks. The corrected statistic, declared in advance as the one that counts, found 3 of the 9 again. The smart-meter version without the weekday fix found 6, but with a median delay of 20 days. The pressure-sensor detector it was up against found 7.

The leak flows themselves explain it. Five of the nine small leaks are slow ramps. A week in, each is leaking 0.1 to 0.5 m³/h at night, and a month in, 1.3 to 6. Our scoring credits a detection within 30 days of onset. In that window these leaks never stand more than about a third of the noise above their own baseline. No meter-based statistic could see them.

That also undoes part of the comparison. The pressure detectors were credited with four of those ramps, and we checked how much each leak was carrying at the hour of its alarm: 0.01 to 0.22 m³/h. On a network drawing about 200 m³/h, no pressure sensor resolves that. Those alarms were matched to the leaks by the 30-day rule, not caused by them. The programme's main claim, that a plain detection count on L-Town is close to what random alarms score, shows up here leak by leak.

On the four small leaks that start abruptly, pressure wins. Our pressure CUSUM finds 3, our rebuild of LILA all 4, and the corrected night flow 2. For the ramps, the fix belongs in the scoring: credit an alarm only once the leak's own flow passes a stated level. That rule goes into the harness next, written down before anything is rescored under it.

L-Town is a simulated network with simulated leaks, so none of this is a statement about a real utility's meters. Code, the per-leak tables and the log are in [the project](/research/water-leaks/).
