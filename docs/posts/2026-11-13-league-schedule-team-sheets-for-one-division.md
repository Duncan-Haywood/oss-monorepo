---
title: "Team sheets and a snack-stand rota for a one-division league"
seo_title: "Printable team schedules and a volunteer duty rota for a rec league"
date: 2026-11-13
tags: [league-schedule-generator, ventures, printing]
description: "The free league schedule generator now prints a page per team, with byes, officials and duty nights, for one-division leagues."
---

Most rec leagues are one division: eight pickleball pairs on a Tuesday, a dozen softball teams on Sundays. The [league schedule generator](https://marisstella.app/league-schedule-generator/) had printable team sheets and a fair volunteer rota (snack stand, scoreboard, field set-up), but only on its multi-division page. So the organiser of a plain one-division league, which is the most common case, couldn't get them.

They're on the main page now. Type the duties, one per line with how many teams each needs a night:

```
Snack stand: 2
Scoreboard
```

Build the schedule. A line under the downloads reports how many slots were filled and the spread per team. **Download team sheets to print** then gives one page per team. Each page lists the team's games in date order with time, court, home or away, the opponent, the official if you listed officials, and "Your duty" on the nights the team has one. A final page lists the rota night by night. Duties only go to teams that play that night, never two to one team on the same night, and fewest-so-far goes first. On a night with too few teams playing, the slot is printed as "find a volunteer"; the tool never makes up a team.

## Byes, which a one-division sheet needs

A league with an odd number of teams has a team sitting out every round. The multi-division sheets didn't show byes, because that schedule has none per night. The one-division sheets now print "Bye: no game this week" on the right date, and the rota never gives a duty to a team on its bye.

Rather than write a second copy of the rota and sheet code, the page converts the one-division schedule into the multi-division shape. Rounds on the same date share a night, and each round's bye is kept. The page then calls the same functions, so one fix covers both pages.

## What the print check caught

This week the venture got a PDF print check (`eval/print-check.mjs`). It renders every printed output in headless Chromium on Letter and A4 and checks the result. We added the new sheets to it with nine long team names, three officials and two duties. It failed three times:

1. "Court 1", "Snack stand" and "Jordan Price" each broke over two lines.
2. An empty Venue column was printed, because a one-division league has no venues.
3. Once those were fixed, the table ran 12 px past A4's printable width.

Now the short cells don't wrap, the Venue column is printed only when a venue differs from its court (this also fixes the multi-division sheets), and the printed type is a little smaller. The check finishes with 91 passes and 0 failures.

Not yet checked: a real printer and real paper, and a real league's rota. If you run a league and try it, the page's feedback link is the place to say what's wrong.

*This tool is provided free and as-is, without warranty of any kind. Check dates and venues with your organiser.*
