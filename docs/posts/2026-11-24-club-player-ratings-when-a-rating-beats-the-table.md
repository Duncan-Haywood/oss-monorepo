---
title: "Club player ratings: where a rating beats the league table, and where it doesn't"
seo_title: "Club player ratings: when a rating beats the league table"
date: 2026-11-24
tags: [ratings, glicko-2, pickleball, league-schedule-generator]
description: "A free Glicko-2 and season-fit rating page for club leagues, tested on 50,093 football results and 200 simulated box seasons. It wins on boxes, not Americano."
---

Pickleball players pay for DUPR, tennis players for UTR, and many squash and darts clubs keep an Elo spreadsheet by hand. They all want the same thing: one number per player that moves with every result, says how sure it is, and can seed next month's boxes. The [League Schedule Generator](../../ventures/league-schedule-generator/) now has [a page for it](https://marisstella.app/league-schedule-generator/player-ratings.html). You paste a season of results, singles or doubles (`Ana & Ben 11-7 Cy & Dee`), and get a rating, a ± and win chances for any match. Nothing is uploaded.

Before we wrote the marketing copy we wanted to know when a rating actually helps. We checked two things.

## Real results: 50,093 international football matches

The [martj42 international results](https://github.com/martj42/international_results) (CC0) list every men's international since 1872 with its score. Each method predicted every match from earlier results only. We tuned on 1990-2009 and scored 16,512 matches from 2010 on.

| held out 2010- | Brier | log loss | accuracy |
|---|---|---|---|
| home side's average (no ratings) | 0.1824 | 0.6592 | 62.2% |
| Elo, tuned | 0.1321 | 0.4809 | 76.8% |
| World Football Elo constants | 0.1321 | 0.4725 | 77.3% |
| Glicko-2, monthly periods | 0.1301 | 0.4773 | 77.4% |

Glicko-2 beat tuned Elo on both measures, and paired bootstrap intervals exclude zero for both. Against World Football Elo, with its goal-margin and tournament weights, the result is mixed: Glicko-2 has the better Brier score but the worse log loss. Adding goal margin to Glicko-2 did not help at all. Football has too few goals per match for the margin to say much.

## Simulated club seasons: the result we didn't expect

There is no public club doubles data, so we simulated it. Sixteen players with known levels play games to 11, rally by rally, over 200 seasons per setting. We then scored how well each table recovered the true order.

On **Americano and Mexicano nights**, where partners rotate and everyone meets everyone, a plain **points-difference table did as well as any rating** we tried, and better than Glicko-2 updated night by night. Once the draw is balanced, total points difference is close to all the information there is. So the page does not claim to order an Americano night better than its own leaderboard. What it adds there is the ± and the win chances.

**Box leagues** are different. A box league's own order puts everyone in box 1 above everyone in box 2. After 8 rounds of 16-player box seasons, the page's whole-season fit beat the box ladder's order in 166 of 200 seasons, and after 12 rounds in 181 of 200. Glicko-2 did slightly better still. After only 2 rounds the ladder usually wins, because it starts from the club's seeding and the rating starts everyone level.

## What we built from that

The page defaults to a **whole-season fit**: a doubles Bradley-Terry model on side averages, fitted to every result at once so the order of games does not matter, with a Laplace ± per player. **Glicko-2** stays as an option for ratings that move month to month or carry over from one season to the next. Both pass Glickman's worked example or the matching tests, and every number above can be rerun from `eval/` in the venture.

Still missing is a real club's season. If you run a box league or a pickleball ladder and would share a season of dated results, that is the check we want next.
