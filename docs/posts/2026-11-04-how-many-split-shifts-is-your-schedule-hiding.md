---
title: "How many split shifts is your schedule hiding?"
date: 2026-11-04
description: "The shift roster builder's command line now lists every day one person works two shifts with a gap between them, and what a split-shift premium would cost on your own numbers."
tags: [shift-roster-builder, scheduling, restaurants]
---

# How many split shifts is your schedule hiding?

A lunch rush, a three-hour gap, then the dinner rush: the same person on the
clock twice in one day. Some places owe a premium for it, and even where none
is owed, staff dislike it.

`node cli.mjs --split-shifts 2 staff.txt shifts.txt` lists each pair of
same-day shifts with at least 2 hours between them, and prices them at your
`--premium-hours` (default 1) of that person's wage. `--exempt` names are
listed without a premium.

Two honest limits. The build only creates a split when `--rest` is set below
the gap, so the report earns its keep on a roster you posted by hand. And it is
arithmetic on numbers you enter: no jurisdiction preset, not legal advice.
It is tested on hand-built rosters only. A real posted schedule would be the
better test.
