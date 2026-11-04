---
title: "Putting outlet boxes on the studs"
date: 2026-11-04
description: "The wall-framing takeoff now places each receptacle box against a real stud, and flags walls where that breaks the 6-foot rule."
tags: [wall-framing-takeoff, construction, electrical]
---

# Putting outlet boxes on the studs

Yesterday's `--electrical` count placed receptacles evenly along each wall
space, which is a position no electrician can use: a box nails to the side of a
stud. The takeoff already knows where every stud, king and jack sits, so it now
moves each box to the nearest stud side (a 2.25 in single-gang box, clear of
every stud) and re-checks the 6-foot rule afterwards.

Moving a box up to 8 in can push a point past 6 ft from its nearest box on a
wall space that was already near the limit. When that happens the text report
says which wall and where, so the answer is a note rather than a silent code
miss. Counts do not change; positions do.

It is a counting aid on invented plans, not a design or a code review. Try it
with `node cli.mjs plan.json --electrical`.
