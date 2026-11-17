---
title: "External walls only: the IDS editor now narrows a specification by property, attribute or classification"
seo_title: "Write an IDS for external walls only, not every wall"
date: 2026-11-17
description: "The free IDS editor adds conditions to a specification's applicability and counts how many of an open model's objects each keeps, as the checker counts them."
tags: [ids-model-check, bim, ifc, ids]
---

"External walls must have a fire rating" is one of the first requirements a
BIM coordinator writes, and until today the [IDS editor](/ids-model-check/editor.html)
could not write it. A specification's *applicability* says which elements it
is about, and the editor could only put a class there. Ask for a fire rating
on `IFCWALL` and every internal partition fails too.

IDS 1.0 allows more than a class in the applicability: a property, an
attribute, a classification, a material or a place. An element that doesn't
match isn't checked at all. So the editor now has a **Narrow it** button
under the class. It adds a condition row that works like a requirement row:
pick `Pset_WallCommon`, then `IsExternal`, then `true`. The specification is
now about external walls only.

## How many elements does the condition keep?

A condition that matches nothing is a quiet failure. A *required*
specification with nothing to check fails. An optional one passes and checks
nothing. So when a model is open in the editor, each condition row says how
many of the class's objects it keeps:

> 2 of the model's 3 object(s) of this class match this condition, so the
> specification checks those 2.

The count comes from the inventory the editor already builds from the model,
so nothing extra is read. It has to agree with the checker. We tested 11
conditions on the sample model: true, false and "any value" on a property,
text equality, an enumerated attribute, a name pattern, a one-of list, an
attribute nobody set, and two classification systems. Each count equalled the
checker's own `applicable` figure. Some cases follow IDS rules rather than
intuition. An attribute set to an empty string or UNKNOWN fails "any value".
A classification reference with no code still passes a condition that names
only the system. Where the inventory can't tell exactly, for a code value or
a list of values cut short, the page shows no count rather than a guess.

## Opened files gain too

Open an IDS that someone else wrote, and its applicability conditions now
become editable rows wherever the row writes back the same XML. Anything else
stays as read-only XML, written back unchanged. On the 64 public IDS files we
test against, 83.5% of facets are now editable, up from 82.0%. Files where
every facet is editable went from 10 to 14. On buildingSMART's IDS-Audit-tool
sample files the share went from 9.7% to 21.5%. Every specification still
writes back asking the same thing.

## What's still read-only, and why

63 of the 94 applicability conditions in those public files still open as XML.
39 of them are a property with a value but **no dataType**. The editor always
writes the standard's dataType on a standard property, and adding one would
change what the facet asks. That's the next row type to support. The details
and the full table are in the
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/applicability-rows-2026-11-17.md).

The editor and the checker run in your browser. Your model is not uploaded.
Both are free and MIT licensed. The results are checks, not professional
sign-off, so read a surprising result against the model before acting on it.
