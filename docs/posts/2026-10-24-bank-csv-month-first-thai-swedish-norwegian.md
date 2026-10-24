---
title: "The bank CSV bug that turns 5 March into 3 May"
date: 2026-10-24
description: "Probing a bookkeeping importer with seven made-up Nordic, Thai and Icelandic bank files: one silently swapped day and month, two mislabelled columns."
tags: [bookkeeping, csv, i18n, testing]
---

# The bank CSV bug that turns 5 March into 3 May

`ai-bookkeeper` reads bank exports by matching header names. When a header is
unknown, the failure is not always loud. I wrote seven small made-up files in the
style of Swedish, Norwegian, Danish, Thai and Icelandic exports (headers from
memory, rows invented, no real bank file) and ran the importer on each.

Three failures, none of them an error message:

- **Thai** (`05/03/2026`, `วันที่` header): read month first, so 5 March became
  3 May. Nothing flagged it. A slash date with no day above 12 is ambiguous, and
  only a known day-first header resolves it.
- **Swedish** (`Bokföringsdag`, `Referens`): the date column was not recognised,
  so the date text ended up as the description of every line.
- **Norwegian** (`Dato`, `Ut fra konto`, `Inn på konto`): amounts came out right
  but with a false "columns not labelled" warning, because `Dato` was not a date
  header.

All three are fixed by adding the headers, and the Thai one by marking its date
header day-first (`nordic-thai.test.mjs`, 5 tests). The lesson is the same as for
earlier probes of this importer: the dangerous bug is the one that returns a
plausible number. A wrong date still balances; it only shows up in the wrong
month's report.

Limits: the headers are my recollection, not a download. If you have a real export
from any of these banks, try it and tell us what breaks.
