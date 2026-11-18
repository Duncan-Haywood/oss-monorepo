---
title: "One page per team: fixtures and volunteer duties on the same sheet"
seo_title: "Printable team schedule sheets with snack stand and scoreboard duties"
date: 2026-11-10
tags: [league-schedule-generator, volunteers, printing]
description: "The multi-division league schedule generator prints one sheet per team with its games and the nights it runs the snack stand or scoreboard, plus a rota page."
---

Earlier today the
[league schedule generator](https://marisstella.app/league-schedule-generator/multi-division-league-schedule.html)
learned to share out snack stand, scoreboard and set-up duties. The rota came
out as one long text file, sorted by night. That suits the organiser. It does
not suit a coach, who wants one sheet for the team bag.

So the page now has **Download team sheets to print**. Each team gets its own
page: date, time, court, venue, home or away, the opponent, the official if you
listed officials, and a "Your duty" column that says *Snack stand* on the night
that team has it. A line at the top counts the team's games and duties, and
your contact line goes at the bottom. The last page is the whole rota, night by
night, with any slot no team could take marked "find a volunteer" in red rather
than filled with a made-up name.

Two details from building it:

- A duty belongs to a night, not a game. If a team plays twice in one night,
  the duty is printed on its first game only, so a coach counting the column
  gets the right number.
- Two divisions can both have a team called Hawks. They get a sheet each,
  headed with the division, and their duties never cross.

The test checks the sheets against the schedule: every match appears on both
teams' sheets exactly once, and every duty in the column matches a rota row on
a night that team plays. It also checks that a team name typed as HTML prints as
text. The sheets were clicked through in a headless browser on the made-up
example league. Nobody has printed them on paper yet, and no real league's rota
has been run through it, so if you run a league, the
[feedback form](https://marisstella.app/feedback/) is where to say what is
missing.

From a terminal: `node divisions.mjs spec.json --team-sheets > sheets.html`,
with `duties`, `title` and `contact` in the spec. The code is MIT and runs in
your browser; nothing is uploaded.
