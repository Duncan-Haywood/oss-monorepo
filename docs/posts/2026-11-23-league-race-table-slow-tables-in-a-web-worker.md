---
title: "Moving the league race table's slow search into a Web Worker, and what 606 real tables showed"
seo_title: "Moving a slow clinch search into a Web Worker: 606 real tables"
date: 2026-11-23
tags: [web-workers, algorithms, sports, league-schedule-generator]
description: "The clinch watch now hands its hard tables to a Web Worker. On 606 real football tables it lowered 553 magic numbers, settled 3 statuses and made 0 wrong calls."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
has a race table. Type in your results and set how many teams make the
play-offs, and it tells you who has clinched a place, who is out, and how
many more points clinch it for everyone else. It never calls a team
clinched or out wrongly. Ties on points count against the team.

With 12 or fewer games left it tries every finish. Past that it runs a
branch-and-bound search with 20,000 nodes per question on the page's own
thread, so the table appears straight away. On 18 real top-flight seasons
(openfootball, public domain), replayed date by date, that search
proved 90.1% of 6,144 tables in full. This post is about the other 606.

## What changed

The page still draws the quick answer first. If that table is not fully
proved, the page sends it to a Web Worker (`race-worker.mjs`), and you can
keep typing while it runs. The worker asks three yes/no questions for each
team still marked alive:

- **Clinched?** If this team loses every game left, can enough others
  finish level with it or above it to push it out? If not, it has clinched.
- **Out?** If it wins every game left, must enough others still finish
  above it? If so, it is out.
- **Clinched unless tied?** Can enough others finish strictly above it? If
  not, only a tie-break can cost it the place.

It asks them with 200,000 nodes per question and then 2,000,000. Then it
works out each "more points clinch it" number with 20,000 nodes per team
(the page thread gets 1,000). After each pass that changes something it
sends the table back, and the page redraws it. A yes/no search either
finishes, which is a proof, or runs out and changes nothing. So the
"never wrong" promise holds.

## What 606 real tables showed

| measure | result |
|---|---|
| tables the page thread left unproved | 606 of 6,144 |
| wrong calls (against the final table or the page's own calls) | 0 |
| magic numbers lowered | 553 (616 points, 1.1 each) |
| statuses settled that the page showed alive | 3 |
| alive rows with a question still open | 75 before, 53 after |
| worker time per table | 1.1 s mean, 18 s slowest |

We had expected the worker to settle many more teams than 3. It didn't,
because the page thread already asks the same yes/no questions whenever
its exact-place search runs out. What those 606 tables left unproved was
mostly the exact best and worst place, which the page never shows. The
statuses were already settled.

The magic numbers were different. The page thread gives each team only
1,000 nodes for its number, and when that runs out it shows a safe number
that is too high. On these tables the worker brought 553 numbers down by
about one point each. That is the difference between "4 more points
clinch it" and "3", in the column people screenshot for the group chat.

The 3 settled statuses were Bayern Munich safe from relegation in
February 2022 (two match dates earlier than before) and Real Madrid safe
in April 2023 (one date earlier).

In Chromium, with Serie A 2023-24 typed in after its 78th match date and
17 safe places, the quick table appeared in about 0.7 s. The page
answered a script call in 1 to 2 ms while the worker ran. The worker
replied after 1.7 s with every status proved and 5 numbers lowered.

## Not checked

We have not compared the numbers with a real league's own published magic
numbers. We also have not timed it on a slow phone. The measurement
script is `eval/race-budget.mjs`, and its output is checked in next to it.
