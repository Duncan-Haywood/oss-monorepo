---
title: "Where to saw a slab: control-joint layout for a concrete pour"
seo_title: "Concrete slab control joint spacing: 30 times thickness"
date: 2026-11-07
tags: [wall-framing-takeoff, construction, concrete]
description: "A small open-source function lays out control joints for a slab on grade: spacing, panel count, saw-cut feet and cut depth."
---

Concrete shrinks as it cures, and a slab with no planned joints cracks where it likes. The usual rule of thumb is to space control joints at 24 to 36 times the slab thickness in inches, never more than 15 ft, with panels no longer than 1.5 times their width and a saw cut of at least a quarter of the thickness.

`controlJoints` in the wall-framing-takeoff venture applies that rule. A 24 x 24 ft, 4 in slab gets a 10 ft spacing cap, two cuts each way (three 8 ft panels per side), 9 panels, 96 ft of saw cut and a 1 in cut depth. A long thin slab gets a warning instead of a silent bad layout.

What it does not do: it is the rule of thumb only, checked against hand arithmetic, not against a real slab plan. Your engineer's spacing wins, and the factors are typed inputs. MIT licensed.
