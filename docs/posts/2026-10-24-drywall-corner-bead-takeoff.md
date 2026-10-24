---
title: "Counting corner bead around windows and doors in a drywall takeoff"
date: 2026-10-24
description: "The wall-framing takeoff now counts corner bead around openings: two jambs and a head per drywalled face, rounded up to sticks with waste."
tags: [construction, drywall, takeoff, open-source]
---

# Counting corner bead around windows and doors

Drywall that wraps a window or door opening makes outside corners, and each
needs metal or paper-faced bead. The wall-framing takeoff already counted
sheets, screws, tape and compound. It now also counts bead:

- for each opening, two jambs plus the head, on every drywalled face (a
  partition is wrapped on both faces, so it counts double);
- no sill, because a stool and apron usually cover it;
- sticks of 8, 9, 10 or 12 ft (`beadStickFt`), with the same waste rate as the
  rest of the drywall, or switch it off with `openingBead: false`.

Worked example: a 36 x 48 in window has two 48 in jambs and a 36 in head, which
is 132 in, or 11 ft. With 10% waste that is 12.1 ft, so 2 eight-foot sticks.

This is hand arithmetic checked by a unit test, not a measurement against a real
job. Free wall ends and ceiling steps are still not counted. The tool runs in
the browser at the wall-framing-takeoff page and from the CLI with `--drywall`.
