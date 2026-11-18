---
title: "Turn a coach sign-up form into league blackout dates"
seo_title: "Import team unavailable dates from a Google Form CSV to a schedule"
date: 2026-11-04
tags: [league-schedule-generator, scheduling, csv]
description: "Load a Google Forms or spreadsheet export of 'dates we cannot play' straight into a multi-division league schedule, in the browser."
---

Most volunteer leagues collect "dates we cannot play" with a form, then retype
the answers into a scheduler. The multi-division league schedule page now takes
the CSV export directly. Pick the file under the blackout box and the page
reads it in your browser (nothing is uploaded), finds the Team, Division and
date columns by header, and fills the box. Matches that fall on those nights
move to the next night both teams are free, with the same checks as before.

What it handles: quoted cells and a spreadsheet byte-order mark, dates split by
commas, semicolons or line breaks, ranges like `2026-11-05 to 2026-11-12`, "none"
answers, and a team that submits twice (dates are merged). What it will not do
is guess: a row naming a team that is not in the league, or a team name used in
two divisions with no Division column, is reported by row number and skipped.

Command line: `node divisions.mjs spec.json --blackouts-csv form.csv`.

Caveat: tested on made-up forms only. If you run a league and can share an
export with the names removed, it will tell us which column headings people
really use.
