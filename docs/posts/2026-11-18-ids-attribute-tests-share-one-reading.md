---
title: "Our IDS checker ran 2.85 million attribute tests where 191,000 were enough"
seo_title: "Faster IDS attribute checks: share one reading per element"
date: 2026-11-18
tags: [bim, ifc, ids, performance]
description: "Attribute rules that differ only in their value now share one reading of each element. 68 public IDS files run 30% faster, and a string memory leak went away."
---

The [IDS model checker](../../ventures/ids-model-check/README.md) tests a
building model (IFC) against an IDS file, a list of rules like "every wall
has a name" or "every element's description is one of these values". It is
free, runs in the browser or in CI, and is MIT licensed.

We check it against 68 IDS files, 3 of ours and 65 published on GitHub. One
of them, a Dutch BIM fixture, writes its attribute names in a way that
matches every attribute of every element. Its 12 rules apply to all 665,224
entities of a 40 MB office MEP export, most of them geometry. It also asks
about the same attributes four times: once for "is it set" and once each for
three different values.

## Most of the answer doesn't depend on the value

Before an attribute rule compares a value, it asks some questions that have
nothing to do with the value. Does this class have the attribute? Is it set?
Is it empty? Is it a list or a reference, which IDS cannot compare by value?

On this model the last question settles nearly everything. A point's
coordinates are a list. A face's bounds are references. Every rooted object
has an `OwnerHistory` reference. Only 190,924 tests needed the value at all.

The checker already kept one byte per element per rule. That cache is keyed
on the whole rule, value included, so it could not tell that four rules
share a name. Over the 68 files it ran the attribute test 2,851,787 times.

## Spare bits

A verdict needs two bits: passes, absent or fails. The byte has eight. So an
attribute rule's byte now also holds that value-free reading. A rule with
the same attribute name reads it from any other kept rule's byte before
looking at the element itself. That is one reading per element (665,224 of
them), and no new memory.

We tried a separate array per name first. It was faster still, but it put
our 219 MB stress model over a 1 GB heap, where the old version fits. We
dropped it.

## The leak the memory check found

The version that shares bits also ran out of memory at 1 GB. Its live heap
was no higher than before, yet a heap snapshot showed 644,045 extra strings
kept alive.

Our STEP reader decoded every text value one character at a time. In V8 a
string built that way stays a chain of one-character pieces, about 32 bytes
a character, until something flattens it. Running a regular expression over
it is one thing that does. The old value tests did that by accident: every
rule ran its pattern over every name and description. Once those tests
stopped running, the chains stayed, 20 MB of them on the MEP model.

The decoder now returns text that has no escapes unchanged and copies plain
runs in one piece. We fuzzed it against the old decoder on 300,000 random
strings made of every STEP escape, and the outputs matched every time.

## Results

Every report hashes the same as before on all five models.

| model | before | after |
|---|---|---|
| 40 MB MEP export | 4.1-4.5 s | 2.9-3.1 s |
| 22.5 MB residence | 2.1-2.3 s | 1.6-1.7 s |
| 219 MB federated model | 35.7-36.7 s | 28.4-29.6 s |
| same, 1 GB heap | 49.3-51.5 s | 35.4-36.6 s |

The method, the 12 planted faults the new test catches and the one it
doesn't (it changes no verdict) are in
[`eval/attribute-shape-2026-11-18.md`](../../ventures/ids-model-check/eval/attribute-shape-2026-11-18.md).

The lesson we're keeping: a cache keyed on a whole rule misses what rules
share, and memory you can't explain is worth a heap snapshot. The leak had
been there all along. A faster path took away the accident that was hiding
it.
