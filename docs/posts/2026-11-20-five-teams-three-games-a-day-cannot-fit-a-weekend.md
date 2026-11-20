---
title: "Five teams, three games a day: the tournament weekend that cannot exist"
seo_title: "Weekend tournament schedule maker for divisions on shared fields"
date: 2026-11-20
tags: [league-schedule, tournaments, scheduling, tools]
description: "A free weekend tournament scheduler puts every division's pools and brackets on shared fields, and warns when the daily game cap rules a weekend out."
---

A club tournament director has a Saturday and a Sunday, four fields and three age groups. U10s play 7v7 on the small pitches, U14s need full-size fields, and U12s fit either. Every team wants its pool games before the knockouts. Nobody should play twice inside an hour or four times in a day, and the coach who runs two teams cannot be on two fields at once. Most directors build that grid by hand in a spreadsheet, or pay a tournament platform to do it.

The [league schedule generator](../../ventures/league-schedule-generator/README.md) now has a [weekend tournament page](https://marisstella.app/league-schedule-generator/weekend-tournament-schedule.html) for this. You type the days and hours, the fields and the sizes they take, and each division as a short block: "U12 Boys: 60 min, 9v9, pools of 3, top 4, 3rd place", then the teams. It deals the pools by snake draft and seeds the bracket by crossover (1st A v 2nd B), so poolmates meet late. Then it places every game at the earliest time that keeps every rule. It tries about 120 orders and keeps the one that fits the most games, finishes earliest and makes no team wait too long. Nothing is uploaded.

**The weekend that cannot exist.** Take one division of five teams in a single pool, top four into semifinals and a final, at most three games a day over two days. A finalist plays four pool games and two knockout games, six in all, and two days at three a day allow six. It looks tight but possible. It is not. The final and semifinal leave room for only one pool game on Sunday, so on Saturday all five teams must play three pool games each. That is 15 team-slots, and every game fills two of them, so 15 cannot be split into games. No order of games fixes it.

The page now checks this before it searches. For each way of spreading the knockout rounds over the days, it counts how many places each team has left on each day for pool games. A pool of n teams fits only if its n(n−1)/2 games fit in the sum of ⌊n × places / 2⌋. If no spread passes, the page says so and suggests what to change: raise the cap by one, use smaller pools, send fewer teams through, or add a day. It also checks field-hours for each group of divisions that share fields.

**How well the search does.** We tested it on 400 random weekends (2 to 4 divisions of 4 to 12 teams, 4 to 8 fields of mixed sizes, one or two days, shared coaches). The checks warned on 194 of them, and the search never placed every game in any of those. That is consistent with the warnings being real, though the check is a necessary condition, not a proof. Of the 160 weekends with no warning, a single greedy pass placed every game in 83% and 88% (two seeds). The page's search placed every game in 93% and 96%, and cut the longest wait between a team's games from about 320 to 250 minutes on average. No schedule broke a rule when checked again one rule at a time. These were random weekends, not real tournaments. A real director's fields and divisions are the next test. The script and its output are in the repository (`eval/tournament-search.mjs`, `eval/tournament-search.txt`).

Still to come: typing results into the bracket as the weekend goes, and assigning referees.
