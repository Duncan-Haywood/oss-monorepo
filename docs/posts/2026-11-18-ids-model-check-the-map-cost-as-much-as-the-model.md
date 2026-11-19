---
title: "Our IFC checker's Map of entities cost as much as the entities"
date: 2026-11-18
tags: [ids-model-check, ventures]
description: "A heap snapshot showed a JavaScript Map holding 665,224 IFC entities cost as much as the entities. A plain array cut kept memory 21-30%."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks a
building model (IFC) against an IDS file of information requirements, in the
browser or on a CI runner. Large models are the hard case: a coordination
model that federates several disciplines can run to hundreds of megabytes,
and a browser tab or a small runner gives you about a gigabyte.

The last few runs made the reader lazy: it notes where each entity's
arguments start in the file and reads them only when a check needs them. So
what is left in memory is, mostly, one small record per entity. We took a
heap snapshot of a real 40 MB MEP export (665,224 entities) to see how small.

| what | size |
|---|---:|
| the file's text | 41.4 MB |
| the entity records | 37.3 MB |
| the `Map` holding them by number | about 30 MB |

The Map cost about as much as the records it held. V8 sizes a Map's hash
table to a power of two with three slots an entry plus buckets, so 665,224
entries pay for a table built for a million. And each record carried four
fields: its number, its type, where its arguments start, and the arguments
once read. The last two are never both needed.

Two changes:

- **One field fewer.** The same slot holds the argument offset (a number)
  until the arguments are read, then the arguments.
- **An array instead of the Map.** STEP entity numbers are close to dense,
  so a record sits at its number in a plain array, and the file order is a
  list of 4-byte integers. It answers the same `get`, `has`, `size` and
  iteration in file order as the Map did. One trap: writing far past an
  array's end makes V8 turn it into a hash table, bigger than the Map, so
  gaps are filled. Numbers that would make the array mostly holes (or are
  negative, or huge) move the table back to a Map, so every file still reads.

Measured on real exports (Node 22, one run each):

| model | kept after parsing, before | after | smallest heap that parses it, before | after |
|---|---:|---:|---:|---:|
| HHS MEP, 665,224 entities | 93 MB | 65 MB | 144 MB | 112 MB |
| Schultz Residence, 424,819 | 48 MB | 37 MB | 80 MB | 64 MB |
| 219 MB federated model, 3.7 million | 444 MB | 350 MB | 704 MB | 576 MB |

Parsing also got 20-30% faster (4.9 to 3.4 s on the federated model), since
an array write is cheaper than a hash insert. The reports did not change:
68 IDS files (3 starter, 65 public) hash the same before and after on four
models.

What it did not fix: with all 68 IDS files at once on the federated model,
the peak (1.2 GB) is set by what the checks build, the facet cache and the
reports, so it moved only 40 MB. That is the next place to look.

The measurements, scripts and planted-fault checks are in
[`eval/entity-table-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/entity-table-2026-11-18.md).
The checker is free and MIT licensed, and nothing is uploaded: the model is read where it is opened.
