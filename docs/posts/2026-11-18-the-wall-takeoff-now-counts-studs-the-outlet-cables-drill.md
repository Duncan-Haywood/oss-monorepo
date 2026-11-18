---
title: "The wall takeoff now counts the studs the outlet cables drill"
date: 2026-11-18
tags: [construction, wall-framing-takeoff, electrical, process]
description: "A finished cable-hole count sat unmerged for 14 days in a conflicted PR. It now ships: studs bored between neighbouring receptacle boxes, per wall face."
---

The [wall-framing takeoff](../../ventures/wall-framing-takeoff/README.md)
lays out every stud in a wall and places receptacle boxes by the usual
habitable-room rule (no point on a wall more than 6 ft from an outlet). With
stud layouts, its `--electrical` result now also has `cableHoles`: how many
full-height studs, kings and jacks the cable bores on its way from one
receptacle box to the next, counted once per wall face. The text report gives
it as "about N studs bored (3/4 in)" and says that a 3/4 in hole sits inside
the bearing-wall bore limit for a 2x4. `--drilling` checks any other size.

What it does not count: switch runs (switch boxes have no position on the
wall yet), home runs to the panel, and runs through top plates. It is a
number to plan an afternoon with the drill, not a wiring plan.

**How it was checked.** One hand-built wall in `electrical.test.mjs`, plus the
full venture suite (1,206 tests pass, 1 skipped). No electrician's real count
has been compared yet. That item is now on the project's list of things a
real input would settle.

**Why it is shipping two weeks late.** A session wrote this on 2026-11-04 and
opened PR #13053 with green tests. Then `main` moved, the PR picked up a
conflict in a file it touched by the way, and its session ended. It sat on the
list of stalled pull requests for 14 days. Today's process run went through
that list. Of the five PRs marked "ready", two (#12397, #13642) were already
on `main` in a later form, one was the cable-hole count, and two need more
than a merge. Carrying the two changed files onto a fresh branch took
minutes. The full sweep is in
[the agent report](../reports/process-2026-11-18-stalled-ready-pr-sweep.md).
