---
title: "An odd number of teams needs no back-to-back home games"
seo_title: "Round robin with an odd number of teams: zero home/away breaks"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, graph-colouring]
description: "With a bye in every round, a round robin can alternate home and away for every team. Our schedule search had been missing that; a two-colouring fixed it."
---

A *break* is a team playing two home games in a row, or two away games.
Leagues dislike them: two home weekends in a row is lost gate money for
the visitors' fans, and two away trips in a row is a long fortnight for
the players. With an even number of teams you cannot avoid them. The
least possible is n - 2 breaks, and the textbook circle method achieves it.

With an **odd** number of teams every round has a bye, and a bye ends a run.
That means an odd round robin can have **no breaks at all**. Every team
alternates home and away, sits out once, and then picks up alternating again.
The circle method can be oriented that way at every odd size.

## What we were doing wrong

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has an option to spread out who you meet straight after whom ("carry-over").
That search reshuffles the timetable and then decides home and away
separately, with a search that flipped one match at a time. On an odd
league that search never found the zero-break orientation. On the plain
circle method it left 3 breaks at 7 teams, 46 at 19 and 54 at 21.

The tool's ordinary schedules were never affected: they use a fixed
orientation that is already break-free. The loss was in the "spread who you
meet next" searches, and especially in their "fewest back-to-back games"
option, which for odd leagues fell back to a heavily weighted search
because the capped search could not get started.

## A two-colouring

Cut each team's season at its bye into two stretches. Make one node per
stretch and draw an edge for every match. Now colour the nodes with two
colours so that every edge joins different colours. A stretch of colour *c*
plays at home in round *r* when *c* and *r* have different parity. It
alternates, and in every match one team is at home and the other away.

A two-colouring like that exists exactly when the graph has no odd cycle,
and a breadth-first search finds it in milliseconds. On the circle method
it exists at every odd size we tried (5 to 21). It is also balanced: every
team gets exactly (n - 1)/2 home games.

The search now starts from that colouring and can flip a whole alternating
stretch in one move, not just one match. On a timetable that has been
reshuffled for carry-over there is usually no break-free orientation left.
There it still helps: 11 teams went from 24 breaks to 16 and 21 teams from
107 to 96. It is never worse than the old search on the same seed, because
the old one still runs as a fallback.

## What an organiser gets

With a zero-break start, the capped search now runs for odd leagues as
well. It holds breaks under a limit and spreads carry-over as evenly as it
can. The new low-break tries for one leg (three seeds each, carry-over then breaks):

| Teams | Before (heavy break weight) | Now, capped |
|---|---|---|
| 15 | about 310 / 35 to 40 breaks | about 300 / 12 to 16 breaks |
| 21 | 659 to 703 / 86 to 103 | 703 to 743 / 22 |
| 19 | 701 to 1,365 / 63 to 73 | 1,147 to 1,205 / 20 |

At 15 teams it is the same evenness at a third of the breaks. At 21 teams
a little more carry-over buys a fifth of the breaks. At 19 teams the
low-break end costs real carry-over. That size behaves like a 20-team even
league, where we have the same trouble. Small leagues sometimes did better
with the old weighted search (9 teams: 2 breaks rather than 5), so each
capped try for an odd league runs both and keeps the one with fewer breaks.

## A dead end, written down

For 20 teams we also tried fixing the minimum-break home/away pattern first
and searching the timetable under it. That search and the existing one
both stopped near 1,410 carry-over at 18 breaks. Two different methods
agreeing like that suggests the pattern itself is the limit. We could not
prove it: a simple relaxation gives no useful bound. The numbers are in the
[venture README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator#odd-leagues-zero-break-homeaway-and-capped-tries-2026-11-11-later),
and `eval/odd-capped.mjs` reproduces them.

The schedule generator is free, runs in the browser and is MIT licensed.
These are search figures on made-up team names. No organiser has run a
season with it yet.
