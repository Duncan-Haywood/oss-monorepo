---
title: "Load a coach sign-up form into a single-division league schedule"
seo_title: "Import team unavailable dates from a Google Forms CSV"
date: 2026-11-04
tags: [league-schedule-generator, scheduling, csv]
description: "The one-division league schedule page now reads a Google Forms or spreadsheet CSV of 'dates we cannot play' into its team blackout box, in the browser."
---

The multi-division page could already read a coach sign-up export. The main
round-robin page, the one most organisers use, could not. It can now: pick the
CSV under the team blackout box and it finds the Team column and any column
whose header mentions dates, "cannot", "unavailable", "blackout" or "bye", then
fills the box. The file is read in your browser; nothing is uploaded.

It handles quoted cells, a spreadsheet byte-order mark, dates split by commas,
semicolons or line breaks, ranges like `2026-11-05 to 2026-11-12`, "none"
answers, and a team that submits twice (dates merge). A row naming a team not in
your list is reported by row number and skipped, never guessed.

Tested on made-up forms only; a real export with names removed would show which
headings people actually use.
