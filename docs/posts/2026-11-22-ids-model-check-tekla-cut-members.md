---
title: "Tekla's cut beams: the length was in the geometry, the axis was the problem"
seo_title: "Fill Qto_ Length on Tekla IFC beams with cut ends from geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim]
description: "The free IDS checker now measures Length on Tekla members with cut ends: 147 more lengths on three public exports, all within 0.1% of Tekla's own."
---

Earlier today [IDS Model Check](https://marisstella.app/ids-model-check/)
learned to [measure a beam's length from its geometry](2026-11-22-ids-model-check-member-lengths-from-geometry.md)
when a model is missing `Qto_…BaseQuantities.Length`. It left out every
member with cut ends that came from Tekla Structures: 176 of them on the three
public Tekla exports we test against. The reason given was that Tekla's figure
"may be the part's reference-line length, which the IFC body does not carry."

That guess was wrong, and finding out why took reading the 16 misses one at
a time.

## What the misses were

- **Nine were braces.** M3D-CON's `DIA-2` is a 250 mm slab whose 12-sided
  outline is a diagonal brace 1,453 mm deep. Tekla writes it as a plain
  faceted shell, so the axis has to be guessed from the faces. The outline's
  two big faces lie along *every* direction in their plane, and the guess came
  out 7 degrees off the brace. Measured along the brace's long faces, the
  length is 2.4766 m. Tekla stored 2.4767 m.
- **Four were base plates**, 51 mm square and 4.5 mm thick, exported as
  beams. They have no length to measure.
- **Three were downpipes with an offset bend.** A bent pipe has no straight
  length at all.

So Tekla's `Length` is the plain extent along the member's own axis, as the
other 156 had suggested. The axis was there in the geometry all along. The
checker was just finding it the wrong way.

## The rule

For a cut Tekla member, the checker now takes the smallest box that sits
flush with the body's own faces. The box's longest side is the member's axis,
and the length is that side. It still holds a member back in two cases:

- the box is about as wide as it is long (the base plates), or
- the section through the middle of the box covers less than 90% of the box's
  width. A straight member's middle section spans its box however the ends are
  cut. A bent pipe's covers about half of it.

The first version tried every pair of face directions and took 37 seconds on
the larger model, too slow for a page. Starting only from the six largest
faces gives the same answers in about a second.

## How it did

On the three Tekla exports, 147 more lengths are offered. All 147 are within
0.1% of what Tekla stored. With the stored lengths hidden and the fill asked
to put them back, it writes 1,386, 190 and 25 lengths. Every one matches the
original, and [IfcTester](https://github.com/IfcOpenShell/IfcOpenShell)
(IfcOpenShell's own checker) passes exactly those elements. Cut members held
back fall from 176 to 29. Fourteen of those 29 would have been measured right
too, but the middle-section test can't tell them from the bent pipes, so
they're left for a person.

The first try used a looser test for "straight": volume divided by section
area. It would have held back 76 correct lengths. Precast walls with openings
and double tees have a middle section smaller than their average one, which
fools that test.

## What it doesn't show

This is three files from two projects, and two of them are versions of one
model. Another office's Tekla export, or a newer Tekla release, could write
cut members differently. Bent parts (polybeams, pipes) stay in the to-fill
table: volume over section matched Tekla on all three here, but three isn't
enough to start writing them into people's models.

The measurements and the scripts are in the venture's
`eval/tekla-cut-members-2026-11-22.md`. The checker is free, runs in the
browser, and never uploads the model.
