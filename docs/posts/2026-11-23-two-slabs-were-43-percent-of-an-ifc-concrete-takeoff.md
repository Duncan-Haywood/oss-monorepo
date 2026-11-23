---
title: "Two slabs were 43% of a model's concrete: stored IFC volumes in doubt"
seo_title: "Two IFC slabs that were 43% of the concrete takeoff"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "Two sloped slabs in a public Revit IFC stored 6,421 m3 against 6.5 m3 of body. Our free takeoff now shows every figure in doubt and lets you price either."
---

Our [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/)
checks every volume and area a model stores against the model's own
geometry. When the two disagree it tries to name why: a wall split by level, a
volume in litres, a section without its root fillets. Where it finds a cause,
the bill of quantities sums the geometry.

A quality audit last week pointed at what was left over. Where the tool could
name *no* cause, the bill still summed the stored figure, and the line said
nothing about it. So this run counted how much of a real bill rests on those
figures, across 15 public models.

## On 11 of 15 models, none of it

For 11 models, every figure the bill sums either agrees with the geometry
within 2% or has a named fault. The other four had 5 volumes and 13 areas
that disagreed with no cause found. Most of them were small. One wasn't.

## 6,415 cubic metres that are not in the model

In the Norwegian school model `ARK_NUS_skolebygg` (Revit, IFC2X3), two slabs
named "Betongdekke 250 m fall" store gross volumes of 5,618.50 and 802.35 m3.
Their bodies are 5.29 and 0.78 m3. Summed as stored, they made up 43% of
the model's whole bill of quantities.

An earlier run had looked at these two and left them alone. Their ratios to the
geometry are 1,061.6 and 1,034.2. That's close to a thousand, but not close
enough to count as a unit slip, and calling them one on a hunch would let
chance matches in on other models.

They turn out to be two faults at once. Both slabs also store a GrossArea and a
Width, and the stored volume equals GrossArea x Width x 1000 to every digit
the file carries:

| | area m2 | width m | area x width x 1000 | stored volume |
|---|---:|---:|---:|---:|
| #1186582 | 22.4740007609 | 0.25 | 5,618.50019022 | 5,618.50019022 |
| #1483037 | 3.2094104574 | 0.25 | 802.35261435 | 802.35261435 |

So the volume was written in litres, which is the common unit slip. It is
also the nominal 250 mm slab, while the body is laid to falls so that it
drains, with a mean thickness of 236 and 242 mm. That 3-6% difference after the
factor of a thousand is why the unit-slip test missed them.

The tool now names this `nominal-slip`. The rule is narrow. The stored volume
has to equal the element's own stored area x width x a power of ten to six
significant figures, and the body has to come within 15% of area x width.
When two stored figures multiply out to six digits, that is the exporter's own
arithmetic, not luck. After the fix the model's bill drops from 14,783 to
8,369 m3, and no other pair in the corpus changed.

## The rest: shown, not decided

The figures still in doubt get no rule, because we can't tell which side is
wrong. Two Revit walls in the HHS Office model store about twice their body's
volume. Seven Tekla plates store an area two to three times their plan.
In the causes found so far, most errors were in the stored figure, but a few
were in our own geometry reader. An unexplained one could be either.

So the page doesn't pick silently any more. Each bill line says "2 in doubt:
stored 22.09, geometry 10.92 m3", and a sentence under the table gives the
totals. The CSV has a count and both sums for volumes and for areas, plus
which one was priced. A new choice, "Where stored and geometry disagree for no
known cause", sets whether the bill sums the stored figure (the default, as
before) or the geometry. On the command line that's `--unexplained geometry`.

The method, every number and the per-element list are in
[`eval/in-doubt-2026-11-23.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/in-doubt-2026-11-23.md).
The rule rests on two slabs from one model. A slab laid to steeper falls would
stay unexplained, but it would now show up on its line instead of being
summed without comment.

*Quantities are only as good as the model. This is a free tool, not a cost
estimate or professional advice.*
