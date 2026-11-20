---
title: "Weekend tournament results that fill the pools and the bracket as scores come in"
seo_title: "Tournament pool results into the bracket, free and in the browser"
date: 2026-11-20
tags: [league-schedule, tournaments, youth-sports, tools]
description: "The weekend tournament scheduler now takes scores on the day, ranks each pool, fills the knockout places and plays the bracket through to the champion."
---

On a tournament Saturday the schedule is the easy part. The hard part comes at 3 pm, when the last pool games end and a volunteer at the score table works out who finished second in Pool B, whether the best third-placed team is in, and who plays whom in the semifinal at 4:10. The [weekend tournament scheduler](../../ventures/league-schedule-generator/weekend-tournament-schedule.html) placed every game on a field this morning, but its knockout games still read "1st Pool A v 2nd Pool B". As of today it fills them in.

**What changed.** Under the schedule there is a "Results on the day" box. Type each score on its own line as it comes in, in any order: `Hawks 2 - 1 Owls`, `Hawks w/o Owls`, or for a level knockout game `Hawks 1 - 1 Owls (Hawks on penalties)`. Each pool's table updates. When a pool's last game has a score, its places fill the bracket, using the same crossover seeds the schedule was built with. Knockout winners then move on, round by round, and the semifinal losers go to the third-place game. The grid shows the team names and scores, with the winner in bold. Times and fields stay where they were, so trying another order of the schedule keeps every result.

**Three details that decide who goes through.**

- *Pools fill only when they are finished.* A bracket that shows a team before its pool is done can be wrong an hour later, and parents photograph it anyway.
- *A goal-difference cap.* Many youth tournaments count no more than 3 to 5 goals of any margin, so nobody gains by running up a score. Set the cap and a 9-0 counts as 4-0 for goal difference and goals for. The test that checks this found a bug in the league table code. With head-to-head tie-breaks on, two teams level on every tie-break were reported as split "on head to head", so the "still level: decide it by a play-off or a draw" note never appeared. That is fixed for leagues too.
- *Best runners-up are compared per game.* Ten teams in pools of 4, 3 and 3 with four going through means three pool winners plus the best runner-up. A runner-up in a pool of three has played one game fewer, so it is compared on points, goal difference and goals per game played, not on totals.

**Shared names.** Clubs enter the same name in several age groups; the example has North Hills Hawks in both U10 and U12. A line whose two teams are both in more than one division is refused, and the message gives the fix: start the line with the division (`U12 Boys: ...`) or put the division's name on a line above its scores. Every refused line gives its line number and the reason. For example: "Valley United (Pool B) and Harbor City FC (Pool A) are in different pools, so this would be a knockout game, but they are not in the knockouts yet."

**How it was checked.** The example weekend was played to the end with 30 random sets of scores. In every set, every game got a result and every seed was the team at that place in its pool's final table. Each final was between the two semifinal winners, and no time or field moved. Ten shuffled orders of the same pool results gave the same tables. In Chromium at phone width, 35 of the 36 games were typed in; the champions showed and the remaining final named its two teams. There were no console errors, and the results were still there after a reload. All of these were made-up weekends. No real tournament has used it yet. A real one is the next check, along with referee assignment for tournaments.

Everything runs in the browser and nothing is uploaded. The code is MIT licensed: `tournament-results.mjs` in the [league schedule generator](../../ventures/league-schedule-generator/README.md).
