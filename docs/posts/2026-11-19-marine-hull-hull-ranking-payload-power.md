---
title: "Which hull goes furthest for a small survey boat? The answer holds up to 200 W of payload"
seo_title: "Best hull for a small survey USV: how payload power changes it"
date: 2026-11-19
tags: [research, marine-hull]
description: "A 200 kg survey boat's hull ranking, re-run from 1 W to 10 kW of payload power: the monohull leads to 200 W; a hydrofoil overtakes near 660 W."
---

The [marine-hull programme](../../research/marine-hull/README.md) compares seven body types for a 200 kg autonomous survey craft on one energy basis: a 10 kWh pack, the same propulsive efficiency, and range maximised over speed. Its headline result is a ranking table. The plain displacement monohull goes furthest, then the catamaran, SWATH, hydrofoil and planing hull, and that order survives every drag input we could not source and so had to sweep.

But every row of that table used one payload load, 30 W. The payload's steady power draw (sensors, computer, radio: the "hotel load") is the input that sets the best cruising speed, because at the best speed propulsion takes about a third of the total power. A boat carrying a 500 W multibeam sonar and a GPU should cruise faster than one carrying a 30 W CTD, and at higher speed the fast hulls stop looking silly. So the question a reviewer will ask, and a buyer should, is over what payload power the ranking holds.

**What we did.** We took each body type's central case exactly as the [previous figure step](2026-11-18-marine-hull-glider-auv-hotel-ratio.md) did and re-ran it with the hotel load on a log grid from 1 W to 10 kW, 49 points. We wrote five expectations into the log before running it. For the hydrofoil (972 cases) and the planing hull (16 cases) we also swept their whole boxes of foil and hull coefficients, against the monohull at three form factors.

**What came out** (`results_hotel_ranking.txt`, 2 seconds, standard-library Python):

| hotel load | catamaran / monohull | SWATH | hydrofoil | planing | order |
|---|---|---|---|---|---|
| 10 W | 0.857 | 0.652 | 0.069 | 0.048 | mono first |
| 100 W | 0.898 | 0.675 | 0.313 | 0.211 | mono first |
| 215 W | 0.916 | 0.677 | 0.514 | 0.335 | mono first |
| 1 kW | 0.950 | 0.678 | 1.287 | 0.952 | hydrofoil first |
| 10 kW | 0.954 | 0.733 | 2.104 | 2.230 | planing first |

- The monohull leads every rival at every load up to 200 W. That band covers every payload load this programme has a source for, from 8 W (a Tethys AUV design figure) to 175 W (a REMUS-100 load implied by its vendor endurance). None of the 988 foil and planing box cases overtakes it at or below 200 W.
- The catamaran never overtakes, though it closes in to 0.969 at high load, where its slender hulls get past the wave-making hump more cheaply. SWATH never gets above 0.733.
- The central hydrofoil overtakes at **659 W**, and the earliest case in its box at 291 W. The planing hull overtakes at 1,068 W.

**The catch, stated up front.** Every crossover happens after the monohull's best speed has passed Froude number 0.3, which it does from 215 W. That is the regime where an earlier step found our displacement and thin-ship wave models no longer match tank data. So the 200 W result is solid on the programme's own terms, but the exact load where a foil takes over is indicative, not a design figure. Four of the five expectations held. The fifth, "the foil beats the planing hull at every load", failed at the top three loads. A check we added after the run, and label as such, found the planing hull's best speed pinned at the 20 m/s edge of its speed grid. Widening the grid to 40 m/s moves its crossover to 798 W, but at speeds near 39 m/s, where air and spray drag, which the model leaves out, are no longer small.

**What changes.** The paper's claim now carries its scope: for a small survey boat with a payload under about 200 W, pick the monohull, and spend the effort on measuring the payload's power draw before the hull's drag. Above several hundred watts the fast hulls deserve a real look, and that is a different paper with air drag and validated high-speed resistance in it. The figure is in the [project README](../../research/marine-hull/README.md) and the OCEANS-format draft in `research/marine-hull/paper/`.

*Simulation only, written with AI assistance; numbers are copied from the committed results file and checked by `paper/check_numbers.py`.*
