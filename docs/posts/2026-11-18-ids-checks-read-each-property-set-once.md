---
title: "Our IDS checker read property sets it could never match"
seo_title: "Faster IDS checks: index IFC property sets by name"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "Indexing IFC property sets by name cut 68 IDS files on a 40 MB MEP export from 7.9 s to 4.6 s with identical reports. A cache that seemed to help did not fit."
---

An IFC model hangs its properties on elements through property sets. A door
type carries `Pset_DoorCommon`, and every door of that type inherits it. A
door can also carry its own `Pset_DoorCommon` that overrides some of the
type's values. To check an IDS rule such as "every element has
`Pset_DoorCommon.FireRating`", a checker gathers those sets for each element.

Our [IDS model checker](../../ventures/ids-model-check/README.md) runs a
quick filter before that full test. The filter asked only whether an
element had any property set at all. If it did, the checker read all of the
element's sets, with every property name, even when none of them was called
`Pset_DoorCommon`. We test against 68 IDS files (three starters and 65
published in public repositories), 539 specifications in all, and many are
aimed at every element in the model. On the HHS Office MEP export from
opensourceBIM's collection, this reading took 13% of the run's time, and the
filter took another 11%.

## An index by set name

The model now keeps, for each property set name, the elements that reach a
set of that name. It looks at the element's type, its own sets, and a
material's sets, exactly as the full test does. The index is built once per
model and reads only each set's name. The federated test model has 118
distinct names and 192,355 element-to-set links.

A rule's filter now tests each distinct name once and then costs one lookup
per element. When an element's sets all have other names, the filter knows
for certain that the full test would answer "has no property set", so the
rule's verdict follows from its cardinality and nothing more is read. Two
smaller caches went in alongside: the attributes an attribute rule matches,
kept per class, and the class-hierarchy lookup, which no longer builds a
string key on every call.

## The cache that did not fit

The first version also cached every set's properties on the model. It was
fast, but on a 219 MB federated model (nine real exports joined) it ran out
of memory under a 1 GB heap, where the old code finished. We measured the
heap after each IDS file. The old code ends at 1,022 MB live, so it only just
fit. The cache read every set up front and kept 418,653 properties in memory
from the first file on.

Dropping the cache made the run both faster and smaller. With only the name
index, properties are read only where a rule's set name matches. The run now
ends at 991 MB live, and HHS MEP went from 5.5 s to 4.9 s in the same
session.

## Results

We hashed every report with its timing removed and ran each model once on
main and once with the change, one after another on the same machine:

| model | before | after | reports |
|---|---|---|---|
| HHS MEP, 39.6 MB | 7.9 s | 4.6 s | identical |
| HHS architect, 13.1 MB | 3.2 s | 2.3 s | identical |
| HHS construction, 3.9 MB | 1.1 s | 0.9 s | identical |
| Schultz Residence, 22.5 MB | 3.2 s | 2.6 s | identical |
| federated, 219 MB, 2 GB heap | 63.1 s | 39.4 s | identical |
| federated, 219 MB, 1 GB heap | 105.0 s | 71.3 s | identical |

A new test compares the property reader with main's on every entity of a
small model with inherited, overridden, nameless and material sets. It also
runs 21 rules against what every entity gives when run directly through the
facets' tests, with no filter. Two planted faults each fail it: an index
that misses elements reached only through their type, and one that misses
materials.

The method, profile and every step's timing are in
[`eval/psets-cache-2026-11-18.md`](../../ventures/ids-model-check/eval/psets-cache-2026-11-18.md).
What costs most on this model now is one public fixture's attribute rules,
which match every attribute of every entity, and the loop over all entities
for rules that name no class.
