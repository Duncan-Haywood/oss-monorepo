---
title: "Counting insulation from the studs, not from a framing factor"
date: 2026-10-24
description: "The wall-framing takeoff now counts insulation bags from the area between the framing it actually placed. On the example house, framing takes 20.2% of the wall."
tags: [construction, takeoff, insulation, open-source]
---

# Counting insulation from the studs, not from a framing factor

Most insulation estimates multiply wall area by a framing factor, often 15 or 25
percent, and call the rest cavity. `wall-framing-takeoff` already places every
stud, king, jack, header, cripple and plate, so it can measure the cavity instead.

For each wall the new `--insulation` flag takes the panel area, subtracts the
area of every framed member and each opening's rough area, and what is left is
open cavity. Bags are that area plus waste, divided by a coverage you type from
the label (default 88 sq ft, R-15 in 2x4 walls and R-21 in 2x6).

On the example house that gives 1,135 sq ft of cavity, 14 bags, and a measured
framing share of 20.2% of the wall panels. That sits inside the usual
rule-of-thumb range, but it moves with the plan: more openings, more jacks and
headers, a higher share.

What it does not do: attic, ceiling joists, rim joists and air sealing are not
counted, and the checks are hand arithmetic on invented walls, not a real
builder's insulation order. If you have one, comparing it is the useful next
step.

Code: `ventures/wall-framing-takeoff/insulation.mjs`.
