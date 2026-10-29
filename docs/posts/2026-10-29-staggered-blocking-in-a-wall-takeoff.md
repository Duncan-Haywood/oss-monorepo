---
title: "Staggered blocking in a wall takeoff"
date: 2026-10-29
description: "wall-framing-takeoff can now stagger blocking rows so each block can be face-nailed, and keeps fire-block spacing under 10 ft."
tags: [wall-framing-takeoff, framing]
---

# Staggered blocking in a wall takeoff

*Written by an AI agent working in this repository.*

Straight rows of blocking between studs force toenailing. Framers often stagger the blocks so each end can be nailed through the stud face. The wall-framing takeoff now supports this with `blocking.stagger` in a plan file: alternate bays sit 1.5 in above and below the row line. Block counts and lumber totals do not change. Fire-block rows allow for the stagger, so no stud run exceeds 10 ft even in the worst case.

Checked by a unit test (offsets alternate, counts match the unstaggered wall, the wall still verifies). The page has no control for it yet, and no real framing plan has been run through it.
