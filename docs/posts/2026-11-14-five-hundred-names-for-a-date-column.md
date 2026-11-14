---
title: "Five hundred names for a date column"
seo_title: "Reading a bank CSV with no header row, three times faster"
date: 2026-11-14
tags: [ai-bookkeeper, performance, csv, perf]
description: "Our bank-statement reader knows the date, amount and balance columns by hundreds of names. Looking each one up in turn made a header-less file slow; one pass over the cells made it 3.4 times faster, with the same answers."
---

The [AI bookkeeper](https://marisstella.app/ai-bookkeeper/) reads bank
exports from dozens of countries. To find the columns it keeps a list of
names for each one: "Date", "Buchungstag", "Fecha valor", "取引日",
"Ημερομηνία" and a few hundred more across date, description, amount,
debit, credit and balance. The order of each list matters. "Wertstellung"
(a value date) comes after "Buchungstag" (the booking date), so a German
file with both columns books on the booking date.

The lookup was the simplest one there is. For each kind of column, try each
name in order and ask the header row whether it holds it. That is the number
of names times the number of cells, for every row the reader looks at.

That would be fine once per file. But a bank that writes no header row at
all (the Commonwealth Bank, ANZ and Wells Fargo all do this) makes the
reader ask "is this row a header?" of every row, and it asked three times.
A 5,000-row export meant about 15,000 header checks, each trying every name.

## What changed

- The names are turned into one table, built once: name to (column kind,
  position in its list). A header row is read in one pass. Each cell looks
  itself up, and each column kind keeps the cell with the earliest-listed
  name. The answer is the same as the old loop's: same name order, and the
  leftmost cell when a name appears twice.
- The pattern that spots a currency after a name ("Amount USD", "Betrag in
  EUR") runs once per cell instead of once per cell per column.
- "Is this row a header?" is remembered per row, so the three scans share
  one answer.

## Same answers

A speed-up only counts if nothing else changes. We hashed every result of a
bench before and after: every test statement read whole, 40 randomly damaged
copies of each, and the column finder run on the first 30 lines of each file,
forwards and reversed. The hashes match on four seeds. A new test writes the
old loop out and compares it with the new one on 4,000 random headers made
of every known name, repeats and junk. A deliberately broken version, where
a later cell wins a tie, fails that test.

## How much faster

| | before | after |
|---|---:|---:|
| 5,000-row statement, no header row | 261 ms | 78 ms |
| 5,000-row statement with a header | 64 ms | 70 ms (noise) |
| the fuzz test file | 4.5 s | 2.7 s |
| the whole bookkeeper test suite | 29.2 s | 28.8 s |

The suite hardly moves. It is 311 test files, and starting Node 311 times
costs more than any one file's work. A visitor who drops in a header-less
statement waits about a fifth of a second less, on a phone more. The
measurements and the list of what we left alone are in
[the perf note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-14-bookkeeper-header-lookup.md).

Like every pass so far, this cost was an algorithm, not a language
([we almost rewrote it in Rust](2026-10-20-we-almost-rewrote-it-in-rust.md)).
