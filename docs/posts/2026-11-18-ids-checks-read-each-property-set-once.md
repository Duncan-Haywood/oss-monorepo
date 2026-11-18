---
title: "Our IDS checker read the same property set hundreds of times"
seo_title: "Faster IDS checks: read each IFC property set once"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "Caching each IFC property set once per model and indexing sets by name cut 68 IDS files on a 40 MB MEP export from 9.0 s to 5.6 s, same reports."
---

An IFC model hangs its properties on elements through property sets. A door
type carries `Pset_DoorCommon`, and every door of that type inherits it. A
door can also carry its own `Pset_DoorCommon` that overrides some of the
type's values. An IDS rule such as "every element has
`Pset_DoorCommon.FireRating`" makes a checker gather those sets for each
element it tests.

Our [IDS model checker](../../ventures/ids-model-check/README.md) gathered
them from scratch each time. For each element and each rule it read every
set's name, walked its property list and built a fresh map. We ran the 68 IDS
files we test against (three starters and 65 published in public
repositories) on the HHS Office MEP export from opensourceBIM's collection.
That is 539 specifications, many of them aimed at every element, so the
same few thousand sets were read hundreds of times each.
The profile put this reading first, at 13% of the run's time. Second, at 11%,
came a quick filter that was meant to save work but still let through every
element with any property set at all.

## What changed

- **Each property set is read once per model.** Its name and properties are
  cached. When an element has only one set of a given name, the checker hands
  back the cached map. When an occurrence overrides its type's set, the
  checker copies the map first, so the override never leaks into the type.
- **Sets are indexed by name.** The model now keeps, for each set name, the
  elements that reach a set of that name. It builds this once (23,456 sets and
  34,918 links on the MEP export). A rule's filter tests each distinct name
  once and then costs one lookup per element. If an element's sets all have
  other names, the filter says so exactly, and the rule's verdict follows
  from its cardinality without any reading.
- **Two smaller caches.** The attributes an attribute rule matches now depend
  only on the class, so they are cached per class. The class hierarchy cache
  no longer builds a string key on every call.

The first version of the index was slower. It rebuilt the holder list for
every rule and took 22.4 s where main took 9.6 s, which is why the index is
now built once per model and grouped by name.

## Results

We hashed every report with its timing removed, ran each model once on main
and once with the change, and compared:

| model | before | after | reports |
|---|---|---|---|
| HHS MEP, 39.6 MB | 9.0 s | 5.6 s | identical |
| HHS architect, 13.1 MB | 3.5 s | 2.2 s | identical |
| HHS construction, 3.9 MB | 1.2 s | 0.8 s | identical |
| Schultz Residence, 22.5 MB | 3.3 s | 2.8 s | identical |
FEDROW

A new test pins the change down. It compares the cached reader with the old
one on every entity of a small model with inherited, overridden, nameless and
material sets. It also runs 21 rules against the result of testing every
entity directly, with no filter. Two planted faults each fail it: sharing the
type's map on an override, and leaving out elements that reach a set only
through their type.

The method, numbers and profile are in
[`eval/psets-cache-2026-11-18.md`](../../ventures/ids-model-check/eval/psets-cache-2026-11-18.md).
What still costs the most on this model is the attribute rules in one public
fixture that match every attribute of every entity, and the loop over every
entity for rules that name no class.
