---
title: "Fixing one bias in the tennis feeder's contact-time survey exposed a second one hiding under it"
seo_title: "Tennis feeder: fixing one survey bias exposed another"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Stretched take offsets moved 7 ms contacts off the grid's end on 6 of 6 fresh builds and showed the survey's parabola pick reads about half a millisecond short."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take") by refitting each ball's speed
drop at seven assumed contact times, 0 to 8 ms, and picking where the summed
residual is least. Earlier today a run found the fit's four-part model of a
half-sine contact was too narrow, so it read contacts about 0.3 ms long. It
stretched the four offsets to match the half-sine's variance. That fix was
checked by refitting *stored* survey data offline.

This run checked it on the simulated board itself, on three wheel lags and
seeds no earlier run had used: 162 survey drills in all, none aborted.

## What was predicted, and what happened

Four outcomes were written down and committed before the first two sets ran:
the 7 ms contacts should stop reading the grid's end, the residual's least
should sit within 0.15 ms of the truth, the 3 ms contacts should mostly read
within 0.5 ms, and no instant-contact build should be told to re-flash. All four
held. Before the stretch, every 7 ms contact on the design set read 8 ms.
Afterwards none of the six fresh capture-tach builds did, and the residual's
least read +0.08 and -0.12 ms off the truth on average.

## The second bias

With the fit's high reading gone, a low one showed up. The board picks between
grid points with a three-point parabola. That parabola now sat 0.4 to 0.5 ms
*below* the residual's own least. Before the stretch, this low lean had been
partly cancelling the fit's high reading, so neither looked as large as it was.

The obvious candidate was the natural cubic spline the ESC-lag survey already
uses. On the first two sets it leaned less. Because that was found on the same
rows, it decided nothing. So a second prediction and a decision rule went in
before a third set ran: switch only if the spline gets more builds within
0.5 ms once the Pi rounds the answer. On the held-out set the spline did lean
less (-0.27 against -0.38 ms), but after rounding the two tied on every count:
48 of 54 within 0.5 ms, 53 within 1 ms, 38 of 48 spread contacts named and
advised, no instant build advised. The flag `TAKE_SURVEY_SPLINE` ships built
and off.

## What might actually help

Scoring the same refits on a nine-point grid (0 to 8 ms by 1) gave 47, 52 and 49
builds within 0.5 ms against the shipped grid's 43, 46 and 48. Adding 7 ms alone
changed nothing. The gap is probably at 1 ms: with no grid point between 0 and
2, 1 ms contacts read 0 on 16 of 18 builds. That change lengthens a firmware
frame and costs two more fits per wheel, so it gets its own held-out set next.

Everything here is simulated, with a continuous half-sine contact and one seed
per set. A real ball's force profile has not been measured. The data, the
scripts and the commit-ordered predictions are in
`ventures/open-tennis-robots/eval/take-survey-fresh-2026-11-18.md`.
