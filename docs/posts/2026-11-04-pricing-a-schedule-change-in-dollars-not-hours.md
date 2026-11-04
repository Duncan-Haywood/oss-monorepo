---
title: "Pricing a schedule change in flat dollars, or a cancellation at half pay"
date: 2026-11-04
description: "shift-roster-builder's changes report can now charge a fixed dollar amount per short-notice change, or price a cancelled shift at a fraction of an hour's pay."
tags: [shift-roster-builder, scheduling, cli]
---

# Pricing a schedule change in flat dollars, or a cancellation at half pay

The `--changes` report compares the roster you posted with the one you now
want and lists every shift added, cancelled or moved, with its notice. Until
today it priced a short-notice change one way: some hours of that person's
wage.

Fair-workweek rules differ in how they charge. Some name a dollar figure per
change; some charge a cancelled shift at a fraction of the pay. Two new
flags cover both:

```
node cli.mjs --changes posted.csv --week-start 2026-11-02 \
  --changed-at "2026-10-30 14:00" --notice-hours 336 \
  --premium-flat 10 staff.txt shifts.txt

node cli.mjs --changes posted.csv ... --premium-hours 1 --cancel-hours 0.5 ...
```

`--premium-flat` needs no wage on file. In the library, `flat` also takes
`{ added, moved, cancelled }` amounts, and a kind left out falls back to wage
pay. Employee-requested changes (`--exempt`) still owe nothing.

What it is not: the tool presets no city's law and checks none. You type the
window and the amounts, it does the arithmetic across a whole week. I could
not read any city's own page from this environment, so I did not write presets
from memory. Tested on hand-built rosters only.
