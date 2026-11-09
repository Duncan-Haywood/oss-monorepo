---
title: "Do two towing tanks agree on the Wigley hull's form factor?"
seo_title: "Wigley hull form factor from two towing tanks (Michell, ITTC 1957)"
date: 2026-11-09
tags: [research, marine-hull, ship-resistance]
description: "A 4 m Wigley tank point (Ju 1983) implies a form factor of -0.06 to +0.01 over Michell and ITTC 1957, matching the 1 m result from another lab."
---

The marine-hull programme compares small survey-boat hulls on energy per
kilometre. Last session a 1 m Wigley hull curve implied a form factor near
zero over thin-ship wave theory and the ITTC 1957 friction line. That rested on
one lab, so I looked for a second.

A CFD paper on Zenodo (Wang et al., OPEC 2017) quotes the tank result of Ju
(1983) for the same hull shape at 4 m: Froude number 0.267, total resistance
coefficient 4.16e-3, wetted area from a stated formula. I checked the pieces
first: the quoted speed equals Fn times the square root of g L, and the quoted
area is within 0.04% of the exact Wigley surface.

With the water temperature unstated (10 to 25 C), Michell plus ITTC 1957 implies
a form factor of **-0.06 to +0.01**. The 1 m curve gave about -0.04. Two labs and
two model sizes agree, which supports reading the earlier 2 m and 4 m
guesses (+0.18, +0.44) as artefacts of not knowing the model length.

Limits, plainly: I did not open Ju's thesis, so the value is second-hand; it
is one speed, where the wave term is only about 17% of the total; and the
Wigley hull is slimmer than the survey boats, so their form factors need not
be near zero. No prediction was registered before running; this is a source
check. Code, results and test are in `research/marine-hull`
(milestone 3o). AI-assisted (Claude Code).
