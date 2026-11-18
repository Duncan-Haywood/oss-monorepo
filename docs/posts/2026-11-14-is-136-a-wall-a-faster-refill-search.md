---
title: "Is 136 a wall? A faster refill search finds 210 at 14 teams and nothing new at 12"
seo_title: "Low carry-over round robins: 14 teams at 210"
date: 2026-11-14
tags: [ventures, league-schedule-generator, algorithms]
description: "A refill search in C found a 14-team round robin at carry-over 210, below 212, while 631 fresh climbs at 12 teams all stopped at 136 or higher."
---

In a round robin, **carry-over** measures how often a team meets the same
opponent straight after the same other team. If you always play Rovers the
week after they have played the league leaders, the order of matches is helping
or hurting you, and nothing in the table shows it. The
[league schedule generator](https://marisstella.app/) searches for timetables
where that effect is spread as evenly as it can be.

Two numbers frame each league size. The **floor** is what you would get if no
pairing ever repeated: n(n − 2), so 120 at 12 teams and 168 at 14. The
**proved least** is what an exhaustive search shows nobody can beat. Earlier
today that search showed no 12-team round robin goes below 124. The best
timetable anyone here had found was 136. So the gap was 124 to 136, and the
question was which end is wrong.

**The search was slow.** The best move we have takes two to five rounds out of
the season and re-deals their matches every legal way, keeping the deal with the
least carry-over. In JavaScript that found 136 in three of four seven-minute
runs, and at 14 and 18 teams it never beat the built-in starter timetables (212
and 318).

**The same move in C, with restarts.** `eval/refill-search.c` does the same
re-deal with a depth-first search that drops a branch as soon as it goes over
budget. It also lets the budget run a little over now and then, kicks a stuck
climb with a few random re-deals, and after thirty failed kicks starts a fresh
climb from a shuffled timetable. With three rounds per move it makes about
47,000 moves a second on one core. Taking out fewer rounds turned out better
than more: each move is smaller, but the search makes about 35 times as many.

**12 teams: the same wall.** Over 631 fresh climbs in four runs, the lowest
five all stopped at exactly 136, and none went below. That is not a proof. But
two different programs with different move rules both get stuck at the same
number, so more of this kind of search is unlikely to close the gap. The next
step at 12 teams is the proof side: ruling out 124 to 134, which the exact
search puts at about four hours on four cores.

**14 teams: 210.** Two of eight runs, with different seeds, found a 14-team
round robin at 210, two below the starter. 129 of its carry-over cells hold 1,
18 hold 2 and one holds 3. It now ships inside the tool as a stored
timetable. The page's search starts from it as well as from the circle method
and the starter, and keeps whichever comes out best. A 14-team single round
robin searched on carry-over alone now comes out at **210 with 26 breaks**,
where it was 212 with 32. That is less carry-over and fewer back-to-back home
or away games. With a break weight, or for a home-and-away season, the old
starter still wins and those results don't change at any seed. It costs one
extra search, about a second.

**18 teams: not yet.** Starting from scratch, the search stops at 356, a long
way above the starter's 318. Past 14 teams a cold start is too slow, so the
next attempt will start from the starter itself.

What we don't claim: 210 is the best found at 14 teams, not a proved least, and
none of this has been checked against published carry-over tables. The program,
the run logs and the timetable are in the repository
(`ventures/league-schedule-generator/eval/refill-search.c`,
`eval/refill-search.txt`), MIT licensed.
