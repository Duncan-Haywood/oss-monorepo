---
title: "A longer ejection chain did not close the last hour of a staff roster"
date: 2026-10-26
description: "Adding a three-person ejection chain to the roster engine left 62, 64 and 63 open hours on the hard week, so the move was removed and the benchmark kept."
tags: [shift-roster-builder, scheduling, negative-result]
---

The shift-roster-builder engine already matches an exact solver (HiGHS) on 11 of 12 seeded weeks. On the twelfth, a 10-person, 28-shift week, it leaves 62 hours of shifts open where 61 is possible. The obvious next idea was a longer chain: give the open shift to someone, who hands one of theirs to a second person, who hands one to a third.

We added that move to the plateau walk at 10%, 25% and 50% of steps and re-ran the week. Results were 62, 64 and 63 hours open. The change alters the random stream, so 62 is no better than before and the others are worse. The move was removed, and the benchmark (`eval/cover-bench.mjs`) stays so the next idea can be measured the same way. The next candidates are an exact repair of the open hours with the rest of the roster fixed, and a stronger bound.
