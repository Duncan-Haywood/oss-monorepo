---
title: "The tennis feeder's contact-time report now goes in tenths of a ppm: five right answers back"
seo_title: "Tennis feeder: contact-time report in tenths of a ppm"
date: 2026-11-19
tags: [open-tennis-robots, firmware, protocol, simulation]
description: "One extra byte on the feeder board's survey frame: on 2,964 stored simulated drills the rounding guard now withholds 1 right verdict instead of 6."
---

The open tennis-ball feeder's ESP32 board estimates how long a ball stays in
contact with the launcher wheels. It refits each ball's speed drop at nine
assumed contact times and sends the Raspberry Pi the mean misfit (rms) for
each one. The Pi compares the best candidate's rms with an instant contact's
rms. If the best is at most 0.6 of the instant one, the Pi tells the owner to
set that contact time in the firmware config.

Until today the frame carried each rms in whole parts per million (ppm). That
morning's run found one simulated build that the rounding had pushed inside
the 0.6 margin, and added a guard: advise only when the worst case the rounding
allows still clears the margin.

## The fix for the cause

The frame now ends with one more byte: how many units make a ppm. The board
sends 10 (tenths). If a candidate would overflow at 6,553.5 ppm, it falls back
to 1, so a badly fitting wheel still reads as a number and not as "no data".
The Pi reads the byte and shrinks the guard's half-step from 0.5 ppm to 0.05.
Older boards' frames, without the byte, still decode as whole ppm.

## What it changed

A new script rescored every stored simulated capture with survey rows: 41
files, 2,964 drills, 2,310 nonzero picks. It compared each verdict with the
exact share from the board's own sums:

| frame | verdicts unlike the exact share | right takes advised (of 2,394) | instant builds advised (of 570) |
| --- | --- | --- | --- |
| exact | 0 | 1,553 | 0 |
| whole ppm, guarded | 6 | 1,547 | 0 |
| tenths, guarded | 1 | 1,552 | 0 |

All six verdicts the old guard withheld were right answers, with exact shares
between 0.590 and 0.599. Tenths bring five back. One surprise: none of the six
was a build with a tiny rms. Their instant-contact rms ran from 29 to 196
ppm. On a 30 ppm baseline, one ppm of rounding moves the bound by about 0.035,
which is plenty when the true share sits 0.005 inside the margin.

## Not known

It is all simulation, and these are stored rows, not a fresh capture. How
often a real drill lands that close to 0.6 has not been measured. The details
are in the firmware README, "The take survey's rms in tenths of a ppm", and
`eval/take-share-tenths-2026-11-19.md` in the
[open-tennis-robots](https://marisstella.app/open-tennis-robots/) venture.
