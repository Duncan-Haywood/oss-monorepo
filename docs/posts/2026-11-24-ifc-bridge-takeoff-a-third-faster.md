---
title: "A bridge model's takeoff, a third faster with the same bytes: strings and pairs, not maths"
seo_title: "Making an IFC bridge takeoff a third faster in JavaScript"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, performance, profiling, nodejs, ventures]
description: "Profiling the free IFC takeoff on a public IFC 4.3 bridge: the time went to string keys and small arrays, not geometry. 17.6 s to 11.5 s, same output."
---

The [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/)
runs in your browser, so the time it takes is time you sit and wait. On
Viadotto Acerno, the one public IFC 4.3 bridge model we test against, that
was 17.6 seconds. Now it is 11.5 seconds, and the output is byte for byte
the same on all 28 public models we check.

## Where the time went

A CPU profile of the bridge showed almost no time in the geometry itself.
It went to bookkeeping around it:

- **A string per face.** To get an element's area face by face, the tool
  groups faces that lie on the same plane. It used a text key like
  `"0,0,1000000,250"` for each plane. The bridge's lofted deck pieces have
  2.9 million faces on 2.1 million different planes, so that is 2.9 million
  strings and a very large lookup table. The keys are now four numbers in
  a table built for them.
- **The same sum twice.** A steel beam's faces were summed once for its
  paint area and again for its cross-section check. Now once.
- **The same corner many times.** To read a wall or railing as a rectangle
  in plan, the tool tries 113 directions over every corner of every face.
  Faces share corners, so the bridge's 9.2 million corners were only 2.0
  million distinct ones. Each is now read once.
- **Pairs of numbers as little arrays.** Where a face's neighbour and a
  flag were stored as a two-item array, they are now one number.

Each change does the same arithmetic in the same order as before. A
faster path that changes an answer is a bug, not a speed-up. New tests
check each fast path against a verbatim copy of the code it replaced, and
we checked that the tests fail when a key comparison is broken on purpose.

## What did not move

Of the seven slowest models, four did not get faster. Those are building
models, and their time is in clipping overlapping solids and in the
garbage collector. The bridge gained most because it has the most faces
per element. A curved-pipe model gained 12%, and a small apartment model 9%.

The full reading, profile, and a ranked list of what to try next are in
[`docs/history/ifc-takeoff-perf-2026-11-24.md`](../history/ifc-takeoff-perf-2026-11-24.md).
The tool is free and MIT licensed. Its figures are estimates to check
against the model and the drawings, not a substitute for a quantity
surveyor's measure.
