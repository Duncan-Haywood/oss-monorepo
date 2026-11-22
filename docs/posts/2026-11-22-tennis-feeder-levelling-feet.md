---
title: "Tennis robots: the feeder's levelling feet could not level, and their studs bent in the wind"
seo_title: "Tennis robots: levelling feet in a T-slot checked in open CAD"
date: 2026-11-22
tags: [open-tennis-robots, cad, hardware]
description: "A levelling foot screwed into a T-nut has 4 mm of travel. Drawn as a joint, the feeder's feet also bent in the design wind. A printed block fixes both."
---

The open tennis robots' ball feeder stands behind a 3 m net beam. Four wheels
carry it, and two levelling feet under the beam's ends stop it rocking when
the net catches wind. Until today the CAD drew each foot as a 40 by 155 mm
cylinder. The parts list said: an M6 levelling foot with 155 mm of stud,
screwed into a T-nut in the beam's bottom slot, locked with a jam nut.

Every other nut on the feeder is a checked joint: the build measures what it
clamps, checks the thread past it and swings a spanner and a hand round it.
The jam nuts were the last ones left. To check them, the foot had to be drawn
as it is, a pad and a stud. Drawn that way, the mount failed four ways.

**It cannot level.** A stud screwed up into a T-nut has to sit between
catching the nut's threads and hitting the slot's floor. The window the build
uses for T-nut screws is 4 to 8 mm past the beam's face, so the foot has 4 mm
of travel in all. A court falls and crowns over the 2.9 m between the feet,
and the tyres squash. We assumed 12 mm either way is needed.

**The listed stud did not fit.** On a 25 mm pad (assumed), 155 mm of stud puts
the tip 180 mm off the ground. The beam's face is at 155 mm, so the tip would
run 25 mm past it, 17 mm past the slot's floor.

**The stud bends.** A swivel pad's ball joint carries no moment, so the bare
stud between the pad and the beam is a cantilever. The wheels are not braked,
so in the worst case the two feet take all of the design wind's 69 N on the
net. Half of that, at the end of 142 mm of M6 (with the ground 12 mm lower),
is 4.9 N m on a 4.77 mm core. That is 460 MPa. A typical class 4.8 stud yields
at 320.

**The spanner was wrong.** The step asked for a 13 mm spanner. An M6 nut is
10 mm across the flats.

## The fix

Each beam end now gets a printed foot block. A 6 mm flange screws up into the
bottom slot with two M5 x 12 into T-nuts, which puts the screws 6 mm past the
face, the middle of the window. A 20 by 24 mm column runs down to 55 mm off
the ground. An M6 nut slides into a slot low in the column from the rear and
sits on a 5 mm wall. The foot's stud, now a stock M6 x 80, screws up through
the nut into a bore that runs up to the beam. The jam nut locks it under the
column.

| | Stud into a T-nut | Foot block |
| --- | --- | --- |
| Pad travel from level | 4 mm in all | 50 mm up, 38 mm down |
| Bare stud, worst case | 142 mm | 42 mm |
| Stud bending at design wind | 460 MPa, 0.70x yield | 136 MPa, 2.35x yield |
| Spanner | 13 mm (wrong) | 10 mm |

The column carries the moment up to the flange at 3.0 MPa. That is under the
10 MPa we allow for printed PETG. The flange tips about its edge, 10 mm from
the screws, so each T-nut takes a 235 N pull. We allow 500 N, an assumption to
check against a supplier's sheet.

Both are joints now, 41 on the feeder. The block's screws are checked against
the T-nut window, and their heads can be reached with the key from below,
past the column. The jam nut's stack is the column's 5 mm wall, and there are
30 mm of stud below it. A 10 mm spanner and the hand holding it turn all the
way round at both feet. With the ground 12 mm higher, there are still 14.8 mm
of stud between the pad and the block, so the jam nut always has room for a
spanner. Each check has a test that makes it fire on a bad value.

## What is assumed

Nothing here has been built. The pad's height, the stud's grade, the share of
the wind each foot takes, a T-nut's allowed pull and how far a court falls
between the feet are all assumptions. PETG creeps under steady load. The feet
are set just off the ground, so they carry little until the wind blows. The
full write-up is in the venture's
[CAD README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/cad/README.md),
under "Levelling feet".
