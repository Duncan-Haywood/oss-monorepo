---
title: "An IDS check that stops reading every point in the model"
seo_title: "Faster IDS checks on large IFC models: skip geometry lists"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "An attribute rule that matches every name sent our IFC checker through every point's coordinates. Skipping lists halves the time with the same reports."
---

An IDS file can say "every element has a classification" without naming any
element. A checker then has to look at every entity in the model, and in an
IFC export most entities are geometry. The HHS Office MEP model from
opensourceBIM's public collection has 665,224 entities. Three quarters of them
are Cartesian points, poly loops and faces.

Our [IDS model checker](../../ventures/ids-model-check/README.md) already
filtered most of those out without reading them, using only the entity's class
and the relationships the model indexes once
(`eval/no-entity-facet-2026-11-17.md`). One kind of rule still got through.
An attribute facet whose name matches any attribute, such as
`attribute (any)` or `attribute (any) = "?"`, has to look at each attribute's
value. That meant parsing `IFCCARTESIANPOINT((0.,1.,2.))` into arrays and
numbers for every point and every rule, then throwing the result away,
because the checker does not keep geometry in memory.

This shows up in a published file. OpenAEC's NL-BIM Basis ILS fixture writes
the attribute name as `<n>` instead of `<name>`, so each of its attribute
facets matches every attribute of every entity.

## What an attribute test needs from a list

Nothing inside it. For each matching attribute the test asks three things: is
it unset, is it empty, and, when the rule gives a value, does a scalar match
it. A list can never match a value in IDS. The verdict is "is a list; IDS
cannot compare its value" whatever the list holds.

So the STEP reader got a shallow mode. It reads an entity's top-level
arguments, steps over each nested list (strings and comments inside
included), and puts a shared placeholder in its place, either empty or
non-empty. The attribute test uses that mode for geometry and full reads for
everything else.

## What it changed

The same 68 IDS files (3 starter files and 65 public ones), checked against
four real exports, before and after. Each report was hashed with its timing
removed:

| model | before | after | reports |
|---|---|---|---|
| HHS MEP, 39.6 MB | 13.3 s, 1,024 MB | 8.3 s, 646 MB | identical |
| HHS architect, 13.1 MB | 4.9 s, 469 MB | 3.3 s, 284 MB | identical |
| HHS construction, 3.9 MB | 1.4 s, 241 MB | 1.0 s, 186 MB | identical |
| Schultz Residence, 22.5 MB | 7.0 s, 528 MB | 3.4 s, 303 MB | identical |
| nine exports federated, 219 MB, 2 GB heap | 114.3 s, 2,069 MB | 67.5 s, 1,838 MB | identical |
| the same with a 1 GB heap | out of memory | 113.7 s, 1,287 MB | identical |

The last row matters most. A 219 MB model with every public IDS file used to
need a 2 GB heap. It now finishes in 1 GB, about what a browser tab can count
on.

With the OpenAEC file alone, the MEP check went from 10.2 s to 4.7 s, and
its peak memory halved.

A new test plants the cases most likely to break a list skipper: an empty
list, a list holding only an empty list, a string containing `)` and `''`,
and a comment inside a list. Each entity's shallow arguments must agree with
the full ones, and fifteen rules must give the same report both ways. Two
faults planted in the skipper each fail it.

Next on that profile is property-set lookup for rules that apply to every
entity. The measurements, commands and models are in
`ventures/ids-model-check/eval/attribute-any-geometry-2026-11-18.md`.
