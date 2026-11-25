---
title: "A mirror in the round robin: two bowling seasons solved after SAT solvers gave up"
seo_title: "Mirror symmetry solves two bowling lane-rotation seasons"
date: 2026-11-24
tags: [combinatorics, sat, bowling, league-schedule-generator]
description: "Asking only for lane plans that match their own mirror image solved 26 teams over 12 and 38 weeks, where earlier solvers found nothing in 15 to 40 minutes."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
bowling page puts each week's matches on lane pairs so that every team
bowls on every pair about equally often. Some league sizes are hard to
balance. With 26 teams and 13 pairs over 12 weeks, every team should bowl
on 12 different pairs and never repeat one. The best stored plan missed that
by 3. Over a 38-week season (every pair 2 or 3 times) it missed by 1. Two SAT
solvers had found nothing in 15 and 40 minutes.

## The mirror

The page builds its round robin with the circle method. Round r pairs team
r+k with team r−k (counted round a circle of 25), and team r with the one
fixed team. Reflect every team number, t → W−1−t, and round r becomes round
W−1−r, with the same matches in the same order.

So the solver can be told to look only at lane plans that match their own
mirror image, with the pair labels swapped two by two. That leaves half as
many free choices, and the solver has far less to rule out. The script is
`eval/bowling-mirror-cpsat.py`, using Google's OR-Tools CP-SAT.

| season | before | with the mirror |
|---|---|---|
| 22 teams x 10 weeks (already solved) | 20.3 s | 0.4 s |
| 26 x 12 | 3 off; pairwise SAT: nothing in 900 s | **even, 24 s** |
| 26 x 38 | 1 off; kissat: nothing in 2,400 s | **even, 478 s** |

The page's own count checked both plans before they were stored, and a
team's season now reads every pair at the target on every seed.

## Where it can't help

With an odd number of weeks, the middle round is its own mirror image. That
forces the label swap to do nothing, and then the fixed team bowls on the
same pair in weeks r and W−1−r. Every pair's count for that team comes out
even except one, which an even split can't allow. So 24 teams over 11 weeks
and 28 over 13 stay 3 off. Kissat without the mirror found nothing for
either in 25 minutes.

On the longer even seasons (24 x 24, 24 x 36, 26 x 26, 28 x 28) the mirror
found nothing in 25 minutes on one core each. That doesn't show no
mirrored answer exists, only that this run didn't reach one. Every run is in
`eval/bowling-mirror-2026-11-24.txt` in the venture.
