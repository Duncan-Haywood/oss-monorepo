---
title: "Half the ranges taken from a Revit model's own values fail that model in IDS"
seo_title: "IDS ranges have no tolerance: why 0.254 fails a Revit model"
date: 2026-11-17
description: "The free IDS editor now offers the values a model holds. 364 of 752 ranges copied from them failed their own model, because IDS ranges take no tolerance."
tags: [ids-model-check, bim, ifc, ids]
---

The [IDS editor](/ids-model-check/editor.html) could already open the model
you are writing requirements for and offer the classes, property sets and
properties it carries. Today it also offers the values. Pick
a property such as `Pset_WallCommon.FireRating` and the row lists the values
the model holds, with how many objects carry each. One button writes a "one of"
list of exactly those values. On a number, a second button writes the model's
range.

We checked the feature the obvious way. On four real exports from
opensourceBIM's public IFC files (the HHS office's architect, construction and
MEP models, and the Schultz Residence, all from Revit-era IFC2X3), we built a
requirement from every offer and checked each model against the requirements
built from its own values. Every one should pass.

The first time we ran it, 364 of 1,014 failed.

## 0.254 is not 0.254

Every failure was a range. A typical one:

> `Pset_StairFlightCommon.TreadLength is 0.25399999999999995, not >= 0.254`

Ten inches is 0.254 m. Revit stores lengths in feet and converts them on
export, and the double that comes out is a few units off in the last place.
Shown to 12 significant digits it reads 0.254. As a stored double it sits just
below 0.254.

IDS compares a single value with a tolerance of about a millionth. Ranges get
none. buildingSMART's implementer notes say so directly: "Tolerance does not
apply to ranges", so that an author can write a construction tolerance
explicitly. The checker was right. The editor's offer was wrong, and an author
who typed the nominal 0.254 by hand would hit the same failure.

The trap is common. With the bounds as displayed, **364 of the 752 ranges
(48%) failed the model they came from.**

## The fix: round outward

The editor now keeps each model's minimum and maximum as exact doubles. It
rounds outward to the shortest decimal that is at or below the minimum (at or
above the maximum) and within IDS's equality tolerance of it. 0.25399999999999995
becomes 0.253999 and 0.10795000000000012 becomes 0.107951. When the bounds
change, the row says so:

> They range from 0.254 to 0.2794 (SI units); as written, 0.25399999999999995
> to 0.2794, and IDS ranges take no rounding tolerance, so the model's range is
> 0.253999 to 0.2794.

With that change, **1,014 of 1,014** requirements built from the offers pass
their own model, and changing one value makes the check fail again. That test
is in the venture's suite.

## What else changed

- "One of" works on any text property or attribute, not only the ones the
  standard gives an enumeration. You can tick the model's values or type your
  own. Published IDS files that list values for a free-text property now open
  as editable rows: 82.0% of the facets in 64 public IDS files are editable
  (was 81.1%). All 64 still write back asking for the same thing, and none
  becomes invalid against `ids.xsd`.
- Values come from the checker's own reader, so a value the editor offers is
  one a check of that model accepts. Measures are in SI units: a millimetre
  model's 6000 is offered as 6.
- 1,157 of the 1,179 property rows in those four models have values to offer.
  For 1,114 of them the editor knows the full list (50 values or fewer).

What it doesn't do yet: offer values for attributes (`Name`, `ObjectType`)
or for classification codes. We also haven't seen a real model whose values
fall outside a standard's enumeration. The warning for that case is tested on
synthetic data only.

The measurements and the script that reproduces them are in
`ventures/ids-model-check/eval/model-values-2026-11-17.md`. The editor runs in
your browser and uploads nothing. Like the rest of the checker, it is MIT
licensed and is not a substitute for a BIM manager's judgement.
