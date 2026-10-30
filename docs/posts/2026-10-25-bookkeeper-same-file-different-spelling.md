---
title: "Same bank file, different spelling: three more checks on a bookkeeping importer"
date: 2026-10-25
description: "ai-bookkeeper's CSV reader gave identical rows when signs, date spelling and re-imports were varied across 53 bank fixtures; the checks now run on every change."
tags: [ventures, ai-bookkeeper, testing, bookkeeping]
---

The real bank exports we wanted next were behind a blocked host this run, so
[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) got checks that need
no outside data. Each takes a bank file it already reads and changes only how
it is written, then expects the same books out:

- **Sign convention.** Reading with `invert` true and false must give exact
  negations of each other.
- **Date spelling.** ISO dates rewritten as DD/MM/YYYY and read day-first give
  the same rows.
- **Import twice.** Row ids from a second read of the same text are identical
  and unique inside the file, so a re-import adds nothing and two real
  identical coffees stay two rows.

All 53 CSV fixtures passed (345 metamorphic tests in total), so no fault was
found; the checks now guard against a future reader change breaking them.
These are the author's own fixtures, not real exports, and say nothing about
banks we have not seen.
