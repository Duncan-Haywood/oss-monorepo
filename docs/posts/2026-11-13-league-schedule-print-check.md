---
title: "Printing a league schedule: what a PDF check found that the tests didn't"
seo_title: "Printable league schedules: an automatic PDF layout check"
date: 2026-11-13
tags: [league-schedule-generator, ventures, printing, testing]
description: "Rendering every printable output of the league schedule generator to PDF on Letter and A4 found 12 layout faults that its unit tests never saw."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has about 470 unit tests. They check that every pair meets the right number of times, that nobody plays twice a night, that rainouts move only what they must. None of them looked at paper, and paper is where a lot of league schedules end up: on the clubhouse wall, on a clipboard at the scorer's table.

So we wrote a print check. It builds a few leagues (including deliberately long team names like "Northside Thunderbolts Women's Masters"), renders each printable output to PDF in headless Chromium on Letter and A4, and asks simple questions a person would ask holding the sheet:

- Does anything run off the right edge?
- Do short labels like "Court 2" or "18:00" stay on one line?
- Is there a column with a header and nothing in it?
- Is there a blank page, or a round's heading stranded at the foot of a page with its games overleaf?
- Does each score sheet get its own page?

It covers seven outputs: the score sheets, the downloadable league web page, the branded print pack, the multi-division score sheets and team sheets, and the two pages' own "Print" button after filling in the real form.

## What it found

The first run failed 12 checks. None were dramatic, and all were the kind of thing that makes a printout look careless:

- **"Court 1" broke over two lines in every output.** The court column was the first thing the browser squeezed when team names were long. Time, court, round and official cells now never wrap.
- **The score sheets always printed an empty Official column** when no referees were assigned, taking width from the team names. It now appears only when someone is assigned.
- **A round's heading sat alone at the bottom of a page** in the downloadable league page, with its games on the next one. Rounds are now kept together.
- **Twenty teams with officials ran 3 pixels past A4's printable width.** Slightly tighter print padding fixed it.

After the fixes, all 82 checks pass. The fixes are pinned by unit tests, and the check itself is one command (`node eval/print-check.mjs`) for the next change that touches a printed layout.

## What it doesn't check

It doesn't use a real printer. Printer margins vary, and some browsers print in dark mode if the system is set to dark. A printed page in an organiser's hand is still the real test. If you run a league and print from the tool, we'd like to hear how it came out.
