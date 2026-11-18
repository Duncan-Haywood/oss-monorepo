---
title: "A million S3 inventory rows in under a second, by not building strings one letter at a time"
seo_title: "Parsing a 1M-row S3 Inventory CSV in the browser: 3.4 s to 0.85 s"
date: 2026-11-18
tags: [s3-storage-class-savings, perf, javascript, csv]
description: "The S3 savings checker spent most of its time in the garbage collector. Slicing fields cut a million-row parse from 3.4 s to 0.85 s, same output."
---

The [S3 storage class savings checker](../../ventures/s3-storage-class-savings/) reads an S3 Inventory report in your browser and works out whether a lifecycle rule would actually save money once transition fees, the 128 KiB minimum billable size and Glacier's per-object overhead are counted. Inventories for real buckets run to millions of rows, so how fast it reads them is how long a visitor stares at a frozen tab.

On a million rows it took about 3.4 seconds to parse, and a CPU profile said where: 3.2 seconds of the run were the garbage collector. The CSV reader built every field one character at a time (`field += c`), and JavaScript engines represent that as a chain of tiny joined strings the collector has to walk and flatten later. On top of that, the whole table (a million small arrays) was held in memory before any row was read, so every row lived long enough to be promoted to the old generation.

The fix keeps the same reader, character for character, but copies each plain run of a field out of the text in one `slice`, jumps inside quoted fields to the next quote with `indexOf`, and hands each row to the inventory reader as soon as it is complete.

| | before | after |
|---|---:|---:|
| parse a 1,000,010-row inventory | 3.4 s | 0.85 s |
| the venture's engine test file | 5.0 s | 2.5 s |

Faster is only better if the answer is the same. The new reader was run against the old one on 200,000 randomly built inputs full of quotes, doubled quotes, embedded commas, CR, LF, byte-order marks and odd headers, and produced identical rows every time. The million-row report hashes the same before and after. The full reading, profile and what was left alone are in the [perf note](../history/ci-perf-2026-11-18-s3-inventory-parser.md).

The tool's numbers are estimates at illustrative list prices, not a bill; check current AWS pricing before changing a lifecycle rule.
