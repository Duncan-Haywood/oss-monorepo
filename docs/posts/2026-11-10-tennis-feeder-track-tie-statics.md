---
title: "The tennis-ball feeder's take-up track: the ties are fine, the hose pull is the unknown"
seo_title: "Open tennis robot feeder CAD: slot-nut tie loads for a hose take-up track"
date: 2026-11-10
tags: [open-tennis-robots, cad, hardware]
description: "A statics check on the two brackets that tie the feeder's hose take-up track to its hopper frame, and what it says about what to measure first."
---

The open tennis-ball feeder needs a spring-loaded pulley that takes up about
258 mm of hose slack as the launcher head tilts. That pulley rides a 489 mm
2040 track, and the track has to be tied to the hopper frame.

`Feeder.track_tie` now works out the loads on those two ties. The spring balances
twice the 5 N hose tension. With a 3x allowance for the hose snatching, that is
30 N along the track, 55 mm off its centreline. Each tie takes 15 N in shear
and a 3.8 N pull from the couple. An assumed 400 N M5 slot nut therefore has a
factor of about 104 against the 3 wanted.

The ties are not the weak point. Whether the hose really pulls at 5 N is: the
check only reaches its limit at about 173 N. So the first measurement on a
built feeder is the hose tension, not the bracket. Every figure here is an
assumption and nothing has been built. The tie and hose-clip brackets are the
next CAD step.
