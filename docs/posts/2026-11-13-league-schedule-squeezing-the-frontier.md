---
title: "Squeezing a home-and-away season under a cap on back-to-back games"
seo_title: "Round-robin carry-over vs home/away breaks: filling the gaps in the trade-off"
date: 2026-11-13
tags: [league-schedule-generator, ventures, scheduling, optimisation]
description: "The league scheduler offered a 20-team season at 92 back-to-back home or away games or at 72, with nothing in between. A search that moves fixtures and grounds together now fills those gaps. In 12 runs it added 42 seasons to the list and cut carry-over at a given break count by 5.2% on average."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has an option called "Spread who you meet next". It searches for a season with even *carry-over*: how often a team meets the same opponent straight after the same other team. Fairness pulls against another thing organisers care about, which is *breaks*: a team playing two home games, or two away games, in a row. So after its searches the page lists every season on the frontier between the two. On that list, no other season has both less carry-over and fewer breaks. You click the one you want.

The list had holes. For a 20-team home-and-away league (seed 1), it went from 1,916 carry-over at 92 breaks straight to 2,396 at 72. An organiser who wanted about 80 had nothing to pick.

## Why the existing searches couldn't fill the gap

There were three kinds of search. Weighted searches price breaks inside the score, but they move only the second half of the season against the first half's fixed grounds. Capped searches start from the textbook circle method and do poorly between about 66 and 90 breaks. And moving one match's ground at a time doesn't help much either: it tips a team's home and away count out of balance, and the search has to refuse the move.

## Moving fixtures and grounds together

The new search, `squeezeDoubleRounds`, gives each pair of teams one host: that team is at home when they meet in the first half and away when they meet in the second. With grounds stored per pair, reordering fixtures inside a half carries every match's ground along with it. No team's home count changes, whatever the move. Three moves change grounds while keeping the counts in line:

- flip one pair;
- flip two pairs of one team, one it hosts and one it visits;
- flip a whole alternating run: every opponent one team meets over a stretch where it already alternates home and away. The run stays alternating, so only its two ends can gain or lose a break.

The score is carry-over plus 200 per break over the cap.

## Where it starts matters more than how long it runs

Our first try started from the fairest season, 1,460 carry-over at 116 breaks, and asked for 66 to 90 breaks. It got no lower than 112. That season is perfectly balanced, and every move out of it costs carry-over.

Starting from the season below a gap worked much better. We gave the search a cap above that season's own breaks, so it could trade a few back for fairness. From 2,396 at 72 it found 2,048 at 82, in about 0.4 seconds. Asked to stay at 72, it found 2,186, which beats the season it started from on both counts.

So the page now runs four of these *squeezes* after its twelve searches, one after another. Each one aims at the widest gap left on the frontier, with a cap halfway across it, and starts from the season just below the gap. The squeezed seasons only join the list. The four main choices pick from the same ten searches as before, so every share link made before today still builds the same season.

## What it measured

We ran 17 to 20 teams, home and away, seeds 1 to 3 (`eval/squeeze-gap.txt` in the venture):

- 2 to 4 squeezed seasons joined the frontier in every one of the 12 runs, 42 in all. Another 10 seasons that the searches had found were beaten on both counts.
- We took the least carry-over available within each break count, from the fewest breaks to the most. Squeezes cut it by 5.2% on average and by up to 33% at one count: at 20 teams (seed 3), 70 breaks went from 4,462 carry-over to 3,210.
- 20 teams, seed 1: the list now reads 1,460/116, **1,862/104**, 1,916/92, **2,048/82**, 2,396/72, **3,412/66**, **3,646/60**, 4,884/54. The widest gap fell from 24 breaks to 12.
- The cost is about 1.5 seconds more on one extra thread at 20 teams.

In the browser, an 18-team season listed the squeezed 1,406/92. Clicking it kept that season, and its share link opened on the same season in a fresh tab.

## What it did not fix

The 19-team jump is still there. On every seed the frontier goes from about 1,300 to 1,500 carry-over at 79 to 87 breaks to more than 3,100 at 78 and under. Squeezes improve the low-break side of that jump (3,203/72 became 3,143/78) but never reach the 1,500s. The seasons above the jump come from a "shift" starter timetable, and their low carry-over is tied to their break pattern. The next step is to start a squeeze from one of those and walk its cap down. A version for single round robins is also still to do.

The code is MIT licensed, and the searches run in your browser on Web Workers.
