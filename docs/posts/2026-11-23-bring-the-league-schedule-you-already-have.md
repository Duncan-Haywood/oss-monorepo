---
title: "Bring the league schedule you already have: paste a spreadsheet, get standings and calendar feeds"
seo_title: "Import a rec league schedule from a spreadsheet or calendar"
date: 2026-11-23
tags: [league-schedule-generator, rec-leagues, scheduling, open-source]
description: "The self-hosted league page now runs on a season made elsewhere: rows pasted from Excel, a TeamSnap or club-site CSV, or an .ics calendar."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The [League Schedule Generator](../../ventures/league-schedule-generator/) has
two halves. The free page builds a fair round robin. The self-hosted league page
(`server.mjs`, MIT, runs on the organiser's own server) then runs the season:
standings, rainout moves that change nothing else, calendar feeds per team that
follow every move, a website embed, player availability, captains' score
reports and referee assignments.

Until today the second half only worked on a season the first half had built.
That left out most organisers, the ones who start a season with a schedule
already made: typed into a spreadsheet by last year's convenor, handed down by
the parks department, or exported from a league platform. To use the league
page they would have had to retype it and accept a different season.

## What changed

The admin form has a new box, "Already have a schedule?". Paste into it:

- rows copied straight out of Excel or Google Sheets, header row included
  (they arrive tab-separated);
- a CSV with a date column and either Home and Away columns or one column like
  `Hawks vs Owls` (`Owls @ Hawks` means Owls are away), such as a TeamSnap or
  club-website export; time, location, event type and scores are read when the
  file has them;
- the text of an `.ics` calendar.

Practices and parties are left out, and so are rows with `BYE` or `TBD`. Each
left-out group gets a count. A row that cannot be read is named by line number
with the reason, and the rest of the file still imports. A date like `5/6/2026`
is read month-first unless another date in the same column only makes sense
day-first (`25/9/2026`). Then the whole column is read day-first, and the box
says so.

## How it was checked

Twelve built seasons (4 to 16 teams, single and double round robins, 819 games
across three courts and three time slots) were written out in every format the
tool exports and read back in. The schedule CSV, the Google and Outlook calendar
CSV, the TeamSnap CSV and the `.ics` file each returned all 819 games with the
same date, time, court, home team and away team
(`eval/import-roundtrip.txt`).

One format failed, and the failure was expected. SportsEngine's upload template
names teams only by HQ ID, so a file in that shape cannot say who plays. The box
now says that in one line rather than listing 819 failed rows.

What is not checked yet is a real league's own file. The formats above are the
ones this tool writes, plus the column names the platforms document. If you run
a league and your export does not import cleanly, the box names the line and
the reason. That message is what we need to make the reader better.
