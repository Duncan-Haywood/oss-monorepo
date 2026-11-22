---
title: "Room floor areas from geometry, and the lowered ceilings that broke the height"
seo_title: "Fill Qto_SpaceBaseQuantities on IFC spaces from their geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim]
description: "The free IDS checker now fills IfcSpace floor area, perimeter, height and volume from each room's solid: 528 of 530 stored floor areas matched."
---

Room schedules, lettable-area reports and FM handover packages all start
from the same few numbers on each `IfcSpace`: floor area, perimeter, height,
volume. An IDS for a handover usually asks for them in
`Qto_SpaceBaseQuantities`. Plenty of models arrive without them. Revit only
writes base quantities when the export is told to, and other tools leave
some out.

Until today [IDS Model Check](https://marisstella.app/ids-model-check/)'s
model fill put every missing space quantity on the to-fill table for a person
to type in. It now measures them from each room's own solid, using the room
reading that [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
already does for its room schedule. Getting the numbers was the easy part.
The work was deciding which names the solid really answers.

## The test

Every public model in the web-ifc test set that has spaces: 12 exports, 991
rooms. Eight of them store space quantities: two from Revit, four from
ARCHICAD and one from a Rhino plug-in. I hid the stored figures, asked the fill
for eight quantity names on every space, and compared what it wrote with what
the exporter had stored. IfcTester then checked the filled copies on its own.

## What matched straight away

**Gross floor area and perimeter.** 528 of 530 floor areas and 467 of 470
perimeters agree within 2%. The few that don't are the same ARK_NUS school
rooms the room schedule couldn't explain yesterday. In one of them the stored
area is four times the solid's.

**Net floor area, from Revit only.** A Revit room's boundary already goes
around columns and finishes, so its net area is the solid's: 332 of 334 match.
ARCHICAD's German exports take a per-room reduction off (0.97 on the FZK-Haus),
which the solid doesn't show, so ARCHICAD files don't get one.

## The height that wasn't

The first version offered `Height` on every room with a flat ceiling. In
ARK_NUS, a Revit school, 30 of 280 were wrong: the solid was lower than the
stored figure, typically 2.6 m against 2.9 m. The room schedule had already
traced rooms like these to washrooms, corridors and stairs.

Those rooms have lowered ceilings. Revit stops the room's volume at the
ceiling, but the Height it stores is the nominal slab-to-slab one. That
matches the `Qto_` definition, which measures Height without the suspended
ceiling. So the solid's top is the *finished ceiling* height, and Height is
something else.

The fix uses geometry the file already has. A ceiling covering whose underside
sits within 3 cm of the room's top, over the room's plan, means the solid
stopped at a ceiling. Height and gross volume are then left for the table,
and `FinishCeilingHeight` is still written. That catches 29 of the 30. It
also holds back 24 rooms whose heights would have been right. That trade is on
purpose: a missing value shows up on the to-fill table, while a wrong one
passes the check without anyone noticing. Across all eight exports, 445 of 446
offered heights now match.

Rooms under a sloped roof get the same treatment for a different reason. The
`Qto_` definition gives Height only to a space with a constant height, and
ARCHICAD stores those rooms' gross volume as floor area times nominal height,
about twice the solid. So a room whose volume isn't its floor area times its
height gets no Height, no ceiling figures and no gross volume.

## Volumes, and two unit slips

Gross volume matched only 125 of 352 stored figures. Another 218 are exactly
1,000 times the solid: ARK_NUS writes litres under a cubic-metre unit. HouseZ
does the same with cubic millimetres for net volume (5 of 5). The fill writes
the solid's volume in the file's declared unit, so a space with no volume yet
gets the right one. It never overwrites a figure the file already stores.

## What it adds up to

With the stored figures hidden, the fill wrote 6,931 values on the 12 models.
Every one passes the fill's own re-read, and IfcTester takes exactly the
written spaces from fail to pass on all 96 model-and-specification pairs.
A Revit export with no base quantities at all, like the 269-room dental
clinic, gets 2,144 values in about three seconds.

Not offered: net perimeter (the definition takes door openings off, and no
export here stores a figure that differs from the gross one), wall areas (no
two tools deduct the same things), and finish floor height. The full table and
the rules are in
[`eval/space-quantities-2026-11-22.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/space-quantities-2026-11-22.md).

To try it: open the page, check a model against an IDS that asks for
`Qto_SpaceBaseQuantities`, and tick *Measure missing Qto_ volumes and areas
from each element's geometry* in the fill panel. Or from the command line,
`node cli.mjs --fill model.ifc spec.ids -o filled.ifc --from-geometry`. The
model never leaves your machine.

*The figures are measured from the model's geometry and checked against public
exports, not against site surveys. Check them before using them for leases,
valuations or contracts.*
