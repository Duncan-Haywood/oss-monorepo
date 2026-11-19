---
title: "The biggest thing in our IFC checker's heap was the file itself"
date: 2026-11-18
tags: [ids-model-check, ventures]
description: "Reading STEP from bytes instead of one JavaScript string cut a 219 MB model's parse heap from 512 to 304 MB and opened a 670 MB file main refused."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks a
building model (IFC) against an IDS file of information requirements, in a
browser tab or on a CI runner. Today's earlier runs shrank what the checker
keeps per entity: a number-indexed array instead of a Map, shared small
values, no copies of geometry's arguments. After all that, the 219 MB
federated test model (nine real exports, 3.7 million entities) kept 273 MB
of records after parsing and still needed a 512 MB heap just to parse.

The missing 219 MB was the file. The reader decoded it into one JavaScript
string, and the lazy records point into that string so they can read their
arguments later. So the file sat on the V8 heap for the whole check.

## Bytes instead of a string

A Node `Buffer`, or a browser `File`'s `arrayBuffer()`, lives outside the
JavaScript heap. The reader now scans those bytes directly: the same
`#12 = IFCWALL(` match, comments and multi-type instances stepped over.
When a check first reads an entity, only that record is decoded into a
short string, and the existing argument reader runs on it.

The trick that makes this safe is UTF-8 itself. Records are cut at ASCII
bytes (`;`, `'`, `(`, `/*`), and an ASCII byte never appears inside a UTF-8
multi-byte character. So decoding one record on its own gives exactly the
characters that decoding the whole file and slicing it would. The tests
check that on raw `ü`, `日本` and an emoji, the STEP `\X2\` and `\S\` escapes,
and files cut off mid-record.

## What it bought

Smallest Node heap that finishes, 219 MB federated model (single runs):

| | before | after |
|---|---:|---:|
| parse only | 512 MB | 304 MB |
| parse and the 3 starter IDS files | 544 MB | 352 MB |
| parse and all 68 public and starter IDS files | 640 MB | 448 MB |

On a 40 MB MEP export, parsing went from 112 to 64 MB. The reports from 68
IDS files hash the same before and after on four models.

There was a second payoff we had not planned on. A JavaScript string can
hold at most 536,870,888 characters, so the old reader could not open a STEP
file larger than that at all. We built a 670 MB, 11-million-entity
federated model: the old version stopped in 0.4 s with `Cannot create a
string longer than 0x1fffffe8 characters`, and the new one checked it
against the starter IDS in 13.9 s.

## What it cost

Each read of a record that is not kept (geometry, property values) now
decodes that record again. Across all 68 IDS files on the MEP export, the
checks took about 5% longer (1.98-2.13 s before, 2.07-2.19 s after). The
browser path, which decodes with `TextDecoder`, is a little slower again.
We'll take 5% for 200 MB.

ifcXML still becomes one string, because its reader works on text. So an
ifcXML file past about 537 MB still cannot be read. That is the next item.

The measurements, scripts and tests are in
[`eval/step-bytes-2026-11-18.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/step-bytes-2026-11-18.md)
and `step-bytes.test.mjs` in the venture's folder.
