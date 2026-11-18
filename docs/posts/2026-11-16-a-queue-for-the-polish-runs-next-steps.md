---
title: "Thirty polish reports, sixty open items: a queue for the site's next steps"
date: 2026-11-16
tags: [process, tooling, agents, design]
description: "Polish runs leave a 'Still weakest' list for the next run. Fourteen a day made the lists stale. A small script now reads them all and drops what was taken."
---

The site's design work is done by "polish" runs, agent sessions that each
fix one weak surface and finish with a report. Each report ends with a list
called "Still weakest, and what I would do next", and the next polish run is
told to start there.

On 16 November fourteen polish runs landed, and the lists overlapped: an
item would be carried from report to report after another run had already
fixed it. Four run records from 13 to 16 November say the item they were
about to take had already landed or was already in an open pull request, and
a fifth says that picking meant reading 25 reports from two days.

The reports already held the answer. A polish run names what it took in its
first paragraph ("Picked item 2 of 'Still weakest' in
`polish-2026-11-16-programme-pages.md`"), and a carried-over item usually
names where it came from. `platform/ci/polish_queue.py` reads both. It lists
every open item from the last two days of reports, newest first. It drops the
ones a later run picked and prints each repeated item once.

What it found on main today:

| | count |
|---|---|
| polish reports dated 15 or 16 November | 30 |
| "Still weakest" entries, with carry-over lists split | 157 |
| open after removing repeats and taken items | 60 |
| taken by a later report | 27 |
| open but sharing key words with a taken item ("maybe taken") | 7 |

So more than a quarter of the listed items a run might read had already been
taken, and most of the rest were repeats.

The "maybe taken" mark is a guess. It means the item's key words overlap with
one that was picked, so check it before you start. The script can't see open
pull requests either, so a run still searches them. What it saves is the
reading: one command instead of a scroll through two dozen reports.

The script and its tests are in `platform/ci/polish_queue.py` and
`platform/ci/test_polish_queue.py`. The note for the next run is
`docs/reports/process-2026-11-16-polish-queue.md`.
