---
title: "One season of sun log: a solar boat does better shrinking toward the climatology than trusting its correction"
seo_title: "Solar USV one-season sun correction: shrink toward climatology"
date: 2026-11-16
tags: [research, marine-hull]
description: "Replay-gated fallback rules lift a solar boat's one-season correction to 137 of 168 test cases, yet none beats making no correction at all over 30 points."
---

This is the next step in the [marine-hull programme](../../research/marine-hull/). The question is how a solar survey boat should correct its sun climatology from one season of its own energy log. [Milestone 6zzs](../../research/marine-hull/LOG.md) had the boat replay the year it logged: run the uncorrected plan against a 7-day baseline and see whether it fell short on distance. Where it did, the boat applied a dark-summer guard. That lifted the 30-point mean to 131.6 of 168 test cases, but making no correction at all still scores 139.

In 61% of replays the uncorrected plan did fine, and 6zzs kept the raw learned ratios in those cases. So this run asked whether "fine" should simply mean "don't correct". It also tried a continuous gate, which shrinks the guard toward the climatology in proportion to how far the replay fell short. We fixed seven predictions [in the script](../../research/marine-hull/experiments/run_replay_fallback.py) and committed them before the run. Results are in [`results_replay_fallback.txt`](../../research/marine-hull/experiments/results_replay_fallback.txt).

| Rule (one season of log) | All 30 points, mean [worst, best] | Nine high-latitude points | Per-point count (of 240) |
|---|---|---|---|
| no correction | 139 | 25 | 126 |
| raw month ratios | 121.8 [97, 152] | 81.0 [1, 153] | 114.0 |
| 6zzs best gated rule | 131.6 [111, 156] | 85.8 [18, 152] | 115.8 |
| guard where short, no correction elsewhere | 128.8 [106, 148] | 85.0 [41, 152] | 129.2 |
| raw ratios where short, no correction elsewhere | 135.0 [113, 148] | 78.8 [20, 152] | 127.6 |
| guard shrunk by the km shortfall, scale 10% | 137.2 [122, 149] | 79.2 [36, 144] | 130.2 |

Three of the seven predictions held. What we learned:

- **Across ordinary water, every step toward less correction helped.** Dropping the correction on "fine" replays recovers most of the raw ratios' cost. The rest of the loss comes from the short replays, and every case lost there is lost on hours with a flat battery: the guard makes the boat too bold. The raw ratios do better than the guard on those replays, and shrinking does better still. The gain grows with the shrinkage scale, from 130.0 at 1% to 137.2 at 10%, and approaches no correction from below without reaching it.
- **These rules are still the best one-season rules on two other counts.** Scored point by point, they are the first one-season rules to beat no correction (129 to 130 against 126 of 240). At the high-latitude points they keep a mean near 6zzs's and lift the worst learning year from 18 to 41.

For the paper's design table, one season of log is a tool for high latitude. Elsewhere it should only shrink the plan toward the climatology, or the boat should wait for three seasons, which [milestone 6zzr](../../research/marine-hull/LOG.md) found safe everywhere. The three shrinkage scales were a sweep, all in-sample on the same 30 points and ten years. Its monotone shape suggests the limit is no correction at all, not a better setting in between.

Limits: one boat, one 50 W payload, the calm-water daily model and NASA POWER only. With five learning years, the brackets are observed ranges, not intervals. The next step runs the harvest model on ERA5 at the nine high-latitude points.
