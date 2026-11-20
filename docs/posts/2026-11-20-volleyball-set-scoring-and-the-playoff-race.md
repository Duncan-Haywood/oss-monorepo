---
title: "When a 3-2 loss is worth a point: volleyball scoring now reaches the play-off race"
seo_title: "Volleyball league standings and play-off race with set scoring"
date: 2026-11-20
tags: [ventures, league-schedule-generator, product, testing]
description: "The free league scheduler's play-off race could call a volleyball team clinched while it could still miss the places. One points rule now feeds every table."
---

Volleyball leagues that follow FIVB-style points don't treat every win the same. A 3-0 or 3-1
win earns the full three points. A 3-2 win earns two, and the losing team gets one point for
taking the match to a fifth set. The
[league schedule generator](https://marisstella.app/league-schedule-generator/) has had a
"volleyball set scoring" box since it gained standings, and the table counted those points
correctly.

The table was the only place that did. The same page also works out a play-off race (who has
clinched a place and who is out), play-off odds, a weekly post for the group chat and, when two
teams are level, a head-to-head mini-table. Each of those had its own copy of "a win is worth
`win` points", and none of them knew about set scoring. So with the box ticked, one page could
show four different points totals for the same team.

## Why it mattered

The race promises that "clinched" and "eliminated" are never wrong: it works through every way
the remaining matches can end, and a tie on points always counts against the team being tested.
That promise only holds if the race uses the table's points. To test it, we generated 60 random
four- and five-team leagues with volleyball results, and for each one tried every remaining match
at 3-0, 3-2, 2-3 and 0-3. On the old code the race marked a team clinched that, in one of those
outcomes, finished fifth. A league secretary who posted "we're through" on that basis would have
been wrong in public.

The head-to-head bug was smaller, and it changed results too. Take three teams level on five
points. Bolt beat Cork 3-0, Cork beat Ace 3-1 and Ace beat Bolt 3-2. Counted with set scoring,
the mini-table is Bolt 4, Cork 3, Ace 2. Counted as plain wins, the three teams were level on 3
each, and the tie fell through to set difference, which put Ace second.

## The fix

The fix is one function. `matchPoints(ga, gb, scoring)` returns both sides' points for one result,
and the table, the mini-table, the race, the odds and the weekly post all call it. The race also
needs every way an unplayed match can end. Under set scoring that is five outcomes, not three, so
its exhaustive search covers fewer remaining matches (8 rather than 12) at the same cost. Past
that point it falls back to the same safe bounds as before. The odds simulation counts a win as a
one-set win as often as the league's typed results do.

Every new test fails on the old code, and that is the reason for writing them. One more test
came from a
[quality audit](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/portfolio/quality): the
Americano night table ranks by points, then points difference, then wins. Until now, swapping
the last two broke no test.

The scheduler is free, runs in the browser and is MIT licensed. Results are only as good as the
scores typed in, and your league's own rules decide ties.
