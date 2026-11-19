---
title: "57 players, one perfect Americano rotation: built from a projective plane in four seconds"
seo_title: "A perfect Americano rotation for 57 players, from a projective plane"
date: 2026-11-19
tags: [ventures, league-schedule-generator, research]
description: "Hours of search never found a perfect rotation for 57 players. Seating an 8-player design on each line of the plane of order 7 found one in seconds."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has an
Americano planner for social padel, pickleball and badminton nights. When the numbers allow, it
uses a *whist design*: over the whole night, each player partners every other player exactly once
and faces each of them exactly twice. By this afternoon, 57 was the only size from 4 to 64 players
(4k or 4k+1) with no stored design. Earlier runs spent more than six CPU-hours on it with three
different searches and [found nothing](/posts/2026-11-19-the-two-americano-sizes-a-search-still-cannot-fill/).

It now has one. The method was a different approach, not a longer search.

**57 is a special number.** 57 = 7² + 7 + 1 is the number of points in the *projective plane of
order 7*: 57 points and 57 lines, each line holding 8 points, with every pair of points on exactly
one line. This plane has a neat model on a clock with 57 positions. Take the eight positions
{0, 1, 3, 13, 32, 36, 43, 52}. Every gap between two of them, measured round the clock, comes up
exactly once (this is a Singer difference set). Turn those eight positions round the clock 57 times
and you get the 57 lines.

**Eight players already have a perfect rotation.** Give each line its own 8-player whist night:
two courts, seven rounds. Every pair of the 57 players shares exactly one line, so on that line
they partner once and meet twice, and on no other line do they meet at all. Every pair condition
then holds by construction.

**What is left is a timetable.** The 57 small nights have to be packed into 57 rounds of 14
courts, with everyone but one player on court each round. Turning the clock does most of this:
fix one round, rotate it 57 times, and each line gets its own copy of the 8-player night. So the
only question is how far to turn each of the 14 courts' tables in the first round so that no two
of them share a player and only player 0 sits out. That is an exact-cover puzzle of 14 pieces
and 56 slots. A dancing-links solver (Knuth's Algorithm X) solves it in seconds, trying a few
seatings of the 8-player night on the line first. Ten of ten runs found a design, the median in
under four seconds.

What it changes for a 57-player night on 14 courts:

| | repeat partners | pairs who never partner | times a pair meets |
|---|---|---|---|
| before (round-by-round search) | 87 | 87 | 0 to 5 |
| now | 0 | 0 | exactly 2 |

Every round still uses all 14 courts, and the schedule builds in 9 ms instead of about 300 ms.
Every whist size from 4 to 64 players is now stored.

**Why the searches missed it.** They looked at all possible first rounds, where perfect ones are
needles in a very large haystack (about half a design per starter in expectation, behind a search
tree with a heavy tail). The plane does the hard part, and the search only has to solve a small
packing problem. The same trick can work whenever a projective plane's lines hold 8, 12, 16 or more
points (a multiple of four, but more than four). Order 11 gives 133 players, beyond what the planner
offers. Order 3 cannot work: its lines hold just 4 points, so each table fills a whole line, and two
lines always meet.

The program (`eval/whist-singer.c`), the run log and the method are in the venture's
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
under "57 players: a whist design from the projective plane of order 7". The planner is free, and
needs no sign-up.
