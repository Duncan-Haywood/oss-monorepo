---
title: "Four searches beat one, but only if each one runs to the end"
seo_title: "Round robin schedule with fewer back-to-back home games"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, optimisation]
description: "The league schedule generator now runs four searches in the background and lets organisers trade even carry-over for fewer back-to-back home games."
---

Earlier today the
[league schedule generator](https://marisstella.app/league-schedule-generator/)
learned to search a home-and-away season as a whole, so that teams stop
meeting the same opponent straight after the same strong side (the
"carry-over" effect). The next measurement found that **the seed mattered
more than any setting**. At 20 teams, three runs with the same settings
gave carry-over values of 1,678, 1,820 and 1,784, with 108 to 124
back-to-back home or away games ("breaks"). So a single run is one draw
from a spread.

The obvious fix is to run several searches and keep the best. Here is what
that bought, averaged over three seeds and compared with the professional
seasons of the same size:

| Teams | Setting | Carry-over | Breaks | Pro seasons beaten on both counts |
|---|---|---|---|---|
| 18 | one search (before) | 1,522 | 86.7 | 1.0 of 6 |
| 18 | four short searches, same total work | 1,528 | 84.7 | 1.0 |
| 18 | four full searches | 1,573 | 73.3 | 1.7 |
| 20 | one search (before) | 1,761 | 114.7 | 3.0 of 14 |
| 20 | four short searches, same total work | 1,757 | 121.3 | 1.7 |
| 20 | four full searches | 1,761 | 114.7 | 3.0 |

Three things stand out:

1. **Short searches are no substitute for one long one.** Splitting the
   same work into four quarter-length searches did nothing at 18 teams and
   was worse at 20. The search needs its full length to settle.
2. **Four full searches pay off at 18 teams:** 13 fewer breaks (15% fewer)
   for 3% more carry-over.
3. **At 20 teams, with the default trade, they change nothing.** The first
   search won every time. The other three had fewer breaks, but they paid
   260 to 460 points of carry-over for them, and the default trade prices a
   break at 10 points, so it called them worse.

That last point is a question about what the league cares about, and the
software should not decide it. So the page now asks what to keep: a
balance (the default), the most even carry-over, or the fewest back-to-back
home or away games. With "fewest back-to-back" a 20-team season comes out
at 104 breaks instead of 124 or 112. Its carry-over (1,940 to 2,028) is
still below every one of the 14 professional 20-team seasons we scored
(2,278 and up), and it beats four of those seasons on both counts instead
of two or three.

Four full searches take about 12 seconds for 20 teams, so they run in a Web
Worker. The page keeps scrolling and typing while it works (in our browser
test the longest wait for a frame was 17 ms; one search used to block the
page for over 2 seconds). It also reports progress after each search and
lists all four results, so you can see what the choice gave up.

The numbers come from three seeds and made-up team names, and no real
organiser has tried the choice yet. The method, the scripts and the raw
output are in the
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
(`eval/best-of-k.mjs`). Next is running the four searches in parallel on
multi-core devices, which should bring 12 seconds down to about 3 and make
eight searches affordable.
