---
title: "Start here: League Schedule Generator, a fair season from a list of team names"
date: 2026-10-29
tags: [start-here, league-schedule-generator, sports, scheduling, volunteers]
description: "For league organisers and club volunteers: what the free schedule maker gives you, your first season in ten minutes, and what it leaves to you."
---

# Start here: League Schedule Generator

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these tools.*

## Who this is for

You are the person who ended up running the league. Maybe it is a Tuesday
night pickleball ladder at the rec centre, an under-10 soccer division, a pub
darts league, a chess club, a cornhole night or the office softball team. You
have a list of team names, a couple of courts or fields, a start date, and a
group chat full of people asking when they play.

League Schedule Generator turns that list into a full season with real dates,
and keeps it right when the weather or the teams change.

## The problem, as you would put it

"I built the schedule in a spreadsheet. Then someone pointed out one team had
five home games in a row, the odd team out sat out twice in a row, and the late
slot always went to the same three teams. Then it rained, and I had to redo the
whole sheet."

Fairness in a round robin is easy to get wrong by hand, and a single
cancelled night can ripple through every week after it.

## What you get

- **A fair round robin in about a minute.** Everyone plays everyone, once or
  twice, with home and away balanced to the fewest possible back-to-back home
  or away games. For an even number of teams that is the proven minimum.
- **Byes handled for odd numbers.** A bye is added automatically, and the tool
  names any team that would sit out first, last or twice in a row.
- **Courts and time slots shared out evenly**, so nobody is stuck with the
  late game all season.
- **Real dates on your league nights**, skipping holidays you list and working
  around dates when a team cannot play.
- **Rainouts that move only what has to move.** Cancel a night, or one team's
  match, and the match goes to the earliest later night both teams are free and
  a court is open. Nothing else changes. You can name an agreed make-up date
  instead, and "Download rainout change notices (.txt)" writes a post for the
  league chat plus a short note per affected team.
- **Standings and play-offs** from the results you type, with an optional
  bracket seeded from the table.
- **Exports people actually use**: a CSV, calendar files (.ics) for the whole
  league or one team, a Google Calendar or Outlook CSV, plain text for the
  group chat, printable score sheets, and a single self-contained league web
  page you can put on any static host or email.
- **A share link** that carries the whole setup inside the link itself, so a
  co-organiser opens the same league in one click.
- **Other formats for one-night events**: pool play, single and double
  elimination brackets, Swiss pairings, a challenge ladder, and Americano and
  Mexicano rotations for doubles nights.

Every finished schedule is checked again by a separate validator: every pair
meets the right number of times, no team plays twice in a round, no court is
double-booked, and every date respects your weekdays, skip dates and
blackouts.

## Your first ten minutes

1. **Open the tool** at
   [its live page](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/).
   "Load an example" fills it in if you want to look first.
2. **Section 1, Teams.** Type your team names, one per line.
3. **Section 2, When.** Enter the first date (YYYY-MM-DD) and tick the
   weekday or weekdays you play. Add skip dates for holidays, team blackout
   dates if you have them, and tick "Double round robin" if everyone should
   play everyone twice. If the season is too short for a full round robin, set
   "Rounds to play".
4. **Section 3, Where.** List your courts or fields and the time slots each
   night.
5. **Press "Build the schedule."** Read "Your schedule", then use "By team"
   ("Show one team") to check what a single team's season looks like.
6. **Send it out.** "Copy as plain text" for the group chat, "Download
   calendar (.ics), whole league" or the per-team version for phones, and
   "Copy share link" for your co-organiser. "Print or save as PDF" works for
   the noticeboard.
7. **During the season**, paste results into the Results box to get the
   standings, and use section 5 for rainouts. At the end, "Start next season
   from this league" keeps the teams, courts and nights and clears the old
   dates and results.

Running several divisions on the same fields? The
[multi-division page](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/multi-division-league-schedule.html)
schedules them together, keeps teams that share a coach out of the same time
slot, and can weigh travel time between venues.

## What it costs and where your data goes

Free and MIT licensed, with no signup. The page runs in your browser and team
names and dates are never uploaded. Your last setup is remembered in this
browser's local storage only, and "Clear" forgets it. The share link keeps the
setup in the part of the address after the `#`, which browsers do not send to
the server. Anonymous feature counts stay in local storage and can be switched
off.

If you want players to have one link for fixtures, standings and a "Report a
score" form, you can run the small league server yourself (`server.mjs`, with
Docker, Fly or Render in your own account). Score reports wait until you
approve them. It needs two secret keys you choose and should sit behind HTTPS.
The README explains the setup.

## What it does not do

- **It is not league administration.** No registration, payments, team
  messaging or live scores. If you need those, use a platform such as TeamSnap,
  LeagueApps or SportsEngine and paste this schedule into it.
- **Court and time assignment is a seeded search**, so it is repeatable for a
  given seed but not proven optimal. Only the home and away break count is a
  proven minimum, and only for even leagues.
- **Tie-breaks are yours.** It ranks on points, goal difference and goals for,
  with head-to-head as an option. Anything past that is your league's rule.
- **Check before you send.** It was tested against hand-worked 4- and 5-team
  leagues and random checks across many league sizes, not against your venue
  bookings. Look over every date, court and pairing before the schedule goes to
  the league.

## Where to go next

- The live tool:
  [league-schedule-generator](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/)
- Guides:
  [how to make a round robin schedule](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/how-to-make-a-round-robin-schedule.html),
  [an odd number of teams](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/how-to-schedule-a-round-robin-with-an-odd-number-of-teams.html),
  [limited courts and time slots](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/how-to-schedule-a-league-with-limited-courts-and-time-slots.html),
  [rescheduling a rained-out game](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/how-to-reschedule-a-rained-out-league-game.html)
  and the
  [pickleball league guide](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/pickleball-league-schedule.html).
- Every feature and how it was checked:
  `ventures/league-schedule-generator/README.md` in the repository.
- Scheduling people rather than teams:
  [the shift roster builder](2026-10-29-start-here-shift-roster-builder.md).
  Running the league server on your own account:
  [self-hosting](2026-10-29-start-here-self-hosting.md).
- Back to the series hub: [Start here](2026-10-29-start-here.md).

*No warranty. An organising aid, not legal or financial advice; league rules,
venue bookings and tie-breaks are yours to apply.*
