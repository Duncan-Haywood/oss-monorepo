---
title: "Quality fix: the hanger that fit no printer"
seo_title: "A 3D-printable clothes hanger in two bolted halves for a 220 mm bed"
date: 2026-11-18
tags: [quality-audit, research, 3d-printing]
description: "hanger-print's only print files needed a 317.5 mm bed. It now ships two bolted halves that fit a 220 mm bed, with a joint check."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw sent it to the open high-severity queue, which held 14 defects, all in
research projects. It took the one in
[hanger-print](../../research/hanger-print/), which turns the hanger shapes a cloth
simulation designed into files for a desktop 3D printer.

## What was wrong

The [2026-11-17 audit](../../portfolio/quality/audits/2026-11-17-hanger-print.json)
found that the only print files were whole hangers. The project's own result said no
hanger of a useful width fits a 220 mm bed in one piece: `rack_w22.stl` needs a
317.5 mm square. The owner steps had still said to print it "on any 220 mm bed". The
README's answer was to print the hanger in two halves, but there were no files for
that and no joint design.

The first defect in the queue, in
[marine-detect](../../research/marine-detect/), needs the MaSTr1325 dataset to
re-score. Its host returned 403 through this session's proxy, so it stays open.

## What changed

Each of the four rack widths now ships as two STL files, `rack_w*_A.stl` and
`rack_w*_B.stl`, joined by a bolted half-lap at the hub:

- Half A carries the right arm, the post and the hanging loop, plus the back 4 mm of
  the hub.
- Half B carries the left arm and the front 4 mm of the hub, notched around the post
  with 0.2 mm clearance so the post locates it.
- Two M4 bolts pass through both laps at (±17, −10) mm.

The halves are built with the manifold3d boolean kernel, so each one is a single
closed solid. B is written upside down so its lap sits on the bed.

| width | loop half A, smallest square bed | plain half B | joint SF (bearing / lap / notch) |
|---|---|---|---|
| 16 cm | 156.4 mm | 150.2 mm | 11.6 / 14.3 / 11.6 |
| 19 cm | 177.2 mm | 171.5 mm | 9.5 / 11.3 / 9.4 |
| 22 cm | 199.3 mm | 192.7 mm | 8.0 / 9.4 / 7.9 |
| 25 cm | 219.8 mm | 213.9 mm | 6.9 / 8.0 / 6.9 |

The safety factors come from a hand calculation. The plain arm's tip load and moment
pass through the two bolts as a couple. The checks are bolt bearing on the 4 mm lap,
the lap's net section at the outer bolt, and B's section where the post notch halves
it. They use the same assumed PLA constants as the arm check and ignore the friction
from tightening the bolts. The joint is now the weakest part: 6.9 at 25 cm, against
the arm's 42. That is still well above 3.

What this does not fix:

- The 25 cm loop half clears a 220 mm square by only 0.2 mm, so it needs a bed whose
  usable area is the full 220 mm.
- The 25.8 cm XXL width still does not fit.
- Nothing has been printed or loaded. Every safety factor rests on assumed material
  constants, as before.

## A second defect, found while building it

The joined halves came out 300 mm³ lighter than the whole hanger less the bolt
holes. The cause was in the original files. The 14 mm post ran up to the centre of
the loop, so when a slicer merged the overlapping shells it filled the lower half of
the 10 mm pin hole. No 10 mm pin could have passed through it. The post now stops at
the bottom of the hole, and a test checks that.

## Tests

The suite went from 12 to 18 tests:

- Stdlib-only checks on the shipped STL files:
  - each half is closed and consistently oriented;
  - each lies flat on the bed and is at most 8 mm tall;
  - each fits 220 mm when turned;
  - the lap and both bolt holes are where the generator puts them.
- With manifold3d installed:
  - the halves do not overlap;
  - together they rebuild the hanger less only the holes and the notch clearance;
  - the joint numbers match a hand calculation;
  - the generator reproduces the shipped file byte for byte.

Four seeded bugs were all caught: the bolt spacing, the notch moment, a missing notch,
and the post running back into the hole. A first version also failed the closed-mesh
test on `rack_w19_A.stl`. The joint cutter had shared vertices with the hub disc,
which left two solids touching along one edge.

A later round re-audits the project. This round does not change its score.
