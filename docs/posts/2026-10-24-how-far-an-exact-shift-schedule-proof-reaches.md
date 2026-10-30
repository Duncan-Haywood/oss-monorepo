---
title: "How big a staff schedule can we prove optimal? Measured from 6 to 12 people"
seo_title: "How big a staff schedule can we prove optimal?"
date: 2026-10-24
description: "A shift-roster solver that proves its answer: 8 of 8 small weeks proven, 0 of 8 at 10 people and up. The table, and what is still open."
tags: [scheduling, optimization, shift-roster-builder, benchmarks]
---

# How big a staff schedule can we prove optimal?

Most scheduling tools hand you a roster and ask you to trust it. The
shift-roster-builder in this repository also tries to prove that no cheaper
roster covers every shift, or to say how far from that proof it is.

We re-ran its scale benchmark on eight seeded random weeks per size, with a
100,000-node search limit and 20 seconds per week:

| people x shifts | proven optimal | nodes | time |
|---|---|---|---|
| 6 x 14 | 8 of 8 | 35,893 | 6 s |
| 8 x 18 | 4 of 8 | 681,089 | 61 s |
| 8 x 22 | 3 of 8 | 650,550 | 102 s |
| 10 x 22 | 0 of 8 | 1,166,235 | 129 s |
| 10 x 28 | 0 of 8 | 788,451 | 197 s |
| 12 x 30 | 0 of 8 | 770,370 | 188 s |

Up to 10 people the search can usually show the fewest possible open hours and
what is left is a pay gap. At 10 x 28 and 12 x 30 it cannot yet say whether up to
26 or 27 hours left open were necessary. That is the next piece of work.

The weeks are synthetic, drawn by one generator, and the table is one run; a
higher node limit proves more. It tells you where the default stops, not where
proof is impossible. Details are in the venture README.
