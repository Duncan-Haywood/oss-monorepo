---
title: "Re-audit: the framing takeoff's pipe sizer no longer passes a starved shower"
seo_title: "Water supply pipe sizing for a rarely used fixture: checking the math"
date: 2026-11-28
tags: [quality-audit, evaluation, testing, construction, wall-framing-takeoff]
description: "A re-check of the free framing takeoff's water-supply sizer and wall framing: the 0 gpm shower branch is fixed, six outputs recompute by hand, and one untested count now has a test."
---

The [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) lays out studs, kings,
jacks, headers and cripples from walls you type, and its
[water supply sizing page](https://marisstella.app/wall-framing-takeoff/water-supply-sizing-calculator.html)
sizes each pipe run in a house from the fixtures it feeds. The
[2026-11-19 audit](../../portfolio/quality/audits/2026-11-19-wall-framing-takeoff-r5.json) found a
wrong pass a plumber could have acted on, so the tool missed the quality bar that round. This
re-audit ([audit file](../../portfolio/quality/audits/2026-11-28-wall-framing-takeoff-reaudit.json))
checked all eight of that audit's defects against the code as it stands today.

**The high defect is fixed, and the tool meets the bar again.** The sizer uses Hunter's rule:
size each run for the flow it carries 99% of the busiest hour. When every fixture on a branch is
busy less than 1% of that hour, the 99% flow works out to zero. A 300 ft run of 1/2 in PEX to one
shower was being sized for 0 gpm and shown keeping 39.6 of its 40 psi. With the shower running at
2.5 gpm, only about 12 psi would arrive. Now no run is sized below the largest fixture it feeds,
which matches Hunter's curve and the IPC fixture-unit table. The same branch now carries
2.5 gpm, moves up to 3/4 in and loses 5.37 psi. My own Darcy-Weisbach calculation with the
Swamee-Jain friction factor gives 5.33 psi, 0.8% away. If you remove the floor, a test fails.

## What recomputed by hand

| check | by hand | tool |
|---|---|---|
| 300 ft of 3/4 in PEX at 2.5 gpm, 60 F | 5.33 psi | 5.37 psi |
| example main, 12.2 gpm in 1 in copper L | 4.75 ft/s | 4.74 ft/s |
| 38.5 x 82.5 in door, 2x10 header | header 41.5, jacks 81, top cripples 2-3/8 | same |
| 36.5 x 48.5 in window, 2x8 header | header 39.5, sill 36.5, bottom cripples 31 | same |
| interior wall cable holes (two faces) | 4 | 4 |

The window's bottom cripples sit at both ends of the sill and on the 16 in layout, the way most
crews frame it. Jacks run from the bottom plate to the header.

## What is still open

- **One velocity limit for hot and cold.** Copper hot water is usually held near 5 ft/s, while the
  default limit is 8 ft/s for every run. If you size hot-water runs, type the lower limit.
- **No header span table.** Header sizes come from the table you copy out of your code book or
  your engineer's schedule. The tool doesn't hold code values.
- **Unknown keys are ignored.** A supply plan with a misspelled or made-up key (the audit-fix test
  itself uses `maxSize`, which is not a field) runs without a message.
- **Code shape.** The gable-wall layout still repeats the plain wall's opening loop.

One defect was still open when this re-audit began. If you dropped the "times two faces" from the
outlet cable-hole count, all 1,284 tests still passed. The only test covered an exterior wall,
which has one room face. This PR adds a hand-counted interior wall: 2 holes per face, 4 in all.
With that test in place, dropping the multiplier fails it. The README's test count had drifted
again, from 1,213 to the 1,284 on disk, and is corrected here too.

Of the eight earlier defects, three are closed, one was partly closed (the test count, fixed and
then drifted), and four were open on arrival. This PR closes one more. The scores are recorded
before this PR's fixes. A later round will check them.

The page is free and runs in your browser. It is not the IPC or UPC fixture-unit method an inspector
checks, and it does not replace a licensed plumber or your building department.
