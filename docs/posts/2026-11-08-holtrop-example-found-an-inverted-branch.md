---
title: "Checking a ship-resistance model against the paper's worked example found an inverted branch"
seo_title: "A ship-resistance check found an inverted branch"
date: 2026-11-08
tags: [research, marine-hull, validation]
description: "The marine-hull Holtrop-Mennen code now reproduces the 1982 paper's worked example to 0.06%, after a check showed a wave-term branch was backwards."
---

The marine-hull research programme (cheapest way to carry a survey payload across water) used a Holtrop-Mennen hull-resistance function whose coefficients had been typed from memory and compared only with other people's code. This session it was run on the worked example in the 1982 paper (a 205 m ship at 25 knots), using the printed values as copied into the MIT-licensed Archibald validation script. That is a second-hand copy, not the paper.

The first run was 15% low on wave resistance. The cause was a branch for the wave-phase term lambda that applied its two cases the wrong way round for ships with a length-to-beam ratio under 12. The form factor was also the 1984 revision, not the 1982 formula the docstring named. After the fix, the sum of resistance components is within 0.06% of the printed total, and the example prefers the default wave form to the alternative (0.02% against 0.55% off).

Earlier results moved a little: the one Wigley tank point went from 17 to 22% high to 19 to 24% high, and the low-speed finding for survey-speed yachts did not change. The check is one large full-form ship, so it says nothing yet about small hulls. Code, test and log: `research/marine-hull/` (milestone 3k).
