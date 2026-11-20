---
title: "Which element is a railing? Placing 486 IFC railings by what they stand on"
seo_title: "IFC railings in Uniformat II: stair, balcony or interior"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our free IFC takeoff now codes railings as stair, exterior or interior from the geometry. On 16 public models, coded railings went from 77 to 461 of 486."
---

An elemental estimate (Uniformat II, the way a cost plan is laid out by
building element) doesn't price "railings". It prices stair construction,
exterior walls and partitions, and a railing belongs to one of the three:
a handrail on a flight is C2010 Stair Construction, a balcony guard sits with
the exterior walls in B2010, and a guard round an inside gallery is an
interior balustrade, which NISTIR 6389 puts under C1010 Partitions.

The IFC file rarely says which. In the 16 public models we test the free
[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) on,
there are 486 railings, and our rules could code 77 of them: the ones in
schependomlaan whose author set the IsExternal flag. Revit writes
IsExternal false on every railing, so for the rest the flag tells you
nothing, and no author in these models gave a railing its own Uniformat
code.

So we read what each railing stands on instead.

**Beside a stair.** If a stair, flight, ramp, landing or stringer comes
within 0.3 m of the railing in plan, and the railing starts somewhere
between the bottom and the top of that stair, it is the stair's. That also
catches the guard round the well at the head of a flight, which starts at
the flight's top. Estimators carry that with the stair too.

**Rising a storey.** A railing 3 m or more tall with no stair next to it is
a stair railing whose stair wasn't modelled. One office model has four of
these, 4.6 to 5.2 m tall, and no stair object at all.

**Joined to a stair railing.** Revit exported one house's stair railings as
253 separate pieces: balusters and rail segments. Taken one by one, the
balusters of a landing guard stood on the flight and the top rails above
them didn't. So a piece that touches a stair railing, within 2 m of the same
stair, is coded with it.

**Inside or outside.** For everything else we reuse the test that already
places walls with no flag. Rays are cast from both faces of the railing,
half a metre above its foot. If one face sees out of the building at five
or more of nine points, the railing is outside, B2010. If both faces are
closed in by walls, it's inside, C1010. The test is skipped in a model
that has no doors or windows. HHS Office's structural model has walls but
not the building's envelope: there its two gallery guards read "open on all
sides", while the same two railings in the architect's model read closed.

## What came out

| | railings |
|---|---|
| C2010 Stair Construction | 343 |
| B2010 Exterior Walls | 95 |
| C1010 Partitions (interior balustrades) | 23 |
| still no code | 25 |

Where a railing's type name says anything, it agrees with the call:
"Handrail - elevtrapper" (pupils' stairs) and "Rekkverk rømningstrapp"
(escape stair) in a Norwegian school, "900mm Handrail Only" in a Revit
office, and the whole of one house's stair hall come out as stair. The glass
guards in front of a German flat's full-height windows come out exterior.
Level-3 coverage over the 16 models rose by 384 elements. No author coded a
railing, so the comparison against authors' own codes is unchanged.

## What it gets wrong

- The school's slatted screens round its outdoor storage sheds come
  out B2010, as if they were balcony walls. They are outside, but a careful
  estimator would put them with site work.
- A guard on the floor below a flight, within 0.3 m of the flight's foot,
  is taken as the stair's.
- A full-height screen 3 m or taller in a double-height hall would be
  misread as a stair railing. None of these models has one.
- 25 railings stay uncoded, mostly Revit railings whose geometry the reader
  doesn't resolve yet.

Every coded row carries its reason in the element CSV, for example
"railing beside IfcStairFlight (stair construction)" or "railing, by
geometry closed in on both faces: interior balustrade", so you can check the
calls you disagree with. The method and the per-model lists are in
[eval/railings-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/railings-2026-11-20.md).

*Quantities and classifications are estimates from the model's geometry and
typed assumptions, not professional advice. Check them before you price
work.*
