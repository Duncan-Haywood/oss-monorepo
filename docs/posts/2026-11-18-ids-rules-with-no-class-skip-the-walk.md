---
title: "IFC exports don't number their entities in file order, so our IDS checker had to keep its own"
seo_title: "IDS checks with no class: candidates in file order"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "IDS rules that name no IFC class used to walk every entity. A candidate list sorted back into file order makes them 2.9x faster, with identical reports."
---

An IDS rule usually starts by naming a class: "every `IfcDoor` must have
`Pset_DoorCommon.FireRating`". Some rules name no class. They pick elements by
a property set, a classification, a material or an attribute instead: "every
element that has `Pset_WallCommon` must say whether it is load-bearing". Of
the 68 IDS files we test against (three starters and 65 published in public
repositories), 37 specifications work this way.

Our [IDS model checker](../../ventures/ids-model-check/README.md) handled
them by walking every entity in the model and asking a cheap filter about
each one. On the 40 MB HHS Office MEP export that means 665,224 entities per
rule, three quarters of them geometry points that can never match.

## The list was already there

Each cheap filter already reads one index. The property filter reads a map
from set name to the elements that reach it. The classification filter
reads the classification links, the material filter the material links, and
the "part of" filter the relationship maps. So the same index can hand over
the short list of elements the filter could ever pass, and the checker tests
only those.

The catch is order. A report keeps the first 1,000 failures, so the list has
to come out in the same order as the walk, which is the order of the file.
The obvious shortcut is to sort by entity number (`#123`), and it is wrong.
None of the four real exports we test on (three from the HHS Office project,
one Revit house) numbers its entities in file order. Our own sample house
doesn't either.

So the model now builds, once and only when a rule needs it, an array that
gives each entity's position in the file. Entity numbers are dense integers
in every file we read, so a plain typed array indexed by number does it: 4
bytes per number, 18.6 MB on our 219 MB federated test model.

Where the shortest list still covers more than half the model, the checker
walks as before. This happens with a rule on an attribute that every class
has, for example. Sorting most of the model would cost about what the walk
costs.

## What it bought

On HHS MEP, the 24 public specifications that now take a list spend 305 ms
choosing their elements, down from 896 ms. The 13 that apply to most of the
model don't change. Their cost is running the full test on almost every
element, not the walk. On our 219 MB federated model, nine real exports joined into one with 3.7 million entities, the 24 rules went from 6.1 s to 2.2 s, and a whole run of the 68 files from 56.2 s to 49.6 s (one run each, so take the whole-run figure as rough).

Across a whole run of the 68 files, the gain on the four single exports is
within the noise. Parsing and those 13 broad rules take most of the time.
Every report hashes the same as before on all five models.

A new test builds a model whose entity numbers run against file order. It
then checks 20 kinds of rule with no class against a plain reference that
runs every entity through the full tests, with no filter and no list. The
checker has to return the same elements in the same order. Four planted
faults each fail the test: a classification list or a material list that
forgets elements classified only through their type, a property list that
drops one holder, and a list left unsorted.

The method and every timing are in
[`eval/file-order-candidates-2026-11-18.md`](../../ventures/ids-model-check/eval/file-order-candidates-2026-11-18.md).
The next cost to cut is the broad rules themselves. Several public files
test the same facet on every element, so a result cache shared across
specifications is the next thing to try.
