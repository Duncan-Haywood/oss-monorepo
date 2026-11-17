---
title: "Randomising a drone's motor lag across its measured range made the tune worse"
seo_title: "Randomising drone motor lag in training made the tune worse"
date: 2026-11-17
tags: [research, robotics, drones, quadrotor, control, domain-randomisation]
description: "We trained simulated 5-inch quadrotors across the 33-39 ms motor lag range. They crashed more than slow-end tunes at every lag, including 33 ms."
---

Earlier today our [rotor-cant co-design programme](../../research/codesign-cant/README.md) found a simple rule for tuning a quadrotor in simulation when you know the motor lag only as a range: [tune at the slow end](2026-11-17-tune-drone-at-slow-end-of-motor-lag.md). Two published system identifications put 5-inch quadrotor motors at 33 ms and 39.1 ms. Designs tuned at 39.1 ms crashed less than designs tuned at the 36 ms midpoint, under every lag in that range.

That result left the obvious alternative untested: domain randomisation. Why not draw the lag across the whole 33-39.1 ms range during training, and certify the controller at both ends? It is the standard sim-to-real answer to an uncertain parameter, so it was the next experiment.

## What "tuning at a lag" means here

Reading the simulator closely while setting this up showed that the controller holds no model of the lag. Its side-force feed-forward comes from the attitude integrator, not from a predicted motor response. The lag matters in only two places: the fastest plant the tuner trains on (the design's lag times a random factor of 1 to 2), and the plant corners where the stability certificate is checked. So a 39.1 ms tune never trains on, and is never certified at, a motor faster than 39.1 ms.

The range-trained version draws the lag uniformly from 33 to 39.1 ms each episode, multiplies it by the same 1-2 factor, and is certified at 33 and 78.2 ms. Everything else matched the earlier runs: two tuning objectives, CMA-ES over 6 seeds × 2 starts × 2 frame geometries, 3,200 evaluations per run, about 1.5 hours on four cores. The seven predictions went into the [log](../../research/codesign-cant/LOG.md) before the full run, together with how each outcome would be read.

## What happened

The test is the hard condition from earlier milestones: twice the trained centre-of-pressure lever, a 45° tilt limit, 384 held-out flights per set. Totals over both objectives and both geometries:

| Lag the designs fly | Tuned at 36 ms | Tuned at 39.1 ms | Trained across 33-39.1 ms |
|---|---|---|---|
| 33 ms | 341 | 270 | 327 |
| 36 ms | 455 | 361 | 423 |
| 39.1 ms | 603 | 462 | 590 |

The range-trained designs crashed more than the slow-end designs in all four objective-geometry pairs at 33 ms and at 39.1 ms, and in three of four at 36 ms. That includes 33 ms, the fast end the range draw added. Training on fast plants bought nothing on fast plants.

They also landed between the two earlier tunes, beating the midpoint designs in 9 of 12 cells. The draw's mean lag is 36 ms, and the designs behave like a slightly better midpoint tune. Mass, propeller size and position gain barely moved; the difference is in the attitude gains the search settles on once some training plants are fast. The extra certificate corner at 33 ms did not help at the old 15 ms law either (21 against 20 of 24 designs certified), and it cost at a 45 ms stress value (8 against 15).

Four of the seven predictions held. The two that failed were the ones that expected the range draw to pay at the fast end.

## How sure we are

Not very, cell by cell. With six seeds per set, the largest per-cell gap has a Mann-Whitney p of about 0.05 and most are far weaker. All four objective-geometry pairs agree at both identified ends (sign test p = 0.125). Read this as "randomising gains nothing and probably costs", not as a measured penalty.

The usual caveats hold: one simulator, a first-order motor lag, two identifications from one lab, one held-out set. We tried only a uniform draw. A draw weighted toward the slow end, or a worst-case objective over the range, might behave differently.

## What it means

When the uncertain parameter is a lag, and being too slow is safe while being too fast is not, a uniform domain randomisation pulls the tune toward the average and gives up robustness. In this setup the better use of a range is its slow end. The next steps are twelve seeds to put a number on the gap, and a slower training floor to find where tuning slower stops paying.

Code, results and the full log are in [`research/codesign-cant`](../../research/codesign-cant/README.md) (simulated; MIT licensed).
