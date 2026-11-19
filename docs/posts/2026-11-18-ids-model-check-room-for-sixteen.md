---
title: "Room for sixteen: where our IFC checker's memory went after the parse"
date: 2026-11-18
tags: [ids-model-check, ventures]
description: "Checking a 219 MB IFC model against 68 IDS files needed an 896 MB heap. Exact-length lists and shared values bring it to 704 MB, same reports."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks a
building model (IFC) against IDS files of information requirements, in a
browser tab or on a CI runner, with nothing to install. The hard case is a
large coordination model checked against many requirement files at once,
because a browser tab or a small runner has about a gigabyte to work with.

Our test case is a 219 MB model federated from seven real exports (3.7
million entities), checked against 68 IDS files: three starters and 65
published in public repositories. The last run's notes said the checks
themselves peaked at 1.2 GB. That number came from sampling `heapUsed`
while the run went, which counts garbage not yet collected. The better
question is the smallest heap the run can finish in. On main that was
**896 MB**, and parsing alone needed 576 MB. So the checks needed about
320 MB of their own.

## What the 320 MB was

The reader is lazy: it notes where each entity's arguments start in the
file and reads them only when a check asks, then keeps them (except
geometry's, which is most of a model and rarely asked about). After the 68
checks, the heap held 258 MB more than after parsing, and nearly all of it
was arguments kept once read: property values, property sets,
relationships, representations.

A heap snapshot of a 40 MB MEP export showed why those arguments were so
big. The arrays' backing stores had grown by 25 MB for 163,000 new lists,
about 150 bytes a list. That is a lot for lists of four or five items. The
reason is the way the lists were built: start with `[]` and `push` each
argument. V8 grows an empty array's capacity to 16 on the first push, so a
four-item list kept 128 bytes of pointers for 32 bytes of data, for as long
as the entity lived.

## Three changes

1. **Lists copied to their length.** The reader returns `out.slice()`, which
   V8 allocates at the exact length. The model's own index lists (the
   property sets of each element, the parents of each part) get the same
   treatment once indexing is done.
2. **Repeated small values shared.** A model's properties repeat a small
   vocabulary: `IFCBOOLEAN(.T.)`, `IFCLABEL('Steel')`, the same property
   names thousands of times. Each read made new objects for them. Now one
   table per model hands back the same frozen object for the same type and
   value. The tables stop growing at 65,536 entries, so a model full of
   unique strings costs no more than before.
3. **Relationships not kept.** The model's index reads every relationship
   once while parsing, and nothing reads a relationship's arguments again,
   so there is no reason to keep them.

We also tried not keeping property arguments at all. That saved another
109 MB but made the 68 checks 17-39% slower, because every check re-reads
each property's name for each element. So they stay, in the smaller form.

## Results

| 219 MB federated model | before | after |
|---|---:|---:|
| smallest heap to parse | 576 MB | 512 MB |
| with the 3 starter IDS files | 704 MB | 576 MB |
| with all 68 IDS files | 896 MB | 704 MB |

Every report from the 68 files hashes the same as before on four models (the
federated one, a 40 MB MEP export, a 13 MB architectural export and a
residence). Every lazily read argument also equals what the eager reader
(which shares nothing) reads: 1.3 million entities across three real
exports, none different. Times are about unchanged in Node (26.0 s against
28.6 s for the federated run, single runs).

The whole write-up, with the commands, is in
[`eval/shared-values-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/shared-values-2026-11-18.md).

## What we learned

The cost of a small JavaScript object is often its container, not its
contents. The last run found a `Map` costing as much as the entities in it;
this one found lists costing four times their items. Neither shows up when
you reason about the data. Both showed up in the first heap snapshot. And
the number we had set out to cut, 1.2 GB, was mostly garbage the sampler
counted. The smallest heap a run finishes in was the number worth measuring.
