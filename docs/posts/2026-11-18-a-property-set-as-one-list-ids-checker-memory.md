---
title: "Dropping property arguments made our IDS checker slower, so we kept one small list per property set instead"
seo_title: "IDS checker memory: one record per property set"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "An IFC checker kept every property's parsed arguments. One flat list per property set halves what 68 IDS checks add to the heap, at the same speed."
---

Our [IDS model checker](../../ventures/ids-model-check/README.md) reads an
IFC file lazily: an entity's arguments are parsed the first time a check asks
for them. Geometry and relationships are dropped again after reading.
Everything else was kept, so the second check of the same wall costs nothing.

Most of what was kept turned out to be property sets and their properties.
After 68 IDS files (three starters and 65 published in public repositories)
on a 219 MB federated model built from real exports, the checks had added
137 MB to the heap. Most of that was the parsed argument lists of property
sets, properties and quantities.

## The obvious fix was slower

The [previous run](../../ventures/ids-model-check/eval/shared-values-2026-11-18.md)
tried simply not keeping them. Memory fell, but the 68 checks got 17% slower,
and 39% slower once the sets themselves were dropped too. The reason: every
time a property facet tests an element, the checker rebuilds the element's
property sets. That means each set's name, its list of properties and each
property's name. With the arguments kept those are array reads. Without them,
each one parses text again, for every element and every facet.

## What we keep now

The checker no longer keeps the arguments. Each property set is read once
into one flat list:

```
["Pset_WallCommon", "FireRating", <entity #1>, "IsExternal", <entity #2>, ...]
```

The names are the strings the reader already shares. The properties are
direct pointers to entities that exist anyway, not the `{ref: 1}` objects an
argument list holds. The list is copied to its length, because a JavaScript
array built by `push` keeps room for 16 items. A property's *value* is still
parsed from the text when a facet asks for it, but only for properties whose
set name and property name the facet takes.

## Measured

On the 219 MB federated model, against the same 68 IDS files
([full numbers](../../ventures/ids-model-check/eval/pset-records-2026-11-18.md)):

| | before | after |
|---|---:|---:|
| heap the checks add | 137 MB | 71 MB |
| smallest heap that parses and runs all 68 | 704 MB | 608 MB |
| time for the 68 checks (three runs) | 10.7-11.5 s | 11.4 s |

The 49,795 records the run reads take 12 MB, where the arguments they replace
took about 79 MB. Every report hashes the same as before on five real models,
and so does the editor's model inventory.

The general lesson: if dropping a cache is cheap in memory but expensive in
time, look at what the code actually reads from it. Here every check needed
a few names, and the cache held whole argument lists. A smaller record that
holds only the names kept the speed.

With this change, peak memory comes mostly from parsing: the parse alone
needs 512 MB on this model, and the checks add 96 MB on top. That is the next
thing to shrink.
