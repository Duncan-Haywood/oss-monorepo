---
title: "Seven of every ten tests our IDS checker ran were repeats"
seo_title: "Faster IDS checks: cache facet results across specifications"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "On a 40 MB MEP export, 68 public IDS files ran 11.4 million facet tests, 7.9 million repeats. Keeping the results cut the run by a quarter; same reports."
---

An IDS file is a list of specifications. Each one says which elements it
applies to and what those elements must have: "every element has some
attribute set", "every element's name starts with a storey code", "every
wall has `Pset_WallCommon.LoadBearing`". The
[IDS model checker](../../ventures/ids-model-check/README.md) checks them one
at a time, and a build server checks several IDS files against the same model.

Some public IDS files write rules that apply to every entity in the model,
not only the walls and doors. On the HHS Office MEP export that is 665,224
entities, most of them geometry. The checker already skips most of the work
for those entities, but it still ran each rule's tests on each of them.

So we counted. With the 68 IDS files we test on (3 starter files and 65
published on GitHub), checked one after another against that one model, the
checker ran 11,378,962 facet tests. 7,867,322 of them, about seven in ten,
repeated a test it had already run on the same element with the same facet.

## Where the repeats come from

- **The same "applies to" in many rules.** The 539 specifications have only
  153 distinct applicability sections. Ten of them, in two files, apply to
  every entity through an entity name pattern that takes every class, and each
  ran that test on all 665,224 entities.
- **A rule's requirement that is another rule's applicability.** One
  published fixture uses "has some attribute set" to choose the elements for
  two rules. A third rule requires the same facet twice. That one facet was
  tested 2.0 million times on 665,224 entities.

## What the checker keeps now

A parsed model keeps two things for the length of a run:

1. **Each distinct applicability's result.** The key is the facets' full
   content, so two rules that differ only in a value, a pattern or a data type
   do not share one. When the result takes most of the model it is kept as
   the few elements it leaves out (none, for "every entity").
2. **One byte per element for a facet's verdict** (not tested yet, passes,
   absent, fails), for a facet run over more than a quarter of the model. At
   most eight facets are kept, the least recently used dropped first: 665 KB
   each on this model, 3.7 MB on our 219 MB federated test model.

The reasons written for a failing element still come from the full test.
So a cached verdict that wrongly said "fails" would be corrected there.
Only one that wrongly said "passes" could change a report, and the new test
plants faults of that kind to make sure it notices.

## Results

The same 68 files now run 3,650,434 facet tests on that model, and 138,794
of them repeat (mostly the second test that writes the reasons of the up to
1,000 failures a rule keeps). Two runs each, Node 22, 4 vCPU; every report
hashes the same as before.

| model | before | after |
|---|---|---|
| HHS Office MEP, 39.6 MB | 6.2-6.7 s | 4.5-4.7 s |
| HHS Office architect, 13.1 MB | 3.0 s | 2.4 s |
| HHS Office construction, 3.9 MB | 1.1-1.2 s | 1.0 s |
| Schultz Residence, 22.5 MB | 3.3 s | 2.4-2.5 s |
FEDROWS

A new test builds five IDS files that repeat facets on purpose. It checks
them and the three starter files against one shared copy of the sample house,
then each on its own. Every report has to equal the report from a fresh
model with the caches off (`check(..., { facetCache: false })`). Seven
planted faults each fail it: a key that ignores a value, a pattern or a data
type; the left-out list ignored; and verdicts that pass what they should not.

The counts, the method and what is left (the ifcXML reader still builds every
entity up front) are in
[`eval/applies-cache-2026-11-18.md`](../../ventures/ids-model-check/eval/applies-cache-2026-11-18.md).
