---
title: "Sportsmanship ratings for a rec league, and why the table also shows how hard each team marks"
seo_title: "Free sportsmanship and spirit ratings for a rec league"
date: 2026-11-18
tags: [league-schedule-generator, sports, product]
description: "Captains rate the other team after each game from their captain link; organisers sees averages, low ratings with comments, and which teams mark everyone hard."
---

Ultimate leagues ask both captains to score the other team's spirit after every game, and plenty of kickball, soccer and social leagues hand out a sportsmanship award the same way. The rating is quick. The organiser's part is not: chase a sheet from every captain every week, type them into a spreadsheet, and notice the one rating that says something went wrong on the field.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/)'s self-hosted league page now collects them. It is one small Node server, MIT licensed, that an organiser runs on their own Fly, Render or Docker box. Captains already had their own link for reporting scores and asking to move games, so the rating form lives there.

## How it works

- **Off until the organiser picks a scale.** Five categories scored 0 to 4 (rules knowledge and use, fouls and body contact, fair-mindedness, positive attitude and self-control, communication), the shape of the sheet ultimate uses, where 2 in each and 10 in all is a normal good game. Or one score from 1 to 5.
- **Each captain rates the other team** for each of their games from the last three weeks. The form starts at a normal game, so a captain only moves what stood out, and an optional comment goes to the organiser only.
- **The organiser table** has each team's games rated, its average, the average per category, its low ratings, and two columns most spirit spreadsheets leave out: how many ratings the team gave and the average it gives.
- **Low ratings are listed with their comments** (a 0 in any category, or 6 or less in total), and teams that have not rated a recent game are listed by game.
- **The league page shows a table only if the organiser ticks it**, and then only games rated and averages, never a comment.

## Why "average given" is there

A rating says as much about the rater as the rated. In the guide's worked example four teams play two weeks. The Wrens give the Hawks a 5 after a night with a shoving complaint; everything else is near normal. The table:

| Team | Rated | Average | Low | Average given |
|---|---|---|---|---|
| Owls | 2 | 11 | 0 | 7 |
| Wrens | 2 | 10.50 | 0 | 9 |
| Kites | 2 | 9.50 | 1 | 10.50 |
| Hawks | 2 | 6.50 | 1 | 11 |

The Hawks' low average comes from one bad night, and its fouls-and-contact column (0.50) says what kind. The Kites also have a low rating, a 6 from the Owls. But the Owls give the lowest average in the league, 7, while every other team gives 9 or more. That 6 may say more about how the Owls mark than about the Kites, and an organiser should read its comment before acting on it. Without the given column the Kites and the Hawks would look like the same problem. A test recomputes this table from the code the server runs.

## What it does not do

It records what captains said and adds it up. It does not run a spirit timeout or a captains' conversation, decide a dispute, or pick an award: the rule for that (and how many rated games count) is the league's. Anyone holding a team's captain link can rate for that team, the same trust as reporting a score. The category names follow the general shape of the ultimate sheet; the official guidance text is not copied, so a league that follows it formally should point captains to its governing body's version.

## How it was checked

`spirit.test.mjs` runs six tests: settings, form checks, the table with per-category and given averages, a changed rating replacing the old one, the two scales kept apart, pruning a withdrawn team's games, the unrated list and its window, HTML escaping, and the CSV with its spreadsheet-formula guard. Through the HTTP server it turns ratings on from the admin form, has two captains rate, refuses a third team's captain and the plain league link, checks the admin table and CSV, shows the public table only once ticked and with no comments, and switches the scale. No real league has used it yet; that is the next reading worth having.

Guide: [how to run sportsmanship ratings in a rec league](https://marisstella.app/league-schedule-generator/how-to-run-sportsmanship-ratings-in-a-rec-league.html). Code: `ventures/league-schedule-generator/spirit.mjs`.
