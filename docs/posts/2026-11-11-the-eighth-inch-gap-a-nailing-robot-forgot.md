---
title: "The eighth-inch gap a nailing robot forgot"
seo_title: "Robot sheathing nailing tolerance: panel gap, plumb and stud drift"
date: 2026-11-11
tags: [research, construction-robotics, buildbot, tolerance-analysis, sheathing, humanoid]
description: "A 1/8 in panel gap cuts a sheathing robot's stud-reading budget from 0.90 to 0.41 mm, and the sheet must hang plumb to about 0.03°."
---

Our track on robots for house building has 26 small projects. One asked how far a
humanoid can reach, one how hard it can push a nailer, one how much the recoil
throws its arm, one how well it must find the studs. Each answered its own
question. Today they became one programme,
[`buildbot-sheathing`](../../research/buildbot-sheathing/README.md): can a robot
hang a 4x8 sheet of wall sheathing and put all 62 nails where they belong, and
what decides it?

The first step looked at something every earlier project left out.

## Where the joint nails have to go

A sheet's two vertical edges land on studs that it shares with the next
sheet. Each nail there must be 3/8 in in from the sheet's edge, and its shank
must still be on the stud's 1.5 in face. Earlier projects put the sheet edge
exactly on the stud's centre line. That gave the 34 joint nails a window of
±3.93 mm, and it set a 0.89 mm budget for reading the stud's position.

Real sheets are not hung that way. APA, the panel makers' association,
recommends a 1/8 in gap at panel edges so the panels can swell without
buckling. With the gap centred on the stud, each edge sits 1/16 in past the
centre, and the 3/8 in rule moves with it. The window shrinks to ±3.14 mm.

That sounds small, but it matters. The stud reading needed for 95% of sheets
to come out clean falls from 0.90 mm to **0.41 mm** (one standard deviation,
one read, 0.9 mm of tool scatter). At the old 0.89 mm budget only 75% of
sheets are clean. If the robot plans for no gap and the crew leaves one, 56%
are clean.

## The sheet has to hang almost perfectly plumb

The next question was how exactly the sheet itself must be hung. We tried two
ways of aiming the joint nails. The first aims at the design window from the
robot's estimate of the stud. The second measures the sheet's actual edge and
aims midway between it (plus 3/8 in) and the far face of the stud.

With a 0.5 mm stud reading, the first robot has no tolerance left at all: it is
at 93% clean sheets even when the sheet hangs perfectly. The edge-aiming robot,
with the edge measured to 0.5 mm, allows 0.44 mm of sideways error and
**0.031° of tilt**. That is 0.66 mm of lean over the 1.2 m from the sheet's
middle to its top nail. Measuring the edge also halves the weight of the stud
error, because the aim point moves only half as far when the stud estimate is
wrong.

For scale, an earlier project in the track,
[`buildbot-cohold`](../../research/buildbot-cohold/README.md), saw a sheet tilt
2 to 6° while a robot and a person lifted it together. A sheet has to come to
rest about a hundred times straighter than that. Whether a stock humanoid can do it is
the programme's next test, in MuJoCo.

## Rows drift

The last check was a whole wall. When each sheet is butted against the last
with a 1/8 in gauge, the gap adds to the width. A full 48 in sheet plus the gap
is 1/8 in more than the 48 in stud module, so each sheet drifts 3.2 mm. By the
third sheet the joint window is nearly gone: it opens in 46% of our trials
only because of noise, and no third sheet came out clean. Makers may trim
panels up to 1/8 in ("sized for spacing"). With a 1/16 in trim, a butted row
keeps a joint window for four sheets.

Setting each sheet from its own studs fixes this: every sheet in a 10-sheet row
stayed at 98% clean. But a 1/16 in trim leaves only a 1.6 mm gap on average,
and with 1 mm of width scatter 5.6% of joints would need a negative gap. We
had predicted under 1%, so that prediction failed. A robot setting sheets from
the studs will sometimes need to trim a panel or put an edge a millimetre off
centre.

## What this does and does not say

These are Monte Carlo results on Gaussian errors, and they match the earlier
stud-finding model and two closed forms to within 0.01. Most errors are swept,
not measured: the stud reading, the edge measurement, the gauge and the panel
width. The gap, the edge distance and the trim come from APA pages we saw in
search results, not from the code book. Studs here are straight, and nothing
was tested on a real wall. One nail out of its window counts as a failed sheet,
even though a carpenter would just pull it and drive it again.

The finding for anyone building a sheathing robot holds across the sweep. The
joint nails' window sets the budget, not the stud reading alone. The robot has to
see the sheet edge, and it has to set each sheet from its studs rather than
from the sheet before. The
[proposal](../../research/buildbot-sheathing/PROPOSAL.md) lays out the rest:
real as-built framing, sheet placement in a physics simulator, and the cost
of a clean sheet for each kind of robot.

*Written with AI assistance (Claude). Code, data and the pre-registered
hypotheses are in
[`research/buildbot-sheathing`](../../research/buildbot-sheathing/README.md).*
