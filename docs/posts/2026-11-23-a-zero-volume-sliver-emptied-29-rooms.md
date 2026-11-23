---
title: "A zero-volume sliver emptied 29 rooms, and 101 COBie components went home"
seo_title: "Point-in-solid with flat convex pieces: a BIM room bug"
date: 2026-11-23
tags: [ids-model-check, ifc-quantity-takeoff, ventures, bim, cobie, geometry]
description: "A room solid carried a flat subtracted piece. The inside test read it as half of space, emptying rooms. Fixing it placed 99.3% of COBie components."
---

A COBie handover workbook names the room every maintainable component is in.
[IDS Model Check](https://marisstella.app/ids-model-check/cobie.html) fills
that column from geometry when the model doesn't say: it tests where each
component's box stands against each room's solid. Earlier today the test put
1,117 of 1,227 components in the room their own file names, on 25 public IFC
models. Most of the misses looked like modelling quirks: 17 counter tops and
cabinets in a dental lab sat inside their room's box but, apparently, outside
the room.

They weren't outside. The room was empty.

## Why the room was empty

The dental lab's solid comes out of the reader as 14 convex pieces: nine
added, five subtracted, summing to the right 80.04 m3. One of the subtracted
pieces is flat. It lies exactly in the plane of the west wall, and its volume
is 5e-15 m3, which is floating-point noise.

The inside test for a convex piece checks that a point is on the same side
of every face as the piece's middle. For a flat piece the middle lies on
those faces. Each side test then compares against a sign that is zero or
noise, and in this file the result was that the sliver claimed a whole
half-space as its inside. Every point in the lab was counted once for the
big piece and subtracted once for the sliver, so nothing was inside.

The fix is one guard: a convex piece whose volume is below a billionth of
the cube of its own diagonal has no inside, so it is skipped. A test uses
the sliver's coordinates exactly as read from the file, and it fails on the
old code.

## How many rooms it touched

Room volume gives a check that needs no outside truth. Sample a 12 x 12 x 12
grid through each room's box. The share of points inside should match the
room's volume over its box. On 852 rooms in 12 public models:

| | before | after |
| --- | --- | --- |
| rooms off by more than 0.15 | 29 | 0 |

The fault went both ways. Ten rooms read as completely empty, among them
an open office, two corridors and two classrooms. Others swelled to their
whole box: an electrical room that fills 71% of its box read as 100%, and
a corridor at 60% read as 100%. A swollen room is the smallest room
holding a point in its box, so it won the point, and its neighbours'
furniture went with it.

## What changed in the COBie export

| components a file puts in a room, containment hidden | before | after |
| --- | --- | --- |
| placed in the same room | 1,117 (91.0%) | 1,218 (99.3%) |
| placed in another room | 93 | 9 |
| left blank | 17 | 0 |

The Norwegian school model (ARK_NUS) went from 813 to 894 of 903, the dental
clinic from 200 to 219 of 219. Doors and windows checked against the file's
own space boundaries went from 791 to 821 of 869. No element's volume, area
or length changed, because those come from the solid's geometry, not the
inside test. Wall openings found by geometry did change in 16 rooms with no
space boundaries. One office room gained the 7 windows it had lost.

## The lesson

The volume total had been right all along, so the room's quantities passed
every check against stored values. Only the inside test was wrong, and a
summed quantity can't show that. Comparing the inside test with the volume
it should reproduce found 29 bad rooms in one run. The eval note
keeps the script's method so the next change can be checked the same way.

Method and every number: `ventures/ids-model-check/eval/cobie-flat-pieces-2026-11-23.md`.
The code is MIT licensed. The geometry is in `ventures/ifc-quantity-takeoff/rooms.mjs`.
