---
title: "A Revit IFC export whose inch is 3.6576 metres"
seo_title: "IFC unit bug: Revit INCH declared as 3.6576 m, and the fix"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "A 2014 Revit IFC export declares its inch as 144 inches, so every volume reads 3 million times too big. How the free IFC takeoff now spots and repairs it."
---

We ran the [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
change report on a second house: five Revit exports of a lake-house renovation
that the architecture practice OpeningDesign committed to a public GitHub
repository between September 2014 and July 2015. The first run said that
between the second and third exports, every one of the 420 elements the two
files share had changed. Then the step after that said the same about all 568.

A practice does not redesign every joist in a house in three weeks, and then
redesign it all again nine days later. The volumes had all moved by the same
factor: 2,985,984, which is 144 cubed.

## The unit line

An IFC file declares its units once, near the top. The export from
14 October 2014 says:

```
IFCMEASUREWITHUNIT(IFCRATIOMEASURE(3.6576), <metre>)
IFCCONVERSIONBASEDUNIT(..., .LENGTHUNIT., 'INCH', ...)
```

So its "inch" is 3.6576 metres long. That is 144 real inches, or the foot
factor 0.3048 times 12. The coordinates themselves are in real inches. The
file says so twice. The same window has an OverallHeight of 4.677 in the
export before, whose unit is FOOT, and 56.125 in this one: the same height
counted in inches. The stair risers read 0.625 ft before and 7.5 here. Even
the area and volume units in the same file are declared correctly, as square
and cubic feet.

Any tool that believes the declared factor sees a house 144 times too long in
every direction. Its takeoff gives a 2x6 joist a volume in the hundreds of
thousands of cubic metres, and comparing that export with the one before
calls everything changed.

## What the takeoff does now

The IFC standard lists the names exporters use for imperial units (INCH,
FOOT, SQUARE FOOT, CUBIC YARD, POUND, DEGREE and so on). Each of those has
one exact value. When a file uses one of those names with a factor more than
0.1% away from its exact value, the takeoff now uses the exact value and the
page says so in its status line: *"'INCH' is declared as 3.6576 m (144 times
the real inch); the exact 0.0254 m was used."* Names that mean different
things in different countries, like gallon and ton, are left as declared.
So is anything not on the list. The command line has
`--trust-declared-units` for anyone who wants the file read at its word.

With the inch repaired, the elements that keep their GlobalId across the
faulty export have a median volume ratio of exactly 1.0000. Within 0.5%,
254 of 402 elements match against the export before and 331 of 549 against
the one after. Before the repair, none did. Four other public files with
imperial units, including one with a rounded 'square inch' of 0.0006452,
trigger no repair.

## The change report on the second house

Once the unit was fixed, the report told the same story as on the
[first house](2026-11-20-what-changed-between-two-ifc-revisions.md).
Revit gives the same windows and doors a new GlobalId in every export: 8 to
13 windows and 5 doors per step. The report matches them by the Revit element
id in the Tag. Across the four steps, a GlobalId-only comparison would list
138 records as added or removed that are the same element: 60 elements under
a new id, plus a wall split into parts and two walls whose 13 parts came back
whole. The longest step, nine months of design, shows 249 beams added and the
windows reworked.

If you price change orders from IFC files, a quantity that jumps by millions
is easy to spot. A unit fault that makes walls 12 times thicker or rooms 1.2
times longer is not, and that is why the page now names any unit it repaired.
The detail and every number are in
[the evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/units-repair-2026-11-20.md).

*The tool is free and MIT licensed, and it runs in your browser: the model
is not uploaded. No estimator has reviewed these reports yet. Check the
quantities before you price from them.*
