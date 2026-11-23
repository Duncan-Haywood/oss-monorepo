---
title: "A safety guard that blocked nothing: testing a curved-wall check on negative geometry"
seo_title: "Stepped curved IFC walls: the swept check on a signed fan"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "A guard kept stepped curved walls with negative terms off a volume check. Tested on built walls it held to 1e-14; on 28 public models it moved nothing."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) measures
a curved wall's side area on the wall's own facets, and it only keeps the
result when the faces add up to the wall's volume. It has two ways to check
that. If the wall has the same section all the way up, the mean face times the
width has to equal the volume. If the section changes (a thicker base, a recess
along the foot), the two faces have to enclose the volume by the divergence
theorem in plan. That second test works for any section, as long as every
other face is level or lies along a radius.

The second check carried a guard: any body with a negative term was refused.
The guard went in earlier today, while a run was chasing two half-round tunnel
walls whose outer face read 5.6 m2 too big. The cause turned out to be
something else (the
[two ends of a half ring lie on one plane](2026-11-23-half-round-wall-two-ends-one-plane.md)),
but the guard stayed, because nobody had checked what it was guarding against.

## What a negative term is here

An outline that is not convex, like a ring, is split into triangles fanned out
from its first corner. Some of those triangles fall over the hollow, so they
count negative, and they cancel the parts of their neighbours that aren't
material. About a third of a ring's triangles are negative. For the faces to
come out right, the fan's diagonals have to cancel plane by plane, and the
arc's chords have to keep facing outward whatever sign their triangle has.

## Built walls

This run built the cases by hand. One was a quarter ring with a 0.75 m base
from 1.877 to 2.3 m and the wall above from 2.2 to 2.3 m, drawn as two
outlines. It also ran the same ring with the fan started on the inner arc, a
half ring 20 m across, and a quarter with a recess cut by a boolean
difference. Each one has 42 to 356 negative terms. Every face matched the
hand-worked chords to 1e-9, and the swept volume matched the body to 1e-14.
The one-section check misses these walls by 0.7 to 2.5%, so the guard had been
sending them back to a plane cut, which on an arc measures a chord: 2.49 m2
instead of 13.84.

The check still says no when it should. The same wall with its ends cut square,
neither level nor along a radius, misses by 28% and is refused.

## The public models

Across all 28 public `engine_web-ifc` models, the output was identical line
for line before and after lifting the guard. Instrumenting the run showed why.
45 real curved walls with negative terms already passed the simpler
one-section check, so signed fans were already being read correctly in the
wild. The 67 walls still refused all fail one step earlier: their facets
don't face a single centre (mostly straight walls with rounded ends). None
of them ever reached the swept check.

So the guard was blocking nothing in the public files. Lifting it matters for
a stepped curved wall drawn as outlines, and no public model has one. The
[note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/signed-fan-swept-2026-11-23.md)
says so, and the test that drives such a wall through the whole takeoff fails
if the guard is put back.
