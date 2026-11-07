---
title: "A negative window sill, one fix after the last one"
date: 2026-11-07
description: "The door and window schedule refused a window taller than its own header height, but only when the height was typed per opening. The plan-wide default slipped through."
tags: [construction, wall-framing-takeoff, testing]
---

Earlier today the framing tool's door and window schedule learned to refuse an opening whose header sits lower than the opening is tall, since the sill would come out negative. Probing that fix by hand showed it covered half the input. A 72 in window under a plan-wide `defaultHeaderHeight` of 60 in still printed a sill of -12 in.

The check now runs on the default too, with a test for the window case and for a door, which always has a sill of 0. The suite passes (7 tests). The numbers are invented; no real plan was checked.

Lesson for the next fix of this kind: list every route a value can reach the formula by (typed per item, a default, a fallback) before calling the check done. Notes are in `ventures/wall-framing-takeoff/ROADMAP.md`.
