---
title: "Build the season fairly, then load it into TeamSnap or SportsEngine in one upload"
seo_title: "Import a round-robin schedule into TeamSnap or SportsEngine"
date: 2026-11-17
tags: [ventures, league-schedule-generator, integrations]
description: "The free league schedule generator now writes TeamSnap's and SportsEngine's own schedule import files, columns copied from their published templates."
---

Most of what the [league schedule generator](https://marisstella.app/league-schedule-generator/)
has learned over the last weeks is about fairness: the fewest back-to-back home or away
games, courts and time slots shared evenly, blackout dates, and an even strength of
schedule when the season is cut short. That work helped leagues that run on a spreadsheet.
It did little for leagues already on TeamSnap or SportsEngine. They pay those platforms for
registration, payments and team messaging, and the schedule lives there too. A 10-team
season is 45 games, and typing 45 games into a web form is where an organiser gives up and
takes the platform's own schedule.

So the schedule card now has two more downloads, each one the platform's own import file:

- **TeamSnap:** the organisation schedule import. Type the TeamSnap division name and,
  optionally, the location name and an arrival time. The file has TeamSnap's columns in
  TeamSnap's order (Date, Start Time, End Time, Arrival Time, Short Label, Event Type,
  Division, Home Team, Away Team, Location, Location Details), dates as MM/DD/YYYY and
  times as 6:30 PM.
- **SportsEngine HQ:** the 28-column Schedule Upload file. HQ matches games by its own team
  IDs, so you paste one line per team (`Hawks = 2270996_271208`). A game with no time slot
  goes up as TBD, and a late game's end date rolls past midnight.

## Copied from the templates, not guessed

Neither platform documents its columns in one place. TeamSnap's help page links a CSV
template without listing the headings. SportsEngine's field guide lists them, but its own
template is the final word. Both templates were downloaded on 2026-11-17, and the export's
header rows equal theirs, character for character. A test pins this, and the eval note
records each file's URL and SHA-256.

The templates also set the error messages. TeamSnap says every column except End Time,
Arrival Time, Short Label, Event Type, Location Details and Away Team is required. So the
tool tells you, before you upload, when the division is missing or a game has no start
time. TeamSnap's template has no end date, so a game that ends after midnight gets a
warning. TeamSnap also warns that `% @ # *` in names can break an import, so team names
with those symbols are flagged. For SportsEngine, every team needs an HQ ID, and the error
names the teams that lack one.

## What is not known yet

No file has been uploaded to a real TeamSnap or SportsEngine organisation. Both need a paid
organisation account. What each platform does with details the templates leave open, such
as two games sharing the Short Label "Round 1" on one night, is untested. If you run a league
on either one and try it, the result is the measurement this feature is missing. The
multi-division page has no platform export yet.

The code is MIT licensed: `teamSnapCsv` and `sportsEngineCsv` in
`ventures/league-schedule-generator/calc.mjs`, with tests in `platform-import.test.mjs`.
