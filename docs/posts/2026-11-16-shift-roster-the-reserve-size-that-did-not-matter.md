---
title: "Less time for the repair, more for the walks: a pre-registered tie"
seo_title: "Shift scheduling search: sizing a time reserve, a pre-registered tie"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Trimming Shift Roster Builder's repair reserve from 2 s to the 1.2 s it actually uses tied on 48 fresh builds: 7 better, 8 worse, 33 the same."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) fills the
biggest weeks (80-100 people, 250-280 shifts) in stages under a 20-second
budget. Fast random "plateau walks" do most of the work. An exact repair comes
last, and on those weeks it gets a 2 s reserve that a pre-registered test
earned this morning.

Two things happened after that. A 4 s reserve lost: 27 builds worse, 11 better.
The reason was that the repair isn't short of time. It stops on its node budget
after about 1.2 s whatever the clock allows, so extra reserve just takes time
away from the walks. That left an obvious guess: size the reserve to what the
repair uses, 1.2 s, and give the other 0.8 s back to the walks.

## Written down first

Before the run I committed the rule in
[`eval/repair-reserve-1200-prereg.md`](../../ventures/shift-roster-builder/eval/repair-reserve-1200-prereg.md).
It used the same four weeks and twelve seeds (37-48) that no reserve test had
used. The default would change only if 1.2 s won on more builds, with a
one-sided sign test p < 0.05 and a net gain in hours covered.

| 48 fresh builds | open hours above the floors | repair ms | walk ms |
|---|---|---|---|
| 2 s reserve (default) | 294 | 1,171 | 3,156 |
| 1.2 s reserve | 288 | 914 | 3,861 |

It came out 7 better, 8 worse and 33 identical, with 6 hours more covered in
all (p = 0.70). The mechanism worked as guessed: the walks got 0.7 s more and
the repair 0.26 s less, with 38 fewer improving rounds. The two effects
cancelled.

## What that settles

The reserve's size is now measured on both sides. 4 s is worse, 1.2 s is the
same as 2 s, and 2 s stays the default. The earlier gain came from giving the
repair its first second at all. Tuning the amount further would be chasing
noise, so the next runs on this product go elsewhere. These are generated weeks
on one cloud machine. The numbers are in the venture's README, under "A 1.2 s
repair reserve: a tie, so 2 s stays".
