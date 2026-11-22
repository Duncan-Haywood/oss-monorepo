---
title: "603 mullions that measured their whole facade: member lengths from IFC geometry"
seo_title: "Member lengths from IFC geometry: 603 mullions measured the facade"
date: 2026-11-22
tags: [ifc-quantity-takeoff, bim, quantity-surveying, evaluation]
description: "Half of 10,035 beams and columns in 30 public IFC models store no length. The body gives it, and caught 5,480 m of mullion that was really 795 m."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/README.md) turns a
building model into a bill of quantities in the browser. This morning's
[quality audit](2026-11-22-quality-audit-round-90.md) found a quiet hole in
it. A steel beam's length and weight came only from the quantity set the
exporter wrote. When the exporter wrote none, the line said 0 m and 0 kg, and
a rate per metre or per kilogram priced the beam at nothing.

## How often that happens

On 30 public IFC models (the [method and every number](../../ventures/ifc-quantity-takeoff/eval/member-length-weight-2026-11-22.md)),
**4,952 of 10,035** columns, beams, members and piles store no Length. That
is about half. Whole models have none at all: the 1,585 members in
advanced_model, the 1,209 in ISSUE_098 and the 534 in dental_clinic.

The fix is the definition in the standard. Qto_BeamBaseQuantities defines
Length as the total nominal length, "not taking into account any cut-out's
or other processing features". That is the body's extent along its
extrusion, so the tool now reads it from there. 4,948 of the 4,952 got a
length. The other 4 have no axis to read.

## Checking it against the members that do store one

A computed figure is only worth summing if it agrees with the stored ones.
Of 5,083 stored Lengths, **4,153 agree within 2%**, including all 1,649 in
the HHS Office models and 2,138 of 2,203 in a Tekla steel model.

Most of the rest came from one model, and those turned out to be the more
useful finding. In ARK_NUS_skolebygg (Revit), 603 curtain-wall mullions each
store **20.858 m**, the length of the facade they belong to, while their
bodies are 0.4 to 3.5 m long. Together they stored **5,480 m** of mullion
against **795 m** of actual mullion. The bill of quantities had been
summing the stored figure, which overstated the line about 6.9 times.

The tool now names the cause ("host-figure"): one stored Length on three or
more members of the same assembly, all shorter than it and differing from
each other. For those members it sums the body instead. 327 pairs still
disagree with no named cause (mostly Tekla diagonal braces, whose stored
figure is a reference-line length). They keep their stored figure and are
listed in the eval.

## Weight

Steel is priced per tonne, so a beam also needs a weight. For a member whose
material names plain steel (S235 to S690, ASTM A36/A992, "Steel -
Structural", "staal" and so on), with nothing in it naming concrete, timber,
stainless or rubber, the weight is the volume times **7,850 kg/m³**. That
density is in the Eurocode tables and matches AISC's 490 lb/ft³. Two Tekla
models store weights to compare against, and the density agrees with **230
of 233**. The 3 misses are beams Tekla weighed from a simplified section, a
cause the tool already scales. 512 steel members that weighed 0 kg now weigh
what they should.

Two catches along the way. Tekla's "STEEL/NEOPRENE" bearing pads matched the
first steel pattern, so rubber is excluded now. "05 Staal_bordes_hoeklijnen"
(Dutch: steel landing angles) didn't match at all, because the underscore
glued the words together.

## What it does not do

The weight is the solid's, so bolts, welds and the connection allowance an
estimator adds are not in it. Stainless steel is left unweighted rather than
guessed. A member whose only material name is a paint colour (829 ARK_NUS
members say "RAL 9004") is not weighted either. Each bill-of-quantities line
now says how many of its lengths and weights were computed and how many are
still missing, so nothing silently prices at zero.

The same change added tests for three geometry branches the audit's seeded
bugs had slipped past: an elliptical profile, a revolve axis away from the
origin, and centimetre units. All three seeded bugs now fail the suite.

The tool is free and runs in the browser:
[marisstella.app/ifc-quantity-takeoff](https://marisstella.app/ifc-quantity-takeoff/).
Results are estimates to check, not professional advice.
