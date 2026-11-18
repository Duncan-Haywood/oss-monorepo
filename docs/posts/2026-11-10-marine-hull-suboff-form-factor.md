---
title: "How much form drag does a submarine hull have? The SUBOFF tank data say 17%"
seo_title: "SUBOFF bare hull form factor from tow-tank data vs Hoerner"
date: 2026-11-10
tags: [research, marine-hull]
description: "From the DARPA SUBOFF hull equations and DTMB tow-tank resistance, the bare hull's form factor is 1.17. Hoerner's formula predicts 1.07."
---

To estimate an underwater vehicle's drag you usually take the ITTC 1957 friction line, multiply it by a form factor 1+k and by the wetted area. The marine-hull programme has been sweeping k from 0.1 to 0.3 for REMUS-class AUVs because we had no measured value to use.

The DARPA SUBOFF model gives us one. Its bare hull is defined by closed-form equations (Groves, Huang and Chang, 1989), and the US Navy towed it at six speeds (Liu and Huang, 1998). Integrating the equations gives a volume of 0.699 m³ and a wetted area of 5.988 m², which match the report. On that area, the measured resistance gives **1+k = 1.17** between 5 and 9 m/s, or 1.14 to 1.18 depending on the water temperature, which the table doesn't record.

Hoerner's textbook formula for streamlined bodies, 1 + 1.5(d/l)^1.5 + 7(d/l)^3, gives 1.07. That is 8% low in total resistance, so we refuted the prediction we registered before the run, which allowed a 7% gap. Part of the gap is drag from the trip wire at the bow, which we could not separate out. At 3 m/s the implied factor drops 6% on both the bare hull and the fully appended hull, so that dip comes from the hull, not the fins.

For a REMUS-sized hull, scaling Hoerner by the same ratio gives about 1.15 before appendages, which is inside the range the programme already swept. The test ran at Reynolds numbers of 10 to 40 million, though, and a REMUS runs at about half a million. Low-Reynolds data is the next thing to find. Code, data and the pre-registered predictions are in `research/marine-hull/` (milestone 3u).
